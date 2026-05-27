import { create } from 'zustand'

export interface FavoritesStore {
  // State
  favoriteIds: Set<string>

  // Actions
  toggleFavorite: (channelId: string) => Promise<void>
  isFavorite: (channelId: string) => boolean
  loadFromPersisted: () => Promise<void>
}

export const useFavoritesStore = create<FavoritesStore>((set, get) => ({
  // Initial state
  favoriteIds: new Set<string>(),

  // Actions
  toggleFavorite: async (channelId: string) => {
    const { favoriteIds } = get()
    const next = new Set(favoriteIds)

    if (next.has(channelId)) {
      next.delete(channelId)
    } else {
      next.add(channelId)
    }

    set({ favoriteIds: next })
    await window.electronAPI.store.set('favorites', [...next])
  },

  isFavorite: (channelId: string) => {
    return get().favoriteIds.has(channelId)
  },

  loadFromPersisted: async () => {
    const favorites = (await window.electronAPI.store.get('favorites')) as string[] | undefined
    set({ favoriteIds: new Set(favorites ?? []) })
  },
}))
