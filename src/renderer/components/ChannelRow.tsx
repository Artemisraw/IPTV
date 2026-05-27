import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FixedSizeList } from 'react-window';
import { ChannelCard } from './ChannelCard';
import { RowScrollControls } from './RowScrollControls';
import { usePlayerStore } from '../stores/playerStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import type { Channel } from '@/shared/types';

export interface ChannelRowProps {
  category: string;
  channels: Channel[];
  cardWidth: number;
  cardHeight: number;
}

const GUTTER = 16;
const OVERSCAN_COUNT = 2;
const VIRTUALIZATION_THRESHOLD = 20;

export const ChannelRow: React.FC<ChannelRowProps> = ({
  category,
  channels,
  cardWidth,
  cardHeight,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<FixedSizeList>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null); // For non-virtualized scrolling
  const [containerWidth, setContainerWidth] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);

  const playChannel = usePlayerStore((state) => state.playChannel);
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);
  const isFavorite = useFavoritesStore((state) => state.isFavorite);

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setContainerWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleScrollLeft = useCallback(() => {
    if (channels.length > VIRTUALIZATION_THRESHOLD && listRef.current) {
      listRef.current.scrollTo(Math.max(0, scrollOffset - containerWidth));
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -containerWidth, behavior: 'smooth' });
    }
  }, [channels.length, containerWidth, scrollOffset]);

  const handleScrollRight = useCallback(() => {
    const maxScroll = channels.length * (cardWidth + GUTTER) - containerWidth;
    if (channels.length > VIRTUALIZATION_THRESHOLD && listRef.current) {
      listRef.current.scrollTo(Math.min(maxScroll, scrollOffset + containerWidth));
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: containerWidth, behavior: 'smooth' });
    }
  }, [channels.length, cardWidth, containerWidth, scrollOffset]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const activeElement = document.activeElement as HTMLElement;
      if (!activeElement || activeElement.getAttribute('data-testid') !== 'channel-card') {
        return;
      }

      const currentIndex = Number(activeElement.getAttribute('data-index'));
      if (isNaN(currentIndex)) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const nextIndex = Math.max(0, currentIndex - 1);
        focusCard(nextIndex);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextIndex = Math.min(channels.length - 1, currentIndex + 1);
        focusCard(nextIndex);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const event = new CustomEvent('channel-row-vertical-nav', {
          bubbles: true,
          detail: {
            direction: e.key === 'ArrowUp' ? -1 : 1,
            focusedX: currentIndex,
          },
        });
        containerRef.current?.dispatchEvent(event);
      }
    },
    [channels.length]
  );

  const focusCard = useCallback(
    (index: number) => {
      // For virtualized
      if (channels.length > VIRTUALIZATION_THRESHOLD && listRef.current) {
        listRef.current.scrollToItem(index, 'auto');
        // Need to wait for render if item was out of bounds
        requestAnimationFrame(() => {
          const cards = containerRef.current?.querySelectorAll('[data-testid="channel-card"]');
          cards?.forEach((card: any) => {
            if (Number(card.getAttribute('data-index')) === index) {
              card.focus();
            }
          });
        });
      } else {
        // Non-virtualized
        const card = containerRef.current?.querySelector(
          `[data-testid="channel-card"][data-index="${index}"]`
        ) as HTMLElement;
        if (card) {
          card.focus();
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
      }
    },
    [channels.length]
  );

  const renderVirtualItem = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const channel = channels[index];
    return (
      <div style={{ ...style, width: cardWidth, paddingRight: GUTTER }}>
        <div data-index={index} style={{ display: 'contents' }}>
          <ChannelCard
            channel={channel}
            width={cardWidth}
            height={cardHeight}
            isFavorite={isFavorite(channel.id)}
            onPlay={playChannel}
            onToggleFavorite={toggleFavorite}
          />
        </div>
      </div>
    );
  };

  const isControlsVisible = isHovered || hasFocus;
  const isVirtualized = channels.length > VIRTUALIZATION_THRESHOLD;

  // Enhance ChannelCard wrapper to intercept focus and add data-index
  const renderCardWrapper = (channel: Channel, index: number) => (
    <div
      key={channel.id}
      style={{ marginRight: GUTTER, width: cardWidth, flexShrink: 0 }}
      data-index={index}
      onFocus={() => {
        // We ensure data-index is also on the card element itself by injecting it via ref or bubbling
        // Since we can't easily inject props into ChannelCard's root, we rely on the container querying
        // the wrapper or we can add data-index directly to the button if ChannelCard forwarded it.
        // Wait, ChannelCard does not accept data-index prop.
        // We'll use a wrapper that captures focus, but the card itself gets focus.
        // Let's just wrap the card in a div that passes down the index as a data attribute,
        // but `document.activeElement` will be the `<button>` inside ChannelCard.
        // We can find the closest `[data-index]` from the active element.
      }}
    >
      <ChannelCard
        channel={channel}
        width={cardWidth}
        height={cardHeight}
        isFavorite={isFavorite(channel.id)}
        onPlay={playChannel}
        onToggleFavorite={toggleFavorite}
      />
    </div>
  );

  // Adjust keydown handler to find the closest wrapper with data-index
  const handleKeyDownAdjusted = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const activeElement = document.activeElement as HTMLElement;
      if (!activeElement || activeElement.getAttribute('data-testid') !== 'channel-card') {
        return;
      }

      const wrapper = activeElement.closest('[data-index]');
      if (!wrapper) return;

      const currentIndex = Number(wrapper.getAttribute('data-index'));
      if (isNaN(currentIndex)) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const nextIndex = Math.max(0, currentIndex - 1);
        focusCard(nextIndex);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextIndex = Math.min(channels.length - 1, currentIndex + 1);
        focusCard(nextIndex);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const event = new CustomEvent('channel-row-vertical-nav', {
          bubbles: true,
          detail: {
            direction: e.key === 'ArrowUp' ? -1 : 1,
            focusedX: currentIndex,
          },
        });
        containerRef.current?.dispatchEvent(event);
      }
    },
    [channels.length, focusCard]
  );

  return (
    <div
      className="mb-8 flex flex-col"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setHasFocus(true)}
      onBlurCapture={() => setHasFocus(false)}
      onKeyDown={handleKeyDownAdjusted}
    >
      <h2 className="mb-4 px-8 text-xl font-semibold text-white">
        {category} <span className="ml-2 text-sm text-zinc-400">({channels.length})</span>
      </h2>

      <div className="relative w-full px-8" ref={containerRef}>
        <RowScrollControls
          visible={isControlsVisible}
          onScrollLeft={handleScrollLeft}
          onScrollRight={handleScrollRight}
        />

        {isVirtualized ? (
          containerWidth > 0 ? (
            <FixedSizeList
              ref={listRef}
              layout="horizontal"
              width={containerWidth}
              height={cardHeight + GUTTER} // Add some padding for shadow
              itemCount={channels.length}
              itemSize={cardWidth + GUTTER}
              overscanCount={OVERSCAN_COUNT}
              onScroll={({ scrollOffset }) => setScrollOffset(scrollOffset)}
              style={{ overflow: 'hidden' }}
            >
              {({ index, style }) => (
                <div style={style} data-index={index}>
                  <ChannelCard
                    channel={channels[index]}
                    width={cardWidth}
                    height={cardHeight}
                    isFavorite={isFavorite(channels[index].id)}
                    onPlay={playChannel}
                    onToggleFavorite={toggleFavorite}
                  />
                </div>
              )}
            </FixedSizeList>
          ) : (
            <div style={{ height: cardHeight + GUTTER }} /> // Placeholder while measuring
          )
        ) : (
          <div
            ref={scrollContainerRef}
            className="flex flex-row overflow-x-hidden scroll-smooth py-2"
            onScroll={(e) => setScrollOffset(e.currentTarget.scrollLeft)}
          >
            {channels.map((channel, index) => renderCardWrapper(channel, index))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChannelRow;
