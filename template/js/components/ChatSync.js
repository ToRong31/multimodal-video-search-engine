// VERSION: Final - Correct Timestamp Handling
console.log('🚀 ChatSync.js script loaded. Client is now stateless.');

(() => {
  if (window.__chat_sync_initialized) return;

  const WS_PORT = window.CHAT_WS_PORT || 3001;
  const WS_URL =
    (location.protocol === 'https:' ? 'wss://' : 'ws://') +
    location.hostname + ':' + WS_PORT;
  let ws;
  const localClientId = localStorage.getItem('chat_client_id') || (localStorage.setItem('chat_client_id', crypto.randomUUID()), localStorage.getItem('chat_client_id'));
  const nickname = localStorage.getItem('chat_nick') || 'Guest';
  let currentRoom = localStorage.getItem('chat_current_room') || 'default';
  const roomHistories = {}; // { roomName: [events...] }

  // Normalize: de-dup by id/ts and sort by ts asc
  function normalizeHistory(arr) {
    const input = Array.isArray(arr) ? arr : [];
    const seen = new Set();
    const out = [];
    for (const e of input) {
      const key = e?.id || e?.ts;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
    out.sort((a, b) => (a?.ts || 0) - (b?.ts || 0));
    return out;
  }

  // --- 1. LOW-LEVEL SEND ---
  function send(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(obj)); } catch {}
  }

  // --- 2. UI & RENDERING FUNCTIONS ---
  function executeClearUI() {
      const container = document.querySelector('#chatMessages') || document.querySelector('#chat-messages');
      if (container) container.innerHTML = '';
      console.log('✅ Chat UI cleared.');
  }

  function renderTextMessage({ id, ts, text, nickname: nick, clientId }) {
    const uniqueId = id || ts;
    const container = document.querySelector('#chatMessages');
    if (!container || !uniqueId || !text || container.querySelector(`[data-msgid='${uniqueId}']`)) return;

    const mine = clientId === localClientId;
    const div = document.createElement('div');
    div.className = `message ${mine ? 'user-message' : 'other-message'}`;
    div.dataset.msgid = uniqueId;
    div.innerHTML = `<strong class="message-sender">${mine ? 'You' : nick}</strong><span class="message-text">${text}</span>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }


  function renderImageMessage(event) {
    const container = document.querySelector('#chatMessages');
    if (!container) return;
    const uniqueId = event.id || event.ts;
    if (container.querySelector(`[data-msgid='${uniqueId}']`)) return;

    const { imageUrl, videoId, keyframe, folderName, frameNumber } = event.payload || {};
    const div = document.createElement('div');
    div.className = 'message chat-image-message';
    div.dataset.msgid = uniqueId;
    if (folderName) div.dataset.folder = folderName;
    if (keyframe) div.dataset.keyframe = keyframe;
    if (videoId) div.dataset.imageId = String(videoId);

    // Extract frame number from keyframe
    let keyframeNum = frameNumber;
    let keyframeTime = '';
    
    if (!keyframeNum && keyframe) {
      if (typeof keyframe === 'string' && keyframe.startsWith('keyframe_')) {
        keyframeNum = keyframe.replace('keyframe_', '');
      } else if (typeof keyframe === 'number') {
        keyframeNum = keyframe;
      } else if (typeof keyframe === 'string') {
        // Try to parse number from string
        const match = keyframe.match(/\d+/);
        if (match) keyframeNum = match[0];
      }
    }
    
    // If keyframeNum has time part, split it
    if (typeof keyframeNum === 'string' && keyframeNum.includes(' ')) {
      const parts = keyframeNum.split(' ');
      keyframeNum = parts[0];
      keyframeTime = parts.slice(1).join(' '); // e.g., (16m 47s)
    }

    let finalImageUrl = imageUrl;
    let finalKeyframeId = videoId; // Default to original videoId
    console.log('🖼️ Rendering image message:', { imageUrl, videoId, keyframe, folderName, keyframeNum });
    
    // Try to find nearest keyframe if we have folder and frame number
    if (folderName && keyframeNum !== undefined && keyframeNum !== '') {
      const jsonUrl = `/data/keyframeToId/${folderName}.json`;
      console.log(`📂 Looking up keyframe in: ${jsonUrl} for frame: ${keyframeNum}`);
      
      fetch(jsonUrl)
        .then(response => {
          if (!response.ok) {
            console.warn(`⚠️ Could not load keyframe JSON: ${jsonUrl}`);
            return null;
          }
          return response.json();
        })
        .then(jsonData => {
          if (jsonData && Array.isArray(jsonData)) {
            const frameNum = Number(keyframeNum);
            console.log(`🔍 Searching for frame ${frameNum} in ${jsonData.length} entries`);
            
            // Find exact match or nearest keyframe
            let found = jsonData.find(obj => obj.frame === frameNum);
            
            if (!found && frameNum > 0) {
              // Find nearest keyframe (closest lower frame number)
              console.log('🔍 Exact frame not found, looking for nearest keyframe...');
              let nearest = null;
              let minDiff = Infinity;
              
              for (const obj of jsonData) {
                if (obj.frame <= frameNum) {
                  const diff = frameNum - obj.frame;
                  if (diff < minDiff) {
                    minDiff = diff;
                    nearest = obj;
                  }
                }
              }
              
              if (nearest) {
                found = nearest;
                console.log(`✅ Found nearest keyframe: frame ${found.frame} (diff: ${minDiff})`);
              }
            }
            
            if (found && found.id) {
              finalImageUrl = `/api/image/${found.id}`;
              finalKeyframeId = found.id; // Update to actual keyframe ID
              console.log(`✅ Using keyframe ID: ${found.id} for frame ${found.frame}`);
            } else {
              console.warn(`⚠️ No keyframe found for frame ${frameNum}`);
            }
          }
          render(finalImageUrl, finalKeyframeId);
        })
        .catch(err => {
          console.error('❌ Error fetching keyframe JSON:', err);
          render(finalImageUrl, finalKeyframeId);
        });
    } else {
      render(finalImageUrl, finalKeyframeId);
    }
    
    function render(imgUrl, keyframeId) {
      const folderBadgeHtml = folderName ? 
        `<span class="chat-badge folder-badge">${folderName}</span>` : '';
      const keyframeBadgeHtml = keyframeNum ? 
        `<span class="chat-badge keyframe-badge">Keyframe: ${keyframeNum}${keyframeTime ? ' ' + keyframeTime : ''}</span>` : '';
      const infoLines = [];
      if (videoId) infoLines.push(`Video ID: ${videoId}`);
      if (keyframe) infoLines.push(`Keyframe: ${keyframe}`);
      if (folderName) infoLines.push(`Folder: ${folderName}`);
      const infoHtml = infoLines.length ? `
        <div class="chat-image-info" style="margin-top: 8px; background: #ffffffb3; color: #272727; padding: 6px 8px; border-radius: 4px; font-size: 12px; display: block;">
          ${infoLines.join('<br>')}
        </div>` : '';

      div.innerHTML = `
        <div class="image-container">
          <img src="${imgUrl}" alt="Selected frame"
              ${folderName ? `data-folder="${folderName}"` : ''}
              ${keyframe ? `data-keyframe="${keyframe}"` : ''}
              ${keyframeId ? `data-image-id="${keyframeId}"` : ''}>
              ${keyframeBadgeHtml}
              ${folderBadgeHtml}
        </div>
        ${infoHtml}
        <button class="delete-message-btn" title="Delete image message" onclick="deleteMessage(this)">
          <span class="delete-icon">×</span>
        </button>
      `;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
      console.log(`✅ Image rendered in chat: ${imgUrl} with keyframe ID: ${keyframeId}`);
    }
  }

  function renderRoom(roomName) {
    executeClearUI();
    const events = roomHistories[roomName] || [];
    for (const e of events) {
      if (e.type === 'message') renderTextMessage(e);
      if (e.type === 'image_message') renderImageMessage(e);
    }
  }

  function refreshRoomSelector() {
    const sel = document.querySelector('#chatHistorySelect');
    if (!sel) return;
    // Remove all existing listeners by cloning (avoid conflicts with ChatBox.js)
    const clone = sel.cloneNode(true);
    sel.parentNode.replaceChild(clone, sel);
    const select = document.querySelector('#chatHistorySelect');

    // Populate
    select.innerHTML = '';
    const rooms = Object.keys(roomHistories).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const r of rooms) {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      if (r === currentRoom) opt.selected = true;
      select.appendChild(opt);
    }
    // Change handler -> switch room
    select.addEventListener('change', (e) => {
      switchRoom(e.target.value);
    });
  }

  function ensureRoom(roomName) {
    if (!roomHistories[roomName]) roomHistories[roomName] = [];
  }

  function switchRoom(roomName) {
    roomName = (roomName || '').trim() || 'default';
    if (!roomHistories[roomName]) {
      send({ type: 'create_room', room: roomName });
      roomHistories[roomName] = [];
    }
    // Join and request fresh history every time we switch
    send({ type: 'join', room: roomName, clientId: localClientId });
    send({ type: 'get_history', room: roomName });

    currentRoom = roomName;
    localStorage.setItem('chat_current_room', currentRoom);
    refreshRoomSelector();
    renderRoom(currentRoom);
    console.log(`➡️ Switched to room "${currentRoom}"`);
  }

  // --- 3. CONNECTION & HANDLERS ---
  function connect() {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      console.log('WS connected');
      send({ type: 'join', room: currentRoom, clientId: localClientId });
    };
    ws.onclose = () => {
      console.log('WS closed. Reconnecting in 1.5s...');
      setTimeout(connect, 1500);
    };
    ws.onerror = (e) => console.error('WS error', e);
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      switch (msg.type) {
        case 'snapshot': {
          const { rooms = [], histories = {} } = msg;
          for (const r of rooms) {
            roomHistories[r] = normalizeHistory(histories[r]);
          }
          if (!roomHistories[currentRoom]) {
            roomHistories[currentRoom] = [];
            send({ type: 'create_room', room: currentRoom });
          }
          // Always request fresh history for the current room on initial connect
          send({ type: 'get_history', room: currentRoom });

          refreshRoomSelector();
          renderRoom(currentRoom);
          break;
        }

        case 'room_history': {
          const r = msg.room || 'default';
          roomHistories[r] = normalizeHistory(msg.history);
          if (r === currentRoom) {
            renderRoom(currentRoom);
          }
          break;
        }

        case 'room_created': {
          ensureRoom(msg.room);
          refreshRoomSelector();
          break;
        }

        case 'room_deleted': {
          const r = msg.room;
          if (roomHistories[r]) delete roomHistories[r];
          if (currentRoom === r) {
            currentRoom = 'default';
            localStorage.setItem('chat_current_room', currentRoom);
            send({ type: 'join', room: currentRoom, clientId: localClientId });
          }
          refreshRoomSelector();
          renderRoom(currentRoom);
          break;
        }

        case 'rooms_reset': {
          const { rooms = [], histories = {} } = msg;
          for (const k of Object.keys(roomHistories)) delete roomHistories[k];
          for (const r of rooms) roomHistories[r] = histories[r] || [];
          currentRoom = 'default';
          localStorage.setItem('chat_current_room', currentRoom);
          refreshRoomSelector();
          renderRoom(currentRoom);

          // NEW: re-join default and fetch fresh history
          send({ type: 'join', room: currentRoom, clientId: localClientId });
          send({ type: 'get_history', room: currentRoom });
          break;
        }

        case 'clear': {
          const r = msg.room;
          if (r === '_all') {
            for (const k of Object.keys(roomHistories)) roomHistories[k] = [];
            if (document.querySelector('#chatMessages')) executeClearUI();
          } else {
            roomHistories[r] = [];
            if (r === currentRoom) executeClearUI();
          }
          break;
        }

        case 'message': {
          const r = msg.room || 'default';
          ensureRoom(r);
          roomHistories[r].push(msg);
          if (r === currentRoom) renderTextMessage(msg);
          break;
        }

        case 'image_message': {
          const r = msg.room || 'default';
          ensureRoom(r);
          roomHistories[r].push(msg);
          if (r === currentRoom) renderImageMessage(msg);
          break;
        }

        // Back-compat: old servers sent a single history array
        case 'history': {
          // Treat as default room history
          roomHistories.default = msg.data || [];
          refreshRoomSelector();
          renderRoom(currentRoom);
          break;
        }
      }
    };
  }

  // --- 4. EVENT BINDING ---
  const attachEventListeners = () => {
    const msgInput0 = document.querySelector('#messageInput');
    const sendBtn0 = document.querySelector('#sendMessage');
    if (!msgInput0 || !sendBtn0) return false;

    // Remove all pre-existing listeners (from ChatBox.js) by cloning nodes
    const msgInputClone = msgInput0.cloneNode(true);
    msgInput0.parentNode.replaceChild(msgInputClone, msgInput0);
    const sendBtnClone = sendBtn0.cloneNode(true);
    sendBtn0.parentNode.replaceChild(sendBtnClone, sendBtn0);

    const msgInput = document.querySelector('#messageInput');
    const sendBtn = document.querySelector('#sendMessage');

    // Add/ensure Clear button clears current room on server
    const controls = document.querySelector('.chat-controls');
    if (controls && !controls.querySelector('#clearChatBtn')) {
        const clearBtn = document.createElement('button');
        clearBtn.id = 'clearChatBtn';
        clearBtn.textContent = 'Clear History';
        clearBtn.onclick = () => {
          if (confirm(`Clear all messages in room "${currentRoom}" for everyone?`)) {
            send({ type: 'clear', room: currentRoom });
          }
        };
        controls.appendChild(clearBtn);
    }

    const parseAndExecuteCommands = (text) => {
      // /clear all
      if (/^\/clear\s+all$/i.test(text)) {
        send({ type: 'clear', room: '_all' });
        return true;
      }
      // /del all
      if (/^\/del\s+all$/i.test(text)) {
        if (confirm('Delete ALL rooms (keep only default) for everyone?')) {
          send({ type: 'delete_all_rooms' });
        }
        return true;
      }
      // /clear <room>
      let m = text.match(/^\/clear\s+(.+)$/i);
      if (m) {
        const r = m[1].trim();
        send({ type: 'clear', room: r });
        return true;
      }
      // /del <room>
      m = text.match(/^\/del\s+(.+)$/i);
      if (m) {
        const r = m[1].trim();
        if (r.toLowerCase() === 'default') {
          alert('Cannot delete default room');
          return true;
        }
        if (confirm(`Delete room "${r}" for everyone?`)) {
          send({ type: 'delete_room', room: r });
        }
        return true;
      }
      // /<room> -> switch or create + switch
      m = text.match(/^\/(\S+)$/);
      if (m) {
        const r = m[1].trim();
        // Create if not exist then switch
        if (!roomHistories[r]) send({ type: 'create_room', room: r });
        switchRoom(r);
        return true;
      }
      return false;
    };

    const submitMessage = () => {
      const text = msgInput.value.trim();
      if (!text) return;

      // Commands
      if (text.startsWith('/')) {
        if (parseAndExecuteCommands(text)) {
          msgInput.value = '';
          return;
        }
      }

      // Normal text message
      send({
        type: 'message',
        id: crypto.randomUUID(),
        text,
        clientId: localClientId,
        nickname,
        room: currentRoom
      });
      msgInput.value = '';
    };

    const handleKeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        submitMessage();
        return false; // Thêm return false để chắc chắn ngăn chặn các xử lý mặc định
      }
    };
    msgInput.addEventListener('keydown', handleKeydown, { capture: true, passive: false });
    sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      submitMessage();
    }, true);

    // Bind room selector after takeover
    refreshRoomSelector();
    return true;
  };

  // Extend image send to include current room
  function sendImageMessage(payload) {
    send({
      type: 'image_message',
      id: crypto.randomUUID(),
      clientId: localClientId,
      nickname,
      room: currentRoom,
      payload
    });
  }

  // EXPOSE PUBLIC API FOR OTHER MODULES (HandleChatBox.js uses this)
  // Make sure other scripts can add to the current room
  window.ChatSync = Object.assign(window.ChatSync || {}, {
    sendImageMessage,
    switchRoom,
    getCurrentRoom: () => currentRoom
  });

  // --- 5. INITIALIZATION ---
  connect();
  const pollingInterval = setInterval(() => {
    if (attachEventListeners()) {
      clearInterval(pollingInterval);
      console.log('✅ Event listeners attached.');
    }
  }, 200);
  window.__chat_sync_initialized = true;
})();