/**
 * Admin Portal Pages - Dashboard, Users, Activity, Rules
 */

// Dashboard Page
async function loadDashboard() {
  const { fetchAPI, formatRelativeTime } = window.adminApp;
  const pageContent = document.getElementById('page-content');

  try {
    // Fetch analytics data
    const { stats } = await fetchAPI('/admin/analytics');

    // Safe defaults for stats
    const safeStats = {
      total: stats?.total || 0,
      successful: stats?.successful || 0,
      failed: stats?.failed || 0,
      byMethod: stats?.byMethod || [],
      byCountry: stats?.byCountry || [],
      recentActivity: stats?.recentActivity || []
    };

    pageContent.innerHTML = `
      <div class="page-header">
        <h1>Dashboard</h1>
        <p>Overview of authentication activity and system status</p>
      </div>

      <!-- Stats Cards -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
        <div class="stat-card">
          <div class="stat-icon primary">
            <i class="fas fa-users"></i>
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

      <!-- Charts -->
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
        </div>
        <div class="card-body">
          ${renderRecentActivity(safeStats.recentActivity)}
        </div>
      </div>
    `;

  } catch (error) {
    console.error('Error loading dashboard:', error);
    pageContent.innerHTML = `
      <div class="page-header">
        <h1>Dashboard</h1>
        <p>Overview of authentication activity and system status</p>
      </div>
      <div class="card">
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>Error Loading Dashboard</h3>
          <p>Unable to load dashboard data. Please try again later.</p>
        </div>
      </div>
    `;
  }
}

// Helper functions for dashboard
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

// Activity Page
async function loadActivity() {
  const { fetchAPI, formatDate, formatRelativeTime, showNotification } = window.adminApp;
  const pageContent = document.getElementById('page-content');

  // Initial page structure with filters
  pageContent.innerHTML = `
    <div class="page-header">
      <h1>Activity Logs</h1>
      <p>View and analyze authentication activity</p>
    </div>

    <div class="card" style="margin-bottom: 24px;">
      <div class="card-body">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; align-items: end;">
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">User</label>
            <input
              type="text"
              id="activity-user-filter"
              class="form-control"
              placeholder="Username or email..."
            />
          </div>
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Method</label>
            <select id="activity-method-filter" class="form-control">
              <option value="">All Methods</option>
              <option value="passkey">Passkey</option>
              <option value="digitalid">Digital ID</option>
              <option value="email_otp">Email OTP</option>
              <option value="sms_otp">SMS OTP</option>
            </select>
          </div>
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Status</label>
            <select id="activity-success-filter" class="form-control">
              <option value="">All</option>
              <option value="true">Successful</option>
              <option value="false">Failed</option>
            </select>
          </div>
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">IP Address</label>
            <input
              type="text"
              id="activity-ip-filter"
              class="form-control"
              placeholder="IP address..."
            />
          </div>
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">From Date</label>
            <input
              type="date"
              id="activity-from-date"
              class="form-control"
            />
          </div>
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">To Date</label>
            <input
              type="date"
              id="activity-to-date"
              class="form-control"
            />
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary" id="activity-search-btn">
              <i class="fas fa-search"></i> Search
            </button>
            <button class="btn btn-outline" id="activity-export-btn">
              <i class="fas fa-download"></i> Export CSV
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Activity Logs <span id="activity-count-badge" class="badge">0 entries</span></h3>
      </div>
      <div class="card-body">
        <div id="activity-table-container">
          <div class="empty-state">
            <i class="fas fa-search"></i>
            <h3>No Activity Found</h3>
            <p>Use the filters above to search for authentication activity.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // Set default date range (last 7 days)
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  document.getElementById('activity-from-date').value = sevenDaysAgo.toISOString().split('T')[0];
  document.getElementById('activity-to-date').value = today.toISOString().split('T')[0];

  // Attach event listeners
  document.getElementById('activity-search-btn').addEventListener('click', () => loadActivityTable(0));
  document.getElementById('activity-export-btn').addEventListener('click', () => exportActivityLogs());

  // Make inputs trigger search on Enter
  ['activity-user-filter', 'activity-ip-filter'].forEach(id => {
    document.getElementById(id).addEventListener('keypress', (e) => {
      if (e.key === 'Enter') loadActivityTable(0);
    });
  });

  // Load initial data
  await loadActivityTable(0);
}

async function loadActivityTable(offset = 0) {
  const { fetchAPI, formatDate, formatRelativeTime, showNotification } = window.adminApp;
  const container = document.getElementById('activity-table-container');
  const countBadge = document.getElementById('activity-count-badge');

  const filters = {
    limit: 100,
    offset
  };

  // Get filter values
  const userFilter = document.getElementById('activity-user-filter').value;
  const methodFilter = document.getElementById('activity-method-filter').value;
  const successFilter = document.getElementById('activity-success-filter').value;
  const ipFilter = document.getElementById('activity-ip-filter').value;
  const fromDate = document.getElementById('activity-from-date').value;
  const toDate = document.getElementById('activity-to-date').value;

  if (userFilter) filters.user_id = userFilter; // This will be handled by backend
  if (methodFilter) filters.auth_method = methodFilter;
  if (successFilter !== '') filters.success = successFilter === 'true';
  if (ipFilter) filters.ip_address = ipFilter;
  if (fromDate) filters.from_date = fromDate;
  if (toDate) filters.to_date = toDate;

  try {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value);
      }
    });

    const { activity, count } = await fetchAPI(`/admin/activity?${params}`);

    countBadge.textContent = `${count} entr${count !== 1 ? 'ies' : 'y'}`;

    if (activity.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No activity logs found</p></div>';
      return;
    }

    container.innerHTML = `
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Method</th>
              <th>IP Address</th>
              <th>Location</th>
              <th>Status</th>
              <th>Failure Reason</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            ${activity.map(act => `
              <tr>
                <td>
                  ${act.username ? `<strong>${act.username}</strong>` : '<em>Unknown</em>'}
                  ${act.user_id ? `<br><small style="color: var(--text-secondary);">${act.user_id.substring(0, 8)}...</small>` : ''}
                </td>
                <td>
                  <span style="display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fas ${getMethodIcon(act.auth_method)}"></i>
                    ${act.auth_method ? act.auth_method.replace('_', ' ') : 'Unknown'}
                  </span>
                </td>
                <td><code>${act.ip_address || '-'}</code></td>
                <td>
                  ${act.geo_city && act.geo_country ? `${act.geo_city}, ${act.geo_country}` :
                    act.geo_country ||
                    '<em>Unknown</em>'}
                </td>
                <td>
                  ${act.success
                    ? `<span class="badge badge-success"><i class="fas fa-check"></i> Success</span>`
                    : `<span class="badge badge-danger"><i class="fas fa-times"></i> Failed</span>`
                  }
                </td>
                <td>
                  ${act.failure_reason || '-'}
                </td>
                <td>
                  <div>${formatRelativeTime(act.timestamp)}</div>
                  <small style="color: var(--text-secondary);">${formatDate(act.timestamp)}</small>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${count > 100 ? `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding: 16px; border-top: 1px solid var(--border-color);">
          <div>
            Showing ${offset + 1} - ${Math.min(offset + 100, count)} of ${count}
          </div>
          <div style="display: flex; gap: 8px;">
            ${offset > 0 ? `
              <button class="btn btn-outline" onclick="window.loadActivityTable(${offset - 100})">
                <i class="fas fa-chevron-left"></i> Previous
              </button>
            ` : ''}
            ${offset + 100 < count ? `
              <button class="btn btn-outline" onclick="window.loadActivityTable(${offset + 100})">
                Next <i class="fas fa-chevron-right"></i>
              </button>
            ` : ''}
          </div>
        </div>
      ` : ''}
    `;
  } catch (error) {
    console.error('Error loading activity:', error);
    container.innerHTML = '<div class="empty-state"><p>Error loading activity logs</p></div>';
    showNotification('Failed to load activity logs', 'error');
  }
}

function getMethodIcon(method) {
  const icons = {
    'passkey': 'fa-key',
    'digitalid': 'fa-id-card',
    'email_otp': 'fa-envelope',
    'sms_otp': 'fa-sms'
  };
  return icons[method] || 'fa-question-circle';
}

async function exportActivityLogs() {
  const { fetchAPI, showNotification } = window.adminApp;

  try {
    // Get all filtered data (no pagination)
    const filters = {};

    const userFilter = document.getElementById('activity-user-filter').value;
    const methodFilter = document.getElementById('activity-method-filter').value;
    const successFilter = document.getElementById('activity-success-filter').value;
    const ipFilter = document.getElementById('activity-ip-filter').value;
    const fromDate = document.getElementById('activity-from-date').value;
    const toDate = document.getElementById('activity-to-date').value;

    if (userFilter) filters.user_id = userFilter;
    if (methodFilter) filters.auth_method = methodFilter;
    if (successFilter !== '') filters.success = successFilter === 'true';
    if (ipFilter) filters.ip_address = ipFilter;
    if (fromDate) filters.from_date = fromDate;
    if (toDate) filters.to_date = toDate;

    const params = new URLSearchParams();
    params.append('limit', '10000'); // Large limit for export
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value);
      }
    });

    const { activity } = await fetchAPI(`/admin/activity?${params}`);

    if (activity.length === 0) {
      showNotification('No data to export', 'warning');
      return;
    }

    // Convert to CSV
    const headers = ['User ID', 'Username', 'Method', 'IP Address', 'Country', 'City', 'Success', 'Failure Reason', 'Timestamp'];
    const csvContent = [
      headers.join(','),
      ...activity.map(act => [
        act.user_id || '',
        act.username || '',
        act.auth_method || '',
        act.ip_address || '',
        act.geo_country || '',
        act.geo_city || '',
        act.success ? 'Yes' : 'No',
        act.failure_reason || '',
        act.created_at || ''
      ].map(field => `"\${field.replace(/"/g, '""')}"`).join(','))
    ].join('\\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `activity-logs-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotification(`Exported ${activity.length} records`, 'success');
  } catch (error) {
    console.error('Error exporting activity:', error);
    showNotification('Failed to export activity logs', 'error');
  }
}

// Users Page
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
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Search</label>
            <input
              type="text"
              id="users-search"
              class="form-control"
              placeholder="Username, email, or name..."
            />
          </div>
          <div>
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Status</label>
            <select id="users-status-filter" class="form-control">
              <option value="">All Users</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
            </select>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary" id="users-search-btn">
              <i class="fas fa-search"></i> Search
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Users <span id="users-count-badge" class="badge">0 users</span></h3>
      </div>
      <div class="card-body">
        <div id="users-table-container">
          <div class="empty-state">
            <i class="fas fa-users"></i>
            <h3>Loading Users</h3>
            <p>Please wait while we load the user data...</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach event listeners
  document.getElementById('users-search-btn').addEventListener('click', () => loadUsersTable(0));
  document.getElementById('users-search').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loadUsersTable(0);
  });

  // Load initial data
  await loadUsersTable(0);
}

async function loadUsersTable(offset = 0) {
  const { fetchAPI, formatDate, showNotification } = window.adminApp;
  const container = document.getElementById('users-table-container');
  const countBadge = document.getElementById('users-count-badge');

  const filters = {
    limit: 50,
    offset
  };

  // Get filter values
  const search = document.getElementById('users-search').value;
  const statusFilter = document.getElementById('users-status-filter').value;

  if (search) filters.search = search;
  if (statusFilter) filters.status = statusFilter;

  try {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value);
      }
    });

    const { users, count } = await fetchAPI(`/admin/users?${params}`);

    countBadge.textContent = `${count} user${count !== 1 ? 's' : ''}`;

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
              <th>Email</th>
              <th>Name</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(user => `
              <tr>
                <td style="font-weight: 600;">${user.username}</td>
                <td>${user.email || '-'}</td>
                <td>${user.given_name && user.family_name ? `${user.given_name} ${user.family_name}` : '-'}</td>
                <td>
                  ${user.id_verified === true ?
                    '<span class="badge badge-success">Verified</span>' :
                    '<span class="badge badge-warning">Unverified</span>'
                  }
                </td>
                <td>${formatDate(user.created_at)}</td>
                <td>
                  <button class="btn btn-sm btn-outline" onclick="viewUserDetails('${user.id}')">
                    <i class="fas fa-eye"></i> View
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${count > 50 ? `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding: 16px; border-top: 1px solid var(--border-color);">
          <div>
            Showing ${offset + 1} - ${Math.min(offset + 50, count)} of ${count}
          </div>
          <div style="display: flex; gap: 8px;">
            ${offset > 0 ? `
              <button class="btn btn-outline" onclick="window.loadUsersTable(${offset - 50})">
                <i class="fas fa-chevron-left"></i> Previous
              </button>
            ` : ''}
            ${offset + 50 < count ? `
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
  const { fetchAPI, formatDate, formatRelativeTime, showNotification } = window.adminApp;

  try {
    const response = await fetchAPI(`/admin/users/${userId}`);
    const activityResponse = await fetchAPI(`/admin/users/${userId}/activity?limit=10`);
    
    const userData = response.user;
    const activity = activityResponse.activity || [];
    const passkeys = response.passkeys || [];
    const authMethods = response.user?.auth_methods || [];

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
    modal.innerHTML = `
      <div class="modal-content large">
        <div class="modal-header">
          <h3>User Details: ${userData.username}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
            <!-- User Info -->
            <div>
              <h4>Basic Information</h4>
              <div style="display: flex; flex-direction: column; gap: 12px;">
                <div><strong>Username:</strong> ${userData.username}</div>
                <div><strong>Email:</strong> ${userData.email || 'Not provided'}</div>
                <div><strong>Name:</strong> ${userData.given_name && userData.family_name ? `${userData.given_name} ${userData.family_name}` : 'Not provided'}</div>
                <div><strong>Status:</strong>
                  ${userData.id_verified === true ?
                    '<span class="badge badge-success">Verified</span>' :
                    '<span class="badge badge-warning">Unverified</span>'
                  }
                </div>
                <div><strong>Created:</strong> ${formatDate(userData.created_at)}</div>
                <div><strong>Last Login:</strong> ${userData.last_login_at ? formatRelativeTime(userData.last_login_at) : 'Never'}</div>
              </div>
            </div>

            <!-- Auth Methods -->
            <div>
              <h4>Authentication Methods</h4>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${passkeys.length > 0 ? `
                  <div style="margin-bottom: 12px;">
                    <strong>Passkeys (${passkeys.length})</strong>
                    ${passkeys.map(pk => `
                      <div style="display: flex; align-items: center; gap: 8px; padding: 8px; margin-top: 4px; border: 1px solid var(--border-color); border-radius: 4px;">
                        <i class="fas fa-key"></i>
                        <span>${pk.friendly_name || 'Unnamed Passkey'}</span>
                        <small style="margin-left: auto; color: var(--text-muted);">
                          ${pk.last_used_at ? 'Used ' + formatRelativeTime(pk.last_used_at) : 'Never used'}
                        </small>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
                ${authMethods.length > 0 ?
                  authMethods.map(method => `
                    <div style="display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px;">
                      <i class="fas ${getMethodIcon(method.method_type)}"></i>
                      <span style="text-transform: capitalize;">${method.method_type.replace('_', ' ')}</span>
                      ${method.is_primary ? '<span class="badge badge-primary">Primary</span>' : ''}
                    </div>
                  `).join('') :
                  (passkeys.length === 0 ? '<p>No authentication methods registered</p>' : '')
                }
              </div>
            </div>
          </div>

          <!-- Recent Activity -->
          <div style="margin-top: 24px;">
            <h4>Recent Activity (Last 10)</h4>
            ${activity && activity.length > 0 ? `
              <div class="table-container" style="margin-top: 12px;">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th>Status</th>
                      <th>IP Address</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${activity.map(act => `
                      <tr>
                        <td style="text-transform: capitalize;">${act.auth_method.replace('_', ' ')}</td>
                        <td>
                          ${act.success ?
                            '<span class="badge badge-success">Success</span>' :
                            '<span class="badge badge-danger">Failed</span>'
                          }
                        </td>
                        <td><code>${act.ip_address}</code></td>
                        <td>${formatRelativeTime(act.timestamp)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : '<p>No recent activity</p>'}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  } catch (error) {
    console.error('Error loading user details:', error);
    showNotification('Failed to load user details', 'error');
  }
}

// Rules Page - Placeholder for now
async function loadRules() {
  const { fetchAPI, showNotification } = window.adminApp;

  try {
    const { rules } = await fetchAPI('/admin/rules');

    const pageContent = document.getElementById('page-content');
    pageContent.innerHTML = `
      <div class="page-header">
        <div class="header-content">
          <div>
            <h2>Authentication Rules</h2>
            <p>Manage authentication policies and access control rules</p>
          </div>
          <div class="header-actions">
            <button class="btn btn-outline" onclick="showTestRuleModal()">
              <i class="fas fa-flask"></i> Test Rules
            </button>
            <button class="btn btn-primary" onclick="showCreateRuleModal()">
              <i class="fas fa-plus"></i> Create Rule
            </button>
          </div>
        </div>
      </div>

      <div class="rules-container">
        ${rules.length === 0 ? `
          <div class="empty-state">
            <i class="fas fa-shield-alt"></i>
            <h3>No Rules Created</h3>
            <p>Create your first authentication rule to control access policies.</p>
            <button class="btn btn-primary" onclick="showCreateRuleModal()">
              <i class="fas fa-plus"></i> Create First Rule
            </button>
          </div>
        ` : `
          <div class="rules-list">
            ${rules.map(rule => `
              <div class="rule-card ${rule.is_enabled ? 'enabled' : 'disabled'}">
                <div class="rule-header">
                  <div class="rule-info">
                    <h4>${rule.name}</h4>
                    <span class="rule-type">${rule.rule_type}</span>
                    <span class="rule-priority">Priority: ${rule.priority}</span>
                  </div>
                  <div class="rule-actions">
                    <label class="toggle-switch">
                      <input type="checkbox"
                             ${rule.is_enabled ? 'checked' : ''}
                             onchange="toggleRule('${rule.id}', this.checked)">
                      <span class="toggle-slider"></span>
                    </label>
                    <button class="btn btn-sm btn-outline" onclick="editRule('${rule.id}')">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteRule('${rule.id}', '${rule.name}')">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
                <div class="rule-description">
                  ${rule.description || 'No description'}
                </div>
                <div class="rule-details">
                  <div class="rule-conditions">
                    <strong>Conditions:</strong>
                    <span class="condition-summary">${getConditionSummary(rule.conditions)}</span>
                  </div>
                  <div class="rule-actions-summary">
                    <strong>Actions:</strong>
                    <span class="action-summary">${getActionSummary(rule.actions)}</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;

  } catch (error) {
    console.error('Error loading rules:', error);
    const pageContent = document.getElementById('page-content');
    pageContent.innerHTML = `
      <div class="page-header">
        <h2>Authentication Rules</h2>
        <p>Manage authentication policies and access control rules</p>
      </div>
      <div class="error-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Failed to Load Rules</h3>
        <p>${error.message}</p>
        <button class="btn btn-primary" onclick="loadRules()">
          <i class="fas fa-refresh"></i> Retry
        </button>
      </div>
    `;
  }
}

// Helper function to summarize rule conditions
function getConditionSummary(conditions) {
  if (!conditions || !conditions.rules || conditions.rules.length === 0) {
    return 'No conditions';
  }

  const count = conditions.rules.length;
  const operator = conditions.operator || 'AND';
  return `${count} condition${count > 1 ? 's' : ''} (${operator})`;
}

// Helper function to summarize rule actions
function getActionSummary(actions) {
  if (!actions || actions.length === 0) {
    return 'No actions';
  }

  const summaries = actions.map(action => {
    switch (action.type) {
      case 'allow_methods':
        return `Allow: ${action.methods.join(', ')}`;
      case 'deny_methods':
        return `Deny: ${action.methods.join(', ')}`;
      case 'block_access':
        return `Block access: ${action.reason || 'No reason'}`;
      case 'require_2fa':
        return 'Require 2FA';
      default:
        return action.type;
    }
  });

  return summaries.join(', ');
}

// Rule management functions
async function toggleRule(ruleId, enabled) {
  const { fetchAPI, showNotification } = window.adminApp;

  try {
    await fetchAPI(`/admin/rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify({ is_enabled: enabled })
    });

    showNotification(`Rule ${enabled ? 'enabled' : 'disabled'} successfully`, 'success');
    loadRules(); // Refresh the list
  } catch (error) {
    console.error('Error toggling rule:', error);
    showNotification(`Failed to ${enabled ? 'enable' : 'disable'} rule`, 'error');
  }
}

async function deleteRule(ruleId, ruleName) {
  const { fetchAPI, showNotification } = window.adminApp;

  if (!confirm(`Are you sure you want to delete the rule "${ruleName}"? This action cannot be undone.`)) {
    return;
  }

  try {
    await fetchAPI(`/admin/rules/${ruleId}`, {
      method: 'DELETE'
    });

    showNotification('Rule deleted successfully', 'success');
    loadRules(); // Refresh the list
  } catch (error) {
    console.error('Error deleting rule:', error);
    showNotification('Failed to delete rule', 'error');
  }
}

function showCreateRuleModal() {
  showRuleModal();
}

async function editRule(ruleId) {
  const { fetchAPI, showNotification } = window.adminApp;

  try {
    const { rule } = await fetchAPI(`/admin/rules/${ruleId}`);
    showRuleModal(rule);
  } catch (error) {
    console.error('Error loading rule for editing:', error);
    showNotification('Failed to load rule for editing', 'error');
  }
}

function showRuleModal(rule = null) {
  const isEditing = !!rule;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };

  modal.innerHTML = `
    <div class="modal-content large">
      <div class="modal-header">
        <h3>${isEditing ? 'Edit Rule' : 'Create New Rule'}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <form id="rule-form" onsubmit="handleRuleSubmit(event, '${rule?.id || ''}')">
          <div class="form-section">
            <h4>Basic Information</h4>
            <div class="form-row">
              <div class="form-group">
                <label for="rule-name">Rule Name *</label>
                <input type="text" id="rule-name" name="name" required
                       value="${rule?.name || ''}" placeholder="e.g., Block suspicious IPs">
              </div>
              <div class="form-group">
                <label for="rule-type">Rule Type</label>
                <select id="rule-type" name="rule_type">
                  <option value="access_control" ${rule?.rule_type === 'access_control' ? 'selected' : ''}>Access Control</option>
                  <option value="authentication_policy" ${rule?.rule_type === 'authentication_policy' ? 'selected' : ''}>Authentication Policy</option>
                  <option value="security_policy" ${rule?.rule_type === 'security_policy' ? 'selected' : ''}>Security Policy</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label for="rule-description">Description</label>
              <textarea id="rule-description" name="description" rows="3"
                        placeholder="Describe what this rule does...">${rule?.description || ''}</textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="rule-priority">Priority</label>
                <input type="number" id="rule-priority" name="priority" min="1" max="100"
                       value="${rule?.priority || 50}" placeholder="1-100 (higher = more important)">
              </div>
              <div class="form-group">
                <label class="checkbox-label">
                  <input type="checkbox" id="rule-enabled" name="is_enabled" ${rule?.is_enabled !== false ? 'checked' : ''}>
                  <span>Rule Enabled</span>
                </label>
              </div>
            </div>
          </div>

          <div class="form-section">
            <h4>Conditions</h4>
            <p class="form-help">Define when this rule should be applied. All conditions must match (AND logic).</p>
            <div id="conditions-container">
              ${rule?.conditions?.rules ? rule.conditions.rules.map((condition, index) => `
                <div class="condition-item" data-index="${index}">
                  <div class="condition-header">
                    <span class="condition-label">Condition ${index + 1}</span>
                    <button type="button" class="btn btn-sm btn-danger" onclick="removeCondition(${index})">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                  <div class="condition-fields">
                    <div class="form-row">
                      <div class="form-group">
                        <label>Property</label>
                        <select name="conditions[${index}][property]">
                          <option value="ip_address" ${condition.property === 'ip_address' ? 'selected' : ''}>IP Address</option>
                          <option value="user_agent" ${condition.property === 'user_agent' ? 'selected' : ''}>User Agent</option>
                          <option value="auth_method" ${condition.property === 'auth_method' ? 'selected' : ''}>Auth Method</option>
                          <option value="country" ${condition.property === 'country' ? 'selected' : ''}>Country</option>
                          <option value="time_of_day" ${condition.property === 'time_of_day' ? 'selected' : ''}>Time of Day</option>
                          <option value="user_verified" ${condition.property === 'user_verified' ? 'selected' : ''}>User Verified</option>
                        </select>
                      </div>
                      <div class="form-group">
                        <label>Operator</label>
                        <select name="conditions[${index}][operator]">
                          <option value="equals" ${condition.operator === 'equals' ? 'selected' : ''}>Equals</option>
                          <option value="not_equals" ${condition.operator === 'not_equals' ? 'selected' : ''}>Not Equals</option>
                          <option value="contains" ${condition.operator === 'contains' ? 'selected' : ''}>Contains</option>
                          <option value="not_contains" ${condition.operator === 'not_contains' ? 'selected' : ''}>Not Contains</option>
                          <option value="in_list" ${condition.operator === 'in_list' ? 'selected' : ''}>In List</option>
                          <option value="not_in_list" ${condition.operator === 'not_in_list' ? 'selected' : ''}>Not In List</option>
                        </select>
                      </div>
                    </div>
                    <div class="form-group">
                      <label>Value</label>
                      <input type="text" name="conditions[${index}][value]"
                             value="${condition.value || ''}" placeholder="Enter value or comma-separated list">
                    </div>
                  </div>
                </div>
              `).join('') : `
                <div class="condition-item" data-index="0">
                  <div class="condition-header">
                    <span class="condition-label">Condition 1</span>
                    <button type="button" class="btn btn-sm btn-danger" onclick="removeCondition(0)">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                  <div class="condition-fields">
                    <div class="form-row">
                      <div class="form-group">
                        <label>Property</label>
                        <select name="conditions[0][property]">
                          <option value="ip_address">IP Address</option>
                          <option value="user_agent">User Agent</option>
                          <option value="auth_method">Auth Method</option>
                          <option value="country">Country</option>
                          <option value="time_of_day">Time of Day</option>
                          <option value="user_verified">User Verified</option>
                        </select>
                      </div>
                      <div class="form-group">
                        <label>Operator</label>
                        <select name="conditions[0][operator]">
                          <option value="equals">Equals</option>
                          <option value="not_equals">Not Equals</option>
                          <option value="contains">Contains</option>
                          <option value="not_contains">Not Contains</option>
                          <option value="in_list">In List</option>
                          <option value="not_in_list">Not In List</option>
                        </select>
                      </div>
                    </div>
                    <div class="form-group">
                      <label>Value</label>
                      <input type="text" name="conditions[0][value]" placeholder="Enter value or comma-separated list">
                    </div>
                  </div>
                </div>
              `}
            </div>
            <button type="button" class="btn btn-outline" onclick="addCondition()">
              <i class="fas fa-plus"></i> Add Condition
            </button>
          </div>

          <div class="form-section">
            <h4>Actions</h4>
            <p class="form-help">Define what happens when the conditions are met.</p>
            <div id="actions-container">
              ${rule?.actions ? rule.actions.map((action, index) => `
                <div class="action-item" data-index="${index}">
                  <div class="action-header">
                    <span class="action-label">Action ${index + 1}</span>
                    <button type="button" class="btn btn-sm btn-danger" onclick="removeAction(${index})">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                  <div class="action-fields">
                    <div class="form-row">
                      <div class="form-group">
                        <label>Action Type</label>
                        <select name="actions[${index}][type]" onchange="onActionTypeChange(this, ${index})">
                          <option value="allow_methods" ${action.type === 'allow_methods' ? 'selected' : ''}>Allow Methods</option>
                          <option value="deny_methods" ${action.type === 'deny_methods' ? 'selected' : ''}>Deny Methods</option>
                          <option value="block_access" ${action.type === 'block_access' ? 'selected' : ''}>Block Access</option>
                          <option value="require_2fa" ${action.type === 'require_2fa' ? 'selected' : ''}>Require 2FA</option>
                        </select>
                      </div>
                    </div>
                    <div class="action-params" id="action-params-${index}">
                      ${getActionParamsHTML(action, index)}
                    </div>
                  </div>
                </div>
              `).join('') : `
                <div class="action-item" data-index="0">
                  <div class="action-header">
                    <span class="action-label">Action 1</span>
                    <button type="button" class="btn btn-sm btn-danger" onclick="removeAction(0)">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                  <div class="action-fields">
                    <div class="form-row">
                      <div class="form-group">
                        <label>Action Type</label>
                        <select name="actions[0][type]" onchange="onActionTypeChange(this, 0)">
                          <option value="allow_methods">Allow Methods</option>
                          <option value="deny_methods">Deny Methods</option>
                          <option value="block_access">Block Access</option>
                          <option value="require_2fa">Require 2FA</option>
                        </select>
                      </div>
                    </div>
                    <div class="action-params" id="action-params-0">
                      <div class="form-group">
                        <label>Methods</label>
                        <div class="checkbox-group">
                          <label><input type="checkbox" name="actions[0][methods][]" value="passkey"> Passkey</label>
                          <label><input type="checkbox" name="actions[0][methods][]" value="digitalid"> Digital ID</label>
                          <label><input type="checkbox" name="actions[0][methods][]" value="email_otp"> Email OTP</label>
                          <label><input type="checkbox" name="actions[0][methods][]" value="sms_otp"> SMS OTP</label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              `}
            </div>
            <button type="button" class="btn btn-outline" onclick="addAction()">
              <i class="fas fa-plus"></i> Add Action
            </button>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            <button type="submit" class="btn btn-primary">
              ${isEditing ? 'Update Rule' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

// Helper function to get action parameters HTML
function getActionParamsHTML(action, index) {
  switch (action.type) {
    case 'allow_methods':
    case 'deny_methods':
      const methods = action.methods || [];
      return `
        <div class="form-group">
          <label>Methods</label>
          <div class="checkbox-group">
            <label><input type="checkbox" name="actions[${index}][methods][]" value="passkey" ${methods.includes('passkey') ? 'checked' : ''}> Passkey</label>
            <label><input type="checkbox" name="actions[${index}][methods][]" value="digitalid" ${methods.includes('digitalid') ? 'checked' : ''}> Digital ID</label>
            <label><input type="checkbox" name="actions[${index}][methods][]" value="email_otp" ${methods.includes('email_otp') ? 'checked' : ''}> Email OTP</label>
            <label><input type="checkbox" name="actions[${index}][methods][]" value="sms_otp" ${methods.includes('sms_otp') ? 'checked' : ''}> SMS OTP</label>
          </div>
        </div>
      `;
    case 'block_access':
      return `
        <div class="form-group">
          <label>Block Reason</label>
          <input type="text" name="actions[${index}][reason]" value="${action.reason || ''}" placeholder="Reason for blocking access">
        </div>
      `;
    case 'require_2fa':
      return '<p class="form-help">This action will require 2FA for the user.</p>';
    default:
      return '';
  }
}

// Condition and action management functions
function addCondition() {
  const container = document.getElementById('conditions-container');
  const index = container.children.length;

  const conditionHTML = `
    <div class="condition-item" data-index="${index}">
      <div class="condition-header">
        <span class="condition-label">Condition ${index + 1}</span>
        <button type="button" class="btn btn-sm btn-danger" onclick="removeCondition(${index})">
          <i class="fas fa-trash"></i>
        </button>
      </div>
      <div class="condition-fields">
        <div class="form-row">
          <div class="form-group">
            <label>Property</label>
            <select name="conditions[${index}][property]">
              <option value="ip_address">IP Address</option>
              <option value="user_agent">User Agent</option>
              <option value="auth_method">Auth Method</option>
              <option value="country">Country</option>
              <option value="time_of_day">Time of Day</option>
              <option value="user_verified">User Verified</option>
            </select>
          </div>
          <div class="form-group">
            <label>Operator</label>
            <select name="conditions[${index}][operator]">
              <option value="equals">Equals</option>
              <option value="not_equals">Not Equals</option>
              <option value="contains">Contains</option>
              <option value="not_contains">Not Contains</option>
              <option value="in_list">In List</option>
              <option value="not_in_list">Not In List</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Value</label>
          <input type="text" name="conditions[${index}][value]" placeholder="Enter value or comma-separated list">
        </div>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', conditionHTML);
}

function removeCondition(index) {
  const container = document.getElementById('conditions-container');
  const condition = container.querySelector(`[data-index="${index}"]`);
  if (condition) {
    condition.remove();
    // Re-index remaining conditions
    const conditions = container.querySelectorAll('.condition-item');
    conditions.forEach((cond, i) => {
      cond.setAttribute('data-index', i);
      cond.querySelector('.condition-label').textContent = `Condition ${i + 1}`;
      cond.querySelector('button').setAttribute('onclick', `removeCondition(${i})`);
      // Update form field names
      const selects = cond.querySelectorAll('select');
      const inputs = cond.querySelectorAll('input');
      selects.forEach(select => {
        const name = select.getAttribute('name').replace(/\[\d+\]/, `[${i}]`);
        select.setAttribute('name', name);
      });
      inputs.forEach(input => {
        const name = input.getAttribute('name').replace(/\[\d+\]/, `[${i}]`);
        input.setAttribute('name', name);
      });
    });
  }
}

function addAction() {
  const container = document.getElementById('actions-container');
  const index = container.children.length;

  const actionHTML = `
    <div class="action-item" data-index="${index}">
      <div class="action-header">
        <span class="action-label">Action ${index + 1}</span>
        <button type="button" class="btn btn-sm btn-danger" onclick="removeAction(${index})">
          <i class="fas fa-trash"></i>
        </button>
      </div>
      <div class="action-fields">
        <div class="form-row">
          <div class="form-group">
            <label>Action Type</label>
            <select name="actions[${index}][type]" onchange="onActionTypeChange(this, ${index})">
              <option value="allow_methods">Allow Methods</option>
              <option value="deny_methods">Deny Methods</option>
              <option value="block_access">Block Access</option>
              <option value="require_2fa">Require 2FA</option>
            </select>
          </div>
        </div>
        <div class="action-params" id="action-params-${index}">
          <div class="form-group">
            <label>Methods</label>
            <div class="checkbox-group">
              <label><input type="checkbox" name="actions[${index}][methods][]" value="passkey"> Passkey</label>
              <label><input type="checkbox" name="actions[${index}][methods][]" value="digitalid"> Digital ID</label>
              <label><input type="checkbox" name="actions[${index}][methods][]" value="email_otp"> Email OTP</label>
              <label><input type="checkbox" name="actions[${index}][methods][]" value="sms_otp"> SMS OTP</label>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', actionHTML);
}

function removeAction(index) {
  const container = document.getElementById('actions-container');
  const action = container.querySelector(`[data-index="${index}"]`);
  if (action) {
    action.remove();
    // Re-index remaining actions
    const actions = container.querySelectorAll('.action-item');
    actions.forEach((act, i) => {
      act.setAttribute('data-index', i);
      act.querySelector('.action-label').textContent = `Action ${i + 1}`;
      act.querySelector('select').setAttribute('onchange', `onActionTypeChange(this, ${i})`);
      // Update form field names
      const selects = act.querySelectorAll('select');
      const inputs = act.querySelectorAll('input');
      selects.forEach(select => {
        const name = select.getAttribute('name').replace(/\[\d+\]/, `[${i}]`);
        select.setAttribute('name', name);
      });
      inputs.forEach(input => {
        const name = input.getAttribute('name').replace(/\[\d+\]/, `[${i}]`);
        input.setAttribute('name', name);
      });
    });
  }
}

function onActionTypeChange(select, index) {
  const actionType = select.value;
  const paramsContainer = document.getElementById(`action-params-${index}`);

  let paramsHTML = '';
  switch (actionType) {
    case 'allow_methods':
    case 'deny_methods':
      paramsHTML = `
        <div class="form-group">
          <label>Methods</label>
          <div class="checkbox-group">
            <label><input type="checkbox" name="actions[${index}][methods][]" value="passkey"> Passkey</label>
            <label><input type="checkbox" name="actions[${index}][methods][]" value="digitalid"> Digital ID</label>
            <label><input type="checkbox" name="actions[${index}][methods][]" value="email_otp"> Email OTP</label>
            <label><input type="checkbox" name="actions[${index}][methods][]" value="sms_otp"> SMS OTP</label>
          </div>
        </div>
      `;
      break;
    case 'block_access':
      paramsHTML = `
        <div class="form-group">
          <label>Block Reason</label>
          <input type="text" name="actions[${index}][reason]" placeholder="Reason for blocking access">
        </div>
      `;
      break;
    case 'require_2fa':
      paramsHTML = '<p class="form-help">This action will require 2FA for the user.</p>';
      break;
  }

  paramsContainer.innerHTML = paramsHTML;
}

async function handleRuleSubmit(event, ruleId) {
  event.preventDefault();
  const { fetchAPI, showNotification } = window.adminApp;

  const formData = new FormData(event.target);
  const ruleData = {
    name: formData.get('name'),
    rule_type: formData.get('rule_type'),
    description: formData.get('description'),
    priority: parseInt(formData.get('priority')) || 50,
    is_enabled: formData.has('is_enabled')
  };

  // Parse conditions
  const conditions = [];
  let conditionIndex = 0;
  while (true) {
    const property = formData.get(`conditions[${conditionIndex}][property]`);
    if (!property) break;

    conditions.push({
      property,
      operator: formData.get(`conditions[${conditionIndex}][operator]`),
      value: formData.get(`conditions[${conditionIndex}][value]`)
    });
    conditionIndex++;
  }

  ruleData.conditions = {
    operator: 'AND', // For now, always AND
    rules: conditions
  };

  // Parse actions
  const actions = [];
  let actionIndex = 0;
  while (true) {
    const type = formData.get(`actions[${actionIndex}][type]`);
    if (!type) break;

    const action = { type };

    if (type === 'allow_methods' || type === 'deny_methods') {
      const methods = formData.getAll(`actions[${actionIndex}][methods][]`);
      action.methods = methods;
    } else if (type === 'block_access') {
      action.reason = formData.get(`actions[${actionIndex}][reason]`);
    }

    actions.push(action);
    actionIndex++;
  }

  ruleData.actions = actions;

  try {
    if (ruleId) {
      // Update existing rule
      await fetchAPI(`/admin/rules/${ruleId}`, {
        method: 'PUT',
        body: JSON.stringify(ruleData)
      });
      showNotification('Rule updated successfully', 'success');
    } else {
      // Create new rule
      await fetchAPI('/admin/rules', {
        method: 'POST',
        body: JSON.stringify(ruleData)
      });
      showNotification('Rule created successfully', 'success');
    }

    // Close modal and refresh rules list
    event.target.closest('.modal-overlay').remove();
    loadRules();
  } catch (error) {
    console.error('Error saving rule:', error);
    showNotification(`Failed to ${ruleId ? 'update' : 'create'} rule`, 'error');
  }
}

function showTestRuleModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };

  modal.innerHTML = `
    <div class="modal-content large">
      <div class="modal-header">
        <h3>Test Authentication Rules</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <form id="test-rule-form" onsubmit="handleRuleTest(event)">
          <div class="form-section">
            <h4>Test Context</h4>
            <p class="form-help">Enter the authentication context to test against your rules.</p>

            <div class="form-row">
              <div class="form-group">
                <label for="test-ip">IP Address</label>
                <input type="text" id="test-ip" name="ip_address" placeholder="192.168.1.1">
              </div>
              <div class="form-group">
                <label for="test-country">Country</label>
                <input type="text" id="test-country" name="country" placeholder="US">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="test-auth-method">Auth Method</label>
                <select id="test-auth-method" name="auth_method">
                  <option value="">Select method...</option>
                  <option value="passkey">Passkey</option>
                  <option value="digitalid">Digital ID</option>
                  <option value="email_otp">Email OTP</option>
                  <option value="sms_otp">SMS OTP</option>
                </select>
              </div>
              <div class="form-group">
                <label for="test-user-agent">User Agent</label>
                <input type="text" id="test-user-agent" name="user_agent" placeholder="Mozilla/5.0...">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="test-time">Time of Day (HH:MM)</label>
                <input type="time" id="test-time" name="time_of_day">
              </div>
              <div class="form-group">
                <label class="checkbox-label">
                  <input type="checkbox" id="test-user-verified" name="user_verified">
                  <span>User Verified</span>
                </label>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            <button type="submit" class="btn btn-primary">
              <i class="fas fa-play"></i> Run Test
            </button>
          </div>
        </form>

        <div id="test-results" class="test-results" style="display: none;">
          <h4>Test Results</h4>
          <div id="test-output"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

async function handleRuleTest(event) {
  event.preventDefault();
  const { fetchAPI, showNotification } = window.adminApp;

  const formData = new FormData(event.target);
  const testContext = {
    ip_address: formData.get('ip_address') || undefined,
    country: formData.get('country') || undefined,
    auth_method: formData.get('auth_method') || undefined,
    user_agent: formData.get('user_agent') || undefined,
    time_of_day: formData.get('time_of_day') || undefined,
    user_verified: formData.has('user_verified')
  };

  // Remove undefined values
  Object.keys(testContext).forEach(key => {
    if (testContext[key] === undefined) {
      delete testContext[key];
    }
  });

  try {
    const result = await fetchAPI('/admin/test-rule', {
      method: 'POST',
      body: JSON.stringify({ context: testContext })
    });

    displayTestResults(result);
  } catch (error) {
    console.error('Error testing rules:', error);
    showNotification('Failed to test rules', 'error');
  }
}

function displayTestResults(result) {
  const resultsDiv = document.getElementById('test-results');
  const outputDiv = document.getElementById('test-output');

  let html = `
    <div class="test-summary">
      <div class="summary-item">
        <strong>Access Allowed:</strong>
        <span class="badge ${result.allowed ? 'badge-success' : 'badge-danger'}">
          ${result.allowed ? 'Yes' : 'No'}
        </span>
      </div>
      ${result.blockReason ? `
        <div class="summary-item">
          <strong>Block Reason:</strong> ${result.blockReason}
        </div>
      ` : ''}
    </div>

    <div class="test-details">
      <div class="methods-section">
        <h5>Allowed Methods</h5>
        <div class="methods-list">
          ${result.allowedMethods.length > 0 ?
            result.allowedMethods.map(method => `<span class="method-tag">${method}</span>`).join('') :
            '<span class="no-methods">None</span>'
          }
        </div>
      </div>

      <div class="methods-section">
        <h5>Denied Methods</h5>
        <div class="methods-list">
          ${result.deniedMethods.length > 0 ?
            result.deniedMethods.map(method => `<span class="method-tag denied">${method}</span>`).join('') :
            '<span class="no-methods">None</span>'
          }
        </div>
      </div>

      ${result.appliedRules.length > 0 ? `
        <div class="applied-rules">
          <h5>Applied Rules</h5>
          <div class="rules-list">
            ${result.appliedRules.map(rule => `
              <div class="applied-rule">
                <strong>${rule.name}</strong> (Priority: ${rule.priority})
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  outputDiv.innerHTML = html;
  resultsDiv.style.display = 'block';
}

// Export functions to window
window.loadDashboard = loadDashboard;
window.loadActivity = loadActivity;
window.loadUsers = loadUsers;
window.loadRules = loadRules;
window.viewUserDetails = viewUserDetails;
window.showCreateRuleModal = showCreateRuleModal;
window.showTestRuleModal = showTestRuleModal;
window.toggleRule = toggleRule;
window.deleteRule = deleteRule;
window.editRule = editRule;
window.handleRuleSubmit = handleRuleSubmit;
window.addCondition = addCondition;
window.removeCondition = removeCondition;
window.addAction = addAction;
window.removeAction = removeAction;
window.onActionTypeChange = onActionTypeChange;
