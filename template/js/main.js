// Import real API functions
import { loadMetadata, loadSceneMetadata, searchApi, getWatchUrlForFolder, loadFpsMapping } from './api/search.js';
import { store, setResults } from './state/store.js';
import { mountHeader } from './components/Header.js';
import { mountSidebar } from './components/Sidebar.js';
import { renderSingle, renderTemporal } from './components/QueryArea.js';
import { mountTabs, renderActiveTab, updateTabLabels, setupTabClickHandlers } from './components/Tabs.js';
import { initializeInputHandling, reinitializeInputHandling } from './events/HandleInput.js';
import { initializeShortcuts, reinitializeShortcuts } from './events/HandleShortcut.js';
import { initializePanelGenerator } from './events/panelGenerator.js';
import { initializeSearchValidation } from './events/ValidateSearch.js';
import { showVideoFramesModal } from './components/VideoFramesModal.js';
import { initializeQuickKISSubmit } from './events/HandleSubmit.js';
import { createDraggableQAModal } from './components/QA.js';
import { createLoginButton, refreshLoginButton } from './components/LoginButton.js';
import { initYoutubePreviewHandler } from './events/youtubepreview.js';


// App now uses real metadata and images
const MAX_TEMPORAL_GROUPS = 200; // Cap number of groups shown in temporal mode

function setTopHeight() {
  const top = document.querySelector('.top');
  if (!top) return;
  const h = top.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--topH', `${Math.ceil(h)}px`);
}

async function bootstrap() {
  // Get all required elements
  const app = document.getElementById('app');
  const hdr = document.getElementById('hdr');
  const side = document.getElementById('side');
  const main = document.getElementById('main');
  const leftCol = document.getElementById('leftCol');
  const rightCol = document.getElementById('rightCol');
  
  // Validate elements
  if (!app || !hdr || !side || !main || !leftCol || !rightCol) {
    console.error('❌ Required elements not found:', {
      app: !!app,
      hdr: !!hdr,
      side: !!side,
      main: !!main,
      leftCol: !!leftCol,
      rightCol: !!rightCol
    });
    return;
  }

  // header
  mountHeader(leftCol, {
    onTemporalChange: (isTemporal) => {
        rightCol.innerHTML = ''; // Clear existing content

        if (isTemporal) {
            renderTemporal(rightCol);
            
            // Rebuild sidebar for temporal mode
            mountSidebar(side, { isTemporal: true });
        } else {
            renderSingle(rightCol);
            
            // Rebuild sidebar for single mode
            mountSidebar(side, { isTemporal: false });
        }
        
        // CRITICAL: Re-initialize input handling after mode change
        setTimeout(() => {
            reinitializeInputHandling();
            reinitializeShortcuts(); // Re-initialize shortcuts after mode change
            initializePasteImage(); // Re-initialize paste image handler for new inputs
            
            // Force search button update
            setTimeout(() => {
                if (typeof window.updateSearchButtonState === 'function') {
                    window.updateSearchButtonState();
                }
            }, 100);
        }, 300); // Wait for DOM to be fully updated
    },
    onClear: () => {
      // ✅ XÓA INPUT FIELDS Ở HEADER
      hdr.querySelectorAll('.right-col input[type="text"]').forEach(inp => {
        inp.value = '';
        if (inp.dataset.imageId) {
          delete inp.dataset.imageId;
        }
      });
      
      // ✅ XÓA INPUT FIELDS Ở RIGHT COL (Query Area)
      const queryInputs = document.querySelectorAll('#qMain, #q1, #q2, #q3');
      queryInputs.forEach(inp => {
        if (inp) {
          inp.value = '';
          if (inp.dataset.imageId) {
            delete inp.dataset.imageId;
            console.log('🧹 Cleared imageId from:', inp.id);
          }
        }
      });
      
      // ✅ XÓA TẤT CẢ IMAGE PREVIEWS
      document.querySelectorAll('.image-preview').forEach(preview => preview.remove());
      
      // ✅ XÓA PASTED IMAGE CONTAINER
      const pastedImageContainer = document.querySelector('.pasted-image-container');
      if (pastedImageContainer) {
        pastedImageContainer.remove();
      }
      
      // ✅ XÓA GLOBAL IMAGE DATA
      if (window.pastedImageData) {
        delete window.pastedImageData;
      }
      
      if (window.currentPastedImage) {
        delete window.currentPastedImage;
      }
      
      // ✅ RESET FLEX LAYOUT
      const queryContainers = document.querySelectorAll('.query-container, .input-group');
      queryContainers.forEach(container => {
        container.style.display = '';
        container.style.alignItems = '';
      });
      
      // ✅ RE-INITIALIZE VÀ TRIGGER EVENTS
      setTimeout(() => {
        reinitializeInputHandling();
        reinitializeShortcuts();
        
        // ✅ TRIGGER IMAGE QUERY CHANGED EVENT
        const event = new CustomEvent('imageQueryChanged', {
          detail: { hasImageQuery: false }
        });
        document.dispatchEvent(event);
        
        // ✅ FORCE UPDATE SEARCH BUTTON STATE
        if (typeof window.updateSearchButtonState === 'function') {
          window.updateSearchButtonState();
        }
        
        console.log('✅ Clear complete - all image data removed');
      }, 200);
    },
    onSearch: async (btn) => {
      // Set hasSearched flag to true
      store.hasSearched = true;
      // Always allow search
      const originalText = btn.textContent;
      btn.disabled = true; btn.classList.add('loading'); btn.textContent = 'Searching...';
      
      try {
        // Clear any existing panels
        const main = document.getElementById('main');
        if (main) {
          const panelContainer = main.querySelector('.panel-container');
          if (panelContainer) {
            panelContainer.innerHTML = '';
          }
        }
        
        // Check if we're in temporal mode
        const isTemporalMode = document.getElementById('chkTemporal')?.checked || false;
        const isTranslate =!(document.getElementById('chkTranslate')?.checked || false);
       
        
        let payload;
        
        if (isTemporalMode) {
          // === TEMPORAL MODE PAYLOAD ===
          
          // ✅ CHECK NẾU CÓ IMAGE QUERIES (2-3 ảnh cho temporal search)
          const q1Input = document.querySelector('#q1');
          const q2Input = document.querySelector('#q2');
          const q3Input = document.querySelector('#q3');
          
          const imageIds = [];
          if (q1Input?.dataset?.imageId) imageIds.push(q1Input.dataset.imageId);
          if (q2Input?.dataset?.imageId) imageIds.push(q2Input.dataset.imageId);
          if (q3Input?.dataset?.imageId) imageIds.push(q3Input.dataset.imageId);
          
          // ✅ NẾU CÓ >= 2 IMAGES, GỌI TEMPORAL IMAGE SEARCH
          if (imageIds.length >= 2) {
            console.log('🖼️ Temporal Image Search:', imageIds);
            
            const imageSearchResponse = await fetch('/api/image-search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                image_ids: imageIds,
                model_name: 'siglip2',
                topk: 100
              })
            });
            
            if (!imageSearchResponse.ok) {
              throw new Error('Temporal image search failed');
            }
            
            const imageSearchData = await imageSearchResponse.json();
            
            if (imageSearchData.error) {
              throw new Error(imageSearchData.error);
            }
            
            // ✅ LOAD METADATA
            if (!store.metadata || Object.keys(store.metadata).length === 0) {
              try {
                store.metadata = await loadMetadata();
              } catch (error) {
                console.error('❌ Failed to load metadata:', error);
                store.metadata = {};
              }
            }
            
            // ✅ LOAD FPS MAPPING
            if (!store.fpsMapping || Object.keys(store.fpsMapping).length === 0) {
              try {
                store.fpsMapping = await loadFpsMapping();
              } catch (error) {
                console.error('❌ Failed to load FPS mapping:', error);
                store.fpsMapping = {};
              }
            }
            
            // ✅ LƯU VÀO STORE (temporal search trả về format khác)
            store.searchResults = imageSearchData;
            store.lastSearchMethodNames = ['siglip2'];
            store.searchCriteria = {
              has_asr: false,
              active_models: { SigLip2: true },
              has_ocr: false,
              has_tools: false,
              is_temporal: true
            };
            store.hasSearched = true;
            
            // ✅ HIỂN THỊ KẾT QUẢ
            await displaySearchResults();
            
            btn.textContent = 'Success!'; 
            setTimeout(() => btn.textContent = originalText, 800);
            
            return; // ← DỪNG TẠI ĐÂY
          }
          
          // ✅ NẾU KHÔNG PHẢI TEMPORAL IMAGE SEARCH, XỬ LÝ TEXT QUERIES BÌNH THƯỜNG
          // Get queries from temporal inputs
          const queries = [
            document.querySelector('#q1')?.value?.trim() || null,
            document.querySelector('#q2')?.value?.trim() || null,
            document.querySelector('#q3')?.value?.trim() || null
          ];
          
          // Get OCR from temporal inputs
          const OCR = [
            document.querySelector('#q1ocr')?.value?.trim() || null,
            document.querySelector('#q2ocr')?.value?.trim() || null,
            document.querySelector('#q3ocr')?.value?.trim() || null
          ];
          
          // ASR is always null in temporal mode
          const ASR = document.querySelector('#qASR')?.value?.trim() || null;  
          
          // Get model selections for each query
          const ClipH14 = [
            document.querySelector('#img_0_1')?.checked || false,
            document.querySelector('#img_0_2')?.checked || false,
            document.querySelector('#img_0_3')?.checked || false
          ];

          const ClipBigg14 = [
            document.querySelector('#img_1_1')?.checked || false,  
            document.querySelector('#img_1_2')?.checked || false,
            document.querySelector('#img_1_3')?.checked || false
          ];
          
          const ImageCap = [
            document.querySelector('#img_2_1')?.checked || false,
            document.querySelector('#img_2_2')?.checked || false,
            document.querySelector('#img_2_3')?.checked || false
          ];
          
          
          const Beit3 = [
            document.querySelector('#img_3_1')?.checked || false,
            document.querySelector('#img_3_2')?.checked || false,
            document.querySelector('#img_3_3')?.checked || false
          ];
          const SigLip2= [
            document.querySelector('#img_4_1')?.checked || false,
            document.querySelector('#img_4_2')?.checked || false,
            document.querySelector('#img_4_3')?.checked || false
          ];
          const GoogleSearch = [
            document.querySelector('#img_5_1')?.checked || false,
            document.querySelector('#img_5_2')?.checked || false,
            document.querySelector('#img_5_3')?.checked || false
          ];
          
 
          
          // Get objects from filter widgets
          const ObjectList = [];
          for (let i = 1; i <= 3; i++) {
            const widget = document.querySelector(`.filter-widget[data-idx="${i}"]`);
            if (widget) {
              const output = widget.querySelector('.filter-output');
              const outputText = output?.textContent?.trim() || '';
              if (outputText) {
                // Parse objects from output (format: "(object1, color1), (object2, color2)")
                const matches = outputText.match(/\(([^)]+)\)/g);
                if (matches) {
                  const objectPairs = matches.map(match => {
                    const content = match.slice(1, -1).trim();
                    const parts = content.split(',').map(s => s.trim());
                    if (parts.length === 2) {
                      return [parts[0], parts[1]]; // Return as [object, color] pair
                    }
                    return null;
                  }).filter(pair => pair !== null);
                  
                  ObjectList.push(objectPairs.length > 0 ? objectPairs : null);
                } else {
                  ObjectList.push(null);
                }
              } else {
                ObjectList.push(null);
              }
            } else {
              ObjectList.push(null);
            }
          }
          
          payload = {
            queries,
            OCR,
            ASR,
            ClipH14,
            ClipBigg14,
            ImageCap,
            Beit3,
            SigLip2,
            GoogleSearch,
            Object: ObjectList,
            is_temporal: true,
            use_trans: isTranslate
            
          };
          
        } else {
          // === SINGLE MODE PAYLOAD ===
          
          const mainInput = document.querySelector('#qMain');
          let mainQuery = null;
          let imageQuery = null;

          // ✅ CHECK NẾU LÀ IMAGE QUERY
          if (mainInput && mainInput.dataset.imageId) {
            imageQuery = mainInput.dataset.imageId;
            
            // ✅ GỌI API IMAGE SEARCH RIÊNG
            const imageSearchResponse = await fetch('/api/image-search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                image_id: imageQuery,
                model_name: 'siglip2',
                topk: 100
              })
            });
            
            if (!imageSearchResponse.ok) {
              throw new Error('Image search failed');
            }
            
            const imageSearchData = await imageSearchResponse.json();
            
            if (imageSearchData.error) {
              throw new Error(imageSearchData.error);
            }
            
            // ✅ TRANSFORM KẾT QUẢ: Chỉ giữ id và score
            const transformedResults = (imageSearchData.results || []).map(item => ({
              id: item.id,
              score: item.score
            }));
            
            // ✅ LOAD METADATA TRƯỚC KHI HIỂN THỊ KẾT QUẢ
            if (!store.metadata || Object.keys(store.metadata).length === 0) {
              try {
                store.metadata = await loadMetadata();
              } catch (error) {
                console.error('❌ Failed to load metadata:', error);
                store.metadata = {};
              }
            }
            
            // ✅ LOAD FPS MAPPING
            if (!store.fpsMapping || Object.keys(store.fpsMapping).length === 0) {
              try {
                store.fpsMapping = await loadFpsMapping();
              } catch (error) {
                console.error('❌ Failed to load FPS mapping:', error);
                store.fpsMapping = {};
              }
            }
            
            // ✅ FORMAT KẾT QUẢ THEO ĐÚNG STRUCTURE
            const formattedData = {
              per_query: {
                query_0: {
                  per_method: {
                    'siglip2': transformedResults
                  },
                  ensemble_all_methods: transformedResults
                }
              },
              ensemble_per_method_across_queries: {
                'siglip2': transformedResults
              },
              ensemble_all_queries_all_methods: transformedResults
            };
            
            // ✅ LƯU KẾT QUẢ VÀO STORE
            store.searchResults = formattedData;
            store.imageSearchResults = transformedResults;
            store.lastSearchMethodNames = ['siglip2'];
            store.searchCriteria = {
              has_asr: false,
              active_models: {
                SigLip2: true
              },
              has_ocr: false,
              has_tools: false,
              is_temporal: false
            };
            store.hasSearched = true;
            
            // ✅ HIỂN THỊ KẾT QUẢ
            await displaySearchResults();
            
            btn.textContent = 'Success!'; 
            setTimeout(() => btn.textContent = originalText, 800);
            
            return; // ← DỪNG TẠI ĐÂY, KHÔNG GỌI /api/search-new
          }
          
          // ✅ NẾU KHÔNG PHẢI IMAGE QUERY, XỬ LÝ TEXT QUERY BÌNH THƯỜNG
          const inputValue = mainInput?.value?.trim();
          mainQuery = inputValue || null;
          const ocrText = document.querySelector('#qOCR')?.value?.trim() || null;
          const asrText = document.querySelector('#qASR')?.value?.trim() || null;
          
          // Single mode: first element has data, others are null/false
          const queries = [mainQuery, null, null];
          const OCR = [ocrText, null, null];
          const ASR = document.querySelector('#qASR')?.value?.trim() || null;  
          
          // Get single mode model selections
          const ClipH14 = [
            document.querySelector('#img_0')?.checked || false,
            false,
            false
          ];
          
          const ClipBigg14 = [
            document.querySelector('#img_1')?.checked || false,  // img_1 is "BigG14"
            false,
            false
          ];
          
          const ImageCap = [
            document.querySelector('#img_2')?.checked || false,
            false,
            false
          ];
          
          
          const Beit3 = [
            document.querySelector('#img_3')?.checked || false,
            false,
            false
          ];
          const SigLip2 = [
            document.querySelector('#img_4')?.checked || false,
            false,
            false
          ]
          const GoogleSearch = [
            document.querySelector('#img_5')?.checked || false,
            false,
            false
          ];
          
  
          
          // Get objects from single filter widget
          const Objects = [null, null, null];
          const widget = document.querySelector('.filter-widget');
          if (widget) {
            const output = widget.querySelector('.filter-output');
            const outputText = output?.textContent?.trim() || '';
            if (outputText) {
              // Parse objects from output (format: "(object1, color1), (object2, color2)")
              const matches = outputText.match(/\(([^)]+)\)/g);
              if (matches) {
                const objectPairs = matches.map(match => {
                  const content = match.slice(1, -1).trim();
                  const parts = content.split(',').map(s => s.trim());
                  if (parts.length === 2) {
                    return [parts[0], parts[1]]; // Return as [object, color] pair
                  }
                  return null;
                }).filter(pair => pair !== null);
                
                Objects[0] = objectPairs.length > 0 ? objectPairs : null;
              }
            }
          }
          
          payload = {
            queries,
            OCR,
            ASR,
            ClipH14,
            ClipBigg14,
            ImageCap,
            Beit3,
            SigLip2,
            GoogleSearch,
            Objects,
            image_query: imageQuery,
            is_temporal: false,
            use_trans: isTranslate
          };
        }
        
        // Call new search API with new format
        const response = await fetch('/api/search-new', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        // Load metadata if not loaded
        const hasASR = payload.ASR && payload.ASR.trim();
        const hasOCR = payload.OCR && payload.OCR.some(ocr => ocr && ocr.trim());

        const hasImageModels = payload.ClipH14?.some(m => m) || 
                              payload.ClipBigg14?.some(m => m) || 
                              payload.ImageCap?.some(m => m) || 
                              payload.Beit3?.some(m => m) ||
                              payload.SigLip2?.some(m => m) ||  // ✅ THÊM DÒNG NÀY (thiếu dấu ||)
                              payload.GoogleSearch?.some(m => m);

        const hasObjectsSearch = payload.Objects && payload.Objects.some(obj => obj && obj.length > 0);

        // ✅ LOAD KEYFRAME METADATA NGAY CẢ KHI CHỈ CÓ 1 IMAGE MODEL
        if (hasImageModels || hasObjectsSearch || hasOCR) {

          if (!store.metadata || Object.keys(store.metadata).length === 0) {
            try {
              store.metadata = await loadMetadata();
        
            } catch (error) {
            
              store.metadata = {};
            }
          } else {
            console.log('ℹ️ Keyframe metadata already loaded:', Object.keys(store.metadata).length, 'entries');
          }
        }
        
        // Only load scene metadata if using ASR
        if (hasASR) {
          
          if (!store.sceneMetadata || Object.keys(store.sceneMetadata).length === 0) {
            try {
              store.sceneMetadata = await loadSceneMetadata();
             
            } catch (error) {
              console.error('❌ Failed to load scene metadata:', error);
              store.sceneMetadata = {};
            }
          } else {
            console.log('ℹ️ Scene metadata already loaded:', Object.keys(store.sceneMetadata).length, 'entries');
          }
        }

        // Load FPS mapping once
        if (!store.fpsMapping || Object.keys(store.fpsMapping).length === 0) {

          
          try {
            store.fpsMapping = await loadFpsMapping();
          } catch (error) {
            console.error('❌ Failed to load FPS mapping:', error);
            store.fpsMapping = {};
          }
        } else {
          console.log('ℹ️ FPS mapping already loaded:', Object.keys(store.fpsMapping).length, 'videos');
        }


      

        // Store results in new format 
        store.searchResults = data;
        // Reset image search results when doing a new search
        store.imageSearchResults = null;
        store.searchCriteria = {
          has_asr: payload.ASR && payload.ASR.trim(),

          active_models: {
            ClipH14: payload.ClipH14 && payload.ClipH14.some(m => m),
            ClipBigg14: payload.ClipBigg14 && payload.ClipBigg14.some(m => m),
            ImageCap: payload.ImageCap && payload.ImageCap.some(m => m),
            Beit3: payload.Beit3 && payload.Beit3.some(m => m),
            SigLip2: payload.SigLip2 && payload.SigLip2.some(m => m), // THÊM VÀO ĐÂY
            GoogleSearch: payload.GoogleSearch && payload.GoogleSearch.some(m => m) // THÊM VÀO ĐÂY
          },
          has_ocr: payload.OCR && payload.OCR.some(ocr => ocr && ocr.trim()),
          has_tools: payload.Objects && payload.Objects.some(obj => obj && obj.length > 0),
          is_temporal: payload.is_temporal
        };
        store.hasSearched = true;
        
        // Display results using new image display system
        await displaySearchResults();
        
        btn.textContent = 'Success!'; 
        setTimeout(() => btn.textContent = originalText, 800);
        
      } catch (e) {
        console.error('Search error:', e);
        alert('Search failed: ' + e.message);
        btn.textContent = originalText;
      } finally {
        btn.disabled = false; 
        btn.classList.remove('loading');
      }
    }
  });

  // Initial rendering based on checkbox state
  const temporalCheckbox = document.getElementById('chkTemporal'); // Fixed ID
  const isTemporal = temporalCheckbox?.checked || false;
  
  rightCol.innerHTML = ''; // Clear existing content

  if (isTemporal) {
    renderTemporal(rightCol);
  } else {
    renderSingle(rightCol);
  }
  
  mountSidebar(side, { isTemporal });

  // Initialize tab system 
  mountTabs(main);

  window.addEventListener('load', setTopHeight);
  window.addEventListener('resize', setTopHeight);
}

// The handleInputDisabling function has been moved to events/HandleInput.js

/**
 * Display search results in the new tab and panel format
 */
async function displaySearchResults() {
  const main = document.getElementById('main');
  

  
  // Hide ALL old panel systems
  if (main.tabPanelsContainer) {
    main.tabPanelsContainer.style.display = 'none';
  }
  
  const panelContainer = document.getElementById('panel-container');
  if (panelContainer) {
    panelContainer.style.display = 'none';
  }
  
  const tabPanelsContainer = main.querySelector('.tab-panels-container');
  if (tabPanelsContainer) {
    tabPanelsContainer.style.display = 'none';
  }
  
  // Remove any old panel sections
  const oldPanels = main.querySelectorAll('section.panel, .tab-panel');
  oldPanels.forEach(panel => panel.remove());
  
  // Create or get main results container
  let resultsContainer = document.getElementById('results-container');
  if (!resultsContainer) {
    resultsContainer = document.createElement('div');
    resultsContainer.id = 'results-container';
    resultsContainer.className = 'results-container';
    main.appendChild(resultsContainer);
  }
  
  // Clear previous content
  resultsContainer.innerHTML = '';
  resultsContainer.style.display = 'block';
  
  const data = store.searchResults;
  
  // Ensure fps mapping is loaded before rendering overlays with time labels
  if (!store.fpsMapping || Object.keys(store.fpsMapping).length === 0) {
    try { store.fpsMapping = await loadFpsMapping().catch(() => ({})); } catch {}
  }
  
  // Handle object-only results
  if (data.objects) {
    displayObjectResults(resultsContainer, data.objects);
    return;
  }
  
  // Handle search results with tabs (new format)
  if (data.per_query) {
    displayResultsWithTabs(resultsContainer, data);
    return;
  }
  
  // Handle temporal mode results (ensemble_qx_* structure)
  if (data.ensemble_qx_0 || data.ensemble_qx_1 || data.ensemble_qx_2 || data.ensemble_qx_x) {
    displayResultsWithTabs(resultsContainer, data);
    return;
  }
  
  console.error('❌ No valid results format found in data:', data);
}

/**
 * Display object detection results
 */
function displayObjectResults(container, objects) {
  // Check if this is temporal mode (objects is array of arrays)
  const isTemporalMode = Array.isArray(objects) && 
                        objects.length > 0 && 
                        Array.isArray(objects[0]) && 
                        objects[0].length > 0; // Changed from === 3 to > 0
  

  
  if (isTemporalMode) {
    // TEMPORAL MODE: Display objects in groups with red borders
    // Determine if we have 2 or 3 images per group
    const groupSize = objects[0].length;
    const containerClass = groupSize === 2 ? 'group-size-2' : 'group-size-3';
    container.classList.add(containerClass);
    
    displayTemporalObjectResults(container, objects);
  } else {
    // SINGLE MODE: Display objects as flat list
    displaySingleObjectResults(container, objects);
  }
}

/**
 * Display temporal mode object results in groups of 3
 */
function displayTemporalObjectResults(container, objectGroups) {
  const panelDiv = document.createElement('div');
  panelDiv.className = 'search-panel temporal-panel';
  
  let htmlContent = '';
  let totalObjects = 0;
  const limitedGroups = Array.isArray(objectGroups) ? objectGroups.slice(0, MAX_TEMPORAL_GROUPS) : [];
  
  // Create each group with red border
  limitedGroups.forEach((group, groupIndex) => {
    const groupSize = group.length; // Get actual group size (2 or 3)
    const groupSizeClass = groupSize === 2 ? 'group-size-2' : 'group-size-3';
    
    htmlContent += `
      <div class="temporal-group ${groupSizeClass}" data-group="${groupIndex}">
        <div class="group-label">Object Group ${groupIndex + 1}</div>
        <div class="group-images ${groupSizeClass}">
          ${group.map((obj, index) => {
            if (!obj || !obj.id) {
              console.warn(`⚠️ Object ${groupIndex}-${index} is invalid:`, obj);
              return '';
            }
            
            const imageUrl = `/api/image/${obj.id}?method=keyframe`;
            
            // Debug getImageInfo call
            const imageInfo = getImageInfo(obj.id, 'object');
            
            
            return `
              <div class="image-item temporal-item" 
                   style="animation-delay: ${(groupIndex * 2 + index) * 0.03}s"
                   data-group="${groupIndex}"
                   data-image-index="${index}"
                   data-image-id="${obj.id}">
                <img src="${imageUrl}" class="result-image" alt="Object ${obj.id}" 
                     onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiBmaWxsPSIjRjVGNUY1Ii8+Cjx0ZXh0IHg9IjYwIiB5PSI2MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+T2JqZWN0PC90ZXh0Pgo8dGV4dCB4PSI2MCIgeT0iNzUiIGZvbnQtZmFtaWx5PSIxMiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPiMke29iai5pZH08L3RleHQ+Cjwvc3ZnPg=='">
                <div class="image-overlay">
                  <div class="folder-name">${imageInfo.folderName}</div>
                  <div class="keyframe-name">${imageInfo.keyframeName}</div> 
                  <div class="ID">${obj.id}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    
    totalObjects += group.length;
  });
  
  // Determine if all groups have the same size (2 or 3 images)
  const firstGroupSize = limitedGroups[0]?.length || 0;
  const allGroupsSameSize = limitedGroups.every(group => group.length === firstGroupSize);
  
  // CASE 1: 2 images per group -> 3 groups per row, smaller size
  // CASE 2: 3 images per group -> 2 groups per row, normal size
  const containerSizeClass = firstGroupSize === 2 ? 'group-size-2' : 'group-size-3';
  
 
  
  panelDiv.innerHTML = `
    <div class="panel-header-main">
      <h3>Object Detection <span class="temporal-badge">Temporal</span></h3>
      <span class="panel-count">${totalObjects} objects (${limitedGroups.length} groups)</span>
    </div>
    <div class="panel-content-main">
      <div class="temporal-groups-container ${containerSizeClass}">
        ${htmlContent}
      </div>
    </div>
  `;
  
  container.appendChild(panelDiv);
  
  // Debug: Check if CSS classes were applied
  setTimeout(() => {
    const temporalContainer = panelDiv.querySelector('.temporal-groups-container');

    
    const groups = panelDiv.querySelectorAll('.temporal-group');
    groups.forEach((group, index) => {

    });
  }, 100);
}

/**
 * Display single mode object results as flat list
 */
function displaySingleObjectResults(container, objects) {
  const panelDiv = document.createElement('div');
  panelDiv.className = 'search-panel';
  
  panelDiv.innerHTML = `
    <div class="panel-header-main">
      <h3>Object Detection</h3>
      <span class="panel-count">${objects.length} results</span>
    </div>
    <div class="panel-content-main">
      <div class="image-grid">
        ${objects.map((obj, index) => {
          const imageInfo = getImageInfo(obj.id, 'object');
          const folderName = imageInfo?.folderName || 'Unknown';
          const keyframeName = imageInfo?.keyframeName || 'Unknown';
          const timeLabel = formatTimeLabel(imageInfo?.seconds);
          const imageUrl = `/api/image/${obj.id}?method=keyframe`;
          return `
            <div class="image-item" style="animation-delay: ${index * 0.1}s" data-image-id="${obj.id}">
              <img src="${imageUrl}" class="result-image" alt="Object ${obj.id}">
              <div class="image-overlay">
                <div class="folder-name">${folderName}</div>
                <div class="keyframeName">${keyframeName}</div>
                <div class="ID">${obj.id}</div>
                ${timeLabel ? `<div class=\"time-label\">${timeLabel}</div>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
  
  container.appendChild(panelDiv);
}

// Global delegated click handler to show YouTube preview for keyframe images
document.addEventListener('click', async (event) => {
  let target = event.target;
  // Traverse up to the .image-item container
  while (target && !target.classList?.contains('image-item')) {
    target = target.parentElement;
  }
  if (!target || !target.classList?.contains('image-item')) return;

  // ← THÊM KIỂM TRA SHIFT KEY Ở ĐÂY
  // Handle Shift+Click for video frames modal
  if (event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    
    const imageId = target.getAttribute('data-image-id');
   
    
    if (imageId) {
      const videoId = extractVideoIdFromImageId(imageId);
      
      if (videoId) {
       
        showVideoFramesModal(videoId, imageId);
      } else {
        console.warn('⚠️ Could not extract video ID from:', imageId);
      }
    }
    
    return; // ← Dừng xử lý, không mở YouTube
  }

  try {
    // Only handle keyframe images (skip scene/ASR panels)
    const imgEl = target.querySelector('img.result-image');
    const src = imgEl?.getAttribute('src') || '';
    const methodParam = (src.split('method=')[1] || '').toLowerCase();
    if (methodParam === 'scene') return; // do not handle scene previews

    // Prefer overlay info to avoid extra lookups
    const folderEl = target.querySelector('.folder-name');
    const keyframeEl = target.querySelector('.keyframe-name') || target.querySelector('.keyframeName');
    let folderName = folderEl?.textContent?.trim();
    let keyframeName = keyframeEl?.textContent?.trim();
    let seconds = null;

    // Always pull computed info from metadata (ensures we have seconds)
    const imageId = target.getAttribute('data-image-id');
    if (imageId) {
      const info = getImageInfo(imageId, methodParam || 'keyframe');
      if (!folderName || folderName.toLowerCase() === 'unknown') folderName = info?.folderName;
      if (!keyframeName) keyframeName = info?.keyframeName;
      if (Number.isFinite(info?.seconds)) seconds = info.seconds;
    }

    if (!folderName) return;

    const watchUrl = await getWatchUrlForFolder(folderName);
    if (!watchUrl) return;

    showYouTubePreviewModal(watchUrl, { folderName, keyframeName, seconds });
  } catch (err) {
    console.error('Error handling image click for YouTube preview:', err);
  }
});


function extractVideoIdFromImageId(imageId) {
  if (!imageId) return null;
  
  const imageIdStr = String(imageId).trim();
  
  // Case 1: Contains slash (K01_V001/000123)
  if (imageIdStr.includes('/')) {
    const parts = imageIdStr.split('/');
    return parts[0];
  }
  
  // Case 2: Pattern like K##_V###_frame
  const videoMatch = imageIdStr.match(/^([A-Z]\d+_V\d+)/);
  if (videoMatch) {
    return videoMatch[1];
  }
  
  // Case 3: Numeric ID - extract from metadata
  if (/^\d+$/.test(imageIdStr)) {
    try {
      const metadata = store.metadata || {};
      const metaEntry = metadata[imageIdStr];
      const imagePath = typeof metaEntry === 'string' ? metaEntry : (metaEntry?.path || null);
      
      if (imagePath && typeof imagePath === 'string') {
        const pathParts = imagePath.split('/');
        return pathParts[pathParts.length - 2]; // "L01_V001"
      }
    } catch (e) {
      console.warn('Failed to extract video ID from metadata:', e);
    }
  }
  
  return null;
}

// Open YouTube preview when clicking a frame inside chat messages
// Ensures chat frames behave like result frames
document.addEventListener('click', async (event) => {
  const img = event.target.closest('.chat-image-message img');
  if (!img) return;

  event.preventDefault();
  event.stopPropagation();

  const wrap = img.closest('.chat-image-message');
  // Try to extract folder/keyframe from data attributes or rendered info
  const folderName =
    img.getAttribute('data-folder') ||
    wrap?.dataset?.folder ||
    wrap?.querySelector('.chat-image-info')?.textContent?.match(/Folder:\s*([^\n\r]+)/i)?.[1] ||
    '';
  const keyframeName =
    img.getAttribute('data-keyframe') ||
    wrap?.dataset?.keyframe ||
    wrap?.querySelector('.chat-image-info')?.textContent?.match(/Keyframe:\s*([^\n\r]+)/i)?.[1] ||
    '';

  if (!folderName) return;

  try {
    const watchUrl = await getWatchUrlForFolder(folderName);
    if (!watchUrl) return;

    const seconds = secondsFromKeyframe(folderName, keyframeName);
    showYouTubePreviewModal(watchUrl, { folderName, keyframeName, seconds });
  } catch (err) {
    console.error('Chat frame preview error:', err);
  }
});



// ...existing code...


function showYouTubePreviewModal(watchUrl, meta = {}) {
  // Remove any existing overlay to avoid duplicate modals
  const existing = document.querySelector('.yt-preview-overlay');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  const folderName = meta.folderName || '';
  const videoPath = folderName ? `/data/video/${folderName}.mp4` : null;

  // Preserve focus to restore after closing
  const previousActiveElement = document.activeElement;

  // Build overlay and modal
  const overlay = document.createElement('div');
  overlay.className = 'yt-preview-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000;';

  const modal = document.createElement('div');
  modal.className = 'yt-preview-modal';
  modal.style.cssText = 'background:#111;border-radius:10px;max-width:1200px;width:90%;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,0.5);color:#fff;outline:none;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;';

  const headerLeft = document.createElement('div');
  headerLeft.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;';

  const titleEl = document.createElement('div');
  titleEl.textContent = 'Video Preview';
  titleEl.style.cssText = 'font-weight:600;font-size:16px';
  headerLeft.appendChild(titleEl);

  let timeBtn = null;
  if (meta.folderName) {
    const folderBadge = document.createElement('span');
    folderBadge.textContent = meta.folderName;
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
    const fps = (typeof store !== 'undefined' && store.fpsMapping && store.fpsMapping[meta.folderName]) ? store.fpsMapping[meta.folderName] : 30;
    timeBtn = document.createElement('button');
    timeBtn.textContent = `${formatTimeLabel(meta.seconds)} @ ${fps} FPS`;
    timeBtn.title = 'Jump to this time';
    timeBtn.style.cssText = 'background:#136493;border:1px solid #0f5176;color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;cursor:pointer;';
    headerLeft.appendChild(timeBtn);
  }
  header.appendChild(headerLeft);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
  
  // Add to chat button
  const addToChatBtn = document.createElement('button');
  addToChatBtn.type = 'button';
  addToChatBtn.textContent = 'Add to Chat';
  addToChatBtn.title = 'Add current frame to chat';
  addToChatBtn.style.cssText = 'background:#1e88e5;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font-weight:500;';

  // KIS button
  const kisBtn = document.createElement('button');
  kisBtn.type = 'button';
  kisBtn.textContent = 'KIS';
  kisBtn.title = 'Submit KIS Mode';
  kisBtn.style.cssText = 'background:#667eea;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600;';

  // QA button
  const qaBtn = document.createElement('button');
  qaBtn.type = 'button';
  qaBtn.textContent = 'QA';
  qaBtn.title = 'Submit QA Mode';
  qaBtn.style.cssText = 'background:#f5576c;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600;';

  // TRAKE button
  const trakeBtn = document.createElement('button');
  trakeBtn.type = 'button';
  trakeBtn.textContent = 'TRAKE';
  trakeBtn.title = 'Add current frame to TRAKE submission';
  trakeBtn.style.cssText = 'background:#ff6e47;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600;';

  // Submit TRAKE button
  const submitTrakeBtn = document.createElement('button');
  submitTrakeBtn.type = 'button';
  submitTrakeBtn.textContent = 'Submit TRAKE';
  submitTrakeBtn.title = 'Submit selected frames';
  submitTrakeBtn.style.cssText = 'background:#4bae4f;color:#fff;border:0;border-radius:4px;padding:12px 12px;cursor:pointer;font-weight:600;font-size:14px;';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'background:#333;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;';

  btnRow.appendChild(addToChatBtn);
  btnRow.appendChild(kisBtn);
  btnRow.appendChild(qaBtn);
  btnRow.appendChild(trakeBtn);
  btnRow.appendChild(closeBtn);
  header.appendChild(btnRow);

  const body = document.createElement('div');
  
  if (videoPath) {
    const timeInfo = document.createElement('div');
    timeInfo.style.cssText = 'margin:8px 0;color:#fff;font-size:13px;display:flex;justify-content:space-between;align-items:center';

    const currentTimeDisplay = document.createElement('span');
    currentTimeDisplay.textContent = Number.isFinite(meta.seconds) ? formatTimeLabel(meta.seconds) : '0:00';
    currentTimeDisplay.style.cssText = 'color:#fff;font-family:monospace;';
    const frameInfo = document.createElement('span');
    frameInfo.style.cssText = 'color:#98ff98;font-family:monospace;';

    timeInfo.appendChild(currentTimeDisplay);
    timeInfo.appendChild(frameInfo);

    // ✅ VIDEO TAG - Control autoplay via JavaScript
    body.innerHTML = `
      <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;background:#000">
        <video 
          id="mp4VideoPlayer" 
          src="${videoPath}" 
          controls 
          preload="auto"
          style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;object-fit:contain;"
        >
          Your browser does not support the video tag.
        </video>
      </div>
    `;
    body.appendChild(timeInfo);
    
    // TRAKE frames display
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
    
    // Add submitTrakeBtn to trakeFramesDisplay header
    const trakeSubmitContainer = trakeFramesDisplay.querySelector('.trake-submit-container');
    trakeSubmitContainer.appendChild(submitTrakeBtn);
  } else {
    body.innerHTML = `<div style="padding:16px;text-align:center">Cannot load video. Video path not available.</div>`;
  }

  modal.appendChild(header);
  modal.appendChild(body);
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // Array để lưu frames đã chọn cho TRAKE
  let selectedTrakeFrames = [];


  // Minimal keyboard handler
  const isInteractiveEl = (el) => {
    if (!el) return false;
    const tag = el.tagName;
    return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON';
  };
  const spaceKeyHandler = (e) => {
    if (e.code !== 'Space') return;
    const ae = document.activeElement;
    if (isInteractiveEl(ae)) return;
    if (modal.contains(ae) || ae === document.body) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  modal.addEventListener('keydown', spaceKeyHandler, true);

  // Close helpers
  let videoPlayer = null;
  let escHandler = null;
  let updateInterval = null;
  
  let cleanup = () => {
    try { modal.removeEventListener('keydown', spaceKeyHandler, true); } catch {}
    try { if (escHandler) document.removeEventListener('keydown', escHandler, true); } catch {}
    try { if (updateInterval) clearInterval(updateInterval); } catch {}
    if (videoPlayer) {
      try { videoPlayer.pause(); videoPlayer.src = ''; } catch {}
      videoPlayer = null;
    }
  };

  const remove = () => {
    try { cleanup(); } catch {}
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.body.style.overflow = '';
    if (previousActiveElement) { try { previousActiveElement.focus(); } catch {} }
  };

  closeBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); remove(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) remove(); });
  escHandler = (e) => { if (e.key === 'Escape') remove(); };
  document.addEventListener('keydown', escHandler, true);
  
  // ✅ VIDEO PLAYER SETUP
  const videoEl = body.querySelector('#mp4VideoPlayer');
  if (videoEl) {
    videoPlayer = videoEl;
    window.currentVideoPlayer = videoPlayer;
    
    // ✅ AUTO UNMUTE AND SET VOLUME TO 100%
    videoPlayer.muted = false;
    videoPlayer.volume = 1.0;
    
    let hasAttemptedInitialSeek = false;
    let isCurrentlySeeking = false; // ✅ NEW: Prevent concurrent seeks
    
    // ✅ ĐỊNH NGHĨA performSeekWithRetry BÊN NGOÀI - QUAN TRỌNG!
    const performSeekWithRetry = (targetTime, retries = 3) => {
      // ✅ PREVENT CONCURRENT SEEKS
      if (isCurrentlySeeking) {
        console.log('⏸️ Already seeking, skipping...');
        return;
      }
      
      if (retries <= 0) {
        console.error('❌ Failed to seek after multiple attempts');
        isCurrentlySeeking = false;
        return;
      }
      
      isCurrentlySeeking = true;
      console.log(`⏰ Seeking to ${targetTime}s (retries left: ${retries})`);
      
      const wasPaused = videoPlayer.paused;
      
      // ✅ CHECK VIDEO READY STATE
      if (videoPlayer.readyState < 2) {
        console.warn('⚠️ Video not ready (readyState:', videoPlayer.readyState, '), waiting...');
        
        // ✅ SIMPLIFIED: Only wait for canplay once, no timeout
        const handleCanPlay = () => {
          videoPlayer.removeEventListener('canplay', handleCanPlay);
          isCurrentlySeeking = false; // Reset flag
          performSeekWithRetry(targetTime, retries);
        };
        videoPlayer.addEventListener('canplay', handleCanPlay, { once: true });
        
        return;
      }
      
      // ✅ NO PAUSE NEEDED - HTML5 video can seek while playing
      
      try {
        // ✅ CLAMP TIME
        const clampedTime = Math.max(0, Math.min(targetTime, videoPlayer.duration || targetTime));
        const initialTime = videoPlayer.currentTime;
        
        console.log(`📍 Seeking from ${initialTime.toFixed(2)}s to ${clampedTime.toFixed(2)}s`);
        
        // ✅ SET CURRENT TIME
        videoPlayer.currentTime = clampedTime;
        
        // ✅ WAIT FOR SEEKED EVENT
        const handleSeeked = () => {
          const actualTime = videoPlayer.currentTime;
          console.log('✅ Seeked event fired, time:', actualTime.toFixed(2));
          
          isCurrentlySeeking = false; // ✅ Reset flag
          
          // ✅ ENSURE PLAYING if autoplay is enabled
          if (!wasPaused && videoPlayer.paused) {
            videoPlayer.play().catch(err => console.warn('Play prevented:', err));
          }
        };
        
        videoPlayer.addEventListener('seeked', handleSeeked, { once: true });
        
        // ✅ REDUCED TIMEOUT - Only retry if really stuck
        setTimeout(() => {
          if (!isCurrentlySeeking) return; // Already completed
          
          videoPlayer.removeEventListener('seeked', handleSeeked);
          
          const actualTime = videoPlayer.currentTime;
          const timeDiff = Math.abs(actualTime - clampedTime);
          
          console.log(`⏱️ After 1.5s: wanted ${clampedTime.toFixed(2)}s, got ${actualTime.toFixed(2)}s, diff: ${timeDiff.toFixed(2)}s`);
          
          if (timeDiff > 2) { // ✅ Increased threshold from 1 to 2 seconds
            console.warn('⚠️ Seek incomplete, retrying...');
            isCurrentlySeeking = false;
            performSeekWithRetry(targetTime, retries - 1);
          } else {
            console.log('✅ Seek successful (close enough)');
            isCurrentlySeeking = false;
            // ✅ Ensure video is playing if it should be
            if (!wasPaused && videoPlayer.paused) {
              console.log('▶️ Resuming playback after seek');
              videoPlayer.play().catch(err => console.warn('Play prevented:', err));
            }
          }
        }, 1000); // ✅ Reduced to 1000ms for faster response
        
      } catch (err) {
        console.error('❌ Seek error:', err);
        isCurrentlySeeking = false;
        
        // Retry after delay
        setTimeout(() => {
          performSeekWithRetry(targetTime, retries - 1);
        }, 500);
      }
    };
    
    // ✅ SETUP EVENT LISTENERS
    videoPlayer.addEventListener('loadedmetadata', () => {
      console.log('📊 Metadata loaded, duration:', videoPlayer.duration);
      
      const timeDisplay = body.querySelector('span');
      const frameDisplay = body.querySelectorAll('span')[1];
      const fps = (typeof store !== 'undefined' && store.fpsMapping && store.fpsMapping[meta.folderName]) ? store.fpsMapping[meta.folderName] : 30;

      updateInterval = setInterval(() => {
        if (!document.body.contains(overlay)) { 
          clearInterval(updateInterval); 
          return; 
        }
        const currentTime = videoPlayer.currentTime || 0;
        const currentFrame = Math.round(currentTime * fps);
        if (timeDisplay) timeDisplay.textContent = formatTimeLabel(currentTime);
        if (frameDisplay) frameDisplay.textContent = `Frame ${currentFrame} @ ${fps} FPS`;
      }, 100);
    });
    
    // ✅ USE 'loadeddata' INSTEAD OF 'canplay' - Fires only once when ready
    videoPlayer.addEventListener('loadeddata', async () => {
      console.log('▶️ Video loaded (readyState:', videoPlayer.readyState, ')');
      
      if (!hasAttemptedInitialSeek) {
        hasAttemptedInitialSeek = true;
        
        const start = Number.isFinite(meta.seconds) ? Math.max(0, meta.seconds) : 0;
        
        if (start > 0) {
          console.log('🎬 Seeking to:', start, 'before playing');
          // ✅ Seek FIRST while paused (cleaner)
          videoPlayer.currentTime = start;
          
          // ✅ Wait for seek to complete, then play
          const seekComplete = new Promise(resolve => {
            videoPlayer.addEventListener('seeked', () => {
              console.log('✅ Initial seek complete, starting playback');
              resolve();
            }, { once: true });
          });
          
          await seekComplete;
          
          // ✅ Now play from the correct position
          videoPlayer.play().catch(err => {
            console.warn('Autoplay prevented:', err);
          });
        } else {
          // No seek needed, just play from start
          videoPlayer.play().catch(err => {
            console.warn('Autoplay prevented:', err);
          });
        }
      }
    }, { once: true }); // ✅ IMPORTANT: Fire only once
    
    videoPlayer.addEventListener('error', (e) => {
      console.error('❌ Video error:', e);
      const errorCode = videoPlayer.error?.code;
      const errorMessages = {
        1: 'MEDIA_ERR_ABORTED: Video loading aborted',
        2: 'MEDIA_ERR_NETWORK: Network error',
        3: 'MEDIA_ERR_DECODE: Video decoding failed',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED: Video format not supported'
      };
      
      const displayError = errorMessages[errorCode] || 'Unknown error';
      console.error('Video error details:', displayError, videoPath);
    });
    
    // ✅ JUMP TO TIME BUTTON
    if (timeBtn && Number.isFinite(meta.seconds)) {
      timeBtn.addEventListener('click', (e) => { 
        e.preventDefault(); 
        e.stopPropagation(); 
        console.log('🎯 Time button clicked, seeking to:', meta.seconds);
        performSeekWithRetry(meta.seconds);
      });
    }
  }
    
  // Add to Chat button functionality
  addToChatBtn.addEventListener('click', (e) => { 
    e.preventDefault(); 
    e.stopPropagation(); 
    if (!videoPlayer) return;
    
    const currentTime = videoPlayer.currentTime || 0;
    const folderName = meta.folderName || '';
    
    const fps = (typeof store !== 'undefined' && store.fpsMapping && store.fpsMapping[folderName]) ? store.fpsMapping[folderName] : 30;
    const currentFrame = Math.round(currentTime * fps);
    const keyframeName = `keyframe_${currentFrame}`;
    
    // ✅ THAY ĐỔI: Lấy thumbnail từ video thay vì YouTube
    const imageUrl = `/api/image/${folderName}/${currentFrame}?method=keyframe`;
    
    const originalText = addToChatBtn.textContent;
    addToChatBtn.textContent = 'Adding...';
    addToChatBtn.disabled = true;
    
    // Capture frame and add to chat
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

  // XỬ LÝ KIS VÀ QA - SUBMIT TRỰC TIẾP
  // XỬ LÝ KIS VÀ QA - SUBMIT TRỰC TIẾP
  const handleSubmit = async (mode) => {
    if (!videoPlayer) {
      alert('Video player not ready');
      return;
    }
    
    const folderName = meta.folderName;
    if (!folderName) {
      alert('Folder name not available');
      return;
    }
    
    try {
      const { EventRetrievalClient } = await import('./api/eventretrieval.js');
      const client = new EventRetrievalClient({
        baseURL: store.eventRetrievalBaseURL || "https://eventretrieval.oj.io.vn/api/v2",
        fetchImpl: fetch.bind(window)
      });
      
      // ✅ SỬ DỤNG sessionId TỪ STORE NẾU CÓ
      let sessionId = store.sessionId;
      
      if (!sessionId) {
        // Nếu chưa có, thực hiện login
        const username = store.eventRetrievalUsername || "team052";
        const password = store.eventRetrievalPassword || "ZnCTJuBWHU";
        
        const loginResponse = await client.login({ username, password });
        sessionId = loginResponse.sessionId;
        
        // Lưu lại
        store.sessionId = sessionId;
        localStorage.setItem('eventRetrieval_sessionId', sessionId);
        localStorage.setItem('eventRetrieval_loginTime', Date.now().toString());
        
        // Update login button
        refreshLoginButton();
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
      
      await submitToEventRetrieval(videoPlayer, folderName, mode, activeEval.id, sessionId);
      
    } catch (error) {
      console.error('❌ Submit error:', error);
      
      // ✅ NẾU LỖI 401, XÓA sessionId
      if (error.status === 401 || error.message?.includes('Unauthorized')) {
        store.sessionId = null;
        localStorage.removeItem('eventRetrieval_sessionId');
        refreshLoginButton();
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

  // XỬ LÝ TRAKE - ADD FRAME VÀO LIST
  trakeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!videoPlayer) {
      alert('Video player not ready');
      return;
    }
    
    const currentTime = videoPlayer.currentTime || 0;
    const folderName = meta.folderName || '';
    const fps = store.fpsMapping?.[folderName] || 30;
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

  // Global function để remove frame
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

  // Clear all frames button
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

  // SUBMIT TRAKE BUTTON
  submitTrakeBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (selectedTrakeFrames.length < 2) {
      alert('Please add at least 2 frames before submitting');
      return;
    }
    
    const folderName = meta.folderName;
    if (!folderName) {
      alert('Folder name not available');
      return;
    }
    
    try {
      const { EventRetrievalClient } = await import('./api/eventretrieval.js');
      const client = new EventRetrievalClient({
        baseURL: store.eventRetrievalBaseURL || "http://localhost:18080/api/v2",
        fetchImpl: fetch.bind(window)
      });
      
      const username = store.eventRetrievalUsername || "user";
      const password = store.eventRetrievalPassword || "123456";
      
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
      
      // Clear after successful submission
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

  // Hover effects for submit buttons
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
  setTimeout(() => { try { modal.focus(); } catch {} }, 50);
}
// // Khởi tạo YouTube API một lần duy nhất
// let youtubeApiPromise = null;
// function loadYoutubeApi() {
//   if (!youtubeApiPromise) {
//     youtubeApiPromise = new Promise((resolve) => {
//       if (window.YT) {
//         resolve(window.YT);
//       } else {
//         window.onYouTubeIframeAPIReady = () => {
//           resolve(window.YT);
//         };
//         const tag = document.createElement('script');
//         tag.src = "https://www.youtube.com/iframe_api";
//         const firstScriptTag = document.getElementsByTagName('script')[0];
//         firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
//       }
//     });
//   }
//   return youtubeApiPromise;
// }
// function extractYouTubeId(url) {
//   try {
//     const u = new URL(url);
//     if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
//     if (u.searchParams.get('v')) return u.searchParams.get('v');
//     const m = u.pathname.match(/\/embed\/([\w-]+)/);
//     return m ? m[1] : null;
//   } catch {
//     return null;
//   }
// }

// function showYouTubePreviewModal(watchUrl, meta = {}) {
//   // Remove any existing overlay to avoid duplicate modals
//   const existing = document.querySelector('.yt-preview-overlay');
//   if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

//   const folderName = meta.folderName || '';
//   const videoPath = folderName ? `/data/video/${folderName}.mp4` : null;

//   // Preserve focus to restore after closing
//   const previousActiveElement = document.activeElement;

//   // Build overlay and modal
//   const overlay = document.createElement('div');
//   overlay.className = 'yt-preview-overlay';
//   overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000;';

//   const modal = document.createElement('div');
//   modal.className = 'yt-preview-modal';
//   modal.style.cssText = 'background:#111;border-radius:10px;max-width:1200px;width:90%;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,0.5);color:#fff;outline:none;';

//   const header = document.createElement('div');
//   header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;';

//   const headerLeft = document.createElement('div');
//   headerLeft.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;';

//   const titleEl = document.createElement('div');
//   titleEl.textContent = 'Video Preview';
//   titleEl.style.cssText = 'font-weight:600;font-size:16px';
//   headerLeft.appendChild(titleEl);

//   let timeBtn = null;
//   if (meta.folderName) {
//     const folderBadge = document.createElement('span');
//     folderBadge.textContent = meta.folderName;
//     folderBadge.style.cssText = 'background:#222;border:1px solid #444;color:#b9e3ff;padding:2px 8px;border-radius:999px;font-size:12px;';
//     headerLeft.appendChild(folderBadge);
//   }
//   if (meta.keyframeName) {
//     const kfBadge = document.createElement('span');
//     kfBadge.textContent = meta.keyframeName;
//     kfBadge.style.cssText = 'background:#222;border:1px solid #444;color:#ffd28a;padding:2px 8px;border-radius:999px;font-size:12px;';
//     headerLeft.appendChild(kfBadge);
//   }
//   if (Number.isFinite(meta.seconds)) {
//     const fps = (typeof store !== 'undefined' && store.fpsMapping && store.fpsMapping[meta.folderName]) ? store.fpsMapping[meta.folderName] : 30;
//     timeBtn = document.createElement('button');
//     timeBtn.textContent = `${formatTimeLabel(meta.seconds)} @ ${fps} FPS`;
//     timeBtn.title = 'Jump to this time';
//     timeBtn.style.cssText = 'background:#136493;border:1px solid #0f5176;color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;cursor:pointer;';
//     headerLeft.appendChild(timeBtn);
//   }
//   header.appendChild(headerLeft);

//   const btnRow = document.createElement('div');
//   btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
  
//   // Add to chat button
//   const addToChatBtn = document.createElement('button');
//   addToChatBtn.type = 'button';
//   addToChatBtn.textContent = 'Add to Chat';
//   addToChatBtn.title = 'Add current frame to chat';
//   addToChatBtn.style.cssText = 'background:#1e88e5;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font-weight:500;';

//   // Open on YouTube button
//   const openYouTubeBtn = document.createElement('button');
//   openYouTubeBtn.type = 'button';
//   openYouTubeBtn.textContent = 'Open on YouTube';
//   openYouTubeBtn.title = 'Open video on YouTube';
//   openYouTubeBtn.style.cssText = 'background:#ff0000;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font-weight:500;';

//   // KIS button
//   const kisBtn = document.createElement('button');
//   kisBtn.type = 'button';
//   kisBtn.textContent = 'KIS';
//   kisBtn.title = 'Submit KIS Mode';
//   kisBtn.style.cssText = 'background:#667eea;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600;';

//   // QA button
//   const qaBtn = document.createElement('button');
//   qaBtn.type = 'button';
//   qaBtn.textContent = 'QA';
//   qaBtn.title = 'Submit QA Mode';
//   qaBtn.style.cssText = 'background:#f5576c;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600;';

//   // TRAKE button
//   const trakeBtn = document.createElement('button');
//   trakeBtn.type = 'button';
//   trakeBtn.textContent = 'TRAKE';
//   trakeBtn.title = 'Add current frame to TRAKE submission';
//   trakeBtn.style.cssText = 'background:#ff6e47;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600;';

//   // Submit TRAKE button
//   const submitTrakeBtn = document.createElement('button');
//   submitTrakeBtn.type = 'button';
//   submitTrakeBtn.textContent = 'Submit TRAKE';
//   submitTrakeBtn.title = 'Submit selected frames';
//   submitTrakeBtn.style.cssText = 'background:#4bae4f;color:#fff;border:0;border-radius:4px;padding:12px 12px;cursor:pointer;font-weight:600;font-size:14px;';

//   const closeBtn = document.createElement('button');
//   closeBtn.type = 'button';
//   closeBtn.textContent = 'Close';
//   closeBtn.style.cssText = 'background:#333;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;';

//   btnRow.appendChild(addToChatBtn);
//   btnRow.appendChild(openYouTubeBtn);
//   btnRow.appendChild(kisBtn);
//   btnRow.appendChild(qaBtn);
//   btnRow.appendChild(trakeBtn);
//   btnRow.appendChild(closeBtn);
//   header.appendChild(btnRow);

//   const body = document.createElement('div');
  
//   if (videoPath) {
//     const timeInfo = document.createElement('div');
//     timeInfo.style.cssText = 'margin:8px 0;color:#fff;font-size:13px;display:flex;justify-content:space-between;align-items:center';

//     const currentTimeDisplay = document.createElement('span');
//     currentTimeDisplay.textContent = Number.isFinite(meta.seconds) ? formatTimeLabel(meta.seconds) : '0:00';
//     currentTimeDisplay.style.cssText = 'color:#fff;font-family:monospace;';
//     const frameInfo = document.createElement('span');
//     frameInfo.style.cssText = 'color:#98ff98;font-family:monospace;';

//     timeInfo.appendChild(currentTimeDisplay);
//     timeInfo.appendChild(frameInfo);

//     // ✅ VIDEO TAG - Control autoplay via JavaScript
//     body.innerHTML = `
//       <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;background:#000">
//         <video 
//           id="mp4VideoPlayer" 
//           src="${videoPath}" 
//           controls 
//           preload="auto"
//           style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;object-fit:contain;"
//         >
//           Your browser does not support the video tag.
//         </video>
//       </div>
//     `;
//     body.appendChild(timeInfo);
    
//     // TRAKE frames display
//     const trakeFramesDisplay = document.createElement('div');
//     trakeFramesDisplay.className = 'trake-frames-display';
//     trakeFramesDisplay.style.cssText = 'margin-top:12px;padding:12px;background:rgb(26, 26, 26);border-radius:8px;display:none;border:2px solid rgb(255, 110, 71);';
//     trakeFramesDisplay.innerHTML = `
//       <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
//         <span style="font-weight:600;color:#ff6e47;">Selected Frames for TRAKE</span>
//         <div style="display:flex;gap:8px;align-items:center;">
//           <button class="clear-trake-frames" style="background:#e74c3c;color:#fff;border:0;border-radius:4px;padding:12px 12px;cursor:pointer;font-weight:600;font-size:14px;">Clear All</button>
//           <div class="trake-submit-container" style="display:none;"></div>
//         </div>
//       </div>
//       <div class="trake-frames-list" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
//     `;
//     body.appendChild(trakeFramesDisplay);
    
//     // Add submitTrakeBtn to trakeFramesDisplay header
//     const trakeSubmitContainer = trakeFramesDisplay.querySelector('.trake-submit-container');
//     trakeSubmitContainer.appendChild(submitTrakeBtn);
//   } else {
//     body.innerHTML = `<div style="padding:16px;text-align:center">Cannot load video. Video path not available.</div>`;
//   }

//   modal.appendChild(header);
//   modal.appendChild(body);
//   modal.setAttribute('role', 'dialog');
//   modal.setAttribute('aria-modal', 'true');

//   overlay.appendChild(modal);
//   document.body.appendChild(overlay);
//   document.body.style.overflow = 'hidden';

//   // Array để lưu frames đã chọn cho TRAKE
//   let selectedTrakeFrames = [];

//   // Minimal keyboard handler
//   const isInteractiveEl = (el) => {
//     if (!el) return false;
//     const tag = el.tagName;
//     return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON';
//   };
//   const spaceKeyHandler = (e) => {
//     if (e.code !== 'Space') return;
//     const ae = document.activeElement;
//     if (isInteractiveEl(ae)) return;
//     if (modal.contains(ae) || ae === document.body) {
//       e.preventDefault();
//       e.stopPropagation();
//     }
//   };
//   modal.addEventListener('keydown', spaceKeyHandler, true);

//   // Close helpers
//   let videoPlayer = null;
//   let escHandler = null;
//   let updateInterval = null;
  
//   let cleanup = () => {
//     try { modal.removeEventListener('keydown', spaceKeyHandler, true); } catch {}
//     try { if (escHandler) document.removeEventListener('keydown', escHandler, true); } catch {}
//     try { if (updateInterval) clearInterval(updateInterval); } catch {}
//     if (videoPlayer) {
//       try { videoPlayer.pause(); videoPlayer.src = ''; } catch {}
//       videoPlayer = null;
//     }
//   };

//   const remove = () => {
//     try { cleanup(); } catch {}
//     if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
//     document.body.style.overflow = '';
//     if (previousActiveElement) { try { previousActiveElement.focus(); } catch {} }
//   };

//   closeBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); remove(); });
//   overlay.addEventListener('click', (e) => { if (e.target === overlay) remove(); });
//   escHandler = (e) => { if (e.key === 'Escape') remove(); };
//   document.addEventListener('keydown', escHandler, true);
  
//   // ✅ VIDEO PLAYER SETUP
//   const videoEl = body.querySelector('#mp4VideoPlayer');
//   if (videoEl) {
//     videoPlayer = videoEl;
//     window.currentVideoPlayer = videoPlayer;
    
//     // ✅ AUTO UNMUTE AND SET VOLUME TO 100%
//     videoPlayer.muted = false;
//     videoPlayer.volume = 1.0;
    
//     let hasAttemptedInitialSeek = false;
//     let isCurrentlySeeking = false;
    
//     // ✅ ĐỊNH NGHĨA performSeekWithRetry BÊN NGOÀI - QUAN TRỌNG!
//     const performSeekWithRetry = (targetTime, retries = 3) => {
//       if (isCurrentlySeeking) {
//         console.log('⏸️ Already seeking, skipping...');
//         return;
//       }
      
//       if (retries <= 0) {
//         console.error('❌ Failed to seek after multiple attempts');
//         isCurrentlySeeking = false;
//         return;
//       }
      
//       isCurrentlySeeking = true;
//       console.log(`⏰ Seeking to ${targetTime}s (retries left: ${retries})`);
      
//       const wasPaused = videoPlayer.paused;
      
//       if (videoPlayer.readyState < 2) {
//         console.warn('⚠️ Video not ready (readyState:', videoPlayer.readyState, '), waiting...');
        
//         const handleCanPlay = () => {
//           videoPlayer.removeEventListener('canplay', handleCanPlay);
//           isCurrentlySeeking = false;
//           performSeekWithRetry(targetTime, retries);
//         };
//         videoPlayer.addEventListener('canplay', handleCanPlay, { once: true });
        
//         return;
//       }
      
//       try {
//         const clampedTime = Math.max(0, Math.min(targetTime, videoPlayer.duration || targetTime));
//         const initialTime = videoPlayer.currentTime;
        
//         console.log(`📍 Seeking from ${initialTime.toFixed(2)}s to ${clampedTime.toFixed(2)}s`);
        
//         videoPlayer.currentTime = clampedTime;
        
//         const handleSeeked = () => {
//           const actualTime = videoPlayer.currentTime;
//           console.log('✅ Seeked event fired, time:', actualTime.toFixed(2));
          
//           isCurrentlySeeking = false;
          
//           if (!wasPaused && videoPlayer.paused) {
//             videoPlayer.play().catch(err => console.warn('Play prevented:', err));
//           }
//         };
        
//         videoPlayer.addEventListener('seeked', handleSeeked, { once: true });
        
//         setTimeout(() => {
//           if (!isCurrentlySeeking) return;
          
//           videoPlayer.removeEventListener('seeked', handleSeeked);
          
//           const actualTime = videoPlayer.currentTime;
//           const timeDiff = Math.abs(actualTime - clampedTime);
          
//           console.log(`⏱️ After 1.5s: wanted ${clampedTime.toFixed(2)}s, got ${actualTime.toFixed(2)}s, diff: ${timeDiff.toFixed(2)}s`);
          
//           if (timeDiff > 2) {
//             console.warn('⚠️ Seek incomplete, retrying...');
//             isCurrentlySeeking = false;
//             performSeekWithRetry(targetTime, retries - 1);
//           } else {
//             console.log('✅ Seek successful (close enough)');
//             isCurrentlySeeking = false;
//             if (!wasPaused && videoPlayer.paused) {
//               console.log('▶️ Resuming playback after seek');
//               videoPlayer.play().catch(err => console.warn('Play prevented:', err));
//             }
//           }
//         }, 1000);
        
//       } catch (err) {
//         console.error('❌ Seek error:', err);
//         isCurrentlySeeking = false;
        
//         setTimeout(() => {
//           performSeekWithRetry(targetTime, retries - 1);
//         }, 500);
//       }
//     };
    
//     // ✅ SETUP EVENT LISTENERS
//     videoPlayer.addEventListener('loadedmetadata', () => {
//       console.log('📊 Metadata loaded, duration:', videoPlayer.duration);
      
//       const timeDisplay = body.querySelector('span');
//       const frameDisplay = body.querySelectorAll('span')[1];
//       const fps = (typeof store !== 'undefined' && store.fpsMapping && store.fpsMapping[meta.folderName]) ? store.fpsMapping[meta.folderName] : 30;

//       updateInterval = setInterval(() => {
//         if (!document.body.contains(overlay)) { 
//           clearInterval(updateInterval); 
//           return; 
//         }
//         const currentTime = videoPlayer.currentTime || 0;
//         const currentFrame = Math.round(currentTime * fps);
//         if (timeDisplay) timeDisplay.textContent = formatTimeLabel(currentTime);
//         if (frameDisplay) frameDisplay.textContent = `Frame ${currentFrame} @ ${fps} FPS`;
//       }, 100);
//     });
    
//     videoPlayer.addEventListener('loadeddata', async () => {
//       console.log('▶️ Video loaded (readyState:', videoPlayer.readyState, ')');
      
//       if (!hasAttemptedInitialSeek) {
//         hasAttemptedInitialSeek = true;
        
//         const start = Number.isFinite(meta.seconds) ? Math.max(0, meta.seconds) : 0;
        
//         if (start > 0) {
//           console.log('🎬 Seeking to:', start, 'before playing');
//           videoPlayer.currentTime = start;
          
//           const seekComplete = new Promise(resolve => {
//             videoPlayer.addEventListener('seeked', () => {
//               console.log('✅ Initial seek complete, starting playback');
//               resolve();
//             }, { once: true });
//           });
          
//           await seekComplete;
          
//           videoPlayer.play().catch(err => {
//             console.warn('Autoplay prevented:', err);
//           });
//         } else {
//           videoPlayer.play().catch(err => {
//             console.warn('Autoplay prevented:', err);
//           });
//         }
//       }
//     }, { once: true });
    
//     videoPlayer.addEventListener('error', (e) => {
//       console.error('❌ Video error:', e);
//       const errorCode = videoPlayer.error?.code;
//       const errorMessages = {
//         1: 'MEDIA_ERR_ABORTED: Video loading aborted',
//         2: 'MEDIA_ERR_NETWORK: Network error',
//         3: 'MEDIA_ERR_DECODE: Video decoding failed',
//         4: 'MEDIA_ERR_SRC_NOT_SUPPORTED: Video format not supported'
//       };
      
//       const displayError = errorMessages[errorCode] || 'Unknown error';
//       console.error('Video error details:', displayError, videoPath);
//     });
    
//     // ✅ JUMP TO TIME BUTTON
//     if (timeBtn && Number.isFinite(meta.seconds)) {
//       timeBtn.addEventListener('click', (e) => { 
//         e.preventDefault(); 
//         e.stopPropagation(); 
//         console.log('🎯 Time button clicked, seeking to:', meta.seconds);
//         performSeekWithRetry(meta.seconds);
//       });
//     }
//   }
    
//   // Add to Chat button functionality
//   addToChatBtn.addEventListener('click', (e) => { 
//     e.preventDefault(); 
//     e.stopPropagation(); 
//     if (!videoPlayer) return;
    
//     const currentTime = videoPlayer.currentTime || 0;
//     const folderName = meta.folderName || '';
    
//     const fps = (typeof store !== 'undefined' && store.fpsMapping && store.fpsMapping[folderName]) ? store.fpsMapping[folderName] : 30;
//     const currentFrame = Math.round(currentTime * fps);
//     const keyframeName = `keyframe_${currentFrame}`;
    
//     const imageUrl = `/api/image/${folderName}/${currentFrame}?method=keyframe`;
    
//     const originalText = addToChatBtn.textContent;
//     addToChatBtn.textContent = 'Adding...';
//     addToChatBtn.disabled = true;
    
//     if (window.ChatSync && typeof window.ChatSync.sendImageMessage === 'function') {
//       const payload = {
//         imageUrl: imageUrl,
//         folderName: folderName,
//         keyframe: keyframeName,
//         videoId: folderName,
//         seconds: currentTime
//       };
      
//       window.ChatSync.sendImageMessage(payload);
      
//       const chatBox = document.getElementById('chatBox');
//       if (chatBox) chatBox.classList.add('active');
      
//       addToChatBtn.textContent = 'Added ✓';
//       setTimeout(() => {
//         addToChatBtn.textContent = originalText;
//         addToChatBtn.disabled = false;
//       }, 2000);
//     } else {
//       addToChatBtn.textContent = 'Failed ✗';
//       setTimeout(() => {
//         addToChatBtn.textContent = originalText;
//         addToChatBtn.disabled = false;
//       }, 2000);
//     }
//   });

//   // Open on YouTube button functionality
//   const youtubeId = extractYouTubeId(watchUrl);
//   if (youtubeId) {
//     openYouTubeBtn.addEventListener('click', (e) => {
//       e.preventDefault();
//       e.stopPropagation();
      
//       let currentTime = 0;
//       if (videoPlayer) {
//         currentTime = Math.floor(videoPlayer.currentTime || 0);
//       } else if (Number.isFinite(meta.seconds)) {
//         currentTime = Math.floor(meta.seconds);
//       }
      
//       const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}${currentTime > 0 ? `&t=${currentTime}s` : ''}`;
      
//       window.open(youtubeUrl, '_blank', 'noopener,noreferrer');
//     });
//   } else {
//     openYouTubeBtn.disabled = true;
//     openYouTubeBtn.style.opacity = '0.5';
//     openYouTubeBtn.style.cursor = 'not-allowed';
//     openYouTubeBtn.title = 'YouTube URL not available';
//   }

//   // XỬ LÝ KIS VÀ QA - SUBMIT TRỰC TIẾP
//   const handleSubmit = async (mode) => {
//     if (!videoPlayer) {
//       alert('Video player not ready');
//       return;
//     }
    
//     const folderName = meta.folderName;
//     if (!folderName) {
//       alert('Folder name not available');
//       return;
//     }
    
//     try {
//       const { EventRetrievalClient } = await import('./api/eventretrieval.js');
//       const client = new EventRetrievalClient({
//         baseURL: store.eventRetrievalBaseURL || "https://eventretrieval.oj.io.vn/api/v2",
//         fetchImpl: fetch.bind(window)
//       });
      
//       let sessionId = store.sessionId;
      
//       if (!sessionId) {
//         const username = store.eventRetrievalUsername || "team052";
//         const password = store.eventRetrievalPassword || "ZnCTJuBWHU";
        
//         const loginResponse = await client.login({ username, password });
//         sessionId = loginResponse.sessionId;
        
//         store.sessionId = sessionId;
//         localStorage.setItem('eventRetrieval_sessionId', sessionId);
//         localStorage.setItem('eventRetrieval_loginTime', Date.now().toString());
        
//         refreshLoginButton();
//       }
      
//       if (!sessionId) {
//         throw new Error('No sessionId in login response');
//       }
      
//       const evaluations = await client.listEvaluations({ session: sessionId });
      
//       if (!Array.isArray(evaluations) || evaluations.length === 0) {
//         throw new Error('No evaluations found');
//       }
      
//       const activeEval = evaluations.find(e => e.type === 'SYNCHRONOUS' && e.status === 'ACTIVE') || evaluations[0];
      
//       if (!activeEval || !activeEval.id) {
//         throw new Error('No valid evaluation found');
//       }
      
//       await submitToEventRetrieval(videoPlayer, folderName, mode, activeEval.id, sessionId);
      
//     } catch (error) {
//       console.error('❌ Submit error:', error);
      
//       if (error.status === 401 || error.message?.includes('Unauthorized')) {
//         store.sessionId = null;
//         localStorage.removeItem('eventRetrieval_sessionId');
//         refreshLoginButton();
//         alert('Session expired. Please login again.');
//       } else {
//         alert(`Failed to submit: ${error.message}`);
//       }
//     }
//   };

//   kisBtn.addEventListener('click', (e) => {
//     e.preventDefault();
//     e.stopPropagation();
//     handleSubmit('kis');
//   });

//   qaBtn.addEventListener('click', (e) => {
//     e.preventDefault();
//     e.stopPropagation();
//     handleSubmit('qa');
//   });

//   // XỬ LÝ TRAKE - ADD FRAME VÀO LIST
//   trakeBtn.addEventListener('click', (e) => {
//     e.preventDefault();
//     e.stopPropagation();
    
//     if (!videoPlayer) {
//       alert('Video player not ready');
//       return;
//     }
    
//     const currentTime = videoPlayer.currentTime || 0;
//     const folderName = meta.folderName || '';
//     const fps = store.fpsMapping?.[folderName] || 30;
//     const currentFrame = Math.round(currentTime * fps);
    
//     if (selectedTrakeFrames.includes(currentFrame)) {
//       alert(`Frame ${currentFrame} already added!`);
//       return;
//     }
    
//     selectedTrakeFrames.push(currentFrame);
    
//     const trakeFramesDisplay = body.querySelector('.trake-frames-display');
//     const trakeFramesList = body.querySelector('.trake-frames-list');
    
//     if (trakeFramesDisplay) {
//       trakeFramesDisplay.style.display = 'block';
//     }
    
//     if (trakeFramesList) {
//       const frameTag = document.createElement('div');
//       frameTag.style.cssText = 'background:#ff6e47;color:#fff;padding:6px 12px;border-radius:6px;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;';
//       frameTag.innerHTML = `
//         <span>Frame ${currentFrame}</span>
//         <button onclick="this.parentElement.remove(); window.removeTrakeFrame(${currentFrame})" style="background:transparent;border:0;color:#fff;cursor:pointer;font-size:16px;line-height:1;padding:0;">×</button>
//       `;
//       trakeFramesList.appendChild(frameTag);
//     }
    
//     if (selectedTrakeFrames.length >= 2) {
//       const trakeSubmitContainer = body.querySelector('.trake-submit-container');
//       if (trakeSubmitContainer) {
//         trakeSubmitContainer.style.display = 'block';
//       }
//       submitTrakeBtn.textContent = `Submit TRAKE (${selectedTrakeFrames.length} frames)`;
//     }
//   });

//   // Global function để remove frame
//   window.removeTrakeFrame = (frameNumber) => {
//     const index = selectedTrakeFrames.indexOf(frameNumber);
//     if (index > -1) {
//       selectedTrakeFrames.splice(index, 1);
//     }
    
//     if (selectedTrakeFrames.length >= 2) {
//       const trakeSubmitContainer = body.querySelector('.trake-submit-container');
//       if (trakeSubmitContainer) {
//         trakeSubmitContainer.style.display = 'block';
//       }
//       submitTrakeBtn.textContent = `Submit TRAKE (${selectedTrakeFrames.length} frames)`;
//     } else {
//       const trakeSubmitContainer = body.querySelector('.trake-submit-container');
//       if (trakeSubmitContainer) {
//         trakeSubmitContainer.style.display = 'none';
//       }
//     }
    
//     if (selectedTrakeFrames.length === 0) {
//       const trakeFramesDisplay = body.querySelector('.trake-frames-display');
//       if (trakeFramesDisplay) {
//         trakeFramesDisplay.style.display = 'none';
//       }
//     }
//   };

//   // Clear all frames button
//   body.querySelector('.clear-trake-frames')?.addEventListener('click', () => {
//     selectedTrakeFrames = [];
//     const trakeFramesList = body.querySelector('.trake-frames-list');
//     if (trakeFramesList) {
//       trakeFramesList.innerHTML = '';
//     }
//     const trakeSubmitContainer = body.querySelector('.trake-submit-container');
//     if (trakeSubmitContainer) {
//       trakeSubmitContainer.style.display = 'none';
//     }
//     const trakeFramesDisplay = body.querySelector('.trake-frames-display');
//     if (trakeFramesDisplay) {
//       trakeFramesDisplay.style.display = 'none';
//     }
//   });

//   // SUBMIT TRAKE BUTTON
//   submitTrakeBtn.addEventListener('click', async (e) => {
//     e.preventDefault();
//     e.stopPropagation();
    
//     if (selectedTrakeFrames.length < 2) {
//       alert('Please add at least 2 frames before submitting');
//       return;
//     }
    
//     const folderName = meta.folderName;
//     if (!folderName) {
//       alert('Folder name not available');
//       return;
//     }
    
//     try {
//       const { EventRetrievalClient } = await import('./api/eventretrieval.js');
//       const client = new EventRetrievalClient({
//         baseURL: store.eventRetrievalBaseURL || "http://localhost:18080/api/v2",
//         fetchImpl: fetch.bind(window)
//       });
      
//       const username = store.eventRetrievalUsername || "user";
//       const password = store.eventRetrievalPassword || "123456";
      
//       const loginResponse = await client.login({ username, password });
//       const sessionId = loginResponse.sessionId;
      
//       if (!sessionId) {
//         throw new Error('No sessionId in login response');
//       }
      
//       const evaluations = await client.listEvaluations({ session: sessionId });
      
//       if (!Array.isArray(evaluations) || evaluations.length === 0) {
//         throw new Error('No evaluations found');
//       }
      
//       const activeEval = evaluations.find(e => e.status === "CREATED" || e.status === "ACTIVE") || evaluations[0];
      
//       if (!activeEval || !activeEval.id) {
//         throw new Error('No valid evaluation found');
//       }
      
//       await submitToEventRetrievalWithFrames(folderName, selectedTrakeFrames, activeEval.id, sessionId);
      
//       selectedTrakeFrames = [];
//       const trakeFramesList = body.querySelector('.trake-frames-list');
//       if (trakeFramesList) {
//         trakeFramesList.innerHTML = '';
//       }
//       submitTrakeBtn.style.display = 'none';
//       const trakeFramesDisplay = body.querySelector('.trake-frames-display');
//       if (trakeFramesDisplay) {
//         trakeFramesDisplay.style.display = 'none';
//       }
      
//     } catch (error) {
//       console.error('❌ TRAKE Submit error:', error);
//       alert(`Failed to submit TRAKE: ${error.message}`);
//     }
//   });

//   // Hover effects for submit buttons
//   [kisBtn, qaBtn, trakeBtn].forEach(btn => {
//     btn.addEventListener('mouseenter', () => {
//       btn.style.transform = 'scale(1.05)';
//       btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
//     });
//     btn.addEventListener('mouseleave', () => {
//       btn.style.transform = 'scale(1)';
//       btn.style.boxShadow = 'none';
//     });
//   });

//   // Hover effect for YouTube button
//   openYouTubeBtn.addEventListener('mouseenter', () => {
//     if (!openYouTubeBtn.disabled) {
//       openYouTubeBtn.style.transform = 'scale(1.05)';
//       openYouTubeBtn.style.boxShadow = '0 4px 12px rgba(255,0,0,0.3)';
//     }
//   });
//   openYouTubeBtn.addEventListener('mouseleave', () => {
//     openYouTubeBtn.style.transform = 'scale(1)';
//     openYouTubeBtn.style.boxShadow = 'none';
//   });

//   modal.setAttribute('tabindex', '-1');
//   setTimeout(() => { try { modal.focus(); } catch {} }, 50);
// }
/**
 * Submit TRAKE với multiple frames
 */
async function submitToEventRetrievalWithFrames(folderName, frameIds, evaluationId, sessionId) {
  const notification = document.createElement('div');
  notification.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1a1a1a;color:#fff;padding:16px 20px;border-radius:10px;z-index:10003;box-shadow:0 8px 24px rgba(0,0,0,0.6);min-width:300px;border:1px solid #333;';
  
  notification.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;">
      <div style="width:20px;height:20px;border:3px solid #333;border-top-color:#3498db;border-radius:50%;animation:spin 1s linear infinite;"></div>
      <div>
        <div style="font-weight:600;font-size:15px;">Submitting TRAKE</div>
        <div style="font-size:13px;color:#888;margin-top:2px;">${frameIds.length} frames</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  try {
    const videoId = folderName;
    const fps = store.fpsMapping?.[folderName] || 30;
    
    const { EventRetrievalClient } = await import('./api/eventretrieval.js');
    const client = new EventRetrievalClient({
      baseURL: store.eventRetrievalBaseURL || "https://eventretrieval.oj.io.vn/api/v2",
      fetchImpl: fetch.bind(window)
    });
    
    const result = await client.submitTRAKE({
      evaluationId,
      session: sessionId,
      videoId: videoId,
      frameIds: frameIds
    });
    
    console.log('✅ TRAKE Submission result:', result);
    
    let details = `${videoId}<br>Frames: ${frameIds.join(', ')}<br>Format: TR-${videoId}-${frameIds.join(',')}`;
    
    // ✅ PARSE RESPONSE & DETERMINE SUCCESS/FAILURE
    let notificationType = 'success';
    let notificationTitle = 'TRAKE Submitted';
    let notificationIcon = '✓';
    let notificationBg = 'linear-gradient(135deg, #1e3c29 0%, #27ae60 100%)';
    let notificationBorder = '#27ae60';
    
    // Check if result has status and submission fields
    if (result && typeof result === 'object') {
      if (result.submission === 'CORRECT') {
        notificationType = 'success';
        notificationTitle = '✅ TRAKE - CORRECT!';
        notificationIcon = '✅';
        details = `<strong>${result.description || 'Submission correct, well done!'}</strong><br><br>${details}`;
        notificationBg = 'linear-gradient(135deg, #1e3c29 0%, #27ae60 100%)';
        notificationBorder = '#27ae60';
      } else if (result.submission === 'WRONG') {
        notificationType = 'error';
        notificationTitle = '❌ TRAKE - WRONG';
        notificationIcon = '❌';
        details = `<strong>${result.description || 'Submission wrong, try again!'}</strong><br><br>${details}`;
        notificationBg = 'linear-gradient(135deg, #3c1e1e 0%, #e74c3c 100%)';
        notificationBorder = '#e74c3c';
      } else if (result.status === true) {
        // Generic success
        notificationTitle = '✅ TRAKE Submitted Successfully';
        details = `${result.description ? `<strong>${result.description}</strong><br><br>` : ''}${details}`;
      } else if (result.status === false) {
        // Generic failure
        notificationType = 'error';
        notificationTitle = '❌ TRAKE Failed';
        notificationIcon = '✕';
        details = `${result.description ? `<strong>${result.description}</strong><br><br>` : ''}${details}`;
        notificationBg = 'linear-gradient(135deg, #3c1e1e 0%, #e74c3c 100%)';
        notificationBorder = '#e74c3c';
      }
    }
    
    // Update notification with parsed result
    notification.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:14px;">
        <div style="font-size:28px;line-height:1;">${notificationIcon}</div>
        <div style="flex:1;">
          <div style="font-weight:600;font-size:15px;margin-bottom:4px;">
            ${notificationTitle}
          </div>
          <div style="font-size:12px;color:#aaa;line-height:1.6;">${details}</div>
        </div>
      </div>
    `;
    notification.style.background = notificationBg;
    notification.style.borderColor = notificationBorder;
    
  } catch (error) {
    console.error('❌ EventRetrieval: TRAKE submission failed:', error);
    
    notification.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:14px;">
        <div style="font-size:28px;line-height:1;">✕</div>
        <div style="flex:1;">
          <div style="font-weight:600;font-size:15px;color:#e74c3c;margin-bottom:4px;">
            TRAKE Submission Failed
          </div>
          <div style="font-size:12px;color:#aaa;line-height:1.6;">
            ${error.message}
            ${error.data?.description ? `<br><span style="opacity:0.7;">${error.data.description}</span>` : ''}
          </div>
        </div>
      </div>
    `;
    notification.style.background = 'linear-gradient(135deg, #3c1e1e 0%, #e74c3c 100%)';
    notification.style.borderColor = '#e74c3c';
  } finally {
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.transition = 'opacity 0.3s, transform 0.3s';
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(20px)';
        setTimeout(() => notification.remove(), 300);
      }
    }, 5000);
  }
}



// /**
//  * Submit to EventRetrieval API
//  */
// async function submitToEventRetrieval(ytPlayer, folderName, mode, evaluationId, sessionId) {
//   // Create notification
//   const notification = document.createElement('div');
//   notification.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1a1a1a;color:#fff;padding:16px 20px;border-radius:10px;z-index:10003;box-shadow:0 8px 24px rgba(0,0,0,0.6);min-width:300px;border:1px solid #333;';
  
//   notification.innerHTML = `
//     <div style="display:flex;align-items:center;gap:14px;">
//       <div style="width:20px;height:20px;border:3px solid #333;border-top-color:#3498db;border-radius:50%;animation:spin 1s linear infinite;"></div>
//       <div>
//         <div style="font-weight:600;font-size:15px;">Submitting ${mode.toUpperCase()}</div>
//         <div style="font-size:13px;color:#888;margin-top:2px;">Please wait...</div>
//       </div>
//     </div>
//   `;
  
//   document.body.appendChild(notification);
  
//   try {
//     // Get current state
//     const currentTime = ytPlayer.getCurrentTime?.() || 0;
//     const fps = store.fpsMapping?.[folderName] || 30;
//     const currentFrame = Math.round(currentTime * fps);
//     const currentTimeMs = Math.round(currentTime * 1000);
//     const videoId = folderName;

//     // Initialize client
//     const { EventRetrievalClient } = await import('./api/eventretrieval.js');
//     const client = new EventRetrievalClient({
//       baseURL: store.eventRetrievalBaseURL || "https://eventretrieval.oj.io.vn/api/v2",
//       fetchImpl: fetch.bind(window)
//     });
    
//     let result;
//     let details = '';
    
//     switch (mode) {
//       case 'kis':
//         // Submit video segment (5 seconds from current time)
//         const endTimeMs = currentTimeMs;
        
//         result = await client.submitKIS({
//           evaluationId,
//           session: sessionId,
//           answers: [{
//             mediaItemName: videoId,
//             start: currentTimeMs,
//             end: endTimeMs
//           }]
//         });
        
//         details = `${videoId}<br>${formatTimeLabel(currentTime)} → ${formatTimeLabel(currentTime + 5)}<br>(${currentTimeMs}ms - ${endTimeMs}ms)`;
//         break;
        
//       case 'qa':
//         // Create draggable modal for QA input
//         const qaModal = createDraggableQAModal();
//         document.body.appendChild(qaModal);
        
//         // Wait for user input
//         const answer = await new Promise((resolve) => {
//           const submitBtn = qaModal.querySelector('.qa-submit');
//           const cancelBtn = qaModal.querySelector('.qa-cancel');
//           const input = qaModal.querySelector('.qa-input');
          
//           submitBtn.addEventListener('click', () => {
//             const value = input.value.trim();
//             qaModal.remove();
//             resolve(value || null);
//           });
          
//           cancelBtn.addEventListener('click', () => {
//             qaModal.remove();
//             resolve(null);
//           });
          
//           // Submit on Enter key
//           input.addEventListener('keydown', (e) => {
//             if (e.key === 'Enter' && !e.shiftKey) {
//               e.preventDefault();
//               submitBtn.click();
//             }
//           });
          
//           // Focus input
//           setTimeout(() => input.focus(), 100);
//         });
        
//         if (!answer) {
//           notification.remove();
//           return;
//         }
        
//         result = await client.submitQA({
//           evaluationId,
//           session: sessionId,
//           answer: {
//             value: answer,
//             videoId: videoId,
//             timeMs: currentTimeMs
//           }
//         });
        
//         details = `Answer: ${answer}<br>${videoId} @ ${formatTimeLabel(currentTime)}<br>(${currentTimeMs}ms)`;
//         break;
        
//       default:
//         throw new Error(`Unknown mode: ${mode}`);
//     }

//     console.log('✅ Submission result:', result);
    
//     // ✅ PARSE RESPONSE & DETERMINE SUCCESS/FAILURE
//     let notificationType = 'success';
//     let notificationTitle = `${mode.toUpperCase()} Submitted`;
//     let notificationIcon = '✓';
//     let notificationBg = 'linear-gradient(135deg, #1e3c29 0%, #27ae60 100%)';
//     let notificationBorder = '#27ae60';
    
//     // Check if result has status and submission fields
//     if (result && typeof result === 'object') {
//       if (result.submission === 'CORRECT') {
//         notificationType = 'success';
//         notificationTitle = `✅ ${mode.toUpperCase()} - CORRECT!`;
//         notificationIcon = '✅';
//         details = `<strong>${result.description || 'Submission correct, well done!'}</strong><br><br>${details}`;
//         notificationBg = 'linear-gradient(135deg, #1e3c29 0%, #27ae60 100%)';
//         notificationBorder = '#27ae60';
//       } else if (result.submission === 'WRONG') {
//         notificationType = 'error';
//         notificationTitle = `❌ ${mode.toUpperCase()} - WRONG`;
//         notificationIcon = '❌';
//         details = `<strong>${result.description || 'Submission wrong, try again!'}</strong><br><br>${details}`;
//         notificationBg = 'linear-gradient(135deg, #3c1e1e 0%, #e74c3c 100%)';
//         notificationBorder = '#e74c3c';
//       } else if (result.status === true) {
//         // Generic success
//         notificationTitle = `✅ ${mode.toUpperCase()} Submitted Successfully`;
//         details = `${result.description ? `<strong>${result.description}</strong><br><br>` : ''}${details}`;
//       } else if (result.status === false) {
//         // Generic failure
//         notificationType = 'error';
//         notificationTitle = `❌ ${mode.toUpperCase()} Failed`;
//         notificationIcon = '✕';
//         details = `${result.description ? `<strong>${result.description}</strong><br><br>` : ''}${details}`;
//         notificationBg = 'linear-gradient(135deg, #3c1e1e 0%, #e74c3c 100%)';
//         notificationBorder = '#e74c3c';
//       }
//     }
    
//     // Update notification with parsed result
//     notification.innerHTML = `
//       <div style="display:flex;align-items:flex-start;gap:14px;">
//         <div style="font-size:28px;line-height:1;">${notificationIcon}</div>
//         <div style="flex:1;">
//           <div style="font-weight:600;font-size:15px;margin-bottom:4px;">
//             ${notificationTitle}
//           </div>
//           <div style="font-size:12px;color:#aaa;line-height:1.6;">${details}</div>
//         </div>
//       </div>
//     `;
//     notification.style.background = notificationBg;
//     notification.style.borderColor = notificationBorder;
    
//   } catch (error) {
//     console.error('❌ EventRetrieval: Submission failed:', error);
    
//     // Error notification
//     notification.innerHTML = `
//       <div style="display:flex;align-items:flex-start;gap:14px;">
//         <div style="font-size:28px;line-height:1;">✕</div>
//         <div style="flex:1;">
//           <div style="font-weight:600;font-size:15px;color:#e74c3c;margin-bottom:4px;">
//             Submission Failed
//           </div>
//           <div style="font-size:12px;color:#aaa;line-height:1.6;">
//             ${error.message}
//             ${error.data?.description ? `<br><span style="opacity:0.7;">${error.data.description}</span>` : ''}
//           </div>
//         </div>
//       </div>
//     `;
//     notification.style.background = 'linear-gradient(135deg, #3c1e1e 0%, #e74c3c 100%)';
//     notification.style.borderColor = '#e74c3c';
//   } finally {
//     // Auto-remove after 5 seconds
//     setTimeout(() => {
//       if (notification.parentNode) {
//         notification.style.transition = 'opacity 0.3s, transform 0.3s';
//         notification.style.opacity = '0';
//         notification.style.transform = 'translateY(20px)';
//         setTimeout(() => notification.remove(), 300);
//       }
//     }, 5000);
//   }
// }
async function submitToEventRetrieval(videoPlayer, folderName, mode, evaluationId, sessionId) {
  const notification = document.createElement('div');
  notification.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1a1a1a;color:#fff;padding:16px 20px;border-radius:10px;z-index:10003;box-shadow:0 8px 24px rgba(0,0,0,0.6);min-width:300px;border:1px solid #333;';
  
  notification.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;">
      <div style="width:20px;height:20px;border:3px solid #333;border-top-color:#3498db;border-radius:50%;animation:spin 1s linear infinite;"></div>
      <div>
        <div style="font-weight:600;font-size:15px;">Submitting ${mode.toUpperCase()}</div>
        <div style="font-size:13px;color:#888;margin-top:2px;">Please wait...</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  try {
    // ✅ LẤY THỜI GIAN TỪ HTML5 VIDEO PLAYER
    const currentTime = videoPlayer.currentTime || 0;
    const fps = store.fpsMapping?.[folderName] || 30;
    const currentFrame = Math.round(currentTime * fps);
    const currentTimeMs = Math.round(currentTime * 1000);
    const videoId = folderName;

    const { EventRetrievalClient } = await import('./api/eventretrieval.js');
    const client = new EventRetrievalClient({
      baseURL: store.eventRetrievalBaseURL || "https://eventretrieval.oj.io.vn/api/v2",
      fetchImpl: fetch.bind(window)
    });
    
    let result;
    let details = '';
    
    switch (mode) {
      case 'kis':
        const endTimeMs = currentTimeMs;
        
        result = await client.submitKIS({
          evaluationId,
          session: sessionId,
          answers: [{
            mediaItemName: videoId,
            start: currentTimeMs,
            end: endTimeMs
          }]
        });
        
        details = `${videoId}<br>${formatTimeLabel(currentTime)} → ${formatTimeLabel(currentTime + 5)}<br>(${currentTimeMs}ms - ${endTimeMs}ms)`;
        break;
        
      case 'qa':
        const qaModal = createDraggableQAModal();
        document.body.appendChild(qaModal);
        
        const answer = await new Promise((resolve) => {
          const submitBtn = qaModal.querySelector('.qa-submit');
          const cancelBtn = qaModal.querySelector('.qa-cancel');
          const input = qaModal.querySelector('.qa-input');
          
          submitBtn.addEventListener('click', () => {
            const value = input.value.trim();
            qaModal.remove();
            resolve(value || null);
          });
          
          cancelBtn.addEventListener('click', () => {
            qaModal.remove();
            resolve(null);
          });
          
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submitBtn.click();
            }
          });
          
          setTimeout(() => input.focus(), 100);
        });
        
        if (!answer) {
          notification.remove();
          return;
        }
        
        result = await client.submitQA({
          evaluationId,
          session: sessionId,
          answer: {
            value: answer,
            videoId: videoId,
            timeMs: currentTimeMs
          }
        });
        
        details = `Answer: ${answer}<br>${videoId} @ ${formatTimeLabel(currentTime)}<br>(${currentTimeMs}ms)`;
        break;
        
      default:
        throw new Error(`Unknown mode: ${mode}`);
    }

    console.log('✅ Submission result:', result);
    
    let notificationType = 'success';
    let notificationTitle = `${mode.toUpperCase()} Submitted`;
    let notificationIcon = '✓';
    let notificationBg = 'linear-gradient(135deg, #1e3c29 0%, #27ae60 100%)';
    let notificationBorder = '#27ae60';
    
    if (result && typeof result === 'object') {
      if (result.submission === 'CORRECT') {
        notificationType = 'success';
        notificationTitle = `✅ ${mode.toUpperCase()} - CORRECT!`;
        notificationIcon = '✅';
        details = `<strong>${result.description || 'Submission correct, well done!'}</strong><br><br>${details}`;
        notificationBg = 'linear-gradient(135deg, #1e3c29 0%, #27ae60 100%)';
        notificationBorder = '#27ae60';
      } else if (result.submission === 'WRONG') {
        notificationType = 'error';
        notificationTitle = `❌ ${mode.toUpperCase()} - WRONG`;
        notificationIcon = '❌';
        details = `<strong>${result.description || 'Submission wrong, try again!'}</strong><br><br>${details}`;
        notificationBg = 'linear-gradient(135deg, #3c1e1e 0%, #e74c3c 100%)';
        notificationBorder = '#e74c3c';
      } else if (result.status === true) {
        notificationTitle = `✅ ${mode.toUpperCase()} Submitted Successfully`;
        details = `${result.description ? `<strong>${result.description}</strong><br><br>` : ''}${details}`;
      } else if (result.status === false) {
        notificationType = 'error';
        notificationTitle = `❌ ${mode.toUpperCase()} Failed`;
        notificationIcon = '✕';
        details = `${result.description ? `<strong>${result.description}</strong><br><br>` : ''}${details}`;
        notificationBg = 'linear-gradient(135deg, #3c1e1e 0%, #e74c3c 100%)';
        notificationBorder = '#e74c3c';
      }
    }
    
    notification.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:14px;">
        <div style="font-size:28px;line-height:1;">${notificationIcon}</div>
        <div style="flex:1;">
          <div style="font-weight:600;font-size:15px;margin-bottom:4px;">
            ${notificationTitle}
          </div>
          <div style="font-size:12px;color:#aaa;line-height:1.6;">${details}</div>
        </div>
      </div>
    `;
    notification.style.background = notificationBg;
    notification.style.borderColor = notificationBorder;
    
  } catch (error) {
    console.error('❌ EventRetrieval: Submission failed:', error);
    
    notification.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:14px;">
        <div style="font-size:28px;line-height:1;">✕</div>
        <div style="flex:1;">
          <div style="font-weight:600;font-size:15px;color:#e74c3c;margin-bottom:4px;">
            Submission Failed
          </div>
          <div style="font-size:12px;color:#aaa;line-height:1.6;">
            ${error.message}
            ${error.data?.description ? `<br><span style="opacity:0.7;">${error.data.description}</span>` : ''}
          </div>
        </div>
      </div>
    `;
    notification.style.background = 'linear-gradient(135deg, #3c1e1e 0%, #e74c3c 100%)';
    notification.style.borderColor = '#e74c3c';
  } finally {
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.transition = 'opacity 0.3s, transform 0.3s';
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(20px)';
        setTimeout(() => notification.remove(), 300);
      }
    }, 5000);
  }
}



// Expose to other modules (chatbox)
window.showYouTubePreviewModal = showYouTubePreviewModal;
window.getWatchUrlForFolder = getWatchUrlForFolder;
// Expose getImageInfo so chatbox can retrieve timestamp seconds for a result
window.getImageInfo = getImageInfo;

// Time helpers
function formatTimeLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

// Function to capture the current frame from the YouTube video and add it to chat
function captureCurrentFrame(videoId, folderName, keyframeName, currentTime, thumbnailUrls = []) {
  return new Promise((resolve, reject) => {
    // Create a notification element
    const notification = document.createElement('div');
    notification.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#333;color:#fff;padding:10px 20px;border-radius:4px;z-index:10000;transition:opacity 0.3s;opacity:0;';
    notification.textContent = 'Capturing frame...';
    document.body.appendChild(notification);
    setTimeout(() => notification.style.opacity = '1', 10);
    
    // Generate a unique ID for this capture
    const captureId = Math.floor(Math.random() * 10000) + 1;
    
    // Format time for display
    const timeFormatted = formatTimeLabel(currentTime);
    const secondsRounded = Math.floor(currentTime);
    
    // Create keyframe name with timestamp
    const keyframeWithTime = `${keyframeName} (${timeFormatted})`;
    
    // Default thumbnail URL if no others are provided
    if (!thumbnailUrls || thumbnailUrls.length === 0) {
      thumbnailUrls = [`https://img.youtube.com/vi/${videoId}/0.jpg`];
    }
    
    // Try to use YouTube's thumbnail service to get the best quality image
    const useNextThumbnail = (index = 0) => {
      if (index >= thumbnailUrls.length) {
        // If all thumbnails failed, use a fallback
        sendToChatWithUrl(`https://img.youtube.com/vi/${videoId}/default.jpg`);
        return;
      }
      
      // Try loading the image
      const img = new Image();
      img.onload = function() {
        // If image loaded successfully, send it to chat
        sendToChatWithUrl(thumbnailUrls[index]);
      };
      img.onerror = function() {
        // If this thumbnail failed, try the next one
        useNextThumbnail(index + 1);
      };
      img.src = thumbnailUrls[index];
    };
    
    // Send to chat with the given image URL
    const sendToChatWithUrl = (imageUrl) => {
      // Send to chat via ChatSync
      if (window.ChatSync && typeof window.ChatSync.sendImageMessage === 'function') {
        const payload = {
          imageUrl: imageUrl,
          folderName: folderName,
          keyframe: keyframeWithTime,
          videoId: captureId,
          seconds: secondsRounded
        };
        
        window.ChatSync.sendImageMessage(payload);
        
        // Show chat box
        const chatBox = document.getElementById('chatBox');
        if (chatBox) chatBox.classList.add('active');
        
        // Update notification
        notification.textContent = 'Frame added to chat!';
        notification.style.background = '#4CAF50';
        resolve();
      } else {
        // Update notification for error
        notification.textContent = 'Error: Chat module not available';
        notification.style.background = '#F44336';
        reject(new Error('Chat module not available'));
      }
      
      // Remove notification after delay
      setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }, 3000);
    };
    
    // Start trying thumbnails
    useNextThumbnail();
  });
}

/**
 * Display search results with tabs
 */
function displayResultsWithTabs(container, data) {
  // Hide our results container since tabs will handle display
  container.style.display = 'none';
  
  // Store the new format data in store for tabs to use
  store.searchResults = data;
  // Reset image search results when doing a new search
  store.imageSearchResults = null;
  store.hasSearched = true;
  
  // Detect if this is temporal mode
  const isTemporalMode = data.mode === "temporal" || 
                        store.searchCriteria?.is_temporal || 
                        (data.ensemble_qx_0 || data.ensemble_qx_1 || data.ensemble_qx_2 || data.ensemble_qx_x);
  
  // Update tab labels based on mode
  const main = document.getElementById('main');
  const tabsContainer = main.querySelector('.tabs');
  const tabPanelsContainer = main.querySelector('.tab-panels-container');
  
  if (tabsContainer && tabPanelsContainer) {
    updateTabLabels(tabsContainer, isTemporalMode);
    
    // Re-setup tab click handlers after updating labels
    setupTabClickHandlers(tabsContainer, tabPanelsContainer);
    
    // Show the tab panels container and trigger rendering
    tabPanelsContainer.style.display = 'block';
    
    // Ensure Ensemble is the default active tab
    store.activeTabIdx = 0;

    // Trigger rendering of the active tab
    if (typeof renderActiveTab === 'function') {
      renderActiveTabWithNewData(tabPanelsContainer, data);
    }
  }
  
  // Show the tabs wrapper
  const tabsWrapper = main.querySelector('.tabs-wrapper');
  if (tabsWrapper) {
    tabsWrapper.style.display = 'block';
  }
}

/**
 * Render active tab with new data format
 */
function renderActiveTabWithNewData(container, data) {
  container.innerHTML = '';
  
  const methodNames = {
    'asr': 'ASR',
    'ocr': 'OCR',
    'clip_h14': 'CLIP H14',
    'clipbigg14': 'ClipBigg14',
    'img_cap': 'Image Captioning',
    'beit3': 'BEiT3',
    'siglip2': 'SigLip2',
    'google_search': 'Google Search'
  };
  
  const isTemporalMode = data.mode === "temporal" || 
                        store.searchCriteria?.is_temporal || 
                        (data.ensemble_qx_0 );
  
  if (isTemporalMode) {
    renderTemporalResults(container, data, methodNames);
  } else {
    renderSingleResults(container, data, methodNames);
  }
}

/**
 * Render single mode results (original logic)
 */
function renderSingleResults(container, data, methodNames) {
  // Get current active tab index (default 0 = Ensemble)
  const activeTabIdx = store.activeTabIdx || 0;
  
  let tabData;
  switch(activeTabIdx) {
    // case 0: // Ensemble tab - show ensemble across all queries  
    //   tabData = {
    //     per_method: data.ensemble_per_method_across_queries || {},
    //     ensemble_all_methods: data.ensemble_all_queries_all_methods || []
    //   };
    //   break;
    case 0: // Original Query (query_0)
      tabData = data.per_query?.query_0;
      break;
    // case 2: // Augmented Query 1 (query_1)
    //   tabData = data.per_query?.query_1;
    //   break;
    // case 3: // Augmented Query 2 (query_2)
    //   tabData = data.per_query?.query_2;
    //   break;
    case 1: // Image Search - Thêm case mới
    // Hiển thị kết quả Image Search từ store
      if (store.imageSearchResults && store.imageSearchResults.length > 0) {
        // Sử dụng createMethodPanel để tạo panel nhất quán
        const imageSearchPanel = createMethodPanel('Image Search Results', store.imageSearchResults);
        
        // Cập nhật panel count để hiển thị thông tin chi tiết hơn
        const countElement = imageSearchPanel.querySelector('.panel-count');
        if (countElement) {
          countElement.textContent = `${store.imageSearchResults.length} similar images found`;
        }
        
        container.appendChild(imageSearchPanel);
        return;
      } else {
        container.innerHTML = '<p>No image search results yet. Click IS button on any image to search.</p>';
        return;
      } 
      break;
    default:
      tabData = data.per_query?.query_0;
  }
  
  if (!tabData) {
    console.warn(`No data found for tab index: ${activeTabIdx}`);
    return;
  }

  // If exactly one method (among image models + ASR + Video Caption) is active, render only that panel
  try {
    const sc = store.searchCriteria || {};
    const imgActiveCount = [
      sc.active_models?.ClipH14,
      sc.active_models?.ClipBigg14,
      sc.active_models?.ImageCap,
      sc.active_models?.Beit3,
      sc.active_models?.SigLip2,
      sc.active_models?.GoogleSearch,
      sc.has_ocr,
    ].filter(Boolean).length;
    const asrActive = !!sc.has_asr;
    const vidCapActive = !!sc.has_video_cap;
    const activeMethodCount = imgActiveCount + (asrActive ? 1 : 0) + (vidCapActive ? 1 : 0);

    if (activeMethodCount === 1) {
      let selectedKey = null;
      if (sc.active_models?.ClipH14) selectedKey = 'clip_h14';
      else if (sc.active_models?.ClipBigg14) selectedKey = 'clipbigg14';
      else if (sc.active_models?.ImageCap) selectedKey = 'image_captioning';
      else if (sc.active_models?.Beit3) selectedKey = 'beit3';
      else if (sc.active_models?.SigLip2) selectedKey = 'siglip2';
      else if (sc.active_models?.GoogleSearch) selectedKey = 'google_search';
      else if (sc.has_ocr) selectedKey = 'ocr';
      else if (asrActive) selectedKey = 'asr';
      else if (vidCapActive) selectedKey = 'vid_cap';

      const methodResults = selectedKey && tabData.per_method ? tabData.per_method[selectedKey] : null;

      if (Array.isArray(methodResults) && methodResults.length > 0) {
        const methodName = methodNames[selectedKey] || selectedKey;
        const panel = createMethodPanel(methodName, methodResults);
        container.appendChild(panel);
        return;
      }
      // Fallback: if specific method missing, show ensemble if available
      if (Array.isArray(tabData.ensemble_all_methods) && tabData.ensemble_all_methods.length > 0) {
        const ensemblePanel = createMethodPanel('Ensemble (All Methods)', tabData.ensemble_all_methods);
        container.appendChild(ensemblePanel);
        return;
      }
    }
  } catch (err) {
    console.warn('Single-panel optimization error:', err);
  }
  
  // Display ensemble panel first (if available)
  if (tabData.ensemble_all_methods && tabData.ensemble_all_methods.length > 0) {
    const ensemblePanel = createMethodPanel('Ensemble (All Methods)', tabData.ensemble_all_methods);
    container.appendChild(ensemblePanel);
  }
  
  // Display individual method panels
  if (tabData.per_method) {
    Object.entries(tabData.per_method).forEach(([method, results]) => {
      const methodName = methodNames[method] || method;
      const panel = createMethodPanel(methodName, results);
      container.appendChild(panel);
    });
  }
}

/**
 * Render temporal mode results with ensemble_qx_* structure
 */
function renderTemporalResults(container, data, methodNames) {
  const activeTabIdx = store.activeTabIdx || 0;
  
  // In temporal mode, we have ensemble_qx_0, ensemble_qx_1, ensemble_qx_2, ensemble_qx_x
  // Each represents a different tab with groups of 3 images
  let tabData;
  let tabName;
  
  switch(activeTabIdx) {
    // case 0: // Ensemble first
    //   tabData = data.ensemble_qx_x;
    //   tabName = 'Ensemble';
    //   break;
      
    case 0: // Original Query
      tabData = data.ensemble_qx_0;
      tabName = 'Results';
      break;
      
    // case 2: // Augmented Q1
    //   tabData = data.ensemble_qx_1;
    //   tabName = 'Augmented Q1';
    //   break;
      
    // case 3: // Augmented Q2
    //   tabData = data.ensemble_qx_2;
    //   tabName = 'Augmented Q2';
    //   break;
    case 1  : // Image Search - Thêm case mới
    // Hiển thị kết quả Image Search từ store
      if (store.imageSearchResults && store.imageSearchResults.length > 0) {
        // Sử dụng createMethodPanel để tạo panel nhất quán
        const imageSearchPanel = createMethodPanel('Image Search Results', store.imageSearchResults);
        
        // Cập nhật panel count để hiển thị thông tin chi tiết hơn
        const countElement = imageSearchPanel.querySelector('.panel-count');
        if (countElement) {
          countElement.textContent = `${store.imageSearchResults.length} similar images found`;
        }
        
        container.appendChild(imageSearchPanel);
        return;
      } else {
        container.innerHTML = '<p>No image search results yet. Click IS button on any image to search.</p>';
        return;
      } 
      break;
    default:
      tabData = data.ensemble_qx_0;
      tabName = 'Ensemble';
  }
  
  if (!tabData) {
    console.warn(`No temporal data found for tab index: ${activeTabIdx}`);
    return;
  }

  // If exactly one method (image models + ASR + Video Caption) is active, render only that panel
  try {
    const sc = store.searchCriteria || {};
    const imgActiveCount = [
      sc.active_models?.ClipH14,
      sc.active_models?.ClipBigg14,
      sc.active_models?.ImageCap,
      sc.active_models?.Beit3,
      sc.active_models?.SigLip2,
      sc.has_ocr,
    ].filter(Boolean).length;
    const asrActive = !!sc.has_asr;
    const vidCapActive = !!sc.has_video_cap;
    const activeMethodCount = imgActiveCount + (asrActive ? 1 : 0) + (vidCapActive ? 1 : 0);

    if (activeMethodCount === 1 && tabData?.per_method) {
      let selectedKey = null;
      if (sc.active_models?.ClipH14) selectedKey = 'clip_h14';
      else if (sc.active_models?.ClipBigg14) selectedKey = 'ClipBigg14';
      else if (sc.active_models?.ImageCap) selectedKey = 'image_captioning';
      else if (sc.active_models?.Beit3) selectedKey = 'beit3';
      else if (sc.active_models?.SigLip2) selectedKey = 'siglip2';
      else if (sc.has_ocr) selectedKey = 'ocr';
      else if (asrActive) selectedKey = 'asr';
      else if (vidCapActive) selectedKey = 'vid_cap';

      const methodResults = tabData.per_method[selectedKey];
      if (Array.isArray(methodResults) && methodResults.length > 0) {
        const temporalPanel = createTemporalMethodPanel(methodNames[selectedKey] || selectedKey, methodResults, false);
        container.appendChild(temporalPanel);
        return;
      }
      // Fallback: show ensemble if available
      if (Array.isArray(tabData.ensemble_all_methods) && tabData.ensemble_all_methods.length > 0) {
        const temporalPanel = createTemporalMethodPanel('Ensemble (All Methods)', tabData.ensemble_all_methods, true);
        container.appendChild(temporalPanel);
        return;
      }
    }
  } catch (err) {
    console.warn('Temporal single-panel optimization error:', err);
  }
  
  // Create a single panel for this tab containing all groups
  const temporalPanel = createTemporalMethodPanel(tabName, tabData, false);
  container.appendChild(temporalPanel);
}

/**
 * Aggregate temporal queries for a specific sub-query index
 */
function aggregateTemporalQueries(data, subQueryIndices, tabName) {
  const aggregated = {
    per_method: {},
    ensemble_all_methods: []
  };
  
  // Collect all methods across all relevant queries
  const allMethods = new Set();
  
  // For each group (0, 1, 2) and each sub-query index
  for (let group = 0; group < 3; group++) {
    for (const subIdx of subQueryIndices) {
      const queryKey = `query_${group}_${subIdx}`;
      const queryData = data.per_query?.[queryKey];
      
      if (queryData?.per_method) {
        Object.keys(queryData.per_method).forEach(method => allMethods.add(method));
      }
    }
  }
  
  // Aggregate results for each method
  for (const method of allMethods) {
    aggregated.per_method[method] = [];
    
    // Collect results from all relevant queries
    for (let group = 0; group < 3; group++) {
      for (const subIdx of subQueryIndices) {
        const queryKey = `query_${group}_${subIdx}`;
        const queryData = data.per_query?.[queryKey];
        
        if (queryData?.per_method?.[method]) {
          // Mark which group this result came from for styling
          const groupResults = queryData.per_method[method].map((result, idx) => ({
            ...result,
            temporal_group: group,
            is_primary: idx < 3, // First 3 from each group get red border
            result_index: idx
          }));
          
          aggregated.per_method[method].push(...groupResults);
        }
      }
    }
  }
  
  // Aggregate ensemble results
  for (let group = 0; group < 3; group++) {
    for (const subIdx of subQueryIndices) {
      const queryKey = `query_${group}_${subIdx}`;
      const queryData = data.per_query?.[queryKey];
      
      if (queryData?.ensemble_all_methods) {
        const groupEnsemble = queryData.ensemble_all_methods.map((result, idx) => ({
          ...result,
          temporal_group: group,
          is_primary: idx < 3, // First 3 from each group get red border
          result_index: idx
        }));
        
        aggregated.ensemble_all_methods.push(...groupEnsemble);
      }
    }
  }
  
  return aggregated;
}

// Expose function to window for Tabs.js to use
window.renderActiveTabWithNewData = renderActiveTabWithNewData;

/**
 * Create a panel for a specific method
 */

// Helper function to extract folder and keyframe info from real metadata
function getImageInfo(resultId, methodName) {
  // Validate input
  if (resultId === undefined || resultId === null) {
    console.warn('⚠️ getImageInfo: resultId is undefined or null');
    return { folderName: 'ID: ' + resultId, keyframeName: 'Method: ' + methodName };
  }
  
  try {
    // Check if store exists
    if (!store || !store.metadata) {
      console.warn('⚠️ getImageInfo: store or metadata not available, using fallback');
      return { folderName: 'ID: ' + resultId, keyframeName: 'Method: ' + methodName };
    }
    
    // Determine which metadata to use based on method
    let metadata;
    
    if (methodName === 'asr' || methodName === 'vid_cap' || methodName === 'video captioning'|| methodName === 'scene') {
      // Use scene metadata (path_scene.json) for ASR and video captioning
      metadata = store.sceneMetadata || {};
    } else {
      // Use keyframe metadata (path_keyframe.json) for other methods
      metadata = store.metadata || {};
    }
     


    
    // Get image path from metadata
    const resultStr = String(resultId);
    const metaEntry = metadata[resultStr];
    const imagePath = typeof metaEntry === 'string' ? metaEntry : (metaEntry?.path || null);
    
    if (imagePath && typeof imagePath === 'string') {
      // Real metadata format: "../../data/keyframe/L01_V001/keyframe_102.webp"
      const pathParts = imagePath.split('/');
      const filename = pathParts[pathParts.length - 1]; // "keyframe_102.webp"
      const folderName = pathParts[pathParts.length - 2]; // "L01_V001"
      const keyframeName = filename.split('.')[0]; // "keyframe_102"
      
      // Compute timestamp from metadata if available (frame_idx / fps)
      let seconds = null;
      if (typeof metaEntry === 'object' && metaEntry) {
        const frameIdx = Number(metaEntry.frame_idx);
        const fps = Number(metaEntry.fps);
        if (Number.isFinite(frameIdx) && Number.isFinite(fps) && fps > 0) {
          seconds = frameIdx / fps;
        } else if (Number.isFinite(metaEntry.timestamp)) {
          seconds = Number(metaEntry.timestamp);
        }
      }
      // If still unknown, derive from keyframe name + global fps mapping
      if (!Number.isFinite(seconds)) {
        const match = keyframeName.match(/keyframe_(\d+)/);
        const frameIdxNum = match ? Number(match[1]) : null;
        const fpsMap = (typeof store !== 'undefined' && store.fpsMapping) ? store.fpsMapping : null;
        const fpsFromMap = fpsMap && fpsMap[folderName] ? Number(fpsMap[folderName]) : null;
        if (Number.isFinite(frameIdxNum) && Number.isFinite(fpsFromMap) && fpsFromMap > 0) {
          seconds = frameIdxNum / fpsFromMap;
        }
      }
      return { folderName, keyframeName, seconds };
    } else {
      // Fallback if not found in metadata
      console.log(`🔍 getImageInfo: No metadata found for ID ${resultId}, using fallback`);
      return { folderName: 'ID: ' + resultId, keyframeName: 'Method: ' + methodName };
    }
  } catch (error) {
    console.error('❌ Error in getImageInfo:', error);
    return { folderName: 'Error', keyframeName: 'Error', seconds: null };
  }
}

function createMethodPanel(methodName, results) {
  const panelDiv = document.createElement('div');
  panelDiv.className = 'search-panel';
  
  panelDiv.innerHTML = `
    <div class="panel-header-main">
      <h3>${methodName}</h3>
      <span class="panel-count">${results.length} results</span>
    </div>
    <div class="panel-content-main">
      <div class="image-grid">
        ${results.slice(0, 200).map((result, index) => {
          const imageInfo = getImageInfo(result.id, methodName.toLowerCase());
          const folderName = imageInfo?.folderName || 'Unknown';
          const keyframeName = imageInfo?.keyframeName || 'Unknown';
          const timeLabel = formatTimeLabel(imageInfo?.seconds);
          const imageUrl = `/api/image/${result.id}?method=${methodName.toLowerCase()}`;
          return `
            <div class="image-item" style="animation-delay: ${index * 0.05}s" data-image-id="${result.id}">
              <img src="${imageUrl}" class="result-image" alt="Result ${result.id}">
              <div class="image-overlay">
                <div class="folder-name">${folderName}</div>
                <div class="keyframe-name">${keyframeName}</div>
                <div class="ID">${result.id}</div>
                <button class="is-button" onclick="event.stopPropagation(); window.performImageSearchByImage('${result.id}', '${methodName.toLowerCase()}')">
                  IS
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
  
  return panelDiv;
}

/**
 * Create a panel for temporal mode with grouped results
 */
function createTemporalMethodPanel(methodName, results, isEnsemble) {
  const panelDiv = document.createElement('div');
  panelDiv.className = 'search-panel temporal-panel';
  
  // Handle temporal mode results - expect array of groups, each group has 3 images
  // Expected structure: [[{id:1,score:0.5}, {id:2,score:0.6}, {id:3,score:0.7}], ...]
  // Each inner array contains exactly 3 images that should be grouped together
  let displayResults = [];
  let groupCount = 0;
  
  if (Array.isArray(results) && results.length > 0) {
    // Check if this is the 2D structure from ensemble_qx_* outputs
    if (Array.isArray(results[0]) && typeof results[0][0] === 'object' && results[0][0].id !== undefined) {
      // This is the format: [[{id:1,score:0.5}, {id:2,score:0.6}, {id:3,score:0.7}], ...]
      const limited = results.slice(0, MAX_TEMPORAL_GROUPS);
      limited.forEach((imageGroup, groupIndex) => {
          if (Array.isArray(imageGroup) && imageGroup.length > 0) {
            // Each imageGroup can contain 2 or 3 images
            imageGroup.forEach((image, imageIndex) => {
              if (image && image.id !== undefined) {
                displayResults.push({
                  ...image,
                  temporal_group: groupIndex,
                  image_index: imageIndex,
                  is_grouped: true
                });
              } else {
                console.warn(`⚠️ Image ${groupIndex}-${imageIndex} is invalid:`, image);
              }
            });
            groupCount++;
          } else {
            console.warn(`⚠️ Group ${groupIndex} is not valid:`, imageGroup);
          }
        });
    } else {
      // Fallback: treat as flat array and group by 2 or 3
      const groupSize = 2; // Changed from 3 to 2 to match backend
      displayResults = results.slice(0, 100).map((result, index) => ({
        ...result,
        temporal_group: Math.floor(index / groupSize),
        image_index: index % groupSize,
        is_grouped: false
      }));
      groupCount = Math.ceil(displayResults.length / groupSize);
    }
  }
  
  // Validate displayResults
  if (displayResults.length === 0) {
    console.error('❌ createTemporalMethodPanel: No display results to show');
    panelDiv.innerHTML = `
      <div class="panel-header-main">
        <h3>${methodName} <span class="temporal-badge">Temporal</span></h3>
        <span class="panel-count">No results</span>
      </div>
      <div class="panel-content-main">
        <div style="padding: 20px; text-align: center; color: #666;">
          No temporal results to display
        </div>
      </div>
    `;
    return panelDiv;
  }
  
  // Create groups of 2-3 images with visual separation
  // Each group will be enclosed in a red border box
  let htmlContent = '';
  
  // Group images by temporal_group
  const groups = {};
  
  displayResults.forEach(result => {
    if (!groups[result.temporal_group]) {
      groups[result.temporal_group] = [];
    }
    groups[result.temporal_group].push(result);
  });
  
  // Create each group with red border
  Object.keys(groups).forEach(groupKey => {
    const groupImages = groups[groupKey];
    const groupIndex = parseInt(groupKey);
    const groupSize = groupImages.length;
    const groupSizeClass = groupSize === 2 ? 'group-size-2' : 'group-size-3';
    
    htmlContent += `
      <div class="temporal-group ${groupSizeClass}" data-group="${groupIndex}">
        <div class="group-label">Group ${groupIndex + 1}</div>
        <div class="group-images ${groupSizeClass}">
          ${groupImages.map((result, index) => {
            if (!result || !result.id) {
              console.warn(`⚠️ Temporal result ${groupIndex}-${index} is invalid:`, result);
              return '';
            }
            
            // Determine image source based on method name
            let imageUrl;
            
            if (methodName.toLowerCase() === 'asr' || methodName.toLowerCase() === 'video captioning') {
              // Use path_scene.json for ASR and video captioning
              imageUrl = `/api/image/${result.id}?method=scene`;
            } else {
              // Use path_keyframe.json for other methods
              imageUrl = `/api/image/${result.id}?method=keyframe`;
            }

            return `
              <div class="image-item temporal-item" 
                   style="animation-delay: ${(groupIndex * 2 + index) * 0.03}s"
                   data-group="${groupIndex}"
                   data-image-index="${index}"
                   data-image-id="${result.id}">
                <img src="${imageUrl}" class="result-image" alt="Result ${result.id}" 
                     onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDEyMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiBmaWxsPSIjRjVGNUY1Ii8+Cjx0ZXh0IHg9IjYwIiB5PSI2MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+T2JqZWN0PC90ZXh0Pgo8dGV4dCB4PSI2MCIgeT0iNzUiIGZvbnQtZmFtaWx5PSIxMiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPiMke29iai5pZH08L3RleHQ+Cjwvc3ZnPg=='">
                 <div class="image-overlay">
                   <div class="folder-name">${getImageInfo(result.id, methodName.toLowerCase()).folderName}</div>
                   <div class="keyframe-name">${getImageInfo(result.id, methodName.toLowerCase()).keyframeName}</div>
                   <div class="ID">${result.id}</div>
                   ${(() => { const info = getImageInfo(result.id, methodName.toLowerCase()); const t = formatTimeLabel(info.seconds); return t ? `<div class=\"time-label\">${t}</div>` : '' })()}
                   <button class="is-button" onclick="event.stopPropagation(); window.performImageSearchByImage('${result.id}', '${methodName.toLowerCase()}')">
                     IS
                   </button>
                 </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });
  
  // Determine container size class based on first group's size
  const firstGroupKey = Object.keys(groups)[0];
  const firstGroupSize = firstGroupKey !== undefined ? groups[firstGroupKey].length : 0;
  const containerSizeClass = firstGroupSize === 2 ? 'group-size-2' : 'group-size-3';

  panelDiv.innerHTML = `
    <div class="panel-header-main">
      <h3>${methodName} <span class="temporal-badge">Temporal</span></h3>
      <span class="panel-count">${displayResults.length} results (${groupCount} groups)</span>
    </div>
    <div class="panel-content-main">
      <div class="temporal-groups-container ${containerSizeClass}">
        ${htmlContent}
      </div>
    </div>
  `;
  
  return panelDiv;
}
function createTranslateButton() {
  // Lấy trạng thái từ localStorage, mặc định là true (translate mode)
  // Nếu translate_mode không tồn tại hoặc là 'translate' thì isTranslate = true
  const isTranslate = localStorage.getItem('translate_mode') !== 'origin';
  
  // Kiểm tra xem nút đã tồn tại chưa
  if (document.querySelector('.translate-floating-button')) {
    document.querySelector('.translate-floating-button').remove();
  }
  
  // Tạo button và thêm vào body
  const translateBtn = document.createElement('div');
  translateBtn.className = 'translate-floating-button';
  translateBtn.innerHTML = `
    <label class="translate-switch">
      <input id="chkTranslate" type="checkbox" ${!isTranslate ? 'checked' : ''}>
      <span class="translate-slider"></span>
    </label>
  `;
  
  document.body.appendChild(translateBtn);
  
  // Xử lý sự kiện khi nhấp vào button
  const translateSwitch = translateBtn.querySelector('#chkTranslate');
  if (translateSwitch) {
    // Set trạng thái ban đầu - UNCHECKED nghĩa là Translate (true)
    translateSwitch.checked = !isTranslate;

    
    // Lưu trạng thái toàn cục ngay khi khởi tạo
    window.isTranslate = isTranslate;
    
    translateSwitch.addEventListener('change', function() {
      // Đảo ngược giá trị: UNCHECKED = true, CHECKED = false
      const isTranslateMode = !this.checked;
      
      // Lưu trạng thái
      localStorage.setItem('translate_mode', isTranslateMode ? 'translate' : 'origin');

      
      // Cập nhật biến toàn cục
      window.isTranslate = isTranslateMode;
      

    });
  }
}
function initializeTranslateState() {
  // Đặt giá trị mặc định nếu chưa có trong localStorage
  if (localStorage.getItem('translate_mode') === null) {
    localStorage.setItem('translate_mode', 'translate'); // Mặc định là translate
  }
  
  // Set biến toàn cục
  window.isTranslate = localStorage.getItem('translate_mode') !== 'origin';
}
// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
  bootstrap().then(() => {
    // Small delay to ensure all components are mounted
    setTimeout(() => {
      initYoutubePreviewHandler();
      initializeQuickKISSubmit();
      initializeInputHandling();
      initializeSearchValidation();
      initializeShortcuts();
      registerTranslateShortcut() ;
      createLoginButton();
      createTranslateButton(),
      initializePasteImage(); // Initialize keyboard shortcuts

      // Clean up any existing panels
      const main = document.getElementById('main');
      if (main) {
        // Hide panel container initially
        const panelContainer = main.querySelector('.panel-container');
        if (panelContainer) {
          panelContainer.style.display = 'none';
        }
        
        // Remove old panels
        const oldPanels = main.querySelectorAll('section.panel');
        oldPanels.forEach(panel => panel.remove());
      
        // Hide tab panels initially
        const tabPanelsContainer = main.querySelector('.tab-panels-container');
        if (tabPanelsContainer) {
          tabPanelsContainer.style.display = 'none';
        }
      }
      
      
      // Initialize chatbox functionality
      initializeChatboxWrapper();
    }, 100);
  });
});


// Initialize chatbox functionality
import { initializeChatbox } from './events/HandleChatBox.js';
import {registerTranslateShortcut} from './events/HandleShortcut.js';

function initializeChatboxWrapper() {
  initializeChatbox();
}
// Global function để gọi từ onclick
window.performImageSearchByImage = async function(imageId, method) {
  try {
    
    
    // Import và gọi function từ imageSearch.js
    const imageSearchModule = await import('./api/imageSearch.js');
    
    
    const { performImageSearchByImage: searchFunction } = imageSearchModule;
    
    
    if (typeof searchFunction !== 'function') {
      throw new Error('performImageSearchByImage is not a function');
    }
    
    
    const result = await searchFunction(imageId, method);
    
    // ✅ SAU KHI SEARCH XONG, NHẢY QUA TAB IMAGE SEARCH
    if (result) {
      // Set active tab index to 1 (Image Search tab)
      store.activeTabIdx = 1;
      
      // Trigger tab rendering
      const main = document.getElementById('main');
      const tabPanelsContainer = main?.querySelector('.tab-panels-container');
      
      if (tabPanelsContainer && typeof window.renderActiveTabWithNewData === 'function') {
        window.renderActiveTabWithNewData(tabPanelsContainer, store.searchResults);
      }
      
      // Update active tab styling
      const tabs = main?.querySelectorAll('.tab');
      if (tabs) {
        tabs.forEach((tab, idx) => {
          if (idx === 1) {
            tab.classList.add('active');
          } else {
            tab.classList.remove('active');
          }
        });
      }
      
     
    }
    
    return result;
  } catch (error) {
    console.error('Global image search error:', error);
  }
};

// Helper: compute seconds from keyframe name and FPS mapping
function secondsFromKeyframe(folderName, keyframeName) {
  try {
    const fpsMap = (typeof store !== 'undefined' && store.fpsMapping) ? store.fpsMapping : null;
    const fps = fpsMap && fpsMap[folderName] ? Number(fpsMap[folderName]) : 30;
    const m = String(keyframeName || '').match(/(\d+)/);
    const idx = m ? Number(m[1]) : NaN;
    if (Number.isFinite(idx) && Number.isFinite(fps) && fps > 0) return idx / fps;
  } catch {}
  return undefined;
}

export function initializePasteImage() {
  // Lấy tất cả input query
  const queryInputs = document.querySelectorAll('#qMain, #q1, #q2, #q3');
  
  queryInputs.forEach(input => {
    // ✅ Xóa listener cũ nếu có để tránh duplicate
    if (input._pasteHandler) {
      input.removeEventListener('paste', input._pasteHandler);
    }
    
    // ✅ Tạo handler mới và lưu reference
    const pasteHandler = async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      // Tìm image trong clipboard
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          
          const blob = items[i].getAsFile();
          if (!blob) continue;
          
          // Hiển thị loading
          const originalPlaceholder = input.placeholder;
          input.placeholder = 'Uploading image...';
          input.disabled = true;
          
          try {
            // Upload ảnh lên server
            const formData = new FormData();
            formData.append('image', blob);
            
            const response = await fetch('/api/upload-query-image', {
              method: 'POST',
              body: formData
            });
            
            if (!response.ok) {
              const errorText = await response.text().catch(() => 'Unknown error');
              if (response.status === 413) {
                throw new Error('Image too large. Maximum size is 500MB.');
              } else if (response.status === 415) {
                throw new Error('Unsupported image format. Please use JPG, PNG, or WebP.');
              }
              throw new Error(`Upload failed (${response.status}): ${errorText}`);
            }
            
            const data = await response.json();

            // ✅ LƯU image_id VÀO dataset
            input.value = `[IMAGE]`;
            input.dataset.imageId = data.image_id;
            
            console.log('✅ Image uploaded:', data.image_id);
            
            // Hiển thị preview
            showImagePreview(input, data.image_url || URL.createObjectURL(blob));
            
            // ✅ FORCE ENABLE SEARCH BUTTON TRỰC TIẾP
            const searchButton = document.querySelector('.search-btn');
            if (searchButton) {
              searchButton.disabled = false;
              searchButton.removeAttribute('disabled');
              searchButton.classList.remove('search-disabled');
              searchButton.style.pointerEvents = 'auto';
              searchButton.title = 'Search with image';
            }
            
            // ✅ TRIGGER EVENT VÀ UPDATE
            setTimeout(() => {
              // Trigger custom event
              const event = new CustomEvent('imageQueryChanged', {
                detail: { hasImageQuery: true }
              });
              document.dispatchEvent(event);
           
              
              // Gọi trực tiếp updateSearchButtonState
              if (typeof window.updateSearchButtonState === 'function') {
                window.updateSearchButtonState();
              
              }
            }, 100);
            
           
          } catch (error) {
            console.error('❌ Failed to upload image:', error);
            alert(`Upload failed: ${error.message}`);
          } finally {
            input.placeholder = originalPlaceholder;
            input.disabled = false;
          }
          
          break;
        }
      }
    };
    
    // ✅ Lưu reference và add listener
    input._pasteHandler = pasteHandler;
    input.addEventListener('paste', pasteHandler);
    
    // ✅ THÊM: Listen cho sự kiện input change để update search button
    if (input._inputHandler) {
      input.removeEventListener('input', input._inputHandler);
    }
    
    const inputHandler = () => {
      setTimeout(() => {
        if (typeof window.updateSearchButtonState === 'function') {
          window.updateSearchButtonState();
        }
      }, 50);
    };
    
    input._inputHandler = inputHandler;
    input.addEventListener('input', inputHandler);
  });
}

/**
 * Show image preview next to input
 */
function showImagePreview(input, imageUrl) {
  // Xóa preview cũ
  const oldPreview = input.parentElement.querySelector('.image-preview');
  if (oldPreview) oldPreview.remove();
  
  // Tạo preview mới
  const preview = document.createElement('div');
  preview.className = 'image-preview';
  preview.innerHTML = `
    <img src="${imageUrl}" alt="Query image" style="max-width:60px;max-height:60px;border-radius:4px;margin-left:8px;border:2px solid #4ea3ff;">
    <button type="button" class="remove-image" style="background:#e74c3c;color:#fff;border:0;border-radius:50%;width:20px;height:20px;margin-left:4px;cursor:pointer;font-size:14px;line-height:1;">×</button>
  `;
  
  // Thêm vào sau input
  input.parentElement.style.display = 'flex';
  input.parentElement.style.alignItems = 'center';
  input.parentElement.appendChild(preview);
  
  // Xử lý remove
  preview.querySelector('.remove-image').addEventListener('click', () => {
    input.value = '';
    delete input.dataset.imageId;
    preview.remove();
    
    // ✅ TRIGGER UPDATE KHI XÓA ẢNH
    setTimeout(() => {
      const event = new CustomEvent('imageQueryChanged', {
        detail: { hasImageQuery: false }
      });
      document.dispatchEvent(event);
      
      if (typeof window.updateSearchButtonState === 'function') {
        window.updateSearchButtonState();
      }
    }, 50);
  });
}





// ✅ SHIFT+CLICK CHO ẢNH TRONG CHAT
document.addEventListener('click', async (event) => {
  // Only handle Shift+Click
  if (!event.shiftKey) return;
  
  // Check if click is on chat image
  let target = event.target;
  
  // Traverse up to find chat-image-message
  let depth = 0;
  while (target && depth < 10) {
    if (target.classList?.contains('chat-image-message')) {
      break;
    }
    target = target.parentElement;
    depth++;
  }
  
  // If not a chat image, return early
  if (!target || !target.classList?.contains('chat-image-message')) {
    return;
  }
  
  // ✅ FOUND CHAT IMAGE - STOP PROPAGATION
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  
  console.log('🎬 Shift+Click on chat image');
  
  // Get img element
  const imgElement = target.querySelector('img');
  if (!imgElement) {
    console.warn('⚠️ No image found in chat message');
    return;
  }
  
  // Get folder name (video ID) and result ID from chat image
  const folderName = imgElement.dataset.folder || imgElement.getAttribute('data-folder');
  const keyframeName = imgElement.dataset.keyframe || imgElement.getAttribute('data-keyframe');
  const resultId = imgElement.dataset.imageId || imgElement.getAttribute('data-image-id');
  
  console.log('📦 Chat image data:', {
    folderName,
    keyframeName,
    resultId
  });
  
  if (!folderName) {
    console.warn('⚠️ No folder name found for chat image');
    return;
  }
  
  // Video ID for modal is the folder name (e.g., L26_V258)
  const videoId = folderName;
  
  console.log('🎬 Opening video frames modal for video:', videoId, 'with initial result ID:', resultId);
  
  // Open modal with video ID and result ID to scroll to that frame
  showVideoFramesModal(videoId, resultId);
}, true); // ← capture phase

