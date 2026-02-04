const State = require('./state');
const Themes = require('./themes');
const { TerminalSearch } = require('./search');
const { BroadcastManager } = require('./broadcast');
const { SessionLogger } = require('./logger');
const Folders = require('./folders');
const QuickReconnect = require('./quick-reconnect');
const { SFTPBrowser } = require('./sftp');
const PortForwards = require('./port-forward');
const SSHKeys = require('./ssh-keys');
const Modals = require('./modals');

class FeatureManager {
  constructor() {
    this.searchInstances = new Map();
    this.broadcast = null;
    this.loggers = new Map();
    this.folders = null;
    this.quickReconnect = null;
    this.sftpBrowsers = new Map();
    this.portForwards = null;
    this.sshKeys = null;
    this.modals = Modals;
    
    this.setupKeyboardShortcuts();
  }
  
  async init() {
    this.folders = Folders;
    this.quickReconnect = QuickReconnect;
    
    await this.folders.init();
    await this.quickReconnect.init();
    
    this.portForwards = PortForwards;
    this.sshKeys = SSHKeys;
    
    this.portForwards.init();
    this.sshKeys.init();
    
    this.modals.createToastContainer();
  }
  
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
      const activeId = State.activeSessionId;
      
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        this.toggleSearch(activeId);
      }
      
      if (e.ctrlKey && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        this.toggleBroadcast();
      }
      
      if (e.key === 'Escape') {
        this.closeSearch(activeId);
        this.closeBroadcast();
      }
    });
  }
  
  toggleSearch(sessionId) {
    if (!sessionId) return;
    
    const session = State.sessions.get(sessionId);
    if (!session || !session.terminal) return;
    
    let search = this.searchInstances.get(sessionId);
    if (search && search.visible) {
      search.hide();
    } else {
      if (!search) {
        search = new TerminalSearch(session.terminal, sessionId);
        this.searchInstances.set(sessionId, search);
      }
      search.show();
    }
  }
  
  closeSearch(sessionId) {
    if (!sessionId) return;
    const search = this.searchInstances.get(sessionId);
    if (search) {
      search.hide();
    }
  }
  
  toggleBroadcast() {
    if (this.broadcast && this.broadcast.active) {
      this.broadcast.disable();
      this.broadcast = null;
    } else {
      const sessionIds = Array.from(State.sessions.keys());
      if (sessionIds.length < 2) {
        this.modals.toast('Need at least 2 terminals for broadcast mode', 'warning');
        return;
      }
      this.broadcast = new BroadcastManager(sessionIds, (id, data) => {
        const session = State.sessions.get(id);
        if (session) {
          if (session.type === 'ssh') {
            window.polar.ssh.write(id, data);
          } else {
            window.polar.terminal.write(id, data);
          }
        }
      });
      this.broadcast.enable();
    }
  }
  
  closeBroadcast() {
    if (this.broadcast && this.broadcast.active) {
      this.broadcast.disable();
      this.broadcast = null;
    }
  }
  
  startLogging(sessionId) {
    const session = State.sessions.get(sessionId);
    if (!session) return;
    
    const serverName = session.name || `session-${sessionId}`;
    const logger = new SessionLogger(sessionId, serverName);
    logger.start();
    this.loggers.set(sessionId, logger);
    
    this.modals.toast(`Started logging: ${serverName}`, 'success');
    return logger;
  }
  
  stopLogging(sessionId) {
    const logger = this.loggers.get(sessionId);
    if (logger) {
      logger.stop();
      this.loggers.delete(sessionId);
      this.modals.toast('Session logging stopped', 'info');
    }
  }
  
  logData(sessionId, data) {
    const logger = this.loggers.get(sessionId);
    if (logger) {
      logger.write(data);
    }
  }
  
  isLogging(sessionId) {
    return this.loggers.has(sessionId);
  }
  
  async openSFTP(sessionId) {
    const session = State.sessions.get(sessionId);
    if (!session || session.type !== 'ssh') {
      this.modals.toast('SFTP only available for SSH sessions', 'warning');
      return;
    }
    
    let browser = this.sftpBrowsers.get(sessionId);
    if (!browser) {
      browser = new SFTPBrowser(sessionId, session.config?.host || 'server');
      this.sftpBrowsers.set(sessionId, browser);
    }
    
    await browser.open();
  }
  
  closeSFTP(sessionId) {
    const browser = this.sftpBrowsers.get(sessionId);
    if (browser) {
      browser.close();
      this.sftpBrowsers.delete(sessionId);
    }
  }
  
  async openPortForwarding(sessionId) {
    const session = State.sessions.get(sessionId);
    if (!session || session.type !== 'ssh') {
      this.modals.toast('Port forwarding only for SSH sessions', 'warning');
      return;
    }
    
    this.portForwards.show(sessionId);
  }
  
  openSSHKeyManager() {
    this.sshKeys.show();
  }
  
  trackConnection(serverConfig) {
    if (!this.quickReconnect) return;
    const serverId = serverConfig.id || `${serverConfig.host}:${serverConfig.port || 22}`;
    this.quickReconnect.addConnection(serverId, serverConfig);
  }
  
  getRecentConnections() {
    return this.quickReconnect?.getRecent() || [];
  }
  
  renderQuickReconnect(container, onConnect) {
    this.quickReconnect.render(container, onConnect);
  }
  
  getFolders() {
    return this.folders.getFolders();
  }
  
  getFolder(id) {
    return this.folders.getFolder(id);
  }
  
  createFolder(name, color, icon) {
    return this.folders.createFolder(name, color, icon);
  }
  
  addServerToFolder(serverId, folderId) {
    this.folders.addServer(serverId, folderId);
  }
  
  renderFolderSelect(container, selectedId) {
    this.folders.renderFolderSelect(container, selectedId);
  }
  
  cleanupSession(sessionId) {
    this.closeSearch(sessionId);
    this.stopLogging(sessionId);
    this.closeSFTP(sessionId);
    this.searchInstances.delete(sessionId);
  }
  
  applyTheme(themeName) {
    Themes.applyUITheme(themeName);
    Themes.applyTerminalTheme(themeName, State.sessions);
  }
  
  applyTerminalTheme(themeName) {
    Themes.applyTerminalTheme(themeName, State.sessions);
  }
  
  getTerminalTheme(themeName) {
    return Themes.getTerminalTheme(themeName);
  }
}
const Features = new FeatureManager();

module.exports = Features;
