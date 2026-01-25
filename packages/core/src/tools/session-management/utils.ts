/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SessionSummary,
  SearchResult,
  SessionInfo,
  SessionMessage,
} from './storage.js';

/**
 * Context length for search result excerpts (characters before/after match).
 */
const CONTEXT_LENGTH = 50;

/**
 * Formats a date string for display.
 * @param dateStr ISO date string
 * @returns Formatted date string (YYYY-MM-DD)
 */
export function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
}

/**
 * Formats a timestamp for display.
 * @param timestamp ISO timestamp string
 * @returns Formatted timestamp (YYYY-MM-DD HH:MM:SS)
 */
export function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toISOString().replace('T', ' ').substring(0, 19);
  } catch {
    return timestamp;
  }
}

/**
 * Calculates duration between two timestamps.
 * @param startTime ISO timestamp
 * @param endTime ISO timestamp
 * @returns Human-readable duration string
 */
export function calculateDuration(startTime: string, endTime: string): string {
  try {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end.getTime() - start.getTime();

    if (diffMs < 0) return '0 seconds';

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      return remainingHours > 0
        ? `${days} day${days === 1 ? '' : 's'}, ${remainingHours} hour${remainingHours === 1 ? '' : 's'}`
        : `${days} day${days === 1 ? '' : 's'}`;
    }
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0
        ? `${hours} hour${hours === 1 ? '' : 's'}, ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}`
        : `${hours} hour${hours === 1 ? '' : 's'}`;
    }
    if (minutes > 0) {
      return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  } catch {
    return 'unknown';
  }
}

/**
 * Truncates a string to a maximum length with ellipsis.
 * @param str String to truncate
 * @param maxLength Maximum length
 * @returns Truncated string
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Formats session list as a table.
 * @param sessions Array of session summaries
 * @returns Formatted table string
 */
export function formatSessionListTable(sessions: SessionSummary[]): string {
  if (sessions.length === 0) {
    return 'No sessions found.';
  }

  const lines: string[] = [];
  lines.push('| Session ID | Messages | First | Last | Summary |');
  lines.push('|------------|----------|-------|------|---------|');

  for (const session of sessions) {
    const shortId = session.id.substring(0, 8);
    const firstDate = formatDate(session.startTime);
    const lastDate = formatDate(session.lastUpdated);
    const summary = truncate(session.summary || session.firstUserMessage, 40);

    lines.push(
      `| ${shortId} | ${session.messageCount} | ${firstDate} | ${lastDate} | ${summary} |`,
    );
  }

  return lines.join('\n');
}

/**
 * Formats search results with context highlighting.
 * @param results Array of search results
 * @param query Original search query
 * @returns Formatted search results string
 */
export function formatSearchResults(
  results: SearchResult[],
  query: string,
): string {
  if (results.length === 0) {
    return `No matches found for "${query}".`;
  }

  // Group results by session
  const bySession = new Map<string, SearchResult[]>();
  for (const result of results) {
    const existing = bySession.get(result.sessionId) || [];
    existing.push(result);
    bySession.set(result.sessionId, existing);
  }

  const lines: string[] = [];
  lines.push(
    `Found ${results.length} match${results.length === 1 ? '' : 'es'} across ${bySession.size} session${bySession.size === 1 ? '' : 's'}:`,
  );
  lines.push('');

  for (const [sessionId, sessionResults] of bySession) {
    const shortId = sessionId.substring(0, 8);

    for (const result of sessionResults) {
      lines.push(
        `[${shortId}] Message ${result.messageId.substring(0, 8)} (${result.role})`,
      );
      lines.push(`...${result.before}**${result.match}**${result.after}...`);
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}

/**
 * Formats session messages for display.
 * @param messages Array of session messages
 * @param sessionId Session identifier
 * @returns Formatted messages string
 */
export function formatSessionMessages(
  messages: SessionMessage[],
  sessionId: string,
  startTime: string,
  lastUpdated: string,
): string {
  const lines: string[] = [];

  lines.push(`Session: ${sessionId}`);
  lines.push(`Messages: ${messages.length}`);
  lines.push(
    `Date Range: ${formatDate(startTime)} to ${formatDate(lastUpdated)}`,
  );
  lines.push('');

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const role = msg.type === 'gemini' ? 'assistant' : msg.type;
    const timestamp = formatTimestamp(msg.timestamp);

    lines.push(`[Message ${i + 1}] ${role} (${timestamp})`);

    // Format content
    const content = formatMessageContent(msg.content);
    lines.push(content);

    // Show tool calls if present
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      lines.push(
        `  Tool calls: ${msg.toolCalls.map((tc) => tc.name).join(', ')}`,
      );
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}

/**
 * Formats message content for display.
 * @param content Message content (can be string or PartListUnion)
 * @returns Formatted content string
 */
export function formatMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return (part as { text: string }).text;
        }
        return '[non-text content]';
      })
      .join('');
  }

  if (content && typeof content === 'object' && 'text' in content) {
    return (content as { text: string }).text;
  }

  return '[content]';
}

/**
 * Formats session info for display.
 * @param info Session info object
 * @returns Formatted session info string
 */
export function formatSessionInfo(info: SessionInfo): string {
  const lines: string[] = [];

  lines.push(`Session ID: ${info.sessionId}`);
  lines.push(`Messages: ${info.messageCount}`);
  lines.push(
    `Date Range: ${formatTimestamp(info.startTime)} to ${formatTimestamp(info.lastUpdated)}`,
  );
  lines.push(`Duration: ${info.duration}`);
  lines.push(
    `Agents Used: ${info.agentsUsed.length > 0 ? info.agentsUsed.join(', ') : 'none'}`,
  );

  if (info.hasTodos) {
    lines.push(
      `Has Todos: Yes (${info.completedTodoCount || 0}/${info.todoCount || 0} completed)`,
    );
  } else {
    lines.push('Has Todos: No');
  }

  if (info.hasTranscript) {
    lines.push(
      `Has Transcript: Yes (${info.transcriptEntryCount || 0} entries)`,
    );
  } else {
    lines.push('Has Transcript: No');
  }

  if (info.summary) {
    lines.push('');
    lines.push(`Summary: ${info.summary}`);
  }

  if (info.firstUserMessage) {
    lines.push('');
    lines.push(`First Message: ${truncate(info.firstUserMessage, 100)}`);
  }

  return lines.join('\n');
}

/**
 * Extracts text match with surrounding context.
 * @param text Full text to search in
 * @param query Search query
 * @param caseSensitive Whether search is case-sensitive
 * @returns Array of matches with context, or empty array if no matches
 */
export function extractMatchesWithContext(
  text: string,
  query: string,
  caseSensitive: boolean = false,
): Array<{ before: string; match: string; after: string }> {
  const results: Array<{ before: string; match: string; after: string }> = [];

  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();

  let startIndex = 0;
  let matchIndex: number;

  while ((matchIndex = searchText.indexOf(searchQuery, startIndex)) !== -1) {
    const beforeStart = Math.max(0, matchIndex - CONTEXT_LENGTH);
    const afterEnd = Math.min(
      text.length,
      matchIndex + query.length + CONTEXT_LENGTH,
    );

    const before =
      (beforeStart > 0 ? '...' : '') +
      text.substring(beforeStart, matchIndex).replace(/\n/g, ' ');
    const match = text.substring(matchIndex, matchIndex + query.length);
    const after =
      text.substring(matchIndex + query.length, afterEnd).replace(/\n/g, ' ') +
      (afterEnd < text.length ? '...' : '');

    results.push({ before, match, after });
    startIndex = matchIndex + query.length;
  }

  return results;
}
