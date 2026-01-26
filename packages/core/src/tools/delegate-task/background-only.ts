/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Registry of agents that MUST be executed in background mode only.
 *
 * These agents are designed for long-running operations and should never
 * block the main conversation. They are only accessible via delegate_task
 * with run_in_background=true.
 *
 * Rationale:
 * - Forces parallel execution patterns
 * - Prevents blocking the UI for minutes
 * - Aligns with ultrawork philosophy of maximum parallelism
 */
export const BACKGROUND_ONLY_AGENTS = new Set([
  'codebase_investigator', // Deep codebase analysis - can take up to 3+ minutes
]);

/**
 * Checks if an agent is required to run in background mode only.
 *
 * @param agentName - The name of the agent to check
 * @returns true if the agent must run in background, false otherwise
 */
export function isBackgroundOnlyAgent(agentName: string): boolean {
  return BACKGROUND_ONLY_AGENTS.has(agentName);
}

/**
 * Gets the list of all background-only agents.
 *
 * @returns Array of agent names that are background-only
 */
export function getBackgroundOnlyAgents(): string[] {
  return Array.from(BACKGROUND_ONLY_AGENTS);
}

/**
 * Default timeout configurations for background-only agents.
 * These can be overridden via delegate_task parameters.
 */
export const BACKGROUND_AGENT_DEFAULTS: Record<
  string,
  {
    timeoutMinutes: number;
    maxTurns: number;
    retryOnCapacity: boolean;
    maxRetryAttempts: number;
  }
> = {
  codebase_investigator: {
    timeoutMinutes: 10, // Extended from default 3 minutes
    maxTurns: 15, // Extended from default 10 turns
    retryOnCapacity: true,
    maxRetryAttempts: 3,
  },
};

/**
 * Gets the default configuration for a background-only agent.
 *
 * @param agentName - The name of the agent
 * @returns Default configuration or undefined if not a background-only agent
 */
export function getBackgroundAgentDefaults(agentName: string):
  | {
      timeoutMinutes: number;
      maxTurns: number;
      retryOnCapacity: boolean;
      maxRetryAttempts: number;
    }
  | undefined {
  return BACKGROUND_AGENT_DEFAULTS[agentName];
}
