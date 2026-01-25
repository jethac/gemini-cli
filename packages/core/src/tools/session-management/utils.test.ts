/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatTimestamp,
  calculateDuration,
  truncate,
  formatSessionListTable,
  formatSearchResults,
  formatSessionInfo,
  extractMatchesWithContext,
} from './utils.js';
import type { SessionSummary, SearchResult, SessionInfo } from './storage.js';

describe('Session Management Utils', () => {
  describe('formatDate', () => {
    it('should format ISO date string to YYYY-MM-DD', () => {
      expect(formatDate('2025-01-15T10:30:00.000Z')).toBe('2025-01-15');
    });

    it('should handle invalid date gracefully', () => {
      expect(formatDate('invalid')).toBe('invalid');
    });
  });

  describe('formatTimestamp', () => {
    it('should format ISO timestamp to YYYY-MM-DD HH:MM:SS', () => {
      expect(formatTimestamp('2025-01-15T10:30:45.000Z')).toBe(
        '2025-01-15 10:30:45',
      );
    });

    it('should handle invalid timestamp gracefully', () => {
      expect(formatTimestamp('invalid')).toBe('invalid');
    });
  });

  describe('calculateDuration', () => {
    it('should calculate duration in days and hours', () => {
      const start = '2025-01-15T10:00:00.000Z';
      const end = '2025-01-17T14:00:00.000Z';
      expect(calculateDuration(start, end)).toBe('2 days, 4 hours');
    });

    it('should calculate duration in hours and minutes', () => {
      const start = '2025-01-15T10:00:00.000Z';
      const end = '2025-01-15T13:30:00.000Z';
      expect(calculateDuration(start, end)).toBe('3 hours, 30 minutes');
    });

    it('should calculate duration in minutes', () => {
      const start = '2025-01-15T10:00:00.000Z';
      const end = '2025-01-15T10:45:00.000Z';
      expect(calculateDuration(start, end)).toBe('45 minutes');
    });

    it('should calculate duration in seconds', () => {
      const start = '2025-01-15T10:00:00.000Z';
      const end = '2025-01-15T10:00:30.000Z';
      expect(calculateDuration(start, end)).toBe('30 seconds');
    });

    it('should handle singular forms', () => {
      const start = '2025-01-15T10:00:00.000Z';
      const end = '2025-01-16T11:01:01.000Z';
      expect(calculateDuration(start, end)).toBe('1 day, 1 hour');
    });

    it('should handle negative duration', () => {
      const start = '2025-01-17T10:00:00.000Z';
      const end = '2025-01-15T10:00:00.000Z';
      expect(calculateDuration(start, end)).toBe('0 seconds');
    });
  });

  describe('truncate', () => {
    it('should not truncate short strings', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should truncate long strings with ellipsis', () => {
      expect(truncate('hello world', 8)).toBe('hello...');
    });

    it('should handle exact length', () => {
      expect(truncate('hello', 5)).toBe('hello');
    });
  });

  describe('formatSessionListTable', () => {
    it('should return message for empty sessions', () => {
      expect(formatSessionListTable([])).toBe('No sessions found.');
    });

    it('should format sessions as markdown table', () => {
      const sessions: SessionSummary[] = [
        {
          id: 'abc12345-6789-0123-4567-890abcdef012',
          fileName: 'session-2025-01-15-abc12345.json',
          startTime: '2025-01-15T10:00:00.000Z',
          lastUpdated: '2025-01-15T12:00:00.000Z',
          messageCount: 10,
          displayName: 'Test session',
          firstUserMessage: 'Hello world',
          index: 1,
        },
      ];

      const result = formatSessionListTable(sessions);
      expect(result).toContain('| Session ID |');
      expect(result).toContain('| abc12345 |');
      expect(result).toContain('| 10 |');
      expect(result).toContain('| 2025-01-15 |');
    });
  });

  describe('formatSearchResults', () => {
    it('should return message for no matches', () => {
      expect(formatSearchResults([], 'test')).toBe(
        'No matches found for "test".',
      );
    });

    it('should format search results with context', () => {
      const results: SearchResult[] = [
        {
          sessionId: 'abc12345-6789-0123-4567-890abcdef012',
          messageId: 'msg12345-6789-0123-4567-890abcdef012',
          role: 'user',
          before: 'some text before ',
          match: 'test',
          after: ' some text after',
        },
      ];

      const result = formatSearchResults(results, 'test');
      expect(result).toContain('Found 1 match');
      expect(result).toContain('[abc12345]');
      expect(result).toContain('**test**');
    });
  });

  describe('formatSessionInfo', () => {
    it('should format session info correctly', () => {
      const info: SessionInfo = {
        sessionId: 'abc12345-6789-0123-4567-890abcdef012',
        messageCount: 25,
        startTime: '2025-01-15T10:00:00.000Z',
        lastUpdated: '2025-01-15T12:00:00.000Z',
        duration: '2 hours',
        agentsUsed: ['gemini-2.0-flash'],
        hasTodos: true,
        todoCount: 5,
        completedTodoCount: 3,
        hasTranscript: false,
        firstUserMessage: 'Hello world',
      };

      const result = formatSessionInfo(info);
      expect(result).toContain(
        'Session ID: abc12345-6789-0123-4567-890abcdef012',
      );
      expect(result).toContain('Messages: 25');
      expect(result).toContain('Duration: 2 hours');
      expect(result).toContain('gemini-2.0-flash');
      expect(result).toContain('Has Todos: Yes (3/5 completed)');
      expect(result).toContain('Has Transcript: No');
    });
  });

  describe('extractMatchesWithContext', () => {
    it('should extract matches with surrounding context', () => {
      const text = 'This is a test string with the word test appearing twice.';
      const results = extractMatchesWithContext(text, 'test', false);

      expect(results).toHaveLength(2);
      expect(results[0].match).toBe('test');
      expect(results[0].before).toContain('This is a ');
      expect(results[0].after).toContain(' string');
    });

    it('should handle case-insensitive search', () => {
      const text = 'This is a TEST string.';
      const results = extractMatchesWithContext(text, 'test', false);

      expect(results).toHaveLength(1);
      expect(results[0].match).toBe('TEST');
    });

    it('should handle case-sensitive search', () => {
      const text = 'This is a TEST string with test.';
      const results = extractMatchesWithContext(text, 'test', true);

      expect(results).toHaveLength(1);
      expect(results[0].match).toBe('test');
    });

    it('should return empty array for no matches', () => {
      const text = 'This is a string.';
      const results = extractMatchesWithContext(text, 'xyz', false);

      expect(results).toHaveLength(0);
    });
  });
});
