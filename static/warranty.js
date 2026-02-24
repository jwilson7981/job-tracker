/* Warranty JS */
let allWarrantyItems = [];

// List page
if (document.getElementById('warrantyBody') && !window.JOB_ID) {
    loadWarrantyList();
}

async function loadWarrantyList() {
    const res = await fetch('/api/warranty');
    allWarrantyItems = await res.json();
    renderWarrantyTable('all');
}

function filterWarranty(status, btn) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderWarrantyTable(status);
}

function renderWarrantyTable(status) {
    const items = status === 'all' ? allWarrantyItems : allWarrantyItems.filter(i => i.status === status);
    const tbody = document.getElementById('warrantyBody');
    if (!items.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No warranty items.</td></tr>'; return; }
    tbody.innerHTML = items.map(i => {
        const statusClass = i.status.toLowerCase().replace(/ /g, '-');
        return `<tr>
            <td><a href="/warranty/job/${i.job_id}" class="link">${i.job_name || '-'}</a></td>
            <td>${i.item_description || '-'}</td>
            <td>${i.manufacturer || '-'}</td>
            <td>${i.warranty_start || '-'}</td>
            <td>${i.warranty_end || '-'}</td>
            <td><span class="status-badge status-${statusClass}">${i.status}</span></td>
            <td><a href="/warranty/job/${i.job_id}" class="btn btn-small btn-secondary">View</a></td>
        </tr>`;
    }).join('');
}

// Job warranty page
if (window.JOB_ID && document.getElementById('warrantyItems')) {
    loadJobWarranties();
}

async function loadJobWarranties() {
    const res = await fetch(`/api/warranty/job/${JOB_ID}`);
    const items = await res.json();
    const container = document.getElementById('warrantyItems');
    if (!items.length) { container.innerHTML = '<div class="empty-state">No warranty items for this job.</div>'; return; }
    container.innerHTML = items.map(i => {
        const claimsHtml = i.claims.length ? i.claims.map(c => `
            <div class="claim-card">
                <div class="claim-header">
                    <span class="status-badge status-${c.status.toLowerCase().replace(/ /g,'-')}">${c.status}</span>
                    <span>${c.claim_date || '-'}</span>
                </div>
                <p>${c.description || '-'}</p>
                ${c.resolution ? `<p><strong>Resolution:</strong> ${c.resolution}</p>` : ''}
                <select onchange="updateClaim(${c.id}, this.value)" style="padding:4px;border-radius:4px;border:1px solid var(--gray-300);margin-top:4px;">
                    ${['Open','In Progress','Resolved','Denied'].map(s => `<option value="${s}" ${c.status===s?'selected':''}>${s}</option>`).join('')}
                </select>
            </div>
        `).join('') : '<p class="text-muted">No claims filed.</p>';

        return `<div class="card" style="margin-bottom:16px;">
            <div class="card-header">
                <h3>${i.item_description || 'Warranty Item'}</h3>
                <div>
                    <span class="status-badge status-${i.status.toLowerCase().replace(/ /g,'-')}">${i.status}</span>
                    <button class="btn btn-small btn-secondary" onclick="showFileClaim(${i.id})" style="margin-left:8px;">File Claim</button>
                    <button class="btn btn-small btn-danger" onclick="deleteWarrantyItem(${i.id})" style="margin-left:4px;">Del</button>
                </div>
            </div>
            <div class="card-body">
                <p><strong>Manufacturer:</strong> ${i.manufacturer || '-'}</p>
                <p><strong>Period:</strong> ${i.warranty_start || '-'} to ${i.warranty_end || '-'}</p>
                <p><strong>Coverage:</strong> ${i.coverage_details || '-'}</p>
                <h4 style="margin-top:12px;margin-bottom:8px;">Claims</h4>
                ${claimsHtml}
            </div>
        </div>`;
    }).join('');
}

function showAddWarranty() {
    document.getElementById('wiDesc').value = '';
    document.getElementById('wiMfg').value = '';
    document.getElementById('wiStart').value = '';
    document.getElementById('wiEnd').value = '';
    document.getElementById('wiCoverage').value = '';
    document.getElementById('warrantyModal').style.display = 'flex';
}

async function saveWarrantyItem(e) {
    e.preventDefault();
    await fetch('/api/warranty/items', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            job_id: JOB_ID, item_description: document.getElementById('wiDesc').value,
            manufacturer: document.getElementById('wiMfg').value, warranty_start: document.getElementById('wiStart').value,
            warranty_end: document.getElementById('wiEnd').value, coverage_details: document.getElementById('wiCoverage').value,
        })
    });
    document.getElementById('warrantyModal').style.display = 'none';
    loadJobWarranties();
}

function showFileClaim(warrantyId) {
    document.getElementById('claimWarrantyId').value = warrantyId;
    document.getElementById('claimDate').valueAsDate = new Date();
    document.getElementById('claimDesc').value = '';
    document.getElementById('claimModal').style.display = 'flex';
}

async function saveWarrantyClaim(e) {
    e.preventDefault();
    await fetch('/api/warranty/claims', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            warranty_id: document.getElementById('claimWarrantyId').value,
            claim_date: document.getElementById('claimDate').value,
            description: document.getElementById('claimDesc').value,
        })
    });
    document.getElementById('claimModal').style.display = 'none';
    loadJobWarranties();
}

async function updateClaim(id, status) {
    await fetch(`/api/warranty/claims/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status}) });
    loadJobWarranties();
}

async function deleteWarrantyItem(id) {
    if (confirm('Delete this warranty item and all claims?')) {
        await fetch(`/api/warranty/items/${id}`, {method:'DELETE'});
        loadJobWarranties();
    }
}
