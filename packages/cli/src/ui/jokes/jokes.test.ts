/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BuiltinJokeProvider, PHRASE_SETS } from './builtinProvider.js';
import { EmptyJokeProvider } from './emptyProvider.js';
import { CustomFileProvider } from './customFileProvider.js';
import { jokeRegistry } from './registry.js';
import { DEFAULT_LOADING_PHRASES_CONFIG } from './types.js';
import type { JokeProvider } from './types.js';

describe('JokeProvider System', () => {
  describe('BuiltinJokeProvider', () => {
    let provider: BuiltinJokeProvider;

    beforeEach(() => {
      provider = new BuiltinJokeProvider();
    });

    it('should have correct id and name', () => {
      expect(provider.id).toBe('builtin');
      expect(provider.name).toBe('Built-in Phrases');
    });

    it('should list all phrase sets', () => {
      expect(provider.phraseSets).toContain('default');
      expect(provider.phraseSets).toContain('minimal');
      expect(provider.phraseSets).toContain('programming');
      expect(provider.phraseSets).toContain('scifi');
    });

    it('should return phrases for default set', () => {
      const phrases = provider.getPhrases('default');
      expect(phrases.length).toBeGreaterThan(100); // default has 130 phrases
      expect(phrases).toContain("I'm Feeling Lucky");
    });

    it('should return phrases for minimal set', () => {
      const phrases = provider.getPhrases('minimal');
      expect(phrases.length).toBe(10);
      expect(phrases).toContain('Processing…');
      expect(phrases).toContain('Loading…');
    });

    it('should return phrases for programming set', () => {
      const phrases = provider.getPhrases('programming');
      expect(phrases.length).toBeGreaterThan(20);
      expect(phrases).toContain('Trying to exit Vim…');
      expect(phrases).toContain('Reticulating splines…');
    });

    it('should return phrases for scifi set', () => {
      const phrases = provider.getPhrases('scifi');
      expect(phrases.length).toBeGreaterThan(20);
      expect(phrases).toContain("Don't panic…");
      expect(phrases).toContain('Engage.');
    });

    it('should return default set when undefined is passed', () => {
      const phrases = provider.getPhrases();
      expect(phrases).toEqual(provider.getPhrases('default'));
    });

    it('should fall back to default for unknown set', () => {
      const phrases = provider.getPhrases('nonexistent');
      expect(phrases).toEqual(provider.getPhrases('default'));
    });

    it('should return a random phrase from the specified set', () => {
      const phrase = provider.getRandomPhrase('minimal');
      expect(phrase).toBeDefined();
      expect(provider.getPhrases('minimal')).toContain(phrase);
    });

    it('should return a random phrase from default set when undefined', () => {
      const phrase = provider.getRandomPhrase();
      expect(phrase).toBeDefined();
      expect(provider.getPhrases('default')).toContain(phrase);
    });
  });

  describe('EmptyJokeProvider', () => {
    let provider: EmptyJokeProvider;

    beforeEach(() => {
      provider = new EmptyJokeProvider();
    });

    it('should have correct id and name', () => {
      expect(provider.id).toBe('none');
      expect(provider.name).toBe('No Phrases');
    });

    it('should have empty phrase sets', () => {
      expect(provider.phraseSets).toEqual([]);
    });

    it('should return empty array for getPhrases', () => {
      expect(provider.getPhrases()).toEqual([]);
      expect(provider.getPhrases('default')).toEqual([]);
      expect(provider.getPhrases('anything')).toEqual([]);
    });

    it('should return undefined for getRandomPhrase', () => {
      expect(provider.getRandomPhrase()).toBeUndefined();
      expect(provider.getRandomPhrase('default')).toBeUndefined();
    });
  });

  describe('CustomFileProvider', () => {
    let provider: CustomFileProvider;

    beforeEach(() => {
      vi.mock('node:fs');
      vi.mock('node:os', () => ({
        homedir: () => '/mock/home',
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should have correct id and name', () => {
      provider = new CustomFileProvider();
      expect(provider.id).toBe('custom');
      expect(provider.name).toBe('Custom File');
    });

    it('should resolve default path to ~/.gemini/phrases.json', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      provider = new CustomFileProvider();
      provider.getPhrases(); // Trigger load
      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join('/mock/home', '.gemini', 'phrases.json'),
      );
    });

    it('should resolve relative path to ~/.gemini/', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      provider = new CustomFileProvider('my-phrases.json');
      provider.getPhrases(); // Trigger load
      expect(fs.existsSync).toHaveBeenCalledWith(
        path.join('/mock/home', '.gemini', 'my-phrases.json'),
      );
    });

    it('should use absolute path as-is', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      provider = new CustomFileProvider('/absolute/path/phrases.json');
      provider.getPhrases(); // Trigger load
      expect(fs.existsSync).toHaveBeenCalledWith('/absolute/path/phrases.json');
    });

    it('should return empty array when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      provider = new CustomFileProvider();
      expect(provider.getPhrases()).toEqual([]);
      expect(provider.getLoadError()).toBeNull();
    });

    it('should parse simple format { "phrases": [...] }', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ phrases: ['Phrase 1', 'Phrase 2'] }),
      );
      provider = new CustomFileProvider();
      expect(provider.getPhrases()).toEqual(['Phrase 1', 'Phrase 2']);
      expect(provider.phraseSets).toEqual(['default']);
    });

    it('should parse sets format { "setName": [...] }', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          work: ['Working hard…', 'Almost done…'],
          fun: ['Party time!', 'Woohoo!'],
        }),
      );
      provider = new CustomFileProvider();
      expect(provider.getPhrases('work')).toEqual([
        'Working hard…',
        'Almost done…',
      ]);
      expect(provider.getPhrases('fun')).toEqual(['Party time!', 'Woohoo!']);
      expect(provider.phraseSets).toContain('work');
      expect(provider.phraseSets).toContain('fun');
    });

    it('should fall back to default set when requested set not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          default: ['Default phrase'],
          other: ['Other phrase'],
        }),
      );
      provider = new CustomFileProvider();
      expect(provider.getPhrases('nonexistent')).toEqual(['Default phrase']);
    });

    it('should return empty array when set not found and no default', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ custom: ['Custom phrase'] }),
      );
      provider = new CustomFileProvider();
      expect(provider.getPhrases('nonexistent')).toEqual([]);
    });

    it('should set error for invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not valid json');
      provider = new CustomFileProvider();
      provider.getPhrases();
      expect(provider.getLoadError()).toBeDefined();
    });

    it('should set error when data is not an object', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(['array', 'not', 'object']),
      );
      provider = new CustomFileProvider();
      provider.getPhrases();
      // Arrays are technically objects in JS, so the provider treats them as the "sets format"
      // and reports the appropriate error when no valid string arrays are found
      expect(provider.getLoadError()?.message).toBe(
        'Custom phrases file must contain either { "phrases": [...] } or { "setName": [...] } format',
      );
    });

    it('should set error when phrases array contains non-strings', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ phrases: ['valid', 123, 'also valid'] }),
      );
      provider = new CustomFileProvider();
      provider.getPhrases();
      expect(provider.getLoadError()?.message).toBe(
        'phrases array must contain only strings',
      );
    });

    it('should reload phrases when reload() is called', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({ phrases: ['Original'] }),
      );
      provider = new CustomFileProvider();
      expect(provider.getPhrases()).toEqual(['Original']);

      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({ phrases: ['Updated'] }),
      );
      provider.reload();
      expect(provider.getPhrases()).toEqual(['Updated']);
    });

    it('should get a random phrase', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ phrases: ['One', 'Two', 'Three'] }),
      );
      provider = new CustomFileProvider();
      const phrase = provider.getRandomPhrase();
      expect(['One', 'Two', 'Three']).toContain(phrase);
    });

    it('should return undefined when no phrases available', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      provider = new CustomFileProvider();
      expect(provider.getRandomPhrase()).toBeUndefined();
    });
  });

  describe('JokeProviderRegistry', () => {
    beforeEach(() => {
      jokeRegistry.reset();
    });

    it('should have builtin and none providers registered by default', () => {
      expect(jokeRegistry.hasProvider('builtin')).toBe(true);
      expect(jokeRegistry.hasProvider('none')).toBe(true);
    });

    it('should return default config initially', () => {
      const config = jokeRegistry.getConfig();
      expect(config).toEqual(DEFAULT_LOADING_PHRASES_CONFIG);
    });

    it('should configure the registry', () => {
      jokeRegistry.configure({ enabled: false, phraseSet: 'minimal' });
      const config = jokeRegistry.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.phraseSet).toBe('minimal');
      expect(config.provider).toBe('builtin'); // unchanged
    });

    it('should return builtin provider as active when enabled', () => {
      jokeRegistry.configure({ enabled: true, provider: 'builtin' });
      const provider = jokeRegistry.getActiveProvider();
      expect(provider?.id).toBe('builtin');
    });

    it('should return none provider when disabled', () => {
      jokeRegistry.configure({ enabled: false });
      const provider = jokeRegistry.getActiveProvider();
      expect(provider?.id).toBe('none');
    });

    it('should get random phrase from active provider', () => {
      jokeRegistry.configure({
        enabled: true,
        provider: 'builtin',
        phraseSet: 'minimal',
      });
      const phrase = jokeRegistry.getRandomPhrase();
      expect(phrase).toBeDefined();
      expect(PHRASE_SETS['minimal']).toContain(phrase);
    });

    it('should return undefined when provider is none', () => {
      jokeRegistry.configure({ provider: 'none' });
      expect(jokeRegistry.getRandomPhrase()).toBeUndefined();
    });

    it('should get all phrases from active provider', () => {
      jokeRegistry.configure({
        enabled: true,
        provider: 'builtin',
        phraseSet: 'minimal',
      });
      const phrases = jokeRegistry.getPhrases();
      expect(phrases).toEqual(PHRASE_SETS['minimal']);
    });

    it('should register custom providers', () => {
      const customProvider: JokeProvider = {
        id: 'test-custom',
        name: 'Test Custom',
        phraseSets: ['default'],
        getPhrases: () => ['Custom phrase'],
        getRandomPhrase: () => 'Custom phrase',
      };
      jokeRegistry.register(customProvider);
      expect(jokeRegistry.hasProvider('test-custom')).toBe(true);
      expect(jokeRegistry.getProvider('test-custom')).toBe(customProvider);
    });

    it('should unregister custom providers', () => {
      const customProvider: JokeProvider = {
        id: 'test-custom',
        name: 'Test Custom',
        phraseSets: ['default'],
        getPhrases: () => ['Custom phrase'],
        getRandomPhrase: () => 'Custom phrase',
      };
      jokeRegistry.register(customProvider);
      expect(jokeRegistry.hasProvider('test-custom')).toBe(true);
      jokeRegistry.unregister('test-custom');
      expect(jokeRegistry.hasProvider('test-custom')).toBe(false);
    });

    it('should not unregister builtin provider', () => {
      jokeRegistry.unregister('builtin');
      expect(jokeRegistry.hasProvider('builtin')).toBe(true);
    });

    it('should not unregister none provider', () => {
      jokeRegistry.unregister('none');
      expect(jokeRegistry.hasProvider('none')).toBe(true);
    });

    it('should list all providers', () => {
      const providers = jokeRegistry.listProviders();
      expect(providers.length).toBeGreaterThanOrEqual(2);
      expect(providers.map((p) => p.id)).toContain('builtin');
      expect(providers.map((p) => p.id)).toContain('none');
    });

    it('should configure custom provider when selected', () => {
      vi.mock('node:fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      jokeRegistry.configure({ provider: 'custom', customFile: 'test.json' });
      expect(jokeRegistry.hasProvider('custom')).toBe(true);
      expect(jokeRegistry.getActiveProvider()?.id).toBe('custom');

      vi.restoreAllMocks();
    });

    it('should reset to default state', () => {
      jokeRegistry.configure({ enabled: false, phraseSet: 'minimal' });
      const customProvider: JokeProvider = {
        id: 'test-custom',
        name: 'Test',
        phraseSets: [],
        getPhrases: () => [],
        getRandomPhrase: () => undefined,
      };
      jokeRegistry.register(customProvider);

      jokeRegistry.reset();

      expect(jokeRegistry.getConfig()).toEqual(DEFAULT_LOADING_PHRASES_CONFIG);
      expect(jokeRegistry.hasProvider('test-custom')).toBe(false);
      expect(jokeRegistry.hasProvider('builtin')).toBe(true);
      expect(jokeRegistry.hasProvider('none')).toBe(true);
    });
  });

  describe('PHRASE_SETS export', () => {
    it('should export PHRASE_SETS for testing', () => {
      expect(PHRASE_SETS).toBeDefined();
      expect(PHRASE_SETS['default']).toBeDefined();
      expect(PHRASE_SETS['minimal']).toBeDefined();
      expect(PHRASE_SETS['programming']).toBeDefined();
      expect(PHRASE_SETS['scifi']).toBeDefined();
    });

    it('should have expected phrase counts', () => {
      // Note: Default count may vary slightly from original WITTY_LOADING_PHRASES
      expect(PHRASE_SETS['default'].length).toBeGreaterThanOrEqual(120);
      expect(PHRASE_SETS['minimal'].length).toBe(10);
      expect(PHRASE_SETS['programming'].length).toBeGreaterThanOrEqual(20);
      expect(PHRASE_SETS['scifi'].length).toBeGreaterThanOrEqual(20);
    });
  });

  describe('DEFAULT_LOADING_PHRASES_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_LOADING_PHRASES_CONFIG.enabled).toBe(true);
      expect(DEFAULT_LOADING_PHRASES_CONFIG.provider).toBe('builtin');
      expect(DEFAULT_LOADING_PHRASES_CONFIG.phraseSet).toBe('default');
    });
  });
});
