import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface RowScrollControlsProps {
  onScrollLeft: () => void;
  onScrollRight: () => void;
  visible: boolean;
}

/**
 * Left/right scroll-affordance buttons for a ChannelRow.
 *
 * The buttons are absolutely positioned at the row's left/right edges; the
 * parent ChannelRow container is expected to be `position: relative`. Opacity
 * is driven by the `visible` flag (truthy on hover or keyboard focus), with a
 * 150 ms transition. When hidden, `pointer-events: none` is applied so the
 * invisible buttons don't intercept clicks against underlying cards.
 *
 * Validates: Requirement 3.7
 */
export const RowScrollControls: React.FC<RowScrollControlsProps> = ({
  onScrollLeft,
  onScrollRight,
  visible,
}) => {
  const visibilityClasses = visible
    ? 'opacity-100 pointer-events-auto'
    : 'opacity-0 pointer-events-none';

  const baseButtonClasses =
    'absolute top-1/2 -translate-y-1/2 z-10 flex items-center justify-center ' +
    'w-9 h-9 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-100 ' +
    'shadow-md border border-zinc-700 ' +
    'transition-opacity duration-150 ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300';

  return (
    <>
      <button
        type="button"
        aria-label="Scroll left"
        onClick={onScrollLeft}
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
        className={`${baseButtonClasses} left-1 ${visibilityClasses}`}
      >
        <ChevronLeft className="w-5 h-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={onScrollRight}
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
        className={`${baseButtonClasses} right-1 ${visibilityClasses}`}
      >
        <ChevronRight className="w-5 h-5" aria-hidden="true" />
      </button>
    </>
  );
};
