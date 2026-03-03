/* ─── Certificates of Insurance ───────────────────────────────── */

var coiList = [];

function loadJobs() {
    fetch('/api/jobs')
        .then(function(r) { return r.json(); })
        .then(function(jobs) {
            var opts = '<option value="">All Jobs</option>';
            var opts2 = '<option value="">Company-wide</option>';
            jobs.forEach(function(j) {
                opts += '<option value="' + j.id + '">' + j.name + '</option>';
                opts2 += '<option value="' + j.id + '">' + j.name + '</option>';
            });
            document.getElementById('filterJob').innerHTML = opts;
            document.getElementById('coiJob').innerHTML = opts2;
        });
}

function loadCOI() {
    fetch('/api/coi')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var filterType = document.getElementById('filterType').value;
            var filterJob = document.getElementById('filterJob').value;
            coiList = data.filter(function(c) {
                if (filterType && c.policy_type !== filterType) return false;
                if (filterJob && c.job_id != filterJob) return false;
                return true;
            });
            renderCOI();
            updateSummary(data);
        });
}

function updateSummary(allCoi) {
    var active = 0, expiring = 0, expired = 0;
    allCoi.forEach(function(c) {
        if (c.computed_status === 'Expired') expired++;
        else if (c.computed_status === 'Expiring Soon') expiring++;
        else active++;
    });
    document.getElementById('summaryActive').textContent = active;
    document.getElementById('summaryExpiring').textContent = expiring;
    document.getElementById('summaryExpired').textContent = expired;
    document.getElementById('summaryTotal').textContent = allCoi.length;
}

function renderCOI() {
    var body = document.getElementById('coiBody');
    if (!coiList.length) {
        body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#6B7280;padding:40px;">No certificates found.</td></tr>';
        return;
    }
    var html = '';
    var statusColors = { Active: '#22C55E', 'Expiring Soon': '#F59E0B', Expired: '#EF4444', Renewed: '#3B82F6' };
    coiList.forEach(function(c) {
        var color = statusColors[c.computed_status] || '#6B7280';
        html += '<tr style="' + (c.computed_status === 'Expired' ? 'background:#FEF2F2;' : (c.computed_status === 'Expiring Soon' ? 'background:#FFFBEB;' : '')) + '">';
        html += '<td>' + c.policy_type + '</td>';
        html += '<td>' + (c.carrier || '') + '</td>';
        html += '<td>' + (c.policy_number || '') + '</td>';
        html += '<td>' + (c.job_name || 'Company-wide') + '</td>';
        html += '<td>' + (c.certificate_holder || '') + '</td>';
        html += '<td style="' + (c.computed_status === 'Expired' ? 'color:#EF4444;font-weight:600;' : '') + '">' + (c.expiration_date || '') + '</td>';
        html += '<td>$' + (c.coverage_amount || 0).toLocaleString() + '</td>';
        html += '<td><span style="font-size:12px;padding:2px 8px;border-radius:9999px;background:' + color + '20;color:' + color + ';font-weight:600;">' + c.computed_status + '</span></td>';
        html += '<td style="white-space:nowrap;">';
        if (c.file_path) html += '<a href="/api/coi/' + c.id + '/file" target="_blank" class="btn btn-secondary btn-small" style="font-size:11px;">View</a> ';
        html += '<button class="btn btn-secondary btn-small" onclick="editCOI(' + c.id + ')" style="font-size:11px;">Edit</button> ';
        html += '<button class="btn btn-secondary btn-small" onclick="deleteCOI(' + c.id + ')" style="font-size:11px;color:#EF4444;">Del</button>';
        html += '</td></tr>';
    });
    body.innerHTML = html;
}

function showAddCOI() {
    document.getElementById('coiId').value = '';
    document.getElementById('coiModalTitle').textContent = 'Add Certificate of Insurance';
    document.getElementById('coiForm').reset();
    document.getElementById('coiModal').style.display = 'flex';
}

function editCOI(id) {
    var c = coiList.find(function(x) { return x.id === id; });
    if (!c) return;
    document.getElementById('coiId').value = c.id;
    document.getElementById('coiModalTitle').textContent = 'Edit Certificate of Insurance';
    document.getElementById('coiType').value = c.policy_type;
    document.getElementById('coiJob').value = c.job_id || '';
    document.getElementById('coiCarrier').value = c.carrier || '';
    document.getElementById('coiPolicyNum').value = c.policy_number || '';
    document.getElementById('coiEffective').value = c.effective_date || '';
    document.getElementById('coiExpiration').value = c.expiration_date || '';
    document.getElementById('coiCoverage').value = c.coverage_amount || '';
    document.getElementById('coiHolder').value = c.certificate_holder || '';
    document.getElementById('coiStatus').value = c.status || 'Active';
    document.getElementById('coiNotes').value = c.notes || '';
    document.getElementById('coiModal').style.display = 'flex';
}

function saveCOI(e) {
    e.preventDefault();
    var id = document.getElementById('coiId').value;
    var formData = new FormData();
    formData.append('policy_type', document.getElementById('coiType').value);
    formData.append('job_id', document.getElementById('coiJob').value);
    formData.append('carrier', document.getElementById('coiCarrier').value);
    formData.append('policy_number', document.getElementById('coiPolicyNum').value);
    formData.append('effective_date', document.getElementById('coiEffective').value);
    formData.append('expiration_date', document.getElementById('coiExpiration').value);
    formData.append('coverage_amount', document.getElementById('coiCoverage').value || '0');
    formData.append('certificate_holder', document.getElementById('coiHolder').value);
    formData.append('status', document.getElementById('coiStatus').value);
    formData.append('notes', document.getElementById('coiNotes').value);
    var fileInput = document.getElementById('coiFile');
    if (fileInput.files.length) formData.append('file', fileInput.files[0]);

    var url = id ? '/api/coi/' + id : '/api/coi';
    var method = id ? 'PUT' : 'POST';
    fetch(url, { method: method, body: formData })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.ok) {
                document.getElementById('coiModal').style.display = 'none';
                loadCOI();
            }
        });
}

function deleteCOI(id) {
    if (!confirm('Delete this certificate?')) return;
    fetch('/api/coi/' + id, { method: 'DELETE' })
        .then(function() { loadCOI(); });
}

document.addEventListener('DOMContentLoaded', function() {
    loadJobs();
    loadCOI();
});
