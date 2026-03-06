/* Contracts JS */
let allContracts = [];
let jobsList = [];
let editingContractId = null;

function fmt(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    loadJobs();
});

// ─── Load Jobs Dropdown ──────────────────────────────────────
async function loadJobs() {
    const res = await fetch('/api/jobs/list');
    jobsList = await res.json();
    const filterSel = document.getElementById('filterJob');
    const modalSel = document.getElementById('contractJob');

    jobsList.forEach(j => {
        const o1 = document.createElement('option');
        o1.value = j.id;
        o1.textContent = j.name;
        filterSel.appendChild(o1);

        const o2 = document.createElement('option');
        o2.value = j.id;
        o2.textContent = j.name;
        modalSel.appendChild(o2);
    });

    // Auto-select job from URL parameter
    var _urlJobId = new URLSearchParams(window.location.search).get('job_id');
    if (_urlJobId) { document.getElementById('filterJob').value = _urlJobId; }

    loadContracts();
}

// ─── Load Contracts ──────────────────────────────────────────
async function loadContracts() {
    const jobId = document.getElementById('filterJob').value;
    const status = document.getElementById('filterStatus').value;
    const type = document.getElementById('filterType').value;
    const params = new URLSearchParams();
    if (jobId) params.set('job_id', jobId);
    if (status) params.set('status', status);
    if (type) params.set('type', type);

    const res = await fetch('/api/contracts?' + params.toString());
    allContracts = await res.json();
    renderSummary();
    renderContracts();
}

// ─── Summary Cards ───────────────────────────────────────────
function renderSummary() {
    const total = allContracts.length;
    const draft = allContracts.filter(c => c.status === 'Draft').length;
    const active = allContracts.filter(c => c.status === 'Active').length;
    const complete = allContracts.filter(c => c.status === 'Complete');
    const completeVal = complete.reduce((sum, c) => sum + (c.value || 0), 0);
    const terminated = allContracts.filter(c => c.status === 'Terminated').length;

    document.getElementById('sumTotal').textContent = total;
    document.getElementById('sumDraft').textContent = draft;
    document.getElementById('sumActive').textContent = active;
    document.getElementById('sumComplete').textContent = fmt(completeVal);
    document.getElementById('sumTerminated').textContent = terminated;

    // Highlight terminated card if any
    const termCard = document.getElementById('sumTerminated').closest('.kpi-card');
    if (terminated > 0) {
        termCard.style.background = '#FEF2F2';
        termCard.style.borderColor = '#EF4444';
    } else {
        termCard.style.background = '';
        termCard.style.borderColor = '';
    }
}

// ─── Render Table ────────────────────────────────────────────
function renderContracts() {
    const tbody = document.getElementById('contractsBody');
    const countEl = document.getElementById('contractCount');
    countEl.textContent = allContracts.length + ' contract' + (allContracts.length !== 1 ? 's' : '');

    if (!allContracts.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No contracts found.</td></tr>';
        return;
    }

    tbody.innerHTML = allContracts.map(c => {
        const statusClass = getStatusClass(c.status);
        const isTerminated = c.status === 'Terminated';
        const rowStyle = isTerminated ? 'background:#FEF2F2;' : '';
        const jobName = c.job_name || (jobsList.find(j => j.id === c.job_id) || {}).name || '-';
        const hasFile = c.has_file || c.file_path;
        const hasReview = c.has_review;

        let typeBadge = '';
        const typeColors = {
            'Prime': { bg: '#DBEAFE', color: '#1E40AF' },
            'Sub':   { bg: '#FEF3C7', color: '#92400E' },
            'Vendor':{ bg: '#E0E7FF', color: '#3730A3' }
        };
        const tc = typeColors[c.type] || { bg: '#F3F4F6', color: '#6B7280' };
        typeBadge = `<span class="badge" style="background:${tc.bg};color:${tc.color};">${c.type || '-'}</span>`;

        let actions = '';
        actions += `<button class="btn btn-small btn-secondary" onclick="event.stopPropagation();viewContract(${c.id})">View</button> `;
        if (c.status === 'Draft' || c.status === 'Active') {
            actions += `<button class="btn btn-small btn-primary" onclick="event.stopPropagation();editContract(${c.id})">Edit</button> `;
        }
        if (hasFile) {
            actions += `<button class="btn btn-small btn-secondary" onclick="event.stopPropagation();viewFile(${c.id})">PDF</button> `;
            actions += `<button class="btn btn-small" style="background:#8B5CF6;color:#fff;" onclick="event.stopPropagation();runAiReview(${c.id})">AI Review</button> `;
        }
        actions += `<button class="btn btn-small btn-danger" onclick="event.stopPropagation();deleteContract(${c.id})">Delete</button>`;

        return `<tr style="${rowStyle}">
            <td>${jobName}</td>
            <td style="font-weight:600;">${c.title || '-'}</td>
            <td>${c.contractor || '-'}</td>
            <td>${typeBadge}</td>
            <td style="text-align:right;font-weight:600;">${fmt(c.value)}</td>
            <td style="font-size:13px;">${c.contract_date || '-'}</td>
            <td><span class="status-badge ${statusClass}">${c.status}</span></td>
            <td style="font-size:13px;color:var(--gray-500);">${c.created_at || '-'}</td>
            <td style="white-space:nowrap;">${actions}</td>
        </tr>`;
    }).join('');
}

function getStatusClass(status) {
    switch (status) {
        case 'Draft':      return 'status-draft';
        case 'Active':     return 'status-open';
        case 'Complete':   return 'status-complete';
        case 'Terminated': return 'status-overdue';
        default:           return 'status-draft';
    }
}

// ─── Modal Controls ──────────────────────────────────────────
function showAddContract() {
    editingContractId = null;
    document.getElementById('contractModalTitle').textContent = 'Add Contract';
    document.getElementById('contractJob').value = document.getElementById('filterJob').value || '';
    document.getElementById('contractTitle').value = '';
    document.getElementById('contractContractor').value = '';
    document.getElementById('contractType').value = 'Prime';
    document.getElementById('contractValue').value = '';
    document.getElementById('contractStatus').value = 'Draft';
    document.getElementById('contractStatusGroup').style.display = 'none';
    document.getElementById('contractNotes').value = '';
    document.getElementById('contractDate').value = '';
    document.getElementById('contractFile').value = '';
    document.getElementById('contractModal').style.display = 'flex';
}

async function editContract(id) {
    const res = await fetch('/api/contracts/' + id);
    const c = await res.json();
    if (c.error) { alert(c.error); return; }

    editingContractId = c.id;
    document.getElementById('contractModalTitle').textContent = 'Edit Contract';
    document.getElementById('contractJob').value = c.job_id || '';
    document.getElementById('contractTitle').value = c.title || '';
    document.getElementById('contractContractor').value = c.contractor || '';
    document.getElementById('contractType').value = c.type || 'Prime';
    document.getElementById('contractValue').value = c.value || '';
    document.getElementById('contractStatus').value = c.status || 'Draft';
    document.getElementById('contractStatusGroup').style.display = '';
    document.getElementById('contractNotes').value = c.notes || '';
    document.getElementById('contractDate').value = c.contract_date || '';
    document.getElementById('contractFile').value = '';
    document.getElementById('contractModal').style.display = 'flex';
}

// ─── View Contract Detail ────────────────────────────────────
async function viewContract(id) {
    const res = await fetch('/api/contracts/' + id);
    const c = await res.json();
    if (c.error) { alert(c.error); return; }

    const jobName = c.job_name || (jobsList.find(j => j.id === c.job_id) || {}).name || '-';
    const hasFile = c.has_file || c.file_path;

    const typeColors = {
        'Prime': { bg: '#DBEAFE', color: '#1E40AF' },
        'Sub':   { bg: '#FEF3C7', color: '#92400E' },
        'Vendor':{ bg: '#E0E7FF', color: '#3730A3' }
    };
    const tc = typeColors[c.type] || { bg: '#F3F4F6', color: '#6B7280' };

    let html = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
            <div>
                <div style="font-size:13px;color:var(--gray-500);margin-bottom:2px;">Job</div>
                <div style="font-weight:600;">${jobName}</div>
            </div>
            <div>
                <div style="font-size:13px;color:var(--gray-500);margin-bottom:2px;">Status</div>
                <div><span class="status-badge ${getStatusClass(c.status)}">${c.status}</span></div>
            </div>
            <div>
                <div style="font-size:13px;color:var(--gray-500);margin-bottom:2px;">Contractor</div>
                <div style="font-weight:600;">${c.contractor || '-'}</div>
            </div>
            <div>
                <div style="font-size:13px;color:var(--gray-500);margin-bottom:2px;">Type</div>
                <div><span class="badge" style="background:${tc.bg};color:${tc.color};">${c.type || '-'}</span></div>
            </div>
            <div>
                <div style="font-size:13px;color:var(--gray-500);margin-bottom:2px;">Contract Value</div>
                <div style="font-weight:700;font-size:18px;">${fmt(c.value)}</div>
            </div>
            <div>
                <div style="font-size:13px;color:var(--gray-500);margin-bottom:2px;">Contract Date</div>
                <div>${c.contract_date || '-'}</div>
            </div>
            <div>
                <div style="font-size:13px;color:var(--gray-500);margin-bottom:2px;">Date Added</div>
                <div>${c.created_at || '-'}</div>
            </div>
        </div>`;

    if (c.notes) {
        html += `
        <div style="margin-bottom:16px;">
            <div style="font-size:13px;color:var(--gray-500);margin-bottom:4px;">Notes</div>
            <div style="white-space:pre-wrap;background:var(--gray-50);padding:12px;border-radius:6px;font-size:14px;">${escapeHtml(c.notes)}</div>
        </div>`;
    }

    if (hasFile) {
        html += `
        <div style="margin-bottom:16px;">
            <button class="btn btn-secondary" onclick="viewFile(${c.id})">View Contract PDF</button>
            <button class="btn" style="background:#8B5CF6;color:#fff;margin-left:8px;" onclick="document.getElementById('contractDetailModal').style.display='none';runAiReview(${c.id})">Run AI Review</button>
        </div>`;
    }

    if (c.ai_review) {
        html += `
        <div style="margin-top:16px;">
            <div style="font-size:13px;color:var(--gray-500);margin-bottom:4px;">Last AI Review</div>
            <div id="detailReviewContent">${renderReviewHtml(c.ai_review)}</div>
        </div>`;
    }

    document.getElementById('detailTitle').textContent = c.title || 'Contract Details';
    document.getElementById('detailContent').innerHTML = html;
    document.getElementById('contractDetailModal').style.display = 'flex';
}

// ─── Save (Create / Update) ─────────────────────────────────
async function saveContract(event) {
    event.preventDefault();

    const fileInput = document.getElementById('contractFile');
    const hasFile = fileInput.files && fileInput.files[0];

    if (editingContractId) {
        // PUT update — if there's a new file, use FormData; otherwise JSON
        if (hasFile) {
            const fd = new FormData();
            fd.append('job_id', document.getElementById('contractJob').value);
            fd.append('title', document.getElementById('contractTitle').value);
            fd.append('contractor', document.getElementById('contractContractor').value);
            fd.append('contract_type', document.getElementById('contractType').value);
            fd.append('value', document.getElementById('contractValue').value || '0');
            fd.append('status', document.getElementById('contractStatus').value);
            fd.append('notes', document.getElementById('contractNotes').value);
            fd.append('contract_date', document.getElementById('contractDate').value);
            fd.append('file', fileInput.files[0]);
            await fetch('/api/contracts/' + editingContractId, { method: 'PUT', body: fd });
        } else {
            await fetch('/api/contracts/' + editingContractId, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    job_id: document.getElementById('contractJob').value,
                    title: document.getElementById('contractTitle').value,
                    contractor: document.getElementById('contractContractor').value,
                    contract_type: document.getElementById('contractType').value,
                    value: document.getElementById('contractValue').value || '0',
                    status: document.getElementById('contractStatus').value,
                    notes: document.getElementById('contractNotes').value,
                    contract_date: document.getElementById('contractDate').value
                })
            });
        }
    } else {
        // POST create — always use FormData to support file upload
        const fd = new FormData();
        fd.append('job_id', document.getElementById('contractJob').value);
        fd.append('title', document.getElementById('contractTitle').value);
        fd.append('contractor', document.getElementById('contractContractor').value);
        fd.append('contract_type', document.getElementById('contractType').value);
        fd.append('value', document.getElementById('contractValue').value || '0');
        fd.append('notes', document.getElementById('contractNotes').value);
        fd.append('contract_date', document.getElementById('contractDate').value);
        if (hasFile) fd.append('file', fileInput.files[0]);
        await fetch('/api/contracts', { method: 'POST', body: fd });
    }

    document.getElementById('contractModal').style.display = 'none';
    editingContractId = null;
    loadContracts();
}

// ─── Delete ──────────────────────────────────────────────────
async function deleteContract(id) {
    if (!confirm('Delete this contract? This cannot be undone.')) return;
    await fetch('/api/contracts/' + id, { method: 'DELETE' });
    loadContracts();
}

// ─── View File ───────────────────────────────────────────────
function viewFile(id) {
    window.open('/api/contracts/' + id + '/file', '_blank');
}

// ─── AI Review ───────────────────────────────────────────────
async function runAiReview(id) {
    const contract = allContracts.find(c => c.id === id);
    const title = contract ? contract.title : 'Contract #' + id;

    if (!confirm('Run AI review on "' + title + '"? This will analyze the uploaded PDF.')) return;

    // Show the review panel with loading state
    const panel = document.getElementById('reviewPanel');
    const content = document.getElementById('reviewContent');
    panel.style.display = '';
    content.innerHTML = `
        <div style="text-align:center;padding:40px;">
            <div style="font-size:18px;font-weight:600;margin-bottom:8px;">Analyzing Contract...</div>
            <div style="color:var(--gray-500);">This may take a moment while the AI reviews the document.</div>
            <div style="margin-top:16px;"><span class="loading-spinner"></span></div>
        </div>`;

    // Scroll to panel
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        const res = await fetch('/api/contracts/' + id + '/review', { method: 'POST' });
        const result = await res.json();

        if (result.error) {
            content.innerHTML = `
                <div style="color:#EF4444;padding:20px;">
                    <strong>Error:</strong> ${escapeHtml(result.error)}
                </div>`;
            return;
        }

        renderReview(result);
    } catch (e) {
        content.innerHTML = `
            <div style="color:#EF4444;padding:20px;">
                <strong>Error:</strong> ${escapeHtml(e.message)}
            </div>`;
    }
}

function renderReview(review) {
    const content = document.getElementById('reviewContent');
    content.innerHTML = renderReviewHtml(review);
}

function renderReviewHtml(review) {
    // Handle case where review is a string (raw text response)
    if (typeof review === 'string') {
        return `<div style="white-space:pre-wrap;font-size:14px;line-height:1.6;">${escapeHtml(review)}</div>`;
    }

    let html = '';

    // Review header with timestamp
    if (review.reviewed_at) {
        html += `<div style="font-size:12px;color:var(--gray-400);margin-bottom:16px;">Reviewed: ${review.reviewed_at}</div>`;
    }

    // Overall summary
    if (review.summary) {
        html += `
        <div style="margin-bottom:20px;">
            <h3 style="margin:0 0 8px;font-size:16px;">Summary</h3>
            <div style="white-space:pre-wrap;font-size:14px;line-height:1.6;">${escapeHtml(review.summary)}</div>
        </div>`;
    }

    // Risk level indicator
    if (review.risk_level) {
        const riskColors = {
            'Low':    { bg: '#DCFCE7', color: '#166534', icon: 'Low Risk' },
            'Medium': { bg: '#FEF3C7', color: '#92400E', icon: 'Medium Risk' },
            'High':   { bg: '#FEE2E2', color: '#991B1B', icon: 'High Risk' }
        };
        const rc = riskColors[review.risk_level] || riskColors['Medium'];
        html += `
        <div style="display:inline-block;padding:6px 16px;border-radius:6px;background:${rc.bg};color:${rc.color};font-weight:700;font-size:14px;margin-bottom:20px;">
            ${rc.icon}
        </div>`;
    }

    // Key terms
    if (review.key_terms && review.key_terms.length) {
        html += `
        <div style="margin-bottom:20px;">
            <h3 style="margin:0 0 8px;font-size:16px;">Key Terms</h3>
            <ul style="margin:0;padding-left:20px;">
                ${review.key_terms.map(t => `<li style="margin-bottom:4px;font-size:14px;">${escapeHtml(t)}</li>`).join('')}
            </ul>
        </div>`;
    }

    // Concerns / red flags
    if (review.concerns && review.concerns.length) {
        html += `
        <div style="margin-bottom:20px;padding:12px;background:#FEF2F2;border-radius:6px;border-left:4px solid #EF4444;">
            <h3 style="margin:0 0 8px;font-size:16px;color:#991B1B;">Concerns</h3>
            <ul style="margin:0;padding-left:20px;">
                ${review.concerns.map(c => `<li style="margin-bottom:4px;font-size:14px;color:#991B1B;">${escapeHtml(c)}</li>`).join('')}
            </ul>
        </div>`;
    }

    // Recommendations
    if (review.recommendations && review.recommendations.length) {
        html += `
        <div style="margin-bottom:20px;padding:12px;background:#EFF6FF;border-radius:6px;border-left:4px solid #3B82F6;">
            <h3 style="margin:0 0 8px;font-size:16px;color:#1E40AF;">Recommendations</h3>
            <ul style="margin:0;padding-left:20px;">
                ${review.recommendations.map(r => `<li style="margin-bottom:4px;font-size:14px;color:#1E40AF;">${escapeHtml(r)}</li>`).join('')}
            </ul>
        </div>`;
    }

    // Comparison notes (vs plans/proposals)
    if (review.comparison_notes) {
        html += `
        <div style="margin-bottom:20px;">
            <h3 style="margin:0 0 8px;font-size:16px;">Comparison Notes</h3>
            <div style="white-space:pre-wrap;font-size:14px;line-height:1.6;background:var(--gray-50);padding:12px;border-radius:6px;">${escapeHtml(review.comparison_notes)}</div>
        </div>`;
    }

    // Findings section (detailed clause-by-clause results)
    if (review.findings && review.findings.length) {
        html += `
        <div style="margin-bottom:20px;">
            <h3 style="margin:0 0 12px;font-size:16px;">Detailed Findings</h3>`;
        const typeStyles = {
            'ok':      { bg: '#F0FDF4', border: '#22C55E', icon: '\u2713', color: '#166534' },
            'warning': { bg: '#FFFBEB', border: '#F59E0B', icon: '\u26A0', color: '#92400E' },
            'info':    { bg: '#EFF6FF', border: '#3B82F6', icon: '\u2139', color: '#1E40AF' },
            'error':   { bg: '#FEF2F2', border: '#EF4444', icon: '\u2717', color: '#991B1B' }
        };
        review.findings.forEach(f => {
            const s = typeStyles[f.type] || typeStyles['info'];
            html += `
            <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;margin-bottom:6px;background:${s.bg};border-left:3px solid ${s.border};border-radius:4px;font-size:13px;">
                <span style="color:${s.color};font-weight:700;flex-shrink:0;">${s.icon}</span>
                <span style="color:${s.color};">${f.category ? '<strong>' + escapeHtml(f.category) + ':</strong> ' : ''}${escapeHtml(f.message)}</span>
            </div>`;
        });
        html += `</div>`;
    }

    // Raw text fallback if structured data is minimal
    if (review.raw_text && !review.summary && !review.key_terms && (!review.findings || !review.findings.length)) {
        html += `<div style="white-space:pre-wrap;font-size:14px;line-height:1.6;">${escapeHtml(review.raw_text)}</div>`;
    }

    return html || '<div style="color:var(--gray-500);padding:12px;">No review data available.</div>';
}

// ─── Utility ─────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
