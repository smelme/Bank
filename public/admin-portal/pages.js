/**
 * Dashboard Page - Admin Portal
 * Shows analytics and recent activity
 */

async function loadDashboard() {
  const { fetchAPI, formatRelativeTime } = window.adminApp;
  
  try {
    // Fetch analytics data
    const { stats } = await fetchAPI('/admin/analytics');
    
    // Handle null or missing stats data
    const safeStats = {
      total: stats?.total || 0,
      successful: stats?.successful || 0,
      failed: stats?.failed || 0,
      byMethod: stats?.byMethod || [],
      byCountry: stats?.byCountry || [],
      recent: stats?.recent || []
    };
    
    const pageContent = document.getElementById('page-content');
    pageContent.innerHTML = `
      <div class="page-header">
        <h1>Dashboard</h1>
        <p>Overview of authentication activity and system status</p>
      </div>
      
      <!-- Stats Cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon primary">
            <i class="fas fa-sign-in-alt"></i>
          </div>
          <div class="stat-content">
            <div class="stat-label">Total Attempts</div>
            <div class="stat-value">${safeStats.total.toLocaleString()}</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon success">
            <i class="fas fa-check-circle"></i>
          </div>
          <div class="stat-content">
            <div class="stat-label">Successful</div>
            <div class="stat-value">${safeStats.successful.toLocaleString()}</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon danger">
            <i class="fas fa-times-circle"></i>
          </div>
          <div class="stat-content">
            <div class="stat-label">Failed</div>
            <div class="stat-value">${safeStats.failed.toLocaleString()}</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon warning">
            <i class="fas fa-percentage"></i>
          </div>
          <div class="stat-content">
            <div class="stat-label">Success Rate</div>
            <div class="stat-value">${safeStats.total > 0 ? Math.round((safeStats.successful / safeStats.total) * 100) : 0}%</div>
          </div>
        </div>
      </div>
      
      <!-- Two Column Layout -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
        <!-- Authentication Methods -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Authentication Methods</h3>
          </div>
          <div class="card-body">
            ${renderMethodsChart(safeStats.byMethod)}
          </div>
        </div>
        
        <!-- Top Countries -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Top Countries</h3>
          </div>
          <div class="card-body">
            ${renderCountriesChart(safeStats.byCountry)}
          </div>
        </div>
      </div>
      
      <!-- Recent Activity -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Recent Activity</h3>
          <a href="#activity" class="btn btn-sm btn-outline" onclick="window.adminApp.loadPage?.('activity') || loadPage('activity')">
            View All
          </a>
        </div>
        <div class="card-body">
          ${renderRecentActivity(safeStats.recent)}
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading dashboard:', error);
    
    // Show error state
    const pageContent = document.getElementById('page-content');
    pageContent.innerHTML = `
      <div class="page-header">
        <h1>Dashboard</h1>
        <p>Overview of authentication activity and system status</p>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="empty-state">
            <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--warning); margin-bottom: 16px;"></i>
            <p>Error loading dashboard data</p>
            <p style="color: var(--text-secondary); font-size: 14px;">${error.message}</p>
          </div>
        </div>
      </div>
    `;
  }
}

function renderMethodsChart(methods) {
  if (!methods || methods.length === 0) {
    return '<div class="empty-state"><p>No data available</p></div>';
  }
  
  const total = methods.reduce((sum, m) => sum + parseInt(m.count), 0);
  
  const methodIcons = {
    passkey: 'fa-key',
    digitalid: 'fa-id-card',
    email_otp: 'fa-envelope',
    sms_otp: 'fa-mobile-alt'
  };
  
  return `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      ${methods.map(method => {
        const percentage = Math.round((parseInt(method.count) / total) * 100);
        const icon = methodIcons[method.auth_method] || 'fa-key';
        return `
          <div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="display: flex; align-items: center; gap: 8px;">
                <i class="fas ${icon}" style="color: var(--primary);"></i>
                <span style="text-transform: capitalize;">${method.auth_method.replace('_', ' ')}</span>
              </span>
              <span style="font-weight: 600;">${method.count} (${percentage}%)</span>
            </div>
            <div style="height: 8px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden;">
              <div style="height: 100%; width: ${percentage}%; background: var(--primary); border-radius: 4px;"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderCountriesChart(countries) {
  if (!countries || countries.length === 0) {
    return '<div class="empty-state"><p>No data available</p></div>';
  }
  
  const total = countries.reduce((sum, c) => sum + parseInt(c.count), 0);
  
  return `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${countries.map(country => {
        const percentage = Math.round((parseInt(country.count) / total) * 100);
        return `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 600;">${country.geo_country || 'Unknown'}</span>
            <span style="color: var(--text-secondary);">${country.count} (${percentage}%)</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderRecentActivity(activities) {
  const { formatRelativeTime } = window.adminApp;
  
  if (!activities || activities.length === 0) {
    return '<div class="empty-state"><p>No recent activity</p></div>';
  }
  
  return `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Method</th>
            <th>IP Address</th>
            <th>Location</th>
            <th>Status</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          ${activities.map(activity => `
            <tr>
              <td style="font-weight: 600;">${activity.username}</td>
              <td style="text-transform: capitalize;">${activity.auth_method.replace('_', ' ')}</td>
              <td><code style="font-size: 12px;">${activity.ip_address}</code></td>
              <td>${activity.geo_city ? `${activity.geo_city}, ${activity.geo_country}` : activity.geo_country || 'Unknown'}</td>
              <td>
                ${activity.success 
                  ? '<span class="badge badge-success">Success</span>' 
                  : '<span class="badge badge-danger">Failed</span>'
                }
              </td>
              <td>${formatRelativeTime(activity.created_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Stub functions for other pages (to be implemented)
async function loadRules() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `
    <div class="page-header">
      <h1>Rules Management</h1>
      <p>Create and manage authentication rules</p>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="alert('Create rule feature coming soon!')">
          <i class="fas fa-plus"></i> Create Rule
        </button>
      </div>
    </div>
    <div class="card">
      <div class="empty-state">
        <i class="fas fa-gavel"></i>
        <h3>Rules Management</h3>
        <p>Rules feature is under development</p>
      </div>
    </div>
  `;
}

async function loadActivity() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `
    <div class="page-header">
      <h1>Activity Logs</h1>
      <p>View authentication activity and filter by various criteria</p>
    </div>
    <div class="card">
      <div class="empty-state">
        <i class="fas fa-history"></i>
        <h3>Activity Logs</h3>
        <p>Activity logs viewer is under development</p>
      </div>
    </div>
  `;
}

async function loadUsers() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `
    <div class="page-header">
      <h1>Users</h1>
      <p>View user activity and authentication history</p>
    </div>
    <div class="card">
      <div class="empty-state">
        <i class="fas fa-users"></i>
        <h3>Users Management</h3>
        <p>Users viewer is under development</p>
      </div>
    </div>
  `;
}

// Make functions available globally
window.loadDashboard = loadDashboard;
window.loadRules = loadRules;
window.loadActivity = loadActivity;
window.loadUsers = loadUsers;
