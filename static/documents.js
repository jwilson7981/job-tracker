/* Documents (Closeout) JS */
let docJobs = [];
let checklistItems = [];
let transmittals = [];

// ─── Page Router ─────────────────────────────────────────────
if (window.DOC_PAGE === 'list') {
    initDocList();
} else if (window.DOC_PAGE === 'job') {
    initDocJob();
}

// ─── LIST PAGE ───────────────────────────────────────────────
async function initDocList() {
    await loadJobs();
}

async function loadJobs() {
    const res = await fetch('/api/jobs/list');
    docJobs = await res.json();
    const grid = document.getElementById('jobCardsGrid');

    if (!docJobs.length) {
        grid.innerHTML = '<p class="empty-state">No jobs found.</p>';
        return;
    }

    // Fetch checklist stats for all jobs in parallel
    const statsPromises = docJobs.map(j =>
        fetch('/api/documents/checklist?job_id=' + j.id)
            .then(r => r.json())
            .catch(() => [])
    );
    const allStats = await Promise.all(statsPromises);

    grid.innerHTML = docJobs.map((j, idx) => {
        const items = allStats[idx] || [];
        const total = items.length;
        const complete = items.filter(i => i.status === 'Complete').length;
        const na = items.filter(i => i.status === 'N/A').length;
        const effectiveTotal = total - na;
        const pct = effectiveTotal > 0 ? Math.round(complete / effectiveTotal * 100) : (total > 0 ? 100 : 0);
        const statusText = total
            ? `${complete} of ${effectiveTotal} items complete` + (na ? ` (${na} N/A)` : '')
            : 'No checklist items yet';

        return `<a href="/documents/job/${j.id}" class="schedule-job-card">
            <div class="schedule-job-card-name">${j.name}</div>
            <div class="schedule-job-card-status">${statusText}</div>
            ${total ? `<div class="schedule-progress-bar"><div class="schedule-progress-fill" style="width:${pct}%"></div></div>` : ''}
            <div class="schedule-job-card-action">Manage Documents &rarr;</div>
        </a>`;
    }).join('');
}

// ─── JOB PAGE ────────────────────────────────────────────────
async function initDocJob() {
    // Set job name in header
    const jobsRes = await fetch('/api/jobs/list');
    docJobs = await jobsRes.json();
    const job = docJobs.find(j => j.id === window.DOC_JOB_ID);
    if (job) document.getElementById('docJobName').textContent = job.name + ' — Documents';
    loadChecklist(window.DOC_JOB_ID);
    loadTransmittals(window.DOC_JOB_ID);
}

// ─── Tab Switching ───────────────────────────────────────────
function switchDocTab(tabName, btn) {
    document.querySelectorAll('.tab-bar .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (tabName === 'checklist') {
        document.getElementById('tabChecklist').classList.add('active');
    } else {
        document.getElementById('tabTransmittals').classList.add('active');
    }
}

// ─── Checklist CRUD ──────────────────────────────────────────
async function loadChecklist(jobId) {
    const res = await fetch('/api/documents/checklist?job_id=' + jobId);
    checklistItems = await res.json();
    renderChecklist();
}

function renderChecklist() {
    const tbody = document.getElementById('checklistBody');
    if (!checklistItems.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No checklist items. Click "+ Add Item" or "Add Default Items".</td></tr>';
        updateChecklistProgress();
        return;
    }

    tbody.innerHTML = checklistItems.map(item => {
        const statusClass = getStatusClass(item.status);
        const statusBadge = `<span class="status-badge ${statusClass}">${item.status}</span>`;
        const isIncomplete = item.status === 'Not Started' || item.status === 'In Progress';

        const fileBtn = item.has_file
            ? `<button class="btn btn-small btn-secondary" onclick="viewFile(${item.id})">View</button> `
            : '';

        return `<tr${isIncomplete ? ' style="background:var(--amber-bg);"' : ''}>
            <td><strong>${item.item_name}</strong></td>
            <td>${item.item_type || '-'}</td>
            <td>
                <select class="form-select-sm" onchange="updateChecklistStatus(${item.id}, this.value)" style="min-width:110px;">
                    ${['Not Started','In Progress','Complete','N/A'].map(s =>
                        `<option value="${s}" ${item.status === s ? 'selected' : ''}>${s}</option>`
                    ).join('')}
                </select>
            </td>
            <td>
                ${fileBtn}
                <button class="btn btn-small btn-secondary" onclick="showFileUpload(${item.id})">Upload</button>
            </td>
            <td style="max-width:200px;font-size:13px;color:var(--gray-500);">${item.notes || '-'}</td>
            <td>
                <button class="btn btn-small btn-secondary" onclick="editChecklistItem(${item.id})">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteChecklistItem(${item.id})">Del</button>
            </td>
        </tr>`;
    }).join('');

    updateChecklistProgress();
}

function getStatusClass(status) {
    switch (status) {
        case 'Not Started': return 'status-draft';
        case 'In Progress': return 'status-in-progress';
        case 'Complete': return 'status-complete';
        case 'N/A': return 'status-closed';
        default: return 'status-draft';
    }
}

function updateChecklistProgress() {
    const total = checklistItems.length;
    const na = checklistItems.filter(i => i.status === 'N/A').length;
    const complete = checklistItems.filter(i => i.status === 'Complete').length;
    const effectiveTotal = total - na;
    const pct = effectiveTotal > 0 ? Math.round(complete / effectiveTotal * 100) : 0;

    const label = document.getElementById('checklistProgressLabel');
    const pctEl = document.getElementById('checklistProgressPct');
    const fill = document.getElementById('checklistProgressFill');

    if (label) label.textContent = `${complete} of ${effectiveTotal} items complete` + (na ? ` (${na} N/A)` : '');
    if (pctEl) pctEl.textContent = pct + '%';
    if (fill) fill.style.width = pct + '%';
}

function showAddChecklistItem() {
    document.getElementById('checklistModalTitle').textContent = 'Add Checklist Item';
    document.getElementById('ciId').value = '';
    document.getElementById('ciName').value = '';
    document.getElementById('ciType').value = 'Document';
    document.getElementById('ciStatus').value = 'Not Started';
    document.getElementById('ciNotes').value = '';
    document.getElementById('checklistModal').style.display = 'flex';
}

function editChecklistItem(id) {
    const item = checklistItems.find(i => i.id === id);
    if (!item) return;
    document.getElementById('checklistModalTitle').textContent = 'Edit Checklist Item';
    document.getElementById('ciId').value = item.id;
    document.getElementById('ciName').value = item.item_name;
    document.getElementById('ciType').value = item.item_type || 'Document';
    document.getElementById('ciStatus').value = item.status || 'Not Started';
    document.getElementById('ciNotes').value = item.notes || '';
    document.getElementById('checklistModal').style.display = 'flex';
}

async function saveChecklistItem(e) {
    e.preventDefault();
    const id = document.getElementById('ciId').value;
    const data = {
        job_id: window.DOC_JOB_ID,
        item_name: document.getElementById('ciName').value,
        item_type: document.getElementById('ciType').value,
        status: document.getElementById('ciStatus').value,
        notes: document.getElementById('ciNotes').value,
    };

    if (id) {
        await fetch('/api/documents/checklist/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } else {
        await fetch('/api/documents/checklist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }
    document.getElementById('checklistModal').style.display = 'none';
    loadChecklist(window.DOC_JOB_ID);
}

async function updateChecklistStatus(id, status) {
    await fetch('/api/documents/checklist/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
    loadChecklist(window.DOC_JOB_ID);
}

async function deleteChecklistItem(id) {
    if (!confirm('Delete this checklist item?')) return;
    await fetch('/api/documents/checklist/' + id, { method: 'DELETE' });
    loadChecklist(window.DOC_JOB_ID);
}

// ─── File Upload ─────────────────────────────────────────────
function showFileUpload(itemId) {
    document.getElementById('fuItemId').value = itemId;
    document.getElementById('fuFile').value = '';
    document.getElementById('fileUploadModal').style.display = 'flex';
}

async function submitFileUpload(e) {
    e.preventDefault();
    const itemId = document.getElementById('fuItemId').value;
    const fd = new FormData();
    const file = document.getElementById('fuFile').files[0];
    if (file) fd.append('file', file);

    await fetch('/api/documents/checklist/' + itemId + '/file', {
        method: 'PUT',
        body: fd
    });
    document.getElementById('fileUploadModal').style.display = 'none';
    loadChecklist(window.DOC_JOB_ID);
}

function viewFile(id) {
    window.open('/api/documents/checklist/' + id + '/file', '_blank');
}

// ─── Default Items ───────────────────────────────────────────
async function addDefaultItems() {
    await fetch('/api/documents/checklist/defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: window.DOC_JOB_ID })
    });
    loadChecklist(window.DOC_JOB_ID);
}

// ─── Transmittals CRUD ──────────────────────────────────────
async function loadTransmittals(jobId) {
    const res = await fetch('/api/documents/transmittals?job_id=' + jobId);
    transmittals = await res.json();
    renderTransmittals();
}

function renderTransmittals() {
    const tbody = document.getElementById('transmittalsBody');
    if (!transmittals.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No transmittals yet.</td></tr>';
        return;
    }

    tbody.innerHTML = transmittals.map(t => `<tr>
        <td><strong>#${t.transmittal_number}</strong></td>
        <td>${t.to_company || '-'}${t.to_attention ? '<br><small class="text-muted">' + t.to_attention + '</small>' : ''}</td>
        <td>${t.subject || '-'}</td>
        <td>${t.sent_date || '-'}</td>
        <td>${t.sent_via || '-'}</td>
        <td>
            <button class="btn btn-small btn-primary" onclick="generateTransmittalPDF(${t.id})">Generate PDF</button>
            <button class="btn btn-small btn-danger" onclick="deleteTransmittal(${t.id})">Del</button>
        </td>
    </tr>`).join('');
}

function showNewTransmittal() {
    document.getElementById('txToCompany').value = '';
    document.getElementById('txToAttention').value = '';
    document.getElementById('txSubject').value = '';
    document.getElementById('txNotes').value = '';
    document.getElementById('txSentVia').value = 'Email';
    document.getElementById('txSentDate').valueAsDate = new Date();
    document.getElementById('transmittalModal').style.display = 'flex';
}

async function saveTransmittal(e) {
    e.preventDefault();
    await fetch('/api/documents/transmittals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            job_id: window.DOC_JOB_ID,
            to_company: document.getElementById('txToCompany').value,
            to_attention: document.getElementById('txToAttention').value,
            subject: document.getElementById('txSubject').value,
            notes: document.getElementById('txNotes').value,
            sent_via: document.getElementById('txSentVia').value,
            sent_date: document.getElementById('txSentDate').value,
        })
    });
    document.getElementById('transmittalModal').style.display = 'none';
    loadTransmittals(window.DOC_JOB_ID);
}

async function deleteTransmittal(id) {
    if (!confirm('Delete this transmittal?')) return;
    await fetch('/api/documents/transmittals/' + id, { method: 'DELETE' });
    loadTransmittals(window.DOC_JOB_ID);
}

async function generateTransmittalPDF(id) {
    const res = await fetch('/api/documents/transmittals/' + id + '/generate', { method: 'POST' });
    if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    } else {
        alert('Failed to generate PDF. Please try again.');
    }
}
