/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';

/**
 * Parse arguments from the /ulw-loop command.
 *
 * Supports:
 * - Quoted prompt: /ulw-loop "my prompt here"
 * - Unquoted prompt: /ulw-loop my prompt here
 * - Options: --max-iterations=N, --completion-promise=WORD
 *
 * @param args Raw argument string
 * @returns Parsed arguments
 */
function parseUlwLoopArgs(args: string): {
  prompt: string;
  maxIterations?: number;
  completionPromise?: string;
} {
  const trimmed = args.trim();

  // Extract options
  const maxIterMatch = trimmed.match(/--max-iterations=(\d+)/i);
  const promiseMatch = trimmed.match(
    /--completion-promise=["']?([^"'\s]+)["']?/i,
  );

  // Remove options from the string to get the prompt
  const promptPart = trimmed
    .replace(/--max-iterations=\d+/gi, '')
    .replace(/--completion-promise=["']?[^"'\s]+["']?/gi, '')
    .trim();

  // Handle quoted prompt
  const quotedMatch = promptPart.match(/^["'](.+?)["']/);
  const prompt = quotedMatch
    ? quotedMatch[1]
    : promptPart || 'Complete the task';

  return {
    prompt,
    maxIterations: maxIterMatch ? parseInt(maxIterMatch[1], 10) : undefined,
    completionPromise: promiseMatch?.[1],
  };
}

/**
 * The /ulw-loop command starts ultrawork mode with continuous execution.
 *
 * Usage:
 *   /ulw-loop "implement user registration with email verification"
 *   /ulw-loop 'build REST API' --max-iterations=50
 *   /ulw-loop implement login --completion-promise=SHIPPED
 *
 * This command:
 * 1. Parses the prompt and options
 * 2. Prepends "ultrawork" to activate ultrawork mode
 * 3. Sends the prompt as a user message
 */
export const ulwLoopCommand: SlashCommand = {
  name: 'ulw-loop',
  altNames: ['ulw', 'ultrawork'],
  description: 'Start ultrawork mode with maximum precision execution',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,

  action: async (context, args) => {
    const { prompt, maxIterations, completionPromise } = parseUlwLoopArgs(args);

    // Build the ultrawork prompt
    // The "ultrawork" keyword will be detected by the ultrawork processor
    // and the full ultrawork system prompt will be injected
    let ultraworkPrompt = `ultrawork ${prompt}`;

    // Add iteration info if specified (for user context)
    if (maxIterations) {
      ultraworkPrompt += `\n\n[Max iterations: ${maxIterations}]`;
    }

    // Add completion promise if specified
    if (completionPromise) {
      ultraworkPrompt += `\n\n[Completion promise: ${completionPromise}]`;
    }

    // Return as a prompt to be sent to the agent
    return {
      type: 'submit_prompt' as const,
      content: [{ text: ultraworkPrompt }],
    };
  },

  completion: async (_context, _partialArg) => 
    // Provide example completions for common tasks
     [
      '"implement user authentication"',
      '"refactor the codebase"',
      '"add unit tests"',
      '"fix all TypeScript errors"',
      '"create API endpoints"',
    ]
  ,
};
