/* Dashboard JS — QB-style interactive home */

const STAGE_COLORS = {
    'Needs Bid':    { bg: '#DBEAFE', text: '#1E40AF', chart: '#3B82F6' },
    'Bid Complete': { bg: '#E0E7FF', text: '#3730A3', chart: '#6366F1' },
    'In Progress':  { bg: '#FEF3C7', text: '#92400E', chart: '#F59E0B' },
    'Complete':     { bg: '#DCFCE7', text: '#166534', chart: '#22C55E' },
};

function fmt(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtK(n) {
    n = Number(n || 0);
    if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
    return '$' + n.toFixed(0);
}
function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function timeAgo(dateStr) {
    if (!dateStr) return '';
    var now = new Date();
    var then = new Date(dateStr.replace(' ', 'T'));
    var diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return dateStr.split(' ')[0];
}
function initials(name) {
    if (!name) return '?';
    return name.split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().substring(0, 2);
}

async function loadDashboard() {
    var res = await fetch('/api/dashboard');
    var d = await res.json();
    document.getElementById('dashboardLoading').style.display = 'none';
    document.getElementById('dashboardContent').style.display = '';

    // Greeting
    var hour = new Date().getHours();
    var greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    document.getElementById('dashGreeting').textContent = greet + ' — here\'s your overview for today.';

    renderSnapshot(d);
    renderBadges(d);
    renderActionItems(d);
    renderActiveProjects(d);
    renderCharts(d);
    renderSchedule(d);
    renderActivity(d);
    loadFollowups();
}

// ─── Financial Snapshot Cards ───────────────────────────────────
function renderSnapshot(d) {
    var cards = [
        { label: 'Income Collected', value: fmtK(d.total_invoiced + d.total_payments), color: '#22C55E', sub: fmt(d.total_invoiced) + ' invoiced + ' + fmt(d.total_payments) + ' payments' },
        { label: 'Outstanding', value: fmtK(d.total_outstanding), color: d.total_outstanding > 0 ? '#EF4444' : '#6B7280', sub: 'Unpaid invoices' },
        { label: 'Total Expenses', value: fmtK(d.total_expenses + d.actual_material_cost), color: '#EF4444', sub: fmt(d.actual_material_cost) + ' materials + ' + fmt(d.total_expenses) + ' other' },
        { label: 'Active / Total Jobs', value: d.active_jobs + ' / ' + d.total_jobs, color: '#3B82F6', sub: d.needs_bid + ' need bids, ' + d.completed_jobs + ' complete' },
    ];
    document.getElementById('snapGrid').innerHTML = cards.map(function(c) {
        return '<div class="snap-card" style="border-top:3px solid ' + c.color + ';">' +
            '<div class="snap-label">' + c.label + '</div>' +
            '<div class="snap-value" style="color:' + c.color + ';">' + c.value + '</div>' +
            '<div class="snap-sub">' + c.sub + '</div>' +
        '</div>';
    }).join('');
}

// ─── Quick Action Badges ────────────────────────────────────────
function renderBadges(d) {
    setBadge('qaBadgeActive', d.active_jobs, true);
    if (d.open_service_calls > 0) setBadge('qaBadgeSC', d.open_service_calls, true);
    if (d.pending_submittals && d.pending_submittals.length > 0) setBadge('qaBadgeSub', d.pending_submittals.length, true);
    if (d.pending_hours > 0) {
        var el = document.getElementById('qaBadgeHours');
        el.textContent = Math.round(d.pending_hours) + 'h';
        el.style.display = '';
    }
    if (d.needs_bid > 0) setBadge('qaBadgeBids', d.needs_bid, true);
    if (d.expiring_licenses && d.expiring_licenses.length > 0) setBadge('qaBadgeLic', d.expiring_licenses.length, true);
}
function setBadge(id, count, show) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = count;
    el.style.display = show && count > 0 ? '' : 'none';
}

// ─── Action Items Panel ─────────────────────────────────────────
function renderActionItems(d) {
    var items = [];

    // Overdue invoices
    (d.overdue_invoices || []).forEach(function(inv) {
        items.push({
            color: '#EF4444', priority: 0,
            html: '<a href="/service-invoices">' + esc(inv.invoice_number || 'Invoice') + '</a> overdue — ' + fmt(inv.amount) + (inv.job_name ? ' (' + esc(inv.job_name) + ')' : ''),
            meta: 'Due ' + (inv.due_date || '-')
        });
    });

    // Open service calls
    (d.open_calls_list || []).forEach(function(sc) {
        var prColor = sc.priority === 'Urgent' ? '#EF4444' : sc.priority === 'High' ? '#F97316' : '#F59E0B';
        items.push({
            color: prColor, priority: sc.priority === 'Urgent' ? 1 : 2,
            html: '<a href="/service-calls">' + esc(sc.priority) + ' Service Call</a> — ' + esc((sc.description || '').substring(0, 60)) + (sc.job_name ? ' (' + esc(sc.job_name) + ')' : ''),
            meta: sc.assigned_name ? 'Assigned: ' + esc(sc.assigned_name) : 'Unassigned'
        });
    });

    // Pending submittals
    (d.pending_submittals || []).forEach(function(s) {
        items.push({
            color: '#F97316', priority: 3,
            html: 'Submittal <a href="/submittals">#' + s.id + '</a> ' + esc(s.status) + ' — ' + esc((s.description || '').substring(0, 50)),
            meta: s.job_name || ''
        });
    });

    // Reminders due
    (d.reminders_due || []).forEach(function(r) {
        var overdue = r.due_date && r.due_date < new Date().toISOString().split('T')[0];
        items.push({
            color: overdue ? '#EF4444' : '#3B82F6', priority: overdue ? 1 : 4,
            html: '<a href="/reminders">' + esc(r.title) + '</a>' + (r.description ? ' — ' + esc(r.description.substring(0, 50)) : ''),
            meta: (overdue ? 'OVERDUE ' : 'Due ') + r.due_date
        });
    });

    // Expiring licenses
    (d.expiring_licenses || []).forEach(function(l) {
        items.push({
            color: '#F59E0B', priority: 5,
            html: '<a href="/licenses">License</a> expiring: ' + esc((l.license_type || l.description || 'License')),
            meta: 'Expires ' + (l.expiration_date || '-')
        });
    });

    // Pending hours
    if (d.pending_hours > 0) {
        items.push({
            color: '#8B5CF6', priority: 6,
            html: '<a href="/payroll">' + Math.round(d.pending_hours) + ' hours</a> pending approval',
            meta: ''
        });
    }

    // Sort by priority
    items.sort(function(a, b) { return a.priority - b.priority; });

    var container = document.getElementById('actionItems');
    var countEl = document.getElementById('actionCount');
    countEl.textContent = items.length;
    countEl.style.display = items.length > 0 ? '' : 'none';

    if (!items.length) {
        container.innerHTML = '<p style="font-size:13px;color:var(--gray-400);text-align:center;padding:12px 0;">All clear — no action items.</p>';
        return;
    }

    container.innerHTML = items.slice(0, 12).map(function(it) {
        return '<div class="action-item">' +
            '<div class="action-dot" style="background:' + it.color + ';"></div>' +
            '<div style="flex:1;"><div class="action-text">' + it.html + '</div>' +
            (it.meta ? '<div class="action-meta">' + esc(it.meta) + '</div>' : '') +
            '</div></div>';
    }).join('');
}

// ─── Active Projects Panel ──────────────────────────────────────
function renderActiveProjects(d) {
    var projects = d.active_projects || [];
    var container = document.getElementById('activeProjects');
    if (!projects.length) {
        container.innerHTML = '<p style="font-size:13px;color:var(--gray-400);text-align:center;padding:12px 0;">No active projects.</p>';
        return;
    }
    container.innerHTML = projects.map(function(p) {
        return '<a href="/projects/' + p.id + '" class="proj-row">' +
            '<div class="proj-name">' + esc(p.name) + '</div>' +
            '<div class="proj-bar"><div class="proj-bar-fill" style="width:' + p.pct_billed + '%;"></div></div>' +
            '<div class="proj-pct">' + p.pct_billed + '%</div>' +
        '</a>';
    }).join('');
}

// ─── Charts ─────────────────────────────────────────────────────
function renderCharts(d) {
    // Stage doughnut
    var stages = Object.keys(d.stage_counts);
    var dCtx = document.getElementById('stageChart').getContext('2d');
    new Chart(dCtx, {
        type: 'doughnut',
        data: {
            labels: stages,
            datasets: [{
                data: stages.map(function(s) { return d.stage_counts[s]; }),
                backgroundColor: stages.map(function(s) { return (STAGE_COLORS[s] || {}).chart || '#999'; }),
                borderWidth: 2, borderColor: '#fff',
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10, font: { size: 11 } } }
            }
        }
    });

    // Finance bar
    var fCtx = document.getElementById('financeChart').getContext('2d');
    new Chart(fCtx, {
        type: 'bar',
        data: {
            labels: ['Materials', 'Expenses', 'Invoiced', 'Collected', 'Outstanding'],
            datasets: [{
                data: [d.actual_material_cost, d.total_expenses, d.total_invoiced + d.total_outstanding, d.total_invoiced + d.total_payments, d.total_outstanding],
                backgroundColor: ['#6366F1', '#EF4444', '#3B82F6', '#22C55E', '#F97316'],
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    ticks: { callback: function(v) { return '$' + (v >= 1000 ? (v/1000).toFixed(0) + 'K' : v); }, font: { size: 11 } },
                    grid: { color: '#F3F4F6' }
                },
                x: { ticks: { font: { size: 11 } }, grid: { display: false } }
            }
        }
    });
}

// ─── Upcoming Schedule ──────────────────────────────────────────
function renderSchedule(d) {
    var events = d.upcoming_schedule || [];
    if (!events.length) return;
    document.getElementById('schedulePanel').style.display = '';
    document.getElementById('scheduleItems').innerHTML = events.map(function(e) {
        return '<div class="action-item">' +
            '<div class="action-dot" style="background:#3B82F6;"></div>' +
            '<div style="flex:1;"><div class="action-text"><strong>' + esc(e.phase_name || e.description || 'Event') + '</strong>' +
            (e.job_name ? ' — ' + esc(e.job_name) : '') + '</div>' +
            '<div class="action-meta">' + (e.start_date || '') + (e.assigned_name ? ' | ' + esc(e.assigned_name) : '') + '</div>' +
            '</div></div>';
    }).join('');
}

// ─── Recent Activity ────────────────────────────────────────────
function renderActivity(d) {
    var items = d.recent_activity || [];
    if (!items.length) return;
    document.getElementById('activityPanel').style.display = '';
    document.getElementById('activityFeed').innerHTML = items.map(function(a) {
        return '<div class="activity-item">' +
            '<div class="activity-avatar">' + initials(a.display_name) + '</div>' +
            '<div class="activity-body"><strong>' + esc(a.display_name || 'System') + '</strong> ' + esc(a.description || a.action || '') + '</div>' +
            '<div class="activity-time">' + timeAgo(a.created_at) + '</div>' +
        '</div>';
    }).join('');
}

// ─── Bid Follow-ups ─────────────────────────────────────────────
async function loadFollowups() {
    try {
        var res = await fetch('/api/followups/upcoming');
        if (!res.ok) return;
        var followups = await res.json();
        if (!followups.length) return;
        document.getElementById('followupsPanel').style.display = '';
        document.getElementById('followupsItems').innerHTML = followups.map(function(f) {
            return '<div class="action-item">' +
                '<div class="action-dot" style="background:#6366F1;"></div>' +
                '<div style="flex:1;"><div class="action-text"><a href="/bids/' + f.bid_id + '">' + esc(f.bid_name || 'Bid') + '</a> — ' + esc(f.followup_type || 'Follow-up') + '</div>' +
                '<div class="action-meta">' + (f.followup_date || '') + (f.assigned_name ? ' | ' + esc(f.assigned_name) : '') + '</div>' +
                '</div></div>';
        }).join('');
    } catch(e) {}
}

// ─── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadDashboard);
