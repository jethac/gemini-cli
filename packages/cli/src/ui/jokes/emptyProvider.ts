/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JokeProvider } from './types.js';

/**
 * A provider that returns no phrases.
 * Used when user wants to disable loading phrases entirely.
 */
export class EmptyJokeProvider implements JokeProvider {
  readonly id = 'none';
  readonly name = 'No Phrases';
  readonly phraseSets: readonly string[] = [];

  getPhrases(_set?: string): readonly string[] {
    return [];
  }

  getRandomPhrase(_set?: string): string | undefined {
    return undefined;
  }
}
