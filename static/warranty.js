/* Warranty JS - Equipment Registry + Claims (Service-Call Style) */

let allWarrantyItems = [];
let _users = [];

// ─── List Page ──────────────────────────────────────────────────
if (document.getElementById('warrantyBody') && !window.JOB_ID) {
    loadWarrantyList();
}

async function loadWarrantyList() {
    const [wRes, jRes] = await Promise.all([
        fetch('/api/warranty'),
        fetch('/api/jobs')
    ]);
    allWarrantyItems = await wRes.json();
    const jobs = await jRes.json();

    // Populate job filter
    const sel = document.getElementById('filterJob');
    if (sel) {
        const jobIds = [...new Set(allWarrantyItems.map(i => i.job_id))];
        jobs.filter(j => jobIds.includes(j.id)).forEach(j => {
            const opt = document.createElement('option');
            opt.value = j.id;
            opt.textContent = j.name;
            sel.appendChild(opt);
        });
    }
    // Populate equipment type filter
    const typeSel = document.getElementById('filterType');
    if (typeSel) {
        const types = [...new Set(allWarrantyItems.map(i => i.equipment_type).filter(Boolean))].sort();
        types.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            typeSel.appendChild(opt);
        });
    }
    applyFilters();
}

function applyFilters() {
    const jobId = document.getElementById('filterJob')?.value;
    const status = document.getElementById('filterStatus')?.value;
    const eqType = document.getElementById('filterType')?.value;
    let items = allWarrantyItems;
    if (jobId) items = items.filter(i => i.job_id == jobId);
    if (status) items = items.filter(i => i.status === status);
    if (eqType) items = items.filter(i => i.equipment_type === eqType);
    renderWarrantyTable(items);
    updateSummary();
}

function updateSummary() {
    document.getElementById('sumTotal').textContent = allWarrantyItems.length;
    document.getElementById('sumActive').textContent = allWarrantyItems.filter(i => i.status === 'Active').length;
    document.getElementById('sumExpiring').textContent = allWarrantyItems.filter(i => i.status === 'Expiring Soon').length;
    document.getElementById('sumExpired').textContent = allWarrantyItems.filter(i => i.status === 'Expired').length;
    document.getElementById('sumOpenClaims').textContent = allWarrantyItems.reduce((s, i) => s + (i.open_claims || 0), 0);
}

function renderWarrantyTable(items) {
    const tbody = document.getElementById('warrantyBody');
    const countEl = document.getElementById('wCount');
    if (countEl) countEl.textContent = items.length + ' item' + (items.length !== 1 ? 's' : '');
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No warranty items found.</td></tr>';
        return;
    }
    tbody.innerHTML = items.map(i => {
        const sc = i.status.toLowerCase().replace(/ /g, '-');
        const period = [i.warranty_start, i.warranty_end].filter(Boolean).join(' to ') || '-';
        const modelSerial = [i.model_number, i.serial_number].filter(Boolean).join(' / ') || '-';
        const claimBadge = i.open_claims > 0
            ? `<span style="background:#EF4444;color:#fff;padding:1px 7px;border-radius:9999px;font-size:11px;font-weight:700;">${i.open_claims} open</span>`
            : (i.claim_count > 0 ? `<span style="color:var(--gray-400);font-size:12px;">${i.claim_count} closed</span>` : '-');
        const fileLabel = i.has_file
            ? `<a href="/api/warranty/items/${i.id}/file" target="_blank" class="btn btn-secondary btn-small" title="${i.original_filename || 'View'}" style="font-size:11px;">View</a>`
            : '-';
        return `<tr>
            <td><a href="/warranty/job/${i.job_id}" class="link">${i.job_name || '-'}</a></td>
            <td>${i.building || '-'}</td>
            <td>${i.unit_number || '-'}</td>
            <td>${i.equipment_type ? '<strong>' + i.equipment_type + '</strong> — ' : ''}${i.item_description || '-'}</td>
            <td style="font-size:12px;">${modelSerial}</td>
            <td>${i.manufacturer || '-'}</td>
            <td style="font-size:12px;">${period}</td>
            <td><span class="status-badge status-${sc}">${i.status}</span></td>
            <td>${claimBadge}</td>
            <td>${fileLabel}</td>
            <td><a href="/warranty/job/${i.job_id}" class="btn btn-small btn-secondary">Manage</a></td>
        </tr>`;
    }).join('');
}

// ─── Job Warranty Page ──────────────────────────────────────────
if (window.JOB_ID && document.getElementById('equipmentList')) {
    loadJobWarranties();
    loadUsers();
}

async function loadUsers() {
    const res = await fetch('/api/users/list');
    _users = await res.json();
    // Populate claim modal assigned dropdown
    const sel = document.getElementById('claimAssigned');
    if (sel) {
        sel.innerHTML = '<option value="">-- Unassigned --</option>';
        _users.filter(u => ['owner','admin','project_manager','employee'].includes(u.role)).forEach(u => {
            sel.innerHTML += `<option value="${u.id}">${u.display_name || u.username}</option>`;
        });
    }
}

async function loadJobWarranties() {
    const res = await fetch(`/api/warranty/job/${JOB_ID}`);
    const items = await res.json();
    const container = document.getElementById('equipmentList');
    if (!items.length) {
        container.innerHTML = '<div class="empty-state" style="padding:40px;text-align:center;">No equipment registered for this project. Click "+ Add Equipment" to get started.</div>';
        return;
    }

    container.innerHTML = items.map(i => {
        const sc = i.status.toLowerCase().replace(/ /g, '-');
        const openClaims = i.claims.filter(c => c.status !== 'Resolved' && c.status !== 'Denied');
        const closedClaims = i.claims.filter(c => c.status === 'Resolved' || c.status === 'Denied');
        const claimSummary = openClaims.length > 0
            ? `<span style="background:#EF4444;color:#fff;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700;margin-left:8px;">${openClaims.length} open claim${openClaims.length>1?'s':''}</span>`
            : '';

        let claimsHtml = '';
        if (i.claims.length) {
            claimsHtml = '<h4 style="margin:12px 0 8px;font-size:13px;">Claims</h4>' +
                i.claims.map(c => {
                    const csc = c.status.toLowerCase().replace(/ /g, '-');
                    const prClass = c.priority === 'Urgent' ? 'color:#EF4444;font-weight:700;' :
                                    c.priority === 'High' ? 'color:#D97706;font-weight:600;' : '';
                    return `<div class="claim-row claim-${csc}" style="border:1px solid var(--gray-200);border-radius:6px;">
                        <div style="flex:1;">
                            <div style="font-weight:600;">${(c.description || '-').substring(0, 120)}</div>
                            <div style="font-size:11px;color:var(--gray-500);">
                                ${c.claim_date || ''} ${c.assigned_name ? '| Assigned: ' + c.assigned_name : ''}
                                ${c.caller_name ? '| Caller: ' + c.caller_name : ''}
                                ${c.building || c.unit_number ? '| ' + [c.building, c.unit_number].filter(Boolean).join(' / ') : ''}
                            </div>
                        </div>
                        <span style="${prClass}font-size:11px;">${c.priority}</span>
                        <span class="status-badge status-${csc}" style="font-size:11px;">${c.status}</span>
                        <a href="/warranty/claims/${c.id}" class="btn btn-secondary btn-small" style="font-size:11px;">Detail</a>
                    </div>`;
                }).join('');
        }

        const fileBtn = i.has_file
            ? `<a href="/api/warranty/items/${i.id}/file" target="_blank" class="btn btn-secondary btn-small" title="${i.original_filename || 'View'}">View Letter</a>`
            : `<button class="btn btn-secondary btn-small" onclick="showUpload(${i.id})">Upload Letter</button>`;

        return `<div class="equip-card">
            <div class="equip-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <strong>${i.equipment_type ? i.equipment_type + ' — ' : ''}${i.item_description || 'Equipment'}</strong>
                    <span class="status-badge status-${sc}" style="font-size:11px;">${i.status}</span>
                    ${claimSummary}
                </div>
                <div style="display:flex;gap:4px;align-items:center;" onclick="event.stopPropagation();">
                    ${fileBtn}
                    <button class="btn btn-secondary btn-small" onclick="showFileClaim(${i.id}, '${(i.building||'').replace(/'/g,"\\'")}', '${(i.unit_number||'').replace(/'/g,"\\'")}')">File Claim</button>
                    <button class="btn btn-secondary btn-small" onclick="editEquipment(${i.id})">Edit</button>
                    <button class="btn btn-secondary btn-small" style="color:#EF4444;" onclick="deleteEquipment(${i.id})">Del</button>
                </div>
            </div>
            <div class="equip-body" style="display:none;">
                <div class="equip-meta">
                    <div><div class="label">Building</div>${i.building || '-'}</div>
                    <div><div class="label">Unit #</div>${i.unit_number || '-'}</div>
                    <div><div class="label">Model</div>${i.model_number || '-'}</div>
                    <div><div class="label">Serial</div>${i.serial_number || '-'}</div>
                    <div><div class="label">Manufacturer</div>${i.manufacturer || '-'}</div>
                    <div><div class="label">Warranty</div>${i.warranty_start || '?'} to ${i.warranty_end || '?'}</div>
                    <div><div class="label">Coverage</div>${i.coverage_details || '-'}</div>
                    ${i.original_filename ? '<div><div class="label">Warranty File</div><a href="/api/warranty/items/' + i.id + '/file" target="_blank" class="link">' + i.original_filename + '</a></div>' : ''}
                </div>
                ${claimsHtml}
            </div>
        </div>`;
    }).join('');
}

// ─── Equipment CRUD ─────────────────────────────────────────────
var _editItems = [];

function showAddEquipment() {
    document.getElementById('eqId').value = '';
    document.getElementById('equipModalTitle').textContent = 'Add Equipment';
    document.getElementById('eqType').value = '';
    document.getElementById('eqMfg').value = '';
    document.getElementById('eqDesc').value = '';
    document.getElementById('eqBuilding').value = '';
    document.getElementById('eqUnit').value = '';
    document.getElementById('eqModel').value = '';
    document.getElementById('eqSerial').value = '';
    document.getElementById('eqStart').value = '';
    document.getElementById('eqEnd').value = '';
    document.getElementById('eqCoverage').value = '';
    document.getElementById('eqFile').value = '';
    document.getElementById('eqCurrentFile').textContent = '';
    document.getElementById('equipModal').style.display = 'flex';
}

async function editEquipment(id) {
    const res = await fetch(`/api/warranty/job/${JOB_ID}`);
    const items = await res.json();
    const i = items.find(x => x.id === id);
    if (!i) return;
    document.getElementById('eqId').value = id;
    document.getElementById('equipModalTitle').textContent = 'Edit Equipment';
    document.getElementById('eqType').value = i.equipment_type || '';
    document.getElementById('eqMfg').value = i.manufacturer || '';
    document.getElementById('eqDesc').value = i.item_description || '';
    document.getElementById('eqBuilding').value = i.building || '';
    document.getElementById('eqUnit').value = i.unit_number || '';
    document.getElementById('eqModel').value = i.model_number || '';
    document.getElementById('eqSerial').value = i.serial_number || '';
    document.getElementById('eqStart').value = i.warranty_start || '';
    document.getElementById('eqEnd').value = i.warranty_end || '';
    document.getElementById('eqCoverage').value = i.coverage_details || '';
    document.getElementById('eqFile').value = '';
    document.getElementById('eqCurrentFile').textContent = i.original_filename ? 'Current: ' + i.original_filename : '';
    document.getElementById('equipModal').style.display = 'flex';
}

async function saveEquipment(e) {
    e.preventDefault();
    const id = document.getElementById('eqId').value;
    const fd = new FormData();
    fd.append('job_id', JOB_ID);
    fd.append('equipment_type', document.getElementById('eqType').value);
    fd.append('manufacturer', document.getElementById('eqMfg').value);
    fd.append('item_description', document.getElementById('eqDesc').value);
    fd.append('building', document.getElementById('eqBuilding').value);
    fd.append('unit_number', document.getElementById('eqUnit').value);
    fd.append('model_number', document.getElementById('eqModel').value);
    fd.append('serial_number', document.getElementById('eqSerial').value);
    fd.append('warranty_start', document.getElementById('eqStart').value);
    fd.append('warranty_end', document.getElementById('eqEnd').value);
    fd.append('coverage_details', document.getElementById('eqCoverage').value);
    const fileInput = document.getElementById('eqFile');
    if (fileInput.files.length) fd.append('file', fileInput.files[0]);

    const url = id ? `/api/warranty/items/${id}` : '/api/warranty/items';
    const method = id ? 'PUT' : 'POST';
    await fetch(url, { method, body: fd });
    document.getElementById('equipModal').style.display = 'none';
    loadJobWarranties();
}

async function deleteEquipment(id) {
    if (!confirm('Delete this equipment and all its claims? This cannot be undone.')) return;
    await fetch(`/api/warranty/items/${id}`, { method: 'DELETE' });
    loadJobWarranties();
}

// ─── Warranty File Upload ───────────────────────────────────────
function showUpload(wid) {
    document.getElementById('uploadWid').value = wid;
    document.getElementById('uploadFile').value = '';
    document.getElementById('uploadModal').style.display = 'flex';
}

async function uploadWarrantyFile(e) {
    e.preventDefault();
    const wid = document.getElementById('uploadWid').value;
    const fd = new FormData();
    fd.append('file', document.getElementById('uploadFile').files[0]);
    await fetch(`/api/warranty/items/${wid}/upload`, { method: 'POST', body: fd });
    document.getElementById('uploadModal').style.display = 'none';
    loadJobWarranties();
}

// ─── Claims ─────────────────────────────────────────────────────
function showFileClaim(warrantyId, building, unit) {
    document.getElementById('claimWarrantyId').value = warrantyId;
    document.getElementById('claimDate').valueAsDate = new Date();
    document.getElementById('claimDesc').value = '';
    document.getElementById('claimPriority').value = 'Normal';
    document.getElementById('claimBuilding').value = building || '';
    document.getElementById('claimUnit').value = unit || '';
    document.getElementById('claimCaller').value = '';
    document.getElementById('claimPhone').value = '';
    document.getElementById('claimAssigned').value = '';
    document.getElementById('claimScheduled').value = '';
    document.getElementById('claimModal').style.display = 'flex';
}

async function saveWarrantyClaim(e) {
    e.preventDefault();
    await fetch('/api/warranty/claims', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            warranty_id: document.getElementById('claimWarrantyId').value,
            claim_date: document.getElementById('claimDate').value,
            description: document.getElementById('claimDesc').value,
            priority: document.getElementById('claimPriority').value,
            building: document.getElementById('claimBuilding').value,
            unit_number: document.getElementById('claimUnit').value,
            caller_name: document.getElementById('claimCaller').value,
            caller_phone: document.getElementById('claimPhone').value,
            assigned_to: document.getElementById('claimAssigned').value || null,
            scheduled_date: document.getElementById('claimScheduled').value,
        })
    });
    document.getElementById('claimModal').style.display = 'none';
    loadJobWarranties();
}

// Legacy compatibility
function showAddWarranty() { showAddEquipment(); }
function deleteWarrantyItem(id) { deleteEquipment(id); }
