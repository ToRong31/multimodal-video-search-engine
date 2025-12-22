/**
 * Create and show modal with all frames from a video
 */
export async function showVideoFramesModal(videoId, initialResultId) {
  console.log('🎬 Opening video frames modal for:', videoId);
  console.log('🔍 Initial result ID:', initialResultId);
  
  const modal = document.createElement('div');
  modal.className = 'video-frames-modal';
  modal.innerHTML = `
    <div class="video-frames-content">
      <div class="video-frames-header">
        <h2>All Frames - ${videoId}</h2>
        <button class="close-modal" title="Close (Esc)">&times;</button>
      </div>
      <div class="video-frames-info">
        <span class="loading-indicator">Loading frames...</span>
      </div>
      <div class="video-frames-grid" id="videoFramesGrid">
        <!-- Frames will be loaded here -->
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const closeBtn = modal.querySelector('.close-modal');
  const closeModal = () => {
    modal.remove();
  };
  
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
  
  try {
    const response = await fetch(`/api/video-frames?video_id=${encodeURIComponent(videoId)}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to load frames');
    }
    
    const data = await response.json();
    const grid = modal.querySelector('#videoFramesGrid');
    const info = modal.querySelector('.video-frames-info');
    
    info.innerHTML = `<span>Total frames: ${data.total_frames}</span>`;
    
    console.log(`✅ Loaded ${data.total_frames} frames`);
    console.log('📦 First frame sample:', data.frames[0]);
    
    // Render frames giống như search results
    data.frames.forEach((frame, index) => {
      // Create frame container (giống .image-item)
      const frameDiv = document.createElement('div');
      frameDiv.className = 'video-frame-item image-item loading';
      frameDiv.dataset.imageId = frame.result_id;
      
      // Highlight initial frame (compare as strings to handle both string and number IDs)
      if (initialResultId && String(initialResultId) === String(frame.result_id)) {
        frameDiv.classList.add('initial-frame');
        console.log(`✅ Found initial frame to highlight: ${frame.result_id}`);
      }
      
      const imageUrl = `/api/image/${frame.result_id}?method=keyframe`;
      
      // Create image element
      const img = document.createElement('img');
      img.className = 'result-image';
      img.alt = `Frame ${frame.frame_id}`;
      img.loading = 'lazy';
      img.dataset.resultId = frame.result_id;
      
      // Handle image load
      img.addEventListener('load', () => {
        frameDiv.classList.remove('loading');
      });
      
      // Handle image error
      img.addEventListener('error', () => {
        frameDiv.classList.remove('loading');
        frameDiv.classList.add('error');
        console.error(`❌ Failed to load: ${imageUrl}`);
      });
      
      img.src = imageUrl;
      
      // Create info overlay (giống .image-overlay)
      const infoOverlay = document.createElement('div');
      infoOverlay.className = 'frame-info image-overlay';
      infoOverlay.innerHTML = `
        <span class="frame-id">${frame.frame_id}</span>
        <span class="frame-number">#${index + 1}</span>
      `;
      
      // Create action buttons overlay
      // Create action buttons overlay
      const actionsOverlay = document.createElement('div');
      actionsOverlay.className = 'frame-actions';
      actionsOverlay.style.cssText = 'position:absolute;bottom:8px;right:8px;display:flex;gap:6px;z-index:10;';
      
      // Add to Chat button
      // Add to Chat button
      // Add to Chat button
      const addToChatBtn = document.createElement('button');
      addToChatBtn.className = 'frame-action-btn add-to-chat-btn';
      addToChatBtn.innerHTML = '+';
      addToChatBtn.title = 'Add to Chat';
      addToChatBtn.style.cssText = 'position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.7);color:white;border:none;border-radius:30%;width:22px;height:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;transition:all 0.2s ease;z-index:10;';
      
      addToChatBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        // Get frame info
        const imageInfo = window.getImageInfo?.(frame.result_id, 'keyframe');
        if (!imageInfo) {
          console.error('❌ Cannot get image info for:', frame.result_id);
          return;
        }
        
        // Extract frame number from keyframe (e.g., "keyframe_414" -> 414)
        let frameNum = frame.frame_id;
        if (typeof imageInfo.keyframe === 'string' && imageInfo.keyframe.startsWith('keyframe_')) {
          frameNum = imageInfo.keyframe.replace('keyframe_', '');
        }
        
        // Build the payload with proper structure
        const payload = {
          imageUrl: `/api/image/${frame.result_id}?method=keyframe`,
          folderName: imageInfo.folder || imageInfo.folderName || videoId,
          keyframe: imageInfo.keyframe,
          videoId: frame.result_id,
          frameNumber: frameNum
        };
        
        // Use ChatSync to send the message (proper way with websocket sync)
        if (window.ChatSync && typeof window.ChatSync.sendImageMessage === 'function') {
          window.ChatSync.sendImageMessage(payload);
          
          // Show chat box
          const chatBox = document.getElementById('chatBox');
          if (chatBox) {
            chatBox.classList.add('active');
            chatBox.style.display = 'flex';
          }
          
          // Visual feedback
          addToChatBtn.innerHTML = '✓';
          addToChatBtn.style.background = 'rgba(46,204,113,0.9)';
          setTimeout(() => {
            addToChatBtn.innerHTML = '+';
            addToChatBtn.style.background = 'rgba(0,0,0,0.7)';
          }, 1000);
        } else {
          console.error('❌ ChatSync module is not ready');
        }
      });
      
      // Hover effect - chuyển sang nền trắng
      addToChatBtn.addEventListener('mouseenter', () => {
        addToChatBtn.style.background = 'white';
        addToChatBtn.style.color = 'black';
      });
      
      addToChatBtn.addEventListener('mouseleave', () => {
        addToChatBtn.style.background = 'rgba(0,0,0,0.7)';
        addToChatBtn.style.color = 'white';
      });
      
      // Không cần actionsOverlay nữa, append trực tiếp button vào frameDiv
      frameDiv.appendChild(img);
      frameDiv.appendChild(infoOverlay);
      frameDiv.appendChild(addToChatBtn);
      
      grid.appendChild(frameDiv);
    });
    
    // Scroll to initial frame
    const initialFrame = grid.querySelector('.initial-frame');
    if (initialFrame) {
      setTimeout(() => {
        initialFrame.scrollIntoView({ behavior: 'instant', block: 'center' });
      }, 100);
    }
    
  } catch (error) {
    console.error('❌ Error loading video frames:', error);
    const grid = modal.querySelector('#videoFramesGrid');
    const info = modal.querySelector('.video-frames-info');
    info.innerHTML = '';
    grid.innerHTML = `
      <div class="error-message">
        <p>Failed to load frames</p>
        <p style="font-size: 0.9em; color: #999;">${error.message}</p>
      </div>
    `;
  }
}