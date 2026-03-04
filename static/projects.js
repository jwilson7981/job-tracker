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
    const tbody = document.getElementById('projectsBody');
    if (!_allProjects.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No projects.</td></tr>'; return; }
    const canDelete = typeof USER_ROLE !== 'undefined' && (USER_ROLE === 'owner' || USER_ROLE === 'admin');
    tbody.innerHTML = _allProjects.map(p => `<tr>
        <td><a href="/projects/${p.id}" class="link">${p.name}</a></td>
        <td><span class="status-badge status-${p.status.toLowerCase().replace(/ /g,'-')}">${p.status}</span></td>
        <td>${p.location}</td>
        <td class="cell-computed">${fmt(p.material_cost)}</td>
        <td class="cell-computed">${fmt(p.expenses)}</td>
        <td class="cell-computed">${p.open_service_calls > 0 ? '<span style="color:#D97706;font-weight:600;">'+p.open_service_calls+'</span>' : '0'}</td>
        <td class="cell-computed">${p.warranty_items}</td>
        <td>${(p.updated_at || '').substring(0, 10)}</td>
        <td style="white-space:nowrap;">
            <a href="/projects/${p.id}" class="btn btn-small btn-secondary">View</a>
            <button class="btn btn-small btn-secondary" onclick="event.stopPropagation();editProject(${p.id})">Edit</button>
            ${canDelete ? `<button class="btn btn-small btn-secondary" style="color:#EF4444;" onclick="event.stopPropagation();deleteProject(${p.id})">Del</button>` : ''}
        </td>
    </tr>`).join('');
}

function editProject(id) {
    const p = _allProjects.find(x => x.id === id);
    if (!p) return;
    // Need to fetch full job data for address fields
    fetch('/api/job/' + id).then(r => r.json()).then(data => {
        document.getElementById('editJobId').value = id;
        document.getElementById('editJobName').value = data.name || '';
        document.getElementById('editJobStatus').value = data.status || 'Needs Bid';
        document.getElementById('editJobAddress').value = data.address || '';
        document.getElementById('editJobCity').value = data.city || '';
        document.getElementById('editJobState').value = data.state || '';
        document.getElementById('editJobZip').value = data.zip_code || '';
        document.getElementById('editJobTaxRate').value = data.tax_rate || '';
        document.getElementById('editJobModal').style.display = 'flex';
    });
}

function hideEditJobModal() {
    document.getElementById('editJobModal').style.display = 'none';
}

async function updateProject(e) {
    e.preventDefault();
    const id = document.getElementById('editJobId').value;
    const payload = {
        name: document.getElementById('editJobName').value.trim(),
        status: document.getElementById('editJobStatus').value,
        address: document.getElementById('editJobAddress').value.trim(),
        city: document.getElementById('editJobCity').value.trim(),
        state: document.getElementById('editJobState').value.trim(),
        zip_code: document.getElementById('editJobZip').value.trim(),
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

    // Project info bar (supplier account + PM assignment)
    const infoEl = document.getElementById('projectInfo');
    if (infoEl) {
        let infoHtml = '';
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
    if (tab === 'billing' && !window._billingLoaded) { loadBillingSchedule(); window._billingLoaded = true; }
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

