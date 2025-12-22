/**
 * HandleInput.js
 * Logic for handling ASR and OCR input fields and their effects on other controls.
 */

import { store } from '../state/store.js';

// Global variables to track initialization state and prevent duplicates
let isInitialized = false;
let activeTimers = [];
let activeObservers = [];
let activeEventListeners = []; // Track event listeners for cleanup

// Debounce helper to prevent rapid-fire events
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Wait for DOM to be fully loaded
function whenDOMReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}

/**
 * Global validation state tracking
 */
const validationState = {
  // Mode 1: ASR only
  hasASRContent: false,
  hasVideoChecked: false,
  
  // Mode 2: OCR + Models
  hasOCRContent: false,
  hasImageChecked: false,
  
  // Mode 3: Tools
  hasToolContent: false,
  
  // General state
  isTemporalMode: false,

  hasImageQuery: false,
  // Helper functions
  isMode1Active() {
    return this.hasASRContent || this.hasVideoChecked;
  },
  
  isMode2Active() {
    return this.hasOCRContent || this.hasImageChecked;
  },
  
  isMode3Active() {
    return this.hasToolContent;
  },
  
  getActiveMode() {
    // For temporal mode: only 2 modes (Filter vs OCR+Models)
    if (this.isTemporalMode) {
      if (this.hasToolContent) return 'temporal_filter';
      if (this.hasOCRContent || this.hasImageChecked) return 'temporal_models';
      return 0;
    }
    
    // For single mode: original 3 modes
    if (this.isMode1Active()) return 1;
    if (this.isMode2Active()) return 2;
    if (this.isMode3Active()) return 3;
    return 0; // No mode active
  }
};

/**
 * Handles Tools validation with 3-mode logic
 */
export function handleToolsValidation() {
  // Function to check all model states
  function updateModelStates() {
    validationState.isTemporalMode = document.getElementById('chkTemporal')?.checked || false;
    
    if (validationState.isTemporalMode) {
      // Temporal mode: check across all 3 queries
      validationState.hasImageChecked = [1, 2, 3].some(queryNum => 
        ['img_0', 'img_1', 'img_2', 'img_3', 'img_4','img_5'].some(modelPrefix => 
          document.querySelector(`#${modelPrefix}_${queryNum}`)?.checked || false
        )
      );
      
      validationState.hasOCRContent = [1, 2, 3].some(queryNum => {
        const ocrInput = document.querySelector(`#q${queryNum}ocr`);
        return ocrInput && ocrInput.value.trim() !== '';
      });
      
      // Add check for ASR in temporal mode (vid_0 checkbox)
      validationState.hasVideoChecked = document.querySelector('#vid_0')?.checked || false;
      
    } else {
      // Single mode
      validationState.hasImageChecked = ['img_0', 'img_1', 'img_2', 'img_3', 'img_4','img_5'].some(id => 
        document.querySelector(`#${id}`)?.checked || false
      );
      
      validationState.hasVideoChecked = document.querySelector('#vid_0')?.checked || false;
      
      const ocrInput = document.querySelector('#qOCR');
      validationState.hasOCRContent = ocrInput && ocrInput.value.trim() !== '';
      
      const asrInput = document.querySelector('#qASR');
      validationState.hasASRContent = asrInput && asrInput.value.trim() !== '';
    }
    
    // Check tools (filter widgets)
    const toolWidgets = document.querySelectorAll('.filter-widget');
    validationState.hasToolContent = Array.from(toolWidgets).some(widget => {
      const input = widget.querySelector('.filter-input');
      const output = widget.querySelector('.filter-output');
      const inputValue = input ? input.value.trim() : '';
      const outputValue = output ? output.textContent.trim() : '';
      return inputValue !== '' || outputValue !== '';
    });
    
    // Check if any non-query controls are active (OCR, ASR, models)
    validationState.hasNonQueryContent = validationState.hasOCRContent || 
                                        validationState.hasASRContent || 
                                        validationState.hasImageChecked || 
                                        validationState.hasVideoChecked;
  }
  
  // Debounced update function
  const debouncedUpdateControls = debounce(() => {
    updateModelStates();
    const activeMode = validationState.getActiveMode();
    
    // FORCE TRIGGER SEARCH VALIDATION
    setTimeout(() => {
      if (typeof window.updateSearchButtonState === 'function') {
        window.updateSearchButtonState();
      } else {
        // Import and call from ValidateSearch module
        import('../events/ValidateSearch.js').then(module => {
          module.updateSearchButtonState();
        });
      }
    }, 50);
    
    // FIRST: Reset all controls to enabled state
    document.querySelectorAll('input[type="text"], input[type="checkbox"]').forEach(input => {
      if (input.id !== 'chkTemporal') {
        input.disabled = false;
        input.removeAttribute('disabled');
        input.removeAttribute('readonly');
        input.style.pointerEvents = '';
        input.style.opacity = '';
      }
    });
    
    // Reset temporal mode controls and ensure OCR inputs are always enabled
    if (validationState.isTemporalMode) {
      [1, 2, 3].forEach(queryNum => {
        ['img_0', 'img_1', 'img_2', 'img_3', 'img_4', 'img_5', 'txt_0', 'txt_1'].forEach(modelPrefix => {
          const checkbox = document.querySelector(`#${modelPrefix}_${queryNum}`);
          if (checkbox) {
            checkbox.disabled = false;
            checkbox.removeAttribute('disabled');
            checkbox.style.pointerEvents = '';
            checkbox.style.opacity = '';
          }
        });
        
        // Always ensure OCR inputs are enabled when switching modes
        const ocrInput = document.querySelector(`#q${queryNum}ocr`);
        if (ocrInput) {
          ocrInput.disabled = false;
          ocrInput.removeAttribute('disabled');
          ocrInput.removeAttribute('readonly');
          ocrInput.style.pointerEvents = '';
          ocrInput.style.opacity = '';
        }

      });
    }
    
    // Reset filter widgets
    document.querySelectorAll('.filter-widget input').forEach(input => {
      input.disabled = false;
      input.removeAttribute('disabled');
      input.removeAttribute('readonly');
    });
    
    // THEN: Apply restrictions based on mode
    if (validationState.isTemporalMode) {
      // === TEMPORAL MODE: 2-way exclusive (Filter vs OCR+Models) ===
      
      // ALWAYS ensure the search button is enabled if there's OCR content
      const hasAnyTemporalOCRContent = [1, 2, 3].some(queryNum => {
        const ocrInput = document.querySelector(`#q${queryNum}ocr`);
        return ocrInput && ocrInput.value.trim() !== '';
      });
      
      if (hasAnyTemporalOCRContent) {
        const searchButton = document.querySelector('.search-btn');
        if (searchButton) {
          searchButton.disabled = false;
          searchButton.removeAttribute('disabled');
          searchButton.classList.remove('search-disabled');
          searchButton.title = 'Search with OCR';
        }
      }
      
      if (activeMode === 'temporal_filter') {
        // TEMPORAL FILTER MODE: Only filters + queries allowed
        
        // FORCE ENABLE SEARCH BUTTON for temporal filter mode
        const searchButton = document.querySelector('.search-btn');
        if (searchButton) {
          searchButton.disabled = false;
          searchButton.removeAttribute('disabled');
          searchButton.classList.remove('search-disabled');
          searchButton.title = 'Search with tools';
        }
        
        // Disable all OCR inputs and models across all queries
        [1, 2, 3].forEach(queryNum => {
          // Only disable OCR inputs if filter content exists
          const ocrInput = document.querySelector(`#q${queryNum}ocr`);
          if (ocrInput && validationState.hasToolContent) {
            ocrInput.disabled = true;
            ocrInput.setAttribute('disabled', 'disabled');
            ocrInput.setAttribute('readonly', 'readonly');
            ocrInput.style.pointerEvents = 'none';
            ocrInput.style.opacity = '0.5';
            if (ocrInput.value) ocrInput.value = '';
          } else if (ocrInput) {
            ocrInput.disabled = false;
            ocrInput.removeAttribute('disabled');
            ocrInput.removeAttribute('readonly');
            ocrInput.style.pointerEvents = '';
            ocrInput.style.opacity = '';
          }
          
          // Disable all model checkboxes with stronger disable
          ['img_0', 'img_1', 'img_2', 'img_3', 'img_4', 'img_5', 'txt_0', 'txt_1'].forEach(modelPrefix => {
            const checkbox = document.querySelector(`#${modelPrefix}_${queryNum}`);
            if (checkbox) {
              checkbox.disabled = true;
              checkbox.setAttribute('disabled', 'disabled');
              checkbox.style.pointerEvents = 'none';
              checkbox.style.opacity = '0.5';
              if (checkbox.checked) {
                checkbox.checked = false;
                checkbox.removeAttribute('checked');
              }
            }
          });
        });
        
        // Also disable models without temporal suffix (if any exist)
        document.querySelectorAll('input[type="checkbox"][id^="img_"], input[type="checkbox"][id^="txt_"]').forEach(checkbox => {
          if (!checkbox.id.includes('_1') && !checkbox.id.includes('_2') && !checkbox.id.includes('_3')) {
            checkbox.disabled = true;
            checkbox.setAttribute('disabled', 'disabled');
            checkbox.style.pointerEvents = 'none';
            checkbox.style.opacity = '0.5';
            if (checkbox.checked) {
              checkbox.checked = false;
              checkbox.removeAttribute('checked');
            }
          }
        });
        
        // Keep main queries enabled
        [1, 2, 3].forEach(queryNum => {
          const queryInput = document.querySelector(`#q${queryNum}`);
          if (queryInput) {
            queryInput.disabled = false;
            queryInput.removeAttribute('disabled');
          }
        });
        
      } else if (activeMode === 'temporal_models') {
        // TEMPORAL MODELS MODE: Only OCR + Models + queries allowed
        
        // Disable all filter widgets
        document.querySelectorAll('.filter-widget input').forEach(input => {
          input.disabled = true;
          if (input.value) input.value = '';
        });
        document.querySelectorAll('.filter-widget .filter-output').forEach(output => {
          if (output.textContent) output.textContent = '';
        });
        
        // Keep main queries enabled
        [1, 2, 3].forEach(queryNum => {
          const queryInput = document.querySelector(`#q${queryNum}`);
          if (queryInput) {
            queryInput.disabled = false;
            queryInput.removeAttribute('disabled');
          }
        });
        
      } else {
        // TEMPORAL MODE: Nothing active - all enabled
        // All controls already enabled from reset above
      }
      
    } else {
      // === SINGLE MODE: Original 3-way logic ===
      
      // ALWAYS ensure the search button is enabled if there's OCR content
      const ocrInput = document.querySelector('#qOCR');
      const hasOCRContent = ocrInput && ocrInput.value.trim() !== '';
      
      if (hasOCRContent) {
        const searchButton = document.querySelector('.search-btn');
        if (searchButton) {
          searchButton.disabled = false;
          searchButton.removeAttribute('disabled');
          searchButton.classList.remove('search-disabled');
          searchButton.title = 'Search with OCR';
        }
      }
      
      if (validationState.hasToolContent) {
        // FILTERS ACTIVE: Disable everything except main query
        
        // Disable OCR, ASR, all models with stronger disable
          document.querySelectorAll('#qOCR, #qASR, #vid_0, #img_0, #img_1, #img_2, #img_3, #img_4, #img_5, #txt_0, #txt_1').forEach(el => {
          if (el) {
            el.disabled = true;
            el.setAttribute('disabled', 'disabled');
            if (el.type === 'checkbox') {
              if (el.checked) {
                el.checked = false;
                el.removeAttribute('checked');
              }
              // Prevent clicking
              el.style.pointerEvents = 'none';
              el.style.opacity = '0.5';
            }
            if (el.type === 'text') {
              if (el.value) el.value = '';
              el.setAttribute('readonly', 'readonly');
              el.style.pointerEvents = 'none';
              el.style.opacity = '0.5';
            }
          }
        });
        
        // Keep main query enabled
        const mainQuery = document.querySelector('#qMain');
        if (mainQuery) {
          mainQuery.disabled = false;
          mainQuery.removeAttribute('disabled');
        }
        
      } else if (validationState.hasNonQueryContent) {
        // NON-QUERY CONTROLS ACTIVE: Disable filters + apply mode restrictions
        
        // Disable filters
        document.querySelectorAll('.filter-widget input').forEach(input => {
          input.disabled = true;
          if (input.value) input.value = '';
        });
        document.querySelectorAll('.filter-widget .filter-output').forEach(output => {
          if (output.textContent) output.textContent = '';
        });
        
        // Apply original mode restrictions
        if (activeMode === 1) {
          // Mode 1: Only ASR + Video allowed
          document.querySelectorAll('#qOCR, #img_0, #img_1, #img_2, #img_3, #img_4, #img_5, #txt_0, #txt_1').forEach(el => {
            if (el) {
              el.disabled = true;
              if (el.type === 'checkbox' && el.checked) el.checked = false;
              if (el.type === 'text' && el.value) el.value = '';
            }
          });
          
        } else if (activeMode === 2) {
          // Mode 2: Only OCR + Models allowed  
          document.querySelectorAll('#qASR, #vid_0').forEach(el => {
            if (el) {
              el.disabled = true;
              if (el.type === 'checkbox' && el.checked) el.checked = false;
              if (el.type === 'text' && el.value) el.value = '';
            }
          });
        }
        
      } else {
        // SINGLE MODE: Nothing active - all enabled
        // All controls already enabled from reset above
      }
    }
  }, 100);

  // Bind to all inputs
  const bindAllInputs = () => {
    // Main query inputs (should NOT trigger restrictions)
    ['qMain', 'q1', 'q2', 'q3'].forEach(id => {
      const input = document.querySelector(`#${id}`);
      
      if (input) {
        // Main queries affect validation but don't automatically enable search
        const handleMainQuery = () => {
          // Update search button state to check if models are selected
          if (typeof window.updateSearchButtonState === 'function') {
            window.updateSearchButtonState();
          }
        };
        
        input.addEventListener('input', handleMainQuery);
        activeEventListeners.push(
          { element: input, event: 'input', handler: handleMainQuery }
        );
      }
    });
    
    // OCR, ASR inputs (trigger validation)
    ['qOCR', 'qASR'].forEach(id => {
      const input = document.querySelector(`#${id}`);
      if (input) {
        // Add Enter key support for OCR and ASR inputs
        const handleKeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const searchBtn = document.querySelector('#btnSearch');
            if (searchBtn && !searchBtn.disabled) {
              searchBtn.click();
            }
          }
        };
        
        // Enhanced input handler for ASR and OCR to improve real-time interactions
        const handleInput = (e) => {
          // Update the validation state immediately for this field
          if (id === 'qASR') {
            // For ASR field, immediately update its content status
            const hasContent = e.target.value.trim() !== '';
            validationState.hasASRContent = hasContent;
            
            // Enable/disable OCR field based on ASR content
            const ocrInput = document.querySelector('#qOCR');
            if (ocrInput) {
              if (hasContent) {
                // If ASR has content, disable OCR
                ocrInput.disabled = true;
                ocrInput.setAttribute('disabled', 'disabled');
                ocrInput.setAttribute('readonly', 'readonly');
                ocrInput.style.pointerEvents = 'none';
                ocrInput.style.opacity = '0.5';
              } else {
                // If ASR is empty, enable OCR
                ocrInput.disabled = false;
                ocrInput.removeAttribute('disabled');
                ocrInput.removeAttribute('readonly');
                ocrInput.style.pointerEvents = '';
                ocrInput.style.opacity = '';
              }
            }
            
            // ASR should only disable image models and OCR, not the main query
            if (hasContent) {
              // If ASR has content, disable all image model checkboxes
              document.querySelectorAll('input[id^="img_"]').forEach(checkbox => {
                checkbox.disabled = true;
                checkbox.setAttribute('disabled', 'disabled');
                checkbox.style.pointerEvents = 'none';
                checkbox.style.opacity = '0.5';
                // Do not uncheck models automatically - let the user keep their selection
              });
            } else {
              // If ASR is empty, re-enable image models (unless OCR is active)
              if (!validationState.hasOCRContent) {
                document.querySelectorAll('input[id^="img_"]').forEach(checkbox => {
                  checkbox.disabled = false;
                  checkbox.removeAttribute('disabled');
                  checkbox.style.pointerEvents = '';
                  checkbox.style.opacity = '';
                });
              }
            }
          } else if (id === 'qOCR') {
            // For OCR field, immediately update its content status
            const hasContent = e.target.value.trim() !== '';
            validationState.hasOCRContent = hasContent;
            
            // Immediately enable search button if OCR has content
            if (hasContent) {
              const searchButton = document.querySelector('.search-btn');
              if (searchButton) {
                searchButton.disabled = false;
                searchButton.removeAttribute('disabled');
                searchButton.classList.remove('search-disabled');
                searchButton.title = 'Search with OCR';
              }
            }
            
            // Enable/disable ASR field based on OCR content
            const asrInput = document.querySelector('#qASR');
            if (asrInput) {
              if (hasContent) {
                // If OCR has content, disable ASR
                asrInput.disabled = true;
                asrInput.setAttribute('disabled', 'disabled');
                asrInput.setAttribute('readonly', 'readonly');
                asrInput.style.pointerEvents = 'none';
                asrInput.style.opacity = '0.5';
              } else {
                // If OCR is empty, enable ASR
                asrInput.disabled = false;
                asrInput.removeAttribute('disabled');
                asrInput.removeAttribute('readonly');
                asrInput.style.pointerEvents = '';
                asrInput.style.opacity = '';
              }
            }
            
            // OCR should be usable independently, regardless of model selection
            if (hasContent) {
              // When OCR has content, enable image models but don't require them
              document.querySelectorAll('input[id^="img_"]').forEach(checkbox => {
                checkbox.disabled = false;
                checkbox.removeAttribute('disabled');
                checkbox.style.pointerEvents = '';
                checkbox.style.opacity = '';
              });
              
              // Disable ASR and video model
              document.querySelector('#vid_0').disabled = true;
              document.querySelector('#vid_0').setAttribute('disabled', 'disabled');
              document.querySelector('#vid_0').style.pointerEvents = 'none';
              document.querySelector('#vid_0').style.opacity = '0.5';
            } else {
              // If OCR is empty, check if ASR is active to determine model state
              if (!validationState.hasASRContent) {
                // Enable all checkboxes if neither OCR nor ASR has content
                document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                  if (checkbox.id !== 'chkTemporal') {
                    checkbox.disabled = false;
                    checkbox.removeAttribute('disabled');
                    checkbox.style.pointerEvents = '';
                    checkbox.style.opacity = '';
                  }
                });
              }
            }
          }
          
          // Then run the normal debounced update
          debouncedUpdateControls();
          
          // Also update search button state immediately
          if (typeof window.updateSearchButtonState === 'function') {
            window.updateSearchButtonState();
          }
        };
        
        input.addEventListener('input', handleInput);
        input.addEventListener('keydown', handleKeydown);
        activeEventListeners.push(
          { element: input, event: 'input', handler: handleInput },
          { element: input, event: 'keydown', handler: handleKeydown }
        );
      }
    });
    // Single mode checkboxes
    ['img_0', 'img_1', 'img_2', 'img_3', 'img_4', 'img_5', 'vid_0', 'txt_0', 'txt_1'].forEach(id => {
      const checkbox = document.querySelector(`#${id}`);
      if (checkbox) {
        // Enhanced checkbox handler for immediate response
        const handleModelChange = (e) => {
          if (id === 'vid_0') {
            // Video/ASR model checkbox change
            const isChecked = e.target.checked;
            validationState.hasVideoChecked = isChecked;
            
            // Enable/disable image models and OCR based on ASR/video selection
            if (isChecked || validationState.hasASRContent) {
              // If ASR/video is selected, disable OCR and image models
              document.querySelectorAll('#qOCR, input[id^="img_"]').forEach(el => {
                if (el) {
                  el.disabled = true;
                  el.setAttribute('disabled', 'disabled');
                  if (el.type === 'text') {
                    el.setAttribute('readonly', 'readonly');
                    el.style.pointerEvents = 'none';
                    el.style.opacity = '0.5';
                  }
                }
              });
              
              // Don't automatically uncheck image models - just disable them
              // This way when switching back, user selections are preserved
              
              // Main query should still be enabled
              const mainQuery = document.querySelector('#qMain');
              if (mainQuery) {
                mainQuery.disabled = false;
                mainQuery.removeAttribute('disabled');
                mainQuery.style.pointerEvents = '';
                mainQuery.style.opacity = '';
              }
            } else {
              // If ASR/video is unselected, enable OCR and image models
              document.querySelectorAll('#qOCR, input[id^="img_"]').forEach(el => {
                if (el) {
                  el.disabled = false;
                  el.removeAttribute('disabled');
                  if (el.type === 'text') {
                    el.removeAttribute('readonly');
                    el.style.pointerEvents = '';
                    el.style.opacity = '';
                  }
                }
              });
            }
          } else if (id.startsWith('img_')) {
            // Image model checkbox change
            const anyImageSelected = document.querySelectorAll('input[id^="img_"]:checked').length > 0;
            validationState.hasImageChecked = anyImageSelected;
            
            // Enable/disable ASR/video based on image model selection
            if (anyImageSelected || validationState.hasOCRContent) {
              // If any image model is selected or OCR has content, disable ASR/video
              document.querySelectorAll('#qASR, #vid_0').forEach(el => {
                if (el) {
                  el.disabled = true;
                  el.setAttribute('disabled', 'disabled');
                  if (el.type === 'text') {
                    el.setAttribute('readonly', 'readonly');
                    el.style.pointerEvents = 'none';
                    el.style.opacity = '0.5';
                  }
                }
              });
              
              // Don't automatically uncheck video model - just disable it
              // This preserves user selections when switching back
              
              // Main query should still be enabled
              const mainQuery = document.querySelector('#qMain');
              if (mainQuery) {
                mainQuery.disabled = false;
                mainQuery.removeAttribute('disabled');
                mainQuery.style.pointerEvents = '';
                mainQuery.style.opacity = '';
              }
            } else {
              // If no image model is selected and OCR is empty, enable ASR/video
              document.querySelectorAll('#qASR, #vid_0').forEach(el => {
                if (el) {
                  el.disabled = false;
                  el.removeAttribute('disabled');
                  if (el.type === 'text') {
                    el.removeAttribute('readonly');
                    el.style.pointerEvents = '';
                    el.style.opacity = '';
                  }
                }
              });
            }
          }
          
          // Run normal update
          debouncedUpdateControls();
          
          // Also update search button state immediately
          if (typeof window.updateSearchButtonState === 'function') {
            window.updateSearchButtonState();
          }
        };
        
        checkbox.addEventListener('change', handleModelChange);
        activeEventListeners.push({ element: checkbox, event: 'change', handler: handleModelChange });
      }
    });
    
    // Temporal mode inputs with enhanced real-time feedback
    [1, 2, 3].forEach(queryNum => {
      // Add event handlers for temporal query inputs (q1, q2, q3)
      const queryInput = document.querySelector(`#q${queryNum}`);
      if (queryInput) {
        // Enhanced input handler for temporal query inputs
        const handleTemporalQueryInput = (e) => {
          // Update search button state based on input and model selection
          updateModelStates();
          
          // Update the search button state immediately
          if (typeof window.updateSearchButtonState === 'function') {
            window.updateSearchButtonState();
          }
        };
        
        queryInput.addEventListener('input', handleTemporalQueryInput);
        activeEventListeners.push(
          { element: queryInput, event: 'input', handler: handleTemporalQueryInput }
        );
      }
      
      // Add event handlers for temporal OCR inputs
      const ocrInput = document.querySelector(`#q${queryNum}ocr`);
      if (ocrInput) {
        // Add Enter key support for temporal OCR inputs
        const handleKeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const searchBtn = document.querySelector('#btnSearch');
            if (searchBtn && !searchBtn.disabled) {
              searchBtn.click();
            }
          }
        };
        
        // Enhanced input handler for temporal OCR inputs
        const handleTemporalOCRInput = (e) => {
          // Update OCR content state for validation
          updateModelStates();
          
          // If OCR has content, immediately enable search button
          const hasContent = e.target.value.trim() !== '';
          if (hasContent) {
            const searchButton = document.querySelector('.search-btn');
            if (searchButton) {
              searchButton.disabled = false;
              searchButton.removeAttribute('disabled');
              searchButton.classList.remove('search-disabled');
              searchButton.title = 'Search with OCR';
            }
          }
          
          // Immediately update search button based on OCR content
          if (typeof window.updateSearchButtonState === 'function') {
            window.updateSearchButtonState();
          }
        };
        
        ocrInput.addEventListener('input', handleTemporalOCRInput);
        ocrInput.addEventListener('keydown', handleKeydown);
        activeEventListeners.push(
          { element: ocrInput, event: 'input', handler: handleTemporalOCRInput },
          { element: ocrInput, event: 'keydown', handler: handleKeydown }
        );
      }
      
      // Add model checkboxes for each temporal column
      ['img_0', 'img_1', 'img_2', 'img_3', 'img_4', 'img_5', 'txt_0', 'txt_1'].forEach(modelPrefix => {
        const checkbox = document.querySelector(`#${modelPrefix}_${queryNum}`);
        if (checkbox) {
          // Enhanced checkbox handler for temporal mode
          const handleTemporalModelChange = (e) => {
            // Update validation states
            updateModelStates();
            
            // Immediately update search button based on model selection
            if (typeof window.updateSearchButtonState === 'function') {
              window.updateSearchButtonState();
            }
          };
          
          checkbox.addEventListener('change', handleTemporalModelChange);
          activeEventListeners.push({ element: checkbox, event: 'change', handler: handleTemporalModelChange });
        }
      });
    });
    
    // Filter widgets
    document.querySelectorAll('.filter-widget').forEach(widget => {
      const input = widget.querySelector('.filter-input');
      const output = widget.querySelector('.filter-output');
      
      if (input) {
        input.addEventListener('input', debouncedUpdateControls);
        input.addEventListener('change', debouncedUpdateControls);
        activeEventListeners.push(
          { element: input, event: 'input', handler: debouncedUpdateControls },
          { element: input, event: 'change', handler: debouncedUpdateControls }
        );
      }
      
      // Watch for output changes using MutationObserver
      if (output) {
        const observer = new MutationObserver(() => {
          debouncedUpdateControls();
        });
        observer.observe(output, { childList: true, subtree: true, characterData: true });
        activeObservers.push(observer);
      }
    });
    
    // Temporal mode toggle with immediate validation
    const temporalToggle = document.getElementById('chkTemporal');
    if (temporalToggle) {
      const handleTemporalToggle = () => {
        // IMMEDIATE validation update when switching modes
        setTimeout(() => {
          // Ensure OCR inputs are always enabled when switching modes
          const isNowTemporalMode = document.getElementById('chkTemporal')?.checked || false;
          
          if (isNowTemporalMode) {
            // Switching to temporal mode - enable all temporal OCR inputs
            [1, 2, 3].forEach(queryNum => {
              const ocrInput = document.querySelector(`#q${queryNum}ocr`);
              if (ocrInput) {
                ocrInput.disabled = false;
                ocrInput.removeAttribute('disabled');
                ocrInput.removeAttribute('readonly');
                ocrInput.style.pointerEvents = '';
                ocrInput.style.opacity = '';
              }
            });
          } else {
            // Switching to single mode - enable the OCR input
            const ocrInput = document.querySelector('#qOCR');
            if (ocrInput) {
              ocrInput.disabled = false;
              ocrInput.removeAttribute('disabled');
              ocrInput.removeAttribute('readonly');
              ocrInput.style.pointerEvents = '';
              ocrInput.style.opacity = '';
            }
          }
          
          // Ensure validation is updated
          debouncedUpdateControls();
          
          // Force search button update
          if (typeof window.updateSearchButtonState === 'function') {
            window.updateSearchButtonState();
          }
        }, 300); // Longer delay to ensure DOM is updated
      };
      
      temporalToggle.addEventListener('change', handleTemporalToggle);
      activeEventListeners.push({ 
        element: temporalToggle, 
        event: 'change', 
        handler: handleTemporalToggle 
      });
    }
  };
  
  bindAllInputs();
}

// Ensure debouncedUpdateControls exists to avoid ReferenceError when other modules call it
if (typeof window !== 'undefined' && typeof window.debouncedUpdateControls === 'undefined') {
  window.debouncedUpdateControls = function() {
    // no-op fallback — override elsewhere with real implementation if needed
  };
}

/**
 * Cleanup existing event listeners and timers
 */
function cleanup() {
  activeTimers.forEach(timer => clearInterval(timer));
  activeTimers = [];
  
  activeObservers.forEach(observer => observer.disconnect());
  activeObservers = [];
  
  activeEventListeners.forEach(({ element, event, handler }) => {
    element.removeEventListener(event, handler);
  });
  activeEventListeners = [];
}

/**
 * Re-initialize all input handling
 */
export function reinitializeInputHandling() {
  if (isInitialized) {
    cleanup();
    isInitialized = false;
  }
  
  // First, ensure all OCR inputs are enabled before initializing
  const isTemporalMode = document.getElementById('chkTemporal')?.checked || false;
  
  if (isTemporalMode) {
    // Temporal mode: enable all temporal OCR inputs
    [1, 2, 3].forEach(queryNum => {
      const ocrInput = document.querySelector(`#q${queryNum}ocr`);
      if (ocrInput) {
        ocrInput.disabled = false;
        ocrInput.removeAttribute('disabled');
        ocrInput.removeAttribute('readonly');
        ocrInput.style.pointerEvents = '';
        ocrInput.style.opacity = '';
      }
    });
  } else {
    // Single mode: enable the OCR input
    const ocrInput = document.querySelector('#qOCR');
    if (ocrInput) {
      ocrInput.disabled = false;
      ocrInput.removeAttribute('disabled');
      ocrInput.removeAttribute('readonly');
      ocrInput.style.pointerEvents = '';
      ocrInput.style.opacity = '';
    }
  }
  
  initializeInputHandling();
}

/**
 * Initialize the input handling
 */
export function initializeInputHandling() {
  if (isInitialized) return;
  
  whenDOMReady(() => {
    setTimeout(() => {
      // First, ensure OCR inputs are always enabled
      const isTemporalMode = document.getElementById('chkTemporal')?.checked || false;
      if (isTemporalMode) {
        [1, 2, 3].forEach(queryNum => {
          const ocrInput = document.querySelector(`#q${queryNum}ocr`);
          if (ocrInput) {
            ocrInput.disabled = false;
            ocrInput.removeAttribute('disabled');
            ocrInput.removeAttribute('readonly');
            ocrInput.style.pointerEvents = '';
            ocrInput.style.opacity = '';
          }
        });
      } else {
        const ocrInput = document.querySelector('#qOCR');
        if (ocrInput) {
          ocrInput.disabled = false;
          ocrInput.removeAttribute('disabled');
          ocrInput.removeAttribute('readonly');
          ocrInput.style.pointerEvents = '';
          ocrInput.style.opacity = '';
        }
      }
      
      handleToolsValidation();
      
      // Clear button handling
      const clearButton = document.querySelector('.clear-btn');
      if (clearButton) {
        const handleClear = () => {
          // === 1. CLEAR ALL TEXT INPUTS ===
          // Clear main query, OCR, ASR in single mode
          const mainQuery = document.querySelector('#qMain');
          const ocrInput = document.querySelector('#qOCR');
          const asrInput = document.querySelector('#qASR');
          
          // Reset validation state immediately
          validationState.hasASRContent = false;
          validationState.hasOCRContent = false;
          
          // Enable all fields first
          document.querySelectorAll('input').forEach(input => {
            if (input.id !== 'chkTemporal') {
              input.disabled = false;
              input.removeAttribute('disabled');
              input.removeAttribute('readonly');
              input.style.pointerEvents = '';
              input.style.opacity = '';
            }
          });
          
          if (mainQuery) {
            mainQuery.value = '';
            mainQuery.disabled = false;
            mainQuery.removeAttribute('disabled');
          }
          
          if (ocrInput) {
            ocrInput.value = '';
            ocrInput.disabled = false;
            ocrInput.removeAttribute('disabled');
            ocrInput.removeAttribute('readonly');
            ocrInput.style.pointerEvents = '';
            ocrInput.style.opacity = '';
          }
          
          if (asrInput) {
            asrInput.value = '';
            asrInput.disabled = false;
            asrInput.removeAttribute('disabled');
            asrInput.removeAttribute('readonly');
            asrInput.style.pointerEvents = '';
            asrInput.style.opacity = '';
          }
          
          // Clear temporal mode queries (q1, q2, q3) and OCR inputs
          [1, 2, 3].forEach(queryNum => {
            const queryInput = document.querySelector(`#q${queryNum}`);
            const temporalOCR = document.querySelector(`#q${queryNum}ocr`);
            
            if (queryInput) {
              queryInput.value = '';
              queryInput.disabled = false;
              queryInput.removeAttribute('disabled');
            }
            
            if (temporalOCR) {
              temporalOCR.value = '';
              temporalOCR.disabled = false;
              temporalOCR.removeAttribute('disabled');
              temporalOCR.removeAttribute('readonly');
            }
          });
          
          // Clear any other text inputs
          document.querySelectorAll('input[type="text"]').forEach(input => {
            if (input.id !== 'chkTemporal' && !['qMain', 'qOCR', 'qASR', 'q1', 'q2', 'q3', 'q1ocr', 'q2ocr', 'q3ocr'].includes(input.id)) {
              input.value = '';
              input.disabled = false;
              input.removeAttribute('disabled');
              input.removeAttribute('readonly');
            }
          });
          
          // === 2. UNCHECK ALL CHECKBOXES ===
          document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            if (checkbox.id !== 'chkTemporal') {
              checkbox.checked = false;
              checkbox.disabled = false;
              checkbox.removeAttribute('disabled');
              checkbox.removeAttribute('checked');
            }
          });
          
          // === 3. CLEAR FILTER WIDGETS ===
          document.querySelectorAll('.filter-widget').forEach(widget => {
            const input = widget.querySelector('.filter-input');
            const output = widget.querySelector('.filter-output');
            if (input) {
              input.value = '';
              input.disabled = false;
              input.removeAttribute('disabled');
              input.removeAttribute('readonly');
            }
            if (output) output.textContent = '';
          });
          
          // === 4. DO NOT CLEAR PANELS OR SEARCH RESULTS ===
          // Preserve all panels and search results when clearing inputs
          
          // Save search state flags
          const savedHasSearched = store.hasSearched;
          const savedSearchResults = store.searchResults;
          const savedSearchCriteria = store.searchCriteria;
          const savedPanelResults = store.panelResults;
          const savedActivePanels = store.activePanels;
          
          // Keep search results visible - do not modify the DOM
          
          // Restore search results to keep images displayed
          store.hasSearched = savedHasSearched;
          store.searchResults = savedSearchResults;
          store.searchCriteria = savedSearchCriteria;
          store.panelResults = savedPanelResults;
          store.activePanels = savedActivePanels;
          
          // === 5. RESET VALIDATION STATE ===
          validationState.hasASRContent = false;
          validationState.hasVideoChecked = false;
          validationState.hasOCRContent = false;
          validationState.hasImageChecked = false;
          validationState.hasToolContent = false;
          validationState.hasNonQueryContent = false;
          
          // === 6. FORCE VALIDATION UPDATE ===
          setTimeout(() => {
            debouncedUpdateControls();
          }, 50);
        };
        
        clearButton.addEventListener('click', handleClear);
        activeEventListeners.push({ element: clearButton, event: 'click', handler: handleClear });
      }
      
      isInitialized = true;
      
      // INITIAL VALIDATION after everything is set up
      setTimeout(() => {
        debouncedUpdateControls();
        
        // Also ensure search button is updated
        if (typeof window.updateSearchButtonState === 'function') {
          window.updateSearchButtonState();
        }
      }, 200);
    }, 100);
  });
}
