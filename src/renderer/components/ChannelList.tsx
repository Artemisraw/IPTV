import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { FixedSizeList } from 'react-window';
import { Channel } from '@/shared/types';
import { Button } from '@/components/ui/button';
import { Play, Star } from 'lucide-react';
import { usePlaylistStore } from '@/renderer/stores/playlistStore';
import { useFavoritesStore } from '@/renderer/stores/favoritesStore';
import { usePlayerStore } from '@/renderer/stores/playerStore';
import { logger } from '@/renderer/utils/logger';

/**
 * useElementSize — measures the host element using ResizeObserver.
 * Replaces react-virtualized-auto-sizer which has been flaky inside
 * nested flex layouts.
 */
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize((prev) => {
        if (prev.width === rect.width && prev.height === rect.height) return prev;
        return { width: rect.width, height: rect.height };
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

export const ChannelList: React.FC = () => {
    const channels = usePlaylistStore((s) => s.channels);
    const selectedCategory = usePlaylistStore((s) => s.selectedCategory);
    const searchTerm = usePlaylistStore((s) => s.searchTerm);

    const favoriteIds = useFavoritesStore((s) => s.favoriteIds);
    const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
    const isFavorite = useFavoritesStore((s) => s.isFavorite);

    const playChannel = usePlayerStore((s) => s.playChannel);

    const { ref: containerRef, size } = useElementSize<HTMLDivElement>();

    const filteredChannels = useMemo(() => {
        let filtered = channels;

        if (selectedCategory === 'Favorites') {
            filtered = filtered.filter((ch) => favoriteIds.has(ch.id));
        } else if (selectedCategory !== 'All') {
            filtered = filtered.filter(
                (ch) => (ch.group || 'Uncategorized') === selectedCategory
            );
        }

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter((ch) =>
                ch.name.toLowerCase().includes(term)
            );
        }

        return filtered;
    }, [channels, selectedCategory, searchTerm, favoriteIds]);

    // Log state changes for debugging
    useEffect(() => {
        logger.info('ChannelList', 'state', {
            totalChannels: channels.length,
            filtered: filteredChannels.length,
            selectedCategory,
            searchTerm,
            containerSize: size,
        });
    }, [channels.length, filteredChannels.length, selectedCategory, searchTerm, size]);

    const handleStarClick = useCallback(
        (e: React.MouseEvent, channelId: string) => {
            e.stopPropagation();
            toggleFavorite(channelId);
        },
        [toggleFavorite]
    );

    const handleChannelClick = useCallback(
        (channel: Channel) => {
            logger.info('ChannelList', 'play channel', { id: channel.id, name: channel.name, url: channel.url });
            playChannel(channel);
        },
        [playChannel]
    );

    const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
        const channel = filteredChannels[index];
        const favorited = isFavorite(channel.id);

        return (
            <div
                style={style}
                className="flex items-center p-2 hover:bg-zinc-800/50 cursor-pointer border-b border-zinc-800/50 transition-colors"
                onClick={() => handleChannelClick(channel)}
            >
                <div className="w-10 h-10 mr-3 bg-zinc-800 flex items-center justify-center rounded overflow-hidden">
                    {channel.logo ? (
                        <img
                            src={channel.logo}
                            alt={channel.name}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    ) : (
                        <span className="text-xs text-zinc-500 font-bold">TV</span>
                    )}
                </div>
                <div className="flex-1 overflow-hidden">
                    <p className="truncate font-medium text-sm text-zinc-200">
                        {channel.name}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                        {channel.group || 'Uncategorized'}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={(e) => handleStarClick(e, channel.id)}
                    title={favorited ? 'Remove from favorites' : 'Add to favorites'}
                >
                    <Star
                        className={`h-4 w-4 ${
                            favorited
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'text-zinc-400 hover:text-yellow-400'
                        }`}
                    />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700 shrink-0"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleChannelClick(channel);
                    }}
                    title="Play channel"
                >
                    <Play className="h-4 w-4" />
                </Button>
            </div>
        );
    };

    return (
        <div ref={containerRef} className="flex-1 w-full min-h-0 relative bg-zinc-950/50">
            {filteredChannels.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
                    {channels.length === 0
                        ? 'Add a playlist to see channels.'
                        : selectedCategory === 'Favorites'
                        ? 'No favorite channels yet.'
                        : 'No channels found in this category.'}
                </div>
            ) : size.width === 0 || size.height === 0 ? (
                // Container hasn't been measured yet — render a fallback non-virtualized list
                // for the first ~50 items so users see something while the layout settles.
                <div className="absolute inset-0 overflow-y-auto">
                    {filteredChannels.slice(0, 50).map((_ch, i) => (
                        <Row key={i} index={i} style={{ height: 64 }} />
                    ))}
                </div>
            ) : (
                <div className="absolute inset-0">
                    <FixedSizeList
                        height={size.height}
                        itemCount={filteredChannels.length}
                        itemSize={64}
                        width={size.width}
                    >
                        {Row}
                    </FixedSizeList>
                </div>
            )}
        </div>
    );
};
