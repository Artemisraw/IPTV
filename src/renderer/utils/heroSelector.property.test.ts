import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Channel } from '../../shared/types';
import { selectFeaturedChannel } from './heroSelector';

/**
 * Feature: cinematic-ui-redesign, Property 8: `selectFeaturedChannel` follows
 * MRU → favorite → first priority.
 *
 * Validates: Requirements 2.4
 *
 * The hero selector is a pure function with a deterministic priority cascade:
 *   1. The most recently played Channel from `channels` (MRU order in
 *      `recentlyPlayedChannelIds`).
 *   2. Otherwise, the first favorited Channel in `channels` (input order).
 *   3. Otherwise, `channels[0]`.
 *   4. `null` only when `channels` is empty.
 *
 * The properties below assert each step of the cascade independently so that a
 * bug at any tier is localized in the failing example.
 */

// ---------- Generators ----------

/** Build a Channel with a fixed id; other fields are filled with placeholders. */
function makeChannel(id: string): Channel {
  return {
    id,
    name: `chan-${id}`,
    url: `https://example.com/${id}.m3u8`,
    group: 'Test',
    playlistId: 'pl-test',
    attributes: {},
  };
}

/**
 * Generate a list of channels with unique ids. We use uniqueArray so that the
 * `channels.find(c => c.id === id)` lookup in the implementation is
 * unambiguous, which is what the design's algorithm assumes.
 */
const channelsArb: fc.Arbitrary<Channel[]> = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), {
    minLength: 0,
    maxLength: 25,
  })
  .map((ids) => ids.map(makeChannel));

/**
 * Generate `recentlyPlayedChannelIds`: a mix of ids drawn from the actual
 * channel list (so they hit the MRU branch) and arbitrary "stale" ids (so the
 * lookup must skip them). The mix is constrained to length ≤ 10, matching the
 * design's ring-buffer capacity.
 */
function recentArb(channels: Channel[]): fc.Arbitrary<string[]> {
  const fromChannels =
    channels.length > 0
      ? fc.constantFrom(...channels.map((c) => c.id))
      : fc.string({ minLength: 1, maxLength: 12 });
  const stale = fc.string({ minLength: 1, maxLength: 12 });
  return fc.array(fc.oneof(fromChannels, stale), {
    minLength: 0,
    maxLength: 10,
  });
}

/** Generate a favorite-id set as a subset of channel ids plus optional noise. */
function favoritesArb(channels: Channel[]): fc.Arbitrary<Set<string>> {
  const fromChannels =
    channels.length > 0
      ? fc.subarray(channels.map((c) => c.id))
      : fc.constant<string[]>([]);
  const noise = fc.array(fc.string({ minLength: 1, maxLength: 12 }), {
    minLength: 0,
    maxLength: 5,
  });
  return fc.tuple(fromChannels, noise).map(([a, b]) => new Set<string>([...a, ...b]));
}

describe('Property 8: selectFeaturedChannel follows MRU → favorite → first priority', () => {
  /**
   * **Validates: Requirements 2.4**
   *
   * Tier 4 of the cascade: an empty channel list always returns null
   * regardless of MRU/favorites contents.
   */
  it('returns null when channels is empty', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 10 }),
        fc.array(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 10 }),
        (recent: string[], favs: string[]) => {
          const result = selectFeaturedChannel([], recent, new Set(favs));
          expect(result).toBeNull();
        },
      ),
      { numRuns: 500 },
    );
  });

  /**
   * **Validates: Requirements 2.4**
   *
   * Whenever channels is non-empty, the result is one of the input channels —
   * the function never fabricates a channel.
   */
  it('returns a channel from the input list when channels is non-empty', () => {
    fc.assert(
      fc.property(
        channelsArb.filter((cs) => cs.length > 0),
        fc.gen(),
        (channels: Channel[], gen) => {
          const recent = gen(recentArb, channels);
          const favs = gen(favoritesArb, channels);
          const result = selectFeaturedChannel(channels, recent, favs);
          expect(result).not.toBeNull();
          expect(channels).toContain(result);
        },
      ),
      { numRuns: 500 },
    );
  });

  /**
   * **Validates: Requirements 2.4**
   *
   * Tier 1 of the cascade: when `recentlyPlayedChannelIds` contains at least
   * one id that exists in `channels`, the result must equal the channel for
   * the *first* such id (MRU-first scan).
   */
  it('returns the first MRU id that matches a channel (MRU priority)', () => {
    fc.assert(
      fc.property(
        channelsArb.filter((cs) => cs.length > 0),
        fc.gen(),
        (channels: Channel[], gen) => {
          const recent = gen(recentArb, channels);
          const favs = gen(favoritesArb, channels);

          const channelIds = new Set(channels.map((c) => c.id));
          const firstMruMatch = recent.find((id) => channelIds.has(id));

          if (firstMruMatch !== undefined) {
            const expected = channels.find((c) => c.id === firstMruMatch);
            const result = selectFeaturedChannel(channels, recent, favs);
            expect(result).toBe(expected);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  /**
   * **Validates: Requirements 2.4**
   *
   * Tier 2 of the cascade: when no MRU id matches any channel, the result
   * must equal the first channel in input order whose id is in `favoriteIds`.
   * We use stale-only MRU ids to force the algorithm past tier 1.
   */
  it('returns the first favorite by input order when no MRU id matches', () => {
    fc.assert(
      fc.property(
        channelsArb.filter((cs) => cs.length > 0),
        fc.gen(),
        (channels: Channel[], gen) => {
          // Build MRU entries that cannot match any channel id.
          const channelIds = new Set(channels.map((c) => c.id));
          const staleRecent = gen(
            (cIds: Set<string>) =>
              fc
                .array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 })
                .map((arr) => arr.filter((s) => !cIds.has(s))),
            channelIds,
          );

          const favs = gen(favoritesArb, channels);
          const expectedFav = channels.find((c) => favs.has(c.id));

          if (expectedFav !== undefined) {
            const result = selectFeaturedChannel(channels, staleRecent, favs);
            expect(result).toBe(expectedFav);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  /**
   * **Validates: Requirements 2.4**
   *
   * Tier 3 of the cascade: with no MRU match and no favorites, the result
   * is exactly `channels[0]`.
   */
  it('falls back to channels[0] when MRU does not match and no favorites are present', () => {
    fc.assert(
      fc.property(
        channelsArb.filter((cs) => cs.length > 0),
        fc.gen(),
        (channels: Channel[], gen) => {
          const channelIds = new Set(channels.map((c) => c.id));
          const staleRecent = gen(
            (cIds: Set<string>) =>
              fc
                .array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 })
                .map((arr) => arr.filter((s) => !cIds.has(s))),
            channelIds,
          );

          const result = selectFeaturedChannel(channels, staleRecent, new Set<string>());
          expect(result).toBe(channels[0]);
        },
      ),
      { numRuns: 500 },
    );
  });

  /**
   * **Validates: Requirements 2.4**
   *
   * MRU strictly outranks favorites: even if a different channel is favorited
   * and appears earlier in input order, an MRU hit anywhere must win.
   */
  it('MRU match takes precedence over favorites', () => {
    fc.assert(
      fc.property(
        channelsArb.filter((cs) => cs.length >= 2),
        fc.gen(),
        (channels: Channel[], gen) => {
          // Pick one channel to be the MRU target and a different channel to be the favorite.
          const mruIdx = gen(fc.integer, { min: 0, max: channels.length - 1 });
          let favIdx = gen(fc.integer, { min: 0, max: channels.length - 1 });
          if (favIdx === mruIdx) {
            favIdx = (favIdx + 1) % channels.length;
          }

          const mruChannel = channels[mruIdx];
          const favChannel = channels[favIdx];

          const recent = [mruChannel.id];
          const favs = new Set<string>([favChannel.id]);

          const result = selectFeaturedChannel(channels, recent, favs);
          expect(result).toBe(mruChannel);
        },
      ),
      { numRuns: 500 },
    );
  });

  /**
   * **Validates: Requirements 2.4**
   *
   * Determinism: `selectFeaturedChannel` is pure, so calling it twice with
   * structurally identical arguments yields the same channel.
   */
  it('is deterministic (same inputs produce same output)', () => {
    fc.assert(
      fc.property(
        channelsArb,
        fc.gen(),
        (channels: Channel[], gen) => {
          const recent = gen(recentArb, channels);
          const favs = gen(favoritesArb, channels);

          const a = selectFeaturedChannel(channels, recent, favs);
          const b = selectFeaturedChannel(channels, recent, favs);
          expect(a).toBe(b);
        },
      ),
      { numRuns: 500 },
    );
  });
});
