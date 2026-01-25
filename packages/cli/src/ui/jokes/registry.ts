/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JokeProvider, LoadingPhrasesConfig } from './types.js';
import { DEFAULT_LOADING_PHRASES_CONFIG } from './types.js';
import { BuiltinJokeProvider } from './builtinProvider.js';
import { EmptyJokeProvider } from './emptyProvider.js';
import {
  loadCustomProviders,
  CUSTOM_PHRASES_DIR,
} from './customFileProvider.js';

/**
 * Registry for joke providers.
 * Manages provider registration and provides a unified interface for getting phrases.
 */
class JokeProviderRegistry {
  private providers = new Map<string, JokeProvider>();
  private config: LoadingPhrasesConfig = { ...DEFAULT_LOADING_PHRASES_CONFIG };
  private customProvidersLoaded = false;

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
   * Load custom providers from ~/.gemini/phrases/ directory.
   * Each .json file becomes a provider with id = filename (without .json).
   *
   * Example:
   *   ~/.gemini/phrases/goomics.json -> provider: "goomics"
   *   ~/.gemini/phrases/work.json -> provider: "work"
   */
  loadCustomProviders(directory: string = CUSTOM_PHRASES_DIR): void {
    const customProviders = loadCustomProviders(directory);
    for (const provider of customProviders) {
      this.register(provider);
    }
    this.customProvidersLoaded = true;
  }

  /**
   * Configure the loading phrases system.
   * Automatically loads custom providers if not already loaded.
   */
  configure(config: Partial<LoadingPhrasesConfig>): void {
    this.config = { ...this.config, ...config };

    // Auto-load custom providers on first configure if a non-builtin provider is selected
    if (
      !this.customProvidersLoaded &&
      this.config.provider !== 'builtin' &&
      this.config.provider !== 'none'
    ) {
      this.loadCustomProviders();
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
   * List custom provider IDs (from ~/.gemini/phrases/).
   * Loads custom providers if not already loaded.
   */
  listCustomProviderIds(): string[] {
    if (!this.customProvidersLoaded) {
      this.loadCustomProviders();
    }
    return this.listProviders()
      .filter((p) => p.id !== 'builtin' && p.id !== 'none')
      .map((p) => p.id);
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
    this.customProvidersLoaded = false;
    this.register(new BuiltinJokeProvider());
    this.register(new EmptyJokeProvider());
  }
}

// Singleton instance
export const jokeRegistry = new JokeProviderRegistry();

// Export the class for testing
export { JokeProviderRegistry };
