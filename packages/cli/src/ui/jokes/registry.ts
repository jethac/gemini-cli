/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JokeProvider, LoadingPhrasesConfig } from './types.js';
import { DEFAULT_LOADING_PHRASES_CONFIG } from './types.js';
import { BuiltinJokeProvider } from './builtinProvider.js';
import { EmptyJokeProvider } from './emptyProvider.js';
import { CustomFileProvider } from './customFileProvider.js';

/**
 * Registry for joke providers.
 * Manages provider registration and provides a unified interface for getting phrases.
 */
class JokeProviderRegistry {
  private providers = new Map<string, JokeProvider>();
  private config: LoadingPhrasesConfig = { ...DEFAULT_LOADING_PHRASES_CONFIG };
  private customProvider: CustomFileProvider | null = null;

  constructor() {
    // Register built-in providers
    this.register(new BuiltinJokeProvider());
    this.register(new EmptyJokeProvider());
  }

  /**
   * Register a joke provider (for extensions).
   */
  register(provider: JokeProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Unregister a provider.
   * Cannot unregister built-in 'builtin' and 'none' providers.
   */
  unregister(id: string): void {
    if (id !== 'builtin' && id !== 'none') {
      this.providers.delete(id);
    }
  }

  /**
   * Configure the loading phrases system.
   */
  configure(config: Partial<LoadingPhrasesConfig>): void {
    this.config = { ...this.config, ...config };

    // If custom provider is selected, ensure it's loaded with the correct file
    if (this.config.provider === 'custom') {
      this.customProvider = new CustomFileProvider(this.config.customFile);
      this.providers.set('custom', this.customProvider);
    }
  }

  /**
   * Get the current configuration.
   */
  getConfig(): LoadingPhrasesConfig {
    return { ...this.config };
  }

  /**
   * Get the currently active provider.
   */
  getActiveProvider(): JokeProvider | undefined {
    if (!this.config.enabled) {
      return this.providers.get('none');
    }
    return this.providers.get(this.config.provider);
  }

  /**
   * Get a random phrase from the active provider.
   * Returns undefined if no phrases are available.
   */
  getRandomPhrase(): string | undefined {
    const provider = this.getActiveProvider();
    return provider?.getRandomPhrase(this.config.phraseSet);
  }

  /**
   * Get all phrases from the active provider for the current phrase set.
   */
  getPhrases(): readonly string[] {
    const provider = this.getActiveProvider();
    return provider?.getPhrases(this.config.phraseSet) ?? [];
  }

  /**
   * List all registered providers.
   */
  listProviders(): JokeProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get a provider by ID.
   */
  getProvider(id: string): JokeProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Check if a provider is registered.
   */
  hasProvider(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * Reset the registry to default state.
   * Useful for testing.
   */
  reset(): void {
    this.providers.clear();
    this.config = { ...DEFAULT_LOADING_PHRASES_CONFIG };
    this.customProvider = null;
    this.register(new BuiltinJokeProvider());
    this.register(new EmptyJokeProvider());
  }
}

// Singleton instance
export const jokeRegistry = new JokeProviderRegistry();

// Export the class for testing
export { JokeProviderRegistry };
