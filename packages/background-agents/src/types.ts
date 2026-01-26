/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Configuration for background agent execution.
 */
export interface BackgroundAgentConfig {
  /** Whether background agents are enabled */
  enabled?: boolean;
  /** Default concurrency limit for models without specific limits */
  defaultConcurrency?: number;
  /** Per-model concurrency limits */
  modelConcurrency?: Record<string, number>;
  /** Per-provider concurrency limits */
  providerConcurrency?: Record<string, number>;
  /** Global maximum concurrent tasks */
  globalConcurrency?: number;
  /** Maximum task lifetime in milliseconds (default: 30 minutes) */
  taskTTL?: number;
  /** Inactivity timeout for stale detection in milliseconds (default: 3 minutes) */
  staleTimeout?: number;
  /** Tool approval mode for background tasks */
  toolApproval?: 'auto' | 'prompt' | 'deny-dangerous';
  /** List of tools considered dangerous (require explicit approval) */
  dangerousTools?: string[];
}

/**
 * Status of a background task.
 */
export type BackgroundTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'error'
  | 'cancelled';

/**
 * Information about a background task.
 */
export interface BackgroundTask {
  /** Unique task identifier */
  id: string;
  /** Human-readable description */
  description: string;
  /** The prompt sent to the agent */
  prompt: string;
  /** Agent type being used */
  agent: string;
  /** Model being used */
  model?: string;
  /** Current task status */
  status: BackgroundTaskStatus;
  /** Concurrency key for rate limiting */
  concurrencyKey?: string;
  /** Parent session ID that spawned this task */
  parentSessionID?: string;
  /** Child session ID for this task's execution */
  sessionID?: string;
  /** When the task was queued */
  queuedAt?: Date;
  /** When the task started executing */
  startedAt?: Date;
  /** When the task completed (success, error, or cancelled) */
  completedAt?: Date;
  /** Last activity timestamp for stale detection */
  lastActivityAt?: Date;
  /** Task result (if completed successfully) */
  result?: string;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Input for launching a background task.
 */
export interface LaunchInput {
  /** Agent type to spawn */
  agent: string;
  /** Task prompt */
  prompt: string;
  /** Human-readable description */
  description: string;
  /** Optional model override */
  model?: string;
  /** Parent session ID */
  parentSessionID?: string;
}

/**
 * Entry in the concurrency queue.
 */
export interface QueueEntry {
  /** Resolve the promise when slot is available */
  resolve: () => void;
  /** Reject the promise on error/cancellation */
  reject: (error: Error) => void;
  /** Whether this entry has been settled */
  settled: boolean;
}

/**
 * Item in the task processing queue.
 */
export interface QueueItem {
  task: BackgroundTask;
  input: LaunchInput;
}

/**
 * Notification about task completion.
 */
export interface TaskNotification {
  type: 'background_task_complete';
  task_id: string;
  status: BackgroundTaskStatus;
  description: string;
  result_preview?: string;
}

/**
 * Tool restrictions for different agent types in background execution.
 */
export interface AgentToolRestrictions {
  /** Whether the agent can spawn new background tasks */
  canSpawnTasks: boolean;
  /** Whether the agent can write files */
  canWriteFiles: boolean;
  /** Whether the agent can execute shell commands */
  canExecuteShell: boolean;
  /** List of explicitly allowed tools */
  allowedTools?: string[];
  /** List of explicitly denied tools */
  deniedTools?: string[];
}

/**
 * Default tool restrictions by agent type.
 */
export const DEFAULT_AGENT_RESTRICTIONS: Record<string, AgentToolRestrictions> =
  {
    'sisyphus-junior': {
      canSpawnTasks: false, // Prevent recursion
      canWriteFiles: true,
      canExecuteShell: true,
      deniedTools: ['background_launch', 'delegate_task'],
    },
    explore: {
      canSpawnTasks: false,
      canWriteFiles: false,
      canExecuteShell: false,
      deniedTools: [
        'background_launch',
        'delegate_task',
        'write_file',
        'edit_file',
        'run_shell_command',
      ],
    },
    librarian: {
      canSpawnTasks: false,
      canWriteFiles: false,
      canExecuteShell: false,
      deniedTools: [
        'background_launch',
        'delegate_task',
        'write_file',
        'edit_file',
        'run_shell_command',
      ],
    },
    oracle: {
      canSpawnTasks: false,
      canWriteFiles: false,
      canExecuteShell: false,
      deniedTools: [
        'background_launch',
        'delegate_task',
        'write_file',
        'edit_file',
        'run_shell_command',
      ],
    },
  };
