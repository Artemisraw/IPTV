import { useLayoutEffect, useRef } from 'react';

import type { MpvRect } from '../../shared/types/index';
import { useViewStore } from '../stores/viewStore';

/**
 * Mount a `<div data-mpv-slot>` and report its viewport rect to `ViewStore`.
 *
 * The MPV process is bound to the BrowserWindow's X11 handle and renders to
 * whatever rect is exposed within that window. The renderer cooperates by
 * leaving the chosen rect free of opaque content and by reporting that rect
 * to `ViewStore.mpvRect` so `MpvMountSurface` can match it. Only one
 * `data-mpv-slot` is "active" at any time — the MiniPlayer and FullPlayerView
 * are mutually exclusive per `currentView`.
 *
 * Behavior:
 *   - On mount (when `active === true`), reads `getBoundingClientRect()` of
 *     the ref'd div and writes `{top, left, width, height}` to ViewStore.
 *   - Re-measures when the slot's size changes (`ResizeObserver`), when the
 *     window resizes (`window.resize`), or when any ancestor scrolls
 *     (`scroll` with `{ capture: true }` so nested scroll containers fire too).
 *   - All re-measure events are coalesced through a single
 *     `requestAnimationFrame` so a burst of events triggers exactly one rect
 *     write per frame.
 *   - When `active === false`, the slot is considered inactive: the rect is
 *     cleared to `null` and no listeners are registered.
 *   - On unmount or when `active` becomes false, all listeners are removed,
 *     the `ResizeObserver` is disconnected, any pending RAF is cancelled, and
 *     `mpvRect` is reset to `null`.
 *
 * The hook uses `useLayoutEffect` so the initial rect is measured after
 * layout but before paint, avoiding a one-frame mismatch between the slot
 * and the `MpvMountSurface` it drives.
 *
 * Validates: Requirements 7.1, 7.7, 8.2, 12.5.
 */
export function useMpvSlot(active: boolean): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const setMpvRect = useViewStore.getState().setMpvRect;

    if (!active) {
      setMpvRect(null);
      return undefined;
    }

    const node = ref.current;
    if (node === null) {
      setMpvRect(null);
      return undefined;
    }

    let rafId: number | null = null;

    const measure = (): void => {
      // The element may have been unmounted between scheduling and running
      // the RAF callback (e.g. fast view transition); guard accordingly.
      if (ref.current === null) {
        return;
      }
      const { top, left, width, height } = ref.current.getBoundingClientRect();
      const rect: MpvRect = { top, left, width, height };
      useViewStore.getState().setMpvRect(rect);
    };

    const scheduleMeasure = (): void => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        measure();
      });
    };

    // Initial synchronous measurement so the rect is available before paint;
    // listeners below handle subsequent layout changes.
    measure();

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(node);

    window.addEventListener('resize', scheduleMeasure);
    // `capture: true` so nested scroll containers (any ancestor) also trigger
    // a re-measure, not just the document scroller.
    window.addEventListener('scroll', scheduleMeasure, { capture: true });

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, { capture: true });
      useViewStore.getState().setMpvRect(null);
    };
  }, [active]);

  return ref;
}
