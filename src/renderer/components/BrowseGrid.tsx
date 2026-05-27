import React, { useCallback, useEffect, useRef } from 'react';
import { VariableSizeList } from 'react-window';
import { BrowseEmptyState } from './BrowseEmptyState';
import { HeroBanner } from './HeroBanner';
import { ChannelRow } from './ChannelRow';
import { useCardSize } from '../hooks/useCardSize';
import { useViewStore } from '../stores/viewStore';
import { usePlayerStore } from '../stores/playerStore';
import type { Channel } from '@/shared/types';
import AutoSizer from 'react-virtualized-auto-sizer';

export interface CategoryData {
  category: string;
  channels: Channel[];
}

export interface BrowseGridProps {
  categories: CategoryData[];
  featuredChannel: Channel | null;
  featuredTags?: string[];
}

const HEADER_HEIGHT = 44; // h2 approx height including margin
const HERO_MARGIN = 32;

export const BrowseGrid: React.FC<BrowseGridProps> = ({
  categories,
  featuredChannel,
  featuredTags = [],
}) => {
  const { width: cardWidth, height: cardHeight, heroMax } = useCardSize();
  const listRef = useRef<VariableSizeList>(null);
  const playChannel = usePlayerStore((state) => state.playChannel);

  const setHomeScrollY = useViewStore((state) => state.setHomeScrollY);
  const initialScrollY = useViewStore.getState().homeScrollY;

  // Restore scroll position on mount
  useEffect(() => {
    if (initialScrollY > 0 && listRef.current) {
      listRef.current.scrollTo(initialScrollY);
    }
  }, [initialScrollY]);

  const hasHero = featuredChannel !== null;
  const itemCount = categories.length + (hasHero ? 1 : 0);

  const getItemSize = (index: number) => {
    if (hasHero && index === 0) {
      return heroMax + HERO_MARGIN;
    }
    // For rows: header height + card height
    return HEADER_HEIGHT + cardHeight + 32; // +32 for bottom margin
  };

  const handleVerticalNav = useCallback(
    (e: Event) => {
      const customEvent = e as CustomEvent<{ direction: number; focusedX: number }>;
      const { direction, focusedX } = customEvent.detail;
      const activeElement = document.activeElement as HTMLElement;

      const currentRow = activeElement?.closest('[data-row-index]');
      if (!currentRow) return;

      const currentRowIndex = Number(currentRow.getAttribute('data-row-index'));
      const targetRowIndex = currentRowIndex + direction;

      // Clamp target row index to valid categories range
      const minRowIndex = hasHero ? 1 : 0;
      if (targetRowIndex < minRowIndex || targetRowIndex >= itemCount) {
        return; // At top or bottom
      }

      if (listRef.current) {
        listRef.current.scrollToItem(targetRowIndex, 'smart');
        // Wait for render
        requestAnimationFrame(() => {
          // Find the target row container
          const rows = document.querySelectorAll(`[data-row-index="${targetRowIndex}"]`);
          if (!rows.length) return;
          const targetRow = rows[0];

          // Try to find the exact column, or nearest
          const cards = Array.from(targetRow.querySelectorAll('[data-testid="channel-card"]'));
          if (!cards.length) return;

          let targetCard = cards.find((c) => Number(c.parentElement?.getAttribute('data-index')) === focusedX);
          if (!targetCard) {
            targetCard = cards[cards.length - 1]; // Fallback to last card in row
          }
          (targetCard as HTMLElement).focus();
        });
      }
    },
    [hasHero, itemCount]
  );

  useEffect(() => {
    const container = document.getElementById('browse-grid-container');
    if (container) {
      container.addEventListener('channel-row-vertical-nav', handleVerticalNav);
      return () => container.removeEventListener('channel-row-vertical-nav', handleVerticalNav);
    }
  }, [handleVerticalNav]);

  if (categories.length === 0 && !featuredChannel) {
    return <BrowseEmptyState />;
  }

  const handleScroll = ({ scrollOffset }: { scrollOffset: number }) => {
    setHomeScrollY(scrollOffset);
  };

  return (
    <div id="browse-grid-container" className="h-full w-full flex-1">
      <AutoSizer>
        {({ width, height }) => (
          <VariableSizeList
            ref={listRef}
            width={width}
            height={height}
            itemCount={itemCount}
            itemSize={getItemSize}
            onScroll={handleScroll}
            overscanCount={2}
          >
            {({ index, style }) => {
              if (hasHero && index === 0) {
                return (
                  <div style={style} className="px-8 pb-8">
                    <HeroBanner
                      channel={featuredChannel}
                      categoryTags={featuredTags}
                      onPlay={() => playChannel(featuredChannel!)}
                    />
                  </div>
                );
              }

              const categoryIndex = hasHero ? index - 1 : index;
              const { category, channels } = categories[categoryIndex];

              return (
                <div style={style} data-row-index={index}>
                  <ChannelRow
                    category={category}
                    channels={channels}
                    cardWidth={cardWidth}
                    cardHeight={cardHeight}
                  />
                </div>
              );
            }}
          </VariableSizeList>
        )}
      </AutoSizer>
    </div>
  );
};

export default BrowseGrid;
