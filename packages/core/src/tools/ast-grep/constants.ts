/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Supported languages for ast-grep
 */
export const AST_GREP_LANGUAGES = [
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'elixir',
  'go',
  'haskell',
  'html',
  'java',
  'javascript',
  'json',
  'kotlin',
  'lua',
  'nix',
  'php',
  'python',
  'ruby',
  'rust',
  'scala',
  'solidity',
  'swift',
  'typescript',
  'tsx',
  'yaml',
] as const;

export type AstGrepLanguage = (typeof AST_GREP_LANGUAGES)[number];

/**
 * Checks if a command is available in the system's PATH.
 */
function isCommandAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const checkCommand = process.platform === 'win32' ? 'where' : 'command';
    const checkArgs =
      process.platform === 'win32' ? [command] : ['-v', command];
    try {
      const child = spawn(checkCommand, checkArgs, {
        stdio: 'ignore',
        shell: true,
      });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

/**
 * Checks if a file exists at the given path.
 */
function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Resolves the ast-grep CLI binary path.
 * Priority: PATH → npm package → Homebrew
 * @returns The path to the sg binary, or null if not found.
 */
export async function getSgCliPath(): Promise<string | null> {
  // Strategy 1: Check if 'sg' is available in PATH
  if (await isCommandAvailable('sg')) {
    return 'sg';
  }

  // Strategy 2: Check if 'ast-grep' is available in PATH (alternative name)
  if (await isCommandAvailable('ast-grep')) {
    return 'ast-grep';
  }

  // Strategy 3: Check for npm global installation
  const npmGlobalPaths = [
    // Unix-like systems
    '/usr/local/bin/sg',
    '/usr/bin/sg',
    // macOS with Homebrew
    '/opt/homebrew/bin/sg',
    '/usr/local/opt/ast-grep/bin/sg',
    // Windows npm global
    path.join(
      process.env['APPDATA'] || '',
      'npm',
      process.platform === 'win32' ? 'sg.cmd' : 'sg',
    ),
    // User-local npm
    path.join(
      process.env['HOME'] || process.env['USERPROFILE'] || '',
      '.npm-global',
      'bin',
      'sg',
    ),
  ];

  for (const sgPath of npmGlobalPaths) {
    if (sgPath && fileExists(sgPath)) {
      return sgPath;
    }
  }

  // Strategy 4: Check for Homebrew installation on macOS
  if (process.platform === 'darwin') {
    const homebrewPaths = [
      '/opt/homebrew/bin/sg',
      '/usr/local/bin/sg',
      '/opt/homebrew/Cellar/ast-grep/*/bin/sg',
    ];
    for (const brewPath of homebrewPaths) {
      if (fileExists(brewPath)) {
        return brewPath;
      }
    }
  }

  return null;
}

/**
 * Returns installation instructions for ast-grep.
 */
export function getInstallInstructions(): string {
  return `ast-grep (sg) binary not found. Install it using one of these methods:

1. npm (recommended):
   npm install -g @ast-grep/cli

2. Homebrew (macOS/Linux):
   brew install ast-grep

3. Cargo (Rust):
   cargo install ast-grep --locked

4. Download from GitHub releases:
   https://github.com/ast-grep/ast-grep/releases

After installation, ensure 'sg' is available in your PATH.`;
}
