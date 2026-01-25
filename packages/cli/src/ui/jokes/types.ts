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
   * - 'custom': Use user's custom file
   * - string: Extension-provided provider ID
   */
  provider: 'builtin' | 'none' | 'custom' | string;

  /**
   * Which phrase set to use from the provider.
   * Provider-specific. For builtin: 'default', 'minimal', 'programming', 'scifi'
   */
  phraseSet?: string;

  /**
   * Path to custom phrases file (when provider is 'custom').
   * Relative to ~/.gemini/ or absolute path.
   */
  customFile?: string;
}

/**
 * Default configuration for loading phrases.
 */
export const DEFAULT_LOADING_PHRASES_CONFIG: LoadingPhrasesConfig = {
  enabled: true,
  provider: 'builtin',
  phraseSet: 'default',
};
