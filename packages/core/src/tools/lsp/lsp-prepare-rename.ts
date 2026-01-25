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
import { LSP_PREPARE_RENAME_TOOL_NAME } from '../tool-names.js';
import { getLSPServerManager } from './manager.js';
import {
  formatRange,
  toZeroBasedLine,
  getFileExtension,
} from './utils.js';
import { isExtensionSupported, getSupportedLanguagesDescription } from './servers.js';

/**
 * Parameters for the LSP prepare rename tool.
 */
export interface LspPrepareRenameParams {
  /** The path to the file. */
  filePath: string;
  /** The line number (1-based). */
  line: number;
  /** The character offset (0-based). */
  character: number;
}

/**
 * Tool invocation for LSP prepare rename.
 */
class LspPrepareRenameInvocation extends BaseToolInvocation<
  LspPrepareRenameParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: LspPrepareRenameParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    return `Check if rename is valid at ${this.params.filePath}:${this.params.line}:${this.params.character}`;
  }

  async execute(): Promise<ToolResult> {
    const { filePath, line, character } = this.params;
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

      // Convert 1-based line to 0-based for LSP
      const zeroBasedLine = toZeroBasedLine(line);
      const range = await client.prepareRename(resolvedPath, zeroBasedLine, character);

      if (!range) {
        return {
          llmContent: `Cannot rename symbol at ${filePath}:${line}:${character}. ` +
            `The symbol may not be renameable, or the position may not be on a valid symbol.`,
          returnDisplay: 'Rename not available at this position',
        };
      }

      const formattedRange = formatRange(range);
      const llmContent = `Rename is valid at ${filePath}:${line}:${character}.\n` +
        `Symbol range: ${formattedRange}\n` +
        `You can proceed with lsp_rename to rename this symbol.`;

      return {
        llmContent,
        returnDisplay: `Rename valid, symbol at ${formattedRange}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error checking rename: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
        },
      };
    }
  }
}

/**
 * LSP prepare rename tool.
 * Checks if a rename operation is valid at a given position.
 */
export class LspPrepareRenameTool extends BaseDeclarativeTool<
  LspPrepareRenameParams,
  ToolResult
> {
  static readonly Name = LSP_PREPARE_RENAME_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LspPrepareRenameTool.Name,
      'LSP Prepare Rename',
      `Check if a rename operation is valid at a specific location. ` +
      `Use this before lsp_rename to verify that the symbol can be renamed. ` +
      `Returns the range of the symbol that would be renamed. ` +
      `Requires a compatible language server to be installed. ` +
      `Supported languages: ${getSupportedLanguagesDescription()}.`,
      Kind.Read,
      {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'The path to the file containing the symbol.',
          },
          line: {
            type: 'number',
            description: 'The line number (1-based) where the symbol is located.',
          },
          character: {
            type: 'number',
            description: 'The character offset (0-based) on the line where the symbol is located.',
          },
        },
        required: ['filePath', 'line', 'character'],
      },
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected override validateToolParamValues(
    params: LspPrepareRenameParams,
  ): string | null {
    if (!params.filePath || params.filePath.trim() === '') {
      return "The 'filePath' parameter must be non-empty.";
    }

    if (typeof params.line !== 'number' || params.line < 1) {
      return "The 'line' parameter must be a positive number (1-based).";
    }

    if (typeof params.character !== 'number' || params.character < 0) {
      return "The 'character' parameter must be a non-negative number (0-based).";
    }

    const resolvedPath = path.resolve(this.config.getTargetDir(), params.filePath);
    const ext = getFileExtension(resolvedPath);

    if (!isExtensionSupported(ext)) {
      return `File extension '${ext}' is not supported. Supported languages: ${getSupportedLanguagesDescription()}.`;
    }

    return null;
  }

  protected createInvocation(
    params: LspPrepareRenameParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ): ToolInvocation<LspPrepareRenameParams, ToolResult> {
    return new LspPrepareRenameInvocation(
      this.config,
      params,
      messageBus,
      toolName,
      toolDisplayName,
    );
  }
}
