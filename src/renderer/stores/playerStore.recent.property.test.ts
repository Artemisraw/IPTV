import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { pushRecent } from '../utils/pushRecent';

/**
 * Feature: cinematic-ui-redesign, Property 9: `recentlyPlayedChannelIds` is a
 * capacity-10 MRU ring buffer.
 *
 * **Validates: Requirements 2.4**
 *
 * Given any well-formed initial buffer (unique, ≤ 10 entries) and any sequence
 * of pushes, `pushRecent` applied left-to-right must:
 *   1. Keep `length ≤ 10`.
 *   2. Contain no duplicate ids.
 *   3. Place the most-recent push at the head (index 0) when the push
 *      sequence is non-empty.
 *   4. Match the deterministic MRU-window: the first 10 unique ids of the
 *      reverse-pushed sequence concatenated with the prior buffer's MRU order.
 */

const CAPACITY = 10;

/**
 * Reference implementation of the MRU window. Starting from `init` (init[0] is
 * the most-recent prior entry), apply the `pushes` left-to-right and return
 * the resulting buffer. Built by reversing the pushes (newest first), then
 * appending the prior buffer, deduplicating while preserving first-seen order,
 * and truncating to capacity.
 */
function expectedMruWindow(
  init: readonly string[],
  pushes: readonly string[],
): string[] {
  const mruSeq = [...pushes].reverse().concat([...init]);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of mruSeq) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= CAPACITY) break;
  }
  return result;
}

/**
 * Apply a push sequence over an initial buffer using `pushRecent`.
 */
function applyPushes(init: readonly string[], pushes: readonly string[]): string[] {
  let state: readonly string[] = init;
  for (const p of pushes) {
    state = pushRecent(state, p);
  }
  return [...state];
}

/**
 * Generator for a well-formed initial buffer: unique strings, length ≤ 10.
 */
const initBufferArb = fc.uniqueArray(fc.string({ maxLength: 16 }), {
  maxLength: CAPACITY,
});

/**
 * Generator for an arbitrary push sequence. Strings are drawn from a
 * deliberately small alphabet so collisions with `init` and with prior pushes
 * are likely, exercising the deduplication paths.
 */
const pushSequenceArb = fc.array(fc.string({ maxLength: 16 }), {
  maxLength: 50,
});

describe('Property 9: recentlyPlayedChannelIds is a capacity-10 MRU ring buffer', () => {
  it('result length is always ≤ 10', () => {
    fc.assert(
      fc.property(initBufferArb, pushSequenceArb, (init, pushes) => {
        const state = applyPushes(init, pushes);
        expect(state.length).toBeLessThanOrEqual(CAPACITY);
      }),
      { numRuns: 500 },
    );
  });

  it('result contains no duplicate ids', () => {
    fc.assert(
      fc.property(initBufferArb, pushSequenceArb, (init, pushes) => {
        const state = applyPushes(init, pushes);
        expect(new Set(state).size).toBe(state.length);
      }),
      { numRuns: 500 },
    );
  });

  it('head equals the most-recent push when the push sequence is non-empty', () => {
    fc.assert(
      fc.property(
        initBufferArb,
        fc.array(fc.string({ maxLength: 16 }), { minLength: 1, maxLength: 50 }),
        (init, pushes) => {
          const state = applyPushes(init, pushes);
          expect(state[0]).toBe(pushes[pushes.length - 1]);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('set membership matches the MRU window', () => {
    fc.assert(
      fc.property(initBufferArb, pushSequenceArb, (init, pushes) => {
        const state = applyPushes(init, pushes);
        expect(state).toEqual(expectedMruWindow(init, pushes));
      }),
      { numRuns: 500 },
    );
  });
});
