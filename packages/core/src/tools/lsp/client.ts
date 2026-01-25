/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import type {
  Location,
  LocationLink,
  Diagnostic,
  DocumentSymbol,
  SymbolInformation,
  WorkspaceEdit,
  Range,
  InitializeResult,
  JsonRpcMessage,
  JsonRpcError,
  PublishDiagnosticsParams,
  ClientCapabilities,
  DiagnosticSeverity,
  DiagnosticTag,
  SymbolKind,
} from './types.js';
import { TextDocumentSyncKind } from './types.js';
import {
  pathToFileURL,
  fileURLToFilePath,
  getLanguageId,
  findProjectRoot,
} from './utils.js';
import {
  getServerCommand,
  getServerEnv,
  getServerInitOptions,
} from './servers.js';

/** Default timeout for LSP requests in milliseconds. */
const DEFAULT_REQUEST_TIMEOUT = 15000;

/** Content-Length header pattern for LSP messages. */
const CONTENT_LENGTH_PATTERN = /Content-Length:\s*(\d+)\r\n\r\n/;

/**
 * Interface for LSP client operations.
 */
export interface LSPClient {
  /** The server ID (e.g., 'typescript', 'python'). */
  readonly serverId: string;
  /** The root directory for this client. */
  readonly root: string;

  // Lifecycle
  /** Start the language server. */
  start(): Promise<void>;
  /** Stop the language server. */
  stop(): Promise<void>;
  /** Check if the server is alive. */
  isAlive(): boolean;

  // LSP Operations
  /** Go to definition. */
  definition(
    file: string,
    line: number,
    character: number,
  ): Promise<Location[]>;
  /** Find all references. */
  references(
    file: string,
    line: number,
    character: number,
    includeDecl?: boolean,
  ): Promise<Location[]>;
  /** Get diagnostics for a file. */
  diagnostics(file: string): Promise<Diagnostic[]>;
  /** Get document symbols. */
  documentSymbols(file: string): Promise<DocumentSymbol[]>;
  /** Search workspace symbols. */
  workspaceSymbols(query: string): Promise<SymbolInformation[]>;
  /** Rename a symbol. */
  rename(
    file: string,
    line: number,
    character: number,
    newName: string,
  ): Promise<WorkspaceEdit>;
  /** Prepare rename (check if rename is valid). */
  prepareRename(
    file: string,
    line: number,
    character: number,
  ): Promise<Range | null>;
}

/**
 * Pending request tracker.
 */
interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Implementation of LSPClient using JSON-RPC over stdio.
 */
export class LSPClientImpl extends EventEmitter implements LSPClient {
  readonly serverId: string;
  readonly root: string;

  private proc: ChildProcess | null = null;
  private requestIdCounter = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private initialized = false;
  private buffer = '';
  private openDocuments = new Map<string, number>(); // uri -> version
  private diagnosticsCache = new Map<string, Diagnostic[]>(); // uri -> diagnostics
  private serverCapabilities: InitializeResult['capabilities'] | null = null;

  constructor(serverId: string, root: string) {
    super();
    this.serverId = serverId;
    this.root = root;
  }

  async start(): Promise<void> {
    if (this.proc) {
      return;
    }

    const command = getServerCommand(this.serverId);
    if (!command) {
      throw new Error(`Unknown language server: ${this.serverId}`);
    }

    const env = getServerEnv(this.serverId);
    const [executable, ...args] = command;

    this.proc = spawn(executable, args, {
      cwd: this.root,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.proc.stdout?.on('data', (data: Buffer) => {
      this.handleData(data.toString());
    });

    this.proc.stderr?.on('data', (data: Buffer) => {
      // Log stderr for debugging but don't fail
      this.emit('stderr', data.toString());
    });

    this.proc.on('error', (error) => {
      this.emit('error', error);
      this.cleanup();
    });

    this.proc.on('exit', (code, signal) => {
      this.emit('exit', code, signal);
      this.cleanup();
    });

    // Initialize the server
    await this.initialize();
  }

  async stop(): Promise<void> {
    if (!this.proc || !this.initialized) {
      return;
    }

    try {
      // Send shutdown request
      await this.sendRequest('shutdown', null);
      // Send exit notification
      this.sendNotification('exit', null);
    } catch {
      // Ignore errors during shutdown
    }

    this.cleanup();
  }

  isAlive(): boolean {
    return this.proc !== null && !this.proc.killed && this.initialized;
  }

  async definition(
    file: string,
    line: number,
    character: number,
  ): Promise<Location[]> {
    await this.ensureDocumentOpen(file);

    const result = await this.sendRequest('textDocument/definition', {
      textDocument: { uri: pathToFileURL(file) },
      position: { line, character },
    });

    return this.normalizeLocations(result);
  }

  async references(
    file: string,
    line: number,
    character: number,
    includeDecl = true,
  ): Promise<Location[]> {
    await this.ensureDocumentOpen(file);

    const result = await this.sendRequest('textDocument/references', {
      textDocument: { uri: pathToFileURL(file) },
      position: { line, character },
      context: { includeDeclaration: includeDecl },
    });

    return this.normalizeLocations(result);
  }

  async diagnostics(file: string): Promise<Diagnostic[]> {
    await this.ensureDocumentOpen(file);

    const uri = pathToFileURL(file);

    // First check the cache
    const cached = this.diagnosticsCache.get(uri);
    if (cached) {
      return cached;
    }

    // If the server supports pull diagnostics, use that
    if (this.serverCapabilities?.diagnosticProvider) {
      try {
        const result = await this.sendRequest('textDocument/diagnostic', {
          textDocument: { uri },
        });
        if (result && typeof result === 'object' && 'items' in result) {
          return (result as { items: Diagnostic[] }).items;
        }
      } catch {
        // Fall back to cached diagnostics
      }
    }

    // Return cached diagnostics (populated via publishDiagnostics notification)
    return this.diagnosticsCache.get(uri) || [];
  }

  async documentSymbols(file: string): Promise<DocumentSymbol[]> {
    await this.ensureDocumentOpen(file);

    const result = await this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri: pathToFileURL(file) },
    });

    if (!result || !Array.isArray(result)) {
      return [];
    }

    // Result can be DocumentSymbol[] or SymbolInformation[]
    // Check if it's DocumentSymbol by looking for 'range' property
    if (result.length > 0 && 'range' in result[0]) {
      return result as DocumentSymbol[];
    }

    // Convert SymbolInformation[] to DocumentSymbol[]
    return (result as SymbolInformation[]).map((sym) => ({
      name: sym.name,
      kind: sym.kind,
      tags: sym.tags,
      deprecated: sym.deprecated,
      range: sym.location.range,
      selectionRange: sym.location.range,
    }));
  }

  async workspaceSymbols(query: string): Promise<SymbolInformation[]> {
    const result = await this.sendRequest('workspace/symbol', { query });

    if (!result || !Array.isArray(result)) {
      return [];
    }

    return result as SymbolInformation[];
  }

  async rename(
    file: string,
    line: number,
    character: number,
    newName: string,
  ): Promise<WorkspaceEdit> {
    await this.ensureDocumentOpen(file);

    const result = await this.sendRequest('textDocument/rename', {
      textDocument: { uri: pathToFileURL(file) },
      position: { line, character },
      newName,
    });

    if (!result) {
      return {};
    }

    return result as WorkspaceEdit;
  }

  async prepareRename(
    file: string,
    line: number,
    character: number,
  ): Promise<Range | null> {
    await this.ensureDocumentOpen(file);

    try {
      const result = await this.sendRequest('textDocument/prepareRename', {
        textDocument: { uri: pathToFileURL(file) },
        position: { line, character },
      });

      if (!result) {
        return null;
      }

      // Result can be Range, { range: Range, placeholder: string }, or { defaultBehavior: boolean }
      if ('range' in (result as object)) {
        return (result as { range: Range }).range;
      }
      if ('start' in (result as object)) {
        return result as Range;
      }

      return null;
    } catch {
      // prepareRename is optional, return null if not supported
      return null;
    }
  }

  private async initialize(): Promise<void> {
    const initOptions = getServerInitOptions(this.serverId);

    const capabilities: ClientCapabilities = {
      textDocument: {
        synchronization: {
          dynamicRegistration: false,
          willSave: false,
          willSaveWaitUntil: false,
          didSave: true,
        },
        definition: {
          dynamicRegistration: false,
          linkSupport: true,
        },
        references: {
          dynamicRegistration: false,
        },
        documentSymbol: {
          dynamicRegistration: false,
          hierarchicalDocumentSymbolSupport: true,
          symbolKind: {
            valueSet: Object.values(SymbolKind).filter(
              (v) => typeof v === 'number',
            ) as SymbolKind[],
          },
        },
        rename: {
          dynamicRegistration: false,
          prepareSupport: true,
        },
        publishDiagnostics: {
          relatedInformation: true,
          tagSupport: {
            valueSet: [DiagnosticTag.Unnecessary, DiagnosticTag.Deprecated],
          },
          versionSupport: true,
        },
      },
      workspace: {
        workspaceFolders: true,
        symbol: {
          dynamicRegistration: false,
          symbolKind: {
            valueSet: Object.values(SymbolKind).filter(
              (v) => typeof v === 'number',
            ) as SymbolKind[],
          },
        },
      },
    };

    const result = (await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(this.root),
      capabilities,
      initializationOptions: initOptions,
      workspaceFolders: [
        {
          uri: pathToFileURL(this.root),
          name: this.root.split(/[/\\]/).pop() || 'workspace',
        },
      ],
    })) as InitializeResult;

    this.serverCapabilities = result.capabilities;

    // Send initialized notification
    this.sendNotification('initialized', {});

    this.initialized = true;
    this.emit('initialized', result);
  }

  private async ensureDocumentOpen(file: string): Promise<void> {
    const uri = pathToFileURL(file);

    if (this.openDocuments.has(uri)) {
      return;
    }

    const content = await fs.promises.readFile(file, 'utf-8');
    const languageId = getLanguageId(file);

    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      },
    });

    this.openDocuments.set(uri, 1);

    // Wait a bit for the server to process the document
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  private sendRequest(
    method: string,
    params: unknown,
    timeout = DEFAULT_REQUEST_TIMEOUT,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin) {
        reject(new Error('Language server not running'));
        return;
      }

      const id = ++this.requestIdCounter;
      const message: JsonRpcMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request '${method}' timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });

      this.writeMessage(message);
    });
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.proc?.stdin) {
      return;
    }

    const message: JsonRpcMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.writeMessage(message);
  }

  private writeMessage(message: JsonRpcMessage): void {
    const json = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;
    this.proc?.stdin?.write(header + json);
  }

  private handleData(data: string): void {
    this.buffer += data;

    while (true) {
      const match = this.buffer.match(CONTENT_LENGTH_PATTERN);
      if (!match) {
        break;
      }

      const contentLength = parseInt(match[1], 10);
      const headerEnd = match.index! + match[0].length;
      const messageEnd = headerEnd + contentLength;

      if (this.buffer.length < messageEnd) {
        // Not enough data yet
        break;
      }

      const messageJson = this.buffer.slice(headerEnd, messageEnd);
      this.buffer = this.buffer.slice(messageEnd);

      try {
        const message = JSON.parse(messageJson) as JsonRpcMessage;
        this.handleMessage(message);
      } catch (error) {
        this.emit('error', new Error(`Failed to parse LSP message: ${error}`));
      }
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    // Handle response
    if (message.id !== undefined && !message.method) {
      const pending = this.pendingRequests.get(message.id as number);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id as number);

        if (message.error) {
          pending.reject(
            new Error(
              `LSP error ${message.error.code}: ${message.error.message}`,
            ),
          );
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // Handle notification
    if (message.method) {
      this.handleNotification(message.method, message.params);
    }
  }

  private handleNotification(method: string, params: unknown): void {
    switch (method) {
      case 'textDocument/publishDiagnostics': {
        const diagParams = params as PublishDiagnosticsParams;
        this.diagnosticsCache.set(diagParams.uri, diagParams.diagnostics);
        this.emit('diagnostics', diagParams);
        break;
      }
      case 'window/logMessage':
      case 'window/showMessage':
        this.emit('message', params);
        break;
      default:
        // Ignore other notifications
        break;
    }
  }

  private normalizeLocations(
    result: unknown,
  ): Location[] {
    if (!result) {
      return [];
    }

    // Single Location
    if (!Array.isArray(result) && 'uri' in (result as object)) {
      return [result as Location];
    }

    // Array of Location or LocationLink
    if (Array.isArray(result)) {
      return result.map((item) => {
        if ('targetUri' in item) {
          // LocationLink
          const link = item as LocationLink;
          return {
            uri: link.targetUri,
            range: link.targetSelectionRange,
          };
        }
        return item as Location;
      });
    }

    return [];
  }

  private cleanup(): void {
    // Clear all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Language server stopped'));
    }
    this.pendingRequests.clear();

    // Kill the process if still running
    if (this.proc && !this.proc.killed) {
      this.proc.kill();
    }

    this.proc = null;
    this.initialized = false;
    this.openDocuments.clear();
    this.diagnosticsCache.clear();
    this.buffer = '';
  }
}

/**
 * Create an LSP client for a file.
 */
export function createClient(
  serverId: string,
  rootDir: string,
): LSPClient {
  return new LSPClientImpl(serverId, rootDir);
}
