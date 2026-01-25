/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import type { LSPClient } from './client.js';
import { createClient } from './client.js';
import { getServerIdForExtension } from './servers.js';
import { getFileExtension, findProjectRoot } from './utils.js';

/** Default idle timeout in milliseconds (5 minutes). */
const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000;

/**
 * Managed client with metadata.
 */
interface ManagedClient {
  client: LSPClient;
  lastUsed: number;
  idleTimer: NodeJS.Timeout | null;
}

/**
 * Manages LSP server instances, handling lifecycle and caching.
 */
export class LSPServerManager {
  private clients = new Map<string, ManagedClient>();
  private readonly idleTimeout: number;

  constructor(idleTimeout = DEFAULT_IDLE_TIMEOUT) {
    this.idleTimeout = idleTimeout;
  }

  /**
   * Get a client key for a root directory and server ID.
   */
  private getClientKey(root: string, serverId: string): string {
    return `${root}::${serverId}`;
  }

  /**
   * Get or create a client for a file.
   * Returns null if no suitable language server is available.
   */
  async getClientForFile(filePath: string): Promise<LSPClient | null> {
    const ext = getFileExtension(filePath);
    const serverId = getServerIdForExtension(ext);

    if (!serverId) {
      return null;
    }

    // Find the project root
    const absolutePath = path.resolve(filePath);
    const root = findProjectRoot(path.dirname(absolutePath)) || path.dirname(absolutePath);

    return this.getClient(root, serverId);
  }

  /**
   * Get or create a client for a specific root and server.
   */
  async getClient(root: string, serverId: string): Promise<LSPClient> {
    const key = this.getClientKey(root, serverId);
    let managed = this.clients.get(key);

    if (managed) {
      // Update last used time and reset idle timer
      managed.lastUsed = Date.now();
      this.resetIdleTimer(key, managed);
      return managed.client;
    }

    // Create new client
    const client = createClient(serverId, root);

    try {
      await client.start();
    } catch (error) {
      throw new Error(
        `Failed to start language server '${serverId}': ${error instanceof Error ? error.message : String(error)}. ` +
        `Make sure the language server is installed and available in your PATH.`
      );
    }

    managed = {
      client,
      lastUsed: Date.now(),
      idleTimer: null,
    };

    this.clients.set(key, managed);
    this.resetIdleTimer(key, managed);

    return client;
  }

  /**
   * Release a client (mark it as no longer in use).
   * The client will be stopped after the idle timeout.
   */
  releaseClient(root: string, serverId: string): void {
    const key = this.getClientKey(root, serverId);
    const managed = this.clients.get(key);

    if (managed) {
      managed.lastUsed = Date.now();
      this.resetIdleTimer(key, managed);
    }
  }

  /**
   * Stop a specific client immediately.
   */
  async stopClient(root: string, serverId: string): Promise<void> {
    const key = this.getClientKey(root, serverId);
    const managed = this.clients.get(key);

    if (managed) {
      if (managed.idleTimer) {
        clearTimeout(managed.idleTimer);
      }
      await managed.client.stop();
      this.clients.delete(key);
    }
  }

  /**
   * Stop all clients.
   */
  async stopAll(): Promise<void> {
    const stopPromises: Promise<void>[] = [];

    for (const [key, managed] of this.clients) {
      if (managed.idleTimer) {
        clearTimeout(managed.idleTimer);
      }
      stopPromises.push(managed.client.stop());
    }

    await Promise.all(stopPromises);
    this.clients.clear();
  }

  /**
   * Get the number of active clients.
   */
  getActiveClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get information about active clients.
   */
  getActiveClients(): Array<{ root: string; serverId: string; lastUsed: Date }> {
    const result: Array<{ root: string; serverId: string; lastUsed: Date }> = [];

    for (const [key, managed] of this.clients) {
      const [root, serverId] = key.split('::');
      result.push({
        root,
        serverId,
        lastUsed: new Date(managed.lastUsed),
      });
    }

    return result;
  }

  /**
   * Reset the idle timer for a client.
   */
  private resetIdleTimer(key: string, managed: ManagedClient): void {
    if (managed.idleTimer) {
      clearTimeout(managed.idleTimer);
    }

    managed.idleTimer = setTimeout(async () => {
      const current = this.clients.get(key);
      if (current && Date.now() - current.lastUsed >= this.idleTimeout) {
        await current.client.stop();
        this.clients.delete(key);
      }
    }, this.idleTimeout);
  }
}

// Singleton instance
let managerInstance: LSPServerManager | null = null;

/**
 * Get the global LSP server manager instance.
 */
export function getLSPServerManager(): LSPServerManager {
  if (!managerInstance) {
    managerInstance = new LSPServerManager();
  }
  return managerInstance;
}

/**
 * Reset the global LSP server manager (for testing).
 */
export async function resetLSPServerManager(): Promise<void> {
  if (managerInstance) {
    await managerInstance.stopAll();
    managerInstance = null;
  }
}
