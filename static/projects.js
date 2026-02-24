/* Projects JS */
function fmt(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// Overview page
if (document.getElementById('projectsBody') && !window.JOB_ID) {
    loadProjects();
}

// Detail page
if (window.JOB_ID) {
    loadProjectDetail();
}

async function loadProjects() {
    const res = await fetch('/api/projects');
    const projects = await res.json();
    const tbody = document.getElementById('projectsBody');
    if (!projects.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No projects.</td></tr>'; return; }
    tbody.innerHTML = projects.map(p => `<tr>
        <td><a href="/projects/${p.id}" class="link">${p.name}</a></td>
        <td><span class="status-badge status-${p.status.toLowerCase().replace(/ /g,'-')}">${p.status}</span></td>
        <td>${p.location}</td>
        <td class="cell-computed">${fmt(p.material_cost)}</td>
        <td class="cell-computed">${fmt(p.expenses)}</td>
        <td class="cell-computed">${p.open_service_calls > 0 ? '<span style="color:#D97706;font-weight:600;">'+p.open_service_calls+'</span>' : '0'}</td>
        <td class="cell-computed">${p.warranty_items}</td>
        <td>${(p.updated_at || '').substring(0, 10)}</td>
        <td><a href="/projects/${p.id}" class="btn btn-small btn-secondary">View</a></td>
    </tr>`).join('');
}

async function loadProjectDetail() {
    const res = await fetch(`/api/projects/${JOB_ID}`);
    const data = await res.json();
    document.getElementById('projectLoading').style.display = 'none';
    document.getElementById('projectContent').style.display = 'block';

    const totalExpenses = data.expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const totalInvoiced = data.invoices.reduce((s, i) => s + (i.amount || 0), 0);
    const totalLabor = data.time_entries.reduce((s, t) => s + (t.hours || 0) * (t.hourly_rate || 0), 0);

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

function switchProjectTab(tab, btn) {
    document.querySelectorAll('.project-tab').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('ptab-' + tab).style.display = 'block';
    if (btn) btn.classList.add('active');
}
