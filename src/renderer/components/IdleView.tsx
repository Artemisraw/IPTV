import React from 'react';
import { Tv } from 'lucide-react';

/**
 * IdleView - Placeholder displayed when no channel is selected.
 * Shows a TV icon and a message prompting the user to select a channel.
 */
export const IdleView: React.FC = () => {
  return (
    <div className="flex-1 w-full h-full flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 gap-4">
      <Tv className="w-16 h-16 text-zinc-600" />
      <p className="text-lg font-medium">Select a channel to start watching</p>
    </div>
  );
};
