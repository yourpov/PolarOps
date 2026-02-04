class PortForwardManager {
  constructor() {
    this.forwards = [];
    this.element = null;
    this.idCounter = 0;
  }
  
  init() {
    this.createPanel();
  }
  
  createPanel() {
    this.element = document.createElement('div');
    this.element.id = 'port-forward-modal';
    this.element.className = 'modal-overlay';
    this.element.style.display = 'none';
    this.element.innerHTML = `
      <div class="modal port-forward-modal">
        <div class="modal-header">
          <h2>
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
            </svg>
            Port Forwarding
          </h2>
          <button type="button" class="modal-close" id="port-forward-close">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="port-forward-form">
            <div class="form-row">
              <div class="form-group" style="flex: 1;">
                <label>Type</label>
                <select id="pf-type" class="form-input">
                  <option value="local">Local → Remote (L)</option>
                  <option value="remote">Remote → Local (R)</option>
                  <option value="dynamic">Dynamic (SOCKS)</option>
                </select>
              </div>
              <div class="form-group" style="flex: 1;">
                <label>Session</label>
                <select id="pf-session" class="form-input">
                  <option value="">Select SSH session</option>
                </select>
              </div>
            </div>
            <div class="form-row" id="pf-ports-row">
              <div class="form-group">
                <label>Local Port</label>
                <input type="number" id="pf-local-port" class="form-input" placeholder="8080" min="1" max="65535">
              </div>
              <div class="form-group pf-arrow">
                <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
                </svg>
              </div>
              <div class="form-group">
                <label>Remote Host</label>
                <input type="text" id="pf-remote-host" class="form-input" placeholder="localhost" value="localhost">
              </div>
              <div class="form-group">
                <label>Remote Port</label>
                <input type="number" id="pf-remote-port" class="form-input" placeholder="80" min="1" max="65535">
              </div>
            </div>
            <button type="button" id="pf-add-btn" class="btn-primary" style="width: 100%;">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              Add Port Forward
            </button>
          </div>
          
          <div class="port-forward-list-header">
            <h3>Active Forwards</h3>
          </div>
          <div class="port-forward-list" id="pf-list">
            <div class="port-forward-empty">
              <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24" style="opacity: 0.3;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
              </svg>
              <p>No active port forwards</p>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.element);
    this.bindEvents();
  }
  
  bindEvents() {
    document.getElementById('port-forward-close')?.addEventListener('click', () => this.hide());
    document.getElementById('pf-add-btn')?.addEventListener('click', () => this.addForward());
    
    document.getElementById('pf-type')?.addEventListener('change', (e) => {
      const portsRow = document.getElementById('pf-ports-row');
      if (e.target.value === 'dynamic') {
        portsRow.innerHTML = `
          <div class="form-group" style="width: 100%;">
            <label>Local SOCKS Port</label>
            <input type="number" id="pf-local-port" class="form-input" placeholder="1080" min="1" max="65535" value="1080">
          </div>
        `;
      } else {
        this.resetPortsRow(e.target.value === 'remote');
      }
    });
    
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.hide();
    });
  }
  
  resetPortsRow(isRemote) {
    const portsRow = document.getElementById('pf-ports-row');
    const arrowDirection = isRemote ? 'M10 19l-7-7m0 0l7-7m-7 7h18' : 'M14 5l7 7m0 0l-7 7m7-7H3';
    
    portsRow.innerHTML = `
      <div class="form-group">
        <label>Local Port</label>
        <input type="number" id="pf-local-port" class="form-input" placeholder="8080" min="1" max="65535">
      </div>
      <div class="form-group pf-arrow">
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="${arrowDirection}"/>
        </svg>
      </div>
      <div class="form-group">
        <label>Remote Host</label>
        <input type="text" id="pf-remote-host" class="form-input" placeholder="localhost" value="localhost">
      </div>
      <div class="form-group">
        <label>Remote Port</label>
        <input type="number" id="pf-remote-port" class="form-input" placeholder="80" min="1" max="65535">
      </div>
    `;
  }
  
  show() {
    this.element.style.display = 'flex';
    this.updateSessionList();
    this.renderList();
  }
  
  hide() {
    this.element.style.display = 'none';
  }
  
  updateSessionList() {
    const State = require('./state');
    const select = document.getElementById('pf-session');
    
    select.innerHTML = '<option value="">Select SSH session</option>';
    
    State.sessions.forEach((session, id) => {
      if (session.type === 'ssh') {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = session.name;
        select.appendChild(option);
      }
    });
  }
  
  async addForward() {
    const type = document.getElementById('pf-type').value;
    const sessionId = document.getElementById('pf-session').value;
    const localPort = parseInt(document.getElementById('pf-local-port').value);
    const remoteHost = document.getElementById('pf-remote-host')?.value || 'localhost';
    const remotePort = parseInt(document.getElementById('pf-remote-port')?.value);
    
    if (!sessionId) {
      alert('Please select an SSH session');
      return;
    }
    
    if (!localPort || (type !== 'dynamic' && !remotePort)) {
      alert('Please fill in all port fields');
      return;
    }
    
    const forward = {
      id: ++this.idCounter,
      sessionId: parseInt(sessionId),
      type,
      localPort,
      remoteHost: type === 'dynamic' ? null : remoteHost,
      remotePort: type === 'dynamic' ? null : remotePort,
      status: 'connecting'
    };
    
    this.forwards.push(forward);
    this.renderList();
    
    try {
      await window.polar.ssh.forward(sessionId, forward);
      forward.status = 'active';
      this.renderList();
    } catch (e) {
      forward.status = 'error';
      forward.error = e.message;
      this.renderList();
    }
  }
  
  async removeForward(forwardId) {
    const forward = this.forwards.find(f => f.id === forwardId);
    if (!forward) return;
    
    try {
      await window.polar.ssh.unforward(forward.sessionId, forward);
    } catch (e) {
      console.error('[PolarOps/PortFwd] Failed to remove:', e);
    }
    
    this.forwards = this.forwards.filter(f => f.id !== forwardId);
    this.renderList();
  }
  
  renderList() {
    const list = document.getElementById('pf-list');
    
    if (this.forwards.length === 0) {
      list.innerHTML = `
        <div class="port-forward-empty">
          <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24" style="opacity: 0.3;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
          </svg>
          <p>No active port forwards</p>
        </div>
      `;
      return;
    }
    
    list.innerHTML = this.forwards.map(fwd => `
      <div class="port-forward-item ${fwd.status}">
        <div class="pf-status">
          ${this.getStatusIcon(fwd.status)}
        </div>
        <div class="pf-info">
          <div class="pf-type">${this.getTypeLabel(fwd.type)}</div>
          <div class="pf-ports">
            ${fwd.type === 'dynamic' 
              ? `localhost:${fwd.localPort} (SOCKS)`
              : `localhost:${fwd.localPort} → ${fwd.remoteHost}:${fwd.remotePort}`
            }
          </div>
        </div>
        <button type="button" class="pf-remove-btn" data-forward-id="${fwd.id}" title="Remove">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `).join('');
    
    list.querySelectorAll('.pf-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeForward(parseInt(btn.dataset.forwardId));
      });
    });
  }
  
  getStatusIcon(status) {
    switch (status) {
      case 'active':
        return `<div class="pf-status-dot active" title="Active"></div>`;
      case 'connecting':
        return `<div class="pf-status-dot connecting" title="Connecting..."></div>`;
      case 'error':
        return `<div class="pf-status-dot error" title="Error"></div>`;
      default:
        return `<div class="pf-status-dot" title="Unknown"></div>`;
    }
  }
  
  getTypeLabel(type) {
    switch (type) {
      case 'local': return 'Local Forward';
      case 'remote': return 'Remote Forward';
      case 'dynamic': return 'Dynamic (SOCKS)';
      default: return type;
    }
  }
  
  getForwardsBySession(sessionId) {
    return this.forwards.filter(f => f.sessionId === sessionId);
  }
  
  removeForwardsBySession(sessionId) {
    this.forwards = this.forwards.filter(f => f.sessionId !== sessionId);
  }
}

module.exports = new PortForwardManager();
