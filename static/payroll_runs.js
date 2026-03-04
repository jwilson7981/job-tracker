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
                    (r.status === 'Draft' ? ' <button class="btn btn-small btn-secondary" onclick="deleteRun(' + r.id + ')" style="color:#EF4444;">Del</button>' : '') +
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

function deleteRun(id) {
    if (!confirm('Delete this payroll run? This cannot be undone.')) return;
    var xhr = new XMLHttpRequest();
    xhr.open('DELETE', '/api/payroll/runs/' + id, true);
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) { loadRuns(); }
        else { try { var err = JSON.parse(xhr.responseText); alert(err.error || 'Failed to delete'); } catch(e) { alert('Failed to delete'); } }
    };
    xhr.onerror = function() { alert('Network error deleting run.'); };
    xhr.send();
}

// ─── Mass Timesheet (Detail Page) ───────────────────────────────
let _runData = null;
// Map of job name → job id for quick lookup
let _jobNameMap = {};

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

    var html = buildJobDatalistHTML();
    html += '<style>' +
        '.ts-cell { padding:4px !important; vertical-align:top; }' +
        '.ts-entry { display:flex; gap:3px; align-items:center; margin-bottom:3px; }' +
        '.ts-entry:last-child { margin-bottom:0; }' +
        '.ts-job-cell { width:100px; font-size:11px; padding:3px 4px; border:1px solid var(--gray-200,#e2e8f0); border-radius:4px; }' +
        '.ts-hrs-cell { width:48px; font-size:12px; padding:3px 4px; border:1px solid var(--gray-200,#e2e8f0); border-radius:4px; text-align:center; }' +
        '.ts-add-btn { font-size:10px; color:var(--primary,#2563EB); cursor:pointer; border:none; background:none; padding:2px 0; }' +
        '.ts-add-btn:hover { text-decoration:underline; }' +
        '.ts-remove-entry { font-size:11px; color:#EF4444; cursor:pointer; border:none; background:none; padding:0 2px; line-height:1; }' +
        '.ts-readonly-entry { font-size:11px; margin-bottom:2px; }' +
        '.ts-readonly-entry span { color:var(--gray-500); }' +
        '</style>';

    html += '<table class="data-table ts-grid" style="min-width:' + (180 + dates.length * 165) + 'px;">' +
        '<thead><tr>' +
        '<th style="position:sticky;left:0;background:var(--gray-50,#f8fafc);z-index:2;min-width:160px;">Employee</th>';
    dateHeaders.forEach(function(dh) {
        html += '<th style="min-width:155px;text-align:center;font-size:12px;">' + dh + '</th>';
    });
    html += '<th style="min-width:80px;text-align:right;">Total</th></tr></thead><tbody>';

    employees.forEach(function(emp) {
        var uid = emp.user_id;
        var userEntries = entryMap[uid] || {};
        html += '<tr data-uid="' + uid + '">';
        html += '<td style="position:sticky;left:0;background:#fff;z-index:1;font-weight:600;vertical-align:top;">' +
            emp.display_name + '<br>' +
            '<span style="font-size:11px;color:var(--gray-400);font-weight:400;">' + fmtMoney(emp.hourly_rate) + '/hr</span>' +
            '<div class="ts-emp-subtotal" id="subtotal-' + uid + '" style="margin-top:6px;font-size:13px;color:var(--primary,#2563EB);"></div>' +
            '</td>';

        dates.forEach(function(d) {
            var dayEntries = userEntries[d] || [];
            html += '<td class="ts-cell">';
            if (isReadOnly) {
                if (dayEntries.length) {
                    dayEntries.forEach(function(de) {
                        html += '<div class="ts-readonly-entry"><strong>' + de.hours + 'h</strong> <span>' + (de.job_name || '-') + '</span></div>';
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
        '<td style="position:sticky;left:0;background:var(--gray-50,#f8fafc);z-index:1;">Totals</td>';
    dates.forEach(function(d) {
        html += '<td style="text-align:center;" class="ts-day-total" data-date="' + d + '">0</td>';
    });
    html += '<td style="text-align:right;" id="grandTotal">0</td></tr>';

    html += '</tbody></table>';
    container.innerHTML = html;
    recalcTotals();
}

function buildEntryRow(uid, date, jobName, hours) {
    return '<div class="ts-entry">' +
        '<input type="text" class="ts-job-cell" list="jobList" value="' + (jobName || '') + '" placeholder="Project">' +
        '<input type="number" class="ts-hrs-cell" step="any" min="0" max="24" value="' + (hours || '') + '" placeholder="hrs" oninput="recalcTotals()">' +
        '<button type="button" class="ts-remove-entry" onclick="removeCellEntry(this)">&times;</button>' +
        '</div>';
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

function saveTimesheet(callback) {
    // Collect entries from per-day cells
    var entries = [];
    var missingProject = false;
    var cellContainers = document.querySelectorAll('.ts-cell-entries');
    cellContainers.forEach(function(container) {
        var uid = parseInt(container.dataset.uid);
        var date = container.dataset.date;
        var entryDivs = container.querySelectorAll('.ts-entry');
        entryDivs.forEach(function(div) {
            var jobName = div.querySelector('.ts-job-cell').value.trim();
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
            showToast('Timesheet saved successfully');
            if (callback) callback();
        } else {
            try { var err = JSON.parse(xhr.responseText); alert(err.error || 'Failed to save'); }
            catch(e) { alert('Failed to save timesheet'); }
        }
    };
    xhr.onerror = function() { alert('Network error saving timesheet.'); };
    xhr.send(JSON.stringify({ entries: entries }));
}

function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#059669;color:#fff;padding:10px 24px;border-radius:8px;font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function finalizeRun() {
    if (!confirm('Finalize this payroll run? All entries will be approved and locked.')) return;
    saveTimesheet(function() {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/payroll/runs/' + RUN_ID + '/finalize', true);
        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                showToast('Payroll run finalized');
                loadRunDetail();
            } else {
                try { var err = JSON.parse(xhr.responseText); alert(err.error || 'Failed to finalize'); }
                catch(e) { alert('Failed to finalize'); }
            }
        };
        xhr.onerror = function() { alert('Network error finalizing run.'); };
        xhr.send();
    });
}

function reopenRun() {
    if (!confirm('Reopen this payroll run? This is an owner-only action.')) return;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/payroll/runs/' + RUN_ID + '/reopen', true);
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            showToast('Payroll run reopened');
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
    if (!confirm('Delete this payroll run? This cannot be undone.')) return;
    var xhr = new XMLHttpRequest();
    xhr.open('DELETE', '/api/payroll/runs/' + RUN_ID, true);
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) window.location.href = '/payroll';
        else { try { var err = JSON.parse(xhr.responseText); alert(err.error || 'Failed to delete'); } catch(e) { alert('Failed to delete'); } }
    };
    xhr.onerror = function() { alert('Network error deleting run.'); };
    xhr.send();
}
