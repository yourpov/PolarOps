const { ipcRenderer } = require('electron');

window.polar = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },
  
  shell: {
    openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  },
  
  terminal: {
    create: (sessionId) => ipcRenderer.invoke('terminal:create', sessionId),
    write: (sessionId, data) => ipcRenderer.send('terminal:write', sessionId, data),
    resize: (sessionId, cols, rows) => ipcRenderer.send('terminal:resize', sessionId, cols, rows),
    close: (sessionId) => ipcRenderer.invoke('terminal:close', sessionId),
    onData: (callback) => ipcRenderer.on('terminal:data', (e, sessionId, data) => callback(sessionId, data)),
    onExit: (callback) => ipcRenderer.on('terminal:exit', (e, sessionId) => callback(sessionId))
  },
  
  ssh: {
    connect: (sessionId, config) => ipcRenderer.invoke('ssh:connect', sessionId, config),
    write: (sessionId, data) => ipcRenderer.send('ssh:write', sessionId, data),
    resize: (sessionId, cols, rows) => ipcRenderer.send('ssh:resize', sessionId, cols, rows),
    disconnect: (sessionId) => ipcRenderer.invoke('ssh:disconnect', sessionId),
    forward: (sessionId, type, config) => ipcRenderer.invoke('ssh:forward', sessionId, type, config),
    unforward: (forwardId) => ipcRenderer.invoke('ssh:unforward', forwardId)
  },
  
  sftp: {
    connect: (sessionId) => ipcRenderer.invoke('sftp:connect', sessionId),
    list: (sessionId, path) => ipcRenderer.invoke('sftp:list', sessionId, path),
    download: (sessionId, remotePath, localPath) => ipcRenderer.invoke('sftp:download', sessionId, remotePath, localPath),
    upload: (sessionId, localPath, remotePath) => ipcRenderer.invoke('sftp:upload', sessionId, localPath, remotePath),
    mkdir: (sessionId, path) => ipcRenderer.invoke('sftp:mkdir', sessionId, path),
    delete: (sessionId, path, isDirectory) => ipcRenderer.invoke('sftp:delete', sessionId, path, isDirectory),
    rename: (sessionId, oldPath, newPath) => ipcRenderer.invoke('sftp:rename', sessionId, oldPath, newPath),
    disconnect: (sessionId) => ipcRenderer.invoke('sftp:disconnect', sessionId)
  },
  
  sshKeys: {
    list: () => ipcRenderer.invoke('sshKeys:list'),
    getPublic: (keyName) => ipcRenderer.invoke('sshKeys:getPublic', keyName),
    generate: (options) => ipcRenderer.invoke('sshKeys:generate', options),
    delete: (keyName) => ipcRenderer.invoke('sshKeys:delete', keyName)
  },
  
  dialog: {
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options)
  },
  
  log: {
    getPath: () => ipcRenderer.invoke('log:getPath'),
    write: (filePath, data) => ipcRenderer.invoke('log:write', filePath, data)
  },
  
  db: {
    getServers: () => ipcRenderer.invoke('db:getServers'),
    getServer: (id) => ipcRenderer.invoke('db:getServer', id),
    addServer: (server) => ipcRenderer.invoke('db:addServer', server),
    updateServer: (id, server) => ipcRenderer.invoke('db:updateServer', id, server),
    updateServerColor: (id, color) => ipcRenderer.invoke('db:updateServerColor', id, color),
    deleteServer: (id) => ipcRenderer.invoke('db:deleteServer', id),
    getSetting: (key) => ipcRenderer.invoke('db:getSetting', key),
    setSetting: (key, value) => ipcRenderer.invoke('db:setSetting', key, value),
    getAllSettings: () => ipcRenderer.invoke('db:getAllSettings'),
    getInfo: () => ipcRenderer.invoke('db:getInfo'),
    clearPingHistory: () => ipcRenderer.invoke('db:clearPingHistory'),
    updateServerLastConnected: (id) => ipcRenderer.invoke('db:updateServerLastConnected', id),
    getDashboardStats: () => ipcRenderer.invoke('db:getDashboardStats'),
    incrementConnectionCount: () => ipcRenderer.invoke('db:incrementConnectionCount')
  },
  
  server: {
    ping: (serverId, host, port) => ipcRenderer.invoke('server:ping', serverId, host, port),
    pingAll: () => ipcRenderer.invoke('server:pingAll')
  }
};