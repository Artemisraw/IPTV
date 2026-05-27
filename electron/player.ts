import { ChildProcess, spawn } from 'child_process';
import { BrowserWindow } from 'electron';
import * as net from 'net';
import * as fs from 'fs';
import { PlayerState } from '../src/shared/types/index';

const IPC_SOCKET_PATH = '/tmp/mpv-iptv-socket';
const DEFAULT_MPV_PATH = '/usr/bin/mpv';
const RESTART_DELAY_MS = 1000;
const SOCKET_CONNECT_RETRY_MS = 200;
const SOCKET_CONNECT_MAX_RETRIES = 15;

export class PlayerManager {
  private mpvProcess: ChildProcess | null = null;
  private socket: net.Socket | null = null;
  private mainWindow: BrowserWindow;
  private windowHandle: Buffer | null = null;
  private mpvPath: string = DEFAULT_MPV_PATH;
  private requestId: number = 0;
  private pendingRequests: Map<number, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }> = new Map();
  private socketBuffer: string = '';
  private initialized: boolean = false;
  private destroying: boolean = false;
  private lastUrl: string | null = null;

  private state: PlayerState = {
    status: 'idle',
    currentUrl: null,
    volume: 50,
    muted: false,
    error: null,
  };

  constructor(window: BrowserWindow) {
    this.mainWindow = window;
  }

  /**
   * Initialize the PlayerManager with the native window handle and MPV binary path.
   * Spawns the MPV process and connects to its IPC socket.
   */
  public async initialize(windowHandle: Buffer, mpvPath?: string): Promise<void> {
    this.windowHandle = windowHandle;
    this.mpvPath = mpvPath || DEFAULT_MPV_PATH;

    await this.spawnMpv();
    this.initialized = true;
  }

  /**
   * Play a stream URL. Sends a loadfile command to MPV via IPC.
   */
  public async play(url: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('PlayerManager not initialized');
    }

    this.lastUrl = url;
    this.updateState({ status: 'loading', currentUrl: url, error: null });

    try {
      await this.sendCommand(['loadfile', url, 'replace']);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to play stream';
      this.updateState({ status: 'error', error: message });
      throw error;
    }
  }

  /**
   * Stop playback. Sends a stop command to MPV.
   */
  public async stop(): Promise<void> {
    if (!this.initialized) return;

    try {
      await this.sendCommand(['stop']);
      this.lastUrl = null;
      this.updateState({ status: 'idle', currentUrl: null, error: null });
    } catch (error) {
      // If MPV is not running, just reset state
      this.lastUrl = null;
      this.updateState({ status: 'idle', currentUrl: null, error: null });
    }
  }

  /**
   * Pause playback.
   */
  public async pause(): Promise<void> {
    if (!this.initialized) return;

    try {
      await this.setProperty('pause', true);
      this.updateState({ status: 'paused' });
    } catch (error) {
      // Ignore if MPV is not in a state to pause
    }
  }

  /**
   * Resume playback from paused state.
   */
  public async resume(): Promise<void> {
    if (!this.initialized) return;

    try {
      await this.setProperty('pause', false);
      this.updateState({ status: 'playing' });
    } catch (error) {
      // Ignore if MPV is not in a state to resume
    }
  }

  /**
   * Set volume level, clamped to 0-100.
   */
  public async setVolume(level: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(level)));
    this.updateState({ volume: clamped });

    if (!this.initialized) return;

    try {
      await this.setProperty('volume', clamped);
    } catch (error) {
      // Volume will be applied when MPV reconnects
    }
  }

  /**
   * Set mute state.
   */
  public async setMute(muted: boolean): Promise<void> {
    this.updateState({ muted });

    if (!this.initialized) return;

    try {
      await this.setProperty('mute', muted ? 'yes' : 'no');
    } catch (error) {
      // Mute state will be applied when MPV reconnects
    }
  }

  /**
   * Get the current player state.
   */
  public getState(): PlayerState {
    return { ...this.state };
  }

  /**
   * Destroy the PlayerManager, killing the MPV process and cleaning up.
   */
  public async destroy(): Promise<void> {
    this.destroying = true;
    this.initialized = false;

    await this.disconnectSocket();
    await this.killMpvProcess();
    this.cleanupSocketFile();
  }

  // ============================================================
  // Private Methods
  // ============================================================

  private async spawnMpv(): Promise<void> {
    // Clean up any existing socket file
    this.cleanupSocketFile();

    if (!this.windowHandle) {
      throw new Error('Window handle not set');
    }

    // Read the X11 Window ID from the native handle buffer (little-endian 32-bit uint)
    const windowId = this.windowHandle.readUInt32LE(0);

    const args = [
      '--idle=yes',
      `--wid=${windowId}`,
      `--input-ipc-server=${IPC_SOCKET_PATH}`,
      '--no-terminal',
      '--keep-open=yes',
      '--force-window=no',
      `--volume=${this.state.volume}`,
      this.state.muted ? '--mute=yes' : '--mute=no',
      '--input-default-bindings=no',
      '--input-vo-keyboard=no',
    ];

    this.mpvProcess = spawn(this.mpvPath, args, {
      stdio: ['ignore', 'ignore', 'ignore'],
    });

    this.mpvProcess.on('error', (error) => {
      console.error('[PlayerManager] MPV spawn error:', error.message);
      this.updateState({ status: 'error', error: `MPV failed to start: ${error.message}` });
    });

    this.mpvProcess.on('exit', (code, signal) => {
      if (this.destroying) return;

      console.warn(`[PlayerManager] MPV exited with code ${code}, signal ${signal}`);
      this.socket = null;
      this.mpvProcess = null;

      // Auto-restart logic
      this.handleCrashRestart();
    });

    // Wait for the IPC socket to become available, then connect
    await this.connectSocket();
  }

  private async connectSocket(): Promise<void> {
    for (let attempt = 0; attempt < SOCKET_CONNECT_MAX_RETRIES; attempt++) {
      try {
        await this.tryConnectSocket();
        // Once connected, observe properties for status updates
        await this.observeProperties();
        return;
      } catch {
        await this.delay(SOCKET_CONNECT_RETRY_MS);
      }
    }

    throw new Error('Failed to connect to MPV IPC socket after retries');
  }

  private tryConnectSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();

      socket.on('connect', () => {
        this.socket = socket;
        this.setupSocketListeners();
        resolve();
      });

      socket.on('error', (err) => {
        socket.destroy();
        reject(err);
      });

      socket.connect(IPC_SOCKET_PATH);
    });
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('data', (data) => {
      this.socketBuffer += data.toString();
      this.processSocketBuffer();
    });

    this.socket.on('close', () => {
      this.socket = null;
      if (!this.destroying) {
        // Socket closed unexpectedly - MPV may have crashed
        this.rejectAllPending('Socket closed');
      }
    });

    this.socket.on('error', (error) => {
      console.error('[PlayerManager] Socket error:', error.message);
    });
  }

  private processSocketBuffer(): void {
    const lines = this.socketBuffer.split('\n');
    // Keep the last incomplete line in the buffer
    this.socketBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        this.handleMpvMessage(message);
      } catch {
        // Ignore malformed JSON lines
      }
    }
  }

  private handleMpvMessage(message: any): void {
    // Handle command responses
    if ('request_id' in message && message.request_id !== undefined) {
      const pending = this.pendingRequests.get(message.request_id);
      if (pending) {
        this.pendingRequests.delete(message.request_id);
        if (message.error === 'success') {
          pending.resolve(message.data);
        } else {
          pending.reject(new Error(message.error || 'MPV command failed'));
        }
      }
    }

    // Handle property-change events
    if (message.event === 'property-change') {
      this.handlePropertyChange(message);
    }

    // Handle end-file event (stream ended or errored)
    if (message.event === 'end-file') {
      this.handleEndFile(message);
    }

    // Handle file-loaded event (stream started playing)
    if (message.event === 'file-loaded') {
      this.updateState({ status: 'playing', error: null });
    }
  }

  private handlePropertyChange(message: any): void {
    const { name, data } = message;

    switch (name) {
      case 'pause':
        if (data === true && this.state.status === 'playing') {
          this.updateState({ status: 'paused' });
        } else if (data === false && this.state.status === 'paused') {
          this.updateState({ status: 'playing' });
        }
        break;
      case 'volume':
        if (typeof data === 'number') {
          this.updateState({ volume: Math.max(0, Math.min(100, Math.round(data))) });
        }
        break;
      case 'mute':
        if (typeof data === 'boolean') {
          this.updateState({ muted: data });
        }
        break;
    }
  }

  private handleEndFile(message: any): void {
    const reason = message.reason || message.data?.reason;

    if (reason === 'error' || reason === 'unknown') {
      this.updateState({
        status: 'error',
        error: 'Stream playback ended with an error',
      });
    } else if (reason === 'stop' || reason === 'quit') {
      // Intentional stop, already handled
    } else if (reason === 'eof') {
      this.updateState({ status: 'idle', currentUrl: null });
    }
  }

  private async observeProperties(): Promise<void> {
    // Observe key properties for status updates
    await this.sendCommand(['observe_property', 1, 'pause']);
    await this.sendCommand(['observe_property', 2, 'volume']);
    await this.sendCommand(['observe_property', 3, 'mute']);
  }

  private sendCommand(command: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected to MPV'));
        return;
      }

      const id = ++this.requestId;
      const payload = JSON.stringify({ command, request_id: id }) + '\n';

      this.pendingRequests.set(id, { resolve, reject });

      this.socket.write(payload, (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          reject(err);
        }
      });
    });
  }

  private setProperty(name: string, value: unknown): Promise<unknown> {
    return this.sendCommand(['set_property', name, value]);
  }

  private updateState(partial: Partial<PlayerState>): void {
    this.state = { ...this.state, ...partial };
    this.emitStatus();
  }

  private emitStatus(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('player:status', this.getState());
    }
  }

  private async handleCrashRestart(): Promise<void> {
    if (this.destroying) return;

    console.log('[PlayerManager] Attempting auto-restart after crash...');
    this.updateState({ status: 'error', error: 'Player crashed, restarting...' });

    await this.delay(RESTART_DELAY_MS);

    if (this.destroying) return;

    try {
      await this.spawnMpv();

      // If we were playing something, try to resume
      if (this.lastUrl) {
        await this.play(this.lastUrl);
      } else {
        this.updateState({ status: 'idle', error: null });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to restart MPV';
      console.error('[PlayerManager] Auto-restart failed:', message);
      this.updateState({ status: 'error', error: `Auto-restart failed: ${message}` });
    }
  }

  private async disconnectSocket(): Promise<void> {
    if (this.socket) {
      this.rejectAllPending('Destroying player');
      this.socket.destroy();
      this.socket = null;
    }
  }

  private async killMpvProcess(): Promise<void> {
    if (this.mpvProcess) {
      const process = this.mpvProcess;
      this.mpvProcess = null;

      try {
        // Send quit command if socket is still available
        if (this.socket) {
          await this.sendCommand(['quit']);
        }
      } catch {
        // Ignore errors during quit
      }

      // Force kill if still running
      if (!process.killed) {
        process.kill('SIGTERM');

        // Give it a moment, then SIGKILL if needed
        await this.delay(500);
        if (!process.killed) {
          process.kill('SIGKILL');
        }
      }
    }
  }

  private cleanupSocketFile(): void {
    try {
      if (fs.existsSync(IPC_SOCKET_PATH)) {
        fs.unlinkSync(IPC_SOCKET_PATH);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
