class BroadcastManager {
  constructor() {
    this.active = false;
    this.element = null;
    this.inputElement = null;
    this.targetSessions = new Set();
  }
  
  init() {
    this.createBroadcastBar();
    this.bindKeyboard();
  }
  
  createBroadcastBar() {
    this.element = document.createElement('div');
    this.element.id = 'broadcast-bar';
    this.element.className = 'broadcast-bar';
    this.element.style.display = 'none';
    this.element.innerHTML = `
      <div class="broadcast-indicator">
        <svg class="broadcast-icon pulse" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
        </svg>
        <span class="broadcast-label">BROADCAST MODE</span>
        <span class="broadcast-count" id="broadcast-count">0 terminals</span>
      </div>
      <div class="broadcast-input-wrapper">
        <input type="text" id="broadcast-input" placeholder="Type command to send to all terminals..." autocomplete="off" spellcheck="false">
      </div>
      <div class="broadcast-actions">
        <button type="button" id="broadcast-send" class="broadcast-send-btn" title="Send (Enter)">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
          </svg>
          Send
        </button>
        <button type="button" id="broadcast-close" class="broadcast-close-btn" title="Exit broadcast mode (Esc)">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `;
    
    const container = document.getElementById('main-content') || document.body;
    container.insertBefore(this.element, container.firstChild);
    
    this.inputElement = document.getElementById('broadcast-input');
    this.bindEvents();
  }
  
  bindEvents() {
    const input = this.inputElement;
    const sendBtn = document.getElementById('broadcast-send');
    const closeBtn = document.getElementById('broadcast-close');
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendCommand();
      } else if (e.key === 'Escape') {
        this.hide();
      }
    });
    
    sendBtn.addEventListener('click', () => this.sendCommand());
    closeBtn.addEventListener('click', () => this.hide());
  }
  
  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'B' && !e.target.closest('input, textarea, select')) {
        e.preventDefault();
        this.toggle();
      }
    });
  }
  
  show() {
    const State = require('./state');
    
    if (State.sessions.size === 0) {
      console.warn('[PolarOps/Broadcast] No active sessions');
      return;
    }
    
    this.active = true;
    this.targetSessions = new Set(State.sessions.keys());
    this.element.style.display = 'flex';
    this.inputElement.focus();
    this.updateCount();
    
    this.highlightTargets(true);
  }
  
  hide() {
    this.active = false;
    this.element.style.display = 'none';
    this.inputElement.value = '';
    this.highlightTargets(false);
  }
  
  toggle() {
    if (this.active) {
      this.hide();
    } else {
      this.show();
    }
  }
  
  updateCount() {
    const countEl = document.getElementById('broadcast-count');
    if (countEl) {
      const count = this.targetSessions.size;
      countEl.textContent = `${count} terminal${count !== 1 ? 's' : ''}`;
    }
  }
  
  highlightTargets(highlight) {
    this.targetSessions.forEach(sessionId => {
      const tab = document.getElementById(`tab-${sessionId}`);
      const sessionItem = document.getElementById(`session-${sessionId}`);
      
      if (highlight) {
        tab?.classList.add('broadcast-target');
        sessionItem?.classList.add('broadcast-target');
      } else {
        tab?.classList.remove('broadcast-target');
        sessionItem?.classList.remove('broadcast-target');
      }
    });
  }
  
  sendCommand() {
    const State = require('./state');
    const command = this.inputElement.value;
    
    if (!command) return;
    
    this.targetSessions.forEach(sessionId => {
      const session = State.sessions.get(sessionId);
      if (!session) return;
      
      const fullCommand = command + '\r';
      
      if (session.type === 'local') {
        window.polar.terminal.write(sessionId, fullCommand);
      } else if (session.type === 'ssh') {
        window.polar.ssh.write(sessionId, fullCommand);
      }
    });
    
    this.inputElement.value = '';
    
    this.element.classList.add('sent');
    setTimeout(() => this.element.classList.remove('sent'), 200);
  }
  
  toggleSession(sessionId) {
    if (this.targetSessions.has(sessionId)) {
      this.targetSessions.delete(sessionId);
    } else {
      this.targetSessions.add(sessionId);
    }
    
    this.updateCount();
    this.highlightTargets(true);
  }
}

module.exports = new BroadcastManager();
