class SFTPBrowser {
  constructor() {
    this.activeSessions = new Map();
    this.element = null;
    this.currentSessionId = null;
    this.clipboard = null;
  }
  
  init() {
    this.createPanel();
  }
  
  createPanel() {
    this.element = document.createElement('div');
    this.element.id = 'sftp-panel';
    this.element.className = 'sftp-panel';
    this.element.style.display = 'none';
    this.element.innerHTML = this.renderPanelHTML();
    
    const terminalContainer = document.getElementById('terminal-container');
    if (terminalContainer) {
      terminalContainer.appendChild(this.element);
    }
    
    this.bindEvents();
  }
  
  renderPanelHTML() {
    return `
      <div class="sftp-header">
        <div class="sftp-title">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
          </svg>
          <span>SFTP Browser</span>
          <span class="sftp-connection" id="sftp-connection-info">Not connected</span>
        </div>
        <div class="sftp-actions">
          <button type="button" id="sftp-refresh" class="sftp-btn" title="Refresh (F5)">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
          <button type="button" id="sftp-upload" class="sftp-btn" title="Upload files">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
          </button>
          <button type="button" id="sftp-new-folder" class="sftp-btn" title="New folder">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            </svg>
          </button>
          <button type="button" id="sftp-close" class="sftp-btn sftp-close-btn" title="Close">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="sftp-toolbar">
        <button type="button" id="sftp-back" class="sftp-nav-btn" title="Back">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
          </svg>
        </button>
        <button type="button" id="sftp-up" class="sftp-nav-btn" title="Up one level">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
          </svg>
        </button>
        <button type="button" id="sftp-home" class="sftp-nav-btn" title="Home directory">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
        </button>
        <div class="sftp-path-bar">
          <input type="text" id="sftp-path-input" class="sftp-path-input" placeholder="/" autocomplete="off" spellcheck="false">
        </div>
      </div>
      <div class="sftp-content" id="sftp-content">
        <div class="sftp-loading">
          <div class="sftp-spinner"></div>
          <span>Connecting...</span>
        </div>
      </div>
      <div class="sftp-status">
        <span id="sftp-status-text">Ready</span>
        <span id="sftp-item-count">0 items</span>
      </div>
    `;
  }
  
  bindEvents() {
    document.getElementById('sftp-close')?.addEventListener('click', () => this.hide());
    document.getElementById('sftp-refresh')?.addEventListener('click', () => this.refresh());
    document.getElementById('sftp-back')?.addEventListener('click', () => this.goBack());
    document.getElementById('sftp-up')?.addEventListener('click', () => this.goUp());
    document.getElementById('sftp-home')?.addEventListener('click', () => this.goHome());
    document.getElementById('sftp-upload')?.addEventListener('click', () => this.showUploadDialog());
    document.getElementById('sftp-new-folder')?.addEventListener('click', () => this.showNewFolderDialog());
    
    document.getElementById('sftp-path-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.navigateTo(e.target.value);
      }
    });
    
    document.addEventListener('keydown', (e) => {
      if (this.element.style.display === 'none') return;
      
      if (e.key === 'F5') {
        e.preventDefault();
        this.refresh();
      }
    });
  }
  
  async open(sessionId, config) {
    this.currentSessionId = sessionId;
    this.element.style.display = 'flex';
    
    document.getElementById('sftp-connection-info').textContent = `${config.username}@${config.host}`;
    
    if (!this.activeSessions.has(sessionId)) {
      this.activeSessions.set(sessionId, {
        path: '~',
        files: [],
        history: []
      });
    }
    
    await this.connect(sessionId, config);
  }
  
  hide() {
    this.element.style.display = 'none';
  }
  
  async connect(sessionId, config) {
    this.showLoading('Connecting to SFTP...');
    
    try {
      await window.polar.sftp.connect(sessionId, config);
      await this.navigateTo('~');
    } catch (e) {
      this.showError(`Connection failed: ${e.message}`);
    }
  }
  
  async navigateTo(path) {
    if (!this.currentSessionId) return;
    
    this.showLoading('Loading...');
    
    try {
      const session = this.activeSessions.get(this.currentSessionId);
      if (session) {
        session.history.push(session.path);
        session.path = path;
      }
      
      const result = await window.polar.sftp.list(this.currentSessionId, path);
      this.renderFiles(result.files, result.path);
      
      document.getElementById('sftp-path-input').value = result.path;
    } catch (e) {
      this.showError(`Failed to load: ${e.message}`);
    }
  }
  
  async refresh() {
    const session = this.activeSessions.get(this.currentSessionId);
    if (session) {
      await this.navigateTo(session.path);
    }
  }
  
  goBack() {
    const session = this.activeSessions.get(this.currentSessionId);
    if (session && session.history.length > 0) {
      const prevPath = session.history.pop();
      session.path = prevPath;
      this.navigateTo(prevPath);
    }
  }
  
  goUp() {
    const session = this.activeSessions.get(this.currentSessionId);
    if (session) {
      const parentPath = session.path.split('/').slice(0, -1).join('/') || '/';
      this.navigateTo(parentPath);
    }
  }
  
  goHome() {
    this.navigateTo('~');
  }
  
  renderFiles(files, currentPath) {
    const content = document.getElementById('sftp-content');
    const statusCount = document.getElementById('sftp-item-count');
    
    if (files.length === 0) {
      content.innerHTML = `
        <div class="sftp-empty">
          <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24" style="opacity: 0.2;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
          </svg>
          <p>This folder is empty</p>
        </div>
      `;
      statusCount.textContent = '0 items';
      return;
    }
    
    files.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
    
    content.innerHTML = `
      <div class="sftp-file-list">
        ${files.map(file => this.renderFileItem(file)).join('')}
      </div>
    `;
    
    statusCount.textContent = `${files.length} item${files.length !== 1 ? 's' : ''}`;
    this.bindFileEvents();
  }
  
  renderFileItem(file) {
    const isDir = file.type === 'directory';
    const icon = this.getFileIcon(file);
    const size = isDir ? '--' : this.formatSize(file.size);
    const modified = this.formatDate(file.modified);
    
    return `
      <div class="sftp-file-item ${isDir ? 'is-directory' : ''}" data-path="${file.path}" data-type="${file.type}" data-name="${file.name}">
        <div class="sftp-file-icon">${icon}</div>
        <div class="sftp-file-name">${file.name}</div>
        <div class="sftp-file-size">${size}</div>
        <div class="sftp-file-date">${modified}</div>
        <div class="sftp-file-actions">
          ${!isDir ? `
            <button type="button" class="sftp-file-btn download-btn" title="Download">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
            </button>
          ` : ''}
          <button type="button" class="sftp-file-btn rename-btn" title="Rename">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          <button type="button" class="sftp-file-btn delete-btn" title="Delete">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }
  
  bindFileEvents() {
    document.querySelectorAll('.sftp-file-item').forEach(item => {
      item.addEventListener('dblclick', () => {
        const type = item.dataset.type;
        const path = item.dataset.path;
        
        if (type === 'directory') {
          this.navigateTo(path);
        } else {
          this.downloadFile(path, item.dataset.name);
        }
      });
      
      item.querySelector('.download-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.downloadFile(item.dataset.path, item.dataset.name);
      });
      
      item.querySelector('.rename-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showRenameDialog(item.dataset.path, item.dataset.name);
      });
      
      item.querySelector('.delete-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteFile(item.dataset.path, item.dataset.name, item.dataset.type === 'directory');
      });
    });
  }
  
  async downloadFile(remotePath, filename) {
    this.setStatus(`Downloading ${filename}...`);
    
    try {
      const result = await window.polar.sftp.download(this.currentSessionId, remotePath);
      this.setStatus(`Downloaded: ${filename}`);
    } catch (e) {
      this.setStatus(`Download failed: ${e.message}`);
    }
  }
  
  async deleteFile(path, name, isDir) {
    const Modal = require('./modals');
    const confirmed = await Modal.confirm({
      title: `Delete ${isDir ? 'Folder' : 'File'}`,
      message: `Are you sure you want to delete "${name}"?${isDir ? ' All contents will be removed.' : ''}`,
      confirmText: 'Delete',
      danger: true
    });
    
    if (!confirmed) return;
    
    try {
      await window.polar.sftp.delete(this.currentSessionId, path, isDir);
      await this.refresh();
      this.setStatus(`Deleted: ${name}`);
    } catch (e) {
      this.setStatus(`Delete failed: ${e.message}`);
    }
  }
  
  async showRenameDialog(path, currentName) {
    const Modal = require('./modals');
    const newName = await Modal.prompt({
      title: 'Rename',
      message: 'Enter new name:',
      defaultValue: currentName,
      placeholder: 'filename'
    });
    
    if (!newName || newName === currentName) return;
    
    try {
      const dirPath = path.substring(0, path.lastIndexOf('/'));
      const newPath = `${dirPath}/${newName}`;
      await window.polar.sftp.rename(this.currentSessionId, path, newPath);
      await this.refresh();
      this.setStatus(`Renamed to: ${newName}`);
    } catch (e) {
      this.setStatus(`Rename failed: ${e.message}`);
    }
  }
  
  async showUploadDialog() {
    try {
      const files = await window.polar.dialog.openFiles();
      if (files && files.length > 0) {
        for (const file of files) {
          await this.uploadFile(file);
        }
        await this.refresh();
      }
    } catch (e) {
      this.setStatus(`Upload failed: ${e.message}`);
    }
  }
  
  async uploadFile(localPath) {
    const session = this.activeSessions.get(this.currentSessionId);
    if (!session) return;
    
    const filename = localPath.split(/[/\\]/).pop();
    this.setStatus(`Uploading ${filename}...`);
    
    try {
      await window.polar.sftp.upload(this.currentSessionId, localPath, session.path);
      this.setStatus(`Uploaded: ${filename}`);
    } catch (e) {
      throw e;
    }
  }
  
  async showNewFolderDialog() {
    const Modal = require('./modals');
    const name = await Modal.prompt({
      title: 'New Folder',
      message: 'Enter folder name:',
      placeholder: 'New Folder'
    });
    
    if (!name) return;
    
    const session = this.activeSessions.get(this.currentSessionId);
    if (!session) return;
    
    try {
      await window.polar.sftp.mkdir(this.currentSessionId, `${session.path}/${name}`);
      await this.refresh();
      this.setStatus(`Created folder: ${name}`);
    } catch (e) {
      this.setStatus(`Failed to create folder: ${e.message}`);
    }
  }
  
  showLoading(message) {
    const content = document.getElementById('sftp-content');
    content.innerHTML = `
      <div class="sftp-loading">
        <div class="sftp-spinner"></div>
        <span>${message}</span>
      </div>
    `;
  }
  
  showError(message) {
    const content = document.getElementById('sftp-content');
    content.innerHTML = `
      <div class="sftp-error">
        <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="color: var(--red);">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <p>${message}</p>
        <button type="button" class="btn-secondary" onclick="document.getElementById('sftp-refresh').click()">Retry</button>
      </div>
    `;
  }
  
  setStatus(text) {
    const statusText = document.getElementById('sftp-status-text');
    if (statusText) statusText.textContent = text;
  }
  
  getFileIcon(file) {
    if (file.type === 'directory') {
      return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color: var(--accent);">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
      </svg>`;
    }
    
    const ext = file.name.split('.').pop()?.toLowerCase();
    const iconColor = this.getFileColor(ext);
    
    return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color: ${iconColor};">
      <path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
    </svg>`;
  }
  
  getFileColor(ext) {
    const colors = {
      js: '#f7df1e', ts: '#3178c6', py: '#3776ab', rb: '#cc342d',
      php: '#777bb4', go: '#00add8', rs: '#dea584', java: '#007396',
      html: '#e34c26', css: '#264de4', json: '#000000', xml: '#f60',
      md: '#083fa1', txt: '#6e7681', sh: '#89e051', yml: '#cb171e',
      yaml: '#cb171e', sql: '#336791', log: '#8b949e'
    };
    return colors[ext] || 'var(--text-muted)';
  }
  
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
  }
  
  formatDate(timestamp) {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

module.exports = new SFTPBrowser();
