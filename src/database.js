const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

// Encryption constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

// In-memory vault state (never persisted directly)
let vaultKey = null;
let isVaultUnlocked = false;

// Derive encryption key from master password using PBKDF2
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
}

// Encrypt a string
function encrypt(text, key) {
  if (!text || !key) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  // Return format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

// Decrypt a string
function decrypt(encryptedData, key) {
  if (!encryptedData || !key) return null;
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.error('[PolarOps/DB] Decryption failed:', e.message);
    return null;
  }
}

// Hash master password for verification
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, 'sha512').toString('hex');
}

// Check if vault is enabled
function isVaultEnabled() {
  return data.settings?.vaultEnabled === 'true' && data.vault?.passwordHash;
}

// Check if vault is currently unlocked
function isVaultCurrentlyUnlocked() {
  return isVaultUnlocked && vaultKey !== null;
}

// Setup master password (first time setup)
function setupVault(masterPassword) {
  if (!masterPassword || masterPassword.length < 4) {
    throw new Error('Master password must be at least 4 characters');
  }
  
  const salt = crypto.randomBytes(SALT_LENGTH);
  const passwordHash = hashPassword(masterPassword, salt);
  const key = deriveKey(masterPassword, salt);
  
  // Store vault metadata
  if (!data.vault) data.vault = {};
  data.vault.salt = salt.toString('hex');
  data.vault.passwordHash = passwordHash;
  data.vault.createdAt = new Date().toISOString();
  data.settings.vaultEnabled = 'true';
  
  // Encrypt all existing server passwords
  data.servers.forEach(server => {
    if (server.password && !server.passwordEncrypted) {
      server.password = encrypt(server.password, key);
      server.passwordEncrypted = true;
    }
    if (server.privateKey && !server.privateKeyEncrypted) {
      server.privateKey = encrypt(server.privateKey, key);
      server.privateKeyEncrypted = true;
    }
  });
  
  // Set vault as unlocked
  vaultKey = key;
  isVaultUnlocked = true;
  
  save();
  console.log('[PolarOps/Vault] Vault setup complete');
  return true;
}

// Unlock vault with master password
function unlockVault(masterPassword) {
  if (!isVaultEnabled()) {
    throw new Error('Vault is not enabled');
  }
  
  const salt = Buffer.from(data.vault.salt, 'hex');
  const storedHash = data.vault.passwordHash;
  const providedHash = hashPassword(masterPassword, salt);
  
  if (providedHash !== storedHash) {
    throw new Error('Invalid master password');
  }
  
  vaultKey = deriveKey(masterPassword, salt);
  isVaultUnlocked = true;
  
  console.log('[PolarOps/Vault] Vault unlocked');
  return true;
}

// Lock vault
function lockVault() {
  vaultKey = null;
  isVaultUnlocked = false;
  console.log('[PolarOps/Vault] Vault locked');
  return true;
}

// Change master password
function changeMasterPassword(currentPassword, newPassword) {
  if (!isVaultEnabled()) {
    throw new Error('Vault is not enabled');
  }
  
  // Verify current password
  const currentSalt = Buffer.from(data.vault.salt, 'hex');
  const currentHash = hashPassword(currentPassword, currentSalt);
  if (currentHash !== data.vault.passwordHash) {
    throw new Error('Current password is incorrect');
  }
  
  const currentKey = deriveKey(currentPassword, currentSalt);
  
  // Create new vault credentials
  const newSalt = crypto.randomBytes(SALT_LENGTH);
  const newHash = hashPassword(newPassword, newSalt);
  const newKey = deriveKey(newPassword, newSalt);
  
  // Re-encrypt all passwords with new key
  data.servers.forEach(server => {
    if (server.password && server.passwordEncrypted) {
      const decrypted = decrypt(server.password, currentKey);
      if (decrypted) {
        server.password = encrypt(decrypted, newKey);
      }
    }
    if (server.privateKey && server.privateKeyEncrypted) {
      const decrypted = decrypt(server.privateKey, currentKey);
      if (decrypted) {
        server.privateKey = encrypt(decrypted, newKey);
      }
    }
  });
  
  // Update vault metadata
  data.vault.salt = newSalt.toString('hex');
  data.vault.passwordHash = newHash;
  data.vault.updatedAt = new Date().toISOString();
  
  // Update in-memory key
  vaultKey = newKey;
  
  save();
  console.log('[PolarOps/Vault] Master password changed');
  return true;
}

// Disable vault and decrypt all passwords
function disableVault(masterPassword) {
  if (!isVaultEnabled()) {
    throw new Error('Vault is not enabled');
  }
  
  // Verify password
  const salt = Buffer.from(data.vault.salt, 'hex');
  const storedHash = data.vault.passwordHash;
  const providedHash = hashPassword(masterPassword, salt);
  
  if (providedHash !== storedHash) {
    throw new Error('Invalid master password');
  }
  
  const key = deriveKey(masterPassword, salt);
  
  // Decrypt all passwords
  data.servers.forEach(server => {
    if (server.password && server.passwordEncrypted) {
      const decrypted = decrypt(server.password, key);
      server.password = decrypted || server.password;
      server.passwordEncrypted = false;
    }
    if (server.privateKey && server.privateKeyEncrypted) {
      const decrypted = decrypt(server.privateKey, key);
      server.privateKey = decrypted || server.privateKey;
      server.privateKeyEncrypted = false;
    }
  });
  
  // Remove vault data
  delete data.vault;
  data.settings.vaultEnabled = 'false';
  
  // Clear in-memory state
  vaultKey = null;
  isVaultUnlocked = false;
  
  save();
  console.log('[PolarOps/Vault] Vault disabled');
  return true;
}

// Get decrypted password for a server
function getDecryptedPassword(serverId) {
  const server = data.servers.find(s => s.id === serverId);
  if (!server) return null;
  
  if (server.passwordEncrypted && vaultKey) {
    return decrypt(server.password, vaultKey);
  }
  return server.password;
}

// Get decrypted private key for a server
function getDecryptedPrivateKey(serverId) {
  const server = data.servers.find(s => s.id === serverId);
  if (!server) return null;
  
  if (server.privateKeyEncrypted && vaultKey) {
    return decrypt(server.privateKey, vaultKey);
  }
  return server.privateKey;
}


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
  let passwordToStore = server.password || null;
  let privateKeyToStore = server.privateKey || null;
  let passwordEncrypted = false;
  let privateKeyEncrypted = false;
  
  // Encrypt if vault is enabled and unlocked
  if (isVaultEnabled() && isVaultCurrentlyUnlocked() && vaultKey) {
    if (passwordToStore) {
      passwordToStore = encrypt(passwordToStore, vaultKey);
      passwordEncrypted = true;
    }
    if (privateKeyToStore) {
      privateKeyToStore = encrypt(privateKeyToStore, vaultKey);
      privateKeyEncrypted = true;
    }
  }
  
  const newServer = {
    id: Date.now(),
    name: server.name || `${server.username}@${server.host}`,
    host: server.host,
    port: server.port || 22,
    username: server.username,
    password: passwordToStore,
    passwordEncrypted: passwordEncrypted,
    privateKey: privateKeyToStore,
    privateKeyEncrypted: privateKeyEncrypted,
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
    let passwordToStore = server.password || null;
    let privateKeyToStore = server.privateKey || null;
    let passwordEncrypted = false;
    let privateKeyEncrypted = false;
    
    // Encrypt if vault is enabled and unlocked
    if (isVaultEnabled() && isVaultCurrentlyUnlocked() && vaultKey) {
      if (passwordToStore) {
        passwordToStore = encrypt(passwordToStore, vaultKey);
        passwordEncrypted = true;
      }
      if (privateKeyToStore) {
        privateKeyToStore = encrypt(privateKeyToStore, vaultKey);
        privateKeyEncrypted = true;
      }
    }
    
    data.servers[idx] = {
      ...data.servers[idx],
      name: server.name,
      host: server.host,
      port: server.port || 22,
      username: server.username,
      password: passwordToStore,
      passwordEncrypted: passwordEncrypted,
      privateKey: privateKeyToStore,
      privateKeyEncrypted: privateKeyEncrypted,
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
  close,
  // Vault functions
  isVaultEnabled,
  isVaultCurrentlyUnlocked,
  setupVault,
  unlockVault,
  lockVault,
  changeMasterPassword,
  disableVault,
  getDecryptedPassword,
  getDecryptedPrivateKey
};
