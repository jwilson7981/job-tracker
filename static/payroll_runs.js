/* Payroll Runs & Mass Timesheet JS */
function fmtMoney(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ─── Runs List (Overview Page) ───────────────────────────────────
let _allEmps = [];

function loadRuns() {
    var tbody = document.getElementById('runsBody');
    if (!tbody) return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/payroll/runs', true);
    xhr.onload = function() {
        if (xhr.status !== 200) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Failed to load runs.</td></tr>';
            return;
        }
        var runs = JSON.parse(xhr.responseText);
        if (!runs.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No payroll runs yet. Click "+ New Payroll Run" to create one.</td></tr>';
            return;
        }
        tbody.innerHTML = runs.map(function(r) {
            var statusClass = r.status === 'Finalized' ? 'status-complete' : 'status-needs-bid';
            return '<tr>' +
                '<td><a href="/payroll/runs/' + r.id + '" class="link">#' + r.run_number + '</a></td>' +
                '<td><a href="/payroll/runs/' + r.id + '" class="link">' + r.period_start + ' &mdash; ' + r.period_end + '</a></td>' +
                '<td>' + (r.check_date || '-') + '</td>' +
                '<td>' + r.employee_count + '</td>' +
                '<td class="cell-computed">' + (r.total_hours ? r.total_hours.toFixed(1) + 'h' : '-') + '</td>' +
                '<td class="cell-computed" style="font-weight:700;">' + (r.total_gross_pay ? fmtMoney(r.total_gross_pay) : '-') + '</td>' +
                '<td><span class="status-badge ' + statusClass + '">' + r.status + '</span></td>' +
                '<td style="white-space:nowrap;">' +
                    '<a href="/payroll/runs/' + r.id + '" class="btn btn-small btn-secondary">Open</a>' +
                    ' <button class="btn btn-small btn-secondary" onclick="deleteRun(' + r.id + ')" style="color:#EF4444;">Del</button>' +
                '</td>' +
            '</tr>';
        }).join('');
    };
    xhr.onerror = function() {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Failed to load runs.</td></tr>';
    };
    xhr.send();
}

function showNewRunModal() {
    document.getElementById('runStart').value = '';
    document.getElementById('runEnd').value = '';
    document.getElementById('runCheckDate').value = '';
    document.getElementById('runNotes').value = '';
    document.getElementById('newRunModal').style.display = 'flex';
    // Load employees
    if (_allEmps.length) {
        _renderEmpChecklist();
        return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/payroll/summary', true);
    xhr.onload = function() {
        if (xhr.status === 200) {
            _allEmps = JSON.parse(xhr.responseText);
            _renderEmpChecklist();
        }
    };
    xhr.send();
}

function _renderEmpChecklist() {
    var cl = document.getElementById('empChecklist');
    cl.innerHTML = _allEmps.map(function(u) {
        return '<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--gray-100,#f1f5f9);cursor:pointer;">' +
            '<input type="checkbox" class="emp-cb" value="' + u.id + '" checked>' +
            '<span style="flex:1;">' + u.display_name + '</span>' +
            '<span class="badge" style="font-size:11px;">' + u.role.replace('_',' ') + '</span>' +
            '<span style="color:var(--gray-400);font-size:12px;">' + fmtMoney(u.hourly_rate) + '/hr</span>' +
        '</label>';
    }).join('');
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

function createRun() {
    var start = document.getElementById('runStart').value;
    var end = document.getElementById('runEnd').value;
    var checkDate = document.getElementById('runCheckDate').value;
    var notes = document.getElementById('runNotes').value.trim();
    if (!start || !end) { alert('Period start and end dates are required'); return; }
    var empIds = [];
    var cbs = document.querySelectorAll('.emp-cb:checked');
    for (var i = 0; i < cbs.length; i++) { empIds.push(parseInt(cbs[i].value)); }
    if (!empIds.length) { alert('Select at least one employee'); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/payroll/runs', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            var data = JSON.parse(xhr.responseText);
            if (data.id) {
                closeNewRunModal();
                window.location.href = '/payroll/runs/' + data.id;
            } else {
                alert(data.error || 'Failed to create run');
            }
        } else {
            try {
                var err = JSON.parse(xhr.responseText);
                alert(err.error || 'Failed to create run');
            } catch(e) {
                alert('Failed to create run (status ' + xhr.status + ')');
            }
        }
    };
    xhr.onerror = function() {
        alert('Network error creating run. Please try again.');
    };
    xhr.send(JSON.stringify({ period_start: start, period_end: end, check_date: checkDate, notes: notes, employee_ids: empIds }));
}

var _deleteRunId = null;
var _deleteFromDetail = false;

function deleteRun(id) {
    _deleteRunId = id;
    _deleteFromDetail = false;
    document.getElementById('deleteRunPassword').value = '';
    document.getElementById('deleteRunModal').style.display = 'flex';
}

function closeDeleteRunModal() {
    document.getElementById('deleteRunModal').style.display = 'none';
    _deleteRunId = null;
}

function confirmDeleteRun() {
    var pw = document.getElementById('deleteRunPassword').value;
    if (!pw) { alert('Password is required'); return; }
    var id = _deleteRunId;
    if (!id && typeof RUN_ID !== 'undefined') id = RUN_ID;
    var xhr = new XMLHttpRequest();
    xhr.open('DELETE', '/api/payroll/runs/' + id, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            closeDeleteRunModal();
            if (_deleteFromDetail) { window.location.href = '/payroll'; }
            else { loadRuns(); }
        } else {
            try { var err = JSON.parse(xhr.responseText); alert(err.error || 'Failed to delete'); }
            catch(e) { alert('Failed to delete'); }
        }
    };
    xhr.onerror = function() { alert('Network error deleting run.'); };
    xhr.send(JSON.stringify({ password: pw }));
}

// ─── Mass Timesheet (Detail Page) ───────────────────────────────
let _runData = null;
// Map of job name → job id for quick lookup
let _jobNameMap = {};
// Track whether copy-from-last was used
let _hasCopiedEntries = false;

if (typeof RUN_ID !== 'undefined') {
    loadRunDetail();
}

function loadRunDetail() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/payroll/runs/' + RUN_ID, true);
    xhr.onload = function() {
        if (xhr.status !== 200) { document.getElementById('timesheetContainer').innerHTML = '<p class="empty-state">Failed to load run.</p>'; return; }
        _runData = JSON.parse(xhr.responseText);
        _jobNameMap = {};
        _runData.available_jobs.forEach(function(j) { _jobNameMap[j.name] = j.id; });
        _hasCopiedEntries = false;
        renderRunHeader();
        buildTimesheetGrid();
    };
    xhr.onerror = function() { document.getElementById('timesheetContainer').innerHTML = '<p class="empty-state">Failed to load run.</p>'; };
    xhr.send();
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
    var actions = document.getElementById('runActions');
    if (run.status === 'Draft') {
        actions.innerHTML =
            '<button class="btn btn-secondary" onclick="copyFromLastPeriod()" title="Pre-fill grid from previous payroll run">Copy From Last Period</button>' +
            '<button class="btn btn-primary" onclick="saveTimesheet()">Save All</button>' +
            '<button class="btn btn-secondary" onclick="deleteRunDetail()" style="color:#EF4444;">Delete Run</button>';
    } else {
        actions.innerHTML = '<button class="btn btn-secondary" onclick="showPayrollSummary()">View Summary</button>' +
            '<button class="btn btn-secondary" onclick="reopenRun()">Reopen (Owner)</button>' +
            '<button class="btn btn-secondary" onclick="deleteRunDetail()" style="color:#EF4444;">Delete Run</button>';
    }
    recalcKpis();
}

function recalcKpis() {
    var emps = _runData.employees;
    var totalHours = 0, totalPay = 0;
    if (_runData.run.status === 'Finalized') {
        emps.forEach(function(e) { totalHours += e.total_hours || 0; totalPay += e.gross_pay || 0; });
    } else {
        emps.forEach(function(e) {
            var empHours = 0;
            document.querySelectorAll('.ts-cell-entries[data-uid="' + e.user_id + '"] .ts-hrs-cell').forEach(function(inp) {
                empHours += parseFloat(inp.value) || 0;
            });
            totalHours += empHours;
            totalPay += empHours * (e.hourly_rate || 0);
        });
    }
    document.getElementById('kpiEmployees').textContent = emps.length;
    document.getElementById('kpiHours').textContent = totalHours.toFixed(1) + 'h';
    document.getElementById('kpiPay').textContent = fmtMoney(totalPay);
}

function buildJobDatalistHTML() {
    return '<datalist id="jobList">' +
        _runData.available_jobs.map(function(j) { return '<option value="' + j.name + '">'; }).join('') +
        '</datalist>';
}

function buildTimesheetGrid() {
    var run = _runData.run, employees = _runData.employees, entries = _runData.entries,
        dates = _runData.dates, available_jobs = _runData.available_jobs;
    var isReadOnly = run.status === 'Finalized';
    var container = document.getElementById('timesheetContainer');

    // Group entries by user_id -> date -> [{job_id, job_name, hours}]
    var entryMap = {};
    entries.forEach(function(e) {
        if (!entryMap[e.user_id]) entryMap[e.user_id] = {};
        if (!entryMap[e.user_id][e.work_date]) entryMap[e.user_id][e.work_date] = [];
        var jobName = e.job_name || '';
        if (!jobName && e.job_id) {
            var found = available_jobs.find(function(j) { return j.id === e.job_id; });
            if (found) jobName = found.name;
        }
        if (e.hours > 0 || jobName) {
            entryMap[e.user_id][e.work_date].push({ job_id: e.job_id, job_name: jobName, hours: e.hours || 0 });
        }
    });

    // Format date headers
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var dateHeaders = dates.map(function(d) {
        var dt = new Date(d + 'T00:00:00');
        return dayNames[dt.getDay()] + '<br>' + (dt.getMonth()+1) + '/' + dt.getDate();
    });

    var tableMinWidth = 180 + dates.length * 140;
    var html = buildJobDatalistHTML();
    html += '<style>' +
        '.ts-cell { padding:4px !important; vertical-align:top; }' +
        '.ts-entry { margin-bottom:6px; padding:4px; background:var(--gray-50,#f8fafc); border-radius:6px; border:1px solid var(--gray-200,#e2e8f0); position:relative; }' +
        '.ts-entry:last-child { margin-bottom:0; }' +
        '.ts-entry[data-copied="true"] { background:#FFFBEB; border-color:#FCD34D; }' +
        '.ts-job-cell { width:100%; font-size:11px; padding:4px 6px; border:1px solid var(--gray-200,#e2e8f0); border-radius:4px; margin-bottom:4px; display:block; box-sizing:border-box; background:#fff; }' +
        '.ts-hrs-cell { width:100%; font-size:14px; padding:4px 6px; border:1px solid var(--gray-200,#e2e8f0); border-radius:4px; text-align:center; display:block; box-sizing:border-box; background:#fff; font-weight:600; }' +
        '.ts-add-btn { font-size:11px; color:var(--primary,#2563EB); cursor:pointer; border:none; background:none; padding:3px 0; display:block; }' +
        '.ts-add-btn:hover { text-decoration:underline; }' +
        '.ts-remove-entry { position:absolute; top:2px; right:4px; font-size:13px; color:#EF4444; cursor:pointer; border:none; background:none; padding:0 2px; line-height:1; }' +
        '.ts-readonly-entry { font-size:12px; margin-bottom:3px; padding:3px 6px; background:var(--gray-50,#f8fafc); border-radius:4px; }' +
        '.ts-readonly-entry .ts-ro-job { color:var(--gray-500); font-size:11px; display:block; }' +
        '.ts-readonly-entry .ts-ro-hrs { font-weight:600; }' +
        '.ts-emp-tools { margin-top:6px; display:flex; gap:4px; }' +
        '.ts-emp-tools button { font-size:10px; padding:2px 6px; border-radius:4px; border:1px solid var(--gray-300,#cbd5e1); background:#fff; cursor:pointer; color:var(--primary,#2563EB); }' +
        '.ts-emp-tools button:hover { background:var(--gray-50,#f8fafc); }' +
        '.ts-fill-popover { position:absolute; top:100%; left:0; z-index:10; background:#fff; border:1px solid var(--gray-200,#e2e8f0); border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); padding:12px; min-width:260px; }' +
        '.ts-fill-popover label { display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; }' +
        '.ts-fill-popover .form-input { font-size:13px; padding:4px 8px; }' +
        '.ts-grid tbody tr[data-uid] { border-bottom:3px solid var(--gray-300,#cbd5e1); }' +
        '.ts-grid tbody tr[data-uid]:last-child { border-bottom:none; }' +
        /* Freeze panes: sticky header row and sticky name column */
        '#tsScrollWrap { max-height:calc(100vh - 240px); overflow:auto; border:1px solid var(--gray-200,#e2e8f0); border-radius:8px; }' +
        '.ts-grid { border-collapse:separate !important; border-spacing:0; }' +
        '.ts-grid th, .ts-grid td { border-bottom:1px solid var(--gray-200,#e2e8f0); border-right:1px solid var(--gray-100,#f1f5f9); }' +
        '.ts-grid thead th { position:sticky !important; top:0; background:#4472C4 !important; color:#fff !important; z-index:3; border-bottom:2px solid var(--gray-300,#cbd5e1); }' +
        '.ts-grid thead th:first-child { z-index:4; left:0; position:sticky !important; }' +
        '.ts-grid tbody td:first-child { position:sticky !important; left:0; background:#fff !important; z-index:1; border-right:2px solid var(--gray-300,#cbd5e1) !important; }' +
        '.ts-grid tfoot td:first-child { position:sticky !important; left:0; z-index:1; }' +
        /* Top scrollbar */
        '#tsTopScroll { overflow-x:auto; overflow-y:hidden; margin-bottom:4px; }' +
        '#tsTopScrollInner { height:1px; }' +
        '</style>';

    /* Top scrollbar div that syncs with main container */
    html += '<div id="tsTopScroll"><div id="tsTopScrollInner" style="width:' + tableMinWidth + 'px;"></div></div>';
    html += '<div id="tsScrollWrap">';
    html += '<table class="data-table ts-grid" style="min-width:' + tableMinWidth + 'px;">' +
        '<thead><tr>' +
        '<th style="position:sticky;left:0;min-width:150px;">Employee</th>';
    dateHeaders.forEach(function(dh) {
        html += '<th style="min-width:130px;text-align:center;font-size:12px;">' + dh + '</th>';
    });
    html += '<th style="min-width:70px;text-align:right;">Total</th></tr></thead><tbody>';

    employees.forEach(function(emp) {
        var uid = emp.user_id;
        var userEntries = entryMap[uid] || {};
        html += '<tr data-uid="' + uid + '">';
        html += '<td style="font-weight:600;vertical-align:top;position:relative;">' +
            emp.display_name + '<br>' +
            '<span style="font-size:11px;color:var(--gray-400);font-weight:400;">' + fmtMoney(emp.hourly_rate) + '/hr</span>' +
            '<div class="ts-emp-subtotal" id="subtotal-' + uid + '" style="margin-top:6px;font-size:13px;color:var(--primary,#2563EB);"></div>';
        if (!isReadOnly) {
            html += '<div class="ts-emp-tools">' +
                '<button type="button" onclick="showFillWeek(' + uid + ', this)" title="Fill empty days with a job and hours">Fill</button>' +
                '<button type="button" onclick="copyDay(' + uid + ')" title="Copy first day with hours to all empty days">Copy &rarr;</button>' +
                '</div>';
        }
        html += '</td>';

        dates.forEach(function(d) {
            var dayEntries = userEntries[d] || [];
            html += '<td class="ts-cell">';
            if (isReadOnly) {
                if (dayEntries.length) {
                    dayEntries.forEach(function(de) {
                        html += '<div class="ts-readonly-entry"><span class="ts-ro-job">' + (de.job_name || '-') + '</span><span class="ts-ro-hrs">' + de.hours + 'h</span></div>';
                    });
                }
            } else {
                html += '<div class="ts-cell-entries" data-uid="' + uid + '" data-date="' + d + '">';
                if (dayEntries.length) {
                    dayEntries.forEach(function(de) {
                        html += buildEntryRow(uid, d, de.job_name, de.hours);
                    });
                } else {
                    html += buildEntryRow(uid, d, '', '');
                }
                html += '<button type="button" class="ts-add-btn" onclick="addCellEntry(this)">+ add</button>';
                html += '</div>';
            }
            html += '</td>';
        });

        html += '<td style="text-align:right;font-weight:600;vertical-align:top;" class="ts-emp-total" data-uid="' + uid + '">0</td>';
        html += '</tr>';
    });

    // Day totals row
    html += '<tr style="background:var(--gray-50,#f8fafc);font-weight:700;border-top:2px solid var(--gray-300,#cbd5e1);">' +
        '<td style="background:var(--gray-50,#f8fafc);">Totals</td>';
    dates.forEach(function(d) {
        html += '<td style="text-align:center;" class="ts-day-total" data-date="' + d + '">0</td>';
    });
    html += '<td style="text-align:right;" id="grandTotal">0</td></tr>';

    html += '</tbody></table></div>'; /* close tsScrollWrap */
    container.innerHTML = html;

    // Sync top scrollbar with main container
    var topScroll = document.getElementById('tsTopScroll');
    var mainScroll = document.getElementById('tsScrollWrap');
    if (topScroll && mainScroll) {
        var syncing = false;
        topScroll.addEventListener('scroll', function() {
            if (syncing) return;
            syncing = true;
            mainScroll.scrollLeft = topScroll.scrollLeft;
            syncing = false;
        });
        mainScroll.addEventListener('scroll', function() {
            if (syncing) return;
            syncing = true;
            topScroll.scrollLeft = mainScroll.scrollLeft;
            syncing = false;
        });
    }
    recalcTotals();
}

function buildEntryRow(uid, date, jobName, hours, isCopied) {
    return '<div class="ts-entry"' + (isCopied ? ' data-copied="true"' : '') + '>' +
        '<button type="button" class="ts-remove-entry" onclick="removeCellEntry(this)">&times;</button>' +
        '<select class="ts-job-cell" style="display:' + (jobName && !_jobNameMap[jobName] ? 'none' : 'block') + ';" onchange="markEdited(this);if(this.value===\'__type__\'){this.style.display=\'none\';this.nextElementSibling.style.display=\'block\';this.nextElementSibling.focus();}">' +
            '<option value="">-- Project --</option>' +
            _runData.available_jobs.map(function(j) { return '<option value="' + j.name + '"' + (j.name === jobName ? ' selected' : '') + '>' + j.name + '</option>'; }).join('') +
            '<option value="__type__">Type custom...</option>' +
        '</select>' +
        '<input type="text" class="ts-job-cell ts-job-custom" value="' + (jobName && !_jobNameMap[jobName] ? jobName : '') + '" placeholder="Type project name..." style="display:' + (jobName && !_jobNameMap[jobName] ? 'block' : 'none') + ';" oninput="markEdited(this)">' +
        '<input type="number" class="ts-hrs-cell" step="any" min="0" max="24" value="' + (hours || '') + '" placeholder="0" oninput="markEdited(this);recalcTotals()">' +
        '</div>';
}

// Clear copied marker when user edits a cell
function markEdited(el) {
    var entry = el.closest('.ts-entry');
    if (entry && entry.dataset.copied) {
        delete entry.dataset.copied;
        entry.removeAttribute('data-copied');
    }
}

function addCellEntry(btn) {
    var container = btn.parentNode;
    var uid = container.dataset.uid;
    var date = container.dataset.date;
    var entryHtml = buildEntryRow(uid, date, '', '');
    var temp = document.createElement('div');
    temp.innerHTML = entryHtml;
    container.insertBefore(temp.firstChild, btn);
}

function removeCellEntry(btn) {
    var entry = btn.parentNode;
    var container = entry.parentNode;
    var entryCount = container.querySelectorAll('.ts-entry').length;
    if (entryCount <= 1) {
        // Don't remove last entry, just clear it
        entry.querySelector('.ts-job-cell').value = '';
        entry.querySelector('.ts-hrs-cell').value = '';
    } else {
        entry.remove();
    }
    recalcTotals();
}

function recalcTotals() {
    var dates = _runData.dates;
    var employees = _runData.employees;
    var grandTotal = 0;

    employees.forEach(function(emp) {
        var empTotal = 0;
        document.querySelectorAll('.ts-cell-entries[data-uid="' + emp.user_id + '"] .ts-hrs-cell').forEach(function(inp) {
            empTotal += parseFloat(inp.value) || 0;
        });
        var sub = document.getElementById('subtotal-' + emp.user_id);
        if (sub) sub.textContent = empTotal.toFixed(1) + 'h = ' + fmtMoney(empTotal * (emp.hourly_rate || 0));
        var totalCell = document.querySelector('.ts-emp-total[data-uid="' + emp.user_id + '"]');
        if (totalCell) totalCell.textContent = empTotal.toFixed(1);
        grandTotal += empTotal;
    });

    dates.forEach(function(d) {
        var dayTotal = 0;
        document.querySelectorAll('.ts-cell-entries[data-date="' + d + '"] .ts-hrs-cell').forEach(function(inp) {
            dayTotal += parseFloat(inp.value) || 0;
        });
        var cell = document.querySelector('.ts-day-total[data-date="' + d + '"]');
        if (cell) cell.textContent = dayTotal.toFixed(1);
    });

    var gt = document.getElementById('grandTotal');
    if (gt) gt.textContent = grandTotal.toFixed(1);

    recalcKpis();
}

// ─── Copy From Last Period ───────────────────────────────────────
function copyFromLastPeriod() {
    // Check if grid already has data
    var hasData = false;
    document.querySelectorAll('.ts-hrs-cell').forEach(function(inp) {
        if (parseFloat(inp.value) > 0) hasData = true;
    });
    if (hasData && !confirm('The timesheet already has entries. Copy from last period will overwrite empty cells. Continue?')) return;

    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/payroll/runs/' + RUN_ID + '/copy-previous', true);
    xhr.onload = function() {
        if (xhr.status !== 200) {
            try { var err = JSON.parse(xhr.responseText); alert(err.error || 'Failed to copy'); }
            catch(e) { alert('Failed to copy from previous period'); }
            return;
        }
        var data = JSON.parse(xhr.responseText);
        if (!data.entries || !data.entries.length) {
            alert('No entries found in the previous payroll run.');
            return;
        }
        // Group by user_id -> date -> entries
        var copyMap = {};
        data.entries.forEach(function(e) {
            if (!copyMap[e.user_id]) copyMap[e.user_id] = {};
            if (!copyMap[e.user_id][e.work_date]) copyMap[e.user_id][e.work_date] = [];
            copyMap[e.user_id][e.work_date].push(e);
        });
        var filledCount = 0;
        // Populate grid cells
        Object.keys(copyMap).forEach(function(uid) {
            Object.keys(copyMap[uid]).forEach(function(date) {
                var container = document.querySelector('.ts-cell-entries[data-uid="' + uid + '"][data-date="' + date + '"]');
                if (!container) return;
                // Check if cell is empty (only one entry with no job and no hours)
                var existingEntries = container.querySelectorAll('.ts-entry');
                var isEmpty = true;
                existingEntries.forEach(function(div) {
                    var sel = div.querySelector('select.ts-job-cell');
                    var hrs = div.querySelector('.ts-hrs-cell');
                    if ((sel && sel.value) || (hrs && parseFloat(hrs.value) > 0)) isEmpty = false;
                });
                if (!isEmpty) return;

                // Remove existing empty entries
                existingEntries.forEach(function(div) { div.remove(); });
                var addBtn = container.querySelector('.ts-add-btn');

                // Add copied entries
                copyMap[uid][date].forEach(function(e) {
                    var entryHtml = buildEntryRow(uid, date, e.job_name, e.hours, true);
                    var temp = document.createElement('div');
                    temp.innerHTML = entryHtml;
                    container.insertBefore(temp.firstChild, addBtn);
                    filledCount++;
                });
            });
        });
        _hasCopiedEntries = true;
        recalcTotals();
        pageToast('Copied ' + filledCount + ' entries from Run #' + data.from_run);
    };
    xhr.onerror = function() { alert('Network error copying from previous period.'); };
    xhr.send();
}

// ─── Fill Week (per employee) ────────────────────────────────────
function showFillWeek(uid, btn) {
    // Close any existing popover
    var existing = document.querySelector('.ts-fill-popover');
    if (existing) existing.remove();

    var td = btn.closest('td');
    var popover = document.createElement('div');
    popover.className = 'ts-fill-popover';

    // Build day checkboxes from the dates
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var dayCbs = _runData.dates.map(function(d, i) {
        var dt = new Date(d + 'T00:00:00');
        var dayIdx = dt.getDay();
        var checked = (dayIdx >= 1 && dayIdx <= 5) ? 'checked' : '';
        return '<label><input type="checkbox" class="fill-day-cb" value="' + i + '" ' + checked + '> ' +
            dayNames[dayIdx] + ' ' + (dt.getMonth()+1) + '/' + dt.getDate() + '</label>';
    });

    // Build job dropdown
    var jobOptions = '<option value="">-- Select Project --</option>' +
        _runData.available_jobs.map(function(j) { return '<option value="' + j.name + '">' + j.name + '</option>'; }).join('');

    popover.innerHTML =
        '<div style="font-weight:600;margin-bottom:8px;font-size:13px;">Quick Fill</div>' +
        '<div style="margin-bottom:8px;">' +
            '<label class="form-label" style="font-size:11px;">Project</label>' +
            '<select class="form-input fill-job-select" style="font-size:13px;padding:4px 8px;">' + jobOptions + '</select>' +
        '</div>' +
        '<div style="margin-bottom:8px;">' +
            '<label class="form-label" style="font-size:11px;">Hours</label>' +
            '<input type="number" class="form-input fill-hours-input" step="any" min="0" max="24" value="8" style="font-size:13px;padding:4px 8px;">' +
        '</div>' +
        '<div style="margin-bottom:8px;max-height:180px;overflow-y:auto;">' +
            '<label class="form-label" style="font-size:11px;">Days</label>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;">' + dayCbs.join('') + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;">' +
            '<button type="button" class="btn btn-primary btn-small" onclick="applyFillWeek(' + uid + ', this)">Apply</button>' +
            '<button type="button" class="btn btn-secondary btn-small" onclick="this.closest(\'.ts-fill-popover\').remove()">Cancel</button>' +
        '</div>';

    td.appendChild(popover);

    // Close on click outside
    setTimeout(function() {
        document.addEventListener('click', function closePopover(e) {
            if (!popover.contains(e.target) && e.target !== btn) {
                popover.remove();
                document.removeEventListener('click', closePopover);
            }
        });
    }, 10);
}

function applyFillWeek(uid, btn) {
    var popover = btn.closest('.ts-fill-popover');
    var jobName = popover.querySelector('.fill-job-select').value;
    var hours = parseFloat(popover.querySelector('.fill-hours-input').value) || 0;
    if (!jobName) { alert('Please select a project'); return; }
    if (!hours) { alert('Please enter hours'); return; }

    var checkedDays = [];
    popover.querySelectorAll('.fill-day-cb:checked').forEach(function(cb) {
        checkedDays.push(parseInt(cb.value));
    });
    if (!checkedDays.length) { alert('Please select at least one day'); return; }

    var filledCount = 0;
    checkedDays.forEach(function(dayIdx) {
        var date = _runData.dates[dayIdx];
        var container = document.querySelector('.ts-cell-entries[data-uid="' + uid + '"][data-date="' + date + '"]');
        if (!container) return;

        // Check if cell is empty
        var entries = container.querySelectorAll('.ts-entry');
        var isEmpty = true;
        entries.forEach(function(div) {
            var sel = div.querySelector('select.ts-job-cell');
            var hrs = div.querySelector('.ts-hrs-cell');
            if ((sel && sel.value) || (hrs && parseFloat(hrs.value) > 0)) isEmpty = false;
        });
        if (!isEmpty) return;

        // Fill the first empty entry
        var firstEntry = entries[0];
        if (firstEntry) {
            var sel = firstEntry.querySelector('select.ts-job-cell');
            if (sel) sel.value = jobName;
            var hrs = firstEntry.querySelector('.ts-hrs-cell');
            if (hrs) hrs.value = hours;
        }
        filledCount++;
    });

    popover.remove();
    recalcTotals();
    pageToast('Filled ' + filledCount + ' days with ' + hours + 'h on ' + jobName);
}

// ─── Copy Day (per employee) ─────────────────────────────────────
function copyDay(uid) {
    // Find first day with hours > 0
    var sourceDate = null;
    var sourceEntries = [];
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    for (var i = 0; i < _runData.dates.length; i++) {
        var d = _runData.dates[i];
        var container = document.querySelector('.ts-cell-entries[data-uid="' + uid + '"][data-date="' + d + '"]');
        if (!container) continue;
        var entries = container.querySelectorAll('.ts-entry');
        var dayHasHours = false;
        var dayData = [];
        entries.forEach(function(div) {
            var sel = div.querySelector('select.ts-job-cell');
            var customInput = div.querySelector('.ts-job-custom');
            var jobName = '';
            if (sel && sel.value && sel.value !== '__type__') {
                jobName = sel.value;
            } else if (customInput && customInput.value.trim()) {
                jobName = customInput.value.trim();
            }
            var hrs = parseFloat(div.querySelector('.ts-hrs-cell').value) || 0;
            if (hrs > 0 && jobName) {
                dayHasHours = true;
                dayData.push({ job_name: jobName, hours: hrs });
            }
        });
        if (dayHasHours) {
            sourceDate = d;
            sourceEntries = dayData;
            break;
        }
    }

    if (!sourceDate) {
        alert('No day with hours found for this employee. Enter hours on at least one day first.');
        return;
    }

    var sourceDt = new Date(sourceDate + 'T00:00:00');
    var sourceDayName = dayNames[sourceDt.getDay()];
    var filledCount = 0;

    for (var i = 0; i < _runData.dates.length; i++) {
        var d = _runData.dates[i];
        if (d === sourceDate) continue;
        var container = document.querySelector('.ts-cell-entries[data-uid="' + uid + '"][data-date="' + d + '"]');
        if (!container) continue;

        // Check if empty
        var entries = container.querySelectorAll('.ts-entry');
        var isEmpty = true;
        entries.forEach(function(div) {
            var sel = div.querySelector('select.ts-job-cell');
            var hrs = div.querySelector('.ts-hrs-cell');
            if ((sel && sel.value) || (hrs && parseFloat(hrs.value) > 0)) isEmpty = false;
        });
        if (!isEmpty) continue;

        // Remove empty entries
        entries.forEach(function(div) { div.remove(); });
        var addBtn = container.querySelector('.ts-add-btn');

        // Copy source entries
        sourceEntries.forEach(function(se) {
            var entryHtml = buildEntryRow(uid, d, se.job_name, se.hours);
            var temp = document.createElement('div');
            temp.innerHTML = entryHtml;
            container.insertBefore(temp.firstChild, addBtn);
        });
        filledCount++;
    }

    recalcTotals();
    pageToast('Copied ' + sourceDayName + ' to ' + filledCount + ' other days');
}

// ─── Unchanged entry warning check ──────────────────────────────
function checkUnchangedCopied() {
    if (!_hasCopiedEntries) return true;
    var unchangedCount = 0;
    document.querySelectorAll('.ts-entry[data-copied="true"]').forEach(function(div) {
        var hrs = div.querySelector('.ts-hrs-cell');
        if (hrs && parseFloat(hrs.value) > 0) unchangedCount++;
    });
    if (unchangedCount > 0) {
        return confirm(unchangedCount + ' entries were copied from last period and not changed. Confirm they are correct?');
    }
    return true;
}

function saveTimesheet(callback) {
    // Check unchanged copied entries
    if (!callback && !checkUnchangedCopied()) return;

    // Collect entries from per-day cells
    var entries = [];
    var missingProject = false;
    var cellContainers = document.querySelectorAll('.ts-cell-entries');
    cellContainers.forEach(function(container) {
        var uid = parseInt(container.dataset.uid);
        var date = container.dataset.date;
        var entryDivs = container.querySelectorAll('.ts-entry');
        entryDivs.forEach(function(div) {
            var sel = div.querySelector('select.ts-job-cell');
            var customInput = div.querySelector('.ts-job-custom');
            var jobName = '';
            if (sel && sel.value && sel.value !== '__type__') {
                jobName = sel.value.trim();
            } else if (customInput && customInput.value.trim()) {
                jobName = customInput.value.trim();
            }
            var hours = parseFloat(div.querySelector('.ts-hrs-cell').value) || 0;
            if (hours > 0 && !jobName) { missingProject = true; return; }
            if (!jobName && !hours) return;
            var jobId = _jobNameMap[jobName] || 0;
            var entry = { user_id: uid, work_date: date, hours: hours };
            if (jobId) { entry.job_id = jobId; }
            else { entry.job_name = jobName; }
            entries.push(entry);
        });
    });
    if (missingProject) { alert('Some entries have hours but no project. Please assign a project to all entries with hours.'); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/payroll/runs/' + RUN_ID + '/timesheet', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            var data = JSON.parse(xhr.responseText);
            if (data.new_jobs) {
                data.new_jobs.forEach(function(j) { _jobNameMap[j.name] = j.id; });
                _runData.available_jobs = _runData.available_jobs.concat(data.new_jobs);
                var dl = document.getElementById('jobList');
                if (dl) {
                    data.new_jobs.forEach(function(j) {
                        var opt = document.createElement('option');
                        opt.value = j.name;
                        dl.appendChild(opt);
                    });
                }
            }
            // Clear copied markers after successful save
            document.querySelectorAll('.ts-entry[data-copied="true"]').forEach(function(div) {
                delete div.dataset.copied;
                div.removeAttribute('data-copied');
            });
            _hasCopiedEntries = false;
            pageToast('Timesheet saved successfully');
            if (callback) callback();
            else showPayrollSummary();
        } else {
            try { var err = JSON.parse(xhr.responseText); alert(err.error || 'Failed to save'); }
            catch(e) { alert('Failed to save timesheet'); }
        }
    };
    xhr.onerror = function() { alert('Network error saving timesheet.'); };
    xhr.send(JSON.stringify({ entries: entries }));
}

function pageToast(msg) {
    window._toastShown = true;
    window.showToast(msg);
}

function finalizeFromSummary() {
    if (!confirm('Finalize this payroll run? All entries will be approved and locked.')) return;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/payroll/runs/' + RUN_ID + '/finalize', true);
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            closePayrollSummary();
            pageToast('Payroll run finalized');
            loadRunDetail();
        } else {
            try { var err = JSON.parse(xhr.responseText); alert(err.error || 'Failed to finalize'); }
            catch(e) { alert('Failed to finalize'); }
        }
    };
    xhr.onerror = function() { alert('Network error finalizing run.'); };
    xhr.send();
}

// ─── Payroll Summary Modal ──────────────────────────────────────
function showPayrollSummary() {
    var run = _runData.run;
    var employees = _runData.employees;
    var isFinalized = run.status === 'Finalized';

    // Header
    document.getElementById('summaryTitle').textContent = 'Payroll Summary \u2014 ' + formatPeriod(run.period_start, run.period_end);
    document.getElementById('summarySubheader').textContent = 'Run #' + run.run_number + (run.check_date ? ' | Check Date: ' + run.check_date : '');

    // Build rows
    var rows = [];
    var totalHours = 0, totalPay = 0;

    employees.forEach(function(emp) {
        var empHours = 0, empPay = 0;
        if (isFinalized) {
            empHours = emp.total_hours || 0;
            empPay = emp.gross_pay || 0;
        } else {
            document.querySelectorAll('.ts-cell-entries[data-uid="' + emp.user_id + '"] .ts-hrs-cell').forEach(function(inp) {
                empHours += parseFloat(inp.value) || 0;
            });
            empPay = empHours * (emp.hourly_rate || 0);
        }
        totalHours += empHours;
        totalPay += empPay;
        rows.push({ name: emp.display_name, rate: emp.hourly_rate || 0, hours: empHours, pay: empPay });
    });

    document.getElementById('summaryBody').innerHTML = rows.map(function(r) {
        return '<tr>' +
            '<td>' + r.name + '</td>' +
            '<td style="text-align:right;">' + fmtMoney(r.rate) + '</td>' +
            '<td style="text-align:right;">' + r.hours.toFixed(1) + '</td>' +
            '<td style="text-align:right;">' + fmtMoney(r.pay) + '</td>' +
        '</tr>';
    }).join('');

    document.getElementById('summaryTotalHours').textContent = totalHours.toFixed(1);
    document.getElementById('summaryTotalPay').textContent = fmtMoney(totalPay);

    // Finalized info
    var infoEl = document.getElementById('summaryFinalizedInfo');
    if (isFinalized) {
        infoEl.style.display = 'block';
        infoEl.textContent = 'Finalized' + (run.finalized_by ? ' by ' + run.finalized_by : '') + (run.finalized_at ? ' on ' + run.finalized_at : '');
    } else {
        infoEl.style.display = 'none';
    }

    // Show/hide Finalize button
    document.getElementById('summaryFinalizeBtn').style.display = isFinalized ? 'none' : '';

    document.getElementById('payrollSummaryModal').style.display = 'flex';
}

function closePayrollSummary() {
    document.getElementById('payrollSummaryModal').style.display = 'none';
}

function reopenRun() {
    if (!confirm('Reopen this payroll run? This is an owner-only action.')) return;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/payroll/runs/' + RUN_ID + '/reopen', true);
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            pageToast('Payroll run reopened');
            loadRunDetail();
        } else {
            try { var err = JSON.parse(xhr.responseText); alert(err.error || 'Failed to reopen'); }
            catch(e) { alert('Failed to reopen'); }
        }
    };
    xhr.onerror = function() { alert('Network error reopening run.'); };
    xhr.send();
}

function deleteRunDetail() {
    _deleteRunId = RUN_ID;
    _deleteFromDetail = true;
    document.getElementById('deleteRunPassword').value = '';
    document.getElementById('deleteRunModal').style.display = 'flex';
}
