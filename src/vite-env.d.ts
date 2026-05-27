export interface IpcRenderer {
    on(channel: string, listener: (event: any, ...args: any[]) => void): void;
    off(channel: string, listener: (event: any, ...args: any[]) => void): void;
    send(channel: string, ...args: any[]): void;
    invoke(channel: string, ...args: any[]): Promise<any>;
    playChannel(url: string): Promise<void>;
    stopPlayer(): Promise<void>;
    fetchPlaylist(url: string): Promise<string>;
}

declare global {
    interface Window {
        ipcRenderer: IpcRenderer;
    }
}
