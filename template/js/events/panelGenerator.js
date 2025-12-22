/**
 * panelGenerator.js
 * Handles the dynamic generation of panels based on selected models and input fields.
 * Panels are shown only when search is triggered.
 */

import { store } from '../state/store.js';
import { renderActiveTab } from '../components/Tabs.js';

/**
 * Generate panels based on the selected image models and OCR input
 * Each selected model will create a panel with its title
 * OCR input will add an additional panel
 */
export function initializePanelGenerator() {
    // Get all image model checkboxes including BEIT3
    const imageModelCheckboxes = document.querySelectorAll('#img_0, #img_1, #img_2, #img_3, #img_4');

    const ocrInput = document.querySelector('#qOCR');
    
    // Model names for titles
    const modelNames = {
        'img_0': 'ClipH14',
        'img_1': 'BigG14',
        'img_2': 'Image Captioning',
        'img_3': 'BEiT3',
        'img_4': 'Google Search',

        'ocr': 'OCR Search',
        'ensemble': 'Ensemble (All Models)'
    };
    
    // Get search button to add event listener
    const searchBtn = document.querySelector('.search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            // Small delay to ensure API call has started
            setTimeout(() => {
                // Set a flag in store to indicate we've done a search
                store.hasSearched = true;
                generatePanelsFromSelection();
            }, 100);
        });
    }
    
    // Function to generate panels based on current selection when search is clicked
    function generatePanelsFromSelection() {
        // Get main container
        const main = document.getElementById('main');
        if (!main) return;
        
        // Clean up any existing tab panels
        const tabPanelsContainer = main.querySelector('.tab-panels-container');
        if (tabPanelsContainer) {
            tabPanelsContainer.style.display = 'none';
        }
        
        // Remove any existing panel sections from previous version
        const oldPanels = main.querySelectorAll('section.panel');
        oldPanels.forEach(panel => panel.remove());
        
        // Clear existing panels
        const panelContainer = document.getElementById('panel-container');
        if (panelContainer) {
            panelContainer.innerHTML = '';
        } else {
            // Create panel container if it doesn't exist
            const newPanelContainer = document.createElement('div');
            newPanelContainer.id = 'panel-container';
            newPanelContainer.className = 'panel-container';
            main.appendChild(newPanelContainer);
        }
        
        // Count selected models
        let selectedModels = [];
        
        // Add ensemble panel first
        selectedModels.push({
            id: 'ensemble',
            name: modelNames['ensemble']
        });
        
        // Add image models
        imageModelCheckboxes.forEach(checkbox => {
            if (checkbox && checkbox.checked) {
                selectedModels.push({
                    id: checkbox.id,
                    name: modelNames[checkbox.id]
                });
            }
        });
        

        
        // Add OCR panel if it has text
        if (ocrInput && ocrInput.value.trim() !== '') {
            selectedModels.push({
                id: 'ocr',
                name: modelNames['ocr']
            });
        }
        
        // Generate panels
        generatePanels(selectedModels);
    }
    
    /**
     * Generate panels based on selected models
     * @param {Array} models - List of selected model objects
     */
    function generatePanels(models) {
        const panelContainer = document.getElementById('panel-container');
        if (!panelContainer) return;
        
        // Make panel container visible
        panelContainer.style.display = 'flex';
        panelContainer.style.flexDirection = 'column';
        panelContainer.style.gap = '15px';
        panelContainer.style.width = '100%';
        
        // Create panel for each selected model
        models.forEach(model => {
            const panel = document.createElement('div');
            panel.className = 'panel';
            panel.dataset.modelId = model.id;
            panel.style.width = '100%';
            
            const panelHeader = document.createElement('div');
            panelHeader.className = 'panel-header';
            panelHeader.textContent = model.name;
            
            const panelContent = document.createElement('div');
            panelContent.className = 'panel-content';
            
            // Add loading indicator
            panelContent.innerHTML = `
                <div class="result-placeholder">
                    <div class="loading-indicator"></div>
                    <div>Loading results for ${model.name}...</div>
                </div>
            `;
            
            panel.appendChild(panelHeader);
            panel.appendChild(panelContent);
            panelContainer.appendChild(panel);
        });
        
        // Update store with panel information
        store.panels = models.map(model => ({
            id: model.id,
            name: model.name
        }));
    }
    
    /**
     * Initialize the panel generator by setting up the search button listener
     * Panels will only be generated when the search button is clicked
     */
    function initializeListeners() {
        // Clear panels on clear button click
        const clearBtn = document.querySelector('.clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                // Clear our panel container
                const panelContainer = document.getElementById('panel-container');
                if (panelContainer) {
                    panelContainer.innerHTML = '';
                    panelContainer.style.display = 'none';
                }
                
                // Also remove any leftover panels from the old structure
                const main = document.getElementById('main');
                if (main) {
                    const oldPanels = main.querySelectorAll('section.panel');
                    oldPanels.forEach(panel => panel.remove());
                }
                
                // Reset search flag in store
                store.hasSearched = false;
            });
        }
        
        // Listen for tab changes to hide our custom panels when tabs are clicked
        const tabButtons = document.querySelectorAll('.tab');
        if (tabButtons.length > 0) {
            tabButtons.forEach(tab => {
                tab.addEventListener('click', () => {
                    // Hide our custom panels when tab is clicked
                    const panelContainer = document.getElementById('panel-container');
                    if (panelContainer) {
                        panelContainer.style.display = 'none';
                    }
                    
                    // Only show tab panels if we've done a search
                    const tabPanelsContainer = document.querySelector('.tab-panels-container');
                    if (tabPanelsContainer && store.hasSearched) {
                        tabPanelsContainer.style.display = 'block';
                        
                        // Ensure tab panels container is properly positioned below tabs
                        const tabsWrapper = document.querySelector('.tabs-wrapper');
                        if (tabsWrapper) {
                            tabsWrapper.style.display = 'block';
                        }
                    }
                });
            });
        }
    }
    
    // Set up initial listeners
    initializeListeners();
}
