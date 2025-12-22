import { store } from '../state/store.js';
/**
 *
 * Initialize quick submit functionality on Ctrl+Shift+Click
 */
export function initializeQuickKISSubmit() {
    console.log('🚀 Initializing Quick Submit (Ctrl+Shift+Click)');
    
    // Array để lưu frames đã chọn (global state)
    window.selectedSubmitFrames = window.selectedSubmitFrames || [];
    
    // Add event listener to document to catch all image clicks
    document.addEventListener('click', async (e) => {
        // Check if Ctrl+Shift is pressed
        if (!e.ctrlKey || !e.shiftKey) return;
        
        // Find the clicked image or its parent
        let target = e.target;
        let imageElement = null;
        let resultId = null;
        let folderName = null;
        let keyframeName = null;
        
        // Case 1: Direct click on <img> tag
        if (target.tagName === 'IMG') {
            imageElement = target;
        }
        // Case 2: Click on parent container
        else if (target.classList.contains('result-item') || target.closest('.result-item')) {
            const container = target.classList.contains('result-item') ? target : target.closest('.result-item');
            imageElement = container.querySelector('img');
        }
        // Case 3: Click in gallery modal
        else if (target.closest('.gallery-main-image-container')) {
            const container = target.closest('.gallery-main-image-container');
            imageElement = container.querySelector('img');
        }
        // Case 4: Image item trong search results
        else if (target.classList.contains('image-item') || target.closest('.image-item')) {
            const container = target.classList.contains('image-item') ? target : target.closest('.image-item');
            imageElement = container.querySelector('img');
        }
        
        if (!imageElement) return;
        
        // Prevent default action
        e.preventDefault();
        e.stopPropagation();
        
        // Extract metadata from image or container
        const container = imageElement.closest('.result-item') || 
                         imageElement.closest('.gallery-main-image-container') ||
                         imageElement.closest('.image-item');
        
        if (container) {
            resultId = container.dataset.resultId || container.dataset.id || container.dataset.imageId;
            folderName = container.dataset.folderName || container.dataset.folder;
            keyframeName = container.dataset.keyframeName || container.dataset.keyframe;
        }
        
        // Fallback: parse from image src or alt
        if (!resultId || !folderName) {
            const src = imageElement.src || '';
            const alt = imageElement.alt || '';
            
            // Try to extract from URL
            const urlMatch = src.match(/\/api\/image\/([^?]+)/);
            if (urlMatch) {
                resultId = urlMatch[1];
            }
            
            // Try to get info from overlay
            const overlay = container?.querySelector('.image-overlay');
            if (overlay) {
                const folderEl = overlay.querySelector('.folder-name');
                const keyframeEl = overlay.querySelector('.keyframe-name');
                folderName = folderEl?.textContent?.trim();
                keyframeName = keyframeEl?.textContent?.trim();
            }
        }
        
        // ✅ FALLBACK: Dùng getImageInfo từ main.js
        if (!folderName && resultId) {
            const imageInfo = window.getImageInfo?.(resultId, 'keyframe');
            if (imageInfo) {
                folderName = imageInfo.folderName;
                keyframeName = imageInfo.keyframeName;
            }
        }
        
        if (!resultId || !folderName) {
            console.error('❌ Cannot extract metadata from image:', { resultId, folderName });
            showSubmitNotification('Failed to extract image metadata', 'error');
            return;
        }
        
        // Extract frame number
        let frameNumber = null;
        
        if (keyframeName) {
            const frameMatch = keyframeName.match(/keyframe_(\d+)/);
            if (frameMatch) {
                frameNumber = parseInt(frameMatch[1]);
            }
        }
        
        if (!frameNumber && resultId) {
            const idMatch = String(resultId).match(/_(\d+)$/);
            if (idMatch) {
                frameNumber = parseInt(idMatch[1]);
            }
        }
        
        if (!frameNumber) {
            showSubmitNotification('Cannot extract frame number', 'error');
            return;
        }
        
        // ✅ ADD FRAME VÀO SELECTION
        addFrameToSelection(folderName, frameNumber);
        
    }, true); // Use capture phase
}

/**
 * Add frame to selection and show/update submit button
 */
function addFrameToSelection(videoId, frameNumber) {
    // Initialize if needed
    if (!window.selectedSubmitFrames) {
        window.selectedSubmitFrames = [];
    }
    
    // Check if already added
    const existing = window.selectedSubmitFrames.find(f => 
        f.videoId === videoId && f.frameNumber === frameNumber
    );
    
    if (existing) {
        showSubmitNotification(`Frame ${frameNumber} already added!`, 'warning');
        return;
    }
    
    // Add frame
    window.selectedSubmitFrames.push({ videoId, frameNumber });
    
    // Sort frames
    window.selectedSubmitFrames.sort((a, b) => a.frameNumber - b.frameNumber);
    
    console.log('✅ Added frame:', { videoId, frameNumber });
    console.log('📋 Total frames:', window.selectedSubmitFrames.length);
    
    // Show notification
    showSubmitNotification(
        `Added Frame ${frameNumber}`,
        'success',
        `Total: ${window.selectedSubmitFrames.length} frame(s)`
    );
    
    // Show or update submit button
    showSubmitButton();
}

/**
 * Check if modal is open and adjust button positions
 */
function adjustButtonsForModal() {
    const modal = document.querySelector('.video-frames-modal');
    const isModalOpen = !!modal;
    
    const submitBtn = document.getElementById('quick-submit-btn');
    const clearBtn = document.getElementById('quick-clear-btn');
    const qaInput = document.getElementById('quick-qa-input');
    
    // Get all existing notifications
    const existingNotifications = document.querySelectorAll('[data-notification-type]');
    
    if (isModalOpen) {
        // Modal is open - move buttons up (bottom ~800px) with 60px spacing
        // Clear All (bottom): 800px
        // Submit Button (middle): 860px (60px above Clear All)
        // QA Input (top): 920px (60px above Submit Button)
        if (clearBtn) {
            clearBtn.style.bottom = '950px';
            clearBtn.style.right = '40px';
        }
        if (submitBtn) {
            submitBtn.style.bottom = '950px';
            submitBtn.style.right = '150px';
        }
        if (qaInput) {
            qaInput.style.bottom = '950px';
            qaInput.style.right = '310px';
        }
        
        // Move notifications to top left
        existingNotifications.forEach(notif => {
            notif.style.right = 'auto';
            notif.style.left = '24px';
            // Update animation direction for closing
            const currentTransform = notif.style.transform;
            if (currentTransform && currentTransform.includes('translateX(100px)')) {
                notif.style.transform = currentTransform.replace('translateX(100px)', 'translateX(-100px)');
            }
        });
    } else {
        // Modal is closed - restore original positions
        if (submitBtn) {
            submitBtn.style.bottom = '785px';
            submitBtn.style.right = '150px';
        }
        if (clearBtn) {
            clearBtn.style.bottom = '785px';
            clearBtn.style.right = '40px';
        }
        if (qaInput) {
            qaInput.style.bottom = '785px';
            qaInput.style.right = '310px';
        }
        
        // Move notifications back to top right
        existingNotifications.forEach(notif => {
            notif.style.left = 'auto';
            notif.style.right = '24px';
            // Update animation direction for closing
            const currentTransform = notif.style.transform;
            if (currentTransform && currentTransform.includes('translateX(-100px)')) {
                notif.style.transform = currentTransform.replace('translateX(-100px)', 'translateX(100px)');
            }
        });
    }
}

/**
 * Show floating submit button
 */
function showSubmitButton() {
    const frames = window.selectedSubmitFrames;
    const frameCount = frames.length;
    
    if (frameCount === 0) {
        // Remove buttons if no frames
        document.getElementById('quick-submit-btn')?.remove();
        document.getElementById('quick-clear-btn')?.remove();
        document.getElementById('quick-qa-input')?.remove();
        return;
    }
    
    const mode = frameCount === 1 ? 'KIS/QA' : 'TRAKE';
    const buttonColor = '#4bae4f'; // Màu xanh lá đơn sắc
    
    // Get or create submit button
    let submitBtn = document.getElementById('quick-submit-btn');
    
    if (!submitBtn) {
        submitBtn = document.createElement('button');
        submitBtn.id = 'quick-submit-btn';
        submitBtn.style.cssText = `
            position: fixed;
            bottom: 785px;
            right: 150px;
            background: ${buttonColor};
            color: #fff;
            border: 0;
            border-radius: 12px;
            padding: 16px 20px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            z-index: 10002;
            max-width: 300px;
            transition: all 0.3s ease-out;
        `;
        
        document.body.appendChild(submitBtn);
        
                // Hover effect
        submitBtn.addEventListener('mouseenter', () => {
            submitBtn.style.background = '#409442ff'; // Màu xanh lá nhạt hơn khi hover
        });
        
        submitBtn.addEventListener('mouseleave', () => {
            submitBtn.style.background = buttonColor; // Trở về màu ban đầu
        });
        
        // Click handler
        submitBtn.addEventListener('click', handleQuickSubmit);
    }
    
    // Update button style and content
    submitBtn.style.background = buttonColor;
    
    // Display frames
    const framesList = frames.map(f => f.frameNumber).join(', ');
    const videoId = frames[0]?.videoId || '';
    
    submitBtn.innerHTML = `
        <div style="font-weight: 700; font-size: 15px; margin-bottom: 8px;">
            Submit ${mode}
        </div>
        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 6px;">
            ${videoId}
        </div>
        <div style="font-size: 11px; opacity: 0.85; max-height: 60px; overflow-y: auto; line-height: 1.4;">
            Frames (${frameCount}): ${framesList}
        </div>
    `;
    
    // ✅ QA Input - only show when exactly 1 frame
    let qaInput = document.getElementById('quick-qa-input');
    
    if (frameCount === 1) {
        if (!qaInput) {
            qaInput = document.createElement('input');
            qaInput.id = 'quick-qa-input';
            qaInput.type = 'text';
            qaInput.placeholder = 'Enter QA answer...';
            qaInput.style.cssText = `
                &::placeholder {
                    color: rgba(255, 255, 255, 0.8);
                    font-weight: 500;
                }
            `;
            qaInput.style.cssText = `
                position: fixed;
                bottom: 785px;
                right: 310px;
                background: #1e1e1e;
                color: #fff;
                border: 1px solid #333;
                border-radius: 8px;
                padding: 14px 18px;
                font-size: 14px;
                font-weight: 500;
                line-height: 1.4;
                letter-spacing: 0.3px;
                width: 268px;
                z-index: 10002;
                transition: all 0.3s ease-out;
            `;
            
            // Focus effect
            qaInput.addEventListener('focus', () => {
                qaInput.style.border = '1px solid #20af5cff';
                qaInput.style.backgroundColor = '#242424';
            });
            
            qaInput.addEventListener('blur', () => {
                qaInput.style.border = '1px solid #333';
                qaInput.style.backgroundColor = '#1e1e1e';
            });
            
            document.body.appendChild(qaInput);
        }
    } else {
        // Remove QA input if more than 1 frame
        qaInput?.remove();
    }
    
    // Get or create clear button
    let clearBtn = document.getElementById('quick-clear-btn');
    
    if (!clearBtn) {
        clearBtn = document.createElement('button');
        clearBtn.id = 'quick-clear-btn';
        clearBtn.style.cssText = `
            position: fixed;
            bottom: 785px;
            right: 40px;
            background: #e74c3c;
            color: #fff;
            border: 0;
            border-radius: 12px;
            padding: 16px 20px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            z-index: 10002;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: all 0.3s ease-out;
        `;
        
        clearBtn.textContent = 'Clear All';
        
        document.body.appendChild(clearBtn);
        
        // Hover effect
        clearBtn.addEventListener('mouseenter', () => {
            clearBtn.style.background = '#c0392b'; // Màu đỏ đậm hơn khi hover
        });
        
        clearBtn.addEventListener('mouseleave', () => {
            clearBtn.style.background = '#e74c3c'; // Trở về màu đỏ ban đầu
        });
        
        // Click handler
        clearBtn.addEventListener('click', () => {
            window.selectedSubmitFrames = [];
            showSubmitButton(); // Will remove all buttons since frameCount = 0
            showSubmitNotification('Cleared all frames', 'success');
        });
    }
    
    // Adjust positions based on modal state
    adjustButtonsForModal();
}
/**
 * Handle quick submit
 */
async function handleQuickSubmit() {
    const frames = window.selectedSubmitFrames;
    
    if (!frames || frames.length === 0) {
        showSubmitNotification('No frames selected', 'error');
        return;
    }
    
    // Group frames by videoId
    const videoGroups = {};
    frames.forEach(f => {
        if (!videoGroups[f.videoId]) {
            videoGroups[f.videoId] = [];
        }
        videoGroups[f.videoId].push(f.frameNumber);
    });
    
    // Validate: all frames must be from same video
    const videoIds = Object.keys(videoGroups);
    if (videoIds.length > 1) {
        showSubmitNotification('All frames must be from the same video!', 'error');
        return;
    }
    
    const videoId = videoIds[0];
    const frameNumbers = videoGroups[videoId];
    
    // ✅ Get QA answer if single frame
    const qaInput = document.getElementById('quick-qa-input');
    const qaAnswer = frameNumbers.length === 1 ? (qaInput?.value?.trim() || '') : '';
    
    // Determine mode
    let mode;
    if (frameNumbers.length === 1) {
        mode = qaAnswer ? 'qa' : 'kis';
    } else {
        mode = 'trake';
    }
    
    // Show loading
    const submitBtn = document.getElementById('quick-submit-btn');
    const clearBtn = document.getElementById('quick-clear-btn');
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.6';
        submitBtn.style.cursor = 'not-allowed';
        submitBtn.innerHTML = `
            <div style="width:20px;height:20px;border:3px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto;"></div>
            <div style="margin-top:8px;">Submitting...</div>
        `;
    }
    
    if (clearBtn) {
        clearBtn.disabled = true;
        clearBtn.style.opacity = '0.6';
        clearBtn.style.cursor = 'not-allowed';
    }
    
    if (qaInput) {
        qaInput.disabled = true;
        qaInput.style.opacity = '0.6';
    }
    
    try {
        // ✅ SỬ DỤNG sessionId TỪ STORE ĐÃ IMPORT
        let sessionId = store.sessionId || localStorage.getItem('eventRetrieval_sessionId');
        
        console.log('🔍 Quick Submit - Checking sessionId:', {
            fromStore: store.sessionId,
            fromLocalStorage: localStorage.getItem('eventRetrieval_sessionId'),
            finalSessionId: sessionId
        });
        
        // Import EventRetrievalClient
        const { EventRetrievalClient } = await import('../api/eventretrieval.js');
        
        // ✅ KHỞI TẠO CLIENT VỚI baseURL
        const client = new EventRetrievalClient({
            baseURL: store.eventRetrievalBaseURL || "https://eventretrieval.oj.io.vn/api/v2",
            fetchImpl: fetch.bind(window)
        });
        
        if (!sessionId) {
            // Nếu chưa có, thực hiện login
            console.log('🔐 Quick Submit: No sessionId found, logging in...');
            
            const username = store.eventRetrievalUsername || "team052";
            const password = store.eventRetrievalPassword || "ZnCTJuBWHU";
            
            const loginResponse = await client.login({ username, password });
            sessionId = loginResponse.sessionId;
            
            // ✅ Lưu lại vào store và localStorage
            store.sessionId = sessionId;
            localStorage.setItem('eventRetrieval_sessionId', sessionId);
            localStorage.setItem('eventRetrieval_loginTime', Date.now().toString());
            
            // ✅ Update login button nếu có
            try {
                const { refreshLoginButton } = await import('../components/LoginButton.js');
                refreshLoginButton();
            } catch (e) {
                console.warn('Could not refresh login button:', e);
            }
            
            console.log('✅ Logged in and saved sessionId:', sessionId);
        } else {
            console.log('✅ Using existing sessionId:', sessionId);
        }
        
        if (!sessionId) {
            throw new Error('No sessionId available');
        }
        
        // Get active evaluation
        const evaluations = await client.listEvaluations({ session: sessionId });
        
        if (!Array.isArray(evaluations) || evaluations.length === 0) {
            throw new Error('No evaluations found');
        }
        
        const activeEval = evaluations.find(e => e.type === 'SYNCHRONOUS' && e.status === 'ACTIVE') || evaluations[0];
        
        if (!activeEval || !activeEval.id) {
            throw new Error('No valid evaluation found');
        }
        
        console.log('✅ Found evaluation:', activeEval.id);
        
        let result;
        let details;
        
        if (mode === 'qa') {
            // ✅ Submit as QA
            console.log('📤 Submitting QA:', { videoId, frameNumber: frameNumbers[0], answer: qaAnswer });
            
            const fps = store.fpsMapping?.[videoId] || 25;
            const timeMs = Math.round((frameNumbers[0] / fps) * 1000);
            
            result = await client.submitQA({
                evaluationId: activeEval.id,
                session: sessionId,
                answer: {
                    value: qaAnswer,
                    videoId: videoId,
                    timeMs: timeMs
                }
            });
            
            details = `${videoId}<br>Frame ${frameNumbers[0]} → ${timeMs}ms<br>Answer: "${qaAnswer}"`;
            
        } else if (mode === 'kis') {
            // Submit single frame as KIS
            console.log('📤 Submitting KIS:', { videoId, frameNumber: frameNumbers[0] });
            
            const fps = store.fpsMapping?.[videoId] || 25;
            const frameMs = Math.round((frameNumbers[0] / fps) * 1000);
            
            console.log(`📊 Converting frame ${frameNumbers[0]} to ${frameMs}ms (FPS: ${fps})`);
            
            result = await client.submitKIS({
                evaluationId: activeEval.id,
                session: sessionId,
                answers: [{
                    mediaItemName: videoId,
                    start: frameMs,
                    end: frameMs
                }]
            });
            
            details = `${videoId}<br>Frame ${frameNumbers[0]} → ${frameMs}ms<br>(FPS: ${fps})`;
            
        } else {
            // Submit multiple frames as TRAKE
            console.log('📤 Submitting TRAKE:', { videoId, frameNumbers });
            
            result = await client.submitTRAKE({
                evaluationId: activeEval.id,
                session: sessionId,
                videoId: videoId,
                frameIds: frameNumbers
            });
            
            const framesDisplay = frameNumbers.length > 10 
                ? `${frameNumbers.slice(0, 10).join(', ')}... (+${frameNumbers.length - 10} more)`
                : frameNumbers.join(', ');
            
            details = `${videoId}<br>Frames (${frameNumbers.length}): ${framesDisplay}`;
        }
        
        console.log('✅ Submission result:', result);
        
        // ✅ PARSE RESPONSE & DETERMINE SUCCESS/FAILURE
        let notificationType = 'success';
        let notificationTitle = `${mode.toUpperCase()} Submitted`;
        let notificationDetails = details;
        
        // Check if result has status and submission fields
        if (result && typeof result === 'object') {
            if (result.submission === 'CORRECT') {
                notificationType = 'success';
                notificationTitle = `✅ ${mode.toUpperCase()} - CORRECT!`;
                notificationDetails = `${result.description || 'Well done!'}<br><br>${details}`;
            } else if (result.submission === 'WRONG') {
                notificationType = 'error';
                notificationTitle = `❌ ${mode.toUpperCase()} - WRONG`;
                notificationDetails = `${result.description || 'Try again!'}<br><br>${details}`;
            } else if (result.status === true) {
                // Generic success
                notificationType = 'success';
                notificationTitle = `✅ ${mode.toUpperCase()} Submitted`;
                notificationDetails = `${result.description || 'Submitted successfully!'}<br><br>${details}`;
            } else if (result.status === false) {
                // Generic failure
                notificationType = 'error';
                notificationTitle = `❌ ${mode.toUpperCase()} Failed`;
                notificationDetails = `${result.description || 'Submission failed!'}<br><br>${details}`;
            }
        }
        
        // Show notification with parsed result
        showSubmitNotification(
            notificationTitle,
            notificationType,
            notificationDetails
        );
        
        // ✅ CLEAR SELECTION AFTER SUCCESS (only if status is true)
        if (result?.status === true || result?.submission === 'CORRECT') {
            window.selectedSubmitFrames = [];
            
            // Remove buttons and input
            submitBtn?.remove();
            clearBtn?.remove();
            qaInput?.remove();
        } else {
            // ✅ RESTORE BUTTONS if wrong answer
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.style.cursor = 'pointer';
            }
            
            if (clearBtn) {
                clearBtn.disabled = false;
                clearBtn.style.opacity = '1';
                clearBtn.style.cursor = 'pointer';
            }
            
            if (qaInput) {
                qaInput.disabled = false;
                qaInput.style.opacity = '1';
            }
            
            // Redraw submit button
            showSubmitButton();
        }
        
    } catch (error) {
        console.error('❌ Quick submit failed:', error);
        
        // ✅ NẾU LỖI 401 (Unauthorized), XÓA sessionId
        if (error.status === 401 || error.message?.includes('Unauthorized')) {
            store.sessionId = null;
            localStorage.removeItem('eventRetrieval_sessionId');
            
            // Update login button
            try {
                const { refreshLoginButton } = await import('../components/LoginButton.js');
                refreshLoginButton();
            } catch (e) {
                console.error('Failed to refresh login button:', e);
            }
            
            showSubmitNotification(
                'Session expired. Please login again.',
                'error'
            );
        } else {
            showSubmitNotification(
                `Submission Failed: ${error.message}`,
                'error'
            );
        }
        
        // ✅ RESTORE BUTTONS
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
        }
        
        if (clearBtn) {
            clearBtn.disabled = false;
            clearBtn.style.opacity = '1';
            clearBtn.style.cursor = 'pointer';
        }
        
        if (qaInput) {
            qaInput.disabled = false;
            qaInput.style.opacity = '1';
        }
        
        // Redraw submit button with frames
        showSubmitButton();
    }
}

/**
 * Show submit notification
 */
function showSubmitNotification(message, type = 'info', details = '') {
    // Remove existing notifications first
    const existingNotifications = document.querySelectorAll('[data-notification-type]');
    existingNotifications.forEach(n => n.remove());

    // Check if modal is open to determine notification position
    const modal = document.querySelector('.video-frames-modal');
    const isModalOpen = !!modal;
    
    // Position: top left when modal is open, top right when modal is closed
    const positionStyle = isModalOpen 
        ? 'left: 24px; right: auto;' 
        : 'right: 24px; left: auto;';
    
    // Animation direction: slide from left when modal open, from right when closed
    const slideInAnimation = isModalOpen 
        ? 'slideInFromLeft 0.3s ease-out' 
        : 'slideIn 0.3s ease-out';

    const notification = document.createElement('div');
    notification.setAttribute('data-notification-type', type);
    notification.style.cssText = `
        position: fixed;
        top: 24px;
        ${positionStyle}
        background: #1a1a1a;
        color: #fff;
        padding: 16px 20px;
        border-radius: 10px;
        z-index: 10003;
        box-shadow: 0 8px 24px rgba(0,0,0,0.6);
        min-width: 300px;
        max-width: 500px;
        border: 1px solid #333;
        animation: ${slideInAnimation};
    `;
    
    let bgColor = '#1a1a1a';
    let borderColor = '#333';
    
    if (type === 'loading') {
        bgColor = '#2c3e50';
    } else if (type === 'success') {
        bgColor = '#27ae60';
        borderColor = '#27ae60';
    } else if (type === 'error') {
        bgColor = '#e74c3c';
        borderColor = '#e74c3c';
    } else if (type === 'warning') {
        bgColor = '#f39c12';
        borderColor = '#f39c12';
    }
    
    notification.innerHTML = `
        <div>
            <div style="font-weight:600;font-size:15px;margin-bottom:${details ? '6px' : '0'};">
                ${message}
            </div>
            ${details ? `<div style="font-size:12px;color:#aaa;line-height:1.6;">${details}</div>` : ''}
        </div>
    `;
    
    notification.style.background = bgColor;
    notification.style.borderColor = borderColor;
    
    document.body.appendChild(notification);
    
    // Auto remove
    if (type !== 'loading') {
        setTimeout(() => {
            notification.style.transition = 'opacity 0.3s, transform 0.3s';
            notification.style.opacity = '0';
            // Slide out direction: left when modal open, right when closed
            const slideOutTransform = isModalOpen 
                ? 'translateX(-100px)' 
                : 'translateX(100px)';
            notification.style.transform = slideOutTransform;
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    return notification;
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
    #quick-qa-input::placeholder {
        color: rgba(255, 255, 255, 0.8) !important;
        font-weight: 500 !important;
    }
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(100px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    
    @keyframes slideInFromLeft {
        from {
            opacity: 0;
            transform: translateX(-100px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Observer to watch for modal open/close
let modalObserver = null;

function setupModalObserver() {
    // Watch for modal appearance/disappearance
    modalObserver = new MutationObserver(() => {
        adjustButtonsForModal();
    });
    
    // Observe body for modal changes
    modalObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Also check periodically (fallback)
    setInterval(() => {
        adjustButtonsForModal();
    }, 500);
}

// Auto-initialize when module loads
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initializeQuickKISSubmit();
            setupModalObserver();
        });
    } else {
        initializeQuickKISSubmit();
        setupModalObserver();
    }
}