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
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `
    <div class="page-header">
      <h1>Rules Management</h1>
      <p>Create and manage authentication rules</p>
    </div>
    <div class="card">
      <div class="empty-state">
        <i class="fas fa-cogs"></i>
        <h3>Rules Management</h3>
        <p>Rules management interface is under development</p>
      </div>
    </div>
  `;
}

// Export functions to window
window.loadDashboard = loadDashboard;
window.loadActivity = loadActivity;
window.loadUsers = loadUsers;
window.loadRules = loadRules;
window.viewUserDetails = viewUserDetails;
