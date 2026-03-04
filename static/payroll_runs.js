/* Payroll Runs & Mass Timesheet JS */
function fmtMoney(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ─── Runs List (Overview Page) ───────────────────────────────────
let _allEmps = [];

async function loadRuns() {
    const res = await fetch('/api/payroll/runs');
    const runs = await res.json();
    const tbody = document.getElementById('runsBody');
    if (!tbody) return;
    if (!runs.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No payroll runs yet. Click "+ New Payroll Run" to create one.</td></tr>';
        return;
    }
    tbody.innerHTML = runs.map(r => {
        const statusClass = r.status === 'Finalized' ? 'status-complete' : 'status-needs-bid';
        return `<tr>
            <td><a href="/payroll/runs/${r.id}" class="link">#${r.run_number}</a></td>
            <td><a href="/payroll/runs/${r.id}" class="link">${r.period_start} &mdash; ${r.period_end}</a></td>
            <td>${r.check_date || '-'}</td>
            <td>${r.employee_count}</td>
            <td class="cell-computed">${r.total_hours ? r.total_hours.toFixed(1) + 'h' : '-'}</td>
            <td class="cell-computed" style="font-weight:700;">${r.total_gross_pay ? fmtMoney(r.total_gross_pay) : '-'}</td>
            <td><span class="status-badge ${statusClass}">${r.status}</span></td>
            <td style="white-space:nowrap;">
                <a href="/payroll/runs/${r.id}" class="btn btn-small btn-secondary">Open</a>
                ${r.status === 'Draft' ? `<button class="btn btn-small btn-secondary" onclick="deleteRun(${r.id})" style="color:#EF4444;">Del</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

async function showNewRunModal() {
    document.getElementById('runStart').value = '';
    document.getElementById('runEnd').value = '';
    document.getElementById('runCheckDate').value = '';
    document.getElementById('runNotes').value = '';
    document.getElementById('newRunModal').style.display = 'flex';
    // Load employees
    if (!_allEmps.length) {
        const res = await fetch('/api/payroll/summary');
        _allEmps = await res.json();
    }
    const cl = document.getElementById('empChecklist');
    cl.innerHTML = _allEmps.map(u => `
        <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--gray-100,#f1f5f9);cursor:pointer;">
            <input type="checkbox" class="emp-cb" value="${u.id}" checked>
            <span style="flex:1;">${u.display_name}</span>
            <span class="badge" style="font-size:11px;">${u.role.replace('_',' ')}</span>
            <span style="color:var(--gray-400);font-size:12px;">${fmtMoney(u.hourly_rate)}/hr</span>
        </label>
    `).join('');
    document.getElementById('selectAllEmps').checked = true;
}

function closeNewRunModal() { document.getElementById('newRunModal').style.display = 'none'; }

function autoFillEndDate() {
    const start = document.getElementById('runStart').value;
    if (!start) return;
    const d = new Date(start + 'T00:00:00');
    d.setDate(d.getDate() + 13);
    document.getElementById('runEnd').value = d.toISOString().split('T')[0];
}

function toggleAllEmps(checked) {
    document.querySelectorAll('.emp-cb').forEach(cb => cb.checked = checked);
}

async function createRun() {
    const start = document.getElementById('runStart').value;
    const end = document.getElementById('runEnd').value;
    const checkDate = document.getElementById('runCheckDate').value;
    const notes = document.getElementById('runNotes').value.trim();
    if (!start || !end) return alert('Period start and end dates are required');
    const empIds = Array.from(document.querySelectorAll('.emp-cb:checked')).map(cb => parseInt(cb.value));
    if (!empIds.length) return alert('Select at least one employee');
    try {
        const res = await fetch('/api/payroll/runs', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ period_start: start, period_end: end, check_date: checkDate, notes, employee_ids: empIds })
        });
        const data = await res.json();
        if (res.ok && data.id) {
            closeNewRunModal();
            window.location.assign('/payroll/runs/' + data.id);
        } else {
            alert(data.error || 'Failed to create run');
        }
    } catch (e) {
        alert('Error creating run: ' + e.message);
    }
}

async function deleteRun(id) {
    if (!confirm('Delete this payroll run? This cannot be undone.')) return;
    const res = await fetch('/api/payroll/runs/' + id, { method: 'DELETE' });
    if (res.ok) loadRuns();
    else { const err = await res.json(); alert(err.error || 'Failed to delete'); }
}

// ─── Mass Timesheet (Detail Page) ───────────────────────────────
let _runData = null;
// Map of job name → job id for quick lookup
let _jobNameMap = {};

if (typeof RUN_ID !== 'undefined') {
    loadRunDetail();
}

async function loadRunDetail() {
    const res = await fetch('/api/payroll/runs/' + RUN_ID);
    if (!res.ok) { document.getElementById('timesheetContainer').innerHTML = '<p class="empty-state">Failed to load run.</p>'; return; }
    _runData = await res.json();
    // Build name→id map
    _jobNameMap = {};
    _runData.available_jobs.forEach(j => { _jobNameMap[j.name] = j.id; });
    renderRunHeader();
    buildTimesheetGrid();
}

function formatPeriod(start, end) {
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[s.getMonth()] + ' ' + s.getDate() + ' - ' + months[e.getMonth()] + ' ' + e.getDate() + ', ' + e.getFullYear();
}

function renderRunHeader() {
    const run = _runData.run;
    const badge = document.getElementById('statusBadge');
    badge.textContent = run.status;
    badge.className = 'status-badge ' + (run.status === 'Finalized' ? 'status-complete' : 'status-needs-bid');

    // Title shows the period dates
    const titleEl = document.getElementById('runTitle');
    if (titleEl) titleEl.textContent = formatPeriod(run.period_start, run.period_end);

    document.getElementById('runDates').textContent =
        'Run #' + run.run_number +
        (run.check_date ? ' | Check Date: ' + run.check_date : '');

    // Actions
    const actions = document.getElementById('runActions');
    if (run.status === 'Draft') {
        actions.innerHTML = `
            <button class="btn btn-primary" onclick="saveTimesheet()">Save All</button>
            <button class="btn btn-secondary" onclick="finalizeRun()" style="background:#059669;color:#fff;">Finalize</button>
            <button class="btn btn-secondary" onclick="deleteRunDetail()" style="color:#EF4444;">Delete Run</button>
        `;
    } else {
        actions.innerHTML = `
            <button class="btn btn-secondary" onclick="reopenRun()">Reopen (Owner)</button>
        `;
    }
    recalcKpis();
}

function recalcKpis() {
    const emps = _runData.employees;
    let totalHours = 0, totalPay = 0;
    if (_runData.run.status === 'Finalized') {
        emps.forEach(e => { totalHours += e.total_hours || 0; totalPay += e.gross_pay || 0; });
    } else {
        document.querySelectorAll('.ts-input').forEach(inp => {
            totalHours += parseFloat(inp.value) || 0;
        });
        emps.forEach(e => {
            let empHours = 0;
            document.querySelectorAll(`.ts-input[data-uid="${e.user_id}"]`).forEach(inp => {
                empHours += parseFloat(inp.value) || 0;
            });
            totalPay += empHours * (e.hourly_rate || 0);
        });
    }
    document.getElementById('kpiEmployees').textContent = emps.length;
    document.getElementById('kpiHours').textContent = totalHours.toFixed(1) + 'h';
    document.getElementById('kpiPay').textContent = fmtMoney(totalPay);
}

function buildJobDatalistHTML() {
    return '<datalist id="jobList">' +
        _runData.available_jobs.map(j => `<option value="${j.name}">`).join('') +
        '</datalist>';
}

function buildTimesheetGrid() {
    const { run, employees, entries, dates, available_jobs } = _runData;
    const isReadOnly = run.status === 'Finalized';
    const container = document.getElementById('timesheetContainer');

    // Group entries by user_id -> { job_id -> { date -> hours, job_name } }
    const entryMap = {};
    entries.forEach(e => {
        if (!entryMap[e.user_id]) entryMap[e.user_id] = {};
        if (!entryMap[e.user_id][e.job_id]) entryMap[e.user_id][e.job_id] = {};
        entryMap[e.user_id][e.job_id][e.work_date] = e.hours || 0;
        entryMap[e.user_id][e.job_id]._job_name = e.job_name || '';
    });

    // Format date headers
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dateHeaders = dates.map(d => {
        const dt = new Date(d + 'T00:00:00');
        return dayNames[dt.getDay()] + ' ' + (dt.getMonth()+1) + '/' + dt.getDate();
    });

    let html = buildJobDatalistHTML();
    html += `<table class="data-table ts-grid" style="min-width:${200 + dates.length * 70}px;">
        <thead><tr>
            <th style="position:sticky;left:0;background:var(--gray-50,#f8fafc);z-index:2;min-width:180px;">Employee</th>
            <th style="min-width:160px;">Project</th>`;
    dateHeaders.forEach(dh => { html += `<th style="min-width:60px;text-align:center;font-size:12px;">${dh}</th>`; });
    html += `<th style="min-width:70px;text-align:right;">Total</th></tr></thead><tbody>`;

    employees.forEach(emp => {
        const uid = emp.user_id;
        const userEntries = entryMap[uid] || {};
        const jobIds = Object.keys(userEntries).map(Number);
        if (jobIds.length === 0) jobIds.push(0);

        jobIds.forEach((jid, idx) => {
            const isFirst = idx === 0;
            const jobEntries = userEntries[jid] || {};
            const jobName = jobEntries._job_name || (available_jobs.find(j => j.id === jid) || {}).name || '';
            html += `<tr class="ts-row" data-uid="${uid}">`;
            if (isFirst) {
                html += `<td style="position:sticky;left:0;background:#fff;z-index:1;font-weight:600;vertical-align:top;" rowspan="__ROWSPAN_${uid}__">
                    ${emp.display_name}<br>
                    <span style="font-size:11px;color:var(--gray-400);font-weight:400;">${fmtMoney(emp.hourly_rate)}/hr</span>
                    <div class="ts-emp-subtotal" id="subtotal-${uid}" style="margin-top:6px;font-size:13px;color:var(--primary,#2563EB);"></div>
                </td>`;
            }
            html += `<td>`;
            if (isReadOnly) {
                html += jobName || (jid ? 'Job #' + jid : '-');
            } else {
                html += `<input type="text" class="form-input ts-job" data-uid="${uid}" list="jobList"
                    value="${jobName}" placeholder="Type or select project..."
                    style="font-size:12px;padding:4px;width:150px;">`;
            }
            html += `</td>`;
            dates.forEach(d => {
                const val = jobEntries[d] || '';
                if (isReadOnly) {
                    html += `<td style="text-align:center;">${val || ''}</td>`;
                } else {
                    html += `<td><input type="number" class="form-input ts-input" data-uid="${uid}" data-date="${d}"
                        step="0.25" min="0" max="24" value="${val}"
                        style="width:55px;text-align:center;padding:4px;font-size:13px;"
                        oninput="recalcTotals()"></td>`;
                }
            });
            html += `<td style="text-align:right;font-weight:600;" class="ts-row-total" data-uid="${uid}">0</td>`;
            html += `</tr>`;
        });

        if (!isReadOnly) {
            html += `<tr class="ts-add-row" data-uid="${uid}">
                <td></td>
                <td colspan="${dates.length + 1}" style="padding:4px;">
                    <button class="btn btn-small btn-secondary" onclick="addJobRow(${uid})">+ Add Project</button>
                </td>
            </tr>`;
        }

        const rowCount = jobIds.length;
        html = html.replace(`__ROWSPAN_${uid}__`, isReadOnly ? rowCount : rowCount + 1);
    });

    // Day totals row
    html += `<tr style="background:var(--gray-50,#f8fafc);font-weight:700;border-top:2px solid var(--gray-300,#cbd5e1);">
        <td style="position:sticky;left:0;background:var(--gray-50,#f8fafc);z-index:1;">Totals</td>
        <td></td>`;
    dates.forEach(d => {
        html += `<td style="text-align:center;" class="ts-day-total" data-date="${d}">0</td>`;
    });
    html += `<td style="text-align:right;" id="grandTotal">0</td></tr>`;

    html += '</tbody></table>';
    container.innerHTML = html;

    recalcTotals();
}

function addJobRow(uid) {
    const addRow = document.querySelector(`.ts-add-row[data-uid="${uid}"]`);
    if (!addRow) return;
    const dates = _runData.dates;

    const newRow = document.createElement('tr');
    newRow.className = 'ts-row';
    newRow.dataset.uid = uid;
    let cells = `<td>
        <input type="text" class="form-input ts-job" data-uid="${uid}" list="jobList"
            value="" placeholder="Type or select project..."
            style="font-size:12px;padding:4px;width:130px;">
        <button class="btn btn-small" onclick="this.closest('tr').remove();recalcTotals();fixRowspans(${uid});" style="color:#EF4444;padding:2px 6px;font-size:11px;margin-left:2px;">X</button>
    </td>`;
    dates.forEach(d => {
        cells += `<td><input type="number" class="form-input ts-input" data-uid="${uid}" data-date="${d}"
            step="0.25" min="0" max="24" value=""
            style="width:55px;text-align:center;padding:4px;font-size:13px;"
            oninput="recalcTotals()"></td>`;
    });
    cells += `<td style="text-align:right;font-weight:600;" class="ts-row-total" data-uid="${uid}">0</td>`;
    newRow.innerHTML = cells;
    addRow.parentNode.insertBefore(newRow, addRow);
    fixRowspans(uid);
}

function fixRowspans(uid) {
    const rows = document.querySelectorAll(`.ts-row[data-uid="${uid}"]`);
    const addRow = document.querySelector(`.ts-add-row[data-uid="${uid}"]`);
    const totalRows = rows.length + (addRow ? 1 : 0);
    const firstRow = rows[0];
    if (firstRow) {
        const nameCell = firstRow.querySelector('td[rowspan]');
        if (nameCell) nameCell.rowSpan = totalRows;
    }
}

function recalcTotals() {
    const dates = _runData.dates;
    const employees = _runData.employees;
    let grandTotal = 0;

    employees.forEach(emp => {
        let empTotal = 0;
        document.querySelectorAll(`.ts-input[data-uid="${emp.user_id}"]`).forEach(inp => {
            empTotal += parseFloat(inp.value) || 0;
        });
        const sub = document.getElementById('subtotal-' + emp.user_id);
        if (sub) sub.textContent = empTotal.toFixed(1) + 'h = ' + fmtMoney(empTotal * (emp.hourly_rate || 0));
        const rows = document.querySelectorAll(`.ts-row[data-uid="${emp.user_id}"]`);
        rows.forEach(row => {
            let rowTotal = 0;
            row.querySelectorAll('.ts-input').forEach(inp => { rowTotal += parseFloat(inp.value) || 0; });
            const rtCell = row.querySelector('.ts-row-total');
            if (rtCell) rtCell.textContent = rowTotal.toFixed(1);
        });
        grandTotal += empTotal;
    });

    dates.forEach(d => {
        let dayTotal = 0;
        document.querySelectorAll(`.ts-input[data-date="${d}"]`).forEach(inp => {
            dayTotal += parseFloat(inp.value) || 0;
        });
        const cell = document.querySelector(`.ts-day-total[data-date="${d}"]`);
        if (cell) cell.textContent = dayTotal.toFixed(1);
    });

    const gt = document.getElementById('grandTotal');
    if (gt) gt.textContent = grandTotal.toFixed(1);

    recalcKpis();
}

async function saveTimesheet() {
    // Collect entries — resolve job names to IDs or pass name for new jobs
    const entries = [];
    const rows = document.querySelectorAll('.ts-row');
    let missingProject = false;
    rows.forEach(row => {
        const uid = parseInt(row.dataset.uid);
        const jobInput = row.querySelector('.ts-job');
        const jobName = jobInput ? jobInput.value.trim() : '';
        // Check if any hours entered on this row
        let hasHours = false;
        row.querySelectorAll('.ts-input').forEach(inp => {
            if (parseFloat(inp.value) > 0) hasHours = true;
        });
        if (!jobName && hasHours) { missingProject = true; return; }
        if (!jobName) return;
        // Resolve to job_id if known, otherwise pass job_name for backend to create
        const jobId = _jobNameMap[jobName] || 0;
        row.querySelectorAll('.ts-input').forEach(inp => {
            const hours = parseFloat(inp.value) || 0;
            const date = inp.dataset.date;
            const entry = { user_id: uid, work_date: date, hours };
            if (jobId) { entry.job_id = jobId; }
            else { entry.job_name = jobName; }
            entries.push(entry);
        });
    });
    if (missingProject) return alert('Some rows have hours but no project assigned. Please enter a project name for all rows with hours.');
    const res = await fetch('/api/payroll/runs/' + RUN_ID + '/timesheet', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ entries })
    });
    if (res.ok) {
        const data = await res.json();
        // Update job name map with any newly created jobs
        if (data.new_jobs) {
            data.new_jobs.forEach(j => { _jobNameMap[j.name] = j.id; });
            // Also add to available_jobs for datalist
            _runData.available_jobs.push(...data.new_jobs);
            const dl = document.getElementById('jobList');
            if (dl) {
                data.new_jobs.forEach(j => {
                    const opt = document.createElement('option');
                    opt.value = j.name;
                    dl.appendChild(opt);
                });
            }
        }
        showToast('Timesheet saved successfully');
    } else {
        const err = await res.json();
        alert(err.error || 'Failed to save');
    }
}

function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#059669;color:#fff;padding:10px 24px;border-radius:8px;font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

async function finalizeRun() {
    if (!confirm('Finalize this payroll run? All entries will be approved and locked.')) return;
    await saveTimesheet();
    const res = await fetch('/api/payroll/runs/' + RUN_ID + '/finalize', { method: 'POST' });
    if (res.ok) {
        showToast('Payroll run finalized');
        loadRunDetail();
    } else {
        const err = await res.json();
        alert(err.error || 'Failed to finalize');
    }
}

async function reopenRun() {
    if (!confirm('Reopen this payroll run? This is an owner-only action.')) return;
    const res = await fetch('/api/payroll/runs/' + RUN_ID + '/reopen', { method: 'POST' });
    if (res.ok) {
        showToast('Payroll run reopened');
        loadRunDetail();
    } else {
        const err = await res.json();
        alert(err.error || 'Failed to reopen');
    }
}

async function deleteRunDetail() {
    if (!confirm('Delete this payroll run? This cannot be undone.')) return;
    const res = await fetch('/api/payroll/runs/' + RUN_ID, { method: 'DELETE' });
    if (res.ok) window.location.assign('/payroll');
    else { const err = await res.json(); alert(err.error || 'Failed to delete'); }
}
