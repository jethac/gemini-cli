/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '../../test-utils/render.js';
import { useBackgroundTasks } from './useBackgroundTasks.js';
import {
  CoreEvent,
  type BackgroundTaskUpdatePayload,
  type BackgroundTasksSummaryPayload,
} from '@google/gemini-cli-core';

// Mock event handlers
let taskUpdateHandler:
  | ((payload: BackgroundTaskUpdatePayload) => void)
  | undefined;
let summaryHandler:
  | ((payload: BackgroundTasksSummaryPayload) => void)
  | undefined;

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    coreEvents: {
      on: vi.fn((event, handler) => {
        if (event === CoreEvent.BackgroundTaskUpdate) {
          taskUpdateHandler = handler;
        }
        if (event === CoreEvent.BackgroundTasksSummary) {
          summaryHandler = handler;
        }
      }),
      off: vi.fn((event) => {
        if (event === CoreEvent.BackgroundTaskUpdate) {
          taskUpdateHandler = undefined;
        }
        if (event === CoreEvent.BackgroundTasksSummary) {
          summaryHandler = undefined;
        }
      }),
    },
  };
});

describe('useBackgroundTasks', () => {
  beforeEach(() => {
    taskUpdateHandler = undefined;
    summaryHandler = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderBackgroundTasksHook = () => {
    let hookResult: ReturnType<typeof useBackgroundTasks>;
    function TestComponent() {
      hookResult = useBackgroundTasks();
      return null;
    }
    const { unmount } = render(<TestComponent />);
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      unmount,
    };
  };

  it('should initialize with empty state', () => {
    const { result } = renderBackgroundTasksHook();
    expect(result.current.activeCount).toBe(0);
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.runningCount).toBe(0);
    expect(result.current.completedCount).toBe(0);
    expect(result.current.tasks).toEqual([]);
  });

  it('should update state when summary event is received', () => {
    const { result } = renderBackgroundTasksHook();

    const summaryPayload: BackgroundTasksSummaryPayload = {
      activeCount: 3,
      pendingCount: 1,
      runningCount: 2,
      completedCount: 5,
      tasks: [
        {
          taskId: 'bg_1',
          description: 'Task 1',
          agent: 'explore',
          status: 'running',
        },
        {
          taskId: 'bg_2',
          description: 'Task 2',
          agent: 'librarian',
          status: 'running',
        },
        {
          taskId: 'bg_3',
          description: 'Task 3',
          agent: 'explore',
          status: 'pending',
        },
      ],
    };

    act(() => {
      summaryHandler?.(summaryPayload);
    });

    expect(result.current.activeCount).toBe(3);
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.runningCount).toBe(2);
    expect(result.current.completedCount).toBe(5);
    expect(result.current.tasks).toHaveLength(3);
  });

  it('should add new task when task update event is received', () => {
    const { result } = renderBackgroundTasksHook();

    const taskPayload: BackgroundTaskUpdatePayload = {
      taskId: 'bg_new',
      description: 'New task',
      agent: 'oracle',
      status: 'pending',
    };

    act(() => {
      taskUpdateHandler?.(taskPayload);
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0]).toEqual(taskPayload);
    expect(result.current.activeCount).toBe(1);
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.runningCount).toBe(0);
  });

  it('should update existing task when task update event is received', () => {
    const { result } = renderBackgroundTasksHook();

    // Add initial task
    act(() => {
      taskUpdateHandler?.({
        taskId: 'bg_1',
        description: 'Task 1',
        agent: 'explore',
        status: 'pending',
      });
    });

    expect(result.current.pendingCount).toBe(1);
    expect(result.current.runningCount).toBe(0);

    // Update task to running
    act(() => {
      taskUpdateHandler?.({
        taskId: 'bg_1',
        description: 'Task 1',
        agent: 'explore',
        status: 'running',
      });
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].status).toBe('running');
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.runningCount).toBe(1);
  });

  it('should remove task when terminal status is received', () => {
    const { result } = renderBackgroundTasksHook();

    // Add initial task
    act(() => {
      taskUpdateHandler?.({
        taskId: 'bg_1',
        description: 'Task 1',
        agent: 'explore',
        status: 'running',
      });
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.completedCount).toBe(0);

    // Complete the task
    act(() => {
      taskUpdateHandler?.({
        taskId: 'bg_1',
        description: 'Task 1',
        agent: 'explore',
        status: 'completed',
        resultPreview: 'Done!',
      });
    });

    expect(result.current.tasks).toHaveLength(0);
    expect(result.current.activeCount).toBe(0);
    expect(result.current.completedCount).toBe(1);
  });

  it('should handle error status as terminal', () => {
    const { result } = renderBackgroundTasksHook();

    // Add and run a task
    act(() => {
      taskUpdateHandler?.({
        taskId: 'bg_err',
        description: 'Failing task',
        agent: 'explore',
        status: 'running',
      });
    });

    expect(result.current.tasks).toHaveLength(1);

    // Task errors out
    act(() => {
      taskUpdateHandler?.({
        taskId: 'bg_err',
        description: 'Failing task',
        agent: 'explore',
        status: 'error',
        error: 'Something went wrong',
      });
    });

    expect(result.current.tasks).toHaveLength(0);
    expect(result.current.completedCount).toBe(1);
  });

  it('should handle cancelled status as terminal', () => {
    const { result } = renderBackgroundTasksHook();

    // Add a pending task
    act(() => {
      taskUpdateHandler?.({
        taskId: 'bg_cancel',
        description: 'Task to cancel',
        agent: 'librarian',
        status: 'pending',
      });
    });

    expect(result.current.tasks).toHaveLength(1);

    // Cancel the task
    act(() => {
      taskUpdateHandler?.({
        taskId: 'bg_cancel',
        description: 'Task to cancel',
        agent: 'librarian',
        status: 'cancelled',
      });
    });

    expect(result.current.tasks).toHaveLength(0);
    expect(result.current.completedCount).toBe(1);
  });

  it('should not change state for terminal status of unknown task', () => {
    const { result } = renderBackgroundTasksHook();

    // Try to complete a task that doesn't exist
    act(() => {
      taskUpdateHandler?.({
        taskId: 'bg_unknown',
        description: 'Unknown task',
        agent: 'explore',
        status: 'completed',
      });
    });

    expect(result.current.tasks).toHaveLength(0);
    expect(result.current.completedCount).toBe(0);
  });

  it('should handle multiple tasks correctly', () => {
    const { result } = renderBackgroundTasksHook();

    // Add multiple tasks
    act(() => {
      taskUpdateHandler?.({
        taskId: 'bg_1',
        description: 'Task 1',
        agent: 'explore',
        status: 'running',
      });
      taskUpdateHandler?.({
        taskId: 'bg_2',
        description: 'Task 2',
        agent: 'librarian',
        status: 'pending',
      });
      taskUpdateHandler?.({
        taskId: 'bg_3',
        description: 'Task 3',
        agent: 'oracle',
        status: 'running',
      });
    });

    expect(result.current.tasks).toHaveLength(3);
    expect(result.current.activeCount).toBe(3);
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.runningCount).toBe(2);

    // Complete one task
    act(() => {
      taskUpdateHandler?.({
        taskId: 'bg_1',
        description: 'Task 1',
        agent: 'explore',
        status: 'completed',
      });
    });

    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.activeCount).toBe(2);
    expect(result.current.runningCount).toBe(1);
    expect(result.current.completedCount).toBe(1);
  });

  it('should unsubscribe from events on unmount', () => {
    const { result, unmount } = renderBackgroundTasksHook();

    // Add a task
    act(() => {
      taskUpdateHandler?.({
        taskId: 'bg_1',
        description: 'Task 1',
        agent: 'explore',
        status: 'running',
      });
    });

    expect(result.current.tasks).toHaveLength(1);

    // Unmount
    unmount();

    // Handlers should be cleared
    expect(taskUpdateHandler).toBeUndefined();
    expect(summaryHandler).toBeUndefined();
  });
});
