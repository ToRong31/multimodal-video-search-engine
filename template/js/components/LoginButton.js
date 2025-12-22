import { store } from '../state/store.js';
import { EventRetrievalClient } from '../api/eventretrieval.js';

/**
 * Tạo và khởi tạo nút Login floating
 */
export function createLoginButton() {
  // Kiểm tra nút đã tồn tại
  if (document.querySelector('.login-floating-button')) {
    document.querySelector('.login-floating-button').remove();
  }
  
  // Kiểm tra trạng thái login từ store
  const isLoggedIn = !!store.sessionId;
  
  // Tạo button
  const loginBtn = document.createElement('div');
  loginBtn.className = `login-floating-button ${isLoggedIn ? 'logged-in' : ''}`;
  loginBtn.innerHTML = `
    <span class="login-status-text">${isLoggedIn ? 'Logout' : 'Login'}</span>
  `;
  
  document.body.appendChild(loginBtn);
  
  // ✅ XỬ LÝ CLICK: TOGGLE GIỮA LOGIN VÀ LOGOUT
  loginBtn.addEventListener('click', () => handleToggleLogin(loginBtn));
  
  return loginBtn;
}

/**
 * Toggle giữa Login và Logout
 */
async function handleToggleLogin(loginBtn) {
  // ✅ NẾU ĐÃ LOGIN → LOGOUT
  if (store.sessionId) {
    logoutUser(loginBtn);
  } 
  // ✅ NẾU CHƯA LOGIN → LOGIN
  else {
    await handleLogin(loginBtn);
  }
}

/**
 * Xử lý Login
 */
async function handleLogin(loginBtn) {
  // Bắt đầu login
  loginBtn.classList.add('loading');
  const originalHTML = loginBtn.innerHTML;
  loginBtn.innerHTML = `
    <span class="login-status-text">Logging in...</span>
  `;
  
  try {
    const client = new EventRetrievalClient({
      baseURL: store.eventRetrievalBaseURL || "https://eventretrieval.oj.io.vn/api/v2",
      fetchImpl: fetch.bind(window)
    });
    
    const username = store.eventRetrievalUsername || "team052";
    const password = store.eventRetrievalPassword || "ZnCTJuBWHU";
    
    const loginResponse = await client.login({ username, password });
    
    if (loginResponse.sessionId) {
      // ✅ Lưu sessionId
      store.sessionId = loginResponse.sessionId;
      localStorage.setItem('eventRetrieval_sessionId', loginResponse.sessionId);
      localStorage.setItem('eventRetrieval_loginTime', Date.now().toString());
      
      // ✅ Cập nhật UI thành Logout button
      loginBtn.classList.remove('loading');
      loginBtn.classList.add('logged-in');
      loginBtn.innerHTML = `
        <span class="login-status-text">Logout</span>
      `;
      
      console.log('✅ Login successful:', loginResponse.sessionId);
      showNotification('✅ Login successful!', 'success');
    } else {
      throw new Error('No sessionId in response');
    }
  } catch (error) {
    console.error('❌ Login failed:', error);
    
    // Hiển thị lỗi
    loginBtn.classList.remove('loading');
    loginBtn.classList.add('error');
    loginBtn.innerHTML = `
      <span class="login-status-icon">✗</span>
      <span class="login-status-text">Login Failed</span>
    `;
    
    showNotification(`❌ Login failed: ${error.message}`, 'error');
    
    // Reset sau 3s
    setTimeout(() => {
      loginBtn.classList.remove('error');
      loginBtn.innerHTML = originalHTML;
    }, 3000);
  }
}

/**
 * Xóa sessionId và update UI
 */
function logoutUser(loginBtn) {
  // Xóa session
  store.sessionId = null;
  localStorage.removeItem('eventRetrieval_sessionId');
  localStorage.removeItem('eventRetrieval_loginTime');
  
  // ✅ Cập nhật UI thành Login button
  loginBtn.classList.remove('logged-in');
  loginBtn.innerHTML = `
    <span class="login-status-text">Login</span>
  `;
  
  showNotification('🚪 Logged out successfully', 'info');
  console.log('🚪 User logged out');
}

/**
 * Hiển thị thông báo
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `login-notification notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 20px;
    background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 10000;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    font-weight: 500;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Tự động xóa sau 3s
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Kiểm tra và refresh nút Login khi sessionId thay đổi
 */
export function refreshLoginButton() {
  const loginBtn = document.querySelector('.login-floating-button');
  if (!loginBtn) return;
  
  const isLoggedIn = !!store.sessionId;
  
  if (isLoggedIn) {
    loginBtn.classList.add('logged-in');
    loginBtn.classList.remove('error');
    loginBtn.innerHTML = `
      <span class="login-status-text">Logout</span>
    `;
  } else {
    loginBtn.classList.remove('logged-in');
    loginBtn.innerHTML = `
      <span class="login-status-text">Login</span>
    `;
  }
}

/**
 * Export logoutUser để có thể gọi từ bên ngoài nếu cần
 */
export function logoutUserExternal() {
  const loginBtn = document.querySelector('.login-floating-button');
  if (loginBtn) {
    logoutUser(loginBtn);
  }
}