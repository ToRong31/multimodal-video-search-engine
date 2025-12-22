/**
 * Create draggable QA input modal
 */
export function createDraggableQAModal() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10002;pointer-events:none;';
  
  const modal = document.createElement('div');
  modal.className = 'qa-modal';
  modal.style.cssText = 'position:fixed;top:20px;left:20px;background:#1a1a1a;border-radius:8px;padding:0;width:400px;box-shadow:0 8px 24px rgba(0,0,0,0.6);color:#fff;border:2px solid #f093fb;pointer-events:auto;';
  
  modal.innerHTML = `
    <div class="qa-header" style="background:linear-gradient(135deg, #f093fb 0%, #f5576c 100%);padding:10px 16px;border-radius:6px 6px 0 0;cursor:move;user-select:none;display:flex;justify-content:space-between;align-items:center;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:18px;">❓</span>
        <span style="font-weight:600;font-size:14px;">QA Answer</span>
      </div>
    </div>
    
    <div style="padding:16px;">
      <input type="text" class="qa-input" 
             placeholder="Enter your answer (e.g., YES, NO)" 
             style="width:100%;padding:10px;background:#2a2a2a;border:1px solid #444;border-radius:6px;color:#fff;font-size:14px;outline:none;font-family:inherit;"
      />
      
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="qa-submit" style="flex:1;background:linear-gradient(135deg, #f093fb 0%, #f5576c 100%);color:#fff;border:0;padding:8px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;transition:all 0.2s;">
          Submit
        </button>
        <button class="qa-cancel" style="background:#2a2a2a;color:#aaa;border:1px solid #444;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:500;font-size:13px;transition:all 0.2s;">
          Cancel
        </button>
      </div>
    </div>
  `;
  
  overlay.appendChild(modal);
  
  // Make modal draggable
  const header = modal.querySelector('.qa-header');
  let isDragging = false;
  let startX, startY, modalX, modalY;
  
  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = modal.getBoundingClientRect();
    modalX = rect.left;
    modalY = rect.top;
    
    header.style.cursor = 'grabbing';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    const newX = modalX + deltaX;
    const newY = modalY + deltaY;
    
    // Keep modal within viewport
    const maxX = window.innerWidth - modal.offsetWidth;
    const maxY = window.innerHeight - modal.offsetHeight;
    
    modal.style.left = Math.max(0, Math.min(newX, maxX)) + 'px';
    modal.style.top = Math.max(0, Math.min(newY, maxY)) + 'px';
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = 'move';
    }
  });
  
  // Hover effects
  const submitBtn = modal.querySelector('.qa-submit');
  const cancelBtn = modal.querySelector('.qa-cancel');
  
  submitBtn.addEventListener('mouseenter', () => {
    submitBtn.style.transform = 'translateY(-1px)';
    submitBtn.style.boxShadow = '0 4px 12px rgba(240,147,251,0.4)';
  });
  
  submitBtn.addEventListener('mouseleave', () => {
    submitBtn.style.transform = 'translateY(0)';
    submitBtn.style.boxShadow = 'none';
  });
  
  cancelBtn.addEventListener('mouseenter', () => {
    cancelBtn.style.background = '#333';
    cancelBtn.style.color = '#fff';
  });
  
  cancelBtn.addEventListener('mouseleave', () => {
    cancelBtn.style.background = '#2a2a2a';
    cancelBtn.style.color = '#aaa';
  });
  
  // Close on ESC key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      const cancelBtn = modal.querySelector('.qa-cancel');
      cancelBtn.click();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
  
  return overlay;
}