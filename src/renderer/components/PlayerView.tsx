import React, { useRef } from 'react';

/**
 * PlayerView - Container div for embedded MPV output area.
 * MPV renders into this div via the --wid flag using the native window handle.
 * The ref is exposed for the main process to target with the native handle.
 */
export const PlayerView: React.FC = () => {
  const playerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={playerRef}
      className="flex-1 w-full h-full bg-black"
      data-testid="player-view"
    />
  );
};
