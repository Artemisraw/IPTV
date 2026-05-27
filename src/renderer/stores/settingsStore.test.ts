import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSettingsStore } from './settingsStore'

// Mock window.electronAPI
const mockValidateMpvPath = vi.fn()
const mockStoreGet = vi.fn()
const mockStoreSet = vi.fn()

vi.stubGlobal('window', {
  electronAPI: {
    settings: {
      validateMpvPath: mockValidateMpvPath,
    },
    store: {
      get: mockStoreGet,
      set: mockStoreSet,
    },
  },
})

describe('SettingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({
      mpvBinaryPath: '',
      isValidating: false,
      validationError: null,
    })
  })

  describe('initial state', () => {
    it('should have correct default values', () => {
      const state = useSettingsStore.getState()
      expect(state.mpvBinaryPath).toBe('')
      expect(state.isValidating).toBe(false)
      expect(state.validationError).toBeNull()
    })
  })

  describe('setMpvPath', () => {
    it('should persist and update state when path is valid', async () => {
      mockValidateMpvPath.mockResolvedValue(true)

      await useSettingsStore.getState().setMpvPath('/usr/bin/mpv')

      expect(mockValidateMpvPath).toHaveBeenCalledWith('/usr/bin/mpv')
      expect(mockStoreSet).toHaveBeenCalledWith('mpvBinaryPath', '/usr/bin/mpv')

      const state = useSettingsStore.getState()
      expect(state.mpvBinaryPath).toBe('/usr/bin/mpv')
      expect(state.isValidating).toBe(false)
      expect(state.validationError).toBeNull()
    })

    it('should set validation error when path is invalid', async () => {
      mockValidateMpvPath.mockResolvedValue(false)

      await useSettingsStore.getState().setMpvPath('/invalid/path')

      expect(mockValidateMpvPath).toHaveBeenCalledWith('/invalid/path')
      expect(mockStoreSet).not.toHaveBeenCalled()

      const state = useSettingsStore.getState()
      expect(state.mpvBinaryPath).toBe('')
      expect(state.isValidating).toBe(false)
      expect(state.validationError).toBe('Path is not a valid executable')
    })

    it('should reject paths exceeding 1024 characters', async () => {
      const longPath = '/usr/bin/' + 'a'.repeat(1020)

      await useSettingsStore.getState().setMpvPath(longPath)

      expect(mockValidateMpvPath).not.toHaveBeenCalled()
      expect(mockStoreSet).not.toHaveBeenCalled()

      const state = useSettingsStore.getState()
      expect(state.validationError).toBe('Path exceeds maximum length of 1024 characters')
      expect(state.isValidating).toBe(false)
    })

    it('should handle validation API errors gracefully', async () => {
      mockValidateMpvPath.mockRejectedValue(new Error('IPC error'))

      await useSettingsStore.getState().setMpvPath('/usr/bin/mpv')

      const state = useSettingsStore.getState()
      expect(state.validationError).toBe('Path is not a valid executable')
      expect(state.isValidating).toBe(false)
    })
  })

  describe('loadFromPersisted', () => {
    it('should load persisted mpvBinaryPath', async () => {
      mockStoreGet.mockResolvedValue('/usr/local/bin/mpv')

      await useSettingsStore.getState().loadFromPersisted()

      expect(mockStoreGet).toHaveBeenCalledWith('mpvBinaryPath')
      expect(useSettingsStore.getState().mpvBinaryPath).toBe('/usr/local/bin/mpv')
    })

    it('should not update state if persisted value is null', async () => {
      mockStoreGet.mockResolvedValue(null)

      await useSettingsStore.getState().loadFromPersisted()

      expect(useSettingsStore.getState().mpvBinaryPath).toBe('')
    })

    it('should not update state if persisted value is empty string', async () => {
      mockStoreGet.mockResolvedValue('')

      await useSettingsStore.getState().loadFromPersisted()

      expect(useSettingsStore.getState().mpvBinaryPath).toBe('')
    })
  })
})
