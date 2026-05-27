import { useMemo } from 'react';

import { extractCategoriesV2 } from '../../shared/utils/categoryExtractor';
import { usePlaylistStore } from '../stores/playlistStore';

/**
 * Stable empty favorites set used by {@link useUncategorizedCount}.
 *
 * The count of uncategorized channels does not depend on which channels are favorited,
 * so we always pass the same empty `Set<string>` to `extractCategoriesV2`. Reusing this
 * module-level constant keeps the `favoriteIds` reference stable across renders, which
 * means the `useMemo` below only recomputes when the `channels` array reference changes.
 */
const EMPTY_FAVORITE_IDS: ReadonlySet<string> = new Set<string>();

/**
 * React hook that returns the number of channels in the active playlist that classify
 * as "Uncategorized" (Requirement 6.7).
 *
 * Used by `SettingsDialog` to render the "{N} hidden uncategorized channels" subtitle
 * underneath the "Show uncategorized channels" toggle.
 *
 * Implementation notes:
 *   - Subscribes to `usePlaylistStore` and reads only `state.channels` so the component
 *     re-renders only when the channel array reference changes.
 *   - Calls `extractCategoriesV2` with `showUncategorized: false` and an empty
 *     `favoriteIds` set; we only need the `uncategorizedCount` field, which does not
 *     depend on either option.
 *   - Wraps the extractor call in `useMemo` keyed on the `channels` reference so the
 *     classification work runs at most once per channels-array update.
 */
export function useUncategorizedCount(): number {
  const channels = usePlaylistStore((state) => state.channels);

  return useMemo(
    () =>
      extractCategoriesV2(channels, {
        showUncategorized: false,
        favoriteIds: EMPTY_FAVORITE_IDS,
      }).uncategorizedCount,
    [channels],
  );
}
