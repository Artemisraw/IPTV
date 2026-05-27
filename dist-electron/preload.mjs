"use strict";
const electron = require("electron");
const api = {
  player: {
    play: (url) => electron.ipcRenderer.invoke("player:play", url),
    stop: () => electron.ipcRenderer.invoke("player:stop"),
    pause: () => electron.ipcRenderer.invoke("player:pause"),
    resume: () => electron.ipcRenderer.invoke("player:resume"),
    setVolume: (level) => electron.ipcRenderer.invoke("player:set-volume", level),
    setMute: (muted) => electron.ipcRenderer.invoke("player:set-mute", muted),
    onStatus: (callback) => {
      const listener = (_event, state) => callback(state);
      electron.ipcRenderer.on("player:status", listener);
      return () => {
        electron.ipcRenderer.removeListener("player:status", listener);
      };
    },
    onError: (callback) => {
      const listener = (_event, error) => callback(error);
      electron.ipcRenderer.on("player:error", listener);
      return () => {
        electron.ipcRenderer.removeListener("player:error", listener);
      };
    }
  },
  playlist: {
    fetch: (url) => electron.ipcRenderer.invoke("playlist:fetch", url)
  },
  store: {
    get: (key) => electron.ipcRenderer.invoke("store:get", key),
    set: (key, value) => electron.ipcRenderer.invoke("store:set", key, value),
    getAll: () => electron.ipcRenderer.invoke("store:get-all")
  },
  settings: {
    validateMpvPath: (path) => electron.ipcRenderer.invoke("settings:validate-mpv-path", path)
  },
  log: {
    write: (level, tag, message, data) => {
      electron.ipcRenderer.send("log:write", level, tag, message, data);
    }
  }
};
electron.contextBridge.exposeInMainWorld("electronAPI", api);
