# PRD-05 Implementation Report: AST-Grep Code Search

> **Branch:** `ast-grep-code-search`  
> **Commit:** `604c851d`  
> **Date:** January 25, 2026  
> **Status:** Complete

---

## Summary

This implementation adds AST-aware code search and replace capabilities to
gemini-cli via the ast-grep CLI tool. The feature enables:

1. **Pattern-based code search** (`ast_grep_search`) using meta-variables
   ($VAR, $$$)
2. **Safe code replacement** (`ast_grep_replace`) with dry-run default
3. **25 language support** via ast-grep's tree-sitter grammars
4. **Binary auto-discovery** across PATH, npm, and Homebrew installations

---

## Implementation vs PRD Requirements

| PRD Requirement                      | Implementation Status | Notes                                |
| ------------------------------------ | --------------------- | ------------------------------------ |
| AST-aware search with meta-variables | ✅ Implemented        | Supports $VAR and $$$ patterns       |
| Replace with dry-run default         | ✅ Implemented        | `dryRun: true` by default for safety |
| 25 language support                  | ✅ Implemented        | All languages from PRD supported     |
| Binary resolution (PATH/npm/brew)    | ✅ Implemented        | 4-level fallback chain               |
| Pattern validation hints             | ✅ Implemented        | Language-specific hints on errors    |
| Output limits (1MB, 500 matches)     | ✅ Implemented        | Truncation with recovery             |
| Timeout handling (5 minutes)         | ✅ Implemented        | With partial result recovery         |
| Seamless grep integration            | ⏳ Deferred           | Pattern detection for auto-routing   |

---

## Files Changed

| File                                               | Lines | Description                   |
| -------------------------------------------------- | ----- | ----------------------------- |
| `packages/core/src/tools/ast-grep/index.ts`        | 19    | Public API exports            |
| `packages/core/src/tools/ast-grep/constants.ts`    | 158   | Languages, binary resolution  |
| `packages/core/src/tools/ast-grep/cli.ts`          | 320   | CLI execution, output parsing |
| `packages/core/src/tools/ast-grep/search.ts`       | 261   | Search tool implementation    |
| `packages/core/src/tools/ast-grep/replace.ts`      | 296   | Replace tool with dry-run     |
| `packages/core/src/tools/ast-grep/cli.test.ts`     | 297   | CLI unit tests                |
| `packages/core/src/tools/ast-grep/search.test.ts`  | 328   | Search tool tests             |
| `packages/core/src/tools/ast-grep/replace.test.ts` | 494   | Replace tool tests            |
| `packages/core/src/tools/tool-names.ts`            | +4    | Tool name constants           |
| `packages/core/src/tools/tool-error.ts`            | +4    | Error type enums              |
| `packages/core/src/config/config.ts`               | +6    | Tool registration             |

**Total: 11 files, +2,181 lines**

---

## New APIs

### Tools

```typescript
// AST-aware code search
ast_grep_search({
  pattern: string,           // AST pattern with meta-variables
  lang: AstGrepLanguage,     // Target language (required)
  paths?: string[],          // Search paths
  globs?: string[],          // File filters
  context?: number           // Context lines
}) → formatted match results

// AST-aware code replace
ast_grep_replace({
  pattern: string,           // Pattern to match
  rewrite: string,           // Replacement pattern
  lang: AstGrepLanguage,     // Target language
  paths?: string[],          // Search paths
  globs?: string[],          // File filters
  dryRun?: boolean           // Preview only (default: true)
}) → formatted change preview/results
```

### Supported Languages

```typescript
type AstGrepLanguage =
  | 'bash'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'css'
  | 'elixir'
  | 'go'
  | 'haskell'
  | 'html'
  | 'java'
  | 'javascript'
  | 'json'
  | 'kotlin'
  | 'lua'
  | 'nix'
  | 'php'
  | 'python'
  | 'ruby'
  | 'rust'
  | 'scala'
  | 'solidity'
  | 'swift'
  | 'typescript'
  | 'tsx'
  | 'yaml';
```

### Error Types

```typescript
enum ToolErrorType {
  AST_GREP_BINARY_NOT_FOUND = 'ast_grep_binary_not_found',
  AST_GREP_EXECUTION_ERROR = 'ast_grep_execution_error',
}
```

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Config (config.ts)                    │
│  Registers AstGrepSearchTool & AstGrepReplaceTool       │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
┌───────▼──────────────┐    ┌────────▼──────────────┐
│ AstGrepSearchTool    │    │ AstGrepReplaceTool    │
│ (BaseDeclarativeTool)│    │ (BaseDeclarativeTool) │
└───────┬──────────────┘    └────────┬──────────────┘
        │                            │
        └──────────────┬─────────────┘
                       │
        ┌──────────────▼──────────────┐
        │  CLI Module (cli.ts)        │
        │  - runSg(options)           │
        │  - buildArgs()              │
        │  - parseOutput()            │
        └──────────────┬───────────────┘
                       │
        ┌──────────────▼──────────────┐
        │  Constants (constants.ts)   │
        │  - AST_GREP_LANGUAGES       │
        │  - getSgCliPath()           │
        └──────────────────────────────┘
```

### Binary Resolution Chain

```
1. PATH: Check for 'sg' or 'ast-grep' in system PATH
2. npm: Check common npm global paths
   - /usr/local/bin/sg
   - ~/.npm-global/bin/sg
   - %APPDATA%\npm\sg.cmd (Windows)
3. Homebrew: Check brew installation paths
   - /opt/homebrew/bin/sg
   - /usr/local/bin/sg
   - /opt/homebrew/Cellar/ast-grep/*/bin/sg
4. Return null if not found → provide installation instructions
```

### Key Implementation

```typescript
// packages/core/src/tools/ast-grep/cli.ts

export async function runSg(options: RunSgOptions): Promise<SgResult> {
  const binaryPath = getSgCliPath();

  if (!binaryPath) {
    return {
      success: false,
      matches: [],
      binaryNotFound: true,
      error: getInstallInstructions(),
    };
  }

  const args = buildArgs(options);
  // sg run -p <pattern> --lang <lang> --json=compact [options] [paths]

  const proc = spawn(binaryPath, args, {
    cwd: options.cwd || process.cwd(),
    timeout: TIMEOUT_MS, // 5 minutes
  });

  // Handle output with size limits (1MB max)
  // Parse JSON array of matches
  // Handle truncation gracefully

  return {
    success: true,
    matches: parsedMatches,
    truncated: outputTruncated,
  };
}
```

### Safety Features

```typescript
// packages/core/src/tools/ast-grep/replace.ts

async execute(signal: AbortSignal): Promise<ToolResult> {
  // SAFETY: Only apply changes if explicitly dryRun=false
  const applyChanges = this.params.dryRun === false;

  const result = await runSg({
    pattern: this.params.pattern,
    rewrite: this.params.rewrite,
    lang: this.params.lang,
    updateAll: applyChanges,  // Only true when dryRun explicitly false
    // ...
  });

  // Output includes [DRY RUN] prefix and reminder message
  // when not actually applying changes
}
```

---

## Test Coverage

**55 tests total** across 3 test files

| Test File         | Tests | Coverage                                                         |
| ----------------- | ----- | ---------------------------------------------------------------- |
| `cli.test.ts`     | 13    | Binary resolution, argument building, output parsing, truncation |
| `search.test.ts`  | 20+   | Parameter validation, execution, formatting, error handling      |
| `replace.test.ts` | 25+   | Dry-run safety, parameter validation, formatting, file changes   |

### Test Examples

```typescript
describe('ast_grep_replace dry-run safety', () => {
  it('should default to dry-run mode', async () => {
    const tool = new AstGrepReplaceTool(mockConfig);
    const invocation = tool.invoke({
      pattern: 'console.log($MSG)',
      rewrite: 'logger.info($MSG)',
      lang: 'typescript',
      // Note: dryRun not specified
    });

    const result = await invocation.execute(new AbortController().signal);

    // Verify runSg was called with updateAll: false
    expect(mockRunSg).toHaveBeenCalledWith(
      expect.objectContaining({ updateAll: false }),
    );
    expect(result.llmContent).toContain('[DRY RUN]');
  });

  it('should only apply changes when dryRun explicitly false', async () => {
    const invocation = tool.invoke({
      pattern: 'console.log($MSG)',
      rewrite: 'logger.info($MSG)',
      lang: 'typescript',
      dryRun: false, // Explicit opt-in required
    });

    // Verify runSg was called with updateAll: true
    expect(mockRunSg).toHaveBeenCalledWith(
      expect.objectContaining({ updateAll: true }),
    );
  });
});
```

---

## Usage Examples

### 1. Find All Console Logs

```typescript
ast_grep_search({
  pattern: 'console.log($MSG)',
  lang: 'typescript',
  paths: ['./src'],
});
// Output: Grouped matches by file with line:column positions
```

### 2. Find Async Functions

```typescript
ast_grep_search({
  pattern: 'async function $NAME($$$) { $$$ }',
  lang: 'javascript',
  globs: ['*.js', '!*.test.js'],
});
```

### 3. Preview Console.log → Logger Migration

```typescript
ast_grep_replace({
  pattern: 'console.log($MSG)',
  rewrite: 'logger.info($MSG)',
  lang: 'typescript',
  // dryRun defaults to true - preview only
});
// Output: [DRY RUN] Changes preview with before/after diff
```

### 4. Apply Changes (Requires Explicit Opt-in)

```typescript
ast_grep_replace({
  pattern: 'console.log($MSG)',
  rewrite: 'logger.info($MSG)',
  lang: 'typescript',
  dryRun: false, // Explicitly apply changes
});
// Output: Applied changes with summary
```

---

## Deferred Work

The following PRD requirements were not implemented and are deferred to future
work:

1. **Seamless grep integration**: Auto-detect AST patterns and route to ast-grep
2. **Pattern detection heuristics**: Distinguish code patterns from regex
   patterns
3. **Language auto-detection**: Infer language from file extensions in
   globs/paths

---

## Verification

```bash
# Run tests
cd packages/core
npm test -- src/tools/ast-grep/

# Results
✓ 55 tests passed
✓ TypeScript typecheck passes
✓ Pre-commit hooks pass
```
