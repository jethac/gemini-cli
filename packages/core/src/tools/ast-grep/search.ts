/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { Config } from '../../config/config.js';
import type { ToolInvocation, ToolResult } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import { AST_GREP_SEARCH_TOOL_NAME } from '../tool-names.js';
import { ToolErrorType } from '../tool-error.js';
import { AST_GREP_LANGUAGES } from './constants.js';
import type { AstGrepLanguage } from './constants.js';
import { runSg } from './cli.js';
import type { SgMatch } from './cli.js';
import path from 'node:path';

/**
 * Parameters for the AstGrepSearchTool
 */
export interface AstGrepSearchToolParams {
  /** The AST pattern to search for */
  pattern: string;
  /** The language to parse */
  lang: AstGrepLanguage;
  /** Paths to search in (optional) */
  paths?: string[];
  /** Glob patterns to filter files (optional) */
  globs?: string[];
  /** Number of context lines to include (optional) */
  context?: number;
}

class AstGrepSearchToolInvocation extends BaseToolInvocation<
  AstGrepSearchToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: AstGrepSearchToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    let description = `AST pattern '${this.params.pattern}' in ${this.params.lang}`;
    if (this.params.globs && this.params.globs.length > 0) {
      description += ` (files: ${this.params.globs.join(', ')})`;
    }
    if (this.params.paths && this.params.paths.length > 0) {
      description += ` in ${this.params.paths.join(', ')}`;
    }
    return description;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const result = await runSg({
        pattern: this.params.pattern,
        lang: this.params.lang,
        paths: this.params.paths,
        globs: this.params.globs,
        context: this.params.context,
        cwd: this.config.getTargetDir(),
      });

      if (result.binaryNotFound) {
        return {
          llmContent: result.error || 'ast-grep binary not found',
          returnDisplay: 'ast-grep not installed',
          error: {
            message: result.error || 'ast-grep binary not found',
            type: ToolErrorType.AST_GREP_BINARY_NOT_FOUND,
          },
        };
      }

      if (!result.success) {
        return {
          llmContent: `Error searching with ast-grep: ${result.error}`,
          returnDisplay: `Error: ${result.error}`,
          error: {
            message: result.error || 'Unknown error',
            type: ToolErrorType.AST_GREP_EXECUTION_ERROR,
          },
        };
      }

      if (result.matches.length === 0) {
        const noMatchMsg = `No matches found for AST pattern "${this.params.pattern}" in ${this.params.lang} files.`;
        return {
          llmContent: noMatchMsg,
          returnDisplay: 'No matches found',
        };
      }

      const llmContent = this.formatMatches(result.matches, result.truncated);
      const matchCount = result.matches.length;
      const matchTerm = matchCount === 1 ? 'match' : 'matches';

      return {
        llmContent,
        returnDisplay: `Found ${matchCount} ${matchTerm}${result.truncated ? ' (truncated)' : ''}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error during ast-grep search: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.AST_GREP_EXECUTION_ERROR,
        },
      };
    }
  }

  private formatMatches(matches: SgMatch[], truncated?: boolean): string {
    const matchCount = matches.length;
    const matchTerm = matchCount === 1 ? 'match' : 'matches';

    let content = `Found ${matchCount} ${matchTerm} for AST pattern "${this.params.pattern}" in ${this.params.lang} files`;
    if (truncated) {
      content += ' (output truncated)';
    }
    content += ':\n---\n';

    // Group matches by file
    const matchesByFile = new Map<string, SgMatch[]>();
    for (const match of matches) {
      const filePath = match.file;
      if (!matchesByFile.has(filePath)) {
        matchesByFile.set(filePath, []);
      }
      matchesByFile.get(filePath)!.push(match);
    }

    // Format each file's matches
    for (const [filePath, fileMatches] of matchesByFile) {
      // Make path relative to target dir
      const relativePath = path.isAbsolute(filePath)
        ? path.relative(this.config.getTargetDir(), filePath)
        : filePath;

      content += `File: ${relativePath}\n`;

      // Sort matches by line number
      fileMatches.sort((a, b) => a.range.start.line - b.range.start.line);

      for (const match of fileMatches) {
        const line = match.range.start.line;
        const col = match.range.start.column;
        const matchedCode = match.lines.trim();
        content += `L${line}:${col}: ${matchedCode}\n`;
      }
      content += '---\n';
    }

    return content.trim();
  }
}

/**
 * AST-aware code search tool using ast-grep.
 */
export class AstGrepSearchTool extends BaseDeclarativeTool<
  AstGrepSearchToolParams,
  ToolResult
> {
  static readonly Name = AST_GREP_SEARCH_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      AstGrepSearchTool.Name,
      'AstSearch',
      `Search code patterns using AST-aware matching with ast-grep. Supports 25 languages. Use meta-variables: $VAR (single node), $$$ (multiple nodes). IMPORTANT: Patterns must be complete AST nodes (valid code). Examples: 'console.log($MSG)', 'def $FUNC($$$):', 'async function $NAME($$$) { $$$ }'`,
      Kind.Search,
      {
        properties: {
          pattern: {
            description:
              'The AST pattern to search for. Use $VAR for single node meta-variables and $$$ for multiple nodes. Must be valid code in the target language.',
            type: 'string',
          },
          lang: {
            description: 'The programming language to parse.',
            type: 'string',
            enum: AST_GREP_LANGUAGES,
          },
          paths: {
            description:
              'Optional: Paths to search in (relative to project root). Defaults to current directory.',
            type: 'array',
            items: { type: 'string' },
          },
          globs: {
            description:
              'Optional: Glob patterns to filter which files are searched (e.g., "*.ts", "src/**/*.js").',
            type: 'array',
            items: { type: 'string' },
          },
          context: {
            description:
              'Optional: Number of context lines to include around matches.',
            type: 'number',
          },
        },
        required: ['pattern', 'lang'],
        type: 'object',
      },
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected override validateToolParamValues(
    params: AstGrepSearchToolParams,
  ): string | null {
    // Validate language
    if (!AST_GREP_LANGUAGES.includes(params.lang)) {
      return `Invalid language "${params.lang}". Supported languages: ${AST_GREP_LANGUAGES.join(', ')}`;
    }

    // Validate pattern is not empty
    if (!params.pattern || params.pattern.trim() === '') {
      return 'Pattern cannot be empty';
    }

    // Validate context is non-negative if provided
    if (params.context !== undefined && params.context < 0) {
      return 'Context must be a non-negative number';
    }

    return null;
  }

  protected createInvocation(
    params: AstGrepSearchToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<AstGrepSearchToolParams, ToolResult> {
    return new AstGrepSearchToolInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
