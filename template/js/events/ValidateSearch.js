/**
 * ValidateSearch.js
 * Logic for validating search criteria and enabling/disabling the search button.
 */

/**
 * Validates if the search button should be enabled based on selected models
 * At least one image model needs to be selected
 * @returns {boolean} True if search should be enabled, false otherwise
 */
export function validateSearchCriteria() {
    // Check if we're in temporal mode
    const isTemporalMode = document.getElementById('chkTemporal')?.checked || false;
    
    // ✅ CHECK FOR IMAGE QUERY FIRST
    const hasImageQuery = () => {
        if (isTemporalMode) {
            return [1, 2, 3].some(queryNum => {
                const queryInput = document.querySelector(`#q${queryNum}`);
                return queryInput?.dataset?.imageId;
            });
        } else {
            const mainQuery = document.querySelector('#qMain');
            return mainQuery?.dataset?.imageId ? true : false;
        }
    };
    
    // ✅ IF IMAGE QUERY EXISTS, ALWAYS VALID
    if (hasImageQuery()) {
        return true;
    }
    
    // Check if tools (filters) are being used
    const hasToolsContent = Array.from(document.querySelectorAll('.filter-widget')).some(widget => {
        const input = widget.querySelector('.filter-input');
        const output = widget.querySelector('.filter-output');
        const inputValue = input ? input.value.trim() : '';
        const outputValue = output ? output.textContent.trim() : '';
        return inputValue !== '' || outputValue !== '';
    });
    
    // Check if main queries have content
    const hasMainQueryContent = () => {
        if (isTemporalMode) {
            return [1, 2, 3].some(queryNum => {
                const queryInput = document.querySelector(`#q${queryNum}`);
                // ✅ Bỏ qua nếu đây là image query
                if (queryInput?.dataset?.imageId) return false;
                return queryInput && queryInput.value.trim() !== '';
            });
        } else {
            const mainQuery = document.querySelector('#qMain');
            // ✅ Bỏ qua nếu đây là image query
            if (mainQuery?.dataset?.imageId) return false;
            return mainQuery && mainQuery.value.trim() !== '';
        }
    };

    // Check if we have query content that requires model selection
    const mainQueryRequiresModel = hasMainQueryContent();
    
    // If tools are active, treat tools as a model - search always enabled
    if (hasToolsContent) {
        return true; // Tools count as a model, so search is always enabled
    }
    
    // In temporal mode
    if (isTemporalMode) {
        // Check if any models are selected across the three query columns
        const anyModelSelected = document.querySelectorAll('.option input[type="checkbox"]:checked').length > 0;
        
        // Check if any temporal OCR has content
        const hasTemporalOCRContent = [1, 2, 3].some(queryNum => {
            const ocrInput = document.querySelector(`#q${queryNum}ocr`);
            return ocrInput && ocrInput.value.trim() !== '';
        });
        
        // Check for any ASR-like content in temporal mode
        const hasTemporalASRContent = document.querySelector('#vid_0')?.checked || false;
        
        // ASR is independent - if active, enable search
        if (hasTemporalASRContent) {
            return true;
        }
        
        // OCR alone is independent - if content exists but NO query, enable search
        if (hasTemporalOCRContent && !mainQueryRequiresModel) {
            return true;
        }
        
        // Image models alone are independent - if selected, enable search
        if (anyModelSelected && !mainQueryRequiresModel && !hasTemporalOCRContent) {
            return true;
        }
        
        // If both OCR and query exist, models MUST be selected
        if (hasTemporalOCRContent && mainQueryRequiresModel) {
            return anyModelSelected; // Only enable if models are selected
        }
        
        // If only query content exists, models MUST be selected
        if (mainQueryRequiresModel) {
            return anyModelSelected;
        }
        
        // If nothing is entered or selected, disable search
        return false;
    }
    
    // For non-temporal mode (single mode)
    // Check if at least one image model is selected
    const imageModelsCheckboxes = document.querySelectorAll('input[id^="img_"]:checked');
    const imageModelSelected = imageModelsCheckboxes.length > 0;
    
    // Check if ASR input has content
    const asrInput = document.querySelector('#qASR');
    const hasASRContent = asrInput && asrInput.value.trim() !== '';
    
    // Check if OCR input has content
    const ocrInput = document.querySelector('#qOCR');
    const hasOCRContent = ocrInput && ocrInput.value.trim() !== '';
    
    // ASR is independent - if has content, enable search
    if (hasASRContent) {
        return true;
    }
    
    // OCR alone is independent - if content exists but NO query, enable search
    if (hasOCRContent && !mainQueryRequiresModel) {
        return true;
    }
    
    // Image models alone are independent - if selected, enable search
    if (imageModelSelected && !mainQueryRequiresModel && !hasOCRContent) {
        return true;
    }
    
    // Important case: If both OCR has content AND query exists, then models MUST be selected
    if (hasOCRContent && mainQueryRequiresModel) {
        return imageModelSelected; // Only enable if models are selected
    }
    
    // If only query content exists, models MUST be selected
    if (mainQueryRequiresModel) {
        return imageModelSelected;
    }
    
    // If nothing is entered or selected, disable search
    return false;
}

/**
 * Updates the search button state based on current selections
 * Enhanced for immediate response to input changes
 */
export function updateSearchButtonState() {
    // Make this function globally accessible for cross-module calls
    if (typeof window !== 'undefined') {
        window.updateSearchButtonState = updateSearchButtonState;
    }
    const searchButton = document.querySelector('.search-btn');
    if (!searchButton) {
        console.error('Search button not found!');
        return;
    }
    
    // Check if we're in temporal mode
    const isTemporalMode = document.getElementById('chkTemporal')?.checked || false;
    let hasOCRContent = false;
    
    // ✅ CHECK FOR IMAGE QUERY
    const hasImageQuery = () => {
        if (isTemporalMode) {
            return [1, 2, 3].some(queryNum => {
                const queryInput = document.querySelector(`#q${queryNum}`);
                return queryInput?.dataset?.imageId;
            });
        } else {
            const mainQuery = document.querySelector('#qMain');
            return mainQuery?.dataset?.imageId ? true : false;
        }
    };
    const imageQueryExists = hasImageQuery();
    
    // ✅ IF IMAGE QUERY EXISTS, ENABLE SEARCH IMMEDIATELY
    if (imageQueryExists) {
        searchButton.disabled = false;
        searchButton.removeAttribute('disabled');
        searchButton.classList.remove('search-disabled');
        searchButton.style.pointerEvents = 'auto';
        searchButton.title = 'Search with image';
        
        // Ensure click handler is attached
        if (typeof window.headerCallbacks !== 'undefined' && window.headerCallbacks.onSearch) {
            const clickHandler = (e) => {
                e.stopPropagation();
                window.headerCallbacks.onSearch(searchButton);
            };
            
            if (searchButton._clickHandler) {
                searchButton.removeEventListener('click', searchButton._clickHandler);
            }
            searchButton.addEventListener('click', clickHandler);
            searchButton._clickHandler = clickHandler;
        }
        
        return;
    }
    
    // Check if there's query content that would require model selection
    const hasMainQueryContent = () => {
        if (isTemporalMode) {
            return [1, 2, 3].some(queryNum => {
                const queryInput = document.querySelector(`#q${queryNum}`);
                // ✅ Bỏ qua nếu đây là image query
                if (queryInput?.dataset?.imageId) return false;
                return queryInput && queryInput.value.trim() !== '';
            });
        } else {
            const mainQuery = document.querySelector('#qMain');
            // ✅ Bỏ qua nếu đây là image query
            if (mainQuery?.dataset?.imageId) return false;
            return mainQuery && mainQuery.value.trim() !== '';
        }
    };
    const mainQueryExists = hasMainQueryContent();
    
    if (isTemporalMode) {
        // Check temporal OCR inputs
        hasOCRContent = [1, 2, 3].some(queryNum => {
            const ocrInput = document.querySelector(`#q${queryNum}ocr`);
            return ocrInput && ocrInput.value.trim() !== '';
        });
    } else {
        // Check single mode OCR input
        const ocrInput = document.querySelector('#qOCR');
        hasOCRContent = ocrInput && ocrInput.value.trim() !== '';
    }
    
    // Check if any models are selected
    const anyModelSelected = document.querySelectorAll('.option input[type="checkbox"]:checked').length > 0;
    
    // If OCR has content AND no query is entered, enable the search button
    // Otherwise, if query exists, models must be selected
    if (hasOCRContent && !mainQueryExists) {
        searchButton.disabled = false;
        searchButton.removeAttribute('disabled');
        searchButton.classList.remove('search-disabled');
        searchButton.title = 'Search with OCR';
        return;
    }
    
    // If OCR has content AND query is entered but no models selected, disable search
    if (hasOCRContent && mainQueryExists && !anyModelSelected) {
        searchButton.disabled = true;
        searchButton.setAttribute('disabled', 'disabled');
        searchButton.classList.add('search-disabled');
        searchButton.title = 'Please select at least one model when using both OCR and query';
        return;
    }
    
    // Force the button to have the correct pointer-events style
    searchButton.style.pointerEvents = searchButton.disabled ? 'none' : 'auto';
    
    const isValid = validateSearchCriteria();
    
    // In the case shown in the image, models are selected in temporal mode
    // We should treat this as valid and enable the button
    const anyCheckboxSelected = document.querySelectorAll('.option input[type="checkbox"]:checked').length > 0;
    
    // Set search button state immediately - no delay
    searchButton.disabled = !isValid;
    searchButton.classList.toggle('search-disabled', !isValid);
    
    if (isValid) {
        searchButton.removeAttribute('disabled');
        searchButton.title = 'Search';
    } else {
        searchButton.setAttribute('disabled', 'disabled');
        searchButton.title = 'Please select at least one model or enter ASR text';
    }
    
    // Check if any temporal OCR has content
    const hasTemporalOCRContent = [1, 2, 3].some(queryNum => {
        const ocrInput = document.querySelector(`#q${queryNum}ocr`);
        return ocrInput && ocrInput.value.trim() !== '' && !ocrInput.disabled;
    });
    
    // Use the same validation logic for both temporal and non-temporal modes
    searchButton.disabled = !isValid;
    
    // Add visual feedback for disabled state with more specific messages
    if (isValid) {
        searchButton.classList.remove('search-disabled');
        searchButton.style.pointerEvents = 'auto';
        
        // Ensure click handler is properly attached
        if (typeof window.headerCallbacks !== 'undefined' && window.headerCallbacks.onSearch) {
            const clickHandler = (e) => {
                e.stopPropagation();
                window.headerCallbacks.onSearch(searchButton);
            };
            
            // Remove old handler and add new one
            if (searchButton._clickHandler) {
                searchButton.removeEventListener('click', searchButton._clickHandler);
            }
            searchButton.addEventListener('click', clickHandler);
            searchButton._clickHandler = clickHandler;
        }
        
        // More descriptive tooltip based on what's active
        if (mainQueryExists && anyCheckboxSelected) {
            searchButton.title = 'Search with query and selected models';
        } else if (hasOCRContent && !mainQueryExists) {
            searchButton.title = 'Search with OCR content';
        } else if (anyCheckboxSelected && !mainQueryExists) {
            searchButton.title = 'Search with selected models';
        } else {
            searchButton.title = 'Search with selected options';
        }
    } else {
        searchButton.classList.add('search-disabled');
        
        // More descriptive error message based on what's missing
        if (mainQueryExists && hasOCRContent && !anyCheckboxSelected) {
            searchButton.title = 'When using both query and OCR, you must select at least one model';
        } else if (mainQueryExists && !anyCheckboxSelected) {
            searchButton.title = 'When entering a query, you must select at least one model';
        } else {
            searchButton.title = 'Select at least one model or enter OCR content to search';
        }
    }
}
/**
 * Initialize search validation by adding listeners to relevant controls
 */
export function initializeSearchValidation() {
    // Initial check for search button
    const searchButton = document.querySelector('.search-btn');
    
    if (searchButton) {
        // Immediately disable the button and add disabled class
        searchButton.disabled = true;
        searchButton.classList.add('search-disabled');
        searchButton.title = 'Select at least one model or enter OCR content to search';
        
        // Use MutationObserver to ensure the button stays disabled
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'disabled') {
                    // If something tries to enable the button, check if it should really be enabled
                    if (!searchButton.disabled) {
                        const shouldBeEnabled = validateSearchCriteria();
                        if (!shouldBeEnabled) {
                            searchButton.disabled = true;
                            searchButton.classList.add('search-disabled');
                        }
                    }
                }
            });
        });
        
        observer.observe(searchButton, { attributes: true });
        
        // Initial state check
        updateSearchButtonState();
    }
    
    // Add global document event listener for any checkbox change
    document.addEventListener('change', (e) => {
        if (e.target && e.target.type === 'checkbox') {
            updateSearchButtonState();
        }
    });
    
    // Add specific listeners for temporal mode checkboxes (with _1, _2, _3 suffix)
    document.querySelectorAll('input[id$="_1"], input[id$="_2"], input[id$="_3"]').forEach(checkbox => {
        if (checkbox) {
            checkbox.addEventListener('change', () => {
                // Force update search button for temporal mode
                const searchBtn = document.querySelector('.search-btn');
                if (searchBtn) {
                    searchBtn.disabled = false;
                    searchBtn.classList.remove('search-disabled');
                }
            });
        }
    });
    
    // Add event listener to temporal mode checkbox
    const temporalCheckbox = document.getElementById('chkTemporal');
    if (temporalCheckbox) {
        temporalCheckbox.addEventListener('change', () => {
            // Use a slight delay to ensure the DOM has been updated with temporal mode changes
            setTimeout(updateSearchButtonState, 100);
        });
    }
    
    // Add event listener to ASR input
    const asrInput = document.querySelector('#qASR');
    if (asrInput) {
        asrInput.addEventListener('input', () => {
            updateSearchButtonState();
        });
    }
    
    // Add event listener to OCR input
    const ocrInput = document.querySelector('#qOCR');
    if (ocrInput) {
        ocrInput.addEventListener('input', () => {
            updateSearchButtonState();
        });
    }
    
    // Add event listeners to filter widgets (tools)
    document.querySelectorAll('.filter-widget').forEach((widget, widgetIndex) => {
        const input = widget.querySelector('.filter-input');
        if (input) {
            const handleFilterChange = () => {
                updateSearchButtonState();
            };
            
            input.addEventListener('input', handleFilterChange);
            input.addEventListener('change', handleFilterChange);
            input.addEventListener('keyup', handleFilterChange); // Extra listener
        }
        
        // Watch for output changes using MutationObserver
        const output = widget.querySelector('.filter-output');
        if (output) {
            const observer = new MutationObserver(() => {
                updateSearchButtonState();
            });
            observer.observe(output, { childList: true, subtree: true, characterData: true });
        }
        
        // Also watch for widget clicks that might trigger suggestions
        widget.addEventListener('click', () => {
            setTimeout(() => {
                updateSearchButtonState();
            }, 100);
        });
        
    });
    
    // Add event listeners to main query inputs
    ['qMain', 'q1', 'q2', 'q3'].forEach(id => {
        const input = document.querySelector(`#${id}`);
        if (input) {
            input.addEventListener('input', () => {
                updateSearchButtonState();
            });
            
            // Add Enter key handler for all main inputs
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const searchButton = document.querySelector('.search-btn');
                    if (searchButton && !searchButton.disabled && !searchButton.classList.contains('search-disabled')) {
                        if (window.headerCallbacks && window.headerCallbacks.onSearch) {
                            window.headerCallbacks.onSearch(searchButton);
                        }
                    }
                }
            });
        }
    });
    
    // Add event listeners to temporal OCR inputs (for completeness)
    [1, 2, 3].forEach(queryNum => {
        const ocrInput = document.querySelector(`#q${queryNum}ocr`);
        if (ocrInput) {
            ocrInput.addEventListener('input', () => {
                updateSearchButtonState();
            });
        }
    });
    
    // Re-validate on clear button click
    const clearButton = document.querySelector('.clear-btn');
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            setTimeout(updateSearchButtonState, 100);
        });
    }
    
    // Add listener for temporal mode switch to ensure OCR is properly handled
    const temporalSwitch = document.getElementById('chkTemporal');
    if (temporalSwitch) {
        temporalSwitch.addEventListener('change', () => {
            // Ensure OCR inputs are enabled when switching modes
            setTimeout(() => {
                if (temporalSwitch.checked) {
                    // Temporal mode - enable all OCR inputs
                    [1, 2, 3].forEach(queryNum => {
                        const ocrInput = document.querySelector(`#q${queryNum}ocr`);
                        if (ocrInput) {
                            ocrInput.disabled = false;
                            ocrInput.removeAttribute('disabled');
                        }
                    });
                } else {
                    // Single mode - enable the OCR input
                    const ocrInput = document.querySelector('#qOCR');
                    if (ocrInput) {
                        ocrInput.disabled = false;
                        ocrInput.removeAttribute('disabled');
                    }
                }
                updateSearchButtonState();
            }, 200);
        });
    }
    
    // ✅ THÊM LISTENER CHO IMAGE QUERY CHANGED EVENT
    document.addEventListener('imageQueryChanged', (e) => {
        console.log('🖼️ Image query changed:', e.detail);
        updateSearchButtonState();
    });
    
    // ✅ THÊM: Observe dataset changes cho query inputs (khi paste ảnh)
    ['qMain', 'q1', 'q2', 'q3'].forEach(id => {
        const input = document.querySelector(`#${id}`);
        if (input) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'data-image-id') {
                        console.log('🖼️ Image ID changed for', id);
                        updateSearchButtonState();
                    }
                });
            });
            
            observer.observe(input, { 
                attributes: true, 
                attributeFilter: ['data-image-id'] 
            });
        }
    });
    
    // Make sure we re-check validation after a slight delay to ensure DOM is ready
    setTimeout(() => {
        updateSearchButtonState();
        
        // Double-check search button state and ensure it's clickable
        const searchBtn = document.querySelector('.search-btn');
        if (searchBtn) {
            // Remove disabled attribute and class
            searchBtn.disabled = false;
            searchBtn.classList.remove('search-disabled');
            
            // Re-add click handler to ensure it works
            const existingHandler = searchBtn._clickHandler;
            if (existingHandler) {
                searchBtn.removeEventListener('click', existingHandler);
            }
            
            const clickHandler = (e) => {
                if (window.headerCallbacks && window.headerCallbacks.onSearch) {
                    window.headerCallbacks.onSearch(e.target);
                }
            };
            searchBtn.addEventListener('click', clickHandler);
            searchBtn._clickHandler = clickHandler; // Store for future cleanup
            
            // Add global keyboard handler for Enter key
            if (!window._hasEnterKeyHandler) {
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                        // Check if we're in an input and NOT in a textarea or contenteditable
                        const activeEl = document.activeElement;
                        const isInTextarea = activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('contenteditable') === 'true';
                        
                        if (!isInTextarea) {
                            const searchButton = document.querySelector('.search-btn');
                            if (searchButton && !searchButton.disabled && !searchButton.classList.contains('search-disabled')) {
                                e.preventDefault();
                                if (window.headerCallbacks && window.headerCallbacks.onSearch) {
                                    window.headerCallbacks.onSearch(searchButton);
                                }
                            }
                        }
                    }
                });
                window._hasEnterKeyHandler = true;
            }
        }
    }, 500);
}
