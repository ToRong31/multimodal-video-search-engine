// ✅ Load YouTube URL mapping
let youtubeURLMap = null;

async function loadYoutubeURLMapping() {
  if (youtubeURLMap) return youtubeURLMap;
  
  try {
    const response = await fetch('/data/URL/Youtube_URL.json');
    const data = await response.json();
    
    youtubeURLMap = {};
    data.forEach(item => {
      if (item.folder && item.watch_url) {
        youtubeURLMap[item.folder] = item.watch_url;
      }
    });
    
    console.log('✅ YouTube URL mapping loaded:', Object.keys(youtubeURLMap).length, 'videos');
    return youtubeURLMap;
  } catch (error) {
    console.error('❌ Failed to load YouTube URL mapping:', error);
    return {};
  }
}

function getYoutubeURL(folderName) {
  if (!youtubeURLMap || !folderName) return null;
  return youtubeURLMap[folderName] || null;
}

function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/embed\/([\w-]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function formatTimeLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ✅ Y + Click handler
let isYKeyPressed = false;

document.addEventListener('keydown', (e) => {
  if (e.key === 'y' || e.key === 'Y') {
    isYKeyPressed = true;
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'y' || e.key === 'Y') {
    isYKeyPressed = false;
  }
});

// ✅ LOAD YOUTUBE IFRAME API
let youtubeAPIReady = false;
let youtubeAPIReadyCallbacks = [];

function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) {
    youtubeAPIReady = true;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    if (youtubeAPIReady) {
      resolve();
      return;
    }

    youtubeAPIReadyCallbacks.push(resolve);

    if (!window.onYouTubeIframeAPIReady) {
      window.onYouTubeIframeAPIReady = function() {
        youtubeAPIReady = true;
        youtubeAPIReadyCallbacks.forEach(cb => cb());
        youtubeAPIReadyCallbacks = [];
      };

      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
  });
}

// ✅ SUBMIT TO EVENT RETRIEVAL (KIS/QA mode)
async function submitToEventRetrieval(player, folderName, mode, evaluationId, sessionId) {
  try {
    const { EventRetrievalClient } = await import('../api/eventretrieval.js');
    const client = new EventRetrievalClient({
      baseURL: window.store?.eventRetrievalBaseURL || "https://eventretrieval.oj.io.vn/api/v2",
      fetchImpl: fetch.bind(window)
    });

    // ✅ LẤY CURRENT TIME TỪ YOUTUBE PLAYER
    const currentTime = player.getCurrentTime();
    const fps = window.store?.fpsMapping?.[folderName] || 30;
    const currentFrame = Math.round(currentTime * fps);

    console.log(`📤 Submitting ${mode.toUpperCase()}:`, { folderName, currentFrame, currentTime });

    const response = await client.submitAnswer({
      session: sessionId,
      evaluation: evaluationId,
      item: `${folderName}/${currentFrame}`,
    });

    console.log('✅ Submit response:', response);
    alert(`✅ ${mode.toUpperCase()} submitted successfully!\nVideo: ${folderName}\nFrame: ${currentFrame}\nTime: ${currentTime.toFixed(2)}s`);
    
  } catch (error) {
    console.error(`❌ ${mode.toUpperCase()} submit error:`, error);
    throw error;
  }
}

// ✅ SUBMIT TRAKE WITH MULTIPLE FRAMES
async function submitToEventRetrievalWithFrames(folderName, frames, evaluationId, sessionId) {
  try {
    const { EventRetrievalClient } = await import('../api/eventretrieval.js');
    const client = new EventRetrievalClient({
      baseURL: window.store?.eventRetrievalBaseURL || "https://eventretrieval.oj.io.vn/api/v2",
      fetchImpl: fetch.bind(window)
    });

    console.log('📤 Submitting TRAKE:', { folderName, frames });

    const sortedFrames = [...frames].sort((a, b) => a - b);
    
    for (const frame of sortedFrames) {
      await client.submitAnswer({
        session: sessionId,
        evaluation: evaluationId,
        item: `${folderName}/${frame}`,
      });
    }

    console.log('✅ TRAKE submitted successfully');
    alert(`✅ TRAKE submitted successfully!\nVideo: ${folderName}\nFrames: ${sortedFrames.join(', ')}`);
    
  } catch (error) {
    console.error('❌ TRAKE submit error:', error);
    throw error;
  }
}

// ✅ SHOW YOUTUBE PREVIEW MODAL WITH FULL FEATURES
async function showYouTubePreviewModalFromYoutube(watchUrl, meta = {}) {
  const existing = document.querySelector('.yt-preview-overlay');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  const folderName = meta.folderName || '';
  const youtubeId = extractYouTubeId(watchUrl);
  
  if (!youtubeId) {
    alert('Invalid YouTube URL');
    return;
  }

  // ✅ LOAD YOUTUBE API FIRST
  await loadYouTubeAPI();

  const previousActiveElement = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'yt-preview-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000;';

  const modal = document.createElement('div');
  modal.className = 'yt-preview-modal';
  modal.style.cssText = 'background:#111;border-radius:10px;max-width:1200px;width:90%;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,0.5);color:#fff;outline:none;';

  // ==================== HEADER ====================
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;';

  const headerLeft = document.createElement('div');
  headerLeft.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;';

  const titleEl = document.createElement('div');
  titleEl.textContent = '🎥 YouTube Preview';
  titleEl.style.cssText = 'font-weight:600;font-size:16px';
  headerLeft.appendChild(titleEl);

  if (folderName) {
    const folderBadge = document.createElement('span');
    folderBadge.textContent = folderName;
    folderBadge.style.cssText = 'background:#222;border:1px solid #444;color:#b9e3ff;padding:2px 8px;border-radius:999px;font-size:12px;';
    headerLeft.appendChild(folderBadge);
  }

  if (meta.keyframeName) {
    const kfBadge = document.createElement('span');
    kfBadge.textContent = meta.keyframeName;
    kfBadge.style.cssText = 'background:#222;border:1px solid #444;color:#ffd28a;padding:2px 8px;border-radius:999px;font-size:12px;';
    headerLeft.appendChild(kfBadge);
  }

  if (Number.isFinite(meta.seconds)) {
    const fps = window.store?.fpsMapping?.[folderName] || 30;
    const timeBtn = document.createElement('button');
    timeBtn.textContent = `${formatTimeLabel(meta.seconds)} @ ${fps} FPS`;
    timeBtn.title = 'Initial time';
    timeBtn.style.cssText = 'background:#136493;border:1px solid #0f5176;color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;cursor:default;';
    headerLeft.appendChild(timeBtn);
  }

  header.appendChild(headerLeft);

  // ==================== BUTTONS ====================
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

  const addToChatBtn = document.createElement('button');
  addToChatBtn.type = 'button';
  addToChatBtn.textContent = 'Add to Chat';
  addToChatBtn.title = 'Add current frame to chat';
  addToChatBtn.style.cssText = 'background:#1e88e5;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font-weight:500;';

  const kisBtn = document.createElement('button');
  kisBtn.type = 'button';
  kisBtn.textContent = 'KIS';
  kisBtn.title = 'Submit KIS Mode';
  kisBtn.style.cssText = 'background:#667eea;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600;';

  const qaBtn = document.createElement('button');
  qaBtn.type = 'button';
  qaBtn.textContent = 'QA';
  qaBtn.title = 'Submit QA Mode';
  qaBtn.style.cssText = 'background:#f5576c;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600;';

  const trakeBtn = document.createElement('button');
  trakeBtn.type = 'button';
  trakeBtn.textContent = 'TRAKE';
  trakeBtn.title = 'Add current frame to TRAKE submission';
  trakeBtn.style.cssText = 'background:#ff6e47;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600;';

  const submitTrakeBtn = document.createElement('button');
  submitTrakeBtn.type = 'button';
  submitTrakeBtn.textContent = 'Submit TRAKE';
  submitTrakeBtn.title = 'Submit selected frames';
  submitTrakeBtn.style.cssText = 'background:#4bae4f;color:#fff;border:0;border-radius:4px;padding:12px 12px;cursor:pointer;font-weight:600;font-size:14px;';

  const openYouTubeBtn = document.createElement('button');
  openYouTubeBtn.type = 'button';
  openYouTubeBtn.textContent = 'Open on YouTube';
  openYouTubeBtn.title = 'Open video on YouTube';
  openYouTubeBtn.style.cssText = 'background:#ff0000;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font-weight:500;';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'background:#333;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;';

  btnRow.appendChild(addToChatBtn);
  btnRow.appendChild(kisBtn);
  btnRow.appendChild(qaBtn);
  btnRow.appendChild(trakeBtn);
  btnRow.appendChild(openYouTubeBtn);
  btnRow.appendChild(closeBtn);
  header.appendChild(btnRow);

  // ==================== BODY ====================
  const body = document.createElement('div');

  const startTime = Number.isFinite(meta.seconds) ? meta.seconds : 0;

  // ✅ CREATE YOUTUBE PLAYER DIV
  const playerContainer = document.createElement('div');
  playerContainer.style.cssText = 'position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;background:#000';
  
  const playerDiv = document.createElement('div');
  playerDiv.id = 'youtubePlayer_' + Date.now();
  playerDiv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
  playerContainer.appendChild(playerDiv);
  body.appendChild(playerContainer);

  // ✅ LIVE FRAME COUNTER
  const liveFrameCounter = document.createElement('div');
  liveFrameCounter.id = 'liveFrameCounter';
  liveFrameCounter.style.cssText = 'position:fixed;bottom:20px;left:20px;background:rgba(0,0,0,0.85);color:#00ff00;padding:8px 16px;border-radius:6px;font-family:monospace;font-size:14px;font-weight:bold;z-index:10001;border:1px solid #00ff00;box-shadow:0 2px 8px rgba(0,255,0,0.3);';
  liveFrameCounter.textContent = `Frame 0 @ 30 FPS`;
  document.body.appendChild(liveFrameCounter);

  // ==================== TRAKE FRAMES DISPLAY ====================
  const trakeFramesDisplay = document.createElement('div');
  trakeFramesDisplay.className = 'trake-frames-display';
  trakeFramesDisplay.style.cssText = 'margin-top:12px;padding:12px;background:rgb(26, 26, 26);border-radius:8px;display:none;border:2px solid rgb(255, 110, 71);';
  trakeFramesDisplay.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span style="font-weight:600;color:#ff6e47;">Selected Frames for TRAKE</span>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="clear-trake-frames" style="background:#e74c3c;color:#fff;border:0;border-radius:4px;padding:12px 12px;cursor:pointer;font-weight:600;font-size:14px;">Clear All</button>
        <div class="trake-submit-container" style="display:none;"></div>
      </div>
    </div>
    <div class="trake-frames-list" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
  `;
  body.appendChild(trakeFramesDisplay);

  const trakeSubmitContainer = trakeFramesDisplay.querySelector('.trake-submit-container');
  trakeSubmitContainer.appendChild(submitTrakeBtn);

  modal.appendChild(header);
  modal.appendChild(body);
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // ==================== STATE ====================
  let selectedTrakeFrames = [];
  const fps = window.store?.fpsMapping?.[folderName] || 30;
  let player = null;
  let frameUpdateInterval = null;

  // ✅ INITIALIZE YOUTUBE PLAYER
  player = new YT.Player(playerDiv.id, {
    videoId: youtubeId,
    playerVars: {
      start: Math.floor(startTime),
      autoplay: 1,
      controls: 1,
      modestbranding: 1,
      rel: 0,
      showinfo: 0
    },
    events: {
      onReady: (event) => {
        console.log('✅ YouTube player ready');
        
        // ✅ SEEK TO EXACT TIME (including decimals)
        if (startTime > 0) {
          event.target.seekTo(startTime, true);
        }

        // ✅ UPDATE LIVE FRAME COUNTER EVERY 100ms
        frameUpdateInterval = setInterval(() => {
          if (!document.body.contains(overlay)) {
            clearInterval(frameUpdateInterval);
            if (liveFrameCounter.parentNode) {
              liveFrameCounter.remove();
            }
            return;
          }

          try {
            const currentTime = player.getCurrentTime();
            const currentFrame = Math.round(currentTime * fps);
            liveFrameCounter.textContent = `Frame ${currentFrame} @ ${fps} FPS`;
          } catch (e) {
            // Player might be destroyed
          }
        }, 100);
      },
      onError: (event) => {
        console.error('❌ YouTube player error:', event.data);
      }
    }
  });

  // ==================== CLEANUP ====================
  const remove = () => {
    if (frameUpdateInterval) {
      clearInterval(frameUpdateInterval);
    }
    if (liveFrameCounter.parentNode) {
      liveFrameCounter.remove();
    }
    if (player) {
      try {
        player.destroy();
      } catch (e) {
        console.warn('Failed to destroy player:', e);
      }
    }
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.body.style.overflow = '';
    if (previousActiveElement) {
      try { previousActiveElement.focus(); } catch {}
    }
  };

  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) remove();
  });

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      remove();
      document.removeEventListener('keydown', escHandler, true);
    }
  };
  document.addEventListener('keydown', escHandler, true);

  openYouTubeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const currentTime = player ? player.getCurrentTime() : startTime;
    const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}${currentTime > 0 ? `&t=${Math.floor(currentTime)}s` : ''}`;
    window.open(youtubeUrl, '_blank', 'noopener,noreferrer');
  });

  // ==================== ADD TO CHAT ====================
  addToChatBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!player) {
      alert('YouTube player not ready');
      return;
    }

    const currentTime = player.getCurrentTime();
    const currentFrame = Math.round(currentTime * fps);
    const keyframeName = `keyframe_${currentFrame}`;

    const imageUrl = `/api/image/${folderName}/${currentFrame}?method=keyframe`;

    const originalText = addToChatBtn.textContent;
    addToChatBtn.textContent = 'Adding...';
    addToChatBtn.disabled = true;

    if (window.ChatSync && typeof window.ChatSync.sendImageMessage === 'function') {
      const payload = {
        imageUrl: imageUrl,
        folderName: folderName,
        keyframe: keyframeName,
        videoId: folderName,
        seconds: currentTime
      };

      window.ChatSync.sendImageMessage(payload);

      const chatBox = document.getElementById('chatBox');
      if (chatBox) chatBox.classList.add('active');

      addToChatBtn.textContent = 'Added ✓';
      setTimeout(() => {
        addToChatBtn.textContent = originalText;
        addToChatBtn.disabled = false;
      }, 2000);
    } else {
      addToChatBtn.textContent = 'Failed ✗';
      setTimeout(() => {
        addToChatBtn.textContent = originalText;
        addToChatBtn.disabled = false;
      }, 2000);
    }
  });

  // ==================== KIS & QA SUBMIT ====================
  const handleSubmit = async (mode) => {
    if (!player) {
      alert('YouTube player not ready');
      return;
    }

    if (!folderName) {
      alert('Folder name not available');
      return;
    }

    try {
      const { EventRetrievalClient } = await import('../api/eventretrieval.js');
      const client = new EventRetrievalClient({
        baseURL: window.store?.eventRetrievalBaseURL || "https://eventretrieval.oj.io.vn/api/v2",
        fetchImpl: fetch.bind(window)
      });

      let sessionId = window.store?.sessionId;

      if (!sessionId) {
        const username = window.store?.eventRetrievalUsername || "team052";
        const password = window.store?.eventRetrievalPassword || "ZnCTJuBWHU";

        const loginResponse = await client.login({ username, password });
        sessionId = loginResponse.sessionId;

        if (window.store) {
          window.store.sessionId = sessionId;
        }
        localStorage.setItem('eventRetrieval_sessionId', sessionId);
        localStorage.setItem('eventRetrieval_loginTime', Date.now().toString());

        if (typeof window.refreshLoginButton === 'function') {
          window.refreshLoginButton();
        }
      }

      if (!sessionId) {
        throw new Error('No sessionId in login response');
      }

      const evaluations = await client.listEvaluations({ session: sessionId });

      if (!Array.isArray(evaluations) || evaluations.length === 0) {
        throw new Error('No evaluations found');
      }

      const activeEval = evaluations.find(e => e.type === 'SYNCHRONOUS' && e.status === 'ACTIVE') || evaluations[0];

      if (!activeEval || !activeEval.id) {
        throw new Error('No valid evaluation found');
      }

      await submitToEventRetrieval(player, folderName, mode, activeEval.id, sessionId);

    } catch (error) {
      console.error('❌ Submit error:', error);

      if (error.status === 401 || error.message?.includes('Unauthorized')) {
        if (window.store) {
          window.store.sessionId = null;
        }
        localStorage.removeItem('eventRetrieval_sessionId');
        if (typeof window.refreshLoginButton === 'function') {
          window.refreshLoginButton();
        }
        alert('Session expired. Please login again.');
      } else {
        alert(`Failed to submit: ${error.message}`);
      }
    }
  };

  kisBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleSubmit('kis');
  });

  qaBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleSubmit('qa');
  });

  // ==================== TRAKE ====================
  trakeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!player) {
      alert('YouTube player not ready');
      return;
    }

    const currentTime = player.getCurrentTime();
    const currentFrame = Math.round(currentTime * fps);

    if (selectedTrakeFrames.includes(currentFrame)) {
      alert(`Frame ${currentFrame} already added!`);
      return;
    }

    selectedTrakeFrames.push(currentFrame);

    const trakeFramesDisplay = body.querySelector('.trake-frames-display');
    const trakeFramesList = body.querySelector('.trake-frames-list');

    if (trakeFramesDisplay) {
      trakeFramesDisplay.style.display = 'block';
    }

    if (trakeFramesList) {
      const frameTag = document.createElement('div');
      frameTag.style.cssText = 'background:#ff6e47;color:#fff;padding:6px 12px;border-radius:6px;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;';
      frameTag.innerHTML = `
        <span>Frame ${currentFrame}</span>
        <button onclick="this.parentElement.remove(); window.removeTrakeFrame(${currentFrame})" style="background:transparent;border:0;color:#fff;cursor:pointer;font-size:16px;line-height:1;padding:0;">×</button>
      `;
      trakeFramesList.appendChild(frameTag);
    }

    if (selectedTrakeFrames.length >= 2) {
      const trakeSubmitContainer = body.querySelector('.trake-submit-container');
      if (trakeSubmitContainer) {
        trakeSubmitContainer.style.display = 'block';
      }
      submitTrakeBtn.textContent = `Submit TRAKE (${selectedTrakeFrames.length} frames)`;
    }
  });

  window.removeTrakeFrame = (frameNumber) => {
    const index = selectedTrakeFrames.indexOf(frameNumber);
    if (index > -1) {
      selectedTrakeFrames.splice(index, 1);
    }

    if (selectedTrakeFrames.length >= 2) {
      const trakeSubmitContainer = body.querySelector('.trake-submit-container');
      if (trakeSubmitContainer) {
        trakeSubmitContainer.style.display = 'block';
      }
      submitTrakeBtn.textContent = `Submit TRAKE (${selectedTrakeFrames.length} frames)`;
    } else {
      const trakeSubmitContainer = body.querySelector('.trake-submit-container');
      if (trakeSubmitContainer) {
        trakeSubmitContainer.style.display = 'none';
      }
    }

    if (selectedTrakeFrames.length === 0) {
      const trakeFramesDisplay = body.querySelector('.trake-frames-display');
      if (trakeFramesDisplay) {
        trakeFramesDisplay.style.display = 'none';
      }
    }
  };

  body.querySelector('.clear-trake-frames')?.addEventListener('click', () => {
    selectedTrakeFrames = [];
    const trakeFramesList = body.querySelector('.trake-frames-list');
    if (trakeFramesList) {
      trakeFramesList.innerHTML = '';
    }
    const trakeSubmitContainer = body.querySelector('.trake-submit-container');
    if (trakeSubmitContainer) {
      trakeSubmitContainer.style.display = 'none';
    }
    const trakeFramesDisplay = body.querySelector('.trake-frames-display');
    if (trakeFramesDisplay) {
      trakeFramesDisplay.style.display = 'none';
    }
  });

  submitTrakeBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (selectedTrakeFrames.length < 2) {
      alert('Please add at least 2 frames before submitting');
      return;
    }

    if (!folderName) {
      alert('Folder name not available');
      return;
    }

    try {
      const { EventRetrievalClient } = await import('../api/eventretrieval.js');
      const client = new EventRetrievalClient({
        baseURL: window.store?.eventRetrievalBaseURL || "https://eventretrieval.oj.io.vn/api/v2",
        fetchImpl: fetch.bind(window)
      });

      const username = window.store?.eventRetrievalUsername || "team052";
      const password = window.store?.eventRetrievalPassword || "ZnCTJuBWHU";

      const loginResponse = await client.login({ username, password });
      const sessionId = loginResponse.sessionId;

      if (!sessionId) {
        throw new Error('No sessionId in login response');
      }

      const evaluations = await client.listEvaluations({ session: sessionId });

      if (!Array.isArray(evaluations) || evaluations.length === 0) {
        throw new Error('No evaluations found');
      }

      const activeEval = evaluations.find(e => e.status === "CREATED" || e.status === "ACTIVE") || evaluations[0];

      if (!activeEval || !activeEval.id) {
        throw new Error('No valid evaluation found');
      }

      await submitToEventRetrievalWithFrames(folderName, selectedTrakeFrames, activeEval.id, sessionId);

      selectedTrakeFrames = [];
      const trakeFramesList = body.querySelector('.trake-frames-list');
      if (trakeFramesList) {
        trakeFramesList.innerHTML = '';
      }
      submitTrakeBtn.style.display = 'none';
      const trakeFramesDisplay = body.querySelector('.trake-frames-display');
      if (trakeFramesDisplay) {
        trakeFramesDisplay.style.display = 'none';
      }

    } catch (error) {
      console.error('❌ TRAKE Submit error:', error);
      alert(`Failed to submit TRAKE: ${error.message}`);
    }
  });

  // ==================== HOVER EFFECTS ====================
  [kisBtn, qaBtn, trakeBtn].forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = 'none';
    });
  });

  modal.setAttribute('tabindex', '-1');
  setTimeout(() => {
    try { modal.focus(); } catch {}
  }, 50);
}

// ✅ ADD Y + CLICK HANDLER TO IMAGES
export function initYoutubePreviewHandler() {
  loadYoutubeURLMapping();

  document.addEventListener('click', async (e) => {
    if (!isYKeyPressed) return;

    const img = e.target.closest('img.result-image');
    if (!img) return;

    e.preventDefault();
    e.stopPropagation();

    const imageItem = img.closest('.image-item');
    if (!imageItem) return;

    let folderName = null;

    if (imageItem.dataset.folderName) {
      folderName = imageItem.dataset.folderName;
    } else if (imageItem.dataset.videoId) {
      folderName = imageItem.dataset.videoId;
    } else if (img.src) {
      const match = img.src.match(/\/(L\d+_V\d+|K\d+_V\d+)\//);
      if (match) {
        folderName = match[1];
      }
    }

    const imageId = imageItem.getAttribute('data-image-id');
    if (imageId && !folderName) {
      const info = window.getImageInfo?.(imageId, 'keyframe');
      if (info?.folderName) {
        folderName = info.folderName;
      }
    }

    if (!folderName) {
      console.warn('⚠️ Cannot determine folder name from image');
      return;
    }

    const youtubeURL = getYoutubeURL(folderName);

    if (!youtubeURL) {
      console.warn(`⚠️ No YouTube URL found for folder: ${folderName}`);
      alert(`No YouTube video found for ${folderName}`);
      return;
    }

    const meta = {
      folderName: folderName,
      keyframeName: imageItem.dataset.keyframe || null,
      seconds: parseFloat(imageItem.dataset.seconds) || 0
    };

    if (!meta.seconds && imageId) {
      const info = window.getImageInfo?.(imageId, 'keyframe');
      if (info?.seconds) {
        meta.seconds = info.seconds;
      }
    }

    console.log('🎬 Opening YouTube preview:', {
      folderName,
      youtubeURL,
      meta
    });

    showYouTubePreviewModalFromYoutube(youtubeURL, meta);
  }, true);

  console.log('✅ YouTube preview handler initialized (Y + Click)');
}

// ❌ REMOVED AUTO-INITIALIZE - Let main.js handle initialization
// This was causing double initialization and event listener conflicts