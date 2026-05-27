// ============================================================
// Data Models
// ============================================================

export interface Channel {
  id: string;
  name: string;
  url: string;
  group: string; // defaults to 'Uncategorized'
  logo?: string;
  tvgId?: string;
  tvgName?: string;
  userAgent?: string;
  playlistId: string; // links channel to its parent playlist
  attributes: Record<string, string>;
}

export interface Playlist {
  id: string;
  name: string; // 1-100 characters, trimmed
  url: string;
  channelCount: number;
  addedAt: number; // timestamp
}

// ============================================================
// Persisted State (on disk via electron-store)
// ============================================================

export interface PersistedPlaylist {
  id: string;
  name: string;
  url: string;
  channels: Channel[];
}

export type ViewName = 'home' | 'fullPlayer';

export interface MpvRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface PersistedState {
  playlists: PersistedPlaylist[];
  favorites: string[]; // channel IDs
  volume: number; // 0-100
  muted: boolean;
  lastActivePlaylistId: string | null;
  mpvBinaryPath: string | null;
  showUncategorized: boolean; // default false; toggle hides/shows the uncategorized bucket
  currentView: ViewName; // default 'home'; persisted across restarts
  recentlyPlayedChannelIds: string[]; // capacity 10, MRU first; used for hero selection
}

// ============================================================
// Player State (in-memory, synced via IPC events)
// ============================================================

export interface PlayerState {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  currentUrl: string | null;
  volume: number;
  muted: boolean;
  error: string | null;
}

// ============================================================
// IPC Channel Definitions
// ============================================================

// Commands (renderer → main, request-response via invoke/handle)
export type IPCCommands = {
  'player:play': (url: string) => void;
  'player:stop': () => void;
  'player:pause': () => void;
  'player:resume': () => void;
  'player:set-volume': (level: number) => void;
  'player:set-mute': (muted: boolean) => void;
  'playlist:fetch': (url: string) => string; // returns M3U content
  'store:get': (key: string) => unknown;
  'store:set': (key: string, value: unknown) => void;
  'store:get-all': () => PersistedState;
  'settings:validate-mpv-path': (path: string) => boolean;
  'log:write': (level: LogLevel, tag: string, message: string, data?: unknown) => void;
};

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Events (main → renderer, push via send/on)
export type IPCEvents = {
  'player:status': PlayerState;
  'player:error': { message: string; code: string };
};

// ============================================================
// Preload Bridge (ElectronAPI exposed to renderer)
// ============================================================

export interface ElectronAPI {
  player: {
    play: (url: string) => Promise<void>;
    stop: () => Promise<void>;
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    setVolume: (level: number) => Promise<void>;
    setMute: (muted: boolean) => Promise<void>;
    onStatus: (callback: (state: PlayerState) => void) => () => void;
    onError: (callback: (error: { message: string }) => void) => () => void;
  };
  playlist: {
    fetch: (url: string) => Promise<string>;
  };
  store: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    getAll: () => Promise<PersistedState>;
  };
  settings: {
    validateMpvPath: (path: string) => Promise<boolean>;
  };
  log: {
    write: (level: LogLevel, tag: string, message: string, data?: unknown) => void;
  };
}

// ============================================================
// Error Types
// ============================================================

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class HttpError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}
