/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { ConcurrencyManager } from './concurrency-manager.js';
import type {
  BackgroundAgentConfig,
  BackgroundTask,
  BackgroundTaskStatus,
  LaunchInput,
  QueueItem,
  TaskNotification,
  AgentToolRestrictions,
} from './types.js';
import { DEFAULT_AGENT_RESTRICTIONS } from './types.js';

/**
 * Default timing constants.
 */
export const TIMING = {
  /** Maximum task lifetime: 30 minutes */
  TASK_TTL_MS: 30 * 60 * 1000,
  /** Stale detection timeout: 3 minutes */
  STALE_TIMEOUT_MS: 3 * 60 * 1000,
  /** Cleanup interval: 1 minute */
  CLEANUP_INTERVAL_MS: 60 * 1000,
  /** Notification retention: 5 minutes */
  NOTIFICATION_RETENTION_MS: 5 * 60 * 1000,
} as const;

/**
 * Callback for task notifications.
 */
export type NotificationCallback = (notification: TaskNotification) => void;

/**
 * Manages background task execution with concurrency control,
 * queue processing, TTL enforcement, and stale detection.
 */
export class BackgroundManager {
  private static instance: BackgroundManager | null = null;

  private config: BackgroundAgentConfig;
  private concurrencyManager: ConcurrencyManager;
  private tasks: Map<string, BackgroundTask> = new Map();
  private queuesByKey: Map<string, QueueItem[]> = new Map();
  private pendingNotifications: Map<string, TaskNotification> = new Map();
  private notificationCallbacks: Set<NotificationCallback> = new Set();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private shutdownTriggered: boolean = false;
  private processingKeys: Set<string> = new Set();

  constructor(config?: BackgroundAgentConfig) {
    this.config = config ?? {};
    this.concurrencyManager = new ConcurrencyManager(config);
    this.startCleanupTimer();
    this.registerProcessCleanup();
  }

  /**
   * Gets the singleton instance.
   */
  static getInstance(config?: BackgroundAgentConfig): BackgroundManager {
    if (!BackgroundManager.instance) {
      BackgroundManager.instance = new BackgroundManager(config);
    }
    return BackgroundManager.instance;
  }

  /**
   * Resets the singleton instance (for testing).
   */
  static resetInstance(): void {
    if (BackgroundManager.instance) {
      BackgroundManager.instance.shutdown();
      BackgroundManager.instance = null;
    }
  }

  /**
   * Launches a new background task.
   *
   * The task is created immediately with status="pending" and added
   * to the processing queue. Execution begins when a concurrency
   * slot becomes available.
   */
  async launch(input: LaunchInput): Promise<BackgroundTask> {
    if (this.shutdownTriggered) {
      throw new Error('BackgroundManager is shutting down');
    }

    // Create task immediately
    const task: BackgroundTask = {
      id: `bg_${randomUUID().slice(0, 8)}`,
      status: 'pending',
      queuedAt: new Date(),
      lastActivityAt: new Date(),
      description: input.description,
      prompt: input.prompt,
      agent: input.agent,
      model: input.model,
      parentSessionID: input.parentSessionID,
    };

    this.tasks.set(task.id, task);

    // Determine concurrency key (model or default)
    const concurrencyKey = this.getConcurrencyKey(input);
    task.concurrencyKey = concurrencyKey;

    // Add to queue
    const queue = this.queuesByKey.get(concurrencyKey) ?? [];
    queue.push({ task, input });
    this.queuesByKey.set(concurrencyKey, queue);

    // Trigger processing (fire-and-forget)
    void this.processKey(concurrencyKey);

    return task;
  }

  /**
   * Gets a task by ID.
   */
  getTask(taskId: string): BackgroundTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Gets all tasks with a specific status.
   */
  getTasksByStatus(status: BackgroundTaskStatus): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter((t) => t.status === status);
  }

  /**
   * Gets all active (pending or running) tasks.
   */
  getActiveTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.status === 'pending' || t.status === 'running',
    );
  }

  /**
   * Cancels a specific task.
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    if (task.status === 'pending' || task.status === 'running') {
      task.status = 'cancelled';
      task.completedAt = new Date();

      // Release concurrency slot if running
      if (task.concurrencyKey) {
        this.concurrencyManager.release(task.concurrencyKey);
        task.concurrencyKey = undefined;
      }

      this.markForNotification(task);
      return true;
    }

    return false;
  }

  /**
   * Cancels all active tasks.
   */
  cancelAll(): number {
    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.status === 'pending' || task.status === 'running') {
        if (this.cancelTask(task.id)) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Waits for a task to complete with optional timeout.
   */
  async waitForTask(
    taskId: string,
    timeoutMs?: number,
  ): Promise<BackgroundTask | undefined> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return undefined;
    }

    // Already complete
    if (this.isTerminal(task.status)) {
      return task;
    }

    // Poll for completion
    const startTime = Date.now();
    const pollInterval = 100;

    return new Promise((resolve) => {
      const check = (): void => {
        const current = this.tasks.get(taskId);
        if (!current || this.isTerminal(current.status)) {
          resolve(current);
          return;
        }

        if (timeoutMs && Date.now() - startTime > timeoutMs) {
          resolve(current);
          return;
        }

        setTimeout(check, pollInterval);
      };

      check();
    });
  }

  /**
   * Registers a callback for task completion notifications.
   */
  onNotification(callback: NotificationCallback): () => void {
    this.notificationCallbacks.add(callback);
    return () => {
      this.notificationCallbacks.delete(callback);
    };
  }

  /**
   * Gets and clears pending notifications.
   */
  consumeNotifications(): TaskNotification[] {
    const notifications = Array.from(this.pendingNotifications.values());
    this.pendingNotifications.clear();
    return notifications;
  }

  /**
   * Gets statistics about current task execution.
   */
  getStats(): {
    tasks: { pending: number; running: number; completed: number };
    concurrency: ReturnType<ConcurrencyManager['getStats']>;
  } {
    const tasks = { pending: 0, running: 0, completed: 0 };
    for (const task of this.tasks.values()) {
      if (task.status === 'pending') tasks.pending++;
      else if (task.status === 'running') tasks.running++;
      else tasks.completed++;
    }

    return {
      tasks,
      concurrency: this.concurrencyManager.getStats(),
    };
  }

  /**
   * Shuts down the manager gracefully.
   */
  shutdown(): void {
    this.shutdownTriggered = true;

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Cancel all running tasks
    this.cancelAll();

    // Clear concurrency manager
    this.concurrencyManager.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Gets the concurrency key for an input.
   */
  private getConcurrencyKey(input: LaunchInput): string {
    return input.model ?? 'gemini-3-flash-preview';
  }

  /**
   * Checks if a status is terminal (no longer running).
   */
  private isTerminal(status: BackgroundTaskStatus): boolean {
    return (
      status === 'completed' || status === 'error' || status === 'cancelled'
    );
  }

  /**
   * Processes tasks for a specific concurrency key.
   */
  private async processKey(key: string): Promise<void> {
    // Prevent concurrent processing of the same key
    if (this.processingKeys.has(key)) {
      return;
    }

    this.processingKeys.add(key);

    try {
      while (!this.shutdownTriggered) {
        const queue = this.queuesByKey.get(key);
        if (!queue || queue.length === 0) {
          break;
        }

        // Try to acquire a concurrency slot
        if (!this.concurrencyManager.tryAcquire(key)) {
          // No slot available, wait for one
          await this.concurrencyManager.acquire(key);
        }

        // Get next task from queue
        const item = queue.shift();
        if (!item) {
          this.concurrencyManager.release(key);
          break;
        }

        // Start the task
        await this.startTask(item);
      }
    } finally {
      this.processingKeys.delete(key);
    }
  }

  /**
   * Starts executing a task.
   */
  private async startTask(item: QueueItem): Promise<void> {
    const { task, input } = item;

    // Check if already cancelled
    if (task.status === 'cancelled') {
      if (task.concurrencyKey) {
        this.concurrencyManager.release(task.concurrencyKey);
      }
      return;
    }

    task.status = 'running';
    task.startedAt = new Date();
    task.lastActivityAt = new Date();

    try {
      // Simulate task execution (in real implementation, this would
      // create a child session and execute the agent)
      const result = await this.executeTask(task, input);

      // Complete the task
      await this.tryCompleteTask(task, result, 'execute');
    } catch (error) {
      // Handle error
      await this.tryFailTask(
        task,
        error instanceof Error ? error.message : String(error),
        'execute',
      );
    }
  }

  /**
   * Executes the actual task (placeholder for real implementation).
   *
   * In a full implementation, this would:
   * 1. Create a child session
   * 2. Configure tool restrictions
   * 3. Send the prompt to the agent
   * 4. Wait for completion
   * 5. Return the result
   */
  private async executeTask(
    task: BackgroundTask,
    input: LaunchInput,
  ): Promise<string> {
    // Update activity timestamp
    task.lastActivityAt = new Date();

    // TODO: Integrate with actual session/agent execution
    // For now, simulate execution with a delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    return `Task completed: ${input.description}`;
  }

  /**
   * Attempts to complete a task successfully.
   */
  private async tryCompleteTask(
    task: BackgroundTask,
    result: string,
    _source: string,
  ): Promise<boolean> {
    if (task.status !== 'running') {
      return false;
    }

    task.status = 'completed';
    task.result = result;
    task.completedAt = new Date();

    // Release concurrency BEFORE any async operations
    if (task.concurrencyKey) {
      this.concurrencyManager.release(task.concurrencyKey);
      task.concurrencyKey = undefined;
    }

    this.markForNotification(task);
    await this.notifyParentSession(task);

    return true;
  }

  /**
   * Attempts to fail a task with an error.
   */
  private async tryFailTask(
    task: BackgroundTask,
    error: string,
    _source: string,
  ): Promise<boolean> {
    if (task.status !== 'running' && task.status !== 'pending') {
      return false;
    }

    task.status = 'error';
    task.error = error;
    task.completedAt = new Date();

    // Release concurrency
    if (task.concurrencyKey) {
      this.concurrencyManager.release(task.concurrencyKey);
      task.concurrencyKey = undefined;
    }

    this.markForNotification(task);
    await this.notifyParentSession(task);

    return true;
  }

  /**
   * Marks a task for notification delivery.
   */
  private markForNotification(task: BackgroundTask): void {
    const notification: TaskNotification = {
      type: 'background_task_complete',
      task_id: task.id,
      status: task.status,
      description: task.description,
      result_preview: task.result?.slice(0, 200),
    };

    this.pendingNotifications.set(task.id, notification);

    // Notify all registered callbacks
    for (const callback of this.notificationCallbacks) {
      try {
        callback(notification);
      } catch {
        // Ignore callback errors
      }
    }
  }

  /**
   * Notifies the parent session that a task has completed.
   */
  private async notifyParentSession(task: BackgroundTask): Promise<void> {
    if (!task.parentSessionID) {
      return;
    }

    // TODO: Integrate with actual session notification system
    // This would inject a system message into the parent session
  }

  /**
   * Starts the periodic cleanup timer.
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.pruneStaleTasksAndNotifications();
    }, TIMING.CLEANUP_INTERVAL_MS);

    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Prunes stale tasks and old notifications.
   */
  private pruneStaleTasksAndNotifications(): void {
    const now = Date.now();
    const taskTTL = this.config.taskTTL ?? TIMING.TASK_TTL_MS;
    const staleTimeout = this.config.staleTimeout ?? TIMING.STALE_TIMEOUT_MS;

    for (const [taskId, task] of this.tasks.entries()) {
      // Check TTL for pending/running tasks
      if (task.status === 'pending' || task.status === 'running') {
        const timestamp =
          task.status === 'pending'
            ? task.queuedAt?.getTime()
            : task.startedAt?.getTime();

        const age = now - (timestamp ?? 0);
        if (age > taskTTL) {
          task.status = 'error';
          task.error = `Task timed out after ${Math.round(taskTTL / 60000)} minutes`;
          task.completedAt = new Date();

          if (task.concurrencyKey) {
            this.concurrencyManager.release(task.concurrencyKey);
            task.concurrencyKey = undefined;
          }

          this.markForNotification(task);
          continue;
        }

        // Check for stale tasks (no activity)
        if (task.status === 'running' && task.lastActivityAt) {
          const inactivity = now - task.lastActivityAt.getTime();
          if (inactivity > staleTimeout) {
            task.status = 'error';
            task.error = `Task stalled - no activity for ${Math.round(staleTimeout / 60000)} minutes`;
            task.completedAt = new Date();

            if (task.concurrencyKey) {
              this.concurrencyManager.release(task.concurrencyKey);
              task.concurrencyKey = undefined;
            }

            this.markForNotification(task);
          }
        }
      }

      // Remove completed tasks older than retention period
      if (this.isTerminal(task.status) && task.completedAt) {
        const completedAge = now - task.completedAt.getTime();
        if (completedAge > TIMING.NOTIFICATION_RETENTION_MS) {
          this.tasks.delete(taskId);
        }
      }
    }

    // Prune old notifications
    for (const [taskId] of this.pendingNotifications.entries()) {
      const task = this.tasks.get(taskId);
      if (!task) {
        this.pendingNotifications.delete(taskId);
      }
    }
  }

  /**
   * Registers process cleanup handlers for graceful shutdown.
   */
  private registerProcessCleanup(): void {
    const cleanup = (): void => {
      this.shutdown();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('beforeExit', cleanup);
  }

  /**
   * Updates the activity timestamp for a task.
   * Should be called during task execution to prevent stale detection.
   */
  updateActivity(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'running') {
      task.lastActivityAt = new Date();
    }
  }

  /**
   * Gets the tool restrictions for an agent type.
   */
  getToolRestrictions(agent: string): AgentToolRestrictions {
    const restrictions = (
      DEFAULT_AGENT_RESTRICTIONS
    )[agent];
    return (
      restrictions ?? {
        canSpawnTasks: false,
        canWriteFiles: true,
        canExecuteShell: true,
        deniedTools: ['background_launch', 'delegate_task'],
      }
    );
  }
}
