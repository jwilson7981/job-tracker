/* Tax Forms (W4/W9) JS */

var allForms = [];
var employees = [];

document.addEventListener('DOMContentLoaded', function() {
    loadAll();
});

async function loadAll() {
    var [fRes, eRes] = await Promise.all([
        fetch('/api/tax-forms'),
        fetch('/api/employees?status=all')
    ]);
    allForms = await fRes.json();
    employees = await eRes.json();
    populateEmployeeDropdowns();
    renderCompanyW9();
    renderEmpW4();
    renderEmpW9();
    render1099();
}

function populateEmployeeDropdowns() {
    var opts = '<option value="">-- Select Employee --</option>';
    var filterOpts = '<option value="">All Employees</option>';
    employees.forEach(function(e) {
        opts += '<option value="' + e.id + '">' + e.display_name + '</option>';
        filterOpts += '<option value="' + e.id + '">' + e.display_name + '</option>';
    });
    ['w9Employee','w4Employee'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = opts;
    });
    ['f1099Employee'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = opts;
    });
    ['filterW4Employee','filterW9Employee','filter1099Employee'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = filterOpts;
    });
}

function switchTfTab(tab, btn) {
    document.querySelectorAll('.tf-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.tf-section').forEach(function(s) { s.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    if (tab === 'company') document.getElementById('tfCompany').classList.add('active');
    else if (tab === 'empW4') document.getElementById('tfEmpW4').classList.add('active');
    else if (tab === 'empW9') document.getElementById('tfEmpW9').classList.add('active');
    else if (tab === 'emp1099') document.getElementById('tfEmp1099').classList.add('active');
}

// ─── Company W9 ─────────────────────────────────────────────────
function renderCompanyW9() {
    var items = allForms.filter(function(f) { return f.entity_type === 'company' && f.form_type === 'W9'; });
    var el = document.getElementById('companyW9List');
    if (!items.length) {
        el.innerHTML = '<div class="empty-state" style="padding:40px;text-align:center;">No company W-9 on file. Click "+ Company W9" to create one.</div>';
        return;
    }
    el.innerHTML = items.map(function(f) {
        var sc = f.status === 'Signed' ? 'status-complete' : f.status === 'Complete' ? 'status-in-progress' : 'status-needs-bid';
        return '<div class="form-card">' +
            '<div class="form-card-header">' +
                '<div>' +
                    '<h3>' + (f.w9_name || 'Company W-9') + '</h3>' +
                    '<div style="font-size:13px;color:var(--gray-500);">' +
                        (f.w9_business_name ? f.w9_business_name + ' | ' : '') +
                        (f.w9_tax_class || '') + (f.w9_tin ? ' | TIN: ***' + f.w9_tin.slice(-4) : '') +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:6px;align-items:center;">' +
                    '<span class="status-badge ' + sc + '">' + f.status + '</span>' +
                    (f.has_file ? '<a href="/api/tax-forms/' + f.id + '/file" target="_blank" class="btn btn-secondary btn-small">View PDF</a>' : '') +
                    '<button class="btn btn-secondary btn-small" onclick="editW9(' + f.id + ')">Edit</button>' +
                    '<button class="btn btn-secondary btn-small" style="color:#EF4444;" onclick="deleteForm(' + f.id + ')">Del</button>' +
                '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;font-size:13px;margin-top:8px;">' +
                '<div><span style="color:var(--gray-500);">Address:</span> ' + (f.w9_address || '-') + '</div>' +
                '<div><span style="color:var(--gray-500);">City/State/ZIP:</span> ' + (f.w9_city_state_zip || '-') + '</div>' +
                '<div><span style="color:var(--gray-500);">Signed:</span> ' + (f.w9_signature_date || '-') + '</div>' +
            '</div>' +
        '</div>';
    }).join('');
}

// ─── Employee W4 ────────────────────────────────────────────────
function renderEmpW4() {
    var uid = document.getElementById('filterW4Employee')?.value;
    var items = allForms.filter(function(f) { return f.form_type === 'W4' && f.entity_type === 'employee'; });
    if (uid) items = items.filter(function(f) { return f.user_id == uid; });
    var tbody = document.getElementById('empW4Body');
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No W-4 forms on file.</td></tr>';
        return;
    }
    tbody.innerHTML = items.map(function(f) {
        var sc = f.status === 'Signed' ? 'status-complete' : f.status === 'Complete' ? 'status-in-progress' : 'status-needs-bid';
        return '<tr>' +
            '<td>' + (f.employee_name || '-') + '</td>' +
            '<td>' + (f.w4_filing_status || '-') + '</td>' +
            '<td>$' + Number(f.w4_dependents_amount || 0).toLocaleString() + '</td>' +
            '<td>$' + Number(f.w4_extra_withholding || 0).toLocaleString() + '</td>' +
            '<td><span class="status-badge ' + sc + '">' + f.status + '</span></td>' +
            '<td>' + (f.w4_signature_date || '-') + '</td>' +
            '<td style="white-space:nowrap;">' +
                (f.has_file ? '<a href="/api/tax-forms/' + f.id + '/file" target="_blank" class="btn btn-secondary btn-small" style="font-size:11px;">PDF</a> ' : '') +
                '<button class="btn btn-secondary btn-small" onclick="editW4(' + f.id + ')" style="font-size:11px;">Edit</button> ' +
                '<button class="btn btn-secondary btn-small" onclick="deleteForm(' + f.id + ')" style="font-size:11px;color:#EF4444;">Del</button>' +
            '</td></tr>';
    }).join('');
}

// ─── Employee W9 ────────────────────────────────────────────────
function renderEmpW9() {
    var uid = document.getElementById('filterW9Employee')?.value;
    var items = allForms.filter(function(f) { return f.form_type === 'W9' && f.entity_type === 'employee'; });
    if (uid) items = items.filter(function(f) { return f.user_id == uid; });
    var tbody = document.getElementById('empW9Body');
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No employee W-9 forms on file.</td></tr>';
        return;
    }
    tbody.innerHTML = items.map(function(f) {
        var sc = f.status === 'Signed' ? 'status-complete' : f.status === 'Complete' ? 'status-in-progress' : 'status-needs-bid';
        return '<tr>' +
            '<td>' + (f.employee_name || '-') + '</td>' +
            '<td>' + (f.w9_name || '-') + '</td>' +
            '<td>' + (f.w9_tax_class || '-') + '</td>' +
            '<td>' + (f.w9_tin ? '***' + f.w9_tin.slice(-4) : '-') + '</td>' +
            '<td><span class="status-badge ' + sc + '">' + f.status + '</span></td>' +
            '<td>' + (f.w9_signature_date || '-') + '</td>' +
            '<td style="white-space:nowrap;">' +
                (f.has_file ? '<a href="/api/tax-forms/' + f.id + '/file" target="_blank" class="btn btn-secondary btn-small" style="font-size:11px;">PDF</a> ' : '') +
                '<button class="btn btn-secondary btn-small" onclick="editW9(' + f.id + ')" style="font-size:11px;">Edit</button> ' +
                '<button class="btn btn-secondary btn-small" onclick="deleteForm(' + f.id + ')" style="font-size:11px;color:#EF4444;">Del</button>' +
            '</td></tr>';
    }).join('');
}

// ─── 1099s ──────────────────────────────────────────────────────
function render1099() {
    var uid = document.getElementById('filter1099Employee')?.value;
    var items = allForms.filter(function(f) { return f.form_type === '1099'; });
    if (uid) items = items.filter(function(f) { return f.user_id == uid; });
    var tbody = document.getElementById('emp1099Body');
    if (!tbody) return;
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No 1099 forms on file.</td></tr>';
        return;
    }
    tbody.innerHTML = items.map(function(f) {
        var sc = f.status === 'Signed' ? 'status-complete' : f.status === 'Complete' ? 'status-in-progress' : 'status-needs-bid';
        return '<tr>' +
            '<td>' + (f.f1099_recipient_name || f.employee_name || '-') + '</td>' +
            '<td>1099-' + (f.f1099_type || 'NEC') + '</td>' +
            '<td>' + (f.f1099_tax_year || '-') + '</td>' +
            '<td>$' + Number(f.f1099_amount || 0).toLocaleString('en-US', {minimumFractionDigits:2}) + '</td>' +
            '<td><span class="status-badge ' + sc + '">' + f.status + '</span></td>' +
            '<td>' + (f.has_file ? '<a href="/api/tax-forms/' + f.id + '/file" target="_blank" class="btn btn-secondary btn-small" style="font-size:11px;">PDF</a>' : '-') + '</td>' +
            '<td style="white-space:nowrap;">' +
                '<button class="btn btn-secondary btn-small" onclick="edit1099(' + f.id + ')" style="font-size:11px;">Edit</button> ' +
                '<button class="btn btn-secondary btn-small" onclick="deleteForm(' + f.id + ')" style="font-size:11px;color:#EF4444;">Del</button>' +
            '</td></tr>';
    }).join('');
}

function show1099Modal(data) {
    document.getElementById('f1099Id').value = data ? data.id : '';
    document.getElementById('f1099ModalTitle').textContent = (data ? 'Edit' : 'New') + ' 1099';
    document.getElementById('f1099Employee').value = data ? (data.user_id || '') : '';
    document.getElementById('f1099PayerName').value = data ? (data.f1099_payer_name || 'LGHVAC Mechanical, LLC') : 'LGHVAC Mechanical, LLC';
    document.getElementById('f1099PayerTin').value = data ? (data.f1099_payer_tin || '') : '';
    document.getElementById('f1099RecipName').value = data ? (data.f1099_recipient_name || '') : '';
    document.getElementById('f1099RecipTin').value = data ? (data.f1099_recipient_tin || '') : '';
    document.getElementById('f1099RecipAddr').value = data ? (data.f1099_recipient_address || '') : '';
    document.getElementById('f1099RecipCSZ').value = data ? (data.f1099_recipient_city_state_zip || '') : '';
    document.getElementById('f1099Type').value = data ? (data.f1099_type || 'NEC') : 'NEC';
    document.getElementById('f1099Year').value = data ? (data.f1099_tax_year || '') : new Date().getFullYear().toString();
    document.getElementById('f1099Amount').value = data ? (data.f1099_amount || 0) : '';
    document.getElementById('f1099Status').value = data ? (data.status || 'Draft') : 'Draft';
    document.getElementById('f1099File').value = '';
    document.getElementById('f1099Modal').style.display = 'flex';

    // Auto-fill recipient name from employee
    document.getElementById('f1099Employee').onchange = function() {
        if (data) return;
        var emp = employees.find(function(e) { return e.id == this.value; }.bind(this));
        if (emp) document.getElementById('f1099RecipName').value = emp.display_name || '';
    };
}

async function edit1099(id) {
    var res = await fetch('/api/tax-forms/' + id);
    var data = await res.json();
    show1099Modal(data);
}

async function save1099(e) {
    e.preventDefault();
    var id = document.getElementById('f1099Id').value;
    var fd = new FormData();
    fd.append('form_type', '1099');
    fd.append('entity_type', 'employee');
    fd.append('status', document.getElementById('f1099Status').value);
    fd.append('user_id', document.getElementById('f1099Employee').value);
    fd.append('f1099_payer_name', document.getElementById('f1099PayerName').value);
    fd.append('f1099_payer_tin', document.getElementById('f1099PayerTin').value);
    fd.append('f1099_recipient_name', document.getElementById('f1099RecipName').value);
    fd.append('f1099_recipient_tin', document.getElementById('f1099RecipTin').value);
    fd.append('f1099_recipient_address', document.getElementById('f1099RecipAddr').value);
    fd.append('f1099_recipient_city_state_zip', document.getElementById('f1099RecipCSZ').value);
    fd.append('f1099_type', document.getElementById('f1099Type').value);
    fd.append('f1099_tax_year', document.getElementById('f1099Year').value);
    fd.append('f1099_amount', document.getElementById('f1099Amount').value || 0);
    var fileInput = document.getElementById('f1099File');
    if (fileInput.files.length) fd.append('file', fileInput.files[0]);

    var url = id ? '/api/tax-forms/' + id : '/api/tax-forms';
    var method = id ? 'PUT' : 'POST';
    await fetch(url, { method: method, body: fd });
    document.getElementById('f1099Modal').style.display = 'none';
    loadAll();
}

// ─── Show/Edit Forms ────────────────────────────────────────────
function showNewForm(type, entity) {
    if (type === 'W9') { showW9Modal(null, entity); }
    else if (type === 'W4') { showW4Modal(null); }
    else if (type === '1099') { show1099Modal(null); }
}

function showW9Modal(data, entity) {
    document.getElementById('w9Id').value = data ? data.id : '';
    document.getElementById('w9Entity').value = entity || (data ? data.entity_type : 'company');
    document.getElementById('w9ModalTitle').textContent = (data ? 'Edit' : 'New') + ' W-9' + (entity === 'company' ? ' (Company)' : ' (Employee)');
    var isEmp = (entity || (data ? data.entity_type : '')) === 'employee';
    document.getElementById('w9EmpGroup').style.display = isEmp ? '' : 'none';
    if (data && data.user_id) document.getElementById('w9Employee').value = data.user_id;
    else document.getElementById('w9Employee').value = '';

    document.getElementById('w9Name').value = data ? (data.w9_name || '') : (entity === 'company' ? 'LGHVAC Mechanical, LLC' : '');
    document.getElementById('w9Business').value = data ? (data.w9_business_name || '') : '';
    document.getElementById('w9TaxClass').value = data ? (data.w9_tax_class || 'Individual/sole proprietor') : (entity === 'company' ? 'LLC - S' : 'Individual/sole proprietor');
    document.getElementById('w9Exemptions').value = data ? (data.w9_exemptions || '') : '';
    document.getElementById('w9Address').value = data ? (data.w9_address || '') : (entity === 'company' ? '3616 Utica Square Dr' : '');
    document.getElementById('w9CityStateZip').value = data ? (data.w9_city_state_zip || '') : (entity === 'company' ? 'Edmond, OK 73034' : '');
    document.getElementById('w9Accounts').value = data ? (data.w9_account_numbers || '') : '';
    document.getElementById('w9TinType').value = data ? (data.w9_tin_type || 'EIN') : (entity === 'company' ? 'EIN' : 'SSN');
    document.getElementById('w9Tin').value = data ? (data.w9_tin || '') : '';
    document.getElementById('w9SigName').value = data ? (data.w9_signature_name || '') : '';
    document.getElementById('w9SigDate').value = data ? (data.w9_signature_date || '') : '';
    document.getElementById('w9Status').value = data ? (data.status || 'Draft') : 'Draft';
    document.getElementById('w9File').value = '';
    document.getElementById('w9Modal').style.display = 'flex';
}

async function editW9(id) {
    var res = await fetch('/api/tax-forms/' + id);
    var data = await res.json();
    showW9Modal(data, data.entity_type);
}

async function saveW9(e) {
    e.preventDefault();
    var id = document.getElementById('w9Id').value;
    var fd = new FormData();
    fd.append('form_type', 'W9');
    fd.append('entity_type', document.getElementById('w9Entity').value);
    fd.append('status', document.getElementById('w9Status').value);
    if (document.getElementById('w9Entity').value === 'employee') {
        fd.append('user_id', document.getElementById('w9Employee').value);
    }
    fd.append('w9_name', document.getElementById('w9Name').value);
    fd.append('w9_business_name', document.getElementById('w9Business').value);
    fd.append('w9_tax_class', document.getElementById('w9TaxClass').value);
    fd.append('w9_exemptions', document.getElementById('w9Exemptions').value);
    fd.append('w9_address', document.getElementById('w9Address').value);
    fd.append('w9_city_state_zip', document.getElementById('w9CityStateZip').value);
    fd.append('w9_account_numbers', document.getElementById('w9Accounts').value);
    fd.append('w9_tin_type', document.getElementById('w9TinType').value);
    fd.append('w9_tin', document.getElementById('w9Tin').value);
    fd.append('w9_signature_name', document.getElementById('w9SigName').value);
    fd.append('w9_signature_date', document.getElementById('w9SigDate').value);
    var fileInput = document.getElementById('w9File');
    if (fileInput.files.length) fd.append('file', fileInput.files[0]);

    var url = id ? '/api/tax-forms/' + id : '/api/tax-forms';
    var method = id ? 'PUT' : 'POST';
    await fetch(url, { method: method, body: fd });
    document.getElementById('w9Modal').style.display = 'none';
    loadAll();
}

function showW4Modal(data) {
    document.getElementById('w4Id').value = data ? data.id : '';
    document.getElementById('w4ModalTitle').textContent = (data ? 'Edit' : 'New') + ' W-4';
    document.getElementById('w4Employee').value = data ? (data.user_id || '') : '';
    document.getElementById('w4First').value = data ? (data.w4_first_name || '') : '';
    document.getElementById('w4Last').value = data ? (data.w4_last_name || '') : '';
    document.getElementById('w4Address').value = data ? (data.w4_address || '') : '';
    document.getElementById('w4CityStateZip').value = data ? (data.w4_city_state_zip || '') : '';
    document.getElementById('w4SSN').value = data ? (data.w4_ssn || '') : '';
    document.getElementById('w4Filing').value = data ? (data.w4_filing_status || 'Single') : 'Single';
    document.getElementById('w4MultipleJobs').checked = data ? !!data.w4_multiple_jobs : false;
    document.getElementById('w4Dependents').value = data ? (data.w4_dependents_amount || 0) : 0;
    document.getElementById('w4OtherIncome').value = data ? (data.w4_other_income || 0) : 0;
    document.getElementById('w4Deductions').value = data ? (data.w4_deductions || 0) : 0;
    document.getElementById('w4ExtraWH').value = data ? (data.w4_extra_withholding || 0) : 0;
    document.getElementById('w4Exempt').checked = data ? !!data.w4_exempt : false;
    document.getElementById('w4SigName').value = data ? (data.w4_signature_name || '') : '';
    document.getElementById('w4SigDate').value = data ? (data.w4_signature_date || '') : '';
    document.getElementById('w4Employer').value = data ? (data.w4_employer_name || 'LGHVAC Mechanical, LLC') : 'LGHVAC Mechanical, LLC';
    document.getElementById('w4EIN').value = data ? (data.w4_employer_ein || '') : '';
    document.getElementById('w4FirstDate').value = data ? (data.w4_first_date_employment || '') : '';
    document.getElementById('w4Status').value = data ? (data.status || 'Draft') : 'Draft';
    document.getElementById('w4File').value = '';
    document.getElementById('w4Modal').style.display = 'flex';

    // Auto-fill from employee profile when selecting employee
    document.getElementById('w4Employee').onchange = function() {
        if (data) return; // Don't auto-fill on edit
        var uid = this.value;
        var emp = employees.find(function(e) { return e.id == uid; });
        if (emp) {
            document.getElementById('w4First').value = emp.first_name || '';
            document.getElementById('w4Last').value = emp.last_name || '';
        }
    };
}

async function editW4(id) {
    var res = await fetch('/api/tax-forms/' + id);
    var data = await res.json();
    showW4Modal(data);
}

async function saveW4(e) {
    e.preventDefault();
    var id = document.getElementById('w4Id').value;
    var fd = new FormData();
    fd.append('form_type', 'W4');
    fd.append('entity_type', 'employee');
    fd.append('status', document.getElementById('w4Status').value);
    fd.append('user_id', document.getElementById('w4Employee').value);
    fd.append('w4_first_name', document.getElementById('w4First').value);
    fd.append('w4_last_name', document.getElementById('w4Last').value);
    fd.append('w4_address', document.getElementById('w4Address').value);
    fd.append('w4_city_state_zip', document.getElementById('w4CityStateZip').value);
    fd.append('w4_ssn', document.getElementById('w4SSN').value);
    fd.append('w4_filing_status', document.getElementById('w4Filing').value);
    fd.append('w4_multiple_jobs', document.getElementById('w4MultipleJobs').checked ? 1 : 0);
    fd.append('w4_dependents_amount', document.getElementById('w4Dependents').value || 0);
    fd.append('w4_other_income', document.getElementById('w4OtherIncome').value || 0);
    fd.append('w4_deductions', document.getElementById('w4Deductions').value || 0);
    fd.append('w4_extra_withholding', document.getElementById('w4ExtraWH').value || 0);
    fd.append('w4_exempt', document.getElementById('w4Exempt').checked ? 1 : 0);
    fd.append('w4_signature_name', document.getElementById('w4SigName').value);
    fd.append('w4_signature_date', document.getElementById('w4SigDate').value);
    fd.append('w4_employer_name', document.getElementById('w4Employer').value);
    fd.append('w4_employer_ein', document.getElementById('w4EIN').value);
    fd.append('w4_first_date_employment', document.getElementById('w4FirstDate').value);
    var fileInput = document.getElementById('w4File');
    if (fileInput.files.length) fd.append('file', fileInput.files[0]);

    var url = id ? '/api/tax-forms/' + id : '/api/tax-forms';
    var method = id ? 'PUT' : 'POST';
    await fetch(url, { method: method, body: fd });
    document.getElementById('w4Modal').style.display = 'none';
    loadAll();
}

async function deleteForm(id) {
    if (!confirm('Delete this tax form? This cannot be undone.')) return;
    await fetch('/api/tax-forms/' + id, { method: 'DELETE' });
    loadAll();
}
