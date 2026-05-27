import { create } from 'zustand'

const MAX_PATH_LENGTH = 1024

export interface SettingsStore {
  // State
  mpvBinaryPath: string
  showUncategorized: boolean
  isValidating: boolean
  validationError: string | null

  // Actions
  setMpvPath: (path: string) => Promise<void>
  setShowUncategorized: (value: boolean) => Promise<void>
  loadFromPersisted: () => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  // Initial state
  mpvBinaryPath: '',
  showUncategorized: false,
  isValidating: false,
  validationError: null,

  // Actions
  setMpvPath: async (path: string) => {
    if (path.length > MAX_PATH_LENGTH) {
      set({ validationError: 'Path exceeds maximum length of 1024 characters', isValidating: false })
      return
    }

    set({ isValidating: true, validationError: null })

    try {
      const isValid = await window.electronAPI.settings.validateMpvPath(path)

      if (isValid) {
        await window.electronAPI.store.set('mpvBinaryPath', path)
        set({ mpvBinaryPath: path, isValidating: false, validationError: null })
      } else {
        set({ validationError: 'Path is not a valid executable', isValidating: false })
      }
    } catch {
      set({ validationError: 'Path is not a valid executable', isValidating: false })
    }
  },

  setShowUncategorized: async (value: boolean) => {
    const next = Boolean(value)
    await window.electronAPI.store.set('showUncategorized', next)
    set({ showUncategorized: next })
  },

  loadFromPersisted: async () => {
    const persistedPath = await window.electronAPI.store.get('mpvBinaryPath')
    if (typeof persistedPath === 'string' && persistedPath.length > 0) {
      set({ mpvBinaryPath: persistedPath })
    }

    const persistedShowUncategorized = await window.electronAPI.store.get('showUncategorized')
    if (typeof persistedShowUncategorized !== 'undefined' && persistedShowUncategorized !== null) {
      set({ showUncategorized: Boolean(persistedShowUncategorized) })
    }
  },
}))
