/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionReadTool } from './session-read.js';
import type { SessionStorage, Session, SessionMessage } from './storage.js';
import type { Config } from '../../config/config.js';
import { createMockMessageBus } from '../../test-utils/mock-message-bus.js';

describe('SessionReadTool', () => {
  let tool: SessionReadTool;
  let mockStorage: SessionStorage;
  let mockConfig: Config;
  const abortSignal = new AbortController().signal;

  const mockMessages: SessionMessage[] = [
    {
      id: 'msg-1-uuid',
      timestamp: '2025-01-15T10:00:00.000Z',
      type: 'user',
      content: 'Hello, how are you?',
    },
    {
      id: 'msg-2-uuid',
      timestamp: '2025-01-15T10:01:00.000Z',
      type: 'gemini',
      content: 'I am doing well, thank you!',
      model: 'gemini-2.0-flash',
    },
    {
      id: 'msg-3-uuid',
      timestamp: '2025-01-15T10:02:00.000Z',
      type: 'user',
      content: 'Can you help me with something?',
    },
  ];

  const mockSession: Session = {
    sessionId: 'session-1-uuid-1234-5678-90ab-cdef01234567',
    projectHash: 'project-hash-123',
    startTime: '2025-01-15T10:00:00.000Z',
    lastUpdated: '2025-01-15T10:02:00.000Z',
    messages: mockMessages,
    summary: 'A test conversation',
  };

  beforeEach(() => {
    mockStorage = {
      listSessions: vi.fn(),
      getSession: vi.fn().mockResolvedValue(mockSession),
      getMessages: vi.fn().mockResolvedValue(mockMessages),
      searchMessages: vi.fn(),
      getSessionInfo: vi.fn(),
    };

    mockConfig = {
      getTargetDir: () => '/test/dir',
    } as unknown as Config;

    tool = new SessionReadTool(mockConfig, mockStorage, createMockMessageBus());
  });

  describe('build', () => {
    it('should build invocation with required session_id', () => {
      const invocation = tool.build({
        session_id: 'abc12345-6789-0123-4567-890abcdef012',
      });
      expect(invocation).toBeDefined();
      expect(invocation.getDescription()).toContain('Read session abc12345');
    });

    it('should build invocation with limit parameter', () => {
      const invocation = tool.build({ session_id: 'session-123', limit: 10 });
      expect(invocation).toBeDefined();
      expect(invocation.getDescription()).toContain('limit: 10 messages');
    });

    it('should throw error for empty session_id', () => {
      expect(() => tool.build({ session_id: '' })).toThrow(
        'session_id parameter is required',
      );
      expect(() => tool.build({ session_id: '   ' })).toThrow(
        'session_id parameter is required',
      );
    });

    it('should throw error for invalid limit', () => {
      expect(() => tool.build({ session_id: 'test', limit: 0 })).toThrow(
        'Limit must be a positive integer',
      );
      expect(() => tool.build({ session_id: 'test', limit: -1 })).toThrow(
        'Limit must be a positive integer',
      );
    });
  });

  describe('execute', () => {
    it('should read session and return formatted messages', async () => {
      const invocation = tool.build({
        session_id: 'session-1-uuid-1234-5678-90ab-cdef01234567',
      });
      const result = await invocation.execute(abortSignal);

      expect(mockStorage.getSession).toHaveBeenCalledWith(
        'session-1-uuid-1234-5678-90ab-cdef01234567',
      );
      expect(result.llmContent).toContain(
        'Session: session-1-uuid-1234-5678-90ab-cdef01234567',
      );
      expect(result.llmContent).toContain('Messages: 3');
      expect(result.llmContent).toContain('Hello, how are you?');
      expect(result.llmContent).toContain('I am doing well');
      expect(result.returnDisplay).toBe('3 messages');
    });

    it('should limit messages when limit parameter provided', async () => {
      const invocation = tool.build({ session_id: 'session-123', limit: 2 });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Hello, how are you?');
      expect(result.llmContent).toContain('I am doing well');
      expect(result.llmContent).not.toContain('Can you help me');
      expect(result.returnDisplay).toContain('Showing 2 of 3 messages');
    });

    it('should return error when session not found', async () => {
      (mockStorage.getSession as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      const invocation = tool.build({ session_id: 'nonexistent' });
      const result = await invocation.execute(abortSignal);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Session not found');
    });

    it('should handle storage errors gracefully', async () => {
      (mockStorage.getSession as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Storage error'),
      );

      const invocation = tool.build({ session_id: 'session-123' });
      const result = await invocation.execute(abortSignal);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Storage error');
    });

    it('should include todos section when requested', async () => {
      const invocation = tool.build({
        session_id: 'session-123',
        include_todos: true,
      });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('--- Todos ---');
    });

    it('should include transcript section when requested', async () => {
      const invocation = tool.build({
        session_id: 'session-123',
        include_transcript: true,
      });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('--- Transcript ---');
    });

    it('should format message roles correctly', async () => {
      const invocation = tool.build({ session_id: 'session-123' });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('user');
      expect(result.llmContent).toContain('assistant');
    });
  });
});
