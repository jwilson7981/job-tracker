/* Activity Log & User Stats */
let autoRefreshTimer = null;

function switchActivityTab(tab, btn) {
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
        if (!res.ok) { console.error('Activity log API error:', res.status); }
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
        const roleBadge = (role) => {
            const colors = {
                owner: 'background:#EEF2FF;color:#3730A3;',
                admin: 'background:#DBEAFE;color:#1E40AF;',
                project_manager: 'background:#FEF9C3;color:#92400E;',
                warehouse: 'background:#E0E7FF;color:#3730A3;',
                employee: 'background:#F3F4F6;color:#374151;',
            };
            return `<span style="${colors[role] || colors.employee}padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;text-transform:capitalize;">${role.replace('_', ' ')}</span>`;
        };
        const activeIndicator = (last) => {
            if (!last) return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--gray-300);"></span>';
            const diff = (Date.now() - new Date(last.replace(' ','T')).getTime()) / 60000;
            if (diff < 5) return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22C55E;box-shadow:0 0 0 3px rgba(34,197,94,0.2);"></span>';
            if (diff < 60) return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#F59E0B;"></span>';
            return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--gray-300);"></span>';
        };
        const initials = (name) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        grid.innerHTML = data.map(u => `
            <div class="user-stat-card" style="background:var(--white);border:1px solid var(--gray-200);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                    <div style="width:42px;height:42px;border-radius:50%;background:var(--blue-primary);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0;">${initials(u.display_name || u.username)}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            ${activeIndicator(u.last_active)}
                            <strong style="font-size:15px;color:var(--gray-900);">${u.display_name || u.username}</strong>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                            ${roleBadge(u.role)}
                            <span style="font-size:12px;color:var(--gray-500);">${u.last_active ? formatTime(u.last_active) : 'Never active'}</span>
                        </div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div style="background:var(--gray-50);border:1px solid var(--gray-100);padding:12px;border-radius:6px;text-align:center;">
                        <div style="font-size:24px;font-weight:800;color:var(--blue-primary);line-height:1.1;">${u.today_actions}</div>
                        <div style="font-size:11px;font-weight:600;color:var(--gray-500);margin-top:4px;text-transform:uppercase;">Actions Today</div>
                    </div>
                    <div style="background:var(--gray-50);border:1px solid var(--gray-100);padding:12px;border-radius:6px;text-align:center;">
                        <div style="font-size:24px;font-weight:800;color:var(--gray-900);line-height:1.1;">${formatMinutes(u.time_today_min)}</div>
                        <div style="font-size:11px;font-weight:600;color:var(--gray-500);margin-top:4px;text-transform:uppercase;">Time Today</div>
                    </div>
                    <div style="background:var(--gray-50);border:1px solid var(--gray-100);padding:12px;border-radius:6px;text-align:center;">
                        <div style="font-size:24px;font-weight:800;color:var(--blue-primary);line-height:1.1;">${u.week_actions}</div>
                        <div style="font-size:11px;font-weight:600;color:var(--gray-500);margin-top:4px;text-transform:uppercase;">Actions This Week</div>
                    </div>
                    <div style="background:var(--gray-50);border:1px solid var(--gray-100);padding:12px;border-radius:6px;text-align:center;">
                        <div style="font-size:24px;font-weight:800;color:var(--gray-900);line-height:1.1;">${formatMinutes(u.time_week_min)}</div>
                        <div style="font-size:11px;font-weight:600;color:var(--gray-500);margin-top:4px;text-transform:uppercase;">Time This Week</div>
                    </div>
                </div>
                <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--gray-100);display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-size:12px;color:var(--gray-500);">Lifetime actions</span>
                    <span style="font-size:14px;font-weight:700;color:var(--gray-700);">${u.total_actions.toLocaleString()}</span>
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
