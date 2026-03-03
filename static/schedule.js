/* Job Schedule JS */
let allEvents = [];
let schedUsers = [];
let schedJobs = [];
let bidLaborCache = null;

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
    renderGantt(allEvents);
}

function populateDependsOnSelect(currentId) {
    const sel = document.getElementById('pmDependsOn');
    // Keep the first "None" option, remove the rest
    while (sel.options.length > 1) sel.remove(1);
    allEvents.forEach(e => {
        if (e.id !== currentId) {
            const o = document.createElement('option');
            o.value = e.id;
            o.textContent = e.phase_name;
            sel.appendChild(o);
        }
    });
}

function renderEvents() {
    const tbody = document.getElementById('phaseBody');
    if (!allEvents.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No phases yet. Click "+ Add Phase" or "Add Default Phases".</td></tr>'; return; }

    const byId = {};
    allEvents.forEach(e => byId[e.id] = e);

    tbody.innerHTML = allEvents.map(e => {
        const user = schedUsers.find(u => u.id === e.assigned_to);
        const dep = e.depends_on ? byId[e.depends_on] : null;
        const statuses = ['Pending', 'In Progress', 'Complete', 'Cancelled'];
        const hoursStr = e.estimated_hours ? `${e.estimated_hours}h / ${e.crew_size || 1} crew` : '-';
        const pct = e.pct_complete || 0;
        return `<tr>
            <td><strong>${e.phase_name}</strong>${e.description ? '<br><small class="text-muted">' + e.description + '</small>' : ''}</td>
            <td>${e.start_date || '-'}</td>
            <td>${e.end_date || '-'}</td>
            <td>${hoursStr}</td>
            <td class="pct-cell" style="min-width:130px;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <input type="range" min="0" max="100" step="5" value="${pct}"
                        class="pct-slider" data-id="${e.id}"
                        oninput="this.nextElementSibling.textContent=this.value+'%'"
                        onchange="updatePctComplete(${e.id}, parseInt(this.value))">
                    <span style="font-size:12px;font-weight:600;min-width:32px;">${pct}%</span>
                </div>
            </td>
            <td>${user ? user.display_name : 'Unassigned'}</td>
            <td>${dep ? dep.phase_name : '-'}</td>
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

async function updatePctComplete(id, value) {
    await fetch('/api/schedule/events/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pct_complete: value })
    });
    // Update local cache
    const ev = allEvents.find(e => e.id === id);
    if (ev) ev.pct_complete = value;
    renderGantt(allEvents);
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
    document.getElementById('pmEstHours').value = '0';
    document.getElementById('pmCrewSize').value = '1';
    populateDependsOnSelect(null);
    document.getElementById('pmDependsOn').value = '';
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
    document.getElementById('pmEstHours').value = e.estimated_hours || 0;
    document.getElementById('pmCrewSize').value = e.crew_size || 1;
    populateDependsOnSelect(e.id);
    document.getElementById('pmDependsOn').value = e.depends_on || '';
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
        depends_on: document.getElementById('pmDependsOn').value || null,
        estimated_hours: parseFloat(document.getElementById('pmEstHours').value) || 0,
        crew_size: parseInt(document.getElementById('pmCrewSize').value) || 1,
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
    // Auto-set pct_complete based on status
    const payload = { status };
    if (status === 'Complete') payload.pct_complete = 100;
    if (status === 'Pending') payload.pct_complete = 0;

    await fetch('/api/schedule/events/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    loadEvents();
}

async function deletePhase(id) {
    if (!confirm('Delete this phase?')) return;
    try {
        const res = await fetch('/api/schedule/events/' + id, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert('Failed to delete phase: ' + (data.error || res.statusText));
            return;
        }
        loadEvents();
    } catch (err) {
        alert('Failed to delete phase: ' + err.message);
    }
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

/* ─── Smart Backwards Planning ─────────────────────────────── */

async function showBackwardsPlan() {
    document.getElementById('bpDeadline').value = '';
    document.getElementById('bpHoursPerDay').value = '10';
    document.getElementById('bpCrewOverride').value = '';
    document.getElementById('bpResults').style.display = 'none';
    document.getElementById('bpModal').style.display = 'flex';

    // Fetch bid labor data
    try {
        const res = await fetch(`/api/jobs/${window.SCHEDULE_JOB_ID}/bid-labor`);
        bidLaborCache = await res.json();
    } catch { bidLaborCache = { found: false }; }

    if (bidLaborCache && bidLaborCache.found) {
        document.getElementById('bpBidSection').style.display = '';
        document.getElementById('bpNoBid').style.display = 'none';

        const sys = bidLaborCache.total_systems;
        const mhps = bidLaborCache.man_hours_per_system;
        const totalMH = bidLaborCache.total_man_hours;
        document.getElementById('bpBidSummary').innerHTML =
            `<strong>${sys} systems</strong> &times; ${mhps} hrs/system = <strong>${totalMH} total man-hours</strong>` +
            (bidLaborCache.bid_name ? ` <span class="text-muted">(${bidLaborCache.bid_name})</span>` : '');

        // Build per-phase table
        const phases = bidLaborCache.phases;
        const tbody = document.getElementById('bpBidPhaseBody');
        let rows = '';
        for (const [phaseName, info] of Object.entries(phases)) {
            const ev = allEvents.find(e => e.phase_name === phaseName);
            const pct = ev ? (ev.pct_complete || 0) : 0;
            const remaining = Math.round(info.total_hours * (1 - pct / 100) * 10) / 10;
            rows += `<tr>
                <td>${phaseName}</td>
                <td>${info.hours_per_system}</td>
                <td>${info.total_hours}</td>
                <td>${pct}%</td>
                <td><strong>${remaining}</strong></td>
            </tr>`;
        }
        // Add non-bid phases that have manual hours
        for (const ev of allEvents) {
            if (!phases[ev.phase_name] && ev.estimated_hours > 0) {
                const pct = ev.pct_complete || 0;
                const remaining = Math.round(ev.estimated_hours * (1 - pct / 100) * 10) / 10;
                rows += `<tr>
                    <td>${ev.phase_name} <small class="text-muted">(manual)</small></td>
                    <td>-</td>
                    <td>${ev.estimated_hours}</td>
                    <td>${pct}%</td>
                    <td><strong>${remaining}</strong></td>
                </tr>`;
            }
        }
        tbody.innerHTML = rows;
    } else {
        document.getElementById('bpBidSection').style.display = 'none';
        document.getElementById('bpNoBid').style.display = '';
    }
}

function toggleCommercialQuestions() {
    const pt = document.getElementById('bpProjectType').value;
    const cq = document.getElementById('bpCommercialQuestions');
    cq.style.display = pt === 'commercial' ? '' : 'none';
}

async function runBackwardsPlan(e) {
    e.preventDefault();
    const deadline = document.getElementById('bpDeadline').value;
    const hoursPerDay = parseInt(document.getElementById('bpHoursPerDay').value) || 10;
    const crewVal = document.getElementById('bpCrewOverride').value;
    const crewOverride = crewVal ? parseInt(crewVal) : null;
    const projectType = document.getElementById('bpProjectType').value;
    if (!deadline) return alert('Please select a deadline date.');

    const payload = {
        job_id: window.SCHEDULE_JOB_ID,
        deadline_date: deadline,
        hours_per_day: hoursPerDay,
        crew_override: crewOverride,
        project_type: projectType,
    };

    // Commercial project details
    if (projectType === 'commercial') {
        payload.commercial = {
            ptac_count: parseInt(document.getElementById('bpPtacCount').value) || 0,
            vtac_count: parseInt(document.getElementById('bpVtacCount').value) || 0,
            split_count: parseInt(document.getElementById('bpSplitCount').value) || 0,
            rtu_count: parseInt(document.getElementById('bpRtuCount').value) || 0,
            metal_duct_lf: parseInt(document.getElementById('bpMetalDuctLf').value) || 0,
            stories: parseInt(document.getElementById('bpStories').value) || 4,
            exhaust_fan_count: parseInt(document.getElementById('bpExhaustFanCount').value) || 0,
            makeup_air_count: parseInt(document.getElementById('bpMakeupAirCount').value) || 0,
            sleeve_install: document.getElementById('bpSleeveInstall').value === 'yes',
        };
    }

    const btn = document.getElementById('bpCalcBtn');
    btn.disabled = true;
    btn.textContent = 'Calculating...';

    try {
        const res = await fetch('/api/schedule/backwards-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.error) { alert(data.error); return; }

        // Update main events
        allEvents = data.phases;
        renderEvents();
        renderGantt(allEvents);

        // Close modal and show results on main page
        document.getElementById('bpModal').style.display = 'none';
        displayBackwardsPlanResults(data);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Calculate Plan';
    }
}

let lastPlanData = null;  // Cache for save/export/email
let lastPlanPdfFilename = null;  // Track generated PDF

function displayBackwardsPlanResults(data) {
    const { plan, summary, weather, crew_recommendation, override_impact } = data;
    lastPlanData = data;
    lastPlanPdfFilename = null;
    document.getElementById('bpResults').style.display = '';

    // Crew Recommendation Card
    const crewCard = document.getElementById('bpCrewCard');
    const crewText = document.getElementById('bpCrewText');
    const crewSub = document.getElementById('bpCrewSubtext');
    if (crew_recommendation) {
        crewCard.style.display = '';
        crewText.textContent = crew_recommendation;
        const activeCount = plan.filter(p => p.remaining_hours > 0).length;
        crewSub.textContent = `${summary.total_remaining_hours} total hours across ${activeCount} active phases`;
    } else {
        crewCard.style.display = 'none';
    }
    // Populate crew override input with current value
    const crewOverrideInput = document.getElementById('bpResultCrewOverride');
    if (crewOverrideInput) {
        crewOverrideInput.value = summary.crew_override || '';
    }

    // Override Impact
    const impactEl = document.getElementById('bpOverrideImpact');
    if (override_impact) {
        impactEl.style.display = '';
        let impactHtml = `<strong>Override Impact:</strong> Auto-calculated <strong>${override_impact.auto_crew} men</strong> / ${override_impact.auto_days} days at ${override_impact.auto_hours_per_day}hr/day`;
        impactHtml += ` &rarr; With <strong>${override_impact.override_crew} men</strong>: ${override_impact.override_days} days`;
        if (override_impact.hours_delta > 0) {
            impactHtml += ` at <strong>${override_impact.override_hours_per_day}hr/day</strong>`;
            impactHtml += `<br><em>Extended hours required (+${override_impact.hours_delta}hr/day above standard)</em>`;
        }
        if (override_impact.days_delta > 0) {
            impactHtml += `<br><em>+${override_impact.days_delta} extra days needed</em>`;
        } else if (override_impact.days_delta < 0) {
            impactHtml += `<br><em>${Math.abs(override_impact.days_delta)} fewer days needed</em>`;
        }
        impactEl.innerHTML = impactHtml;
    } else {
        impactEl.style.display = 'none';
    }

    // Summary card
    const sc = document.getElementById('bpSummaryCard');
    const isCommercial = summary.project_type === 'commercial';
    const comm = summary.commercial || {};
    const cards = [
        { label: 'Remaining Hours', value: summary.total_remaining_hours, color: '#3B82F6' },
        { label: 'Calendar Days', value: summary.calendar_days, color: '#6B7280' },
        { label: 'Business Days', value: summary.business_days, color: '#10B981' },
        { label: 'Available Days', value: summary.available_work_days, sub: '(minus weather)', color: '#22C55E' },
        { label: 'Weather Risk Days', value: summary.weather_risk_days, color: summary.weather_risk_days > 0 ? '#EF4444' : '#9CA3AF' },
        { label: isCommercial ? 'Total Units' : 'Total Systems', value: summary.total_systems || '-', color: '#8B5CF6' },
    ];
    // Add commercial breakdown cards if applicable
    if (isCommercial && comm) {
        if (comm.ptac_count) cards.push({ label: 'PTACs', value: comm.ptac_count, color: '#0891B2' });
        if (comm.vtac_count) cards.push({ label: 'VTACs', value: comm.vtac_count, color: '#0D9488' });
        if (comm.split_count) cards.push({ label: 'Splits (Common)', value: comm.split_count, color: '#7C3AED' });
        if (comm.rtu_count) cards.push({ label: 'RTUs', value: comm.rtu_count, color: '#DC2626' });
        if (comm.metal_duct_lf) cards.push({ label: 'Metal Duct LF', value: comm.metal_duct_lf, color: '#D97706' });
    }
    sc.innerHTML = cards.map(c => `
        <div style="background:var(--white);border:1px solid var(--gray-200);border-radius:8px;padding:14px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:${c.color};">${c.value}</div>
            <div style="font-size:12px;color:var(--gray-500);margin-top:2px;">${c.label}${c.sub ? '<br>' + c.sub : ''}</div>
        </div>
    `).join('');

    // Results table
    const tbody = document.getElementById('bpResultsBody');
    tbody.innerHTML = plan.map(p => {
        const weatherBadge = p.weather_risk_days > 0
            ? `<span style="background:#FEE2E2;color:#991B1B;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${p.weather_risk_days} days</span>`
            : '<span style="color:#9CA3AF;font-size:12px;">None</span>';
        const hpdNote = (p.hours_per_day_needed && p.hours_per_day_needed > (summary.hours_per_day || 10))
            ? `<span style="color:#DC2626;font-size:11px;"> (${p.hours_per_day_needed}hr/day)</span>` : '';
        const warning = p.warning
            ? `<span style="color:#DC2626;font-size:12px;">${p.warning}</span>`
            : (p.remaining_hours <= 0 ? '<span style="color:#22C55E;font-size:12px;">Complete</span>' : '');
        return `<tr${p.remaining_hours <= 0 ? ' style="opacity:0.5;"' : ''}>
            <td><strong>${p.phase_name}</strong></td>
            <td>${p.start_date || '-'}</td>
            <td>${p.end_date || '-'}</td>
            <td>${p.work_days}</td>
            <td>${p.remaining_hours}h <small class="text-muted">of ${p.total_hours}h</small></td>
            <td><strong>${p.crew_needed}</strong>${hpdNote}</td>
            <td>${weatherBadge}</td>
            <td>${warning}</td>
        </tr>`;
    }).join('');

    // Weather risk days chips
    const riskDays = weather ? weather.filter(w => w.delay_risk) : [];
    const weatherSection = document.getElementById('bpWeatherSection');
    if (riskDays.length) {
        weatherSection.style.display = '';
        const container = document.getElementById('bpWeatherDays');
        container.innerHTML = riskDays.map(w => {
            const d = new Date(w.date + 'T00:00:00');
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const reasons = w.risk_reasons.join(', ');
            const icon = w.risk_reasons.some(r => r.includes('rain')) ? '&#x1F327;'
                : w.risk_reasons.some(r => r.includes('freeze')) ? '&#x2744;'
                : w.risk_reasons.some(r => r.includes('heat')) ? '&#x1F321;'
                : w.risk_reasons.some(r => r.includes('wind')) ? '&#x1F4A8;' : '&#x26A0;';
            const sourceTag = w.source === 'historical_estimate' ? ' <small>(est.)</small>' : '';
            return `<div class="weather-risk-chip" title="${reasons}\nHigh: ${w.high}°F Low: ${w.low}°F\nPrecip: ${w.precip}in Wind: ${w.wind_gust}mph">
                <span>${icon}</span> ${dayName}${sourceTag}
                <small style="display:block;color:#92400E;font-size:10px;">${reasons}</small>
            </div>`;
        }).join('');
    } else {
        weatherSection.style.display = 'none';
    }

    // Detailed Benchmarks
    const benchmarks = data.benchmarks || [];
    const bmSection = document.getElementById('bpBenchmarks');
    const bmContent = document.getElementById('bpBenchmarksContent');
    if (benchmarks.length > 0) {
        bmSection.style.display = '';
        let bmHtml = '';
        benchmarks.forEach((bm, bi) => {
            const totalSys = bm.total_systems || 0;
            const unitLabel = totalSys > 0 ? `${totalSys} total systems` : '';

            // Phase header card
            const existPct = bm.existing_pct_complete || 0;
            bmHtml += `<div class="card" style="margin-bottom:20px;border-radius:10px;overflow:hidden;border:2px solid var(--primary);">`;
            bmHtml += `<div style="background:linear-gradient(135deg,#1a5276,#2980b9);color:#fff;padding:16px 20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div>
                        <h3 style="margin:0;font-size:17px;font-weight:700;">${bm.phase_name}</h3>
                        <div style="font-size:13px;opacity:0.85;margin-top:4px;">${bm.start_date} &rarr; ${bm.end_date} &bull; ${bm.work_days} work days &bull; ${bm.crew_needed} crew</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:22px;font-weight:700;">${bm.remaining_hours}h</div>
                        <div style="font-size:11px;opacity:0.75;">remaining of ${bm.total_hours}h</div>
                    </div>
                </div>
                ${existPct > 0 ? `<div style="margin-top:10px;">
                    <div style="display:flex;justify-content:space-between;font-size:12px;opacity:0.85;margin-bottom:4px;">
                        <span>Current Progress: ${existPct}% complete</span>
                        <span>Remaining: ${100 - existPct}%</span>
                    </div>
                    <div style="background:rgba(255,255,255,0.2);border-radius:6px;height:8px;overflow:hidden;">
                        <div style="background:#22C55E;height:100%;width:${existPct}%;border-radius:6px;"></div>
                    </div>
                </div>` : ''}
            </div>`;

            // Daily production targets
            bmHtml += `<div style="padding:16px 20px;background:#EFF6FF;border-bottom:1px solid var(--gray-200);">
                <h4 style="margin:0 0 8px;font-size:14px;color:var(--primary);">Daily Production Targets</h4>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
                    <div style="background:#fff;border-radius:6px;padding:10px 14px;border-left:4px solid #3B82F6;">
                        <div style="font-size:20px;font-weight:700;color:#1E40AF;">${bm.units_per_day}</div>
                        <div style="font-size:11px;color:var(--gray-500);">Units per day</div>
                    </div>
                    <div style="background:#fff;border-radius:6px;padding:10px 14px;border-left:4px solid #10B981;">
                        <div style="font-size:20px;font-weight:700;color:#047857;">${bm.daily_target_hours || (bm.crew_needed * bm.hours_per_day)}h</div>
                        <div style="font-size:11px;color:var(--gray-500);">Man-hours per day (${bm.crew_needed} x ${bm.hours_per_day}hr)</div>
                    </div>
                    <div style="background:#fff;border-radius:6px;padding:10px 14px;border-left:4px solid #8B5CF6;">
                        <div style="font-size:20px;font-weight:700;color:#6D28D9;">${bm.hours_per_day}hr</div>
                        <div style="font-size:11px;color:var(--gray-500);">Hours per day per man</div>
                    </div>
                </div>
            </div>`;

            // Early warnings
            if (bm.early_warnings && bm.early_warnings.length) {
                bmHtml += `<div style="padding:14px 20px;background:#FEF2F2;border-bottom:1px solid var(--gray-200);">
                    <h4 style="margin:0 0 8px;font-size:14px;color:#991B1B;">Early Warning Signs</h4>
                    <ul style="margin:0;padding:0 0 0 18px;font-size:13px;color:#7F1D1D;line-height:1.8;">
                        ${bm.early_warnings.map(w => `<li>${w}</li>`).join('')}
                    </ul>
                </div>`;
            }

            // Tasks for this phase
            if (bm.tasks_overview && bm.tasks_overview.length) {
                bmHtml += `<div style="padding:14px 20px;background:#F0FDF4;border-bottom:1px solid var(--gray-200);">
                    <h4 style="margin:0 0 8px;font-size:14px;color:#166534;">Phase Deliverables Checklist</h4>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:13px;color:#14532D;">
                        ${bm.tasks_overview.map((t, ti) => `<div style="display:flex;gap:6px;align-items:flex-start;"><span style="color:#22C55E;font-weight:700;min-width:16px;">${ti + 1}.</span> ${t}</div>`).join('')}
                    </div>
                </div>`;
            }

            // Weekly breakdown
            if (bm.weeks && bm.weeks.length) {
                bmHtml += `<div style="padding:16px 20px;">
                    <h4 style="margin:0 0 12px;font-size:14px;color:var(--gray-700);">Weekly Breakdown</h4>`;

                bm.weeks.forEach(wk => {
                    const statusColors = {early:'#3B82F6',mid_early:'#10B981',mid_late:'#F59E0B',final:'#EF4444'};
                    const statusLabels = {early:'Getting Started',mid_early:'Building Momentum',mid_late:'Pushing Through',final:'Final Push'};
                    const sc = statusColors[wk.checkpoint_status] || '#6B7280';
                    const sl = statusLabels[wk.checkpoint_status] || '';

                    bmHtml += `<div style="border:1px solid var(--gray-200);border-radius:8px;margin-bottom:12px;overflow:hidden;">`;
                    // Week header
                    bmHtml += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--gray-50);border-bottom:1px solid var(--gray-200);cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <strong style="font-size:14px;">Week ${wk.week_num}</strong>
                            <span style="font-size:12px;color:var(--gray-500);">${wk.start_date} — ${wk.end_date}</span>
                            <span style="background:${sc}15;color:${sc};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${sl}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:12px;">
                            <span style="font-size:13px;font-weight:600;color:${sc};">${wk.target_pct_complete}% target</span>
                            ${totalSys > 0 ? `<span style="font-size:12px;color:var(--gray-500);">${wk.target_units_complete} of ${totalSys} units</span>` : ''}
                        </div>
                    </div>`;

                    // Week detail (collapsible)
                    bmHtml += `<div style="padding:12px 14px;">`;

                    // Week tasks
                    if (wk.tasks && wk.tasks.length) {
                        bmHtml += `<div style="margin-bottom:10px;">
                            <div style="font-size:12px;font-weight:600;color:var(--gray-500);margin-bottom:4px;">THIS WEEK'S FOCUS:</div>
                            <ul style="margin:0;padding:0 0 0 16px;font-size:13px;line-height:1.7;">
                                ${wk.tasks.map(t => `<li>${t}</li>`).join('')}
                            </ul>
                        </div>`;
                    }

                    // Daily grid
                    bmHtml += `<div style="font-size:12px;font-weight:600;color:var(--gray-500);margin-bottom:4px;">DAILY SCHEDULE:</div>`;
                    bmHtml += `<div style="display:grid;gap:4px;">`;
                    wk.daily_plan.forEach(day => {
                        const dayBg = day.weather_risk ? '#FEF2F2' : (day.is_work_day ? '#F0FDF4' : '#F9FAFB');
                        const dayBorder = day.weather_risk ? '#FECACA' : (day.is_work_day ? '#BBF7D0' : '#E5E7EB');
                        const dayIcon = day.weather_risk ? '&#x26A0;' : (day.is_work_day ? '&#x2705;' : '');
                        const wi = day.weather_info || {};
                        const weatherNote = day.weather_risk && wi.risk_reasons ? wi.risk_reasons.join(', ') : '';
                        const tempNote = wi.high != null ? `${wi.high || '?'}°/${wi.low || '?'}°F` : '';

                        bmHtml += `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:${dayBg};border:1px solid ${dayBorder};border-radius:4px;font-size:12px;">
                            <span style="min-width:16px;">${dayIcon}</span>
                            <strong style="min-width:80px;">${day.day_name}</strong>
                            <span style="color:var(--gray-500);min-width:80px;">${day.date}</span>`;
                        if (day.is_work_day) {
                            bmHtml += `<span style="color:#166534;">Target: ${wk.daily_target_units} units &bull; ${wk.daily_target_hours}hrs man-hours</span>`;
                        } else if (day.weather_risk) {
                            bmHtml += `<span style="color:#991B1B;">Weather risk: ${weatherNote}</span>`;
                        }
                        if (tempNote) {
                            bmHtml += `<span style="color:var(--gray-400);margin-left:auto;">${tempNote}</span>`;
                        }
                        bmHtml += `</div>`;
                    });
                    bmHtml += `</div>`;

                    // Benchmark checkpoint
                    bmHtml += `<div style="margin-top:10px;padding:8px 12px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;font-size:12px;color:#92400E;">
                        <strong>End-of-Week Checkpoint:</strong> ${wk.target_pct_complete}% complete${totalSys > 0 ? ` (${wk.target_units_complete} units done)` : ''} &bull; ${wk.target_hours_burned}h of ${bm.remaining_hours}h burned<br>
                        <span style="color:#DC2626;">${wk.behind_warning}</span>
                    </div>`;

                    bmHtml += `</div></div>`;  // close week detail + week container
                });

                bmHtml += `</div>`;  // close weekly breakdown padding div
            }

            // Phase milestone
            bmHtml += `<div style="padding:12px 20px;background:var(--gray-50);border-top:1px solid var(--gray-200);font-size:13px;">
                <strong style="color:var(--primary);">Phase Milestone:</strong> ${bm.key_milestone}
            </div>`;

            bmHtml += `</div>`;  // close phase card
        });

        bmContent.innerHTML = bmHtml;
    } else {
        bmSection.style.display = 'none';
    }

    // Hide saved plans on new calculation
    document.getElementById('bpSavedPlans').style.display = 'none';

    // Scroll to results
    setTimeout(() => {
        document.getElementById('bpResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

/* ─── Recalculate with adjusted crew size ──────────── */

async function recalcWithCrew() {
    if (!lastPlanData) return alert('Run a backwards plan first.');
    const crewInput = document.getElementById('bpResultCrewOverride');
    const crewVal = crewInput.value ? parseInt(crewInput.value) : null;

    const btn = document.getElementById('bpRecalcBtn');
    btn.disabled = true;
    btn.textContent = '...';

    try {
        const payload = {
            job_id: window.SCHEDULE_JOB_ID,
            deadline_date: lastPlanData.summary.deadline,
            hours_per_day: lastPlanData.summary.hours_per_day,
            crew_override: crewVal,
            project_type: lastPlanData.summary.project_type || 'apartment',
            commercial: lastPlanData.summary.commercial || null,
        };
        const res = await fetch('/api/schedule/backwards-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.error) { alert(data.error); return; }

        allEvents = data.phases;
        renderEvents();
        renderGantt(allEvents);
        displayBackwardsPlanResults(data);
    } catch (err) {
        alert('Recalculation failed: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Recalculate';
    }
}

/* ─── Apply Plan Dates to Schedule ───────────────────── */

async function applyPlanDates() {
    if (!lastPlanData) return alert('Run a backwards plan first.');
    if (!confirm('This will overwrite the schedule dates for all phases with the calculated plan dates. Continue?')) return;

    const btn = document.getElementById('bpApplyBtn');
    btn.disabled = true;
    btn.textContent = 'Applying...';

    try {
        const res = await fetch('/api/schedule/backwards-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_id: window.SCHEDULE_JOB_ID,
                deadline_date: lastPlanData.summary.deadline,
                hours_per_day: lastPlanData.summary.hours_per_day,
                crew_override: lastPlanData.summary.crew_override,
                project_type: lastPlanData.summary.project_type || 'apartment',
                commercial: lastPlanData.summary.commercial || null,
                apply_dates: true,
            })
        });
        const data = await res.json();
        if (data.error) { alert(data.error); return; }

        // Update main events display
        allEvents = data.phases;
        renderEvents();
        renderGantt(allEvents);

        btn.textContent = 'Dates Applied!';
        setTimeout(() => { btn.textContent = 'Apply Dates to Schedule'; btn.disabled = false; }, 2000);
    } catch (err) {
        alert('Failed to apply dates: ' + err.message);
        btn.textContent = 'Apply Dates to Schedule';
        btn.disabled = false;
    }
}

/* ─── Save / Print / Export / Email ─────────────────────── */

async function savePlan() {
    if (!lastPlanData) return alert('Run a backwards plan first.');
    const name = prompt('Plan name:', `Plan ${new Date().toLocaleDateString()}`);
    if (name === null) return;

    const btn = document.getElementById('bpSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const res = await fetch('/api/schedule/backwards-plan/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_id: window.SCHEDULE_JOB_ID,
                plan_name: name,
                deadline_date: lastPlanData.summary.deadline,
                hours_per_day: lastPlanData.summary.hours_per_day,
                crew_override: lastPlanData.summary.crew_override,
                plan: lastPlanData.plan,
                summary: { ...lastPlanData.summary, crew_recommendation: lastPlanData.crew_recommendation, override_impact: lastPlanData.override_impact },
                weather: lastPlanData.weather,
            })
        });
        const data = await res.json();
        if (data.error) return alert(data.error);
        btn.textContent = 'Saved!';
        setTimeout(() => { btn.textContent = 'Save Plan'; }, 2000);
        // Refresh saved plans list if visible
        const savedSection = document.getElementById('bpSavedPlans');
        if (savedSection && savedSection.style.display !== 'none') {
            loadSavedPlans(true);
        }
    } catch (err) {
        alert('Failed to save: ' + err.message);
    } finally {
        btn.disabled = false;
    }
}

function printPlan() {
    window.print();
}

async function exportPlanPDF() {
    if (!lastPlanData) return alert('Run a backwards plan first.');
    const btn = document.getElementById('bpExportBtn');
    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
        const payload = {
            job_id: window.SCHEDULE_JOB_ID,
            plan: lastPlanData.plan || [],
            summary: lastPlanData.summary || {},
            crew_recommendation: lastPlanData.crew_recommendation || '',
            override_impact: lastPlanData.override_impact || null,
            weather: lastPlanData.weather || [],
            benchmarks: lastPlanData.benchmarks || [],
        };
        const res = await fetch('/api/schedule/backwards-plan/generate-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            alert(errData.error || `PDF generation failed (HTTP ${res.status})`);
            return;
        }
        const data = await res.json();
        if (data.error) { alert(data.error); return; }

        lastPlanPdfFilename = data.filename;
        // Download PDF via fetch+blob to avoid popup blockers
        const pdfRes = await fetch(data.path);
        if (pdfRes.ok) {
            const blob = await pdfRes.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = data.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            // Fallback: open in new tab
            window.open(data.path, '_blank');
        }
        btn.textContent = 'PDF Downloaded!';
        setTimeout(() => { btn.textContent = 'Export PDF'; }, 2000);
    } catch (err) {
        alert('PDF generation failed: ' + err.message);
        btn.textContent = 'Export PDF';
    } finally {
        btn.disabled = false;
    }
}

function showEmailPlanModal() {
    if (!lastPlanData) return alert('Run a backwards plan first.');
    // Pre-fill subject with job name
    const job = schedJobs.find(j => j.id === window.SCHEDULE_JOB_ID);
    const jobName = job ? job.name : 'Job';
    document.getElementById('epSubject').value = `Schedule Plan - ${jobName}`;
    document.getElementById('epRecipients').value = '';
    document.getElementById('epBody').value = `Please find the attached schedule plan for ${jobName}.\n\nDeadline: ${lastPlanData.summary.deadline}\nCrew: ${lastPlanData.crew_recommendation}`;
    document.getElementById('emailPlanModal').style.display = 'flex';
}

async function sendPlanEmail(e) {
    e.preventDefault();
    const btn = document.getElementById('epSendBtn');

    // Generate PDF first if not already done
    if (!lastPlanPdfFilename) {
        btn.disabled = true;
        btn.textContent = 'Generating PDF...';
        try {
            const pdfRes = await fetch('/api/schedule/backwards-plan/generate-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    job_id: window.SCHEDULE_JOB_ID,
                    plan: lastPlanData.plan,
                    summary: lastPlanData.summary,
                    crew_recommendation: lastPlanData.crew_recommendation,
                    override_impact: lastPlanData.override_impact,
                    weather: lastPlanData.weather,
                    benchmarks: lastPlanData.benchmarks || [],
                })
            });
            const pdfData = await pdfRes.json();
            if (pdfData.error) { alert(pdfData.error); btn.disabled = false; btn.textContent = 'Send Email'; return; }
            lastPlanPdfFilename = pdfData.filename;
        } catch (err) {
            alert('PDF generation failed: ' + err.message);
            btn.disabled = false;
            btn.textContent = 'Send Email';
            return;
        }
    }

    btn.disabled = true;
    btn.textContent = 'Sending...';

    const recipients = document.getElementById('epRecipients').value.split(',').map(s => s.trim()).filter(Boolean);
    const subject = document.getElementById('epSubject').value;
    const body = document.getElementById('epBody').value;

    try {
        const res = await fetch('/api/schedule/backwards-plan/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipients,
                subject,
                body,
                pdf_filename: lastPlanPdfFilename,
            })
        });
        const data = await res.json();
        if (data.error) return alert(data.error);
        alert('Email sent to: ' + data.sent_to.join(', '));
        document.getElementById('emailPlanModal').style.display = 'none';
    } catch (err) {
        alert('Email failed: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Send Email';
    }
}

async function loadSavedPlans(forceShow) {
    const section = document.getElementById('bpSavedPlans');
    const list = document.getElementById('bpSavedPlansList');

    if (!forceShow && section.style.display !== 'none') {
        section.style.display = 'none';
        return;
    }

    list.innerHTML = '<p class="text-muted">Loading...</p>';
    section.style.display = '';

    const isOwner = window.SCHEDULE_USER_ROLE === 'owner' || window.SCHEDULE_USER_ROLE === 'admin';

    try {
        const res = await fetch(`/api/schedule/plans?job_id=${window.SCHEDULE_JOB_ID}`);
        const plans = await res.json();
        if (!plans.length) {
            list.innerHTML = '<p class="text-muted" style="font-size:13px;">No saved plans yet.</p>';
            return;
        }
        list.innerHTML = plans.map(p => {
            const date = new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
            const s = p.summary_data || {};
            const deleteBtn = isOwner ? `<button class="btn btn-small" style="background:#EF4444;color:#fff;padding:4px 10px;font-size:11px;" onclick="event.stopPropagation();deleteSavedPlan(${p.id},'${(p.plan_name || '').replace(/'/g, "\\'")}')" title="Delete plan (owner only)">Delete</button>` : '';
            return `<div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer;" onclick="restoreSavedPlan(${p.id})">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <strong style="font-size:14px;">${p.plan_name}</strong>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <small class="text-muted">${date}</small>
                        ${deleteBtn}
                    </div>
                </div>
                <div style="font-size:12px;color:var(--gray-500);margin-top:4px;">
                    Deadline: ${p.deadline_date} | ${s.total_remaining_hours || '?'}hrs | ${s.available_work_days || '?'} work days
                    ${p.crew_override ? ' | Crew: ' + p.crew_override : ''}
                    ${p.created_by_name ? ' | By: ' + p.created_by_name : ''}
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        list.innerHTML = `<p style="color:red;font-size:13px;">Failed to load: ${err.message}</p>`;
    }
}

async function deleteSavedPlan(planId, planName) {
    if (!confirm(`Delete saved plan "${planName}"? This cannot be undone.`)) return;
    try {
        const res = await fetch(`/api/schedule/plans/${planId}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert('Failed to delete plan: ' + (data.error || res.statusText));
            return;
        }
        loadSavedPlans(true);
    } catch (err) {
        alert('Failed to delete plan: ' + err.message);
    }
}

async function restoreSavedPlan(planId) {
    try {
        const res = await fetch(`/api/schedule/plans?job_id=${window.SCHEDULE_JOB_ID}`);
        const plans = await res.json();
        const plan = plans.find(p => p.id === planId);
        if (!plan) return alert('Plan not found');

        // Reconstruct display data
        const displayData = {
            plan: plan.plan_data,
            summary: plan.summary_data,
            weather: plan.weather_data,
            crew_recommendation: plan.summary_data.crew_recommendation || `Saved plan (${plan.hours_per_day}hr days)`,
            override_impact: plan.summary_data.override_impact || null,
        };
        displayBackwardsPlanResults(displayData);
        document.getElementById('bpSavedPlans').style.display = 'none';
    } catch (err) {
        alert('Failed to load plan: ' + err.message);
    }
}

/* ─── Gantt Chart ────────────────────────────────────────── */

function renderGantt(events) {
    const wrapper = document.getElementById('ganttWrapper');
    const chart = document.getElementById('ganttChart');
    const svgEl = document.getElementById('ganttArrows');
    if (!wrapper || !chart) return;

    // Filter events that have dates
    const dated = events.filter(e => e.start_date && e.end_date);
    if (!dated.length) {
        wrapper.style.display = 'none';
        return;
    }
    wrapper.style.display = '';

    // Calculate date range
    let minDate = null, maxDate = null;
    dated.forEach(e => {
        const s = new Date(e.start_date + 'T00:00:00');
        const ed = new Date(e.end_date + 'T00:00:00');
        if (!minDate || s < minDate) minDate = s;
        if (!maxDate || ed > maxDate) maxDate = ed;
    });

    // Ensure minimum 14 day range and add padding
    const pad = 3;
    minDate = new Date(minDate.getTime() - pad * 86400000);
    maxDate = new Date(maxDate.getTime() + pad * 86400000);
    const diffMs = maxDate - minDate;
    const totalDays = Math.max(14, Math.ceil(diffMs / 86400000));
    maxDate = new Date(minDate.getTime() + totalDays * 86400000);

    const dayWidth = 36;
    const rowHeight = 40;
    const headerHeight = 50;
    const labelWidth = 160;
    const chartWidth = labelWidth + totalDays * dayWidth;

    // Build critical path
    const criticalIds = computeCriticalPath(events);

    // Build HTML
    let html = '';

    // Header row - months + days
    html += `<div class="gantt-header" style="width:${chartWidth}px;">`;
    html += `<div class="gantt-label-col" style="width:${labelWidth}px;">Phase</div>`;
    html += `<div class="gantt-days-header" style="width:${totalDays * dayWidth}px;">`;

    // Month groups
    let monthHtml = '';
    let dayHtml = '';
    let currentMonth = '';
    let monthStartCol = 0;
    for (let d = 0; d < totalDays; d++) {
        const date = new Date(minDate.getTime() + d * 86400000);
        const monthKey = date.toLocaleString('default', { month: 'short', year: '2-digit' });
        const dayNum = date.getDate();
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;

        if (monthKey !== currentMonth) {
            if (currentMonth) {
                monthHtml += `<div class="gantt-month" style="width:${(d - monthStartCol) * dayWidth}px;">${currentMonth}</div>`;
            }
            currentMonth = monthKey;
            monthStartCol = d;
        }
        dayHtml += `<div class="gantt-day ${isWeekend ? 'weekend' : ''}" style="width:${dayWidth}px;">${dayNum}</div>`;
    }
    // Close last month
    monthHtml += `<div class="gantt-month" style="width:${(totalDays - monthStartCol) * dayWidth}px;">${currentMonth}</div>`;

    html += `<div class="gantt-months">${monthHtml}</div>`;
    html += `<div class="gantt-day-numbers">${dayHtml}</div>`;
    html += `</div></div>`;

    // Rows
    html += `<div class="gantt-body" style="width:${chartWidth}px;">`;

    // Grid columns (day lines)
    html += `<div class="gantt-grid" style="left:${labelWidth}px;width:${totalDays * dayWidth}px;height:${dated.length * rowHeight}px;">`;
    for (let d = 0; d < totalDays; d++) {
        const date = new Date(minDate.getTime() + d * 86400000);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        html += `<div class="gantt-grid-line ${isWeekend ? 'weekend' : ''}" style="left:${d * dayWidth}px;height:100%;"></div>`;
    }
    // Today line
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOffset = (today - minDate) / 86400000;
    if (todayOffset >= 0 && todayOffset <= totalDays) {
        html += `<div class="gantt-today" style="left:${todayOffset * dayWidth}px;height:100%;"></div>`;
    }
    html += `</div>`;

    // Phase rows
    dated.forEach((e, i) => {
        const startD = new Date(e.start_date + 'T00:00:00');
        const endD = new Date(e.end_date + 'T00:00:00');
        const startOffset = (startD - minDate) / 86400000;
        const duration = Math.max(1, (endD - startD) / 86400000 + 1);
        const pct = e.pct_complete || 0;

        const statusColors = {
            'Pending': '#9CA3AF',
            'In Progress': '#3B82F6',
            'Complete': '#22C55E',
            'Cancelled': '#EF4444'
        };
        const color = statusColors[e.status] || '#9CA3AF';
        const isCritical = criticalIds.has(e.id);
        const user = schedUsers.find(u => u.id === e.assigned_to);
        const assignedName = user ? user.display_name : 'Unassigned';
        const barWidth = duration * dayWidth - 4;

        html += `<div class="gantt-row" style="height:${rowHeight}px;" data-event-id="${e.id}">`;
        html += `<div class="gantt-label-col" style="width:${labelWidth}px;" title="${e.phase_name}">${e.phase_name}</div>`;
        html += `<div class="gantt-bar-area" style="width:${totalDays * dayWidth}px;">`;
        html += `<div class="gantt-bar ${isCritical ? 'critical' : ''}" style="left:${startOffset * dayWidth}px;width:${barWidth}px;background:${color};overflow:hidden;"
                      title="${e.phase_name}\n${e.start_date} to ${e.end_date}\n${e.estimated_hours || 0}h, ${e.crew_size || 1} crew\n${assignedName}\nStatus: ${e.status}\n${pct}% complete${isCritical ? '\nCRITICAL PATH' : ''}">
                    <div class="gantt-bar-progress" style="width:${pct}%;"></div>
                    <span class="gantt-bar-label">${e.phase_name}${pct > 0 && pct < 100 ? ' (' + pct + '%)' : ''}</span>
                 </div>`;
        html += `</div></div>`;
    });

    html += `</div>`;
    chart.innerHTML = html;

    // Draw dependency arrows with SVG
    renderGanttArrows(dated, minDate, dayWidth, rowHeight, headerHeight, labelWidth, svgEl);
}

function renderGanttArrows(events, minDate, dayWidth, rowHeight, headerHeight, labelWidth, svgEl) {
    const byId = {};
    events.forEach((e, i) => { byId[e.id] = { ...e, index: i }; });

    let svgContent = '';
    svgContent += '<defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#666"/></marker></defs>';

    events.forEach(e => {
        if (!e.depends_on || !byId[e.depends_on]) return;
        const pred = byId[e.depends_on];
        const curr = byId[e.id];

        // Predecessor bar end
        const predEnd = new Date(pred.end_date + 'T00:00:00');
        const predDuration = Math.max(1, (predEnd - new Date(pred.start_date + 'T00:00:00')) / 86400000 + 1);
        const predX = labelWidth + ((predEnd - minDate) / 86400000 + 1) * dayWidth;
        const predY = headerHeight + pred.index * rowHeight + rowHeight / 2;

        // Current bar start
        const currStart = new Date(e.start_date + 'T00:00:00');
        const currX = labelWidth + ((currStart - minDate) / 86400000) * dayWidth;
        const currY = headerHeight + curr.index * rowHeight + rowHeight / 2;

        // Draw path with a right-angle connector
        const midX = predX + 8;
        svgContent += `<path d="M${predX},${predY} L${midX},${predY} L${midX},${currY} L${currX},${currY}" fill="none" stroke="#666" stroke-width="1.5" marker-end="url(#arrowhead)"/>`;
    });

    svgEl.innerHTML = svgContent;
    // Size SVG to match chart
    const chartEl = document.getElementById('ganttChart');
    if (chartEl) {
        svgEl.style.width = chartEl.scrollWidth + 'px';
        svgEl.style.height = chartEl.scrollHeight + 'px';
    }
}

/* ─── Critical Path Algorithm ────────────────────────────── */

function computeCriticalPath(events) {
    const criticalIds = new Set();
    const dated = events.filter(e => e.start_date && e.end_date);
    if (dated.length < 2) return criticalIds;

    const byId = {};
    dated.forEach(e => { byId[e.id] = e; });

    // Build adjacency (successors map)
    const successors = {};
    const predecessors = {};
    dated.forEach(e => {
        successors[e.id] = [];
        predecessors[e.id] = [];
    });
    dated.forEach(e => {
        if (e.depends_on && byId[e.depends_on]) {
            successors[e.depends_on].push(e.id);
            predecessors[e.id].push(e.depends_on);
        }
    });

    // Calculate durations in days
    const duration = {};
    dated.forEach(e => {
        const s = new Date(e.start_date + 'T00:00:00');
        const ed = new Date(e.end_date + 'T00:00:00');
        duration[e.id] = Math.max(1, (ed - s) / 86400000 + 1);
    });

    // Forward pass: earliest start / earliest finish
    const ES = {}, EF = {};
    // Topological order
    const visited = new Set();
    const topoOrder = [];
    function dfs(id) {
        if (visited.has(id)) return;
        visited.add(id);
        predecessors[id].forEach(pid => dfs(pid));
        topoOrder.push(id);
    }
    dated.forEach(e => dfs(e.id));

    topoOrder.forEach(id => {
        const preds = predecessors[id];
        if (!preds.length) {
            ES[id] = 0;
        } else {
            ES[id] = Math.max(...preds.map(p => EF[p]));
        }
        EF[id] = ES[id] + duration[id];
    });

    // Backward pass: latest start / latest finish
    const LS = {}, LF = {};
    const projectEnd = Math.max(...Object.values(EF));
    const reverseOrder = [...topoOrder].reverse();

    reverseOrder.forEach(id => {
        const succs = successors[id];
        if (!succs.length) {
            LF[id] = projectEnd;
        } else {
            LF[id] = Math.min(...succs.map(s => LS[s]));
        }
        LS[id] = LF[id] - duration[id];
    });

    // Float = LS - ES; critical path where float === 0
    dated.forEach(e => {
        const float = LS[e.id] - ES[e.id];
        if (Math.abs(float) < 0.001) {
            criticalIds.add(e.id);
        }
    });

    return criticalIds;
}
