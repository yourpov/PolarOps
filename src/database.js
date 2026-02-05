const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let data = {
  servers: [],
  settings: {},
  pingHistory: [],
  dashboard: {
    totalConnections: 0,
    lastActivity: null
  }
};

let dbPath = null;
let dbDir = null;


function getDbDir() {
  if (!dbDir) {
    if (process.platform === 'win32') {
      dbDir = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'PolarOps');
    } else {
      dbDir = path.join(app.getPath('userData'), 'PolarOps');
    }
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }
  return dbDir;
}

function getDbPath() {
  if (!dbPath) {
    dbPath = path.join(getDbDir(), 'polarops-data.json');
  }
  return dbPath;
}

function load() {
  try {
    const filePath = getDbPath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      data = JSON.parse(raw);
    }
  } catch (e) {
    console.error('[PolarOps/DB] Failed to load:', e);
  }
}

function save() {
  try {
    const filePath = getDbPath();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[PolarOps/DB] Failed to save:', e);
  }
}

function init() {
  load();
  
  const defaultSettings = {
    theme: 'polar-dark',
    fontSize: '13',
    cursorStyle: 'block',
    shell: 'powershell',
    pingInterval: '60',
    autoConnect: 'false',
    notifications: 'true',
    soundEnabled: 'false',
    autoReconnect: 'true',
    keepAliveInterval: '30',
    scrollbackLines: '10000',
    defaultView: 'dashboard'
  };
  
  if (!data.settings) data.settings = {};
  if (!data.servers) data.servers = [];
  if (!data.pingHistory) data.pingHistory = [];
  if (!data.dashboard) data.dashboard = { totalConnections: 0, lastActivity: null };
  
  for (const [key, value] of Object.entries(defaultSettings)) {
    if (!(key in data.settings)) {
      data.settings[key] = value;
    }
  }
  
  save();
  console.log('[PolarOps/DB] Connected:', getDbPath() + ' | Servers:', data.servers.length + ' | Ping Records:', data.pingHistory.length + ' | Settings:', Object.keys(data.settings).length + '\n');
}

function getServers() {
  return data.servers || [];
}

function getServer(id) {
  return data.servers.find(s => s.id === id);
}

function addServer(server) {
  const newServer = {
    id: Date.now(),
    name: server.name || `${server.username}@${server.host}`,
    host: server.host,
    port: server.port || 22,
    username: server.username,
    password: server.password || null,
    privateKey: server.privateKey || null,
    color: server.color || null,
    last_ping_ms: null,
    last_ping_status: 'unknown',
    last_connected_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  data.servers.push(newServer);
  save();
  return newServer.id;
}

function updateServer(id, server) {
  const idx = data.servers.findIndex(s => s.id === id);
  if (idx !== -1) {
    data.servers[idx] = {
      ...data.servers[idx],
      name: server.name,
      host: server.host,
      port: server.port || 22,
      username: server.username,
      password: server.password || null,
      privateKey: server.privateKey || null,
      color: server.color !== undefined ? server.color : data.servers[idx].color,
      updated_at: new Date().toISOString()
    };
    save();
  }
}

function updateServerColor(id, color) {
  const server = data.servers.find(s => s.id === id);
  if (server) {
    server.color = color;
    server.updated_at = new Date().toISOString();
    save();
  }
}

function deleteServer(id) {
  data.servers = data.servers.filter(s => s.id !== id);
  data.pingHistory = data.pingHistory.filter(p => p.server_id !== id);
  save();
}

function updateServerPing(id, pingMs, status) {
  const server = data.servers.find(s => s.id === id);
  if (server) {
    server.last_ping_ms = pingMs;
    server.last_ping_status = status;
    server.updated_at = new Date().toISOString();
    
    data.pingHistory.push({
      id: Date.now(),
      server_id: id,
      ping_ms: pingMs,
      status: status,
      timestamp: new Date().toISOString()
    });
    
    const serverHistory = data.pingHistory.filter(p => p.server_id === id);
    if (serverHistory.length > 100) {
      const toRemove = serverHistory.slice(0, serverHistory.length - 100);
      const removeIds = new Set(toRemove.map(p => p.id));
      data.pingHistory = data.pingHistory.filter(p => !removeIds.has(p.id));
    }
    
    save();
  }
}

function updateServerLastConnected(id) {
  const server = data.servers.find(s => s.id === id);
  if (server) {
    server.last_connected_at = new Date().toISOString();
    server.updated_at = new Date().toISOString();
    save();
  }
}

function getSetting(key) {
  return data.settings[key] || null;
}

function setSetting(key, value) {
  data.settings[key] = value;
  save();
}

function getAllSettings() {
  return { ...data.settings };
}

function getDbInfo() {
  const filePath = getDbPath();
  let size = '0 KB';
  try {
    const stats = fs.statSync(filePath);
    size = (stats.size / 1024).toFixed(2) + ' KB';
  } catch (e) {}
  
  return {
    path: filePath,
    size: size,
    servers: data.servers.length,
    pingRecords: data.pingHistory.length
  };
}

function clearPingHistory() {
  data.pingHistory = [];
  data.servers.forEach(s => {
    s.last_ping_ms = null;
    s.last_ping_status = 'unknown';
  });
  save();
}

function getDashboardStats() {
  const now = new Date();
  const onlineServers = data.servers.filter(s => s.last_ping_status === 'online').length;
  const offlineServers = data.servers.filter(s => s.last_ping_status === 'offline' || s.last_ping_status === 'refused').length;
  const unknownServers = data.servers.filter(s => !s.last_ping_status || s.last_ping_status === 'unknown').length;
  const onlinePings = data.servers.filter(s => s.last_ping_ms && s.last_ping_status === 'online').map(s => s.last_ping_ms);
  const avgPing = onlinePings.length > 0 ? Math.round(onlinePings.reduce((a, b) => a + b, 0) / onlinePings.length) : 0;
  
  const recentPings = data.pingHistory.slice(-50).map(ping => {
    const server = data.servers.find(s => s.id === ping.server_id);
    return {
      ...ping,
      serverName: server ? server.name : 'Unknown Server',
      pingMs: ping.ping_ms
    };
  }).reverse();
  
  return {
    totalServers: data.servers.length,
    onlineServers,
    offlineServers,
    unknownServers,
    avgPing,
    totalConnections: data.dashboard?.totalConnections || 0,
    lastActivity: data.dashboard?.lastActivity || null,
    recentPings
  };
}

function incrementConnectionCount() {
  if (!data.dashboard) data.dashboard = { totalConnections: 0, lastActivity: null };
  data.dashboard.totalConnections++;
  data.dashboard.lastActivity = new Date().toISOString();
  save();
}

function close() {
  save();
}

module.exports = {
  init,
  getServers,
  getServer,
  addServer,
  updateServer,
  updateServerColor,
  deleteServer,
  updateServerPing,
  updateServerLastConnected,
  getSetting,
  setSetting,
  getAllSettings,
  getDbInfo,
  clearPingHistory,
  getDashboardStats,
  incrementConnectionCount,
  close
};
