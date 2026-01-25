/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LSPServerManager, resetLSPServerManager } from './manager.js';

// Mock the client module
vi.mock('./client.js', () => ({
  createClient: vi.fn(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    isAlive: vi.fn().mockReturnValue(true),
    definition: vi.fn().mockResolvedValue([]),
    references: vi.fn().mockResolvedValue([]),
    diagnostics: vi.fn().mockResolvedValue([]),
    documentSymbols: vi.fn().mockResolvedValue([]),
    workspaceSymbols: vi.fn().mockResolvedValue([]),
    prepareRename: vi.fn().mockResolvedValue(null),
    rename: vi.fn().mockResolvedValue({ changes: {} }),
  })),
}));

// Mock the servers module
vi.mock('./servers.js', () => ({
  getServerIdForExtension: vi.fn((ext: string) => {
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) return 'typescript';
    if (['.py'].includes(ext)) return 'python';
    return null;
  }),
  BUILTIN_SERVERS: {
    typescript: {
      command: ['typescript-language-server', '--stdio'],
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
    python: {
      command: ['pyright-langserver', '--stdio'],
      extensions: ['.py'],
    },
  },
}));

// Mock the utils module
vi.mock('./utils.js', () => ({
  getFileExtension: vi.fn((filePath: string) => {
    const match = filePath.match(/\.[^.]+$/);
    return match ? match[0] : '';
  }),
  findProjectRoot: vi.fn(() => '/project'),
}));

describe('LSPServerManager', () => {
  let manager: LSPServerManager;

  beforeEach(async () => {
    await resetLSPServerManager();
    manager = new LSPServerManager(100); // Short timeout for testing
  });

  afterEach(async () => {
    await manager.stopAll();
    vi.clearAllMocks();
  });

  describe('getClientForFile', () => {
    it('should return null for unsupported file extensions', async () => {
      const client = await manager.getClientForFile('/project/file.unknown');
      expect(client).toBeNull();
    });

    it('should return a client for supported file extensions', async () => {
      const client = await manager.getClientForFile('/project/src/app.ts');
      expect(client).not.toBeNull();
    });

    it('should return the same client for the same project root and server', async () => {
      const client1 = await manager.getClientForFile('/project/src/app.ts');
      const client2 = await manager.getClientForFile('/project/src/utils.ts');
      expect(client1).toBe(client2);
    });

    it('should return a client for Python files', async () => {
      const client = await manager.getClientForFile('/project/main.py');
      expect(client).not.toBeNull();
    });
  });

  describe('getActiveClientCount', () => {
    it('should return 0 when no clients are active', () => {
      expect(manager.getActiveClientCount()).toBe(0);
    });

    it('should track active clients', async () => {
      await manager.getClientForFile('/project/src/app.ts');
      expect(manager.getActiveClientCount()).toBe(1);
    });

    it('should count distinct server/project combinations', async () => {
      await manager.getClientForFile('/project/src/app.ts');
      await manager.getClientForFile('/project/main.py');
      expect(manager.getActiveClientCount()).toBe(2);
    });
  });

  describe('stopAll', () => {
    it('should stop all clients', async () => {
      await manager.getClientForFile('/project/src/app.ts');
      await manager.getClientForFile('/project/main.py');
      expect(manager.getActiveClientCount()).toBe(2);

      await manager.stopAll();
      expect(manager.getActiveClientCount()).toBe(0);
    });
  });

  describe('getActiveClients', () => {
    it('should return empty array when no clients', () => {
      expect(manager.getActiveClients()).toEqual([]);
    });

    it('should return info about active clients', async () => {
      await manager.getClientForFile('/project/src/app.ts');
      const clients = manager.getActiveClients();

      expect(clients).toHaveLength(1);
      expect(clients[0]).toMatchObject({
        serverId: 'typescript',
      });
      expect(clients[0].lastUsed).toBeInstanceOf(Date);
    });
  });

  describe('idle timeout', () => {
    it('should stop client after idle timeout', async () => {
      // Create client
      await manager.getClientForFile('/project/src/app.ts');
      expect(manager.getActiveClientCount()).toBe(1);

      // Wait for idle timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Client should be stopped
      expect(manager.getActiveClientCount()).toBe(0);
    });

    it('should reset idle timer on subsequent use', async () => {
      // Create client
      await manager.getClientForFile('/project/src/app.ts');

      // Wait half the timeout
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Use client again (resets timer)
      await manager.getClientForFile('/project/src/app.ts');

      // Wait half the timeout again
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Client should still be active (timer was reset)
      expect(manager.getActiveClientCount()).toBe(1);
    });
  });
});
