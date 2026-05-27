import React from 'react'
import { useViewStore } from '../stores/viewStore'
import { usePlayerStore } from '../stores/playerStore'

/**
 * MpvMountSurface
 *
 * A single fixed-position div whose rect tracks the active MPV slot. MPV draws
 * on top of the BrowserWindow at the BrowserWindow's native handle, so this
 * surface is purely a visual placeholder used to:
 *
 *   1. Mark which screen rect "owns" MPV's visible region at any given time.
 *   2. Animate the rect smoothly (150 ms) when transitioning between the
 *      mini-player corner and the full-player canvas.
 *   3. Hide (display: none) when the player is idle or in an error state, or
 *      when no slot has registered a rect yet.
 *
 * The surface contains no children and never intercepts pointer events.
 */
export const MpvMountSurface: React.FC = () => {
  const mpvRect = useViewStore((state) => state.mpvRect)
  const status = usePlayerStore((state) => state.status)

  const hidden = status === 'idle' || status === 'error' || mpvRect === null

  const style: React.CSSProperties = {
    position: 'fixed',
    pointerEvents: 'none',
    background: 'black',
    zIndex: 0,
    transition: 'top 150ms, left 150ms, width 150ms, height 150ms',
    display: hidden ? 'none' : 'block',
    top: mpvRect?.top,
    left: mpvRect?.left,
    width: mpvRect?.width,
    height: mpvRect?.height,
  }

  return <div data-testid="mpv-mount" style={style} />
}
