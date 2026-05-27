import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, PlayerState } from '../src/shared/types/index'

const api: ElectronAPI = {
  player: {
    play: (url: string) => ipcRenderer.invoke('player:play', url),
    stop: () => ipcRenderer.invoke('player:stop'),
    pause: () => ipcRenderer.invoke('player:pause'),
    resume: () => ipcRenderer.invoke('player:resume'),
    setVolume: (level: number) => ipcRenderer.invoke('player:set-volume', level),
    setMute: (muted: boolean) => ipcRenderer.invoke('player:set-mute', muted),
    onStatus: (callback: (state: PlayerState) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: PlayerState) => callback(state)
      ipcRenderer.on('player:status', listener)
      return () => {
        ipcRenderer.removeListener('player:status', listener)
      }
    },
    onError: (callback: (error: { message: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, error: { message: string }) => callback(error)
      ipcRenderer.on('player:error', listener)
      return () => {
        ipcRenderer.removeListener('player:error', listener)
      }
    },
  },
  playlist: {
    fetch: (url: string) => ipcRenderer.invoke('playlist:fetch', url),
  },
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    getAll: () => ipcRenderer.invoke('store:get-all'),
  },
  settings: {
    validateMpvPath: (path: string) => ipcRenderer.invoke('settings:validate-mpv-path', path),
  },
  log: {
    write: (level, tag, message, data) => {
      // Fire-and-forget; never await to keep UI responsive
      ipcRenderer.send('log:write', level, tag, message, data)
    },
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
