/* Change Orders JS */
let allCOs = [];
let editingCOId = null;

function fmt(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Init ────────────────────────────────────────────────────
let contractsByJobId = {};

document.addEventListener('DOMContentLoaded', function() {
    loadJobsList();
    loadContractsLookup();
});

// ─── Load Jobs Dropdown ──────────────────────────────────────
async function loadJobsList() {
    const res = await fetch('/api/jobs/list');
    const jobs = await res.json();
    const filterSel = document.getElementById('filterJob');
    const modalSel = document.getElementById('coJob');
    jobs.forEach(j => {
        const o1 = document.createElement('option');
        o1.value = j.id;
        o1.textContent = j.name;
        filterSel.appendChild(o1);
        const o2 = document.createElement('option');
        o2.value = j.id;
        o2.textContent = j.name;
        modalSel.appendChild(o2);
    });

    // Auto-select job from URL parameter
    var _urlJobId = new URLSearchParams(window.location.search).get('job_id');
    if (_urlJobId) { document.getElementById('filterJob').value = _urlJobId; }

    loadChangeOrders();
}

// ─── Load Contracts Lookup (for GC name auto-fill + building sections) ──
async function loadContractsLookup() {
    try {
        const res = await fetch('/api/payapps/contracts');
        const contracts = await res.json();
        contracts.forEach(c => { contractsByJobId[c.job_id] = c; });
        // Attach onchange to coJob dropdown
        const coJob = document.getElementById('coJob');
        if (coJob) {
            coJob.addEventListener('change', function() {
                const contract = contractsByJobId[this.value];
                const gcField = document.getElementById('coGcName');
                if (gcField && contract && contract.gc_name) {
                    gcField.value = contract.gc_name;
                }
                loadBuildingSections(contract ? contract.id : null);
            });
        }
    } catch(e) { /* contracts not available */ }
}

async function loadBuildingSections(contractId) {
    var sel = document.getElementById('coBuilding');
    var grp = document.getElementById('coBuildingGroup');
    sel.innerHTML = '<option value="">-- End of SOV (bottom) --</option>';
    if (!contractId) { grp.style.display = 'none'; return; }
    try {
        var res = await fetch('/api/payapps/contracts/' + contractId + '/sov');
        var items = await res.json();
        var headers = items.filter(function(i) { return i.is_header; });
        if (headers.length > 0) {
            headers.forEach(function(h) {
                var opt = document.createElement('option');
                opt.value = h.id;
                opt.textContent = h.description;
                sel.appendChild(opt);
            });
            grp.style.display = '';
        } else {
            grp.style.display = 'none';
        }
    } catch(e) { grp.style.display = 'none'; }
}

// ─── Load Change Orders ──────────────────────────────────────
async function loadChangeOrders() {
    const jobId = document.getElementById('filterJob').value;
    const status = document.getElementById('filterStatus').value;
    let url = '/api/change-orders?';
    if (jobId) url += 'job_id=' + jobId + '&';
    if (status) url += 'status=' + status + '&';

    const res = await fetch(url);
    allCOs = await res.json();
    renderSummary();
    renderTable();
}

// ─── Summary Cards ───────────────────────────────────────────
function renderSummary() {
    const total = allCOs.length;
    const draft = allCOs.filter(c => c.status === 'Draft').length;
    const submitted = allCOs.filter(c => c.status === 'Submitted').length;
    const approved = allCOs.filter(c => c.status === 'Approved');
    const approvedAmt = approved.reduce((sum, c) => sum + (c.amount || 0), 0);
    const rejected = allCOs.filter(c => c.status === 'Rejected').length;

    document.getElementById('sumTotal').textContent = total;
    document.getElementById('sumDraft').textContent = draft;
    document.getElementById('sumSubmitted').textContent = submitted;
    document.getElementById('sumApproved').textContent = fmt(approvedAmt);
    document.getElementById('sumRejected').textContent = rejected;

    // Highlight rejected card if any
    const rejCard = document.getElementById('sumRejected').closest('.kpi-card');
    if (rejected > 0) {
        rejCard.style.background = '#FEF2F2';
        rejCard.style.borderColor = '#EF4444';
    } else {
        rejCard.style.background = '';
        rejCard.style.borderColor = '';
    }
}

// ─── Render Table ────────────────────────────────────────────
function renderTable() {
    const tbody = document.getElementById('coBody');
    document.getElementById('coCount').textContent = allCOs.length + ' change order' + (allCOs.length !== 1 ? 's' : '');

    if (!allCOs.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No change orders found.</td></tr>';
        return;
    }

    // Group by job
    const groups = {};
    const jobOrder = [];
    allCOs.forEach(co => {
        const key = co.job_id || 0;
        if (!groups[key]) {
            groups[key] = { name: co.job_name || 'No Job', items: [] };
            jobOrder.push(key);
        }
        groups[key].items.push(co);
    });

    let html = '';

    jobOrder.forEach(key => {
        const group = groups[key];
        const count = group.items.length;
        const draft = group.items.filter(c => c.status === 'Draft').length;
        const submitted = group.items.filter(c => c.status === 'Submitted').length;
        const approved = group.items.filter(c => c.status === 'Approved');
        const approvedAmt = approved.reduce((s, c) => s + (c.amount || 0), 0);
        const rejected = group.items.filter(c => c.status === 'Rejected').length;

        let statusSummary = '';
        if (draft) statusSummary += `<span style="color:#6B7280;font-size:12px;margin-left:8px;">${draft} draft</span>`;
        if (submitted) statusSummary += `<span style="color:#1E40AF;font-size:12px;margin-left:8px;">${submitted} submitted</span>`;
        if (approved.length) statusSummary += `<span style="color:#166534;font-size:12px;margin-left:8px;">${approved.length} approved (${fmt(approvedAmt)})</span>`;
        if (rejected) statusSummary += `<span style="color:#991B1B;font-size:12px;margin-left:8px;">${rejected} rejected</span>`;

        html += `<tr class="co-group-header" onclick="toggleCoGroup('co-grp-${key}')" style="cursor:pointer;background:var(--gray-50,#f9fafb);border-top:2px solid var(--gray-200,#e5e7eb);">
            <td colspan="8" style="padding:10px 12px;font-weight:700;font-size:14px;">
                <span class="co-toggle" id="toggle-co-grp-${key}" style="display:inline-block;width:18px;transition:transform .2s;">&#9654;</span>
                ${group.name}
                <span style="font-weight:400;color:var(--gray-500);font-size:13px;margin-left:6px;">(${count})</span>
                ${statusSummary}
            </td>
        </tr>`;

        group.items.forEach(co => {
            const statusClass = getStatusClass(co.status);
            const isRejected = co.status === 'Rejected';
            let rowStyle = 'display:none;';
            if (isRejected) rowStyle += 'background:#FEF2F2;';
            const coNum = 'CO-' + co.job_id + '-' + co.co_number;

            let actions = '';
            if (co.status === 'Draft' || co.status === 'Submitted') {
                actions += `<button class="btn btn-small btn-secondary" onclick="event.stopPropagation();editCO(${co.id})">Edit</button> `;
            }
            if (co.status === 'Draft' || co.status === 'Submitted' || co.status === 'Approved') {
                actions += `<button class="btn btn-small btn-secondary" onclick="event.stopPropagation();generateProposal(${co.id})">Proposal</button> `;
            }
            if (co.status === 'Submitted') {
                actions += `<button class="btn btn-small btn-primary" onclick="event.stopPropagation();approveCO(${co.id})">Approve</button> `;
            }
            if (co.status === 'Draft') {
                actions += `<button class="btn btn-small btn-danger" onclick="event.stopPropagation();deleteChangeOrder(${co.id})">Delete</button>`;
            }

            html += `<tr class="co-row co-grp-${key}" style="${rowStyle}">
                <td style="font-weight:600;">${coNum}</td>
                <td>${co.job_name || '-'}</td>
                <td>${co.title || '-'}${isRejected ? ' <span style="color:#EF4444;font-weight:700;" title="Rejected">&#9888;</span>' : ''}</td>
                <td style="text-align:right;font-weight:600;">${fmt(co.amount)}</td>
                <td><span class="status-badge ${statusClass}">${co.status}</span></td>
                <td style="font-size:13px;color:var(--gray-500);">${co.submitted_date || '-'}</td>
                <td style="font-size:13px;color:var(--gray-500);">${co.approved_date || '-'}</td>
                <td style="white-space:nowrap;">${actions}</td>
            </tr>`;
        });
    });

    tbody.innerHTML = html;
}

function toggleCoGroup(groupClass) {
    const rows = document.querySelectorAll('.co-row.' + groupClass);
    const toggle = document.getElementById('toggle-' + groupClass);
    const isOpen = rows.length && rows[0].style.display !== 'none';
    rows.forEach(r => r.style.display = isOpen ? 'none' : '');
    if (toggle) toggle.style.transform = isOpen ? '' : 'rotate(90deg)';
}

function getStatusClass(status) {
    switch (status) {
        case 'Draft':     return 'status-draft';
        case 'Submitted': return 'status-open';
        case 'Approved':  return 'status-complete';
        case 'Rejected':  return 'status-overdue';
        case 'Void':      return 'status-closed';
        default:          return 'status-draft';
    }
}

// ─── Modal Controls ──────────────────────────────────────────
function showAddCO() {
    editingCOId = null;
    document.getElementById('coModalTitle').textContent = 'New Change Order';
    document.getElementById('coJob').value = document.getElementById('filterJob').value || '';
    document.getElementById('coTitle').value = '';
    document.getElementById('coScope').value = '';
    document.getElementById('coReason').value = '';
    document.getElementById('coAmount').value = '';
    const selectedJob = document.getElementById('coJob').value;
    const contract = contractsByJobId[selectedJob];
    document.getElementById('coGcName').value = (contract && contract.gc_name) ? contract.gc_name : '';
    document.getElementById('coStatus').value = 'Draft';
    document.getElementById('coStatusGroup').style.display = 'none';
    document.getElementById('coBuilding').value = '';
    loadBuildingSections(contract ? contract.id : null);
    document.getElementById('coModal').style.display = 'flex';
}

async function editCO(id) {
    const res = await fetch('/api/change-orders/' + id);
    const co = await res.json();
    if (co.error) { alert(co.error); return; }

    editingCOId = co.id;
    document.getElementById('coModalTitle').textContent = 'Edit Change Order';
    document.getElementById('coJob').value = co.job_id || '';
    document.getElementById('coTitle').value = co.title || '';
    document.getElementById('coScope').value = co.scope_description || '';
    document.getElementById('coReason').value = co.reason || '';
    document.getElementById('coAmount').value = co.amount || '';
    document.getElementById('coGcName').value = co.gc_name || '';
    document.getElementById('coStatus').value = co.status || 'Draft';
    document.getElementById('coStatusGroup').style.display = '';
    var contract = contractsByJobId[co.job_id];
    await loadBuildingSections(contract ? contract.id : null);
    // Try to select the building this CO is under
    if (co.sov_building_id) {
        document.getElementById('coBuilding').value = co.sov_building_id;
    }
    document.getElementById('coModal').style.display = 'flex';
}

// ─── Save (Create / Update) ─────────────────────────────────
async function saveChangeOrder(event) {
    event.preventDefault();
    const buildingVal = document.getElementById('coBuilding').value;
    const data = {
        job_id: document.getElementById('coJob').value,
        title: document.getElementById('coTitle').value,
        scope_description: document.getElementById('coScope').value,
        reason: document.getElementById('coReason').value,
        amount: parseFloat(document.getElementById('coAmount').value) || 0,
        gc_name: document.getElementById('coGcName').value,
        sov_section_id: buildingVal ? parseInt(buildingVal) : null,
    };

    if (editingCOId) {
        data.status = document.getElementById('coStatus').value;
        await fetch('/api/change-orders/' + editingCOId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } else {
        await fetch('/api/change-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }

    document.getElementById('coModal').style.display = 'none';
    loadChangeOrders();
}

// ─── Delete ──────────────────────────────────────────────────
async function deleteChangeOrder(id) {
    if (!confirm('Are you sure you want to delete this change order?')) return;
    await fetch('/api/change-orders/' + id, { method: 'DELETE' });
    loadChangeOrders();
}

// ─── Generate Proposal PDF ──────────────────────────────────
async function generateProposal(id) {
    const btn = event.target;
    const origText = btn.textContent;
    btn.textContent = 'Generating...';
    btn.disabled = true;
    try {
        const res = await fetch('/api/change-orders/' + id + '/generate-proposal', { method: 'POST' });
        const result = await res.json();
        if (result.error) {
            alert(result.error);
            return;
        }
        if (result.path) {
            window.open(result.path, '_blank');
        }
    } catch (e) {
        alert('Error generating proposal: ' + e.message);
    } finally {
        btn.textContent = origText;
        btn.disabled = false;
    }
}

// ─── Approve ─────────────────────────────────────────────────
async function approveCO(id) {
    if (!confirm('Approve this change order?')) return;
    try {
        const res = await fetch('/api/change-orders/' + id + '/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await res.json();
        if (result.error) {
            alert(result.error);
            return;
        }
        loadChangeOrders();
    } catch (e) {
        alert('Error approving change order: ' + e.message);
    }
}
