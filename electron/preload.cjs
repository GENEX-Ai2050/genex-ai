const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('genexDesktop', {
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  createRealtimeSession: (payload) => ipcRenderer.invoke('genex:create-realtime-session', payload),
  showFounder: (founderImageUrl) => ipcRenderer.invoke('genex:show-founder', founderImageUrl)
});
