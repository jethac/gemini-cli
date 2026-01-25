/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { getSgCliPath, getInstallInstructions } from './constants.js';
import type { AstGrepLanguage } from './constants.js';

/**
 * Options for running ast-grep CLI
 */
export interface SgRunOptions {
  /** The pattern to search for */
  pattern: string;
  /** The language to parse */
  lang: AstGrepLanguage;
  /** Optional rewrite pattern for replacements */
  rewrite?: string;
  /** Paths to search in */
  paths?: string[];
  /** Glob patterns to filter files */
  globs?: string[];
  /** Number of context lines to include */
  context?: number;
  /** Apply changes (only if dryRun=false for replace) */
  updateAll?: boolean;
  /** Working directory for the command */
  cwd?: string;
}

/**
 * Range information for a match
 */
export interface SgRange {
  byteOffset: {
    start: number;
    end: number;
  };
  start: {
    line: number;
    column: number;
  };
  end: {
    line: number;
    column: number;
  };
}

/**
 * A single match result from ast-grep
 */
export interface SgMatch {
  /** File path where the match was found */
  file: string;
  /** Range of the match */
  range: SgRange;
  /** The matched lines */
  lines: string;
  /** The replacement text (only present for replace operations) */
  replacement?: string;
}

/**
 * Result from running ast-grep
 */
export interface SgResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Array of matches found */
  matches: SgMatch[];
  /** Error message if the operation failed */
  error?: string;
  /** Whether the binary was not found */
  binaryNotFound?: boolean;
  /** Whether the output was truncated */
  truncated?: boolean;
  /** Raw stderr output for debugging */
  stderr?: string;
}

/** Maximum output size in bytes (1MB) */
const MAX_OUTPUT_SIZE = 1024 * 1024;

/** Timeout in milliseconds (300 seconds) */
const TIMEOUT_MS = 300 * 1000;

/**
 * Runs the ast-grep CLI with the given options.
 */
export async function runSg(options: SgRunOptions): Promise<SgResult> {
  const sgPath = await getSgCliPath();

  if (!sgPath) {
    return {
      success: false,
      matches: [],
      error: getInstallInstructions(),
      binaryNotFound: true,
    };
  }

  const args = buildArgs(options);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let stdoutSize = 0;
    let truncated = false;
    let timedOut = false;

    const child = spawn(sgPath, args, {
      cwd: options.cwd,
      windowsHide: true,
      timeout: TIMEOUT_MS,
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, TIMEOUT_MS);

    child.stdout.on('data', (data: Buffer) => {
      if (stdoutSize + data.length > MAX_OUTPUT_SIZE) {
        truncated = true;
        // Take only what we can fit
        const remaining = MAX_OUTPUT_SIZE - stdoutSize;
        if (remaining > 0) {
          stdout += data.slice(0, remaining).toString('utf8');
          stdoutSize = MAX_OUTPUT_SIZE;
        }
        // Kill the process since we've hit the limit
        child.kill('SIGTERM');
      } else {
        stdout += data.toString('utf8');
        stdoutSize += data.length;
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString('utf8');
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        matches: [],
        error: `Failed to execute ast-grep: ${err.message}`,
        stderr,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        // Try to parse partial results
        const partialResult = parseOutput(stdout);
        resolve({
          success: false,
          matches: partialResult.matches,
          error: `ast-grep timed out after ${TIMEOUT_MS / 1000} seconds. Partial results may be available.`,
          truncated: true,
          stderr,
        });
        return;
      }

      // ast-grep returns 0 for success (with or without matches)
      // and non-zero for errors
      if (code !== 0 && code !== null) {
        // Check for common error patterns
        const errorMessage = parseErrorMessage(stderr, code);
        resolve({
          success: false,
          matches: [],
          error: errorMessage,
          stderr,
        });
        return;
      }

      const result = parseOutput(stdout);
      resolve({
        success: true,
        matches: result.matches,
        truncated,
        stderr: stderr || undefined,
      });
    });
  });
}

/**
 * Builds command line arguments for ast-grep.
 */
function buildArgs(options: SgRunOptions): string[] {
  const args: string[] = ['run'];

  // Pattern (required)
  args.push('-p', options.pattern);

  // Language (required)
  args.push('--lang', options.lang);

  // JSON output format
  args.push('--json=compact');

  // Rewrite pattern (for replace operations)
  if (options.rewrite) {
    args.push('-r', options.rewrite);
  }

  // Apply changes (only for replace with updateAll=true)
  if (options.updateAll && options.rewrite) {
    args.push('--update-all');
  }

  // Context lines
  if (options.context !== undefined && options.context > 0) {
    args.push('-C', String(options.context));
  }

  // Glob patterns
  if (options.globs && options.globs.length > 0) {
    for (const glob of options.globs) {
      args.push('--globs', glob);
    }
  }

  // Paths to search (at the end)
  if (options.paths && options.paths.length > 0) {
    args.push(...options.paths);
  } else {
    // Default to current directory
    args.push('.');
  }

  return args;
}

/**
 * Parses the JSON output from ast-grep.
 */
function parseOutput(stdout: string): { matches: SgMatch[] } {
  if (!stdout.trim()) {
    return { matches: [] };
  }

  try {
    // ast-grep outputs JSON array in compact format
    const matches = JSON.parse(stdout) as SgMatch[];
    return { matches: Array.isArray(matches) ? matches : [] };
  } catch {
    // If JSON parsing fails, try to extract partial results
    // This can happen with truncated output
    try {
      // Try to find complete JSON objects
      const partialMatches: SgMatch[] = [];
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.startsWith('[') || line.startsWith('{')) {
          try {
            const parsed = JSON.parse(line);
            if (Array.isArray(parsed)) {
              partialMatches.push(...parsed);
            } else if (parsed.file) {
              partialMatches.push(parsed);
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
      return { matches: partialMatches };
    } catch {
      return { matches: [] };
    }
  }
}

/**
 * Parses error messages from ast-grep stderr.
 */
function parseErrorMessage(stderr: string, exitCode: number): string {
  const stderrLower = stderr.toLowerCase();

  // Pattern parse errors
  if (
    stderrLower.includes('pattern') &&
    (stderrLower.includes('error') || stderrLower.includes('invalid'))
  ) {
    return `Pattern parse error: ${stderr.trim()}

Hints for writing ast-grep patterns:
- Patterns must be valid code in the target language
- Use $VAR for single node meta-variables (e.g., console.log($MSG))
- Use $$$ for multiple nodes (e.g., function $NAME($$$) { $$$ })
- Patterns are AST-aware, not text-based`;
  }

  // Language not supported
  if (stderrLower.includes('language') && stderrLower.includes('not')) {
    return `Unsupported language: ${stderr.trim()}`;
  }

  // File not found
  if (
    stderrLower.includes('no such file') ||
    stderrLower.includes('not found')
  ) {
    return `Path not found: ${stderr.trim()}`;
  }

  // Generic error
  return `ast-grep error (exit code ${exitCode}): ${stderr.trim() || 'Unknown error'}`;
}
