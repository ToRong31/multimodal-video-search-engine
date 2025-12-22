/**
 * Mock Image display utilities - Always loads 100 images per panel
 */

/**
 * Get mock image URL for a result item
 * @param {string|number} frameIdx - The frame index from search results
 * @param {boolean} useKeyframe - Whether to use keyframe or scene images
 * @returns {string} - The mock image URL
 */
export function getMockImageUrl(frameIdx, useKeyframe = true) {
    return `/api/mock-image/${frameIdx}?use_keyframe=${useKeyframe}`;
}

/**
 * Create mock image element
 * @param {Object} result - Result object with frame_idx, etc.
 * @param {boolean} useKeyframe - Whether to use keyframe images
 * @param {Object} options - Additional options
 * @returns {HTMLElement} - Image element
 */
export function createMockImageElement(result, useKeyframe = true, options = {}) {
    const img = document.createElement('img');
    img.src = getMockImageUrl(result.frame_idx, useKeyframe);
    img.alt = options.alt || `Frame at ${result.timestamp}s`;
    img.className = options.className || 'result-image';
    
    if (options.loading) {
        img.loading = options.loading;
    }
    
    // Add error handling with retry
    img.onerror = () => {
        console.warn(`Failed to load image for frame ${result.frame_idx}, using fallback`);
        // Try with a different frame index as fallback
        const fallbackFrame = Math.floor(Math.random() * 1000);
        img.src = getMockImageUrl(fallbackFrame, useKeyframe);
    };
    
    return img;
}

/**
 * Display 100 mock images in a panel
 * @param {HTMLElement} container - Panel container element
 * @param {Array} results - Search results array (should have 100 items)
 * @param {Object} searchCriteria - Original search criteria
 */
export function displayMockImagesInPanel(container, results, searchCriteria) {
    if (!container || !results || results.length === 0) return;
    
    const useKeyframe = shouldUseKeyframe(searchCriteria);
    console.log(`🖼️ Displaying ${results.length} MOCK images using ${useKeyframe ? 'keyframe' : 'scene'} sources`);
    
    // Clear existing content
    container.innerHTML = '';
    
    // Create loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-images';
    loadingDiv.innerHTML = `
        <div>Loading ${results.length} images...</div>
        <div class="loading-progress">
            <div class="progress-bar"></div>
        </div>
    `;
    container.appendChild(loadingDiv);
    
    // Create image grid
    const imageGrid = document.createElement('div');
    imageGrid.className = 'image-grid';
    
    // Add header info
    const headerInfo = document.createElement('div');
    headerInfo.className = 'panel-header';
    headerInfo.innerHTML = `
        <div class="panel-title">Search Results (${results.length} images)</div>
        <div class="panel-info">Source: ${useKeyframe ? 'Keyframe' : 'Scene'} images</div>
        <div class="panel-criteria">
            ${searchCriteria.has_asr ? '🎤 ASR ' : ''}

            ${Object.entries(searchCriteria.active_models || {})
                .filter(([k, v]) => v)
                .map(([k, v]) => `🤖 ${k}`)
                .join(' ')
            }
        </div>
    `;
    
    // Process all 100 images
    let loadedCount = 0;
    const progressBar = loadingDiv.querySelector('.progress-bar');
    
    // Load images in smaller batches for better UX
    const batchSize = 10;
    let currentBatch = 0;
    
    const loadBatch = () => {
        const startIdx = currentBatch * batchSize;
        const endIdx = Math.min(startIdx + batchSize, results.length);
        const batch = results.slice(startIdx, endIdx);
        
        batch.forEach((result, batchIndex) => {
            const globalIndex = startIdx + batchIndex;
            
            try {
                const imageContainer = document.createElement('div');
                imageContainer.className = 'image-item';
                imageContainer.style.animationDelay = `${batchIndex * 0.1}s`;
                
                // Create image element
                const img = createMockImageElement(result, useKeyframe, {
                    alt: `Frame at ${result.timestamp}s (Rank: ${result.rank})`,
                    className: 'result-image',
                    loading: 'lazy'
                });
                
                // Add load event to track progress
                img.onload = () => {
                    loadedCount++;
                    const progress = (loadedCount / results.length) * 100;
                    if (progressBar) {
                        progressBar.style.width = `${progress}%`;
                    }
                    
                    // Remove loading indicator when all images are loaded
                    if (loadedCount === results.length && container.contains(loadingDiv)) {
                        setTimeout(() => {
                            if (container.contains(loadingDiv)) {
                                container.removeChild(loadingDiv);
                            }
                        }, 500);
                    }
                };
                
                // Add metadata overlay - simplified for new system
                const overlay = document.createElement('div');
                overlay.className = 'image-overlay';
                
                // For the old image display system, just show basic info
                overlay.innerHTML = `

                    <div class="timestamp">${result.timestamp || 0}s</div>
                    <div class="score">Score: ${result.score || 0}</div>
                    <div class="rank">#${result.rank || 0}</div>
                `;
                
                // Add click handler for image details
                imageContainer.addEventListener('click', () => {
                    console.log('🖼️ Image clicked:', result);
                    showImageDetails(result, useKeyframe);
                });
                
                imageContainer.appendChild(img);
                imageContainer.appendChild(overlay);
                imageGrid.appendChild(imageContainer);
                
            } catch (error) {
                console.error(`Error creating image for result ${globalIndex}:`, error);
            }
        });
        
        currentBatch++;
        
        // Load next batch after a short delay
        if (currentBatch * batchSize < results.length) {
            setTimeout(loadBatch, 200);
        }
    };
    
    // Start loading
    container.appendChild(headerInfo);
    container.appendChild(imageGrid);
    loadBatch();
    
    console.log(`✅ Started loading ${results.length} mock images in batches of ${batchSize}`);
}

/**
 * Show detailed view of an image
 * @param {Object} result - The result object
 * @param {boolean} useKeyframe - Image source type
 */
function showImageDetails(result, useKeyframe) {
    // Create modal or detailed view
    const modal = document.createElement('div');
    modal.className = 'image-detail-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Frame ${result.frame_idx}</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <img src="${getMockImageUrl(result.frame_idx, useKeyframe)}" 
                     alt="Full size image" class="full-image">
                <div class="image-details">
                    <p><strong>Timestamp:</strong> ${result.timestamp}s</p>
                    <p><strong>Score:</strong> ${result.score}</p>
                    <p><strong>Rank:</strong> #${result.rank}</p>
                    <p><strong>Source:</strong> ${useKeyframe ? 'Keyframe' : 'Scene'}</p>
                    <p><strong>Matched by:</strong> ${result.matched_by}</p>
                </div>
            </div>
        </div>
    `;
    
    // Add to document
    document.body.appendChild(modal);
    
    // Add event listeners
    modal.querySelector('.close-modal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

/**
 * Determines whether to use keyframe or scene images
 */
export function shouldUseKeyframe(searchCriteria) {
    if (!searchCriteria) return false;
    
    return searchCriteria.has_asr;
}