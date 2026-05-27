import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorViewProps {
  error: string;
  onRetry: () => void;
}

/**
 * ErrorView - Displays an error message with a retry button.
 * Shown when a stream fails to load or encounters an error.
 */
export const ErrorView: React.FC<ErrorViewProps> = ({ error, onRetry }) => {
  return (
    <div className="flex-1 w-full h-full flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 gap-4">
      <AlertCircle className="w-12 h-12 text-red-500" />
      <p className="text-sm text-zinc-300 text-center max-w-md">{error}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="mt-2"
      >
        Retry
      </Button>
    </div>
  );
};
