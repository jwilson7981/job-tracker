/* RFIs JS */
let allRFIs = [];
let rfiJobs = [];
let rfiUsers = [];
let editingRFIId = null;

// Initialize on page load
if (document.getElementById('rfisBody')) {
    initRFIs();
}

async function initRFIs() {
    await loadDropdowns();
    loadRFIs();
}

async function loadDropdowns() {
    const [jobsRes, usersRes] = await Promise.all([fetch('/api/jobs/list'), fetch('/api/users/list')]);
    rfiJobs = await jobsRes.json();
    rfiUsers = await usersRes.json();

    // Populate filter job dropdown
    const filterJob = document.getElementById('filterJob');
    rfiJobs.forEach(j => {
        const o = document.createElement('option');
        o.value = j.id;
        o.textContent = j.name;
        filterJob.appendChild(o);
    });

    // Populate add modal job dropdown
    const addJob = document.getElementById('rfiJob');
    rfiJobs.forEach(j => {
        const o = document.createElement('option');
        o.value = j.id;
        o.textContent = j.name;
        addJob.appendChild(o);
    });

    // Populate edit modal job dropdown
    const editJob = document.getElementById('editRfiJob');
    rfiJobs.forEach(j => {
        const o = document.createElement('option');
        o.value = j.id;
        o.textContent = j.name;
        editJob.appendChild(o);
    });

    // Populate add modal users dropdown
    const addUser = document.getElementById('rfiAssignedTo');
    rfiUsers.forEach(u => {
        const o = document.createElement('option');
        o.value = u.id;
        o.textContent = u.display_name;
        addUser.appendChild(o);
    });

    // Populate edit modal users dropdown
    const editUser = document.getElementById('editRfiAssignedTo');
    rfiUsers.forEach(u => {
        const o = document.createElement('option');
        o.value = u.id;
        o.textContent = u.display_name;
        editUser.appendChild(o);
    });

    // Auto-select job from URL parameter
    var _urlJobId = new URLSearchParams(window.location.search).get('job_id');
    if (_urlJobId) { document.getElementById('filterJob').value = _urlJobId; }
}

async function loadRFIs() {
    const jobId = document.getElementById('filterJob').value;
    const status = document.getElementById('filterStatus').value;
    let url = '/api/rfis';
    const params = [];
    if (jobId) params.push('job_id=' + jobId);
    if (status) params.push('status=' + status);
    if (params.length) url += '?' + params.join('&');

    const res = await fetch(url);
    allRFIs = await res.json();
    renderTable();
    renderSummary();
}

function renderSummary() {
    const today = new Date().toISOString().split('T')[0];
    const total = allRFIs.length;
    const open = allRFIs.filter(r => r.status === 'Open').length;
    const answered = allRFIs.filter(r => r.status === 'Answered').length;
    const closed = allRFIs.filter(r => r.status === 'Closed').length;
    const overdueCount = allRFIs.filter(r => r.status === 'Open' && r.date_required && r.date_required < today).length;

    document.getElementById('sumTotal').textContent = total;
    document.getElementById('sumOpen').textContent = open;
    document.getElementById('sumAnswered').textContent = answered;
    document.getElementById('sumClosed').textContent = closed;

    // Highlight open card in red if there are overdue items
    const openCard = document.getElementById('sumOpenCard');
    if (overdueCount > 0) {
        openCard.style.borderLeftColor = '#EF4444';
        document.getElementById('sumOpen').textContent = open + ' (' + overdueCount + ' overdue)';
    } else {
        openCard.style.borderLeftColor = '#3B82F6';
    }
}

function renderTable() {
    const today = new Date().toISOString().split('T')[0];
    const tbody = document.getElementById('rfisBody');

    if (!allRFIs.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No RFIs found.</td></tr>';
        return;
    }

    // Group by job
    const groups = {};
    const jobOrder = [];
    allRFIs.forEach(r => {
        const key = r.job_id || 0;
        if (!groups[key]) {
            const jobName = r.job_name || (rfiJobs.find(j => j.id === r.job_id) || {}).name || 'No Job';
            groups[key] = { name: jobName, items: [] };
            jobOrder.push(key);
        }
        groups[key].items.push(r);
    });

    let html = '';

    jobOrder.forEach(key => {
        const group = groups[key];
        const count = group.items.length;
        const open = group.items.filter(r => r.status === 'Open').length;
        const answered = group.items.filter(r => r.status === 'Answered').length;
        const closed = group.items.filter(r => r.status === 'Closed').length;

        let statusSummary = '';
        if (open) statusSummary += `<span style="color:#1E40AF;font-size:12px;margin-left:8px;">${open} open</span>`;
        if (answered) statusSummary += `<span style="color:#92400E;font-size:12px;margin-left:8px;">${answered} answered</span>`;
        if (closed) statusSummary += `<span style="color:#166534;font-size:12px;margin-left:8px;">${closed} closed</span>`;

        html += `<tr class="rfi-group-header" onclick="toggleRfiGroup('rfi-grp-${key}')" style="cursor:pointer;background:var(--gray-50,#f9fafb);border-top:2px solid var(--gray-200,#e5e7eb);">
            <td colspan="8" style="padding:10px 12px;font-weight:700;font-size:14px;">
                <span class="rfi-toggle" id="toggle-rfi-grp-${key}" style="display:inline-block;width:18px;transition:transform .2s;">&#9654;</span>
                ${group.name}
                <span style="font-weight:400;color:var(--gray-500);font-size:13px;margin-left:6px;">(${count})</span>
                ${statusSummary}
            </td>
        </tr>`;

        group.items.forEach(r => {
            const isOverdue = r.status === 'Open' && r.date_required && r.date_required < today;
            const statusClass = r.status === 'Open' ? 'status-open'
                : r.status === 'Answered' ? 'status-in-progress'
                : 'status-closed';

            let rowStyle = 'display:none;';
            if (isOverdue) rowStyle += 'background:#FEF2F2;';

            html += `<tr class="rfi-row rfi-grp-${key}" style="${rowStyle}">
                <td><a href="#" class="link" onclick="toggleDetail(${r.id});return false;">#${r.rfi_number || r.id}</a></td>
                <td>${r.job_name || '-'}</td>
                <td>${r.subject || '-'}</td>
                <td>${r.requested_by || '-'}</td>
                <td>${r.date_submitted || '-'}</td>
                <td${isOverdue ? ' style="color:#DC2626;font-weight:600;"' : ''}>${r.date_required || '-'}${isOverdue ? ' (Overdue)' : ''}</td>
                <td><span class="status-badge ${statusClass}">${r.status}</span></td>
                <td>
                    <button class="btn btn-small btn-secondary" onclick="editRFI(${r.id})">Edit</button>
                    <button class="btn btn-small btn-danger" onclick="deleteRFI(${r.id})">Delete</button>
                </td>
            </tr>
            <tr id="detail-${r.id}" class="rfi-row rfi-grp-${key}" style="display:none;">
                <td colspan="8" style="background:var(--gray-50);padding:16px;">
                    <div style="margin-bottom:12px;">
                        <strong>Question:</strong>
                        <p style="margin:4px 0 0;white-space:pre-wrap;">${r.question || 'No question provided.'}</p>
                    </div>
                    <div>
                        <strong>Answer:</strong>
                        <p style="margin:4px 0 0;white-space:pre-wrap;">${r.answer || 'Not yet answered.'}</p>
                    </div>
                    ${r.assigned_to_name ? '<div style="margin-top:8px;"><strong>Assigned To:</strong> ' + r.assigned_to_name + '</div>' : ''}
                    ${r.date_answered ? '<div style="margin-top:4px;"><strong>Date Answered:</strong> ' + r.date_answered + '</div>' : ''}
                </td>
            </tr>`;
        });
    });

    tbody.innerHTML = html;
}

function toggleRfiGroup(groupClass) {
    const rows = document.querySelectorAll('.rfi-row.' + groupClass);
    const toggle = document.getElementById('toggle-' + groupClass);
    // Check if group is open by looking at the first data row (skip detail rows)
    const firstRow = document.querySelector('.rfi-row.' + groupClass + ':not([id^="detail-"])');
    const isOpen = firstRow && firstRow.style.display !== 'none';
    rows.forEach(r => {
        if (r.id && r.id.startsWith('detail-')) {
            // Always hide detail rows when collapsing; keep hidden when expanding
            r.style.display = 'none';
        } else {
            r.style.display = isOpen ? 'none' : '';
        }
    });
    if (toggle) toggle.style.transform = isOpen ? '' : 'rotate(90deg)';
}

function toggleDetail(id) {
    const row = document.getElementById('detail-' + id);
    if (row) {
        row.style.display = row.style.display === 'none' ? '' : 'none';
    }
}

function showAddRFI() {
    editingRFIId = null;
    document.getElementById('rfiJob').value = '';
    document.getElementById('rfiSubject').value = '';
    document.getElementById('rfiQuestion').value = '';
    document.getElementById('rfiRequestedBy').value = '';
    document.getElementById('rfiAssignedTo').value = '';
    document.getElementById('rfiDateRequired').value = '';
    document.getElementById('rfiAddModal').style.display = 'flex';
}

function editRFI(id) {
    const rfi = allRFIs.find(r => r.id === id);
    if (!rfi) return;

    editingRFIId = id;
    document.getElementById('editRFIId').value = id;
    document.getElementById('editRfiJob').value = rfi.job_id || '';
    document.getElementById('editRfiSubject').value = rfi.subject || '';
    document.getElementById('editRfiQuestion').value = rfi.question || '';
    document.getElementById('editRfiRequestedBy').value = rfi.requested_by || '';
    document.getElementById('editRfiAssignedTo').value = rfi.assigned_to || '';
    document.getElementById('editRfiDateRequired').value = rfi.date_required || '';
    document.getElementById('editRfiAnswer').value = rfi.answer || '';
    document.getElementById('editRfiStatus').value = rfi.status || 'Open';
    document.getElementById('editRfiDateAnswered').value = rfi.date_answered || '';
    document.getElementById('rfiEditModal').style.display = 'flex';
}

async function saveRFI(event) {
    event.preventDefault();

    if (editingRFIId) {
        // Edit mode — PUT
        const data = {
            job_id: document.getElementById('editRfiJob').value,
            subject: document.getElementById('editRfiSubject').value,
            question: document.getElementById('editRfiQuestion').value,
            requested_by: document.getElementById('editRfiRequestedBy').value,
            assigned_to: document.getElementById('editRfiAssignedTo').value || null,
            date_required: document.getElementById('editRfiDateRequired').value || null,
            answer: document.getElementById('editRfiAnswer').value || null,
            status: document.getElementById('editRfiStatus').value,
            date_answered: document.getElementById('editRfiDateAnswered').value || null,
        };
        await fetch('/api/rfis/' + editingRFIId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        document.getElementById('rfiEditModal').style.display = 'none';
    } else {
        // Add mode — POST
        const data = {
            job_id: document.getElementById('rfiJob').value,
            subject: document.getElementById('rfiSubject').value,
            question: document.getElementById('rfiQuestion').value,
            requested_by: document.getElementById('rfiRequestedBy').value,
            assigned_to: document.getElementById('rfiAssignedTo').value || null,
            date_required: document.getElementById('rfiDateRequired').value || null,
        };
        await fetch('/api/rfis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        document.getElementById('rfiAddModal').style.display = 'none';
    }

    editingRFIId = null;
    loadRFIs();
}

async function deleteRFI(id) {
    if (!confirm('Delete this RFI? This cannot be undone.')) return;
    await fetch('/api/rfis/' + id, { method: 'DELETE' });
    loadRFIs();
}
