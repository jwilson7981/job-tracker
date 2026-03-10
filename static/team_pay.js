/* Team Pay (Internal Progress Payroll — G703 per member) */
function fmt(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pct(n) { return Number(n || 0).toFixed(1) + '%'; }

if (window.TP_PAGE === 'list') initList();
else if (window.TP_PAGE === 'job') initJob();
else if (window.TP_PAGE === 'tracker') initTracker();

// ═══════════════════════════════════════════════════════════════
// LIST PAGE
// ═══════════════════════════════════════════════════════════════
var allJobs = [];
async function initList() {
    var res = await fetch('/api/jobs/list');
    allJobs = await res.json();
    populateJobSelects();
    loadSchedules();
}

function populateJobSelects() {
    ['nsJob', 'importJob'].forEach(function(id) {
        var sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">Select a project...</option>';
        allJobs.forEach(function(j) {
            var o = document.createElement('option');
            o.value = j.id; o.textContent = j.name; sel.appendChild(o);
        });
    });
}

async function loadSchedules() {
    var res = await fetch('/api/team-pay/schedules');
    var schedules = await res.json();
    var tbody = document.getElementById('schedulesBody');
    if (!schedules.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No team pay schedules yet. Create one or import a Staff AIA workbook.</td></tr>';
        return;
    }
    tbody.innerHTML = schedules.map(function(s) {
        return '<tr>' +
            '<td><a href="/team-pay/job/' + s.id + '" class="link">' + (s.job_name || 'Job #' + s.job_id) + '</a></td>' +
            '<td>' + (s.member_count || 0) + '</td>' +
            '<td>' + fmt(s.scheduled_total) + '</td>' +
            '<td>' + fmt(s.total_paid) + '</td>' +
            '<td>' + (s.period_count || 0) + '</td>' +
            '<td>' +
                '<a href="/team-pay/job/' + s.id + '" class="btn btn-small btn-secondary">View</a> ' +
                '<button class="btn btn-small btn-danger" onclick="deleteSchedule(' + s.id + ')">Delete</button>' +
            '</td>' +
        '</tr>';
    }).join('');
}

function showNewSchedule() {
    populateJobSelects();
    document.getElementById('nsTotalValue').value = '';
    document.getElementById('nsRetainage').value = '10';
    document.getElementById('nsNotes').value = '';
    document.getElementById('scheduleModal').style.display = 'flex';
}

async function saveSchedule(e) {
    e.preventDefault();
    var res = await fetch('/api/team-pay/schedules', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            job_id: parseInt(document.getElementById('nsJob').value),
            total_job_value: parseFloat(document.getElementById('nsTotalValue').value) || 0,
            retainage_pct: parseFloat(document.getElementById('nsRetainage').value) || 10,
            notes: document.getElementById('nsNotes').value
        })
    });
    if (!res.ok) { var err = await res.json(); alert(err.error || 'Error'); return; }
    document.getElementById('scheduleModal').style.display = 'none';
    var data = await res.json();
    window.location.href = '/team-pay/job/' + data.id;
}

async function deleteSchedule(id) {
    if (!confirm('Delete this team pay schedule and all its data?')) return;
    await fetch('/api/team-pay/schedules/' + id, { method: 'DELETE' });
    loadSchedules();
}

async function importExcel(e) {
    e.preventDefault();
    var fileInput = document.getElementById('importFile');
    if (!fileInput.files.length) return;
    var btn = document.getElementById('importBtn');
    btn.disabled = true; btn.textContent = 'Importing...';

    var formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('job_id', document.getElementById('importJob').value);

    try {
        var res = await fetch('/api/team-pay/import', { method: 'POST', body: formData });
        var data = await res.json();
        if (res.ok && data.ok) {
            window._toastShown = true;
            if (window.showToast) window.showToast('Imported ' + data.imported + ' team members');
            loadSchedules();
            fileInput.value = '';
        } else {
            alert('Import error: ' + (data.error || 'Unknown'));
        }
    } catch (err) {
        alert('Import failed: ' + err.message);
    }
    btn.disabled = false; btn.textContent = 'Import';
}

// ═══════════════════════════════════════════════════════════════
// JOB PAGE (G703 per member with period selector)
// ═══════════════════════════════════════════════════════════════
var scheduleData = null;
var membersData = [];
var periodsData = [];
var periodDetail = null;
var activeMemberId = null;
var allUsers = [];

async function initJob() {
    await loadScheduleDetail();
    await Promise.all([loadMembers(), loadPeriods(), loadAllUsers()]);
}

async function loadScheduleDetail() {
    var res = await fetch('/api/team-pay/schedules/' + TP_SCHEDULE_ID);
    scheduleData = await res.json();
    document.getElementById('jobTitle').textContent = (scheduleData.job_name || 'Project') + ' — Team Pay';
    document.getElementById('scheduleInfo').innerHTML =
        '<div class="detail-row"><span class="detail-label">Project:</span><span>' + (scheduleData.job_name || '-') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Total Value:</span><span>' + fmt(scheduleData.total_job_value) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Retainage:</span><span>' + (scheduleData.retainage_pct || 10) + '%</span></div>' +
        '<div class="detail-row"><span class="detail-label">Notes:</span><span>' + (scheduleData.notes || '-') + '</span></div>';
}

async function loadAllUsers() {
    try {
        var res = await fetch('/api/admin/users');
        if (res.ok) allUsers = await res.json();
    } catch(e) { allUsers = []; }
}

async function loadMembers() {
    var res = await fetch('/api/team-pay/schedules/' + TP_SCHEDULE_ID + '/members');
    membersData = await res.json();
    renderMembersOverview();
    renderMemberTabs();
}

function renderMembersOverview() {
    var tbody = document.getElementById('membersBody');
    if (!membersData.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No members added yet.</td></tr>';
        document.getElementById('membersFoot').innerHTML = '';
        return;
    }
    var totSched = 0, totPaid = 0;
    tbody.innerHTML = membersData.map(function(m, i) {
        var balance = m.sov_total - m.total_paid;
        var p = m.sov_total > 0 ? (m.total_paid / m.sov_total * 100) : 0;
        totSched += m.sov_total;
        totPaid += m.total_paid;
        return '<tr>' +
            '<td>' + (i + 1) + '</td>' +
            '<td>' + m.display_name + '</td>' +
            '<td>' + m.item_count + '</td>' +
            '<td>' + fmt(m.sov_total) + '</td>' +
            '<td>' + fmt(m.total_paid) + '</td>' +
            '<td>' + pct(p) + '</td>' +
            '<td>' + fmt(balance) + '</td>' +
            '<td><button class="btn btn-small btn-danger" onclick="removeMember(' + m.id + ')">Remove</button></td>' +
        '</tr>';
    }).join('');
    var totBal = totSched - totPaid;
    var totPct = totSched > 0 ? (totPaid / totSched * 100) : 0;
    document.getElementById('membersFoot').innerHTML = '<tr style="font-weight:bold;">' +
        '<td></td><td>TOTALS</td><td></td><td>' + fmt(totSched) + '</td><td>' + fmt(totPaid) + '</td>' +
        '<td>' + pct(totPct) + '</td><td>' + fmt(totBal) + '</td><td></td></tr>';
}

function renderMemberTabs() {
    var bar = document.getElementById('memberTabs');
    if (!membersData.length) { bar.innerHTML = ''; return; }
    bar.innerHTML = membersData.map(function(m) {
        var cls = m.id === activeMemberId ? 'tab active' : 'tab';
        return '<button class="' + cls + '" onclick="selectMember(' + m.id + ')">' + m.display_name + '</button>';
    }).join('');
}

function selectMember(mid) {
    activeMemberId = mid;
    renderMemberTabs();
    renderG703();
}

async function loadPeriods() {
    var res = await fetch('/api/team-pay/schedules/' + TP_SCHEDULE_ID + '/periods');
    periodsData = await res.json();

    // Populate period selector
    var sel = document.getElementById('periodSelect');
    sel.innerHTML = '<option value="">-- Overview (no period) --</option>';
    periodsData.forEach(function(p) {
        var o = document.createElement('option');
        o.value = p.id;
        o.textContent = 'Period ' + p.period_number + (p.payment_date ? ' (' + p.payment_date + ')' : '') + ' — ' + p.status;
        sel.appendChild(o);
    });

    // Periods table
    var tbody = document.getElementById('periodsBody');
    if (!periodsData.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No periods yet.</td></tr>';
        return;
    }
    tbody.innerHTML = periodsData.map(function(p) {
        var sc = p.status === 'Finalized' ? 'phase-approved' : 'phase-draft';
        return '<tr>' +
            '<td>Period ' + p.period_number + '</td>' +
            '<td>' + (p.payment_date || '-') + '</td>' +
            '<td>' + fmt(p.distributed_total) + '</td>' +
            '<td><span class="phase-status ' + sc + '">' + p.status + '</span></td>' +
            '<td>' +
                (p.status === 'Draft' ? '<button class="btn btn-small btn-danger" onclick="deletePeriod(' + p.id + ')">Delete</button>' : '') +
            '</td></tr>';
    }).join('');
}

async function loadPeriodData() {
    var pid = document.getElementById('periodSelect').value;
    if (!pid) {
        periodDetail = null;
        document.getElementById('g703Container').style.display = 'none';
        document.getElementById('membersOverview').style.display = '';
        document.getElementById('btnSave').style.display = 'none';
        document.getElementById('btnFinalize').style.display = 'none';
        document.getElementById('periodStatus').style.display = 'none';
        return;
    }
    var res = await fetch('/api/team-pay/periods/' + pid);
    periodDetail = await res.json();
    document.getElementById('membersOverview').style.display = 'none';
    document.getElementById('g703Container').style.display = '';

    var isFinalized = periodDetail.status === 'Finalized';
    document.getElementById('btnSave').style.display = isFinalized ? 'none' : '';
    document.getElementById('btnFinalize').style.display = isFinalized ? 'none' : '';
    var ps = document.getElementById('periodStatus');
    ps.style.display = '';
    ps.className = 'phase-status ' + (isFinalized ? 'phase-approved' : 'phase-draft');
    ps.textContent = periodDetail.status;

    // Auto-select first member if none selected
    if (!activeMemberId && periodDetail.members.length) {
        activeMemberId = periodDetail.members[0].member_id;
    }
    renderMemberTabs();
    renderG703();
}

function renderG703() {
    var container = document.getElementById('g703Container');
    if (!periodDetail || !activeMemberId) {
        container.style.display = 'none';
        return;
    }
    container.style.display = '';

    var member = null;
    for (var i = 0; i < periodDetail.members.length; i++) {
        if (periodDetail.members[i].member_id === activeMemberId) {
            member = periodDetail.members[i];
            break;
        }
    }
    if (!member) {
        document.getElementById('g703Body').innerHTML = '<tr><td colspan="10" class="empty-state">No data for this member in this period.</td></tr>';
        document.getElementById('g703Foot').innerHTML = '';
        renderDeductions();
        return;
    }

    var isFinalized = periodDetail.status === 'Finalized';
    var retPct = periodDetail.retainage_pct || 10;
    var tbody = document.getElementById('g703Body');

    var totSched = 0, totPrev = 0, totThis = 0, totMat = 0, totCompleted = 0, totBalance = 0, totRet = 0;

    tbody.innerHTML = member.items.map(function(item) {
        totSched += item.scheduled_value;
        totPrev += item.from_previous;
        totThis += item.work_this_period;
        totMat += item.materials_stored;
        totCompleted += item.total_completed;
        totBalance += item.balance;
        totRet += item.retainage;

        var thisInput = isFinalized
            ? fmt(item.work_this_period)
            : '<input type="number" class="form-input tp-work" data-sov-id="' + item.sov_item_id + '" value="' + item.work_this_period + '" step="0.01" style="width:100px;text-align:right;" onchange="recalcG703Row(this)">';

        var schedInput = isFinalized
            ? fmt(item.scheduled_value)
            : '<input type="number" class="form-input tp-sched" data-sov-id="' + item.sov_item_id + '" value="' + item.scheduled_value + '" step="0.01" style="width:110px;text-align:right;" onchange="recalcG703Row(this)">';

        return '<tr data-sov-id="' + item.sov_item_id + '">' +
            '<td>' + item.item_number + '</td>' +
            '<td>' + (isFinalized ? item.description : '<input type="text" class="form-input tp-desc" data-sov-id="' + item.sov_item_id + '" value="' + escapeAttr(item.description) + '" style="width:100%;">') + '</td>' +
            '<td style="text-align:right;">' + schedInput + '</td>' +
            '<td style="text-align:right;">' + fmt(item.from_previous) + '</td>' +
            '<td style="text-align:right;">' + thisInput + '</td>' +
            '<td style="text-align:right;">' + fmt(item.materials_stored) + '</td>' +
            '<td style="text-align:right;" class="tp-total">' + fmt(item.total_completed) + '</td>' +
            '<td style="text-align:right;" class="tp-pct">' + pct(item.pct_complete) + '</td>' +
            '<td style="text-align:right;" class="tp-balance">' + fmt(item.balance) + '</td>' +
            '<td style="text-align:right;" class="tp-ret">' + fmt(item.retainage) + '</td>' +
        '</tr>';
    }).join('');

    var totPct = totSched > 0 ? (totCompleted / totSched * 100) : 0;
    document.getElementById('g703Foot').innerHTML = '<tr style="font-weight:bold;">' +
        '<td></td><td>TOTALS</td>' +
        '<td style="text-align:right;">' + fmt(totSched) + '</td>' +
        '<td style="text-align:right;">' + fmt(totPrev) + '</td>' +
        '<td style="text-align:right;">' + fmt(totThis) + '</td>' +
        '<td style="text-align:right;">' + fmt(totMat) + '</td>' +
        '<td style="text-align:right;">' + fmt(totCompleted) + '</td>' +
        '<td style="text-align:right;">' + pct(totPct) + '</td>' +
        '<td style="text-align:right;">' + fmt(totBalance) + '</td>' +
        '<td style="text-align:right;">' + fmt(totRet) + '</td>' +
    '</tr>';

    renderDeductions();
}

function escapeAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function recalcG703Row(input) {
    var tr = input.closest('tr');
    var sovId = parseInt(tr.dataset.sovId);
    var member = null;
    for (var i = 0; i < periodDetail.members.length; i++) {
        if (periodDetail.members[i].member_id === activeMemberId) { member = periodDetail.members[i]; break; }
    }
    if (!member) return;

    var item = null;
    for (var j = 0; j < member.items.length; j++) {
        if (member.items[j].sov_item_id === sovId) { item = member.items[j]; break; }
    }
    if (!item) return;

    // Read current input values
    var schedEl = tr.querySelector('.tp-sched');
    var workEl = tr.querySelector('.tp-work');
    if (schedEl) item.scheduled_value = parseFloat(schedEl.value) || 0;
    if (workEl) item.work_this_period = parseFloat(workEl.value) || 0;

    var retPct = periodDetail.retainage_pct || 10;
    item.total_completed = item.from_previous + item.work_this_period + item.materials_stored;
    item.pct_complete = item.scheduled_value > 0 ? (item.total_completed / item.scheduled_value * 100) : 0;
    item.balance = item.scheduled_value - item.total_completed;
    item.retainage = item.total_completed * retPct / 100;

    tr.querySelector('.tp-total').textContent = fmt(item.total_completed);
    tr.querySelector('.tp-pct').textContent = pct(item.pct_complete);
    tr.querySelector('.tp-balance').textContent = fmt(item.balance);
    tr.querySelector('.tp-ret').textContent = fmt(item.retainage);

    recalcG703Footer(member);
}

function recalcG703Footer(member) {
    var totSched = 0, totPrev = 0, totThis = 0, totMat = 0, totCompleted = 0, totBalance = 0, totRet = 0;
    member.items.forEach(function(item) {
        totSched += item.scheduled_value;
        totPrev += item.from_previous;
        totThis += item.work_this_period;
        totMat += item.materials_stored;
        totCompleted += item.total_completed;
        totBalance += item.balance;
        totRet += item.retainage;
    });
    var totPct = totSched > 0 ? (totCompleted / totSched * 100) : 0;
    document.getElementById('g703Foot').innerHTML = '<tr style="font-weight:bold;">' +
        '<td></td><td>TOTALS</td>' +
        '<td style="text-align:right;">' + fmt(totSched) + '</td>' +
        '<td style="text-align:right;">' + fmt(totPrev) + '</td>' +
        '<td style="text-align:right;">' + fmt(totThis) + '</td>' +
        '<td style="text-align:right;">' + fmt(totMat) + '</td>' +
        '<td style="text-align:right;">' + fmt(totCompleted) + '</td>' +
        '<td style="text-align:right;">' + pct(totPct) + '</td>' +
        '<td style="text-align:right;">' + fmt(totBalance) + '</td>' +
        '<td style="text-align:right;">' + fmt(totRet) + '</td>' +
    '</tr>';
}

function renderDeductions() {
    var tbody = document.getElementById('deductionsBody');
    var foot = document.getElementById('deductionsFoot');
    if (!periodDetail) { tbody.innerHTML = ''; foot.innerHTML = ''; return; }

    var memberDeds = (periodDetail.deductions || []).filter(function(d) { return d.member_id === activeMemberId; });
    if (!memberDeds.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-state" style="padding:8px;">No deductions</td></tr>';
        foot.innerHTML = '';
        return;
    }
    var total = 0;
    tbody.innerHTML = memberDeds.map(function(d) {
        total += d.amount;
        return '<tr><td>' + d.description + '</td><td style="text-align:right;">' + fmt(d.amount) + '</td>' +
            '<td><button class="btn btn-small btn-danger" onclick="removeDeduction(' + d.id + ')">&times;</button></td></tr>';
    }).join('');
    foot.innerHTML = '<tr style="font-weight:bold;"><td>Total Deductions</td><td style="text-align:right;">' + fmt(total) + '</td><td></td></tr>';
}

async function addDeduction() {
    if (!periodDetail || !activeMemberId) return;
    var desc = document.getElementById('newDeductDesc').value.trim();
    var amt = parseFloat(document.getElementById('newDeductAmt').value) || 0;
    if (!desc || !amt) { alert('Enter description and amount'); return; }
    await fetch('/api/team-pay/periods/' + periodDetail.id + '/deductions', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ member_id: activeMemberId, description: desc, amount: amt })
    });
    document.getElementById('newDeductDesc').value = '';
    document.getElementById('newDeductAmt').value = '';
    loadPeriodData();
}

async function removeDeduction(did) {
    await fetch('/api/team-pay/deductions/' + did, { method: 'DELETE' });
    loadPeriodData();
}

async function saveAllMembers() {
    if (!periodDetail) return;
    // Collect all line entries from inputs
    var lineEntries = [];
    var sovUpdates = [];
    document.querySelectorAll('.tp-work').forEach(function(inp) {
        lineEntries.push({
            sov_item_id: parseInt(inp.dataset.sovId),
            work_this_period: parseFloat(inp.value) || 0
        });
    });

    // Also save SOV description and scheduled_value changes
    var sovItems = [];
    document.querySelectorAll('#g703Body tr[data-sov-id]').forEach(function(tr) {
        var sovId = parseInt(tr.dataset.sovId);
        var descEl = tr.querySelector('.tp-desc');
        var schedEl = tr.querySelector('.tp-sched');
        if (descEl || schedEl) {
            sovItems.push({
                id: sovId,
                description: descEl ? descEl.value : undefined,
                scheduled_value: schedEl ? parseFloat(schedEl.value) || 0 : undefined
            });
        }
    });

    // Save SOV updates
    if (sovItems.length && activeMemberId) {
        for (var i = 0; i < sovItems.length; i++) {
            var s = sovItems[i];
            var body = {};
            if (s.description !== undefined) body.description = s.description;
            if (s.scheduled_value !== undefined) body.scheduled_value = s.scheduled_value;
            await fetch('/api/team-pay/sov/' + s.id, {
                method: 'PUT', headers: {'Content-Type':'application/json'},
                body: JSON.stringify(body)
            });
        }
    }

    // Save period line entries
    var res = await fetch('/api/team-pay/periods/' + periodDetail.id, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ line_entries: lineEntries })
    });
    if (!res.ok) { var err = await res.json(); alert(err.error || 'Error saving'); return; }
    window._toastShown = true;
    if (window.showToast) window.showToast('Saved successfully');
    loadPeriodData();
    loadMembers();
}

async function finalizePeriod() {
    if (!periodDetail) return;
    if (!confirm('Finalize this period? Entries will be locked.')) return;
    // Save first, then finalize
    await saveAllMembers();
    await fetch('/api/team-pay/periods/' + periodDetail.id, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ status: 'Finalized' })
    });
    loadPeriodData();
    loadPeriods();
}

async function createPeriod() {
    var res = await fetch('/api/team-pay/schedules/' + TP_SCHEDULE_ID + '/periods', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({})
    });
    if (!res.ok) { var err = await res.json(); alert(err.error || 'Error'); return; }
    var data = await res.json();
    await loadPeriods();
    document.getElementById('periodSelect').value = data.id;
    loadPeriodData();
}

async function deletePeriod(pid) {
    if (!confirm('Delete this payment period?')) return;
    await fetch('/api/team-pay/periods/' + pid, { method: 'DELETE' });
    loadPeriods();
    if (periodDetail && periodDetail.id === pid) {
        document.getElementById('periodSelect').value = '';
        loadPeriodData();
    }
}

function showAddMember() {
    var sel = document.getElementById('amUser');
    sel.innerHTML = '<option value="">-- Custom name --</option>';
    allUsers.forEach(function(u) {
        var o = document.createElement('option');
        o.value = u.id; o.textContent = u.display_name || u.username; sel.appendChild(o);
    });
    document.getElementById('amName').value = '';
    document.getElementById('memberModal').style.display = 'flex';
}

async function saveMember(e) {
    e.preventDefault();
    var userId = document.getElementById('amUser').value;
    var name = document.getElementById('amName').value.trim();
    if (!userId && !name) { alert('Select a user or enter a name'); return; }
    var body = {};
    if (userId) body.user_id = parseInt(userId);
    if (name) body.member_name = name;
    var res = await fetch('/api/team-pay/schedules/' + TP_SCHEDULE_ID + '/members', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body)
    });
    if (!res.ok) { var err = await res.json(); alert(err.error || 'Error'); return; }
    document.getElementById('memberModal').style.display = 'none';
    loadMembers();
}

async function removeMember(mid) {
    if (!confirm('Remove this member and all their SOV data?')) return;
    await fetch('/api/team-pay/members/' + mid, { method: 'DELETE' });
    if (activeMemberId === mid) activeMemberId = null;
    loadMembers();
}

function showEditSchedule() {
    document.getElementById('esValue').value = scheduleData.total_job_value || 0;
    document.getElementById('esRetainage').value = scheduleData.retainage_pct || 10;
    document.getElementById('esNotes').value = scheduleData.notes || '';
    document.getElementById('editScheduleModal').style.display = 'flex';
}

async function updateSchedule(e) {
    e.preventDefault();
    await fetch('/api/team-pay/schedules/' + TP_SCHEDULE_ID, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            total_job_value: parseFloat(document.getElementById('esValue').value) || 0,
            retainage_pct: parseFloat(document.getElementById('esRetainage').value) || 10,
            notes: document.getElementById('esNotes').value
        })
    });
    document.getElementById('editScheduleModal').style.display = 'none';
    loadScheduleDetail();
}

async function addSOVItem() {
    if (!activeMemberId) return;
    var res = await fetch('/api/team-pay/members/' + activeMemberId + '/sov', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ description: 'New Item', scheduled_value: 0 })
    });
    if (res.ok) loadPeriodData();
}

// ═══════════════════════════════════════════════════════════════
// TRACKER PAGE (Running Pay Tracker grid)
// ═══════════════════════════════════════════════════════════════
async function initTracker() {
    var res = await fetch('/api/team-pay/tracker');
    var data = await res.json();

    if (!data.jobs.length || !data.members.length) {
        document.getElementById('trackerWrapper').innerHTML = '<p class="text-muted" style="padding:24px;text-align:center;">No team pay data yet.</p>';
        return;
    }

    var html = '<table class="data-table"><thead><tr><th>Team Member</th>';
    data.jobs.forEach(function(j) { html += '<th style="text-align:right;">' + j + '</th>'; });
    html += '<th style="text-align:right;font-weight:bold;">Total</th></tr></thead><tbody>';

    var jobTotals = {};
    data.jobs.forEach(function(j) { jobTotals[j] = 0; });
    var grandTotal = 0;

    data.members.forEach(function(m) {
        html += '<tr><td style="font-weight:600;">' + m.member + '</td>';
        data.jobs.forEach(function(j) {
            var amt = m.jobs[j] || 0;
            jobTotals[j] += amt;
            html += '<td style="text-align:right;">' + (amt ? fmt(amt) : '-') + '</td>';
        });
        grandTotal += m.total;
        html += '<td style="text-align:right;font-weight:bold;">' + fmt(m.total) + '</td></tr>';
    });

    // Totals row
    html += '<tr style="font-weight:bold;border-top:2px solid var(--gray-300);"><td>TOTALS</td>';
    data.jobs.forEach(function(j) {
        html += '<td style="text-align:right;">' + fmt(jobTotals[j]) + '</td>';
    });
    html += '<td style="text-align:right;">' + fmt(grandTotal) + '</td></tr>';
    html += '</tbody></table>';

    document.getElementById('trackerWrapper').innerHTML = html;
}
