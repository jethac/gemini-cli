/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { detectUltrawork, removeCodeBlocks } from './detector.js';

describe('removeCodeBlocks', () => {
  it('should remove fenced code blocks', () => {
    const text = 'Before ```const x = 1;``` After';
    expect(removeCodeBlocks(text)).toBe('Before  After');
  });

  it('should remove multi-line code blocks', () => {
    const text = `Before
\`\`\`
const ultrawork = true;
console.log(ultrawork);
\`\`\`
After`;
    expect(removeCodeBlocks(text)).toBe(`Before

After`);
  });

  it('should remove inline code', () => {
    const text = 'Use `ulw` variable in your code';
    expect(removeCodeBlocks(text)).toBe('Use  variable in your code');
  });

  it('should remove multiple code blocks and inline code', () => {
    const text = 'Use `ulw` and ```ultrawork``` in code';
    expect(removeCodeBlocks(text)).toBe('Use  and  in code');
  });

  it('should handle text without code blocks', () => {
    const text = 'Just regular text without any code';
    expect(removeCodeBlocks(text)).toBe('Just regular text without any code');
  });

  it('should handle empty string', () => {
    expect(removeCodeBlocks('')).toBe('');
  });
});

describe('detectUltrawork', () => {
  describe('positive cases - should detect ultrawork', () => {
    it('should detect "ultrawork" at the beginning', () => {
      expect(detectUltrawork('ultrawork implement a login system')).toBe(true);
    });

    it('should detect "ultrawork" in the middle', () => {
      expect(detectUltrawork('please ultrawork implement this feature')).toBe(
        true,
      );
    });

    it('should detect "ultrawork" at the end', () => {
      expect(detectUltrawork('implement this feature ultrawork')).toBe(true);
    });

    it('should detect "ulw" shorthand', () => {
      expect(detectUltrawork('ulw refactor the auth module')).toBe(true);
    });

    it('should be case insensitive - ULTRAWORK', () => {
      expect(detectUltrawork('ULTRAWORK implement this')).toBe(true);
    });

    it('should be case insensitive - ULW', () => {
      expect(detectUltrawork('ULW implement this')).toBe(true);
    });

    it('should be case insensitive - mixed case', () => {
      expect(detectUltrawork('UltraWork implement this')).toBe(true);
    });

    it('should detect with punctuation after', () => {
      expect(detectUltrawork('ultrawork, implement this')).toBe(true);
    });

    it('should detect with newline after', () => {
      expect(detectUltrawork('ultrawork\nimplement this')).toBe(true);
    });
  });

  describe('negative cases - should NOT detect ultrawork', () => {
    it('should not detect "ultrawork" in inline code', () => {
      expect(detectUltrawork('The `ultrawork` variable is defined')).toBe(
        false,
      );
    });

    it('should not detect "ulw" in inline code', () => {
      expect(detectUltrawork('Use `ulw` as the prefix')).toBe(false);
    });

    it('should not detect "ultrawork" in code block', () => {
      const text = `\`\`\`
const ultrawork = true;
\`\`\``;
      expect(detectUltrawork(text)).toBe(false);
    });

    it('should not detect "ulw" in code block', () => {
      const text = `\`\`\`javascript
const ulw = require('ulw');
\`\`\``;
      expect(detectUltrawork(text)).toBe(false);
    });

    it('should not detect partial matches - ultraworking', () => {
      expect(detectUltrawork('ultraworking on this')).toBe(false);
    });

    it('should not detect partial matches - myultrawork', () => {
      expect(detectUltrawork('myultrawork function')).toBe(false);
    });

    it('should not detect partial matches - ulwish', () => {
      expect(detectUltrawork('ulwish behavior')).toBe(false);
    });

    it('should not detect in regular text without keywords', () => {
      expect(detectUltrawork('implement a login system')).toBe(false);
    });

    it('should handle empty string', () => {
      expect(detectUltrawork('')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should detect outside code block when also in code block', () => {
      const text = `ultrawork implement this
\`\`\`
const ultrawork = true;
\`\`\``;
      expect(detectUltrawork(text)).toBe(true);
    });

    it('should not detect when only in code block', () => {
      const text = `implement this feature
\`\`\`
const ultrawork = true;
\`\`\``;
      expect(detectUltrawork(text)).toBe(false);
    });

    it('should handle multiple code blocks', () => {
      const text = `\`\`\`
const ultrawork = 1;
\`\`\`
ulw please help
\`\`\`
const ulw = 2;
\`\`\``;
      expect(detectUltrawork(text)).toBe(true);
    });
  });
});
