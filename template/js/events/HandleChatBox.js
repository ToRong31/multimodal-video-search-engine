// HandleChatBox.js - Chatbox event handlers and functionality
import { getWatchUrlForFolder } from '../api/search.js';

let currentChatId = 'default';
let chatHistory = {};

// Initialize chatbox functionality
export function initializeChatbox() {
  console.log('🔧 Initializing chatbox...');
  
  // Check if chat elements exist
  const chatButton = document.getElementById('chatButton');
  const chatBox = document.getElementById('chatBox');
  const closeChat = document.getElementById('closeChat');
  const messageInput = document.getElementById('messageInput');
  const sendMessage = document.getElementById('sendMessage');
  const chatMessages = document.getElementById('chatMessages');
  const chatHistorySelect = document.getElementById('chatHistorySelect');
  const newChatBtn = document.getElementById('newChatBtn');
  
  if (!chatButton || !chatBox) {
    console.error('❌ Chat elements not found:', { chatButton: !!chatButton, chatBox: !!chatBox });
    return;
  }
  

  
  // Load chat history when page loads
  loadChatHistory();
  
  // Add chat button click handler
  chatButton.addEventListener('click', function() {

    
    chatBox.classList.toggle('active');

    
    if (chatBox.classList.contains('active')) {
      // Force display flex
      chatBox.style.display = 'flex';
      if (messageInput) messageInput.focus();
    } else {
      // Force display none
      chatBox.style.display = 'none';
    }
  });
  
  // Add close button handler
  if (closeChat) {
    closeChat.addEventListener('click', function() {
      chatBox.classList.remove('active');
      chatBox.style.display = 'none';
      console.log('🔧 Chat box closed and forced to none');
    });
  }
  
  // Add send message button handler
  if (sendMessage) {
    sendMessage.addEventListener('click', sendChatMessage);
  }
  
  // Add Enter key handler for message input
  if (messageInput) {
    messageInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        sendChatMessage();
      }
    });
  }
  
  // Add chat history selection handler
  if (chatHistorySelect) {
    chatHistorySelect.addEventListener('change', function(e) {
      // Save current chat state
      saveChatState();
      
      // Switch to new chat
      currentChatId = e.target.value;
      chatMessages.innerHTML = '';
      
      // Load selected chat content
      if (chatHistory[currentChatId] && chatHistory[currentChatId].messages) {
        chatMessages.innerHTML = chatHistory[currentChatId].messages;
        // Reattach click handlers for images
        const savedImageMessages = chatMessages.querySelectorAll('.chat-image-message');
        savedImageMessages.forEach(msg => {
          const img = msg.querySelector('img');
          if (img) {
            msg.addEventListener('click', async function(e) {
              if (e.target.closest('.delete-message-btn') || e.target.closest('.chat-image-info')) return;
              const folderName = img.getAttribute('data-folder') || extractFolderFromInfo(msg);
              const keyframeName = img.getAttribute('data-keyframe') || extractKeyframeFromInfo(msg);
              const seconds = extractSecondsFromKeyframeInfo(msg);
              if (!folderName) return;
              const watchUrl = await getWatchUrlForFolder(folderName);
              if (watchUrl && window.showYouTubePreviewModal) {
                window.showYouTubePreviewModal(watchUrl, { folderName, keyframeName, seconds });
              }
            });
          }
        });
      }
      
      saveChatHistory();
    });
  }
  
  // Add new chat button handler
  if (newChatBtn) {
    newChatBtn.addEventListener('click', createNewChat);
  }
  
  // Add chat button to images in search results
  addChatButtonsToImages();
  
  // Listen for new search results to add chat buttons
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.classList && node.classList.contains('image-item')) {
              addChatButtonToImage(node);
            } else {
              const imageItems = node.querySelectorAll('.image-item');
              imageItems.forEach(item => addChatButtonToImage(item));
            }
          }
        });
      }
    });
  });
  
  // Observe the main content area for new search results
  const main = document.getElementById('main');
  if (main) {
    observer.observe(main, { childList: true, subtree: true });
    console.log('✅ Chatbox observer started');
  }
}

// Load chat history from localStorage
function loadChatHistory() {
  const savedHistory = localStorage.getItem('chatHistory');
  if (savedHistory) {
    chatHistory = JSON.parse(savedHistory);
    updateChatSelector();
    loadCurrentChat();
  } else {
    chatHistory = {
      default: {
        name: 'Default Chat',
        messages: ''
      }
    };
  }
}

// Save chat history to localStorage
function saveChatHistory() {
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages && currentChatId && chatHistory[currentChatId]) {
    // Save current messages before storing history
    chatHistory[currentChatId].messages = chatMessages.innerHTML;
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
  }
}

// Update chat selector dropdown
function updateChatSelector() {
  const chatHistorySelect = document.getElementById('chatHistorySelect');
  if (!chatHistorySelect) return;
  
  chatHistorySelect.innerHTML = '';
  Object.keys(chatHistory).forEach(chatId => {
    const option = document.createElement('option');
    option.value = chatId;
    option.textContent = chatHistory[chatId].name;
    if (chatId === currentChatId) {
      option.selected = true;
    }
    chatHistorySelect.appendChild(option);
  });
}

// Load the current chat
function loadCurrentChat() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  
  if (chatHistory[currentChatId]) {
    chatMessages.innerHTML = chatHistory[currentChatId].messages;
    // Reattach click handlers for images
    const savedImageMessages = chatMessages.querySelectorAll('.chat-image-message');
    savedImageMessages.forEach(msg => {
      const img = msg.querySelector('img');
      if (img) {
        img.style.cursor = 'pointer';
        img.addEventListener('click', async function(e) {
          e.stopPropagation();
          const folderName = img.getAttribute('data-folder') || extractFolderFromInfo(msg);
          const keyframeName = img.getAttribute('data-keyframe') || extractKeyframeFromInfo(msg);
          let seconds = null;
          try {
            const idMatch = (msg.querySelector('.chat-image-info')?.textContent || '').match(/Video ID:\s*(\d+)/i);
            const resultId = idMatch ? parseInt(idMatch[1], 10) : null;
            if (resultId && typeof window.getImageInfo === 'function') {
              const info = window.getImageInfo(resultId, 'keyframe');
              if (info && Number.isFinite(info.seconds)) seconds = info.seconds;
            }
          } catch {}
          if (!folderName) return;
          const watchUrl = await getWatchUrlForFolder(folderName);
          if (watchUrl && window.showYouTubePreviewModal) {
            window.showYouTubePreviewModal(watchUrl, { folderName, keyframeName, seconds });
          }
        });
      }
    });
  } else {
    chatMessages.innerHTML = '';
  }
}

// Create new chat
function createNewChat(chatName) {
  if (!chatName) {
    chatName = prompt('Enter a name for the new chat:', 'New Chat');
  }
  if (chatName) {
    // Check if chat name already exists
    const existingChat = Object.values(chatHistory).find(chat => chat.name === chatName);
    if (existingChat) {
      // Add error message to current chat
      const chatMessages = document.getElementById('chatMessages');
      if (chatMessages) {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'message system-message';
        errorMsg.textContent = `Cannot create chat: Name "${chatName}" already exists`;
        chatMessages.appendChild(errorMsg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
      return;
    }

    // Save current chat before switching
    saveChatState();

    // Create new chat
    const chatId = 'chat_' + Date.now();
    chatHistory[chatId] = {
      name: chatName,
      messages: ''
    };
    currentChatId = chatId;
    
    // Clear and update UI
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      chatMessages.innerHTML = '';
    }
    updateChatSelector();
    saveChatHistory();
  }
}

// Helper function to save current chat state
function saveChatState() {
  if (currentChatId && chatHistory[currentChatId]) {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      chatHistory[currentChatId].messages = chatMessages.innerHTML;
    }
  }
}

// Send message function
function sendChatMessage() {
  const messageInput = document.getElementById('messageInput');
  const chatMessages = document.getElementById('chatMessages');
  
  if (!messageInput || !chatMessages) return;
  
  const message = messageInput.value.trim();
  if (message) {
    // Check for commands
    if (message === '/clear') {
      // Clear current chat messages
      chatMessages.innerHTML = '';
      messageInput.value = '';
      if (chatHistory[currentChatId]) {
        chatHistory[currentChatId].messages = '';
      }
      saveChatHistory();
      return;
    }
    
    if (message === '/clear_all') {
      // Clear all chat histories
      chatHistory = {
        default: {
          name: 'Default Chat',
          messages: ''
        }
      };
      currentChatId = 'default';
      chatMessages.innerHTML = '';
      messageInput.value = '';
      saveChatHistory();
      updateChatSelector();
      return;
    }

    if (message.startsWith('/new ')) {
      // Create new chat with given name
      const chatName = message.substring(5).trim();
      if (chatName) {
        createNewChat(chatName);
        messageInput.value = '';
        return;
      }
    }

    if (message === '/delete' || message.startsWith('/delete ')) {
      // Delete current chat or specified chat
      const chatName = message.substring(8).trim();
      if (chatName) {
        // Find chat by name
        const chatId = Object.keys(chatHistory).find(
          id => chatHistory[id].name === chatName
        );
        if (chatId && chatId !== 'default') {
          delete chatHistory[chatId];
          if (currentChatId === chatId) {
            currentChatId = 'default';
            loadCurrentChat();
          }
          updateChatSelector();
          saveChatHistory();
        } else {
          // Show error message in chat
          const errorMsg = document.createElement('div');
          errorMsg.className = 'message system-message';
          errorMsg.textContent = `Cannot find or delete chat: ${chatName}`;
          chatMessages.appendChild(errorMsg);
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      } else if (currentChatId !== 'default') {
        // Delete current chat
        delete chatHistory[currentChatId];
        currentChatId = 'default';
        loadCurrentChat();
        updateChatSelector();
        saveChatHistory();
      }
      messageInput.value = '';
      return;
    }
    

    // Add user message
    const userMessage = document.createElement('div');
    userMessage.className = 'message user-message';
    userMessage.textContent = message;
    chatMessages.appendChild(userMessage);
    userMessage.innerHTML = `
    <span class="message-text">${message}</span>
    <button class="delete-message-btn" title="Delete message" onclick="deleteMessage(this)">
      <span class="delete-icon">×</span>
    </button>
  `;
  chatMessages.appendChild(userMessage);
    // Clear input
    messageInput.value = '';

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Save to chat history
    saveChatHistory();
  }
}

// Add chat buttons to existing images
function addChatButtonsToImages() {
  const imageItems = document.querySelectorAll('.image-item');
  imageItems.forEach(item => addChatButtonToImage(item));
}

// Add chat button to a single image
function addChatButtonToImage(imageItem) {
  // Check if chat button already exists
  if (imageItem.querySelector('.add-to-chat-btn')) {
    return;
  }
  
  // Create chat button
  const chatBtn = document.createElement('button');
  chatBtn.className = 'add-to-chat-btn';
  chatBtn.innerHTML = '+';
  chatBtn.title = 'Add to chat';
  
  // Get image info
  const img = imageItem.querySelector('img');
  const imageUrl = img ? img.src : '';
  const imageId = imageItem.getAttribute('data-image-id') || 
                  imageItem.getAttribute('data-group') + '-' + imageItem.getAttribute('data-image-index') ||
                  'unknown';
  
  // Get folder and keyframe info from overlay
  const overlay = imageItem.querySelector('.image-overlay');
  let folderName = 'Unknown';
  let keyframeName = 'Unknown';
  
  if (overlay) {
    const folderElement = overlay.querySelector('.folder-name');
    const keyframeElement = overlay.querySelector('.keyframe-name');
    if (folderElement) folderName = folderElement.textContent;
    if (keyframeElement) keyframeName = keyframeElement.textContent;
  }
  
  // Add click handler
  chatBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Build payload from DOM
    const img = imageItem.querySelector('img') || imageItem;
    const imageUrl = img?.src || img?.getAttribute('data-src') || '';

    // Safe fallbacks for folder/keyframe/videoId
    const computedFolderName =
      img?.getAttribute('data-folder') ||
      imageItem.getAttribute('data-folder') ||
      extractFolderFromInfo(imageItem) ||
      folderName || '';

    const computedKeyframe =
      img?.getAttribute('data-keyframe') ||
      extractKeyframeFromInfo(imageItem) ||
      keyframeName || '';

    const videoId =
      img?.getAttribute('data-video-id') ||
      imageItem.getAttribute('data-video-id') ||
      img?.getAttribute('data-result-id') ||
      imageItem.getAttribute('data-result-id') ||
      imageItem.getAttribute('data-image-id') ||
      (imageItem.querySelector('.chat-image-info')?.textContent.match(/Video ID:\s*(\d+)/i)?.[1]) ||
      '';

    // Extract frame number from keyframe
    let frameNumber = null;
    if (computedKeyframe) {
      if (typeof computedKeyframe === 'string' && computedKeyframe.startsWith('keyframe_')) {
        frameNumber = computedKeyframe.replace('keyframe_', '');
      } else if (!isNaN(computedKeyframe)) {
        frameNumber = computedKeyframe;
      } else {
        const match = computedKeyframe.match(/\d+/);
        if (match) frameNumber = match[0];
      }
    }

    const payload = { 
      imageUrl, 
      folderName: computedFolderName, 
      keyframe: computedKeyframe, 
      videoId,
      frameNumber
    };

    console.log('📤 Sending image to chat:', payload);

    if (window.ChatSync && typeof window.ChatSync.sendImageMessage === 'function') {
      window.ChatSync.sendImageMessage(payload);
      const chatBox = document.getElementById('chatBox');
      if (chatBox) {
        chatBox.classList.add('active');
        chatBox.style.display = 'flex';
      }
    } else {
      console.error('ChatSync module is not ready, cannot send image message.');
    }
  });

  imageItem.appendChild(chatBtn);
}

// Add image to chat function - updated for web integration
// This function now primarily routes through ChatSync for consistency
window.addImageToChat = function(imageUrl, videoId, keyframe, folderName) {
  console.log('🔄 addImageToChat called with:', { imageUrl, videoId, keyframe, folderName });
  
  // Extract frame number from keyframe
  let frameNumber = null;
  if (keyframe) {
    if (typeof keyframe === 'string' && keyframe.startsWith('keyframe_')) {
      frameNumber = keyframe.replace('keyframe_', '');
    } else if (!isNaN(keyframe)) {
      frameNumber = keyframe;
    } else {
      const match = String(keyframe).match(/\d+/);
      if (match) frameNumber = match[0];
    }
  }
  
  // Prefer using ChatSync for consistency and websocket sync
  if (window.ChatSync && typeof window.ChatSync.sendImageMessage === 'function') {
    console.log('✅ Using ChatSync.sendImageMessage');
    const payload = {
      imageUrl,
      videoId,
      keyframe,
      folderName,
      frameNumber
    };
    window.ChatSync.sendImageMessage(payload);
    
    const chatBox = document.getElementById('chatBox');
    if (chatBox) {
      chatBox.classList.add('active');
      chatBox.style.display = 'flex';
    }
    return;
  }
  
  // Fallback to direct DOM manipulation (legacy support)
  console.warn('⚠️ ChatSync not available, using legacy direct DOM manipulation');
  
  const chatMessages = document.getElementById('chatMessages');
  const chatBox = document.getElementById('chatBox');
  
  if (!chatMessages || !chatBox) return;
  
  // Try to compute seconds using the shared getImageInfo helper
  let seconds = null;
  try {
    if (typeof window.getImageInfo === 'function') {
      const info = window.getImageInfo(videoId, 'keyframe');
      if (info && Number.isFinite(info.seconds)) seconds = Math.floor(info.seconds);
    }
  } catch {}

  const formatTime = (sec) => {
    if (!Number.isFinite(sec) || sec < 0) return '';
    const m = Math.floor(sec / 60);
    const s = String(Math.floor(sec % 60)).padStart(2, '0');
    return `${m}m ${s}s`;
  };

  const imageMessage = document.createElement('div');
  imageMessage.className = 'message chat-image-message';
  imageMessage.innerHTML = `
    <div class="image-container">
      <img src="${imageUrl}" alt="Selected frame" data-keyframe="${keyframe}" data-folder="${folderName || ''}">
    </div>
    <div class="chat-image-info" style="margin-top: 8px; background: #ffffffb3; color: #272727; padding: 6px 8px; border-radius: 4px; font-size: 12px; display: block;">
      Video ID: ${videoId}<br>
      Keyframe: ${keyframe}<br>
      Folder: ${folderName || 'Unknown'}
    </div>
    <button class="delete-message-btn" title="Delete image message" onclick="deleteMessage(this)">
      <span class="delete-icon">×</span>
    </button>
  `;
  
  // Click on image opens preview (use computed seconds if available)
  const imgEl = imageMessage.querySelector('img');
  if (imgEl) {
    imgEl.style.cursor = 'pointer';
    imgEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      const folder = imgEl?.getAttribute('data-folder') || folderName;
      const kf = imgEl?.getAttribute('data-keyframe') || keyframe;
      if (!folder) return;
      const watchUrl = await getWatchUrlForFolder(folder);
      if (watchUrl && window.showYouTubePreviewModal) {
        window.showYouTubePreviewModal(watchUrl, { folderName: folder, keyframeName: kf, seconds });
      }
    });
  }
  
  chatMessages.appendChild(imageMessage);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  chatBox.classList.add('active'); // Show chat box when adding image
  
  // Save to chat history after adding image
  saveChatHistory();
};

// Function to delete individual message (including images)
window.deleteMessage = function(deleteBtn) {
  const messageElement = deleteBtn.closest('.message');
  if (messageElement) {
    // Check if it's an image message
    const isImageMessage = messageElement.classList.contains('chat-image-message');
    const messageType = isImageMessage ? 'image' : 'message';
    
    // Add confirmation dialog
    if (confirm(`Are you sure you want to delete this ${messageType}?`)) {
      messageElement.remove();
      // Save updated chat history
      saveChatHistory();
      
      // Show confirmation message
      const chatMessages = document.getElementById('chatMessages');
      if (chatMessages) {
        const confirmMsg = document.createElement('div');
        confirmMsg.className = 'message system-message';
        confirmMsg.textContent = `${messageType.charAt(0).toUpperCase() + messageType.slice(1)} deleted successfully`;
        confirmMsg.style.opacity = '0.7';
        chatMessages.appendChild(confirmMsg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Auto-remove confirmation message after 3 seconds
        setTimeout(() => {
          if (confirmMsg.parentNode) {
            confirmMsg.remove();
          }
        }, 3000);
      }
    }
  }
};
// Show image modal function
function showImageModal(imageUrl, keyframe) {
  // Create modal if it doesn't exist
  let modal = document.getElementById('imageModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'imageModal';
    modal.className = 'image-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <span class="close-modal">&times;</span>
        <img src="" alt="Full size image">
        <div class="modal-info"></div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Add close functionality
    modal.querySelector('.close-modal').addEventListener('click', function() {
      modal.style.display = 'none';
    });
    
    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }
  
  // Update modal content
  modal.querySelector('img').src = imageUrl;
  modal.querySelector('.modal-info').textContent = `Keyframe: ${keyframe}`;
  modal.style.display = 'block';
}

// Try to parse `Keyframe: keyframe_414 (00:16)`-style info, or return null
function extractSecondsFromKeyframeInfo(messageEl) {
  try {
    const info = messageEl.querySelector('.chat-image-info');
    if (!info) return null;
    const text = info.textContent || '';
    // Look for mm:ss in the info
    const mmss = text.match(/(\d{1,2}):(\d{2})/);
    if (mmss) {
      const minutes = parseInt(mmss[1], 10);
      const seconds = parseInt(mmss[2], 10);
      if (Number.isFinite(minutes) && Number.isFinite(seconds)) return minutes * 60 + seconds;
    }
    return null;
  } catch {
    return null;
  }
}

// Helpers to extract folder/keyframe from overlay or info block
function extractFolderFromInfo(el) {
  try {
    const overlay = el.querySelector('.image-overlay .folder-name');
    if (overlay && overlay.textContent) return overlay.textContent.trim();
    const img = el.querySelector('img');
    const df = img?.getAttribute('data-folder') || el.getAttribute('data-folder');
    if (df) return df.trim();
    const info = el.querySelector('.chat-image-info');
    if (info) {
      const m = info.textContent.match(/Folder:\s*([^\n\r]+)/i);
      if (m && m[1]) return m[1].trim();
    }
  } catch {}
  return '';
}

function extractKeyframeFromInfo(el) {
  try {
    const overlay = el.querySelector('.image-overlay .keyframe-name');
    if (overlay && overlay.textContent) return overlay.textContent.trim();
    const img = el.querySelector('img');
    const dk = img?.getAttribute('data-keyframe');
    if (dk) return dk.trim();
    const info = el.querySelector('.chat-image-info');
    if (info) {
      const m = info.textContent.match(/Keyframe:\s*([^\n\r]+)/i);
      if (m && m[1]) return m[1].trim();
    }
  } catch {}
  return '';
}