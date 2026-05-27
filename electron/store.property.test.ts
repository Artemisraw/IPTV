import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { PersistedState, Channel, PersistedPlaylist } from '../src/shared/types/index';

/**
 * Feature: iptv-core-functionality, Property 6: Persisted state serialization round-trip
 *
 * Validates: Requirements 6.1, 6.2
 *
 * For any valid PersistedState object, serializing it to JSON (as electron-store does)
 * and then deserializing it should produce an equivalent object with all fields intact.
 */

// Arbitrary for Channel
const channelArb: fc.Arbitrary<Channel> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  url: fc.webUrl(),
  group: fc.string({ minLength: 1, maxLength: 50 }),
  logo: fc.option(fc.webUrl(), { nil: undefined }),
  tvgId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  tvgName: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  userAgent: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  playlistId: fc.uuid(),
  attributes: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.string({ maxLength: 100 })
  ),
});

// Arbitrary for PersistedPlaylist
const persistedPlaylistArb: fc.Arbitrary<PersistedPlaylist> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  url: fc.webUrl(),
  channels: fc.array(channelArb, { minLength: 0, maxLength: 10 }),
});

// Arbitrary for PersistedState
const persistedStateArb: fc.Arbitrary<PersistedState> = fc.record({
  playlists: fc.array(persistedPlaylistArb, { minLength: 0, maxLength: 50 }),
  favorites: fc.array(fc.uuid(), { minLength: 0, maxLength: 100 }),
  volume: fc.integer({ min: 0, max: 100 }),
  muted: fc.boolean(),
  lastActivePlaylistId: fc.option(fc.uuid(), { nil: null }),
  mpvBinaryPath: fc.option(fc.string({ minLength: 1, maxLength: 1024 }), { nil: null }),
});

describe('Property 6: Persisted state serialization round-trip', () => {
  /**
   * **Validates: Requirements 6.1, 6.2**
   */
  it('serializing to JSON and deserializing produces an equivalent object', () => {
    fc.assert(
      fc.property(persistedStateArb, (state: PersistedState) => {
        const serialized = JSON.stringify(state);
        const deserialized = JSON.parse(serialized) as PersistedState;

        expect(deserialized).toEqual(state);
      }),
      { numRuns: 100 }
    );
  });
});
