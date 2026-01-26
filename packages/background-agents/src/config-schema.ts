/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { BackgroundAgentConfig } from './types.js';
import { TIMING } from './background-manager.js';
import { DEFAULT_LIMITS } from './concurrency-manager.js';

/**
 * Zod schema for background agent configuration.
 *
 * This schema validates the backgroundAgents section in settings.json.
 */
export const backgroundAgentConfigSchema = z
  .object({
    enabled: z
      .boolean()
      .optional()
      .default(true)
      .describe('Whether background agents are enabled'),

    defaultConcurrency: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(DEFAULT_LIMITS.perModel)
      .describe(
        'Default concurrency limit for models without specific limits. 0 = unlimited.',
      ),

    modelConcurrency: z
      .record(z.string(), z.number().int().min(0))
      .optional()
      .describe(
        'Per-model concurrency limits. Key is model name, value is max concurrent tasks. 0 = unlimited.',
      ),

    providerConcurrency: z
      .record(z.string(), z.number().int().min(0))
      .optional()
      .describe(
        'Per-provider concurrency limits. Key is provider name (e.g., "gemini", "anthropic"), value is max concurrent tasks.',
      ),

    globalConcurrency: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(DEFAULT_LIMITS.global)
      .describe(
        'Global maximum concurrent tasks across all models. 0 = unlimited.',
      ),

    taskTTL: z
      .number()
      .int()
      .min(60000)
      .optional()
      .default(TIMING.TASK_TTL_MS)
      .describe(
        'Maximum task lifetime in milliseconds. Tasks exceeding this are terminated.',
      ),

    staleTimeout: z
      .number()
      .int()
      .min(30000)
      .optional()
      .default(TIMING.STALE_TIMEOUT_MS)
      .describe(
        'Inactivity timeout for stale detection in milliseconds. Tasks with no activity for this duration are marked stale.',
      ),

    toolApproval: z
      .enum(['auto', 'prompt', 'deny-dangerous'])
      .optional()
      .default('auto')
      .describe(
        'Tool approval mode for background tasks. "auto" = auto-approve all, "prompt" = require approval, "deny-dangerous" = auto-deny dangerous tools.',
      ),

    dangerousTools: z
      .array(z.string())
      .optional()
      .default(['run_shell_command', 'write_file'])
      .describe(
        'List of tools considered dangerous (used with toolApproval="deny-dangerous").',
      ),
  })
  .describe('Configuration for background agent execution');

/**
 * Parses and validates background agent configuration.
 *
 * @param input - Raw configuration object
 * @returns Validated configuration
 * @throws ZodError if validation fails
 */
export function parseConfig(input: unknown): BackgroundAgentConfig {
  return backgroundAgentConfigSchema.parse(input);
}

/**
 * Safely parses configuration, returning defaults on error.
 *
 * @param input - Raw configuration object
 * @returns Validated configuration or defaults
 */
export function parseConfigSafe(input: unknown): BackgroundAgentConfig {
  const result = backgroundAgentConfigSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  // Return defaults
  return {
    enabled: true,
    defaultConcurrency: DEFAULT_LIMITS.perModel,
    globalConcurrency: DEFAULT_LIMITS.global,
    taskTTL: TIMING.TASK_TTL_MS,
    staleTimeout: TIMING.STALE_TIMEOUT_MS,
    toolApproval: 'auto',
    dangerousTools: ['run_shell_command', 'write_file'],
  };
}

/**
 * Gets the default configuration.
 */
export function getDefaultConfig(): BackgroundAgentConfig {
  return parseConfigSafe({});
}

/**
 * JSON Schema representation for documentation/settings schema generation.
 */
export const backgroundAgentJsonSchema = {
  type: 'object',
  description: 'Configuration for background agent execution',
  properties: {
    enabled: {
      type: 'boolean',
      default: true,
      description: 'Whether background agents are enabled',
    },
    defaultConcurrency: {
      type: 'integer',
      minimum: 0,
      default: DEFAULT_LIMITS.perModel,
      description:
        'Default concurrency limit for models without specific limits. 0 = unlimited.',
    },
    modelConcurrency: {
      type: 'object',
      additionalProperties: { type: 'integer', minimum: 0 },
      description:
        'Per-model concurrency limits. Key is model name, value is max concurrent tasks.',
      examples: [{ 'gemini-3-pro-preview': 3, 'gemini-3-flash-preview': 10 }],
    },
    providerConcurrency: {
      type: 'object',
      additionalProperties: { type: 'integer', minimum: 0 },
      description:
        'Per-provider concurrency limits. Key is provider name, value is max concurrent tasks.',
      examples: [{ gemini: 10, anthropic: 5 }],
    },
    globalConcurrency: {
      type: 'integer',
      minimum: 0,
      default: DEFAULT_LIMITS.global,
      description:
        'Global maximum concurrent tasks across all models. 0 = unlimited.',
    },
    taskTTL: {
      type: 'integer',
      minimum: 60000,
      default: TIMING.TASK_TTL_MS,
      description:
        'Maximum task lifetime in milliseconds. Tasks exceeding this are terminated.',
    },
    staleTimeout: {
      type: 'integer',
      minimum: 30000,
      default: TIMING.STALE_TIMEOUT_MS,
      description:
        'Inactivity timeout for stale detection in milliseconds. Tasks with no activity for this duration are marked stale.',
    },
    toolApproval: {
      type: 'string',
      enum: ['auto', 'prompt', 'deny-dangerous'],
      default: 'auto',
      description:
        'Tool approval mode for background tasks. "auto" = auto-approve all, "prompt" = require approval, "deny-dangerous" = auto-deny dangerous tools.',
    },
    dangerousTools: {
      type: 'array',
      items: { type: 'string' },
      default: ['run_shell_command', 'write_file'],
      description:
        'List of tools considered dangerous (used with toolApproval="deny-dangerous").',
    },
  },
};
