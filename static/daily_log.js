/* Daily Crew Log */

var currentDate = new Date().toISOString().split('T')[0];
var employees = [];
var jobs = [];
var logData = {}; // keyed by user_id -> [{job_id, hours, notes}]

function initials(name) {
    if (!name) return '?';
    return name.split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().substring(0, 2);
}

function formatDate(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

function changeDate(offset) {
    var d = new Date(currentDate + 'T12:00:00');
    d.setDate(d.getDate() + offset);
    currentDate = d.toISOString().split('T')[0];
    loadDate(currentDate);
}

function goToday() {
    currentDate = new Date().toISOString().split('T')[0];
    loadDate(currentDate);
}

function loadDate(dateStr) {
    currentDate = dateStr;
    document.getElementById('datePicker').value = currentDate;
    document.getElementById('dateLabel').textContent = formatDate(currentDate);
    loadDailyLog();
}

async function loadDailyLog() {
    var res = await fetch('/api/daily-log?date=' + currentDate);
    var d = await res.json();
    employees = d.employees;
    jobs = d.jobs;

    // Build logData from existing logs
    logData = {};
    d.logs.forEach(function(l) {
        if (!logData[l.user_id]) logData[l.user_id] = [];
        logData[l.user_id].push({ job_id: l.job_id, hours: l.hours, notes: l.notes || '' });
    });

    renderGrid();
    updateSummary();
}

function renderGrid() {
    var html = '';
    employees.forEach(function(emp) {
        var assigns = logData[emp.id] || [];
        var hasAssign = assigns.length > 0;
        var rowClass = hasAssign ? '' : 'log-row-off';

        html += '<tr class="' + rowClass + '" data-uid="' + emp.id + '">';
        // Employee
        html += '<td><div style="display:flex;align-items:center;gap:10px;">' +
            '<div class="emp-avatar">' + initials(emp.display_name) + '</div>' +
            '<div><div class="emp-name">' + esc(emp.display_name) + '</div>' +
            '<div class="emp-role">' + esc(emp.role) + (emp.hourly_rate ? ' &middot; $' + Number(emp.hourly_rate).toFixed(2) + '/hr' : '') + '</div>' +
            '</div></div></td>';

        // Assignments
        html += '<td><div class="assign-list" id="assigns-' + emp.id + '">';
        if (assigns.length === 0) {
            html += '<div class="assign-row" data-idx="0">' + assignRowHtml(emp.id, 0, null, 8, '') + '</div>';
        } else {
            assigns.forEach(function(a, i) {
                html += '<div class="assign-row" data-idx="' + i + '">' + assignRowHtml(emp.id, i, a.job_id, a.hours, a.notes) + '</div>';
            });
        }
        html += '<button class="add-assign-btn" onclick="addAssignment(' + emp.id + ')">+ Add project</button>';
        html += '</div></td>';

        // Hours (total)
        var totalHours = assigns.reduce(function(s, a) { return s + (a.hours || 0); }, 0);
        html += '<td style="text-align:center;font-weight:700;font-size:15px;" id="hours-' + emp.id + '">' +
            (totalHours > 0 ? totalHours.toFixed(1) : '-') + '</td>';

        // Notes (first assignment)
        html += '<td>' + (assigns.length > 0 ? '<input type="text" class="form-input" style="font-size:12px;padding:4px 8px;" value="' +
            esc(assigns[0].notes) + '" onchange="updateNote(' + emp.id + ',0,this.value)" placeholder="Notes...">' : '') + '</td>';

        // Status + clear button
        html += '<td style="text-align:center;">';
        if (hasAssign) {
            html += '<span class="status-dot" style="background:#22C55E;"></span>' +
                '<button class="remove-assign" onclick="clearEmployee(' + emp.id + ')" title="Clear all assignments" style="margin-left:4px;">&#128465;</button>';
        } else {
            html += '<span class="status-dot" style="background:var(--gray-300);"></span>';
        }
        html += '</td>';
        html += '</tr>';
    });

    if (!employees.length) {
        html = '<tr><td colspan="5" class="empty-state">No active employees found.</td></tr>';
    }
    document.getElementById('logBody').innerHTML = html;
}

function assignRowHtml(empId, idx, jobId, hours, notes) {
    var sel = '<select class="form-select" style="font-size:13px;padding:4px 8px;min-width:200px;" ' +
        'onchange="updateAssign(' + empId + ',' + idx + ',\'job\',this.value)">' +
        '<option value="">-- Select Project --</option>';
    jobs.forEach(function(j) {
        sel += '<option value="' + j.id + '"' + (j.id === jobId ? ' selected' : '') + '>' + esc(j.name) + '</option>';
    });
    sel += '</select>';

    var hInput = '<input type="number" class="form-input" style="font-size:13px;padding:4px 8px;width:65px;text-align:center;" ' +
        'value="' + (hours || 8) + '" min="0" max="24" step="0.5" ' +
        'onchange="updateAssign(' + empId + ',' + idx + ',\'hours\',this.value)">';

    var removeBtn = '<button class="remove-assign" onclick="removeAssignment(' + empId + ',' + idx + ')" title="Remove">&times;</button>';

    return sel + hInput + removeBtn;
}

function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function updateAssign(empId, idx, field, value) {
    if (!logData[empId]) logData[empId] = [];
    // Ensure row exists
    while (logData[empId].length <= idx) {
        logData[empId].push({ job_id: null, hours: 8, notes: '' });
    }
    if (field === 'job') {
        logData[empId][idx].job_id = value ? parseInt(value) : null;
    } else if (field === 'hours') {
        logData[empId][idx].hours = parseFloat(value) || 0;
    }
    // Clean up empty entries
    logData[empId] = logData[empId].filter(function(a) { return a.job_id || a.hours > 0; });
    updateEmployeeHours(empId);
    updateSummary();
    updateRowStyle(empId);
}

function updateNote(empId, idx, value) {
    if (!logData[empId] || !logData[empId][idx]) return;
    logData[empId][idx].notes = value;
}

function updateEmployeeHours(empId) {
    var assigns = logData[empId] || [];
    var total = assigns.reduce(function(s, a) { return s + (a.hours || 0); }, 0);
    var el = document.getElementById('hours-' + empId);
    if (el) el.textContent = total > 0 ? total.toFixed(1) : '-';
}

function updateRowStyle(empId) {
    var row = document.querySelector('tr[data-uid="' + empId + '"]');
    if (!row) return;
    var assigns = logData[empId] || [];
    var hasAssign = assigns.some(function(a) { return a.job_id; });
    row.className = hasAssign ? '' : 'log-row-off';
}

function addAssignment(empId) {
    if (!logData[empId]) logData[empId] = [];
    logData[empId].push({ job_id: null, hours: 8, notes: '' });
    renderGrid();
}

function removeAssignment(empId, idx) {
    if (!logData[empId]) return;
    logData[empId].splice(idx, 1);
    renderGrid();
    updateSummary();
}

function clearEmployee(empId) {
    if (!confirm('Clear all assignments for this employee?')) return;
    logData[empId] = [];
    renderGrid();
    updateSummary();
}

async function copyPreviousDay() {
    var d = new Date(currentDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    var prevDate = d.toISOString().split('T')[0];
    var res = await fetch('/api/daily-log?date=' + prevDate);
    var prev = await res.json();
    if (!prev.logs || prev.logs.length === 0) {
        alert('No entries found for ' + formatDate(prevDate));
        return;
    }
    if (Object.keys(logData).some(function(k) { return logData[k] && logData[k].length > 0 && logData[k].some(function(a) { return a.job_id; }); })) {
        if (!confirm('This will overwrite current assignments with entries from ' + formatDate(prevDate) + '. Continue?')) return;
    }
    logData = {};
    prev.logs.forEach(function(l) {
        if (!logData[l.user_id]) logData[l.user_id] = [];
        logData[l.user_id].push({ job_id: l.job_id, hours: l.hours, notes: l.notes || '' });
    });
    renderGrid();
    updateSummary();
}

function clearDay() {
    if (!confirm('Clear ALL assignments for ' + formatDate(currentDate) + '? This will remove all entries when you save.')) return;
    logData = {};
    renderGrid();
    updateSummary();
}

function updateSummary() {
    var crewCount = 0;
    var totalHours = 0;
    var jobSet = {};
    var unassigned = 0;

    employees.forEach(function(emp) {
        var assigns = logData[emp.id] || [];
        var validAssigns = assigns.filter(function(a) { return a.job_id && a.hours > 0; });
        if (validAssigns.length > 0) {
            crewCount++;
            validAssigns.forEach(function(a) {
                totalHours += a.hours;
                jobSet[a.job_id] = true;
            });
        } else {
            unassigned++;
        }
    });

    document.getElementById('scCrew').textContent = crewCount;
    document.getElementById('scHours').textContent = totalHours.toFixed(1);
    document.getElementById('scJobs').textContent = Object.keys(jobSet).length;
    document.getElementById('scUnassigned').textContent = unassigned;
}

async function saveDailyLog() {
    var entries = [];
    employees.forEach(function(emp) {
        var assigns = logData[emp.id] || [];
        assigns.forEach(function(a) {
            if (a.job_id && a.hours > 0) {
                entries.push({ user_id: emp.id, job_id: a.job_id, hours: a.hours, notes: a.notes || '' });
            }
        });
    });

    var res = await fetch('/api/daily-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: currentDate, entries: entries })
    });
    var d = await res.json();
    if (d.ok) {
        loadDailyLog();
    }
}

// Quick assign all unassigned to a project
function assignAllTo(jobId) {
    employees.forEach(function(emp) {
        if (!logData[emp.id] || logData[emp.id].length === 0 || !logData[emp.id].some(function(a) { return a.job_id; })) {
            logData[emp.id] = [{ job_id: jobId, hours: 8, notes: '' }];
        }
    });
    renderGrid();
    updateSummary();
}

// Init
document.addEventListener('DOMContentLoaded', function() {
    loadDate(currentDate);
});
