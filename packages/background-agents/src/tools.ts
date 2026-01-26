/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { BackgroundManager } from './background-manager.js';
import type { BackgroundTask } from './types.js';

/**
 * Schema for background_launch tool parameters.
 */
const backgroundLaunchSchema = z.object({
  agent: z
    .string()
    .describe('Agent type to spawn (e.g., "explore", "oracle", "librarian")'),
  prompt: z.string().describe('Task prompt for the agent'),
  description: z.string().describe('Human-readable task description'),
  model: z
    .string()
    .optional()
    .describe('Optional model override (e.g., "gemini-3-pro-preview")'),
});

/**
 * Schema for background_output tool parameters.
 */
const backgroundOutputSchema = z.object({
  task_id: z.string().describe('Task ID to retrieve results for'),
  block: z.boolean().optional().describe('Whether to wait for task completion'),
  timeout: z
    .number()
    .optional()
    .describe('Max wait time in milliseconds (default: 60000)'),
});

/**
 * Schema for background_cancel tool parameters.
 */
const backgroundCancelSchema = z.object({
  task_id: z.string().optional().describe('Specific task ID to cancel'),
  all: z.boolean().optional().describe('Cancel all running tasks'),
});

/**
 * Tool definition interface (simplified for plugin use).
 */
export interface ToolDefinition {
  name: string;
  description: string;
  schema: object;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * Result from tool execution.
 */
export interface ToolResult {
  content: string;
  error?: string;
}

/**
 * Creates the background_launch tool.
 */
export function createBackgroundLaunchTool(
  manager: BackgroundManager,
  parentSessionID?: string,
): ToolDefinition {
  return {
    name: 'background_launch',
    description: `Launch an agent task that runs in the background.

The task runs asynchronously, allowing the main conversation to continue.
Use background_output to check status and retrieve results.

Available agents: explore, oracle, librarian, sisyphus-junior
Optional model override for specific model selection.`,
    schema: zodToJsonSchema(backgroundLaunchSchema),

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const parsed = backgroundLaunchSchema.parse(args);

        const task = await manager.launch({
          agent: parsed.agent,
          prompt: parsed.prompt,
          description: parsed.description,
          model: parsed.model,
          parentSessionID,
        });

        return {
          content: formatLaunchResult(task),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: `Failed to launch background task: ${message}`,
          error: message,
        };
      }
    },
  };
}

/**
 * Creates the background_output tool.
 */
export function createBackgroundOutputTool(
  manager: BackgroundManager,
): ToolDefinition {
  return {
    name: 'background_output',
    description: `Get output from a background task.

Returns the current status and result (if completed).
Use block=true to wait for completion (with optional timeout).
System notifies on completion, so block=true is rarely needed.`,
    schema: zodToJsonSchema(backgroundOutputSchema),

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const parsed = backgroundOutputSchema.parse(args);
        const { task_id, block, timeout } = parsed;

        let task = manager.getTask(task_id);

        if (!task) {
          return {
            content: `Task "${task_id}" not found.`,
            error: 'Task not found',
          };
        }

        // Wait if requested and task is still running
        if (block && (task.status === 'pending' || task.status === 'running')) {
          task = await manager.waitForTask(task_id, timeout ?? 60000);
        }

        if (!task) {
          return {
            content: `Task "${task_id}" no longer exists.`,
            error: 'Task not found',
          };
        }

        return {
          content: formatTaskStatus(task),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: `Failed to get task output: ${message}`,
          error: message,
        };
      }
    },
  };
}

/**
 * Creates the background_cancel tool.
 */
export function createBackgroundCancelTool(
  manager: BackgroundManager,
): ToolDefinition {
  return {
    name: 'background_cancel',
    description: `Cancel running background task(s).

Provide task_id to cancel a specific task.
Use all=true to cancel ALL running tasks (useful before final answer).`,
    schema: zodToJsonSchema(backgroundCancelSchema),

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const parsed = backgroundCancelSchema.parse(args);
        const { task_id, all } = parsed;

        if (!task_id && !all) {
          return {
            content: 'Either task_id or all=true must be provided.',
            error: 'Missing parameter',
          };
        }

        if (all) {
          const count = manager.cancelAll();
          return {
            content: `Cancelled ${count} background task(s).`,
          };
        }

        if (task_id) {
          const success = manager.cancelTask(task_id);
          if (success) {
            return {
              content: `Task "${task_id}" cancelled.`,
            };
          } else {
            return {
              content: `Task "${task_id}" could not be cancelled (may already be completed or not exist).`,
            };
          }
        }

        return {
          content: 'No action taken.',
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: `Failed to cancel task: ${message}`,
          error: message,
        };
      }
    },
  };
}

/**
 * Formats the result of launching a background task.
 */
function formatLaunchResult(task: BackgroundTask): string {
  return `Background task launched.

Task ID: ${task.id}
Description: ${task.description}
Agent: ${task.agent}
Model: ${task.model ?? 'default'}
Status: ${task.status}

Use \`background_output\` with task_id="${task.id}" to check progress or get results.`;
}

/**
 * Formats the status of a background task.
 */
function formatTaskStatus(task: BackgroundTask): string {
  const lines: string[] = [
    `Task ID: ${task.id}`,
    `Description: ${task.description}`,
    `Agent: ${task.agent}`,
    `Model: ${task.model ?? 'default'}`,
    `Status: ${task.status}`,
  ];

  if (task.queuedAt) {
    lines.push(`Queued: ${task.queuedAt.toISOString()}`);
  }
  if (task.startedAt) {
    lines.push(`Started: ${task.startedAt.toISOString()}`);
  }
  if (task.completedAt) {
    lines.push(`Completed: ${task.completedAt.toISOString()}`);
  }

  if (task.status === 'completed' && task.result) {
    lines.push('', 'Result:', task.result);
  }

  if (task.status === 'error' && task.error) {
    lines.push('', `Error: ${task.error}`);
  }

  return lines.join('\n');
}

/**
 * Creates all background agent tools.
 */
export function createBackgroundTools(
  manager: BackgroundManager,
  parentSessionID?: string,
): ToolDefinition[] {
  return [
    createBackgroundLaunchTool(manager, parentSessionID),
    createBackgroundOutputTool(manager),
    createBackgroundCancelTool(manager),
  ];
}
