/* ─── 32-Step Job Pipeline ─────────────────────────────────────── */

var pipelineData = [];
var selectedJobId = null;

var STATUS_COLORS = {
    pending: '#D1D5DB', active: '#3B82F6', complete: '#10B981',
    skipped: '#F59E0B', blocked: '#EF4444'
};

var CATEGORY_COLORS = {
    bidding: '#6366F1', contract: '#8B5CF6', preconstruction: '#EC4899',
    materials: '#F59E0B', finance: '#10B981', construction: '#06B6D4', closeout: '#EF4444'
};

function loadPipeline() {
    fetch('/api/pipeline/overview')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            pipelineData = data;
            renderMatrix();
        });
}

function renderMatrix() {
    var el = document.getElementById('pipelineMatrix');
    if (!pipelineData.length) {
        el.innerHTML = '<p style="text-align:center;padding:40px;color:#6B7280;">No active projects with pipeline data. Use "Sync All Projects" to initialize.</p>';
        return;
    }
    var html = '';
    pipelineData.forEach(function(job) {
        var pct = job.total_steps > 0 ? Math.round(job.complete_steps / job.total_steps * 100) : 0;
        html += '<div class="pipeline-row" onclick="showDetail(' + job.job_id + ')" style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;border-bottom:1px solid #F3F4F6;">';
        html += '<div style="width:180px;min-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">';
        html += '<span style="font-weight:600;font-size:13px;">' + job.job_name + '</span>';
        html += '<span style="font-size:11px;color:#6B7280;margin-left:6px;">' + pct + '%</span>';
        html += '</div>';
        html += '<div style="display:flex;gap:2px;align-items:center;">';
        job.steps.forEach(function(s) {
            var color = STATUS_COLORS[s.status] || '#D1D5DB';
            var catColor = CATEGORY_COLORS[s.step_category] || '#6B7280';
            html += '<div title="' + s.step_number + '. ' + s.step_name + ' (' + s.status + ')" ';
            html += 'style="width:22px;height:22px;border-radius:50%;background:' + color + ';';
            html += 'border:2px solid ' + (s.status === 'complete' ? color : catColor) + ';';
            html += 'font-size:9px;display:flex;align-items:center;justify-content:center;color:white;font-weight:600;">';
            html += s.step_number;
            html += '</div>';
        });
        html += '</div></div>';
    });
    el.innerHTML = html;
}

function pipelineNav(url, e) {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION' || e.target.tagName === 'INPUT') return;
    window.location.href = url;
}

function showDetail(jobId) {
    selectedJobId = jobId;
    fetch('/api/jobs/' + jobId + '/pipeline')
        .then(function(r) { return r.json(); })
        .then(function(steps) {
            var job = pipelineData.find(function(j) { return j.job_id === jobId; });
            document.getElementById('detailJobName').textContent = job ? job.job_name : 'Project #' + jobId;
            var container = document.getElementById('detailSteps');
            var html = '';
            steps.forEach(function(s) {
                var color = STATUS_COLORS[s.status] || '#D1D5DB';
                var catColor = CATEGORY_COLORS[s.step_category] || '#6B7280';
                var clickable = s.module_link ? ' cursor:pointer;' : '';
                var clickHandler = s.module_link ? ' onclick="pipelineNav(\'' + s.module_link + '\', event)"' : '';
                html += '<div class="pipeline-step-row"' + clickHandler + ' style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:8px;background:#F9FAFB;border-left:4px solid ' + catColor + ';' + clickable + 'transition:background 0.15s;">';
                html += '<div style="width:28px;height:28px;border-radius:50%;background:' + color + ';display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:11px;flex-shrink:0;">' + s.step_number + '</div>';
                html += '<div style="flex:1;min-width:0;">';
                html += '<div style="font-weight:600;font-size:13px;">' + s.step_name + '</div>';
                html += '<div style="font-size:11px;color:#6B7280;">' + s.step_category + (s.completed_date ? ' — ' + s.completed_date : '') + '</div>';
                html += '</div>';
                // Module link arrow
                if (s.module_link) {
                    html += '<i class="fas fa-chevron-right" style="color:#9CA3AF;font-size:12px;"></i>';
                }
                // Status toggle
                html += '<select onchange="updateStep(' + jobId + ',' + s.step_number + ',this.value)" style="font-size:11px;padding:4px;border-radius:4px;border:1px solid #D1D5DB;" onclick="event.stopPropagation();">';
                ['pending','active','complete','skipped','blocked'].forEach(function(st) {
                    html += '<option value="' + st + '"' + (s.status === st ? ' selected' : '') + '>' + st + '</option>';
                });
                html += '</select>';
                // Notes
                html += '<input type="text" value="' + (s.notes || '').replace(/"/g, '&quot;') + '" placeholder="Notes" ';
                html += 'onchange="updateStepNotes(' + jobId + ',' + s.step_number + ',this.value)" ';
                html += 'onclick="event.stopPropagation();" style="font-size:11px;padding:4px 8px;border:1px solid #D1D5DB;border-radius:4px;width:150px;">';
                html += '</div>';
            });
            container.innerHTML = html;
            document.getElementById('jobDetail').style.display = '';
        });
}

function closeDetail() {
    document.getElementById('jobDetail').style.display = 'none';
    selectedJobId = null;
}

function updateStep(jobId, step, status) {
    fetch('/api/jobs/' + jobId + '/pipeline/' + step, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({status: status})
    }).then(function() { loadPipeline(); if (selectedJobId === jobId) showDetail(jobId); });
}

function updateStepNotes(jobId, step, notes) {
    fetch('/api/jobs/' + jobId + '/pipeline/' + step, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({notes: notes})
    });
}

function seedAllPipelines() {
    fetch('/api/pipeline/overview')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            // Get all active jobs
            return fetch('/api/jobs');
        })
        .then(function(r) { return r.json(); })
        .then(function(jobs) {
            var promises = jobs.map(function(j) {
                return fetch('/api/jobs/' + j.id + '/pipeline/seed', { method: 'POST' });
            });
            return Promise.all(promises);
        })
        .then(function() { loadPipeline(); });
}

document.addEventListener('DOMContentLoaded', loadPipeline);
