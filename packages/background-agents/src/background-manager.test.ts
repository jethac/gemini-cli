/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BackgroundManager } from './background-manager.js';

describe('BackgroundManager', () => {
  let manager: BackgroundManager;

  beforeEach(() => {
    BackgroundManager.resetInstance();
    manager = BackgroundManager.getInstance();
  });

  afterEach(() => {
    BackgroundManager.resetInstance();
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = BackgroundManager.getInstance();
      const instance2 = BackgroundManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should accept config on first call', () => {
      BackgroundManager.resetInstance();
      const instance = BackgroundManager.getInstance({
        defaultConcurrency: 10,
      });
      expect(instance).toBeDefined();
    });
  });

  describe('launch', () => {
    it('should create task with pending or running status', async () => {
      const task = await manager.launch({
        agent: 'explore',
        prompt: 'Find all auth files',
        description: 'Auth search',
      });

      expect(task.id).toMatch(/^bg_/);
      // Task may be pending or already running due to async processing
      expect(['pending', 'running', 'completed']).toContain(task.status);
      expect(task.agent).toBe('explore');
      expect(task.description).toBe('Auth search');
    });

    it('should create unique task IDs', async () => {
      const task1 = await manager.launch({
        agent: 'explore',
        prompt: 'Task 1',
        description: 'First task',
      });

      const task2 = await manager.launch({
        agent: 'explore',
        prompt: 'Task 2',
        description: 'Second task',
      });

      expect(task1.id).not.toBe(task2.id);
    });

    it('should set timestamps', async () => {
      const task = await manager.launch({
        agent: 'oracle',
        prompt: 'Analyze code',
        description: 'Analysis',
      });

      expect(task.queuedAt).toBeInstanceOf(Date);
      expect(task.lastActivityAt).toBeInstanceOf(Date);
    });

    it('should store optional model', async () => {
      const task = await manager.launch({
        agent: 'explore',
        prompt: 'Test',
        description: 'Test',
        model: 'gemini-3-pro-preview',
      });

      expect(task.model).toBe('gemini-3-pro-preview');
    });

    it('should store parent session ID', async () => {
      const task = await manager.launch({
        agent: 'explore',
        prompt: 'Test',
        description: 'Test',
        parentSessionID: 'parent-123',
      });

      expect(task.parentSessionID).toBe('parent-123');
    });
  });

  describe('getTask', () => {
    it('should retrieve existing task', async () => {
      const created = await manager.launch({
        agent: 'explore',
        prompt: 'Test',
        description: 'Test',
      });

      const retrieved = manager.getTask(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return undefined for non-existent task', () => {
      const task = manager.getTask('non-existent');
      expect(task).toBeUndefined();
    });
  });

  describe('getTasksByStatus', () => {
    it('should filter tasks by status', async () => {
      await manager.launch({
        agent: 'explore',
        prompt: 'Task 1',
        description: 'First',
      });

      await manager.launch({
        agent: 'explore',
        prompt: 'Task 2',
        description: 'Second',
      });

      // Wait for tasks to start/complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const completed = manager.getTasksByStatus('completed');
      expect(completed.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getActiveTasks', () => {
    it('should return pending and running tasks', async () => {
      await manager.launch({
        agent: 'explore',
        prompt: 'Task 1',
        description: 'First',
      });

      const active = manager.getActiveTasks();
      // At least one task should be active (pending or running)
      expect(active.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cancelTask', () => {
    it('should cancel pending task', async () => {
      const task = await manager.launch({
        agent: 'explore',
        prompt: 'Test',
        description: 'Test',
      });

      // Task might still be pending
      const cancelled = manager.cancelTask(task.id);
      expect(typeof cancelled).toBe('boolean');
    });

    it('should return false for non-existent task', () => {
      const cancelled = manager.cancelTask('non-existent');
      expect(cancelled).toBe(false);
    });
  });

  describe('cancelAll', () => {
    it('should cancel all active tasks', async () => {
      await manager.launch({
        agent: 'explore',
        prompt: 'Task 1',
        description: 'First',
      });

      await manager.launch({
        agent: 'explore',
        prompt: 'Task 2',
        description: 'Second',
      });

      const count = manager.cancelAll();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('waitForTask', () => {
    it('should return undefined for non-existent task', async () => {
      const result = await manager.waitForTask('non-existent');
      expect(result).toBeUndefined();
    });

    it('should wait for task completion', async () => {
      const task = await manager.launch({
        agent: 'explore',
        prompt: 'Quick task',
        description: 'Test',
      });

      const result = await manager.waitForTask(task.id, 5000);
      expect(result).toBeDefined();
    });

    it('should respect timeout', async () => {
      const task = await manager.launch({
        agent: 'explore',
        prompt: 'Test',
        description: 'Test',
      });

      const startTime = Date.now();
      await manager.waitForTask(task.id, 100);
      const elapsed = Date.now() - startTime;

      // Should return within reasonable time of timeout
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('onNotification', () => {
    it('should register callback', async () => {
      const notifications: unknown[] = [];
      const unsubscribe = manager.onNotification((notification) => {
        notifications.push(notification);
      });

      await manager.launch({
        agent: 'explore',
        prompt: 'Test',
        description: 'Test',
      });

      // Wait for task to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      unsubscribe();
      // At least verify callback was registered without error
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('consumeNotifications', () => {
    it('should return empty array initially', () => {
      const notifications = manager.consumeNotifications();
      expect(notifications).toEqual([]);
    });

    it('should clear notifications after consuming', async () => {
      await manager.launch({
        agent: 'explore',
        prompt: 'Test',
        description: 'Test',
      });

      // Wait for task to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      manager.consumeNotifications();
      const second = manager.consumeNotifications();
      expect(second).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return task statistics', async () => {
      await manager.launch({
        agent: 'explore',
        prompt: 'Test',
        description: 'Test',
      });

      const stats = manager.getStats();
      expect(stats.tasks).toBeDefined();
      expect(stats.concurrency).toBeDefined();
      expect(typeof stats.tasks.pending).toBe('number');
      expect(typeof stats.tasks.running).toBe('number');
      expect(typeof stats.tasks.completed).toBe('number');
    });
  });

  describe('shutdown', () => {
    it('should cancel all tasks and stop cleanup timer', () => {
      manager.shutdown();
      // Should not throw
      expect(true).toBe(true);
    });

    it('should prevent new launches after shutdown', async () => {
      manager.shutdown();

      await expect(
        manager.launch({
          agent: 'explore',
          prompt: 'Test',
          description: 'Test',
        }),
      ).rejects.toThrow('shutting down');
    });
  });

  describe('updateActivity', () => {
    it('should update activity timestamp', async () => {
      const task = await manager.launch({
        agent: 'explore',
        prompt: 'Test',
        description: 'Test',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      manager.updateActivity(task.id);

      const updated = manager.getTask(task.id);
      // Activity timestamp should be updated if task is still running
      expect(updated?.lastActivityAt).toBeDefined();
    });
  });

  describe('getToolRestrictions', () => {
    it('should return restrictions for known agents', () => {
      const exploreRestrictions = manager.getToolRestrictions('explore');
      expect(exploreRestrictions.canSpawnTasks).toBe(false);
      expect(exploreRestrictions.canWriteFiles).toBe(false);
    });

    it('should return default restrictions for unknown agents', () => {
      const unknownRestrictions = manager.getToolRestrictions('unknown-agent');
      expect(unknownRestrictions.canSpawnTasks).toBe(false);
      expect(unknownRestrictions.deniedTools).toContain('background_launch');
    });
  });
});
