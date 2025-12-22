// Thêm import store và các setter functions ở đầu file
import { store, setImageSearchResults, setActiveTabIdx } from '../state/store.js';
// import { createMethodPanel } from '../main.js';


// Hàm gọi API Image Search với image_id
export async function performImageSearchByImage(imageId, method) {
  try {
    console.log(`🖼️ Searching by image: ${imageId} using ${method}`);
    
    const response = await fetch('/api/image-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_id: imageId,
        model_name: method,
        topk: 100,
        collection_name: method
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    console.log('🖼️ Image Search API response:', data); // Thêm log debug
    
    // Kiểm tra cấu trúc dữ liệu trả về
    if (!data.results) {
      console.warn('🖼️ API response missing results property:', data);
      // Nếu không có results, thử sử dụng data trực tiếp
      if (Array.isArray(data)) {
        data.results = data;
      } else if (data && typeof data === 'object') {
        // Nếu data là object, thử tìm các property có thể chứa results
        const possibleResults = data.data || data.items || data.images || [];
        data.results = Array.isArray(possibleResults) ? possibleResults : [];
      } else {
        data.results = [];
      }
    }
    
    // Đảm bảo results là array
    if (!Array.isArray(data.results)) {
      console.warn('🖼️ API response results is not an array:', data.results);
      data.results = [];
    }
    
    // Sử dụng setter functions để cập nhật store
    try {
      console.log('🖼️ Setting image search results:', data.results);
      setImageSearchResults(data.results);
      setActiveTabIdx(4); // Tab Image Search (index 4)
      
      console.log('🖼️ Store updated - imageSearchResults:', store.imageSearchResults);
      console.log('🖼️ Store updated - activeTabIdx:', store.activeTabIdx);
      
      console.log('🖼️ Updated store:', { // Thêm log debug
        imageSearchResults: store.imageSearchResults,
        activeTabIdx: store.activeTabIdx
      });
    } catch (storeError) {
      console.error('🖼️ Error updating store:', storeError);
      // Continue execution even if store update fails
    }
    
    // Cập nhật UI để chuyển sang tab Image Search
    try {
      const tabsContainer = document.querySelector('#tabs');
      if (tabsContainer) {
        const tabs = Array.from(tabsContainer.querySelectorAll('.tab'));
        console.log('🖼️ Found tabs:', tabs.length); // Thêm log debug
        
        tabs.forEach((tab, idx) => {
          tab.classList.remove('active');
          console.log(`️ Tab ${idx}: ${tab.textContent}`); // Thêm log debug
        });
        
        if (tabs[4]) { // Tab Image Search
          tabs[4].classList.add('active');
          console.log('🖼️ Activated tab Image Search'); // Thêm log debug
        } else {
          console.log('🖼️ Tab Image Search not found!'); // Thêm log debug
        }
      }
    } catch (uiError) {
      console.error('🖼️ Error updating UI tabs:', uiError);
      // Continue execution even if UI update fails
    }
    
    // Render kết quả mới
    try {
      const container = document.querySelector('.tab-panels-container');
      if (container) {
        console.log('🖼️ Found tab-panels-container, store updated - main.js will handle rendering'); // Thêm log debug
        // Không cần gọi renderImageSearchResults nữa vì main.js sẽ xử lý thông qua createMethodPanel
        // Chỉ cần cập nhật store và activeTabIdx, main.js sẽ tự động render khi tab được chọn
      } 
    } catch (containerError) {
      console.error('🖼️ Error finding container:', containerError);
      // Continue execution even if container operations fail
    }
    
    return data;
  } catch (error) {
    console.error('Image search by image error:', error);
    throw error;
  }
}