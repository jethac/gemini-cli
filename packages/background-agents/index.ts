/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Background Agents Plugin for Gemini CLI
 *
 * This plugin provides background/parallel agent execution capabilities,
 * allowing users to spawn multiple agent tasks that run asynchronously.
 *
 * @packageDocumentation
 */

// Core managers
export { BackgroundManager, TIMING } from './src/background-manager.js';
export {
  ConcurrencyManager,
  DEFAULT_LIMITS,
} from './src/concurrency-manager.js';

// Tools
export {
  createBackgroundLaunchTool,
  createBackgroundOutputTool,
  createBackgroundCancelTool,
  createBackgroundTools,
} from './src/tools.js';
export type { ToolDefinition, ToolResult } from './src/tools.js';

// Configuration
export {
  backgroundAgentConfigSchema,
  backgroundAgentJsonSchema,
  parseConfig,
  parseConfigSafe,
  getDefaultConfig,
} from './src/config-schema.js';

// Types
export type {
  BackgroundAgentConfig,
  BackgroundTask,
  BackgroundTaskStatus,
  LaunchInput,
  QueueEntry,
  QueueItem,
  TaskNotification,
  AgentToolRestrictions,
} from './src/types.js';
export { DEFAULT_AGENT_RESTRICTIONS } from './src/types.js';
