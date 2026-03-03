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
        <td><a href="/payroll/employee/${u.id}" class="link">${u.display_name}</a></td>
        <td><span class="badge">${u.role.replace('_',' ')}</span></td>
        <td class="cell-computed">${fmt(u.hourly_rate)}/hr</td>
        <td class="cell-computed">${u.total_hours}h</td>
        <td class="cell-computed">${u.pending_hours > 0 ? '<span style="color:#D97706;font-weight:600;">'+u.pending_hours+'h</span>' : '0h'}</td>
        <td class="cell-computed" style="font-weight:700;">${fmt(u.total_pay)}</td>
        <td style="white-space:nowrap;">
            <a href="/payroll/employee/${u.id}" class="btn btn-small btn-secondary">View</a>
            <button class="btn btn-small btn-secondary" onclick="editEmployee(${u.id})">Edit</button>
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
        // Update existing
        const res = await fetch('/api/admin/users/' + id, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
        });
        if (res.ok) { closeAddEmployee(); loadPayroll(); }
        else { const err = await res.json(); alert(err.error || 'Failed to update'); }
    } else {
        // Create new
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
