/**
 * Dashboard Page - Admin Portal
 * Shows analytics and recent activity
 */

async function loadDashboard() {
  const { fetchAPI, formatRelativeTime } = window.adminApp;
  
  try {
    // Fetch analytics data
    const { stats } = await fetchasync function loadActivity() {
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
            <button id="activity-search-btn" class="btn btn-primary">
              <i class="fas fa-search"></i> Search
            </button>
            <button id="activity-export-btn" class="btn btn-outline">
              <i class="fas fa-download"></i> Export
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Activity Logs</h3>
        <span id="activity-count-badge" class="badge badge-primary">0 entries</span>
      </div>
      <div class="card-body">
        <div id="activity-table-container">
          <div class="loading-spinner"></div>
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
                  <div>${formatRelativeTime(act.created_at)}</div>
                  <small style="color: var(--text-secondary);">${formatDate(act.created_at)}</small>
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
        act.created_at
      ].map(field => `"${field}"`).join(','))
    ].join('\n');
    
    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
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
}ytics');
    
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
  const { fetchAPI, formatDate, formatRelativeTime, showNotification } = window.adminApp;
  const pageContent = document.getElementById('page-content');

  pageContent.innerHTML = `
    <div class="page-header">
      <h1>Rules Management</h1>
      <p>Create and manage authentication rules</p>
      <div class="page-actions">
        <button id="create-rule-btn" class="btn btn-primary">
          <i class="fas fa-plus"></i> Create Rule
        </button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Authentication Rules</h3>
        <span id="rules-count-badge" class="badge badge-primary">0 rules</span>
      </div>
      <div class="card-body">
        <div id="rules-table-container">
          <div class="loading-spinner"></div>
        </div>
      </div>
    </div>

    <!-- Rule Builder Modal -->
    <div id="rule-modal" class="modal-overlay" style="display: none;">
      <div class="modal-content" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
        <div class="modal-header">
          <h2 id="rule-modal-title">Create Rule</h2>
          <button class="modal-close" onclick="closeRuleModal()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <form id="rule-form">
            <!-- Basic Info -->
            <div style="margin-bottom: 24px;">
              <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Rule Name *</label>
                <input type="text" id="rule-name" class="form-control" placeholder="e.g., Block Russian IPs" required>
              </div>
              <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Description</label>
                <textarea id="rule-description" class="form-control" rows="3" placeholder="Describe what this rule does..."></textarea>
              </div>
              <div>
                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Priority</label>
                <input type="number" id="rule-priority" class="form-control" value="10" min="1" max="100" style="width: 100px;">
                <small style="color: var(--text-secondary);">Lower numbers = higher priority (1 = highest)</small>
              </div>
            </div>

            <!-- Conditions Builder -->
            <div style="margin-bottom: 24px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0;">Conditions</h3>
                <button type="button" class="btn btn-sm btn-outline" onclick="addCondition()">
                  <i class="fas fa-plus"></i> Add Condition
                </button>
              </div>
              <div id="conditions-container">
                <div class="condition-item" data-condition-id="0">
                  <div style="display: grid; grid-template-columns: 1fr auto 1fr auto 1fr auto auto; gap: 8px; align-items: center; margin-bottom: 8px;">
                    <select class="form-control condition-field" onchange="updateConditionFields(this)">
                      <option value="">Select Field...</option>
                      <option value="ip_address">IP Address</option>
                      <option value="geo_country">Country</option>
                      <option value="geo_city">City</option>
                      <option value="username">Username</option>
                      <option value="email">Email</option>
                    </select>
                    <span style="color: var(--text-secondary);">is</span>
                    <select class="form-control condition-operator">
                      <option value="equals">equals</option>
                      <option value="not_equals">not equals</option>
                      <option value="contains">contains</option>
                      <option value="not_contains">does not contain</option>
                      <option value="in">in list</option>
                      <option value="not_in">not in list</option>
                      <option value="ip_in_range">in IP range</option>
                    </select>
                    <span style="color: var(--text-secondary);">value</span>
                    <input type="text" class="form-control condition-value" placeholder="Enter value...">
                    <button type="button" class="btn btn-sm btn-danger" onclick="removeCondition(this)">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
              <div style="margin-top: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600;">Logic Operator</label>
                <select id="rule-operator" class="form-control" style="width: 150px;">
                  <option value="AND">AND (all conditions must match)</option>
                  <option value="OR">OR (any condition must match)</option>
                </select>
              </div>
            </div>

            <!-- Actions -->
            <div style="margin-bottom: 24px;">
              <h3 style="margin-bottom: 16px;">Actions</h3>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                  <label style="display: block; margin-bottom: 8px; font-weight: 600;">Action Type</label>
                  <select id="rule-action-type" class="form-control" onchange="updateActionFields()">
                    <option value="block">Block Access</option>
                    <option value="deny_methods">Deny Specific Methods</option>
                    <option value="allow_only_methods">Allow Only Specific Methods</option>
                    <option value="require_method">Require Specific Method</option>
                  </select>
                </div>
                <div id="action-methods-container" style="display: none;">
                  <label style="display: block; margin-bottom: 8px; font-weight: 600;">Methods</label>
                  <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    <label style="display: flex; align-items: center; gap: 4px;">
                      <input type="checkbox" class="action-method" value="passkey"> Passkey
                    </label>
                    <label style="display: flex; align-items: center; gap: 4px;">
                      <input type="checkbox" class="action-method" value="digitalid"> Digital ID
                    </label>
                    <label style="display: flex; align-items: center; gap: 4px;">
                      <input type="checkbox" class="action-method" value="email_otp"> Email OTP
                    </label>
                    <label style="display: flex; align-items: center; gap: 4px;">
                      <input type="checkbox" class="action-method" value="sms_otp"> SMS OTP
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <!-- Test Rule -->
            <div style="margin-bottom: 24px; padding: 16px; background: var(--bg-secondary); border-radius: 8px;">
              <h4 style="margin-bottom: 12px;">Test Rule</h4>
              <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end;">
                <textarea id="test-context" class="form-control" rows="3" placeholder='{"ip_address": "192.168.1.1", "geo_country": "Russia", "username": "testuser"}'></textarea>
                <button type="button" class="btn btn-outline" onclick="testRule()" style="height: fit-content;">
                  <i class="fas fa-play"></i> Test
                </button>
              </div>
              <div id="test-result" style="margin-top: 8px; display: none;"></div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeRuleModal()">Cancel</button>
          <button type="button" class="btn btn-primary" onclick="saveRule()">Save Rule</button>
        </div>
      </div>
    </div>
  `;

  // Attach event listeners
  document.getElementById('create-rule-btn').addEventListener('click', () => openRuleModal());

  // Load rules
  await loadRulesTable();
}

async function loadRulesTable() {
  const { fetchAPI, formatDate, formatRelativeTime, showNotification } = window.adminApp;
  const container = document.getElementById('rules-table-container');
  const countBadge = document.getElementById('rules-count-badge');

  try {
    const { rules } = await fetchAPI('/admin/rules');

    countBadge.textContent = `${rules.length} rule${rules.length !== 1 ? 's' : ''}`;

    if (rules.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No rules created yet</p></div>';
      return;
    }

    container.innerHTML = `
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rules.map(rule => `
              <tr>
                <td><strong>${rule.name}</strong></td>
                <td>${rule.description || '-'}</td>
                <td>
                  <span class="badge badge-secondary">${rule.priority}</span>
                </td>
                <td>
                  ${rule.is_active
                    ? `<span class="badge badge-success">Active</span>`
                    : `<span class="badge badge-secondary">Inactive</span>`
                  }
                </td>
                <td>${formatRelativeTime(rule.created_at)}</td>
                <td>
                  <div style="display: flex; gap: 4px;">
                    <button class="btn btn-sm btn-outline" onclick="editRule('${rule.id}')">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="toggleRule('${rule.id}', ${!rule.is_active})">
                      <i class="fas fa-${rule.is_active ? 'pause' : 'play'}"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteRule('${rule.id}', '${rule.name}')">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    console.error('Error loading rules:', error);
    container.innerHTML = '<div class="empty-state"><p>Error loading rules</p></div>';
    showNotification('Failed to load rules', 'error');
  }
}

function openRuleModal(rule = null) {
  const modal = document.getElementById('rule-modal');
  const title = document.getElementById('rule-modal-title');

  if (rule) {
    title.textContent = 'Edit Rule';
    // Populate form with rule data
    document.getElementById('rule-name').value = rule.name || '';
    document.getElementById('rule-description').value = rule.description || '';
    document.getElementById('rule-priority').value = rule.priority || 10;
    document.getElementById('rule-operator').value = rule.conditions?.operator || 'AND';

    // Load conditions
    loadRuleConditions(rule.conditions);

    // Load actions
    loadRuleActions(rule.actions);

    // Store rule ID for editing
    modal.dataset.ruleId = rule.id;
  } else {
    title.textContent = 'Create Rule';
    // Reset form
    document.getElementById('rule-form').reset();
    document.getElementById('rule-priority').value = 10;
    document.getElementById('rule-operator').value = 'AND';

    // Reset conditions to one empty condition
    document.getElementById('conditions-container').innerHTML = `
      <div class="condition-item" data-condition-id="0">
        <div style="display: grid; grid-template-columns: 1fr auto 1fr auto 1fr auto auto; gap: 8px; align-items: center; margin-bottom: 8px;">
          <select class="form-control condition-field" onchange="updateConditionFields(this)">
            <option value="">Select Field...</option>
            <option value="ip_address">IP Address</option>
            <option value="geo_country">Country</option>
            <option value="geo_city">City</option>
            <option value="username">Username</option>
            <option value="email">Email</option>
          </select>
          <span style="color: var(--text-secondary);">is</span>
          <select class="form-control condition-operator">
            <option value="equals">equals</option>
            <option value="not_equals">not equals</option>
            <option value="contains">contains</option>
            <option value="not_contains">does not contain</option>
            <option value="in">in list</option>
            <option value="not_in">not in list</option>
            <option value="ip_in_range">in IP range</option>
          </select>
          <span style="color: var(--text-secondary);">value</span>
          <input type="text" class="form-control condition-value" placeholder="Enter value...">
          <button type="button" class="btn btn-sm btn-danger" onclick="removeCondition(this)">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;

    // Reset actions
    document.getElementById('rule-action-type').value = 'block';
    updateActionFields();

    delete modal.dataset.ruleId;
  }

  modal.style.display = 'flex';
}

function closeRuleModal() {
  document.getElementById('rule-modal').style.display = 'none';
  document.getElementById('test-result').style.display = 'none';
}

function addCondition() {
  const container = document.getElementById('conditions-container');
  const conditionId = Date.now(); // Simple unique ID

  const conditionHtml = `
    <div class="condition-item" data-condition-id="${conditionId}">
      <div style="display: grid; grid-template-columns: 1fr auto 1fr auto 1fr auto auto; gap: 8px; align-items: center; margin-bottom: 8px;">
        <select class="form-control condition-field" onchange="updateConditionFields(this)">
          <option value="">Select Field...</option>
          <option value="ip_address">IP Address</option>
          <option value="geo_country">Country</option>
          <option value="geo_city">City</option>
          <option value="username">Username</option>
          <option value="email">Email</option>
        </select>
        <span style="color: var(--text-secondary);">is</span>
        <select class="form-control condition-operator">
          <option value="equals">equals</option>
          <option value="not_equals">not equals</option>
          <option value="contains">contains</option>
          <option value="not_contains">does not contain</option>
          <option value="in">in list</option>
          <option value="not_in">not in list</option>
          <option value="ip_in_range">in IP range</option>
        </select>
        <span style="color: var(--text-secondary);">value</span>
        <input type="text" class="form-control condition-value" placeholder="Enter value...">
        <button type="button" class="btn btn-sm btn-danger" onclick="removeCondition(this)">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', conditionHtml);
}

function removeCondition(button) {
  const conditionItem = button.closest('.condition-item');
  const container = document.getElementById('conditions-container');

  // Don't remove if it's the last condition
  if (container.children.length > 1) {
    conditionItem.remove();
  } else {
    // Reset the last condition instead
    const selects = conditionItem.querySelectorAll('select');
    const inputs = conditionItem.querySelectorAll('input');
    selects.forEach(select => select.value = '');
    inputs.forEach(input => input.value = '');
  }
}

function updateConditionFields(select) {
  const conditionItem = select.closest('.condition-item');
  const operatorSelect = conditionItem.querySelector('.condition-operator');
  const valueInput = conditionItem.querySelector('.condition-value');

  // Update placeholder based on field type
  const field = select.value;
  if (field === 'ip_address') {
    valueInput.placeholder = '192.168.1.1 or 192.168.0.0/16';
  } else if (field === 'geo_country') {
    valueInput.placeholder = 'Russia, United States, etc.';
  } else if (field === 'geo_city') {
    valueInput.placeholder = 'Moscow, New York, etc.';
  } else {
    valueInput.placeholder = 'Enter value...';
  }
}

function updateActionFields() {
  const actionType = document.getElementById('rule-action-type').value;
  const methodsContainer = document.getElementById('action-methods-container');

  if (actionType === 'block') {
    methodsContainer.style.display = 'none';
  } else {
    methodsContainer.style.display = 'block';
  }
}

function loadRuleConditions(conditions) {
  const container = document.getElementById('conditions-container');
  container.innerHTML = '';

  if (!conditions || !conditions.rules || conditions.rules.length === 0) {
    addCondition();
    return;
  }

  conditions.rules.forEach((condition, index) => {
    const conditionId = Date.now() + index;
    const conditionHtml = `
      <div class="condition-item" data-condition-id="${conditionId}">
        <div style="display: grid; grid-template-columns: 1fr auto 1fr auto 1fr auto auto; gap: 8px; align-items: center; margin-bottom: 8px;">
          <select class="form-control condition-field" onchange="updateConditionFields(this)">
            <option value="">Select Field...</option>
            <option value="ip_address" ${condition.field === 'ip_address' ? 'selected' : ''}>IP Address</option>
            <option value="geo_country" ${condition.field === 'geo_country' ? 'selected' : ''}>Country</option>
            <option value="geo_city" ${condition.field === 'geo_city' ? 'selected' : ''}>City</option>
            <option value="username" ${condition.field === 'username' ? 'selected' : ''}>Username</option>
            <option value="email" ${condition.field === 'email' ? 'selected' : ''}>Email</option>
          </select>
          <span style="color: var(--text-secondary);">is</span>
          <select class="form-control condition-operator">
            <option value="equals" ${condition.operator === 'equals' ? 'selected' : ''}>equals</option>
            <option value="not_equals" ${condition.operator === 'not_equals' ? 'selected' : ''}>not equals</option>
            <option value="contains" ${condition.operator === 'contains' ? 'selected' : ''}>contains</option>
            <option value="not_contains" ${condition.operator === 'not_contains' ? 'selected' : ''}>does not contain</option>
            <option value="in" ${condition.operator === 'in' ? 'selected' : ''}>in list</option>
            <option value="not_in" ${condition.operator === 'not_in' ? 'selected' : ''}>not in list</option>
            <option value="ip_in_range" ${condition.operator === 'ip_in_range' ? 'selected' : ''}>in IP range</option>
          </select>
          <span style="color: var(--text-secondary);">value</span>
          <input type="text" class="form-control condition-value" placeholder="Enter value..." value="${condition.value || ''}">
          <button type="button" class="btn btn-sm btn-danger" onclick="removeCondition(this)">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', conditionHtml);
  });
}

function loadRuleActions(actions) {
  if (!actions) return;

  document.getElementById('rule-action-type').value = actions.type || 'block';

  if (actions.methods && actions.methods.length > 0) {
    document.querySelectorAll('.action-method').forEach(checkbox => {
      checkbox.checked = actions.methods.includes(checkbox.value);
    });
  }

  updateActionFields();
}

async function saveRule() {
  const { fetchAPI, showNotification } = window.adminApp;

  // Validate form
  const name = document.getElementById('rule-name').value.trim();
  if (!name) {
    showNotification('Rule name is required', 'error');
    return;
  }

  // Build conditions
  const conditions = {
    operator: document.getElementById('rule-operator').value,
    rules: []
  };

  document.querySelectorAll('.condition-item').forEach(item => {
    const field = item.querySelector('.condition-field').value;
    const operator = item.querySelector('.condition-operator').value;
    const value = item.querySelector('.condition-value').value.trim();

    if (field && value) {
      conditions.rules.push({ field, operator, value });
    }
  });

  if (conditions.rules.length === 0) {
    showNotification('At least one condition is required', 'error');
    return;
  }

  // Build actions
  const actionType = document.getElementById('rule-action-type').value;
  const actions = { type: actionType };

  if (actionType !== 'block') {
    const selectedMethods = Array.from(document.querySelectorAll('.action-method:checked')).map(cb => cb.value);
    if (selectedMethods.length === 0) {
      showNotification('At least one method must be selected', 'error');
      return;
    }
    actions.methods = selectedMethods;
  }

  const ruleData = {
    name: name,
    description: document.getElementById('rule-description').value.trim(),
    conditions: conditions,
    actions: actions,
    priority: parseInt(document.getElementById('rule-priority').value) || 10
  };

  try {
    const modal = document.getElementById('rule-modal');
    const ruleId = modal.dataset.ruleId;

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

    closeRuleModal();
    await loadRulesTable();
  } catch (error) {
    console.error('Error saving rule:', error);
    showNotification('Failed to save rule', 'error');
  }
}

async function editRule(ruleId) {
  const { fetchAPI, showNotification } = window.adminApp;

  try {
    const rule = await fetchAPI(`/admin/rules/${ruleId}`);
    openRuleModal(rule);
  } catch (error) {
    console.error('Error loading rule:', error);
    showNotification('Failed to load rule', 'error');
  }
}

async function deleteRule(ruleId, ruleName) {
  const { fetchAPI, showNotification } = window.adminApp;

  if (!confirm(`Are you sure you want to delete the rule "${ruleName}"? This action cannot be undone.`)) {
    return;
  }

  try {
    await fetchAPI(`/admin/rules/${ruleId}`, { method: 'DELETE' });
    showNotification('Rule deleted successfully', 'success');
    await loadRulesTable();
  } catch (error) {
    console.error('Error deleting rule:', error);
    showNotification('Failed to delete rule', 'error');
  }
}

async function toggleRule(ruleId, activate) {
  const { fetchAPI, showNotification } = window.adminApp;

  try {
    await fetchAPI(`/admin/rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: activate })
    });
    showNotification(`Rule ${activate ? 'activated' : 'deactivated'} successfully`, 'success');
    await loadRulesTable();
  } catch (error) {
    console.error('Error toggling rule:', error);
    showNotification('Failed to update rule status', 'error');
  }
}

async function testRule() {
  const { fetchAPI, showNotification } = window.adminApp;

  try {
    const contextText = document.getElementById('test-context').value.trim();
    if (!contextText) {
      showNotification('Please enter test context', 'error');
      return;
    }

    let context;
    try {
      context = JSON.parse(contextText);
    } catch (e) {
      showNotification('Invalid JSON in test context', 'error');
      return;
    }

    // Build rule from form
    const conditions = {
      operator: document.getElementById('rule-operator').value,
      rules: []
    };

    document.querySelectorAll('.condition-item').forEach(item => {
      const field = item.querySelector('.condition-field').value;
      const operator = item.querySelector('.condition-operator').value;
      const value = item.querySelector('.condition-value').value.trim();

      if (field && value) {
        conditions.rules.push({ field, operator, value });
      }
    });

    const actionType = document.getElementById('rule-action-type').value;
    const actions = { type: actionType };

    if (actionType !== 'block') {
      const selectedMethods = Array.from(document.querySelectorAll('.action-method:checked')).map(cb => cb.value);
      actions.methods = selectedMethods;
    }

    const rule = {
      conditions,
      actions,
      priority: parseInt(document.getElementById('rule-priority').value) || 10
    };

    const result = await fetchAPI('/admin/test-rule', {
      method: 'POST',
      body: JSON.stringify({ rule, context })
    });

    const resultDiv = document.getElementById('test-result');
    resultDiv.style.display = 'block';

    if (result.result.allowed === false) {
      resultDiv.innerHTML = `
        <div style="padding: 12px; background: var(--danger); color: white; border-radius: 4px;">
          <i class="fas fa-times-circle"></i> Rule would BLOCK access
          ${result.result.blockReason ? `<br><small>Reason: ${result.result.blockReason}</small>` : ''}
        </div>
      `;
    } else {
      const allowedMethods = result.result.allowedMethods || [];
      resultDiv.innerHTML = `
        <div style="padding: 12px; background: var(--success); color: white; border-radius: 4px;">
          <i class="fas fa-check-circle"></i> Rule would ALLOW access
          ${allowedMethods.length > 0 ? `<br><small>Allowed methods: ${allowedMethods.join(', ')}</small>` : ''}
        </div>
      `;
    }
  } catch (error) {
    console.error('Error testing rule:', error);
    showNotification('Failed to test rule', 'error');
  }
}

// Export functions to window
window.loadRulesTable = loadRulesTable;
window.openRuleModal = openRuleModal;
window.closeRuleModal = closeRuleModal;
window.addCondition = addCondition;
window.removeCondition = removeCondition;
window.updateConditionFields = updateConditionFields;
window.updateActionFields = updateActionFields;
window.saveRule = saveRule;
window.editRule = editRule;
window.deleteRule = deleteRule;
window.toggleRule = toggleRule;
window.testRule = testRule;

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
