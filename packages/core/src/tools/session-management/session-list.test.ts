/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionListTool } from './session-list.js';
import type {
  SessionStorage,
  SessionSummary,
  SessionFilter,
} from './storage.js';
import type { Config } from '../../config/config.js';
import { createMockMessageBus } from '../../test-utils/mock-message-bus.js';

describe('SessionListTool', () => {
  let tool: SessionListTool;
  let mockStorage: SessionStorage;
  let mockConfig: Config;
  const abortSignal = new AbortController().signal;

  const mockSessions: SessionSummary[] = [
    {
      id: 'session-1-uuid-1234-5678-90ab-cdef01234567',
      fileName: 'session-2025-01-15-session1.json',
      startTime: '2025-01-15T10:00:00.000Z',
      lastUpdated: '2025-01-15T12:00:00.000Z',
      messageCount: 10,
      displayName: 'First session',
      firstUserMessage: 'Hello world',
      index: 1,
    },
    {
      id: 'session-2-uuid-1234-5678-90ab-cdef01234567',
      fileName: 'session-2025-01-16-session2.json',
      startTime: '2025-01-16T10:00:00.000Z',
      lastUpdated: '2025-01-16T14:00:00.000Z',
      messageCount: 25,
      displayName: 'Second session',
      firstUserMessage: 'Another conversation',
      summary: 'A summary of the second session',
      index: 2,
    },
  ];

  beforeEach(() => {
    mockStorage = {
      listSessions: vi.fn().mockResolvedValue(mockSessions),
      getSession: vi.fn(),
      getMessages: vi.fn(),
      searchMessages: vi.fn(),
      getSessionInfo: vi.fn(),
    };

    mockConfig = {
      getTargetDir: () => '/test/dir',
    } as unknown as Config;

    tool = new SessionListTool(mockConfig, mockStorage, createMockMessageBus());
  });

  describe('build', () => {
    it('should build invocation with no parameters', () => {
      const invocation = tool.build({});
      expect(invocation).toBeDefined();
      expect(invocation.getDescription()).toBe('List sessions');
    });

    it('should build invocation with limit parameter', () => {
      const invocation = tool.build({ limit: 5 });
      expect(invocation).toBeDefined();
      expect(invocation.getDescription()).toContain('limit: 5');
    });

    it('should build invocation with date filters', () => {
      const invocation = tool.build({
        from_date: '2025-01-01',
        to_date: '2025-01-31',
      });
      expect(invocation).toBeDefined();
      expect(invocation.getDescription()).toContain('from 2025-01-01');
      expect(invocation.getDescription()).toContain('to 2025-01-31');
    });

    it('should throw error for invalid limit', () => {
      expect(() => tool.build({ limit: 0 })).toThrow(
        'Limit must be a positive integer',
      );
      expect(() => tool.build({ limit: -1 })).toThrow(
        'Limit must be a positive integer',
      );
      expect(() => tool.build({ limit: 1.5 })).toThrow(
        'Limit must be a positive integer',
      );
    });

    it('should throw error for invalid from_date format', () => {
      expect(() => tool.build({ from_date: 'invalid' })).toThrow(
        'Invalid from_date format',
      );
    });

    it('should throw error for invalid to_date format', () => {
      expect(() => tool.build({ to_date: 'not-a-date' })).toThrow(
        'Invalid to_date format',
      );
    });

    it('should throw error when from_date is after to_date', () => {
      expect(() =>
        tool.build({
          from_date: '2025-01-31',
          to_date: '2025-01-01',
        }),
      ).toThrow('from_date must be before or equal to to_date');
    });
  });

  describe('execute', () => {
    it('should list all sessions when no filters provided', async () => {
      const invocation = tool.build({});
      const result = await invocation.execute(abortSignal);

      expect(mockStorage.listSessions).toHaveBeenCalledWith({});
      // Session IDs are truncated to 8 characters in the table
      expect(result.llmContent).toContain('session-');
      expect(result.llmContent).toContain('| 10 |');
      expect(result.llmContent).toContain('| 25 |');
      expect(result.returnDisplay).toBe('Found 2 sessions');
    });

    it('should pass filter parameters to storage', async () => {
      const invocation = tool.build({
        limit: 10,
        from_date: '2025-01-01',
        to_date: '2025-01-31',
        project_path: '/test/project',
      });
      await invocation.execute(abortSignal);

      expect(mockStorage.listSessions).toHaveBeenCalledWith({
        limit: 10,
        fromDate: '2025-01-01',
        toDate: '2025-01-31',
        projectPath: '/test/project',
      });
    });

    it('should return appropriate message when no sessions found', async () => {
      (mockStorage.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue(
        [],
      );

      const invocation = tool.build({});
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('No sessions found');
      expect(result.returnDisplay).toContain('No sessions found');
    });

    it('should handle storage errors gracefully', async () => {
      (mockStorage.listSessions as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Storage error'),
      );

      const invocation = tool.build({});
      const result = await invocation.execute(abortSignal);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Storage error');
    });

    it('should format output as markdown table', async () => {
      const invocation = tool.build({});
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('| Session ID |');
      expect(result.llmContent).toContain('| Messages |');
      expect(result.llmContent).toContain('|------------|');
    });
  });
});
