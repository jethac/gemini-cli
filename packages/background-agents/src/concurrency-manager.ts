/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BackgroundAgentConfig, QueueEntry } from './types.js';

/**
 * Default concurrency limits.
 */
export const DEFAULT_LIMITS = {
  perModel: 5,
  perProvider: 10,
  global: 20,
} as const;

/**
 * Manages concurrency limits for background task execution.
 *
 * Prevents API rate limiting by tracking how many tasks are running
 * per model, per provider, and globally. When limits are reached,
 * new requests are queued until slots become available.
 */
export class ConcurrencyManager {
  private config: BackgroundAgentConfig;
  private counts: Map<string, number> = new Map();
  private queues: Map<string, QueueEntry[]> = new Map();
  private globalCount: number = 0;

  constructor(config?: BackgroundAgentConfig) {
    this.config = config ?? {};
  }

  /**
   * Gets the concurrency limit for a given model.
   *
   * Priority:
   * 1. Model-specific limit
   * 2. Provider-specific limit
   * 3. Default limit
   *
   * A limit of 0 means unlimited.
   */
  getConcurrencyLimit(model: string): number {
    // Check model-specific limit
    const modelLimit = this.config.modelConcurrency?.[model];
    if (modelLimit !== undefined) {
      return modelLimit === 0 ? Infinity : modelLimit;
    }

    // Extract provider from model name (e.g., "gemini-3-pro" -> "gemini")
    const provider = this.extractProvider(model);
    const providerLimit = this.config.providerConcurrency?.[provider];
    if (providerLimit !== undefined) {
      return providerLimit === 0 ? Infinity : providerLimit;
    }

    // Fall back to default
    return this.config.defaultConcurrency ?? DEFAULT_LIMITS.perModel;
  }

  /**
   * Gets the global concurrency limit.
   */
  getGlobalLimit(): number {
    const limit = this.config.globalConcurrency;
    if (limit === undefined) {
      return DEFAULT_LIMITS.global;
    }
    return limit === 0 ? Infinity : limit;
  }

  /**
   * Extracts the provider name from a model identifier.
   */
  private extractProvider(model: string): string {
    // Handle various model naming conventions
    if (model.includes('/')) {
      // e.g., "google/gemini-3-pro"
      return model.split('/')[0];
    }
    if (model.startsWith('gemini')) {
      return 'gemini';
    }
    if (model.startsWith('claude')) {
      return 'anthropic';
    }
    if (model.startsWith('gpt')) {
      return 'openai';
    }
    // Default to the first segment before dash
    return model.split('-')[0];
  }

  /**
   * Acquires a concurrency slot for the given model.
   *
   * Returns immediately if a slot is available.
   * Otherwise, queues the request until a slot opens.
   *
   * @throws Error if acquisition is cancelled or fails
   */
  async acquire(model: string): Promise<void> {
    const limit = this.getConcurrencyLimit(model);
    const globalLimit = this.getGlobalLimit();
    const current = this.counts.get(model) ?? 0;

    // Check if we can acquire immediately
    if (current < limit && this.globalCount < globalLimit) {
      this.counts.set(model, current + 1);
      this.globalCount++;
      return;
    }

    // Queue the request
    return new Promise<void>((resolve, reject) => {
      const entry: QueueEntry = { resolve, reject, settled: false };
      const queue = this.queues.get(model) ?? [];
      queue.push(entry);
      this.queues.set(model, queue);
    });
  }

  /**
   * Attempts to acquire a slot without blocking.
   *
   * @returns true if a slot was acquired, false if none available
   */
  tryAcquire(model: string): boolean {
    const limit = this.getConcurrencyLimit(model);
    const globalLimit = this.getGlobalLimit();
    const current = this.counts.get(model) ?? 0;

    if (current < limit && this.globalCount < globalLimit) {
      this.counts.set(model, current + 1);
      this.globalCount++;
      return true;
    }

    return false;
  }

  /**
   * Releases a concurrency slot for the given model.
   *
   * If there are queued requests, the next one is resolved.
   */
  release(model: string): void {
    // Try to service queued requests first
    const queue = this.queues.get(model);
    if (queue && queue.length > 0) {
      // Find the first non-settled entry
      while (queue.length > 0) {
        const next = queue.shift()!;
        if (!next.settled) {
          next.settled = true;
          next.resolve();
          return;
        }
      }
    }

    // No queued requests, just decrement the count
    const current = this.counts.get(model) ?? 0;
    if (current > 0) {
      this.counts.set(model, current - 1);
      this.globalCount--;
    }
  }

  /**
   * Cancels all queued requests for a model.
   */
  cancelQueued(model: string): number {
    const queue = this.queues.get(model);
    if (!queue) {
      return 0;
    }

    let cancelled = 0;
    for (const entry of queue) {
      if (!entry.settled) {
        entry.settled = true;
        entry.reject(new Error('Concurrency request cancelled'));
        cancelled++;
      }
    }

    this.queues.set(model, []);
    return cancelled;
  }

  /**
   * Cancels all queued requests across all models.
   */
  cancelAllQueued(): number {
    let total = 0;
    for (const model of this.queues.keys()) {
      total += this.cancelQueued(model);
    }
    return total;
  }

  /**
   * Clears all state (counts and queues).
   * Used during shutdown.
   */
  clear(): void {
    this.cancelAllQueued();
    this.counts.clear();
    this.globalCount = 0;
  }

  /**
   * Gets current usage statistics.
   */
  getStats(): {
    byModel: Record<string, number>;
    global: number;
    queued: Record<string, number>;
  } {
    const byModel: Record<string, number> = {};
    for (const [model, count] of this.counts) {
      byModel[model] = count;
    }

    const queued: Record<string, number> = {};
    for (const [model, queue] of this.queues) {
      const activeQueued = queue.filter((e) => !e.settled).length;
      if (activeQueued > 0) {
        queued[model] = activeQueued;
      }
    }

    return {
      byModel,
      global: this.globalCount,
      queued,
    };
  }

  /**
   * Gets the current count for a specific model.
   */
  getCurrentCount(model: string): number {
    return this.counts.get(model) ?? 0;
  }

  /**
   * Gets the current global count.
   */
  getGlobalCount(): number {
    return this.globalCount;
  }

  /**
   * Gets the queue length for a specific model.
   */
  getQueueLength(model: string): number {
    const queue = this.queues.get(model);
    if (!queue) {
      return 0;
    }
    return queue.filter((e) => !e.settled).length;
  }
}
