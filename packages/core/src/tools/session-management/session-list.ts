/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { ToolInvocation, ToolResult } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import type { Config } from '../../config/config.js';
import type { SessionStorage, SessionFilter } from './storage.js';
import { formatSessionListTable } from './utils.js';
import { SESSION_LIST_TOOL_NAME } from '../tool-names.js';

/**
 * Parameters for the SessionList tool.
 */
export interface SessionListToolParams {
  /** Maximum number of sessions to return */
  limit?: number;
  /** ISO 8601 date - filter sessions from this date */
  from_date?: string;
  /** ISO 8601 date - filter sessions until this date */
  to_date?: string;
  /** Filter by project path */
  project_path?: string;
}

class SessionListToolInvocation extends BaseToolInvocation<
  SessionListToolParams,
  ToolResult
> {
  constructor(
    private readonly sessionStorage: SessionStorage,
    params: SessionListToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const parts: string[] = ['List sessions'];
    if (this.params.limit) {
      parts.push(`(limit: ${this.params.limit})`);
    }
    if (this.params.from_date) {
      parts.push(`from ${this.params.from_date}`);
    }
    if (this.params.to_date) {
      parts.push(`to ${this.params.to_date}`);
    }
    return parts.join(' ');
  }

  async execute(): Promise<ToolResult> {
    try {
      const filter: SessionFilter = {};

      if (this.params.limit !== undefined) {
        filter.limit = this.params.limit;
      }
      if (this.params.from_date) {
        filter.fromDate = this.params.from_date;
      }
      if (this.params.to_date) {
        filter.toDate = this.params.to_date;
      }
      if (this.params.project_path) {
        filter.projectPath = this.params.project_path;
      }

      const sessions = await this.sessionStorage.listSessions(filter);

      if (sessions.length === 0) {
        const noSessionsMsg =
          'No sessions found matching the specified criteria.';
        return {
          llmContent: noSessionsMsg,
          returnDisplay: noSessionsMsg,
        };
      }

      const tableOutput = formatSessionListTable(sessions);

      return {
        llmContent: tableOutput,
        returnDisplay: `Found ${sessions.length} session${sessions.length === 1 ? '' : 's'}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error listing sessions: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
        },
      };
    }
  }
}

/**
 * Tool for listing available sessions with optional filtering.
 */
export class SessionListTool extends BaseDeclarativeTool<
  SessionListToolParams,
  ToolResult
> {
  static readonly Name = SESSION_LIST_TOOL_NAME;

  constructor(
    private readonly _config: Config,
    private readonly sessionStorage: SessionStorage,
    messageBus: MessageBus,
  ) {
    super(
      SessionListTool.Name,
      'SessionList',
      'Lists all available sessions with optional filtering by date range, project, or limit. Returns a table with Session ID, message count, date range, and summary.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of sessions to return.',
          },
          from_date: {
            type: 'string',
            description:
              'Filter sessions from this date (ISO 8601 format, e.g., "2025-01-01").',
          },
          to_date: {
            type: 'string',
            description:
              'Filter sessions until this date (ISO 8601 format, e.g., "2025-01-31").',
          },
          project_path: {
            type: 'string',
            description: 'Filter sessions by project path.',
          },
        },
        required: [],
      },
      messageBus,
      true,
      false,
    );
  }

  protected override validateToolParamValues(
    params: SessionListToolParams,
  ): string | null {
    if (
      params.limit !== undefined &&
      (params.limit < 1 || !Number.isInteger(params.limit))
    ) {
      return 'Limit must be a positive integer.';
    }

    if (params.from_date) {
      const fromDate = new Date(params.from_date);
      if (isNaN(fromDate.getTime())) {
        return `Invalid from_date format: "${params.from_date}". Use ISO 8601 format (e.g., "2025-01-01").`;
      }
    }

    if (params.to_date) {
      const toDate = new Date(params.to_date);
      if (isNaN(toDate.getTime())) {
        return `Invalid to_date format: "${params.to_date}". Use ISO 8601 format (e.g., "2025-01-31").`;
      }
    }

    if (params.from_date && params.to_date) {
      const fromDate = new Date(params.from_date);
      const toDate = new Date(params.to_date);
      if (fromDate > toDate) {
        return 'from_date must be before or equal to to_date.';
      }
    }

    return null;
  }

  protected createInvocation(
    params: SessionListToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<SessionListToolParams, ToolResult> {
    return new SessionListToolInvocation(
      this.sessionStorage,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
