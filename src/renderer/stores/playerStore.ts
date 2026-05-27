import { create } from 'zustand'
import type { Channel, PersistedState, PlayerState } from '../../shared/types/index'
import { pushRecent } from '../utils/pushRecent'

export interface PlayerStore {
  // State
  status: PlayerState['status']
  currentChannel: Channel | null
  volume: number
  muted: boolean
  error: string | null
  /** Capacity-10 MRU ring buffer of recently played channel IDs (Requirement 2.4). */
  recentlyPlayedChannelIds: string[]

  // Actions
  playChannel: (channel: Channel) => Promise<void>
  stop: () => Promise<void>
  togglePause: () => Promise<void>
  setVolume: (level: number) => Promise<void>
  toggleMute: () => Promise<void>
  syncFromMain: (state: Partial<Pick<PlayerStore, 'status' | 'volume' | 'muted' | 'error'>>) => void
  /** Hydrate recentlyPlayedChannelIds, volume, and muted from persisted state. */
  loadFromPersisted: () => Promise<void>
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  // Initial state
  status: 'idle',
  currentChannel: null,
  volume: 50,
  muted: false,
  error: null,
  recentlyPlayedChannelIds: [],

  // Actions
  playChannel: async (channel: Channel) => {
    // Compute the new MRU ring buffer before anything else (pure, synchronous).
    const next = pushRecent(get().recentlyPlayedChannelIds, channel.id)

    // Update state immediately so the UI shows the loading transition without
    // waiting on persistence or the MPV IPC call.
    set({
      status: 'loading',
      currentChannel: channel,
      error: null,
      recentlyPlayedChannelIds: next,
    })

    try {
      // Persist the recents first, then issue the play IPC. Both are awaited
      // so any error short-circuits to the catch below.
      await window.electronAPI.store.set('recentlyPlayedChannelIds', next)
      await window.electronAPI.player.play(channel.url)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to play channel'
      set({ status: 'error', error: message })
    }
  },

  stop: async () => {
    await window.electronAPI.player.stop()
    set({ status: 'idle', currentChannel: null, error: null })
  },

  togglePause: async () => {
    const { status } = get()
    if (status === 'playing') {
      await window.electronAPI.player.pause()
      set({ status: 'paused' })
    } else if (status === 'paused') {
      await window.electronAPI.player.resume()
      set({ status: 'playing' })
    }
  },

  setVolume: async (level: number) => {
    await window.electronAPI.player.setVolume(level)
    set({ volume: level })
  },

  toggleMute: async () => {
    const { muted } = get()
    await window.electronAPI.player.setMute(!muted)
    set({ muted: !muted })
  },

  syncFromMain: (state) => {
    set(state)
  },

  loadFromPersisted: async () => {
    // Single IPC round-trip for all three fields.
    const persisted = (await window.electronAPI.store.getAll()) as Partial<PersistedState>

    const next: Partial<Pick<PlayerStore, 'volume' | 'muted' | 'recentlyPlayedChannelIds'>> = {}

    // volume: clamp to [0, 100], coerce to a finite number; otherwise leave default.
    const rawVolume = persisted?.volume
    if (typeof rawVolume === 'number' && Number.isFinite(rawVolume)) {
      next.volume = Math.max(0, Math.min(100, rawVolume))
    }

    // muted: coerce to boolean only when explicitly present.
    if (typeof persisted?.muted === 'boolean') {
      next.muted = persisted.muted
    }

    // recentlyPlayedChannelIds: defensive — drop non-string entries; the main
    // process StoreManager already truncates to capacity 10, but we re-apply
    // pushRecent's slice-on-write semantics on every playChannel call so any
    // legacy over-long array will self-heal.
    const rawRecents = persisted?.recentlyPlayedChannelIds
    if (Array.isArray(rawRecents)) {
      next.recentlyPlayedChannelIds = rawRecents.filter(
        (id): id is string => typeof id === 'string',
      )
    }

    if (Object.keys(next).length > 0) {
      set(next)
    }
  },
}))

/**
 * Subscribe to player status events from the main process.
 * Call this once during app initialization. Returns an unsubscribe function.
 */
export function subscribeToPlayerEvents(): () => void {
  const unsubStatus = window.electronAPI.player.onStatus((state: PlayerState) => {
    usePlayerStore.getState().syncFromMain({
      status: state.status,
      volume: state.volume,
      muted: state.muted,
      error: state.error,
    })
  })

  const unsubError = window.electronAPI.player.onError((error) => {
    usePlayerStore.getState().syncFromMain({
      status: 'error',
      error: error.message,
    })
  })

  return () => {
    unsubStatus()
    unsubError()
  }
}
