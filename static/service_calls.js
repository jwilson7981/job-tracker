/* Service Calls JS */
let allCalls = [];

// List page
if (document.getElementById('callsBody')) {
    loadCalls();
    loadDropdowns();
}

// Detail page
if (window.CALL_ID) {
    loadCallDetail();
}

async function loadDropdowns() {
    const [jobsRes, usersRes] = await Promise.all([fetch('/api/jobs/list'), fetch('/api/users/list')]);
    const jobs = await jobsRes.json();
    const users = await usersRes.json();
    const jobSel = document.getElementById('scJob');
    const userSel = document.getElementById('scAssigned');
    if (jobSel) jobs.forEach(j => { const o = document.createElement('option'); o.value = j.id; o.textContent = j.name; jobSel.appendChild(o); });
    if (userSel) users.forEach(u => { const o = document.createElement('option'); o.value = u.id; o.textContent = u.display_name; userSel.appendChild(o); });
}

async function loadCalls() {
    const res = await fetch('/api/service-calls');
    allCalls = await res.json();
    renderCalls();
}

function renderCalls() {
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    const priorityFilter = document.getElementById('filterPriority')?.value || '';
    let filtered = allCalls;
    if (statusFilter) filtered = filtered.filter(c => c.status === statusFilter);
    if (priorityFilter) filtered = filtered.filter(c => c.priority === priorityFilter);

    const tbody = document.getElementById('callsBody');
    if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No service calls found.</td></tr>'; return; }
    tbody.innerHTML = filtered.map(c => {
        const priClass = c.priority === 'Urgent' ? 'status-in-progress' : c.priority === 'High' ? 'status-bid-complete' : '';
        return `<tr>
            <td><a href="/service-calls/${c.id}" class="link">#${c.id}</a></td>
            <td><span class="status-badge ${priClass}">${c.priority}</span></td>
            <td>${c.caller_name || '-'}</td>
            <td>${(c.description || '').substring(0, 60)}${(c.description || '').length > 60 ? '...' : ''}</td>
            <td>${c.job_name || '-'}</td>
            <td>${c.assigned_name || 'Unassigned'}</td>
            <td><span class="status-badge status-${c.status.toLowerCase().replace(/ /g,'-')}">${c.status}</span></td>
            <td>${(c.created_at || '').substring(0, 10)}</td>
            <td><a href="/service-calls/${c.id}" class="btn btn-small btn-secondary">View</a></td>
        </tr>`;
    }).join('');
}

function showNewCall() { document.getElementById('callModal').style.display = 'flex'; }

async function saveCall(e) {
    e.preventDefault();
    await fetch('/api/service-calls', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            caller_name: document.getElementById('scCaller').value,
            caller_phone: document.getElementById('scPhone').value,
            caller_email: document.getElementById('scEmail').value,
            description: document.getElementById('scDesc').value,
            job_id: document.getElementById('scJob').value || null,
            priority: document.getElementById('scPriority').value,
            assigned_to: document.getElementById('scAssigned').value || null,
            scheduled_date: document.getElementById('scScheduled').value,
        })
    });
    document.getElementById('callModal').style.display = 'none';
    loadCalls();
}

async function loadCallDetail() {
    const res = await fetch(`/api/service-calls/${CALL_ID}`);
    const call = await res.json();
    const detail = document.getElementById('callDetail');

    const [jobsRes, usersRes] = await Promise.all([fetch('/api/jobs/list'), fetch('/api/users/list')]);
    const jobs = await jobsRes.json();
    const users = await usersRes.json();

    detail.innerHTML = `
        <div class="detail-grid">
            <div class="detail-row"><span class="detail-label">Caller:</span><span>${call.caller_name || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">Phone:</span><span>${call.caller_phone || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">Email:</span><span>${call.caller_email || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">Job:</span><span>${call.job_name || 'None'}</span></div>
            <div class="detail-row"><span class="detail-label">Created:</span><span>${call.created_at || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">Scheduled:</span><span>${call.scheduled_date || '-'}</span></div>
        </div>
        <h3 style="margin-top:16px;">Description</h3>
        <p style="padding:12px;background:var(--gray-50);border-radius:6px;margin-bottom:16px;">${call.description || '-'}</p>
        <div class="detail-grid">
            <div class="detail-row">
                <span class="detail-label">Priority:</span>
                <select id="detPriority" onchange="updateCallField('priority', this.value)" class="form-select-sm">
                    ${['Low','Normal','High','Urgent'].map(s => `<option value="${s}" ${call.priority===s?'selected':''}>${s}</option>`).join('')}
                </select>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <select id="detStatus" onchange="updateCallField('status', this.value)" class="form-select-sm">
                    ${['Open','Assigned','In Progress','Resolved','Closed'].map(s => `<option value="${s}" ${call.status===s?'selected':''}>${s}</option>`).join('')}
                </select>
            </div>
            <div class="detail-row">
                <span class="detail-label">Assigned To:</span>
                <select id="detAssigned" onchange="updateCallField('assigned_to', this.value)" class="form-select-sm">
                    <option value="">Unassigned</option>
                    ${users.map(u => `<option value="${u.id}" ${call.assigned_to==u.id?'selected':''}>${u.display_name}</option>`).join('')}
                </select>
            </div>
        </div>
        <h3 style="margin-top:16px;">Resolution</h3>
        <textarea id="detResolution" style="width:100%;padding:10px;border:1px solid var(--gray-300);border-radius:6px;min-height:80px;font-family:inherit;" onblur="updateCallField('resolution', this.value)">${call.resolution || ''}</textarea>
    `;
}

async function updateCallField(field, value) {
    await fetch(`/api/service-calls/${CALL_ID}`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ [field]: value })
    });
}
