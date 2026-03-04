/* Feedback & Requests JS */
let allFeedback = [];

document.addEventListener('DOMContentLoaded', loadFeedback);

async function loadFeedback() {
    const res = await fetch('/api/feedback');
    allFeedback = await res.json();
    updateKpis();
    filterFeedback();
}

function updateKpis() {
    document.getElementById('kpiTotal').textContent = allFeedback.length;
    document.getElementById('kpiOpen').textContent = allFeedback.filter(f => f.status === 'New' || f.status === 'Under Review').length;
    document.getElementById('kpiPlanned').textContent = allFeedback.filter(f => f.status === 'Planned').length;
    document.getElementById('kpiComplete').textContent = allFeedback.filter(f => f.status === 'Complete').length;
}

function filterFeedback() {
    const cat = document.getElementById('filterCategory').value;
    const status = document.getElementById('filterStatus').value;
    const priority = document.getElementById('filterPriority').value;
    const search = document.getElementById('filterSearch').value.toLowerCase();

    let filtered = allFeedback;
    if (cat) filtered = filtered.filter(f => f.category === cat);
    if (status) filtered = filtered.filter(f => f.status === status);
    if (priority) filtered = filtered.filter(f => f.priority === priority);
    if (search) filtered = filtered.filter(f =>
        f.title.toLowerCase().includes(search) ||
        (f.description || '').toLowerCase().includes(search) ||
        (f.submitter_name || '').toLowerCase().includes(search)
    );
    renderFeedback(filtered);
}

function renderFeedback(items) {
    const tbody = document.getElementById('feedbackBody');
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No feedback found.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(f => {
        const catClass = f.category.toLowerCase();
        const prioClass = f.priority.toLowerCase();
        const statusClass = f.status.toLowerCase().replace(/ /g, '-');
        const dateStr = f.created_at ? f.created_at.split(' ')[0] : '';
        return `<tr style="cursor:pointer;" onclick="showDetail(${f.id})">
            <td><strong>${esc(f.title)}</strong></td>
            <td><span class="feedback-category-badge ${catClass}">${f.category}</span></td>
            <td><span class="feedback-priority-badge ${prioClass}">${f.priority}</span></td>
            <td><span class="feedback-status-badge ${statusClass}">${f.status}</span></td>
            <td>${esc(f.submitter_name || 'Unknown')}</td>
            <td>
                <button class="feedback-upvote-btn ${f.user_upvoted ? 'upvoted' : ''}" onclick="event.stopPropagation();upvoteFeedback(${f.id})">
                    &#9650; ${f.upvotes || 0}
                </button>
            </td>
            <td>${dateStr}</td>
        </tr>`;
    }).join('');
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function showSubmitFeedback() {
    document.getElementById('fbModalTitle').textContent = 'Submit Feedback';
    document.getElementById('fbId').value = '';
    document.getElementById('fbTitle').value = '';
    document.getElementById('fbDesc').value = '';
    document.getElementById('fbCategory').value = 'Feature';
    document.getElementById('fbPriority').value = 'Medium';
    document.getElementById('fbModal').style.display = 'flex';
}

async function submitFeedback(e) {
    e.preventDefault();
    const id = document.getElementById('fbId').value;
    const data = {
        title: document.getElementById('fbTitle').value,
        description: document.getElementById('fbDesc').value,
        category: document.getElementById('fbCategory').value,
        priority: document.getElementById('fbPriority').value,
    };

    if (id) {
        await fetch('/api/feedback/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } else {
        await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }
    document.getElementById('fbModal').style.display = 'none';
    loadFeedback();
}

async function upvoteFeedback(id) {
    await fetch('/api/feedback/' + id + '/upvote', { method: 'POST' });
    loadFeedback();
}

function showDetail(id) {
    const f = allFeedback.find(x => x.id === id);
    if (!f) return;

    document.getElementById('fbDetailTitle').textContent = f.title;
    const isOwner = window.USER_ROLE === 'owner';
    const statusClass = f.status.toLowerCase().replace(/ /g, '-');

    let html = `
        <div style="margin-bottom:12px;">
            <span class="feedback-category-badge ${f.category.toLowerCase()}">${f.category}</span>
            <span class="feedback-priority-badge ${f.priority.toLowerCase()}" style="margin-left:6px;">${f.priority}</span>
            <span class="feedback-status-badge ${statusClass}" style="margin-left:6px;">${f.status}</span>
        </div>
        <p style="margin-bottom:12px;color:var(--gray-500);font-size:13px;">
            Submitted by <strong>${esc(f.submitter_name || 'Unknown')}</strong> on ${f.created_at ? f.created_at.split(' ')[0] : ''}
        </p>
        <div style="margin-bottom:16px;white-space:pre-wrap;font-size:14px;color:var(--gray-700);">${esc(f.description || 'No description provided.')}</div>
    `;

    if (f.owner_response) {
        html += `<div class="feedback-response">
            <div class="feedback-response-label">Owner Response:</div>
            <div style="white-space:pre-wrap;">${esc(f.owner_response)}</div>
        </div>`;
    }

    if (isOwner) {
        const statuses = ['New', 'Under Review', 'Planned', 'In Progress', 'Complete', 'Wont Fix'];
        html += `<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--gray-200);">
            <h3 style="font-size:15px;margin-bottom:12px;">Owner Actions</h3>
            <div class="form-group">
                <label class="form-label">Status</label>
                <select id="ownerStatus" class="form-select">
                    ${statuses.map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${s === 'Wont Fix' ? "Won't Fix" : s}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Response</label>
                <textarea id="ownerResponse" class="form-input" rows="3">${esc(f.owner_response || '')}</textarea>
            </div>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-primary" onclick="updateFeedbackStatus(${f.id})">Update</button>
                <button class="btn btn-danger" onclick="deleteFeedback(${f.id})">Delete</button>
            </div>
        </div>`;
    }

    document.getElementById('fbDetailBody').innerHTML = html;
    document.getElementById('fbDetailModal').style.display = 'flex';
}

async function updateFeedbackStatus(id) {
    const status = document.getElementById('ownerStatus').value;
    const owner_response = document.getElementById('ownerResponse').value;
    await fetch('/api/feedback/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, owner_response })
    });
    document.getElementById('fbDetailModal').style.display = 'none';
    loadFeedback();
}

async function deleteFeedback(id) {
    if (!confirm('Delete this feedback request?')) return;
    await fetch('/api/feedback/' + id, { method: 'DELETE' });
    document.getElementById('fbDetailModal').style.display = 'none';
    loadFeedback();
}
