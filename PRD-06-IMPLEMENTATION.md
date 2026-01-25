# PRD-06 Implementation Report: Session Management Tools

> **Branch:** `session-management-tools`  
> **Commit:** `da88424e`  
> **Date:** January 25, 2026  
> **Status:** Complete

---

## Summary

This implementation adds session management tools to gemini-cli, enabling users
and agents to list, search, read, and inspect historical sessions. The feature
enables:

1. **Session listing** (`session_list`) with date and project filtering
2. **Full-text search** (`session_search`) across session messages with context
3. **Session reading** (`session_read`) with pagination and optional
   todo/transcript
4. **Session metadata** (`session_info`) with duration, agents, and statistics

---

## Implementation vs PRD Requirements

| PRD Requirement                     | Implementation Status | Notes                                  |
| ----------------------------------- | --------------------- | -------------------------------------- |
| Session listing with filtering      | ✅ Implemented        | Date range, project path, limit        |
| Full-text search with context       | ✅ Implemented        | 50-char context, case-sensitive option |
| Session reading with pagination     | ✅ Implemented        | Message limit, todo/transcript options |
| Session metadata (agents, duration) | ✅ Implemented        | Full SessionInfo with statistics       |
| Search timeout (60s)                | ✅ Implemented        | AbortSignal support                    |
| Max 100 sessions scanned            | ✅ Implemented        | Configurable limit                     |
| Hybrid ranking (recency/relevance)  | ⏳ Deferred           | Currently recency-only                 |
| Session tagging                     | ⏳ Deferred           | Not implemented                        |
| Schema versioning/migration         | ⏳ Deferred           | Not implemented                        |

---

## Files Changed

| File                                                                | Lines | Description                 |
| ------------------------------------------------------------------- | ----- | --------------------------- |
| `packages/core/src/tools/session-management/index.ts`               | 45    | Public API exports          |
| `packages/core/src/tools/session-management/storage.ts`             | 208   | Storage interface and types |
| `packages/core/src/tools/session-management/session-list.ts`        | 203   | List tool implementation    |
| `packages/core/src/tools/session-management/session-search.ts`      | 200   | Search tool implementation  |
| `packages/core/src/tools/session-management/session-read.ts`        | 200   | Read tool implementation    |
| `packages/core/src/tools/session-management/session-info.ts`        | 138   | Info tool implementation    |
| `packages/core/src/tools/session-management/utils.ts`               | 330   | Formatting utilities        |
| `packages/core/src/tools/session-management/session-list.test.ts`   | 183   | List tool tests             |
| `packages/core/src/tools/session-management/session-search.test.ts` | 174   | Search tool tests           |
| `packages/core/src/tools/session-management/session-read.test.ts`   | 181   | Read tool tests             |
| `packages/core/src/tools/session-management/session-info.test.ts`   | 188   | Info tool tests             |
| `packages/core/src/tools/session-management/utils.test.ts`          | 210   | Utility tests               |
| `packages/core/src/tools/tool-names.ts`                             | +10   | Tool name constants         |
| `packages/core/src/index.ts`                                        | +1    | Module export               |

**Total: 14 files, +2,271 lines**

---

## New APIs

### Tools

```typescript
// List sessions with filtering
session_list({
  limit?: number,              // Max sessions to return
  from_date?: string,          // ISO 8601 date filter
  to_date?: string,            // ISO 8601 date filter
  project_path?: string        // Filter by project
}) → formatted session table

// Search session contents
session_search({
  query: string,               // Search query (required)
  session_id?: string,         // Search specific session
  case_sensitive?: boolean,    // Default: false
  limit?: number               // Max results (default: 20, max: 100)
}) → formatted search results with context

// Read session messages
session_read({
  session_id: string,          // Session ID (required)
  include_todos?: boolean,     // Include todo list
  include_transcript?: boolean,// Include transcript
  limit?: number               // Max messages
}) → formatted session messages

// Get session metadata
session_info({
  session_id: string           // Session ID (required)
}) → formatted session info
```

### Storage Interface

```typescript
interface SessionStorage {
  listSessions(filter?: SessionFilter): Promise<SessionSummary[]>;
  getSession(id: string): Promise<Session | null>;
  getMessages(sessionId: string, limit?: number): Promise<SessionMessage[]>;
  searchMessages(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]>;
  getSessionInfo(id: string): Promise<SessionInfo | null>;
}
```

### Data Types

```typescript
interface SessionSummary {
  id: string;
  fileName: string;
  startTime: string;
  lastUpdated: string;
  messageCount: number;
  displayName: string;
  firstUserMessage?: string;
  summary?: string;
  index: number;
}

interface SessionInfo {
  sessionId: string;
  messageCount: number;
  startTime: string;
  lastUpdated: string;
  duration: string; // Human-readable (e.g., "2 days, 4 hours")
  agentsUsed: string[];
  hasTodos: boolean;
  todoCount: number;
  hasTranscript: boolean;
  transcriptEntryCount: number;
  summary?: string;
  firstUserMessage?: string;
}

interface SearchResult {
  sessionId: string;
  messageId: string;
  role: string;
  before: string; // 50 chars before match
  match: string; // Matched text
  after: string; // 50 chars after match
}
```

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                 Core Package (index.ts)                  │
│  export * from './tools/session-management/index.js'    │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│              Session Management Module                   │
├──────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │ SessionList │  │ SessionSearch│ │ SessionRead │      │
│  │    Tool     │  │    Tool      │ │    Tool     │      │
│  └──────┬──────┘  └──────┬───────┘ └──────┬──────┘      │
│         │                │                │              │
│  ┌──────▼────────────────▼────────────────▼──────┐      │
│  │            SessionStorage Interface            │      │
│  │  - listSessions()  - searchMessages()         │      │
│  │  - getSession()    - getSessionInfo()         │      │
│  └───────────────────────────────────────────────┘      │
│                          │                               │
│  ┌───────────────────────▼───────────────────────┐      │
│  │               Utilities (utils.ts)             │      │
│  │  - formatDate()        - formatSearchResults() │      │
│  │  - calculateDuration() - extractMatchesWithContext()│ │
│  └───────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────┘
```

### Search Implementation

```typescript
// packages/core/src/tools/session-management/session-search.ts

const SEARCH_TIMEOUT_MS = 60_000;  // 60 seconds
const MAX_SESSIONS_TO_SCAN = 100;

async execute(signal: AbortSignal): Promise<ToolResult> {
  const resultLimit = Math.min(this.params.limit || 20, 100);

  const searchOperation = async (): Promise<SearchResult[]> => {
    if (this.params.session_id) {
      // Search specific session
      return this.storage.searchMessages(this.params.query, {
        sessionId: this.params.session_id,
        caseSensitive: this.params.case_sensitive,
        limit: resultLimit,
      });
    }

    // Search across all sessions
    const sessions = await this.storage.listSessions({
      limit: MAX_SESSIONS_TO_SCAN
    });

    const results: SearchResult[] = [];
    for (const session of sessions) {
      if (signal.aborted) break;
      if (results.length >= resultLimit) break;

      const sessionResults = await this.storage.searchMessages(
        this.params.query,
        {
          sessionId: session.id,
          caseSensitive: this.params.case_sensitive,
          limit: resultLimit - results.length,
        }
      );
      results.push(...sessionResults);
    }

    return results.slice(0, resultLimit);
  };

  // Apply timeout
  const results = await withTimeout(
    searchOperation(),
    SEARCH_TIMEOUT_MS,
    'Search'
  );

  return formatSearchResults(results, this.params.query);
}
```

### Context Extraction

```typescript
// packages/core/src/tools/session-management/utils.ts

export function extractMatchesWithContext(
  text: string,
  query: string,
  caseSensitive = false,
): Array<{ before: string; match: string; after: string }> {
  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();

  const matches: Array<{ before: string; match: string; after: string }> = [];
  let startIndex = 0;

  while (true) {
    const index = searchText.indexOf(searchQuery, startIndex);
    if (index === -1) break;

    const beforeStart = Math.max(0, index - 50);
    const afterEnd = Math.min(text.length, index + query.length + 50);

    matches.push({
      before:
        (beforeStart > 0 ? '...' : '') + text.substring(beforeStart, index),
      match: text.substring(index, index + query.length),
      after:
        text.substring(index + query.length, afterEnd) +
        (afterEnd < text.length ? '...' : ''),
    });

    startIndex = index + query.length;
  }

  return matches;
}
```

---

## Test Coverage

**67 tests total** across 5 test files

| Test File                | Tests | Coverage                                        |
| ------------------------ | ----- | ----------------------------------------------- |
| `session-list.test.ts`   | 12    | Parameter validation, filtering, error handling |
| `session-search.test.ts` | 11    | Query validation, timeout, case sensitivity     |
| `session-read.test.ts`   | 11    | Message retrieval, pagination, todo/transcript  |
| `session-info.test.ts`   | 11    | Metadata retrieval, duration, agents            |
| `utils.test.ts`          | 22    | All formatting functions, context extraction    |

### Test Examples

```typescript
describe('session_search timeout handling', () => {
  it('should respect 60-second timeout', async () => {
    const tool = new SessionSearchTool(mockStorage);
    const invocation = tool.invoke({ query: 'test' });

    // Mock slow storage
    mockStorage.searchMessages.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 70000));
      return [];
    });

    await expect(
      invocation.execute(new AbortController().signal),
    ).rejects.toThrow('Search timed out');
  });

  it('should limit results to max 100', async () => {
    const invocation = tool.invoke({
      query: 'test',
      limit: 500, // Exceeds max
    });

    await invocation.execute(signal);

    expect(mockStorage.searchMessages).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ limit: 100 }), // Capped at 100
    );
  });
});

describe('session_info duration calculation', () => {
  it('should format duration as human-readable', async () => {
    mockStorage.getSessionInfo.mockResolvedValue({
      sessionId: 'ses_123',
      startTime: '2026-01-20T10:00:00Z',
      lastUpdated: '2026-01-22T14:30:00Z', // 2 days, 4.5 hours later
      // ...
    });

    const result = await invocation.execute(signal);

    expect(result.llmContent).toContain('2 days, 4 hours');
  });
});
```

---

## Usage Examples

### 1. List Recent Sessions

```typescript
session_list({
  limit: 10,
});
// Output:
// | Session ID   | Messages | First       | Last        | Summary           |
// |--------------|----------|-------------|-------------|-------------------|
// | ses_abc123   | 45       | 2026-01-20  | 2026-01-24  | PRD implementation|
// | ses_def456   | 12       | 2026-01-19  | 2026-01-19  | Bug fix review    |
```

### 2. Search for Authentication Discussions

```typescript
session_search({
  query: 'authentication',
  limit: 10,
});
// Output:
// Found 5 matches across 3 sessions:
//
// [ses_abc123] Message msg_001 (user)
// ...implement the **authentication** flow using JWT...
//
// [ses_abc123] Message msg_005 (assistant)
// ...I'll create the **authentication** middleware with...
```

### 3. Read Session with Todos

```typescript
session_read({
  session_id: 'ses_abc123',
  include_todos: true,
  limit: 20,
});
// Output:
// Session: ses_abc123
// Messages: 45
// Date Range: 2026-01-20 to 2026-01-24
//
// [Message 1] user (2026-01-20 10:30:00)
// Help me implement authentication for my Express app...
//
// [Message 2] assistant (2026-01-20 10:30:15)
// I'll help you implement JWT authentication...
//
// ---
// Todos:
// - [x] Create auth middleware
// - [x] Add JWT token generation
// - [ ] Add refresh token support
```

### 4. Get Session Statistics

```typescript
session_info({
  session_id: 'ses_abc123',
});
// Output:
// Session ID: ses_abc123
// Messages: 45
// Date Range: 2026-01-20 10:30:00 to 2026-01-24 15:45:30
// Duration: 4 days, 5 hours
// Agents Used: build, oracle, librarian
// Has Todos: Yes (12 items, 8 completed)
// Has Transcript: Yes (234 entries)
```

---

## Deferred Work

The following PRD requirements were not implemented and are deferred to future
work:

1. **Hybrid ranking**: Implement TF-IDF + recency scoring for search results
2. **Session tagging**: Add tag management tools and filtering by tags
3. **Schema versioning**: Implement migration system for session file format
   changes
4. **Auto-tagging**: Generate tags from session content using small model

---

## Verification

```bash
# Run tests
cd packages/core
npm test -- src/tools/session-management/

# Results
✓ 67 tests passed
✓ TypeScript typecheck passes
✓ Pre-commit hooks pass
```
