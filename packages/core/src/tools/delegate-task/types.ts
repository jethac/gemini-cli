/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TaskCategory, AgentType } from './constants.js';

/**
 * Parameters for the delegate_task tool.
 */
export interface DelegateTaskParams {
  /**
   * The task prompt for the agent to execute.
   */
  prompt: string;

  /**
   * Short description of the task (3-5 words).
   */
  description: string;

  /**
   * Category for task routing. Mutually exclusive with subagent_type.
   */
  category?: TaskCategory;

  /**
   * Direct agent type selection. Mutually exclusive with category.
   */
  subagent_type?: AgentType;

  /**
   * Skill names to load into the agent's context.
   */
  load_skills: string[];

  /**
   * Whether to run the task in background (async).
   * true = returns immediately with task_id
   * false = waits for completion
   */
  run_in_background: boolean;

  /**
   * Session ID to continue an existing session.
   */
  session_id?: string;

  /**
   * Override the default timeout in minutes (max: 30).
   * Useful for long-running investigations or capacity issues.
   */
  timeout_minutes?: number;

  /**
   * Override the default maximum turns for the agent.
   */
  max_turns?: number;

  /**
   * Whether to auto-retry on model capacity errors (429/503).
   */
  retry_on_capacity?: boolean;

  /**
   * Number of retry attempts before failing (default: 3).
   */
  retry_attempts?: number;
}

/**
 * Result returned by delegate_task.
 */
export interface DelegateTaskResult {
  /**
   * Unique identifier for the task (for background tasks).
   */
  task_id?: string;

  /**
   * Session ID for continuing the conversation.
   */
  session_id: string;

  /**
   * Current status of the task.
   */
  status: 'running' | 'completed' | 'failed';

  /**
   * The agent that is executing the task.
   */
  agent: string;

  /**
   * The model being used.
   */
  model: string;

  /**
   * The result of the task (for synchronous execution).
   */
  result?: string;

  /**
   * Error message if the task failed.
   */
  error?: string;
}

/**
 * Parameters for background_output tool.
 */
export interface BackgroundOutputParams {
  /**
   * The task ID to get output from.
   */
  task_id: string;

  /**
   * Whether to block until the task completes.
   */
  block?: boolean;

  /**
   * Timeout in milliseconds when blocking.
   */
  timeout?: number;
}

/**
 * Parameters for background_cancel tool.
 */
export interface BackgroundCancelParams {
  /**
   * The task ID to cancel.
   */
  task_id?: string;

  /**
   * Cancel all running background tasks.
   */
  all?: boolean;
}

/**
 * Status of a background task.
 */
export type BackgroundTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * A message in a session's conversation history.
 */
export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * Session context for continuation.
 */
export interface SessionContext {
  /**
   * Session identifier.
   */
  session_id: string;

  /**
   * The agent type used in this session.
   */
  agent: string;

  /**
   * The model used in this session.
   */
  model: string;

  /**
   * Thinking budget for this session.
   */
  thinkingBudget: number;

  /**
   * System prompt used in this session.
   */
  systemPrompt: string;

  /**
   * Conversation history.
   */
  messages: SessionMessage[];

  /**
   * When the session was created.
   */
  created_at: Date;

  /**
   * When the session was last updated.
   */
  last_updated: Date;
}

/**
 * Information about a background task.
 */
export interface BackgroundTaskInfo {
  /**
   * Unique task identifier.
   */
  task_id: string;

  /**
   * Session ID for continuing the conversation.
   */
  session_id: string;

  /**
   * Short description of the task.
   */
  description: string;

  /**
   * The agent executing the task.
   */
  agent: string;

  /**
   * Current status of the task.
   */
  status: BackgroundTaskStatus;

  /**
   * When the task was created.
   */
  created_at: Date;

  /**
   * When the task completed (if applicable).
   */
  completed_at?: Date;

  /**
   * The result (if completed).
   */
  result?: string;

  /**
   * Error message (if failed).
   */
  error?: string;
}
