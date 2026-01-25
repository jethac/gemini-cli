/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionSearchTool } from './session-search.js';
import type { SessionStorage, SearchResult } from './storage.js';
import type { Config } from '../../config/config.js';
import { createMockMessageBus } from '../../test-utils/mock-message-bus.js';

describe('SessionSearchTool', () => {
  let tool: SessionSearchTool;
  let mockStorage: SessionStorage;
  let mockConfig: Config;
  const abortSignal = new AbortController().signal;

  const mockSearchResults: SearchResult[] = [
    {
      sessionId: 'session-1-uuid-1234-5678-90ab-cdef01234567',
      messageId: 'msg-1-uuid-1234-5678-90ab-cdef01234567',
      role: 'user',
      before: 'some text before ',
      match: 'test query',
      after: ' some text after',
    },
    {
      sessionId: 'session-1-uuid-1234-5678-90ab-cdef01234567',
      messageId: 'msg-2-uuid-1234-5678-90ab-cdef01234567',
      role: 'assistant',
      before: 'response with ',
      match: 'test query',
      after: ' in it',
    },
  ];

  beforeEach(() => {
    mockStorage = {
      listSessions: vi.fn(),
      getSession: vi.fn(),
      getMessages: vi.fn(),
      searchMessages: vi.fn().mockResolvedValue(mockSearchResults),
      getSessionInfo: vi.fn(),
    };

    mockConfig = {
      getTargetDir: () => '/test/dir',
    } as unknown as Config;

    tool = new SessionSearchTool(
      mockConfig,
      mockStorage,
      createMockMessageBus(),
    );
  });

  describe('build', () => {
    it('should build invocation with required query parameter', () => {
      const invocation = tool.build({ query: 'test' });
      expect(invocation).toBeDefined();
      expect(invocation.getDescription()).toContain('Search for "test"');
      expect(invocation.getDescription()).toContain('across all sessions');
    });

    it('should build invocation with session_id filter', () => {
      const invocation = tool.build({
        query: 'test',
        session_id: 'abc12345-6789-0123-4567-890abcdef012',
      });
      expect(invocation).toBeDefined();
      expect(invocation.getDescription()).toContain('in session abc12345');
    });

    it('should throw error for empty query', () => {
      expect(() => tool.build({ query: '' })).toThrow(
        'Query parameter is required',
      );
      expect(() => tool.build({ query: '   ' })).toThrow(
        'Query parameter is required',
      );
    });

    it('should throw error for invalid limit', () => {
      expect(() => tool.build({ query: 'test', limit: 0 })).toThrow(
        'Limit must be a positive integer',
      );
      expect(() => tool.build({ query: 'test', limit: -1 })).toThrow(
        'Limit must be a positive integer',
      );
    });

    it('should throw error for limit exceeding maximum', () => {
      expect(() => tool.build({ query: 'test', limit: 101 })).toThrow(
        'Limit cannot exceed 100',
      );
    });
  });

  describe('execute', () => {
    it('should search with default options', async () => {
      const invocation = tool.build({ query: 'test query' });
      const result = await invocation.execute(abortSignal);

      expect(mockStorage.searchMessages).toHaveBeenCalledWith('test query', {
        sessionId: undefined,
        caseSensitive: false,
        limit: 20,
      });
      expect(result.llmContent).toContain('Found 2 match');
      expect(result.returnDisplay).toBe('Found 2 matches');
    });

    it('should pass all options to storage', async () => {
      const invocation = tool.build({
        query: 'test',
        session_id: 'session-123',
        case_sensitive: true,
        limit: 50,
      });
      await invocation.execute(abortSignal);

      expect(mockStorage.searchMessages).toHaveBeenCalledWith('test', {
        sessionId: 'session-123',
        caseSensitive: true,
        limit: 50,
      });
    });

    it('should return appropriate message when no matches found', async () => {
      (
        mockStorage.searchMessages as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      const invocation = tool.build({ query: 'nonexistent' });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('No matches found');
      expect(result.returnDisplay).toBe('No matches found');
    });

    it('should handle storage errors gracefully', async () => {
      (
        mockStorage.searchMessages as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Search failed'));

      const invocation = tool.build({ query: 'test' });
      const result = await invocation.execute(abortSignal);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Search failed');
    });

    it('should format results with context highlighting', async () => {
      const invocation = tool.build({ query: 'test query' });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('**test query**');
      // Session IDs are truncated to 8 characters in the output
      expect(result.llmContent).toContain('[session-]');
    });

    it('should handle singular match correctly', async () => {
      (
        mockStorage.searchMessages as ReturnType<typeof vi.fn>
      ).mockResolvedValue([mockSearchResults[0]]);

      const invocation = tool.build({ query: 'test' });
      const result = await invocation.execute(abortSignal);

      expect(result.returnDisplay).toBe('Found 1 match');
    });
  });
});
