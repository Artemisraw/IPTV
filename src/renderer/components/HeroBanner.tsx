import React, { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import type { Channel } from '@/shared/types';
import { Button } from '@/components/ui/button';
import { useCardSize } from '@/renderer/hooks/useCardSize';
import { cn } from '@/lib/utils';

/**
 * Props for the HeroBanner component.
 *
 * - `channel` is the featured channel selected by `selectFeaturedChannel`. When
 *   `null`, the banner renders nothing — the empty playlist case is handled by
 *   `BrowseEmptyState` higher up the tree.
 * - `categoryTags` is the already-split list of category tags (e.g., produced
 *   by `extractCategoriesV2`) to render as small badges under the name.
 * - `onPlay` is invoked when the user activates the primary "Play" CTA. The
 *   parent (HomeView) is responsible for calling `playChannel(channel)` on
 *   the PlayerStore inside this callback (Requirement 2.3).
 */
export interface HeroBannerProps {
  channel: Channel | null;
  categoryTags: string[];
  onPlay: () => void;
}

/** Logo state machine per Requirements 2.5–2.6. */
type LogoState = 'pending' | 'loaded' | 'failed';

/**
 * Minimum projected logo height (in px) after `object-fit: contain` projection
 * for the logo to be considered usable. Below this threshold the banner falls
 * back to text-only (Requirement 2.6).
 */
const MIN_LOGO_PROJECTED_PX = 20;
/** Inclusive lower bound of the rendered logo height (px) when displayed. */
const MIN_LOGO_RENDER_PX = 20;
/** Inclusive upper bound of the rendered logo height (px) when displayed. */
const MAX_LOGO_RENDER_PX = 160;

/**
 * Virtual measurement box used to project the logo via `object-fit: contain`.
 * Width-to-height = 2:1 keeps wide network logos within the band while
 * still rejecting square logos that would render < 20 px tall.
 */
const MEASURE_BOX_W = 320;
const MEASURE_BOX_H = MAX_LOGO_RENDER_PX;

/**
 * HeroBanner — the cinematic hero element rendered at the top of HomeView.
 *
 * Behavior summary (mapped to acceptance criteria):
 * - Height: `[heroMin, heroMax]` from `useCardSize` — the hook returns
 *   `[280, 420]` at default and `[200, 280]` when `window.innerWidth < 1024`
 *   (Requirements 2.1, 12.4).
 * - Renders the channel's name, the category tags as badges, and a primary
 *   "Play" button that invokes `onPlay()` (Requirements 2.2, 2.3).
 * - Logo policy (Requirements 2.5, 2.6):
 *     - On `<img onLoad>` measure the natural dimensions and project them
 *       through a fixed `object-fit: contain` measurement box. If projected
 *       height >= 20 px, render the logo at a height clamped to `[20, 160]` px
 *       and **do not** render the name as a substitute treatment alongside
 *       the logo (the regular heading still appears, but is sized as a
 *       supporting subtitle, not as the substitute headline).
 *     - On `<img onError>` or projected height < 20 px, switch to a text-only
 *       treatment using `channel.name` and add the URL to a per-instance
 *       `retriedUrls: Set<string>` so it is not refetched during the session.
 * - When `channel` is `null`, returns `null` so the parent can render an
 *   empty-state placeholder instead.
 */
export const HeroBanner: React.FC<HeroBannerProps> = ({ channel, categoryTags, onPlay }) => {
  const { heroMin, heroMax } = useCardSize();

  // Per-instance set of URLs we have already failed on. Persists across the
  // life of this component (one "view session" in the spec terminology), so a
  // logo URL that fails once is never retried while this HeroBanner is mounted.
  const retriedUrlsRef = useRef<Set<string>>(new Set());

  const channelId = channel?.id ?? null;
  const logoUrl = channel?.logo ?? '';

  // Initialise logoState eagerly — if there is no logo URL, or if the URL is
  // already in the retried set, jump straight to 'failed' so we don't even
  // mount an <img> for it.
  const [logoState, setLogoState] = useState<LogoState>(() => {
    if (!logoUrl || retriedUrlsRef.current.has(logoUrl)) return 'failed';
    return 'pending';
  });
  const [logoHeight, setLogoHeight] = useState<number>(MAX_LOGO_RENDER_PX);

  // Reset the logo state machine whenever the featured channel or its logo
  // URL changes. The retriedUrls set is intentionally NOT cleared — it is the
  // session-level memory of URLs to skip.
  useEffect(() => {
    if (!logoUrl || retriedUrlsRef.current.has(logoUrl)) {
      setLogoState('failed');
      return;
    }
    setLogoState('pending');
    setLogoHeight(MAX_LOGO_RENDER_PX);
  }, [channelId, logoUrl]);

  if (!channel) {
    return null;
  }

  const markFailed = (): void => {
    if (logoUrl) {
      retriedUrlsRef.current.add(logoUrl);
    }
    setLogoState('failed');
  };

  const handleLogoLoad = (event: React.SyntheticEvent<HTMLImageElement>): void => {
    const img = event.currentTarget;
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    if (!naturalW || !naturalH) {
      markFailed();
      return;
    }
    const aspect = naturalH / naturalW;
    // object-fit: contain inside MEASURE_BOX_W x MEASURE_BOX_H — the contained
    // height is min(boxHeight, boxWidth * aspect).
    const projectedHeight = Math.min(MEASURE_BOX_H, MEASURE_BOX_W * aspect);
    if (projectedHeight < MIN_LOGO_PROJECTED_PX) {
      markFailed();
      return;
    }
    const clamped = Math.min(
      MAX_LOGO_RENDER_PX,
      Math.max(MIN_LOGO_RENDER_PX, projectedHeight),
    );
    setLogoHeight(clamped);
    setLogoState('loaded');
  };

  const handleLogoError = (): void => {
    markFailed();
  };

  // We still render the <img> while in the 'pending' state so the browser
  // actually performs the load and triggers our onLoad/onError handlers; we
  // just hide it visually until we know the projected height is >= 20 px.
  const showLogoImg = logoState !== 'failed' && !!logoUrl;
  // When the logo is unavailable, the channel name takes over the hero with a
  // larger "substitute treatment". When the logo is showing, the heading is
  // present but rendered smaller so it does not act as a substitute alongside
  // the logo (Requirement 2.5).
  const useTextSubstitute = logoState === 'failed';

  return (
    <section
      role="region"
      aria-label="Featured channel"
      data-testid="hero-banner"
      className="relative w-full overflow-hidden rounded-lg bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 text-white"
      style={{ height: heroMax, minHeight: heroMin }}
    >
      {/* Subtle bottom-up vignette so the foreground text stays legible
          regardless of any future background artwork. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
      />

      <div className="relative z-10 flex h-full max-w-3xl flex-col justify-end gap-3 p-6 md:p-10">
        {showLogoImg && (
          <img
            key={logoUrl}
            src={logoUrl}
            alt=""
            aria-hidden="true"
            className={cn(
              'object-contain self-start',
              logoState !== 'loaded' && 'pointer-events-none absolute left-0 top-0 opacity-0',
            )}
            style={
              logoState === 'loaded'
                ? {
                    height: logoHeight,
                    width: 'auto',
                    maxHeight: MAX_LOGO_RENDER_PX,
                    minHeight: MIN_LOGO_RENDER_PX,
                  }
                : { height: MEASURE_BOX_H, width: MEASURE_BOX_W }
            }
            onLoad={handleLogoLoad}
            onError={handleLogoError}
          />
        )}

        <h1
          data-testid="hero-banner-name"
          className={cn(
            'truncate font-bold tracking-tight text-white',
            useTextSubstitute ? 'text-4xl md:text-5xl' : 'text-2xl md:text-3xl',
          )}
        >
          {channel.name}
        </h1>

        {categoryTags.length > 0 && (
          <div className="flex flex-wrap gap-2" data-testid="hero-banner-tags">
            {categoryTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90 backdrop-blur"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <Button
          size="lg"
          onClick={onPlay}
          aria-label={`Play ${channel.name}`}
          className="mt-2 self-start gap-2 bg-white text-black hover:bg-white/90"
        >
          <Play className="h-5 w-5 fill-current" />
          Play
        </Button>
      </div>
    </section>
  );
};

export default HeroBanner;
