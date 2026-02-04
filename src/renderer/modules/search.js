const { SearchAddon } = require('xterm-addon-search');

class TerminalSearch {
  constructor() {
    this.activeSession = null;
    this.searchAddon = null;
    this.matches = [];
    this.currentIndex = -1;
    this.visible = false;
    this.element = null;
    this.inputElement = null;
  }
  
  init() {
    this.createSearchBar();
    this.bindKeyboard();
  }
  
  createSearchBar() {
    this.element = document.createElement('div');
    this.element.id = 'terminal-search-bar';
    this.element.className = 'terminal-search-bar';
    this.element.style.display = 'none';
    this.element.innerHTML = `
      <div class="search-input-wrapper">
        <svg class="search-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input type="text" id="terminal-search-input" placeholder="Find in terminal..." autocomplete="off" spellcheck="false">
        <span class="search-match-count" id="search-match-count"></span>
      </div>
      <div class="search-buttons">
        <button type="button" id="search-prev" class="search-nav-btn" title="Previous (Shift+Enter)">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/>
          </svg>
        </button>
        <button type="button" id="search-next" class="search-nav-btn" title="Next (Enter)">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
        <label class="search-option" title="Match case">
          <input type="checkbox" id="search-case-sensitive">
          <span>Aa</span>
        </label>
        <label class="search-option" title="Use regex">
          <input type="checkbox" id="search-regex">
          <span>.*</span>
        </label>
        <button type="button" id="search-close" class="search-close-btn" title="Close (Esc)">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `;
    
    const terminalContainer = document.getElementById('terminal-container');
    if (terminalContainer) {
      terminalContainer.appendChild(this.element);
    }
    
    this.inputElement = document.getElementById('terminal-search-input');
    this.bindEvents();
  }
  
  bindEvents() {
    const input = this.inputElement;
    const prevBtn = document.getElementById('search-prev');
    const nextBtn = document.getElementById('search-next');
    const closeBtn = document.getElementById('search-close');
    const caseCheck = document.getElementById('search-case-sensitive');
    const regexCheck = document.getElementById('search-regex');
    
    input.addEventListener('input', () => this.onSearch());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        this.findPrevious();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.findNext();
      } else if (e.key === 'Escape') {
        this.hide();
      }
    });
    
    prevBtn.addEventListener('click', () => this.findPrevious());
    nextBtn.addEventListener('click', () => this.findNext());
    closeBtn.addEventListener('click', () => this.hide());
    caseCheck.addEventListener('change', () => this.onSearch());
    regexCheck.addEventListener('change', () => this.onSearch());
  }
  
  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'f' && !e.target.closest('input, textarea, select')) {
        e.preventDefault();
        this.show();
      }
    });
  }
  
  attachToSession(session) {
    if (!session || !session.terminal) return;
    
    if (!session.searchAddon) {
      session.searchAddon = new SearchAddon();
      session.terminal.loadAddon(session.searchAddon);
    }
    
    this.activeSession = session;
    this.searchAddon = session.searchAddon;
  }
  
  show() {
    const State = require('./state');
    const session = State.getActiveSession();
    
    if (!session) return;
    
    this.attachToSession(session);
    this.element.style.display = 'flex';
    this.visible = true;
    this.inputElement.focus();
    this.inputElement.select();
    
    if (this.inputElement.value) {
      this.onSearch();
    }
  }
  
  hide() {
    this.element.style.display = 'none';
    this.visible = false;
    this.clearHighlights();
    
    if (this.activeSession && this.activeSession.terminal) {
      this.activeSession.terminal.focus();
    }
  }
  
  onSearch() {
    const query = this.inputElement.value;
    if (!query || !this.searchAddon) {
      this.updateMatchCount(0, 0);
      return;
    }
    
    const options = {
      caseSensitive: document.getElementById('search-case-sensitive').checked,
      regex: document.getElementById('search-regex').checked,
      decorations: {
        matchBackground: '#ffd33d40',
        matchBorder: '#ffd33d',
        activeMatchBackground: '#ffd33d80',
        activeMatchBorder: '#ffd33d'
      }
    };
    
    const found = this.searchAddon.findNext(query, options);
    this.updateMatchCount(found ? 1 : 0, found ? '?' : 0);
  }
  
  findNext() {
    const query = this.inputElement.value;
    if (!query || !this.searchAddon) return;
    
    const options = {
      caseSensitive: document.getElementById('search-case-sensitive').checked,
      regex: document.getElementById('search-regex').checked
    };
    
    this.searchAddon.findNext(query, options);
  }
  
  findPrevious() {
    const query = this.inputElement.value;
    if (!query || !this.searchAddon) return;
    
    const options = {
      caseSensitive: document.getElementById('search-case-sensitive').checked,
      regex: document.getElementById('search-regex').checked
    };
    
    this.searchAddon.findPrevious(query, options);
  }
  
  clearHighlights() {
    if (this.searchAddon) {
      this.searchAddon.clearDecorations();
    }
  }
  
  updateMatchCount(current, total) {
    const countEl = document.getElementById('search-match-count');
    if (countEl) {
      if (total === 0 && this.inputElement.value) {
        countEl.textContent = 'No results';
        countEl.style.color = 'var(--red)';
      } else if (total > 0) {
        countEl.textContent = `${current} of ${total}`;
        countEl.style.color = 'var(--text-muted)';
      } else {
        countEl.textContent = '';
      }
    }
  }
}

module.exports = new TerminalSearch();
