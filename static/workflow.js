/* Workflow Dashboard JS */

let workflowData = null;
let jobsList = [];

// Color mappings for each feature's statuses
const STATUS_COLORS = {
    // RFIs
    'Open':              '#3B82F6',
    'Answered':          '#F59E0B',
    'Responded':         '#F59E0B',
    'Closed':            '#6B7280',
    // Submittals
    'Pending':           '#9CA3AF',
    'Submitted':         '#3B82F6',
    'Approved':          '#22C55E',
    'Approved as Noted': '#22C55E',
    'Rejected':          '#EF4444',
    'Resubmit':          '#EF4444',
    // Change Orders / Contracts
    'Draft':             '#9CA3AF',
    'Active':            '#3B82F6',
    'Terminated':        '#EF4444',
    // Schedule
    'In Progress':       '#F59E0B',
    'Complete':          '#22C55E',
    'Cancelled':         '#6B7280',
    // Closeout
    'complete':          '#22C55E',
    'incomplete':        '#EF4444',
    'Not Started':       '#9CA3AF',
    'N/A':               '#6B7280',
};

function getStatusColor(status) {
    return STATUS_COLORS[status] || '#9CA3AF';
}

// Category display labels and accent colors for KPI identification
const CATEGORY_META = {
    rfis:           { label: 'RFIs',            accent: '#3B82F6' },
    submittals:     { label: 'Submittals',      accent: '#8B5CF6' },
    change_orders:  { label: 'Change Orders',   accent: '#F59E0B' },
    schedule:       { label: 'Schedule',        accent: '#06B6D4' },
    pay_apps:       { label: 'Pay Apps',        accent: '#EC4899' },
    closeout:       { label: 'Closeout',        accent: '#10B981' },
};

document.addEventListener('DOMContentLoaded', function() {
    loadJobs();
    loadWorkflow();
});

async function loadJobs() {
    try {
        const res = await fetch('/api/jobs/list');
        if (!res.ok) return;
        jobsList = await res.json();
        const select = document.getElementById('jobFilter');
        jobsList.forEach(function(j) {
            const opt = document.createElement('option');
            opt.value = j.id;
            opt.textContent = j.name;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error('Failed to load jobs:', e);
    }
}

async function loadWorkflow(jobId) {
    var url = '/api/workflow/summary';
    if (jobId) url += '?job_id=' + encodeURIComponent(jobId);

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('API error ' + res.status);
        workflowData = await res.json();
        renderSummary(workflowData);
        renderJobCards(workflowData);
    } catch (e) {
        console.error('Failed to load workflow:', e);
        document.getElementById('jobCardsGrid').innerHTML =
            '<p class="empty-state">Failed to load workflow data.</p>';
    }
}

function onJobFilterChange() {
    var jobId = document.getElementById('jobFilter').value;
    loadWorkflow(jobId);
}

function renderSummary(data) {
    var s = data.summary || {};

    var openRfis = (s.rfis && s.rfis['Open']) || 0;
    document.getElementById('kpiOpenRfis').textContent = openRfis;

    var pendingSub = 0;
    if (s.submittals) {
        pendingSub = (s.submittals['Pending'] || 0) + (s.submittals['Submitted'] || 0);
    }
    document.getElementById('kpiPendingSubmittals').textContent = pendingSub;

    var pendingCO = 0;
    if (s.change_orders) {
        pendingCO = (s.change_orders['Pending'] || 0) + (s.change_orders['Draft'] || 0) +
                    (s.change_orders['Submitted'] || 0);
    }
    document.getElementById('kpiPendingCOs').textContent = pendingCO;

    var inProgressSched = (s.schedule && s.schedule['In Progress']) || 0;
    document.getElementById('kpiInProgressSchedule').textContent = inProgressSched;

    var pendingPay = 0;
    if (s.pay_apps) {
        pendingPay = (s.pay_apps['Draft'] || 0) + (s.pay_apps['Submitted'] || 0);
    }
    document.getElementById('kpiPendingPayApps').textContent = pendingPay;
}

function renderJobCards(data) {
    var container = document.getElementById('jobCardsGrid');
    var jobs = data.jobs || [];

    if (!jobs.length) {
        container.innerHTML = '<p class="empty-state">No projects found.</p>';
        return;
    }

    container.innerHTML = jobs.map(function(job) {
        return '<div class="card" style="padding:20px 24px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
                '<h3 style="font-size:16px;font-weight:700;margin:0;">' + escapeHtml(job.name) + '</h3>' +
                '<span style="font-size:12px;color:var(--gray-400);">ID #' + job.id + '</span>' +
            '</div>' +
            renderFeatureSection('rfis', job.rfis) +
            renderFeatureSection('submittals', job.submittals) +
            renderFeatureSection('change_orders', job.change_orders) +
            renderFeatureSection('schedule', job.schedule) +
            renderFeatureSection('pay_apps', job.pay_apps) +
            renderCloseoutSection(job.closeout) +
        '</div>';
    }).join('');
}

function renderFeatureSection(key, statusObj) {
    if (!statusObj) return '';
    var meta = CATEGORY_META[key] || { label: key, accent: '#6B7280' };
    var entries = Object.entries(statusObj);
    var total = entries.reduce(function(sum, e) { return sum + e[1]; }, 0);

    if (total === 0) return '';

    var html = '<div style="margin-bottom:12px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
            '<span style="font-size:13px;font-weight:600;color:var(--gray-700);">' + meta.label + '</span>' +
            '<span style="font-size:12px;color:var(--gray-400);">' + total + ' total</span>' +
        '</div>';

    // Status badges
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">';
    entries.forEach(function(entry) {
        var status = entry[0];
        var count = entry[1];
        if (count === 0) return;
        var color = getStatusColor(status);
        html += '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;' +
            'border-radius:12px;font-size:12px;font-weight:600;' +
            'background:' + hexToRgba(color, 0.12) + ';color:' + color + ';">' +
            count + ' ' + status + '</span>';
    });
    html += '</div>';

    // Progress bar
    html += renderProgressBar(entries, total);
    html += '</div>';
    return html;
}

function renderCloseoutSection(closeout) {
    if (!closeout) return '';
    var incomplete = closeout.incomplete || 0;
    var complete = closeout.complete || 0;
    var total = incomplete + complete;
    if (total === 0) return '';

    var pct = Math.round((complete / total) * 100);

    var html = '<div style="margin-bottom:12px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
            '<span style="font-size:13px;font-weight:600;color:var(--gray-700);">Closeout</span>' +
            '<span style="font-size:12px;color:var(--gray-400);">' + pct + '% complete</span>' +
        '</div>';

    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">';
    if (complete > 0) {
        html += '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;' +
            'border-radius:12px;font-size:12px;font-weight:600;' +
            'background:rgba(34,197,94,0.12);color:#22C55E;">' +
            complete + ' Complete</span>';
    }
    if (incomplete > 0) {
        html += '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;' +
            'border-radius:12px;font-size:12px;font-weight:600;' +
            'background:rgba(239,68,68,0.12);color:#EF4444;">' +
            incomplete + ' Incomplete</span>';
    }
    html += '</div>';

    // Progress bar
    html += '<div style="height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden;display:flex;">';
    if (complete > 0) {
        html += '<div style="width:' + pct + '%;background:#22C55E;"></div>';
    }
    if (incomplete > 0) {
        html += '<div style="width:' + (100 - pct) + '%;background:#EF4444;"></div>';
    }
    html += '</div>';

    html += '</div>';
    return html;
}

function renderProgressBar(entries, total) {
    if (total === 0) return '';

    var html = '<div style="height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden;display:flex;">';
    entries.forEach(function(entry) {
        var status = entry[0];
        var count = entry[1];
        if (count === 0) return;
        var pct = (count / total * 100).toFixed(1);
        var color = getStatusColor(status);
        html += '<div style="width:' + pct + '%;background:' + color + ';" title="' +
            escapeHtml(status) + ': ' + count + '"></div>';
    });
    html += '</div>';
    return html;
}

function hexToRgba(hex, alpha) {
    // Handle named or already-rgba colors gracefully
    if (!hex || hex.charAt(0) !== '#') return hex;
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
