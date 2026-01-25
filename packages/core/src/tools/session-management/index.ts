/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Storage interface and types
export type {
  SessionStorage,
  SessionFilter,
  SessionSummary,
  Session,
  SessionMessage,
  SessionToolCall,
  SearchOptions,
  SearchResult,
  SessionInfo,
} from './storage.js';

// Tools
export { SessionListTool } from './session-list.js';
export type { SessionListToolParams } from './session-list.js';

export { SessionSearchTool } from './session-search.js';
export type { SessionSearchToolParams } from './session-search.js';

export { SessionReadTool } from './session-read.js';
export type { SessionReadToolParams } from './session-read.js';

export { SessionInfoTool } from './session-info.js';
export type { SessionInfoToolParams } from './session-info.js';

// Utilities
export {
  formatDate,
  formatTimestamp,
  calculateDuration,
  truncate,
  formatSessionListTable,
  formatSearchResults,
  formatSessionMessages,
  formatMessageContent,
  formatSessionInfo,
  extractMatchesWithContext,
} from './utils.js';
