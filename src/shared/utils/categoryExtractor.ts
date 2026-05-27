import type { Channel } from '../types';

/**
 * Result shape returned by {@link extractCategoriesV2}.
 *
 * `categoryToChannels` is an insertion-ordered map. The ordering convention is:
 *   1. "Favorites" first (only when the favorites bucket is non-empty)
 *   2. All regular categories sorted with `Intl.Collator(undefined, { sensitivity: 'variant' })`
 *      so that distinct casings (e.g. "Movies" and "movies") remain separate keys (Requirement 5.5)
 *   3. "Uncategorized" last (only when `showUncategorized` is true and the bucket is non-empty)
 */
export interface ExtractedCategories {
  /** Ordered map of category label to its channels. See class-level comment for ordering rules. */
  categoryToChannels: Map<string, Channel[]>;
  /** All channels classified as uncategorized, in their original input order. */
  uncategorized: Channel[];
  /** Convenience — equals `uncategorized.length`. */
  uncategorizedCount: number;
}

/**
 * Options controlling the extraction.
 */
export interface ExtractOptions {
  /**
   * When true and at least one channel is uncategorized, append a final
   * "Uncategorized" entry to `categoryToChannels` containing every uncategorized channel.
   */
  showUncategorized: boolean;
  /**
   * Set of channel IDs marked as favorite. Used to seed the "Favorites" row.
   * A channel is added to "Favorites" only if it is a favorite AND it has at least one
   * regular (non-uncategorized) category — uncategorized favorites surface only inside
   * the "Uncategorized" row when the toggle is on.
   */
  favoriteIds: ReadonlySet<string>;
}

const UNCATEGORIZED_TOKENS: ReadonlySet<string> = new Set(['undefined', 'uncategorized']);

/**
 * Returns true when the entire (trimmed) group value classifies the channel as uncategorized.
 *
 * Per Requirement 6.2 and design Property 4: a channel is uncategorized when the `group` is
 * missing, empty after trim, or whose lower-cased trimmed value is exactly `"undefined"` or
 * `"uncategorized"`. Compound groups such as "Undefined;Movies" do NOT trigger this rule —
 * the real tag wins.
 */
function isUncategorizedGroup(group: string | undefined | null): boolean {
  if (group === undefined || group === null) {
    return true;
  }
  const trimmed = group.trim();
  if (trimmed === '') {
    return true;
  }
  return UNCATEGORIZED_TOKENS.has(trimmed.toLowerCase());
}

/**
 * Pure derivation of the displayed category structure from a Channel array.
 *
 * Algorithm (Requirements 5.1–5.6, 6.2–6.4):
 *   1. For each channel, classify as uncategorized when the whole group value matches
 *      {@link isUncategorizedGroup}; otherwise split the group on `;`, trim each segment,
 *      drop empty segments, and place the channel into each remaining tag's bucket.
 *      Tag de-duplication is case-sensitive so "Movies" and "movies" remain distinct.
 *   2. Build an ordered output map:
 *        - "Favorites" first if any favorited channel landed in at least one regular tag
 *        - All regular tags sorted with `Intl.Collator(undefined, { sensitivity: 'variant' })`
 *        - "Uncategorized" last when `showUncategorized` is true and the bucket is non-empty
 *
 * Determinism contract (Requirement 5.6 / Property 3): this function does not read
 * `Date`, `Math.random`, `console`, or perform any IPC. Output is a deep function of
 * `(channels, options)`.
 */
export function extractCategoriesV2(
  channels: readonly Channel[],
  options: ExtractOptions,
): ExtractedCategories {
  const uncategorized: Channel[] = [];
  const raw = new Map<string, Channel[]>();
  const favoritesBucket: Channel[] = [];

  for (const channel of channels) {
    if (isUncategorizedGroup(channel.group)) {
      uncategorized.push(channel);
      continue;
    }

    let placedInRegular = false;
    // Use a per-channel set to avoid duplicating a channel in the same tag bucket
    // when the source group repeats a tag, e.g. "News;News".
    const seenTags = new Set<string>();
    const segments = channel.group.split(';');
    for (const segment of segments) {
      const tag = segment.trim();
      if (tag === '') {
        continue;
      }
      if (seenTags.has(tag)) {
        continue;
      }
      seenTags.add(tag);

      let bucket = raw.get(tag);
      if (bucket === undefined) {
        bucket = [];
        raw.set(tag, bucket);
      }
      bucket.push(channel);
      placedInRegular = true;
    }

    if (placedInRegular && options.favoriteIds.has(channel.id)) {
      favoritesBucket.push(channel);
    }
  }

  const ordered = new Map<string, Channel[]>();

  if (favoritesBucket.length > 0) {
    ordered.set('Favorites', favoritesBucket);
  }

  const collator = new Intl.Collator(undefined, { sensitivity: 'variant' });
  const sortedTags = Array.from(raw.keys()).sort((a, b) => collator.compare(a, b));
  for (const tag of sortedTags) {
    // Non-null asserted: tag came from raw.keys()
    ordered.set(tag, raw.get(tag) as Channel[]);
  }

  if (options.showUncategorized && uncategorized.length > 0) {
    ordered.set('Uncategorized', uncategorized);
  }

  return {
    categoryToChannels: ordered,
    uncategorized,
    uncategorizedCount: uncategorized.length,
  };
}
