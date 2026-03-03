/* Permits JS — LGHVAC Permit & Inspection Tracking */

function fmt(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

let allPermits = [];
let allJobs = [];

document.addEventListener('DOMContentLoaded', async function() {
    // Load jobs for dropdowns
    const jr = await fetch('/api/jobs');
    allJobs = await jr.json();
    const jobFilter = document.getElementById('jobFilter');
    const permitJob = document.getElementById('permitJob');
    allJobs.forEach(j => {
        jobFilter.innerHTML += `<option value="${j.id}">${j.name}</option>`;
        permitJob.innerHTML += `<option value="${j.id}">${j.name}</option>`;
    });
    loadPermits();
});

async function loadPermits() {
    const jobId = document.getElementById('jobFilter').value;
    let url = '/api/permits';
    if (jobId) url += '?job_id=' + jobId;
    const res = await fetch(url);
    allPermits = await res.json();
    filterPermits();
}

function filterPermits() {
    const status = document.getElementById('statusFilter')?.value || '';
    const filtered = status ? allPermits.filter(p => p.status === status) : allPermits;

    const countEl = document.getElementById('permitCount');
    if (countEl) countEl.textContent = `${filtered.length} permit${filtered.length !== 1 ? 's' : ''}`;

    const container = document.getElementById('permitsContainer');
    if (!filtered.length) {
        container.innerHTML = '<div class="empty-state" style="padding:40px;text-align:center;">No permits found. Click "+ New Permit" to add one.</div>';
        return;
    }

    // Group by job
    const byJob = {};
    filtered.forEach(p => {
        const key = p.job_name || 'Unknown';
        if (!byJob[key]) byJob[key] = [];
        byJob[key].push(p);
    });

    let html = '';
    for (const [jobName, permits] of Object.entries(byJob)) {
        const allApproved = permits.every(p => p.status === 'Approved' || p.status === 'N/A');
        const jobBadge = allApproved
            ? '<span style="font-size:12px;padding:2px 8px;border-radius:9999px;background:#DCFCE7;color:#16A34A;font-weight:600;margin-left:8px;">All Approved</span>'
            : '<span style="font-size:12px;padding:2px 8px;border-radius:9999px;background:#FEF3C7;color:#D97706;font-weight:600;margin-left:8px;">Pending</span>';

        html += `<div class="bid-section" style="margin-bottom:16px;">
            <h3 style="display:flex;align-items:center;">${jobName}${jobBadge}</h3>
            <table class="data-table" style="margin-top:8px;">
                <thead><tr>
                    <th>Type</th><th>Permit #</th><th>Authority</th><th>Status</th><th>Applied</th><th>Approved</th><th>Cost</th><th>Inspections</th><th></th>
                </tr></thead>
                <tbody>`;

        permits.forEach(p => {
            const statusColors = {
                'Not Applied': '#6B7280', 'Applied': '#3B82F6', 'Under Review': '#F59E0B',
                'Approved': '#22C55E', 'Denied': '#EF4444', 'Expired': '#EF4444', 'N/A': '#9CA3AF'
            };
            const color = statusColors[p.status] || '#6B7280';
            const inspProgress = p.inspection_count > 0
                ? `${p.passed_count}/${p.inspection_count}`
                : '-';

            html += `<tr>
                <td><strong>${p.permit_type}</strong></td>
                <td>${p.permit_number || '-'}</td>
                <td>${p.issuing_authority || '-'}</td>
                <td><span style="display:inline-block;padding:2px 10px;border-radius:9999px;background:${color}20;color:${color};font-weight:600;font-size:12px;">${p.status}</span></td>
                <td>${p.applied_date || '-'}</td>
                <td>${p.approved_date || '-'}</td>
                <td>${p.cost ? fmt(p.cost) : '-'}</td>
                <td style="text-align:center;">${inspProgress}</td>
                <td style="white-space:nowrap;">
                    <button class="btn btn-secondary btn-small" onclick="editPermit(${p.id})">Edit</button>
                    <button class="btn btn-secondary btn-small" onclick="toggleInspections(${p.id})">Insp.</button>
                    <button class="btn btn-secondary btn-small" onclick="deletePermit(${p.id})" style="color:#EF4444;">Del</button>
                </td>
            </tr>`;

            // Inspections sub-row (initially hidden)
            html += `<tr id="insp-row-${p.id}" style="display:none;">
                <td colspan="9" style="padding:0;">
                    <div style="background:var(--gray-50,#F9FAFB);padding:12px 16px;border-top:1px solid var(--gray-200,#E5E7EB);">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <strong style="font-size:13px;">Inspections — ${p.permit_type} Permit</strong>
                            <button class="btn btn-secondary btn-small" onclick="showAddInspection(${p.id})">+ Add Inspection</button>
                        </div>`;

            if (p.inspections && p.inspections.length) {
                html += `<table class="data-table" style="margin:0;font-size:13px;">
                    <thead><tr><th>Type</th><th>Status</th><th>Scheduled</th><th>Completed</th><th>Inspector</th><th>Notes</th><th></th></tr></thead>
                    <tbody>`;
                p.inspections.forEach(i => {
                    const iColors = { Scheduled: '#3B82F6', Passed: '#22C55E', Failed: '#EF4444', Cancelled: '#9CA3AF', 'Re-Inspect': '#F59E0B' };
                    const iColor = iColors[i.status] || '#6B7280';
                    html += `<tr>
                        <td>${i.inspection_type}</td>
                        <td><span style="display:inline-block;padding:1px 8px;border-radius:9999px;background:${iColor}20;color:${iColor};font-weight:600;font-size:11px;">${i.status}</span></td>
                        <td>${i.scheduled_date || '-'}</td>
                        <td>${i.completed_date || '-'}</td>
                        <td>${i.inspector || '-'}</td>
                        <td>${(i.result_notes || '').substring(0, 60)}</td>
                        <td style="white-space:nowrap;">
                            <button class="btn btn-secondary btn-small" onclick="editInspection(${p.id},${i.id})">Edit</button>
                            <button class="btn btn-secondary btn-small" onclick="deleteInspection(${p.id},${i.id})" style="color:#EF4444;">Del</button>
                        </td>
                    </tr>`;
                });
                html += '</tbody></table>';
            } else {
                html += '<div class="empty-state" style="padding:8px;text-align:center;font-size:13px;">No inspections scheduled</div>';
            }
            html += '</div></td></tr>';
        });

        html += '</tbody></table></div>';
    }
    container.innerHTML = html;
}

function toggleInspections(permitId) {
    const row = document.getElementById('insp-row-' + permitId);
    if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
}

// ─── Permit CRUD ─────────────────────────────────────────────

function showAddPermit() {
    document.getElementById('editPermitId').value = '';
    document.getElementById('permitModalTitle').textContent = 'New Permit';
    document.getElementById('permitType').value = 'Mechanical';
    document.getElementById('permitStatus').value = 'Not Applied';
    ['permitNumber','permitAuthority','permitAppliedDate','permitApprovedDate','permitExpDate','permitCost','permitInspector','permitInspectorPhone','permitNotes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    // Pre-select job from filter
    const jobFilter = document.getElementById('jobFilter').value;
    if (jobFilter) document.getElementById('permitJob').value = jobFilter;
    document.getElementById('permitModal').style.display = 'flex';
}

function editPermit(id) {
    const p = allPermits.find(x => x.id === id);
    if (!p) return;
    document.getElementById('editPermitId').value = p.id;
    document.getElementById('permitModalTitle').textContent = 'Edit Permit';
    document.getElementById('permitJob').value = p.job_id;
    document.getElementById('permitType').value = p.permit_type;
    document.getElementById('permitStatus').value = p.status;
    document.getElementById('permitNumber').value = p.permit_number || '';
    document.getElementById('permitAuthority').value = p.issuing_authority || '';
    document.getElementById('permitAppliedDate').value = p.applied_date || '';
    document.getElementById('permitApprovedDate').value = p.approved_date || '';
    document.getElementById('permitExpDate').value = p.expiration_date || '';
    document.getElementById('permitCost').value = p.cost || '';
    document.getElementById('permitInspector').value = p.inspector_name || '';
    document.getElementById('permitInspectorPhone').value = p.inspector_phone || '';
    document.getElementById('permitNotes').value = p.notes || '';
    document.getElementById('permitModal').style.display = 'flex';
}

function closePermitModal() { document.getElementById('permitModal').style.display = 'none'; }

async function savePermit() {
    const id = document.getElementById('editPermitId').value;
    const data = {
        job_id: document.getElementById('permitJob').value,
        permit_type: document.getElementById('permitType').value,
        status: document.getElementById('permitStatus').value,
        permit_number: document.getElementById('permitNumber').value.trim(),
        issuing_authority: document.getElementById('permitAuthority').value.trim(),
        applied_date: document.getElementById('permitAppliedDate').value,
        approved_date: document.getElementById('permitApprovedDate').value,
        expiration_date: document.getElementById('permitExpDate').value,
        cost: document.getElementById('permitCost').value || 0,
        inspector_name: document.getElementById('permitInspector').value.trim(),
        inspector_phone: document.getElementById('permitInspectorPhone').value.trim(),
        notes: document.getElementById('permitNotes').value.trim(),
    };
    if (!data.job_id) return alert('Job is required');
    const url = id ? `/api/permits/${id}` : '/api/permits';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    if (res.ok) {
        closePermitModal();
        loadPermits();
    } else {
        const err = await res.json();
        alert(err.error || 'Failed to save');
    }
}

async function deletePermit(id) {
    if (!confirm('Delete this permit and all its inspections?')) return;
    await fetch('/api/permits/' + id, { method: 'DELETE' });
    loadPermits();
}

// ─── Inspection CRUD ─────────────────────────────────────────

function showAddInspection(permitId) {
    document.getElementById('inspectionPermitId').value = permitId;
    document.getElementById('editInspectionId').value = '';
    document.getElementById('inspectionModalTitle').textContent = 'Add Inspection';
    document.getElementById('inspectionType').value = 'Rough-In';
    document.getElementById('inspectionStatus').value = 'Scheduled';
    ['inspectionSchedDate','inspectionCompDate','inspectionInspector','inspectionNotes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('inspectionModal').style.display = 'flex';
}

function editInspection(permitId, inspId) {
    const p = allPermits.find(x => x.id === permitId);
    if (!p) return;
    const i = p.inspections.find(x => x.id === inspId);
    if (!i) return;
    document.getElementById('inspectionPermitId').value = permitId;
    document.getElementById('editInspectionId').value = inspId;
    document.getElementById('inspectionModalTitle').textContent = 'Edit Inspection';
    document.getElementById('inspectionType').value = i.inspection_type;
    document.getElementById('inspectionStatus').value = i.status;
    document.getElementById('inspectionSchedDate').value = i.scheduled_date || '';
    document.getElementById('inspectionCompDate').value = i.completed_date || '';
    document.getElementById('inspectionInspector').value = i.inspector || '';
    document.getElementById('inspectionNotes').value = i.result_notes || '';
    document.getElementById('inspectionModal').style.display = 'flex';
}

function closeInspectionModal() { document.getElementById('inspectionModal').style.display = 'none'; }

async function saveInspection() {
    const permitId = document.getElementById('inspectionPermitId').value;
    const inspId = document.getElementById('editInspectionId').value;
    const data = {
        inspection_type: document.getElementById('inspectionType').value,
        status: document.getElementById('inspectionStatus').value,
        scheduled_date: document.getElementById('inspectionSchedDate').value,
        completed_date: document.getElementById('inspectionCompDate').value,
        inspector: document.getElementById('inspectionInspector').value.trim(),
        result_notes: document.getElementById('inspectionNotes').value.trim(),
    };
    const url = inspId
        ? `/api/permits/${permitId}/inspections/${inspId}`
        : `/api/permits/${permitId}/inspections`;
    const method = inspId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    if (res.ok) {
        closeInspectionModal();
        loadPermits();
    } else {
        alert('Failed to save inspection');
    }
}

async function deleteInspection(permitId, inspId) {
    if (!confirm('Delete this inspection?')) return;
    await fetch(`/api/permits/${permitId}/inspections/${inspId}`, { method: 'DELETE' });
    loadPermits();
}
