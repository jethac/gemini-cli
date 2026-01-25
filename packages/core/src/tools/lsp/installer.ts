/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { GEMINI_DIR, homedir } from '../../utils/paths.js';

/** Directory where managed LSP servers are installed. */
const LSP_SERVERS_DIR = path.join(homedir(), GEMINI_DIR, 'lsp-servers');

/**
 * Configuration for installing a language server.
 */
export interface ServerInstallConfig {
  /** npm package name (for npm-based servers). */
  npmPackage?: string;
  /** Binary name to look for in PATH first. */
  binaryName: string;
  /** Human-readable install instructions. */
  installInstructions?: string;
}

/**
 * Installation configurations for supported language servers.
 */
export const SERVER_INSTALL_CONFIGS: Record<string, ServerInstallConfig> = {
  typescript: {
    npmPackage: 'typescript-language-server',
    binaryName: 'typescript-language-server',
    installInstructions: 'npm install -g typescript-language-server typescript',
  },
  python: {
    npmPackage: 'pyright',
    binaryName: 'pyright-langserver',
    installInstructions: 'npm install -g pyright',
  },
  // go and rust use system binaries - don't auto-download
  go: {
    binaryName: 'gopls',
    installInstructions: 'go install golang.org/x/tools/gopls@latest',
  },
  rust: {
    binaryName: 'rust-analyzer',
    installInstructions: 'rustup component add rust-analyzer',
  },
  java: {
    binaryName: 'jdtls',
    installInstructions: 'Install Eclipse JDT Language Server from https://github.com/eclipse/eclipse.jdt.ls',
  },
  csharp: {
    binaryName: 'OmniSharp',
    installInstructions: 'Install OmniSharp from https://github.com/OmniSharp/omnisharp-roslyn',
  },
  cpp: {
    binaryName: 'clangd',
    installInstructions: 'Install clangd from https://clangd.llvm.org/installation',
  },
  lua: {
    binaryName: 'lua-language-server',
    installInstructions: 'Install lua-language-server from https://github.com/LuaLS/lua-language-server',
  },
  ruby: {
    binaryName: 'solargraph',
    installInstructions: 'gem install solargraph',
  },
  php: {
    binaryName: 'phpactor',
    installInstructions: 'Install phpactor from https://phpactor.readthedocs.io/',
  },
};

/**
 * Check if a file exists.
 */
async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find a binary in the system PATH.
 */
async function findInPath(binaryName: string): Promise<string | null> {
  const isWindows = process.platform === 'win32';
  const pathEnv = process.env['PATH'] || '';
  const pathSeparator = isWindows ? ';' : ':';
  const extensions = isWindows ? ['.cmd', '.exe', '.bat', ''] : [''];

  const paths = pathEnv.split(pathSeparator);

  for (const dir of paths) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, binaryName + ext);
      if (await exists(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Run npm install in a directory.
 */
async function npmInstall(pkg: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const npmCmd = isWindows ? 'npm.cmd' : 'npm';

    const proc = spawn(npmCmd, ['install', pkg], {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (error) => {
      reject(new Error(`npm install failed: ${error.message}`));
    });
  });
}

/**
 * Get the path to a managed server binary.
 */
function getManagedBinaryPath(serverId: string, binaryName: string): string {
  const isWindows = process.platform === 'win32';
  const binDir = path.join(LSP_SERVERS_DIR, serverId, 'node_modules', '.bin');
  const ext = isWindows ? '.cmd' : '';
  return path.join(binDir, binaryName + ext);
}

/**
 * Ensure a language server is installed and return its path.
 * 
 * This function:
 * 1. First checks if the server is available in PATH
 * 2. Then checks if we have a managed installation
 * 3. If npm package is available, auto-installs it
 * 
 * @param serverId The server identifier (e.g., 'typescript', 'python')
 * @returns The path to the server binary, or null if not available
 */
export async function ensureServerInstalled(serverId: string): Promise<string | null> {
  const config = SERVER_INSTALL_CONFIGS[serverId];
  if (!config) {
    return null;
  }

  // 1. Check PATH first
  const pathBinary = await findInPath(config.binaryName);
  if (pathBinary) {
    return pathBinary;
  }

  // 2. Check our managed installation
  const managedPath = getManagedBinaryPath(serverId, config.binaryName);
  if (await exists(managedPath)) {
    return managedPath;
  }

  // 3. Auto-install if npm package available
  if (config.npmPackage) {
    const installDir = path.join(LSP_SERVERS_DIR, serverId);
    await fs.mkdir(installDir, { recursive: true });

    try {
      await npmInstall(config.npmPackage, installDir);
      
      // Verify installation succeeded
      if (await exists(managedPath)) {
        return managedPath;
      }
    } catch (error) {
      // Installation failed, return null
      console.error(`Failed to auto-install ${serverId} language server:`, error);
    }
  }

  return null;
}

/**
 * Get installation instructions for a language server.
 */
export function getInstallInstructions(serverId: string): string {
  const config = SERVER_INSTALL_CONFIGS[serverId];
  if (!config) {
    return `Unknown language server: ${serverId}`;
  }

  return config.installInstructions || `Install the ${serverId} language server`;
}

/**
 * Check if a language server is available (either in PATH or managed).
 */
export async function isServerAvailable(serverId: string): Promise<boolean> {
  const serverPath = await ensureServerInstalled(serverId);
  return serverPath !== null;
}

/**
 * Get the LSP servers directory path.
 */
export function getLspServersDir(): string {
  return LSP_SERVERS_DIR;
}
