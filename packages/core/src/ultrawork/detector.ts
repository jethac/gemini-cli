/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ultrawork mode keyword detector.
 *
 * Detects "ultrawork" or "ulw" keywords in user prompts,
 * excluding occurrences within code blocks.
 */

// Patterns to match ultrawork activation keywords
const ULTRAWORK_PATTERN = /\b(ultrawork|ulw)\b/i;

// Patterns for code blocks to exclude
const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`]+`/g;

/**
 * Remove code blocks from text to avoid false positives
 * when detecting keywords inside code examples.
 */
export function removeCodeBlocks(text: string): string {
  return text.replace(CODE_BLOCK_PATTERN, '').replace(INLINE_CODE_PATTERN, '');
}

/**
 * Detect if ultrawork mode should be activated based on prompt text.
 *
 * @param text - The user's prompt text
 * @returns true if ultrawork keyword is detected outside of code blocks
 *
 * @example
 * detectUltrawork("ultrawork implement a login system") // true
 * detectUltrawork("ulw refactor the auth module") // true
 * detectUltrawork("The code uses `ulw` variable") // false (in inline code)
 * detectUltrawork("```\nconst ultrawork = true\n```") // false (in code block)
 */
export function detectUltrawork(text: string): boolean {
  const textWithoutCode = removeCodeBlocks(text);
  return ULTRAWORK_PATTERN.test(textWithoutCode);
}
