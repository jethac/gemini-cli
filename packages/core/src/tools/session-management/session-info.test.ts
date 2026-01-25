/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionInfoTool } from './session-info.js';
import type { SessionStorage, SessionInfo } from './storage.js';
import type { Config } from '../../config/config.js';
import { createMockMessageBus } from '../../test-utils/mock-message-bus.js';

describe('SessionInfoTool', () => {
  let tool: SessionInfoTool;
  let mockStorage: SessionStorage;
  let mockConfig: Config;
  const abortSignal = new AbortController().signal;

  const mockSessionInfo: SessionInfo = {
    sessionId: 'session-1-uuid-1234-5678-90ab-cdef01234567',
    messageCount: 25,
    startTime: '2025-01-15T10:00:00.000Z',
    lastUpdated: '2025-01-15T14:30:00.000Z',
    duration: '4 hours, 30 minutes',
    agentsUsed: ['gemini-2.0-flash', 'gemini-2.0-pro'],
    hasTodos: true,
    todoCount: 10,
    completedTodoCount: 7,
    hasTranscript: true,
    transcriptEntryCount: 150,
    summary: 'A productive coding session',
    firstUserMessage: 'Help me refactor this code',
  };

  beforeEach(() => {
    mockStorage = {
      listSessions: vi.fn(),
      getSession: vi.fn(),
      getMessages: vi.fn(),
      searchMessages: vi.fn(),
      getSessionInfo: vi.fn().mockResolvedValue(mockSessionInfo),
    };

    mockConfig = {
      getTargetDir: () => '/test/dir',
    } as unknown as Config;

    tool = new SessionInfoTool(mockConfig, mockStorage, createMockMessageBus());
  });

  describe('build', () => {
    it('should build invocation with required session_id', () => {
      const invocation = tool.build({
        session_id: 'abc12345-6789-0123-4567-890abcdef012',
      });
      expect(invocation).toBeDefined();
      expect(invocation.getDescription()).toContain(
        'Get info for session abc12345',
      );
    });

    it('should throw error for empty session_id', () => {
      expect(() => tool.build({ session_id: '' })).toThrow(
        'session_id parameter is required',
      );
      expect(() => tool.build({ session_id: '   ' })).toThrow(
        'session_id parameter is required',
      );
    });
  });

  describe('execute', () => {
    it('should return formatted session info', async () => {
      const sessionId = 'abc12345-6789-0123-4567-890abcdef012';
      const infoWithId: SessionInfo = { ...mockSessionInfo, sessionId };
      (
        mockStorage.getSessionInfo as ReturnType<typeof vi.fn>
      ).mockResolvedValue(infoWithId);

      const invocation = tool.build({ session_id: sessionId });
      const result = await invocation.execute(abortSignal);

      expect(mockStorage.getSessionInfo).toHaveBeenCalledWith(sessionId);
      expect(result.llmContent).toContain(`Session ID: ${sessionId}`);
      expect(result.llmContent).toContain('Messages: 25');
      expect(result.llmContent).toContain('Duration: 4 hours, 30 minutes');
      expect(result.llmContent).toContain('gemini-2.0-flash');
      expect(result.llmContent).toContain('gemini-2.0-pro');
      expect(result.returnDisplay).toContain('abc12345');
      expect(result.returnDisplay).toContain('25 messages');
    });

    it('should display todo information', async () => {
      const invocation = tool.build({ session_id: 'session-123' });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Has Todos: Yes (7/10 completed)');
    });

    it('should display transcript information', async () => {
      const invocation = tool.build({ session_id: 'session-123' });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Has Transcript: Yes (150 entries)');
    });

    it('should display summary when available', async () => {
      const invocation = tool.build({ session_id: 'session-123' });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain(
        'Summary: A productive coding session',
      );
    });

    it('should return error when session not found', async () => {
      (
        mockStorage.getSessionInfo as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      const invocation = tool.build({ session_id: 'nonexistent' });
      const result = await invocation.execute(abortSignal);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Session not found');
    });

    it('should handle storage errors gracefully', async () => {
      (
        mockStorage.getSessionInfo as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Storage error'));

      const invocation = tool.build({ session_id: 'session-123' });
      const result = await invocation.execute(abortSignal);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Storage error');
    });

    it('should handle session without todos', async () => {
      const infoWithoutTodos: SessionInfo = {
        ...mockSessionInfo,
        hasTodos: false,
        todoCount: undefined,
        completedTodoCount: undefined,
      };
      (
        mockStorage.getSessionInfo as ReturnType<typeof vi.fn>
      ).mockResolvedValue(infoWithoutTodos);

      const invocation = tool.build({ session_id: 'session-123' });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Has Todos: No');
    });

    it('should handle session without transcript', async () => {
      const infoWithoutTranscript: SessionInfo = {
        ...mockSessionInfo,
        hasTranscript: false,
        transcriptEntryCount: undefined,
      };
      (
        mockStorage.getSessionInfo as ReturnType<typeof vi.fn>
      ).mockResolvedValue(infoWithoutTranscript);

      const invocation = tool.build({ session_id: 'session-123' });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Has Transcript: No');
    });

    it('should handle session with no agents used', async () => {
      const infoWithNoAgents: SessionInfo = {
        ...mockSessionInfo,
        agentsUsed: [],
      };
      (
        mockStorage.getSessionInfo as ReturnType<typeof vi.fn>
      ).mockResolvedValue(infoWithNoAgents);

      const invocation = tool.build({ session_id: 'session-123' });
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Agents Used: none');
    });
  });
});
