const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  mockServer: {
    start:   (port, routes, specs, globalProxyUrl) => ipcRenderer.invoke('mock-server:start', { port, routes, specs, globalProxyUrl }),
    stop:    (port) => ipcRenderer.invoke('mock-server:stop',  { port }),
    list:    ()     => ipcRenderer.invoke('mock-server:list'),
    getLogs: (port) => ipcRenderer.invoke('mock-server:logs', { port }),
    onLog: (cb) => {
      const handler = (_e, data) => cb(data)
      ipcRenderer.on('mock-server:log', handler)
      return () => ipcRenderer.removeListener('mock-server:log', handler)
    },
  },
})
