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
import { LSP_SYMBOLS_TOOL_NAME } from '../tool-names.js';
import { getLSPServerManager } from './manager.js';
import {
  formatDocumentSymbol,
  formatSymbolInformation,
  getFileExtension,
  flattenDocumentSymbols,
} from './utils.js';
import { pathToFileURL } from './utils.js';
import { isExtensionSupported, getSupportedLanguagesDescription } from './servers.js';

/**
 * Scope type for symbol search.
 */
export type SymbolScope = 'document' | 'workspace';

/**
 * Parameters for the LSP symbols tool.
 */
export interface LspSymbolsParams {
  /** The path to the file (required for document scope, used for server selection in workspace scope). */
  filePath: string;
  /** The scope of the symbol search. */
  scope: SymbolScope;
  /** Optional query to filter symbols (only for workspace scope). */
  query?: string;
}

/**
 * Tool invocation for LSP symbols.
 */
class LspSymbolsInvocation extends BaseToolInvocation<
  LspSymbolsParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: LspSymbolsParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    const { scope, filePath, query } = this.params;
    if (scope === 'document') {
      return `Get symbols from ${filePath}`;
    }
    return query
      ? `Search workspace symbols matching '${query}'`
      : 'Get all workspace symbols';
  }

  async execute(): Promise<ToolResult> {
    const { filePath, scope, query } = this.params;
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

      const rootDir = this.config.getTargetDir();

      if (scope === 'document') {
        const symbols = await client.documentSymbols(resolvedPath);

        if (symbols.length === 0) {
          return {
            llmContent: `No symbols found in ${filePath}`,
            returnDisplay: 'No symbols found',
          };
        }

        const formattedSymbols = symbols.map((s) => formatDocumentSymbol(s));
        const llmContent = `Found ${this.countSymbols(symbols)} symbol${this.countSymbols(symbols) === 1 ? '' : 's'} in ${filePath}:\n\n${formattedSymbols.join('\n')}`;

        return {
          llmContent,
          returnDisplay: formattedSymbols.join('\n'),
        };
      } else {
        // Workspace scope
        const symbols = await client.workspaceSymbols(query || '');

        if (symbols.length === 0) {
          const queryMsg = query ? ` matching '${query}'` : '';
          return {
            llmContent: `No workspace symbols found${queryMsg}`,
            returnDisplay: 'No symbols found',
          };
        }

        const formattedSymbols = symbols.map((s) =>
          formatSymbolInformation(s, rootDir)
        );

        const queryMsg = query ? ` matching '${query}'` : '';
        const llmContent = `Found ${symbols.length} workspace symbol${symbols.length === 1 ? '' : 's'}${queryMsg}:\n\n${formattedSymbols.join('\n')}`;

        return {
          llmContent,
          returnDisplay: formattedSymbols.join('\n'),
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error getting symbols: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
        },
      };
    }
  }

  private countSymbols(symbols: Array<{ children?: unknown[] }>): number {
    let count = symbols.length;
    for (const symbol of symbols) {
      if (symbol.children && Array.isArray(symbol.children)) {
        count += this.countSymbols(symbol.children as Array<{ children?: unknown[] }>);
      }
    }
    return count;
  }
}

/**
 * LSP symbols tool.
 * Gets symbols from a document or searches workspace symbols.
 */
export class LspSymbolsTool extends BaseDeclarativeTool<
  LspSymbolsParams,
  ToolResult
> {
  static readonly Name = LSP_SYMBOLS_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LspSymbolsTool.Name,
      'LSP Symbols',
      `Get symbols (functions, classes, variables, etc.) from a document or search across the workspace. ` +
      `Uses the Language Server Protocol (LSP) to provide accurate symbol information. ` +
      `Use scope='document' to get all symbols in a file (outline view). ` +
      `Use scope='workspace' with an optional query to search for symbols across the project. ` +
      `Requires a compatible language server to be installed. ` +
      `Supported languages: ${getSupportedLanguagesDescription()}.`,
      Kind.Read,
      {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'The path to the file. Required for document scope, used for server selection in workspace scope.',
          },
          scope: {
            type: 'string',
            enum: ['document', 'workspace'],
            description: "The scope of the symbol search. 'document' for file outline, 'workspace' for project-wide search.",
          },
          query: {
            type: 'string',
            description: 'Optional query to filter symbols (only used for workspace scope).',
          },
        },
        required: ['filePath', 'scope'],
      },
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected override validateToolParamValues(
    params: LspSymbolsParams,
  ): string | null {
    if (!params.filePath || params.filePath.trim() === '') {
      return "The 'filePath' parameter must be non-empty.";
    }

    if (!['document', 'workspace'].includes(params.scope)) {
      return "The 'scope' parameter must be either 'document' or 'workspace'.";
    }

    const resolvedPath = path.resolve(this.config.getTargetDir(), params.filePath);
    const ext = getFileExtension(resolvedPath);

    if (!isExtensionSupported(ext)) {
      return `File extension '${ext}' is not supported. Supported languages: ${getSupportedLanguagesDescription()}.`;
    }

    return null;
  }

  protected createInvocation(
    params: LspSymbolsParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ): ToolInvocation<LspSymbolsParams, ToolResult> {
    return new LspSymbolsInvocation(
      this.config,
      params,
      messageBus,
      toolName,
      toolDisplayName,
    );
  }
}
