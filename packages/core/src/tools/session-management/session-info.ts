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
import { formatSessionInfo } from './utils.js';
import { SESSION_INFO_TOOL_NAME } from '../tool-names.js';

/**
 * Parameters for the SessionInfo tool.
 */
export interface SessionInfoToolParams {
  /** Session identifier (required) */
  session_id: string;
}

class SessionInfoToolInvocation extends BaseToolInvocation<
  SessionInfoToolParams,
  ToolResult
> {
  constructor(
    private readonly sessionStorage: SessionStorage,
    params: SessionInfoToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const shortId = this.params.session_id.substring(0, 8);
    return `Get info for session ${shortId}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const info = await this.sessionStorage.getSessionInfo(
        this.params.session_id,
      );

      if (!info) {
        const notFoundMsg = `Session not found: ${this.params.session_id}`;
        return {
          llmContent: notFoundMsg,
          returnDisplay: notFoundMsg,
          error: {
            message: notFoundMsg,
          },
        };
      }

      const formattedOutput = formatSessionInfo(info);

      return {
        llmContent: formattedOutput,
        returnDisplay: `Session ${this.params.session_id.substring(0, 8)}: ${info.messageCount} messages, ${info.duration}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error getting session info: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
        },
      };
    }
  }
}

/**
 * Tool for getting detailed metadata about a session.
 */
export class SessionInfoTool extends BaseDeclarativeTool<
  SessionInfoToolParams,
  ToolResult
> {
  static readonly Name = SESSION_INFO_TOOL_NAME;

  constructor(
    private readonly _config: Config,
    private readonly sessionStorage: SessionStorage,
    messageBus: MessageBus,
  ) {
    super(
      SessionInfoTool.Name,
      'SessionInfo',
      'Gets detailed metadata and statistics about a specific session, including message count, date range, duration, agents used, and available data sources.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          session_id: {
            type: 'string',
            description: 'The unique identifier of the session to inspect.',
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
    params: SessionInfoToolParams,
  ): string | null {
    if (!params.session_id || params.session_id.trim() === '') {
      return 'session_id parameter is required and cannot be empty.';
    }

    return null;
  }

  protected createInvocation(
    params: SessionInfoToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<SessionInfoToolParams, ToolResult> {
    return new SessionInfoToolInvocation(
      this.sessionStorage,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
