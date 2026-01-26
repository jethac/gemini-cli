/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { ToolResult, ToolInvocation } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import {
  BACKGROUND_OUTPUT_TOOL_NAME,
  BACKGROUND_CANCEL_TOOL_NAME,
} from './constants.js';
import type {
  BackgroundOutputParams,
  BackgroundCancelParams,
} from './types.js';
import { BackgroundTaskManager } from './task-manager.js';
import { ToolErrorType } from '../tool-error.js';

// ============================================================================
// Background Output Tool
// ============================================================================

const backgroundOutputSchema = z.object({
  task_id: z.string().describe('The task ID to get output from.'),
  block: z
    .boolean()
    .optional()
    .describe('Whether to block until the task completes.'),
  timeout: z
    .number()
    .optional()
    .describe('Timeout in milliseconds when blocking.'),
});

class BackgroundOutputInvocation extends BaseToolInvocation<
  BackgroundOutputParams,
  ToolResult
> {
  constructor(
    params: BackgroundOutputParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const { task_id, block } = this.params;
    return `Getting output for task ${task_id}${block ? ' (blocking)' : ''}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { task_id, block, timeout } = this.params;
    const taskManager = BackgroundTaskManager.getInstance();

    let task = taskManager.getTask(task_id);

    if (!task) {
      return {
        llmContent: `Error: Task "${task_id}" not found.`,
        returnDisplay: `Error: Task "${task_id}" not found.`,
        error: {
          message: `Task "${task_id}" not found.`,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    // If blocking is requested and task is still running, wait
    if (block && (task.status === 'pending' || task.status === 'running')) {
      task = await taskManager.waitForTask(task_id, timeout);
      if (!task) {
        return {
          llmContent: `Error: Task "${task_id}" not found after waiting.`,
          returnDisplay: `Error: Task "${task_id}" not found after waiting.`,
          error: {
            message: `Task "${task_id}" not found after waiting.`,
            type: ToolErrorType.EXECUTION_FAILED,
          },
        };
      }
    }

    // Format the response based on task status
    let content: string;

    switch (task.status) {
      case 'completed':
        content = `Task "${task_id}" completed successfully.

Session ID: ${task.session_id}
Agent: ${task.agent}
Description: ${task.description}

Result:
${task.result}`;
        break;

      case 'failed':
        content = `Task "${task_id}" failed.

Session ID: ${task.session_id}
Agent: ${task.agent}
Description: ${task.description}

Error: ${task.error}`;
        break;

      case 'cancelled':
        content = `Task "${task_id}" was cancelled.

Session ID: ${task.session_id}
Agent: ${task.agent}
Description: ${task.description}`;
        break;

      case 'running':
      case 'pending':
        content = `Task "${task_id}" is still ${task.status}.

Session ID: ${task.session_id}
Agent: ${task.agent}
Description: ${task.description}
Started: ${task.created_at.toISOString()}

Use block=true to wait for completion.`;
        break;

      default:
        content = `Task "${task_id}" has status: ${task.status}`;
    }

    return {
      llmContent: content,
      returnDisplay:
        task.status === 'completed'
          ? `Task ${task_id}: completed`
          : task.status === 'failed'
            ? `Task ${task_id}: failed - ${task.error}`
            : `Task ${task_id}: ${task.status}`,
    };
  }
}

export class BackgroundOutputTool extends BaseDeclarativeTool<
  BackgroundOutputParams,
  ToolResult
> {
  static readonly Name = BACKGROUND_OUTPUT_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      BackgroundOutputTool.Name,
      'Background Output',
      `Get output from background task. System notifies on completion, so block=true rarely needed.`,
      Kind.Read,
      zodToJsonSchema(backgroundOutputSchema),
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: BackgroundOutputParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<BackgroundOutputParams, ToolResult> {
    return new BackgroundOutputInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName ?? 'Background Output',
    );
  }
}

// ============================================================================
// Background Cancel Tool
// ============================================================================

const backgroundCancelSchema = z.object({
  task_id: z.string().optional().describe('The task ID to cancel.'),
  all: z.boolean().optional().describe('Cancel all running background tasks.'),
});

class BackgroundCancelInvocation extends BaseToolInvocation<
  BackgroundCancelParams,
  ToolResult
> {
  constructor(
    params: BackgroundCancelParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const { task_id, all } = this.params;
    if (all) {
      return 'Cancelling all background tasks';
    }
    return `Cancelling task ${task_id}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { task_id, all } = this.params;
    const taskManager = BackgroundTaskManager.getInstance();

    if (all) {
      const count = taskManager.cancelAll();
      return {
        llmContent: `Cancelled ${count} background task(s).`,
        returnDisplay: `Cancelled ${count} task(s)`,
      };
    }

    if (!task_id) {
      return {
        llmContent: 'Error: Either task_id or all=true must be provided.',
        returnDisplay: 'Error: Either task_id or all=true must be provided.',
        error: {
          message: 'Either task_id or all=true must be provided.',
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    const cancelled = taskManager.cancelTask(task_id);

    if (cancelled) {
      return {
        llmContent: `Task "${task_id}" has been cancelled.`,
        returnDisplay: `Task ${task_id} cancelled`,
      };
    }

    const task = taskManager.getTask(task_id);
    if (!task) {
      return {
        llmContent: `Error: Task "${task_id}" not found.`,
        returnDisplay: `Error: Task "${task_id}" not found.`,
        error: {
          message: `Task "${task_id}" not found.`,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    return {
      llmContent: `Task "${task_id}" cannot be cancelled. Current status: ${task.status}`,
      returnDisplay: `Task ${task_id} cannot be cancelled (${task.status})`,
    };
  }
}

export class BackgroundCancelTool extends BaseDeclarativeTool<
  BackgroundCancelParams,
  ToolResult
> {
  static readonly Name = BACKGROUND_CANCEL_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      BackgroundCancelTool.Name,
      'Background Cancel',
      `Cancel running background task(s). Use all=true to cancel ALL before final answer.`,
      Kind.Other,
      zodToJsonSchema(backgroundCancelSchema),
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: BackgroundCancelParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<BackgroundCancelParams, ToolResult> {
    return new BackgroundCancelInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName ?? 'Background Cancel',
    );
  }
}
