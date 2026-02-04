const fs = require('fs');
const path = require('path');
const os = require('os');

class SSHKeyManager {
  constructor() {
    this.keys = [];
    this.sshDir = path.join(os.homedir(), '.ssh');
    this.element = null;
  }
  
  init() {
    this.createPanel();
    this.loadKeys();
  }
  
  createPanel() {
    this.element = document.createElement('div');
    this.element.id = 'ssh-key-modal';
    this.element.className = 'modal-overlay';
    this.element.style.display = 'none';
    this.element.innerHTML = `
      <div class="modal ssh-key-modal">
        <div class="modal-header">
          <h2>
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
            SSH Key Manager
          </h2>
          <button type="button" class="modal-close" id="ssh-key-close">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="ssh-key-info">
            <div class="ssh-key-path">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
              </svg>
              <span>${this.sshDir}</span>
              <button type="button" id="ssh-key-open-folder" class="btn-icon" title="Open folder">
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
              </button>
            </div>
          </div>
          
          <div class="ssh-key-actions">
            <button type="button" id="ssh-key-generate" class="btn-primary">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              Generate New Key
            </button>
            <button type="button" id="ssh-key-import" class="btn-secondary">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
              Import Key
            </button>
            <button type="button" id="ssh-key-refresh" class="btn-secondary">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              Refresh
            </button>
          </div>
          
          <div class="ssh-key-list" id="ssh-key-list">
            <div class="ssh-key-loading">Loading keys...</div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.element);
    this.bindEvents();
  }
  
  bindEvents() {
    document.getElementById('ssh-key-close')?.addEventListener('click', () => this.hide());
    document.getElementById('ssh-key-generate')?.addEventListener('click', () => this.showGenerateDialog());
    document.getElementById('ssh-key-import')?.addEventListener('click', () => this.importKey());
    document.getElementById('ssh-key-refresh')?.addEventListener('click', () => this.loadKeys());
    document.getElementById('ssh-key-open-folder')?.addEventListener('click', () => this.openSSHFolder());
    
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.hide();
    });
  }
  
  show() {
    this.element.style.display = 'flex';
    this.loadKeys();
  }
  
  hide() {
    this.element.style.display = 'none';
  }
  
  async loadKeys() {
    const list = document.getElementById('ssh-key-list');
    list.innerHTML = '<div class="ssh-key-loading">Loading keys...</div>';
    
    try {
      if (!fs.existsSync(this.sshDir)) {
        list.innerHTML = `
          <div class="ssh-key-empty">
            <p>SSH directory not found</p>
            <button type="button" id="create-ssh-dir" class="btn-secondary">Create .ssh directory</button>
          </div>
        `;
        document.getElementById('create-ssh-dir')?.addEventListener('click', () => {
          fs.mkdirSync(this.sshDir, { mode: 0o700 });
          this.loadKeys();
        });
        return;
      }
      
      const files = fs.readdirSync(this.sshDir);
      
      this.keys = files
        .filter(f => f.endsWith('.pub'))
        .map(pubFile => {
          const name = pubFile.replace('.pub', '');
          const privPath = path.join(this.sshDir, name);
          const pubPath = path.join(this.sshDir, pubFile);
          
          let pubContent = '';
          let keyType = 'unknown';
          let fingerprint = '';
          
          try {
            pubContent = fs.readFileSync(pubPath, 'utf8').trim();
            const parts = pubContent.split(' ');
            keyType = parts[0]?.replace('ssh-', '').toUpperCase() || 'unknown';
          } catch (e) {}
          
          const hasPrivate = fs.existsSync(privPath);
          
          return {
            name,
            pubPath,
            privPath: hasPrivate ? privPath : null,
            keyType,
            pubContent,
            hasPrivate
          };
        });
      
      this.renderKeyList();
    } catch (e) {
      list.innerHTML = `<div class="ssh-key-error">Failed to load keys: ${e.message}</div>`;
    }
  }
  
  renderKeyList() {
    const list = document.getElementById('ssh-key-list');
    
    if (this.keys.length === 0) {
      list.innerHTML = `
        <div class="ssh-key-empty">
          <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24" style="opacity: 0.3;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
          </svg>
          <p>No SSH keys found</p>
          <p style="font-size: 11px; color: var(--text-muted);">Generate a new key or import an existing one</p>
        </div>
      `;
      return;
    }
    
    list.innerHTML = this.keys.map(key => `
      <div class="ssh-key-item">
        <div class="ssh-key-icon">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
          </svg>
        </div>
        <div class="ssh-key-details">
          <div class="ssh-key-name">${key.name}</div>
          <div class="ssh-key-meta">
            <span class="ssh-key-type">${key.keyType}</span>
            ${key.hasPrivate ? '<span class="ssh-key-has-private">Has private key</span>' : '<span class="ssh-key-pub-only">Public only</span>'}
          </div>
        </div>
        <div class="ssh-key-actions-inline">
          <button type="button" class="ssh-key-btn copy-pub-btn" data-key="${key.name}" title="Copy public key">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
          </button>
          <button type="button" class="ssh-key-btn view-btn" data-key="${key.name}" title="View public key">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
          </button>
          <button type="button" class="ssh-key-btn delete-btn" data-key="${key.name}" title="Delete key">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');
    
    list.querySelectorAll('.copy-pub-btn').forEach(btn => {
      btn.addEventListener('click', () => this.copyPublicKey(btn.dataset.key));
    });
    
    list.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => this.viewPublicKey(btn.dataset.key));
    });
    
    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteKey(btn.dataset.key));
    });
  }
  
  async copyPublicKey(keyName) {
    const key = this.keys.find(k => k.name === keyName);
    if (!key) return;
    
    try {
      await navigator.clipboard.writeText(key.pubContent);
      const btn = document.querySelector(`.copy-pub-btn[data-key="${keyName}"]`);
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1000);
    } catch (e) {
      alert('Failed to copy: ' + e.message);
    }
  }
  
  viewPublicKey(keyName) {
    const key = this.keys.find(k => k.name === keyName);
    if (!key) return;
    
    const Modal = require('./modals');
    Modal.alert({
      title: `Public Key: ${keyName}`,
      message: `<pre style="font-size: 10px; word-break: break-all; white-space: pre-wrap; max-height: 200px; overflow: auto; background: var(--bg); padding: 12px; border-radius: 6px;">${key.pubContent}</pre>`,
      html: true
    });
  }
  
  async deleteKey(keyName) {
    const key = this.keys.find(k => k.name === keyName);
    if (!key) return;
    
    const Modal = require('./modals');
    const confirmed = await Modal.confirm({
      title: 'Delete SSH Key',
      message: `Are you sure you want to delete "${keyName}"? This will remove both public and private key files.`,
      confirmText: 'Delete',
      danger: true
    });
    
    if (!confirmed) return;
    
    try {
      if (fs.existsSync(key.pubPath)) fs.unlinkSync(key.pubPath);
      if (key.privPath && fs.existsSync(key.privPath)) fs.unlinkSync(key.privPath);
      this.loadKeys();
    } catch (e) {
      alert('Failed to delete key: ' + e.message);
    }
  }
  
  async showGenerateDialog() {
    const Modal = require('./modals');
    
    const keyName = await Modal.prompt({
      title: 'Generate SSH Key',
      message: 'Enter a name for the new key:',
      defaultValue: 'id_ed25519',
      placeholder: 'key_name'
    });
    
    if (!keyName) return;
    
    try {
      await window.polar.ssh.generateKey({
        name: keyName,
        type: 'ed25519',
        path: this.sshDir
      });
      
      this.loadKeys();
    } catch (e) {
      alert('Failed to generate key: ' + e.message);
    }
  }
  
  async importKey() {
    try {
      const files = await window.polar.dialog.openFiles({
        title: 'Import SSH Key',
        filters: [
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (!files || files.length === 0) return;
      
      for (const file of files) {
        const filename = path.basename(file);
        const destPath = path.join(this.sshDir, filename);
        
        if (fs.existsSync(destPath)) {
          const Modal = require('./modals');
          const overwrite = await Modal.confirm({
            title: 'File Exists',
            message: `${filename} already exists. Overwrite?`,
            confirmText: 'Overwrite',
            danger: true
          });
          if (!overwrite) continue;
        }
        
        fs.copyFileSync(file, destPath);
        if (!filename.endsWith('.pub')) {
          fs.chmodSync(destPath, 0o600);
        }
      }
      
      this.loadKeys();
    } catch (e) {
      alert('Failed to import key: ' + e.message);
    }
  }
  
  async openSSHFolder() {
    await window.polar.shell.openPath(this.sshDir);
  }
  
  getKeyForServer(serverConfig) {
    const defaultKeys = ['id_ed25519', 'id_rsa', 'id_ecdsa', 'id_dsa'];
    
    for (const keyName of defaultKeys) {
      const key = this.keys.find(k => k.name === keyName && k.hasPrivate);
      if (key) return key.privPath;
    }
    
    return null;
  }
}

module.exports = new SSHKeyManager();
