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
    currentResults: []
};

// Initialize app
async function init() {
    console.log('🚀 Initializing AIC Video Search App...');
    
    // Load components and home page
    await loadComponents();
    await loadPage('home');
    
    // Setup event listeners
    setupEventListeners();
    
    console.log('✅ App initialized successfully');
}

function setupEventListeners() {
    // Mode switching buttons
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('mode-btn')) {
            handleModeSwitch(e.target);
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
}

function handleModeSwitch(button) {
    const mode = button.dataset.mode;
    
    // Update button states
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    button.classList.add('active');
    
    // Hide all search sections
    document.querySelectorAll('.search-section').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Show selected section
    const sectionMap = {
        'single': 'single-search',
        'temporal': 'temporal-search',
        'image': 'image-search'
    };
    
    const targetSection = document.getElementById(sectionMap[mode]);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }
    
    appState.currentMode = mode;
    console.log('🔄 Switched to mode:', mode);
}

async function handleSingleSearch() {
    const query = document.getElementById('single-query')?.value.trim();
    const ocr = document.getElementById('single-ocr')?.value.trim();
    const asr = document.getElementById('single-asr')?.value.trim();
    const useTrans = document.getElementById('use-trans')?.checked;
    
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
        const results = extractResults(response);
        appState.currentResults = results;
        
        renderResults(results);
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
    const useTrans = document.getElementById('use-trans-temporal')?.checked;
    
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
        
        const results = extractResults(response);
        appState.currentResults = results;
        
        renderResults(results);
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
        
        renderResults(results);
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

function extractResults(response) {
    // Handle different response formats
    if (Array.isArray(response)) {
        return response;
    }
    
    if (response.results) {
        return response.results;
    }
    
    if (response.image_search) {
        return response.image_search;
    }
    
    // Try to extract from nested structure
    const possibleKeys = ['results', 'data', 'items', 'image_search'];
    for (let key of possibleKeys) {
        if (response[key] && Array.isArray(response[key])) {
            return response[key];
        }
    }
    
    return [];
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

export { appState };
