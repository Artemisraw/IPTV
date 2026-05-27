import type { Channel } from '../../shared/types';

/**
 * Selects the featured Channel for the HeroBanner.
 *
 * Pure function — output depends only on its inputs. No `Date`, `Math.random`,
 * IPC, or other side effects.
 *
 * Priority (Requirement 2.4):
 *   1. The most recently played Channel from `channels` (MRU order in
 *      `recentlyPlayedChannelIds`).
 *   2. Otherwise, the first favorited Channel in `channels` (input order).
 *   3. Otherwise, `channels[0]`.
 *
 * Returns `null` only when `channels` is empty.
 */
export function selectFeaturedChannel(
  channels: readonly Channel[],
  recentlyPlayedChannelIds: readonly string[],
  favoriteIds: ReadonlySet<string>,
): Channel | null {
  if (channels.length === 0) {
    return null;
  }

  // 1. MRU lookup — first id in recentlyPlayedChannelIds that exists in channels.
  for (const id of recentlyPlayedChannelIds) {
    const match = channels.find((c) => c.id === id);
    if (match !== undefined) {
      return match;
    }
  }

  // 2. First favorite in input order.
  for (const channel of channels) {
    if (favoriteIds.has(channel.id)) {
      return channel;
    }
  }

  // 3. First channel.
  return channels[0];
}
