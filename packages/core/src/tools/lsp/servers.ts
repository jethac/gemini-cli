/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';

/**
 * Configuration for an LSP server.
 */
export interface LSPServerConfig {
  /** Command to start the server (first element is executable, rest are args). */
  command: string[];
  /** File extensions this server handles. */
  extensions: string[];
  /** Optional initialization options to pass to the server. */
  initialization?: Record<string, unknown>;
  /** Optional environment variables for the server process. */
  env?: Record<string, string>;
}

/**
 * Built-in LSP server configurations.
 * Users must have these language servers installed on their system.
 */
export const BUILTIN_SERVERS: Record<string, LSPServerConfig> = {
  typescript: {
    command: ['typescript-language-server', '--stdio'],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    initialization: {
      preferences: {
        includeInlayParameterNameHints: 'all',
        includeInlayParameterNameHintsWhenArgumentMatchesName: true,
        includeInlayFunctionParameterTypeHints: true,
        includeInlayVariableTypeHints: true,
        includeInlayPropertyDeclarationTypeHints: true,
        includeInlayFunctionLikeReturnTypeHints: true,
        includeInlayEnumMemberValueHints: true,
      },
    },
  },
  python: {
    command: ['pyright-langserver', '--stdio'],
    extensions: ['.py', '.pyi'],
    initialization: {
      python: {
        analysis: {
          autoSearchPaths: true,
          useLibraryCodeForTypes: true,
          diagnosticMode: 'workspace',
        },
      },
    },
  },
  go: {
    command: ['gopls', 'serve'],
    extensions: ['.go'],
    initialization: {
      gopls: {
        staticcheck: true,
        analyses: {
          unusedparams: true,
          shadow: true,
        },
      },
    },
  },
  rust: {
    command: ['rust-analyzer'],
    extensions: ['.rs'],
    initialization: {
      'rust-analyzer': {
        checkOnSave: {
          command: 'clippy',
        },
      },
    },
  },
  java: {
    command: ['jdtls'],
    extensions: ['.java'],
  },
  csharp: {
    command: ['OmniSharp', '-lsp'],
    extensions: ['.cs'],
  },
  cpp: {
    command: ['clangd'],
    extensions: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'],
  },
  lua: {
    command: ['lua-language-server'],
    extensions: ['.lua'],
  },
  ruby: {
    command: ['solargraph', 'stdio'],
    extensions: ['.rb'],
  },
  php: {
    command: ['phpactor', 'language-server'],
    extensions: ['.php'],
  },
};

/**
 * Get the server ID for a given file extension.
 */
export function getServerIdForExtension(extension: string): string | null {
  const ext = extension.toLowerCase();
  for (const [serverId, config] of Object.entries(BUILTIN_SERVERS)) {
    if (config.extensions.includes(ext)) {
      return serverId;
    }
  }
  return null;
}

/**
 * Get the server configuration for a given server ID.
 */
export function getServerConfig(serverId: string): LSPServerConfig | null {
  return BUILTIN_SERVERS[serverId] || null;
}

/**
 * Get all supported file extensions.
 */
export function getSupportedExtensions(): string[] {
  const extensions = new Set<string>();
  for (const config of Object.values(BUILTIN_SERVERS)) {
    for (const ext of config.extensions) {
      extensions.add(ext);
    }
  }
  return Array.from(extensions);
}

/**
 * Check if a file extension is supported.
 */
export function isExtensionSupported(extension: string): boolean {
  return getServerIdForExtension(extension) !== null;
}

/**
 * Get the command to run for a server, adjusting for the current platform.
 */
export function getServerCommand(serverId: string): string[] | null {
  const config = getServerConfig(serverId);
  if (!config) {
    return null;
  }

  const command = [...config.command];

  // On Windows, we may need to add .cmd or .exe extension
  if (os.platform() === 'win32') {
    const executable = command[0];
    // Check if it's a known npm package that needs .cmd extension
    const npmPackages = [
      'typescript-language-server',
      'pyright-langserver',
      'solargraph',
    ];
    if (npmPackages.includes(executable)) {
      command[0] = `${executable}.cmd`;
    }
  }

  return command;
}

/**
 * Get the environment variables for a server.
 */
export function getServerEnv(
  serverId: string,
): Record<string, string> | undefined {
  const config = getServerConfig(serverId);
  return config?.env;
}

/**
 * Get the initialization options for a server.
 */
export function getServerInitOptions(
  serverId: string,
): Record<string, unknown> | undefined {
  const config = getServerConfig(serverId);
  return config?.initialization;
}

/**
 * List all available server IDs.
 */
export function listServerIds(): string[] {
  return Object.keys(BUILTIN_SERVERS);
}

/**
 * Get a human-readable description of supported languages.
 */
export function getSupportedLanguagesDescription(): string {
  const languages = listServerIds().map((id) => {
    const config = BUILTIN_SERVERS[id];
    return `${id} (${config.extensions.join(', ')})`;
  });
  return languages.join(', ');
}
