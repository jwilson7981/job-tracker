/* Activity Log & User Stats */
let autoRefreshTimer = null;

function switchTab(tab, btn) {
    document.getElementById('tabFeed').style.display = tab === 'feed' ? '' : 'none';
    document.getElementById('tabStats').style.display = tab === 'stats' ? '' : 'none';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (tab === 'feed') loadActivityFeed();
    else loadUserStats();
}

function clearFilters() {
    document.getElementById('filterUser').value = '';
    document.getElementById('filterAction').value = '';
    document.getElementById('filterEntity').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    loadActivityFeed();
}

function formatTime(dt) {
    if (!dt) return '';
    const d = new Date(dt.replace(' ', 'T'));
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400 && d.getDate() === now.getDate()) {
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatMinutes(mins) {
    if (!mins || mins === 0) return '0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

function actionBadge(action) {
    const colors = {
        login: '#2196F3', logout: '#9E9E9E', create: '#4CAF50', update: '#FF9800',
        delete: '#F44336', approve: '#8BC34A', submit: '#03A9F4',
        generate_pdf: '#9C27B0', email: '#00BCD4'
    };
    const color = colors[action] || '#757575';
    return `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;white-space:nowrap;">${action.replace('_', ' ')}</span>`;
}

async function loadActivityFeed() {
    const params = new URLSearchParams();
    const uid = document.getElementById('filterUser').value;
    const action = document.getElementById('filterAction').value;
    const entity = document.getElementById('filterEntity').value;
    const from = document.getElementById('filterDateFrom').value;
    const to = document.getElementById('filterDateTo').value;
    if (uid) params.set('user_id', uid);
    if (action) params.set('action', action);
    if (entity) params.set('entity_type', entity);
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);

    try {
        const res = await fetch('/api/admin/activity-log?' + params);
        const data = await res.json();
        const tbody = document.getElementById('feedBody');
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--gray-400);">No activity found</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(r => `<tr>
            <td style="white-space:nowrap;font-size:13px;">${formatTime(r.created_at)}</td>
            <td><strong>${r.display_name || r.username}</strong></td>
            <td>${actionBadge(r.action)}</td>
            <td style="font-size:13px;">${(r.entity_type || '').replace('_', ' ')}</td>
            <td>${r.description || ''}</td>
            <td style="font-size:12px;color:var(--gray-400);">${r.ip_address || ''}</td>
        </tr>`).join('');
    } catch (e) {
        document.getElementById('feedBody').innerHTML = '<tr><td colspan="6">Error loading activity</td></tr>';
    }
}

async function loadUserStats() {
    try {
        const res = await fetch('/api/admin/user-stats');
        const data = await res.json();
        const grid = document.getElementById('statsGrid');
        if (!data.length) {
            grid.innerHTML = '<p style="color:var(--gray-400);">No users found</p>';
            return;
        }
        grid.innerHTML = data.map(u => `
            <div style="background:var(--gray-800);border:1px solid var(--gray-700);border-radius:8px;padding:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <div>
                        <strong style="font-size:16px;">${u.display_name || u.username}</strong>
                        <div style="font-size:12px;color:var(--gray-400);">${u.role.replace('_', ' ')}</div>
                    </div>
                    <div style="font-size:12px;color:var(--gray-400);">${u.last_active ? 'Last: ' + formatTime(u.last_active) : 'Never active'}</div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div style="background:var(--gray-900);padding:8px 12px;border-radius:6px;">
                        <div style="font-size:11px;color:var(--gray-400);text-transform:uppercase;">Actions Today</div>
                        <div style="font-size:20px;font-weight:600;">${u.today_actions}</div>
                    </div>
                    <div style="background:var(--gray-900);padding:8px 12px;border-radius:6px;">
                        <div style="font-size:11px;color:var(--gray-400);text-transform:uppercase;">Time Today</div>
                        <div style="font-size:20px;font-weight:600;">${formatMinutes(u.time_today_min)}</div>
                    </div>
                    <div style="background:var(--gray-900);padding:8px 12px;border-radius:6px;">
                        <div style="font-size:11px;color:var(--gray-400);text-transform:uppercase;">Actions This Week</div>
                        <div style="font-size:20px;font-weight:600;">${u.week_actions}</div>
                    </div>
                    <div style="background:var(--gray-900);padding:8px 12px;border-radius:6px;">
                        <div style="font-size:11px;color:var(--gray-400);text-transform:uppercase;">Time This Week</div>
                        <div style="font-size:20px;font-weight:600;">${formatMinutes(u.time_week_min)}</div>
                    </div>
                </div>
                <div style="margin-top:8px;font-size:12px;color:var(--gray-400);text-align:right;">
                    Total: ${u.total_actions} actions
                </div>
            </div>
        `).join('');
    } catch (e) {
        document.getElementById('statsGrid').innerHTML = '<p>Error loading stats</p>';
    }
}

// Populate user filter dropdown
async function loadUserFilter() {
    try {
        const res = await fetch('/api/users/list');
        const users = await res.json();
        const sel = document.getElementById('filterUser');
        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.display_name || u.username;
            sel.appendChild(opt);
        });
    } catch (e) {}
}

// Auto-refresh toggle
document.getElementById('autoRefresh').addEventListener('change', function() {
    if (this.checked) {
        autoRefreshTimer = setInterval(() => {
            if (document.getElementById('tabFeed').style.display !== 'none') loadActivityFeed();
            else loadUserStats();
        }, 30000);
    } else {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
});

// Init
loadUserFilter();
loadActivityFeed();
