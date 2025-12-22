/**
 * placeholderImage.js
 * Tạo ảnh placeholder mẫu với ID và score
 */

// Tạo một canvas để tạo ảnh placeholder
function createPlaceholderImage(id, score) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  
  // Tạo gradient background
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#0ea5e9');
  gradient.addColorStop(1, '#7dd3fc');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Vẽ một grid pattern
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  
  // Vẽ grid ngang
  for (let y = 20; y < canvas.height; y += 20) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  
  // Vẽ grid dọc
  for (let x = 20; x < canvas.width; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  
  // Thêm ID vào ảnh
  ctx.fillStyle = 'white';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`ID: ${id}`, canvas.width / 2, canvas.height / 2 - 10);
  
  // Thêm score vào ảnh
  ctx.font = '14px Arial';
  ctx.fillText(`Score: ${parseFloat(score).toFixed(2)}`, canvas.width / 2, canvas.height / 2 + 20);
  
  // Thêm "Mock Image" vào ảnh
  ctx.font = '12px Arial';
  ctx.fillText("Mock Image", canvas.width / 2, canvas.height - 15);
  
  return canvas.toDataURL();
}

export { createPlaceholderImage };
