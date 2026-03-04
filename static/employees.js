/* Employees (HR) JS */
function fmt(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

let allEmployees = [];

// ─── List Page ──────────────────────────────────────────────────
if (document.getElementById('empBody') && !window.EMPLOYEE_ID) {
    loadEmployees();
}

async function loadEmployees() {
    const status = document.getElementById('empStatusFilter').value;
    const res = await fetch('/api/employees?status=' + encodeURIComponent(status));
    allEmployees = await res.json();
    filterEmployees();
}

function filterEmployees() {
    const q = (document.getElementById('empSearch').value || '').toLowerCase();
    const filtered = q ? allEmployees.filter(e =>
        (e.display_name || '').toLowerCase().includes(q) ||
        (e.employee_number || '').toLowerCase().includes(q) ||
        (e.email || '').toLowerCase().includes(q) ||
        (e.phone || '').toLowerCase().includes(q)
    ) : allEmployees;

    document.getElementById('empCount').textContent = filtered.length + ' employee' + (filtered.length !== 1 ? 's' : '');
    const tbody = document.getElementById('empBody');
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No employees found.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(e => {
        const statusClass = e.employment_status === 'Active' ? 'status-complete' :
            e.employment_status === 'Terminated' ? 'status-needs-bid' : 'status-in-progress';
        return `<tr>
            <td>${e.employee_number || '-'}</td>
            <td><a href="/employees/${e.id}" class="link">${e.display_name}</a></td>
            <td><span class="badge">${(e.role || '').replace('_',' ')}</span></td>
            <td>${e.phone || '-'}</td>
            <td class="cell-computed">${fmt(e.hourly_rate)}/hr</td>
            <td><span class="status-badge ${statusClass}">${e.employment_status || 'Active'}</span></td>
            <td style="white-space:nowrap;">
                <a href="/employees/${e.id}" class="btn btn-small btn-secondary">View</a>
                <button class="btn btn-small btn-secondary" onclick="editEmployee(${e.id})">Edit</button>
                <button class="btn btn-small btn-secondary" onclick="resetEmpPassword(${e.id},'${(e.display_name||'').replace(/'/g,"\\'")}')" title="Reset password">&#128274;</button>
            </td>
        </tr>`;
    }).join('');
}

async function resetEmpPassword(id, name) {
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

function showAddEmployee() {
    document.getElementById('empEditId').value = '';
    document.getElementById('empModalTitle').textContent = 'Add Employee';
    document.getElementById('empName').value = '';
    document.getElementById('empUsername').value = '';
    document.getElementById('empUsername').readOnly = false;
    document.getElementById('empPassword').value = '';
    document.getElementById('empPasswordGroup').style.display = '';
    document.getElementById('empRole').value = 'employee';
    document.getElementById('empNumber').value = '';
    document.getElementById('empEmail').value = '';
    document.getElementById('empPhone').value = '';
    document.getElementById('empHireDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('empDOB').value = '';
    document.getElementById('empSSN').value = '';
    document.getElementById('empShirtSize').value = '';
    document.getElementById('empStreet').value = '';
    document.getElementById('empCity').value = '';
    document.getElementById('empState').value = '';
    document.getElementById('empZip').value = '';
    document.getElementById('empRate').value = '0';
    document.getElementById('empECName').value = '';
    document.getElementById('empECPhone').value = '';
    document.getElementById('empECRelation').value = '';
    document.getElementById('empNotes').value = '';
    document.getElementById('empModal').style.display = 'flex';
}

function editEmployee(id) {
    // Fetch full detail then populate modal
    fetch('/api/employees/' + id).then(r => r.json()).then(e => {
        document.getElementById('empEditId').value = e.id;
        document.getElementById('empModalTitle').textContent = 'Edit Employee';
        document.getElementById('empName').value = e.display_name || '';
        const hasLogin = e.username && !e.username.startsWith('_nologin_');
        document.getElementById('empUsername').value = hasLogin ? e.username : '';
        document.getElementById('empUsername').readOnly = hasLogin;
        document.getElementById('empPassword').value = '';
        document.getElementById('empPasswordGroup').style.display = 'none';
        document.getElementById('empRole').value = e.role || 'employee';
        document.getElementById('empNumber').value = e.employee_number || '';
        document.getElementById('empEmail').value = e.email || '';
        document.getElementById('empPhone').value = e.phone || '';
        document.getElementById('empHireDate').value = e.hire_date || '';
        document.getElementById('empDOB').value = e.date_of_birth || '';
        document.getElementById('empSSN').value = '';
        document.getElementById('empShirtSize').value = e.shirt_size || '';
        document.getElementById('empStreet').value = e.address_street || '';
        document.getElementById('empCity').value = e.address_city || '';
        document.getElementById('empState').value = e.address_state || '';
        document.getElementById('empZip').value = e.address_zip || '';
        document.getElementById('empRate').value = e.hourly_rate || 0;
        document.getElementById('empECName').value = e.emergency_contact_name || '';
        document.getElementById('empECPhone').value = e.emergency_contact_phone || '';
        document.getElementById('empECRelation').value = e.emergency_contact_relationship || '';
        document.getElementById('empNotes').value = e.notes || '';
        document.getElementById('empModal').style.display = 'flex';
    });
}

function closeEmpModal() { document.getElementById('empModal').style.display = 'none'; }

async function saveEmployee() {
    const id = document.getElementById('empEditId').value;
    const data = {
        display_name: document.getElementById('empName').value.trim(),
        role: document.getElementById('empRole').value,
        employee_number: document.getElementById('empNumber').value.trim(),
        email: document.getElementById('empEmail').value.trim(),
        phone: document.getElementById('empPhone').value.trim(),
        hire_date: document.getElementById('empHireDate').value,
        date_of_birth: document.getElementById('empDOB').value,
        shirt_size: document.getElementById('empShirtSize').value,
        address_street: document.getElementById('empStreet').value.trim(),
        address_city: document.getElementById('empCity').value.trim(),
        address_state: document.getElementById('empState').value.trim(),
        address_zip: document.getElementById('empZip').value.trim(),
        hourly_rate: parseFloat(document.getElementById('empRate').value) || 0,
        emergency_contact_name: document.getElementById('empECName').value.trim(),
        emergency_contact_phone: document.getElementById('empECPhone').value.trim(),
        emergency_contact_relationship: document.getElementById('empECRelation').value.trim(),
        notes: document.getElementById('empNotes').value.trim(),
    };
    const ssn = document.getElementById('empSSN').value.trim();
    if (ssn) data.ssn = ssn;

    if (id) {
        const res = await fetch('/api/employees/' + id, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
        });
        if (res.ok) { closeEmpModal(); loadEmployees(); }
        else { const err = await res.json(); alert(err.error || 'Failed to update'); }
    } else {
        data.username = document.getElementById('empUsername').value.trim();
        data.password = document.getElementById('empPassword').value;
        if (!data.display_name) return alert('Display name is required');
        if (data.username && !data.password) return alert('Password is required when setting a username');
        if (!data.username && data.password) return alert('Username is required when setting a password');
        const res = await fetch('/api/employees', {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
        });
        if (res.ok) { closeEmpModal(); loadEmployees(); }
        else { const err = await res.json(); alert(err.error || 'Failed to create employee'); }
    }
}

// ─── Detail Page ────────────────────────────────────────────────
let empDetail = null;

if (window.EMPLOYEE_ID) {
    loadEmployeeDetail();
}

async function loadEmployeeDetail() {
    const res = await fetch('/api/employees/' + EMPLOYEE_ID);
    empDetail = await res.json();
    renderDetail();
}

function renderDetail() {
    const e = empDetail;
    document.getElementById('empDetailName').textContent = e.display_name || '';
    document.getElementById('empDetailSubtitle').textContent =
        (e.role || '').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) +
        (e.employee_number ? ' \u2014 #' + e.employee_number : '');

    // KPIs
    const kpis = document.getElementById('empKpis');
    if (kpis) {
        const statusClass = e.employment_status === 'Active' ? '#10B981' :
            e.employment_status === 'Terminated' ? '#EF4444' : '#D97706';
        kpis.innerHTML = `
            <div class="kpi-card"><div class="kpi-value">${e.total_hours || 0}h</div><div class="kpi-label">Total Hours</div></div>
            <div class="kpi-card"><div class="kpi-value">${fmt(e.total_pay)}</div><div class="kpi-label">Total Pay</div></div>
            <div class="kpi-card"><div class="kpi-value">${fmt(e.hourly_rate)}/hr</div><div class="kpi-label">Pay Rate</div></div>
            <div class="kpi-card"><div class="kpi-value" style="color:${statusClass}">${e.employment_status || 'Active'}</div><div class="kpi-label">Status</div></div>
        `;
    }

    // Info cards
    const cards = document.getElementById('infoCards');
    const ssnRow = e.ssn_display ? `
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <span><strong>SSN:</strong> <span id="ssnValue">${e.ssn_display}</span></span>
            ${window.USER_ROLE === 'owner' ? '<button class="btn btn-small btn-secondary" onclick="revealSSN()">Reveal</button>' : ''}
        </div>` : '<div><strong>SSN:</strong> <span style="color:var(--gray-400);">Not set</span></div>';

    cards.innerHTML = `
        <div class="card" style="padding:16px;">
            <h4 style="margin:0 0 12px;font-size:14px;color:var(--gray-500);text-transform:uppercase;">Personal Info</h4>
            <div style="display:grid;gap:8px;font-size:14px;">
                <div><strong>Email:</strong> ${e.email || '-'}</div>
                <div><strong>Phone:</strong> ${e.phone || '-'}</div>
                <div><strong>DOB:</strong> ${e.date_of_birth || '-'}</div>
                ${ssnRow}
                <div><strong>Shirt Size:</strong> ${e.shirt_size || '-'}</div>
            </div>
        </div>
        <div class="card" style="padding:16px;">
            <h4 style="margin:0 0 12px;font-size:14px;color:var(--gray-500);text-transform:uppercase;">Employment Info</h4>
            <div style="display:grid;gap:8px;font-size:14px;">
                <div><strong>Employee #:</strong> ${e.employee_number || '-'}</div>
                <div><strong>Role:</strong> ${(e.role || '').replace('_',' ').replace(/\\b\\w/g, c => c.toUpperCase())}</div>
                <div><strong>Hire Date:</strong> ${e.hire_date || '-'}</div>
                <div><strong>Termination Date:</strong> ${e.termination_date || '-'}</div>
                <div><strong>Status:</strong> <span class="status-badge ${e.employment_status === 'Active' ? 'status-complete' : e.employment_status === 'Terminated' ? 'status-needs-bid' : 'status-in-progress'}">${e.employment_status || 'Active'}</span></div>
            </div>
        </div>
        <div class="card" style="padding:16px;">
            <h4 style="margin:0 0 12px;font-size:14px;color:var(--gray-500);text-transform:uppercase;">Address</h4>
            <div style="font-size:14px;">
                ${e.address_street ? `<div>${e.address_street}</div>` : ''}
                ${e.address_city || e.address_state || e.address_zip ?
                    `<div>${[e.address_city, e.address_state].filter(Boolean).join(', ')}${e.address_zip ? ' ' + e.address_zip : ''}</div>` :
                    '<div style="color:var(--gray-400);">Not set</div>'}
            </div>
        </div>
        <div class="card" style="padding:16px;">
            <h4 style="margin:0 0 12px;font-size:14px;color:var(--gray-500);text-transform:uppercase;">Emergency Contact</h4>
            <div style="display:grid;gap:8px;font-size:14px;">
                <div><strong>Name:</strong> ${e.emergency_contact_name || '-'}</div>
                <div><strong>Phone:</strong> ${e.emergency_contact_phone || '-'}</div>
                <div><strong>Relationship:</strong> ${e.emergency_contact_relationship || '-'}</div>
            </div>
        </div>
        ${e.notes ? `<div class="card" style="padding:16px;grid-column:1/-1;">
            <h4 style="margin:0 0 8px;font-size:14px;color:var(--gray-500);text-transform:uppercase;">Notes</h4>
            <div style="font-size:14px;white-space:pre-wrap;">${e.notes}</div>
        </div>` : ''}
    `;

    // Recent entries
    const tbody = document.getElementById('recentEntriesBody');
    if (!e.recent_entries || !e.recent_entries.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No time entries.</td></tr>';
    } else {
        tbody.innerHTML = e.recent_entries.map(te => `<tr>
            <td>${te.work_date || '-'}</td>
            <td>${te.job_name || '-'}</td>
            <td class="cell-computed">${te.hours}h</td>
            <td class="cell-computed">${fmt(te.hourly_rate)}</td>
            <td class="cell-computed" style="font-weight:700;">${fmt((te.hours || 0) * (te.hourly_rate || 0))}</td>
            <td>${te.description || '-'}</td>
        </tr>`).join('');
    }
}

async function revealSSN() {
    const btn = event.target;
    const span = document.getElementById('ssnValue');
    if (btn.textContent === 'Hide') {
        span.textContent = empDetail.ssn_display;
        btn.textContent = 'Reveal';
        return;
    }
    const res = await fetch('/api/employees/' + EMPLOYEE_ID + '/ssn');
    const data = await res.json();
    if (data.ssn) {
        span.textContent = data.ssn;
        btn.textContent = 'Hide';
    } else {
        alert('No SSN on file');
    }
}

function editEmployeeDetail() {
    const e = empDetail;
    document.getElementById('editName').value = e.display_name || '';
    document.getElementById('editRole').value = e.role || 'employee';
    document.getElementById('editNumber').value = e.employee_number || '';
    document.getElementById('editEmail').value = e.email || '';
    document.getElementById('editPhone').value = e.phone || '';
    document.getElementById('editHireDate').value = e.hire_date || '';
    document.getElementById('editDOB').value = e.date_of_birth || '';
    document.getElementById('editSSN').value = '';
    document.getElementById('editShirtSize').value = e.shirt_size || '';
    document.getElementById('editStreet').value = e.address_street || '';
    document.getElementById('editCity').value = e.address_city || '';
    document.getElementById('editState').value = e.address_state || '';
    document.getElementById('editZip').value = e.address_zip || '';
    document.getElementById('editRate').value = e.hourly_rate || 0;
    document.getElementById('editECName').value = e.emergency_contact_name || '';
    document.getElementById('editECPhone').value = e.emergency_contact_phone || '';
    document.getElementById('editECRelation').value = e.emergency_contact_relationship || '';
    document.getElementById('editNotes').value = e.notes || '';
    document.getElementById('empEditModal').style.display = 'flex';
}

function closeEditModal() { document.getElementById('empEditModal').style.display = 'none'; }

async function saveEmployeeEdit() {
    const data = {
        display_name: document.getElementById('editName').value.trim(),
        role: document.getElementById('editRole').value,
        employee_number: document.getElementById('editNumber').value.trim(),
        email: document.getElementById('editEmail').value.trim(),
        phone: document.getElementById('editPhone').value.trim(),
        hire_date: document.getElementById('editHireDate').value,
        date_of_birth: document.getElementById('editDOB').value,
        shirt_size: document.getElementById('editShirtSize').value,
        address_street: document.getElementById('editStreet').value.trim(),
        address_city: document.getElementById('editCity').value.trim(),
        address_state: document.getElementById('editState').value.trim(),
        address_zip: document.getElementById('editZip').value.trim(),
        hourly_rate: parseFloat(document.getElementById('editRate').value) || 0,
        emergency_contact_name: document.getElementById('editECName').value.trim(),
        emergency_contact_phone: document.getElementById('editECPhone').value.trim(),
        emergency_contact_relationship: document.getElementById('editECRelation').value.trim(),
        notes: document.getElementById('editNotes').value.trim(),
    };
    const ssn = document.getElementById('editSSN').value.trim();
    if (ssn) data.ssn = ssn;

    const res = await fetch('/api/employees/' + EMPLOYEE_ID, {
        method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
    });
    if (res.ok) {
        closeEditModal();
        loadEmployeeDetail();
    } else {
        const err = await res.json();
        alert(err.error || 'Failed to update');
    }
}

function showStatusChange() {
    const e = empDetail;
    document.getElementById('currentStatusText').textContent = e.employment_status || 'Active';
    document.getElementById('newStatus').value = e.employment_status || 'Active';
    updateStatusWarning();
    document.getElementById('statusModal').style.display = 'flex';
}

function closeStatusModal() { document.getElementById('statusModal').style.display = 'none'; }

document.addEventListener('DOMContentLoaded', function() {
    const sel = document.getElementById('newStatus');
    if (sel) sel.addEventListener('change', updateStatusWarning);
});

function updateStatusWarning() {
    const sel = document.getElementById('newStatus');
    const warn = document.getElementById('statusWarning');
    if (!sel || !warn) return;
    if (sel.value === 'Terminated') {
        warn.style.display = '';
        warn.textContent = 'This will set a termination date and prevent the employee from logging in.';
    } else if (sel.value === 'Inactive') {
        warn.style.display = '';
        warn.textContent = 'This will prevent the employee from logging in.';
    } else if (sel.value === 'Active' && empDetail && empDetail.employment_status === 'Terminated') {
        warn.style.display = '';
        warn.textContent = 'This will rehire the employee: clear termination date and allow login.';
    } else {
        warn.style.display = 'none';
    }
}

async function saveStatusChange() {
    const newStatus = document.getElementById('newStatus').value;
    if (newStatus === empDetail.employment_status) {
        closeStatusModal();
        return;
    }
    const res = await fetch('/api/employees/' + EMPLOYEE_ID + '/status', {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
        closeStatusModal();
        loadEmployeeDetail();
    } else {
        const err = await res.json();
        alert(err.error || 'Failed to update status');
    }
}
