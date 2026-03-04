/* Payroll & Time Entry JS */
function fmt(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// Payroll overview
if (document.getElementById('payrollBody') && !window.EMPLOYEE_ID) {
    loadPayroll();
}

let payrollUsers = [];

async function loadPayroll() {
    const res = await fetch('/api/payroll/summary');
    payrollUsers = await res.json();
    const tbody = document.getElementById('payrollBody');
    if (!payrollUsers.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No employees.</td></tr>'; return; }
    tbody.innerHTML = payrollUsers.map(u => `<tr>
        <td><a href="/payroll/employee/${u.id}" class="link">${u.display_name}</a>${u.employee_number ? ' <span style="color:var(--gray-400);font-size:12px;">#'+u.employee_number+'</span>' : ''}</td>
        <td><span class="badge">${u.role.replace('_',' ')}</span></td>
        <td class="cell-computed">${fmt(u.hourly_rate)}/hr</td>
        <td class="cell-computed">${u.total_hours}h</td>
        <td class="cell-computed">${u.pending_hours > 0 ? '<span style="color:#D97706;font-weight:600;">'+u.pending_hours+'h</span>' : '0h'}</td>
        <td class="cell-computed" style="font-weight:700;">${fmt(u.total_pay)}</td>
        <td style="white-space:nowrap;">
            <a href="/payroll/employee/${u.id}" class="btn btn-small btn-secondary">View</a>
            <button class="btn btn-small btn-secondary" onclick="editEmployee(${u.id})">Edit</button>
            <button class="btn btn-small btn-secondary" onclick="resetPassword(${u.id},'${u.display_name.replace(/'/g,"\\'")}')" title="Reset password">&#128274;</button>
            <button class="btn btn-small btn-secondary" onclick="deleteEmployee(${u.id})" style="color:#EF4444;">Del</button>
        </td>
    </tr>`).join('');
}

function showAddEmployee() {
    document.getElementById('editEmpId').value = '';
    document.getElementById('empModalTitle').textContent = 'Add Employee';
    document.getElementById('empName').value = '';
    document.getElementById('empUsername').value = '';
    document.getElementById('empPassword').value = '';
    document.getElementById('empPasswordGroup').style.display = '';
    document.getElementById('empRole').value = 'employee';
    document.getElementById('empRate').value = '0';
    document.getElementById('empEmail').value = '';
    document.getElementById('empPhone').value = '';
    document.getElementById('empUsername').readOnly = false;
    document.getElementById('addEmployeeModal').style.display = 'flex';
}

function editEmployee(id) {
    const u = payrollUsers.find(x => x.id === id);
    if (!u) return;
    document.getElementById('editEmpId').value = u.id;
    document.getElementById('empModalTitle').textContent = 'Edit Employee';
    document.getElementById('empName').value = u.display_name || '';
    document.getElementById('empUsername').value = u.username || '';
    document.getElementById('empUsername').readOnly = true;
    document.getElementById('empPassword').value = '';
    document.getElementById('empPasswordGroup').style.display = 'none';
    document.getElementById('empRole').value = u.role || 'employee';
    document.getElementById('empRate').value = u.hourly_rate || 0;
    document.getElementById('empEmail').value = u.email || '';
    document.getElementById('empPhone').value = u.phone || '';
    document.getElementById('addEmployeeModal').style.display = 'flex';
}

function closeAddEmployee() { document.getElementById('addEmployeeModal').style.display = 'none'; }

async function saveEmployee() {
    const id = document.getElementById('editEmpId').value;
    const data = {
        display_name: document.getElementById('empName').value.trim(),
        role: document.getElementById('empRole').value,
        hourly_rate: parseFloat(document.getElementById('empRate').value) || 0,
        email: document.getElementById('empEmail').value.trim(),
        phone: document.getElementById('empPhone').value.trim(),
    };

    if (id) {
        const res = await fetch('/api/admin/users/' + id, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
        });
        if (res.ok) { closeAddEmployee(); loadPayroll(); }
        else { const err = await res.json(); alert(err.error || 'Failed to update'); }
    } else {
        data.username = document.getElementById('empUsername').value.trim();
        data.password = document.getElementById('empPassword').value;
        if (!data.username || !data.password) return alert('Username and password are required');
        if (!data.display_name) return alert('Display name is required');
        const res = await fetch('/api/admin/users', {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
        });
        if (res.ok) { closeAddEmployee(); loadPayroll(); }
        else { const err = await res.json(); alert(err.error || 'Failed to create employee'); }
    }
}

async function deleteEmployee(id) {
    const u = payrollUsers.find(x => x.id === id);
    if (!confirm(`Delete employee "${u ? u.display_name : id}"? This will remove their account and cannot be undone.`)) return;
    const res = await fetch('/api/admin/users/' + id, { method: 'DELETE' });
    if (res.ok) { loadPayroll(); }
    else { const err = await res.json(); alert(err.error || 'Failed to delete'); }
}

async function resetPassword(id, name) {
    if (!confirm(`Reset password for "${name}" to "password"? They will be required to change it on next login.`)) return;
    const res = await fetch('/api/admin/users/' + id + '/reset-password', { method: 'POST' });
    if (res.ok) {
        const data = await res.json();
        alert(data.message || 'Password reset successfully. Temporary password: password');
    } else {
        const err = await res.json();
        alert(err.error || 'Failed to reset password');
    }
}

// ─── Employee Detail Page ────────────────────────────────────
let empEntries = [];
let empJobs = [];

if (window.EMPLOYEE_ID) {
    initEmployeeDetail();
}

async function initEmployeeDetail() {
    // Load jobs for dropdown
    const jr = await fetch('/api/jobs/list');
    empJobs = await jr.json();
    const sel = document.getElementById('entryJob');
    if (sel) {
        empJobs.forEach(j => {
            const o = document.createElement('option');
            o.value = j.id;
            o.textContent = j.name;
            sel.appendChild(o);
        });
    }
    loadEmployeeDetail();
}

async function loadEmployeeDetail() {
    const res = await fetch(`/api/payroll/employee/${EMPLOYEE_ID}`);
    empEntries = await res.json();
    const tbody = document.getElementById('entriesBody');
    if (!empEntries.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No time entries. Click "+ Add Time Entry" to add one.</td></tr>'; return; }

    let totalHours = 0, totalPay = 0;
    tbody.innerHTML = empEntries.map(e => {
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
            <td style="white-space:nowrap;">
                ${!e.approved ? `<button class="btn btn-small btn-primary" onclick="approveEntry(${e.id})">Approve</button>` : ''}
                <button class="btn btn-small btn-secondary" onclick="editEntry(${e.id})">Edit</button>
                <button class="btn btn-small btn-secondary" onclick="deleteTimeEntry(${e.id})" style="color:#EF4444;">Del</button>
            </td>
        </tr>`;
    }).join('');

    const kpis = document.getElementById('empKpis');
    if (kpis) {
        kpis.innerHTML = `
            <div class="kpi-card"><div class="kpi-value">${totalHours.toFixed(1)}h</div><div class="kpi-label">Total Hours</div></div>
            <div class="kpi-card"><div class="kpi-value">${fmt(totalPay)}</div><div class="kpi-label">Total Pay</div></div>
            <div class="kpi-card"><div class="kpi-value">${empEntries.length}</div><div class="kpi-label">Entries</div></div>
        `;
    }
}

async function approveEntry(id) {
    await fetch(`/api/time-entries/${id}/approve`, { method: 'POST' });
    loadEmployeeDetail();
}

function showAddEntry() {
    document.getElementById('editEntryId').value = '';
    document.getElementById('entryModalTitle').textContent = 'Add Time Entry';
    document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('entryHours').value = '';
    document.getElementById('entryRate').value = window.EMPLOYEE_RATE || 0;
    document.getElementById('entryType').value = 'regular';
    document.getElementById('entryDesc').value = '';
    if (empJobs.length) document.getElementById('entryJob').value = empJobs[0].id;
    document.getElementById('entryModal').style.display = 'flex';
}

function editEntry(id) {
    const e = empEntries.find(x => x.id === id);
    if (!e) return;
    document.getElementById('editEntryId').value = e.id;
    document.getElementById('entryModalTitle').textContent = 'Edit Time Entry';
    document.getElementById('entryJob').value = e.job_id;
    document.getElementById('entryDate').value = e.work_date || '';
    document.getElementById('entryHours').value = e.hours || '';
    document.getElementById('entryRate').value = e.hourly_rate || 0;
    document.getElementById('entryType').value = e.entry_type || 'regular';
    document.getElementById('entryDesc').value = e.description || '';
    document.getElementById('entryModal').style.display = 'flex';
}

function closeEntryModal() { document.getElementById('entryModal').style.display = 'none'; }

async function saveEntry() {
    const id = document.getElementById('editEntryId').value;
    const data = {
        user_id: EMPLOYEE_ID,
        job_id: document.getElementById('entryJob').value,
        work_date: document.getElementById('entryDate').value,
        hours: parseFloat(document.getElementById('entryHours').value) || 0,
        hourly_rate: parseFloat(document.getElementById('entryRate').value) || 0,
        entry_type: document.getElementById('entryType').value,
        description: document.getElementById('entryDesc').value.trim(),
    };
    if (!data.job_id) return alert('Job is required');
    if (!data.hours) return alert('Hours is required');
    if (!data.work_date) return alert('Date is required');

    const url = id ? `/api/payroll/entries/${id}` : '/api/payroll/entries';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    if (res.ok) { closeEntryModal(); loadEmployeeDetail(); }
    else { const err = await res.json(); alert(err.error || 'Failed to save'); }
}

async function deleteTimeEntry(id) {
    if (!confirm('Delete this time entry?')) return;
    const res = await fetch(`/api/payroll/entries/${id}`, { method: 'DELETE' });
    if (res.ok) { loadEmployeeDetail(); }
    else { const err = await res.json(); alert(err.error || 'Failed to delete'); }
}

// Edit hourly rate
function showEditRate() { document.getElementById('rateModal').style.display = 'flex'; }
function closeRateModal() { document.getElementById('rateModal').style.display = 'none'; }

async function saveRate() {
    const rate = parseFloat(document.getElementById('newRate').value) || 0;
    const res = await fetch('/api/admin/users/' + EMPLOYEE_ID, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ hourly_rate: rate })
    });
    if (res.ok) {
        window.EMPLOYEE_RATE = rate;
        closeRateModal();
        location.reload();
    } else {
        const err = await res.json();
        alert(err.error || 'Failed to update rate');
    }
}

// ─── Time Entry Page (self-service) ──────────────────────────
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
