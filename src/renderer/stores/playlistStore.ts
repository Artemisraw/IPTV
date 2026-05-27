import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Channel, Playlist, PersistedPlaylist } from '../../shared/types';
import { parseM3U } from '../../shared/utils/m3u-parser';
import { logger } from '../utils/logger';

export interface PlaylistStore {
  playlists: Playlist[];
  activePlaylistId: string | null;
  channels: Channel[];
  selectedCategory: string;
  categories: string[];
  searchTerm: string;
  isLoading: boolean;

  addPlaylist: (url: string, name: string) => Promise<void>;
  removePlaylist: (id: string) => Promise<void>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  selectPlaylist: (id: string) => Promise<void>;
  selectCategory: (category: string) => void;
  setSearchTerm: (term: string) => void;
  loadFromPersisted: () => Promise<void>;
}

/**
 * Validates a playlist name: must be 1-100 characters and not whitespace-only.
 */
export function validatePlaylistName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 100;
}

/**
 * Extracts unique categories from channels, sorts alphabetically, and prepends "All".
 */
export function extractCategories(channels: Channel[]): string[] {
  const groups = new Set<string>();
  for (const channel of channels) {
    groups.add(channel.group || 'Uncategorized');
  }
  const sorted = Array.from(groups).sort((a, b) => a.localeCompare(b));
  return ['All', ...sorted];
}

export const usePlaylistStore = create<PlaylistStore>((set, get) => ({
  playlists: [],
  activePlaylistId: null,
  channels: [],
  selectedCategory: 'All',
  categories: ['All'],
  searchTerm: '',
  isLoading: false,

  addPlaylist: async (url: string, name: string) => {
    if (!validatePlaylistName(name)) {
      throw new Error('Playlist name must be 1-100 non-whitespace characters');
    }

    const trimmedName = name.trim();
    logger.info('PlaylistStore', 'addPlaylist start', { name: trimmedName, url });

    set({ isLoading: true });
    try {
      const m3uContent = await window.electronAPI.playlist.fetch(url);
      logger.info('PlaylistStore', 'fetched M3U', { name: trimmedName, bytes: m3uContent.length });

      const playlistId = uuidv4();
      const channels = parseM3U(m3uContent, playlistId);
      logger.info('PlaylistStore', 'parsed channels', { name: trimmedName, count: channels.length });

      const newPlaylist: Playlist = {
        id: playlistId,
        name: trimmedName,
        url,
        channelCount: channels.length,
        addedAt: Date.now(),
      };

      const state = get();
      const updatedPlaylists = [...state.playlists, newPlaylist];

      // Persist to store
      const persistedState = await window.electronAPI.store.getAll();
      const persistedPlaylists: PersistedPlaylist[] = [
        ...persistedState.playlists,
        { id: playlistId, name: trimmedName, url, channels },
      ];
      await window.electronAPI.store.set('playlists', persistedPlaylists);

      // Auto-select the newly added playlist so channels appear immediately
      const categories = extractCategories(channels);
      await window.electronAPI.store.set('lastActivePlaylistId', playlistId);

      set({
        playlists: updatedPlaylists,
        isLoading: false,
        activePlaylistId: playlistId,
        channels,
        categories,
        selectedCategory: 'All',
        searchTerm: '',
      });
      logger.info('PlaylistStore', 'addPlaylist complete', {
        name: trimmedName,
        channelCount: channels.length,
        categoryCount: categories.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('PlaylistStore', 'addPlaylist failed', { name: trimmedName, url, error: message });
      set({ isLoading: false });
      throw error;
    }
  },

  removePlaylist: async (id: string) => {
    const state = get();
    const updatedPlaylists = state.playlists.filter((p) => p.id !== id);

    // Get persisted state to find channels of the removed playlist
    const persistedState = await window.electronAPI.store.getAll();
    const removedPersistedPlaylist = persistedState.playlists.find((p) => p.id === id);
    const updatedPersistedPlaylists = persistedState.playlists.filter((p) => p.id !== id);

    // Clean up orphaned favorites
    let updatedFavorites = [...persistedState.favorites];
    if (removedPersistedPlaylist) {
      const removedChannelIds = new Set(removedPersistedPlaylist.channels.map((c) => c.id));
      // Channel IDs that exist in other playlists
      const remainingChannelIds = new Set(
        updatedPersistedPlaylists.flatMap((p) => p.channels.map((c) => c.id))
      );
      // Remove favorites that only existed in the removed playlist
      updatedFavorites = updatedFavorites.filter(
        (favId) => !removedChannelIds.has(favId) || remainingChannelIds.has(favId)
      );
    }

    // Persist changes
    await window.electronAPI.store.set('playlists', updatedPersistedPlaylists);
    await window.electronAPI.store.set('favorites', updatedFavorites);

    // Update local state
    const newState: Partial<PlaylistStore> = { playlists: updatedPlaylists };

    if (state.activePlaylistId === id) {
      newState.activePlaylistId = null;
      newState.channels = [];
      newState.categories = ['All'];
      newState.selectedCategory = 'All';
    }

    set(newState as PlaylistStore);
  },

  renamePlaylist: async (id: string, name: string) => {
    if (!validatePlaylistName(name)) {
      throw new Error('Playlist name must be 1-100 non-whitespace characters');
    }

    const trimmedName = name.trim();
    const state = get();
    const updatedPlaylists = state.playlists.map((p) =>
      p.id === id ? { ...p, name: trimmedName } : p
    );

    // Persist
    const persistedState = await window.electronAPI.store.getAll();
    const updatedPersistedPlaylists = persistedState.playlists.map((p) =>
      p.id === id ? { ...p, name: trimmedName } : p
    );
    await window.electronAPI.store.set('playlists', updatedPersistedPlaylists);

    set({ playlists: updatedPlaylists });
  },

  selectPlaylist: async (id: string) => {
    logger.info('PlaylistStore', 'selectPlaylist', { id });
    const persistedState = await window.electronAPI.store.getAll();
    const persistedPlaylist = persistedState.playlists.find((p) => p.id === id);

    if (!persistedPlaylist) {
      logger.warn('PlaylistStore', 'selectPlaylist: playlist not found', { id });
      return;
    }

    const channels = persistedPlaylist.channels;
    const categories = extractCategories(channels);

    await window.electronAPI.store.set('lastActivePlaylistId', id);

    set({
      activePlaylistId: id,
      channels,
      categories,
      selectedCategory: 'All',
      searchTerm: '',
    });
    logger.info('PlaylistStore', 'selectPlaylist complete', {
      id,
      name: persistedPlaylist.name,
      channelCount: channels.length,
      categoryCount: categories.length,
    });
  },

  selectCategory: (category: string) => {
    logger.info('PlaylistStore', 'selectCategory', { category });
    set({ selectedCategory: category });
  },

  setSearchTerm: (term: string) => {
    set({ searchTerm: term });
  },

  loadFromPersisted: async () => {
    logger.info('PlaylistStore', 'loadFromPersisted start');
    const persistedState = await window.electronAPI.store.getAll();

    const playlists: Playlist[] = persistedState.playlists.map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      channelCount: p.channels.length,
      addedAt: 0, // Not persisted separately, use 0 as default
    }));

    let channels: Channel[] = [];
    let categories: string[] = ['All'];
    let activePlaylistId = persistedState.lastActivePlaylistId;

    // If there's a last active playlist, load its channels
    if (activePlaylistId) {
      const activePersistedPlaylist = persistedState.playlists.find(
        (p) => p.id === activePlaylistId
      );
      if (activePersistedPlaylist) {
        channels = activePersistedPlaylist.channels;
        categories = extractCategories(channels);
      } else {
        // Last active playlist no longer exists
        activePlaylistId = null;
      }
    }

    set({
      playlists,
      activePlaylistId,
      channels,
      categories,
      selectedCategory: 'All',
      searchTerm: '',
    });
    logger.info('PlaylistStore', 'loadFromPersisted complete', {
      playlistCount: playlists.length,
      activePlaylistId,
      channelCount: channels.length,
      categoryCount: categories.length,
    });
  },
}));
