/* Billing Summary JS */
let bsData = null;

// ─── Init ───────────────────────────────────────────────────────
loadBillingSummary();

async function loadBillingSummary() {
    const res = await fetch('/api/billing-summary');
    bsData = await res.json();
    renderKpis();
    renderAging();
    renderProjects();
    renderInvoices();
    renderCollectionChart();
}

// ─── Format helpers ─────────────────────────────────────────────
function fmt(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function fmtK(n) {
    n = Number(n || 0);
    if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
    return '$' + n.toFixed(0);
}

// ─── KPI Cards ──────────────────────────────────────────────────
function renderKpis() {
    if (!bsData) return;
    var t = bsData.totals;
    var s = bsData.service_totals;
    document.getElementById('kpiContract').textContent = fmtK(t.total_contract);
    document.getElementById('kpiBilled').textContent = fmtK(t.total_billed + s.total);
    document.getElementById('kpiPaid').textContent = fmtK(t.total_paid + s.paid);
    document.getElementById('kpiRetained').textContent = fmtK(t.total_retained);
    document.getElementById('kpiOutstanding').textContent = fmtK(t.total_outstanding + s.outstanding);
    document.getElementById('kpiCOs').textContent = fmtK(t.total_cos);

    // Color outstanding red if > 0
    var outEl = document.getElementById('kpiOutstanding');
    if ((t.total_outstanding + s.outstanding) > 0) {
        outEl.style.color = '#EF4444';
    }
}

// ─── Aging ──────────────────────────────────────────────────────
function renderAging() {
    if (!bsData || !bsData.aging) return;
    var a = bsData.aging;
    document.getElementById('aging030').textContent = fmt(a['0_30']);
    document.getElementById('aging3160').textContent = fmt(a['31_60']);
    document.getElementById('aging6190').textContent = fmt(a['61_90']);
    document.getElementById('aging90').textContent = fmt(a['90_plus']);
}

// ─── Tab Switching ──────────────────────────────────────────────
function switchBsTab(tab, btn) {
    document.querySelectorAll('.tab-bar .tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function(tc) { tc.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    document.getElementById(tab === 'projects' ? 'tabProjects' : 'tabInvoices').classList.add('active');
}

// ─── Project Billing Table ──────────────────────────────────────
function renderProjects() {
    if (!bsData) return;
    var tbody = document.getElementById('projectBillingBody');
    var projects = bsData.projects || [];
    var filter = document.getElementById('bsFilterStatus').value;
    var search = (document.getElementById('bsSearch').value || '').toLowerCase();
    var showApps = document.getElementById('bsShowApps').checked;

    // Filter
    var filtered = projects.filter(function(p) {
        if (filter === 'active' && p.outstanding <= 0) return false;
        if (filter === 'complete' && p.outstanding > 0) return false;
        if (search && p.job_name.toLowerCase().indexOf(search) === -1 &&
            p.gc_name.toLowerCase().indexOf(search) === -1) return false;
        return true;
    });

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No projects match the current filters.</td></tr>';
        document.getElementById('projectBillingFoot').style.display = 'none';
        return;
    }

    // Totals
    var ftContract = 0, ftCOs = 0, ftBilled = 0, ftPaid = 0, ftRetained = 0, ftOutstanding = 0;

    var html = '';
    filtered.forEach(function(p) {
        var isComplete = p.outstanding <= 0 && p.total_billed > 0;
        var rowBg = p.outstanding > 0 ? '' : (isComplete ? 'background:var(--green-50,#f0fdf4);' : '');

        // Progress bar
        var billedPct = p.pct_billed || 0;
        var collectedPct = p.pct_collected || 0;

        html += '<tr style="cursor:pointer;' + rowBg + '" onclick="togglePayApps(\'pa-' + p.contract_id + '\')">';
        html += '<td><strong>' + esc(p.job_name) + '</strong>';
        if (isComplete) html += ' <span style="color:#22C55E;font-size:11px;">&#10003; PAID</span>';
        html += '<div style="display:flex;gap:4px;margin-top:4px;">';
        html += '<div style="flex:1;height:4px;background:#E5E7EB;border-radius:2px;overflow:hidden;">';
        html += '<div style="height:100%;width:' + billedPct + '%;background:#3B82F6;border-radius:2px;"></div>';
        html += '</div>';
        html += '<span style="font-size:10px;color:var(--gray-400);min-width:32px;">' + billedPct + '%</span>';
        html += '</div></td>';
        html += '<td style="font-size:13px;">' + esc(p.gc_name) + '</td>';
        html += '<td style="text-align:right;">' + fmt(p.current_contract) + '</td>';
        html += '<td style="text-align:right;' + (p.co_net ? 'color:#8B5CF6;' : '') + '">' + (p.co_net ? fmt(p.co_net) : '-') + '</td>';
        html += '<td style="text-align:right;">' + fmt(p.total_billed) + '</td>';
        html += '<td style="text-align:right;color:#166534;">' + fmt(p.total_paid) + '</td>';
        html += '<td style="text-align:right;color:#F97316;">' + fmt(p.total_retained) + '</td>';
        html += '<td style="text-align:right;font-weight:600;' + (p.outstanding > 0 ? 'color:#EF4444;' : '') + '">' + fmt(p.outstanding) + '</td>';
        html += '<td style="text-align:center;font-size:13px;">' + billedPct + '%</td>';
        html += '<td style="text-align:center;font-size:13px;">' + collectedPct + '%</td>';
        html += '</tr>';

        // Pay app detail rows (collapsed by default)
        if (p.pay_apps && p.pay_apps.length) {
            var display = showApps ? '' : 'display:none;';
            html += '<tr class="pa-' + p.contract_id + '" style="' + display + 'background:var(--gray-50,#f9fafb);">';
            html += '<td colspan="10" style="padding:8px 12px 12px 24px;">';
            html += '<table style="width:100%;font-size:12px;border-collapse:collapse;">';
            html += '<thead><tr style="border-bottom:1px solid #E5E7EB;">';
            html += '<th style="text-align:left;padding:4px 6px;">Pay App #</th>';
            html += '<th style="text-align:left;padding:4px 6px;">Period</th>';
            html += '<th style="text-align:right;padding:4px 6px;">Billed</th>';
            html += '<th style="text-align:right;padding:4px 6px;">Collected</th>';
            html += '<th style="text-align:right;padding:4px 6px;">Retained</th>';
            html += '<th style="text-align:center;padding:4px 6px;">Status</th>';
            html += '</tr></thead><tbody>';

            p.pay_apps.forEach(function(a) {
                var sBadge = getAppStatusBadge(a.status);
                html += '<tr style="border-bottom:1px solid #F3F4F6;">';
                html += '<td style="padding:4px 6px;font-weight:600;">#' + a.number + '</td>';
                html += '<td style="padding:4px 6px;">' + (a.period_to || a.date || '-') + '</td>';
                html += '<td style="text-align:right;padding:4px 6px;">' + fmt(a.billed) + '</td>';
                html += '<td style="text-align:right;padding:4px 6px;color:#166534;">' + fmt(a.paid) + '</td>';
                html += '<td style="text-align:right;padding:4px 6px;color:#F97316;">' + fmt(a.retained) + '</td>';
                html += '<td style="text-align:center;padding:4px 6px;">' + sBadge + '</td>';
                html += '</tr>';
            });

            html += '</tbody></table></td></tr>';
        }

        ftContract += p.current_contract;
        ftCOs += p.co_net;
        ftBilled += p.total_billed;
        ftPaid += p.total_paid;
        ftRetained += p.total_retained;
        ftOutstanding += p.outstanding;
    });

    tbody.innerHTML = html;

    // Footer totals
    var foot = document.getElementById('projectBillingFoot');
    foot.style.display = '';
    document.getElementById('ftContract').textContent = fmt(ftContract);
    document.getElementById('ftCOs').textContent = fmt(ftCOs);
    document.getElementById('ftBilled').textContent = fmt(ftBilled);
    document.getElementById('ftPaid').textContent = fmt(ftPaid);
    document.getElementById('ftRetained').textContent = fmt(ftRetained);
    document.getElementById('ftOutstanding').textContent = fmt(ftOutstanding);
}

function togglePayApps(cls) {
    var rows = document.querySelectorAll('.' + cls);
    rows.forEach(function(r) {
        r.style.display = r.style.display === 'none' ? '' : 'none';
    });
}

function getAppStatusBadge(status) {
    var map = {
        'Draft': 'background:#F3F4F6;color:#6B7280;',
        'Submitted': 'background:#DBEAFE;color:#1E40AF;',
        'Approved': 'background:#FEF3C7;color:#92400E;',
        'Paid': 'background:#DCFCE7;color:#166534;',
    };
    var s = map[status] || map['Draft'];
    return '<span style="' + s + 'padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">' + (status || 'Draft') + '</span>';
}

// ─── Service Invoices Table ─────────────────────────────────────
function renderInvoices() {
    if (!bsData) return;
    var tbody = document.getElementById('svcInvoiceBody');
    var invoices = bsData.service_invoices || [];
    var filter = document.getElementById('svcFilterStatus').value;
    var search = (document.getElementById('svcSearch').value || '').toLowerCase();

    // Service KPIs
    var s = bsData.service_totals || {};
    document.getElementById('svcTotal').textContent = fmt(s.total);
    document.getElementById('svcPaid').textContent = fmt(s.paid);
    document.getElementById('svcOutstanding').textContent = fmt(s.outstanding);

    var filtered = invoices.filter(function(inv) {
        if (filter && inv.status !== filter) return false;
        if (search) {
            var haystack = ((inv.invoice_number || '') + ' ' + (inv.customer_name || '') + ' ' +
                           (inv.job_name || '') + ' ' + (inv.description || '')).toLowerCase();
            if (haystack.indexOf(search) === -1) return false;
        }
        return true;
    });

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No invoices match the current filters.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(function(inv) {
        var statusStyle = getInvStatusStyle(inv.status);
        return '<tr>' +
            '<td><strong>' + esc(inv.invoice_number || '-') + '</strong></td>' +
            '<td>' + (inv.issue_date || '-') + '</td>' +
            '<td>' + esc(inv.customer_name || '-') + '</td>' +
            '<td>' + esc(inv.job_name || '-') + '</td>' +
            '<td style="text-align:right;font-weight:600;">' + fmt(inv.amount) + '</td>' +
            '<td><span style="' + statusStyle + '">' + (inv.status || 'Draft') + '</span></td>' +
            '<td>' + (inv.paid_date || '-') + '</td>' +
            '<td style="font-size:12px;color:var(--gray-500);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(inv.description || '') + '">' + esc(inv.description || '-') + '</td>' +
        '</tr>';
    }).join('');
}

function getInvStatusStyle(status) {
    var s = (status || '').toLowerCase();
    if (s === 'paid') return 'background:#DCFCE7;color:#166534;padding:2px 8px;border-radius:4px;font-weight:600;font-size:12px;';
    if (s === 'overdue') return 'background:#FEE2E2;color:#991B1B;padding:2px 8px;border-radius:4px;font-weight:600;font-size:12px;';
    if (s === 'sent') return 'background:#DBEAFE;color:#1E40AF;padding:2px 8px;border-radius:4px;font-weight:600;font-size:12px;';
    if (s === 'partial') return 'background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:4px;font-weight:600;font-size:12px;';
    return 'background:#F3F4F6;color:#6B7280;padding:2px 8px;border-radius:4px;font-weight:600;font-size:12px;';
}

// ─── Collection Progress Chart ──────────────────────────────────
function renderCollectionChart() {
    if (!bsData || !bsData.projects) return;
    var container = document.getElementById('collectionChart');
    var projects = bsData.projects.filter(function(p) { return p.current_contract > 0; });

    // Sort by contract size descending
    projects.sort(function(a, b) { return b.current_contract - a.current_contract; });

    if (!projects.length) {
        container.innerHTML = '<p class="empty-state">No project data available.</p>';
        return;
    }

    var maxVal = Math.max.apply(null, projects.map(function(p) { return p.current_contract; }));

    var html = '';
    projects.forEach(function(p) {
        var contractW = Math.max(p.current_contract / maxVal * 100, 5);
        var billedW = p.current_contract > 0 ? (p.total_billed / p.current_contract * 100) : 0;
        var paidW = p.current_contract > 0 ? (p.total_paid / p.current_contract * 100) : 0;

        html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">';
        html += '<div style="min-width:160px;max-width:160px;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(p.job_name) + '">' + esc(p.job_name) + '</div>';
        html += '<div style="flex:1;position:relative;height:24px;background:#F3F4F6;border-radius:4px;overflow:hidden;">';
        // Billed bar
        html += '<div style="position:absolute;left:0;top:0;height:100%;width:' + billedW + '%;background:#BFDBFE;border-radius:4px;"></div>';
        // Paid bar
        html += '<div style="position:absolute;left:0;top:0;height:100%;width:' + paidW + '%;background:#22C55E;border-radius:4px;"></div>';
        // Contract marker
        html += '</div>';
        html += '<div style="min-width:90px;text-align:right;font-size:12px;color:var(--gray-500);">' + fmtK(p.current_contract) + '</div>';
        html += '</div>';
    });

    // Legend
    html += '<div style="display:flex;gap:16px;margin-top:12px;font-size:12px;color:var(--gray-500);">';
    html += '<span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#22C55E;vertical-align:middle;margin-right:4px;"></span>Collected</span>';
    html += '<span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#BFDBFE;vertical-align:middle;margin-right:4px;"></span>Billed</span>';
    html += '<span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#F3F4F6;border:1px solid #D1D5DB;vertical-align:middle;margin-right:4px;"></span>Remaining</span>';
    html += '</div>';

    container.innerHTML = html;
}

// ─── Utility ────────────────────────────────────────────────────
function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
