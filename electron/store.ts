import Store from 'electron-store';
import { PersistedState, PersistedPlaylist, ViewName } from '../src/shared/types/index.js';

export const defaults: PersistedState = {
  playlists: [],
  favorites: [],
  volume: 50,
  muted: false,
  lastActivePlaylistId: null,
  mpvBinaryPath: null,
  showUncategorized: false,
  currentView: 'home',
  recentlyPlayedChannelIds: [],
};

const VALID_VIEWS: readonly ViewName[] = ['home', 'fullPlayer'];
const RECENTLY_PLAYED_CAPACITY = 10;

/**
 * Clamps a number to the range [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Validates that a playlist name is between 1 and 100 characters after trimming.
 * Returns the trimmed name if valid, or null if invalid.
 */
export function validatePlaylistName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 100) {
    return null;
  }
  return trimmed;
}

/**
 * Coerces an unknown value to a ViewName, falling back to 'home' for any
 * value outside the allowed set.
 */
export function normalizeCurrentView(value: unknown): ViewName {
  if (typeof value === 'string' && (VALID_VIEWS as readonly string[]).includes(value)) {
    return value as ViewName;
  }
  return 'home';
}

/**
 * Drops non-string entries and truncates the list to capacity 10.
 */
export function normalizeRecentlyPlayedChannelIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const onlyStrings = value.filter((entry): entry is string => typeof entry === 'string');
  if (onlyStrings.length > RECENTLY_PLAYED_CAPACITY) {
    return onlyStrings.slice(0, RECENTLY_PLAYED_CAPACITY);
  }
  return onlyStrings;
}

/**
 * StoreManager wraps electron-store with typed schema and validation.
 * Handles corrupted/missing state files gracefully by resetting to defaults.
 */
export class StoreManager {
  private store: Store<PersistedState>;

  constructor() {
    try {
      this.store = new Store<PersistedState>({
        name: 'iptv-state',
        defaults,
      });

      // Validate the loaded state on construction
      this.validateAndRepair();
    } catch {
      // If the store file is corrupted or unreadable, create a fresh store
      // by clearing and resetting
      this.store = new Store<PersistedState>({
        name: 'iptv-state',
        defaults,
      });
      this.store.clear();
    }
  }

  /**
   * Validates the current state and repairs any invalid values.
   */
  private validateAndRepair(): void {
    try {
      const volume = this.store.get('volume');
      if (typeof volume !== 'number' || isNaN(volume)) {
        this.store.set('volume', defaults.volume);
      } else {
        this.store.set('volume', clamp(volume, 0, 100));
      }

      const playlists = this.store.get('playlists');
      if (!Array.isArray(playlists)) {
        this.store.set('playlists', defaults.playlists);
      } else if (playlists.length > 50) {
        this.store.set('playlists', playlists.slice(0, 50));
      }

      const showUncategorized = this.store.get('showUncategorized');
      this.store.set('showUncategorized', Boolean(showUncategorized));

      const currentView = this.store.get('currentView');
      this.store.set('currentView', normalizeCurrentView(currentView));

      const recentlyPlayedChannelIds = this.store.get('recentlyPlayedChannelIds');
      this.store.set(
        'recentlyPlayedChannelIds',
        normalizeRecentlyPlayedChannelIds(recentlyPlayedChannelIds),
      );
    } catch {
      // If validation itself fails, reset everything
      this.store.clear();
    }
  }

  /**
   * Get a single value from the store by key.
   */
  get<K extends keyof PersistedState>(key: K): PersistedState[K] {
    try {
      return this.store.get(key);
    } catch {
      return defaults[key];
    }
  }

  /**
   * Set a single value in the store by key, with validation.
   */
  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void {
    try {
      if (key === 'volume') {
        const numValue = value as number;
        this.store.set(key, clamp(numValue, 0, 100));
        return;
      }

      if (key === 'playlists') {
        let playlists = value as PersistedPlaylist[];

        // Enforce max 50 playlists
        if (playlists.length > 50) {
          playlists = playlists.slice(0, 50);
        }

        // Validate playlist names
        playlists = playlists.map((playlist) => {
          const validName = validatePlaylistName(playlist.name);
          if (validName === null) {
            // If name is invalid, truncate or use a fallback
            const fallbackName = playlist.name.trim().slice(0, 100) || 'Unnamed';
            return { ...playlist, name: fallbackName };
          }
          return { ...playlist, name: validName };
        });

        this.store.set(key, playlists as PersistedState[K]);
        return;
      }

      if (key === 'showUncategorized') {
        this.store.set(key, Boolean(value) as PersistedState[K]);
        return;
      }

      if (key === 'currentView') {
        this.store.set(key, normalizeCurrentView(value) as PersistedState[K]);
        return;
      }

      if (key === 'recentlyPlayedChannelIds') {
        this.store.set(
          key,
          normalizeRecentlyPlayedChannelIds(value) as PersistedState[K],
        );
        return;
      }

      this.store.set(key, value);
    } catch {
      // If write fails, retain in-memory state — the next write will retry
      console.error(`StoreManager: Failed to set key "${String(key)}"`);
    }
  }

  /**
   * Get the entire persisted state.
   */
  getAll(): PersistedState {
    try {
      return this.store.store;
    } catch {
      return { ...defaults };
    }
  }

  /**
   * Reset the store to default values.
   */
  reset(): void {
    try {
      this.store.clear();
    } catch {
      // If clear fails, attempt to set defaults individually
      try {
        for (const [key, value] of Object.entries(defaults)) {
          this.store.set(key as keyof PersistedState, value as PersistedState[keyof PersistedState]);
        }
      } catch {
        console.error('StoreManager: Failed to reset store');
      }
    }
  }
}
