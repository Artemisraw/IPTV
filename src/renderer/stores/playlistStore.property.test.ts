import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validatePlaylistName } from './playlistStore';

/**
 * Feature: iptv-core-functionality, Property 2: Playlist name validation rejects whitespace-only input
 *
 * Validates: Requirements 3.5, 3.7
 *
 * For any string composed entirely of whitespace characters (spaces, tabs, newlines),
 * attempting to add or rename a playlist with that string should be rejected.
 * Valid names (1-100 chars, not whitespace-only) should be accepted.
 */

describe('Property 2: Playlist name validation rejects whitespace-only input', () => {
  /**
   * **Validates: Requirements 3.5, 3.7**
   */
  it('rejects all whitespace-only strings', () => {
    // Generate strings composed entirely of whitespace characters
    const whitespaceArb = fc
      .array(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'), { minLength: 1, maxLength: 200 })
      .map((chars) => chars.join(''));

    fc.assert(
      fc.property(whitespaceArb, (whitespaceStr: string) => {
        expect(validatePlaylistName(whitespaceStr)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.5, 3.7**
   */
  it('accepts valid names (1-100 non-whitespace characters after trimming)', () => {
    // Generate strings that have at least 1 non-whitespace character and trim to 1-100 chars
    const nonWhitespaceCharArb = fc.integer({ min: 33, max: 126 }).map((code) => String.fromCharCode(code));

    const validNameArb = fc
      .tuple(
        fc.array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 5 }).map((a) => a.join('')),
        fc.array(nonWhitespaceCharArb, { minLength: 1, maxLength: 100 }).map((a) => a.join('')),
        fc.array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 5 }).map((a) => a.join(''))
      )
      .map(([prefix, core, suffix]) => prefix + core + suffix)
      .filter((s) => {
        const trimmed = s.trim();
        return trimmed.length >= 1 && trimmed.length <= 100;
      });

    fc.assert(
      fc.property(validNameArb, (name: string) => {
        expect(validatePlaylistName(name)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.5, 3.7**
   */
  it('rejects empty strings', () => {
    expect(validatePlaylistName('')).toBe(false);
  });

  /**
   * **Validates: Requirements 3.5, 3.7**
   */
  it('rejects strings longer than 100 characters after trimming', () => {
    // Generate non-whitespace strings longer than 100 characters
    const nonWhitespaceCharArb = fc.integer({ min: 33, max: 126 }).map((code) => String.fromCharCode(code));

    const longNameArb = fc
      .array(nonWhitespaceCharArb, { minLength: 101, maxLength: 300 })
      .map((chars) => chars.join(''));

    fc.assert(
      fc.property(longNameArb, (longStr: string) => {
        expect(validatePlaylistName(longStr)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
