# PRD-14 Implementation Report: Project Instructions Hierarchy

> **Branch:** `project-instructions-hierarchy`  
> **Commit:** `06d94523`  
> **Date:** January 25, 2026  
> **Status:** Complete

---

## Summary

This implementation adds override and fallback file support to gemini-cli's
existing hierarchical GEMINI.md discovery system. The feature enables:

1. **Override files** (`GEMINI.override.md`) that take precedence over primary
   files in the same directory
2. **Fallback filenames** (`AGENTS.md`, `CLAUDE.md`) used when no primary file
   is found
3. **Configurable settings** for override and fallback filenames

---

## Implementation vs PRD Requirements

| PRD Requirement                              | Implementation Status | Notes                                                   |
| -------------------------------------------- | --------------------- | ------------------------------------------------------- |
| Hierarchical discovery from repo root to cwd | Already existed       | Enhanced with override/fallback                         |
| Override files replace primary for directory | Implemented           | `GEMINI.override.md` default                            |
| Fallback filenames when primary missing      | Implemented           | First match only per directory                          |
| Configurable via settings                    | Implemented           | `context.overrideFilename`, `context.fallbackFilenames` |
| Size limits with truncation                  | Already existed       | Via `context.discoveryMaxDirs`                          |
| CLI commands (list/show/init)                | Not implemented       | Deferred to future work                                 |

---

## Files Changed

| File                                              | Lines    | Description                                         |
| ------------------------------------------------- | -------- | --------------------------------------------------- |
| `packages/core/src/utils/memoryDiscovery.ts`      | +216/-98 | Core discovery logic with override/fallback support |
| `packages/core/src/tools/memoryTool.ts`           | +52      | New getter/setter functions for override/fallback   |
| `packages/cli/src/config/settingsSchema.ts`       | +25      | New settings for override and fallback filenames    |
| `packages/core/src/utils/memoryDiscovery.test.ts` | +361     | 15 new tests for override/fallback functionality    |

**Total: 4 files, +654 lines**

---

## New APIs

### Settings

```typescript
// ~/.gemini/settings.json or .gemini/settings.json
{
  "context": {
    "overrideFilename": "GEMINI.override.md",    // Default
    "fallbackFilenames": ["AGENTS.md", "CLAUDE.md"]  // Default
  }
}
```

### Exported Functions

```typescript
// packages/core/src/tools/memoryTool.ts

// Override filename management
export function setOverrideFilename(filename: string): void;
export function getOverrideFilename(): string;

// Fallback filenames management
export function setFallbackFilenames(filenames: string[]): void;
export function getFallbackFilenames(): string[];

// Get all possible context filenames (primary + override + fallbacks)
export function getAllContextFilenames(): string[];
```

### Constants

```typescript
export const DEFAULT_OVERRIDE_FILENAME = 'GEMINI.override.md';
export const DEFAULT_FALLBACK_FILENAMES = ['AGENTS.md', 'CLAUDE.md'];
```

---

## Architecture

### File Discovery Priority (per directory)

```
┌─────────────────────────────────────────────────────────────────┐
│  For each directory in hierarchy (root → cwd):                  │
│                                                                 │
│  1. Check OVERRIDE file (GEMINI.override.md)                    │
│     └─ If exists: USE IT, skip primary and fallbacks            │
│                                                                 │
│  2. Check PRIMARY files (GEMINI.md, or configured names)        │
│     └─ If any exist: USE ALL matching primary files             │
│                                                                 │
│  3. Check FALLBACK files (AGENTS.md, CLAUDE.md, ...)            │
│     └─ If any exist: USE FIRST match only                       │
│                                                                 │
│  4. No files found: Continue to next directory                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Implementation

```typescript
// packages/core/src/utils/memoryDiscovery.ts

async function findContextFilesInDir(
  dir: string,
  primaryFilenames: string[],
  overrideFilename: string,
  fallbackFilenames: string[],
  debugMode: boolean,
): Promise<string[]> {
  // 1. Check override first - replaces ALL primary files
  const overridePath = path.join(dir, overrideFilename);
  try {
    await fs.access(overridePath, fsSync.constants.R_OK);
    if (debugMode) logger.debug(`Found override: ${overridePath}`);
    return [overridePath];
  } catch {
    // Override not found, continue
  }

  // 2. Check ALL primary files
  const foundPrimaryFiles: string[] = [];
  for (const primaryFilename of primaryFilenames) {
    const primaryPath = path.join(dir, primaryFilename);
    try {
      await fs.access(primaryPath, fsSync.constants.R_OK);
      foundPrimaryFiles.push(primaryPath);
    } catch {
      // Primary not found, continue
    }
  }
  if (foundPrimaryFiles.length > 0) {
    return foundPrimaryFiles;
  }

  // 3. Check fallback files - only first match
  for (const fallbackFilename of fallbackFilenames) {
    const fallbackPath = path.join(dir, fallbackFilename);
    try {
      await fs.access(fallbackPath, fsSync.constants.R_OK);
      if (debugMode) logger.debug(`Found fallback: ${fallbackPath}`);
      return [fallbackPath];
    } catch {
      // Fallback not found, continue
    }
  }

  return [];
}
```

---

## Test Coverage

**44 tests total** (29 existing + 15 new)

### New Tests Added

| Test Category                           | Count | Description                                         |
| --------------------------------------- | ----- | --------------------------------------------------- |
| Override file support                   | 4     | Override takes precedence, override in subdirectory |
| Fallback file support                   | 7     | First fallback used, fallback only when no primary  |
| Override + fallback priority            | 2     | Override > primary > fallback ordering              |
| loadGlobalMemory with override/fallback | 2     | Global memory respects override/fallback            |

### Test Examples

```typescript
describe('override file support', () => {
  it('should use override file instead of primary when both exist', async () => {
    // Create both files
    await fs.writeFile(path.join(tempDir, 'GEMINI.md'), 'primary content');
    await fs.writeFile(path.join(tempDir, 'GEMINI.override.md'), 'override content');

    const result = await loadServerHierarchicalMemory(tempDir, ...);

    expect(result.memoryContent).toContain('override content');
    expect(result.memoryContent).not.toContain('primary content');
  });
});

describe('fallback file support', () => {
  it('should use first fallback when no primary exists', async () => {
    // Create only fallback file
    await fs.writeFile(path.join(tempDir, 'AGENTS.md'), 'agents content');

    const result = await loadServerHierarchicalMemory(tempDir, ...);

    expect(result.memoryContent).toContain('agents content');
  });

  it('should use primary over fallback when both exist', async () => {
    await fs.writeFile(path.join(tempDir, 'GEMINI.md'), 'primary content');
    await fs.writeFile(path.join(tempDir, 'AGENTS.md'), 'agents content');

    const result = await loadServerHierarchicalMemory(tempDir, ...);

    expect(result.memoryContent).toContain('primary content');
    expect(result.memoryContent).not.toContain('agents content');
  });
});
```

---

## Usage Examples

### 1. Personal Override (gitignored)

```bash
# .gitignore
GEMINI.override.md

# GEMINI.override.md (local only)
## My Preferences
- I prefer verbose comments
- Use console.log for debugging
```

### 2. Migration from AGENTS.md

Projects with existing `AGENTS.md` files will automatically work:

```
my-project/
├── AGENTS.md          # ← Automatically loaded as fallback
└── src/
    └── AGENTS.md      # ← Also loaded for src/ context
```

### 3. Custom Configuration

```json
// .gemini/settings.json
{
  "context": {
    "overrideFilename": "LOCAL.md",
    "fallbackFilenames": ["PROJECT.md", "README.md"]
  }
}
```

---

## Deferred Work

The following PRD requirements were not implemented and are deferred to future
work:

1. **CLI Commands**: `gemini project-docs list/show/init`
2. **Template Generator**: Auto-generate GEMINI.md from project structure
3. **Migration Script**: Migrate from `.gemini/CONTEXT.md` to `GEMINI.md`

---

## Verification

```bash
# Run tests
cd packages/core
npm test -- src/utils/memoryDiscovery.test.ts

# Results
✓ 44 tests passed
✓ TypeScript typecheck passes
✓ Pre-commit hooks pass
```
