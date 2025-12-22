export function renderSingle(container) {
  
  
  // Remove temporal-mode class from container
  container.classList.remove('temporal-mode');
  
  container.innerHTML = `
    <div class="query-main">
      <span class="pill">Query</span>
      <input id="qMain" placeholder="Nhập truy vấn tổng..."
             autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
    </div>
    <div class="sub-rows">
      <div class="sub-query">
        <span class="pill">OCR</span>
        <input id="qOCR" placeholder="Nhập OCR query..."
               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      </div>
      <div class="sub-query">
        <span class="pill">ASR</span>
        <input id="qASR" placeholder="Nhập ASR query..."
               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      </div>
    </div>
  `;
  
 
}

export function renderTemporal(container) {
  
  
  // Add temporal-mode class to container
  container.classList.add('temporal-mode');
  
  container.innerHTML = `
    <div class="temporal-grid">
      ${[1,2,3].map(i => `
      <div class="qgroup">
        <div class="qbox">
          <span class="pill">Query ${i}</span>
          <input id="q${i}" placeholder="Query ${i}..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        </div>
        <div class="qsubs">
          <div class="sub">
            <span class="pill">OCR</span>
            <input id="q${i}ocr" placeholder="OCR ${i}..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
          </div>
        </div>
      </div>`).join('')}
    </div>
  `;
  
  
}
