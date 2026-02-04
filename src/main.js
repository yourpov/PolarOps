const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const pty = require('node-pty');
const { Client } = require('ssh2');
const net = require('net');
const dns = require('dns');
const db = require('./database');

let mainWindow;
let splashWindow;
const terminals = new Map();
const sshSessions = new Map();
const sftpSessions = new Map();
const portForwards = new Map();

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile('src/renderer/splash.html');
  splashWindow.center();

  setTimeout(() => {
    createMainWindow();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
  }, 2900);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 550,
    frame: false,
    backgroundColor: '#0d1117',
    titleBarStyle: 'hidden',
    show: false,
    icon: path.join(__dirname, '../assets/img/polar bear removed bg.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false
    }
  });

  mainWindow.loadFile('src/renderer/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });
  
  mainWindow.on('closed', () => {
    terminals.forEach(term => term.kill());
    sshSessions.forEach(conn => conn.end());
    mainWindow = null;
  });
}

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');

app.whenReady().then(() => {
  db.init();
  createSplashWindow();
});

app.on('window-all-closed', () => {
  db.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('shell:openPath', async (event, filePath) => {
  return shell.openPath(path.dirname(filePath));
});

ipcMain.handle('shell:openExternal', async (event, url) => {
  return shell.openExternal(url);
});

ipcMain.handle('terminal:create', (event, sessionId) => {
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  
  const term = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || process.env.USERPROFILE,
    env: process.env
  });

  terminals.set(sessionId, term);

  term.onData(data => {
    mainWindow?.webContents.send('terminal:data', sessionId, data);
  });

  term.onExit(() => {
    terminals.delete(sessionId);
    mainWindow?.webContents.send('terminal:exit', sessionId);
  });

  return sessionId;
});

ipcMain.handle('terminal:write', (event, sessionId, data) => {
  const term = terminals.get(sessionId);
  if (term) {
    term.write(data);
  }
});

ipcMain.handle('terminal:resize', (event, sessionId, cols, rows) => {
  const term = terminals.get(sessionId);
  if (term) {
    term.resize(cols, rows);
  }
});

ipcMain.handle('terminal:close', (event, sessionId) => {
  const term = terminals.get(sessionId);
  if (term) {
    term.kill();
    terminals.delete(sessionId);
  }
});

ipcMain.handle('ssh:connect', async (event, sessionId, config) => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      conn.shell({ term: 'xterm-256color' }, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        sshSessions.set(sessionId, { conn, stream });

        stream.on('data', data => {
          mainWindow?.webContents.send('terminal:data', sessionId, data.toString());
        });

        stream.on('close', () => {
          sshSessions.delete(sessionId);
          mainWindow?.webContents.send('terminal:exit', sessionId);
        });

        resolve(sessionId);
      });
    });

    conn.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
      finish([config.password]);
    });

    conn.on('error', err => {
      console.error('[PolarOps/SSH] Error:', err);
      reject(new Error(err.message || 'Authentication failed. Check your credentials.'));
    });

    conn.connect({
      host: config.host,
      port: config.port || 22,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey,
      tryKeyboard: true,
      readyTimeout: 10000
    });
  });
});

ipcMain.handle('ssh:write', (event, sessionId, data) => {
  const session = sshSessions.get(sessionId);
  if (session?.stream) {
    session.stream.write(data);
  }
});

ipcMain.handle('ssh:resize', (event, sessionId, cols, rows) => {
  const session = sshSessions.get(sessionId);
  if (session?.stream) {
    session.stream.setWindow(rows, cols, 0, 0);
  }
});

ipcMain.handle('ssh:disconnect', (event, sessionId) => {
  const session = sshSessions.get(sessionId);
  if (session) {
    session.stream?.end();
    session.conn?.end();
    sshSessions.delete(sessionId);
  }
});

ipcMain.handle('db:getServers', () => {
  return db.getServers();
});

ipcMain.handle('db:getServer', (event, id) => {
  return db.getServer(id);
});

ipcMain.handle('db:addServer', (event, server) => {
  return db.addServer(server);
});

ipcMain.handle('db:updateServer', (event, id, server) => {
  return db.updateServer(id, server);
});

ipcMain.handle('db:deleteServer', (event, id) => {
  return db.deleteServer(id);
});

ipcMain.handle('db:getSetting', (event, key) => {
  return db.getSetting(key);
});

ipcMain.handle('db:setSetting', (event, key, value) => {
  return db.setSetting(key, value);
});

ipcMain.handle('db:getAllSettings', () => {
  return db.getAllSettings();
});

ipcMain.handle('db:getInfo', () => {
  return db.getDbInfo();
});

ipcMain.handle('db:clearPingHistory', () => {
  return db.clearPingHistory();
});

ipcMain.handle('server:ping', async (event, serverId, host, port = 22) => {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    
    socket.setTimeout(5000);
    
    socket.on('connect', () => {
      const pingMs = Date.now() - startTime;
      socket.destroy();
      db.updateServerPing(serverId, pingMs, 'online');
      resolve({ status: 'online', pingMs });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      db.updateServerPing(serverId, null, 'timeout');
      resolve({ status: 'timeout', pingMs: null });
    });
    
    socket.on('error', (err) => {
      socket.destroy();
      const status = err.code === 'ECONNREFUSED' ? 'refused' : 'offline';
      db.updateServerPing(serverId, null, status);
      resolve({ status, pingMs: null, error: err.message });
    });
    
    socket.connect(port, host);
  });
});

ipcMain.handle('server:pingAll', async () => {
  const servers = db.getServers();
  const results = [];
  
  for (const server of servers) {
    const result = await new Promise((resolve) => {
      const startTime = Date.now();
      const socket = new net.Socket();
      
      socket.setTimeout(5000);
      
      socket.on('connect', () => {
        const pingMs = Date.now() - startTime;
        socket.destroy();
        db.updateServerPing(server.id, pingMs, 'online');
        resolve({ id: server.id, status: 'online', pingMs });
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        db.updateServerPing(server.id, null, 'timeout');
        resolve({ id: server.id, status: 'timeout', pingMs: null });
      });
      
      socket.on('error', (err) => {
        socket.destroy();
        const status = err.code === 'ECONNREFUSED' ? 'refused' : 'offline';
        db.updateServerPing(server.id, null, status);
        resolve({ id: server.id, status, pingMs: null });
      });
      
      socket.connect(server.port || 22, server.host);
    });
    
    results.push(result);
  }
  
  return results;
});

ipcMain.handle('db:updateServerLastConnected', (event, id) => {
  return db.updateServerLastConnected(id);
});

ipcMain.handle('db:getDashboardStats', () => {
  return db.getDashboardStats();
});

ipcMain.handle('db:incrementConnectionCount', () => {
  return db.incrementConnectionCount();
});

ipcMain.handle('sftp:connect', async (event, sessionId) => {
  const session = sshSessions.get(sessionId);
  if (!session || !session.conn) {
    throw new Error('No SSH connection found');
  }
  
  return new Promise((resolve, reject) => {
    session.conn.sftp((err, sftp) => {
      if (err) {
        reject(err);
        return;
      }
      sftpSessions.set(sessionId, sftp);
      resolve(true);
    });
  });
});

ipcMain.handle('sftp:list', async (event, sessionId, remotePath) => {
  const sftp = sftpSessions.get(sessionId);
  if (!sftp) {
    throw new Error('No SFTP session found');
  }
  
  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) {
        reject(err);
        return;
      }
      
      const items = list.map(item => ({
        name: item.filename,
        size: item.attrs.size,
        isDirectory: item.attrs.isDirectory(),
        modified: new Date(item.attrs.mtime * 1000).toISOString(),
        permissions: item.attrs.mode
      }));
      
      items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      
      resolve(items);
    });
  });
});

ipcMain.handle('sftp:download', async (event, sessionId, remotePath, localPath) => {
  const sftp = sftpSessions.get(sessionId);
  if (!sftp) {
    throw new Error('No SFTP session found');
  }
  
  return new Promise((resolve, reject) => {
    sftp.fastGet(remotePath, localPath, err => {
      if (err) {
        reject(err);
        return;
      }
      resolve(localPath);
    });
  });
});

ipcMain.handle('sftp:upload', async (event, sessionId, localPath, remotePath) => {
  const sftp = sftpSessions.get(sessionId);
  if (!sftp) {
    throw new Error('No SFTP session found');
  }
  
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, err => {
      if (err) {
        reject(err);
        return;
      }
      resolve(remotePath);
    });
  });
});

ipcMain.handle('sftp:mkdir', async (event, sessionId, remotePath) => {
  const sftp = sftpSessions.get(sessionId);
  if (!sftp) {
    throw new Error('No SFTP session found');
  }
  
  return new Promise((resolve, reject) => {
    sftp.mkdir(remotePath, err => {
      if (err) {
        reject(err);
        return;
      }
      resolve(remotePath);
    });
  });
});

ipcMain.handle('sftp:delete', async (event, sessionId, remotePath, isDirectory) => {
  const sftp = sftpSessions.get(sessionId);
  if (!sftp) {
    throw new Error('No SFTP session found');
  }
  
  return new Promise((resolve, reject) => {
    const method = isDirectory ? 'rmdir' : 'unlink';
    sftp[method](remotePath, err => {
      if (err) {
        reject(err);
        return;
      }
      resolve(true);
    });
  });
});

ipcMain.handle('sftp:rename', async (event, sessionId, oldPath, newPath) => {
  const sftp = sftpSessions.get(sessionId);
  if (!sftp) {
    throw new Error('No SFTP session found');
  }
  
  return new Promise((resolve, reject) => {
    sftp.rename(oldPath, newPath, err => {
      if (err) {
        reject(err);
        return;
      }
      resolve(newPath);
    });
  });
});

ipcMain.handle('sftp:disconnect', async (event, sessionId) => {
  const sftp = sftpSessions.get(sessionId);
  if (sftp) {
    sftp.end();
    sftpSessions.delete(sessionId);
  }
  return true;
});

ipcMain.handle('ssh:forward', async (event, sessionId, type, config) => {
  const session = sshSessions.get(sessionId);
  if (!session || !session.conn) {
    throw new Error('No SSH connection found');
  }
  
  const forwardId = `${sessionId}-${Date.now()}`;
  
  return new Promise((resolve, reject) => {
    if (type === 'local') {
      const server = net.createServer(socket => {
        session.conn.forwardOut(
          '127.0.0.1',
          config.localPort,
          config.remoteHost,
          config.remotePort,
          (err, stream) => {
            if (err) {
              socket.end();
              return;
            }
            socket.pipe(stream);
            stream.pipe(socket);
          }
        );
      });
      
      server.listen(config.localPort, '127.0.0.1', () => {
        portForwards.set(forwardId, { type, server, config });
        resolve({ id: forwardId, type, config });
      });
      
      server.on('error', err => {
        reject(err);
      });
      
    } else if (type === 'dynamic') {
      const server = net.createServer(socket => {
        let state = 'greeting';
        
        socket.once('data', data => {
          if (state === 'greeting') {
            socket.write(Buffer.from([0x05, 0x00]));
            state = 'request';
            
            socket.once('data', reqData => {
              if (reqData[0] !== 0x05 || reqData[1] !== 0x01) {
                socket.end(Buffer.from([0x05, 0x07]));
                return;
              }
              
              let host, port;
              if (reqData[3] === 0x01) {
                host = `${reqData[4]}.${reqData[5]}.${reqData[6]}.${reqData[7]}`;
                port = reqData.readUInt16BE(8);
              } else if (reqData[3] === 0x03) {
                const len = reqData[4];
                host = reqData.slice(5, 5 + len).toString();
                port = reqData.readUInt16BE(5 + len);
              } else {
                socket.end(Buffer.from([0x05, 0x08]));
                return;
              }
              
              session.conn.forwardOut('127.0.0.1', 0, host, port, (err, stream) => {
                if (err) {
                  socket.end(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
                  return;
                }
                socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
                socket.pipe(stream);
                stream.pipe(socket);
              });
            });
          }
        });
      });
      
      server.listen(config.localPort, '127.0.0.1', () => {
        portForwards.set(forwardId, { type, server, config });
        resolve({ id: forwardId, type, config });
      });
      
      server.on('error', reject);
      
    } else {
      reject(new Error('Unsupported forward type'));
    }
  });
});

ipcMain.handle('ssh:unforward', async (event, forwardId) => {
  const forward = portForwards.get(forwardId);
  if (forward && forward.server) {
    forward.server.close();
    portForwards.delete(forwardId);
  }
  return true;
});

ipcMain.handle('sshKeys:list', async () => {
  const sshDir = path.join(os.homedir(), '.ssh');
  const keys = [];
  
  if (!fs.existsSync(sshDir)) {
    return keys;
  }
  
  const files = fs.readdirSync(sshDir);
  const pubFiles = files.filter(f => f.endsWith('.pub'));
  
  for (const pubFile of pubFiles) {
    const baseName = pubFile.replace('.pub', '');
    const hasPrivate = files.includes(baseName);
    
    let keyType = 'unknown';
    try {
      const pubContent = fs.readFileSync(path.join(sshDir, pubFile), 'utf8');
      if (pubContent.startsWith('ssh-rsa')) keyType = 'RSA';
      else if (pubContent.startsWith('ssh-ed25519')) keyType = 'ED25519';
      else if (pubContent.startsWith('ecdsa-')) keyType = 'ECDSA';
    } catch (e) {
    }
    
    keys.push({
      name: baseName,
      type: keyType,
      hasPrivate,
      pubPath: path.join(sshDir, pubFile),
      privatePath: hasPrivate ? path.join(sshDir, baseName) : null
    });
  }
  
  return keys;
});

ipcMain.handle('sshKeys:getPublic', async (event, keyName) => {
  const sshDir = path.join(os.homedir(), '.ssh');
  const pubPath = path.join(sshDir, `${keyName}.pub`);
  
  if (!fs.existsSync(pubPath)) {
    throw new Error('Public key not found');
  }
  
  return fs.readFileSync(pubPath, 'utf8');
});

ipcMain.handle('sshKeys:generate', async (event, options) => {
  const { exec } = require('child_process');
  const sshDir = path.join(os.homedir(), '.ssh');
  
  if (!fs.existsSync(sshDir)) {
    fs.mkdirSync(sshDir, { mode: 0o700 });
  }
  
  const keyPath = path.join(sshDir, options.name);
  const args = [
    '-t', options.type || 'ed25519',
    '-f', keyPath,
    '-N', options.passphrase || '',
    '-C', options.comment || ''
  ];
  
  return new Promise((resolve, reject) => {
    exec(`ssh-keygen ${args.map(a => `"${a}"`).join(' ')}`, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve({
        name: options.name,
        type: options.type || 'ed25519',
        privatePath: keyPath,
        pubPath: `${keyPath}.pub`
      });
    });
  });
});

ipcMain.handle('sshKeys:delete', async (event, keyName) => {
  const sshDir = path.join(os.homedir(), '.ssh');
  const pubPath = path.join(sshDir, `${keyName}.pub`);
  const privatePath = path.join(sshDir, keyName);
  
  if (fs.existsSync(pubPath)) {
    fs.unlinkSync(pubPath);
  }
  if (fs.existsSync(privatePath)) {
    fs.unlinkSync(privatePath);
  }
  
  return true;
});

ipcMain.handle('dialog:openFile', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  
  return result.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: options?.defaultPath,
    filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  
  if (result.canceled || !result.filePath) {
    return null;
  }
  
  return result.filePath;
});

ipcMain.handle('log:getPath', () => {
  const logDir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
});

ipcMain.handle('log:write', async (event, filePath, data) => {
  fs.appendFileSync(filePath, data);
  return true;
});