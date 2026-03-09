/* Projects JS */
function fmt(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// Overview page
if (document.getElementById('projectsBody') && !window.JOB_ID) {
    loadProjects();
}

// Detail page
if (window.JOB_ID) {
    loadProjectDetail().then(() => {
        const tabParam = new URLSearchParams(window.location.search).get('tab');
        if (tabParam) {
            const tabBtn = document.querySelector(`.tab-bar .tab[onclick*="'${tabParam}'"]`);
            switchProjectTab(tabParam, tabBtn);
        }
    });
}

var _allProjects = [];

async function loadProjects() {
    const res = await fetch('/api/projects');
    _allProjects = await res.json();
    renderProjects(_allProjects);
}

function renderProjects(projects) {
    const tbody = document.getElementById('projectsBody');
    if (!projects.length) { tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No projects.</td></tr>'; return; }
    const canDelete = typeof USER_ROLE !== 'undefined' && (USER_ROLE === 'owner' || USER_ROLE === 'admin');
    tbody.innerHTML = projects.map(p => `<tr onclick="toggleProjectLinks(${p.id})" style="cursor:pointer;">
        <td>
            <span class="pj-expand-arrow" id="pjArrow${p.id}" style="display:inline-block;width:14px;font-size:10px;color:var(--gray-400);transition:transform .15s;">&#9654;</span>
            <a href="/projects/${p.id}" class="link" onclick="event.stopPropagation();">${p.name}</a>
        </td>
        <td>${p.customer_name ? '<a href="/customers/'+p.customer_id+'" class="link" onclick="event.stopPropagation();">'+p.customer_name+'</a>' : '<span style="color:#9CA3AF;">—</span>'}</td>
        <td><span class="status-badge status-${p.status.toLowerCase().replace(/ /g,'-')}">${p.status}</span></td>
        <td>${p.location}</td>
        <td>${p.tax_rate ? p.tax_rate + '%' : '<span style="color:#9CA3AF;">—</span>'}</td>
        <td class="cell-computed">${fmt(p.material_cost)}</td>
        <td class="cell-computed">${fmt(p.expenses)}</td>
        <td class="cell-computed">${p.open_service_calls > 0 ? '<span style="color:#D97706;font-weight:600;">'+p.open_service_calls+'</span>' : '0'}</td>
        <td class="cell-computed">${p.warranty_items}</td>
        <td>${(p.updated_at || '').substring(0, 10)}</td>
        <td style="white-space:nowrap;" onclick="event.stopPropagation();">
            <a href="/projects/${p.id}" class="btn btn-small btn-secondary">View</a>
            <button class="btn btn-small btn-secondary" onclick="editProject(${p.id})">Edit</button>
            ${canDelete ? `<button class="btn btn-small btn-secondary" style="color:#EF4444;" onclick="deleteProject(${p.id})">Del</button>` : ''}
        </td>
    </tr>
    <tr id="pjLinks${p.id}" style="display:none;">
        <td colspan="11" style="padding:0;border-top:none;">
            <div style="padding:12px 16px 12px 28px;background:var(--gray-50,#f8fafc);border-top:1px dashed var(--gray-200,#e2e8f0);">
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px 12px;">
                    <a href="/projects/${p.id}" class="pj-qlink">&#9632; Dashboard</a>
                    <a href="/plans?job_id=${p.id}" class="pj-qlink">&#128208; Plans ${p.plan_count ? '<span class="pj-count">'+p.plan_count+'</span>' : ''}</a>
                    <a href="/supplier-quotes" class="pj-qlink">&#128203; Supplier Quotes</a>
                    <a href="/bids" class="pj-qlink">&#9998; Bids</a>
                    <a href="/schedule?job_id=${p.id}" class="pj-qlink">&#128197; Schedule</a>
                    <a href="/contracts?job_id=${p.id}" class="pj-qlink">&#128203; Contracts ${p.contract_count ? '<span class="pj-count">'+p.contract_count+'</span>' : ''}</a>
                    <a href="/permits?job_id=${p.id}" class="pj-qlink">&#128220; Permits ${p.permit_count ? '<span class="pj-count">'+p.permit_count+'</span>' : ''}</a>
                    <a href="/submittals?job_id=${p.id}" class="pj-qlink">&#128230; Submittals ${p.submittal_count ? '<span class="pj-count">'+p.submittal_count+'</span>' : ''}</a>
                    <a href="/rfis?job_id=${p.id}" class="pj-qlink">&#10067; RFIs ${p.rfi_count ? '<span class="pj-count">'+p.rfi_count+'</span>' : ''}</a>
                    <a href="/change-orders?job_id=${p.id}" class="pj-qlink">&#128221; Change Orders ${p.co_count ? '<span class="pj-count">'+p.co_count+'</span>' : ''}</a>
                    <a href="/materials/job/${p.id}" class="pj-qlink">&#9634; Materials</a>
                    <a href="/documents" class="pj-qlink">&#128196; Documents</a>
                    <a href="/photos" class="pj-qlink">&#128247; Photos</a>
                    <a href="/payapps" class="pj-qlink">&#128179; Pay Apps ${p.payapp_count ? '<span class="pj-count">'+p.payapp_count+'</span>' : ''}</a>
                    <a href="/lien-waivers?job_id=${p.id}" class="pj-qlink">&#128220; Lien Waivers ${p.lw_count ? '<span class="pj-count">'+p.lw_count+'</span>' : ''}</a>
                    <a href="/warranty" class="pj-qlink">&#9745; Warranty ${p.warranty_items ? '<span class="pj-count">'+p.warranty_items+'</span>' : ''}</a>
                    <a href="/service-calls" class="pj-qlink">&#9742; Service Calls ${p.open_service_calls ? '<span class="pj-count pj-count-warn">'+p.open_service_calls+'</span>' : ''}</a>
                </div>
            </div>
        </td>
    </tr>`).join('');
}

function toggleProjectLinks(id) {
    var row = document.getElementById('pjLinks' + id);
    var arrow = document.getElementById('pjArrow' + id);
    if (!row) return;
    var isOpen = row.style.display !== 'none';
    row.style.display = isOpen ? 'none' : 'table-row';
    if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
}

function filterProjects() {
    const filter = document.getElementById('projectStatusFilter').value;
    const filtered = filter ? _allProjects.filter(p => p.status === filter) : _allProjects;
    renderProjects(filtered);
}

function editProject(id) {
    var p = _allProjects.find(function(x) { return x.id === id; });
    if (!p) return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/job/' + id, true);
    xhr.onload = function() {
        if (xhr.status !== 200) { alert('Failed to load project details'); return; }
        var data = JSON.parse(xhr.responseText);
        var job = data.job || data;
        document.getElementById('editJobId').value = id;
        document.getElementById('editJobName').value = job.name || '';
        document.getElementById('editJobStatus').value = job.status || 'Needs Bid';
        document.getElementById('editJobAddress').value = job.address || '';
        document.getElementById('editJobCity').value = job.city || '';
        document.getElementById('editJobState').value = job.state || '';
        document.getElementById('editJobZip').value = job.zip_code || '';
        document.getElementById('editJobTaxRate').value = job.tax_rate || '';
        document.getElementById('editJobCustomerId').value = job.customer_id || '';
        // Look up customer name from the projects list
        var proj = _allProjects.find(function(x) { return x.id === id; });
        document.getElementById('editJobCustomerSearch').value = (proj && proj.customer_name) || '';
        document.getElementById('editJobModal').style.display = 'flex';
    };
    xhr.onerror = function() { alert('Network error loading project details'); };
    xhr.send();
}

function hideEditJobModal() {
    document.getElementById('editJobModal').style.display = 'none';
}

async function updateProject(e) {
    e.preventDefault();
    const id = document.getElementById('editJobId').value;
    const editCustId = document.getElementById('editJobCustomerId').value;
    const payload = {
        name: document.getElementById('editJobName').value.trim(),
        status: document.getElementById('editJobStatus').value,
        address: document.getElementById('editJobAddress').value.trim(),
        city: document.getElementById('editJobCity').value.trim(),
        state: document.getElementById('editJobState').value.trim(),
        zip_code: document.getElementById('editJobZip').value.trim(),
        customer_id: editCustId ? parseInt(editCustId) : null,
    };
    const taxVal = document.getElementById('editJobTaxRate').value;
    if (taxVal !== '') payload.tax_rate = parseFloat(taxVal) || 0;
    const res = await fetch('/api/job/' + id, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    if (res.ok) {
        hideEditJobModal();
        loadProjects();
    } else {
        alert('Failed to update job.');
    }
}

async function deleteProject(id) {
    const p = _allProjects.find(x => x.id === id);
    if (!confirm(`Delete project "${p ? p.name : id}"? This will permanently remove the project and all associated data.`)) return;
    const res = await fetch('/api/job/' + id, { method: 'DELETE' });
    if (res.ok) {
        loadProjects();
    } else {
        alert('Failed to delete project.');
    }
}

async function loadProjectDetail() {
    const res = await fetch(`/api/projects/${JOB_ID}`);
    const data = await res.json();
    document.getElementById('projectLoading').style.display = 'none';
    document.getElementById('projectContent').style.display = 'block';

    const totalExpenses = data.expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const totalInvoiced = data.invoices.reduce((s, i) => s + (i.amount || 0), 0);
    const totalLabor = data.time_entries.reduce((s, t) => s + (t.hours || 0) * (t.hourly_rate || 0), 0);

    // Project info bar (customer + supplier account + PM assignment)
    const infoEl = document.getElementById('projectInfo');
    if (infoEl) {
        let infoHtml = '';
        if (data.job.customer_id && data.job.customer_name) {
            infoHtml += `<span><span class="text-muted">Customer:</span> <a href="/customers/${data.job.customer_id}" class="link" style="font-weight:600;">${data.job.customer_name}</a></span>`;
        } else {
            infoHtml += `<span><span class="text-muted">Customer:</span> <span style="color:#9CA3AF;">— Not linked —</span></span>`;
        }
        if (data.job.supplier_account) {
            infoHtml += `<span><span class="text-muted">Supplier Account:</span> <strong>${data.job.supplier_account}</strong></span>`;
        }
        infoHtml += `<span><span class="text-muted">Project Manager:</span> <select id="pmSelect" class="form-select" style="display:inline-block;width:auto;margin-left:6px;padding:2px 8px;font-size:13px;" onchange="assignPM(this.value)"><option value="">-- Unassigned --</option></select></span>`;
        infoEl.innerHTML = infoHtml;
        // Populate PM dropdown
        fetch('/api/users/list').then(r => r.json()).then(users => {
            const sel = document.getElementById('pmSelect');
            users.filter(u => ['owner','admin','project_manager'].includes(u.role)).forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = u.display_name || u.username;
                if (data.job.project_manager_id == u.id) opt.selected = true;
                sel.appendChild(opt);
            });
        });
    }

    // KPIs
    document.getElementById('projectKpis').innerHTML = `
        <div class="kpi-card" style="border-left:4px solid #3B82F6;"><div class="kpi-value">${fmt(data.material_cost)}</div><div class="kpi-label">Material Cost</div></div>
        <div class="kpi-card" style="border-left:4px solid #EF4444;"><div class="kpi-value">${fmt(totalExpenses)}</div><div class="kpi-label">Expenses</div></div>
        <div class="kpi-card" style="border-left:4px solid #8B5CF6;"><div class="kpi-value">${fmt(totalLabor)}</div><div class="kpi-label">Labor Cost</div></div>
        <div class="kpi-card" style="border-left:4px solid #22C55E;"><div class="kpi-value">${fmt(totalInvoiced)}</div><div class="kpi-label">Invoiced</div></div>
        <div class="kpi-card" style="border-left:4px solid #F59E0B;"><div class="kpi-value">${data.service_calls.filter(c=>c.status!=='Resolved'&&c.status!=='Closed').length}</div><div class="kpi-label">Open Service Calls</div></div>
        <div class="kpi-card" style="border-left:4px solid #6366F1;"><div class="kpi-value">${data.warranties.length}</div><div class="kpi-label">Warranties</div></div>
    `;

    // Tabs
    document.getElementById('pExpenses').innerHTML = data.expenses.length ?
        data.expenses.map(e => `<tr><td>${e.expense_date||'-'}</td><td>${e.category||'-'}</td><td>${e.vendor||'-'}</td><td>${e.description||'-'}</td><td class="cell-computed">${fmt(e.amount)}</td></tr>`).join('') :
        '<tr><td colspan="5" class="empty-state">No expenses.</td></tr>';

    document.getElementById('pInvoices').innerHTML = data.invoices.length ?
        data.invoices.map(i => `<tr><td>${i.invoice_number||'-'}</td><td>${i.issue_date||'-'}</td><td class="cell-computed">${fmt(i.amount)}</td><td><span class="status-badge">${i.status}</span></td></tr>`).join('') :
        '<tr><td colspan="4" class="empty-state">No invoices.</td></tr>';

    document.getElementById('pPayments').innerHTML = data.payments.length ?
        data.payments.map(p => `<tr><td>${p.payment_date||'-'}</td><td>${p.payment_method||'-'}</td><td>${p.reference_number||'-'}</td><td class="cell-computed">${fmt(p.amount)}</td></tr>`).join('') :
        '<tr><td colspan="4" class="empty-state">No payments.</td></tr>';

    document.getElementById('pService').innerHTML = data.service_calls.length ?
        data.service_calls.map(c => `<tr><td><span class="status-badge">${c.priority}</span></td><td>${(c.description||'').substring(0,80)}</td><td>${c.assigned_name||'Unassigned'}</td><td><span class="status-badge">${c.status}</span></td></tr>`).join('') :
        '<tr><td colspan="4" class="empty-state">No service calls.</td></tr>';

    document.getElementById('pWarranty').innerHTML = data.warranties.length ?
        data.warranties.map(w => `<tr><td>${w.item_description||'-'}</td><td>${w.manufacturer||'-'}</td><td>${w.warranty_start||'-'}</td><td>${w.warranty_end||'-'}</td><td><span class="status-badge">${w.status}</span></td></tr>`).join('') :
        '<tr><td colspan="5" class="empty-state">No warranties.</td></tr>';

    document.getElementById('pLabor').innerHTML = data.time_entries.length ?
        data.time_entries.map(t => `<tr><td>${t.work_date||'-'}</td><td>${t.employee_name||'-'}</td><td>${t.hours}h</td><td>${fmt(t.hourly_rate)}</td><td class="cell-computed">${fmt(t.hours*t.hourly_rate)}</td><td>${t.description||'-'}</td></tr>`).join('') :
        '<tr><td colspan="6" class="empty-state">No time entries.</td></tr>';
}

async function assignPM(userId) {
    const res = await fetch(`/api/job/${JOB_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_manager_id: userId || null })
    });
    if (!res.ok) alert('Failed to assign PM');
}

function switchProjectTab(tab, btn) {
    document.querySelectorAll('.project-tab').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('ptab-' + tab).style.display = 'block';
    if (btn) btn.classList.add('active');
    // Lazy-load precon, benchmarks, billing on first tab visit
    if (tab === 'precon' && !window._preconLoaded) { loadPrecon(); window._preconLoaded = true; }
    if (tab === 'benchmarks' && !window._benchmarksLoaded) { loadBenchmarks(); window._benchmarksLoaded = true; }
    if (tab === 'billing' && !window._billingLoaded) { loadPayApps(); loadBillingSchedule(); window._billingLoaded = true; }
    if (tab === 'documents' && !window._documentsLoaded) { loadDocuments(); initDocDropZone(); window._documentsLoaded = true; }
}

// ─── Pre-Con Meeting (Phase 4) ──────────────────────────────

async function loadPrecon() {
    try {
        const res = await fetch(`/api/jobs/${JOB_ID}/precon`);
        const m = await res.json();
        document.getElementById('preconStatus').textContent = m.status || 'No Meeting';
        document.getElementById('preconStatus').className = 'status-badge ' +
            (m.status === 'Completed' ? 'status-complete' : m.status === 'Scheduled' ? 'status-in-progress' : '');
        if (m.meeting_date) document.getElementById('preconDate').value = m.meeting_date;
        if (m.status) document.getElementById('preconStatusSel').value = m.status;
        if (m.gc_contact) document.getElementById('preconGC').value = m.gc_contact;
        if (m.location) document.getElementById('preconLocation').value = m.location;
        if (m.attendees) document.getElementById('preconAttendees').value = m.attendees;
        if (m.agenda) document.getElementById('preconAgenda').value = m.agenda;
        if (m.minutes) document.getElementById('preconMinutes').value = m.minutes;
        if (m.status === 'Completed') {
            document.getElementById('btnCompletePrecon').style.display = 'none';
        }
    } catch (e) { /* ignore */ }
}

async function savePrecon() {
    const data = {
        meeting_date: document.getElementById('preconDate').value,
        status: document.getElementById('preconStatusSel').value,
        gc_contact: document.getElementById('preconGC').value,
        location: document.getElementById('preconLocation').value,
        attendees: document.getElementById('preconAttendees').value,
        agenda: document.getElementById('preconAgenda').value,
        minutes: document.getElementById('preconMinutes').value,
    };
    await fetch(`/api/jobs/${JOB_ID}/precon`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(data)
    });
    window._preconLoaded = false;
    loadPrecon();
    alert('Pre-con meeting saved.');
}

async function completePrecon() {
    if (!confirm('Mark pre-construction meeting as complete?')) return;
    await fetch(`/api/jobs/${JOB_ID}/precon/complete`, { method: 'POST' });
    window._preconLoaded = false;
    loadPrecon();
}

// ─── PM Benchmarks (Phase 4) ───────────────────────────────

let benchmarks = [];

async function loadBenchmarks() {
    try {
        const res = await fetch(`/api/jobs/${JOB_ID}/benchmarks`);
        benchmarks = await res.json();
        renderBenchmarks();
    } catch (e) { /* ignore */ }
}

function renderBenchmarks() {
    const container = document.getElementById('benchmarksContainer');
    if (!benchmarks.length) {
        container.innerHTML = '<p class="empty-state">No benchmarks found. Benchmarks are seeded when a bid is awarded.</p>';
        document.getElementById('benchmarkProgress').textContent = '';
        return;
    }
    const total = benchmarks.length;
    const done = benchmarks.filter(b => b.status === 'Complete').length;
    const pct = Math.round((done / total) * 100);
    document.getElementById('benchmarkProgress').innerHTML =
        `<strong>${done}/${total}</strong> complete (${pct}%) <div style="display:inline-block;width:100px;height:8px;background:var(--gray-200);border-radius:4px;vertical-align:middle;margin-left:6px;"><div style="width:${pct}%;height:100%;background:var(--green, #22c55e);border-radius:4px;"></div></div>`;

    // Group by phase
    const phases = {};
    benchmarks.forEach(b => { if (!phases[b.phase]) phases[b.phase] = []; phases[b.phase].push(b); });

    let html = '';
    for (const [phase, items] of Object.entries(phases)) {
        const phaseDone = items.filter(b => b.status === 'Complete').length;
        const phaseTotal = items.length;
        html += `<div style="margin-bottom:16px;">
            <h4 style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                ${phase}
                <small style="font-weight:400;color:var(--gray-400);">${phaseDone}/${phaseTotal}</small>
            </h4>
            <table class="data-table"><thead><tr><th style="width:30px;"></th><th>Task</th><th>Status</th><th>Completed</th><th>Notes</th></tr></thead><tbody>`;
        items.forEach(b => {
            const statusOpts = ['Not Started','In Progress','Complete','N/A'].map(s =>
                `<option value="${s}" ${b.status===s?'selected':''}>${s}</option>`
            ).join('');
            html += `<tr>
                <td style="text-align:center;">${b.status === 'Complete' ? '<span style="color:var(--green,#22c55e);font-size:18px;">&#10003;</span>' : '<span style="color:var(--gray-300);font-size:18px;">&#9675;</span>'}</td>
                <td>${b.task_name}</td>
                <td><select class="form-select" style="width:auto;font-size:12px;padding:2px 4px;" onchange="updateBenchmark(${b.id}, this.value)">${statusOpts}</select></td>
                <td>${b.completed_date || '-'} ${b.completed_by_name ? '<small>('+b.completed_by_name+')</small>' : ''}</td>
                <td><input type="text" class="form-input" value="${b.notes || ''}" style="font-size:12px;padding:2px 6px;" onchange="updateBenchmarkNotes(${b.id}, this.value)"></td>
            </tr>`;
        });
        html += '</tbody></table></div>';
    }
    container.innerHTML = html;
}

async function updateBenchmark(bid, status) {
    const b = benchmarks.find(x => x.id === bid);
    await fetch(`/api/jobs/${JOB_ID}/benchmarks/${bid}`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ status, notes: b?.notes || '' })
    });
    loadBenchmarks();
}

async function updateBenchmarkNotes(bid, notes) {
    const b = benchmarks.find(x => x.id === bid);
    await fetch(`/api/jobs/${JOB_ID}/benchmarks/${bid}`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ status: b?.status || 'Not Started', notes })
    });
}

// ─── Pay Apps ────────────────────────────────────────────────
async function loadPayApps() {
    var res = await fetch('/api/jobs/' + JOB_ID + '/pay-apps');
    var d = await res.json();
    var apps = d.apps || [];
    var t = d.totals || {};

    // KPIs
    document.getElementById('billingKpis').innerHTML =
        kpiCard('Contract Value', fmt(t.contract), '#6366F1') +
        kpiCard('Total Billed', fmt(t.billed), '#3B82F6') +
        kpiCard('Retainage Held', fmt(t.retainage), '#F97316') +
        kpiCard('Net Due', fmt((t.billed || 0) - (t.retainage || 0)), '#22C55E');

    var tbody = document.getElementById('pPayApps');
    if (!apps.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No pay applications yet. <a href="/payapps">Create one in Pay Apps</a>.</td></tr>';
        return;
    }
    tbody.innerHTML = apps.map(function(a) {
        return '<tr>' +
            '<td><strong>#' + a.app_number + '</strong></td>' +
            '<td>' + (a.period_from || '') + (a.period_to ? ' to ' + a.period_to : '') + '</td>' +
            '<td>' + (a.contract_name || '') + '</td>' +
            '<td style="text-align:right;">' + fmt(a.this_period) + '</td>' +
            '<td style="text-align:right;">' + fmt(a.total_billed) + '</td>' +
            '<td style="text-align:right;">' + fmt(a.retainage) + '</td>' +
            '<td><span class="status-badge status-' + (a.status || 'draft').toLowerCase().replace(/ /g, '-') + '">' + (a.status || 'Draft') + '</span></td>' +
            '<td><a href="/payapps/contract/' + a.contract_id + '#app-' + a.id + '" class="btn btn-small btn-secondary">View</a></td>' +
        '</tr>';
    }).join('');
}

function kpiCard(label, value, color) {
    return '<div style="background:#fff;border:1px solid var(--gray-200);border-radius:8px;padding:12px;border-left:4px solid ' + color + ';">' +
        '<div style="font-size:18px;font-weight:700;color:' + color + ';">' + value + '</div>' +
        '<div style="font-size:11px;color:var(--gray-500);">' + label + '</div></div>';
}

// ─── Billing Schedule ─────────────────────────────────────────
var billingItems = [];

async function loadBillingSchedule() {
    const res = await fetch(`/api/jobs/${JOB_ID}/billing-schedule`);
    billingItems = await res.json();
    renderBillingTimeline();
}

function renderBillingTimeline() {
    const el = document.getElementById('billingTimeline');
    if (!el) return;
    if (!billingItems.length) {
        el.innerHTML = '<p class="empty-state">No billing milestones yet. Add milestones to track billing progress.</p>';
        return;
    }
    const today = new Date().toISOString().split('T')[0];
    const statusColors = { Pending: '#6B7280', Ready: '#22C55E', Submitted: '#3B82F6', Paid: '#10B981' };
    let html = '';
    billingItems.forEach(b => {
        const color = statusColors[b.status] || '#6B7280';
        const isOverdue = b.scheduled_date && b.scheduled_date < today && b.status === 'Pending';
        const bg = isOverdue ? '#FEF2F2' : (b.status === 'Ready' ? '#F0FDF4' : '#F9FAFB');
        html += `<div style="display:flex;align-items:center;gap:12px;padding:12px;background:${bg};border-radius:8px;margin-bottom:8px;border-left:4px solid ${color};">`;
        html += `<div style="font-weight:700;font-size:18px;color:${color};width:32px;text-align:center;">${b.billing_number}</div>`;
        html += `<div style="flex:1;">`;
        html += `<div style="font-weight:600;font-size:14px;">${b.description || 'Milestone #' + b.billing_number}</div>`;
        html += `<div style="font-size:12px;color:#6B7280;">${b.scheduled_date || 'No date'} — $${(b.amount || 0).toLocaleString()}</div>`;
        if (b.notes) html += `<div style="font-size:11px;color:#9CA3AF;margin-top:2px;">${b.notes}</div>`;
        html += `</div>`;
        html += `<span style="font-size:12px;padding:2px 8px;border-radius:9999px;background:${color}20;color:${color};font-weight:600;">${b.status}</span>`;
        if (isOverdue) html += `<span style="font-size:11px;padding:2px 6px;border-radius:9999px;background:#FEE2E2;color:#EF4444;font-weight:600;">OVERDUE</span>`;
        html += `<button class="btn btn-secondary btn-small" onclick="editBillingMilestone(${b.id})" style="font-size:11px;">Edit</button>`;
        html += `<button class="btn btn-secondary btn-small" onclick="deleteBillingMilestone(${b.id})" style="font-size:11px;color:#EF4444;">Del</button>`;
        html += `</div>`;
    });
    el.innerHTML = html;
}

function showBillingModal(item) {
    document.getElementById('billingId').value = item ? item.id : '';
    document.getElementById('billingModalTitle').textContent = item ? 'Edit Billing Milestone' : 'Add Billing Milestone';
    document.getElementById('billingDesc').value = item ? item.description : '';
    document.getElementById('billingDate').value = item ? item.scheduled_date : '';
    document.getElementById('billingAmount').value = item ? item.amount : '';
    document.getElementById('billingStatus').value = item ? item.status : 'Pending';
    document.getElementById('billingNotes').value = item ? item.notes : '';
    document.getElementById('billingModal').style.display = 'flex';
}

function editBillingMilestone(id) {
    const item = billingItems.find(b => b.id === id);
    if (item) showBillingModal(item);
}

async function saveBillingMilestone(e) {
    e.preventDefault();
    const id = document.getElementById('billingId').value;
    const payload = {
        description: document.getElementById('billingDesc').value,
        scheduled_date: document.getElementById('billingDate').value,
        amount: document.getElementById('billingAmount').value || 0,
        status: document.getElementById('billingStatus').value,
        notes: document.getElementById('billingNotes').value
    };
    if (id) {
        await fetch('/api/billing-schedule/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    } else {
        await fetch('/api/jobs/' + JOB_ID + '/billing-schedule', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    }
    document.getElementById('billingModal').style.display = 'none';
    loadBillingSchedule();
}

async function deleteBillingMilestone(id) {
    if (!confirm('Delete this billing milestone?')) return;
    await fetch('/api/billing-schedule/' + id, { method: 'DELETE' });
    loadBillingSchedule();
}

// ─── Project Documents ──────────────────────────────────────

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    var size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return size.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

async function loadDocuments() {
    var tbody = document.getElementById('pDocuments');
    if (!tbody) return;
    try {
        var res = await fetch('/api/projects/' + JOB_ID + '/documents');
        var docs = await res.json();
        if (!docs.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No documents uploaded yet.</td></tr>';
            return;
        }
        tbody.innerHTML = docs.map(function(d) {
            return '<tr>' +
                '<td><a href="javascript:void(0)" onclick="viewDocument(' + d.id + ')" class="link">' + (d.file_name || 'Unnamed') + '</a></td>' +
                '<td><span class="status-badge">' + (d.category || 'Other') + '</span></td>' +
                '<td>' + formatFileSize(d.file_size) + '</td>' +
                '<td>' + (d.uploader_name || '') + '</td>' +
                '<td>' + (d.created_at || '').substring(0, 10) + '</td>' +
                '<td style="white-space:nowrap;">' +
                    '<button class="btn btn-small btn-secondary" onclick="viewDocument(' + d.id + ')">View</button> ' +
                    '<button class="btn btn-small btn-secondary" style="color:#EF4444;" onclick="deleteDocument(' + d.id + ')">Delete</button>' +
                '</td></tr>';
        }).join('');
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Error loading documents.</td></tr>';
    }
}

function showDocUploadModal() {
    document.getElementById('docFileInput').value = '';
    document.getElementById('docCategory').value = 'Other';
    document.getElementById('docNotes').value = '';
    document.getElementById('docUploadModal').style.display = 'flex';
}

async function uploadDocument(e) {
    if (e) e.preventDefault();
    var fileInput = document.getElementById('docFileInput');
    var files = fileInput.files;
    if (!files || !files.length) { alert('Please select a file.'); return; }
    var fd = new FormData();
    for (var i = 0; i < files.length; i++) fd.append('files', files[i]);
    fd.append('category', document.getElementById('docCategory').value);
    fd.append('notes', document.getElementById('docNotes').value);
    try {
        var res = await fetch('/api/projects/' + JOB_ID + '/documents', { method: 'POST', body: fd });
        var result = await res.json();
        if (result.ok) {
            document.getElementById('docUploadModal').style.display = 'none';
            loadDocuments();
        } else {
            alert(result.error || 'Upload failed');
        }
    } catch (err) {
        alert('Upload failed: ' + err.message);
    }
}

function viewDocument(docId) {
    window.open('/api/projects/' + JOB_ID + '/documents/' + docId + '/file', '_blank');
}

async function deleteDocument(docId) {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    await fetch('/api/projects/' + JOB_ID + '/documents/' + docId, { method: 'DELETE' });
    loadDocuments();
}

function initDocDropZone() {
    var zone = document.getElementById('docDropZone');
    if (!zone) return;
    zone.addEventListener('dragover', function(e) {
        e.preventDefault();
        zone.style.borderColor = 'var(--blue-500)';
        zone.style.background = 'var(--blue-50, #eff6ff)';
        zone.style.color = 'var(--blue-600, #2563eb)';
    });
    zone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        zone.style.borderColor = 'var(--gray-300)';
        zone.style.background = '';
        zone.style.color = 'var(--gray-500)';
    });
    zone.addEventListener('drop', function(e) {
        e.preventDefault();
        zone.style.borderColor = 'var(--gray-300)';
        zone.style.background = '';
        zone.style.color = 'var(--gray-500)';
        var files = e.dataTransfer.files;
        if (!files || !files.length) return;
        var fd = new FormData();
        for (var i = 0; i < files.length; i++) fd.append('files', files[i]);
        fd.append('category', 'Other');
        fd.append('notes', '');
        fetch('/api/projects/' + JOB_ID + '/documents', { method: 'POST', body: fd })
            .then(function(r) { return r.json(); })
            .then(function(result) { if (result.ok) loadDocuments(); else alert(result.error || 'Upload failed'); })
            .catch(function(err) { alert('Upload failed: ' + err.message); });
    });
}

