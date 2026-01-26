/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import {
  coreEvents,
  CoreEvent,
  type BackgroundTaskUpdatePayload,
  type BackgroundTasksSummaryPayload,
} from '@google/gemini-cli-core';

/**
 * State for background tasks tracking.
 */
export interface BackgroundTasksState {
  /** Total number of active (pending + running) tasks */
  activeCount: number;
  /** Number of pending tasks */
  pendingCount: number;
  /** Number of running tasks */
  runningCount: number;
  /** Number of completed tasks (since last clear) */
  completedCount: number;
  /** List of active tasks */
  tasks: BackgroundTaskUpdatePayload[];
}

const initialState: BackgroundTasksState = {
  activeCount: 0,
  pendingCount: 0,
  runningCount: 0,
  completedCount: 0,
  tasks: [],
};

/**
 * Hook to track background task status for UI display.
 *
 * Subscribes to background task events from coreEvents and maintains
 * real-time state of all active tasks.
 *
 * @returns Current state of background tasks
 *
 * @example
 * const { activeCount, tasks } = useBackgroundTasks();
 * if (activeCount > 0) {
 *   // Show task status UI
 * }
 */
export function useBackgroundTasks(): BackgroundTasksState {
  const [state, setState] = useState<BackgroundTasksState>(initialState);

  const handleSummaryUpdate = useCallback(
    (payload: BackgroundTasksSummaryPayload) => {
      setState({
        activeCount: payload.activeCount,
        pendingCount: payload.pendingCount,
        runningCount: payload.runningCount,
        completedCount: payload.completedCount,
        tasks: payload.tasks,
      });
    },
    [],
  );

  const handleTaskUpdate = useCallback(
    (payload: BackgroundTaskUpdatePayload) => {
      setState((prev) => {
        // Find existing task
        const existingIndex = prev.tasks.findIndex(
          (t) => t.taskId === payload.taskId,
        );

        // If task is terminal (completed, error, cancelled), remove it from active
        const isTerminal =
          payload.status === 'completed' ||
          payload.status === 'error' ||
          payload.status === 'cancelled';

        if (isTerminal) {
          if (existingIndex >= 0) {
            const newTasks = [...prev.tasks];
            newTasks.splice(existingIndex, 1);
            return {
              ...prev,
              tasks: newTasks,
              activeCount: newTasks.length,
              pendingCount: newTasks.filter((t) => t.status === 'pending')
                .length,
              runningCount: newTasks.filter((t) => t.status === 'running')
                .length,
              completedCount: prev.completedCount + 1,
            };
          }
          return prev;
        }

        // Update or add task
        const newTasks = [...prev.tasks];
        if (existingIndex >= 0) {
          newTasks[existingIndex] = payload;
        } else {
          newTasks.push(payload);
        }

        return {
          ...prev,
          tasks: newTasks,
          activeCount: newTasks.length,
          pendingCount: newTasks.filter((t) => t.status === 'pending').length,
          runningCount: newTasks.filter((t) => t.status === 'running').length,
        };
      });
    },
    [],
  );

  useEffect(() => {
    // Subscribe to events
    coreEvents.on(CoreEvent.BackgroundTasksSummary, handleSummaryUpdate);
    coreEvents.on(CoreEvent.BackgroundTaskUpdate, handleTaskUpdate);

    // Cleanup
    return () => {
      coreEvents.off(CoreEvent.BackgroundTasksSummary, handleSummaryUpdate);
      coreEvents.off(CoreEvent.BackgroundTaskUpdate, handleTaskUpdate);
    };
  }, [handleSummaryUpdate, handleTaskUpdate]);

  return state;
}
