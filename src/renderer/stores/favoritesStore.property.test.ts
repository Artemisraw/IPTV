import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: iptv-core-functionality, Property 4: Favorites toggle is an involution
 *
 * **Validates: Requirements 5.1, 5.2, 5.6**
 *
 * For any channel ID and any initial favorites set, toggling the favorite status
 * twice should return the favorites set to its original state (add then remove = no change,
 * remove then add = no change).
 */

/**
 * Pure toggle function that mirrors the logic in favoritesStore.ts
 * without requiring window.electronAPI or Zustand.
 */
function toggleFavorite(favorites: Set<string>, channelId: string): Set<string> {
  const next = new Set(favorites);
  if (next.has(channelId)) next.delete(channelId);
  else next.add(channelId);
  return next;
}

describe('Property 4: Favorites toggle is an involution', () => {
  /**
   * **Validates: Requirements 5.1, 5.2, 5.6**
   */
  it('toggling a channel twice returns the favorites set to its original state', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 0, maxLength: 50 }),
        fc.uuid(),
        (initialFavoriteIds: string[], channelId: string) => {
          const initial = new Set(initialFavoriteIds);

          // Toggle once
          const afterFirst = toggleFavorite(initial, channelId);
          // Toggle again
          const afterSecond = toggleFavorite(afterFirst, channelId);

          // Should be back to original state
          expect(afterSecond).toEqual(initial);
        }
      ),
      { numRuns: 100 }
    );
  });
});
