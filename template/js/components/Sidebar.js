import { createFilterWidget } from './FilterWidget.js';

const DATA = {
  imageModels: ['ClipH14', 'ClipBigg14', 'Image Captioning', 'BEiT3','SigLIP2', 'Google Search'],
  videoModels: []
};

function renderOptions(container, list, sectionKey, isTemporal) {
  container.innerHTML = '';
  list.forEach((label, idx) => {
    const baseId = `${sectionKey}_${idx}`;
    
    if (isTemporal) {
      // Hoàn toàn thay đổi cách tạo element cho temporal mode
      // Bọc toàn bộ nội dung trong một div.option có thể click
      const optionEl = document.createElement('div');
      optionEl.className = 'option temporal-option';
      optionEl.setAttribute('data-model-idx', idx);
      optionEl.setAttribute('data-model-name', label);
      
      // Phần nhãn model với wrapper để match với regular mode
      const labelWrapper = document.createElement('label');
      labelWrapper.style.display = 'flex';
      labelWrapper.style.gap = '10px';
      labelWrapper.style.alignItems = 'flex-end';
      labelWrapper.style.cursor = 'pointer';
      labelWrapper.style.width = '100%';
      labelWrapper.style.fontSize = '18px';
      
      const labelSpan = document.createElement('span');
      labelSpan.className = 'model-label';
      labelSpan.textContent = label;
      labelWrapper.appendChild(labelSpan);
      optionEl.appendChild(labelWrapper);
      
      // Phần checkboxes
      const rightSpan = document.createElement('span');
      rightSpan.className = 'right triple';
      
      // Tạo 3 checkboxes
      for (let i = 1; i <= 3; i++) {
        const checkboxId = `${baseId}_${i}`;
        const checkboxInput = document.createElement('input');
        checkboxInput.type = 'checkbox';
        checkboxInput.id = checkboxId;
        checkboxInput.setAttribute('data-index', i);
        
        // Đảm bảo sự kiện click trên checkbox không bubble lên .option
        checkboxInput.addEventListener('click', (e) => {
          e.stopPropagation();
        });
        
        const checkboxWrapper = document.createElement('div');
        checkboxWrapper.className = 'checkbox-wrapper';
        checkboxWrapper.style.display = 'flex';
        checkboxWrapper.style.alignItems = 'center';
        checkboxWrapper.appendChild(checkboxInput);
        
        rightSpan.appendChild(checkboxWrapper);
      }
      
      optionEl.appendChild(rightSpan);
      
      // Thêm sự kiện click trực tiếp vào element (không dùng event delegation)
      optionEl.addEventListener('click', (e) => {
        // Chỉ xử lý nếu click không phải trực tiếp trên checkbox
        if (e.target.tagName !== 'INPUT') {
          const checkboxes = optionEl.querySelectorAll('input[type="checkbox"]');
          if (checkboxes.length > 0) {
            const allChecked = Array.from(checkboxes).every(c => c.checked);
            const newState = !allChecked;
            
            // Set trạng thái mới cho tất cả checkboxes
            checkboxes.forEach(checkbox => {
              checkbox.checked = newState;
              // Kích hoạt sự kiện change
              const event = new Event('change', { bubbles: true });
              checkbox.dispatchEvent(event);
            });
            
            console.log(`Model ${label}: Set all checkboxes to ${newState ? 'checked' : 'unchecked'}`);
          }
        }
      });
      
      container.appendChild(optionEl);
    } else {
      container.insertAdjacentHTML('beforeend', `
        <div class="option"><label for="${baseId}">
          <input type="checkbox" id="${baseId}" /> ${label}
        </label></div>
      `);
    }
  });
}

function renderTools(container, isTemporal) {
  // Object filtering has been disabled
  container.innerHTML = '';
  // Display message indicating feature is disabled
  const notice = document.createElement('div');
  notice.style.padding = '10px';
  notice.style.color = '#64748b';
  notice.style.fontStyle = 'italic';
  notice.textContent = 'Object filtering has been disabled.';
  container.appendChild(notice);
}

export function mountSidebar(root, { isTemporal, isTranslate=true}) {
 
  
  if (!root) {
    console.error('❌ Sidebar root element not found!');
    return;
  }
  
  root.innerHTML = `
    <div class="stack">
      <div class="card">
        <!-- Mode switch added at the top -->
        <div class="search-mode-toggle">
          <div class="switch-translate">

          <div class="switch-container">
            <span class="mode-label general">General</span>
            <label class="mode-switch">
              <input id="chkTemporal" type="checkbox" ${isTemporal ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
            <span class="mode-label temporal">Temporal</span>
          </div> 
        </div>
        <div class="card-divider"></div>
        <div id="imageModels" class="stack"></div>
        <!-- Horizontal divider line -->
        <div class="card-divider"></div>
        <!-- Action buttons moved from header -->
        <div class="button-container">
          <button id="btnClear" class="clear-btn" type="button">clear</button>
          <button id="btnSearch" class="search-btn" type="button" title="Search with selected models">search</button>
        </div>
      </div>
      
      <!-- Object filtering card has been removed -->
      <div id="toolsBox" style="display:none;"></div>
    </div>
  `;
  
  const translateSwitch = root.querySelector('#chkTranslate');
  if (translateSwitch) {
    // Set trạng thái ban đầu - checked nghĩa là Origin (false), unchecked nghĩa là Translate (true)
    translateSwitch.checked = !isTranslate;
    
    translateSwitch.addEventListener('change', function() {
      // Đảo ngược giá trị vì checked = Origin (false), unchecked = Translate (true)
      const isTranslateMode = !this.checked;
      
      // Lưu trạng thái
      localStorage.setItem('translate_mode', isTranslateMode ? 'translate' : 'origin');
      
      // Cập nhật biến toàn cục nếu cần
      window.isTranslate = isTranslateMode;
      
      // Kích hoạt event để các component khác biết về thay đổi này
      const event = new CustomEvent('translatemodechange', { 
        detail: { isTranslate: isTranslateMode } 
      });
      document.dispatchEvent(event);
    });
  }
  // Get all required elements
  const elImage = root.querySelector('#imageModels');
  const elTools = root.querySelector('#toolsBox');
  
  // Validate elements
  if (!elImage || !elTools) {
    console.error('❌ Required sidebar elements not found:', {
      imageModels: !!elImage,
      toolsBox: !!elTools
    });
    return;
  }
  

  

  
  
  // Render image models
  renderOptions(elImage, DATA.imageModels, 'img', isTemporal);
  
  // Render tools
  renderTools(elTools, isTemporal);
  
  // Setup buttons moved from header
  const clearBtn = root.querySelector('#btnClear');
  const searchBtn = root.querySelector('#btnSearch');
  
  if (clearBtn && searchBtn && window.headerCallbacks) {
    // Ensure the search button is not disabled by default
    searchBtn.disabled = false;
    searchBtn.classList.remove('search-disabled');
    
    // Add event listeners
    clearBtn.addEventListener('click', () => window.headerCallbacks.onClear?.());
    
    // Improved click handler for search button with better event handling
    const searchClickHandler = (e) => {
      e.preventDefault(); // Prevent default behavior
      e.stopPropagation(); // Stop propagation
      
      // Ensure button is not disabled
      if (!searchBtn.disabled && !searchBtn.classList.contains('search-disabled')) {
        if (window.headerCallbacks && window.headerCallbacks.onSearch) {
          window.headerCallbacks.onSearch(searchBtn);
        }
      }
    };
    
    // Remove any existing handlers and add new one
    searchBtn.removeEventListener('click', searchBtn._clickHandler);
    searchBtn.addEventListener('click', searchClickHandler);
    searchBtn._clickHandler = searchClickHandler; // Store for cleanup
  }

  // Xử lý click cho non-temporal mode (single mode)
  root.addEventListener('click', (e) => {
    // Bỏ qua các click trong temporal mode (đã được xử lý trong renderOptions)
    if (e.target.closest('.temporal-option')) return;
    
    // Xử lý chỉ cho single mode
    const row = e.target.closest('.option:not(.temporal-option)');
    if (!row) return;
    if (e.target.closest('label') || (e.target.tagName === 'INPUT' && e.target.type === 'checkbox')) return;
    
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      const event = new Event('change', { bubbles: true });
      checkbox.dispatchEvent(event);
    }
  });
  
  // Setup temporal mode toggle
  const temporalCheckbox = root.querySelector('#chkTemporal');
  const generalLabel = root.querySelector('.mode-label.general');
  const temporalLabel = root.querySelector('.mode-label.temporal');
  
  if (temporalCheckbox && generalLabel && temporalLabel) {
    // Set initial opacity based on checkbox state
    if (isTemporal) {
      generalLabel.style.opacity = '0.5';
      temporalLabel.style.opacity = '1';
    } else {
      generalLabel.style.opacity = '1';
      temporalLabel.style.opacity = '0.5';
    }
    
    // Add event listener for change
    temporalCheckbox.addEventListener('change', (e) => {
      if (window.headerCallbacks?.onTemporalChange) {
        window.headerCallbacks.onTemporalChange(e.target.checked);
      }
      
      // Update label opacity
      if (e.target.checked) {
        generalLabel.style.opacity = '0.5';
        temporalLabel.style.opacity = '1';
      } else {
        generalLabel.style.opacity = '1';
        temporalLabel.style.opacity = '0.5';
      }
    });
  }
}
