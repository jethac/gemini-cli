/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { Config } from '../../config/config.js';
import type { ToolInvocation, ToolResult } from '../tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '../tools.js';
import { AST_GREP_REPLACE_TOOL_NAME } from '../tool-names.js';
import { ToolErrorType } from '../tool-error.js';
import { AST_GREP_LANGUAGES } from './constants.js';
import type { AstGrepLanguage } from './constants.js';
import { runSg } from './cli.js';
import type { SgMatch } from './cli.js';
import path from 'node:path';

/**
 * Parameters for the AstGrepReplaceTool
 */
export interface AstGrepReplaceToolParams {
  /** The AST pattern to search for */
  pattern: string;
  /** The replacement pattern */
  rewrite: string;
  /** The language to parse */
  lang: AstGrepLanguage;
  /** Paths to search in (optional) */
  paths?: string[];
  /** Glob patterns to filter files (optional) */
  globs?: string[];
  /** Whether to perform a dry run (default: true for safety) */
  dryRun?: boolean;
}

class AstGrepReplaceToolInvocation extends BaseToolInvocation<
  AstGrepReplaceToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: AstGrepReplaceToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const isDryRun = this.params.dryRun !== false;
    const mode = isDryRun ? '[DRY RUN] ' : '';
    let description = `${mode}Replace AST pattern '${this.params.pattern}' with '${this.params.rewrite}' in ${this.params.lang}`;
    if (this.params.globs && this.params.globs.length > 0) {
      description += ` (files: ${this.params.globs.join(', ')})`;
    }
    if (this.params.paths && this.params.paths.length > 0) {
      description += ` in ${this.params.paths.join(', ')}`;
    }
    return description;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    // SAFETY: Default to dry run unless explicitly set to false
    const isDryRun = this.params.dryRun !== false;

    try {
      const result = await runSg({
        pattern: this.params.pattern,
        lang: this.params.lang,
        rewrite: this.params.rewrite,
        paths: this.params.paths,
        globs: this.params.globs,
        updateAll: !isDryRun, // Only apply changes if NOT dry run
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
          llmContent: `Error replacing with ast-grep: ${result.error}`,
          returnDisplay: `Error: ${result.error}`,
          error: {
            message: result.error || 'Unknown error',
            type: ToolErrorType.AST_GREP_EXECUTION_ERROR,
          },
        };
      }

      if (result.matches.length === 0) {
        const noMatchMsg = `No matches found for AST pattern "${this.params.pattern}" in ${this.params.lang} files. No replacements ${isDryRun ? 'would be' : 'were'} made.`;
        return {
          llmContent: noMatchMsg,
          returnDisplay: 'No matches found',
        };
      }

      const llmContent = this.formatReplacements(
        result.matches,
        isDryRun,
        result.truncated,
      );
      const matchCount = result.matches.length;
      const matchTerm = matchCount === 1 ? 'replacement' : 'replacements';
      const action = isDryRun ? 'would be made' : 'applied';

      return {
        llmContent,
        returnDisplay: `${matchCount} ${matchTerm} ${action}${result.truncated ? ' (truncated)' : ''}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error during ast-grep replace: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.AST_GREP_EXECUTION_ERROR,
        },
      };
    }
  }

  private formatReplacements(
    matches: SgMatch[],
    isDryRun: boolean,
    truncated?: boolean,
  ): string {
    const matchCount = matches.length;
    const matchTerm = matchCount === 1 ? 'replacement' : 'replacements';
    const action = isDryRun ? 'would be made' : 'applied';

    let content = isDryRun ? '[DRY RUN] ' : '';
    content += `${matchCount} ${matchTerm} ${action} for AST pattern "${this.params.pattern}" -> "${this.params.rewrite}" in ${this.params.lang} files`;
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

    // Format each file's replacements
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
        const originalCode = match.lines.trim();
        const replacementCode =
          match.replacement?.trim() || this.params.rewrite;
        content += `L${line}:${col}:\n`;
        content += `  - ${originalCode}\n`;
        content += `  + ${replacementCode}\n`;
      }
      content += '---\n';
    }

    if (isDryRun) {
      content +=
        '\nThis was a dry run. To apply changes, set dryRun: false explicitly.';
    }

    return content.trim();
  }
}

/**
 * AST-aware code replacement tool using ast-grep.
 * SAFETY: Dry run is the default behavior.
 */
export class AstGrepReplaceTool extends BaseDeclarativeTool<
  AstGrepReplaceToolParams,
  ToolResult
> {
  static readonly Name = AST_GREP_REPLACE_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      AstGrepReplaceTool.Name,
      'AstReplace',
      `Replace code patterns across filesystem with AST-aware rewriting. Dry-run by default for safety. Use meta-variables in rewrite to preserve matched content. Example: pattern='console.log($MSG)' rewrite='logger.info($MSG)'`,
      Kind.Edit,
      {
        properties: {
          pattern: {
            description:
              'The AST pattern to search for. Use $VAR for single node meta-variables and $$$ for multiple nodes.',
            type: 'string',
          },
          rewrite: {
            description:
              'The replacement pattern. Use the same meta-variables from the pattern to preserve matched content.',
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
          dryRun: {
            description:
              'Whether to perform a dry run without making changes. Default is true for safety. Set to false explicitly to apply changes.',
            type: 'boolean',
            default: true,
          },
        },
        required: ['pattern', 'rewrite', 'lang'],
        type: 'object',
      },
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected override validateToolParamValues(
    params: AstGrepReplaceToolParams,
  ): string | null {
    // Validate language
    if (!AST_GREP_LANGUAGES.includes(params.lang)) {
      return `Invalid language "${params.lang}". Supported languages: ${AST_GREP_LANGUAGES.join(', ')}`;
    }

    // Validate pattern is not empty
    if (!params.pattern || params.pattern.trim() === '') {
      return 'Pattern cannot be empty';
    }

    // Validate rewrite is not empty
    if (!params.rewrite || params.rewrite.trim() === '') {
      return 'Rewrite pattern cannot be empty';
    }

    return null;
  }

  protected createInvocation(
    params: AstGrepReplaceToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<AstGrepReplaceToolParams, ToolResult> {
    return new AstGrepReplaceToolInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
