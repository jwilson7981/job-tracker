/* Licenses JS */
let allLicenses = [];

loadLicenses();

async function loadLicenses() {
    try {
        const res = await fetch('/api/licenses');
        allLicenses = await res.json();
    } catch (err) {
        allLicenses = [];
        console.error('Failed to load licenses:', err);
    }
    updateSummaryCards();
    applyFilters();
}

function updateSummaryCards() {
    let active = 0, expiring = 0, expired = 0, totalCost = 0;
    allLicenses.forEach(lic => {
        const status = calcStatus(lic);
        if (status === 'Active') active++;
        else if (status === 'Expiring Soon') expiring++;
        else if (status === 'Expired') expired++;
        totalCost += parseFloat(lic.renewal_cost) || 0;
    });
    document.getElementById('summaryActive').textContent = active;
    document.getElementById('summaryExpiring').textContent = expiring;
    document.getElementById('summaryExpired').textContent = expired;
    document.getElementById('summaryRenewalCost').textContent = '$' + totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcStatus(lic) {
    if (!lic.expiration_date) return lic.status || 'Active';
    if (lic.status === 'Pending Renewal') return 'Pending Renewal';
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const exp = new Date(lic.expiration_date + 'T00:00:00');
    const diffMs = exp - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Expired';
    if (diffDays <= 60) return 'Expiring Soon';
    return 'Active';
}

function expirationCountdown(lic) {
    if (!lic.expiration_date) return '-';
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const exp = new Date(lic.expiration_date + 'T00:00:00');
    const diffMs = exp - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
        return `<span style="color:#DC2626;font-weight:700;">EXPIRED - ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago</span>`;
    }
    if (diffDays === 0) {
        return `<span style="color:#DC2626;font-weight:700;">Expires TODAY</span>`;
    }
    if (diffDays <= 60) {
        return `<span style="color:#92400E;font-weight:600;">${diffDays} day${diffDays !== 1 ? 's' : ''} left</span>`;
    }
    return `${diffDays} days left`;
}

function statusBadgeClass(status) {
    switch (status) {
        case 'Active':         return 'status-active';
        case 'Expiring Soon':  return 'status-expiring-soon';
        case 'Expired':        return 'status-expired';
        case 'Pending Renewal': return 'status-pending-renewal';
        default:               return '';
    }
}

function applyFilters() {
    const typeFilter = document.getElementById('filterType')?.value || '';
    const statusFilter = document.getElementById('filterStatus')?.value || '';

    let filtered = allLicenses;
    if (typeFilter) {
        filtered = filtered.filter(lic => lic.license_type === typeFilter);
    }
    if (statusFilter) {
        filtered = filtered.filter(lic => calcStatus(lic) === statusFilter);
    }

    const countEl = document.getElementById('licenseCount');
    if (countEl) {
        countEl.textContent = filtered.length + ' of ' + allLicenses.length + ' licenses';
    }

    renderTable(filtered);
}

function renderTable(licenses) {
    const tbody = document.getElementById('licensesBody');
    if (!licenses.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No licenses found.</td></tr>';
        return;
    }
    const userRole = document.body.dataset.role || '';
    const canEdit = ['owner', 'project_manager'].includes(userRole);

    tbody.innerHTML = licenses.map(lic => {
        const status = calcStatus(lic);
        const badgeClass = statusBadgeClass(status);
        const isExpired = status === 'Expired';
        const rowStyle = isExpired ? 'background:#FEF2F2;' : '';

        return `<tr style="${rowStyle}">
            <td><span class="badge">${lic.license_type || '-'}</span></td>
            <td${isExpired ? ' style="color:#DC2626;font-weight:600;"' : ''}>${lic.license_name || '-'}</td>
            <td>${lic.license_number || '-'}</td>
            <td>${lic.issuing_body || '-'}</td>
            <td>${lic.holder_name || '-'}</td>
            <td>
                <div>${lic.expiration_date || '-'}</div>
                <div style="font-size:12px;margin-top:2px;">${expirationCountdown(lic)}</div>
            </td>
            <td>
                <span class="status-badge ${badgeClass}">${status}</span>
                ${isExpired ? '<span style="color:#DC2626;font-size:16px;margin-left:4px;" title="Expired">&#9888;</span>' : ''}
            </td>
            <td>
                ${lic.has_file ? `<button class="btn btn-small btn-secondary" onclick="viewFile(${lic.id})" style="margin-right:4px;">View PDF</button>` : ''}
                ${canEdit ? `<button class="btn btn-small btn-secondary" onclick="editLicense(${lic.id})" style="margin-right:4px;">Edit</button>` : ''}
                ${canEdit ? `<button class="btn btn-small btn-danger" onclick="deleteLicense(${lic.id})">Delete</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

function showAddLicense() {
    document.getElementById('licenseModalTitle').textContent = 'Add License';
    document.getElementById('licenseId').value = '';
    document.getElementById('licType').value = '';
    document.getElementById('licName').value = '';
    document.getElementById('licNumber').value = '';
    document.getElementById('licIssuer').value = '';
    document.getElementById('licHolder').value = '';
    document.getElementById('licIssueDate').value = '';
    document.getElementById('licExpDate').value = '';
    document.getElementById('licCost').value = '';
    document.getElementById('licStatus').value = 'Active';
    document.getElementById('licNotes').value = '';
    document.getElementById('licFile').value = '';
    document.getElementById('licenseModal').style.display = 'flex';
}

function editLicense(id) {
    const lic = allLicenses.find(l => l.id === id);
    if (!lic) return;
    document.getElementById('licenseModalTitle').textContent = 'Edit License';
    document.getElementById('licenseId').value = lic.id;
    document.getElementById('licType').value = lic.license_type || '';
    document.getElementById('licName').value = lic.license_name || '';
    document.getElementById('licNumber').value = lic.license_number || '';
    document.getElementById('licIssuer').value = lic.issuing_body || '';
    document.getElementById('licHolder').value = lic.holder_name || '';
    document.getElementById('licIssueDate').value = lic.issue_date || '';
    document.getElementById('licExpDate').value = lic.expiration_date || '';
    document.getElementById('licCost').value = lic.renewal_cost || '';
    document.getElementById('licStatus').value = lic.status || 'Active';
    document.getElementById('licNotes').value = lic.notes || '';
    document.getElementById('licFile').value = '';
    document.getElementById('licenseModal').style.display = 'flex';
}

async function saveLicense(event) {
    event.preventDefault();
    const id = document.getElementById('licenseId').value;
    const isEdit = !!id;

    const fd = new FormData();
    fd.append('license_type', document.getElementById('licType').value);
    fd.append('license_name', document.getElementById('licName').value);
    fd.append('license_number', document.getElementById('licNumber').value);
    fd.append('issuing_body', document.getElementById('licIssuer').value);
    fd.append('holder_name', document.getElementById('licHolder').value);
    fd.append('issue_date', document.getElementById('licIssueDate').value);
    fd.append('expiration_date', document.getElementById('licExpDate').value);
    fd.append('renewal_cost', document.getElementById('licCost').value || '0');
    fd.append('status', document.getElementById('licStatus').value);
    fd.append('notes', document.getElementById('licNotes').value);

    const fileInput = document.getElementById('licFile');
    if (fileInput.files[0]) {
        fd.append('file', fileInput.files[0]);
    }

    const url = isEdit ? '/api/licenses/' + id : '/api/licenses';
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, { method, body: fd });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'Failed to save license.');
            return;
        }
    } catch (err) {
        alert('Failed to save license.');
        console.error(err);
        return;
    }

    document.getElementById('licenseModal').style.display = 'none';
    loadLicenses();
}

async function deleteLicense(id) {
    if (!confirm('Are you sure you want to delete this license?')) return;
    try {
        const res = await fetch('/api/licenses/' + id, { method: 'DELETE' });
        if (!res.ok) {
            alert('Failed to delete license.');
            return;
        }
    } catch (err) {
        alert('Failed to delete license.');
        console.error(err);
        return;
    }
    loadLicenses();
}

function viewFile(id) {
    window.open('/api/licenses/' + id + '/file', '_blank');
}
