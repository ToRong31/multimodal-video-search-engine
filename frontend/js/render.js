/**
 * Render templates with data
 */

export function renderTemplate(template, data) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : '';
    });
}

export async function loadCardTemplate() {
    try {
        const response = await fetch('html/components/card.html');
        return await response.text();
    } catch (error) {
        console.error('Error loading card template:', error);
        return '<div class="card">Error loading template</div>';
    }
}

export function renderCard(cardData, metadata = {}) {
    // ID is numeric, lookup path in metadata
    const id = cardData.id;
    let imagePath = metadata[id] || cardData.url || '';
    
    // Parse path to extract video name and frame
    // Format: "../../data/keyframe/L01_V001/keyframe_0.webp"
    let videoName = 'Unknown';
    let frameNumber = '0';
    
    if (imagePath) {
        // Extract video name: L01_V001
        const videoMatch = imagePath.match(/\/([A-Z0-9_]+)\/keyframe_/);
        if (videoMatch) {
            videoName = videoMatch[1];
        }
        
        // Extract frame number: keyframe_0.webp -> 0
        const frameMatch = imagePath.match(/keyframe_(\d+)\.webp/);
        if (frameMatch) {
            frameNumber = frameMatch[1];
        }
        
        // Build proper URL: /data/keyframe/L01_V001/keyframe_0.webp
        imagePath = imagePath.replace('../../data/', '/data/');
    }
    
    const template = `
        <div class="card" data-id="${id}">
            <div class="card-image">
                <img src="${imagePath}" alt="${videoName} - Frame ${frameNumber}" loading="lazy" onerror="this.style.display='none'">
                <div class="card-overlay">
                    <div class="card-video-name">${videoName}</div>
                    <div class="card-frame">Frame ${frameNumber}</div>
                </div>
            </div>
        </div>
    `;
    return template;
}

export function renderResults(results, metadata = {}, containerId = 'results-grid', isGrouped = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!results || results.length === 0) {
        container.innerHTML = '<p class="no-results">No results found</p>';
        return;
    }
    
    if (isGrouped && Array.isArray(results[0])) {
        // Render grouped results (temporal mode with groups)
        results.forEach((group, groupIndex) => {
            if (!Array.isArray(group) || group.length === 0) return;
            
            const groupDiv = document.createElement('div');
            groupDiv.className = 'result-group';
            groupDiv.dataset.groupIndex = groupIndex;
            
            group.forEach(result => {
                const cardHTML = renderCard(result, metadata);
                groupDiv.insertAdjacentHTML('beforeend', cardHTML);
            });
            
            container.appendChild(groupDiv);
        });
    } else {
        // Render flat results (single/image mode)
        results.forEach(result => {
            const cardHTML = renderCard(result, metadata);
            container.insertAdjacentHTML('beforeend', cardHTML);
        });
    }
    
    // Add click handlers to all cards
    container.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', function() {
            const videoName = this.querySelector('.card-video-name')?.textContent;
            const frameNumber = this.querySelector('.card-frame')?.textContent;
            if (videoName && window.openYoutubeModal) {
                window.openYoutubeModal(videoName, frameNumber);
            }
        });
    });
}

export function showLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'block';
    }
}

export function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'none';
    }
}

export function showResults() {
    const resultsSection = document.getElementById('results-section');
    if (resultsSection) {
        resultsSection.style.display = 'block';
    }
}

export function hideResults() {
    const resultsSection = document.getElementById('results-section');
    if (resultsSection) {
        resultsSection.style.display = 'none';
    }
}
