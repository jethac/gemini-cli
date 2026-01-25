/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL as nodePathToFileURL } from 'node:url';
import type {
  Location,
  Range,
  Position,
  DiagnosticSeverity,
  SymbolKind,
  DocumentSymbol,
  SymbolInformation,
  Diagnostic,
} from './types.js';

/**
 * Convert a file path to a file:// URI.
 */
export function pathToFileURL(filePath: string): string {
  return nodePathToFileURL(path.resolve(filePath)).toString();
}

/**
 * Convert a file:// URI to a file path.
 */
export function fileURLToFilePath(uri: string): string {
  if (uri.startsWith('file://')) {
    return fileURLToPath(uri);
  }
  return uri;
}

/**
 * Get the file extension from a file path.
 */
export function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

/**
 * Get the language ID for a file based on its extension.
 */
export function getLanguageId(filePath: string): string {
  const ext = getFileExtension(filePath);
  const languageMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
    '.pyi': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.scala': 'scala',
    '.lua': 'lua',
    '.sh': 'shellscript',
    '.bash': 'shellscript',
    '.zsh': 'shellscript',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.xml': 'xml',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.md': 'markdown',
    '.sql': 'sql',
    '.r': 'r',
    '.R': 'r',
  };
  return languageMap[ext] || 'plaintext';
}

/**
 * Format a position for display (1-based line numbers for user display).
 */
export function formatPosition(pos: Position): string {
  return `${pos.line + 1}:${pos.character + 1}`;
}

/**
 * Format a range for display.
 */
export function formatRange(range: Range): string {
  if (
    range.start.line === range.end.line &&
    range.start.character === range.end.character
  ) {
    return formatPosition(range.start);
  }
  return `${formatPosition(range.start)}-${formatPosition(range.end)}`;
}

/**
 * Format a location for display.
 */
export function formatLocation(location: Location, rootDir?: string): string {
  let filePath = fileURLToFilePath(location.uri);
  if (rootDir) {
    filePath = path.relative(rootDir, filePath);
  }
  return `${filePath}:${formatRange(location.range)}`;
}

/**
 * Get the severity name from a DiagnosticSeverity value.
 */
export function getSeverityName(severity?: DiagnosticSeverity): string {
  switch (severity) {
    case 1:
      return 'error';
    case 2:
      return 'warning';
    case 3:
      return 'information';
    case 4:
      return 'hint';
    default:
      return 'unknown';
  }
}

/**
 * Get the symbol kind name from a SymbolKind value.
 */
export function getSymbolKindName(kind: SymbolKind): string {
  const names: Record<number, string> = {
    1: 'File',
    2: 'Module',
    3: 'Namespace',
    4: 'Package',
    5: 'Class',
    6: 'Method',
    7: 'Property',
    8: 'Field',
    9: 'Constructor',
    10: 'Enum',
    11: 'Interface',
    12: 'Function',
    13: 'Variable',
    14: 'Constant',
    15: 'String',
    16: 'Number',
    17: 'Boolean',
    18: 'Array',
    19: 'Object',
    20: 'Key',
    21: 'Null',
    22: 'EnumMember',
    23: 'Struct',
    24: 'Event',
    25: 'Operator',
    26: 'TypeParameter',
  };
  return names[kind] || 'Unknown';
}

/**
 * Format a diagnostic for display.
 */
export function formatDiagnostic(
  diagnostic: Diagnostic,
  filePath?: string,
  rootDir?: string,
): string {
  const severity = getSeverityName(diagnostic.severity);
  const range = formatRange(diagnostic.range);
  const source = diagnostic.source ? `[${diagnostic.source}]` : '';
  const code = diagnostic.code ? ` (${diagnostic.code})` : '';

  let location = range;
  if (filePath) {
    let displayPath = filePath;
    if (rootDir) {
      displayPath = path.relative(rootDir, filePath);
    }
    location = `${displayPath}:${range}`;
  }

  return `${location}: ${severity}${code}${source}: ${diagnostic.message}`;
}

/**
 * Format a document symbol for display (with indentation for hierarchy).
 */
export function formatDocumentSymbol(
  symbol: DocumentSymbol,
  indent: number = 0,
): string {
  const prefix = '  '.repeat(indent);
  const kind = getSymbolKindName(symbol.kind);
  const detail = symbol.detail ? ` - ${symbol.detail}` : '';
  const range = formatRange(symbol.selectionRange);
  const deprecated = symbol.deprecated ? ' (deprecated)' : '';

  let result = `${prefix}${symbol.name} [${kind}]${detail}${deprecated} at ${range}`;

  if (symbol.children && symbol.children.length > 0) {
    for (const child of symbol.children) {
      result += '\n' + formatDocumentSymbol(child, indent + 1);
    }
  }

  return result;
}

/**
 * Format a symbol information for display.
 */
export function formatSymbolInformation(
  symbol: SymbolInformation,
  rootDir?: string,
): string {
  const kind = getSymbolKindName(symbol.kind);
  const container = symbol.containerName ? ` in ${symbol.containerName}` : '';
  const location = formatLocation(symbol.location, rootDir);
  const deprecated = symbol.deprecated ? ' (deprecated)' : '';

  return `${symbol.name} [${kind}]${container}${deprecated} at ${location}`;
}

/**
 * Find the project root by looking for common project markers.
 */
export function findProjectRoot(startPath: string): string | null {
  const markers = [
    'package.json',
    'tsconfig.json',
    'pyproject.toml',
    'setup.py',
    'go.mod',
    'Cargo.toml',
    'pom.xml',
    'build.gradle',
    '.git',
  ];

  let currentPath = path.resolve(startPath);
  const root = path.parse(currentPath).root;

  while (currentPath !== root) {
    for (const marker of markers) {
      const markerPath = path.join(currentPath, marker);
      try {
        // Use synchronous check for simplicity
        const fs = require('node:fs');
        if (fs.existsSync(markerPath)) {
          return currentPath;
        }
      } catch {
        // Ignore errors
      }
    }
    currentPath = path.dirname(currentPath);
  }

  return null;
}

/**
 * Convert 1-based line number to 0-based (LSP uses 0-based).
 */
export function toZeroBasedLine(line: number): number {
  return Math.max(0, line - 1);
}

/**
 * Convert 0-based line number to 1-based (for user display).
 */
export function toOneBasedLine(line: number): number {
  return line + 1;
}

/**
 * Create a Position object.
 */
export function createPosition(line: number, character: number): Position {
  return { line, character };
}

/**
 * Create a Range object.
 */
export function createRange(
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
): Range {
  return {
    start: createPosition(startLine, startCharacter),
    end: createPosition(endLine, endCharacter),
  };
}

/**
 * Check if a position is within a range.
 */
export function isPositionInRange(pos: Position, range: Range): boolean {
  if (pos.line < range.start.line || pos.line > range.end.line) {
    return false;
  }
  if (pos.line === range.start.line && pos.character < range.start.character) {
    return false;
  }
  if (pos.line === range.end.line && pos.character > range.end.character) {
    return false;
  }
  return true;
}

/**
 * Flatten document symbols into a list of symbol information.
 */
export function flattenDocumentSymbols(
  symbols: DocumentSymbol[],
  uri: string,
  containerName?: string,
): SymbolInformation[] {
  const result: SymbolInformation[] = [];

  for (const symbol of symbols) {
    result.push({
      name: symbol.name,
      kind: symbol.kind,
      tags: symbol.tags,
      deprecated: symbol.deprecated,
      location: {
        uri,
        range: symbol.selectionRange,
      },
      containerName,
    });

    if (symbol.children && symbol.children.length > 0) {
      result.push(
        ...flattenDocumentSymbols(symbol.children, uri, symbol.name),
      );
    }
  }

  return result;
}
