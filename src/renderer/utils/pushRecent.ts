/**
 * Capacity of the recently-played ring buffer (Requirement 2.4).
 */
const RECENT_CAPACITY = 10;

/**
 * Move-to-front insertion into a capped MRU (most-recently-used) ring buffer.
 *
 * Pure function — output depends only on its inputs. No `Date`, `Math.random`,
 * IPC, or other side effects.
 *
 * Semantics (Requirement 2.4):
 *   1. Filter out any existing occurrence of `id` from `ids`.
 *   2. Prepend `id` so it becomes the head (most recent).
 *   3. Truncate to capacity 10.
 *
 * Always returns a fresh array; the input is not mutated.
 */
export function pushRecent(ids: readonly string[], id: string): string[] {
  const without = ids.filter((existing) => existing !== id);
  return [id, ...without].slice(0, RECENT_CAPACITY);
}
