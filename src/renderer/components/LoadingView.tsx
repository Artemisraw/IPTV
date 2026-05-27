import React from 'react';

/**
 * LoadingView - Spinner displayed while a stream is connecting.
 * Shows an animated spinner and "Connecting..." text.
 */
export const LoadingView: React.FC = () => {
  return (
    <div className="flex-1 w-full h-full flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 gap-4">
      <div className="w-10 h-10 border-4 border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
      <p className="text-sm font-medium">Connecting...</p>
    </div>
  );
};
