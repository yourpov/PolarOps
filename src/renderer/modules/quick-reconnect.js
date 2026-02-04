class QuickReconnect {
  constructor() {
    this.recentConnections = [];
    this.maxRecent = 8;
  }
  
  async init() {
    await this.load();
  }
  
  async load() {
    try {
      const recentJson = await window.polar.db.getSetting('recentConnections');
      this.recentConnections = recentJson ? JSON.parse(recentJson) : [];
    } catch (e) {
      console.error('[PolarOps/Reconnect] Failed to load:', e);
      this.recentConnections = [];
    }
  }
  
  async save() {
    try {
      await window.polar.db.setSetting('recentConnections', JSON.stringify(this.recentConnections));
    } catch (e) {
      console.error('[PolarOps/Reconnect] Failed to save:', e);
    }
  }
  
  async addConnection(serverId, serverInfo) {
    this.recentConnections = this.recentConnections.filter(c => c.serverId !== serverId);
    
    this.recentConnections.unshift({
      serverId,
      name: serverInfo.name,
      host: serverInfo.host,
      port: serverInfo.port,
      username: serverInfo.username,
      timestamp: Date.now()
    });
    
    if (this.recentConnections.length > this.maxRecent) {
      this.recentConnections = this.recentConnections.slice(0, this.maxRecent);
    }
    
    await this.save();
  }
  
  getRecent() {
    return this.recentConnections;
  }
  
  async clearRecent() {
    this.recentConnections = [];
    await this.save();
  }
  
  formatTimestamp(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }
  
  renderPanel(onConnect) {
    if (this.recentConnections.length === 0) {
      return `
        <div class="quick-reconnect-empty">
          <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="opacity: 0.3; margin-bottom: 8px;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p style="color: var(--text-muted); font-size: 12px; margin: 0;">No recent connections</p>
        </div>
      `;
    }
    
    return `
      <div class="quick-reconnect-list">
        ${this.recentConnections.map(conn => `
          <button class="quick-reconnect-item" data-server-id="${conn.serverId}" title="${conn.host}:${conn.port}">
            <div class="quick-reconnect-icon">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"/>
              </svg>
            </div>
            <div class="quick-reconnect-info">
              <span class="quick-reconnect-name">${conn.name}</span>
              <span class="quick-reconnect-time">${this.formatTimestamp(conn.timestamp)}</span>
            </div>
            <svg class="quick-reconnect-arrow" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
            </svg>
          </button>
        `).join('')}
      </div>
      <button class="quick-reconnect-clear" id="clear-recent-btn" title="Clear history">
        Clear History
      </button>
    `;
  }
}

module.exports = new QuickReconnect();
