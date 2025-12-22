import { store, METHOD_ORDER } from '../state/store.js';
import { renderPanel } from './Thumbs.js';
import { showVideoFramesModal } from './VideoFramesModal.js';

function pickVariantData(resultBlock, tabIdx) {
  if (tabIdx === 0) {
    const out = {};
    if (Array.isArray(resultBlock.final_ensemble)) out.ensemble = resultBlock.final_ensemble;

    return out;
  }
  const v = resultBlock.variants?.[tabIdx - 1] || {};
  const out = {};
  METHOD_ORDER.forEach(({ key }) => { if (v[key]) out[key] = v[key]; });
  return out;
}

/**
 * Update tab labels based on mode (single vs temporal)
 */
export function updateTabLabels(tabsContainer, isTemporalMode) {
  
  
  if (isTemporalMode) {
    // Temporal mode: 3 groups of queries
    tabsContainer.innerHTML = `
      <div class="tab active">Results</div>
      <div class="tab">Image Search</div>
    `;
  } else {
    // Single mode: individual queries
    tabsContainer.innerHTML = `
      <div class="tab active">Results</div>
      <div class="tab">Image Search</div>
    `;
  }
}

export function mountTabs(root) {
  // Create a wrapper for tabs and panels to keep them together
  const tabsWrapper = document.createElement('div');
  tabsWrapper.className = 'tabs-wrapper';
  
  // Create a scrollable container for tabs
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'tabs';
  tabsContainer.id = 'tabs';
  
  // Set initial tab labels (will be updated dynamically)
  updateTabLabels(tabsContainer, false);
  
  // Create a container for results that will be shown/hidden by tabs
  const tabPanelsContainer = document.createElement('div');
  tabPanelsContainer.className = 'tab-panels-container';
  tabPanelsContainer.style.display = 'none'; // Initially hidden
  
  // Store a reference to the tab panels container
  root.tabPanelsContainer = tabPanelsContainer;
  
  // Append tabs and panels to the wrapper
  tabsWrapper.appendChild(tabsContainer);
  tabsWrapper.appendChild(tabPanelsContainer);
  
  // Append the wrapper to the root, making sure it's the first element
  if (root.firstChild) {
    root.insertBefore(tabsWrapper, root.firstChild);
  } else {
    root.appendChild(tabsWrapper);
  }

  setupTabClickHandlers(tabsContainer, tabPanelsContainer);
}

/**
 * Setup click handlers for tabs
 */
export function setupTabClickHandlers(tabsContainer, tabPanelsContainer) {
  const tabs = Array.from(tabsContainer.querySelectorAll('.tab'));
  
  // Remove existing listeners to avoid duplicates
  tabs.forEach(tab => {
    const newTab = tab.cloneNode(true);
    tab.parentNode.replaceChild(newTab, tab);
  });
  
  // Get updated tabs reference after cloning
  const updatedTabs = Array.from(tabsContainer.querySelectorAll('.tab'));
  
  updatedTabs.forEach((tab, idx) => {
    tab.addEventListener('click', () => {

      
      updatedTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      store.activeTabIdx = idx;
      
      // Use new render function if search results are available
      if (store.searchResults) {
        // Import the new function from main.js
        if (window.renderActiveTabWithNewData) {
          
          window.renderActiveTabWithNewData(tabPanelsContainer, store.searchResults);
        } else {
          
          renderActiveTab(tabPanelsContainer);
        }
      } else {
        
        renderActiveTab(tabPanelsContainer);
      }
    });
  });
}

export function renderActiveTab(container) {
  if (!store.activeResult) return;
  
  // Check if we're in "search mode" - only show tab panels if we've done a search
  const hasSearched = store.hasSearched || false;
  if (!hasSearched) {
    container.style.display = 'none';
    return;
  }
  
  // Hide our custom panels when tab panels are shown
  const panelContainer = document.getElementById('panel-container');
  if (panelContainer) {
    panelContainer.style.display = 'none';
  }
  
  // Show the tab panels container
  container.style.display = 'block';
  
  // Clear previous content
  container.innerHTML = '';
  
  // Make sure the tabs-wrapper is visible and properly styled
  const tabsWrapper = container.closest('.tabs-wrapper');
  if (tabsWrapper) {
    tabsWrapper.style.display = 'block';
    tabsWrapper.style.width = '100%';
  }
  
  const methodsData = pickVariantData(store.activeResult, store.activeTabIdx);

  const entries = METHOD_ORDER
    .filter(({ key }) => methodsData[key] && Array.isArray(methodsData[key]) && methodsData[key].length)
    .map(({ key, label }) => ({ key, label, hits: methodsData[key] }));

  // Create new panels for each entry
  entries.forEach((ent) => {
    const panel = document.createElement('section');
    panel.className = 'tab-panel'; // Use different class to avoid conflicts with our main panels
    container.appendChild(panel);
    
    // Render content in the panel
    renderPanel(panel, ent.label, ent.hits, ent.key);

    addShiftClickHandlers(panel);
  });
  
  // If no entries, hide the container
  if (entries.length === 0) {
    container.style.display = 'none';
  }
}
function addShiftClickHandlers(panel) {
  const thumbs = panel.querySelectorAll('.thumb');
  
  thumbs.forEach(thumb => {
    const img = thumb.querySelector('img');
    if (!img) return;
    
    // Add click event listener
    thumb.addEventListener('click', (e) => {
      // Chỉ xử lý khi nhấn Shift + Click
      if (e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        
        // Get result_id from data attribute
        let resultId = thumb.dataset.id;
        
        if (!resultId) {
          // Fallback: extract from img src
          const imgSrc = img.src;
          const match = imgSrc.match(/\/api\/image\/([^?]+)/);
          if (match) {
            resultId = decodeURIComponent(match[1]);
          }
        }
        
        console.log('🔍 Result ID:', resultId);
        
        if (resultId) {
          // Extract video_id from result_id
          const videoId = extractVideoId(resultId);
          
          if (videoId) {
            console.log('🎬 Opening all frames for video:', videoId);
            showVideoFramesModal(videoId, resultId);
          } else {
            console.warn('⚠️ Could not extract video ID from:', resultId);
          }
        } else {
          console.warn('⚠️ No result ID found');
        }
      }
    });
    
    // Add tooltip hint
    thumb.title = 'Click to view | Shift+Click to view all frames';
  });
}

function extractVideoId(resultId) {
  if (!resultId) return null;
  
  resultId = resultId.trim().replace(/^\/|\/$/g, '');
  
  // Case 1: Contains slash (K01_V001/000123)
  if (resultId.includes('/')) {
    const parts = resultId.split('/');
    return parts[0];
  }
  
  // Case 2: No slash, extract pattern K##_V###
  const videoMatch = resultId.match(/^([A-Z]\d+_V\d+)/);
  if (videoMatch) {
    return videoMatch[1];
  }
  
  return null;
}