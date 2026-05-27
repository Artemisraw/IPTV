import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import type { Channel } from '../types';
import { extractCategoriesV2 } from './categoryExtractor';

/**
 * Feature: cinematic-ui-redesign — property tests for `extractCategoriesV2`.
 *
 * The function under test is a pure derivation of the displayed category
 * structure from a `Channel[]`. The seven properties below collectively pin
 * down the algorithm specified in the design (Requirements 5.1–5.6, 6.2–6.4,
 * 6.7, and the row-ordering rule in 3.2).
 *
 * The classification rule that distinguishes a regular tag from the
 * uncategorized bucket is "the entire trimmed group" — compound groups such
 * as "Undefined;Movies" do NOT classify as uncategorized; they bucket under
 * "Movies". The arbitraries below intentionally exercise both whole-string
 * and segment-level forms of "Undefined" / "Uncategorized" so the rule is
 * tested in both directions.
 */

// ---------------------------------------------------------------------------
// Helpers (pure, mirror the algorithm in the design so we can cross-check)
// ---------------------------------------------------------------------------

function makeChannel(id: string, group: string): Channel {
  return {
    id,
    name: `chan-${id}`,
    url: `https://example.com/${id}.m3u8`,
    group,
    playlistId: 'pl-test',
    attributes: {},
  };
}

/**
 * Mirror of the design's `isUncategorizedGroup` predicate. A channel is
 * uncategorized when the *entire* trimmed group value matches the rule.
 */
function isUncategorizedRule(group: string): boolean {
  const trimmed = group.trim();
  if (trimmed === '') return true;
  const lower = trimmed.toLowerCase();
  return lower === 'undefined' || lower === 'uncategorized';
}

/**
 * Compute the set of regular tags a channel contributes to, per Requirement
 * 5.1: split on `;`, trim each segment, drop empties, dedup case-sensitively.
 * Only meaningful when the channel is *not* whole-uncategorized.
 */
function computeTagSet(group: string): Set<string> {
  const set = new Set<string>();
  for (const segment of group.split(';')) {
    const t = segment.trim();
    if (t !== '') set.add(t);
  }
  return set;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * A "real" tag segment: a non-empty string containing no semicolon, with
 * at least one non-whitespace character. We avoid producing the literal
 * uncategorized tokens here so the segment-level path is unambiguous; the
 * whole-uncategorized path is exercised separately below.
 */
const realTagSegmentArb = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((s) => !s.includes(';'))
  .filter((s) => s.trim().length > 0)
  .filter((s) => {
    const lower = s.trim().toLowerCase();
    return lower !== 'undefined' && lower !== 'uncategorized';
  });

/**
 * Group string arbitrary that exercises every classification path:
 *   - whole-empty / whole-whitespace                → uncategorized
 *   - whole "Undefined"/"Uncategorized" (any case) → uncategorized
 *   - single regular tag                           → one category
 *   - compound: 2-4 segments joined by ';' where any segment may be empty,
 *     uncategorized-like, or a real tag           → multi-tag membership,
 *     NOT classified as uncategorized as long as at least one segment is real
 */
const groupArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 2, arbitrary: fc.constant('') },
  { weight: 2, arbitrary: fc.constant('   ') },
  {
    weight: 3,
    arbitrary: fc.constantFrom(
      'Undefined',
      'undefined',
      'UNDEFINED',
      'Uncategorized',
      'uncategorized',
      '  Undefined  ',
    ),
  },
  { weight: 8, arbitrary: realTagSegmentArb },
  {
    weight: 8,
    arbitrary: fc
      .array(
        fc.oneof(
          realTagSegmentArb,
          fc.constant(''),
          fc.constantFrom('undefined', 'Undefined', 'uncategorized'),
        ),
        { minLength: 2, maxLength: 4 },
      )
      .map((segments) => segments.join(';')),
  },
);

/**
 * Channels with unique IDs (so favorite-id lookups are unambiguous in
 * Property 7). Length is bounded to keep `numRuns: 500` runs fast.
 */
const channelsArb: fc.Arbitrary<Channel[]> = fc
  .uniqueArray(
    fc.tuple(fc.uuid(), groupArb).map(([id, group]) => makeChannel(id, group)),
    { selector: (c: Channel) => c.id, minLength: 0, maxLength: 25 },
  );

/** ASCII-only lowercase tag for the case-sensitivity property. */
const asciiLowerAlphaTagArb = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), {
    minLength: 1,
    maxLength: 10,
  })
  .map((chars) => chars.join(''))
  .filter((s) => s !== 'undefined' && s !== 'uncategorized');

/** Favorite-id set drawn from the channels actually present. */
function favoritesArbForChannels(channels: Channel[]): fc.Arbitrary<Set<string>> {
  if (channels.length === 0) return fc.constant(new Set<string>());
  return fc.subarray(channels.map((c) => c.id)).map((arr) => new Set(arr));
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('extractCategoriesV2 — property tests', () => {
  /**
   * **Property 1: Category membership matches semicolon-split tag set**
   *
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
   *
   * For every regular category K in the output (excluding the special
   * "Favorites" and "Uncategorized" buckets), the channels in `K`'s bucket
   * are exactly the non-uncategorized channels whose semicolon-split,
   * trimmed, deduped tag set contains K, in original input order.
   */
  it('Property 1: each regular bucket equals the channels whose tag set contains the category', () => {
    fc.assert(
      fc.property(channelsArb, fc.boolean(), (channels, showUncategorized) => {
        const result = extractCategoriesV2(channels, {
          showUncategorized,
          favoriteIds: new Set<string>(),
        });

        for (const [category, bucket] of result.categoryToChannels) {
          if (category === 'Favorites' || category === 'Uncategorized') continue;
          const expected = channels.filter(
            (c) => !isUncategorizedRule(c.group) && computeTagSet(c.group).has(category),
          );
          expect(bucket).toEqual(expected);
          // Implementation should never create an empty regular bucket.
          expect(bucket.length).toBeGreaterThan(0);
        }

        // Conversely, every (channel, tag) pair that should produce membership
        // does so — i.e. the set of regular keys equals the union of all
        // computed tag sets across non-uncategorized channels.
        const expectedKeys = new Set<string>();
        for (const c of channels) {
          if (isUncategorizedRule(c.group)) continue;
          for (const t of computeTagSet(c.group)) expectedKeys.add(t);
        }
        const actualKeys = new Set(
          Array.from(result.categoryToChannels.keys()).filter(
            (k) => k !== 'Favorites' && k !== 'Uncategorized',
          ),
        );
        expect(actualKeys).toEqual(expectedKeys);
      }),
      { numRuns: 500 },
    );
  });

  /**
   * **Property 2: Case-sensitive deduplication preserves source casing**
   *
   * **Validates: Requirements 5.5**
   *
   * Two channels whose group strings differ only in letter case yield two
   * distinct keys in the output map; neither key absorbs the other.
   */
  it('Property 2: distinct casings of the same tag remain separate categories', () => {
    fc.assert(
      fc.property(asciiLowerAlphaTagArb, fc.uuid(), fc.uuid(), (lowerTag, id1, id2) => {
        const upperTag = lowerTag.toUpperCase();
        // ASCII-letter generation guarantees the two casings differ.
        expect(upperTag).not.toBe(lowerTag);

        const c1 = makeChannel(id1, lowerTag);
        const c2 = makeChannel(id2, upperTag);
        const r = extractCategoriesV2([c1, c2], {
          showUncategorized: false,
          favoriteIds: new Set<string>(),
        });

        expect(r.categoryToChannels.size).toBe(2);
        expect(r.categoryToChannels.get(lowerTag)).toEqual([c1]);
        expect(r.categoryToChannels.get(upperTag)).toEqual([c2]);
      }),
      { numRuns: 500 },
    );
  });

  /**
   * **Property 3: extractCategoriesV2 is pure and deterministic**
   *
   * **Validates: Requirements 5.6**
   *
   * The function reads neither `Date.now` nor `Math.random`, and running it
   * twice on the same inputs yields structurally equal output. We mock both
   * sources to throw inside the property so any read fails the test.
   */
  it('Property 3: pure & deterministic — no Date.now / Math.random reads, stable across calls', () => {
    fc.assert(
      fc.property(channelsArb, fc.boolean(), (channels, showUncategorized) => {
        const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
          throw new Error('extractCategoriesV2 must not read Date.now');
        });
        const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
          throw new Error('extractCategoriesV2 must not read Math.random');
        });
        try {
          const opts = { showUncategorized, favoriteIds: new Set<string>() };
          const r1 = extractCategoriesV2(channels, opts);
          const r2 = extractCategoriesV2(channels, opts);

          // Same key sequence (insertion order matters).
          expect(Array.from(r2.categoryToChannels.keys())).toEqual(
            Array.from(r1.categoryToChannels.keys()),
          );
          // Same buckets per key.
          for (const k of r1.categoryToChannels.keys()) {
            expect(r2.categoryToChannels.get(k)).toEqual(r1.categoryToChannels.get(k));
          }
          expect(r2.uncategorized).toEqual(r1.uncategorized);
          expect(r2.uncategorizedCount).toBe(r1.uncategorizedCount);
        } finally {
          dateSpy.mockRestore();
          randomSpy.mockRestore();
        }
      }),
      { numRuns: 500 },
    );
  });

  /**
   * **Property 4: Uncategorized classification rule**
   *
   * **Validates: Requirements 6.2**
   *
   * A channel lands in `uncategorized` iff its trimmed group is empty, or
   * (case-insensitively) equals "undefined" or "uncategorized". Compound
   * groups containing those tokens as *segments* (e.g. "Undefined;Movies")
   * are NOT uncategorized.
   */
  it('Property 4: uncategorized bucket equals channels whose trimmed group matches the rule', () => {
    fc.assert(
      fc.property(channelsArb, (channels) => {
        const r = extractCategoriesV2(channels, {
          showUncategorized: true,
          favoriteIds: new Set<string>(),
        });
        const expected = channels.filter((c) => isUncategorizedRule(c.group));
        // Exact equality (order, identity) — the algorithm preserves input order.
        expect(r.uncategorized).toEqual(expected);
      }),
      { numRuns: 500 },
    );
  });

  /**
   * **Property 5: `showUncategorized` toggles the uncategorized bucket atomically**
   *
   * **Validates: Requirements 6.3, 6.4**
   *
   * Toggling `showUncategorized` does not change the regular categories, the
   * `uncategorized` array, or `uncategorizedCount` — it only adds or removes
   * the trailing "Uncategorized" entry of the ordered map.
   */
  it('Property 5: toggling showUncategorized only adds/removes the trailing Uncategorized entry', () => {
    fc.assert(
      fc.property(channelsArb, (channels) => {
        const off = extractCategoriesV2(channels, {
          showUncategorized: false,
          favoriteIds: new Set<string>(),
        });
        const on = extractCategoriesV2(channels, {
          showUncategorized: true,
          favoriteIds: new Set<string>(),
        });

        // The classification side of the result is independent of the toggle.
        expect(on.uncategorized).toEqual(off.uncategorized);
        expect(on.uncategorizedCount).toBe(off.uncategorizedCount);

        const offKeys = Array.from(off.categoryToChannels.keys());
        const onKeys = Array.from(on.categoryToChannels.keys());

        // The "off" view never mentions the Uncategorized entry.
        expect(offKeys.includes('Uncategorized')).toBe(false);

        if (off.uncategorizedCount > 0) {
          // The "on" view appends "Uncategorized" at the end and is otherwise
          // identical in order to the "off" view.
          expect(onKeys).toEqual([...offKeys, 'Uncategorized']);
          expect(on.categoryToChannels.get('Uncategorized')).toEqual(off.uncategorized);
        } else {
          // No uncategorized channels means the toggle is a no-op.
          expect(onKeys).toEqual(offKeys);
        }

        // Every regular bucket is unchanged across the toggle.
        for (const k of offKeys) {
          expect(on.categoryToChannels.get(k)).toEqual(off.categoryToChannels.get(k));
        }
      }),
      { numRuns: 500 },
    );
  });

  /**
   * **Property 6: `uncategorizedCount` equals the size of the uncategorized bucket**
   *
   * **Validates: Requirements 6.7**
   *
   * The count exposed for the SettingsDialog subtitle is always equal to
   * `uncategorized.length`, and when `showUncategorized` is true the
   * "Uncategorized" entry of the ordered map carries the same length.
   */
  it('Property 6: uncategorizedCount === uncategorized.length (and matches the visible row when shown)', () => {
    fc.assert(
      fc.property(channelsArb, fc.boolean(), (channels, showUncategorized) => {
        const r = extractCategoriesV2(channels, {
          showUncategorized,
          favoriteIds: new Set<string>(),
        });
        expect(r.uncategorizedCount).toBe(r.uncategorized.length);
        if (showUncategorized && r.uncategorizedCount > 0) {
          expect(r.categoryToChannels.get('Uncategorized')?.length).toBe(r.uncategorizedCount);
        } else {
          expect(r.categoryToChannels.has('Uncategorized')).toBe(false);
        }
      }),
      { numRuns: 500 },
    );
  });

  /**
   * **Property 7: Row ordering is Favorites-first then locale-alphabetical**
   *
   * **Validates: Requirements 3.2**
   *
   * The output `categoryToChannels` orders its keys as:
   *   1. "Favorites" (only when at least one favorited channel has a regular
   *      tag — uncategorized favorites do not seed the row);
   *   2. all regular tag keys, sorted with
   *      `Intl.Collator(undefined, { sensitivity: 'variant' })`;
   *   3. "Uncategorized" last (only when `showUncategorized` is true and the
   *      uncategorized bucket is non-empty).
   */
  it('Property 7: keys are Favorites first (when applicable), regular tags sorted, Uncategorized last', () => {
    const collator = new Intl.Collator(undefined, { sensitivity: 'variant' });

    fc.assert(
      fc.property(
        channelsArb.chain((channels) =>
          fc.tuple(
            fc.constant(channels),
            favoritesArbForChannels(channels),
            fc.boolean(),
          ),
        ),
        ([channels, favoriteIds, showUncategorized]) => {
          const r = extractCategoriesV2(channels, { showUncategorized, favoriteIds });
          const keys = Array.from(r.categoryToChannels.keys());

          // 1. Favorites-first predicate: at least one favorited channel has
          //    a regular (non-empty) tag set.
          const expectsFavorites = channels.some(
            (c) =>
              favoriteIds.has(c.id) &&
              !isUncategorizedRule(c.group) &&
              computeTagSet(c.group).size > 0,
          );
          if (expectsFavorites) {
            expect(keys[0]).toBe('Favorites');
          } else {
            expect(keys.includes('Favorites')).toBe(false);
          }

          // 2. The "middle" segment — every key that is neither "Favorites"
          //    nor "Uncategorized" — must be sorted by the locale collator.
          const middle = keys.filter((k) => k !== 'Favorites' && k !== 'Uncategorized');
          for (let i = 1; i < middle.length; i++) {
            expect(collator.compare(middle[i - 1], middle[i])).toBeLessThanOrEqual(0);
          }

          // 3. Uncategorized only appears (and only at the tail) when shown.
          if (showUncategorized && r.uncategorizedCount > 0) {
            expect(keys[keys.length - 1]).toBe('Uncategorized');
          } else {
            expect(keys.includes('Uncategorized')).toBe(false);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
