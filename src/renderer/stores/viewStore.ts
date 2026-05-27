import { create } from 'zustand'
import type { MpvRect, ViewName } from '../../shared/types/index'

const VALID_VIEWS: readonly ViewName[] = ['home', 'fullPlayer']

function clampView(value: unknown): ViewName {
  return typeof value === 'string' && (VALID_VIEWS as readonly string[]).includes(value)
    ? (value as ViewName)
    : 'home'
}

export interface ViewStore {
  // State
  currentView: ViewName
  homeScrollY: number
  mpvRect: MpvRect | null

  // Actions
  setView: (view: ViewName) => Promise<void>
  setHomeScrollY: (y: number) => void
  setMpvRect: (rect: MpvRect | null) => void
  loadFromPersisted: () => Promise<void>
}

export const useViewStore = create<ViewStore>((set) => ({
  // Initial state
  currentView: 'home',
  homeScrollY: 0,
  mpvRect: null,

  // Actions
  setView: async (view: ViewName) => {
    await window.electronAPI.store.set('currentView', view)
    set({ currentView: view })
  },

  setHomeScrollY: (y: number) => {
    set({ homeScrollY: y })
  },

  setMpvRect: (rect: MpvRect | null) => {
    set({ mpvRect: rect })
  },

  loadFromPersisted: async () => {
    const persisted = await window.electronAPI.store.get('currentView')
    set({ currentView: clampView(persisted) })
  },
}))
