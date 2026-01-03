/**
 * Main Application Entry Point
 */

import { loadComponents, loadPage } from './include.js';
import { renderResults, showLoading, hideLoading, showResults, hideResults } from './render.js';
import { searchApi } from '../api/searchApi.js';

// Application State
const appState = {
    currentMode: 'single', // 'single', 'temporal', 'image'
    uploadedImageId: null,
    currentResults: [],
    pathKeyframeMetadata: {}, // Store path_keyframe.json
    youtubeUrls: {} // Store Youtube_URL.json mapping (folder -> url)
};

// Initialize app
async function init() {
    console.log('🚀 Initializing AIC Video Search App...');
    
    // Load metadata
    await loadMetadata();
    
    // Load components and home page
    await loadComponents();
    await loadPage('home');
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup modal handlers
    setupModalHandlers();
    
    console.log('✅ App initialized successfully');
}

async function loadMetadata() {
    try {
        const [pathResponse, urlResponse] = await Promise.all([
            fetch('/data/metadata/path_keyframe.json'),
            fetch('/data/URL/Youtube_URL.json')
        ]);
        
        appState.pathKeyframeMetadata = await pathResponse.json();
        const youtubeData = await urlResponse.json();
        
        // Convert array to object mapping folder -> watch_url
        appState.youtubeUrls = {};
        youtubeData.forEach(item => {
            appState.youtubeUrls[item.folder] = item.watch_url;
        });
        
        console.log('✅ Loaded metadata and YouTube URLs');
    } catch (error) {
        console.error('❌ Failed to load metadata:', error);
    }
}

function setupEventListeners() {
    // Mode switching with radio buttons
    document.addEventListener('change', (e) => {
        if (e.target.name === 'mode') {
            handleModeSwitch(e.target.value);
        }
    });

    // Single search
    const btnSingleSearch = document.getElementById('btn-single-search');
    if (btnSingleSearch) {
        btnSingleSearch.addEventListener('click', handleSingleSearch);
    }

    // Temporal search
    const btnTemporalSearch = document.getElementById('btn-temporal-search');
    if (btnTemporalSearch) {
        btnTemporalSearch.addEventListener('click', handleTemporalSearch);
    }

    // Image search
    const btnImageSearch = document.getElementById('btn-image-search');
    if (btnImageSearch) {
        btnImageSearch.addEventListener('click', handleImageSearch);
    }

    // Image upload
    setupImageUpload();
    
    // Language toggle buttons
    setupLanguageToggle();
}

function handleModeSwitch(mode) {
    // Hide all search sections
    document.querySelectorAll('.search-section').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Hide all top input sections
    document.getElementById('single-inputs')?.classList.add('hidden');
    document.getElementById('temporal-inputs')?.classList.add('hidden');
    
    // Show selected section
    const sectionMap = {
        'single': 'single-search',
        'temporal': 'temporal-search',
        'image': 'image-search'
    };
    
    const inputMap = {
        'single': 'single-inputs',
        'temporal': 'temporal-inputs'
    };
    
    const targetSection = document.getElementById(sectionMap[mode]);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }
    
    // Show corresponding top inputs
    const targetInputs = document.getElementById(inputMap[mode]);
    if (targetInputs) {
        targetInputs.classList.remove('hidden');
    }
    
    appState.currentMode = mode;
    console.log('🔄 Switched to mode:', mode);
}

async function handleSingleSearch() {
    const query = document.getElementById('single-query')?.value.trim();
    const ocr = document.getElementById('single-ocr')?.value.trim();
    const asr = document.getElementById('single-asr')?.value.trim();
    const langBtn = document.getElementById('lang-toggle');
    const useTrans = langBtn?.dataset.lang === 'vie';
    
    if (!query && !ocr && !asr) {
        alert('Please enter at least one search query');
        return;
    }
    
    // Get selected models
    const models = {};
    document.querySelectorAll('.model-checkbox').forEach(checkbox => {
        models[checkbox.dataset.model] = checkbox.checked;
    });
    
    console.log('🔍 Starting single search...', { query, ocr, asr, models });
    
    try {
        showLoading();
        hideResults();
        
        const response = await searchApi.singleSearch({
            query,
            ocr,
            asr,
            models,
            useTrans
        });
        
        console.log('✅ Search response:', response);
        
        // Extract results from response
        const extractedData = extractResults(response);
        appState.currentResults = extractedData.results;
        
        renderResults(extractedData.results, appState.pathKeyframeMetadata, 'results-grid', extractedData.isGrouped);
        showResults();
        
    } catch (error) {
        console.error('❌ Search error:', error);
        alert('Search failed: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function handleTemporalSearch() {
    const queries = [
        document.querySelector('.temporal-query[data-index="0"]')?.value.trim(),
        document.querySelector('.temporal-query[data-index="1"]')?.value.trim(),
        document.querySelector('.temporal-query[data-index="2"]')?.value.trim()
    ];
    
    const ocrs = [
        document.querySelector('.temporal-ocr[data-index="0"]')?.value.trim(),
        document.querySelector('.temporal-ocr[data-index="1"]')?.value.trim(),
        document.querySelector('.temporal-ocr[data-index="2"]')?.value.trim()
    ];
    
    const asr = document.getElementById('temporal-asr')?.value.trim();
    const langBtn = document.getElementById('lang-toggle-temporal');
    const useTrans = langBtn?.dataset.lang === 'vie';
    
    if (!queries[0] && !queries[1] && !queries[2] && !ocrs[0] && !ocrs[1] && !ocrs[2] && !asr) {
        alert('Please enter at least one query');
        return;
    }
    
    // Get selected models for each query
    const models = [
        getTemporalModels(0),
        getTemporalModels(1),
        getTemporalModels(2)
    ];
    
    console.log('🔍 Starting temporal search...', { queries, ocrs, asr, models });
    
    try {
        showLoading();
        hideResults();
        
        const response = await searchApi.temporalSearch({
            queries,
            ocrs,
            asr,
            models,
            useTrans
        });
        
        console.log('✅ Temporal search response:', response);
        
        const extractedData = extractResults(response);
        appState.currentResults = extractedData.results;
        
        renderResults(extractedData.results, appState.pathKeyframeMetadata, 'results-grid', extractedData.isGrouped);
        showResults();
        
    } catch (error) {
        console.error('❌ Temporal search error:', error);
        alert('Temporal search failed: ' + error.message);
    } finally {
        hideLoading();
    }
}

function getTemporalModels(index) {
    return {
        cliph14: document.querySelector(`.temp-cliph14[data-index="${index}"]`)?.checked || false,
        clipbigg14: document.querySelector(`.temp-clipbigg14[data-index="${index}"]`)?.checked || false,
        imagecap: document.querySelector(`.temp-imagecap[data-index="${index}"]`)?.checked || false,
        beit3: document.querySelector(`.temp-beit3[data-index="${index}"]`)?.checked || false,
        siglip2: document.querySelector(`.temp-siglip2[data-index="${index}"]`)?.checked || false,
        google: document.querySelector(`.temp-google[data-index="${index}"]`)?.checked || false
    };
}

async function handleImageSearch() {
    if (!appState.uploadedImageId) {
        alert('Please upload an image first');
        return;
    }
    
    const modelName = document.getElementById('image-model')?.value || 'siglip2';
    
    console.log('🖼️ Starting image search...', { imageId: appState.uploadedImageId, modelName });
    
    try {
        showLoading();
        hideResults();
        
        const response = await searchApi.imageSearch({
            imageId: appState.uploadedImageId,
            modelName
        });
        
        console.log('✅ Image search response:', response);
        
        const results = response.results || [];
        appState.currentResults = results;
        
        renderResults(results, appState.pathKeyframeMetadata);
        showResults();
        
    } catch (error) {
        console.error('❌ Image search error:', error);
        alert('Image search failed: ' + error.message);
    } finally {
        hideLoading();
    }
}

function setupImageUpload() {
    const dropZone = document.getElementById('image-drop-zone');
    const fileInput = document.getElementById('image-file-input');
    const previewContainer = document.getElementById('uploaded-image-preview');
    const previewImg = document.getElementById('preview-img');
    const removeBtn = document.getElementById('remove-image');
    
    if (!dropZone || !fileInput) return;
    
    // Click to upload
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });
    
    // File input change
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImageFile(file);
        }
    });
    
    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--primary-color)';
    });
    
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border-color)';
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border-color)';
        
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleImageFile(file);
        }
    });
    
    // Paste from clipboard
    document.addEventListener('paste', (e) => {
        if (appState.currentMode !== 'image') return;
        
        const items = e.clipboardData.items;
        for (let item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                handleImageFile(file);
                break;
            }
        }
    });
    
    // Remove image
    if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearUploadedImage();
        });
    }
}

async function handleImageFile(file) {
    console.log('📤 Uploading image:', file.name);
    
    try {
        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            const previewImg = document.getElementById('preview-img');
            const previewContainer = document.getElementById('uploaded-image-preview');
            const dropZone = document.getElementById('image-drop-zone');
            
            if (previewImg && previewContainer) {
                previewImg.src = e.target.result;
                previewContainer.style.display = 'block';
                if (dropZone) dropZone.style.display = 'none';
            }
        };
        reader.readAsDataURL(file);
        
        // Upload to server
        const response = await searchApi.uploadImage(file);
        
        if (response.image_id) {
            appState.uploadedImageId = response.image_id;
            console.log('✅ Image uploaded:', response.image_id);
        } else {
            throw new Error('Failed to get image ID from server');
        }
        
    } catch (error) {
        console.error('❌ Image upload error:', error);
        alert('Failed to upload image: ' + error.message);
        clearUploadedImage();
    }
}

function clearUploadedImage() {
    const previewContainer = document.getElementById('uploaded-image-preview');
    const dropZone = document.getElementById('image-drop-zone');
    const fileInput = document.getElementById('image-file-input');
    
    if (previewContainer) previewContainer.style.display = 'none';
    if (dropZone) dropZone.style.display = 'block';
    if (fileInput) fileInput.value = '';
    
    appState.uploadedImageId = null;
}

function setupLanguageToggle() {
    // Single search language toggle
    const langToggle = document.getElementById('lang-toggle');
    if (langToggle) {
        langToggle.addEventListener('click', function() {
            const currentLang = this.dataset.lang;
            if (currentLang === 'vie') {
                this.dataset.lang = 'eng';
                this.textContent = 'ENG';
            } else {
                this.dataset.lang = 'vie';
                this.textContent = 'VIE';
            }
        });
    }
    
    // Temporal search language toggle
    const langToggleTemporal = document.getElementById('lang-toggle-temporal');
    if (langToggleTemporal) {
        langToggleTemporal.addEventListener('click', function() {
            const currentLang = this.dataset.lang;
            if (currentLang === 'vie') {
                this.dataset.lang = 'eng';
                this.textContent = 'ENG';
            } else {
                this.dataset.lang = 'vie';
                this.textContent = 'VIE';
            }
        });
    }
}

function extractResults(response) {
    const MAX_RESULTS = 50; // Limit display to 50 images
    
    // Handle different response formats
    if (Array.isArray(response)) {
        return { results: response.slice(0, MAX_RESULTS), isGrouped: false };
    }
    
    // Check for grouped temporal results (ensemble_qx_0, ensemble_qx_1, etc.)
    const groupedKeys = Object.keys(response).filter(key => key.startsWith('ensemble_qx_'));
    if (groupedKeys.length > 0) {
        // Extract first grouped result set
        const firstKey = groupedKeys.sort()[0];
        const groupedResults = response[firstKey];
        if (Array.isArray(groupedResults) && groupedResults.length > 0) {
            return { results: groupedResults.slice(0, MAX_RESULTS), isGrouped: true };
        }
    }
    
    // Check for ensemble_all_queries_all_methods first (most common for single/temporal search)
    if (response.ensemble_all_queries_all_methods && Array.isArray(response.ensemble_all_queries_all_methods)) {
        return { results: response.ensemble_all_queries_all_methods.slice(0, MAX_RESULTS), isGrouped: false };
    }
    
    if (response.results) {
        return { results: response.results.slice(0, MAX_RESULTS), isGrouped: false };
    }
    
    if (response.image_search) {
        return { results: response.image_search.slice(0, MAX_RESULTS), isGrouped: false };
    }
    
    // Try to extract from nested structure
    const possibleKeys = ['results', 'data', 'items', 'image_search'];
    for (let key of possibleKeys) {
        if (response[key] && Array.isArray(response[key])) {
            return response[key].slice(0, MAX_RESULTS);
        }
    }
    
    return [];
}

function setupModalHandlers() {
    const modal = document.getElementById('youtube-modal');
    const closeBtn = modal?.querySelector('.modal-close');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeYoutubeModal();
        });
    }
    
    // Close modal when clicking outside
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeYoutubeModal();
            }
        });
    }
    
    // Expose modal functions globally
    window.openYoutubeModal = openYoutubeModal;
    window.closeYoutubeModal = closeYoutubeModal;
}

function openYoutubeModal(videoName, frameInfo) {
    const modal = document.getElementById('youtube-modal');
    const player = document.getElementById('youtube-player');
    const title = document.getElementById('modal-video-title');
    
    if (!modal || !player) return;
    
    // Get YouTube URL from mapping
    const youtubeUrl = appState.youtubeUrls[videoName];
    
    if (!youtubeUrl) {
        console.warn('No YouTube URL found for:', videoName);
        alert('Video URL not found for ' + videoName);
        return;
    }
    
    // Convert watch URL to embed URL
    // https://youtube.com/watch?v=1yHly8dYhIQ -> https://www.youtube.com/embed/1yHly8dYhIQ
    const videoId = youtubeUrl.split('v=')[1]?.split('&')[0];
    if (!videoId) {
        console.error('Invalid YouTube URL:', youtubeUrl);
        return;
    }
    
    const embedUrl = `https://www.youtube.com/embed/${videoId}`;
    
    // Set iframe src
    player.src = embedUrl;
    
    // Set title
    if (title) {
        title.textContent = `${videoName} - ${frameInfo}`;
    }
    
    // Show modal
    modal.style.display = 'flex';
}

function closeYoutubeModal() {
    const modal = document.getElementById('youtube-modal');
    const player = document.getElementById('youtube-player');
    
    if (modal) {
        modal.style.display = 'none';
    }
    
    if (player) {
        player.src = ''; // Stop video playback
    }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

export { appState };
