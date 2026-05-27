import React from 'react';
import { Inbox } from 'lucide-react';

export interface BrowseEmptyStateProps {
  reason: 'no-playlist' | 'all-uncategorized-hidden';
}

const MESSAGES: Record<BrowseEmptyStateProps['reason'], string> = {
  'no-playlist': 'Add a playlist to start browsing.',
  'all-uncategorized-hidden':
    "All channels in this playlist are uncategorized. Enable 'Show uncategorized channels' in Settings to see them.",
};

/**
 * BrowseEmptyState - Displayed inside HomeView when the browse grid has nothing
 * to show, either because no playlist is loaded or because every channel in the
 * active playlist is uncategorized and the user has hidden uncategorized channels.
 *
 * Validates: Requirement 1.4
 */
export const BrowseEmptyState: React.FC<BrowseEmptyStateProps> = ({ reason }) => {
  return (
    <div
      role="status"
      className="flex-1 w-full h-full flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 gap-4 px-6 text-center"
    >
      <Inbox className="w-16 h-16 text-zinc-600" aria-hidden="true" />
      <p className="text-base font-medium text-zinc-300 max-w-md">{MESSAGES[reason]}</p>
    </div>
  );
};
