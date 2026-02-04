class ModalManager {
  constructor() {
    this.activeModals = [];
  }
  
  confirm(options) {
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
      if (options.type === 'warning' || options.danger) {
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
      
      const handleKeydown = (e) => {
        if (e.key === 'Escape') handleCancel();
        if (e.key === 'Enter') handleConfirm();
      };
      
      const cleanup = () => {
        okBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        document.removeEventListener('keydown', handleKeydown);
      };
      
      okBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      document.addEventListener('keydown', handleKeydown);
    });
  }
  
  alert(options) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.display = 'flex';
      overlay.innerHTML = `
        <div class="modal modal-alert">
          <div class="modal-header">
            <h2>${options.title || 'Notice'}</h2>
            <button type="button" class="modal-close alert-close">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            ${options.html ? options.message : `<p>${options.message}</p>`}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-primary alert-ok">OK</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(overlay);
      
      const close = () => {
        overlay.remove();
        resolve();
      };
      
      overlay.querySelector('.alert-close').addEventListener('click', close);
      overlay.querySelector('.alert-ok').addEventListener('click', close);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
    });
  }
  
  prompt(options) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.display = 'flex';
      overlay.innerHTML = `
        <div class="modal modal-prompt">
          <div class="modal-header">
            <h2>${options.title || 'Input'}</h2>
            <button type="button" class="modal-close prompt-close">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <p>${options.message || ''}</p>
            <input type="text" class="form-input prompt-input" value="${options.defaultValue || ''}" placeholder="${options.placeholder || ''}" style="width: 100%; margin-top: 12px;">
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary prompt-cancel">Cancel</button>
            <button type="button" class="btn-primary prompt-ok">OK</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(overlay);
      
      const input = overlay.querySelector('.prompt-input');
      input.focus();
      input.select();
      
      const confirm = () => {
        overlay.remove();
        resolve(input.value);
      };
      
      const cancel = () => {
        overlay.remove();
        resolve(null);
      };
      
      overlay.querySelector('.prompt-close').addEventListener('click', cancel);
      overlay.querySelector('.prompt-cancel').addEventListener('click', cancel);
      overlay.querySelector('.prompt-ok').addEventListener('click', confirm);
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirm();
        if (e.key === 'Escape') cancel();
      });
      
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cancel();
      });
    });
  }
  
  toast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-message">${message}</span>
      <button type="button" class="toast-close">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    `;
    
    container.appendChild(toast);
    
    const remove = () => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 200);
    };
    
    toast.querySelector('.toast-close').addEventListener('click', remove);
    setTimeout(remove, duration);
  }
}

module.exports = new ModalManager();
