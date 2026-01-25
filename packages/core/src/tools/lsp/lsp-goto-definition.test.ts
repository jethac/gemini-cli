/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LspGotoDefinitionTool } from './lsp-goto-definition.js';
import type { Config } from '../../config/config.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import { LSP_GOTO_DEFINITION_TOOL_NAME } from '../tool-names.js';

// Mock the manager module
const mockClient = {
  definition: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};

vi.mock('./manager.js', () => ({
  getLSPServerManager: vi.fn(() => ({
    getClientForFile: vi.fn().mockResolvedValue(mockClient),
  })),
}));

// Mock the servers module
vi.mock('./servers.js', () => ({
  isExtensionSupported: vi.fn((ext: string) => ['.ts', '.tsx', '.js', '.jsx', '.py'].includes(ext)),
  getSupportedLanguagesDescription: vi.fn(() => 'TypeScript, JavaScript, Python'),
}));

// Mock the utils module
vi.mock('./utils.js', () => ({
  formatLocation: vi.fn((loc: { uri: string; range: { start: { line: number } } }, rootDir: string) => {
    const file = loc.uri.replace('file://', '').replace(rootDir, '.');
    return `${file}:${loc.range.start.line + 1}`;
  }),
  toZeroBasedLine: vi.fn((line: number) => line - 1),
  getFileExtension: vi.fn((filePath: string) => {
    const match = filePath.match(/\.[^.]+$/);
    return match ? match[0] : '';
  }),
}));

describe('LspGotoDefinitionTool', () => {
  let tool: LspGotoDefinitionTool;
  let mockConfig: Config;
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    mockConfig = {
      getTargetDir: vi.fn().mockReturnValue('/project'),
    } as unknown as Config;

    mockMessageBus = {} as MessageBus;

    tool = new LspGotoDefinitionTool(mockConfig, mockMessageBus);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('tool metadata', () => {
    it('should have the correct name', () => {
      expect(tool.name).toBe(LSP_GOTO_DEFINITION_TOOL_NAME);
    });

    it('should have the correct display name', () => {
      expect(tool.displayName).toBe('LSP Go to Definition');
    });

    it('should have a description', () => {
      expect(tool.description).toContain('Jump to the definition');
    });
  });

  describe('parameter validation', () => {
    it('should validate required filePath', () => {
      const result = tool.validateToolParams({
        filePath: '',
        line: 1,
        character: 0,
      });
      expect(result).toContain('filePath');
    });

    it('should validate positive line number', () => {
      const result = tool.validateToolParams({
        filePath: 'app.ts',
        line: 0,
        character: 0,
      });
      expect(result).toContain('line');
    });

    it('should validate non-negative character', () => {
      const result = tool.validateToolParams({
        filePath: 'app.ts',
        line: 1,
        character: -1,
      });
      expect(result).toContain('character');
    });

    it('should reject unsupported file extensions', () => {
      const result = tool.validateToolParams({
        filePath: 'file.unknown',
        line: 1,
        character: 0,
      });
      expect(result).toContain('not supported');
    });

    it('should accept valid parameters', () => {
      const result = tool.validateToolParams({
        filePath: 'app.ts',
        line: 1,
        character: 0,
      });
      expect(result).toBeNull();
    });
  });

  describe('execute', () => {
    it('should return definition locations', async () => {
      mockClient.definition.mockResolvedValue([
        {
          uri: 'file:///project/src/utils.ts',
          range: { start: { line: 10, character: 0 }, end: { line: 10, character: 20 } },
        },
      ]);

      const invocation = tool.build({
        filePath: 'src/app.ts',
        line: 5,
        character: 10,
      });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('Definition found');
      expect(mockClient.definition).toHaveBeenCalled();
    });

    it('should handle no definition found', async () => {
      mockClient.definition.mockResolvedValue([]);

      const invocation = tool.build({
        filePath: 'src/app.ts',
        line: 5,
        character: 10,
      });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('No definition found');
    });

    it('should handle multiple definitions', async () => {
      mockClient.definition.mockResolvedValue([
        {
          uri: 'file:///project/src/utils.ts',
          range: { start: { line: 10, character: 0 }, end: { line: 10, character: 20 } },
        },
        {
          uri: 'file:///project/src/helpers.ts',
          range: { start: { line: 20, character: 0 }, end: { line: 20, character: 20 } },
        },
      ]);

      const invocation = tool.build({
        filePath: 'src/app.ts',
        line: 5,
        character: 10,
      });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('Found 2 definitions');
    });

    it('should handle errors gracefully', async () => {
      mockClient.definition.mockRejectedValue(new Error('Connection lost'));

      const invocation = tool.build({
        filePath: 'src/app.ts',
        line: 5,
        character: 10,
      });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('Error finding definition');
      expect(result.llmContent).toContain('Connection lost');
      expect(result.error).toBeDefined();
    });
  });
});
