/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AstGrepReplaceToolParams } from './replace.js';
import { AstGrepReplaceTool } from './replace.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import type { Config } from '../../config/config.js';
import { createMockWorkspaceContext } from '../../test-utils/mockWorkspaceContext.js';
import { ToolErrorType } from '../tool-error.js';
import { createMockMessageBus } from '../../test-utils/mock-message-bus.js';
import * as cli from './cli.js';

// Mock the CLI module
vi.mock('./cli.js', () => ({
  runSg: vi.fn(),
}));

describe('AstGrepReplaceTool', () => {
  let tempRootDir: string;
  let astGrepReplaceTool: AstGrepReplaceTool;
  const abortSignal = new AbortController().signal;

  const createMockConfig = (targetDir: string) =>
    ({
      getTargetDir: () => targetDir,
      getWorkspaceContext: () => createMockWorkspaceContext(targetDir),
      getFileExclusions: () => ({
        getGlobExcludes: () => [],
      }),
    }) as unknown as Config;

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ast-grep-replace-test-'),
    );
    astGrepReplaceTool = new AstGrepReplaceTool(
      createMockConfig(tempRootDir),
      createMockMessageBus(),
    );
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempRootDir, { recursive: true, force: true });
  });

  describe('validateToolParams', () => {
    it('should return null for valid params (pattern, rewrite, and lang)', () => {
      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
      };
      expect(astGrepReplaceTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid params with all options', () => {
      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
        paths: ['src'],
        globs: ['*.ts'],
        dryRun: false,
      };
      expect(astGrepReplaceTool.validateToolParams(params)).toBeNull();
    });

    it('should return error if pattern is missing', () => {
      const params = {
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
      } as unknown as AstGrepReplaceToolParams;
      expect(astGrepReplaceTool.validateToolParams(params)).toBe(
        `params must have required property 'pattern'`,
      );
    });

    it('should return error if rewrite is missing', () => {
      const params = {
        pattern: 'console.log($MSG)',
        lang: 'typescript',
      } as unknown as AstGrepReplaceToolParams;
      expect(astGrepReplaceTool.validateToolParams(params)).toBe(
        `params must have required property 'rewrite'`,
      );
    });

    it('should return error if lang is missing', () => {
      const params = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
      } as unknown as AstGrepReplaceToolParams;
      expect(astGrepReplaceTool.validateToolParams(params)).toBe(
        `params must have required property 'lang'`,
      );
    });

    it('should return error for invalid language', () => {
      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'invalid_lang' as AstGrepReplaceToolParams['lang'],
      };
      expect(astGrepReplaceTool.validateToolParams(params)).toContain(
        'must be equal to one of the allowed values',
      );
    });

    it('should return error for empty pattern', () => {
      const params: AstGrepReplaceToolParams = {
        pattern: '   ',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
      };
      expect(astGrepReplaceTool.validateToolParams(params)).toBe(
        'Pattern cannot be empty',
      );
    });

    it('should return error for empty rewrite', () => {
      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: '   ',
        lang: 'typescript',
      };
      expect(astGrepReplaceTool.validateToolParams(params)).toBe(
        'Rewrite pattern cannot be empty',
      );
    });
  });

  describe('execute', () => {
    it('should perform dry run by default', async () => {
      vi.mocked(cli.runSg).mockResolvedValue({
        success: true,
        matches: [
          {
            file: path.join(tempRootDir, 'src', 'app.ts'),
            range: {
              byteOffset: { start: 100, end: 120 },
              start: { line: 5, column: 0 },
              end: { line: 5, column: 20 },
            },
            lines: 'console.log("hello")',
            replacement: 'logger.info("hello")',
          },
        ],
      });

      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
        // dryRun not specified - should default to true
      };
      const invocation = astGrepReplaceTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(cli.runSg).toHaveBeenCalledWith(
        expect.objectContaining({
          updateAll: false, // Should NOT apply changes
        }),
      );
      expect(result.llmContent).toContain('[DRY RUN]');
      expect(result.llmContent).toContain('would be made');
      expect(result.returnDisplay).toContain('would be made');
    });

    it('should apply changes when dryRun is explicitly false', async () => {
      vi.mocked(cli.runSg).mockResolvedValue({
        success: true,
        matches: [
          {
            file: path.join(tempRootDir, 'src', 'app.ts'),
            range: {
              byteOffset: { start: 100, end: 120 },
              start: { line: 5, column: 0 },
              end: { line: 5, column: 20 },
            },
            lines: 'console.log("hello")',
            replacement: 'logger.info("hello")',
          },
        ],
      });

      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
        dryRun: false,
      };
      const invocation = astGrepReplaceTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(cli.runSg).toHaveBeenCalledWith(
        expect.objectContaining({
          updateAll: true, // Should apply changes
        }),
      );
      expect(result.llmContent).not.toContain('[DRY RUN]');
      expect(result.llmContent).toContain('applied');
      expect(result.returnDisplay).toContain('applied');
    });

    it('should return replacements when found', async () => {
      vi.mocked(cli.runSg).mockResolvedValue({
        success: true,
        matches: [
          {
            file: path.join(tempRootDir, 'src', 'app.ts'),
            range: {
              byteOffset: { start: 100, end: 120 },
              start: { line: 5, column: 0 },
              end: { line: 5, column: 20 },
            },
            lines: 'console.log("hello")',
            replacement: 'logger.info("hello")',
          },
          {
            file: path.join(tempRootDir, 'src', 'utils.ts'),
            range: {
              byteOffset: { start: 50, end: 70 },
              start: { line: 3, column: 2 },
              end: { line: 3, column: 22 },
            },
            lines: 'console.log("world")',
            replacement: 'logger.info("world")',
          },
        ],
      });

      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
      };
      const invocation = astGrepReplaceTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('2 replacements');
      expect(result.llmContent).toContain('console.log($MSG)');
      expect(result.llmContent).toContain('logger.info($MSG)');
      expect(result.llmContent).toContain('app.ts');
      expect(result.llmContent).toContain('utils.ts');
      expect(result.llmContent).toContain('- console.log("hello")');
      expect(result.llmContent).toContain('+ logger.info("hello")');
    });

    it('should return no matches message when none found', async () => {
      vi.mocked(cli.runSg).mockResolvedValue({
        success: true,
        matches: [],
      });

      const params: AstGrepReplaceToolParams = {
        pattern: 'nonexistent_pattern($X)',
        rewrite: 'replacement($X)',
        lang: 'typescript',
      };
      const invocation = astGrepReplaceTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('No matches found');
      expect(result.returnDisplay).toBe('No matches found');
    });

    it('should handle binary not found error', async () => {
      vi.mocked(cli.runSg).mockResolvedValue({
        success: false,
        matches: [],
        error: 'ast-grep binary not found',
        binaryNotFound: true,
      });

      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
      };
      const invocation = astGrepReplaceTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.error?.type).toBe(ToolErrorType.AST_GREP_BINARY_NOT_FOUND);
      expect(result.returnDisplay).toBe('ast-grep not installed');
    });

    it('should handle execution error', async () => {
      vi.mocked(cli.runSg).mockResolvedValue({
        success: false,
        matches: [],
        error: 'Pattern parse error: invalid syntax',
      });

      const params: AstGrepReplaceToolParams = {
        pattern: 'invalid[[pattern',
        rewrite: 'replacement',
        lang: 'typescript',
      };
      const invocation = astGrepReplaceTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.error?.type).toBe(ToolErrorType.AST_GREP_EXECUTION_ERROR);
      expect(result.llmContent).toContain('Pattern parse error');
    });

    it('should indicate truncated results', async () => {
      vi.mocked(cli.runSg).mockResolvedValue({
        success: true,
        matches: [
          {
            file: 'src/app.ts',
            range: {
              byteOffset: { start: 100, end: 120 },
              start: { line: 5, column: 0 },
              end: { line: 5, column: 20 },
            },
            lines: 'console.log("hello")',
            replacement: 'logger.info("hello")',
          },
        ],
        truncated: true,
      });

      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
      };
      const invocation = astGrepReplaceTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('truncated');
      expect(result.returnDisplay).toContain('truncated');
    });

    it('should pass correct options to runSg', async () => {
      vi.mocked(cli.runSg).mockResolvedValue({
        success: true,
        matches: [],
      });

      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
        paths: ['src', 'lib'],
        globs: ['*.ts', '*.tsx'],
        dryRun: false,
      };
      const invocation = astGrepReplaceTool.build(params);
      await invocation.execute(abortSignal);

      expect(cli.runSg).toHaveBeenCalledWith({
        pattern: 'console.log($MSG)',
        lang: 'typescript',
        rewrite: 'logger.info($MSG)',
        paths: ['src', 'lib'],
        globs: ['*.ts', '*.tsx'],
        updateAll: true,
        cwd: tempRootDir,
      });
    });
  });

  describe('getDescription', () => {
    it('should generate correct description for dry run', () => {
      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
      };
      const invocation = astGrepReplaceTool.build(params);
      expect(invocation.getDescription()).toContain('[DRY RUN]');
      expect(invocation.getDescription()).toContain('console.log($MSG)');
      expect(invocation.getDescription()).toContain('logger.info($MSG)');
    });

    it('should not include DRY RUN when dryRun is false', () => {
      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
        dryRun: false,
      };
      const invocation = astGrepReplaceTool.build(params);
      expect(invocation.getDescription()).not.toContain('[DRY RUN]');
    });

    it('should include globs in description', () => {
      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
        globs: ['*.ts', '*.tsx'],
      };
      const invocation = astGrepReplaceTool.build(params);
      expect(invocation.getDescription()).toContain('files: *.ts, *.tsx');
    });

    it('should include paths in description', () => {
      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
        paths: ['src', 'lib'],
      };
      const invocation = astGrepReplaceTool.build(params);
      expect(invocation.getDescription()).toContain('in src, lib');
    });
  });

  describe('schema', () => {
    it('should have correct tool name', () => {
      expect(astGrepReplaceTool.name).toBe('ast_grep_replace');
    });

    it('should have correct display name', () => {
      expect(astGrepReplaceTool.displayName).toBe('AstReplace');
    });

    it('should have required properties in schema', () => {
      const schema = astGrepReplaceTool.schema;
      expect(schema.parametersJsonSchema).toHaveProperty('required');
      const required = (schema.parametersJsonSchema as { required: string[] })
        .required;
      expect(required).toContain('pattern');
      expect(required).toContain('rewrite');
      expect(required).toContain('lang');
    });

    it('should have dryRun with default true in schema', () => {
      const schema = astGrepReplaceTool.schema;
      const properties = (
        schema.parametersJsonSchema as {
          properties: Record<string, { default?: boolean }>;
        }
      ).properties;
      expect(properties['dryRun'].default).toBe(true);
    });
  });

  describe('safety', () => {
    it('should default to dry run when dryRun is undefined', async () => {
      vi.mocked(cli.runSg).mockResolvedValue({
        success: true,
        matches: [],
      });

      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
        dryRun: undefined,
      };
      const invocation = astGrepReplaceTool.build(params);
      await invocation.execute(abortSignal);

      expect(cli.runSg).toHaveBeenCalledWith(
        expect.objectContaining({
          updateAll: false,
        }),
      );
    });

    it('should default to dry run when dryRun is true', async () => {
      vi.mocked(cli.runSg).mockResolvedValue({
        success: true,
        matches: [],
      });

      const params: AstGrepReplaceToolParams = {
        pattern: 'console.log($MSG)',
        rewrite: 'logger.info($MSG)',
        lang: 'typescript',
        dryRun: true,
      };
      const invocation = astGrepReplaceTool.build(params);
      await invocation.execute(abortSignal);

      expect(cli.runSg).toHaveBeenCalledWith(
        expect.objectContaining({
          updateAll: false,
        }),
      );
    });
  });
});
