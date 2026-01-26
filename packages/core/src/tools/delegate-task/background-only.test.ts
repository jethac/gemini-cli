/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  isBackgroundOnlyAgent,
  getBackgroundOnlyAgents,
  getBackgroundAgentDefaults,
  BACKGROUND_ONLY_AGENTS,
} from './background-only.js';

describe('background-only agent registry', () => {
  describe('isBackgroundOnlyAgent', () => {
    it('should return true for codebase_investigator', () => {
      expect(isBackgroundOnlyAgent('codebase_investigator')).toBe(true);
    });

    it('should return false for regular agents', () => {
      expect(isBackgroundOnlyAgent('oracle')).toBe(false);
      expect(isBackgroundOnlyAgent('explore')).toBe(false);
      expect(isBackgroundOnlyAgent('sisyphus-junior')).toBe(false);
      expect(isBackgroundOnlyAgent('librarian')).toBe(false);
    });

    it('should return false for unknown agents', () => {
      expect(isBackgroundOnlyAgent('unknown-agent')).toBe(false);
      expect(isBackgroundOnlyAgent('')).toBe(false);
    });
  });

  describe('getBackgroundOnlyAgents', () => {
    it('should return array of background-only agent names', () => {
      const agents = getBackgroundOnlyAgents();
      expect(agents).toContain('codebase_investigator');
      expect(Array.isArray(agents)).toBe(true);
    });

    it('should match the BACKGROUND_ONLY_AGENTS set', () => {
      const agents = getBackgroundOnlyAgents();
      expect(agents.length).toBe(BACKGROUND_ONLY_AGENTS.size);
      for (const agent of agents) {
        expect(BACKGROUND_ONLY_AGENTS.has(agent)).toBe(true);
      }
    });
  });

  describe('getBackgroundAgentDefaults', () => {
    it('should return defaults for codebase_investigator', () => {
      const defaults = getBackgroundAgentDefaults('codebase_investigator');
      expect(defaults).toBeDefined();
      expect(defaults?.timeoutMinutes).toBeGreaterThan(3); // Extended from default
      expect(defaults?.maxTurns).toBeGreaterThan(10); // Extended from default
      expect(defaults?.retryOnCapacity).toBe(true);
      expect(defaults?.maxRetryAttempts).toBe(3);
    });

    it('should return undefined for non-background-only agents', () => {
      expect(getBackgroundAgentDefaults('oracle')).toBeUndefined();
      expect(getBackgroundAgentDefaults('explore')).toBeUndefined();
      expect(getBackgroundAgentDefaults('unknown')).toBeUndefined();
    });
  });
});
