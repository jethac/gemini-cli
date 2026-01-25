/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { ToolInvocation, ToolResult } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import type { Config } from '../../config/config.js';
import type { SessionStorage, SearchOptions } from './storage.js';
import { formatSearchResults } from './utils.js';
import { SESSION_SEARCH_TOOL_NAME } from '../tool-names.js';

/**
 * Default timeout for search operations in milliseconds.
 */
const SEARCH_TIMEOUT_MS = 60000;

/**
 * Default maximum number of search results.
 */
const DEFAULT_RESULT_LIMIT = 20;

/**
 * Parameters for the SessionSearch tool.
 */
export interface SessionSearchToolParams {
  /** Search query string (required) */
  query: string;
  /** Search within a specific session only */
  session_id?: string;
  /** Case-sensitive search (default: false) */
  case_sensitive?: boolean;
  /** Maximum number of results to return (default: 20) */
  limit?: number;
}

class SessionSearchToolInvocation extends BaseToolInvocation<
  SessionSearchToolParams,
  ToolResult
> {
  constructor(
    private readonly sessionStorage: SessionStorage,
    params: SessionSearchToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    let desc = `Search for "${this.params.query}"`;
    if (this.params.session_id) {
      desc += ` in session ${this.params.session_id.substring(0, 8)}`;
    } else {
      desc += ' across all sessions';
    }
    return desc;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Search operation timed out after 60 seconds.'));
        }, SEARCH_TIMEOUT_MS);

        // Clean up timeout if signal is aborted
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timeoutId);
            reject(new Error('Search operation was cancelled.'));
          },
          { once: true },
        );
      });

      const searchOptions: SearchOptions = {
        sessionId: this.params.session_id,
        caseSensitive: this.params.case_sensitive ?? false,
        limit: this.params.limit ?? DEFAULT_RESULT_LIMIT,
      };

      // Race between search and timeout
      const results = await Promise.race([
        this.sessionStorage.searchMessages(this.params.query, searchOptions),
        timeoutPromise,
      ]);

      const formattedOutput = formatSearchResults(results, this.params.query);

      return {
        llmContent: formattedOutput,
        returnDisplay:
          results.length > 0
            ? `Found ${results.length} match${results.length === 1 ? '' : 'es'}`
            : 'No matches found',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error searching sessions: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
        },
      };
    }
  }
}

/**
 * Tool for searching content within session messages.
 */
export class SessionSearchTool extends BaseDeclarativeTool<
  SessionSearchToolParams,
  ToolResult
> {
  static readonly Name = SESSION_SEARCH_TOOL_NAME;

  constructor(
    private readonly _config: Config,
    private readonly sessionStorage: SessionStorage,
    messageBus: MessageBus,
  ) {
    super(
      SessionSearchTool.Name,
      'SessionSearch',
      'Searches for text content within session messages. Returns matching excerpts with surrounding context. Can search all sessions or a specific session.',
      Kind.Search,
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The text to search for within session messages.',
          },
          session_id: {
            type: 'string',
            description:
              'Optional: Search within a specific session only. If omitted, searches all sessions.',
          },
          case_sensitive: {
            type: 'boolean',
            description:
              'Optional: Whether the search should be case-sensitive. Default is false.',
          },
          limit: {
            type: 'number',
            description:
              'Optional: Maximum number of results to return. Default is 20.',
          },
        },
        required: ['query'],
      },
      messageBus,
      true,
      false,
    );
  }

  protected override validateToolParamValues(
    params: SessionSearchToolParams,
  ): string | null {
    if (!params.query || params.query.trim() === '') {
      return 'Query parameter is required and cannot be empty.';
    }

    if (params.limit !== undefined) {
      if (params.limit < 1 || !Number.isInteger(params.limit)) {
        return 'Limit must be a positive integer.';
      }
      if (params.limit > 100) {
        return 'Limit cannot exceed 100 results.';
      }
    }

    return null;
  }

  protected createInvocation(
    params: SessionSearchToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<SessionSearchToolParams, ToolResult> {
    return new SessionSearchToolInvocation(
      this.sessionStorage,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
