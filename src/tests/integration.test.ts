import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePlaylistStore } from '../renderer/stores/playlistStore'
import { usePlayerStore } from '../renderer/stores/playerStore'
import { useFavoritesStore } from '../renderer/stores/favoritesStore'
import { useSettingsStore } from '../renderer/stores/settingsStore'
import type { PersistedState, Channel } from '../shared/types'

// ============================================================
// In-memory store for persistence simulation
// ============================================================

function createInMemoryStore(): Record<string, unknown> & { _data: PersistedState } {
  return {
    _data: {
      playlists: [],
      favorites: [],
      volume: 50,
      muted: false,
      lastActivePlaylistId: null,
      mpvBinaryPath: null,
    },
  }
}

// ============================================================
// Sample M3U content for testing
// ============================================================

const SAMPLE_M3U = `#EXTM3U
#EXTINF:-1 tvg-id="cnn" tvg-name="CNN" group-title="News" tvg-logo="https://example.com/cnn.png",CNN International
http://stream.example.com/cnn
#EXTINF:-1 tvg-id="bbc" tvg-name="BBC" group-title="News" tvg-logo="https://example.com/bbc.png",BBC World
http://stream.example.com/bbc
#EXTINF:-1 tvg-id="espn" tvg-name="ESPN" group-title="Sports" tvg-logo="https://example.com/espn.png",ESPN HD
http://stream.example.com/espn
#EXTINF:-1 tvg-id="hbo" tvg-name="HBO" group-title="Movies" tvg-logo="https://example.com/hbo.png",HBO Cinema
http://stream.example.com/hbo
`

// ============================================================
// Integration Test: Playlist Add Flow
// ============================================================

describe('Integration: Playlist Add Flow (URL → fetch → parse → store → display)', () => {
  let memoryStore: ReturnType<typeof createInMemoryStore>
  let mockFetch: ReturnType<typeof vi.fn>
  let mockStoreSet: ReturnType<typeof vi.fn>
  let mockStoreGetAll: ReturnType<typeof vi.fn>
  let mockStoreGet: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    memoryStore = createInMemoryStore()

    mockFetch = vi.fn()
    mockStoreSet = vi.fn().mockImplementation((key: string, value: unknown) => {
      ;(memoryStore._data as any)[key] = value
      return Promise.resolve()
    })
    mockStoreGetAll = vi.fn().mockImplementation(() => {
      return Promise.resolve({ ...memoryStore._data })
    })
    mockStoreGet = vi.fn().mockImplementation((key: string) => {
      return Promise.resolve((memoryStore._data as any)[key])
    })

    vi.stubGlobal('window', {
      electronAPI: {
        player: {
          play: vi.fn().mockResolvedValue(undefined),
          stop: vi.fn().mockResolvedValue(undefined),
          pause: vi.fn().mockResolvedValue(undefined),
          resume: vi.fn().mockResolvedValue(undefined),
          setVolume: vi.fn().mockResolvedValue(undefined),
          setMute: vi.fn().mockResolvedValue(undefined),
          onStatus: vi.fn().mockReturnValue(() => {}),
          onError: vi.fn().mockReturnValue(() => {}),
        },
        playlist: {
          fetch: mockFetch,
        },
        store: {
          get: mockStoreGet,
          set: mockStoreSet,
          getAll: mockStoreGetAll,
        },
        settings: {
          validateMpvPath: vi.fn().mockResolvedValue(true),
        },
      },
    })

    // Reset store state
    usePlaylistStore.setState({
      playlists: [],
      activePlaylistId: null,
      channels: [],
      selectedCategory: 'All',
      categories: ['All'],
      searchTerm: '',
      isLoading: false,
    })
  })

  it('should fetch M3U content from the provided URL', async () => {
    mockFetch.mockResolvedValue(SAMPLE_M3U)

    await usePlaylistStore.getState().addPlaylist('http://example.com/playlist.m3u', 'My Playlist')

    expect(mockFetch).toHaveBeenCalledWith('http://example.com/playlist.m3u')
  })

  it('should parse channels from fetched M3U content', async () => {
    mockFetch.mockResolvedValue(SAMPLE_M3U)

    await usePlaylistStore.getState().addPlaylist('http://example.com/playlist.m3u', 'My Playlist')

    // Verify store.set was called with playlists containing parsed channels
    const setCall = mockStoreSet.mock.calls.find((call) => call[0] === 'playlists')
    expect(setCall).toBeDefined()

    const persistedPlaylists = setCall![1] as any[]
    expect(persistedPlaylists).toHaveLength(1)
    expect(persistedPlaylists[0].channels).toHaveLength(4)

    // Verify channel data was parsed correctly
    const channels = persistedPlaylists[0].channels
    expect(channels[0].name).toBe('CNN International')
    expect(channels[0].url).toBe('http://stream.example.com/cnn')
    expect(channels[0].group).toBe('News')
    expect(channels[1].name).toBe('BBC World')
    expect(channels[2].name).toBe('ESPN HD')
    expect(channels[2].group).toBe('Sports')
    expect(channels[3].name).toBe('HBO Cinema')
    expect(channels[3].group).toBe('Movies')
  })

  it('should persist playlist data via store.set', async () => {
    mockFetch.mockResolvedValue(SAMPLE_M3U)

    await usePlaylistStore.getState().addPlaylist('http://example.com/playlist.m3u', 'Test Playlist')

    expect(mockStoreSet).toHaveBeenCalledWith(
      'playlists',
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Test Playlist',
          url: 'http://example.com/playlist.m3u',
          channels: expect.any(Array),
        }),
      ])
    )
  })

  it('should update local state with the new playlist', async () => {
    mockFetch.mockResolvedValue(SAMPLE_M3U)

    await usePlaylistStore.getState().addPlaylist('http://example.com/playlist.m3u', 'My Playlist')

    const state = usePlaylistStore.getState()
    expect(state.playlists).toHaveLength(1)
    expect(state.playlists[0].name).toBe('My Playlist')
    expect(state.playlists[0].url).toBe('http://example.com/playlist.m3u')
    expect(state.playlists[0].channelCount).toBe(4)
    expect(state.isLoading).toBe(false)
  })

  it('should handle the full flow end-to-end: URL → fetch → parse → store → state', async () => {
    mockFetch.mockResolvedValue(SAMPLE_M3U)

    // Step 1: Add playlist
    await usePlaylistStore.getState().addPlaylist('http://example.com/playlist.m3u', 'Full Flow Test')

    // Step 2: Verify fetch was called
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Step 3: Verify persistence
    expect(mockStoreSet).toHaveBeenCalledWith('playlists', expect.any(Array))

    // Step 4: Verify local state updated
    const state = usePlaylistStore.getState()
    expect(state.playlists).toHaveLength(1)
    expect(state.playlists[0].channelCount).toBe(4)

    // Step 5: Simulate selecting the playlist (load channels for display)
    const playlistId = state.playlists[0].id
    // Update the in-memory store to reflect what was persisted
    const persistedPlaylists = mockStoreSet.mock.calls.find((c) => c[0] === 'playlists')![1]
    memoryStore._data.playlists = persistedPlaylists

    await usePlaylistStore.getState().selectPlaylist(playlistId)

    const updatedState = usePlaylistStore.getState()
    expect(updatedState.channels).toHaveLength(4)
    expect(updatedState.categories).toContain('All')
    expect(updatedState.categories).toContain('News')
    expect(updatedState.categories).toContain('Sports')
    expect(updatedState.categories).toContain('Movies')
  })
})

// ============================================================
// Integration Test: Player Lifecycle
// ============================================================

describe('Integration: Player Lifecycle (play → status events → stop → cleanup)', () => {
  let mockPlay: ReturnType<typeof vi.fn>
  let mockStop: ReturnType<typeof vi.fn>
  let mockPause: ReturnType<typeof vi.fn>
  let mockResume: ReturnType<typeof vi.fn>

  const testChannel: Channel = {
    id: 'channel-1',
    name: 'Test Channel',
    url: 'http://stream.example.com/test',
    group: 'News',
    playlistId: 'playlist-1',
    attributes: {},
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockPlay = vi.fn().mockResolvedValue(undefined)
    mockStop = vi.fn().mockResolvedValue(undefined)
    mockPause = vi.fn().mockResolvedValue(undefined)
    mockResume = vi.fn().mockResolvedValue(undefined)

    vi.stubGlobal('window', {
      electronAPI: {
        player: {
          play: mockPlay,
          stop: mockStop,
          pause: mockPause,
          resume: mockResume,
          setVolume: vi.fn().mockResolvedValue(undefined),
          setMute: vi.fn().mockResolvedValue(undefined),
          onStatus: vi.fn().mockReturnValue(() => {}),
          onError: vi.fn().mockReturnValue(() => {}),
        },
        playlist: {
          fetch: vi.fn().mockResolvedValue(''),
        },
        store: {
          get: vi.fn().mockResolvedValue(null),
          set: vi.fn().mockResolvedValue(undefined),
          getAll: vi.fn().mockResolvedValue({
            playlists: [],
            favorites: [],
            volume: 50,
            muted: false,
            lastActivePlaylistId: null,
            mpvBinaryPath: null,
          }),
        },
        settings: {
          validateMpvPath: vi.fn().mockResolvedValue(true),
        },
      },
    })

    // Reset player store
    usePlayerStore.setState({
      status: 'idle',
      currentChannel: null,
      volume: 50,
      muted: false,
      error: null,
    })
  })

  it('should set status to loading and call player.play when playing a channel', async () => {
    await usePlayerStore.getState().playChannel(testChannel)

    expect(mockPlay).toHaveBeenCalledWith('http://stream.example.com/test')

    const state = usePlayerStore.getState()
    // After playChannel, status is 'loading' (set before the await)
    // Since mockPlay resolves immediately, the status stays at 'loading' until syncFromMain
    expect(state.status).toBe('loading')
    expect(state.currentChannel).toEqual(testChannel)
  })

  it('should transition to playing when syncFromMain receives playing status', async () => {
    await usePlayerStore.getState().playChannel(testChannel)

    // Simulate main process sending status update
    usePlayerStore.getState().syncFromMain({ status: 'playing' })

    const state = usePlayerStore.getState()
    expect(state.status).toBe('playing')
    expect(state.currentChannel).toEqual(testChannel)
  })

  it('should transition to idle and call player.stop when stopping', async () => {
    // Set up playing state
    usePlayerStore.setState({
      status: 'playing',
      currentChannel: testChannel,
    })

    await usePlayerStore.getState().stop()

    expect(mockStop).toHaveBeenCalled()

    const state = usePlayerStore.getState()
    expect(state.status).toBe('idle')
    expect(state.currentChannel).toBeNull()
    expect(state.error).toBeNull()
  })

  it('should handle the full player lifecycle: play → playing → pause → resume → stop', async () => {
    // Step 1: Play channel
    await usePlayerStore.getState().playChannel(testChannel)
    expect(usePlayerStore.getState().status).toBe('loading')
    expect(mockPlay).toHaveBeenCalledWith(testChannel.url)

    // Step 2: Simulate status event from main process (stream started)
    usePlayerStore.getState().syncFromMain({ status: 'playing' })
    expect(usePlayerStore.getState().status).toBe('playing')

    // Step 3: Pause
    await usePlayerStore.getState().togglePause()
    expect(mockPause).toHaveBeenCalled()
    expect(usePlayerStore.getState().status).toBe('paused')

    // Step 4: Resume
    await usePlayerStore.getState().togglePause()
    expect(mockResume).toHaveBeenCalled()
    expect(usePlayerStore.getState().status).toBe('playing')

    // Step 5: Stop
    await usePlayerStore.getState().stop()
    expect(mockStop).toHaveBeenCalled()
    expect(usePlayerStore.getState().status).toBe('idle')
    expect(usePlayerStore.getState().currentChannel).toBeNull()
  })

  it('should handle error status from main process', async () => {
    await usePlayerStore.getState().playChannel(testChannel)

    // Simulate error event from main process
    usePlayerStore.getState().syncFromMain({
      status: 'error',
      error: 'Stream unavailable',
    })

    const state = usePlayerStore.getState()
    expect(state.status).toBe('error')
    expect(state.error).toBe('Stream unavailable')
  })
})

// ============================================================
// Integration Test: Persistence
// ============================================================

describe('Integration: Persistence (set state → re-read → verify restored)', () => {
  let memoryStore: PersistedState

  beforeEach(() => {
    vi.clearAllMocks()

    memoryStore = {
      playlists: [],
      favorites: [],
      volume: 50,
      muted: false,
      lastActivePlaylistId: null,
      mpvBinaryPath: null,
    }

    vi.stubGlobal('window', {
      electronAPI: {
        player: {
          play: vi.fn().mockResolvedValue(undefined),
          stop: vi.fn().mockResolvedValue(undefined),
          pause: vi.fn().mockResolvedValue(undefined),
          resume: vi.fn().mockResolvedValue(undefined),
          setVolume: vi.fn().mockResolvedValue(undefined),
          setMute: vi.fn().mockResolvedValue(undefined),
          onStatus: vi.fn().mockReturnValue(() => {}),
          onError: vi.fn().mockReturnValue(() => {}),
        },
        playlist: {
          fetch: vi.fn().mockResolvedValue(''),
        },
        store: {
          get: vi.fn().mockImplementation((key: string) => {
            return Promise.resolve((memoryStore as any)[key])
          }),
          set: vi.fn().mockImplementation((key: string, value: unknown) => {
            ;(memoryStore as any)[key] = value
            return Promise.resolve()
          }),
          getAll: vi.fn().mockImplementation(() => {
            return Promise.resolve({ ...memoryStore })
          }),
        },
        settings: {
          validateMpvPath: vi.fn().mockResolvedValue(true),
        },
      },
    })

    // Reset all stores
    usePlaylistStore.setState({
      playlists: [],
      activePlaylistId: null,
      channels: [],
      selectedCategory: 'All',
      categories: ['All'],
      searchTerm: '',
      isLoading: false,
    })
    useFavoritesStore.setState({
      favoriteIds: new Set<string>(),
    })
    useSettingsStore.setState({
      mpvBinaryPath: '',
      isValidating: false,
      validationError: null,
    })
  })

  it('should persist and restore favorites correctly', async () => {
    // Set favorites
    await useFavoritesStore.getState().toggleFavorite('channel-1')
    await useFavoritesStore.getState().toggleFavorite('channel-2')

    // Verify persisted
    expect(memoryStore.favorites).toEqual(
      expect.arrayContaining(['channel-1', 'channel-2'])
    )

    // Reset local state (simulating app restart)
    useFavoritesStore.setState({ favoriteIds: new Set<string>() })
    expect(useFavoritesStore.getState().favoriteIds.size).toBe(0)

    // Restore from persisted
    await useFavoritesStore.getState().loadFromPersisted()

    const state = useFavoritesStore.getState()
    expect(state.favoriteIds.has('channel-1')).toBe(true)
    expect(state.favoriteIds.has('channel-2')).toBe(true)
  })

  it('should persist and restore settings correctly', async () => {
    // Set MPV path
    memoryStore.mpvBinaryPath = '/usr/local/bin/mpv'

    // Reset local state
    useSettingsStore.setState({ mpvBinaryPath: '' })

    // Restore from persisted
    await useSettingsStore.getState().loadFromPersisted()

    expect(useSettingsStore.getState().mpvBinaryPath).toBe('/usr/local/bin/mpv')
  })

  it('should persist and restore playlists correctly', async () => {
    // Set up persisted state with playlists
    memoryStore.playlists = [
      {
        id: 'playlist-1',
        name: 'News Channels',
        url: 'http://example.com/news.m3u',
        channels: [
          {
            id: 'ch-1',
            name: 'CNN',
            url: 'http://stream.example.com/cnn',
            group: 'News',
            playlistId: 'playlist-1',
            attributes: {},
          },
          {
            id: 'ch-2',
            name: 'BBC',
            url: 'http://stream.example.com/bbc',
            group: 'News',
            playlistId: 'playlist-1',
            attributes: {},
          },
        ],
      },
    ]
    memoryStore.lastActivePlaylistId = 'playlist-1'

    // Reset local state
    usePlaylistStore.setState({
      playlists: [],
      activePlaylistId: null,
      channels: [],
      categories: ['All'],
    })

    // Restore from persisted
    await usePlaylistStore.getState().loadFromPersisted()

    const state = usePlaylistStore.getState()
    expect(state.playlists).toHaveLength(1)
    expect(state.playlists[0].name).toBe('News Channels')
    expect(state.playlists[0].channelCount).toBe(2)
    expect(state.activePlaylistId).toBe('playlist-1')
    expect(state.channels).toHaveLength(2)
    expect(state.categories).toContain('All')
    expect(state.categories).toContain('News')
  })

  it('should handle store.set and store.getAll round-trip correctly', async () => {
    // Set various values
    const storeSet = window.electronAPI.store.set
    const storeGetAll = window.electronAPI.store.getAll

    await storeSet('volume', 75)
    await storeSet('muted', true)
    await storeSet('favorites', ['ch-1', 'ch-2', 'ch-3'])

    // Read back all values
    const restored = await storeGetAll()

    expect(restored.volume).toBe(75)
    expect(restored.muted).toBe(true)
    expect(restored.favorites).toEqual(['ch-1', 'ch-2', 'ch-3'])
  })

  it('should persist playlist data and restore it with loadFromPersisted', async () => {
    // Simulate adding a playlist by directly setting persisted state
    const playlistData = {
      id: 'pl-abc',
      name: 'Sports',
      url: 'http://example.com/sports.m3u',
      channels: [
        {
          id: 'ch-espn',
          name: 'ESPN',
          url: 'http://stream.example.com/espn',
          group: 'Sports',
          playlistId: 'pl-abc',
          attributes: {},
        },
      ],
    }

    memoryStore.playlists = [playlistData]
    memoryStore.lastActivePlaylistId = 'pl-abc'
    memoryStore.favorites = ['ch-espn']

    // Load all stores from persisted state
    await usePlaylistStore.getState().loadFromPersisted()
    await useFavoritesStore.getState().loadFromPersisted()

    // Verify playlist store
    const playlistState = usePlaylistStore.getState()
    expect(playlistState.playlists[0].name).toBe('Sports')
    expect(playlistState.activePlaylistId).toBe('pl-abc')
    expect(playlistState.channels[0].name).toBe('ESPN')

    // Verify favorites store
    expect(useFavoritesStore.getState().isFavorite('ch-espn')).toBe(true)
  })
})
