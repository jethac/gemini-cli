/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processUltrawork, isUltraworkRequest } from './ultraworkProcessor.js';
import { ULTRAWORK_SYSTEM_PROMPT, ULTRAWORK_TOAST } from './constants.js';
import { coreEvents } from '../utils/events.js';

// Mock coreEvents
vi.mock('../utils/events.js', () => ({
  coreEvents: {
    emitFeedback: vi.fn(),
  },
}));

// Mock debugLogger
vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    log: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('processUltrawork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when ultrawork is NOT detected', () => {
    it('should return activated: false for regular text', () => {
      const result = processUltrawork([{ text: 'implement a login system' }]);
      expect(result.activated).toBe(false);
      expect(result.request).toEqual([{ text: 'implement a login system' }]);
    });

    it('should not emit feedback', () => {
      processUltrawork([{ text: 'implement a login system' }]);
      expect(coreEvents.emitFeedback).not.toHaveBeenCalled();
    });

    it('should not modify the request', () => {
      const original = [{ text: 'hello world' }];
      const result = processUltrawork(original);
      expect(result.request).toBe(original);
    });
  });

  describe('when ultrawork IS detected', () => {
    it('should return activated: true', () => {
      const result = processUltrawork([{ text: 'ultrawork implement login' }]);
      expect(result.activated).toBe(true);
    });

    it('should emit feedback notification', () => {
      processUltrawork([{ text: 'ultrawork implement login' }]);
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'info',
        `🚀 ${ULTRAWORK_TOAST.title}: ${ULTRAWORK_TOAST.message}`,
      );
    });

    it('should prepend ultrawork system prompt to array request', () => {
      const result = processUltrawork([{ text: 'ultrawork implement login' }]);
      expect(Array.isArray(result.request)).toBe(true);
      const requestArray = result.request as Array<{ text: string }>;
      expect(requestArray.length).toBe(2);
      expect(requestArray[0].text).toBe(ULTRAWORK_SYSTEM_PROMPT);
      expect(requestArray[1].text).toBe('ultrawork implement login');
    });

    it('should handle string request', () => {
      const result = processUltrawork('ulw refactor auth');
      expect(result.activated).toBe(true);
      expect(Array.isArray(result.request)).toBe(true);
      const requestArray = result.request as Array<{ text: string }>;
      expect(requestArray[0].text).toBe(ULTRAWORK_SYSTEM_PROMPT);
      expect(requestArray[1].text).toBe('ulw refactor auth');
    });

    it('should handle single Part object', () => {
      const result = processUltrawork({ text: 'ultrawork build API' });
      expect(result.activated).toBe(true);
      expect(Array.isArray(result.request)).toBe(true);
      const requestArray = result.request as Array<{ text: string }>;
      expect(requestArray[0].text).toBe(ULTRAWORK_SYSTEM_PROMPT);
      expect(requestArray[1].text).toBe('ultrawork build API');
    });

    it('should preserve all original parts', () => {
      const original = [
        { text: 'ultrawork ' },
        { text: 'implement ' },
        { text: 'feature' },
      ];
      const result = processUltrawork(original);
      expect(result.activated).toBe(true);
      const requestArray = result.request as Array<{ text: string }>;
      expect(requestArray.length).toBe(4); // ultrawork prompt + 3 original
      expect(requestArray[0].text).toBe(ULTRAWORK_SYSTEM_PROMPT);
      expect(requestArray[1].text).toBe('ultrawork ');
      expect(requestArray[2].text).toBe('implement ');
      expect(requestArray[3].text).toBe('feature');
    });

    it('should detect "ulw" shorthand', () => {
      const result = processUltrawork([{ text: 'ulw fix the bug' }]);
      expect(result.activated).toBe(true);
    });

    it('should be case insensitive', () => {
      const result = processUltrawork([{ text: 'ULTRAWORK implement this' }]);
      expect(result.activated).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty array', () => {
      const result = processUltrawork([]);
      expect(result.activated).toBe(false);
      expect(result.request).toEqual([]);
    });

    it('should handle parts with non-text content', () => {
      const result = processUltrawork([
        { text: 'ultrawork ' },
        { inlineData: { mimeType: 'image/png', data: 'abc123' } } as {
          inlineData: { mimeType: string; data: string };
        },
      ]);
      expect(result.activated).toBe(true);
    });

    it('should not detect ultrawork in code blocks', () => {
      const result = processUltrawork([
        { text: '```\nconst ultrawork = true;\n```' },
      ]);
      expect(result.activated).toBe(false);
    });

    it('should detect ultrawork outside code blocks', () => {
      const result = processUltrawork([
        { text: 'ultrawork ```const x = 1;```' },
      ]);
      expect(result.activated).toBe(true);
    });
  });
});

describe('isUltraworkRequest', () => {
  it('should return true when ultrawork is detected', () => {
    expect(isUltraworkRequest([{ text: 'ultrawork implement' }])).toBe(true);
    expect(isUltraworkRequest([{ text: 'ulw implement' }])).toBe(true);
  });

  it('should return false when ultrawork is not detected', () => {
    expect(isUltraworkRequest([{ text: 'implement feature' }])).toBe(false);
  });

  it('should handle string input', () => {
    expect(isUltraworkRequest('ultrawork')).toBe(true);
    expect(isUltraworkRequest('hello')).toBe(false);
  });

  it('should handle single Part object', () => {
    expect(isUltraworkRequest({ text: 'ultrawork' })).toBe(true);
    expect(isUltraworkRequest({ text: 'hello' })).toBe(false);
  });
});
