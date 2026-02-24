/* Job Schedule JS */
let allEvents = [];
let schedUsers = [];
let schedJobs = [];

if (window.SCHEDULE_PAGE === 'overview') {
    initOverview();
} else if (window.SCHEDULE_PAGE === 'job') {
    initJobSchedule();
}

async function initOverview() {
    const [jobsRes, usersRes] = await Promise.all([fetch('/api/jobs/list'), fetch('/api/users/list')]);
    schedJobs = await jobsRes.json();
    schedUsers = await usersRes.json();
    const sel = document.getElementById('schedJobFilter');
    schedJobs.forEach(j => { const o = document.createElement('option'); o.value = j.id; o.textContent = j.name; sel.appendChild(o); });
    // Load all events for phase counts
    const res = await fetch('/api/schedule/events');
    allEvents = await res.json();
    renderJobCards();
}

function onJobFilterChange() {
    const jobId = document.getElementById('schedJobFilter')?.value || '';
    const goBtn = document.getElementById('goToJobBtn');
    const cardsSection = document.getElementById('jobCardsSection');
    const eventsSection = document.getElementById('eventsSection');

    if (jobId) {
        goBtn.href = '/schedule/job/' + jobId;
        goBtn.style.display = '';
        cardsSection.style.display = 'none';
        eventsSection.style.display = '';
        loadScheduleOverview();
    } else {
        goBtn.style.display = 'none';
        eventsSection.style.display = 'none';
        cardsSection.style.display = '';
        renderJobCards();
    }
}

function renderJobCards() {
    const grid = document.getElementById('jobCardsGrid');
    if (!schedJobs.length) {
        grid.innerHTML = '<p class="empty-state">No jobs found.</p>';
        return;
    }
    grid.innerHTML = schedJobs.map(j => {
        const jobEvents = allEvents.filter(e => e.job_id === j.id);
        const total = jobEvents.length;
        const complete = jobEvents.filter(e => e.status === 'Complete').length;
        const inProgress = jobEvents.filter(e => e.status === 'In Progress').length;
        const pending = jobEvents.filter(e => e.status === 'Pending').length;
        const statusText = total
            ? `${complete}/${total} complete` + (inProgress ? `, ${inProgress} in progress` : '')
            : 'No phases yet';
        const pct = total ? Math.round(complete / total * 100) : 0;
        return `<a href="/schedule/job/${j.id}" class="schedule-job-card">
            <div class="schedule-job-card-name">${j.name}</div>
            <div class="schedule-job-card-status">${statusText}</div>
            ${total ? `<div class="schedule-progress-bar"><div class="schedule-progress-fill" style="width:${pct}%"></div></div>` : ''}
            <div class="schedule-job-card-action">Manage Schedule &rarr;</div>
        </a>`;
    }).join('');
}

async function loadScheduleOverview() {
    const jobId = document.getElementById('schedJobFilter')?.value || '';
    const params = jobId ? '?job_id=' + jobId : '';
    const res = await fetch('/api/schedule/events' + params);
    allEvents = await res.json();
    renderScheduleOverview();
}

function renderScheduleOverview() {
    const statusFilter = document.getElementById('schedStatusFilter')?.value || '';
    let filtered = allEvents;
    if (statusFilter) filtered = filtered.filter(e => e.status === statusFilter);

    const tbody = document.getElementById('schedBody');
    const jobId = document.getElementById('schedJobFilter')?.value || '';
    if (!filtered.length) {
        const jobName = jobId ? (schedJobs.find(j => j.id == jobId)?.name || 'this job') : 'any job';
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No scheduled phases for ${jobName}.<br><a href="/schedule/job/${jobId}" class="link" style="margin-top:8px;display:inline-block;">Click here to add phases</a></td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(e => {
        const user = schedUsers.find(u => u.id === e.assigned_to);
        const job = schedJobs.find(j => j.id === e.job_id);
        return `<tr>
            <td><a href="/schedule/job/${e.job_id}" class="link">${job ? job.name : 'Job #' + e.job_id}</a></td>
            <td>${e.phase_name}</td>
            <td>${e.start_date || '-'}</td>
            <td>${e.end_date || '-'}</td>
            <td>${user ? user.display_name : 'Unassigned'}</td>
            <td><span class="phase-status phase-${e.status.toLowerCase().replace(/ /g, '-')}">${e.status}</span></td>
        </tr>`;
    }).join('');
}

async function initJobSchedule() {
    const [usersRes] = await Promise.all([fetch('/api/users/list')]);
    schedUsers = await usersRes.json();
    const sel = document.getElementById('pmAssigned');
    schedUsers.forEach(u => { const o = document.createElement('option'); o.value = u.id; o.textContent = u.display_name; sel.appendChild(o); });
    // Set job name in header
    const jobsRes = await fetch('/api/jobs/list');
    schedJobs = await jobsRes.json();
    const job = schedJobs.find(j => j.id === window.SCHEDULE_JOB_ID);
    if (job) document.getElementById('schedJobName').textContent = job.name + ' — Schedule';
    loadEvents();
}

async function loadEvents() {
    const res = await fetch('/api/schedule/events?job_id=' + window.SCHEDULE_JOB_ID);
    allEvents = await res.json();
    renderEvents();
}

function renderEvents() {
    const tbody = document.getElementById('phaseBody');
    if (!allEvents.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No phases yet. Click "+ Add Phase" or "Add Default Phases".</td></tr>'; return; }

    tbody.innerHTML = allEvents.map(e => {
        const user = schedUsers.find(u => u.id === e.assigned_to);
        const statuses = ['Pending', 'In Progress', 'Complete', 'Cancelled'];
        return `<tr>
            <td><strong>${e.phase_name}</strong>${e.description ? '<br><small class="text-muted">' + e.description + '</small>' : ''}</td>
            <td>${e.start_date || '-'}</td>
            <td>${e.end_date || '-'}</td>
            <td>${user ? user.display_name : 'Unassigned'}</td>
            <td>
                <select class="form-select-sm phase-status-select phase-${e.status.toLowerCase().replace(/ /g, '-')}" onchange="updateStatus(${e.id}, this.value)">
                    ${statuses.map(s => `<option value="${s}" ${e.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </td>
            <td>
                <button class="btn btn-small btn-secondary" onclick="editPhase(${e.id})">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deletePhase(${e.id})">Delete</button>
            </td>
        </tr>`;
    }).join('');
}

function showAddPhase() {
    document.getElementById('phaseModalTitle').textContent = 'Add Phase';
    document.getElementById('pmId').value = '';
    document.getElementById('pmPreset').value = '';
    document.getElementById('pmName').value = '';
    document.getElementById('pmStart').value = '';
    document.getElementById('pmEnd').value = '';
    document.getElementById('pmAssigned').value = '';
    document.getElementById('pmDesc').value = '';
    document.getElementById('phaseModal').style.display = 'flex';
}

function editPhase(id) {
    const e = allEvents.find(ev => ev.id === id);
    if (!e) return;
    document.getElementById('phaseModalTitle').textContent = 'Edit Phase';
    document.getElementById('pmId').value = e.id;
    document.getElementById('pmPreset').value = '';
    document.getElementById('pmName').value = e.phase_name;
    document.getElementById('pmStart').value = e.start_date || '';
    document.getElementById('pmEnd').value = e.end_date || '';
    document.getElementById('pmAssigned').value = e.assigned_to || '';
    document.getElementById('pmDesc').value = e.description || '';
    document.getElementById('phaseModal').style.display = 'flex';
}

async function savePhase(e) {
    e.preventDefault();
    const id = document.getElementById('pmId').value;
    const data = {
        job_id: window.SCHEDULE_JOB_ID,
        phase_name: document.getElementById('pmName').value,
        start_date: document.getElementById('pmStart').value,
        end_date: document.getElementById('pmEnd').value,
        assigned_to: document.getElementById('pmAssigned').value || null,
        description: document.getElementById('pmDesc').value,
    };
    if (id) {
        await fetch('/api/schedule/events/' + id, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } else {
        data.sort_order = allEvents.length;
        await fetch('/api/schedule/events', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }
    document.getElementById('phaseModal').style.display = 'none';
    loadEvents();
}

async function updateStatus(id, status) {
    await fetch('/api/schedule/events/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
    loadEvents();
}

async function deletePhase(id) {
    if (!confirm('Delete this phase?')) return;
    await fetch('/api/schedule/events/' + id, { method: 'DELETE' });
    loadEvents();
}

async function addDefaultPhases() {
    const defaults = ['Rough-In', 'AHU Install', 'Condenser Install', 'Trim-Out', 'Startup', 'Inspection', 'Punch List'];
    for (let i = 0; i < defaults.length; i++) {
        await fetch('/api/schedule/events', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_id: window.SCHEDULE_JOB_ID,
                phase_name: defaults[i],
                sort_order: allEvents.length + i,
            })
        });
    }
    loadEvents();
}
