const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');
const { WebLinksAddon } = require('xterm-addon-web-links');
const { SearchAddon } = require('xterm-addon-search');
const Features = require('./modules/features');
const State = require('./modules/state');
const Themes = require('./modules/themes');

let sessionCounter = 0;
const sessions = new Map();
let activeSessionId = null;
let skeletonAttempts = 0;
let savedServers = [];
let appSettings = {};

const terminalThemes = Themes.TerminalThemes;


async function loadServers() {
  try {
    savedServers = await window.polar.db.getServers();
  } catch (e) {
    console.error('[PolarOps/App] Failed to load servers:', e);
    const stored = localStorage.getItem('polar_servers');
    if (stored) {
      const oldServers = JSON.parse(stored);
      for (const server of oldServers) {
        await window.polar.db.addServer(server);
      }
      localStorage.removeItem('polar_servers');
      savedServers = await window.polar.db.getServers();
    }
  }
}

async function loadSettings() {
  try {
    appSettings = await window.polar.db.getAllSettings();
    State.settings = appSettings;
    applyUITheme(appSettings.theme || 'polar-dark');
    applyTerminalTheme(appSettings.terminalTheme || appSettings.theme || 'polar-dark');
    
    await Features.init();
  } catch (e) {
    console.error('[PolarOps/App] Failed to load settings:', e);
  }
}

function applyUITheme(themeName) {
  document.documentElement.setAttribute('data-theme', themeName);
  appSettings.theme = themeName;
  State.settings.theme = themeName;
  
  document.body.style.display = 'none';
  document.body.offsetHeight; // we wanna trigger a reflow
  document.body.style.display = '';
}

function applyTerminalTheme(themeName) {
  appSettings.terminalTheme = themeName;
  State.settings.terminalTheme = themeName;
  const termTheme = terminalThemes[themeName] || terminalThemes['polar-dark'];
  sessions.forEach(session => {
    if (session.terminal) {
      session.terminal.options.theme = termTheme;
    }
  });
}

async function addServer(config) {
  const id = await window.polar.db.addServer({
    name: config.name || `${config.username}@${config.host}`,
    host: config.host,
    port: config.port || 22,
    username: config.username,
    password: config.password
  });
  savedServers = await window.polar.db.getServers();
  populateQuickConnect();
  return id;
}

async function deleteServer(id) {
  await window.polar.db.deleteServer(id);
  savedServers = await window.polar.db.getServers();
  populateQuickConnect();
}

// Helper to check if a server has an active session
function getActiveSessionForServer(server) {
  for (const [id, session] of sessions.entries()) {
    if (session.type === 'ssh' && session.config) {
      if (session.config.host === server.host && 
          session.config.username === server.username &&
          (session.config.port || 22) === (server.port || 22)) {
        return session;
      }
    }
  }
  return null;
}

// Helper to get ALL active sessions for a server
function getAllActiveSessionsForServer(server) {
  const activeSessions = [];
  for (const [id, session] of sessions.entries()) {
    if (session.type === 'ssh' && session.config) {
      if (session.config.host === server.host && 
          session.config.username === server.username &&
          (session.config.port || 22) === (server.port || 22)) {
        activeSessions.push(session);
      }
    }
  }
  return activeSessions;
}

// Color options for server labels
const serverColorOptions = [
  { name: 'None', value: null },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' }
];

function populateQuickConnect() {
  const list = document.getElementById('quick-connect-list');
  if (!list) return;
  
  const skeleton = document.getElementById('quick-connect-skeleton');
  if (skeleton) skeleton.remove();
  
  // Clear existing items
  list.innerHTML = '';
  
  if (savedServers.length === 0) {
    list.innerHTML = `
      <div class="empty-sessions" style="padding: 16px 8px; text-align: center;">
        <p style="font-size: 11px; color: var(--text-muted); margin: 0;">No saved servers</p>
      </div>
    `;
    return;
  }
  
  savedServers.forEach(server => {
    const item = document.createElement('div');
    item.className = 'session-item quick-connect-item';
    item.dataset.serverId = server.id;
    
    // Check if this server has an active session
    const activeSession = getActiveSessionForServer(server);
    const isActive = activeSession !== null;
    
    // Dot color: green if active session, grey if not
    const dotColor = isActive ? 'var(--green)' : 'var(--text-muted)';
    
    // Build ping tooltip
    let pingTooltip = '';
    if (server.last_ping_ms !== null && server.last_ping_status === 'online') {
      pingTooltip = `Last ping: ${server.last_ping_ms}ms`;
    } else if (server.last_ping_status && server.last_ping_status !== 'unknown') {
      pingTooltip = `Last ping: ${server.last_ping_status}`;
    } else {
      pingTooltip = 'No ping data';
    }
    
    // Color indicator bar if server has a color
    const colorBar = server.color ? `<div class="server-color-bar" style="position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: ${server.color}; border-radius: 2px 0 0 2px;"></div>` : '';
    
    item.style.position = 'relative';
    item.innerHTML = `
      ${colorBar}
      <div class="session-dot" title="${pingTooltip}" style="width: 6px; height: 6px; border-radius: 50%; background: ${dotColor}; margin-right: 8px; flex-shrink: 0; cursor: help;${isActive ? ' box-shadow: 0 0 4px var(--green);' : ''}"></div>
      <span class="session-name" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;${server.color ? ' padding-left: 4px;' : ''}" title="Double-click to connect">${server.name}</span>
      <span class="dblclick-hint" style="display: none; font-size: 9px; color: var(--accent); white-space: nowrap; margin-left: 4px;">click again</span>
    `;
    
    let connectClickPending = false;
    let connectClickTimeout = null;
    
    // Single click shows hint, double click connects
    item.addEventListener('click', (e) => {
      if (e.target.closest('.session-dot')) return; // Ignore clicks on the dot
      
      if (connectClickPending) {
        // Second click - connect
        clearTimeout(connectClickTimeout);
        connectClickPending = false;
        item.querySelector('.dblclick-hint').style.display = 'none';
        item.style.background = '';
        
        (async () => {
          await window.polar.db.updateServerLastConnected(server.id);
          await window.polar.db.incrementConnectionCount();
          switchView('sessions');
          createSession('ssh', {
            name: server.name,
            host: server.host,
            port: server.port,
            username: server.username,
            password: server.password,
            serverId: server.id
          });
        })();
      } else {
        // First click - show hint
        connectClickPending = true;
        item.querySelector('.dblclick-hint').style.display = 'inline';
        item.style.background = 'var(--accent-dim)';
        
        connectClickTimeout = setTimeout(() => {
          connectClickPending = false;
          item.querySelector('.dblclick-hint').style.display = 'none';
          item.style.background = '';
        }, 1500);
      }
    });
    
    // Double click still works as backup
    item.addEventListener('dblclick', async () => {
      clearTimeout(connectClickTimeout);
      connectClickPending = false;
      item.querySelector('.dblclick-hint').style.display = 'none';
      item.style.background = '';
      
      await window.polar.db.updateServerLastConnected(server.id);
      await window.polar.db.incrementConnectionCount();
      switchView('sessions');
      createSession('ssh', {
        name: server.name,
        host: server.host,
        port: server.port,
        username: server.username,
        password: server.password,
        serverId: server.id
      });
    });
    
    // Right click context menu
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showServerContextMenu(e, server, activeSession);
    });
    
    list.appendChild(item);
  });
}

function showServerContextMenu(event, server, activeSession) {
  // Remove any existing context menu
  const existingMenu = document.querySelector('.server-context-menu');
  if (existingMenu) existingMenu.remove();
  
  // Get ALL active sessions for this server
  const activeSessions = getAllActiveSessionsForServer(server);
  
  const menu = document.createElement('div');
  menu.className = 'server-context-menu';
  menu.style.cssText = `
    position: fixed;
    left: ${event.clientX}px;
    top: ${event.clientY}px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    min-width: 200px;
    max-width: 280px;
    z-index: 10000;
    padding: 6px;
    font-size: 12px;
  `;
  
  // Active sessions section
  if (activeSessions.length > 0) {
    const sessionHeader = document.createElement('div');
    sessionHeader.style.cssText = 'padding: 6px 10px; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border); margin-bottom: 4px;';
    sessionHeader.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px;">
        <div style="width: 6px; height: 6px; background: var(--green); border-radius: 50%; box-shadow: 0 0 4px var(--green);"></div>
        ${activeSessions.length} Active Session${activeSessions.length > 1 ? 's' : ''}
      </div>
    `;
    menu.appendChild(sessionHeader);
    
    // List each active session
    activeSessions.forEach((session, index) => {
      const sessionItem = document.createElement('button');
      const tabColor = session.tabColor || null;
      const colorIndicator = tabColor 
        ? `<div style="width: 8px; height: 8px; border-radius: 2px; background: ${tabColor}; flex-shrink: 0;"></div>` 
        : `<div style="width: 8px; height: 8px; border-radius: 50%; background: var(--green); flex-shrink: 0; box-shadow: 0 0 4px var(--green);"></div>`;
      
      const isCurrentSession = session.id === activeSessionId;
      
      sessionItem.style.cssText = `
        width: 100%; 
        padding: 8px 10px; 
        background: ${isCurrentSession ? 'var(--accent-dim)' : 'transparent'}; 
        border: none;
        border-left: 3px solid ${tabColor || 'transparent'};
        color: var(--text); 
        font-size: 12px; 
        text-align: left; 
        cursor: pointer;
        border-radius: 4px; 
        transition: background 100ms ease;
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 2px;
      `;
      
      sessionItem.innerHTML = `
        ${colorIndicator}
        <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${session.name}</span>
        ${isCurrentSession ? '<span style="font-size: 10px; color: var(--accent);">●</span>' : ''}
      `;
      
      sessionItem.addEventListener('mouseenter', () => {
        if (!isCurrentSession) sessionItem.style.background = 'var(--bg-tertiary)';
      });
      sessionItem.addEventListener('mouseleave', () => {
        sessionItem.style.background = isCurrentSession ? 'var(--accent-dim)' : 'transparent';
      });
      
      sessionItem.addEventListener('click', () => {
        switchToSession(session.id);
        switchView('sessions');
        menu.remove();
      });
      
      menu.appendChild(sessionItem);
    });
    
  } else {
    const noSession = document.createElement('div');
    noSession.style.cssText = 'padding: 8px 10px; border-bottom: 1px solid var(--border); margin-bottom: 6px; color: var(--text-muted);';
    noSession.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px;">
        <div style="width: 6px; height: 6px; background: var(--text-muted); border-radius: 50%;"></div>
        No active sessions
      </div>
    `;
    menu.appendChild(noSession);
    
    // Connect button
    const connectBtn = createMenuItem('Connect', async () => {
      await window.polar.db.updateServerLastConnected(server.id);
      await window.polar.db.incrementConnectionCount();
      switchView('sessions');
      createSession('ssh', {
        name: server.name,
        host: server.host,
        port: server.port,
        username: server.username,
        password: server.password,
        serverId: server.id
      });
    });
    menu.appendChild(connectBtn);
  }
  
  document.body.appendChild(menu);
  
  // Adjust position if menu goes off screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 10}px`;
  }
  
  // Close menu on click outside
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

function createMenuItem(text, onClick) {
  const item = document.createElement('button');
  item.style.cssText = `
    width: 100%; padding: 8px 10px; background: transparent; border: none;
    color: var(--text); font-size: 12px; text-align: left; cursor: pointer;
    border-radius: 4px; transition: background 100ms ease;
  `;
  item.textContent = text;
  item.addEventListener('mouseenter', () => item.style.background = 'var(--bg-tertiary)');
  item.addEventListener('mouseleave', () => item.style.background = 'transparent');
  item.addEventListener('click', () => {
    onClick();
    const menu = document.querySelector('.server-context-menu');
    if (menu) menu.remove();
  });
  return item;
}

(async () => {
  await loadServers();
  await loadSettings();
  populateQuickConnect();
  switchView('dashboard');
})();

// Quick connect skeleton is handled by populateQuickConnect()

class Session {
  constructor(id, type = 'local', config = null) {
    this.id = id;
    this.type = type;
    this.config = config;
    
    const currentTermTheme = appSettings.terminalTheme || appSettings.theme || 'polar-dark';
    const termTheme = terminalThemes[currentTermTheme] || terminalThemes['polar-dark'];
    
    this.terminal = new Terminal({
      theme: termTheme,
      fontSize: parseInt(appSettings.fontSize) || 13,
      fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", "Consolas", monospace',
      cursorBlink: appSettings.cursorBlink !== false,
      cursorStyle: appSettings.cursorStyle || 'bar',
      cursorWidth: 2,
      cursorInactiveStyle: 'outline',
      scrollback: parseInt(appSettings.scrollbackLines) || 5000,
      allowTransparency: true,
      letterSpacing: 0.3,
      lineHeight: 1.3,
      drawBoldTextInBrightColors: true,
      minimumContrastRatio: 1,
      bellStyle: 'none',
      wordSeparator: ' ()[]{}\'"',
      rightClickSelectsWord: false,
      fastScrollModifier: 'alt',
      fastScrollSensitivity: 10,
      smoothScrollDuration: 0,
      scrollSensitivity: 1,
      overviewRulerWidth: 0,
      rescaleOverlappingGlyphs: true,
      windowsPty: {
        backend: 'conpty',
        buildNumber: 18362
      }
    });
    
    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon());
    
    this.element = this.createTerminalElement();
    
    if (type === 'ssh' && config) {
      this.name = config.name && config.name.trim() ? config.name.trim() : `${config.username}@${config.host}`;
    } else {
      this.name = `Terminal ${id + 1}`;
    }
    
    this.setupTerminal();
  }

  createTerminalElement() {
    const wrapper = document.createElement('div');
    wrapper.className = 'terminal-wrapper';
    wrapper.id = `terminal-${this.id}`;
    return wrapper;
  }

  setupTerminal() {
    this.terminal.open(this.element);
    
    this.searchAddon = new SearchAddon();
    this.terminal.loadAddon(this.searchAddon);
    
    this.fitAddon.fit();

    window.polar.terminal.onData((sessionId, data) => {
      if (sessionId === this.id) {
        this.terminal.write(data);
        Features.logData(this.id, data);
      }
    });

    window.polar.terminal.onExit((sessionId) => {
      if (sessionId === this.id) {
        closeSession(this.id, true);
      }
    });

    this.terminal.onData(data => {
      if (this.type === 'local') {
        window.polar.terminal.write(this.id, data);
      } else if (this.type === 'ssh') {
        window.polar.ssh.write(this.id, data);
      }
    });

    this.terminal.onResize(({ cols, rows }) => {
      if (this.type === 'local') {
        window.polar.terminal.resize(this.id, cols, rows);
      } else if (this.type === 'ssh') {
        window.polar.ssh.resize(this.id, cols, rows);
      }
    });

    this.terminal.onSelectionChange(() => {
      if (appSettings.copyOnSelect !== false) {
        const selection = this.terminal.getSelection();
        if (selection && selection.length > 0) {
          navigator.clipboard.writeText(selection);
          if (appSettings.clearSelectionOnCopy !== false) {
            this.terminal.clearSelection();
          }
        }
      }
    });

    this.element.addEventListener('contextmenu', async (e) => {
      if (appSettings.rightClickPaste !== false) {
        e.preventDefault();
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            if (this.awaitingPassword) {
              this.pastedPassword = (this.pastedPassword || '') + text;
            } else if (this.type === 'local') {
              window.polar.terminal.write(this.id, text);
            } else if (this.type === 'ssh') {
              window.polar.ssh.write(this.id, text);
            }
          }
        } catch (err) {
          console.error('[PolarOps/Terminal] Failed to paste:', err);
        }
      }
    });

    this.terminal.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'C' && e.type === 'keydown') {
        const selection = this.terminal.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          if (appSettings.clearSelectionOnCopy !== false) {
            this.terminal.clearSelection();
          }
        }
        return false;
      }
      
      if (e.ctrlKey && e.shiftKey && e.key === 'V' && e.type === 'keydown') {
        navigator.clipboard.readText().then(text => {
          if (text) {
            if (this.type === 'local') {
              window.polar.terminal.write(this.id, text);
            } else if (this.type === 'ssh') {
              window.polar.ssh.write(this.id, text);
            }
          }
        });
        return false;
      }
      
      if (e.ctrlKey && !e.shiftKey && e.key === 'c' && e.type === 'keydown') {
        if (appSettings.ctrlCCopy !== false) {
          const selection = this.terminal.getSelection();
          if (selection && selection.length > 0) {
            navigator.clipboard.writeText(selection);
            if (appSettings.clearSelectionOnCopy !== false) {
              this.terminal.clearSelection();
            }
            return false;
          }
        }
        return true;
      }
      
      if (e.ctrlKey && !e.shiftKey && e.key === 'v' && e.type === 'keydown') {
        if (appSettings.ctrlVPaste !== false) {
          navigator.clipboard.readText().then(text => {
            if (text) {
              if (this.awaitingPassword) {
                this.pastedPassword = (this.pastedPassword || '') + text;
              } else if (this.type === 'local') {
                window.polar.terminal.write(this.id, text);
              } else if (this.type === 'ssh') {
                window.polar.ssh.write(this.id, text);
              }
            }
          });
          return false;
        }
      }
      
      return true;
    });

    window.addEventListener('resize', () => {
      if (this.id === activeSessionId) {
        this.fitAddon.fit();
      }
    });
  }

  async start() {
    if (this.type === 'local') {
      await window.polar.terminal.create(this.id);
    } else if (this.type === 'ssh') {
      if (!this.config.password && !this.config.privateKey) {
        await this.promptForPassword();
      } else {
        await this.connectSSH();
      }
    }
  }
  
  async promptForPassword() {
    this.terminal.write(`\r\n\x1b[36m${this.config.username}@${this.config.host}'s password: \x1b[0m`);
    
    let password = '';
    this.awaitingPassword = true;
    this.pastedPassword = '';
    
    return new Promise((resolve) => {
      const disposable = this.terminal.onData((data) => {
        if (!this.awaitingPassword) return;
        
        if (this.pastedPassword) {
          password += this.pastedPassword;
          this.pastedPassword = '';
        }
        
        const char = data;
        
        if (char === '\r' || char === '\n') {
          if (this.pastedPassword) {
            password += this.pastedPassword;
            this.pastedPassword = '';
          }
          this.terminal.write('\r\n');
          this.config.password = password;
          this.awaitingPassword = false;
          disposable.dispose();
          this.connectSSH().then(resolve);
          return;
        }
        
        if (char === '\x7f' || char === '\b') {
          if (password.length > 0) {
            password = password.slice(0, -1);
          }
          return;
        }
        
        if (char === '\x03') {
          this.terminal.write('\r\n\x1b[33mCancelled\x1b[0m\r\n');
          this.awaitingPassword = false;
          disposable.dispose();
          resolve();
          return;
        }
        
        if (char.length === 1 && char.charCodeAt(0) >= 32) {
          password += char;
        }
      });
    });
  }
  
  async connectSSH() {
    this.terminal.write(`\x1b[36mConnecting to ${this.config.host}...\x1b[0m\r\n`);
    this.showProgress();
    
    try {
      await window.polar.ssh.connect(this.id, this.config);
      this.hideProgress();
      this.terminal.write(`\x1b[32m✓ Connected successfully\x1b[0m\r\n\r\n`);
    } catch (error) {
      this.hideProgress();
      const errorMsg = this.formatSSHError(error);
      this.terminal.write(`\r\n\x1b[31m✗ ${errorMsg}\x1b[0m\r\n`);
      
      const isAuthError = error.message?.includes('authentication') || 
                          error.message?.includes('USERAUTH') ||
                          error.message?.includes('All configured');
      
      if (isAuthError) {
        this.terminal.write(`\r\n\x1b[90mPress any key to try again...\x1b[0m\r\n`);
        await this.waitForKeyPress();
        this.config.password = null;
        await this.promptForPassword();
      } else {
        this.terminal.write(`\r\n\x1b[90mPress any key to retry connection...\x1b[0m\r\n`);
        await this.waitForKeyPress();
        await this.connectSSH();
      }
    }
  }
  
  waitForKeyPress() {
    return new Promise((resolve) => {
      const disposable = this.terminal.onData(() => {
        disposable.dispose();
        resolve();
      });
    });
  }

  formatSSHError(error) {
    const msg = error.message || error.toString();
    
    if (msg.includes('USERAUTH') || msg.includes('authentication')) {
      return 'Authentication failed. Check your username and password.';
    }
    if (msg.includes('ECONNREFUSED')) {
      return `Connection refused. Is SSH running on ${this.config.host}:${this.config.port || 22}?`;
    }
    if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
      return `Connection timed out. Check the host address and network.`;
    }
    if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      return `Host not found: ${this.config.host}`;
    }
    if (msg.includes('EHOSTUNREACH')) {
      return 'Host unreachable. Check your network connection.';
    }
    
    return `Connection failed: ${msg}`;
  }

  showProgress() {
    const progressHtml = `
      <div class="loading-overlay active" id="progress-${this.id}">
        <div style="width: 300px;">
          <div class="progress-container">
            <div class="progress-bar delayed" id="progress-bar-${this.id}"></div>
          </div>
          <div class="progress-text">Establishing secure connection...</div>
        </div>
      </div>
    `;
    this.element.insertAdjacentHTML('beforeend', progressHtml);
    
    setTimeout(() => {
      const bar = document.getElementById(`progress-bar-${this.id}`);
      if (bar) bar.classList.add('complete');
    }, 1500);
  }

  hideProgress() {
    const overlay = document.getElementById(`progress-${this.id}`);
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 200);
    }
  }

  activate() {
    this.element.classList.add('active');
    this.terminal.focus();
    this.fitAddon.fit();
  }

  deactivate() {
    this.element.classList.remove('active');
  }

  destroy() {
    if (this.type === 'local') {
      window.polar.terminal.close(this.id);
    } else if (this.type === 'ssh') {
      window.polar.ssh.disconnect(this.id);
    }
    this.terminal.dispose();
    this.element.remove();
  }
}

function createSession(type = 'local', config = null) {
  const id = sessionCounter++;
  const session = new Session(id, type, config);
  sessions.set(id, session);
  State.sessions.set(id, session);
  
  if (type === 'ssh' && config) {
    Features.trackConnection(config);
  }
  
  const settingsContent = document.getElementById('settings-content');
  const serversContent = document.getElementById('servers-content');
  const dashboardContent = document.getElementById('dashboard-content');
  if (settingsContent) settingsContent.style.display = 'none';
  if (serversContent) serversContent.style.display = 'none';
  if (dashboardContent) dashboardContent.style.display = 'none';
  
  document.getElementById('terminal-container').appendChild(session.element);
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('tabs-container').style.display = 'flex';
  
  addSessionToSidebar(session);
  addTab(session);
  session.start();
  switchToSession(id);
  
  // Refresh Quick Connect to show active session indicator
  populateQuickConnect();
}

function addSessionToSidebar(session) {
  // Sessions are now displayed only in the tabs bar at the top
  // Quick Connect section shows saved servers instead
}

function addTab(session) {
  const container = document.getElementById('tabs-container');
  
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.id = `tab-${session.id}`;
  tab.draggable = true;
  tab.dataset.sessionId = session.id;
  tab.innerHTML = `
    <span class="tab-name">${session.name}</span>
    <button class="tab-close">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    </button>
  `;
  
  tab.addEventListener('dragstart', (e) => {
    tab.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', session.id);
  });
  
  tab.addEventListener('dragend', () => {
    tab.classList.remove('dragging');
    document.querySelectorAll('.tab.drag-over').forEach(t => t.classList.remove('drag-over'));
  });
  
  tab.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = container.querySelector('.dragging');
    if (dragging && dragging !== tab) {
      tab.classList.add('drag-over');
      const rect = tab.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (e.clientX < midX) {
        container.insertBefore(dragging, tab);
      } else {
        container.insertBefore(dragging, tab.nextSibling);
      }
    }
  });
  
  tab.addEventListener('dragleave', () => {
    tab.classList.remove('drag-over');
  });
  
  tab.addEventListener('drop', (e) => {
    e.preventDefault();
    tab.classList.remove('drag-over');
  });
  
  tab.addEventListener('click', (e) => {
    if (!e.target.closest('.tab-close')) {
      switchToSession(session.id);
    }
  });
  
  tab.addEventListener('contextmenu', (e) => {
    showContextMenu(e, session.id);
  });
  
  let closeClickPending = false;
  let closeClickTimeout = null;
  
  tab.querySelector('.tab-close').addEventListener('click', (e) => {
    e.stopPropagation();
    
    if (closeClickPending) {
      // Second click - close the session
      clearTimeout(closeClickTimeout);
      closeClickPending = false;
      closeSession(session.id, true); // skip confirm
    } else {
      // First click - change tab name to hint
      closeClickPending = true;
      const tabName = tab.querySelector('.tab-name');
      const closeBtn = tab.querySelector('.tab-close');
      const originalName = tabName.textContent;
      tabName.textContent = 'Close?';
      tabName.style.color = 'var(--red)';
      closeBtn.style.background = 'var(--red)';
      closeBtn.style.color = 'white';
      
      closeClickTimeout = setTimeout(() => {
        closeClickPending = false;
        tabName.textContent = originalName;
        tabName.style.color = '';
        closeBtn.style.background = '';
        closeBtn.style.color = '';
      }, 2000);
    }
  });
  
  container.appendChild(tab);
}

function switchToSession(id) {
  if (activeSessionId === id) return;
  
  // Hide all terminal wrappers first
  sessions.forEach((s, sessionId) => {
    s.element.style.display = 'none';
  });
  
  if (activeSessionId !== null) {
    const prevSession = sessions.get(activeSessionId);
    if (prevSession) {
      prevSession.deactivate();
      document.getElementById(`session-${activeSessionId}`)?.classList.remove('active');
      document.getElementById(`tab-${activeSessionId}`)?.classList.remove('active');
    }
  }
  
  activeSessionId = id;
  State.activeSessionId = id;
  const session = sessions.get(id);
  if (session) {
    session.element.style.display = 'block';
    session.activate();
    document.getElementById(`session-${id}`)?.classList.add('active');
    document.getElementById(`tab-${id}`)?.classList.add('active');
  }
}

async function closeSession(id, skipConfirm = false) {
  const session = sessions.get(id);
  if (!session) return;
  
  if (!skipConfirm && appSettings.confirmOnClose !== false) {
    const confirmed = await showConfirmModal({
      title: 'Close Terminal',
      message: `Are you sure you want to close "${session.name}"?`,
      confirmText: 'Close',
      cancelText: 'Cancel',
      type: 'warning'
    });
    if (!confirmed) return;
  }
  
  Features.cleanupSession(id);
  
  session.destroy();
  sessions.delete(id);
  State.sessions.delete(id);
  document.getElementById(`session-${id}`)?.remove();
  document.getElementById(`tab-${id}`)?.remove();
  
  // Refresh Quick Connect to update active session indicators
  populateQuickConnect();
  
  if (activeSessionId === id) {
    activeSessionId = null;
    
    if (sessions.size > 0) {
      const nextId = Array.from(sessions.keys())[0];
      switchToSession(nextId);
    } else {
      document.getElementById('welcome-screen').style.display = 'flex';
    }
  }
}

document.getElementById('minimize-btn').addEventListener('click', () => {
  window.polar.window.minimize();
});

document.getElementById('maximize-btn').addEventListener('click', () => {
  window.polar.window.maximize();
});

document.getElementById('close-btn').addEventListener('click', () => {
  window.polar.window.close();
});

document.getElementById('new-session-btn').addEventListener('click', () => {
  document.getElementById('ssh-modal').classList.add('active');
  document.getElementById('ssh-host')?.focus();
});

document.getElementById('welcome-new-session').addEventListener('click', () => {
  switchView('sessions');
  createSession('local');
});

let currentView = 'dashboard';

function showConfirmModal(options) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    const iconEl = document.getElementById('confirm-modal-icon');
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    
    titleEl.textContent = options.title || 'Confirm Action';
    messageEl.textContent = options.message || 'Are you sure you want to proceed?';
    okBtn.textContent = options.confirmText || 'Confirm';
    cancelBtn.textContent = options.cancelText || 'Cancel';
    
    iconEl.className = 'confirm-modal-icon';
    if (options.type === 'warning') {
      iconEl.classList.add('warning');
    } else if (options.type === 'info') {
      iconEl.classList.add('info');
    }
    
    okBtn.className = options.danger ? 'btn-danger' : 'btn-primary';
    
    modal.style.display = 'flex';
    
    const handleConfirm = () => {
      modal.style.display = 'none';
      cleanup();
      resolve(true);
    };
    
    const handleCancel = () => {
      modal.style.display = 'none';
      cleanup();
      resolve(false);
    };
    
    const cleanup = () => {
      okBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
    };
    
    okBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
  });
}

function hideAllContent() {
  const welcomeScreen = document.getElementById('welcome-screen');
  const serversLoading = document.getElementById('servers-loading');
  const serversContent = document.getElementById('servers-content');
  const settingsContent = document.getElementById('settings-content');
  const dashboardContent = document.getElementById('dashboard-content');
  const terminalContainer = document.getElementById('terminal-container');
  const tabsContainer = document.getElementById('tabs-container');
  
  welcomeScreen.style.display = 'none';
  if (serversLoading) serversLoading.style.display = 'none';
  if (serversContent) serversContent.style.display = 'none';
  if (settingsContent) settingsContent.style.display = 'none';
  if (dashboardContent) dashboardContent.style.display = 'none';
  tabsContainer.style.display = 'none';
  
  terminalContainer.querySelectorAll('.terminal-wrapper').forEach(t => t.style.display = 'none');
}

function switchView(view) {
  currentView = view;
  
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });
  
  hideAllContent();
  
  const tabsContainer = document.getElementById('tabs-container');
  const welcomeScreen = document.getElementById('welcome-screen');
  
  if (view === 'dashboard') {
    showDashboardContent();
  } else if (view === 'sessions') {
    tabsContainer.style.display = 'flex';
    if (sessions.size === 0) {
      welcomeScreen.style.display = 'flex';
    } else {
      if (activeSessionId === null) {
        const firstId = Array.from(sessions.keys())[0];
        switchToSession(firstId);
      } else {
        sessions.forEach(s => s.element.style.display = activeSessionId === s.id ? 'block' : 'none');
      }
    }
  } else if (view === 'servers') {
    showServersContent();
  } else if (view === 'settings') {
    showSettingsContent();
  }
}

async function showDashboardContent() {
  const terminalContainer = document.getElementById('terminal-container');
  let dashboardContent = document.getElementById('dashboard-content');
  
  let stats = { totalServers: 0, onlineServers: 0, offlineServers: 0, unknownServers: 0, avgPing: 0, totalConnections: 0 };
  try {
    stats = await window.polar.db.getDashboardStats();
  } catch (e) {
    console.error('[PolarOps/Dashboard] Failed to get stats:', e);
  }
  
  if (!dashboardContent) {
    dashboardContent = document.createElement('div');
    dashboardContent.id = 'dashboard-content';
    dashboardContent.className = 'dashboard-container';
    terminalContainer.appendChild(dashboardContent);
  }
  
  const formatTime = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };
  
  dashboardContent.innerHTML = `
    <div class="dashboard-header">
      <h2 class="dashboard-title">Dashboard</h2>
      <p class="dashboard-subtitle">Welcome back! Here's an overview of your servers.</p>
    </div>
    
    <div class="dashboard-grid">
      <div class="stat-card">
        <div class="stat-icon servers">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"/>
          </svg>
        </div>
        <div class="stat-value">${stats.totalServers}</div>
        <div class="stat-label">Total Servers</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon online">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div class="stat-value">${stats.onlineServers}</div>
        <div class="stat-label">Online</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon offline">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div class="stat-value">${stats.offlineServers}</div>
        <div class="stat-label">Offline</div>
      </div>
      
      ${stats.unknownServers > 0 ? `
      <div class="stat-card">
        <div class="stat-icon unknown">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div class="stat-value">${stats.unknownServers}</div>
        <div class="stat-label">Not Pinged</div>
      </div>
      ` : ''}
    </div>
    
    <div class="dashboard-section">
      <div class="section-header">
        <h3 class="section-title">Quick Actions</h3>
      </div>
      <div class="quick-actions-grid">
        <button class="quick-action-btn" id="dash-new-terminal">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          <span>New Terminal</span>
        </button>
        <button class="quick-action-btn" id="dash-add-server">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          <span>Add Server</span>
        </button>
        <button class="quick-action-btn" id="dash-ping-all">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          <span>Ping All</span>
        </button>
        <button class="quick-action-btn" id="dash-view-servers">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"/>
          </svg>
          <span>View Servers</span>
        </button>
      </div>
    </div>
    
    <div class="dashboard-section">
      <div class="section-header">
        <h3 class="section-title">Recent Activity</h3>
      </div>
      <div class="activity-list" id="activity-list">
        ${stats.recentPings && stats.recentPings.length > 0 ? stats.recentPings.slice(0, 5).map(ping => `
          <div class="activity-item">
            <div class="activity-dot ${ping.status === 'online' ? 'success' : ping.status === 'timeout' ? 'info' : 'error'}"></div>
            <span class="activity-text">${ping.serverName || 'Server'} - ${ping.status === 'online' && ping.pingMs ? ping.pingMs + 'ms' : ping.status || 'unknown'}</span>
            <span class="activity-time">${formatTime(ping.timestamp)}</span>
          </div>
        `).join('') : `
          <div class="activity-item">
            <div class="activity-dot info"></div>
            <span class="activity-text">No recent activity</span>
            <span class="activity-time">-</span>
          </div>
        `}
      </div>
    </div>
  `;
  
  document.getElementById('dash-new-terminal')?.addEventListener('click', () => {
    switchView('sessions');
    createSession('local');
  });
  
  document.getElementById('dash-add-server')?.addEventListener('click', () => {
    document.getElementById('ssh-modal').classList.add('active');
  });
  
  document.getElementById('dash-ping-all')?.addEventListener('click', async () => {
    const btn = document.getElementById('dash-ping-all');
    btn.disabled = true;
    btn.innerHTML = `<svg class="spinning" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width: 24px; height: 24px;"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg><span>Pinging...</span>`;
    try {
      await window.polar.server.pingAll();
      await showDashboardContent();
    } catch (e) {
      console.error('[PolarOps/Ping] Failed to ping all:', e);
    }
    btn.disabled = false;
    btn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg><span>Ping All</span>`;
  });
  
  document.getElementById('dash-view-servers')?.addEventListener('click', () => {
    switchView('servers');
  });
  
  dashboardContent.style.display = 'block';
}

async function showServersContent() {
  const terminalContainer = document.getElementById('terminal-container');
  let serversContent = document.getElementById('servers-content');
  
  savedServers = await window.polar.db.getServers();
  
  if (!serversContent) {
    serversContent = document.createElement('div');
    serversContent.id = 'servers-content';
    serversContent.className = 'settings-content';
    terminalContainer.appendChild(serversContent);
  }
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'var(--green)';
      case 'offline': case 'refused': return 'var(--red)';
      case 'timeout': return 'var(--yellow)';
      default: return 'var(--text-muted)';
    }
  };
  
  const getStatusText = (server) => {
    if (!server.last_ping_status || server.last_ping_status === 'unknown') {
      return 'Not checked';
    }
    if (server.last_ping_status === 'online' && server.last_ping_ms) {
      return `${server.last_ping_ms}ms`;
    }
    return server.last_ping_status.charAt(0).toUpperCase() + server.last_ping_status.slice(1);
  };
  
  const formatLastConnected = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };
  
  serversContent.innerHTML = `
    <div class="settings-header">
      <h2 class="settings-title">SSH Servers</h2>
      <div style="display: flex; gap: 8px; align-items: center;">
        <div class="search-box" style="position: relative;">
          <svg style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; color: var(--text-muted);" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input type="text" id="servers-search" class="form-input" placeholder="Search servers..." style="padding-left: 32px; width: 200px;">
        </div>
        <button id="ping-all-btn" class="btn-secondary" style="padding: 8px 16px;">
          <svg class="btn-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width: 14px; height: 14px;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
          </svg>
          Ping All
        </button>
        <button class="btn-primary" onclick="document.getElementById('ssh-modal').classList.add('active')">
          <svg class="btn-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path>
          </svg>
          Add Server
        </button>
      </div>
    </div>
    <div class="servers-grid" id="servers-grid">
      ${savedServers.length === 0 ? `
        <div class="empty-state">
          <img src="../../assets/img/polar bear removed bg [256x256].png" alt="" style="width: 64px; opacity: 0.2;">
          <h3 style="color: var(--text-subtle); font-size: 14px; margin-top: 16px;">No servers configured</h3>
          <p style="color: var(--text-muted); font-size: 12px; margin-top: 8px;">Add an SSH server to get started</p>
        </div>
      ` : savedServers.map(server => {
        const activeSession = getActiveSessionForServer(server);
        const isActive = activeSession !== null;
        const dotColor = isActive ? 'var(--green)' : 'var(--text-muted)';
        const dotGlow = isActive ? 'box-shadow: 0 0 6px var(--green);' : '';
        const colorBar = server.color ? `<div style="position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: ${server.color}; border-radius: 8px 0 0 8px;"></div>` : '';
        
        return `
        <div class="server-card" data-server-id="${server.id}" data-server-name="${server.name.toLowerCase()}" data-server-host="${server.host.toLowerCase()}" style="position: relative; overflow: hidden;">
          ${colorBar}
          <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="activity-dot" data-status="${isActive ? 'active' : 'inactive'}" title="${isActive ? 'Active session' : 'No active session'}${server.last_ping_ms ? ' | Last ping: ' + server.last_ping_ms + 'ms' : ''}" style="background: ${dotColor}; ${dotGlow}"></div>
              <h3 style="font-size: 14px; font-weight: 600; color: var(--text);">${server.name}</h3>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <button class="ping-server-btn" data-server-id="${server.id}" data-host="${server.host}" data-port="${server.port}" style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: var(--text-muted); cursor: pointer; border-radius: 4px; transition: all 120ms ease;" title="Ping server">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                </svg>
              </button>
              <button class="edit-server-btn" data-server-id="${server.id}" style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: var(--text-muted); cursor: pointer; border-radius: 4px; transition: all 120ms ease;" title="Edit server">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
              </button>
              <button class="delete-server-btn" data-server-id="${server.id}" style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: var(--text-muted); cursor: pointer; border-radius: 4px; transition: all 120ms ease;" title="Delete server">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </button>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color: var(--text-muted);">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path>
              </svg>
              <span style="font-size: 12px; color: var(--text-subtle);">${server.host}:${server.port}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color: var(--text-muted);">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
              </svg>
              <span style="font-size: 12px; color: var(--text-subtle);">${server.username}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color: var(--text-muted);">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
              </svg>
              <span class="ping-status" data-server-id="${server.id}" style="font-size: 12px; color: ${getStatusColor(server.last_ping_status)};">${getStatusText(server)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color: var(--text-muted);">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span style="font-size: 12px; color: var(--text-muted);">Last: ${formatLastConnected(server.last_connected)}</span>
            </div>
            ${isActive ? `
            <div style="display: flex; align-items: center; gap: 8px;">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color: var(--green);">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
              </svg>
              <span style="font-size: 12px; color: var(--green);">Session active</span>
            </div>
            ` : ''}
          </div>
          <button class="connect-server-btn" data-server-id="${server.id}" style="width: 100%; padding: 8px; background: linear-gradient(135deg, rgba(0, 217, 255, 0.15), rgba(63, 185, 80, 0.15)); border: 1px solid rgba(0, 217, 255, 0.3); border-radius: 6px; color: var(--accent); font-size: 12px; font-weight: 600; cursor: pointer; transition: all 150ms ease;">
            ${isActive ? 'New Session' : 'Connect'}
          </button>
        </div>
      `}).join('')}
    </div>
  `;
  
  document.getElementById('ping-all-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('ping-all-btn');
    btn.disabled = true;
    btn.innerHTML = `<svg class="btn-icon spinning" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Pinging...`;
    
    try {
      const results = await window.polar.server.pingAll();
      savedServers = await window.polar.db.getServers();
      populateQuickConnect();
      await showServersContent();
    } catch (e) {
      console.error('[PolarOps/Ping] Failed to ping all:', e);
      btn.disabled = false;
      btn.innerHTML = `<svg class="btn-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Ping All`;
    }
  });
  
  serversContent.querySelectorAll('.ping-server-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const serverId = parseInt(btn.dataset.serverId);
      const host = btn.dataset.host;
      const port = parseInt(btn.dataset.port);
      
      btn.style.color = 'var(--accent)';
      btn.innerHTML = `<svg class="spinning" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>`;
      
      try {
        const result = await window.polar.server.ping(serverId, host, port);
        const statusEl = document.querySelector(`.ping-status[data-server-id="${serverId}"]`);
        const dotEl = btn.closest('.server-card').querySelector('.activity-dot');
        
        if (statusEl) {
          if (result.status === 'online') {
            statusEl.textContent = `${result.pingMs}ms`;
            statusEl.style.color = 'var(--green)';
          } else {
            statusEl.textContent = result.status.charAt(0).toUpperCase() + result.status.slice(1);
            statusEl.style.color = result.status === 'timeout' ? 'var(--yellow)' : 'var(--red)';
          }
        }
        
        if (dotEl) {
          dotEl.style.background = result.status === 'online' ? 'var(--green)' : 
                                   result.status === 'timeout' ? 'var(--yellow)' : 'var(--red)';
        }
        
        // Update quick connect sidebar status
        savedServers = await window.polar.db.getServers();
        populateQuickConnect();
      } catch (e) {
        console.error('[PolarOps/Ping] Failed:', e);
      }
      
      btn.style.color = 'var(--text-muted)';
      btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`;
    });
    
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(0, 217, 255, 0.15)';
      btn.style.color = 'var(--accent)';
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text-muted)';
    });
  });
  
  serversContent.querySelectorAll('.connect-server-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const serverId = parseInt(btn.dataset.serverId);
      const server = savedServers.find(s => s.id === serverId);
      if (server) {
        await window.polar.db.updateServerLastConnected(serverId);
        await window.polar.db.incrementConnectionCount();
        switchView('sessions');
        createSession('ssh', {
          name: server.name,
          host: server.host,
          port: server.port,
          username: server.username,
          password: server.password
        });
      }
    });
  });
  
  serversContent.querySelectorAll('.delete-server-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const serverId = parseInt(btn.dataset.serverId);
      const server = savedServers.find(s => s.id === serverId);
      const confirmed = await showConfirmModal({
        title: 'Delete Server',
        message: `Are you sure you want to delete "${server?.name || 'this server'}"? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true
      });
      if (confirmed) {
        await deleteServer(serverId);
        await showServersContent();
      }
    });
    
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(255, 123, 114, 0.15)';
      btn.style.color = 'var(--red)';
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text-muted)';
    });
  });
  
  serversContent.querySelectorAll('.edit-server-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const serverId = parseInt(btn.dataset.serverId);
      const server = savedServers.find(s => s.id === serverId);
      if (server) {
        document.getElementById('edit-server-id').value = server.id;
        document.getElementById('edit-server-name').value = server.name || '';
        document.getElementById('edit-server-host').value = server.host || '';
        document.getElementById('edit-server-port').value = server.port || 22;
        document.getElementById('edit-server-username').value = server.username || '';
        document.getElementById('edit-server-password').value = '';
        document.getElementById('edit-server-type').value = server.type || 'ssh';
        document.getElementById('edit-server-modal').style.display = 'flex';
      }
    });
    
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(0, 217, 255, 0.15)';
      btn.style.color = 'var(--accent)';
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text-muted)';
    });
  });
  
  // Add right-click context menu for server cards
  serversContent.querySelectorAll('.server-card').forEach(card => {
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const serverId = parseInt(card.dataset.serverId);
      const server = savedServers.find(s => s.id === serverId);
      if (server) {
        const activeSession = getActiveSessionForServer(server);
        showServerContextMenu(e, server, activeSession);
      }
    });
  });
  
  serversContent.querySelectorAll('.connect-server-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'linear-gradient(135deg, rgba(0, 217, 255, 0.25), rgba(63, 185, 80, 0.25))';
      btn.style.transform = 'translateY(-1px)';
      btn.style.boxShadow = '0 4px 12px rgba(0, 217, 255, 0.3)';
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'linear-gradient(135deg, rgba(0, 217, 255, 0.15), rgba(63, 185, 80, 0.15))';
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = 'none';
    });
  });
  
  document.getElementById('servers-search')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const cards = document.querySelectorAll('.server-card');
    cards.forEach(card => {
      const name = card.dataset.serverName || '';
      const host = card.dataset.serverHost || '';
      const matches = name.includes(query) || host.includes(query);
      card.style.display = matches ? 'block' : 'none';
    });
  });
  
  serversContent.style.display = 'block';
}

async function showSettingsContent() {
  const terminalContainer = document.getElementById('terminal-container');
  let settingsContent = document.getElementById('settings-content');
  
  const settings = appSettings;
  let dbInfo = { path: 'Loading...', size: '0 KB', servers: 0, pingRecords: 0 };
  try {
    dbInfo = await window.polar.db.getInfo();
  } catch (e) {
    console.error('[PolarOps/Settings] Failed to get DB info:', e);
  }
  
  const themeOptions = [
    { value: 'polar-dark', label: 'Polar Dark (Default)' },
    { value: 'ocean', label: 'Ocean' },
    { value: 'midnight', label: 'Midnight Purple' },
    { value: 'rose', label: 'Rose' },
    { value: 'arctic', label: 'Arctic (Light)' },
    { value: 'monokai', label: 'Monokai' },
    { value: 'dracula', label: 'Dracula' }
  ];
  
  const currentTheme = settings.theme || 'polar-dark';
  const currentFontSize = settings.fontSize || '13';
  const currentCursor = settings.cursorStyle || 'block';
  const currentScrollback = settings.scrollbackLines || '10000';
  const currentKeepAlive = settings.keepAliveInterval || '30';
  
  const copyOnSelect = settings.copyOnSelect !== false;
  const rightClickPaste = settings.rightClickPaste !== false;
  const ctrlCCopy = settings.ctrlCCopy !== false;
  const ctrlVPaste = settings.ctrlVPaste !== false;
  const clearSelectionOnCopy = settings.clearSelectionOnCopy !== false;
  const scrollOnOutput = settings.scrollOnOutput !== false;
  const scrollOnKeystroke = settings.scrollOnKeystroke !== false;
  const cursorBlink = settings.cursorBlink !== false;
  const wordWrap = settings.wordWrap !== false;
  const bellSound = settings.bellSound || false;
  const confirmOnClose = settings.confirmOnClose !== false;
  const openLinksOnClick = settings.openLinksOnClick !== false;
  
  if (!settingsContent) {
    settingsContent = document.createElement('div');
    settingsContent.id = 'settings-content';
    settingsContent.className = 'settings-content';
    terminalContainer.appendChild(settingsContent);
  }
  
  settingsContent.innerHTML = `
    <div class="settings-header">
      <h2 class="settings-title">Settings</h2>
      <div class="search-box" style="position: relative;">
        <svg style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; color: var(--text-muted);" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input type="text" id="settings-search" class="form-input" placeholder="Search settings..." style="padding-left: 32px; width: 220px;">
      </div>
    </div>
    
    <div class="settings-tabs">
      <button class="settings-tab active" data-tab="appearance">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/>
        </svg>
        Appearance
      </button>
      <button class="settings-tab" data-tab="terminal">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        Terminal
      </button>
      <button class="settings-tab" data-tab="connection">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
        </svg>
        Connection
      </button>
      <button class="settings-tab" data-tab="data">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
        </svg>
        Data
      </button>
      <button class="settings-tab" data-tab="about">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        About
      </button>
    </div>
    
    <div class="settings-panels">
      <!-- Appearance Panel -->
      <div class="settings-panel active" data-panel="appearance">
        <div class="setting-group">
          <h3 class="setting-group-title">UI Theme</h3>
          <div class="setting-item" data-search="theme color appearance dark light ui interface">
            <div class="setting-info">
              <label class="setting-label">Interface Theme</label>
              <p class="setting-desc">Color scheme for the application interface</p>
            </div>
            <select id="theme-select" class="form-input" style="width: 200px;">
              ${themeOptions.map(t => `<option value="${t.value}" ${t.value === currentTheme ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">Font</h3>
          <div class="setting-item" data-search="font size text terminal">
            <div class="setting-info">
              <label class="setting-label">Font Size</label>
              <p class="setting-desc">Terminal text size in pixels</p>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="number" id="font-size-input" class="form-input" value="${currentFontSize}" min="10" max="24" style="width: 80px;">
              <button id="font-size-reset" class="btn-secondary" style="padding: 8px 12px; font-size: 11px;">Reset</button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Terminal Panel -->
      <div class="settings-panel" data-panel="terminal">
        <div class="setting-group">
          <h3 class="setting-group-title">Terminal Theme</h3>
          <div class="setting-item" data-search="terminal theme color scheme console">
            <div class="setting-info">
              <label class="setting-label">Terminal Colors</label>
              <p class="setting-desc">Color scheme for the terminal emulator</p>
            </div>
            <select id="terminal-theme-select" class="form-input" style="width: 200px;">
              ${themeOptions.map(t => `<option value="${t.value}" ${t.value === (settings.terminalTheme || currentTheme) ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">Shell</h3>
          <div class="setting-item" data-search="shell powershell cmd wsl bash terminal">
            <div class="setting-info">
              <label class="setting-label">Default Shell</label>
              <p class="setting-desc">Shell to use for local terminals</p>
            </div>
            <select id="shell-select" class="form-input" style="width: 200px;">
              <option value="powershell" ${settings.shell === 'powershell' ? 'selected' : ''}>PowerShell</option>
              <option value="cmd" ${settings.shell === 'cmd' ? 'selected' : ''}>CMD</option>
              <option value="wsl" ${settings.shell === 'wsl' ? 'selected' : ''}>WSL</option>
            </select>
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">Cursor</h3>
          <div class="setting-item" data-search="cursor style block underline bar">
            <div class="setting-info">
              <label class="setting-label">Cursor Style</label>
              <p class="setting-desc">Terminal cursor appearance</p>
            </div>
            <select id="cursor-select" class="form-input" style="width: 200px;">
              <option value="block" ${currentCursor === 'block' ? 'selected' : ''}>Block</option>
              <option value="underline" ${currentCursor === 'underline' ? 'selected' : ''}>Underline</option>
              <option value="bar" ${currentCursor === 'bar' ? 'selected' : ''}>Bar</option>
            </select>
          </div>
          <div class="setting-item" data-search="cursor blink blinking animation">
            <div class="setting-info">
              <label class="setting-label">Cursor Blink</label>
              <p class="setting-desc">Animate the terminal cursor</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="cursor-blink" ${cursorBlink ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">Copy &amp; Paste</h3>
          <div class="setting-item" data-search="copy select selection automatic clipboard">
            <div class="setting-info">
              <label class="setting-label">Copy on Select</label>
              <p class="setting-desc">Automatically copy text when selected</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="copy-on-select" ${copyOnSelect ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="setting-item" data-search="clear selection copy deselect">
            <div class="setting-info">
              <label class="setting-label">Clear Selection on Copy</label>
              <p class="setting-desc">Clear text selection after copying</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="clear-selection-copy" ${clearSelectionOnCopy ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="setting-item" data-search="ctrl c copy keyboard shortcut">
            <div class="setting-info">
              <label class="setting-label">Ctrl+C to Copy</label>
              <p class="setting-desc">Use Ctrl+C to copy selected text (when text is selected)</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="ctrl-c-copy" ${ctrlCCopy ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="setting-item" data-search="ctrl v paste keyboard shortcut">
            <div class="setting-info">
              <label class="setting-label">Ctrl+V to Paste</label>
              <p class="setting-desc">Use Ctrl+V to paste from clipboard</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="ctrl-v-paste" ${ctrlVPaste ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="setting-item" data-search="right click paste mouse context menu">
            <div class="setting-info">
              <label class="setting-label">Right-Click to Paste</label>
              <p class="setting-desc">Paste from clipboard on right-click</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="right-click-paste" ${rightClickPaste ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">Scrolling</h3>
          <div class="setting-item" data-search="scroll output auto automatic">
            <div class="setting-info">
              <label class="setting-label">Scroll on Output</label>
              <p class="setting-desc">Scroll to bottom when new output appears</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="scroll-on-output" ${scrollOnOutput ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="setting-item" data-search="scroll keystroke typing input">
            <div class="setting-info">
              <label class="setting-label">Scroll on Keystroke</label>
              <p class="setting-desc">Scroll to bottom when typing</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="scroll-on-keystroke" ${scrollOnKeystroke ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">Buffer</h3>
          <div class="setting-item" data-search="scrollback buffer lines history">
            <div class="setting-info">
              <label class="setting-label">Scrollback Lines</label>
              <p class="setting-desc">Maximum lines kept in terminal history</p>
            </div>
            <input type="number" id="scrollback-input" class="form-input" value="${currentScrollback}" min="1000" max="100000" style="width: 120px;">
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">Behavior</h3>
          <div class="setting-item" data-search="word wrap text overflow">
            <div class="setting-info">
              <label class="setting-label">Word Wrap</label>
              <p class="setting-desc">Wrap long lines to fit terminal width</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="word-wrap" ${wordWrap ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="setting-item" data-search="bell sound audio beep alert">
            <div class="setting-info">
              <label class="setting-label">Bell Sound</label>
              <p class="setting-desc">Play sound on terminal bell character</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="bell-sound" ${bellSound ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="setting-item" data-search="links url click open browser hyperlink">
            <div class="setting-info">
              <label class="setting-label">Open Links on Click</label>
              <p class="setting-desc">Open URLs in browser when clicked</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="open-links-click" ${openLinksOnClick ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="setting-item" data-search="confirm close exit prompt warning">
            <div class="setting-info">
              <label class="setting-label">Confirm on Close</label>
              <p class="setting-desc">Ask for confirmation before closing terminals</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="confirm-on-close" ${confirmOnClose ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>
      
      <!-- Connection Panel -->
      <div class="settings-panel" data-panel="connection">
        <div class="setting-group">
          <h3 class="setting-group-title">SSH Settings</h3>
          <div class="setting-item" data-search="keep alive interval ssh connection timeout">
            <div class="setting-info">
              <label class="setting-label">Keep Alive Interval</label>
              <p class="setting-desc">Seconds between keep-alive packets (0 to disable)</p>
            </div>
            <input type="number" id="keepalive-input" class="form-input" value="${currentKeepAlive}" min="0" max="300" style="width: 100px;">
          </div>
          <div class="setting-item" data-search="auto reconnect ssh disconnect">
            <div class="setting-info">
              <label class="setting-label">Auto Reconnect</label>
              <p class="setting-desc">Automatically reconnect on connection loss</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="auto-reconnect" ${settings.autoReconnect ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>
      
      <!-- Data Panel -->
      <div class="settings-panel" data-panel="data">
        <div class="setting-group">
          <h3 class="setting-group-title">Storage</h3>
          <div class="setting-item" data-search="database location path storage">
            <div class="setting-info">
              <label class="setting-label">Database Location</label>
              <p class="setting-desc" style="word-break: break-all; max-width: 400px; font-family: monospace; font-size: 11px;">${dbInfo.path}</p>
            </div>
            <button id="open-db-folder" class="btn-secondary" style="padding: 8px 16px; font-size: 11px; display: flex; align-items: center; gap: 6px;">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"/>
              </svg>
              Open Folder
            </button>
          </div>
          <div class="setting-item" data-search="database size storage space">
            <div class="setting-info">
              <label class="setting-label">Database Size</label>
              <p class="setting-desc">${dbInfo.size}</p>
            </div>
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">Statistics</h3>
          <div class="setting-item" data-search="servers saved count">
            <div class="setting-info">
              <label class="setting-label">Saved Servers</label>
              <p class="setting-desc">${dbInfo.servers} server(s) configured</p>
            </div>
          </div>
          <div class="setting-item" data-search="ping history records clear">
            <div class="setting-info">
              <label class="setting-label">Ping History</label>
              <p class="setting-desc">${dbInfo.pingRecords} record(s) stored</p>
            </div>
            <button id="clear-ping-history" class="btn-secondary" style="padding: 8px 16px; font-size: 11px;">Clear History</button>
          </div>
        </div>
      </div>
      
      <!-- About Panel -->
      <div class="settings-panel" data-panel="about">
        <div class="setting-group">
          <h3 class="setting-group-title">Application</h3>
          <div class="setting-item" data-search="version app polarops">
            <div class="setting-info">
              <label class="setting-label">PolarOps</label>
              <p class="setting-desc">Version 1.0.0 · Build 2026.02.04</p>
            </div>
          </div>
          <div class="setting-item" data-search="developer author creator contact">
            <div class="setting-info">
              <label class="setting-label">Developer</label>
              <p class="setting-desc">pov (YourPOV)</p>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary" id="open-telegram" title="Telegram">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              </button>
              <button class="btn btn-secondary" id="open-dev-github" title="GitHub">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              </button>
              <button class="btn btn-secondary" id="open-instagram" title="Instagram">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.162c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              </button>
            </div>
          </div>
          <div class="setting-item" data-search="source code repository github">
            <div class="setting-info">
              <label class="setting-label">Source Code</label>
              <p class="setting-desc">Open source and available for contribution</p>
            </div>
            <button class="btn btn-secondary" id="open-github-repo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              GitHub
            </button>
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">Technology Stack</h3>
          <div class="setting-item" data-search="built with tech stack electron node">
            <div class="setting-info" style="width: 100%;">
              <label class="setting-label">Core Technologies</label>
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 8px; font-size: 11px;">
                <div style="padding: 8px; background: var(--surface); border-radius: 6px; border: 1px solid var(--border-subtle);">
                  <div style="font-weight: 600; color: var(--text);">Electron 28</div>
                  <div style="color: var(--text-muted);">Cross-platform framework</div>
                </div>
                <div style="padding: 8px; background: var(--surface); border-radius: 6px; border: 1px solid var(--border-subtle);">
                  <div style="font-weight: 600; color: var(--text);">Node.js</div>
                  <div style="color: var(--text-muted);">Runtime environment</div>
                </div>
                <div style="padding: 8px; background: var(--surface); border-radius: 6px; border: 1px solid var(--border-subtle);">
                  <div style="font-weight: 600; color: var(--text);">xterm.js 5.3</div>
                  <div style="color: var(--text-muted);">Terminal emulator</div>
                </div>
                <div style="padding: 8px; background: var(--surface); border-radius: 6px; border: 1px solid var(--border-subtle);">
                  <div style="font-weight: 600; color: var(--text);">SSH2 1.15</div>
                  <div style="color: var(--text-muted);">Secure connections</div>
                </div>
                <div style="padding: 8px; background: var(--surface); border-radius: 6px; border: 1px solid var(--border-subtle);">
                  <div style="font-weight: 600; color: var(--text);">node-pty</div>
                  <div style="color: var(--text-muted);">Pseudo-terminal</div>
                </div>
                <div style="padding: 8px; background: var(--surface); border-radius: 6px; border: 1px solid var(--border-subtle);">
                  <div style="font-weight: 600; color: var(--text);">JSON Storage</div>
                  <div style="color: var(--text-muted);">Local database</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">Features</h3>
          <div class="setting-item" data-search="features capabilities functionality">
            <div class="setting-info" style="width: 100%;">
              <div style="display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px;">
                <span style="padding: 4px 10px; background: rgba(0, 217, 255, 0.1); border: 1px solid rgba(0, 217, 255, 0.2); border-radius: 12px; color: var(--accent);">SSH Connections</span>
                <span style="padding: 4px 10px; background: rgba(63, 185, 80, 0.1); border: 1px solid rgba(63, 185, 80, 0.2); border-radius: 12px; color: var(--green);">Local Terminals</span>
                <span style="padding: 4px 10px; background: rgba(188, 140, 255, 0.1); border: 1px solid rgba(188, 140, 255, 0.2); border-radius: 12px; color: #bc8cff;">Multi-Tab Sessions</span>
                <span style="padding: 4px 10px; background: rgba(255, 123, 114, 0.1); border: 1px solid rgba(255, 123, 114, 0.2); border-radius: 12px; color: var(--red);">Server Management</span>
                <span style="padding: 4px 10px; background: rgba(234, 179, 8, 0.1); border: 1px solid rgba(234, 179, 8, 0.2); border-radius: 12px; color: #eab308;">Status Monitoring</span>
                <span style="padding: 4px 10px; background: rgba(236, 72, 153, 0.1); border: 1px solid rgba(236, 72, 153, 0.2); border-radius: 12px; color: #ec4899;">7 Color Themes</span>
                <span style="padding: 4px 10px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 12px; color: #3b82f6;">Keyboard Shortcuts</span>
                <span style="padding: 4px 10px; background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: 12px; color: #a855f7;">Tab Colors</span>
              </div>
            </div>
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">License &amp; Legal</h3>
          <div class="setting-item" data-search="license open source mit">
            <div class="setting-info">
              <label class="setting-label">MIT License</label>
              <p class="setting-desc">Free and open source software. You may use, modify, and distribute this software under the terms of the MIT License.</p>
            </div>
          </div>
          <div class="setting-item" data-search="disclaimer warranty">
            <div class="setting-info">
              <label class="setting-label">Disclaimer</label>
              <p class="setting-desc">This software is provided "as is" without warranty of any kind. Use at your own risk.</p>
            </div>
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">Keyboard Shortcuts</h3>
          <div class="setting-item" data-search="keyboard shortcuts hotkeys keybindings">
            <div class="setting-info" style="width: 100%;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 12px;">
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">New Terminal</span><kbd style="background: var(--surface); padding: 2px 6px; border-radius: 4px; font-size: 10px; border: 1px solid var(--border-subtle);">Ctrl+T</kbd></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">SSH Connection</span><kbd style="background: var(--surface); padding: 2px 6px; border-radius: 4px; font-size: 10px; border: 1px solid var(--border-subtle);">Ctrl+N</kbd></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Close Session</span><kbd style="background: var(--surface); padding: 2px 6px; border-radius: 4px; font-size: 10px; border: 1px solid var(--border-subtle);">Ctrl+W</kbd></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Next Session</span><kbd style="background: var(--surface); padding: 2px 6px; border-radius: 4px; font-size: 10px; border: 1px solid var(--border-subtle);">Ctrl+Tab</kbd></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Prev Session</span><kbd style="background: var(--surface); padding: 2px 6px; border-radius: 4px; font-size: 10px; border: 1px solid var(--border-subtle);">Ctrl+Shift+Tab</kbd></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Session 1-9</span><kbd style="background: var(--surface); padding: 2px 6px; border-radius: 4px; font-size: 10px; border: 1px solid var(--border-subtle);">Ctrl+1-9</kbd></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Copy</span><kbd style="background: var(--surface); padding: 2px 6px; border-radius: 4px; font-size: 10px; border: 1px solid var(--border-subtle);">Ctrl+Shift+C</kbd></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Paste</span><kbd style="background: var(--surface); padding: 2px 6px; border-radius: 4px; font-size: 10px; border: 1px solid var(--border-subtle);">Ctrl+Shift+V</kbd></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Dashboard</span><kbd style="background: var(--surface); padding: 2px 6px; border-radius: 4px; font-size: 10px; border: 1px solid var(--border-subtle);">F1</kbd></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Sessions</span><kbd style="background: var(--surface); padding: 2px 6px; border-radius: 4px; font-size: 10px; border: 1px solid var(--border-subtle);">F2</kbd></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Servers</span><kbd style="background: var(--surface); padding: 2px 6px; border-radius: 4px; font-size: 10px; border: 1px solid var(--border-subtle);">F3</kbd></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Settings</span><kbd style="background: var(--surface); padding: 2px 6px; border-radius: 4px; font-size: 10px; border: 1px solid var(--border-subtle);">F4</kbd></div>
              </div>
            </div>
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">Data Storage &amp; Privacy</h3>
          <div class="setting-item" data-search="privacy data local security storage">
            <div class="setting-info">
              <label class="setting-label">Local Data Storage</label>
              <p class="setting-desc">All your data is stored locally at: <code style="background: var(--surface); padding: 2px 6px; border-radius: 4px; font-size: 11px;">%LOCALAPPDATA%\\PolarOps\\polarops-data.json</code></p>
            </div>
          </div>
          <div class="setting-item" data-search="credentials passwords security encryption">
            <div class="setting-info">
              <label class="setting-label">Credentials Storage</label>
              <p class="setting-desc">⚠️ Server passwords are stored in plaintext in the local database. Consider using SSH keys for enhanced security in production environments.</p>
            </div>
          </div>
          <div class="setting-item" data-search="telemetry analytics tracking">
            <div class="setting-info">
              <label class="setting-label">No Telemetry</label>
              <p class="setting-desc">✓ PolarOps does not collect any usage data, analytics, or telemetry. No data leaves your machine except for SSH connections you initiate.</p>
            </div>
          </div>
          <div class="setting-item" data-search="network connections outbound">
            <div class="setting-info">
              <label class="setting-label">Network Connections</label>
              <p class="setting-desc">The only outbound connections are SSH connections you manually create. No automatic updates, no phone home, no cloud sync.</p>
            </div>
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">Transparency</h3>
          <div class="setting-item" data-search="what stored saved data">
            <div class="setting-info" style="width: 100%;">
              <label class="setting-label">What Data Is Stored</label>
              <div style="margin-top: 8px; font-size: 11px; color: var(--text-muted);">
                <div style="display: grid; gap: 4px;">
                  <div>• <strong>Servers:</strong> Name, host, port, username, password (plaintext), connection type</div>
                  <div>• <strong>Activity:</strong> Session start/end times, server connected to, session duration</div>
                  <div>• <strong>Settings:</strong> Theme preferences, terminal settings, UI preferences</div>
                  <div>• <strong>Session Metadata:</strong> Tab colors, custom names, window state</div>
                </div>
              </div>
            </div>
          </div>
          <div class="setting-item" data-search="not stored never saved">
            <div class="setting-info" style="width: 100%;">
              <label class="setting-label">What Is NOT Stored</label>
              <div style="margin-top: 8px; font-size: 11px; color: var(--text-muted);">
                <div style="display: grid; gap: 4px;">
                  <div>• Terminal output/history (cleared on close)</div>
                  <div>• Commands you type</div>
                  <div>• File contents from servers</div>
                  <div>• SSH session data or keys</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">Known Limitations</h3>
          <div class="setting-item" data-search="limitations known issues bugs">
            <div class="setting-info" style="width: 100%;">
              <div style="font-size: 11px; color: var(--text-muted); display: grid; gap: 4px;">
                <div>• No SFTP/file browser (planned for v2.0)</div>
                <div>• No split terminal views (planned)</div>
                <div>• No SSH key management UI (use system keys)</div>
                <div>• No cloud sync or backup</div>
                <div>• Passwords stored in plaintext locally</div>
              </div>
            </div>
          </div>
        </div>
        <div class="setting-group">
          <h3 class="setting-group-title">Support &amp; Feedback</h3>
          <div class="setting-item" data-search="report bug issue problem feedback">
            <div class="setting-info">
              <label class="setting-label">Report Issues</label>
              <p class="setting-desc">Found a bug or have a feature request?</p>
            </div>
            <button class="btn btn-secondary" id="open-github-issues">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              Report Bug
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  settingsContent.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      settingsContent.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      settingsContent.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panelName = tab.dataset.tab;
      settingsContent.querySelector(`[data-panel="${panelName}"]`)?.classList.add('active');
    });
  });
  
  document.getElementById('settings-search')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      settingsContent.querySelectorAll('.setting-item').forEach(item => item.style.display = 'flex');
      settingsContent.querySelectorAll('.setting-group').forEach(group => group.style.display = 'block');
      settingsContent.querySelectorAll('.settings-panel').forEach(panel => panel.classList.remove('active'));
      settingsContent.querySelector('[data-panel="appearance"]')?.classList.add('active');
      settingsContent.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      settingsContent.querySelector('[data-tab="appearance"]')?.classList.add('active');
      return;
    }
    
    settingsContent.querySelectorAll('.settings-panel').forEach(panel => panel.classList.add('active'));
    settingsContent.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    
    settingsContent.querySelectorAll('.setting-item').forEach(item => {
      const searchData = (item.dataset.search || '').toLowerCase();
      const labelText = item.querySelector('.setting-label')?.textContent.toLowerCase() || '';
      const descText = item.querySelector('.setting-desc')?.textContent.toLowerCase() || '';
      const matches = searchData.includes(query) || labelText.includes(query) || descText.includes(query);
      item.style.display = matches ? 'flex' : 'none';
    });
    
    settingsContent.querySelectorAll('.setting-group').forEach(group => {
      const visibleItems = group.querySelectorAll('.setting-item[style*="flex"]').length;
      group.style.display = visibleItems > 0 ? 'block' : 'none';
    });
  });
  
  document.getElementById('theme-select')?.addEventListener('change', async (e) => {
    const theme = e.target.value;
    applyUITheme(theme);
    await window.polar.db.setSetting('theme', theme);
  });
  
  document.getElementById('terminal-theme-select')?.addEventListener('change', async (e) => {
    const theme = e.target.value;
    applyTerminalTheme(theme);
    await window.polar.db.setSetting('terminalTheme', theme);
  });
  
  document.getElementById('font-size-reset')?.addEventListener('click', async () => {
    document.getElementById('font-size-input').value = '13';
    await window.polar.db.setSetting('fontSize', '13');
    appSettings.fontSize = '13';
    sessions.forEach(s => {
      if (s.terminal) {
        s.terminal.options.fontSize = 13;
        s.fitAddon?.fit();
      }
    });
  });
  
  document.getElementById('font-size-input')?.addEventListener('change', async (e) => {
    const size = parseInt(e.target.value) || 13;
    await window.polar.db.setSetting('fontSize', size.toString());
    appSettings.fontSize = size.toString();
    sessions.forEach(s => {
      if (s.terminal) {
        s.terminal.options.fontSize = size;
        s.fitAddon?.fit();
      }
    });
  });
  
  document.getElementById('cursor-select')?.addEventListener('change', async (e) => {
    const cursor = e.target.value;
    await window.polar.db.setSetting('cursorStyle', cursor);
    appSettings.cursorStyle = cursor;
    sessions.forEach(s => {
      if (s.terminal) {
        s.terminal.options.cursorStyle = cursor;
      }
    });
  });
  
  document.getElementById('shell-select')?.addEventListener('change', async (e) => {
    await window.polar.db.setSetting('shell', e.target.value);
    appSettings.shell = e.target.value;
  });
  
  document.getElementById('scrollback-input')?.addEventListener('change', async (e) => {
    const lines = parseInt(e.target.value) || 10000;
    await window.polar.db.setSetting('scrollbackLines', lines.toString());
    appSettings.scrollbackLines = lines.toString();
  });
  
  document.getElementById('keepalive-input')?.addEventListener('change', async (e) => {
    const interval = parseInt(e.target.value) || 30;
    await window.polar.db.setSetting('keepAliveInterval', interval.toString());
    appSettings.keepAliveInterval = interval.toString();
  });
  
  document.getElementById('auto-reconnect')?.addEventListener('change', async (e) => {
    await window.polar.db.setSetting('autoReconnect', e.target.checked);
    appSettings.autoReconnect = e.target.checked;
  });
  
  document.getElementById('copy-on-select')?.addEventListener('change', async (e) => {
    await window.polar.db.setSetting('copyOnSelect', e.target.checked);
    appSettings.copyOnSelect = e.target.checked;
  });
  
  document.getElementById('clear-selection-copy')?.addEventListener('change', async (e) => {
    await window.polar.db.setSetting('clearSelectionOnCopy', e.target.checked);
    appSettings.clearSelectionOnCopy = e.target.checked;
  });
  
  document.getElementById('ctrl-c-copy')?.addEventListener('change', async (e) => {
    await window.polar.db.setSetting('ctrlCCopy', e.target.checked);
    appSettings.ctrlCCopy = e.target.checked;
  });
  
  document.getElementById('ctrl-v-paste')?.addEventListener('change', async (e) => {
    await window.polar.db.setSetting('ctrlVPaste', e.target.checked);
    appSettings.ctrlVPaste = e.target.checked;
  });
  
  document.getElementById('right-click-paste')?.addEventListener('change', async (e) => {
    await window.polar.db.setSetting('rightClickPaste', e.target.checked);
    appSettings.rightClickPaste = e.target.checked;
  });
  
  document.getElementById('scroll-on-output')?.addEventListener('change', async (e) => {
    await window.polar.db.setSetting('scrollOnOutput', e.target.checked);
    appSettings.scrollOnOutput = e.target.checked;
    sessions.forEach(s => {
      if (s.terminal) {
        s.terminal.options.scrollOnUserInput = e.target.checked;
      }
    });
  });
  
  document.getElementById('scroll-on-keystroke')?.addEventListener('change', async (e) => {
    await window.polar.db.setSetting('scrollOnKeystroke', e.target.checked);
    appSettings.scrollOnKeystroke = e.target.checked;
  });
  
  document.getElementById('cursor-blink')?.addEventListener('change', async (e) => {
    await window.polar.db.setSetting('cursorBlink', e.target.checked);
    appSettings.cursorBlink = e.target.checked;
    sessions.forEach(s => {
      if (s.terminal) {
        s.terminal.options.cursorBlink = e.target.checked;
      }
    });
  });
  
  document.getElementById('word-wrap')?.addEventListener('change', async (e) => {
    await window.polar.db.setSetting('wordWrap', e.target.checked);
    appSettings.wordWrap = e.target.checked;
  });
  
  document.getElementById('bell-sound')?.addEventListener('change', async (e) => {
    await window.polar.db.setSetting('bellSound', e.target.checked);
    appSettings.bellSound = e.target.checked;
    sessions.forEach(s => {
      if (s.terminal) {
        s.terminal.options.bellSound = e.target.checked ? 'sound' : null;
        s.terminal.options.bellStyle = e.target.checked ? 'sound' : 'none';
      }
    });
  });
  
  document.getElementById('open-links-click')?.addEventListener('change', async (e) => {
    await window.polar.db.setSetting('openLinksOnClick', e.target.checked);
    appSettings.openLinksOnClick = e.target.checked;
  });
  
  document.getElementById('confirm-on-close')?.addEventListener('change', async (e) => {
    await window.polar.db.setSetting('confirmOnClose', e.target.checked);
    appSettings.confirmOnClose = e.target.checked;
  });
  
  document.getElementById('clear-ping-history')?.addEventListener('click', async () => {
    const confirmed = await showConfirmModal({
      title: 'Clear Ping History',
      message: 'Are you sure you want to clear all ping history data? This cannot be undone.',
      confirmText: 'Clear',
      cancelText: 'Cancel',
      type: 'warning',
      danger: true
    });
    if (confirmed) {
      await window.polar.db.clearPingHistory();
      showSettingsContent();
    }
  });
  
  document.getElementById('open-db-folder')?.addEventListener('click', async () => {
    try {
      await window.polar.shell.openPath(dbInfo.path);
    } catch (e) {
      console.error('[PolarOps/Settings] Failed to open folder:', e);
    }
  });
  
  document.getElementById('open-github-repo')?.addEventListener('click', () => {
    window.polar.shell.openExternal('https://github.com/yourpov/PolarOps');
  });
  
  document.getElementById('open-github-issues')?.addEventListener('click', () => {
    window.polar.shell.openExternal('https://github.com/yourpov/PolarOps/issues');
  });
  
  document.getElementById('open-telegram')?.addEventListener('click', () => {
    window.polar.shell.openExternal('https://t.me/depoLTC');
  });
  
  document.getElementById('open-dev-github')?.addEventListener('click', () => {
    window.polar.shell.openExternal('https://github.com/yourpov');
  });
  
  document.getElementById('open-instagram')?.addEventListener('click', () => {
    window.polar.shell.openExternal('https://instagram.com/capalot.ecstasy');
  });
  
  settingsContent.style.display = 'block';
}

document.querySelectorAll('[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    switchView(view);
  });
});

document.getElementById('welcome-new-session').addEventListener('click', () => {
  createSession('local');
});

document.querySelector('.add-server-btn').addEventListener('click', () => {
  document.getElementById('ssh-modal').classList.add('active');
});

document.querySelector('.add-server-btn-full').addEventListener('click', () => {
  switchView('sessions');
  createSession('local');
});

document.getElementById('ssh-cancel').addEventListener('click', () => {
  document.getElementById('ssh-modal').classList.remove('active');
  document.getElementById('ssh-form').reset();
});

document.getElementById('ssh-close-x').addEventListener('click', () => {
  document.getElementById('ssh-modal').classList.remove('active');
  document.getElementById('ssh-form').reset();
});

document.getElementById('ssh-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const saveServer = document.getElementById('ssh-save')?.checked || false;
  
  const config = {
    name: document.getElementById('ssh-name')?.value?.trim() || '',
    host: document.getElementById('ssh-host').value,
    port: parseInt(document.getElementById('ssh-port').value),
    username: document.getElementById('ssh-username').value,
    password: document.getElementById('ssh-password').value || undefined
  };
  
  if (saveServer) {
    await addServer(config);
  }
  
  document.getElementById('ssh-modal').classList.remove('active');
  document.getElementById('ssh-form').reset();
  
  switchView('sessions');
  createSession('ssh', config);
});

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
    if (e.key === 'Escape') {
      document.getElementById('ssh-modal')?.classList.remove('active');
      document.getElementById('confirm-modal')?.classList.remove('active');
    }
    return;
  }
  
  if (e.ctrlKey && e.key === 't') {
    e.preventDefault();
    switchView('sessions');
    createSession('local');
  }
  
  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault();
    document.getElementById('ssh-modal').classList.add('active');
    document.getElementById('ssh-host')?.focus();
  }
  
  if (e.ctrlKey && e.key === 'w' && activeSessionId !== null) {
    e.preventDefault();
    closeSession(activeSessionId);
  }
  
  if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    const ids = Array.from(sessions.keys());
    if (ids.length > 1 && activeSessionId !== null) {
      const currentIndex = ids.indexOf(activeSessionId);
      const nextIndex = (currentIndex + 1) % ids.length;
      switchToSession(ids[nextIndex]);
    }
  }
  
  if (e.ctrlKey && e.key === 'Tab' && e.shiftKey) {
    e.preventDefault();
    const ids = Array.from(sessions.keys());
    if (ids.length > 1 && activeSessionId !== null) {
      const currentIndex = ids.indexOf(activeSessionId);
      const prevIndex = (currentIndex - 1 + ids.length) % ids.length;
      switchToSession(ids[prevIndex]);
    }
  }
  
  if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const ids = Array.from(sessions.keys());
    const index = parseInt(e.key) - 1;
    if (index < ids.length) {
      switchToSession(ids[index]);
    }
  }
  
  if (e.key === 'Escape') {
    document.getElementById('ssh-modal')?.classList.remove('active');
    document.getElementById('confirm-modal')?.classList.remove('active');
  }
  
  if (e.key === 'F1') {
    e.preventDefault();
    switchView('dashboard');
  }
  
  if (e.key === 'F2') {
    e.preventDefault();
    switchView('sessions');
  }
  
  if (e.key === 'F3') {
    e.preventDefault();
    switchView('servers');
  }
  
  if (e.key === 'F4') {
    e.preventDefault();
    switchView('settings');
  }
});

document.querySelectorAll('[data-external]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const url = link.dataset.external;
    if (url) {
      window.polar.shell.openExternal(url);
    }
  });
});

document.getElementById('edit-server-close-x')?.addEventListener('click', () => {
  document.getElementById('edit-server-modal').style.display = 'none';
});

document.getElementById('edit-server-cancel')?.addEventListener('click', () => {
  document.getElementById('edit-server-modal').style.display = 'none';
});

document.getElementById('edit-server-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const serverId = parseInt(document.getElementById('edit-server-id').value);
  const updateData = {
    name: document.getElementById('edit-server-name').value.trim(),
    host: document.getElementById('edit-server-host').value.trim(),
    port: parseInt(document.getElementById('edit-server-port').value) || 22,
    username: document.getElementById('edit-server-username').value.trim(),
    type: document.getElementById('edit-server-type').value
  };
  
  const newPassword = document.getElementById('edit-server-password').value;
  if (newPassword) {
    updateData.password = newPassword;
  }
  
  await window.polar.db.updateServer(serverId, updateData);
  savedServers = await window.polar.db.getServers();
  populateQuickConnect();
  document.getElementById('edit-server-modal').style.display = 'none';
  await showServersContent();
});

let contextMenuSessionId = null;
const contextMenu = document.getElementById('terminal-context-menu');

function showContextMenu(e, sessionId) {
  e.preventDefault();
  contextMenuSessionId = sessionId;
  contextMenu.style.display = 'block';
  
  const x = Math.min(e.clientX, window.innerWidth - contextMenu.offsetWidth - 10);
  const y = Math.min(e.clientY, window.innerHeight - contextMenu.offsetHeight - 10);
  
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
}

function hideContextMenu() {
  contextMenu.style.display = 'none';
  contextMenuSessionId = null;
}

document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target)) {
    hideContextMenu();
  }
});

document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('.tab') && !e.target.closest('.session-item')) {
    hideContextMenu();
  }
});

contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
  item.addEventListener('click', async () => {
    const action = item.dataset.action;
    const session = sessions.get(contextMenuSessionId);
    
    if (!session) {
      hideContextMenu();
      return;
    }
    
    if (action === 'rename') {
      document.getElementById('rename-terminal-id').value = contextMenuSessionId;
      document.getElementById('rename-terminal-name').value = session.name;
      document.getElementById('rename-terminal-modal').style.display = 'flex';
      document.getElementById('rename-terminal-name').select();
    } else if (action === 'sftp') {
      if (session.type === 'ssh') {
        Features.openSFTP(contextMenuSessionId);
      } else {
        Features.modals.toast('SFTP is only available for SSH sessions', 'warning');
      }
    } else if (action === 'port-forward') {
      if (session.type === 'ssh') {
        Features.openPortForwarding(contextMenuSessionId);
      } else {
        Features.modals.toast('Port forwarding is only available for SSH sessions', 'warning');
      }
    } else if (action === 'toggle-logging') {
      if (Features.isLogging(contextMenuSessionId)) {
        Features.stopLogging(contextMenuSessionId);
      } else {
        Features.startLogging(contextMenuSessionId);
      }
    } else if (action === 'duplicate') {
      if (session.type === 'ssh' && session.config) {
        createSession('ssh', session.config);
      } else {
        createSession('local');
      }
    } else if (action === 'close') {
      closeSession(contextMenuSessionId);
    }
    
    hideContextMenu();
  });
});

contextMenu.querySelectorAll('.color-option').forEach(option => {
  option.addEventListener('click', () => {
    const color = option.dataset.color;
    const session = sessions.get(contextMenuSessionId);
    
    if (session) {
      session.tabColor = color === 'default' ? null : color;
      updateTabColor(contextMenuSessionId, session.tabColor);
    }
    
    hideContextMenu();
  });
});

function updateTabColor(sessionId, color) {
  const tab = document.getElementById(`tab-${sessionId}`);
  const sessionItem = document.getElementById(`session-${sessionId}`);
  
  if (tab) {
    if (color) {
      tab.style.borderLeftColor = color;
      tab.style.borderLeftWidth = '3px';
      tab.style.borderLeftStyle = 'solid';
    } else {
      tab.style.borderLeftColor = '';
      tab.style.borderLeftWidth = '';
      tab.style.borderLeftStyle = '';
    }
  }
  
  if (sessionItem) {
    const dot = sessionItem.querySelector('.session-dot');
    if (dot && color) {
      dot.style.background = color;
    }
  }
}

document.getElementById('rename-terminal-close-x')?.addEventListener('click', () => {
  document.getElementById('rename-terminal-modal').style.display = 'none';
});

document.getElementById('rename-terminal-cancel')?.addEventListener('click', () => {
  document.getElementById('rename-terminal-modal').style.display = 'none';
});

document.getElementById('rename-terminal-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const sessionId = parseInt(document.getElementById('rename-terminal-id').value);
  const newName = document.getElementById('rename-terminal-name').value.trim();
  
  const session = sessions.get(sessionId);
  if (session && newName) {
    session.name = newName;
    
    const tab = document.getElementById(`tab-${sessionId}`);
    if (tab) {
      const span = tab.querySelector('span');
      if (span) span.textContent = newName;
    }
    
    const sessionItem = document.getElementById(`session-${sessionId}`);
    if (sessionItem) {
      const nameEl = sessionItem.querySelector('.session-name');
      if (nameEl) nameEl.textContent = newName;
    }
  }
  
  document.getElementById('rename-terminal-modal').style.display = 'none';
});