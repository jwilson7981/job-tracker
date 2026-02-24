/* Submittals JS */
let allSubmittals = [];
let jobsList = [];

// Init on page load
loadJobs();
loadSubmittals();

// ─── Load Jobs Dropdown ─────────────────────────────────────
async function loadJobs() {
    const res = await fetch('/api/jobs/list');
    jobsList = await res.json();
    const filterSel = document.getElementById('filterJob');
    const addSel = document.getElementById('addJob');
    const editSel = document.getElementById('editJob');
    jobsList.forEach(j => {
        const opt1 = document.createElement('option');
        opt1.value = j.id;
        opt1.textContent = j.name;
        filterSel.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = j.id;
        opt2.textContent = j.name;
        addSel.appendChild(opt2);

        const opt3 = document.createElement('option');
        opt3.value = j.id;
        opt3.textContent = j.name;
        editSel.appendChild(opt3);
    });
}

// ─── Load & Render Submittals ───────────────────────────────
async function loadSubmittals() {
    const jobId = document.getElementById('filterJob').value;
    const status = document.getElementById('filterStatus').value;
    const params = new URLSearchParams();
    if (jobId) params.set('job_id', jobId);
    if (status) params.set('status', status);
    const res = await fetch('/api/submittals?' + params.toString());
    allSubmittals = await res.json();
    renderSummary();
    renderTable();
}

function renderSummary() {
    const total = allSubmittals.length;
    const pending = allSubmittals.filter(s => s.status === 'Pending').length;
    const submitted = allSubmittals.filter(s => s.status === 'Submitted').length;
    const approved = allSubmittals.filter(s => s.status === 'Approved' || s.status === 'Approved as Noted').length;
    const rejected = allSubmittals.filter(s => s.status === 'Rejected' || s.status === 'Resubmit').length;

    document.getElementById('sumTotal').textContent = total;
    document.getElementById('sumPending').textContent = pending;
    document.getElementById('sumSubmitted').textContent = submitted;
    document.getElementById('sumApproved').textContent = approved;
    document.getElementById('sumRejected').textContent = rejected;

    // Alert styling on rejected card when count > 0
    const rejCard = document.getElementById('sumRejectedCard');
    if (rejected > 0) {
        rejCard.style.background = '#FEF2F2';
        rejCard.style.borderColor = '#EF4444';
    } else {
        rejCard.style.background = '';
        rejCard.style.borderColor = '';
    }
}

function renderTable() {
    const tbody = document.getElementById('submittalsBody');
    if (!allSubmittals.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No submittals found.</td></tr>';
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    tbody.innerHTML = allSubmittals.map(s => {
        const statusBadge = getStatusBadge(s.status);
        const isOverdue = s.date_required && !s.date_returned && s.date_required < today;
        const isRejected = s.status === 'Rejected';
        const isResubmit = s.status === 'Resubmit';

        let rowStyle = '';
        if (isRejected) {
            rowStyle = 'background:#FEF2F2;';
        } else if (isResubmit) {
            rowStyle = 'background:#FFFBEB;';
        } else if (isOverdue) {
            rowStyle = 'background:#FEF2F2;';
        }

        const dateRequiredStyle = isOverdue ? 'color:#EF4444;font-weight:600;' : '';

        const hasFile = s.has_file || s.file_path;

        return `<tr style="${rowStyle}">
            <td>${s.id}</td>
            <td>${s.job_name || '-'}</td>
            <td>${s.spec_section || '-'}</td>
            <td>${s.description || '-'}</td>
            <td>${s.vendor || '-'}</td>
            <td>${s.revision != null ? s.revision : 0}</td>
            <td>${statusBadge}</td>
            <td>${s.date_submitted || '-'}</td>
            <td style="${dateRequiredStyle}">${s.date_required || '-'}${isOverdue ? ' <span class="badge" style="background:#FEE2E2;color:#EF4444;font-size:11px;">OVERDUE</span>' : ''}</td>
            <td>${s.date_returned || '-'}</td>
            <td>
                ${hasFile ? `<button class="btn btn-small btn-secondary" onclick="viewFile(${s.id})">View File</button>` : ''}
                <button class="btn btn-small btn-primary" onclick='editSubmittal(${JSON.stringify(s)})'>Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteSubmittal(${s.id})">Delete</button>
            </td>
        </tr>`;
    }).join('');
}

function getStatusBadge(status) {
    const map = {
        'Pending':          { bg: '#F3F4F6', color: '#6B7280' },
        'Submitted':        { bg: '#DBEAFE', color: '#1E40AF' },
        'Approved':         { bg: '#DCFCE7', color: '#166534' },
        'Approved as Noted':{ bg: '#CCFBF1', color: '#115E59' },
        'Rejected':         { bg: '#FEE2E2', color: '#991B1B' },
        'Resubmit':         { bg: '#FEF3C7', color: '#92400E' },
    };
    const s = map[status] || { bg: '#F3F4F6', color: '#6B7280' };
    return `<span class="badge" style="background:${s.bg};color:${s.color};">${status}</span>`;
}

// ─── Modal Control ──────────────────────────────────────────
function showAddSubmittal() {
    document.getElementById('addSpecSection').value = '';
    document.getElementById('addDescription').value = '';
    document.getElementById('addVendor').value = '';
    document.getElementById('addDateRequired').value = '';
    document.getElementById('addFile').value = '';
    if (jobsList.length) document.getElementById('addJob').selectedIndex = 0;
    document.getElementById('addModal').style.display = 'flex';
}

function editSubmittal(sub) {
    document.getElementById('editId').value = sub.id;
    document.getElementById('editJob').value = sub.job_id || '';
    document.getElementById('editSpecSection').value = sub.spec_section || '';
    document.getElementById('editDescription').value = sub.description || '';
    document.getElementById('editVendor').value = sub.vendor || '';
    document.getElementById('editStatus').value = sub.status || 'Pending';
    document.getElementById('editReviewer').value = sub.reviewer || '';
    document.getElementById('editReviewerComments').value = sub.reviewer_comments || '';
    document.getElementById('editDateSubmitted').value = sub.date_submitted || '';
    document.getElementById('editDateRequired').value = sub.date_required || '';
    document.getElementById('editDateReturned').value = sub.date_returned || '';
    document.getElementById('editRevision').value = sub.revision != null ? sub.revision : 0;
    document.getElementById('editFile').value = '';
    document.getElementById('editModal').style.display = 'flex';
}

// ─── Save (Create or Update) ────────────────────────────────
async function saveSubmittal(event) {
    event.preventDefault();
    const editId = document.getElementById('editId')?.value;
    const isEdit = event.target.id === 'editForm' && editId;

    const prefix = isEdit ? 'edit' : 'add';
    const fd = new FormData();
    fd.append('job_id', document.getElementById(prefix + 'Job').value);
    fd.append('spec_section', document.getElementById(prefix + 'SpecSection').value);
    fd.append('description', document.getElementById(prefix + 'Description').value);
    fd.append('vendor', document.getElementById(prefix + 'Vendor').value);
    fd.append('date_required', document.getElementById(prefix + 'DateRequired').value);

    const fileInput = document.getElementById(prefix + 'File');
    if (fileInput.files[0]) {
        fd.append('file', fileInput.files[0]);
    }

    if (isEdit) {
        fd.append('status', document.getElementById('editStatus').value);
        fd.append('reviewer', document.getElementById('editReviewer').value);
        fd.append('reviewer_comments', document.getElementById('editReviewerComments').value);
        fd.append('date_submitted', document.getElementById('editDateSubmitted').value);
        fd.append('date_returned', document.getElementById('editDateReturned').value);
        fd.append('revision', document.getElementById('editRevision').value);
        await fetch('/api/submittals/' + editId, { method: 'PUT', body: fd });
        document.getElementById('editModal').style.display = 'none';
    } else {
        await fetch('/api/submittals', { method: 'POST', body: fd });
        document.getElementById('addModal').style.display = 'none';
    }

    loadSubmittals();
}

// ─── Delete ─────────────────────────────────────────────────
async function deleteSubmittal(id) {
    if (!confirm('Delete this submittal? This cannot be undone.')) return;
    await fetch('/api/submittals/' + id, { method: 'DELETE' });
    loadSubmittals();
}

// ─── View File ──────────────────────────────────────────────
function viewFile(id) {
    window.open('/api/submittals/' + id + '/file', '_blank');
}
