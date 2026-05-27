import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as fs from 'node:fs'
import { PlayerManager } from './player'
import { StoreManager } from './store'
import { NetworkManager } from './network'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

const DEFAULT_MPV_PATH = '/usr/bin/mpv'

let win: BrowserWindow | null = null
let playerManager: PlayerManager | null = null
const storeManager = new StoreManager()
const networkManager = new NetworkManager()

/**
 * Validates that a file path exists and has execute permission.
 * Returns true if valid, false otherwise.
 */
async function validateMpvPath(mpvPath: string): Promise<boolean> {
  try {
    await fs.promises.access(mpvPath, fs.constants.F_OK | fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

/**
 * Initialize the PlayerManager with the native window handle and persisted MPV path.
 * If no MPV path is configured, uses /usr/bin/mpv as default.
 * If the path is invalid, skips player initialization (doesn't crash).
 */
async function initializePlayer(): Promise<void> {
  if (!win) return

  const persistedMpvPath = storeManager.get('mpvBinaryPath')
  const mpvPath = persistedMpvPath || DEFAULT_MPV_PATH

  // Validate MPV path before initializing
  const isValid = await validateMpvPath(mpvPath)
  if (!isValid) {
    console.warn(`[Main] MPV path "${mpvPath}" is not valid or not executable. Player will not be initialized.`)
    // Notify renderer that no valid MPV binary was found
    if (win && !win.isDestroyed()) {
      win.webContents.send('player:error', {
        message: 'No valid MPV binary found. Please configure the MPV path in settings.',
        code: 'MPV_NOT_FOUND',
      })
    }
    return
  }

  playerManager = new PlayerManager(win)

  try {
    const windowHandle = win.getNativeWindowHandle()
    await playerManager.initialize(windowHandle, mpvPath)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to initialize player'
    console.error('[Main] Player initialization failed:', message)
    // Don't crash — player just won't be available
    playerManager = null
  }
}

/**
 * Register all IPC handlers for the application.
 */
function registerIpcHandlers(): void {
  // Player commands
  ipcMain.handle('player:play', async (_event, url: string) => {
    if (!playerManager) {
      throw new Error('Player not initialized. Please configure a valid MPV path in settings.')
    }
    await playerManager.play(url)
  })

  ipcMain.handle('player:stop', async () => {
    if (playerManager) {
      await playerManager.stop()
    }
  })

  ipcMain.handle('player:pause', async () => {
    if (playerManager) {
      await playerManager.pause()
    }
  })

  ipcMain.handle('player:resume', async () => {
    if (playerManager) {
      await playerManager.resume()
    }
  })

  ipcMain.handle('player:set-volume', async (_event, level: number) => {
    if (playerManager) {
      await playerManager.setVolume(level)
    }
  })

  ipcMain.handle('player:set-mute', async (_event, muted: boolean) => {
    if (playerManager) {
      await playerManager.setMute(muted)
    }
  })

  // Playlist commands
  ipcMain.handle('playlist:fetch', async (_event, url: string) => {
    return await networkManager.fetchPlaylist(url)
  })

  // Store commands
  ipcMain.handle('store:get', async (_event, key: string) => {
    return storeManager.get(key as keyof import('../src/shared/types/index').PersistedState)
  })

  ipcMain.handle('store:set', async (_event, key: string, value: unknown) => {
    storeManager.set(
      key as keyof import('../src/shared/types/index').PersistedState,
      value as any
    )
  })

  ipcMain.handle('store:get-all', async () => {
    return storeManager.getAll()
  })

  // Settings commands
  ipcMain.handle('settings:validate-mpv-path', async (_event, mpvPath: string) => {
    return await validateMpvPath(mpvPath)
  })

  // Renderer logging - prints renderer logs to the main process terminal
  ipcMain.on('log:write', (_event, level: string, tag: string, message: string, data?: unknown) => {
    const prefix = `[Renderer:${tag}]`
    const args: unknown[] = [prefix, message]
    if (data !== undefined) args.push(data)
    switch (level) {
      case 'error':
        console.error(...args)
        break
      case 'warn':
        console.warn(...args)
        break
      case 'info':
        console.info(...args)
        break
      default:
        console.log(...args)
    }
  })
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(async () => {
  createWindow()
  registerIpcHandlers()
  await initializePlayer()
})

app.on('will-quit', async () => {
  if (playerManager) {
    await playerManager.destroy()
    playerManager = null
  }
})
