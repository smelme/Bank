/**
 * Orchestrator Admin Portal - Main Application
 */

// Import pages module
import './pages.js';

// API Base URL
const API_BASE = window.location.origin;

// Application State
const appState = {
  token: localStorage.getItem('admin_token') || null,
  admin: null,
  currentPage: 'dashboard'
};

// Token refresh interval (1 hour = 3600000ms)
let tokenRefreshInterval = null;

// ==================== Initialization ====================
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

async function initializeApp() {
  // Check if we have a token
  if (appState.token) {
    try {
      // Verify token and get admin info
      const admin = await fetchAPI('/admin/me');
      appState.admin = admin;
      
      // Start token refresh interval
      startTokenRefresh();
      
      showApp();
      loadPage('dashboard');
    } catch (error) {
      // Token invalid, show login
      appState.token = null;
      localStorage.removeItem('admin_token');
      showLogin();
    }
  } else {
    showLogin();
  }
  
  // Hide loading screen
  document.getElementById('loading-screen').classList.add('hidden');
}

// ==================== Token Refresh ====================
function startTokenRefresh() {
  // Clear any existing interval
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval);
  }
  
  // Refresh token every hour (1 hour = 3600000ms)
  tokenRefreshInterval = setInterval(async () => {
    try {
      console.log('Refreshing admin token...');
      const response = await fetch(`${API_BASE}/admin/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${appState.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        appState.token = data.token;
        localStorage.setItem('admin_token', data.token);
        console.log('Token refreshed successfully');
      } else {
        console.error('Token refresh failed, stopping refresh interval');
        stopTokenRefresh();
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      stopTokenRefresh();
    }
  }, 3600000); // 1 hour
}

function stopTokenRefresh() {
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval);
    tokenRefreshInterval = null;
  }
}


// ==================== Authentication ====================
function showLogin() {
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('app-container').classList.add('hidden');
  
  const loginForm = document.getElementById('login-form');
  loginForm.addEventListener('submit', handleLogin);
}

async function handleLogin(e) {
  e.preventDefault();
  
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const loginBtn = document.getElementById('login-btn');
  const errorEl = document.getElementById('login-error');
  
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
  errorEl.classList.add('hidden');
  
  try {
    console.log('Attempting login for:', username);
    const response = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    console.log('Login response status:', response.status);
    const data = await response.json();
    console.log('Login response data:', data);
    
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }
    
    // Save token and admin info
    appState.token = data.token;
    appState.admin = data.admin;
    localStorage.setItem('admin_token', data.token);
    
    console.log('Login successful, showing app');
    
    // Start token refresh interval
    startTokenRefresh();
    
    // Show app
    document.getElementById('login-page').classList.add('hidden');
    showApp();
    await loadPage('dashboard');
    
  } catch (error) {
    console.error('Login error:', error);
    errorEl.textContent = error.message;
    errorEl.classList.remove('hidden');
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
  }
}

function handleLogout() {
  if (confirm('Are you sure you want to logout?')) {
    // Stop token refresh
    stopTokenRefresh();
    
    // Clear state
    appState.token = null;
    appState.admin = null;
    localStorage.removeItem('admin_token');
    
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('login-form').reset();
    showLogin();
  }
}

// ==================== App Display ====================
function showApp() {
  document.getElementById('app-container').classList.remove('hidden');
  
  // Update admin info display
  if (appState.admin) {
    document.getElementById('admin-name').textContent = appState.admin.full_name || appState.admin.username;
    document.getElementById('admin-role').textContent = capitalize(appState.admin.role);
  }
  
  // Setup navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      loadPage(page);
    });
  });
  
  // Setup logout
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
}

// ==================== Page Loading ====================
async function loadPage(pageName) {
  appState.currentPage = pageName;
  
  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageName);
  });
  
  // Load page content
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = '<div class="loading-spinner"></div>';
  
  try {
    switch (pageName) {
      case 'dashboard':
        await window.loadDashboard();
        break;
      case 'rules':
        await window.loadRules();
        break;
      case 'activity':
        await window.loadActivity();
        break;
      case 'users':
        await window.loadUsers();
        break;
      default:
        pageContent.innerHTML = '<p>Page not found</p>';
    }
  } catch (error) {
    console.error('Error loading page:', error);
    pageContent.innerHTML = `<div class="error-message">Failed to load page: ${error.message}</div>`;
  }
}

// ==================== API Helper ====================
async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (appState.token) {
    headers['Authorization'] = `Bearer ${appState.token}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  // Handle token expiration or invalid token
  if (response.status === 401 || response.status === 403) {
    console.log('Token expired, invalid, or account inactive - clearing and redirecting to login');
    localStorage.removeItem('admin_token');
    appState.token = null;
    appState.admin = null;
    showLogin();
    throw new Error('Session expired or access denied. Please login again.');
  }
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }
  
  return data;
}

// ==================== Utility Functions ====================
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatRelativeTime(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid date';
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

function showNotification(message, type = 'info') {
  // Simple notification (can be enhanced)
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--primary)'};
    color: white;
    border-radius: 8px;
    box-shadow: var(--shadow-lg);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Export functions for other modules
window.adminApp = {
  fetchAPI,
  formatDate,
  formatRelativeTime,
  showNotification,
  capitalize,
  getState: () => appState
};
