const fs = require('fs');
const path = require('path');

class SessionLogger {
  constructor() {
    this.activeLogs = new Map();
    this.logDir = null;
  }
  
  async init() {
    try {
      const info = await window.polar.db.getInfo();
      this.logDir = path.dirname(info.path);
      this.logDir = path.join(this.logDir, 'logs');
      
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (e) {
      console.error('[PolarOps/Logger] Failed to init:', e);
    }
  }
  
  getLogPath() {
    return this.logDir;
  }
  
  startLogging(sessionId, sessionName) {
    if (this.activeLogs.has(sessionId)) {
      console.warn('[PolarOps/Logger] Already logging session');
      return false;
    }
    
    if (!this.logDir) {
      console.error('[PolarOps/Logger] Directory not ready');
      return false;
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = sessionName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `${safeName}_${timestamp}.log`;
    const logPath = path.join(this.logDir, filename);
    
    try {
      const stream = fs.createWriteStream(logPath, { flags: 'a', encoding: 'utf8' });
      
      const header = [
        '═'.repeat(60),
        `PolarOps Session Log`,
        `Session: ${sessionName}`,
        `Started: ${new Date().toLocaleString()}`,
        '═'.repeat(60),
        ''
      ].join('\n');
      
      stream.write(header);
      
      this.activeLogs.set(sessionId, {
        stream,
        path: logPath,
        startTime: Date.now(),
        sessionName
      });
      
      return true;
    } catch (e) {
      console.error('[PolarOps/Logger] Failed to start:', e);
      return false;
    }
  }
  
  stopLogging(sessionId) {
    const log = this.activeLogs.get(sessionId);
    if (!log) return false;
    
    const footer = [
      '',
      '═'.repeat(60),
      `Session ended: ${new Date().toLocaleString()}`,
      `Duration: ${this.formatDuration(Date.now() - log.startTime)}`,
      '═'.repeat(60)
    ].join('\n');
    
    log.stream.write(footer);
    log.stream.end();
    this.activeLogs.delete(sessionId);
    
    return log.path;
  }
  
  write(sessionId, data) {
    const log = this.activeLogs.get(sessionId);
    if (!log) return;
    
    const cleanData = this.stripAnsi(data);
    log.stream.write(cleanData);
  }
  
  isLogging(sessionId) {
    return this.activeLogs.has(sessionId);
  }
  
  getLogInfo(sessionId) {
    return this.activeLogs.get(sessionId);
  }
  
  stripAnsi(str) {
    return str.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
              .replace(/\x1B\]0;[^\x07]*\x07/g, '');
  }
  
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
  
  async openLogFolder() {
    if (this.logDir) {
      await window.polar.shell.openPath(this.logDir);
    }
  }
  
  async getRecentLogs(limit = 10) {
    if (!this.logDir || !fs.existsSync(this.logDir)) {
      return [];
    }
    
    try {
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.endsWith('.log'))
        .map(f => {
          const fullPath = path.join(this.logDir, f);
          const stats = fs.statSync(fullPath);
          return {
            name: f,
            path: fullPath,
            size: stats.size,
            modified: stats.mtime
          };
        })
        .sort((a, b) => b.modified - a.modified)
        .slice(0, limit);
      
      return files;
    } catch (e) {
      console.error('[PolarOps/Logger] Failed to get logs:', e);
      return [];
    }
  }
}

module.exports = new SessionLogger();
