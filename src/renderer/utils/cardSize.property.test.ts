import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { computeCardSize } from '../hooks/useCardSize';

/**
 * Feature: cinematic-ui-redesign, Property 22:
 * `useCardSize` is a piecewise function within band ranges.
 *
 * **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.6**
 *
 * For any window width `w >= 800`, `computeCardSize(w).cardWidth` must fall
 * inside the band associated with `w`:
 *
 *   w in [800, 1024)  -> cardWidth in [140, 160]
 *   w in [1024, 1440) -> cardWidth in [160, 180]
 *   w in [1440, 1920) -> cardWidth in [180, 220]
 *   w >= 1920         -> cardWidth in [220, 260]
 *
 * In particular, any `w < 1920` must yield `cardWidth <= 220`
 * (Requirement 12.3 negative clause).
 *
 * The card aspect ratio is always 16:9, so
 * `cardHeight === Math.round(cardWidth * 9 / 16)` for every input.
 */

interface Band {
  readonly minWindow: number;
  readonly maxWindow: number;
  readonly cardMin: number;
  readonly cardMax: number;
}

const BANDS: readonly Band[] = [
  { minWindow: 800, maxWindow: 1024, cardMin: 140, cardMax: 160 },
  { minWindow: 1024, maxWindow: 1440, cardMin: 160, cardMax: 180 },
  { minWindow: 1440, maxWindow: 1920, cardMin: 180, cardMax: 220 },
  { minWindow: 1920, maxWindow: Number.POSITIVE_INFINITY, cardMin: 220, cardMax: 260 },
];

function bandFor(width: number): Band {
  for (const band of BANDS) {
    if (width >= band.minWindow && width < band.maxWindow) {
      return band;
    }
  }
  // Unreachable for w >= 800 because the bands cover [800, Infinity).
  throw new Error(`no band matches width ${width}`);
}

describe('Property 22: useCardSize is a piecewise function within band ranges', () => {
  /**
   * **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.6**
   */
  it('cardWidth lies inside the band, w<1920 implies cardWidth<=220, cardHeight is the 16:9 round', () => {
    fc.assert(
      fc.property(
        // Window widths >= 800 (Requirement 12.6 minimum supported width).
        // Cap at a generous upper bound so fast-check explores inside the
        // top-open band [1920, infinity) without producing absurd sizes.
        fc.integer({ min: 800, max: 10_000 }),
        (width: number) => {
          const { cardWidth, cardHeight } = computeCardSize(width);
          const band = bandFor(width);

          // Card width is inside the band's [min, max] range.
          expect(cardWidth).toBeGreaterThanOrEqual(band.cardMin);
          expect(cardWidth).toBeLessThanOrEqual(band.cardMax);

          // Requirement 12.3 negative clause: any w < 1920 caps card width at 220.
          if (width < 1920) {
            expect(cardWidth).toBeLessThanOrEqual(220);
          }

          // 16:9 aspect ratio, rounded.
          expect(cardHeight).toBe(Math.round((cardWidth * 9) / 16));
        },
      ),
      { numRuns: 500 },
    );
  });
});
