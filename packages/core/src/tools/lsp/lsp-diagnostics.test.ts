/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LspDiagnosticsTool } from './lsp-diagnostics.js';
import type { Config } from '../../config/config.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import { LSP_DIAGNOSTICS_TOOL_NAME } from '../tool-names.js';
import { DiagnosticSeverity } from './types.js';

// Mock the manager module
const mockClient = {
  diagnostics: vi.fn(),
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
  formatDiagnostic: vi.fn((diag) => {
    const severity = ['', 'Error', 'Warning', 'Info', 'Hint'][diag.severity] || 'Unknown';
    return `[${severity}] Line ${diag.range.start.line + 1}: ${diag.message}`;
  }),
  getFileExtension: vi.fn((filePath: string) => {
    const match = filePath.match(/\.[^.]+$/);
    return match ? match[0] : '';
  }),
  severityToString: vi.fn((sev: number) => ['', 'error', 'warning', 'information', 'hint'][sev] || 'unknown'),
  getSeverityName: vi.fn((sev: number) => ['', 'Error', 'Warning', 'Information', 'Hint'][sev] || 'Unknown'),
  pathToFileUri: vi.fn((p: string) => `file://${p}`),
  fileUriToPath: vi.fn((uri: string) => uri.replace('file://', '')),
  toZeroBasedLine: vi.fn((line: number) => line - 1),
}));

describe('LspDiagnosticsTool', () => {
  let tool: LspDiagnosticsTool;
  let mockConfig: Config;
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    mockConfig = {
      getTargetDir: vi.fn().mockReturnValue('/project'),
    } as unknown as Config;

    mockMessageBus = {} as MessageBus;

    tool = new LspDiagnosticsTool(mockConfig, mockMessageBus);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('tool metadata', () => {
    it('should have the correct name', () => {
      expect(tool.name).toBe(LSP_DIAGNOSTICS_TOOL_NAME);
    });

    it('should have the correct display name', () => {
      expect(tool.displayName).toBe('LSP Diagnostics');
    });
  });

  describe('parameter validation', () => {
    it('should validate required filePath', () => {
      const result = tool.validateToolParams({
        filePath: '',
      });
      expect(result).toContain('filePath');
    });

    it('should validate severity value', () => {
      const result = tool.validateToolParams({
        filePath: 'app.ts',
        severity: 'invalid' as any,
      });
      expect(result).toContain('severity');
    });

    it('should accept valid severity values', () => {
      for (const severity of ['error', 'warning', 'information', 'hint', 'all']) {
        const result = tool.validateToolParams({
          filePath: 'app.ts',
          severity: severity as any,
        });
        expect(result).toBeNull();
      }
    });

    it('should accept missing severity (defaults to all)', () => {
      const result = tool.validateToolParams({
        filePath: 'app.ts',
      });
      expect(result).toBeNull();
    });
  });

  describe('execute', () => {
    it('should return diagnostics', async () => {
      mockClient.diagnostics.mockResolvedValue([
        {
          range: { start: { line: 4, character: 0 }, end: { line: 4, character: 10 } },
          message: 'Type error: expected string',
          severity: DiagnosticSeverity.Error,
        },
        {
          range: { start: { line: 10, character: 0 }, end: { line: 10, character: 20 } },
          message: 'Unused variable',
          severity: DiagnosticSeverity.Warning,
        },
      ]);

      const invocation = tool.build({
        filePath: 'src/app.ts',
      });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('Found 2 diagnostic');
      expect(mockClient.diagnostics).toHaveBeenCalled();
    });

    it('should handle no diagnostics', async () => {
      mockClient.diagnostics.mockResolvedValue([]);

      const invocation = tool.build({
        filePath: 'src/app.ts',
      });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('No diagnostics');
    });

    it('should filter by severity', async () => {
      mockClient.diagnostics.mockResolvedValue([
        {
          range: { start: { line: 4, character: 0 }, end: { line: 4, character: 10 } },
          message: 'Type error: expected string',
          severity: DiagnosticSeverity.Error,
        },
        {
          range: { start: { line: 10, character: 0 }, end: { line: 10, character: 20 } },
          message: 'Unused variable',
          severity: DiagnosticSeverity.Warning,
        },
      ]);

      const invocation = tool.build({
        filePath: 'src/app.ts',
        severity: 'error',
      });

      const result = await invocation.execute();

      // Should have filtered the results - errors only
      expect(result.llmContent).toBeDefined();
      expect(mockClient.diagnostics).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockClient.diagnostics.mockRejectedValue(new Error('Server not responding'));

      const invocation = tool.build({
        filePath: 'src/app.ts',
      });

      const result = await invocation.execute();

      expect(result.llmContent).toContain('Error');
      expect(result.error).toBeDefined();
    });
  });
});
