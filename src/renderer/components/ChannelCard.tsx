import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import type { Channel } from '@/shared/types';

/**
 * Props for {@link ChannelCard}.
 *
 * `width` / `height` come from {@link useCardSize}; they are passed in (rather
 * than resolved internally) so virtualized rows can size every card to the
 * same band without each card observing the window.
 */
export interface ChannelCardProps {
  channel: Channel;
  width: number;
  height: number;
  isFavorite: boolean;
  onPlay: (channel: Channel) => void;
  onToggleFavorite: (channelId: string) => void;
}

/**
 * Time before we give up waiting for `<img>` to fire `load` or `error` and
 * fall back to the initial-letter treatment.
 *
 * Requirement 4.4: the card SHALL fall back if the logo fails to load within
 * 5 seconds.
 */
const LOGO_LOAD_TIMEOUT_MS = 5000;

/**
 * 16:9 channel card with a contained logo region and a single-line name. The
 * card is the primary play action: clicking it or activating it via keyboard
 * (Enter / Space) calls `onPlay(channel)`. A nested favorite-toggle button is
 * mounted in the corner; its events are scoped so toggling favorite never
 * doubles as a play action.
 *
 * Logo handling covers three failure modes:
 *
 *  1. `channel.logo` is missing or empty — render the fallback immediately.
 *  2. `<img>` fires `error` — switch to fallback synchronously and remember
 *     the URL so subsequent prop updates with the same URL skip the network.
 *  3. Neither `load` nor `error` fires within 5 s — same as case 2.
 *
 * Per-instance failed URLs live in a {@link useRef} so they survive prop
 * changes (e.g. when a virtualized row recycles this card for a different
 * channel that later swaps back) without leaking across components.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 10.2, 10.3,
 * 10.7, 11.5, 2.6
 */
const ChannelCardImpl: React.FC<ChannelCardProps> = ({
  channel,
  width,
  height,
  isFavorite,
  onPlay,
  onToggleFavorite,
}) => {
  const logo = channel.logo;
  const [loadFailed, setLoadFailed] = useState(false);

  /**
   * URLs that have failed to load on this card instance. Populated on
   * `<img onError>` and on the 5 s watchdog. Read at render time so a recycled
   * card whose `channel.logo` swaps back to a failed URL renders the fallback
   * without ever setting `<img src>`.
   */
  const failedUrlsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Render-time decision. The ref read is intentional: the set is only mutated
  // synchronously alongside a state change, so the next render observes both.
  const cachedFailed = logo ? failedUrlsRef.current.has(logo) : false;
  const useFallback = !logo || loadFailed || cachedFailed;

  /**
   * Reset failure state and (re-)arm the 5 s watchdog whenever the logo URL
   * changes. If the URL is already in the failed set, short-circuit straight
   * to the fallback without mounting an `<img>` (Requirement 11.5).
   */
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setLoadFailed(false);

    if (!logo) return;

    if (failedUrlsRef.current.has(logo)) {
      setLoadFailed(true);
      return;
    }

    timerRef.current = setTimeout(() => {
      failedUrlsRef.current.add(logo);
      setLoadFailed(true);
      timerRef.current = null;
    }, LOGO_LOAD_TIMEOUT_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [logo]);

  const handleImgError = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (logo) failedUrlsRef.current.add(logo);
    setLoadFailed(true);
  }, [logo]);

  const handleImgLoad = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    onPlay(channel);
  }, [onPlay, channel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        // preventDefault on both keys so Enter does not fire a synthetic
        // `click` (which would double-invoke onPlay) and Space does not scroll
        // the page (Requirement 10.3).
        e.preventDefault();
        onPlay(channel);
      }
    },
    [onPlay, channel],
  );

  const handleFavoriteClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      // Requirement 4.8: toggling favorite must not start playback.
      e.stopPropagation();
      onToggleFavorite(channel.id);
    },
    [onToggleFavorite, channel.id],
  );

  const handleFavoriteKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      // Let the inner button's native activation handle Enter/Space; just
      // prevent the keydown from bubbling to the outer ChannelCard handler so
      // we do not also play the channel.
      if (e.key === 'Enter' || e.key === ' ') {
        e.stopPropagation();
      }
    },
    [],
  );

  const initial = (channel.name.trim().charAt(0) || '?').toUpperCase();

  return (
    <button
      type="button"
      tabIndex={0}
      aria-label={channel.name}
      title={channel.name}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{ width, height }}
      data-testid="channel-card"
      className="group relative flex shrink-0 flex-col overflow-hidden rounded-lg bg-zinc-900 text-left text-zinc-200 ring-1 ring-zinc-800 transition-transform duration-150 ease-out hover:scale-[1.06] hover:ring-zinc-600 hover:shadow-lg hover:shadow-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      {/* Logo region — ~70% of the card height, contained logo or initial fallback. */}
      <div className="flex h-[70%] w-full shrink-0 items-center justify-center bg-zinc-950">
        {useFallback ? (
          <span
            aria-hidden="true"
            className="select-none text-3xl font-semibold text-zinc-400"
            data-testid="channel-card-fallback"
          >
            {initial}
          </span>
        ) : (
          <img
            src={logo}
            alt=""
            onError={handleImgError}
            onLoad={handleImgLoad}
            className="h-full w-full object-contain"
            draggable={false}
            data-testid="channel-card-logo"
          />
        )}
      </div>

      {/* Name region — single line, ellipsis, full name in title. */}
      <div className="flex w-full flex-1 items-center px-2">
        <span
          className="block w-full truncate text-sm font-medium text-zinc-200"
          title={channel.name}
        >
          {channel.name}
        </span>
      </div>

      {/* Favorite toggle — corner-anchored, scoped event handling. */}
      <button
        type="button"
        aria-pressed={isFavorite}
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        onClick={handleFavoriteClick}
        onKeyDown={handleFavoriteKeyDown}
        data-testid="channel-card-favorite"
        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-zinc-200 transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <Star
          className={`h-4 w-4 ${
            isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-300'
          }`}
          aria-hidden="true"
        />
      </button>
    </button>
  );
};

/**
 * Memoized export. All non-function props are primitives or stable refs
 * (`channel` is a stable object owned by the playlist store), so a default
 * shallow compare via `React.memo` is sufficient to skip re-renders when a
 * sibling card updates within the same row.
 */
export const ChannelCard = React.memo(ChannelCardImpl);

export default ChannelCard;
