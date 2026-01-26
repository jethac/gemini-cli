/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';

/**
 * Command to display current background task status.
 *
 * Shows running/pending/completed task counts and details
 * of active tasks.
 */
export const tasksCommand: SlashCommand = {
  name: 'tasks',
  altNames: ['bg', 'background'],
  description: 'Show background task status',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    try {
      // Dynamic import to avoid circular dependencies
      const { BackgroundManager } = await import(
        '@google/gemini-cli-background-agents'
      );
      const manager = BackgroundManager.getInstance();
      const stats = manager.getStats();
      const activeTasks = manager.getActiveTasks();

      // No active tasks
      if (activeTasks.length === 0 && stats.tasks.completed === 0) {
        context.ui.addItem({
          type: MessageType.INFO,
          text: 'No background tasks.',
        });
        return;
      }

      // Build status summary
      const lines: string[] = [];
      lines.push('─── Background Tasks ───');
      lines.push('');
      lines.push(
        `  Running: ${stats.tasks.running}  |  Pending: ${stats.tasks.pending}  |  Completed: ${stats.tasks.completed}`,
      );

      if (activeTasks.length > 0) {
        lines.push('');
        lines.push('Active Tasks:');
        for (const task of activeTasks) {
          const icon = task.status === 'running' ? '●' : '○';
          const desc =
            task.description.length > 50
              ? task.description.slice(0, 47) + '...'
              : task.description;
          lines.push(
            `  ${icon} [${task.status.padEnd(7)}] ${task.agent.padEnd(12)} - ${desc}`,
          );
          lines.push(`    ID: ${task.id}`);
        }
      }

      context.ui.addItem({
        type: MessageType.INFO,
        text: lines.join('\n'),
      });
    } catch {
      context.ui.addItem({
        type: MessageType.INFO,
        text: 'Background agents not available.',
      });
    }
  },
  subCommands: [
    {
      name: 'cancel',
      description: 'Cancel all background tasks',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context: CommandContext, args: string) => {
        try {
          const { BackgroundManager } = await import(
            '@google/gemini-cli-background-agents'
          );
          const manager = BackgroundManager.getInstance();

          // Cancel specific task if ID provided
          const taskId = args.trim();
          if (taskId) {
            const success = manager.cancelTask(taskId);
            context.ui.addItem({
              type: success ? MessageType.INFO : MessageType.ERROR,
              text: success
                ? `Cancelled task: ${taskId}`
                : `Task not found or already completed: ${taskId}`,
            });
            return;
          }

          // Cancel all tasks
          const count = manager.cancelAll();
          context.ui.addItem({
            type: MessageType.INFO,
            text:
              count > 0
                ? `Cancelled ${count} background task${count > 1 ? 's' : ''}.`
                : 'No active tasks to cancel.',
          });
        } catch {
          context.ui.addItem({
            type: MessageType.ERROR,
            text: 'Failed to cancel tasks.',
          });
        }
      },
    },
  ],
};
