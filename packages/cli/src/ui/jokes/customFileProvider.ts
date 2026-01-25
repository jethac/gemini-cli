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
 * Default directory for custom phrase files.
 */
export const CUSTOM_PHRASES_DIR = path.join(homedir(), '.gemini', 'phrases');

/**
 * A provider that loads phrases from a single JSON file.
 * The file should contain an array of strings: ["phrase1", "phrase2", ...]
 *
 * Also supports { "phrases": [...] } format for backward compatibility.
 */
export class CustomPhraseProvider implements JokeProvider {
  readonly id: string;
  readonly name: string;
  readonly phraseSets: readonly string[] = ['default'];

  private phrases: string[] = [];
  private loaded = false;
  private loadError: Error | null = null;

  constructor(
    private filePath: string,
    id?: string,
  ) {
    // Derive id from filename if not provided
    this.id = id ?? path.basename(filePath, '.json');
    this.name = `Custom: ${this.id}`;
  }

  getPhrases(_set?: string): readonly string[] {
    this.ensureLoaded();
    return this.phrases;
  }

  getRandomPhrase(_set?: string): string | undefined {
    const phrases = this.getPhrases();
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
    this.phrases = [];
    this.ensureLoaded();
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;

    if (!fs.existsSync(this.filePath)) {
      // File doesn't exist - this is not an error, just no custom phrases
      return;
    }

    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const data: unknown = JSON.parse(content);

      if (Array.isArray(data)) {
        // Simple format: ["phrase1", "phrase2", ...]
        if (this.isStringArray(data)) {
          this.phrases = data;
        } else {
          this.loadError = new Error(
            `${this.filePath}: array must contain only strings`,
          );
        }
      } else if (data && typeof data === 'object') {
        // Also support { "phrases": [...] } format for backward compatibility
        const dataObj = data as Record<string, unknown>;
        if (Array.isArray(dataObj['phrases'])) {
          if (this.isStringArray(dataObj['phrases'])) {
            this.phrases = dataObj['phrases'];
          } else {
            this.loadError = new Error(
              `${this.filePath}: phrases array must contain only strings`,
            );
          }
        } else {
          this.loadError = new Error(
            `${this.filePath}: expected an array of strings or { "phrases": [...] }`,
          );
        }
      } else {
        this.loadError = new Error(
          `${this.filePath}: expected an array of strings`,
        );
      }
    } catch (error) {
      this.loadError =
        error instanceof Error ? error : new Error(String(error));
    }
  }

  private isStringArray(arr: unknown[]): arr is string[] {
    return arr.every((item) => typeof item === 'string');
  }
}

/**
 * Scans the custom phrases directory and returns providers for each JSON file.
 *
 * Directory: ~/.gemini/phrases/
 * Each .json file becomes a provider with id = filename (without .json)
 *
 * Example:
 *   ~/.gemini/phrases/goomics.json -> provider id: "goomics"
 *   ~/.gemini/phrases/work.json -> provider id: "work"
 */
export function loadCustomProviders(
  directory: string = CUSTOM_PHRASES_DIR,
): CustomPhraseProvider[] {
  const providers: CustomPhraseProvider[] = [];

  if (!fs.existsSync(directory)) {
    return providers;
  }

  try {
    const files = fs.readdirSync(directory);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(directory, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile()) {
        const id = path.basename(file, '.json');
        providers.push(new CustomPhraseProvider(filePath, id));
      }
    }
  } catch {
    // Directory read failed - return empty list
  }

  return providers;
}

/**
 * @deprecated Use loadCustomProviders() instead.
 * This class is kept for backward compatibility only.
 */
export const CustomFileProvider = CustomPhraseProvider;
