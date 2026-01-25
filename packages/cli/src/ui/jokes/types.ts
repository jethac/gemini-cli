/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A source of loading phrases (jokes).
 */
export interface JokeProvider {
  /** Unique identifier for this provider */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Available phrase sets from this provider */
  readonly phraseSets: readonly string[];

  /**
   * Get all phrases from a specific set.
   * @param set The phrase set name, or undefined for default
   * @returns Array of phrases, or empty array if set not found
   */
  getPhrases(set?: string): readonly string[];

  /**
   * Get a random phrase from a specific set.
   * @param set The phrase set name, or undefined for default
   * @returns A random phrase, or undefined if no phrases available
   */
  getRandomPhrase(set?: string): string | undefined;
}

/**
 * Configuration for loading phrases.
 */
export interface LoadingPhrasesConfig {
  /** Whether to show loading phrases at all */
  enabled: boolean;

  /**
   * Which provider to use.
   * - 'builtin': Use built-in phrases (default)
   * - 'none': No phrases (silent loading)
   * - string: Custom provider name (loads from ~/.gemini/phrases/<name>.json)
   *
   * Custom providers are auto-discovered from ~/.gemini/phrases/ directory.
   * Each .json file becomes a provider with id = filename (without .json).
   *
   * Example: ~/.gemini/phrases/goomics.json -> provider: "goomics"
   */
  provider: 'builtin' | 'none' | string;

  /**
   * Which phrase set to use from the provider.
   * Provider-specific. For builtin: 'default', 'minimal', 'programming', 'scifi'
   * Custom providers typically have only a 'default' set.
   */
  phraseSet?: string;
}

/**
 * Default configuration for loading phrases.
 */
export const DEFAULT_LOADING_PHRASES_CONFIG: LoadingPhrasesConfig = {
  enabled: true,
  provider: 'builtin',
  phraseSet: 'default',
};
