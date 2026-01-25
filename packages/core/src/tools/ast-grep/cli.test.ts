/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

// Mock child_process before importing cli
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Mock constants to control binary availability
vi.mock('./constants.js', () => ({
  getSgCliPath: vi.fn(),
  getInstallInstructions: vi.fn(
    () => 'Install ast-grep using: npm install -g @ast-grep/cli',
  ),
}));

import { spawn } from 'node:child_process';
import { runSg } from './cli.js';
import { getSgCliPath } from './constants.js';

class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

describe('cli', () => {
  let mockProcess: MockChildProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcess = new MockChildProcess();
    vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ChildProcess);
  });

  describe('runSg', () => {
    it('should return binary not found error when sg is not available', async () => {
      vi.mocked(getSgCliPath).mockResolvedValue(null);

      const result = await runSg({
        pattern: 'console.log($MSG)',
        lang: 'typescript',
      });

      expect(result.success).toBe(false);
      expect(result.binaryNotFound).toBe(true);
      expect(result.error).toContain('Install ast-grep');
    });

    it('should spawn sg with correct arguments for search', async () => {
      vi.mocked(getSgCliPath).mockResolvedValue('sg');

      const resultPromise = runSg({
        pattern: 'console.log($MSG)',
        lang: 'typescript',
        paths: ['src'],
        globs: ['*.ts'],
        context: 2,
        cwd: '/project',
      });

      // Simulate successful completion
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('[]'));
        mockProcess.emit('close', 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        'sg',
        [
          'run',
          '-p',
          'console.log($MSG)',
          '--lang',
          'typescript',
          '--json=compact',
          '-C',
          '2',
          '--globs',
          '*.ts',
          'src',
        ],
        expect.objectContaining({
          cwd: '/project',
          windowsHide: true,
        }),
      );
    });

    it('should spawn sg with correct arguments for replace', async () => {
      vi.mocked(getSgCliPath).mockResolvedValue('sg');

      const resultPromise = runSg({
        pattern: 'console.log($MSG)',
        lang: 'typescript',
        rewrite: 'logger.info($MSG)',
        updateAll: true,
        cwd: '/project',
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('[]'));
        mockProcess.emit('close', 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        'sg',
        expect.arrayContaining([
          'run',
          '-p',
          'console.log($MSG)',
          '--lang',
          'typescript',
          '--json=compact',
          '-r',
          'logger.info($MSG)',
          '--update-all',
          '.',
        ]),
        expect.any(Object),
      );
    });

    it('should parse JSON output correctly', async () => {
      vi.mocked(getSgCliPath).mockResolvedValue('sg');

      const mockMatches = [
        {
          file: 'src/app.ts',
          range: {
            byteOffset: { start: 100, end: 120 },
            start: { line: 5, column: 0 },
            end: { line: 5, column: 20 },
          },
          lines: 'console.log("hello")',
        },
      ];

      const resultPromise = runSg({
        pattern: 'console.log($MSG)',
        lang: 'typescript',
      });

      setTimeout(() => {
        mockProcess.stdout.emit(
          'data',
          Buffer.from(JSON.stringify(mockMatches)),
        );
        mockProcess.emit('close', 0);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].file).toBe('src/app.ts');
      expect(result.matches[0].lines).toBe('console.log("hello")');
    });

    it('should handle empty output', async () => {
      vi.mocked(getSgCliPath).mockResolvedValue('sg');

      const resultPromise = runSg({
        pattern: 'console.log($MSG)',
        lang: 'typescript',
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from(''));
        mockProcess.emit('close', 0);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.matches).toHaveLength(0);
    });

    it('should handle non-zero exit code', async () => {
      vi.mocked(getSgCliPath).mockResolvedValue('sg');

      const resultPromise = runSg({
        pattern: 'console.log($MSG)',
        lang: 'typescript',
      });

      setTimeout(() => {
        mockProcess.stderr.emit(
          'data',
          Buffer.from('Pattern error: invalid syntax'),
        );
        mockProcess.emit('close', 1);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Pattern');
    });

    it('should handle spawn error', async () => {
      vi.mocked(getSgCliPath).mockResolvedValue('sg');

      const resultPromise = runSg({
        pattern: 'console.log($MSG)',
        lang: 'typescript',
      });

      setTimeout(() => {
        mockProcess.emit('error', new Error('spawn ENOENT'));
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to execute ast-grep');
    });

    it('should truncate output when exceeding max size', async () => {
      vi.mocked(getSgCliPath).mockResolvedValue('sg');

      const resultPromise = runSg({
        pattern: 'console.log($MSG)',
        lang: 'typescript',
      });

      // Simulate large output that exceeds 1MB
      const largeData = Buffer.alloc(1024 * 1024 + 100, 'x');

      setTimeout(() => {
        mockProcess.stdout.emit('data', largeData);
        // Process should be killed after exceeding limit
        mockProcess.emit('close', null);
      }, 0);

      const result = await resultPromise;

      expect(mockProcess.kill).toHaveBeenCalled();
      expect(result.truncated).toBe(true);
    });

    it('should use default path when none specified', async () => {
      vi.mocked(getSgCliPath).mockResolvedValue('sg');

      const resultPromise = runSg({
        pattern: 'console.log($MSG)',
        lang: 'typescript',
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('[]'));
        mockProcess.emit('close', 0);
      }, 0);

      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        'sg',
        expect.arrayContaining(['.']),
        expect.any(Object),
      );
    });

    it('should not include --update-all for dry run', async () => {
      vi.mocked(getSgCliPath).mockResolvedValue('sg');

      const resultPromise = runSg({
        pattern: 'console.log($MSG)',
        lang: 'typescript',
        rewrite: 'logger.info($MSG)',
        updateAll: false,
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('[]'));
        mockProcess.emit('close', 0);
      }, 0);

      await resultPromise;

      const callArgs = vi.mocked(spawn).mock.calls[0][1] as string[];
      expect(callArgs).not.toContain('--update-all');
    });
  });
});
