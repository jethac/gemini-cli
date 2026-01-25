/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { ToolInvocation, ToolResult } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import type { Config } from '../../config/config.js';
import type { SessionStorage } from './storage.js';
import { formatSessionMessages } from './utils.js';
import { SESSION_READ_TOOL_NAME } from '../tool-names.js';

/**
 * Parameters for the SessionRead tool.
 */
export interface SessionReadToolParams {
  /** Session identifier (required) */
  session_id: string;
  /** Include todo list if available (default: false) */
  include_todos?: boolean;
  /** Include transcript log if available (default: false) */
  include_transcript?: boolean;
  /** Maximum number of messages to return */
  limit?: number;
}

class SessionReadToolInvocation extends BaseToolInvocation<
  SessionReadToolParams,
  ToolResult
> {
  constructor(
    private readonly sessionStorage: SessionStorage,
    params: SessionReadToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const shortId = this.params.session_id.substring(0, 8);
    let desc = `Read session ${shortId}`;
    if (this.params.limit) {
      desc += ` (limit: ${this.params.limit} messages)`;
    }
    return desc;
  }

  async execute(): Promise<ToolResult> {
    try {
      const session = await this.sessionStorage.getSession(
        this.params.session_id,
      );

      if (!session) {
        const notFoundMsg = `Session not found: ${this.params.session_id}`;
        return {
          llmContent: notFoundMsg,
          returnDisplay: notFoundMsg,
          error: {
            message: notFoundMsg,
          },
        };
      }

      // Get messages with optional limit
      let messages = session.messages;
      if (this.params.limit && this.params.limit > 0) {
        messages = messages.slice(0, this.params.limit);
      }

      // Format the main output
      let output = formatSessionMessages(
        messages,
        session.sessionId,
        session.startTime,
        session.lastUpdated,
      );

      // Add todo information if requested
      if (this.params.include_todos) {
        output += '\n\n--- Todos ---\n';
        output +=
          'Todo tracking is not yet implemented in this session format.';
      }

      // Add transcript information if requested
      if (this.params.include_transcript) {
        output += '\n\n--- Transcript ---\n';
        output +=
          'Transcript data is not yet implemented in this session format.';
      }

      const displayMsg =
        this.params.limit && messages.length >= this.params.limit
          ? `Showing ${messages.length} of ${session.messages.length} messages`
          : `${messages.length} message${messages.length === 1 ? '' : 's'}`;

      return {
        llmContent: output,
        returnDisplay: displayMsg,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error reading session: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
        },
      };
    }
  }
}

/**
 * Tool for reading messages and history from a session.
 */
export class SessionReadTool extends BaseDeclarativeTool<
  SessionReadToolParams,
  ToolResult
> {
  static readonly Name = SESSION_READ_TOOL_NAME;

  constructor(
    private readonly _config: Config,
    private readonly sessionStorage: SessionStorage,
    messageBus: MessageBus,
  ) {
    super(
      SessionReadTool.Name,
      'SessionRead',
      'Reads messages and history from a specific session. Returns formatted messages with role, timestamp, and content. Optionally includes todos and transcript data.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          session_id: {
            type: 'string',
            description: 'The unique identifier of the session to read.',
          },
          include_todos: {
            type: 'boolean',
            description:
              'Optional: Include todo list if available. Default is false.',
          },
          include_transcript: {
            type: 'boolean',
            description:
              'Optional: Include transcript log if available. Default is false.',
          },
          limit: {
            type: 'number',
            description:
              'Optional: Maximum number of messages to return. If omitted, returns all messages.',
          },
        },
        required: ['session_id'],
      },
      messageBus,
      true,
      false,
    );
  }

  protected override validateToolParamValues(
    params: SessionReadToolParams,
  ): string | null {
    if (!params.session_id || params.session_id.trim() === '') {
      return 'session_id parameter is required and cannot be empty.';
    }

    if (params.limit !== undefined) {
      if (params.limit < 1 || !Number.isInteger(params.limit)) {
        return 'Limit must be a positive integer.';
      }
    }

    return null;
  }

  protected createInvocation(
    params: SessionReadToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<SessionReadToolParams, ToolResult> {
    return new SessionReadToolInvocation(
      this.sessionStorage,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
