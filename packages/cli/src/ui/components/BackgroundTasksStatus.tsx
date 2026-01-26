/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useBackgroundTasks } from '../hooks/useBackgroundTasks.js';

/**
 * Status indicator icons for different task states.
 */
const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  pending: { icon: '○', color: theme.text.secondary },
  running: { icon: '●', color: theme.text.link },
  completed: { icon: '✓', color: theme.status.success },
  error: { icon: '✗', color: theme.status.error },
  cancelled: { icon: '◌', color: theme.text.secondary },
};

interface BackgroundTasksStatusProps {
  /** Maximum number of tasks to display (default: 3) */
  maxDisplay?: number;
  /** Whether to show in compact mode (just counts) */
  compact?: boolean;
  /** Force hidden even when there are active tasks */
  forceHidden?: boolean;
}

/**
 * Displays the status of background tasks.
 *
 * Shows a summary when there are active background tasks running.
 * In full mode, shows individual task status. In compact mode, shows
 * just the count.
 *
 * @example
 * // Full mode (default)
 * <BackgroundTasksStatus />
 * // Output: ● explore-1  Running  "Find auth patterns"
 * //         ○ librarian  Pending  "JWT docs lookup"
 *
 * // Compact mode
 * <BackgroundTasksStatus compact />
 * // Output: [2 tasks]
 */
export const BackgroundTasksStatus: React.FC<BackgroundTasksStatusProps> = ({
  maxDisplay = 3,
  compact = false,
  forceHidden = false,
}) => {
  const { activeCount, pendingCount, runningCount, tasks } =
    useBackgroundTasks();

  // Don't render if no active tasks or force hidden
  if (activeCount === 0 || forceHidden) {
    return null;
  }

  // Compact mode - just show count
  if (compact) {
    return (
      <Box>
        <Text color={theme.text.link}>
          [{runningCount > 0 ? `${runningCount} running` : ''}
          {runningCount > 0 && pendingCount > 0 ? ', ' : ''}
          {pendingCount > 0 ? `${pendingCount} pending` : ''}]
        </Text>
      </Box>
    );
  }

  // Full mode - show task details
  const displayTasks = tasks.slice(0, maxDisplay);
  const remainingCount = tasks.length - maxDisplay;

  return (
    <Box flexDirection="column" paddingY={0}>
      <Box marginBottom={0}>
        <Text color={theme.text.secondary} dimColor>
          ─── Background Tasks ({activeCount}) ───
        </Text>
      </Box>
      {displayTasks.map((task) => {
        const statusInfo = STATUS_ICONS[task.status] || STATUS_ICONS['pending'];
        const truncatedDesc =
          task.description.length > 40
            ? task.description.slice(0, 37) + '...'
            : task.description;

        return (
          <Box key={task.taskId}>
            <Text color={statusInfo.color}>{statusInfo.icon} </Text>
            <Text color={theme.text.accent}>
              {task.agent.padEnd(12).slice(0, 12)}
            </Text>
            <Text color={theme.text.secondary}> </Text>
            <Text
              color={
                task.status === 'running'
                  ? theme.text.link
                  : theme.text.secondary
              }
            >
              {task.status.padEnd(9).slice(0, 9)}
            </Text>
            <Text color={theme.text.secondary}> </Text>
            <Text color={theme.text.primary} wrap="truncate">
              {`"${truncatedDesc}"`}
            </Text>
          </Box>
        );
      })}
      {remainingCount > 0 && (
        <Box>
          <Text color={theme.text.secondary}>
            ... and {remainingCount} more task{remainingCount > 1 ? 's' : ''}
          </Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * Compact inline display for the footer/header.
 */
export const BackgroundTasksInline: React.FC = () => {
  const { activeCount, runningCount, pendingCount } = useBackgroundTasks();

  if (activeCount === 0) {
    return null;
  }

  return (
    <Text color={theme.text.link}>
      {' '}
      | <Text color={theme.text.link}>●</Text> {runningCount}
      {pendingCount > 0 && (
        <>
          /<Text color={theme.text.secondary}>○</Text> {pendingCount}
        </>
      )}{' '}
      tasks
    </Text>
  );
};
