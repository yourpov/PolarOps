class FolderManager {
  constructor() {
    this.folders = [];
    this.expanded = new Set();
  }
  
  async init() {
    await this.load();
  }
  
  async load() {
    try {
      const foldersJson = await window.polar.db.getSetting('serverFolders');
      this.folders = foldersJson ? JSON.parse(foldersJson) : this.getDefaultFolders();
      
      const expandedJson = await window.polar.db.getSetting('expandedFolders');
      this.expanded = new Set(expandedJson ? JSON.parse(expandedJson) : []);
    } catch (e) {
      console.error('[PolarOps/Folders] Failed to load:', e);
      this.folders = this.getDefaultFolders();
    }
  }
  
  async save() {
    try {
      await window.polar.db.setSetting('serverFolders', JSON.stringify(this.folders));
      await window.polar.db.setSetting('expandedFolders', JSON.stringify([...this.expanded]));
    } catch (e) {
      console.error('[PolarOps/Folders] Failed to save:', e);
    }
  }
  
  getDefaultFolders() {
    return [
      { id: 'production', name: 'Production', color: '#ff7b72', icon: 'server' },
      { id: 'development', name: 'Development', color: '#3fb950', icon: 'code' },
      { id: 'staging', name: 'Staging', color: '#d29922', icon: 'flask' },
      { id: 'personal', name: 'Personal', color: '#00d9ff', icon: 'user' }
    ];
  }
  
  getFolders() {
    return this.folders;
  }
  
  getFolder(folderId) {
    return this.folders.find(f => f.id === folderId);
  }
  
  async addFolder(name, color = '#8b949e', icon = 'folder') {
    const id = `folder_${Date.now()}`;
    this.folders.push({ id, name, color, icon });
    await this.save();
    return id;
  }
  
  async updateFolder(folderId, updates) {
    const folder = this.folders.find(f => f.id === folderId);
    if (folder) {
      Object.assign(folder, updates);
      await this.save();
    }
  }
  
  async deleteFolder(folderId) {
    this.folders = this.folders.filter(f => f.id !== folderId);
    await this.save();
  }
  
  toggleExpanded(folderId) {
    if (this.expanded.has(folderId)) {
      this.expanded.delete(folderId);
    } else {
      this.expanded.add(folderId);
    }
    this.save();
  }
  
  isExpanded(folderId) {
    return this.expanded.has(folderId);
  }
  
  groupServersByFolder(servers) {
    const grouped = new Map();
    const ungrouped = [];
    
    this.folders.forEach(folder => {
      grouped.set(folder.id, { folder, servers: [] });
    });
    
    servers.forEach(server => {
      if (server.folder && grouped.has(server.folder)) {
        grouped.get(server.folder).servers.push(server);
      } else {
        ungrouped.push(server);
      }
    });
    
    return { grouped, ungrouped };
  }
  
  renderFolderSelector(selectedFolderId = null) {
    return `
      <select class="folder-select form-input" style="width: 100%;">
        <option value="">No folder</option>
        ${this.folders.map(f => `
          <option value="${f.id}" ${selectedFolderId === f.id ? 'selected' : ''}>
            ${f.name}
          </option>
        `).join('')}
      </select>
    `;
  }
  
  getFolderIcon(iconName) {
    const icons = {
      server: '<path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"/>',
      code: '<path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>',
      flask: '<path stroke-linecap="round" stroke-linejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>',
      user: '<path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>',
      folder: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>'
    };
    return icons[iconName] || icons.folder;
  }
}

module.exports = new FolderManager();
