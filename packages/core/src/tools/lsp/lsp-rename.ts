/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { Config } from '../../config/config.js';
import type {
  ToolInvocation,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolInfoConfirmationDetails,
} from '../tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolConfirmationOutcome,
} from '../tools.js';
import { LSP_RENAME_TOOL_NAME } from '../tool-names.js';
import { getLSPServerManager } from './manager.js';
import {
  toZeroBasedLine,
  getFileExtension,
  fileURLToFilePath,
  formatRange,
} from './utils.js';
import { isExtensionSupported, getSupportedLanguagesDescription } from './servers.js';
import type { WorkspaceEdit, TextEdit, TextDocumentEdit } from './types.js';

/**
 * Parameters for the LSP rename tool.
 */
export interface LspRenameParams {
  /** The path to the file. */
  filePath: string;
  /** The line number (1-based). */
  line: number;
  /** The character offset (0-based). */
  character: number;
  /** The new name for the symbol. */
  newName: string;
}

/**
 * Tool invocation for LSP rename.
 */
class LspRenameInvocation extends BaseToolInvocation<
  LspRenameParams,
  ToolResult
> {
  private workspaceEdit: WorkspaceEdit | null = null;
  private editSummary: string = '';

  constructor(
    private readonly config: Config,
    params: LspRenameParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    return `Rename symbol at ${this.params.filePath}:${this.params.line}:${this.params.character} to '${this.params.newName}'`;
  }

  protected override async getConfirmationDetails(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // First, compute the workspace edit to show the user what will change
    const { filePath, line, character, newName } = this.params;
    const resolvedPath = path.resolve(this.config.getTargetDir(), filePath);

    try {
      const manager = getLSPServerManager();
      const client = await manager.getClientForFile(resolvedPath);

      if (!client) {
        // No client available, let execute() handle the error
        return false;
      }

      const zeroBasedLine = toZeroBasedLine(line);
      this.workspaceEdit = await client.rename(resolvedPath, zeroBasedLine, character, newName);

      if (!this.workspaceEdit) {
        return false;
      }

      // Build summary of changes
      this.editSummary = this.buildEditSummary(this.workspaceEdit);

      if (!this.editSummary) {
        return false;
      }

      const confirmationDetails: ToolInfoConfirmationDetails = {
        type: 'info',
        title: `Confirm Rename: '${newName}'`,
        prompt: `This rename operation will make the following changes:\n\n${this.editSummary}\n\nDo you want to proceed?`,
        onConfirm: async (outcome: ToolConfirmationOutcome) => {
          await this.publishPolicyUpdate(outcome);
        },
      };

      return confirmationDetails;
    } catch (error) {
      // If we can't compute the edit, let execute() handle it
      return false;
    }
  }

  async execute(): Promise<ToolResult> {
    const { filePath, line, character, newName } = this.params;
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

      // Use cached workspace edit if available (from confirmation), otherwise compute it
      let workspaceEdit = this.workspaceEdit;
      if (!workspaceEdit) {
        const zeroBasedLine = toZeroBasedLine(line);
        workspaceEdit = await client.rename(resolvedPath, zeroBasedLine, character, newName);
      }

      if (!workspaceEdit || this.isEmptyEdit(workspaceEdit)) {
        return {
          llmContent: `No changes needed for renaming symbol at ${filePath}:${line}:${character} to '${newName}'. ` +
            `The symbol may not exist or may not be renameable.`,
          returnDisplay: 'No changes needed',
        };
      }

      // Apply the workspace edit
      const appliedChanges = await this.applyWorkspaceEdit(workspaceEdit);

      const summary = this.editSummary || this.buildEditSummary(workspaceEdit);
      const llmContent = `Successfully renamed symbol to '${newName}'.\n\nChanges applied:\n${summary}`;

      return {
        llmContent,
        returnDisplay: `Renamed to '${newName}'\n${appliedChanges}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error renaming symbol: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
        },
      };
    }
  }

  private isEmptyEdit(edit: WorkspaceEdit): boolean {
    if (edit.changes) {
      for (const edits of Object.values(edit.changes)) {
        if (edits.length > 0) return false;
      }
    }
    if (edit.documentChanges && edit.documentChanges.length > 0) {
      return false;
    }
    return true;
  }

  private buildEditSummary(edit: WorkspaceEdit): string {
    const rootDir = this.config.getTargetDir();
    const lines: string[] = [];
    const fileChanges = new Map<string, number>();

    // Process changes map
    if (edit.changes) {
      for (const [uri, edits] of Object.entries(edit.changes)) {
        const filePath = fileURLToFilePath(uri);
        const relativePath = path.relative(rootDir, filePath);
        fileChanges.set(relativePath, (fileChanges.get(relativePath) || 0) + edits.length);
      }
    }

    // Process documentChanges
    if (edit.documentChanges) {
      for (const change of edit.documentChanges) {
        if ('textDocument' in change) {
          // TextDocumentEdit
          const docEdit = change as TextDocumentEdit;
          const filePath = fileURLToFilePath(docEdit.textDocument.uri);
          const relativePath = path.relative(rootDir, filePath);
          fileChanges.set(
            relativePath,
            (fileChanges.get(relativePath) || 0) + docEdit.edits.length,
          );
        } else if ('kind' in change) {
          // File operation
          if (change.kind === 'create') {
            lines.push(`  Create: ${fileURLToFilePath(change.uri)}`);
          } else if (change.kind === 'rename') {
            lines.push(
              `  Rename: ${fileURLToFilePath(change.oldUri)} -> ${fileURLToFilePath(change.newUri)}`,
            );
          } else if (change.kind === 'delete') {
            lines.push(`  Delete: ${fileURLToFilePath(change.uri)}`);
          }
        }
      }
    }

    // Format file changes
    for (const [file, count] of fileChanges) {
      lines.push(`  ${file}: ${count} edit${count === 1 ? '' : 's'}`);
    }

    return lines.join('\n');
  }

  private async applyWorkspaceEdit(edit: WorkspaceEdit): Promise<string> {
    const fs = await import('node:fs');
    const appliedFiles: string[] = [];
    const rootDir = this.config.getTargetDir();

    // Apply changes from the changes map
    if (edit.changes) {
      for (const [uri, edits] of Object.entries(edit.changes)) {
        const filePath = fileURLToFilePath(uri);
        await this.applyEditsToFile(filePath, edits);
        appliedFiles.push(path.relative(rootDir, filePath));
      }
    }

    // Apply documentChanges
    if (edit.documentChanges) {
      for (const change of edit.documentChanges) {
        if ('textDocument' in change) {
          const docEdit = change as TextDocumentEdit;
          const filePath = fileURLToFilePath(docEdit.textDocument.uri);
          await this.applyEditsToFile(filePath, docEdit.edits);
          appliedFiles.push(path.relative(rootDir, filePath));
        } else if ('kind' in change) {
          // Handle file operations
          if (change.kind === 'create') {
            const filePath = fileURLToFilePath(change.uri);
            await fs.promises.writeFile(filePath, '', 'utf-8');
            appliedFiles.push(`Created: ${path.relative(rootDir, filePath)}`);
          } else if (change.kind === 'rename') {
            const oldPath = fileURLToFilePath(change.oldUri);
            const newPath = fileURLToFilePath(change.newUri);
            await fs.promises.rename(oldPath, newPath);
            appliedFiles.push(
              `Renamed: ${path.relative(rootDir, oldPath)} -> ${path.relative(rootDir, newPath)}`,
            );
          } else if (change.kind === 'delete') {
            const filePath = fileURLToFilePath(change.uri);
            await fs.promises.unlink(filePath);
            appliedFiles.push(`Deleted: ${path.relative(rootDir, filePath)}`);
          }
        }
      }
    }

    return appliedFiles.join('\n');
  }

  private async applyEditsToFile(filePath: string, edits: TextEdit[]): Promise<void> {
    const fs = await import('node:fs');

    // Read the file
    let content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // Sort edits in reverse order (bottom to top, right to left)
    // This ensures earlier edits don't affect the positions of later edits
    const sortedEdits = [...edits].sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return b.range.start.line - a.range.start.line;
      }
      return b.range.start.character - a.range.start.character;
    });

    // Apply each edit
    for (const edit of sortedEdits) {
      const { range, newText } = edit;
      const startLine = range.start.line;
      const endLine = range.end.line;
      const startChar = range.start.character;
      const endChar = range.end.character;

      if (startLine === endLine) {
        // Single line edit
        const line = lines[startLine] || '';
        lines[startLine] =
          line.substring(0, startChar) + newText + line.substring(endChar);
      } else {
        // Multi-line edit
        const startLineContent = lines[startLine] || '';
        const endLineContent = lines[endLine] || '';
        const newContent =
          startLineContent.substring(0, startChar) +
          newText +
          endLineContent.substring(endChar);

        // Replace the affected lines
        lines.splice(startLine, endLine - startLine + 1, newContent);
      }
    }

    // Write the file back
    content = lines.join('\n');
    await fs.promises.writeFile(filePath, content, 'utf-8');
  }
}

/**
 * LSP rename tool.
 * Renames a symbol across the workspace.
 * This is a dangerous operation that requires confirmation.
 */
export class LspRenameTool extends BaseDeclarativeTool<
  LspRenameParams,
  ToolResult
> {
  static readonly Name = LSP_RENAME_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LspRenameTool.Name,
      'LSP Rename',
      `Rename a symbol across the entire workspace. ` +
      `This is a powerful refactoring operation that will update all references to the symbol. ` +
      `WARNING: This operation modifies files and requires confirmation. ` +
      `Use lsp_prepare_rename first to verify the rename is valid. ` +
      `Requires a compatible language server to be installed. ` +
      `Supported languages: ${getSupportedLanguagesDescription()}.`,
      Kind.Edit, // This is an edit operation
      {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'The path to the file containing the symbol to rename.',
          },
          line: {
            type: 'number',
            description: 'The line number (1-based) where the symbol is located.',
          },
          character: {
            type: 'number',
            description: 'The character offset (0-based) on the line where the symbol is located.',
          },
          newName: {
            type: 'string',
            description: 'The new name for the symbol.',
          },
        },
        required: ['filePath', 'line', 'character', 'newName'],
      },
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected override validateToolParamValues(
    params: LspRenameParams,
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

    if (!params.newName || params.newName.trim() === '') {
      return "The 'newName' parameter must be non-empty.";
    }

    // Basic validation for identifier names
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(params.newName)) {
      return `The 'newName' parameter '${params.newName}' is not a valid identifier. ` +
        `It must start with a letter, underscore, or dollar sign, and contain only alphanumeric characters, underscores, or dollar signs.`;
    }

    const resolvedPath = path.resolve(this.config.getTargetDir(), params.filePath);
    const ext = getFileExtension(resolvedPath);

    if (!isExtensionSupported(ext)) {
      return `File extension '${ext}' is not supported. Supported languages: ${getSupportedLanguagesDescription()}.`;
    }

    return null;
  }

  protected createInvocation(
    params: LspRenameParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ): ToolInvocation<LspRenameParams, ToolResult> {
    return new LspRenameInvocation(
      this.config,
      params,
      messageBus,
      toolName,
      toolDisplayName,
    );
  }
}
