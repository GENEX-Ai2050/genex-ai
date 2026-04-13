const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('genexDesktop', {
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  copyText: (text) => ipcRenderer.invoke('copy-text', text)
});
