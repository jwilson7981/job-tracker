/* Payroll & Time Entry JS */
function fmt(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// Payroll overview
if (document.getElementById('payrollBody') && !window.EMPLOYEE_ID) {
    loadPayroll();
}

async function loadPayroll() {
    const res = await fetch('/api/payroll/summary');
    const users = await res.json();
    const tbody = document.getElementById('payrollBody');
    if (!users.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No employees.</td></tr>'; return; }
    tbody.innerHTML = users.map(u => `<tr>
        <td><a href="/payroll/employee/${u.id}" class="link">${u.display_name}</a></td>
        <td><span class="badge">${u.role.replace('_',' ')}</span></td>
        <td class="cell-computed">${fmt(u.hourly_rate)}/hr</td>
        <td class="cell-computed">${u.total_hours}h</td>
        <td class="cell-computed">${u.pending_hours > 0 ? '<span style="color:#D97706;font-weight:600;">'+u.pending_hours+'h</span>' : '0h'}</td>
        <td class="cell-computed" style="font-weight:700;">${fmt(u.total_pay)}</td>
        <td><a href="/payroll/employee/${u.id}" class="btn btn-small btn-secondary">View</a></td>
    </tr>`).join('');
}

// Employee detail
if (window.EMPLOYEE_ID) {
    loadEmployeeDetail();
}

async function loadEmployeeDetail() {
    const res = await fetch(`/api/payroll/employee/${EMPLOYEE_ID}`);
    const entries = await res.json();
    const tbody = document.getElementById('entriesBody');
    if (!entries.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No time entries.</td></tr>'; return; }

    let totalHours = 0, totalPay = 0;
    tbody.innerHTML = entries.map(e => {
        const pay = (e.hours || 0) * (e.hourly_rate || 0);
        totalHours += e.hours || 0;
        totalPay += pay;
        return `<tr>
            <td>${e.work_date || '-'}</td>
            <td>${e.job_name || '-'}</td>
            <td class="cell-computed">${e.hours}h</td>
            <td class="cell-computed">${fmt(e.hourly_rate)}</td>
            <td class="cell-computed" style="font-weight:700;">${fmt(pay)}</td>
            <td>${e.description || '-'}</td>
            <td>${e.approved ? '<span class="status-badge status-complete">Approved</span>' : '<span class="status-badge status-needs-bid">Pending</span>'}</td>
            <td>${!e.approved ? `<button class="btn btn-small btn-primary" onclick="approveEntry(${e.id})">Approve</button>` : ''}</td>
        </tr>`;
    }).join('');

    const kpis = document.getElementById('empKpis');
    if (kpis) {
        kpis.innerHTML = `
            <div class="kpi-card"><div class="kpi-value">${totalHours.toFixed(1)}h</div><div class="kpi-label">Total Hours</div></div>
            <div class="kpi-card"><div class="kpi-value">${fmt(totalPay)}</div><div class="kpi-label">Total Pay</div></div>
            <div class="kpi-card"><div class="kpi-value">${entries.length}</div><div class="kpi-label">Entries</div></div>
        `;
    }
}

async function approveEntry(id) {
    await fetch(`/api/time-entries/${id}/approve`, { method: 'POST' });
    if (window.EMPLOYEE_ID) loadEmployeeDetail();
}

// Time entry page
if (document.getElementById('myEntriesBody')) {
    loadMyEntries();
}

async function loadMyEntries() {
    const res = await fetch('/api/time-entries');
    const entries = await res.json();
    const tbody = document.getElementById('myEntriesBody');
    if (!entries.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No entries yet. Log your hours above.</td></tr>'; return; }
    tbody.innerHTML = entries.map(e => `<tr>
        <td>${e.work_date || '-'}</td>
        <td>${e.job_name || '-'}</td>
        <td class="cell-computed">${e.hours}h</td>
        <td>${e.description || '-'}</td>
        <td>${e.approved ? '<span class="status-badge status-complete">Approved</span>' : '<span class="status-badge status-needs-bid">Pending</span>'}</td>
        <td>${!e.approved ? `<button class="btn btn-small btn-danger" onclick="deleteEntry(${e.id})">Del</button>` : ''}</td>
    </tr>`).join('');
}

async function submitTimeEntry(e) {
    e.preventDefault();
    await fetch('/api/time-entries', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            job_id: document.getElementById('teJob').value,
            hours: document.getElementById('teHours').value,
            work_date: document.getElementById('teDate').value,
            description: document.getElementById('teDesc').value,
        })
    });
    document.getElementById('teHours').value = '';
    document.getElementById('teDesc').value = '';
    loadMyEntries();
}

async function deleteEntry(id) {
    if (confirm('Delete this time entry?')) {
        await fetch(`/api/time-entries/${id}`, {method:'DELETE'});
        loadMyEntries();
    }
}
