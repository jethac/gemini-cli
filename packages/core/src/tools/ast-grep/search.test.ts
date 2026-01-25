/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AstGrepSearchToolParams } from './search.js';
import { AstGrepSearchTool } from './search.js';
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

describe('AstGrepSearchTool', () => {
  let tempRootDir: string;
  let astGrepSearchTool: AstGrepSearchTool;
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
      path.join(os.tmpdir(), 'ast-grep-search-test-'),
    );
    astGrepSearchTool = new AstGrepSearchTool(
      createMockConfig(tempRootDir),
      createMockMessageBus(),
    );
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempRootDir, { recursive: true, force: true });
  });

  describe('validateToolParams', () => {
    it('should return null for valid params (pattern and lang)', () => {
      const params: AstGrepSearchToolParams = {
        pattern: 'console.log($MSG)',
        lang: 'typescript',
      };
      expect(astGrepSearchTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid params with all options', () => {
      const params: AstGrepSearchToolParams = {
        pattern: 'console.log($MSG)',
        lang: 'typescript',
        paths: ['src'],
        globs: ['*.ts'],
        context: 2,
      };
      expect(astGrepSearchTool.validateToolParams(params)).toBeNull();
    });

    it('should return error if pattern is missing', () => {
      const params = {
        lang: 'typescript',
      } as unknown as AstGrepSearchToolParams;
      expect(astGrepSearchTool.validateToolParams(params)).toBe(
        `params must have required property 'pattern'`,
      );
    });

    it('should return error if lang is missing', () => {
      const params = {
        pattern: 'console.log($MSG)',
      } as unknown as AstGrepSearchToolParams;
      expect(astGrepSearchTool.validateToolParams(params)).toBe(
        `params must have required property 'lang'`,
      );
    });

    it('should return error for invalid language', () => {
      const params: AstGrepSearchToolParams = {
        pattern: 'console.log($MSG)',
        lang: 'invalid_lang' as AstGrepSearchToolParams['lang'],
      };
      expect(astGrepSearchTool.validateToolParams(params)).toContain(
        'must be equal to one of the allowed values',
      );
    });

    it('should return error for empty pattern', () => {
      const params: AstGrepSearchToolParams = {
        pattern: '   ',
        lang: 'typescript',
      };
      expect(astGrepSearchTool.validateToolParams(params)).toBe(
        'Pattern cannot be empty',
      );
    });

    it('should return error for negative context', () => {
      const params: AstGrepSearchToolParams = {
        pattern: 'console.log($MSG)',
        lang: 'typescript',
        context: -1,
      };
      expect(astGrepSearchTool.validateToolParams(params)).toBe(
        'Context must be a non-negative number',
      );
    });
  });

  describe('execute', () => {
    it('should return matches when found', async () => {
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
          },
          {
            file: path.join(tempRootDir, 'src', 'utils.ts'),
            range: {
              byteOffset: { start: 50, end: 70 },
              start: { line: 3, column: 2 },
              end: { line: 3, column: 22 },
            },
            lines: 'console.log("world")',
          },
        ],
      });

      const params: AstGrepSearchToolParams = {
        pattern: 'console.log($MSG)',
        lang: 'typescript',
      };
      const invocation = astGrepSearchTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Found 2 matches');
      expect(result.llmContent).toContain('console.log($MSG)');
      expect(result.llmContent).toContain('typescript');
      expect(result.llmContent).toContain('app.ts');
      expect(result.llmContent).toContain('utils.ts');
      expect(result.llmContent).toContain('L5:0');
      expect(result.llmContent).toContain('L3:2');
      expect(result.returnDisplay).toBe('Found 2 matches');
    });

    it('should return no matches message when none found', async () => {
      vi.mocked(cli.runSg).mockResolvedValue({
        success: true,
        matches: [],
      });

      const params: AstGrepSearchToolParams = {
        pattern: 'nonexistent_pattern($X)',
        lang: 'typescript',
      };
      const invocation = astGrepSearchTool.build(params);
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

      const params: AstGrepSearchToolParams = {
        pattern: 'console.log($MSG)',
        lang: 'typescript',
      };
      const invocation = astGrepSearchTool.build(params);
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

      const params: AstGrepSearchToolParams = {
        pattern: 'invalid[[pattern',
        lang: 'typescript',
      };
      const invocation = astGrepSearchTool.build(params);
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
          },
        ],
        truncated: true,
      });

      const params: AstGrepSearchToolParams = {
        pattern: 'console.log($MSG)',
        lang: 'typescript',
      };
      const invocation = astGrepSearchTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('truncated');
      expect(result.returnDisplay).toContain('truncated');
    });

    it('should pass correct options to runSg', async () => {
      vi.mocked(cli.runSg).mockResolvedValue({
        success: true,
        matches: [],
      });

      const params: AstGrepSearchToolParams = {
        pattern: 'console.log($MSG)',
        lang: 'typescript',
        paths: ['src', 'lib'],
        globs: ['*.ts', '*.tsx'],
        context: 3,
      };
      const invocation = astGrepSearchTool.build(params);
      await invocation.execute(abortSignal);

      expect(cli.runSg).toHaveBeenCalledWith({
        pattern: 'console.log($MSG)',
        lang: 'typescript',
        paths: ['src', 'lib'],
        globs: ['*.ts', '*.tsx'],
        context: 3,
        cwd: tempRootDir,
      });
    });
  });

  describe('getDescription', () => {
    it('should generate correct description with pattern and lang', () => {
      const params: AstGrepSearchToolParams = {
        pattern: 'console.log($MSG)',
        lang: 'typescript',
      };
      const invocation = astGrepSearchTool.build(params);
      expect(invocation.getDescription()).toBe(
        "AST pattern 'console.log($MSG)' in typescript",
      );
    });

    it('should include globs in description', () => {
      const params: AstGrepSearchToolParams = {
        pattern: 'console.log($MSG)',
        lang: 'typescript',
        globs: ['*.ts', '*.tsx'],
      };
      const invocation = astGrepSearchTool.build(params);
      expect(invocation.getDescription()).toContain('files: *.ts, *.tsx');
    });

    it('should include paths in description', () => {
      const params: AstGrepSearchToolParams = {
        pattern: 'console.log($MSG)',
        lang: 'typescript',
        paths: ['src', 'lib'],
      };
      const invocation = astGrepSearchTool.build(params);
      expect(invocation.getDescription()).toContain('in src, lib');
    });
  });

  describe('schema', () => {
    it('should have correct tool name', () => {
      expect(astGrepSearchTool.name).toBe('ast_grep_search');
    });

    it('should have correct display name', () => {
      expect(astGrepSearchTool.displayName).toBe('AstSearch');
    });

    it('should have required properties in schema', () => {
      const schema = astGrepSearchTool.schema;
      expect(schema.parametersJsonSchema).toHaveProperty('required');
      expect(
        (schema.parametersJsonSchema as { required: string[] }).required,
      ).toContain('pattern');
      expect(
        (schema.parametersJsonSchema as { required: string[] }).required,
      ).toContain('lang');
    });
  });
});
