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
import { LSP_GOTO_DEFINITION_TOOL_NAME } from '../tool-names.js';
import { getLSPServerManager } from './manager.js';
import {
  formatLocation,
  toZeroBasedLine,
  getFileExtension,
} from './utils.js';
import { isExtensionSupported, getSupportedLanguagesDescription } from './servers.js';

/**
 * Parameters for the LSP goto definition tool.
 */
export interface LspGotoDefinitionParams {
  /** The path to the file. */
  filePath: string;
  /** The line number (1-based). */
  line: number;
  /** The character offset (0-based). */
  character: number;
}

/**
 * Tool invocation for LSP goto definition.
 */
class LspGotoDefinitionInvocation extends BaseToolInvocation<
  LspGotoDefinitionParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: LspGotoDefinitionParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    return `Go to definition at ${this.params.filePath}:${this.params.line}:${this.params.character}`;
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
      const locations = await client.definition(resolvedPath, zeroBasedLine, character);

      if (locations.length === 0) {
        return {
          llmContent: `No definition found at ${filePath}:${line}:${character}`,
          returnDisplay: 'No definition found',
        };
      }

      const rootDir = this.config.getTargetDir();
      const formattedLocations = locations.map((loc) =>
        formatLocation(loc, rootDir)
      );

      const llmContent = locations.length === 1
        ? `Definition found at: ${formattedLocations[0]}`
        : `Found ${locations.length} definitions:\n${formattedLocations.map((l) => `  - ${l}`).join('\n')}`;

      return {
        llmContent,
        returnDisplay: formattedLocations.join('\n'),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error finding definition: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
        },
      };
    }
  }
}

/**
 * LSP goto definition tool.
 * Finds where a symbol is defined.
 */
export class LspGotoDefinitionTool extends BaseDeclarativeTool<
  LspGotoDefinitionParams,
  ToolResult
> {
  static readonly Name = LSP_GOTO_DEFINITION_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LspGotoDefinitionTool.Name,
      'LSP Go to Definition',
      `Jump to the definition of a symbol at a specific location in a file. ` +
      `Uses the Language Server Protocol (LSP) to provide accurate code navigation. ` +
      `Requires a compatible language server to be installed (e.g., typescript-language-server for TypeScript/JavaScript, pyright for Python). ` +
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
    params: LspGotoDefinitionParams,
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
    params: LspGotoDefinitionParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ): ToolInvocation<LspGotoDefinitionParams, ToolResult> {
    return new LspGotoDefinitionInvocation(
      this.config,
      params,
      messageBus,
      toolName,
      toolDisplayName,
    );
  }
}
