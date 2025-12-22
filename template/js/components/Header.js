export function mountHeader(root, { onTemporalChange, onClear, onSearch }) {
  root.innerHTML = `
    <div class="toggle-row">
      <!-- Switch moved to sidebar -->
    </div>
  `;
  
  // Store callbacks in window object to access them from sidebar
  window.headerCallbacks = {
    onClear,
    onSearch,
    onTemporalChange
  };
}
