/* Plans JS — HVAC Plan Review & Material Takeoff */
let allPlans = [];
let jobsList = [];
let editingPlanId = null;
let currentTakeoff = null;
let currentTakeoffPlanId = null;

function fmt(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    loadJobs();
    loadPlans();
});

// ─── Load Jobs Dropdown ──────────────────────────────────────
async function loadJobs() {
    const res = await fetch('/api/jobs/list');
    jobsList = await res.json();
    const filterSel = document.getElementById('filterJob');
    const modalSel = document.getElementById('planJob');

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
}

// ─── Load Plans ──────────────────────────────────────────────
async function loadPlans() {
    const jobId = document.getElementById('filterJob').value;
    const status = document.getElementById('filterStatus').value;
    const planType = document.getElementById('filterType').value;
    const params = new URLSearchParams();
    if (jobId) params.set('job_id', jobId);
    if (status) params.set('status', status);
    if (planType) params.set('plan_type', planType);

    const res = await fetch('/api/plans?' + params.toString());
    allPlans = await res.json();
    renderSummary();
    renderPlans();
}

// ─── Summary Cards ───────────────────────────────────────────
function renderSummary() {
    const total = allPlans.length;
    const uploaded = allPlans.filter(p => p.status === 'Uploaded').length;
    const reviewed = allPlans.filter(p => p.status === 'Reviewed').length;
    const takeoff = allPlans.filter(p => p.status === 'Takeoff Complete').length;

    document.getElementById('sumTotal').textContent = total;
    document.getElementById('sumUploaded').textContent = uploaded;
    document.getElementById('sumReviewed').textContent = reviewed;
    document.getElementById('sumTakeoff').textContent = takeoff;
}

// ─── Render Table ────────────────────────────────────────────
function renderPlans() {
    const tbody = document.getElementById('plansBody');
    const countEl = document.getElementById('planCount');
    countEl.textContent = allPlans.length + ' plan' + (allPlans.length !== 1 ? 's' : '');

    if (!allPlans.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No plans found. Upload a PDF to get started.</td></tr>';
        return;
    }

    tbody.innerHTML = allPlans.map(p => {
        const statusClass = getPlanStatusClass(p.status);
        const jobName = p.job_name || (jobsList.find(j => j.id === p.job_id) || {}).name || '-';
        const hasFile = p.has_file || p.file_path;
        const hasReview = p.has_review;
        const hasTakeoff = p.has_takeoff;

        const typeColors = {
            'Mechanical':    { bg: '#DBEAFE', color: '#1E40AF' },
            'Architectural': { bg: '#FEF3C7', color: '#92400E' },
            'Structural':    { bg: '#E0E7FF', color: '#3730A3' },
            'Plumbing':      { bg: '#D1FAE5', color: '#065F46' },
            'Electrical':    { bg: '#FDE68A', color: '#78350F' },
            'Site':          { bg: '#E5E7EB', color: '#374151' },
            'Full Set':      { bg: '#FCE7F3', color: '#9D174D' },
        };
        const tc = typeColors[p.plan_type] || { bg: '#F3F4F6', color: '#6B7280' };
        const typeBadge = `<span class="badge" style="background:${tc.bg};color:${tc.color};">${p.plan_type || '-'}</span>`;

        let actions = '';
        actions += `<button class="btn btn-small btn-secondary" onclick="event.stopPropagation();viewPlan(${p.id})" title="View Details">View</button> `;
        actions += `<button class="btn btn-small btn-primary" onclick="event.stopPropagation();editPlan(${p.id})" title="Edit">Edit</button> `;
        if (hasFile) {
            actions += `<button class="btn btn-small btn-secondary" onclick="event.stopPropagation();viewFile(${p.id})" title="Open PDF">PDF</button> `;
            actions += `<button class="btn btn-small" style="background:#8B5CF6;color:#fff;" onclick="event.stopPropagation();runAiReview(${p.id})" title="Plan Data Extract">`;
            actions += hasReview ? 'Re-Extract' : 'Extract Data';
            actions += `</button> `;
        }
        actions += `<button class="btn btn-small" style="background:#059669;color:#fff;" onclick="event.stopPropagation();runTakeoff(${p.id})" title="Material Takeoff">`;
        actions += hasTakeoff ? 'Edit Takeoff' : 'Takeoff';
        actions += `</button> `;
        actions += `<button class="btn btn-small btn-danger" onclick="event.stopPropagation();deletePlan(${p.id})" title="Delete">Delete</button>`;

        return `<tr>
            <td>${escapeHtml(jobName)}</td>
            <td style="font-weight:600;">${escapeHtml(p.title || '-')}</td>
            <td>${typeBadge}</td>
            <td><span class="status-badge ${statusClass}">${p.status}</span></td>
            <td style="text-align:center;">${p.page_count || '-'}</td>
            <td style="font-size:13px;color:var(--gray-500);">${p.upload_date || p.created_at || '-'}</td>
            <td style="white-space:nowrap;">${actions}</td>
        </tr>`;
    }).join('');
}

function getPlanStatusClass(status) {
    switch (status) {
        case 'Uploaded':        return 'status-draft';
        case 'Reviewing':       return 'status-open';
        case 'Reviewed':        return 'status-complete';
        case 'Takeoff Complete': return 'status-approved';
        default:                return 'status-draft';
    }
}

// ─── Modal Controls ──────────────────────────────────────────
function showAddPlan() {
    editingPlanId = null;
    document.getElementById('planModalTitle').textContent = 'Upload Plan';
    document.getElementById('planJob').value = document.getElementById('filterJob').value || '';
    document.getElementById('planTitle').value = '';
    document.getElementById('planType').value = 'Mechanical';
    document.getElementById('planStatus').value = 'Uploaded';
    document.getElementById('planStatusGroup').style.display = 'none';
    document.getElementById('planNotes').value = '';
    document.getElementById('planFile').value = '';
    document.getElementById('planModal').style.display = 'flex';
}

async function editPlan(id) {
    const res = await fetch('/api/plans/' + id);
    const p = await res.json();
    if (p.error) { alert(p.error); return; }

    editingPlanId = p.id;
    document.getElementById('planModalTitle').textContent = 'Edit Plan';
    document.getElementById('planJob').value = p.job_id || '';
    document.getElementById('planTitle').value = p.title || '';
    document.getElementById('planType').value = p.plan_type || 'Mechanical';
    document.getElementById('planStatus').value = p.status || 'Uploaded';
    document.getElementById('planStatusGroup').style.display = '';
    document.getElementById('planNotes').value = p.notes || '';
    document.getElementById('planFile').value = '';
    document.getElementById('planModal').style.display = 'flex';
}

// ─── View Plan Detail ────────────────────────────────────────
async function viewPlan(id) {
    const res = await fetch('/api/plans/' + id);
    const p = await res.json();
    if (p.error) { alert(p.error); return; }

    const jobName = p.job_name || (jobsList.find(j => j.id === p.job_id) || {}).name || '-';
    const hasFile = p.has_file || p.file_path;

    const typeColors = {
        'Mechanical':    { bg: '#DBEAFE', color: '#1E40AF' },
        'Architectural': { bg: '#FEF3C7', color: '#92400E' },
        'Structural':    { bg: '#E0E7FF', color: '#3730A3' },
        'Plumbing':      { bg: '#D1FAE5', color: '#065F46' },
        'Electrical':    { bg: '#FDE68A', color: '#78350F' },
        'Site':          { bg: '#E5E7EB', color: '#374151' },
        'Full Set':      { bg: '#FCE7F3', color: '#9D174D' },
    };
    const tc = typeColors[p.plan_type] || { bg: '#F3F4F6', color: '#6B7280' };

    let html = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
            <div>
                <div style="font-size:13px;color:var(--gray-500);margin-bottom:2px;">Job</div>
                <div style="font-weight:600;">${escapeHtml(jobName)}</div>
            </div>
            <div>
                <div style="font-size:13px;color:var(--gray-500);margin-bottom:2px;">Status</div>
                <div><span class="status-badge ${getPlanStatusClass(p.status)}">${p.status}</span></div>
            </div>
            <div>
                <div style="font-size:13px;color:var(--gray-500);margin-bottom:2px;">Plan Type</div>
                <div><span class="badge" style="background:${tc.bg};color:${tc.color};">${p.plan_type || '-'}</span></div>
            </div>
            <div>
                <div style="font-size:13px;color:var(--gray-500);margin-bottom:2px;">Pages</div>
                <div style="font-weight:600;">${p.page_count || '-'}</div>
            </div>
            <div>
                <div style="font-size:13px;color:var(--gray-500);margin-bottom:2px;">Upload Date</div>
                <div>${p.upload_date || '-'}</div>
            </div>
            <div>
                <div style="font-size:13px;color:var(--gray-500);margin-bottom:2px;">Created</div>
                <div>${p.created_at || '-'}</div>
            </div>
        </div>`;

    if (p.notes) {
        html += `
        <div style="margin-bottom:16px;">
            <div style="font-size:13px;color:var(--gray-500);margin-bottom:4px;">Notes</div>
            <div style="white-space:pre-wrap;background:var(--gray-50);padding:12px;border-radius:6px;font-size:14px;">${escapeHtml(p.notes)}</div>
        </div>`;
    }

    if (hasFile) {
        html += `
        <div style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-secondary" onclick="viewFile(${p.id})">View PDF</button>
            <button class="btn" style="background:#8B5CF6;color:#fff;" onclick="document.getElementById('planDetailModal').style.display='none';runAiReview(${p.id})">Run Extract Data</button>`;
        html += `
            <button class="btn" style="background:#059669;color:#fff;" onclick="document.getElementById('planDetailModal').style.display='none';runTakeoff(${p.id})">Material Takeoff</button>`;
        html += `</div>`;
    }

    // Show AI review summary if available
    if (p.ai_review && typeof p.ai_review === 'object') {
        html += `
        <div style="margin-top:16px;">
            <div style="font-size:13px;color:var(--gray-500);margin-bottom:4px;">Plan Data Extract Summary</div>
            <div>${renderReviewHtml(p.ai_review)}</div>
        </div>`;
    }

    // Show takeoff summary if available
    if (p.takeoff_data && typeof p.takeoff_data === 'object' && p.takeoff_data.summary) {
        const s = p.takeoff_data.summary;
        html += `
        <div style="margin-top:16px;">
            <div style="font-size:13px;color:var(--gray-500);margin-bottom:4px;">Material Takeoff Summary</div>
            <div style="background:var(--gray-50);padding:12px;border-radius:6px;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                    <div><strong>Total Units:</strong> ${s.total_units || '-'}</div>
                    <div><strong>Total Bedrooms:</strong> ${s.total_bedrooms || '-'}</div>
                    <div><strong>Total Bathrooms:</strong> ${s.total_bathrooms || '-'}</div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--gray-200);">
                    <div><strong>Subtotal:</strong> ${fmt(s.subtotal)}</div>
                    <div><strong>Tax (${(s.tax_rate * 100).toFixed(2)}%):</strong> ${fmt(s.tax)}</div>
                </div>
                <div style="border-top:2px solid var(--gray-300);padding-top:8px;margin-top:8px;">
                    <strong style="font-size:16px;">Grand Total: ${fmt(s.grand_total)}</strong>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--gray-200);background:#EFF6FF;margin:-0 -12px -12px;padding:10px 12px;border-radius:0 0 6px 6px;">
                    <div><strong>Price per Apartment:</strong> ${fmt(s.price_per_apartment)}</div>
                    <div><strong>Price per System:</strong> ${fmt(s.price_per_system)}</div>
                </div>
            </div>
        </div>`;
    }

    document.getElementById('detailTitle').textContent = p.title || 'Plan Details';
    document.getElementById('detailContent').innerHTML = html;
    document.getElementById('planDetailModal').style.display = 'flex';
}

// ─── Save (Create / Update) ─────────────────────────────────
async function savePlan(event) {
    event.preventDefault();

    const fileInput = document.getElementById('planFile');
    const hasFile = fileInput.files && fileInput.files[0];

    if (editingPlanId) {
        if (hasFile) {
            const fd = new FormData();
            fd.append('title', document.getElementById('planTitle').value);
            fd.append('plan_type', document.getElementById('planType').value);
            fd.append('status', document.getElementById('planStatus').value);
            fd.append('notes', document.getElementById('planNotes').value);
            fd.append('file', fileInput.files[0]);
            await fetch('/api/plans/' + editingPlanId, { method: 'PUT', body: fd });
        } else {
            await fetch('/api/plans/' + editingPlanId, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    title: document.getElementById('planTitle').value,
                    plan_type: document.getElementById('planType').value,
                    status: document.getElementById('planStatus').value,
                    notes: document.getElementById('planNotes').value
                })
            });
        }
    } else {
        const fd = new FormData();
        fd.append('job_id', document.getElementById('planJob').value);
        fd.append('title', document.getElementById('planTitle').value);
        fd.append('plan_type', document.getElementById('planType').value);
        fd.append('notes', document.getElementById('planNotes').value);
        if (hasFile) fd.append('file', fileInput.files[0]);
        await fetch('/api/plans', { method: 'POST', body: fd });
    }

    document.getElementById('planModal').style.display = 'none';
    editingPlanId = null;
    loadPlans();
}

// ─── Delete ──────────────────────────────────────────────────
async function deletePlan(id) {
    if (!confirm('Delete this plan? This cannot be undone.')) return;
    await fetch('/api/plans/' + id, { method: 'DELETE' });
    loadPlans();
}

// ─── View File ───────────────────────────────────────────────
function viewFile(id) {
    window.open('/api/plans/' + id + '/file', '_blank');
}

// ─── Plan Data Extract ──────────────────────────────────────────
let _reviewPollTimer = null;

async function runAiReview(id) {
    const plan = allPlans.find(p => p.id === id);
    const title = plan ? plan.title : 'Plan #' + id;

    const panel = document.getElementById('reviewPanel');
    const content = document.getElementById('reviewContent');

    // Fetch cost estimate first
    panel.style.display = '';
    content.innerHTML = '<div style="text-align:center;padding:30px;color:var(--gray-500);">Scanning PDF to estimate cost...</div>';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    let estimate = null;
    try {
        const estRes = await fetch('/api/plans/' + id + '/review-estimate');
        estimate = await estRes.json();
    } catch(e) {}

    if (estimate && estimate.error) {
        content.innerHTML = `<div style="color:#EF4444;padding:20px;"><strong>Error:</strong> ${escapeHtml(estimate.error)}</div>`;
        return;
    }

    // Build confirmation with cost breakdown
    let confirmMsg = `Run Plan Data Extract on "${title}"?\n\n`;
    if (estimate) {
        confirmMsg += `PDF: ${estimate.page_count} total pages\n`;
        confirmMsg += `Mechanical sheets to analyze: ${estimate.mech_sheets + estimate.hvac_keyword_pages} pages as images\n`;
        confirmMsg += `Specification text: ${estimate.spec_pages} pages\n`;
        confirmMsg += `Est. input tokens: ~${(estimate.estimated_input_tokens / 1000).toFixed(1)}k\n`;
        confirmMsg += `\nEstimated cost: ~$${estimate.estimated_cost.toFixed(2)}\n`;
    } else {
        confirmMsg += `This will analyze the PDF using AI vision.\n`;
    }

    if (!confirm(confirmMsg)) {
        panel.style.display = 'none';
        return;
    }

    content.innerHTML = _buildProgressHtml('Starting review...', 0, 'Initializing...');

    try {
        const res = await fetch('/api/plans/' + id + '/review', { method: 'POST' });
        const startResult = await res.json();

        if (startResult.error) {
            content.innerHTML = `<div style="color:#EF4444;padding:20px;"><strong>Error:</strong> ${escapeHtml(startResult.error)}</div>`;
            return;
        }

        _pollReviewProgress(id, content, panel);

    } catch (e) {
        content.innerHTML = `<div style="color:#EF4444;padding:20px;"><strong>Error:</strong> ${escapeHtml(e.message)}</div>`;
    }
}

function _buildProgressHtml(stepMsg, pct, detail) {
    const steps = [
        { n: 1, label: 'Scan Pages' },
        { n: 2, label: 'Identify Sheets' },
        { n: 3, label: 'Render Images' },
        { n: 4, label: 'Extract Specs' },
        { n: 5, label: 'AI Analysis' },
        { n: 6, label: 'Save Results' }
    ];
    const currentStep = Math.max(1, Math.min(6, Math.ceil(pct / 17)));

    let stepsHtml = '<div style="display:flex;gap:4px;justify-content:center;margin-bottom:20px;">';
    steps.forEach(s => {
        const isDone = pct >= (s.n * 17);
        const isCurrent = s.n === currentStep && pct < 100;
        const bg = isDone ? '#22C55E' : isCurrent ? '#3B82F6' : 'var(--gray-200)';
        const color = (isDone || isCurrent) ? '#fff' : 'var(--gray-500)';
        const pulse = isCurrent ? 'animation:pulse 1.5s infinite;' : '';
        stepsHtml += `<div style="display:flex;flex-direction:column;align-items:center;flex:1;max-width:100px;">
            <div style="width:32px;height:32px;border-radius:50%;background:${bg};color:${color};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;${pulse}">${isDone ? '&#10003;' : s.n}</div>
            <div style="font-size:11px;color:${isCurrent ? '#3B82F6' : 'var(--gray-500)'};margin-top:4px;text-align:center;font-weight:${isCurrent ? '600' : '400'};">${s.label}</div>
        </div>`;
    });
    stepsHtml += '</div>';

    return `
        <div style="padding:30px 20px;text-align:center;">
            <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}</style>
            ${stepsHtml}
            <div style="background:var(--gray-200);border-radius:8px;height:12px;overflow:hidden;margin:0 auto;max-width:500px;">
                <div style="background:linear-gradient(90deg,#3B82F6,#8B5CF6);height:100%;border-radius:8px;width:${pct}%;transition:width 0.5s ease;"></div>
            </div>
            <div style="margin-top:12px;font-size:15px;font-weight:600;color:var(--gray-700);">${escapeHtml(stepMsg)}</div>
            <div style="margin-top:4px;font-size:13px;color:var(--gray-500);">${escapeHtml(detail || '')}</div>
        </div>`;
}

function _pollReviewProgress(id, contentEl, panelEl) {
    if (_reviewPollTimer) clearInterval(_reviewPollTimer);

    _reviewPollTimer = setInterval(async () => {
        try {
            const res = await fetch('/api/plans/' + id + '/review-status');
            const prog = await res.json();

            if (prog.error) {
                clearInterval(_reviewPollTimer);
                _reviewPollTimer = null;
                contentEl.innerHTML = `<div style="color:#EF4444;padding:20px;"><strong>Error:</strong> ${escapeHtml(prog.error)}</div>`;
                return;
            }

            // Update progress bar
            const detail = prog.pct >= 70 && !prog.done ? 'Large plans may take 30-90 seconds for AI analysis' : '';
            contentEl.innerHTML = _buildProgressHtml(prog.message || 'Processing...', prog.pct || 0, detail);

            if (prog.done && prog.result) {
                clearInterval(_reviewPollTimer);
                _reviewPollTimer = null;
                contentEl.innerHTML = renderReviewHtml(prog.result);
                loadPlans(); // refresh table status
            } else if (prog.done && !prog.result && !prog.error) {
                // Done but no result — reload from plans list (it was saved to DB)
                clearInterval(_reviewPollTimer);
                _reviewPollTimer = null;
                contentEl.innerHTML = _buildProgressHtml('Complete!', 100, 'Loading results...');
                loadPlans();
                // Fetch the updated plan to get the review
                setTimeout(async () => {
                    try {
                        const pRes = await fetch('/api/plans');
                        const plans = await pRes.json();
                        const updated = plans.find(p => p.id === id);
                        if (updated && updated.ai_review) {
                            const rev = typeof updated.ai_review === 'string' ? JSON.parse(updated.ai_review) : updated.ai_review;
                            contentEl.innerHTML = renderReviewHtml(rev);
                        }
                    } catch(e) {}
                }, 500);
            }
        } catch (e) {
            // Network error — keep polling
        }
    }, 1500); // poll every 1.5 seconds
}

// ─── Render Review HTML ──────────────────────────────────────
function renderReviewHtml(review) {
    if (typeof review === 'string') {
        return `<div style="white-space:pre-wrap;font-size:14px;line-height:1.6;">${escapeHtml(review)}</div>`;
    }

    let html = '';
    const th = 'style="text-align:left;padding:6px 8px;white-space:nowrap;"';
    const td = 'style="padding:6px 8px;border-bottom:1px solid var(--gray-200);"';
    const tdc = 'style="padding:6px 8px;border-bottom:1px solid var(--gray-200);text-align:center;"';

    // Meta line
    if (review.reviewed_at) {
        let meta = `Reviewed: ${review.reviewed_at}`;
        if (review.pages_analyzed) meta += ` &middot; ${review.pages_analyzed} sheets analyzed`;
        if (review.spec_pages_read) meta += ` &middot; ${review.spec_pages_read} spec pages`;
        if (review.tokens_used) {
            meta += ` &middot; ${(review.tokens_used.input/1000).toFixed(1)}k / ${(review.tokens_used.output/1000).toFixed(1)}k tokens`;
        }
        if (review.actual_cost) meta += ` &middot; $${review.actual_cost.toFixed(2)}`;
        if (review.sheets_analyzed && review.sheets_analyzed.length) {
            meta += ` &middot; Sheets: ${review.sheets_analyzed.join(', ')}`;
        }
        html += `<div style="font-size:12px;color:var(--gray-400);margin-bottom:16px;">${meta}</div>`;
    }

    // Summary
    if (review.summary) {
        html += `<div style="margin-bottom:20px;padding:12px;background:#EFF6FF;border-radius:6px;border-left:4px solid #3B82F6;">
            <div style="white-space:pre-wrap;font-size:14px;line-height:1.6;">${escapeHtml(review.summary)}</div>
        </div>`;
    }

    // Building Info
    const bi = review.building_info;
    if (bi && (bi.type || bi.total_apartments)) {
        html += `<div style="margin-bottom:20px;">
            <h3 style="margin:0 0 8px;font-size:16px;">Building Information</h3>
            <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:14px;margin-bottom:8px;">
                ${bi.type ? `<div><strong>Type:</strong> ${escapeHtml(bi.type)}</div>` : ''}
                ${bi.total_floors ? `<div><strong>Floors:</strong> ${bi.total_floors}</div>` : ''}
                ${bi.total_apartments ? `<div><strong>Total Units:</strong> ${bi.total_apartments}</div>` : ''}
                ${bi.location ? `<div><strong>Location:</strong> ${escapeHtml(bi.location)}</div>` : ''}
            </div>`;
        if (bi.unit_types && bi.unit_types.length) {
            html += `<table style="width:100%;font-size:13px;border-collapse:collapse;">
                <tr style="background:var(--gray-100);"><th ${th}>Unit Type</th><th ${th}>Beds</th><th ${th}>Baths</th><th ${th}>Count</th><th ${th}>HVAC Mark</th></tr>
                ${bi.unit_types.map(u => `<tr><td ${td}>${escapeHtml(u.name||'')}</td><td ${tdc}>${u.beds||'-'}</td><td ${tdc}>${u.baths||'-'}</td><td ${tdc}>${u.count||'-'}</td><td ${td}>${escapeHtml(u.hvac_mark||'')}</td></tr>`).join('')}
            </table>`;
        }
        if (bi.notes) html += `<div style="margin-top:6px;font-size:13px;color:var(--gray-500);">${escapeHtml(bi.notes)}</div>`;
        html += `</div>`;
    }

    // Equipment Schedule
    const equip = review.equipment_schedule || review.equipment_found || [];
    if (equip.length) {
        html += `<div style="margin-bottom:20px;">
            <h3 style="margin:0 0 8px;font-size:16px;">Equipment Schedule (${equip.length} items)</h3>
            <div style="overflow-x:auto;"><table style="width:100%;font-size:12px;border-collapse:collapse;">
                <tr style="background:var(--gray-100);"><th ${th}>Mark</th><th ${th}>Type</th><th ${th}>Manufacturer</th><th ${th}>Model</th><th ${th}>Tons/BTU</th><th ${th}>CFM</th><th ${th}>Voltage</th><th ${th}>Count</th><th ${th}>Location</th></tr>
                ${equip.map(e => {
                    const tons = e.tonnage ? e.tonnage + 'T' : (e.cooling_btu ? (e.cooling_btu/12000).toFixed(1) + 'T' : (e.description || '-'));
                    return `<tr>
                        <td ${td}><strong>${escapeHtml(e.mark||e.tag||'')}</strong></td>
                        <td ${td}>${escapeHtml(e.type||'')}</td>
                        <td ${td}>${escapeHtml(e.manufacturer||'')}</td>
                        <td ${td} style="font-size:11px;">${escapeHtml(e.model||'')}</td>
                        <td ${tdc}>${escapeHtml(String(tons))}</td>
                        <td ${tdc}>${e.cfm||'-'}</td>
                        <td ${td} style="font-size:11px;">${escapeHtml(e.voltage||'')}</td>
                        <td ${tdc}>${e.count||1}</td>
                        <td ${td} style="font-size:11px;">${escapeHtml(e.location||e.notes||'')}</td>
                    </tr>`;
                }).join('')}
            </table></div>
        </div>`;
    }

    // Duct Sizes
    if (review.duct_sizes && review.duct_sizes.length) {
        html += `<div style="margin-bottom:20px;">
            <h3 style="margin:0 0 8px;font-size:16px;">Duct Sizes (${review.duct_sizes.length} entries)</h3>
            <table style="width:100%;font-size:13px;border-collapse:collapse;">
                <tr style="background:var(--gray-100);"><th ${th}>Size</th><th ${th}>Type</th><th ${th}>Location</th><th ${th}>Count</th></tr>
                ${review.duct_sizes.map(d => `<tr><td ${td}><strong>${escapeHtml(d.size)}</strong></td><td ${td}>${escapeHtml((d.type||'').replace(/_/g,' '))}</td><td ${td}>${escapeHtml(d.location||'')}</td><td ${tdc}>${d.count||1}</td></tr>`).join('')}
            </table>
        </div>`;
    }

    // Diffusers
    if (review.diffusers && review.diffusers.length) {
        html += `<div style="margin-bottom:20px;">
            <h3 style="margin:0 0 8px;font-size:16px;">Diffusers / Registers / Grilles</h3>
            <table style="width:100%;font-size:13px;border-collapse:collapse;">
                <tr style="background:var(--gray-100);"><th ${th}>Type</th><th ${th}>Size</th><th ${th}>CFM</th><th ${th}>Count</th><th ${th}>Location</th></tr>
                ${review.diffusers.map(d => `<tr><td ${td}>${escapeHtml(d.type||'')}</td><td ${td}>${escapeHtml(d.size||'')}</td><td ${tdc}>${d.cfm||'-'}</td><td ${tdc}>${d.count||1}</td><td ${td}>${escapeHtml(d.location||'')}</td></tr>`).join('')}
            </table>
        </div>`;
    }

    // Exhaust Fans
    if (review.exhaust_fans && review.exhaust_fans.length) {
        html += `<div style="margin-bottom:20px;">
            <h3 style="margin:0 0 8px;font-size:16px;">Exhaust Fans</h3>
            <table style="width:100%;font-size:13px;border-collapse:collapse;">
                <tr style="background:var(--gray-100);"><th ${th}>Mark</th><th ${th}>Model</th><th ${th}>CFM</th><th ${th}>Type</th><th ${th}>Count</th></tr>
                ${review.exhaust_fans.map(f => `<tr><td ${td}><strong>${escapeHtml(f.mark||'')}</strong></td><td ${td}>${escapeHtml(f.model||'')}</td><td ${tdc}>${f.cfm||'-'}</td><td ${td}>${escapeHtml(f.type||'')}</td><td ${tdc}>${f.count||1}</td></tr>`).join('')}
            </table>
        </div>`;
    }

    // Refrigerant Lines
    if (review.refrigerant_lines && review.refrigerant_lines.length) {
        html += `<div style="margin-bottom:20px;">
            <h3 style="margin:0 0 8px;font-size:16px;">Refrigerant Line Sizes</h3>
            <table style="width:100%;font-size:13px;border-collapse:collapse;">
                <tr style="background:var(--gray-100);"><th ${th}>Mark</th><th ${th}>Suction</th><th ${th}>Liquid</th><th ${th}>Notes</th></tr>
                ${review.refrigerant_lines.map(r => `<tr><td ${td}><strong>${escapeHtml(r.mark||'')}</strong></td><td ${tdc}>${escapeHtml(r.suction_size||'-')}"</td><td ${tdc}>${escapeHtml(r.liquid_size||'-')}"</td><td ${td}>${escapeHtml(r.notes||'')}</td></tr>`).join('')}
            </table>
        </div>`;
    }

    // Electrical
    if (review.electrical && review.electrical.length) {
        html += `<div style="margin-bottom:20px;">
            <h3 style="margin:0 0 8px;font-size:16px;">Electrical Requirements</h3>
            <table style="width:100%;font-size:13px;border-collapse:collapse;">
                <tr style="background:var(--gray-100);"><th ${th}>Mark</th><th ${th}>Voltage</th><th ${th}>MCA</th><th ${th}>MOCP</th><th ${th}>Wire</th><th ${th}>Disconnect</th></tr>
                ${review.electrical.map(e => `<tr><td ${td}><strong>${escapeHtml(e.mark||'')}</strong></td><td ${td}>${escapeHtml(e.voltage||'')}</td><td ${tdc}>${e.mca||'-'}</td><td ${tdc}>${e.mocp||'-'}</td><td ${td}>${escapeHtml(e.wire_size||'-')}</td><td ${td}>${escapeHtml(e.disconnect||'-')}</td></tr>`).join('')}
            </table>
        </div>`;
    }

    // Notes & Details
    if (review.notes_and_details && review.notes_and_details.length) {
        html += `<div style="margin-bottom:20px;padding:12px;background:var(--gray-50);border-radius:6px;">
            <h3 style="margin:0 0 8px;font-size:16px;">Notes & Details from Plans</h3>
            <ul style="margin:0;padding-left:20px;">
                ${review.notes_and_details.map(n => `<li style="margin-bottom:6px;font-size:13px;line-height:1.5;">${escapeHtml(n)}</li>`).join('')}
            </ul>
        </div>`;
    }

    // Legacy findings (backwards compat)
    if (review.findings && review.findings.length) {
        html += `<div style="margin-bottom:20px;">
            <h3 style="margin:0 0 12px;font-size:16px;">Additional Findings</h3>`;
        const typeStyles = {
            'ok':      { bg: '#F0FDF4', border: '#22C55E', icon: '\u2713', color: '#166534' },
            'warning': { bg: '#FFFBEB', border: '#F59E0B', icon: '\u26A0', color: '#92400E' },
            'info':    { bg: '#EFF6FF', border: '#3B82F6', icon: '\u2139', color: '#1E40AF' },
            'error':   { bg: '#FEF2F2', border: '#EF4444', icon: '\u2717', color: '#991B1B' }
        };
        review.findings.forEach(f => {
            const s = typeStyles[f.type] || typeStyles['info'];
            html += `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;margin-bottom:6px;background:${s.bg};border-left:3px solid ${s.border};border-radius:4px;font-size:13px;">
                <span style="color:${s.color};font-weight:700;flex-shrink:0;">${s.icon}</span>
                <span style="color:${s.color};">${f.category ? '<strong>' + escapeHtml(f.category) + ':</strong> ' : ''}${escapeHtml(f.message)}</span>
            </div>`;
        });
        html += `</div>`;
    }

    return html || '<div style="color:var(--gray-500);padding:12px;">No review data available.</div>';
}

// ─── Material Takeoff ────────────────────────────────────────

function showTakeoffQuestions(planId) {
    currentTakeoffPlanId = planId;
    const modal = document.getElementById('takeoffQuestionsModal');
    modal.style.display = 'flex';

    // Wire up unit qty totals
    document.querySelectorAll('.uQty').forEach(inp => {
        inp.onchange = inp.oninput = updateUnitTotal;
    });
    updateUnitTotal();

    // Wire up ductboard toggle
    const db = document.getElementById('tqDuctboard');
    db.onchange = function() {
        document.getElementById('tqDuctboardQtyWrap').style.display = this.checked ? '' : 'none';
    };

    // Wire up CRD kitchen toggle
    const crdCb = document.getElementById('tqCRDs');
    crdCb.onchange = function() {
        document.getElementById('tqCRDKitchenWrap').style.display = this.checked ? '' : 'none';
    };
    document.getElementById('tqCRDKitchenWrap').style.display = crdCb.checked ? '' : 'none';

    // Wire up gas line size visibility
    toggleGasOptions();
}

function toggleGasOptions() {
    const sys = document.getElementById('tqSystemType').value;
    const gasWrap = document.getElementById('tqGasLineSizeWrap');
    if (gasWrap) gasWrap.style.display = sys === 'gas_furnace' ? '' : 'none';
}

function updateUnitTotal() {
    let total = 0;
    document.querySelectorAll('.uQty').forEach(inp => { total += parseInt(inp.value) || 0; });
    document.getElementById('tqTotalUnitsDisplay').textContent = total;
}

let _customRowId = 0;
function addUnitTypeRow() {
    _customRowId++;
    const tbody = document.querySelector('#unitTypesTable tbody');
    const tr = document.createElement('tr');
    tr.dataset.unit = 'custom';
    tr.dataset.customId = _customRowId;
    tr.style.background = '#FFFBEB';
    tr.innerHTML = `
        <td style="padding:4px;white-space:nowrap;">
            <div style="display:flex;align-items:center;gap:4px;">
                <select class="form-select uBeds" style="width:44px;padding:3px;font-size:12px;">
                    <option value="1">1</option><option value="2" selected>2</option><option value="3">3</option><option value="4">4</option>
                </select>
                <span style="font-size:11px;">Bed /</span>
                <select class="form-select uBaths" style="width:44px;padding:3px;font-size:12px;">
                    <option value="1">1</option><option value="2" selected>2</option><option value="3">3</option>
                </select>
                <span style="font-size:11px;">Bath</span>
                <button type="button" onclick="this.closest('tr').remove();updateUnitTotal();" style="background:none;border:none;color:#EF4444;cursor:pointer;font-size:16px;padding:0 2px;" title="Remove row">&times;</button>
            </div>
        </td>
        <td style="padding:3px;"><input type="number" class="form-input uQty" min="0" step="any" value="0" style="width:55px;text-align:center;padding:4px;" oninput="updateUnitTotal()" onchange="updateUnitTotal()"></td>
        <td style="padding:3px;"><select class="form-select uTon" style="padding:4px;font-size:12px;"><option value="1.5">1.5T</option><option value="2" selected>2T</option><option value="2.5">2.5T</option><option value="3">3T</option><option value="3.5">3.5T</option><option value="4">4T</option><option value="5">5T</option></select></td>
        <td style="padding:3px;"><select class="form-select uHS" style="padding:4px;font-size:12px;"><option value="0">None</option><option value="5">5kW</option><option value="8" selected>8kW</option><option value="10">10kW</option><option value="15">15kW</option><option value="20">20kW</option></select></td>
        <td style="padding:3px;"><input type="number" class="form-input uDrop6" min="0" step="any" value="3" style="width:55px;text-align:center;padding:4px;"></td>
        <td style="padding:3px;"><input type="number" class="form-input uDrop8" min="0" step="any" value="1" style="width:55px;text-align:center;padding:4px;"></td>
        <td style="padding:3px;"><input type="number" class="form-input uDrop10" min="0" step="any" value="0" style="width:55px;text-align:center;padding:4px;"></td>
        <td style="padding:3px;"><input type="number" class="form-input uRet" min="0" step="any" value="1" style="width:55px;text-align:center;padding:4px;"></td>
        <td style="padding:3px;"><input type="number" class="form-input uLS" min="0" step="any" value="" placeholder="--" style="width:55px;text-align:center;padding:4px;font-size:12px;" title="Leave blank to use building default"></td>`;
    tbody.appendChild(tr);
}

function _readUnitTypes() {
    const rows = document.querySelectorAll('#unitTypesTable tbody tr');
    const defaultLS = parseFloat(document.getElementById('tqLineSetLength').value) || 25;
    const units = [];
    rows.forEach(row => {
        const qty = parseFloat(row.querySelector('.uQty').value) || 0;
        if (qty <= 0) return;

        // Read beds/baths — preset rows use data-unit, custom rows use selects
        let beds, baths;
        if (row.dataset.unit === 'custom') {
            beds  = parseInt(row.querySelector('.uBeds').value);
            baths = parseInt(row.querySelector('.uBaths').value);
        } else {
            const [b, ba] = row.dataset.unit.split('-').map(Number);
            beds = b; baths = ba;
        }

        const lsOverride = parseFloat(row.querySelector('.uLS').value);
        const ut = {
            beds, baths, qty,
            tonnage:     parseFloat(row.querySelector('.uTon').value),
            heat_strip:  parseFloat(row.querySelector('.uHS').value),
            drops_6:     parseFloat(row.querySelector('.uDrop6').value) || 0,
            drops_8:     parseFloat(row.querySelector('.uDrop8').value) || 0,
            drops_10:    parseFloat(row.querySelector('.uDrop10').value) || 0,
            returns:     parseFloat(row.querySelector('.uRet').value) || 1,
        };
        if (lsOverride > 0) ut.line_set_override = lsOverride;
        units.push(ut);
    });
    return units;
}

async function submitTakeoffQuestions(e) {
    e.preventDefault();

    const unit_types = _readUnitTypes();
    if (unit_types.length === 0) {
        alert('Enter a quantity for at least one unit type.');
        return;
    }
    const totalUnits = unit_types.reduce((s, u) => s + u.qty, 0);

    document.getElementById('takeoffQuestionsModal').style.display = 'none';

    const payload = {
        unit_types,
        system_type:        document.getElementById('tqSystemType').value,
        thermostat:         document.getElementById('tqThermostat').value,
        stories:            parseInt(document.getElementById('tqStories').value) || 3,
        line_set_length:    parseFloat(document.getElementById('tqLineSetLength').value) || 25,
        flex_per_drop:      parseFloat(document.getElementById('tqFlexPerDrop').value) || 1,
        outdoor_loc:        document.getElementById('tqOutdoorLoc').value,
        orientation:        document.getElementById('tqOrientation').value,
        install_loc:        document.getElementById('tqInstallLoc').value,
        mounting:           document.getElementById('tqMounting').value,
        exhaust_type:       document.getElementById('tqExhaustType').value,
        ductboard:          document.getElementById('tqDuctboard').checked,
        ductboard_per_unit: parseFloat(document.getElementById('tqDuctboardQty').value) || 2,
        zoning:             document.getElementById('tqZoning').checked,
        fire_wrap:          document.getElementById('tqFireWrap').checked,
        crds:               document.getElementById('tqCRDs').checked,
        crd_kitchen:        document.getElementById('tqCRDKitchen').checked,
        fresh_air_per_unit: parseFloat(document.getElementById('tqFreshAirPerUnit').value) || 1,
        drain_pans:         document.getElementById('tqDrainPans').checked,
        outside_air:        document.getElementById('tqOutsideAir').checked,
        wrap_dryers_boots:  document.getElementById('tqWrapDryersBoots').checked,
        passthroughs:       document.getElementById('tqPassthroughs').checked,
        include_freight:    document.getElementById('tqFreight').checked,
        // New fields
        r8_floors:          parseInt(document.getElementById('tqR8Floors').value) || 1,
        tstat_wire_gauge:   document.getElementById('tqTstatWireGauge').value,
        line_insul_type:    document.getElementById('tqLineInsulType').value,
        condensate_material: document.getElementById('tqCondensateMat').value,
        gas_line_size:      document.getElementById('tqGasLineSize').value,
        corridor_units:     parseInt(document.getElementById('tqCorridorUnits').value) || 0,
    };

    const panel = document.getElementById('takeoffPanel');
    const content = document.getElementById('takeoffContent');
    panel.style.display = '';

    const typeSummary = unit_types.map(u => {
        let s = `${u.qty}x ${u.beds}b/${u.baths}ba @${u.tonnage}T`;
        const totalDrops = (u.drops_6||0) + (u.drops_8||0) + (u.drops_10||0);
        s += ` (${totalDrops}d/${u.returns||1}r)`;
        return s;
    }).join(', ');
    content.innerHTML = `
        <div style="text-align:center;padding:40px;">
            <div style="font-size:18px;font-weight:600;margin-bottom:8px;">Calculating Material Takeoff...</div>
            <div style="color:var(--gray-500);">${totalUnits} total units: ${typeSummary}</div>
            <div style="margin-top:16px;"><span class="loading-spinner"></span></div>
        </div>`;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        const res = await fetch('/api/plans/' + currentTakeoffPlanId + '/takeoff', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.error) {
            content.innerHTML = `<div style="color:#EF4444;padding:20px;"><strong>Error:</strong> ${escapeHtml(result.error)}</div>`;
            return;
        }

        currentTakeoff = result;
        renderTakeoffEditor(result);
        loadPlans();
    } catch (err) {
        content.innerHTML = `<div style="color:#EF4444;padding:20px;"><strong>Error:</strong> ${escapeHtml(err.message)}</div>`;
    }
}

function runTakeoff(id) {
    showTakeoffQuestions(id);
}

function renderTakeoffEditor(takeoff) {
    const content = document.getElementById('takeoffContent');
    const detected = document.getElementById('takeoffDetected');
    detected.style.display = 'none';

    // Show inputs summary
    const inputsEl = document.getElementById('takeoffInputsSummary');
    if (takeoff.inputs) {
        const inp = takeoff.inputs;
        const sysLabels = {heat_pump: 'Heat Pump', condenser: 'AC Condenser', gas_furnace: 'Gas Furnace', mini_split: 'Mini Split'};
        const unitLines = (inp.unit_types || []).map(u => {
            const totalD = (u.drops_6||0) + (u.drops_8||0) + (u.drops_10||0);
            return `${u.qty}x ${u.beds}b/${u.baths}ba @ ${u.tonnage}T (${totalD}d/${u.returns||1}r)`;
        }).join(' &bull; ');
        const totalU = (inp.unit_types || []).reduce((s, u) => s + u.qty, 0);
        const flags = [];
        if (inp.ductboard) flags.push('Ductboard');
        if (inp.fire_wrap) flags.push('Fire Wrap');
        if (inp.zoning) flags.push('Zoning');
        if (inp.crds) flags.push('CRDs');
        if (inp.outside_air) flags.push('OA/ERV');
        if (inp.passthroughs) flags.push('Passthroughs');
        if (inp.wrap_dryers_boots) flags.push('Dryer Vents');
        const details = [];
        details.push(`${sysLabels[inp.system_type] || inp.system_type}`);
        details.push(`${inp.stories} stories`);
        details.push(`${inp.line_set_length}ft LS`);
        details.push(`R8 top ${inp.r8_floors || 1} floor(s)`);
        if (inp.tstat_wire_gauge) details.push(inp.tstat_wire_gauge + ' tstat wire');
        if (inp.condensate_material) details.push(inp.condensate_material.toUpperCase() + ' condensate');
        if (inp.line_insul_type) details.push(inp.line_insul_type === 'armaflex' ? 'Armaflex' : 'Fiberglass insul');
        if (inp.system_type === 'gas_furnace' && inp.gas_line_size) details.push(inp.gas_line_size + '" gas');
        if (inp.corridor_units > 0) details.push(inp.corridor_units + ' corridor units');
        inputsEl.innerHTML = `
            <div style="font-size:13px;line-height:1.6;">
                <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                    <strong style="color:var(--primary);">${totalU} Units:</strong>
                    <span>${unitLines}</span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;color:var(--gray-600);">
                    ${details.map(d => '<span>' + d + '</span>').join(' <span>&bull;</span> ')}
                </div>
                ${flags.length ? '<div style="margin-top:4px;"><span style="font-size:12px;color:var(--gray-500);">Options: ' + flags.join(', ') + '</span></div>' : ''}
            </div>`;
        inputsEl.style.display = '';
    } else {
        inputsEl.style.display = 'none';
    }

    // Render sections
    let html = '';
    takeoff.sections.forEach((section, si) => {
        const activeCount = section.items.filter(item => item.use).length;
        const sectionTotal = section.items.reduce((sum, item) => sum + (item.total_with_waste || 0), 0);

        html += `
        <div class="card" style="margin-bottom:16px;border-radius:8px;overflow:hidden;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--gray-100);cursor:pointer;user-select:none;" onclick="toggleTakeoffSection(${si})">
                <div style="display:flex;align-items:center;gap:10px;">
                    <span id="takeoffArrow${si}" style="transition:transform 0.2s;display:inline-block;">&#9660;</span>
                    <strong style="font-size:15px;">${escapeHtml(section.name)}</strong>
                    <span style="font-size:12px;color:var(--gray-500);">${activeCount} active / ${section.items.length} items</span>
                </div>
                <strong id="sectionTotal${si}" style="font-size:14px;">${fmt(sectionTotal)}</strong>
            </div>
            <div id="takeoffSection${si}" style="overflow-x:auto;">
                <table style="width:100%;font-size:13px;border-collapse:collapse;">
                    <thead>
                        <tr style="background:var(--gray-50);">
                            <th style="text-align:center;padding:8px 6px;width:50px;">Use</th>
                            <th style="text-align:left;padding:8px 6px;">Part</th>
                            <th style="text-align:left;padding:8px 6px;">SKU</th>
                            <th style="text-align:left;padding:8px 6px;">Category</th>
                            <th style="text-align:right;padding:8px 6px;">Unit Price</th>
                            <th style="text-align:center;padding:8px 4px;width:30px;" title="Price Source">Src</th>
                            <th style="text-align:center;padding:8px 6px;width:90px;">Qty</th>
                            <th style="text-align:right;padding:8px 6px;">w/ Waste</th>
                            <th style="text-align:right;padding:8px 6px;">Total</th>
                        </tr>
                    </thead>
                    <tbody>`;

        section.items.forEach((item, ii) => {
            const wasteQty = item.use && item.quantity > 0 ? Math.ceil(item.quantity * (1 + takeoff.waste_factor) * 100) / 100 : 0;
            const rowBg = item.use ? '' : 'opacity:0.45;';
            const srcType = item.price_source_type || 'default';
            const srcColor = srcType === 'quote' ? '#10B981' : srcType === 'historical' ? '#F59E0B' : '#9CA3AF';
            const srcTitle = escapeHtml(item.price_source || 'Template default');
            html += `
                        <tr style="${rowBg}" id="takeoffRow${si}_${ii}">
                            <td style="text-align:center;padding:6px;">
                                <input type="checkbox" ${item.use ? 'checked' : ''} onchange="toggleTakeoffItem(${si},${ii},this.checked)">
                            </td>
                            <td style="padding:6px;font-weight:500;">${escapeHtml(item.part)}</td>
                            <td style="padding:6px;color:var(--gray-500);font-size:12px;">${escapeHtml(item.sku || '')}</td>
                            <td style="padding:6px;font-size:12px;">${escapeHtml(item.category || '')}</td>
                            <td style="text-align:right;padding:6px;">
                                <input type="number" min="0" step="0.01" value="${item.price}" style="width:80px;text-align:right;padding:4px;border:1px solid var(--gray-300);border-radius:4px;font-size:13px;" onchange="updateTakeoffPrice(${si},${ii},this.value)">
                            </td>
                            <td style="text-align:center;padding:6px;" title="${srcTitle}">
                                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${srcColor};" id="priceSrc${si}_${ii}"></span>
                            </td>
                            <td style="text-align:center;padding:6px;">
                                <input type="number" min="0" step="any" value="${item.quantity}" style="width:70px;text-align:center;padding:4px;border:1px solid var(--gray-300);border-radius:4px;font-size:13px;" onchange="updateTakeoffQty(${si},${ii},this.value)">
                            </td>
                            <td style="text-align:right;padding:6px;color:var(--gray-500);" id="wasteQty${si}_${ii}">${wasteQty || '-'}</td>
                            <td style="text-align:right;padding:6px;font-weight:600;" id="itemTotal${si}_${ii}">${item.total_with_waste ? fmt(item.total_with_waste) : '-'}</td>
                        </tr>`;
        });

        html += `
                    </tbody>
                </table>
            </div>
        </div>`;
    });

    content.innerHTML = html;
    updateTakeoffTotals();
}

function toggleTakeoffSection(si) {
    const el = document.getElementById('takeoffSection' + si);
    const arrow = document.getElementById('takeoffArrow' + si);
    if (el.style.display === 'none') {
        el.style.display = '';
        arrow.style.transform = '';
    } else {
        el.style.display = 'none';
        arrow.style.transform = 'rotate(-90deg)';
    }
}

function toggleTakeoffItem(si, ii, checked) {
    if (!currentTakeoff) return;
    currentTakeoff.sections[si].items[ii].use = checked;
    const row = document.getElementById(`takeoffRow${si}_${ii}`);
    row.style.opacity = checked ? '' : '0.45';
    updateTakeoffTotals();
}

function updateTakeoffQty(si, ii, val) {
    if (!currentTakeoff) return;
    const qty = Math.max(0, parseFloat(val) || 0);
    currentTakeoff.sections[si].items[ii].quantity = qty;
    updateTakeoffTotals();
}

function updateTakeoffPrice(si, ii, val) {
    if (!currentTakeoff) return;
    const price = Math.max(0, parseFloat(val) || 0);
    currentTakeoff.sections[si].items[ii].price = price;
    currentTakeoff.sections[si].items[ii].price_source = 'Manual override';
    currentTakeoff.sections[si].items[ii].price_source_type = 'manual';
    // Update dot to blue for manual
    const dot = document.getElementById(`priceSrc${si}_${ii}`);
    if (dot) {
        dot.style.background = '#3B82F6';
        dot.parentElement.title = 'Manual override';
    }
    updateTakeoffTotals();
}

function updateTakeoffTotals() {
    if (!currentTakeoff) return;
    const wasteFactor = currentTakeoff.waste_factor || 0.075;
    const taxRate = currentTakeoff.tax_rate || 0.0885;
    let grandSubtotal = 0;

    currentTakeoff.sections.forEach((section, si) => {
        let sectionTotal = 0;
        section.items.forEach((item, ii) => {
            const qty = item.quantity || 0;
            const waste = item.use && qty > 0 ? qty * wasteFactor : 0;
            const totalQty = qty + waste;
            const total = item.use ? Math.round(totalQty * item.price * 100) / 100 : 0;
            item.total_with_waste = total;
            sectionTotal += total;

            const wasteEl = document.getElementById(`wasteQty${si}_${ii}`);
            const totalEl = document.getElementById(`itemTotal${si}_${ii}`);
            if (wasteEl) wasteEl.textContent = item.use && qty > 0 ? (Math.ceil(totalQty * 100) / 100).toFixed(2) : '-';
            if (totalEl) totalEl.textContent = total > 0 ? fmt(total) : '-';
        });

        const sectionTotalEl = document.getElementById(`sectionTotal${si}`);
        if (sectionTotalEl) sectionTotalEl.textContent = fmt(sectionTotal);
        grandSubtotal += sectionTotal;
    });

    const tax = Math.round(grandSubtotal * taxRate * 100) / 100;
    const grandTotal = Math.round((grandSubtotal + tax) * 100) / 100;

    // Update summary
    if (currentTakeoff.summary) {
        currentTakeoff.summary.subtotal = Math.round(grandSubtotal * 100) / 100;
        currentTakeoff.summary.tax = tax;
        currentTakeoff.summary.grand_total = grandTotal;
    }

    // Calculate per-unit breakdowns from summary data
    const s = currentTakeoff.summary || {};
    const totalUnits = s.total_units || 0;
    const totalSystems = s.total_systems || totalUnits;
    const pricePerApt = totalUnits > 0 ? Math.round(grandTotal / totalUnits * 100) / 100 : 0;
    const pricePerSys = totalSystems > 0 ? Math.round(grandTotal / totalSystems * 100) / 100 : 0;

    // Update summary fields
    if (currentTakeoff.summary) {
        currentTakeoff.summary.price_per_apartment = pricePerApt;
        currentTakeoff.summary.price_per_system = pricePerSys;
    }

    // Render summary footer
    const summaryEl = document.getElementById('takeoffSummary');
    summaryEl.innerHTML = `
        ${totalUnits > 0 ? `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px;">
            <div style="background:#EFF6FF;padding:8px 12px;border-radius:6px;text-align:center;">
                <div style="font-size:20px;font-weight:700;color:#1E40AF;">${totalUnits}</div>
                <div style="font-size:11px;color:var(--gray-500);">Total Units</div>
            </div>
            <div style="background:#EFF6FF;padding:8px 12px;border-radius:6px;text-align:center;">
                <div style="font-size:20px;font-weight:700;color:#1E40AF;">${s.total_bedrooms || 0}</div>
                <div style="font-size:11px;color:var(--gray-500);">Total Bedrooms</div>
            </div>
            <div style="background:#EFF6FF;padding:8px 12px;border-radius:6px;text-align:center;">
                <div style="font-size:20px;font-weight:700;color:#1E40AF;">${s.total_bathrooms || 0}</div>
                <div style="font-size:11px;color:var(--gray-500);">Total Bathrooms</div>
            </div>
            <div style="background:#EFF6FF;padding:8px 12px;border-radius:6px;text-align:center;">
                <div style="font-size:20px;font-weight:700;color:#1E40AF;">${s.total_drops || 0}</div>
                <div style="font-size:11px;color:var(--gray-500);">Total Drops</div>
            </div>
        </div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;align-items:end;">
            <div>
                <div style="font-size:13px;color:var(--gray-500);">Subtotal</div>
                <div style="font-size:18px;font-weight:600;">${fmt(grandSubtotal)}</div>
            </div>
            <div>
                <div style="font-size:13px;color:var(--gray-500);">Tax (${(taxRate * 100).toFixed(2)}%)</div>
                <div style="font-size:18px;font-weight:600;">${fmt(tax)}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:13px;color:var(--gray-500);">Grand Total</div>
                <div style="font-size:24px;font-weight:700;color:#059669;">${fmt(grandTotal)}</div>
            </div>
        </div>
        ${totalUnits > 0 ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;padding-top:12px;border-top:1px solid var(--gray-200);">
            <div style="background:#F0FDF4;padding:8px 12px;border-radius:6px;text-align:center;">
                <div style="font-size:18px;font-weight:700;color:#059669;">${fmt(pricePerApt)}</div>
                <div style="font-size:11px;color:var(--gray-500);">Price per Apartment</div>
            </div>
            <div style="background:#F0FDF4;padding:8px 12px;border-radius:6px;text-align:center;">
                <div style="font-size:18px;font-weight:700;color:#059669;">${fmt(pricePerSys)}</div>
                <div style="font-size:11px;color:var(--gray-500);">Price per System</div>
            </div>
        </div>` : ''}
        <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div style="font-size:12px;color:var(--gray-400);">
                Waste factor: ${(wasteFactor * 100).toFixed(1)}% &bull; Tax rate: ${(taxRate * 100).toFixed(2)}%
            </div>
            <div style="display:flex;gap:12px;font-size:11px;color:var(--gray-500);">
                <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10B981;margin-right:3px;"></span>Job Quote</span>
                <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#F59E0B;margin-right:3px;"></span>Historical</span>
                <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#9CA3AF;margin-right:3px;"></span>Default</span>
                <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3B82F6;margin-right:3px;"></span>Manual</span>
            </div>
        </div>`;
}

// ─── Save Takeoff ────────────────────────────────────────────
async function saveTakeoff() {
    if (!currentTakeoff || !currentTakeoffPlanId) return;

    const btn = document.getElementById('saveTakeoffBtn');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        await fetch('/api/plans/' + currentTakeoffPlanId, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                title: (allPlans.find(p => p.id === currentTakeoffPlanId) || {}).title || '',
                plan_type: (allPlans.find(p => p.id === currentTakeoffPlanId) || {}).plan_type || 'Mechanical',
                status: 'Takeoff Complete',
                notes: (allPlans.find(p => p.id === currentTakeoffPlanId) || {}).notes || '',
                takeoff_data: JSON.stringify(currentTakeoff)
            })
        });
        btn.textContent = 'Saved!';
        setTimeout(() => { btn.textContent = 'Save Takeoff'; btn.disabled = false; }, 1500);
        loadPlans();
    } catch (e) {
        alert('Error saving takeoff: ' + e.message);
        btn.textContent = 'Save Takeoff';
        btn.disabled = false;
    }
}

// ─── Export Takeoff as CSV ───────────────────────────────────
function exportTakeoff() {
    if (!currentTakeoff) return;

    const rows = [['Section', 'Part', 'SKU', 'Category', 'Unit Price', 'Price Source', 'Qty', 'Qty w/ Waste', 'Total']];
    const wasteFactor = currentTakeoff.waste_factor || 0.075;

    currentTakeoff.sections.forEach(section => {
        section.items.forEach(item => {
            if (!item.use) return;
            const qty = item.quantity || 0;
            const wasteQty = qty > 0 ? Math.ceil(qty * (1 + wasteFactor) * 100) / 100 : 0;
            rows.push([
                section.name,
                item.part,
                item.sku || '',
                item.category || '',
                item.price.toFixed(2),
                item.price_source || 'Template default',
                qty,
                wasteQty.toFixed(2),
                (item.total_with_waste || 0).toFixed(2)
            ]);
        });
    });

    // Add summary rows
    if (currentTakeoff.summary) {
        rows.push([]);
        rows.push(['', '', '', '', '', '', 'Subtotal', currentTakeoff.summary.subtotal.toFixed(2)]);
        rows.push(['', '', '', '', '', '', 'Tax (' + (currentTakeoff.summary.tax_rate * 100).toFixed(2) + '%)', currentTakeoff.summary.tax.toFixed(2)]);
        rows.push(['', '', '', '', '', '', 'Grand Total', currentTakeoff.summary.grand_total.toFixed(2)]);
    }

    const csv = rows.map(r => r.map(c => {
        const s = String(c);
        return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const plan = allPlans.find(p => p.id === currentTakeoffPlanId);
    a.download = 'takeoff_' + (plan ? plan.title.replace(/\s+/g, '_') : currentTakeoffPlanId) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// ─── Drag & Drop Upload ─────────────────────────────────────
let droppedFiles = [];
let dragCounter = 0;

document.addEventListener('DOMContentLoaded', function() {
    const body = document.body;
    const overlay = document.getElementById('dropOverlay');

    body.addEventListener('dragenter', function(e) {
        e.preventDefault();
        dragCounter++;
        if (e.dataTransfer.types.includes('Files')) {
            overlay.style.display = 'flex';
        }
    });

    body.addEventListener('dragleave', function(e) {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            overlay.style.display = 'none';
        }
    });

    body.addEventListener('dragover', function(e) {
        e.preventDefault();
    });

    body.addEventListener('drop', function(e) {
        e.preventDefault();
        dragCounter = 0;
        overlay.style.display = 'none';

        const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
        if (!files.length) {
            alert('Please drop PDF files only.');
            return;
        }
        droppedFiles = files;
        showDropUploadModal(files);
    });
});

function showDropUploadModal(files) {
    // Populate job dropdown
    const sel = document.getElementById('dropJob');
    sel.innerHTML = '<option value="">-- Select Job --</option>';
    jobsList.forEach(j => {
        const o = document.createElement('option');
        o.value = j.id;
        o.textContent = j.name;
        sel.appendChild(o);
    });
    // Pre-select if filter is set
    const filterVal = document.getElementById('filterJob').value;
    if (filterVal) sel.value = filterVal;

    // Show file list
    const listEl = document.getElementById('dropFileList');
    listEl.innerHTML = files.map((f, i) => {
        const name = f.name.replace(/\.pdf$/i, '');
        return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:6px;margin-bottom:6px;">
            <span style="font-size:18px;">&#128196;</span>
            <div style="flex:1;">
                <input type="text" class="form-input drop-file-title" data-index="${i}" value="${escapeHtml(name)}" placeholder="Plan title" style="font-size:13px;padding:4px 8px;">
            </div>
            <span style="font-size:11px;color:var(--gray-400);">${(f.size / 1024 / 1024).toFixed(1)} MB</span>
        </div>`;
    }).join('');

    document.getElementById('dropUploadTitle').textContent = files.length === 1 ? 'Upload Dropped File' : `Upload ${files.length} Dropped Files`;
    document.getElementById('dropUploadModal').style.display = 'flex';
}

function cancelDropUpload() {
    droppedFiles = [];
    document.getElementById('dropUploadModal').style.display = 'none';
}

async function submitDropUpload(e) {
    e.preventDefault();
    const jobId = document.getElementById('dropJob').value;
    if (!jobId) { alert('Please select a job.'); return; }

    const planType = document.getElementById('dropType').value;
    const btn = document.getElementById('dropSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Uploading...';

    const titleInputs = document.querySelectorAll('.drop-file-title');

    try {
        for (let i = 0; i < droppedFiles.length; i++) {
            const file = droppedFiles[i];
            const title = (titleInputs[i] ? titleInputs[i].value.trim() : '') || file.name.replace(/\.pdf$/i, '');

            const fd = new FormData();
            fd.append('job_id', jobId);
            fd.append('title', title);
            fd.append('plan_type', planType);
            fd.append('notes', '');
            fd.append('file', file);

            const res = await fetch('/api/plans', { method: 'POST', body: fd });
            if (!res.ok) {
                const err = await res.json();
                alert(`Failed to upload "${file.name}": ${err.error || 'Unknown error'}`);
            }
        }

        document.getElementById('dropUploadModal').style.display = 'none';
        droppedFiles = [];
        loadPlans();
    } catch (err) {
        alert('Upload failed: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Upload';
    }
}

// ─── Utility ─────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
