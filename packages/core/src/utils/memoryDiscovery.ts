/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { bfsFileSearch } from './bfsFileSearch.js';
import {
  getAllGeminiMdFilenames,
  getOverrideFilename,
  getFallbackFilenames,
} from '../tools/memoryTool.js';
import type { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { processImports } from './memoryImportProcessor.js';
import type { FileFilteringOptions } from '../config/constants.js';
import { DEFAULT_MEMORY_FILE_FILTERING_OPTIONS } from '../config/constants.js';
import { GEMINI_DIR, homedir } from './paths.js';
import type { ExtensionLoader } from './extensionLoader.js';
import { debugLogger } from './debugLogger.js';
import type { Config } from '../config/config.js';
import { CoreEvent, coreEvents } from './events.js';

// Simple console logger, similar to the one previously in CLI's config.ts
// TODO: Integrate with a more robust server-side logger if available/appropriate.
const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) =>
    debugLogger.debug('[DEBUG] [MemoryDiscovery]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (...args: any[]) =>
    debugLogger.warn('[WARN] [MemoryDiscovery]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) =>
    debugLogger.error('[ERROR] [MemoryDiscovery]', ...args),
};

export interface GeminiFileContent {
  filePath: string;
  content: string | null;
}

async function findProjectRoot(startDir: string): Promise<string | null> {
  let currentDir = path.resolve(startDir);
  while (true) {
    const gitPath = path.join(currentDir, '.git');
    try {
      const stats = await fs.lstat(gitPath);
      if (stats.isDirectory()) {
        return currentDir;
      }
    } catch (error: unknown) {
      // Don't log ENOENT errors as they're expected when .git doesn't exist
      // Also don't log errors in test environments, which often have mocked fs
      const isENOENT =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'ENOENT';

      // Only log unexpected errors in non-test environments
      // process.env['NODE_ENV'] === 'test' or VITEST are common test indicators
      const isTestEnv =
        process.env['NODE_ENV'] === 'test' || process.env['VITEST'];

      if (!isENOENT && !isTestEnv) {
        if (typeof error === 'object' && error !== null && 'code' in error) {
          const fsError = error as { code: string; message: string };
          logger.warn(
            `Error checking for .git directory at ${gitPath}: ${fsError.message}`,
          );
        } else {
          logger.warn(
            `Non-standard error checking for .git directory at ${gitPath}: ${String(error)}`,
          );
        }
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

async function getGeminiMdFilePathsInternal(
  currentWorkingDirectory: string,
  includeDirectoriesToReadGemini: readonly string[],
  userHomePath: string,
  debugMode: boolean,
  fileService: FileDiscoveryService,
  folderTrust: boolean,
  fileFilteringOptions: FileFilteringOptions,
  maxDirs: number,
): Promise<string[]> {
  const dirs = new Set<string>([
    ...includeDirectoriesToReadGemini,
    currentWorkingDirectory,
  ]);

  // Process directories in parallel with concurrency limit to prevent EMFILE errors
  const CONCURRENT_LIMIT = 10;
  const dirsArray = Array.from(dirs);
  const pathsArrays: string[][] = [];

  for (let i = 0; i < dirsArray.length; i += CONCURRENT_LIMIT) {
    const batch = dirsArray.slice(i, i + CONCURRENT_LIMIT);
    const batchPromises = batch.map((dir) =>
      getGeminiMdFilePathsInternalForEachDir(
        dir,
        userHomePath,
        debugMode,
        fileService,
        folderTrust,
        fileFilteringOptions,
        maxDirs,
      ),
    );

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        pathsArrays.push(result.value);
      } else {
        const error = result.reason;
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error discovering files in directory: ${message}`);
        // Continue processing other directories
      }
    }
  }

  const paths = pathsArrays.flat();
  return Array.from(new Set<string>(paths));
}

/**
 * Finds context files for a given directory.
 * Priority order:
 * 1. Override file (e.g., GEMINI.override.md) - replaces ALL primary files for this directory
 * 2. Primary files (e.g., GEMINI.md) - ALL matching primary files are loaded
 * 3. First matching fallback file (e.g., AGENTS.md, CLAUDE.md) - only if NO primary files found
 *
 * Returns array of paths to matching files, or empty array if none found.
 */
async function findContextFilesInDir(
  dir: string,
  primaryFilenames: string[],
  overrideFilename: string,
  fallbackFilenames: string[],
  debugMode: boolean,
): Promise<string[]> {
  // Check for override file first - it replaces ALL primary files for this directory
  const overridePath = path.join(dir, overrideFilename);
  try {
    await fs.access(overridePath, fsSync.constants.R_OK);
    if (debugMode) {
      logger.debug(`Found override file: ${overridePath}`);
    }
    return [overridePath];
  } catch {
    // Override not found, continue to primary
  }

  // Check for ALL primary files
  const foundPrimaryFiles: string[] = [];
  for (const primaryFilename of primaryFilenames) {
    const primaryPath = path.join(dir, primaryFilename);
    try {
      await fs.access(primaryPath, fsSync.constants.R_OK);
      if (debugMode) {
        logger.debug(`Found primary file: ${primaryPath}`);
      }
      foundPrimaryFiles.push(primaryPath);
    } catch {
      // Primary not found, continue
    }
  }

  // If any primary files found, return them all
  if (foundPrimaryFiles.length > 0) {
    return foundPrimaryFiles;
  }

  // Check for fallback files - only use first matching
  for (const fallbackFilename of fallbackFilenames) {
    const fallbackPath = path.join(dir, fallbackFilename);
    try {
      await fs.access(fallbackPath, fsSync.constants.R_OK);
      if (debugMode) {
        logger.debug(`Found fallback file: ${fallbackPath}`);
      }
      return [fallbackPath];
    } catch {
      // Fallback not found, continue
    }
  }

  return [];
}

async function getGeminiMdFilePathsInternalForEachDir(
  dir: string,
  userHomePath: string,
  debugMode: boolean,
  fileService: FileDiscoveryService,
  folderTrust: boolean,
  fileFilteringOptions: FileFilteringOptions,
  maxDirs: number,
): Promise<string[]> {
  const allPaths = new Set<string>();
  const geminiMdFilenames = getAllGeminiMdFilenames();
  const overrideFilename = getOverrideFilename();
  const fallbackFilenames = getFallbackFilenames();

  const resolvedHome = path.resolve(userHomePath);

  // Check global directory for context files
  const globalDir = path.join(resolvedHome, GEMINI_DIR);
  const globalContextFiles = await findContextFilesInDir(
    globalDir,
    geminiMdFilenames,
    overrideFilename,
    fallbackFilenames,
    debugMode,
  );
  for (const globalContextFile of globalContextFiles) {
    allPaths.add(globalContextFile);
    if (debugMode) {
      logger.debug(`Found global context file: ${globalContextFile}`);
    }
  }

  // FIX: Only perform the workspace search (upward and downward scans)
  // if a valid currentWorkingDirectory is provided.
  if (dir && folderTrust) {
    const resolvedCwd = path.resolve(dir);
    if (debugMode)
      logger.debug(
        `Searching for context files starting from CWD: ${resolvedCwd}`,
      );

    const projectRoot = await findProjectRoot(resolvedCwd);
    if (debugMode)
      logger.debug(`Determined project root: ${projectRoot ?? 'None'}`);

    const upwardPaths: string[] = [];
    let currentDir = resolvedCwd;
    const ultimateStopDir = projectRoot
      ? path.dirname(projectRoot)
      : path.dirname(resolvedHome);

    // Track directories we've already processed to avoid duplicates
    const processedDirs = new Set<string>();

    while (currentDir && currentDir !== path.dirname(currentDir)) {
      if (currentDir === path.join(resolvedHome, GEMINI_DIR)) {
        break;
      }

      if (!processedDirs.has(currentDir)) {
        processedDirs.add(currentDir);

        const contextFiles = await findContextFilesInDir(
          currentDir,
          geminiMdFilenames,
          overrideFilename,
          fallbackFilenames,
          debugMode,
        );

        for (const contextFile of contextFiles) {
          if (!globalContextFiles.includes(contextFile)) {
            upwardPaths.unshift(contextFile);
          }
        }
      }

      if (currentDir === ultimateStopDir) {
        break;
      }

      currentDir = path.dirname(currentDir);
    }
    upwardPaths.forEach((p) => allPaths.add(p));

    const mergedOptions: FileFilteringOptions = {
      ...DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
      ...fileFilteringOptions,
    };

    // For downward search, we need to search for all possible filenames
    // and then filter to get the best one per directory
    const allFilenames = [
      ...geminiMdFilenames,
      overrideFilename,
      ...fallbackFilenames,
    ];
    const uniqueFilenames = [...new Set(allFilenames)];

    // Collect all found files grouped by directory
    const filesByDir = new Map<string, string[]>();

    for (const filename of uniqueFilenames) {
      const downwardPaths = await bfsFileSearch(resolvedCwd, {
        fileName: filename,
        maxDirs,
        debug: debugMode,
        fileService,
        fileFilteringOptions: mergedOptions,
      });

      for (const filePath of downwardPaths) {
        const fileDir = path.dirname(filePath);
        if (!filesByDir.has(fileDir)) {
          filesByDir.set(fileDir, []);
        }
        filesByDir.get(fileDir)!.push(filePath);
      }
    }

    // For each directory, select the best files based on priority
    for (const fileDir of filesByDir.keys()) {
      // Skip directories we already processed in upward search
      if (processedDirs.has(fileDir)) {
        continue;
      }

      const contextFiles = await findContextFilesInDir(
        fileDir,
        geminiMdFilenames,
        overrideFilename,
        fallbackFilenames,
        debugMode,
      );

      for (const contextFile of contextFiles) {
        allPaths.add(contextFile);
      }
    }
  }

  const finalPaths = Array.from(allPaths);

  if (debugMode)
    logger.debug(
      `Final ordered context file paths to read: ${JSON.stringify(finalPaths)}`,
    );
  return finalPaths;
}

async function readGeminiMdFiles(
  filePaths: string[],
  debugMode: boolean,
  importFormat: 'flat' | 'tree' = 'tree',
): Promise<GeminiFileContent[]> {
  // Process files in parallel with concurrency limit to prevent EMFILE errors
  const CONCURRENT_LIMIT = 20; // Higher limit for file reads as they're typically faster
  const results: GeminiFileContent[] = [];

  for (let i = 0; i < filePaths.length; i += CONCURRENT_LIMIT) {
    const batch = filePaths.slice(i, i + CONCURRENT_LIMIT);
    const batchPromises = batch.map(
      async (filePath): Promise<GeminiFileContent> => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');

          // Process imports in the content
          const processedResult = await processImports(
            content,
            path.dirname(filePath),
            debugMode,
            undefined,
            undefined,
            importFormat,
          );
          if (debugMode)
            logger.debug(
              `Successfully read and processed imports: ${filePath} (Length: ${processedResult.content.length})`,
            );

          return { filePath, content: processedResult.content };
        } catch (error: unknown) {
          const isTestEnv =
            process.env['NODE_ENV'] === 'test' || process.env['VITEST'];
          if (!isTestEnv) {
            const message =
              error instanceof Error ? error.message : String(error);
            logger.warn(
              `Warning: Could not read ${getAllGeminiMdFilenames()} file at ${filePath}. Error: ${message}`,
            );
          }
          if (debugMode) logger.debug(`Failed to read: ${filePath}`);
          return { filePath, content: null }; // Still include it with null content
        }
      },
    );

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // This case shouldn't happen since we catch all errors above,
        // but handle it for completeness
        const error = result.reason;
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Unexpected error processing file: ${message}`);
      }
    }
  }

  return results;
}

export function concatenateInstructions(
  instructionContents: GeminiFileContent[],
  // CWD is needed to resolve relative paths for display markers
  currentWorkingDirectoryForDisplay: string,
): string {
  return instructionContents
    .filter((item) => typeof item.content === 'string')
    .map((item) => {
      const trimmedContent = (item.content as string).trim();
      if (trimmedContent.length === 0) {
        return null;
      }
      const displayPath = path.isAbsolute(item.filePath)
        ? path.relative(currentWorkingDirectoryForDisplay, item.filePath)
        : item.filePath;
      return `--- Context from: ${displayPath} ---\n${trimmedContent}\n--- End of Context from: ${displayPath} ---`;
    })
    .filter((block): block is string => block !== null)
    .join('\n\n');
}

export interface MemoryLoadResult {
  files: Array<{ path: string; content: string }>;
}

export async function loadGlobalMemory(
  debugMode: boolean = false,
): Promise<MemoryLoadResult> {
  const userHome = homedir();
  const geminiMdFilenames = getAllGeminiMdFilenames();
  const overrideFilename = getOverrideFilename();
  const fallbackFilenames = getFallbackFilenames();
  const globalDir = path.join(userHome, GEMINI_DIR);

  // Find context files in the global directory
  const contextFiles = await findContextFilesInDir(
    globalDir,
    geminiMdFilenames,
    overrideFilename,
    fallbackFilenames,
    debugMode,
  );

  if (contextFiles.length === 0) {
    debugLogger.debug('No global memory file was found.');
    return { files: [] };
  }

  if (debugMode) {
    logger.debug(`Found global memory files: ${contextFiles.join(', ')}`);
  }

  const contents = await readGeminiMdFiles(contextFiles, debugMode, 'tree');

  return {
    files: contents
      .filter((item) => item.content !== null)
      .map((item) => ({
        path: item.filePath,
        content: item.content as string,
      })),
  };
}

/**
 * Traverses upward from startDir to stopDir, finding context files.
 *
 * Uses override/fallback priority: override > primary > fallbacks.
 * Override replaces all primary files; fallback only used if no primary found.
 * Files are ordered by directory level (root to leaf).
 */
async function findUpwardGeminiFiles(
  startDir: string,
  stopDir: string,
  debugMode: boolean,
): Promise<string[]> {
  const upwardPaths: string[] = [];
  let currentDir = path.resolve(startDir);
  const resolvedStopDir = path.resolve(stopDir);
  const geminiMdFilenames = getAllGeminiMdFilenames();
  const overrideFilename = getOverrideFilename();
  const fallbackFilenames = getFallbackFilenames();
  const globalGeminiDir = path.join(homedir(), GEMINI_DIR);

  if (debugMode) {
    logger.debug(
      `Starting upward search from ${currentDir} stopping at ${resolvedStopDir}`,
    );
  }

  while (true) {
    if (currentDir === globalGeminiDir) {
      break;
    }

    // Find context files for this directory
    const contextFiles = await findContextFilesInDir(
      currentDir,
      geminiMdFilenames,
      overrideFilename,
      fallbackFilenames,
      debugMode,
    );

    // Add files in reverse order so they end up in correct order after unshift
    for (let i = contextFiles.length - 1; i >= 0; i--) {
      upwardPaths.unshift(contextFiles[i]);
    }

    if (
      currentDir === resolvedStopDir ||
      currentDir === path.dirname(currentDir)
    ) {
      break;
    }
    currentDir = path.dirname(currentDir);
  }
  return upwardPaths;
}

export async function loadEnvironmentMemory(
  trustedRoots: string[],
  extensionLoader: ExtensionLoader,
  debugMode: boolean = false,
): Promise<MemoryLoadResult> {
  const allPaths = new Set<string>();

  // Trusted Roots Upward Traversal (Parallelized)
  const traversalPromises = trustedRoots.map(async (root) => {
    const resolvedRoot = path.resolve(root);
    if (debugMode) {
      logger.debug(
        `Loading environment memory for trusted root: ${resolvedRoot} (Stopping exactly here)`,
      );
    }
    return findUpwardGeminiFiles(resolvedRoot, resolvedRoot, debugMode);
  });

  const pathArrays = await Promise.all(traversalPromises);
  pathArrays.flat().forEach((p) => allPaths.add(p));

  // Extensions
  const extensionPaths = extensionLoader
    .getExtensions()
    .filter((ext) => ext.isActive)
    .flatMap((ext) => ext.contextFiles);
  extensionPaths.forEach((p) => allPaths.add(p));

  const sortedPaths = Array.from(allPaths).sort();
  const contents = await readGeminiMdFiles(sortedPaths, debugMode, 'tree');

  return {
    files: contents
      .filter((item) => item.content !== null)
      .map((item) => ({
        path: item.filePath,
        content: item.content as string,
      })),
  };
}

export interface LoadServerHierarchicalMemoryResponse {
  memoryContent: string;
  fileCount: number;
  filePaths: string[];
}

/**
 * Loads hierarchical GEMINI.md files and concatenates their content.
 * This function is intended for use by the server.
 */
export async function loadServerHierarchicalMemory(
  currentWorkingDirectory: string,
  includeDirectoriesToReadGemini: readonly string[],
  debugMode: boolean,
  fileService: FileDiscoveryService,
  extensionLoader: ExtensionLoader,
  folderTrust: boolean,
  importFormat: 'flat' | 'tree' = 'tree',
  fileFilteringOptions?: FileFilteringOptions,
  maxDirs: number = 200,
): Promise<LoadServerHierarchicalMemoryResponse> {
  // FIX: Use real, canonical paths for a reliable comparison to handle symlinks.
  const realCwd = await fs.realpath(path.resolve(currentWorkingDirectory));
  const realHome = await fs.realpath(path.resolve(homedir()));
  const isHomeDirectory = realCwd === realHome;

  // If it is the home directory, pass an empty string to the core memory
  // function to signal that it should skip the workspace search.
  currentWorkingDirectory = isHomeDirectory ? '' : currentWorkingDirectory;

  if (debugMode)
    logger.debug(
      `Loading server hierarchical memory for CWD: ${currentWorkingDirectory} (importFormat: ${importFormat})`,
    );

  // For the server, homedir() refers to the server process's home.
  // This is consistent with how MemoryTool already finds the global path.
  const userHomePath = homedir();
  const filePaths = await getGeminiMdFilePathsInternal(
    currentWorkingDirectory,
    includeDirectoriesToReadGemini,
    userHomePath,
    debugMode,
    fileService,
    folderTrust,
    fileFilteringOptions || DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
    maxDirs,
  );

  // Add extension file paths separately since they may be conditionally enabled.
  filePaths.push(
    ...extensionLoader
      .getExtensions()
      .filter((ext) => ext.isActive)
      .flatMap((ext) => ext.contextFiles),
  );

  if (filePaths.length === 0) {
    if (debugMode)
      logger.debug('No GEMINI.md files found in hierarchy of the workspace.');
    return { memoryContent: '', fileCount: 0, filePaths: [] };
  }
  const contentsWithPaths = await readGeminiMdFiles(
    filePaths,
    debugMode,
    importFormat,
  );
  // Pass CWD for relative path display in concatenated content
  const combinedInstructions = concatenateInstructions(
    contentsWithPaths,
    currentWorkingDirectory,
  );
  if (debugMode)
    logger.debug(
      `Combined instructions length: ${combinedInstructions.length}`,
    );
  if (debugMode && combinedInstructions.length > 0)
    logger.debug(
      `Combined instructions (snippet): ${combinedInstructions.substring(0, 500)}...`,
    );
  return {
    memoryContent: combinedInstructions,
    fileCount: contentsWithPaths.length,
    filePaths,
  };
}

/**
 * Loads the hierarchical memory and resets the state of `config` as needed such
 * that it reflects the new memory.
 *
 * Returns the result of the call to `loadHierarchicalGeminiMemory`.
 */
export async function refreshServerHierarchicalMemory(config: Config) {
  const result = await loadServerHierarchicalMemory(
    config.getWorkingDir(),
    config.shouldLoadMemoryFromIncludeDirectories()
      ? config.getWorkspaceContext().getDirectories()
      : [],
    config.getDebugMode(),
    config.getFileService(),
    config.getExtensionLoader(),
    config.isTrustedFolder(),
    config.getImportFormat(),
    config.getFileFilteringOptions(),
    config.getDiscoveryMaxDirs(),
  );
  const mcpInstructions =
    config.getMcpClientManager()?.getMcpInstructions() || '';
  const finalMemory = [result.memoryContent, mcpInstructions.trimStart()]
    .filter(Boolean)
    .join('\n\n');
  config.setUserMemory(finalMemory);
  config.setGeminiMdFileCount(result.fileCount);
  config.setGeminiMdFilePaths(result.filePaths);
  coreEvents.emit(CoreEvent.MemoryChanged, { fileCount: result.fileCount });
  return result;
}

export async function loadJitSubdirectoryMemory(
  targetPath: string,
  trustedRoots: string[],
  alreadyLoadedPaths: Set<string>,
  debugMode: boolean = false,
): Promise<MemoryLoadResult> {
  const resolvedTarget = path.resolve(targetPath);
  let bestRoot: string | null = null;

  // Find the deepest trusted root that contains the target path
  for (const root of trustedRoots) {
    const resolvedRoot = path.resolve(root);
    if (
      resolvedTarget.startsWith(resolvedRoot) &&
      (!bestRoot || resolvedRoot.length > bestRoot.length)
    ) {
      bestRoot = resolvedRoot;
    }
  }

  if (!bestRoot) {
    if (debugMode) {
      logger.debug(
        `JIT memory skipped: ${resolvedTarget} is not in any trusted root.`,
      );
    }
    return { files: [] };
  }

  if (debugMode) {
    logger.debug(
      `Loading JIT memory for ${resolvedTarget} (Trusted root: ${bestRoot})`,
    );
  }

  // Traverse from target up to the trusted root
  const potentialPaths = await findUpwardGeminiFiles(
    resolvedTarget,
    bestRoot,
    debugMode,
  );

  // Filter out already loaded paths
  const newPaths = potentialPaths.filter((p) => !alreadyLoadedPaths.has(p));

  if (newPaths.length === 0) {
    return { files: [] };
  }

  if (debugMode) {
    logger.debug(`Found new JIT memory files: ${JSON.stringify(newPaths)}`);
  }

  const contents = await readGeminiMdFiles(newPaths, debugMode, 'tree');

  return {
    files: contents
      .filter((item) => item.content !== null)
      .map((item) => ({
        path: item.filePath,
        content: item.content as string,
      })),
  };
}
