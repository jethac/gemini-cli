/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConcurrencyManager, DEFAULT_LIMITS } from './concurrency-manager.js';

describe('ConcurrencyManager', () => {
  let manager: ConcurrencyManager;

  beforeEach(() => {
    manager = new ConcurrencyManager();
  });

  describe('getConcurrencyLimit', () => {
    it('should return default limit for unknown model', () => {
      expect(manager.getConcurrencyLimit('unknown-model')).toBe(
        DEFAULT_LIMITS.perModel,
      );
    });

    it('should return model-specific limit when configured', () => {
      const customManager = new ConcurrencyManager({
        modelConcurrency: {
          'gemini-3-pro': 3,
        },
      });
      expect(customManager.getConcurrencyLimit('gemini-3-pro')).toBe(3);
    });

    it('should return provider-specific limit when configured', () => {
      const customManager = new ConcurrencyManager({
        providerConcurrency: {
          gemini: 8,
        },
      });
      expect(customManager.getConcurrencyLimit('gemini-3-pro')).toBe(8);
    });

    it('should prioritize model limit over provider limit', () => {
      const customManager = new ConcurrencyManager({
        modelConcurrency: {
          'gemini-3-pro': 3,
        },
        providerConcurrency: {
          gemini: 8,
        },
      });
      expect(customManager.getConcurrencyLimit('gemini-3-pro')).toBe(3);
    });

    it('should return Infinity for limit of 0', () => {
      const customManager = new ConcurrencyManager({
        modelConcurrency: {
          'unlimited-model': 0,
        },
      });
      expect(customManager.getConcurrencyLimit('unlimited-model')).toBe(
        Infinity,
      );
    });
  });

  describe('getGlobalLimit', () => {
    it('should return default global limit', () => {
      expect(manager.getGlobalLimit()).toBe(DEFAULT_LIMITS.global);
    });

    it('should return configured global limit', () => {
      const customManager = new ConcurrencyManager({
        globalConcurrency: 50,
      });
      expect(customManager.getGlobalLimit()).toBe(50);
    });

    it('should return Infinity for limit of 0', () => {
      const customManager = new ConcurrencyManager({
        globalConcurrency: 0,
      });
      expect(customManager.getGlobalLimit()).toBe(Infinity);
    });
  });

  describe('tryAcquire', () => {
    it('should acquire slot when under limit', () => {
      expect(manager.tryAcquire('test-model')).toBe(true);
      expect(manager.getCurrentCount('test-model')).toBe(1);
    });

    it('should fail when at model limit', () => {
      const customManager = new ConcurrencyManager({
        modelConcurrency: { 'test-model': 2 },
      });

      expect(customManager.tryAcquire('test-model')).toBe(true);
      expect(customManager.tryAcquire('test-model')).toBe(true);
      expect(customManager.tryAcquire('test-model')).toBe(false);
    });

    it('should fail when at global limit', () => {
      const customManager = new ConcurrencyManager({
        globalConcurrency: 2,
      });

      expect(customManager.tryAcquire('model-a')).toBe(true);
      expect(customManager.tryAcquire('model-b')).toBe(true);
      expect(customManager.tryAcquire('model-c')).toBe(false);
    });

    it('should track global count correctly', () => {
      manager.tryAcquire('model-a');
      manager.tryAcquire('model-b');
      expect(manager.getGlobalCount()).toBe(2);
    });
  });

  describe('release', () => {
    it('should decrement count on release', () => {
      manager.tryAcquire('test-model');
      manager.tryAcquire('test-model');
      expect(manager.getCurrentCount('test-model')).toBe(2);

      manager.release('test-model');
      expect(manager.getCurrentCount('test-model')).toBe(1);
    });

    it('should decrement global count on release', () => {
      manager.tryAcquire('test-model');
      expect(manager.getGlobalCount()).toBe(1);

      manager.release('test-model');
      expect(manager.getGlobalCount()).toBe(0);
    });

    it('should not go below zero', () => {
      manager.release('test-model');
      expect(manager.getCurrentCount('test-model')).toBe(0);
    });
  });

  describe('acquire (blocking)', () => {
    it('should resolve immediately when slot available', async () => {
      await manager.acquire('test-model');
      expect(manager.getCurrentCount('test-model')).toBe(1);
    });

    it('should queue when at limit and resolve on release', async () => {
      const customManager = new ConcurrencyManager({
        modelConcurrency: { 'test-model': 1 },
      });

      // First acquire succeeds
      await customManager.acquire('test-model');

      // Second acquire should queue
      const acquirePromise = customManager.acquire('test-model');

      // Release first slot
      setTimeout(() => {
        customManager.release('test-model');
      }, 10);

      // Second acquire should now complete
      await acquirePromise;
      expect(customManager.getCurrentCount('test-model')).toBe(1);
    });
  });

  describe('cancelQueued', () => {
    it('should cancel queued requests', async () => {
      const customManager = new ConcurrencyManager({
        modelConcurrency: { 'test-model': 1 },
      });

      await customManager.acquire('test-model');

      // Queue some requests
      const promise1 = customManager.acquire('test-model');
      const promise2 = customManager.acquire('test-model');

      expect(customManager.getQueueLength('test-model')).toBe(2);

      // Cancel all queued
      const cancelled = customManager.cancelQueued('test-model');
      expect(cancelled).toBe(2);
      expect(customManager.getQueueLength('test-model')).toBe(0);

      // Queued promises should reject
      await expect(promise1).rejects.toThrow('cancelled');
      await expect(promise2).rejects.toThrow('cancelled');
    });
  });

  describe('cancelAllQueued', () => {
    it('should cancel queued requests across all models', async () => {
      const customManager = new ConcurrencyManager({
        modelConcurrency: { 'model-a': 1, 'model-b': 1 },
      });

      await customManager.acquire('model-a');
      await customManager.acquire('model-b');

      const promise1 = customManager.acquire('model-a'); // queued
      const promise2 = customManager.acquire('model-b'); // queued

      const total = customManager.cancelAllQueued();
      expect(total).toBe(2);

      // Wait for the rejections to be handled
      await expect(promise1).rejects.toThrow('cancelled');
      await expect(promise2).rejects.toThrow('cancelled');
    });
  });

  describe('clear', () => {
    it('should reset all state', async () => {
      manager.tryAcquire('model-a');
      manager.tryAcquire('model-b');

      manager.clear();

      expect(manager.getCurrentCount('model-a')).toBe(0);
      expect(manager.getCurrentCount('model-b')).toBe(0);
      expect(manager.getGlobalCount()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      const customManager = new ConcurrencyManager({
        modelConcurrency: { 'model-a': 1 },
      });

      await customManager.acquire('model-a');
      customManager.tryAcquire('model-b');

      // Queue one request (will be cancelled after stats check)
      const queuedPromise = customManager.acquire('model-a');

      const stats = customManager.getStats();

      expect(stats.byModel).toEqual({
        'model-a': 1,
        'model-b': 1,
      });
      expect(stats.global).toBe(2);
      expect(stats.queued).toEqual({
        'model-a': 1,
      });

      // Cancel the queued request to prevent unhandled rejection
      customManager.cancelQueued('model-a');
      await expect(queuedPromise).rejects.toThrow('cancelled');
    });
  });
});
