/**
 * HandleShortcut.js
 * Handles keyboard shortcuts for the application
 */

// Global variables to track initialization state and prevent duplicates
let isInitialized = false;
let activeEventListeners = [];

/**
 * Initialize keyboard shortcuts
 */
export function initializeShortcuts() {
  if (isInitialized) return;
  
  
  
  // Add global keyboard event listener
  document.addEventListener('keydown', handleGlobalKeydown);
  activeEventListeners.push({ 
    element: document, 
    event: 'keydown', 
    handler: handleGlobalKeydown 
  });
  
  isInitialized = true;
  
}

/**
 * Handle global keyboard events
 */
function handleGlobalKeydown(event) {
  // Enter key: Click Search button
  if (event.key === 'Enter') {
    // If focus is in the chat message input, let chatbox handle Enter
    const messageInput = document.getElementById('messageInput');
    if (messageInput && (event.target === messageInput || document.activeElement === messageInput)) {
      return;
    }

    // Only handle Enter if not in a textarea or contenteditable
    if (event.target.tagName !== 'TEXTAREA' && 
        !event.target.isContentEditable &&
        event.target.type !== 'textarea') {
      
      
      event.preventDefault();
      
      const searchBtn = document.querySelector('#btnSearch');
      if (searchBtn && !searchBtn.disabled) {
        
        searchBtn.click();
      } else {
        console.log('❌ Search button not found or disabled');
      }
    }
  }

  // ESC key: Close overview/modal if open
  if (event.key === 'Escape') {
    // 1) Close YouTube preview modal if visible
    const ytOverlay = document.querySelector('.yt-preview-overlay');
    if (ytOverlay) {
      event.preventDefault();
      const closeBtn = ytOverlay.querySelector('button');
      if (closeBtn) closeBtn.click();
      return;
    }

    // 2) Close any generic image modal if used by overview
    const imageModal = document.getElementById('imageModal');
    if (imageModal && imageModal.style.display !== 'none') {
      event.preventDefault();
      const closeSpan = imageModal.querySelector('.close-modal');
      if (closeSpan) closeSpan.click();
      return;
    }
  }
  
  // Ctrl + Backspace: Click Clear button
  if (event.ctrlKey && event.key === 'Backspace') {
    
    event.preventDefault();
    
    const clearBtn = document.querySelector('#btnClear');
    if (clearBtn) {
      
      clearBtn.click();
    } else {
      console.log('❌ Clear button not found');
    }
  }
}

/**
 * Cleanup existing event listeners
 */
function cleanup() {
  activeEventListeners.forEach(({ element, event, handler }) => {
    element.removeEventListener(event, handler);
  });
  activeEventListeners = [];
}

/**
 * Re-initialize shortcuts
 */
export function reinitializeShortcuts() {
  if (isInitialized) {
    cleanup();
    isInitialized = false;
  }
  
  initializeShortcuts();
}

/**
 * Check if shortcuts are initialized
 */
export function isShortcutsInitialized() {
  return isInitialized;
}

export function closeAllImageModals() {
  // Close YouTube Preview modal by clicking Close button
  const ytPreviewModal = document.querySelector('.yt-preview-modal, .youtube-preview-modal, [class*="youtube"], [class*="preview"]');
  if (ytPreviewModal) {
    const closeBtn = ytPreviewModal.querySelector('button:contains("Close"), .close, [class*="close"]');
    if (closeBtn) {
      closeBtn.click();
      return true; // Đã đóng được YouTube Preview
    }
  }

  // Close image detail modal (overview của ảnh)
  const imageDetailModal = document.querySelector('.image-detail-modal');
  if (imageDetailModal && imageDetailModal.style.display !== 'none') {
    imageDetailModal.style.display = 'none';
    return true; // Đã đóng được modal
  }

  // Close any other image overview/modal that might be open
  const allImageModals = document.querySelectorAll('.image-detail-modal, .image-modal, .overview-modal');
  let closedAny = false;
  allImageModals.forEach(modal => {
    if (modal.style.display !== 'none') {
      modal.style.display = 'none';
      closedAny = true;
    }
  });

  return closedAny; // Trả về true nếu đã đóng được modal nào đó
}
export function registerTranslateShortcut() {
  document.addEventListener('keydown', function(e) {
    // Kiểm tra nếu đang nhập liệu trong input hoặc textarea thì không kích hoạt phím tắt
    const activeElement = document.activeElement;
    const isInput = activeElement.tagName === 'INPUT' || 
                    activeElement.tagName === 'TEXTAREA' || 
                    activeElement.isContentEditable;

    // Shift + ` để toggle translate mode
    if (e.key === '~' && e.shiftKey && !isInput) {
      e.preventDefault();
      
      // Tìm và toggle checkbox translate
      const translateSwitch = document.getElementById('chkTranslate');
      if (translateSwitch) {
        translateSwitch.checked = !translateSwitch.checked;
        
        // Kích hoạt sự kiện change để cập nhật UI và các biến liên quan
        translateSwitch.dispatchEvent(new Event('change'));
        
        // Hiển thị thông báo nhỏ
        const mode = !translateSwitch.checked ? 'Translate' : 'Origin';
        showToast(`Switched to ${mode} mode`);
      }
    }
  });
}

// Hiển thị thông báo nhỏ khi chuyển chế độ
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'shortcut-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    z-index: 10000;
    font-size: 14px;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;
  
  document.body.appendChild(toast);
  
  // Hiển thị và sau đó biến mất
  setTimeout(() => { toast.style.opacity = '1'; }, 10);
  setTimeout(() => { 
    toast.style.opacity = '0'; 
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}