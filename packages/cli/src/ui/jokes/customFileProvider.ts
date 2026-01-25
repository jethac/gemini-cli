/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import type { JokeProvider } from './types.js';

/**
 * Loads phrases from a user-provided JSON file.
 *
 * Supported file formats:
 *
 * Simple format (single set):
 * ```json
 * {
 *   "phrases": ["phrase1", "phrase2", ...]
 * }
 * ```
 *
 * Sets format (multiple sets):
 * ```json
 * {
 *   "default": ["phrase1", ...],
 *   "work": ["phrase1", ...],
 *   "fun": ["phrase1", ...]
 * }
 * ```
 */
export class CustomFileProvider implements JokeProvider {
  readonly id = 'custom';
  readonly name = 'Custom File';

  private phrases: Record<string, string[]> = {};
  private loaded = false;
  private loadError: Error | null = null;

  constructor(private filePath?: string) {}

  get phraseSets(): readonly string[] {
    this.ensureLoaded();
    return Object.keys(this.phrases);
  }

  getPhrases(set: string = 'default'): readonly string[] {
    this.ensureLoaded();
    return this.phrases[set] ?? this.phrases['default'] ?? [];
  }

  getRandomPhrase(set: string = 'default'): string | undefined {
    const phrases = this.getPhrases(set);
    if (phrases.length === 0) return undefined;
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  /**
   * Returns the last load error, if any.
   */
  getLoadError(): Error | null {
    return this.loadError;
  }

  /**
   * Force reload of the phrases file.
   */
  reload(): void {
    this.loaded = false;
    this.loadError = null;
    this.phrases = {};
    this.ensureLoaded();
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;

    const resolvedPath = this.resolvePath();
    if (!resolvedPath) {
      return;
    }

    if (!fs.existsSync(resolvedPath)) {
      // File doesn't exist - this is not an error, just no custom phrases
      return;
    }

    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const data: unknown = JSON.parse(content);

      if (!data || typeof data !== 'object') {
        this.loadError = new Error(
          'Custom phrases file must contain a JSON object',
        );
        return;
      }

      const dataObj = data as Record<string, unknown>;

      if (Array.isArray(dataObj['phrases'])) {
        // Simple format: { "phrases": [...] }
        const phrasesArray = dataObj['phrases'];
        if (this.isStringArray(phrasesArray)) {
          this.phrases = { default: phrasesArray };
        } else {
          this.loadError = new Error('phrases array must contain only strings');
        }
      } else {
        // Sets format: { "default": [...], "work": [...] }
        const validSets: Record<string, string[]> = {};
        let hasValidSet = false;

        for (const [key, value] of Object.entries(dataObj)) {
          if (Array.isArray(value) && this.isStringArray(value)) {
            validSets[key] = value;
            hasValidSet = true;
          }
        }

        if (hasValidSet) {
          this.phrases = validSets;
        } else {
          this.loadError = new Error(
            'Custom phrases file must contain either { "phrases": [...] } or { "setName": [...] } format',
          );
        }
      }
    } catch (error) {
      this.loadError =
        error instanceof Error ? error : new Error(String(error));
      // Error is stored and accessible via getLoadError() - fall back gracefully
    }
  }

  private resolvePath(): string | undefined {
    if (!this.filePath) {
      // Default location
      return path.join(homedir(), '.gemini', 'phrases.json');
    }

    if (path.isAbsolute(this.filePath)) {
      return this.filePath;
    }

    // Relative to ~/.gemini/
    return path.join(homedir(), '.gemini', this.filePath);
  }

  private isStringArray(arr: unknown[]): arr is string[] {
    return arr.every((item) => typeof item === 'string');
  }
}
