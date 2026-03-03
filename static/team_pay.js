/* Team Pay (Internal Progress Payroll) JS */
function fmt(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pct(n) { return Number(n || 0).toFixed(1) + '%'; }

// ─── Page Router ─────────────────────────────────────────────
if (window.TP_PAGE === 'list') initList();
else if (window.TP_PAGE === 'job') initJob();
else if (window.TP_PAGE === 'period') initPeriod();

// ═══════════════════════════════════════════════════════════════
// LIST PAGE
// ═══════════════════════════════════════════════════════════════
let allJobs = [];
async function initList() {
    const res = await fetch('/api/jobs/list');
    allJobs = await res.json();
    loadSchedules();
}

async function loadSchedules() {
    const res = await fetch('/api/team-pay/schedules');
    const schedules = await res.json();
    const tbody = document.getElementById('schedulesBody');
    if (!schedules.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No team pay schedules yet. Click "+ New Schedule" to get started.</td></tr>';
        return;
    }
    tbody.innerHTML = schedules.map(s => {
        const totalPaid = s.total_paid || 0;
        const scheduledTotal = s.scheduled_total || 0;
        return `<tr>
            <td><a href="/team-pay/job/${s.id}" class="link">${s.job_name || 'Job #' + s.job_id}</a></td>
            <td>${fmt(s.total_job_value)}</td>
            <td>${s.member_count || 0}</td>
            <td>${fmt(scheduledTotal)}</td>
            <td>${fmt(totalPaid)}</td>
            <td>${s.period_count || 0}</td>
            <td>
                <a href="/team-pay/job/${s.id}" class="btn btn-small btn-secondary">View</a>
                <button class="btn btn-small btn-danger" onclick="deleteSchedule(${s.id})">Delete</button>
            </td>
        </tr>`;
    }).join('');
}

function showNewSchedule() {
    const sel = document.getElementById('nsJob');
    sel.innerHTML = '<option value="">Select a job...</option>';
    allJobs.forEach(j => {
        const o = document.createElement('option');
        o.value = j.id; o.textContent = j.name; sel.appendChild(o);
    });
    document.getElementById('nsTotalValue').value = '';
    document.getElementById('nsNotes').value = '';
    document.getElementById('scheduleModal').style.display = 'flex';
}

async function saveSchedule(e) {
    e.preventDefault();
    const res = await fetch('/api/team-pay/schedules', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            job_id: parseInt(document.getElementById('nsJob').value),
            total_job_value: parseFloat(document.getElementById('nsTotalValue').value) || 0,
            notes: document.getElementById('nsNotes').value
        })
    });
    if (!res.ok) { const err = await res.json(); alert(err.error || 'Error creating schedule'); return; }
    document.getElementById('scheduleModal').style.display = 'none';
    loadSchedules();
}

async function deleteSchedule(id) {
    if (!confirm('Delete this team pay schedule and all its data?')) return;
    await fetch('/api/team-pay/schedules/' + id, { method: 'DELETE' });
    loadSchedules();
}

// ═══════════════════════════════════════════════════════════════
// JOB PAGE (schedule detail — members + periods)
// ═══════════════════════════════════════════════════════════════
let scheduleData = null;
let membersData = [];
let periodsData = [];
let allUsers = [];

async function initJob() {
    await Promise.all([loadScheduleDetail(), loadAllUsers()]);
    await Promise.all([loadMembers(), loadPeriods()]);
}

async function loadScheduleDetail() {
    const res = await fetch('/api/team-pay/schedules/' + TP_SCHEDULE_ID);
    scheduleData = await res.json();
    document.getElementById('jobTitle').textContent = (scheduleData.job_name || 'Job') + ' — Team Pay';
    document.getElementById('scheduleInfo').innerHTML = `
        <div class="detail-row"><span class="detail-label">Job:</span><span>${scheduleData.job_name || '-'}</span></div>
        <div class="detail-row"><span class="detail-label">Total Job Value:</span><span>${fmt(scheduleData.total_job_value)}</span></div>
        <div class="detail-row"><span class="detail-label">Notes:</span><span>${scheduleData.notes || '-'}</span></div>`;
}

async function loadAllUsers() {
    const res = await fetch('/api/team-pay/dashboard');
    // Fallback: load from admin endpoint
    try {
        const res2 = await fetch('/api/admin/users');
        if (res2.ok) { allUsers = await res2.json(); return; }
    } catch(e) {}
    allUsers = [];
}

async function loadMembers() {
    const res = await fetch('/api/team-pay/schedules/' + TP_SCHEDULE_ID + '/members');
    membersData = await res.json();
    const tbody = document.getElementById('membersBody');
    if (!membersData.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No members added. Click "+ Add Member" or use "Quick Setup".</td></tr>';
        document.getElementById('membersFoot').innerHTML = '';
        return;
    }
    let totalScheduled = 0, totalPaid = 0;
    tbody.innerHTML = membersData.map((m, i) => {
        const paid = m.total_paid || 0;
        const balance = m.scheduled_amount - paid;
        const pctVal = m.scheduled_amount > 0 ? (paid / m.scheduled_amount * 100) : 0;
        totalScheduled += m.scheduled_amount;
        totalPaid += paid;
        return `<tr>
            <td>${i + 1}</td>
            <td>${m.display_name || m.username || 'User #' + m.user_id}</td>
            <td>${fmt(m.scheduled_amount)}</td>
            <td>${fmt(paid)}</td>
            <td>${pct(pctVal)}</td>
            <td>${fmt(balance)}</td>
            <td>
                <button class="btn btn-small btn-secondary" onclick="editMember(${m.id}, ${m.scheduled_amount})">Edit</button>
                <button class="btn btn-small btn-danger" onclick="removeMember(${m.id})">Remove</button>
            </td>
        </tr>`;
    }).join('');
    const totalBalance = totalScheduled - totalPaid;
    const totalPct = totalScheduled > 0 ? (totalPaid / totalScheduled * 100) : 0;
    document.getElementById('membersFoot').innerHTML = `<tr style="font-weight:bold;">
        <td></td><td>TOTALS</td><td>${fmt(totalScheduled)}</td><td>${fmt(totalPaid)}</td>
        <td>${pct(totalPct)}</td><td>${fmt(totalBalance)}</td><td></td></tr>`;
}

async function loadPeriods() {
    const res = await fetch('/api/team-pay/schedules/' + TP_SCHEDULE_ID + '/periods');
    periodsData = await res.json();
    const tbody = document.getElementById('periodsBody');
    if (!periodsData.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No payment periods yet.</td></tr>';
        return;
    }
    tbody.innerHTML = periodsData.map(p => {
        const statusClass = p.status === 'Finalized' ? 'phase-approved' : 'phase-draft';
        return `<tr>
            <td><a href="/team-pay/period/${p.id}" class="link">Period ${p.period_number}</a></td>
            <td>${p.payment_date || '-'}</td>
            <td>${fmt(p.source_amount)}</td>
            <td>${fmt(p.distributed_total)}</td>
            <td><span class="phase-status ${statusClass}">${p.status}</span></td>
            <td>
                <a href="/team-pay/period/${p.id}" class="btn btn-small btn-secondary">View</a>
                ${p.status === 'Draft' ? `<button class="btn btn-small btn-danger" onclick="deletePeriod(${p.id})">Delete</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

function showAddMember() {
    document.getElementById('memberModalTitle').textContent = 'Add Team Member';
    document.getElementById('amMemberId').value = '';
    document.getElementById('amAmount').value = '';
    document.getElementById('amUserGroup').style.display = '';
    const sel = document.getElementById('amUser');
    sel.innerHTML = '<option value="">Select member...</option>';
    const existingIds = membersData.map(m => m.user_id);
    allUsers.forEach(u => {
        if (!existingIds.includes(u.id)) {
            const o = document.createElement('option');
            o.value = u.id; o.textContent = u.display_name || u.username; sel.appendChild(o);
        }
    });
    document.getElementById('memberModal').style.display = 'flex';
}

function editMember(mid, amount) {
    document.getElementById('memberModalTitle').textContent = 'Edit Member Amount';
    document.getElementById('amMemberId').value = mid;
    document.getElementById('amAmount').value = amount;
    document.getElementById('amUserGroup').style.display = 'none';
    document.getElementById('memberModal').style.display = 'flex';
}

async function saveMember(e) {
    e.preventDefault();
    const mid = document.getElementById('amMemberId').value;
    if (mid) {
        // Update existing
        await fetch('/api/team-pay/members/' + mid, {
            method: 'PUT', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ scheduled_amount: parseFloat(document.getElementById('amAmount').value) || 0 })
        });
    } else {
        // Add new
        const res = await fetch('/api/team-pay/schedules/' + TP_SCHEDULE_ID + '/members', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                user_id: parseInt(document.getElementById('amUser').value),
                scheduled_amount: parseFloat(document.getElementById('amAmount').value) || 0
            })
        });
        if (!res.ok) { const err = await res.json(); alert(err.error || 'Error'); return; }
    }
    document.getElementById('memberModal').style.display = 'none';
    loadMembers();
}

async function removeMember(mid) {
    if (!confirm('Remove this member from the schedule?')) return;
    await fetch('/api/team-pay/members/' + mid, { method: 'DELETE' });
    loadMembers();
}

function showEditSchedule() {
    document.getElementById('esValue').value = scheduleData.total_job_value || 0;
    document.getElementById('esNotes').value = scheduleData.notes || '';
    document.getElementById('editScheduleModal').style.display = 'flex';
}

async function updateSchedule(e) {
    e.preventDefault();
    await fetch('/api/team-pay/schedules/' + TP_SCHEDULE_ID, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            total_job_value: parseFloat(document.getElementById('esValue').value) || 0,
            notes: document.getElementById('esNotes').value
        })
    });
    document.getElementById('editScheduleModal').style.display = 'none';
    loadScheduleDetail();
}

async function createPeriod() {
    const res = await fetch('/api/team-pay/schedules/' + TP_SCHEDULE_ID + '/periods', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({})
    });
    if (!res.ok) { const err = await res.json(); alert(err.error || 'Error'); return; }
    const data = await res.json();
    window.location.href = '/team-pay/period/' + data.id;
}

async function deletePeriod(pid) {
    if (!confirm('Delete this payment period?')) return;
    await fetch('/api/team-pay/periods/' + pid, { method: 'DELETE' });
    loadPeriods();
}

function showQuickSetup() {
    const div = document.getElementById('qsUserList');
    const existingIds = membersData.map(m => m.user_id);
    const available = allUsers.filter(u => !existingIds.includes(u.id));
    if (!available.length) { alert('All users are already added to this schedule.'); return; }
    div.innerHTML = available.map(u => `
        <label style="display:flex;align-items:center;gap:8px;padding:4px 0;">
            <input type="checkbox" class="qs-user" value="${u.id}" checked>
            ${u.display_name || u.username}
        </label>`).join('');
    document.getElementById('quickSetupModal').style.display = 'flex';
}

async function applyQuickSetup() {
    const checks = document.querySelectorAll('.qs-user:checked');
    if (!checks.length) { alert('Select at least one member.'); return; }
    const totalValue = scheduleData.total_job_value || 0;
    const existingScheduled = membersData.reduce((s, m) => s + m.scheduled_amount, 0);
    const remaining = totalValue - existingScheduled;
    const perPerson = remaining > 0 ? Math.round(remaining / checks.length * 100) / 100 : 0;
    for (const cb of checks) {
        await fetch('/api/team-pay/schedules/' + TP_SCHEDULE_ID + '/members', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ user_id: parseInt(cb.value), scheduled_amount: perPerson })
        });
    }
    document.getElementById('quickSetupModal').style.display = 'none';
    loadMembers();
}

// ═══════════════════════════════════════════════════════════════
// PERIOD PAGE (G703-style distribution grid)
// ═══════════════════════════════════════════════════════════════
let periodData = null;
let g703Rows = [];

async function initPeriod() {
    await loadPeriodDetail();
}

async function loadPeriodDetail() {
    const res = await fetch('/api/team-pay/periods/' + TP_PERIOD_ID);
    periodData = await res.json();
    g703Rows = periodData.members || [];

    document.getElementById('backLink').href = '/team-pay/job/' + periodData.schedule_id;
    document.getElementById('periodTitle').textContent = 'Period ' + periodData.period_number + ' — ' + (periodData.job_name || 'Team Pay');

    const statusClass = periodData.status === 'Finalized' ? 'phase-approved' : 'phase-draft';
    document.getElementById('periodStatus').className = 'phase-status ' + statusClass;
    document.getElementById('periodStatus').textContent = periodData.status;

    const isFinalized = periodData.status === 'Finalized';
    document.getElementById('btnSave').style.display = isFinalized ? 'none' : '';
    document.getElementById('btnFinalize').style.display = isFinalized ? 'none' : '';
    document.getElementById('btnFinalize').textContent = 'Finalize';

    document.getElementById('periodNotes').value = periodData.notes || '';
    document.getElementById('sourceAmount').value = periodData.source_amount || '';
    document.getElementById('paymentDate').value = periodData.payment_date || '';

    document.getElementById('periodInfo').innerHTML = `
        <div class="detail-row"><span class="detail-label">Period:</span><span>#${periodData.period_number}</span></div>
        <div class="detail-row"><span class="detail-label">Payment Date:</span><span>${periodData.payment_date || '-'}</span></div>
        <div class="detail-row"><span class="detail-label">Source Amount:</span><span>${fmt(periodData.source_amount)}</span></div>
        <div class="detail-row"><span class="detail-label">Status:</span><span class="phase-status ${statusClass}">${periodData.status}</span></div>`;

    renderG703();
}

function renderG703() {
    const tbody = document.getElementById('g703Body');
    const isFinalized = periodData.status === 'Finalized';
    if (!g703Rows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No members in schedule.</td></tr>';
        document.getElementById('g703Foot').innerHTML = '';
        return;
    }
    let totScheduled = 0, totPrev = 0, totThis = 0, totPaid = 0, totBalance = 0;
    tbody.innerHTML = g703Rows.map((m, i) => {
        const thisAmt = m.this_period || 0;
        const totalPaid = m.previous_payments + thisAmt;
        const pctComplete = m.scheduled_amount > 0 ? (totalPaid / m.scheduled_amount * 100) : 0;
        const balance = m.scheduled_amount - totalPaid;
        totScheduled += m.scheduled_amount;
        totPrev += m.previous_payments;
        totThis += thisAmt;
        totPaid += totalPaid;
        totBalance += balance;
        const inputHtml = isFinalized
            ? fmt(thisAmt)
            : `<input type="number" class="form-input tp-entry" data-member-id="${m.member_id}" value="${thisAmt}" step="0.01" style="width:110px;text-align:right;" onchange="recalcRow(this)">`;
        return `<tr>
            <td>${i + 1}</td>
            <td>${m.display_name || m.username || 'Member'}</td>
            <td style="text-align:right;">${fmt(m.scheduled_amount)}</td>
            <td style="text-align:right;">${fmt(m.previous_payments)}</td>
            <td style="text-align:right;">${inputHtml}</td>
            <td style="text-align:right;" class="tp-total-paid">${fmt(totalPaid)}</td>
            <td style="text-align:right;" class="tp-pct">${pct(pctComplete)}</td>
            <td style="text-align:right;" class="tp-balance">${fmt(balance)}</td>
        </tr>`;
    }).join('');
    const totPct = totScheduled > 0 ? (totPaid / totScheduled * 100) : 0;
    document.getElementById('g703Foot').innerHTML = `<tr style="font-weight:bold;">
        <td></td><td>TOTALS</td>
        <td style="text-align:right;">${fmt(totScheduled)}</td>
        <td style="text-align:right;">${fmt(totPrev)}</td>
        <td style="text-align:right;">${fmt(totThis)}</td>
        <td style="text-align:right;">${fmt(totPaid)}</td>
        <td style="text-align:right;">${pct(totPct)}</td>
        <td style="text-align:right;">${fmt(totBalance)}</td>
    </tr>`;
}

function recalcRow(input) {
    const tr = input.closest('tr');
    const idx = Array.from(tr.parentNode.children).indexOf(tr);
    const m = g703Rows[idx];
    const thisAmt = parseFloat(input.value) || 0;
    m.this_period = thisAmt;
    const totalPaid = m.previous_payments + thisAmt;
    const pctComplete = m.scheduled_amount > 0 ? (totalPaid / m.scheduled_amount * 100) : 0;
    const balance = m.scheduled_amount - totalPaid;
    tr.querySelector('.tp-total-paid').textContent = fmt(totalPaid);
    tr.querySelector('.tp-pct').textContent = pct(pctComplete);
    tr.querySelector('.tp-balance').textContent = fmt(balance);
    recalcFooter();
}

function recalcFooter() {
    let totScheduled = 0, totPrev = 0, totThis = 0, totPaid = 0, totBalance = 0;
    g703Rows.forEach(m => {
        const thisAmt = m.this_period || 0;
        const paid = m.previous_payments + thisAmt;
        totScheduled += m.scheduled_amount;
        totPrev += m.previous_payments;
        totThis += thisAmt;
        totPaid += paid;
        totBalance += m.scheduled_amount - paid;
    });
    const totPct = totScheduled > 0 ? (totPaid / totScheduled * 100) : 0;
    document.getElementById('g703Foot').innerHTML = `<tr style="font-weight:bold;">
        <td></td><td>TOTALS</td>
        <td style="text-align:right;">${fmt(totScheduled)}</td>
        <td style="text-align:right;">${fmt(totPrev)}</td>
        <td style="text-align:right;">${fmt(totThis)}</td>
        <td style="text-align:right;">${fmt(totPaid)}</td>
        <td style="text-align:right;">${pct(totPct)}</td>
        <td style="text-align:right;">${fmt(totBalance)}</td>
    </tr>`;
}

async function saveEntries() {
    const inputs = document.querySelectorAll('.tp-entry');
    const entries = [];
    inputs.forEach(inp => {
        entries.push({ member_id: parseInt(inp.dataset.memberId), amount: parseFloat(inp.value) || 0 });
    });
    const res = await fetch('/api/team-pay/periods/' + TP_PERIOD_ID, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            entries: entries,
            notes: document.getElementById('periodNotes').value,
            source_amount: parseFloat(document.getElementById('sourceAmount').value) || 0,
            payment_date: document.getElementById('paymentDate').value
        })
    });
    if (!res.ok) { const err = await res.json(); alert(err.error || 'Error saving'); return; }
    loadPeriodDetail();
}

async function finalizePeriod() {
    if (!confirm('Finalize this period? Entries will be locked.')) return;
    const inputs = document.querySelectorAll('.tp-entry');
    const entries = [];
    inputs.forEach(inp => {
        entries.push({ member_id: parseInt(inp.dataset.memberId), amount: parseFloat(inp.value) || 0 });
    });
    const res = await fetch('/api/team-pay/periods/' + TP_PERIOD_ID, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            entries: entries,
            notes: document.getElementById('periodNotes').value,
            source_amount: parseFloat(document.getElementById('sourceAmount').value) || 0,
            payment_date: document.getElementById('paymentDate').value,
            status: 'Finalized'
        })
    });
    if (!res.ok) { const err = await res.json(); alert(err.error || 'Error'); return; }
    loadPeriodDetail();
}

function distributeEvenly() {
    const sourceAmt = parseFloat(document.getElementById('sourceAmount').value) || 0;
    if (!sourceAmt) { alert('Enter a Source Amount first.'); return; }
    const inputs = document.querySelectorAll('.tp-entry');
    if (!inputs.length) return;
    const perPerson = Math.round(sourceAmt / inputs.length * 100) / 100;
    inputs.forEach(inp => { inp.value = perPerson; recalcRow(inp); });
}

function distributeProportional() {
    const sourceAmt = parseFloat(document.getElementById('sourceAmount').value) || 0;
    if (!sourceAmt) { alert('Enter a Source Amount first.'); return; }
    const totalScheduled = g703Rows.reduce((s, m) => s + m.scheduled_amount, 0);
    if (!totalScheduled) { alert('No scheduled amounts to base proportions on.'); return; }
    const inputs = document.querySelectorAll('.tp-entry');
    inputs.forEach((inp, i) => {
        const m = g703Rows[i];
        const proportion = m.scheduled_amount / totalScheduled;
        inp.value = Math.round(sourceAmt * proportion * 100) / 100;
        recalcRow(inp);
    });
}
