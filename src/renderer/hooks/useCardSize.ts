import { useEffect, useMemo, useState } from 'react';

/**
 * Output of the card-size computation.
 *
 * - `cardWidth`/`cardHeight` are the pixel dimensions that every ChannelCard in
 *   the current window-width band should render at.
 * - `heroMin`/`heroMax` are the inclusive bounds of the HeroBanner's height for
 *   the current band (Requirements 2.1, 12.4).
 */
export interface CardSize {
  cardWidth: number;
  cardHeight: number;
  heroMin: number;
  heroMax: number;
}

/**
 * Trailing debounce delay for `resize` events (Requirement 12.5).
 *
 * The HomeView must recompute card sizing within 250 ms of the resize
 * completing, so the debounce window is exactly 250 ms.
 */
const RESIZE_DEBOUNCE_MS = 250;

/**
 * Total horizontal page gutter (left + right) reserved around the grid.
 * Used by the band formula to subtract chrome before dividing into cards.
 */
const PAGE_GUTTER_PX = 64;

/**
 * Fallback width when `window` is not available (e.g., during SSR or unit
 * tests that don't provide a DOM). 1280 px lands in the 1024-1439 band, the
 * "default window width" referenced by Requirement 4.1.
 */
const FALLBACK_WIDTH_PX = 1280;

/**
 * Definition of a single responsive band. The bands are pairwise disjoint and
 * together cover every `width >= 800` (the minimum supported window width per
 * Requirement 12.6).
 */
interface Band {
  /** Inclusive lower window-width bound (px). */
  minWindow: number;
  /** Exclusive upper window-width bound (px); `Infinity` for the top band. */
  maxWindow: number;
  /** Inclusive lower bound of the card width for this band (px). */
  cardMin: number;
  /** Inclusive upper bound of the card width for this band (px). */
  cardMax: number;
  /** Inclusive lower bound of the HeroBanner height for this band (px). */
  heroMin: number;
  /** Inclusive upper bound of the HeroBanner height for this band (px). */
  heroMax: number;
  /**
   * Target number of cards visible in one row width. The hook divides the
   * available width by this to pick a card width inside the band; the result
   * is clamped to `[cardMin, cardMax]` so the band invariants always hold.
   */
  cardsPerView: number;
}

/**
 * Window-width to (card, hero) bands per the design's responsive table:
 *
 *   < 1024 : card 140-160, hero 200-280
 *   1024-1439 : card 160-180, hero 280-420
 *   1440-1919 : card 180-220, hero 280-420
 *   >= 1920 : card 220-260, hero 280-420
 *
 * `cardsPerView` is chosen so the clamped formula lands inside the band at
 * typical widths in each range without ever exceeding the band's bounds.
 */
const BANDS: readonly Band[] = [
  {
    minWindow: 0,
    maxWindow: 1024,
    cardMin: 140,
    cardMax: 160,
    heroMin: 200,
    heroMax: 280,
    cardsPerView: 5,
  },
  {
    minWindow: 1024,
    maxWindow: 1440,
    cardMin: 160,
    cardMax: 180,
    heroMin: 280,
    heroMax: 420,
    cardsPerView: 6,
  },
  {
    minWindow: 1440,
    maxWindow: 1920,
    cardMin: 180,
    cardMax: 220,
    heroMin: 280,
    heroMax: 420,
    cardsPerView: 7,
  },
  {
    minWindow: 1920,
    maxWindow: Infinity,
    cardMin: 220,
    cardMax: 260,
    heroMin: 280,
    heroMax: 420,
    cardsPerView: 8,
  },
];

function pickBand(width: number): Band {
  for (const band of BANDS) {
    if (width >= band.minWindow && width < band.maxWindow) {
      return band;
    }
  }
  // Unreachable while BANDS covers (-Infinity, Infinity); keep a sane default.
  return BANDS[BANDS.length - 1];
}

/**
 * Pure piecewise function that maps a window width (px) to the card and hero
 * dimensions the renderer should use.
 *
 * Pure — output depends only on `width`. No `Date`, `Math.random`, IPC, or
 * other side effects. Exported so it is testable without React.
 *
 * Invariants (checked by the property test in 3.8):
 *   - `cardWidth ∈ [band.cardMin, band.cardMax]`
 *   - `width < 1920 ⇒ cardWidth ≤ 220`
 *   - `cardHeight === Math.round(cardWidth * 9 / 16)`
 *
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.6.
 */
export function computeCardSize(width: number): CardSize {
  const band = pickBand(width);
  const available = Math.max(0, width - PAGE_GUTTER_PX);
  const ideal = Math.floor(available / band.cardsPerView);
  const cardWidth = Math.max(band.cardMin, Math.min(band.cardMax, ideal));
  const cardHeight = Math.round((cardWidth * 9) / 16);
  return {
    cardWidth,
    cardHeight,
    heroMin: band.heroMin,
    heroMax: band.heroMax,
  };
}

/**
 * Subscribe to `window.innerWidth` and return the current card and hero
 * dimensions for the active responsive band.
 *
 * Implementation notes:
 *   - The initial value reads `window.innerWidth` synchronously, so the very
 *     first render already matches the active window size and there is no
 *     post-mount "snap" from a fallback to the real value.
 *   - Resize events are coalesced with a 250 ms trailing debounce
 *     (Requirement 12.5). The state update fires only once, after the user
 *     stops resizing for the debounce window.
 *   - The cleanup callback clears any pending debounce timer so a component
 *     unmounting mid-resize does not leak a `setState` on an unmounted hook.
 *
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6.
 */
export function useCardSize(): CardSize {
  const [width, setWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : FALLBACK_WIDTH_PX,
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleResize = (): void => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        timeoutId = null;
        setWidth(window.innerWidth);
      }, RESIZE_DEBOUNCE_MS);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return useMemo(() => computeCardSize(width), [width]);
}
