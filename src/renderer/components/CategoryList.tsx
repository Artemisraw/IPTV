import React from 'react';
import { usePlaylistStore } from '../stores/playlistStore';
import { useFavoritesStore } from '../stores/favoritesStore';

export const CategoryList: React.FC = () => {
  const { categories, channels, selectedCategory, selectCategory } = usePlaylistStore();
  const { favoriteIds } = useFavoritesStore();

  const getChannelCount = (category: string): number => {
    if (category === 'All') {
      return channels.length;
    }
    if (category === 'Favorites') {
      return channels.filter((ch) => favoriteIds.has(ch.id)).length;
    }
    return channels.filter((ch) => (ch.group || 'Uncategorized') === category).length;
  };

  // Build the ordered list: "All" first, "Favorites" second, then the rest from categories
  // (categories already has "All" at index 0 from extractCategories, followed by sorted groups)
  const remainingCategories = categories.filter((c) => c !== 'All');
  const orderedCategories = ['All', 'Favorites', ...remainingCategories];

  return (
    <nav className="flex flex-col py-1">
      {orderedCategories.map((category) => {
        const isSelected = selectedCategory === category;
        const count = getChannelCount(category);

        return (
          <button
            key={category}
            onClick={() => selectCategory(category)}
            className={`flex items-center justify-between px-3 py-1.5 text-sm transition-colors cursor-pointer ${
              isSelected
                ? 'bg-zinc-700 text-white font-medium'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
            }`}
          >
            <span className="truncate">{category}</span>
            <span
              className={`ml-2 text-xs tabular-nums ${
                isSelected ? 'text-zinc-300' : 'text-zinc-600'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
