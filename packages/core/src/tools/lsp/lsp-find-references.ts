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
import { LSP_FIND_REFERENCES_TOOL_NAME } from '../tool-names.js';
import { getLSPServerManager } from './manager.js';
import {
  formatLocation,
  toZeroBasedLine,
  getFileExtension,
} from './utils.js';
import { isExtensionSupported, getSupportedLanguagesDescription } from './servers.js';

/**
 * Parameters for the LSP find references tool.
 */
export interface LspFindReferencesParams {
  /** The path to the file. */
  filePath: string;
  /** The line number (1-based). */
  line: number;
  /** The character offset (0-based). */
  character: number;
  /** Whether to include the declaration in the results (default: true). */
  includeDeclaration?: boolean;
}

/**
 * Tool invocation for LSP find references.
 */
class LspFindReferencesInvocation extends BaseToolInvocation<
  LspFindReferencesParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: LspFindReferencesParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    return `Find references at ${this.params.filePath}:${this.params.line}:${this.params.character}`;
  }

  async execute(): Promise<ToolResult> {
    const { filePath, line, character, includeDeclaration = true } = this.params;
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
      const locations = await client.references(
        resolvedPath,
        zeroBasedLine,
        character,
        includeDeclaration,
      );

      if (locations.length === 0) {
        return {
          llmContent: `No references found at ${filePath}:${line}:${character}`,
          returnDisplay: 'No references found',
        };
      }

      const rootDir = this.config.getTargetDir();
      const formattedLocations = locations.map((loc) =>
        formatLocation(loc, rootDir)
      );

      // Group by file for better readability
      const byFile = new Map<string, string[]>();
      for (const loc of formattedLocations) {
        const [file, ...rest] = loc.split(':');
        const position = rest.join(':');
        if (!byFile.has(file)) {
          byFile.set(file, []);
        }
        byFile.get(file)!.push(position);
      }

      let llmContent = `Found ${locations.length} reference${locations.length === 1 ? '' : 's'}:\n`;
      for (const [file, positions] of byFile) {
        llmContent += `\n${file}:\n`;
        for (const pos of positions) {
          llmContent += `  - Line ${pos}\n`;
        }
      }

      return {
        llmContent,
        returnDisplay: formattedLocations.join('\n'),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error finding references: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
        },
      };
    }
  }
}

/**
 * LSP find references tool.
 * Finds all references to a symbol.
 */
export class LspFindReferencesTool extends BaseDeclarativeTool<
  LspFindReferencesParams,
  ToolResult
> {
  static readonly Name = LSP_FIND_REFERENCES_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LspFindReferencesTool.Name,
      'LSP Find References',
      `Find all references to a symbol at a specific location in a file. ` +
      `Uses the Language Server Protocol (LSP) to find all usages of a symbol across the workspace. ` +
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
          includeDeclaration: {
            type: 'boolean',
            description: 'Whether to include the declaration in the results. Defaults to true.',
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
    params: LspFindReferencesParams,
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
    params: LspFindReferencesParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ): ToolInvocation<LspFindReferencesParams, ToolResult> {
    return new LspFindReferencesInvocation(
      this.config,
      params,
      messageBus,
      toolName,
      toolDisplayName,
    );
  }
}
