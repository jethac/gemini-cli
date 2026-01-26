/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import type {
  BackgroundTaskInfo,
  BackgroundTaskStatus,
  DelegateTaskResult,
  SessionContext,
  SessionMessage,
} from './types.js';

/**
 * Manages background tasks for delegate_task.
 *
 * This is a singleton that tracks all background task executions,
 * allowing for querying status and retrieving results.
 */
export class BackgroundTaskManager {
  private static instance: BackgroundTaskManager | null = null;

  private tasks: Map<string, BackgroundTaskInfo> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private taskPromises: Map<string, Promise<DelegateTaskResult>> = new Map();
  private sessions: Map<string, SessionContext> = new Map();

  private constructor() {}

  static getInstance(): BackgroundTaskManager {
    if (!BackgroundTaskManager.instance) {
      BackgroundTaskManager.instance = new BackgroundTaskManager();
    }
    return BackgroundTaskManager.instance;
  }

  /**
   * Reset the singleton instance (useful for testing).
   */
  static resetInstance(): void {
    if (BackgroundTaskManager.instance) {
      BackgroundTaskManager.instance.cancelAll();
      BackgroundTaskManager.instance = null;
    }
  }

  /**
   * Creates a new background task entry.
   */
  createTask(description: string, agent: string): BackgroundTaskInfo {
    const taskId = `bg_${randomUUID().slice(0, 8)}`;
    const sessionId = `ses_${randomUUID().slice(0, 8)}`;

    const taskInfo: BackgroundTaskInfo = {
      task_id: taskId,
      session_id: sessionId,
      description,
      agent,
      status: 'pending',
      created_at: new Date(),
    };

    this.tasks.set(taskId, taskInfo);
    this.abortControllers.set(taskId, new AbortController());

    return taskInfo;
  }

  /**
   * Updates task status to running.
   */
  startTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'running';
    }
  }

  /**
   * Marks a task as completed with result.
   */
  completeTask(taskId: string, result: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.result = result;
      task.completed_at = new Date();
    }
  }

  /**
   * Marks a task as failed with error.
   */
  failTask(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.error = error;
      task.completed_at = new Date();
    }
  }

  /**
   * Gets a task by ID.
   */
  getTask(taskId: string): BackgroundTaskInfo | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Gets the abort signal for a task.
   */
  getAbortSignal(taskId: string): AbortSignal | undefined {
    return this.abortControllers.get(taskId)?.signal;
  }

  /**
   * Stores the promise for a background task.
   */
  setTaskPromise(taskId: string, promise: Promise<DelegateTaskResult>): void {
    this.taskPromises.set(taskId, promise);
  }

  /**
   * Gets the promise for a background task.
   */
  getTaskPromise(taskId: string): Promise<DelegateTaskResult> | undefined {
    return this.taskPromises.get(taskId);
  }

  /**
   * Cancels a specific task.
   */
  cancelTask(taskId: string): boolean {
    const controller = this.abortControllers.get(taskId);
    const task = this.tasks.get(taskId);

    if (controller && task && task.status === 'running') {
      controller.abort();
      task.status = 'cancelled';
      task.completed_at = new Date();
      return true;
    }

    return false;
  }

  /**
   * Cancels all running tasks.
   */
  cancelAll(): number {
    let count = 0;
    for (const [taskId, task] of this.tasks) {
      if (task.status === 'running' || task.status === 'pending') {
        if (this.cancelTask(taskId)) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Gets all tasks with a specific status.
   */
  getTasksByStatus(status: BackgroundTaskStatus): BackgroundTaskInfo[] {
    return Array.from(this.tasks.values()).filter((t) => t.status === status);
  }

  /**
   * Gets all active (pending or running) tasks.
   */
  getActiveTasks(): BackgroundTaskInfo[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.status === 'pending' || t.status === 'running',
    );
  }

  /**
   * Waits for a task to complete with optional timeout.
   */
  async waitForTask(
    taskId: string,
    timeoutMs?: number,
  ): Promise<BackgroundTaskInfo | undefined> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return undefined;
    }

    if (task.status === 'completed' || task.status === 'failed') {
      return task;
    }

    const promise = this.taskPromises.get(taskId);
    if (!promise) {
      return task;
    }

    if (timeoutMs) {
      const timeoutPromise = new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), timeoutMs);
      });

      const result = await Promise.race([promise, timeoutPromise]);
      if (result === 'timeout') {
        return this.tasks.get(taskId);
      }
    } else {
      await promise;
    }

    return this.tasks.get(taskId);
  }

  /**
   * Cleans up completed tasks older than the specified age.
   */
  cleanup(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let count = 0;

    for (const [taskId, task] of this.tasks) {
      if (task.completed_at) {
        const age = now - task.completed_at.getTime();
        if (age > maxAgeMs) {
          this.tasks.delete(taskId);
          this.abortControllers.delete(taskId);
          this.taskPromises.delete(taskId);
          count++;
        }
      }
    }

    return count;
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Creates a new session context.
   */
  createSession(
    agent: string,
    model: string,
    thinkingBudget: number,
    systemPrompt: string,
  ): SessionContext {
    const sessionId = `ses_${randomUUID().slice(0, 8)}`;
    const now = new Date();

    const session: SessionContext = {
      session_id: sessionId,
      agent,
      model,
      thinkingBudget,
      systemPrompt,
      messages: [],
      created_at: now,
      last_updated: now,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Gets a session by ID.
   */
  getSession(sessionId: string): SessionContext | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Adds a message to a session's history.
   */
  addSessionMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push({
        role,
        content,
        timestamp: new Date(),
      });
      session.last_updated = new Date();
    }
  }

  /**
   * Gets the conversation history for a session.
   */
  getSessionMessages(sessionId: string): SessionMessage[] {
    const session = this.sessions.get(sessionId);
    return session?.messages ?? [];
  }

  /**
   * Finds a session by task_id (looks up the task's session_id).
   */
  getSessionByTaskId(taskId: string): SessionContext | undefined {
    const task = this.tasks.get(taskId);
    if (task) {
      return this.sessions.get(task.session_id);
    }
    return undefined;
  }

  /**
   * Links a task to an existing session.
   */
  linkTaskToSession(taskId: string, sessionId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.session_id = sessionId;
    }
  }

  /**
   * Cleans up old sessions.
   */
  cleanupSessions(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let count = 0;

    for (const [sessionId, session] of this.sessions) {
      const age = now - session.last_updated.getTime();
      if (age > maxAgeMs) {
        this.sessions.delete(sessionId);
        count++;
      }
    }

    return count;
  }
}
