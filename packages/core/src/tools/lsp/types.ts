/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LSP Types - Core types for Language Server Protocol integration.
 * Based on LSP 3.17 specification.
 */

/**
 * Position in a text document expressed as zero-based line and character offset.
 */
export interface Position {
  /** Line position (zero-based). */
  line: number;
  /** Character offset on a line (zero-based). */
  character: number;
}

/**
 * A range in a text document expressed as (zero-based) start and end positions.
 */
export interface Range {
  /** The range's start position. */
  start: Position;
  /** The range's end position. */
  end: Position;
}

/**
 * Represents a location inside a resource, such as a line inside a text file.
 */
export interface Location {
  /** The URI of the document. */
  uri: string;
  /** The range within the document. */
  range: Range;
}

/**
 * Represents a link between a source and a target location.
 */
export interface LocationLink {
  /** Span of the origin of this link. */
  originSelectionRange?: Range;
  /** The target resource identifier. */
  targetUri: string;
  /** The full target range. */
  targetRange: Range;
  /** The range that should be selected and revealed when this link is followed. */
  targetSelectionRange: Range;
}

/**
 * Diagnostic severity levels.
 */
export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

/**
 * Diagnostic tags.
 */
export enum DiagnosticTag {
  Unnecessary = 1,
  Deprecated = 2,
}

/**
 * Represents a related message and source code location for a diagnostic.
 */
export interface DiagnosticRelatedInformation {
  /** The location of this related diagnostic information. */
  location: Location;
  /** The message of this related diagnostic information. */
  message: string;
}

/**
 * Represents a diagnostic, such as a compiler error or warning.
 */
export interface Diagnostic {
  /** The range at which the message applies. */
  range: Range;
  /** The diagnostic's severity. */
  severity?: DiagnosticSeverity;
  /** The diagnostic's code, which might appear in the user interface. */
  code?: number | string;
  /** An optional property to describe the error code. */
  codeDescription?: {
    href: string;
  };
  /** A human-readable string describing the source of this diagnostic. */
  source?: string;
  /** The diagnostic's message. */
  message: string;
  /** Additional metadata about the diagnostic. */
  tags?: DiagnosticTag[];
  /** An array of related diagnostic information. */
  relatedInformation?: DiagnosticRelatedInformation[];
  /** A data entry field that is preserved between requests. */
  data?: unknown;
}

/**
 * Symbol kinds.
 */
export enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

/**
 * Symbol tags.
 */
export enum SymbolTag {
  Deprecated = 1,
}

/**
 * Represents programming constructs like variables, classes, interfaces etc.
 * that appear in a document.
 */
export interface DocumentSymbol {
  /** The name of this symbol. */
  name: string;
  /** More detail for this symbol, e.g. the signature of a function. */
  detail?: string;
  /** The kind of this symbol. */
  kind: SymbolKind;
  /** Tags for this symbol. */
  tags?: SymbolTag[];
  /** Indicates if this symbol is deprecated. */
  deprecated?: boolean;
  /** The range enclosing this symbol not including leading/trailing whitespace. */
  range: Range;
  /** The range that should be selected and revealed when this symbol is being picked. */
  selectionRange: Range;
  /** Children of this symbol, e.g. properties of a class. */
  children?: DocumentSymbol[];
}

/**
 * Represents information about programming constructs like variables, classes,
 * interfaces etc.
 */
export interface SymbolInformation {
  /** The name of this symbol. */
  name: string;
  /** The kind of this symbol. */
  kind: SymbolKind;
  /** Tags for this symbol. */
  tags?: SymbolTag[];
  /** Indicates if this symbol is deprecated. */
  deprecated?: boolean;
  /** The location of this symbol. */
  location: Location;
  /** The name of the symbol containing this symbol. */
  containerName?: string;
}

/**
 * A text edit applicable to a text document.
 */
export interface TextEdit {
  /** The range of the text document to be manipulated. */
  range: Range;
  /** The string to be inserted. For delete operations use an empty string. */
  newText: string;
}

/**
 * Describes textual changes on a single text document.
 */
export interface TextDocumentEdit {
  /** The text document to change. */
  textDocument: {
    uri: string;
    version: number | null;
  };
  /** The edits to be applied. */
  edits: TextEdit[];
}

/**
 * Options to create a file.
 */
export interface CreateFileOptions {
  overwrite?: boolean;
  ignoreIfExists?: boolean;
}

/**
 * Create file operation.
 */
export interface CreateFile {
  kind: 'create';
  uri: string;
  options?: CreateFileOptions;
}

/**
 * Rename file options.
 */
export interface RenameFileOptions {
  overwrite?: boolean;
  ignoreIfExists?: boolean;
}

/**
 * Rename file operation.
 */
export interface RenameFile {
  kind: 'rename';
  oldUri: string;
  newUri: string;
  options?: RenameFileOptions;
}

/**
 * Delete file options.
 */
export interface DeleteFileOptions {
  recursive?: boolean;
  ignoreIfNotExists?: boolean;
}

/**
 * Delete file operation.
 */
export interface DeleteFile {
  kind: 'delete';
  uri: string;
  options?: DeleteFileOptions;
}

/**
 * A workspace edit represents changes to many resources managed in the workspace.
 */
export interface WorkspaceEdit {
  /** Holds changes to existing resources. */
  changes?: { [uri: string]: TextEdit[] };
  /** Depending on the client capability, document changes are either an array of
   * TextDocumentEdits or a mix of TextDocumentEdits and file operations. */
  documentChanges?: (TextDocumentEdit | CreateFile | RenameFile | DeleteFile)[];
}

/**
 * Prepare rename result.
 */
export interface PrepareRenameResult {
  range: Range;
  placeholder?: string;
}

/**
 * Text document identifier.
 */
export interface TextDocumentIdentifier {
  uri: string;
}

/**
 * Text document item.
 */
export interface TextDocumentItem {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

/**
 * Versioned text document identifier.
 */
export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: number;
}

/**
 * Text document position params.
 */
export interface TextDocumentPositionParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
}

/**
 * Reference params.
 */
export interface ReferenceParams extends TextDocumentPositionParams {
  context: {
    includeDeclaration: boolean;
  };
}

/**
 * Document symbol params.
 */
export interface DocumentSymbolParams {
  textDocument: TextDocumentIdentifier;
}

/**
 * Workspace symbol params.
 */
export interface WorkspaceSymbolParams {
  query: string;
}

/**
 * Rename params.
 */
export interface RenameParams extends TextDocumentPositionParams {
  newName: string;
}

/**
 * Initialize params (simplified).
 */
export interface InitializeParams {
  processId: number | null;
  rootUri: string | null;
  capabilities: ClientCapabilities;
  initializationOptions?: unknown;
  workspaceFolders?: WorkspaceFolder[] | null;
}

/**
 * Workspace folder.
 */
export interface WorkspaceFolder {
  uri: string;
  name: string;
}

/**
 * Client capabilities (simplified).
 */
export interface ClientCapabilities {
  textDocument?: {
    synchronization?: {
      dynamicRegistration?: boolean;
      willSave?: boolean;
      willSaveWaitUntil?: boolean;
      didSave?: boolean;
    };
    completion?: {
      dynamicRegistration?: boolean;
      completionItem?: {
        snippetSupport?: boolean;
        commitCharactersSupport?: boolean;
        documentationFormat?: string[];
        deprecatedSupport?: boolean;
        preselectSupport?: boolean;
      };
    };
    hover?: {
      dynamicRegistration?: boolean;
      contentFormat?: string[];
    };
    definition?: {
      dynamicRegistration?: boolean;
      linkSupport?: boolean;
    };
    references?: {
      dynamicRegistration?: boolean;
    };
    documentSymbol?: {
      dynamicRegistration?: boolean;
      symbolKind?: {
        valueSet?: SymbolKind[];
      };
      hierarchicalDocumentSymbolSupport?: boolean;
    };
    rename?: {
      dynamicRegistration?: boolean;
      prepareSupport?: boolean;
    };
    publishDiagnostics?: {
      relatedInformation?: boolean;
      tagSupport?: {
        valueSet?: DiagnosticTag[];
      };
      versionSupport?: boolean;
    };
  };
  workspace?: {
    workspaceFolders?: boolean;
    symbol?: {
      dynamicRegistration?: boolean;
      symbolKind?: {
        valueSet?: SymbolKind[];
      };
    };
  };
}

/**
 * Server capabilities (simplified).
 */
export interface ServerCapabilities {
  textDocumentSync?: number | {
    openClose?: boolean;
    change?: number;
    save?: boolean | { includeText?: boolean };
  };
  definitionProvider?: boolean;
  referencesProvider?: boolean;
  documentSymbolProvider?: boolean;
  workspaceSymbolProvider?: boolean;
  renameProvider?: boolean | { prepareProvider?: boolean };
  diagnosticProvider?: {
    interFileDependencies?: boolean;
    workspaceDiagnostics?: boolean;
  };
}

/**
 * Initialize result.
 */
export interface InitializeResult {
  capabilities: ServerCapabilities;
  serverInfo?: {
    name: string;
    version?: string;
  };
}

/**
 * Publish diagnostics params.
 */
export interface PublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics: Diagnostic[];
}

/**
 * JSON-RPC message types.
 */
export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * JSON-RPC error.
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC request.
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC response.
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: JsonRpcError;
}

/**
 * JSON-RPC notification.
 */
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

/**
 * LSP error codes.
 */
export enum LSPErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  ServerNotInitialized = -32002,
  UnknownErrorCode = -32001,
  RequestCancelled = -32800,
  ContentModified = -32801,
}

/**
 * Text document sync kind.
 */
export enum TextDocumentSyncKind {
  None = 0,
  Full = 1,
  Incremental = 2,
}
