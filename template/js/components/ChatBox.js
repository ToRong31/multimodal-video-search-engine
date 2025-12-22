document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 ChatBox.js: DOM loaded, initializing...');
    
    const chatButton = document.getElementById('chatButton');
    const chatBox = document.getElementById('chatBox');
    const closeChat = document.getElementById('closeChat');
    const messageInput = document.getElementById('messageInput');
    const sendMessage = document.getElementById('sendMessage');
    const chatMessages = document.getElementById('chatMessages');
    const chatHistorySelect = document.getElementById('chatHistorySelect');
    const newChatBtn = document.getElementById('newChatBtn');
    
    console.log('🔧 ChatBox.js: Elements found:', {
        chatButton: !!chatButton,
        chatBox: !!chatBox,
        closeChat: !!closeChat,
        messageInput: !!messageInput,
        sendMessage: !!sendMessage,
        chatMessages: !!chatMessages,
        chatHistorySelect: !!chatHistorySelect,
        newChatBtn: !!newChatBtn
    });
    
    // Additional debugging
    if (chatButton) {
        console.log('🔧 Chat button element:', chatButton);
        console.log('🔧 Chat button computed style:', window.getComputedStyle(chatButton));
    }
    
    if (chatBox) {
        console.log('🔧 Chat box element:', chatBox);
        console.log('🔧 Chat box computed style:', window.getComputedStyle(chatBox));
        console.log('🔧 Chat box classes:', chatBox.className);
    }
    
    let currentChatId = 'default';
    let chatHistory = {};

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
        // Save current messages before storing history
        chatHistory[currentChatId].messages = chatMessages.innerHTML;
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
    }

    // Update chat selector dropdown
    function updateChatSelector() {
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
        if (chatHistory[currentChatId]) {
            chatMessages.innerHTML = chatHistory[currentChatId].messages;
            // Reattach click handlers for images
            const savedImageMessages = chatMessages.querySelectorAll('.chat-image-message');
            savedImageMessages.forEach(msg => {
                const img = msg.querySelector('img');
                if (img) {
                    msg.addEventListener('click', function() {
                        showImageModal(img.src, img.getAttribute('data-keyframe'));
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
                const errorMsg = document.createElement('div');
                errorMsg.className = 'message system-message';
                errorMsg.textContent = `Cannot create chat: Name "${chatName}" already exists`;
                chatMessages.appendChild(errorMsg);
                chatMessages.scrollTop = chatMessages.scrollHeight;
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
            chatMessages.innerHTML = '';
            updateChatSelector();
            saveChatHistory();
        }
    }

    // Helper function to save current chat state
    function saveChatState() {
        if (currentChatId && chatHistory[currentChatId]) {
            chatHistory[currentChatId].messages = chatMessages.innerHTML;
        }
    }

    // Event listener for chat selection
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
                    msg.addEventListener('click', function() {
                        showImageModal(img.src, img.getAttribute('data-keyframe'));
                    });
                }
            });
        }
        
        saveChatHistory();
    });

    // Event listener for new chat button
    newChatBtn.addEventListener('click', createNewChat);

    // Load chat history when page loads
    loadChatHistory();

    // Toggle chat box
    chatButton.addEventListener('click', function() {
        console.log('🔧 Chat button clicked!');
        console.log('🔧 Chat box before toggle:', chatBox.classList.contains('active'));
        console.log('🔧 Chat box element:', chatBox);
        console.log('🔧 Chat box computed style:', window.getComputedStyle(chatBox).display);
        
        chatBox.classList.toggle('active');
        console.log('🔧 Chat box active state:', chatBox.classList.contains('active'));
        console.log('🔧 Chat box computed style after:', window.getComputedStyle(chatBox).display);
        
        if (chatBox.classList.contains('active')) {
            // Force display flex
            chatBox.style.display = 'flex';
            messageInput.focus();
            console.log('🔧 Message input focused, chat box forced to flex');
        } else {
            // Force display none
            chatBox.style.display = 'none';
            console.log('🔧 Chat box forced to none');
        }
    });

    // Close chat box
    closeChat.addEventListener('click', function() {
        chatBox.classList.remove('active');
        chatBox.style.display = 'none';
        console.log('🔧 Chat box closed and forced to none');
    });

    // Send message function
    function sendChatMessage() {
        const message = messageInput.value.trim();
        if (message) {
            // Check for commands
            if (message === '/clear') {
                // Clear current chat messages
                chatMessages.innerHTML = '';
                messageInput.value = '';
                chatHistory[currentChatId].messages = '';
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

            // Clear input
            messageInput.value = '';

            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // Save to chat history
            saveChatHistory();
        }
    }

    // Send message on button click
    sendMessage.addEventListener('click', sendChatMessage);

    // Send message on Enter key
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });

    // Add image to chat function - updated for web integration
    window.addImageToChat = function(imageUrl, videoId, keyframe, folderName) {
        const chatMessages = document.getElementById('chatMessages');
        const chatBox = document.getElementById('chatBox');
        
        if (!chatMessages || !chatBox) return;
        
        const imageMessage = document.createElement('div');
        imageMessage.className = 'message chat-image-message';
        imageMessage.innerHTML = `
          <div class="image-container" style="position: relative; overflow: hidden;">
            <img src="${imageUrl}" alt="Selected frame" data-keyframe="${keyframe}" style="display: block; width: 100%; border-radius: 8px;">
            <div class="chat-image-info" style="position: absolute; bottom: 0; left: 0; background: rgba(0,0,0,0.7); color: white; padding: 5px; width: 100%; font-size: 12px; z-index: 2;">
              Video ID: ${videoId}<br>
              Keyframe: ${keyframe}<br>
              Video: ${folderName || 'Unknown'}
            </div>
          </div>
          <button class="delete-message-btn" title="Delete image message" onclick="deleteMessage(this)">
            <span class="delete-icon">×</span>
          </button>
        `;
        
        // Add click handler to show image modal (but not when clicking delete button)
        imageMessage.addEventListener('click', function(e) {
          // Don't show modal if clicking delete button or image info
          if (!e.target.closest('.delete-message-btn') && !e.target.closest('.chat-image-info')) {
            showImageModal(imageUrl, keyframe);
          }
        });
        
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
});