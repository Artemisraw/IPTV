import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Channel, PersistedPlaylist } from '../types/index';

/**
 * Feature: iptv-core-functionality, Property 7: Playlist removal cleans up orphaned favorites
 *
 * Validates: Requirements 5.7
 *
 * For any persisted state containing playlists and favorites, when a playlist is removed,
 * any favorite channel IDs that belonged exclusively to that playlist (not present in any
 * other playlist) should be removed from the favorites list.
 */

// --- Pure function under test ---

interface PlaylistRemovalState {
  playlists: PersistedPlaylist[];
  favorites: string[];
}

/**
 * Removes a playlist and cleans up orphaned favorites.
 * A favorite is orphaned if its channel ID existed exclusively in the removed playlist
 * and is not present in any remaining playlist.
 */
export function removePlaylistAndCleanFavorites(
  state: PlaylistRemovalState,
  playlistIdToRemove: string
): PlaylistRemovalState {
  const remainingPlaylists = state.playlists.filter(p => p.id !== playlistIdToRemove);

  // Collect all channel IDs that exist in remaining playlists
  const remainingChannelIds = new Set<string>();
  for (const playlist of remainingPlaylists) {
    for (const channel of playlist.channels) {
      remainingChannelIds.add(channel.id);
    }
  }

  // Keep only favorites that reference channels still present in remaining playlists
  const cleanedFavorites = state.favorites.filter(favId => remainingChannelIds.has(favId));

  return {
    playlists: remainingPlaylists,
    favorites: cleanedFavorites,
  };
}

// --- Arbitraries ---

// Generate a channel with a specific playlistId
function channelArb(playlistId: string): fc.Arbitrary<Channel> {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    url: fc.webUrl(),
    group: fc.string({ minLength: 1, maxLength: 30 }),
    logo: fc.constant(undefined),
    tvgId: fc.constant(undefined),
    tvgName: fc.constant(undefined),
    userAgent: fc.constant(undefined),
    playlistId: fc.constant(playlistId),
    attributes: fc.constant({}),
  });
}

// Generate a playlist with its own channels
const playlistWithChannelsArb: fc.Arbitrary<PersistedPlaylist> = fc.uuid().chain(playlistId =>
  fc.record({
    id: fc.constant(playlistId),
    name: fc.string({ minLength: 1, maxLength: 100 }),
    url: fc.webUrl(),
    channels: fc.array(channelArb(playlistId), { minLength: 1, maxLength: 10 }),
  })
);

// Generate a full state: 2-5 playlists with favorites drawn from their channels
const stateWithPlaylistToRemoveArb: fc.Arbitrary<{
  state: PlaylistRemovalState;
  playlistIdToRemove: string;
}> = fc
  .array(playlistWithChannelsArb, { minLength: 2, maxLength: 5 })
  .chain(playlists => {
    // Collect all channel IDs across all playlists
    const allChannelIds = playlists.flatMap(p => p.channels.map(c => c.id));

    // Generate favorites as a subset of all channel IDs
    const favoritesArb = fc.subarray(allChannelIds, { minLength: 0 });

    // Pick one playlist to remove
    const playlistIndexArb = fc.integer({ min: 0, max: playlists.length - 1 });

    return fc.tuple(favoritesArb, playlistIndexArb).map(([favorites, idx]) => ({
      state: { playlists, favorites: [...new Set(favorites)] },
      playlistIdToRemove: playlists[idx].id,
    }));
  });

// --- Tests ---

describe('Property 7: Playlist removal cleans up orphaned favorites', () => {
  /**
   * **Validates: Requirements 5.7**
   */
  it('removed playlist is no longer in the state', () => {
    fc.assert(
      fc.property(stateWithPlaylistToRemoveArb, ({ state, playlistIdToRemove }) => {
        const result = removePlaylistAndCleanFavorites(state, playlistIdToRemove);

        // The removed playlist should not be present
        const removedPlaylistIds = result.playlists.map(p => p.id);
        expect(removedPlaylistIds).not.toContain(playlistIdToRemove);
      }),
      { numRuns: 100 }
    );
  });

  it('all remaining favorites reference channels that exist in at least one remaining playlist', () => {
    fc.assert(
      fc.property(stateWithPlaylistToRemoveArb, ({ state, playlistIdToRemove }) => {
        const result = removePlaylistAndCleanFavorites(state, playlistIdToRemove);

        // Collect all channel IDs in remaining playlists
        const remainingChannelIds = new Set<string>();
        for (const playlist of result.playlists) {
          for (const channel of playlist.channels) {
            remainingChannelIds.add(channel.id);
          }
        }

        // Every remaining favorite must reference a channel that still exists
        for (const favId of result.favorites) {
          expect(remainingChannelIds.has(favId)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('favorites referencing channels in multiple playlists (including removed one) are preserved', () => {
    fc.assert(
      fc.property(stateWithPlaylistToRemoveArb, ({ state, playlistIdToRemove }) => {
        const result = removePlaylistAndCleanFavorites(state, playlistIdToRemove);

        // Find channel IDs that exist in both the removed playlist and at least one other
        const removedPlaylist = state.playlists.find(p => p.id === playlistIdToRemove);
        const removedChannelIds = new Set(removedPlaylist?.channels.map(c => c.id) ?? []);

        const otherPlaylists = state.playlists.filter(p => p.id !== playlistIdToRemove);
        const otherChannelIds = new Set<string>();
        for (const playlist of otherPlaylists) {
          for (const channel of playlist.channels) {
            otherChannelIds.add(channel.id);
          }
        }

        // Shared channel IDs: present in both removed and remaining playlists
        const sharedChannelIds = new Set(
          [...removedChannelIds].filter(id => otherChannelIds.has(id))
        );

        // Any favorite that was a shared channel should still be in favorites
        for (const favId of state.favorites) {
          if (sharedChannelIds.has(favId)) {
            expect(result.favorites).toContain(favId);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('the function is deterministic (same input produces same output)', () => {
    fc.assert(
      fc.property(stateWithPlaylistToRemoveArb, ({ state, playlistIdToRemove }) => {
        const result1 = removePlaylistAndCleanFavorites(state, playlistIdToRemove);
        const result2 = removePlaylistAndCleanFavorites(state, playlistIdToRemove);

        expect(result1).toEqual(result2);
      }),
      { numRuns: 100 }
    );
  });
});
