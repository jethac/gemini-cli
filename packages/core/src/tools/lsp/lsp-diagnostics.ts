/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { Config } from '../../config/config.js';
import type { ToolInvocation, ToolResult } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import { LSP_DIAGNOSTICS_TOOL_NAME } from '../tool-names.js';
import { getLSPServerManager } from './manager.js';
import {
  formatDiagnostic,
  getFileExtension,
  getSeverityName,
} from './utils.js';
import { isExtensionSupported, getSupportedLanguagesDescription } from './servers.js';
import { DiagnosticSeverity } from './types.js';

/**
 * Severity filter type.
 */
export type SeverityFilter = 'error' | 'warning' | 'information' | 'hint' | 'all';

/**
 * Parameters for the LSP diagnostics tool.
 */
export interface LspDiagnosticsParams {
  /** The path to the file. */
  filePath: string;
  /** Filter by severity (default: 'all'). */
  severity?: SeverityFilter;
}

/**
 * Tool invocation for LSP diagnostics.
 */
class LspDiagnosticsInvocation extends BaseToolInvocation<
  LspDiagnosticsParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: LspDiagnosticsParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    const severity = this.params.severity || 'all';
    return `Get ${severity} diagnostics for ${this.params.filePath}`;
  }

  async execute(): Promise<ToolResult> {
    const { filePath, severity = 'all' } = this.params;
    const resolvedPath = path.resolve(this.config.getTargetDir(), filePath);

    try {
      const manager = getLSPServerManager();
      const client = await manager.getClientForFile(resolvedPath);

      if (!client) {
        const ext = getFileExtension(resolvedPath);
        return {
          llmContent: `No language server available for file extension '${ext}'. ` +
            `Supported languages: ${getSupportedLanguagesDescription()}. ` +
            `Make sure the appropriate language server is installed.`,
          returnDisplay: `No language server for ${ext}`,
        };
      }

      let diagnostics = await client.diagnostics(resolvedPath);

      // Filter by severity if specified
      if (severity !== 'all') {
        const severityValue = this.getSeverityValue(severity);
        if (severityValue !== null) {
          diagnostics = diagnostics.filter((d) => d.severity === severityValue);
        }
      }

      if (diagnostics.length === 0) {
        const filterMsg = severity !== 'all' ? ` (filtered by ${severity})` : '';
        return {
          llmContent: `No diagnostics found for ${filePath}${filterMsg}`,
          returnDisplay: 'No diagnostics',
        };
      }

      // Sort by severity (errors first) then by line
      diagnostics.sort((a, b) => {
        const severityDiff = (a.severity || 4) - (b.severity || 4);
        if (severityDiff !== 0) return severityDiff;
        return a.range.start.line - b.range.start.line;
      });

      const rootDir = this.config.getTargetDir();
      const formattedDiagnostics = diagnostics.map((d) =>
        formatDiagnostic(d, resolvedPath, rootDir)
      );

      // Count by severity
      const counts = {
        error: 0,
        warning: 0,
        information: 0,
        hint: 0,
      };
      for (const d of diagnostics) {
        const name = getSeverityName(d.severity) as keyof typeof counts;
        if (name in counts) {
          counts[name]++;
        }
      }

      const summary = Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([name, count]) => `${count} ${name}${count > 1 ? 's' : ''}`)
        .join(', ');

      const llmContent = `Found ${diagnostics.length} diagnostic${diagnostics.length === 1 ? '' : 's'} (${summary}):\n\n${formattedDiagnostics.join('\n')}`;

      return {
        llmContent,
        returnDisplay: formattedDiagnostics.join('\n'),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error getting diagnostics: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
        },
      };
    }
  }

  private getSeverityValue(severity: SeverityFilter): DiagnosticSeverity | null {
    switch (severity) {
      case 'error':
        return DiagnosticSeverity.Error;
      case 'warning':
        return DiagnosticSeverity.Warning;
      case 'information':
        return DiagnosticSeverity.Information;
      case 'hint':
        return DiagnosticSeverity.Hint;
      default:
        return null;
    }
  }
}

/**
 * LSP diagnostics tool.
 * Gets errors, warnings, and other diagnostics from the language server.
 */
export class LspDiagnosticsTool extends BaseDeclarativeTool<
  LspDiagnosticsParams,
  ToolResult
> {
  static readonly Name = LSP_DIAGNOSTICS_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LspDiagnosticsTool.Name,
      'LSP Diagnostics',
      `Get diagnostics (errors, warnings, hints) for a file from the language server. ` +
      `Uses the Language Server Protocol (LSP) to provide accurate code analysis. ` +
      `Requires a compatible language server to be installed. ` +
      `Supported languages: ${getSupportedLanguagesDescription()}.`,
      Kind.Read,
      {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'The path to the file to analyze.',
          },
          severity: {
            type: 'string',
            enum: ['error', 'warning', 'information', 'hint', 'all'],
            description: "Filter diagnostics by severity. Defaults to 'all'.",
          },
        },
        required: ['filePath'],
      },
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected override validateToolParamValues(
    params: LspDiagnosticsParams,
  ): string | null {
    if (!params.filePath || params.filePath.trim() === '') {
      return "The 'filePath' parameter must be non-empty.";
    }

    if (
      params.severity &&
      !['error', 'warning', 'information', 'hint', 'all'].includes(params.severity)
    ) {
      return "The 'severity' parameter must be one of: 'error', 'warning', 'information', 'hint', 'all'.";
    }

    const resolvedPath = path.resolve(this.config.getTargetDir(), params.filePath);
    const ext = getFileExtension(resolvedPath);

    if (!isExtensionSupported(ext)) {
      return `File extension '${ext}' is not supported. Supported languages: ${getSupportedLanguagesDescription()}.`;
    }

    return null;
  }

  protected createInvocation(
    params: LspDiagnosticsParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ): ToolInvocation<LspDiagnosticsParams, ToolResult> {
    return new LspDiagnosticsInvocation(
      this.config,
      params,
      messageBus,
      toolName,
      toolDisplayName,
    );
  }
}
