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
  const { fetchAPI, formatDate, formatRelativeTime } = window.adminApp;
  const pageContent = document.getElementById('page-content');
  
  // Initial page structure with filters
  pageContent.innerHTML = `
    <div class="page-header">
      <h1>Users</h1>
      <p>View and manage customer users</p>
    </div>
    
    <div class="card" style="margin-bottom: 24px;">
      <div class="card-body">
        <div style="display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: end;">
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Search Users</label>
            <input 
              type="text" 
              id="user-search" 
              class="form-control" 
              placeholder="Search by username, email, or name..."
              style="width: 100%;"
            />
          </div>
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Verification Status</label>
            <select id="user-verified-filter" class="form-control">
              <option value="">All Users</option>
              <option value="true">Verified</option>
              <option value="false">Not Verified</option>
            </select>
          </div>
          <button id="user-search-btn" class="btn btn-primary">
            <i class="fas fa-search"></i> Search
          </button>
        </div>
      </div>
    </div>
    
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Customer Users</h3>
        <span id="user-count-badge" class="badge badge-primary">0 users</span>
      </div>
      <div class="card-body">
        <div id="users-table-container">
          <div class="loading-spinner"></div>
        </div>
      </div>
    </div>
    
    <!-- User Details Modal -->
    <div id="user-details-modal" class="modal-overlay" style="display: none;">
      <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
        <div class="modal-header">
          <h2 id="modal-user-title">User Details</h2>
          <button class="modal-close" onclick="document.getElementById('user-details-modal').style.display='none'">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" id="user-details-content">
          <div class="loading-spinner"></div>
        </div>
      </div>
    </div>
  `;
  
  // Attach event listeners
  document.getElementById('user-search-btn').addEventListener('click', () => loadUsersTable());
  document.getElementById('user-search').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loadUsersTable();
  });
  document.getElementById('user-verified-filter').addEventListener('change', () => loadUsersTable());
  
  // Load initial data
  await loadUsersTable();
}

async function loadUsersTable(offset = 0) {
  const { fetchAPI, formatDate, formatRelativeTime, showNotification } = window.adminApp;
  const container = document.getElementById('users-table-container');
  const countBadge = document.getElementById('user-count-badge');
  
  const search = document.getElementById('user-search').value;
  const verified = document.getElementById('user-verified-filter').value;
  
  try {
    const params = new URLSearchParams({ limit: 50, offset });
    if (search) params.append('search', search);
    if (verified) params.append('verified', verified);
    
    const { users, pagination } = await fetchAPI(`/admin/users?${params}`);
    
    countBadge.textContent = `${pagination.total} user${pagination.total !== 1 ? 's' : ''}`;
    
    if (users.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No users found</p></div>';
      return;
    }
    
    container.innerHTML = `
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>ID Verified</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(user => `
              <tr>
                <td><strong>${user.username || '-'}</strong></td>
                <td>${user.given_name && user.family_name ? `${user.given_name} ${user.family_name}` : '-'}</td>
                <td>${user.email || '-'}</td>
                <td>${user.phone || '-'}</td>
                <td>
                  ${user.id_verified 
                    ? `<span class="badge badge-success"><i class="fas fa-check-circle"></i> Verified</span>`
                    : `<span class="badge badge-secondary"><i class="fas fa-times-circle"></i> Not Verified</span>`
                  }
                </td>
                <td>
                  ${user.enabled 
                    ? `<span class="badge badge-success">Active</span>`
                    : `<span class="badge badge-danger">Disabled</span>`
                  }
                </td>
                <td>${formatRelativeTime(user.created_at)}</td>
                <td>
                  <button 
                    class="btn btn-sm btn-outline" 
                    onclick="window.viewUserDetails('${user.id}')"
                  >
                    <i class="fas fa-eye"></i> View
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      ${pagination.total > 50 ? `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding: 16px; border-top: 1px solid var(--border-color);">
          <div>
            Showing ${offset + 1} - ${Math.min(offset + 50, pagination.total)} of ${pagination.total}
          </div>
          <div style="display: flex; gap: 8px;">
            ${offset > 0 ? `
              <button class="btn btn-outline" onclick="window.loadUsersTable(${offset - 50})">
                <i class="fas fa-chevron-left"></i> Previous
              </button>
            ` : ''}
            ${pagination.hasMore ? `
              <button class="btn btn-outline" onclick="window.loadUsersTable(${offset + 50})">
                Next <i class="fas fa-chevron-right"></i>
              </button>
            ` : ''}
          </div>
        </div>
      ` : ''}
    `;
  } catch (error) {
    console.error('Error loading users:', error);
    container.innerHTML = '<div class="empty-state"><p>Error loading users</p></div>';
    showNotification('Failed to load users', 'error');
  }
}

async function viewUserDetails(userId) {
  const { fetchAPI, formatDate, formatRelativeTime } = window.adminApp;
  const modal = document.getElementById('user-details-modal');
  const content = document.getElementById('user-details-content');
  
  modal.style.display = 'flex';
  content.innerHTML = '<div class="loading-spinner"></div>';
  
  try {
    const { user, passkeys, activity, stats } = await fetchAPI(`/admin/users/${userId}`);
    
    document.getElementById('modal-user-title').textContent = user.username || 'User Details';
    
    content.innerHTML = `
      <!-- User Information -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
        <div>
          <h3 style="margin-bottom: 16px;"><i class="fas fa-user"></i> Personal Information</h3>
          <table style="width: 100%;">
            <tr><td style="padding: 8px; font-weight: 600;">Username:</td><td style="padding: 8px;">${user.username || '-'}</td></tr>
            <tr><td style="padding: 8px; font-weight: 600;">Email:</td><td style="padding: 8px;">${user.email || '-'}</td></tr>
            <tr><td style="padding: 8px; font-weight: 600;">Phone:</td><td style="padding: 8px;">${user.phone || '-'}</td></tr>
            <tr><td style="padding: 8px; font-weight: 600;">Full Name:</td><td style="padding: 8px;">${user.given_name && user.family_name ? `${user.given_name} ${user.family_name}` : '-'}</td></tr>
            <tr><td style="padding: 8px; font-weight: 600;">Birth Date:</td><td style="padding: 8px;">${user.birth_date ? formatDate(user.birth_date) : '-'}</td></tr>
          </table>
        </div>
        
        <div>
          <h3 style="margin-bottom: 16px;"><i class="fas fa-shield-alt"></i> Verification & Status</h3>
          <table style="width: 100%;">
            <tr>
              <td style="padding: 8px; font-weight: 600;">ID Verified:</td>
              <td style="padding: 8px;">
                ${user.id_verified 
                  ? `<span class="badge badge-success"><i class="fas fa-check-circle"></i> Verified</span>`
                  : `<span class="badge badge-secondary"><i class="fas fa-times-circle"></i> Not Verified</span>`
                }
              </td>
            </tr>
            ${user.id_verified_at ? `<tr><td style="padding: 8px; font-weight: 600;">Verified At:</td><td style="padding: 8px;">${formatDate(user.id_verified_at)}</td></tr>` : ''}
            <tr><td style="padding: 8px; font-weight: 600;">Document Type:</td><td style="padding: 8px;">${user.document_type || '-'}</td></tr>
            <tr><td style="padding: 8px; font-weight: 600;">Document Number:</td><td style="padding: 8px;">${user.document_number || '-'}</td></tr>
            <tr>
              <td style="padding: 8px; font-weight: 600;">Account Status:</td>
              <td style="padding: 8px;">
                ${user.enabled 
                  ? `<span class="badge badge-success">Active</span>`
                  : `<span class="badge badge-danger">Disabled</span>`
                }
              </td>
            </tr>
            <tr><td style="padding: 8px; font-weight: 600;">Joined:</td><td style="padding: 8px;">${formatDate(user.created_at)}</td></tr>
          </table>
        </div>
      </div>
      
      <!-- Authentication Methods -->
      <div style="margin-bottom: 24px;">
        <h3 style="margin-bottom: 16px;"><i class="fas fa-key"></i> Authentication Methods (${passkeys.length} passkey${passkeys.length !== 1 ? 's' : ''})</h3>
        ${passkeys.length > 0 ? `
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Device Name</th>
                  <th>Credential ID</th>
                  <th>Created</th>
                  <th>Last Used</th>
                </tr>
              </thead>
              <tbody>
                ${passkeys.map(pk => `
                  <tr>
                    <td>${pk.friendly_name || 'Unnamed Device'}</td>
                    <td><code style="font-size: 12px;">${pk.credential_id.substring(0, 20)}...</code></td>
                    <td>${formatRelativeTime(pk.created_at)}</td>
                    <td>${pk.last_used_at ? formatRelativeTime(pk.last_used_at) : 'Never'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="empty-state"><p>No passkeys registered</p></div>'}
      </div>
      
      <!-- Auth Stats -->
      <div style="margin-bottom: 24px;">
        <h3 style="margin-bottom: 16px;"><i class="fas fa-chart-bar"></i> Authentication Statistics</h3>
        ${stats.length > 0 ? `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
            ${stats.map(stat => {
              const successRate = stat.total > 0 ? Math.round((parseInt(stat.successful) / parseInt(stat.total)) * 100) : 0;
              return `
                <div style="padding: 16px; background: var(--bg-secondary); border-radius: 8px;">
                  <div style="font-size: 12px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px;">
                    ${stat.auth_method.replace('_', ' ')}
                  </div>
                  <div style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">${stat.total}</div>
                  <div style="font-size: 14px; color: var(--text-secondary);">
                    ${stat.successful} successful (${successRate}%)
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : '<div class="empty-state"><p>No authentication activity</p></div>'}
      </div>
      
      <!-- Recent Activity -->
      <div>
        <h3 style="margin-bottom: 16px;"><i class="fas fa-history"></i> Recent Activity (Last 50)</h3>
        ${activity.length > 0 ? `
          <div class="table-container" style="max-height: 400px; overflow-y: auto;">
            <table class="table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>IP Address</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                ${activity.map(act => `
                  <tr>
                    <td>${act.auth_method ? act.auth_method.replace('_', ' ') : '-'}</td>
                    <td><code>${act.ip_address || '-'}</code></td>
                    <td>${act.geo_city && act.geo_country ? `${act.geo_city}, ${act.geo_country}` : act.geo_country || '-'}</td>
                    <td>
                      ${act.success 
                        ? `<span class="badge badge-success">Success</span>`
                        : `<span class="badge badge-danger">Failed</span>`
                      }
                    </td>
                    <td>${formatRelativeTime(act.created_at)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="empty-state"><p>No activity logged</p></div>'}
      </div>
    `;
  } catch (error) {
    console.error('Error loading user details:', error);
    content.innerHTML = '<div class="empty-state"><p>Error loading user details</p></div>';
  }
}

// Export functions to window
window.loadUsersTable = loadUsersTable;
window.viewUserDetails = viewUserDetails;

// Make functions available globally
window.loadDashboard = loadDashboard;
window.loadRules = loadRules;
window.loadActivity = loadActivity;
window.loadUsers = loadUsers;
