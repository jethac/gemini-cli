/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PartListUnion } from '@google/genai';

/**
 * Filter options for listing sessions.
 */
export interface SessionFilter {
  /** ISO 8601 date string - filter sessions from this date */
  fromDate?: string;
  /** ISO 8601 date string - filter sessions until this date */
  toDate?: string;
  /** Filter by project path */
  projectPath?: string;
  /** Maximum number of sessions to return */
  limit?: number;
}

/**
 * Summary information about a session for listing purposes.
 */
export interface SessionSummary {
  /** Unique session identifier */
  id: string;
  /** Session file name */
  fileName: string;
  /** ISO timestamp when session started */
  startTime: string;
  /** ISO timestamp when session was last updated */
  lastUpdated: string;
  /** Total number of messages in the session */
  messageCount: number;
  /** Display name for the session */
  displayName: string;
  /** First user message content (cleaned) */
  firstUserMessage: string;
  /** AI-generated summary if available */
  summary?: string;
  /** Display index in the list */
  index: number;
}

/**
 * A single message in a session.
 */
export interface SessionMessage {
  /** Unique message identifier */
  id: string;
  /** ISO timestamp of the message */
  timestamp: string;
  /** Message type/role */
  type: 'user' | 'gemini' | 'info' | 'error' | 'warning';
  /** Message content */
  content: PartListUnion;
  /** Tool calls made in this message (for gemini messages) */
  toolCalls?: SessionToolCall[];
  /** Model used for this message (for gemini messages) */
  model?: string;
}

/**
 * A tool call record within a message.
 */
export interface SessionToolCall {
  /** Tool call identifier */
  id: string;
  /** Tool name */
  name: string;
  /** Tool arguments */
  args: Record<string, unknown>;
  /** Tool result */
  result?: PartListUnion | null;
  /** Execution status */
  status: string;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * Full session data including all messages.
 */
export interface Session {
  /** Unique session identifier */
  sessionId: string;
  /** Project hash this session belongs to */
  projectHash: string;
  /** ISO timestamp when session started */
  startTime: string;
  /** ISO timestamp when session was last updated */
  lastUpdated: string;
  /** All messages in the session */
  messages: SessionMessage[];
  /** AI-generated summary if available */
  summary?: string;
}

/**
 * Options for searching session messages.
 */
export interface SearchOptions {
  /** Search within a specific session only */
  sessionId?: string;
  /** Case-sensitive search (default: false) */
  caseSensitive?: boolean;
  /** Maximum number of results to return (default: 20) */
  limit?: number;
}

/**
 * A single search result with context.
 */
export interface SearchResult {
  /** Session ID where match was found */
  sessionId: string;
  /** Message ID where match was found */
  messageId: string;
  /** Role of the message author */
  role: 'user' | 'assistant';
  /** Text before the match */
  before: string;
  /** The matched text */
  match: string;
  /** Text after the match */
  after: string;
}

/**
 * Detailed session information/metadata.
 */
export interface SessionInfo {
  /** Unique session identifier */
  sessionId: string;
  /** Total number of messages */
  messageCount: number;
  /** ISO timestamp when session started */
  startTime: string;
  /** ISO timestamp when session was last updated */
  lastUpdated: string;
  /** Duration of the session in human-readable format */
  duration: string;
  /** List of unique agents/models used */
  agentsUsed: string[];
  /** Whether the session has todos */
  hasTodos: boolean;
  /** Number of todo items if present */
  todoCount?: number;
  /** Number of completed todos if present */
  completedTodoCount?: number;
  /** Whether the session has transcript data */
  hasTranscript: boolean;
  /** Number of transcript entries if present */
  transcriptEntryCount?: number;
  /** AI-generated summary if available */
  summary?: string;
  /** First user message (for context) */
  firstUserMessage: string;
}

/**
 * Interface for session storage operations.
 * This abstraction allows the tools in core to work with session data
 * without depending on the CLI package's implementation details.
 */
export interface SessionStorage {
  /**
   * Lists sessions with optional filtering.
   * @param filter Optional filter criteria
   * @returns Array of session summaries
   */
  listSessions(filter?: SessionFilter): Promise<SessionSummary[]>;

  /**
   * Gets a full session by ID.
   * @param id Session identifier
   * @returns Session data or null if not found
   */
  getSession(id: string): Promise<Session | null>;

  /**
   * Gets messages from a session with optional limit.
   * @param sessionId Session identifier
   * @param limit Maximum number of messages to return
   * @returns Array of messages
   */
  getMessages(sessionId: string, limit?: number): Promise<SessionMessage[]>;

  /**
   * Searches for text across session messages.
   * @param query Search query string
   * @param options Search options
   * @returns Array of search results with context
   */
  searchMessages(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]>;

  /**
   * Gets detailed information about a session.
   * @param id Session identifier
   * @returns Session info or null if not found
   */
  getSessionInfo(id: string): Promise<SessionInfo | null>;
}
