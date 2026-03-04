/* Pay Applications (AIA G702/G703) JS */
function fmt(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ─── Page Router ─────────────────────────────────────────────
if (window.PA_PAGE === 'list') initList();
else if (window.PA_PAGE === 'contract') initContract();
else if (window.PA_PAGE === 'application') initApplication();
else if (window.PA_PAGE === 'analytics') initAnalytics();

// ─── LIST PAGE ───────────────────────────────────────────────
let paJobs = [];
async function initList() {
    const res = await fetch('/api/jobs/list');
    paJobs = await res.json();
    const sel = document.getElementById('ncJob');
    paJobs.forEach(j => { const o = document.createElement('option'); o.value = j.id; o.textContent = j.name; sel.appendChild(o); });
    sel.addEventListener('change', async () => {
        const jobId = sel.value;
        if (!jobId) return;
        try {
            const r = await fetch('/api/jobs/' + jobId + '/customer-info');
            const c = await r.json();
            if (c.company_name) document.getElementById('ncGcName').value = c.company_name;
            if (c.address) document.getElementById('ncGcAddr').value = c.address;
            if (c.primary_contact) document.getElementById('ncGcContact').value = c.primary_contact;
            if (c.contact_email) document.getElementById('ncGcEmail').value = c.contact_email;
            if (c.contact_phone) document.getElementById('ncGcPhone').value = c.contact_phone;
        } catch(e) {}
    });
    loadContracts();
}

async function loadContracts() {
    const res = await fetch('/api/payapps/contracts');
    const contracts = await res.json();
    const tbody = document.getElementById('contractsBody');
    if (!contracts.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No contracts yet.</td></tr>'; return; }
    tbody.innerHTML = contracts.map(c => `<tr>
        <td><a href="/payapps/contract/${c.id}" class="link">${c.job_name || 'Job #' + c.job_id}</a></td>
        <td>${c.gc_name || '-'}</td>
        <td>${c.project_no || '-'}</td>
        <td>${fmt(c.original_contract_sum)}</td>
        <td>${c.app_count || 0}</td>
        <td>${c.latest_status ? '<span class="phase-status phase-' + c.latest_status.toLowerCase() + '">' + c.latest_status + '</span>' : '-'}</td>
        <td>
            <a href="/payapps/contract/${c.id}" class="btn btn-small btn-secondary">View</a>
            <button class="btn btn-small btn-danger" onclick="deleteContract(${c.id})">Delete</button>
        </td>
    </tr>`).join('');
}

function showNewContract() { document.getElementById('contractModal').style.display = 'flex'; }

async function saveContract(e) {
    e.preventDefault();
    await fetch('/api/payapps/contracts', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            job_id: document.getElementById('ncJob').value,
            gc_name: document.getElementById('ncGcName').value,
            gc_address: document.getElementById('ncGcAddr').value,
            gc_contact: document.getElementById('ncGcContact').value,
            gc_email: document.getElementById('ncGcEmail').value,
            gc_phone: document.getElementById('ncGcPhone').value,
            project_no: document.getElementById('ncProjNo').value,
            contract_for: document.getElementById('ncContractFor').value,
            contract_date: document.getElementById('ncContractDate').value,
            original_contract_sum: parseFloat(document.getElementById('ncContractSum').value) || 0,
            retainage_work_pct: parseFloat(document.getElementById('ncRetWork').value) || 10,
            retainage_stored_pct: parseFloat(document.getElementById('ncRetStored').value) || 0,
        })
    });
    document.getElementById('contractModal').style.display = 'none';
    loadContracts();
}

async function deleteContract(id) {
    if (!confirm('Delete this contract and all its pay applications?')) return;
    await fetch('/api/payapps/contracts/' + id, { method: 'DELETE' });
    loadContracts();
}

// ─── CONTRACT PAGE ───────────────────────────────────────────
let sovItems = [];
let contractData = null;

async function initContract() {
    await loadContractDetail();
    loadSov();
    loadApplications();
}

async function loadContractDetail() {
    const res = await fetch('/api/payapps/contracts/' + PA_CONTRACT_ID + '/detail');
    contractData = await res.json();
    document.getElementById('contractTitle').textContent = (contractData.job_name || 'Job') + ' — Pay App Contract';
    const d = contractData;
    document.getElementById('contractDetails').innerHTML = `
        <div class="detail-grid" style="grid-template-columns:1fr 1fr 1fr;">
            <div class="detail-row"><span class="detail-label">GC:</span><span>${d.gc_name || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">GC Address:</span><span>${d.gc_address || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">Project #:</span><span>${d.project_no || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">Contract For:</span><span>${d.contract_for || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">Contract Date:</span><span>${d.contract_date || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">Original Sum:</span><span>${fmt(d.original_contract_sum)}</span></div>
            <div class="detail-row"><span class="detail-label">Retainage (Work):</span><span>${d.retainage_work_pct}%</span></div>
            <div class="detail-row"><span class="detail-label">Retainage (Stored):</span><span>${d.retainage_stored_pct}%</span></div>
        </div>`;
}

async function loadSov() {
    const res = await fetch('/api/payapps/contracts/' + PA_CONTRACT_ID + '/sov');
    sovItems = await res.json();
    const tbody = document.getElementById('sovBody');
    if (!sovItems.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No line items. Add lines or use "Add Building".</td></tr>'; document.getElementById('sovFoot').innerHTML = ''; return; }
    let total = 0;
    tbody.innerHTML = sovItems.map((s, i) => {
        if (!s.is_header) total += (s.scheduled_value || 0);
        return s.is_header
            ? `<tr class="sov-header-row"><td>${s.item_number}</td><td colspan="2"><strong>${s.description}</strong></td><td></td><td>
                <button class="btn btn-small btn-secondary" onclick="editSovItem(${s.id})">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteSovItem(${s.id})">Del</button></td></tr>`
            : `<tr><td>${s.item_number}</td><td>${s.description}</td><td>${fmt(s.scheduled_value)}</td>
                <td>${s.retainage_exempt ? 'Exempt' : 'Yes'}</td><td>
                <button class="btn btn-small btn-secondary" onclick="editSovItem(${s.id})">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteSovItem(${s.id})">Del</button></td></tr>`;
    }).join('');
    document.getElementById('sovFoot').innerHTML = `<tr style="font-weight:700;"><td></td><td>TOTAL</td><td>${fmt(total)}</td><td></td><td></td></tr>`;
}

function showAddSovItem() {
    document.getElementById('sovModalTitle').textContent = 'Add Line Item';
    document.getElementById('sovId').value = '';
    document.getElementById('sovDesc').value = '';
    document.getElementById('sovValue').value = '0';
    document.getElementById('sovIsHeader').checked = false;
    document.getElementById('sovRetExempt').checked = false;
    document.getElementById('sovModal').style.display = 'flex';
}

function editSovItem(id) {
    const s = sovItems.find(x => x.id === id);
    if (!s) return;
    document.getElementById('sovModalTitle').textContent = 'Edit Line Item';
    document.getElementById('sovId').value = s.id;
    document.getElementById('sovDesc').value = s.description;
    document.getElementById('sovValue').value = s.scheduled_value || 0;
    document.getElementById('sovIsHeader').checked = !!s.is_header;
    document.getElementById('sovRetExempt').checked = !!s.retainage_exempt;
    document.getElementById('sovModal').style.display = 'flex';
}

async function saveSovItem(e) {
    e.preventDefault();
    const id = document.getElementById('sovId').value;
    const data = {
        description: document.getElementById('sovDesc').value,
        scheduled_value: parseFloat(document.getElementById('sovValue').value) || 0,
        is_header: document.getElementById('sovIsHeader').checked ? 1 : 0,
        retainage_exempt: document.getElementById('sovRetExempt').checked ? 1 : 0,
    };
    if (id) {
        await fetch('/api/payapps/sov/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    } else {
        data.sort_order = sovItems.length;
        await fetch('/api/payapps/contracts/' + PA_CONTRACT_ID + '/sov', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    }
    document.getElementById('sovModal').style.display = 'none';
    loadSov();
}

async function deleteSovItem(id) {
    if (!confirm('Delete this line item?')) return;
    await fetch('/api/payapps/sov/' + id, { method: 'DELETE' });
    loadSov();
}

function showAddBuilding() { document.getElementById('buildingModal').style.display = 'flex'; }

async function saveBuilding(e) {
    e.preventDefault();
    const name = document.getElementById('bldgName').value;
    const lines = [
        { description: name.toUpperCase(), is_header: 1, scheduled_value: 0, retainage_exempt: 0 },
        { description: 'Material', scheduled_value: parseFloat(document.getElementById('bldgMaterial').value) || 0, retainage_exempt: 1 },
        { description: 'Rough In', scheduled_value: parseFloat(document.getElementById('bldgRoughIn').value) || 0 },
        { description: 'Air Handler', scheduled_value: parseFloat(document.getElementById('bldgAH').value) || 0 },
        { description: 'Condenser Installation', scheduled_value: parseFloat(document.getElementById('bldgCond').value) || 0 },
        { description: 'Trim Out', scheduled_value: parseFloat(document.getElementById('bldgTrim').value) || 0 },
        { description: 'Start Up/Low Voltage', scheduled_value: parseFloat(document.getElementById('bldgStartup').value) || 0 },
        { description: 'Change Order', scheduled_value: 0, retainage_exempt: 0 },
    ];
    let order = sovItems.length;
    for (const line of lines) {
        line.sort_order = order++;
        await fetch('/api/payapps/contracts/' + PA_CONTRACT_ID + '/sov', {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(line)
        });
    }
    document.getElementById('buildingModal').style.display = 'none';
    // Reset form
    ['bldgName','bldgMaterial','bldgRoughIn','bldgAH','bldgCond','bldgTrim','bldgStartup'].forEach(id => document.getElementById(id).value = '');
    loadSov();
}

async function loadApplications() {
    const res = await fetch('/api/payapps/contracts/' + PA_CONTRACT_ID + '/applications');
    const apps = await res.json();
    const tbody = document.getElementById('appsBody');
    if (!apps.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No applications yet.</td></tr>'; return; }
    tbody.innerHTML = apps.map(a => `<tr>
        <td><a href="/payapps/application/${a.id}" class="link">#${a.application_number}</a></td>
        <td>${a.period_to || '-'}</td>
        <td>${fmt(a.current_payment_due)}</td>
        <td><span class="phase-status phase-${a.status.toLowerCase()}">${a.status}</span></td>
        <td>
            <a href="/payapps/application/${a.id}" class="btn btn-small btn-secondary">Open</a>
            <button class="btn btn-small btn-danger" onclick="deleteApplication(${a.id})">Delete</button>
        </td>
    </tr>`).join('');
}

async function createApplication() {
    const res = await fetch('/api/payapps/contracts/' + PA_CONTRACT_ID + '/applications', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}'
    });
    const data = await res.json();
    if (data.id) window.location.href = '/payapps/application/' + data.id;
}

async function deleteApplication(id) {
    if (!confirm('Delete this pay application?')) return;
    await fetch('/api/payapps/applications/' + id, { method: 'DELETE' });
    loadApplications();
}

// ─── APPLICATION PAGE (G702/G703) ────────────────────────────
let appData = null;

async function initApplication() {
    const res = await fetch('/api/payapps/applications/' + PA_APP_ID);
    appData = await res.json();
    document.getElementById('backLink').href = '/payapps/contract/' + appData.contract.id;
    document.getElementById('appTitle').textContent = 'Pay Application #' + appData.application.application_number;
    document.getElementById('appStatus').value = appData.application.status;
    document.getElementById('periodTo').value = appData.application.period_to || '';
    // Auto-calculated CO values from backend
    document.getElementById('coAddDisplay').textContent = fmt(appData.g702.co_this_additions || 0);
    document.getElementById('coDelDisplay').textContent = fmt(appData.g702.co_this_deductions || 0);

    // G702 header info
    document.getElementById('g702AppNo').textContent = appData.application.application_number;
    document.getElementById('g702PeriodTo').textContent = appData.application.period_to || '-';
    document.getElementById('g702RetPct').textContent = appData.contract.retainage_work_pct;
    document.getElementById('g702RetStoredPct').textContent = appData.contract.retainage_stored_pct;
    document.getElementById('g702Info').innerHTML = `
        <div><strong>TO GC:</strong> ${appData.contract.gc_name || '-'}<br>${appData.contract.gc_address || ''}</div>
        <div><strong>PROJECT:</strong> ${appData.job_name || '-'}<br>${appData.contract.project_address || ''}</div>
        <div><strong>FROM:</strong> LGHVAC LLC<br><strong>CONTRACT FOR:</strong> ${appData.contract.contract_for || '-'}<br><strong>PROJECT NO:</strong> ${appData.contract.project_no || '-'}</div>`;

    renderG703();
    recalcG702();

    // Show View PDF / Email buttons if a PDF has been generated
    if (appData.application.pdf_file) {
        const viewBtn = document.getElementById('viewPdfBtn');
        if (viewBtn) viewBtn.style.display = '';
        const emailBtn = document.getElementById('emailPdfBtn');
        if (emailBtn) emailBtn.style.display = '';
    }
    // Show View Signed button if signed copy uploaded
    if (appData.application.signed_file) {
        const signedBtn = document.getElementById('viewSignedBtn');
        if (signedBtn) signedBtn.style.display = '';
    }
    // Load signature preview
    loadSignaturePreview();
}

function viewPayAppPDF() {
    if (appData && appData.application.pdf_file) {
        window.open('/api/payapps/applications/' + PA_APP_ID + '/pdf/' + appData.application.pdf_file, '_blank');
    } else {
        alert('No PDF generated yet. Click "Generate PDF" first.');
    }
}

function renderG703() {
    const tbody = document.getElementById('g703Body');
    const lines = appData.lines;
    if (!lines.length) { tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No SOV items.</td></tr>'; return; }

    tbody.innerHTML = lines.map(l => {
        if (l.is_header) {
            return `<tr class="sov-header-row"><td>${l.item_number}</td><td colspan="9"><strong>${l.description}</strong></td></tr>`;
        }
        const sv = l.scheduled_value || 0;
        return `<tr>
            <td>${l.item_number}</td>
            <td>${l.description}</td>
            <td class="cell-money">${fmt(sv)}</td>
            <td class="cell-money">${fmt(l.from_previous)}</td>
            <td><input type="number" class="g703-input" step="0.01" value="${l.this_period || 0}"
                data-sov="${l.sov_item_id}" data-field="work_this_period" onchange="onG703Change(this)"></td>
            <td><input type="number" class="g703-input" step="0.01" value="${l.materials_stored || 0}"
                data-sov="${l.sov_item_id}" data-field="materials_stored" onchange="onG703Change(this)"></td>
            <td class="cell-money" id="g703G_${l.sov_item_id}">${fmt(l.total_completed)}</td>
            <td class="cell-pct" id="g703H_${l.sov_item_id}">${Math.round(l.pct_complete)}%</td>
            <td class="cell-money" id="g703I_${l.sov_item_id}">${fmt(l.balance)}</td>
            <td class="cell-money" id="g703J_${l.sov_item_id}">${l.retainage ? fmt(l.retainage) : '-'}</td>
        </tr>`;
    }).join('');

    renderG703Totals();
}

function renderG703Totals() {
    const t = appData.totals;
    document.getElementById('g703Foot').innerHTML = `<tr style="font-weight:700;">
        <td></td><td>GRAND TOTALS</td>
        <td class="cell-money">${fmt(t.scheduled_value)}</td>
        <td class="cell-money">${fmt(t.from_previous)}</td>
        <td class="cell-money">${fmt(t.this_period)}</td>
        <td class="cell-money">${fmt(t.materials_stored)}</td>
        <td class="cell-money">${fmt(t.total_completed)}</td>
        <td class="cell-pct">${t.scheduled_value ? Math.round(t.total_completed / t.scheduled_value * 100) : 0}%</td>
        <td class="cell-money">${fmt(t.balance)}</td>
        <td class="cell-money">${fmt(t.retainage)}</td>
    </tr>`;
}

function onG703Change(input) {
    const sovId = parseInt(input.dataset.sov);
    const field = input.dataset.field;
    const val = parseFloat(input.value) || 0;
    const line = appData.lines.find(l => l.sov_item_id === sovId);
    if (!line) return;

    if (field === 'work_this_period') line.this_period = val;
    else line.materials_stored = val;

    // Recalculate this line
    line.total_completed = line.from_previous + line.this_period + line.materials_stored;
    line.pct_complete = line.scheduled_value ? (line.total_completed / line.scheduled_value * 100) : 0;
    line.balance = line.scheduled_value - line.total_completed;
    if (!line.retainage_exempt && line.scheduled_value > 0) {
        line.retainage = (appData.contract.retainage_work_pct / 100) * (line.from_previous + line.this_period)
            + (appData.contract.retainage_stored_pct / 100) * line.materials_stored;
        line.retainage = Math.round(line.retainage * 100) / 100;
    } else {
        line.retainage = 0;
    }

    // Update cells
    document.getElementById('g703G_' + sovId).textContent = fmt(line.total_completed);
    document.getElementById('g703H_' + sovId).textContent = Math.round(line.pct_complete) + '%';
    document.getElementById('g703I_' + sovId).textContent = fmt(line.balance);
    document.getElementById('g703J_' + sovId).textContent = line.retainage ? fmt(line.retainage) : '-';

    // Recalculate totals
    recalcTotals();
    recalcG702();
}

function recalcTotals() {
    const t = { scheduled_value: 0, from_previous: 0, this_period: 0, materials_stored: 0, total_completed: 0, balance: 0, retainage: 0 };
    appData.lines.filter(l => !l.is_header).forEach(l => {
        t.scheduled_value += l.scheduled_value || 0;
        t.from_previous += l.from_previous || 0;
        t.this_period += l.this_period || 0;
        t.materials_stored += l.materials_stored || 0;
        t.total_completed += l.total_completed || 0;
        t.balance += l.balance || 0;
        t.retainage += l.retainage || 0;
    });
    t.retainage = Math.round(t.retainage * 100) / 100;
    appData.totals = t;
    renderG703Totals();
}

function recalcG702() {
    const t = appData.totals;
    const c = appData.contract;
    const g = appData.g702;

    const coAdd = g.co_this_additions || 0;
    const coDed = g.co_this_deductions || 0;
    const netCO = (g.co_prev_additions + coAdd) - (g.co_prev_deductions + coDed);

    const l1 = c.original_contract_sum || 0;
    const l2 = netCO;
    const l3 = l1 + l2;
    const l4 = t.total_completed;
    const l5 = t.retainage;
    const l6 = l4 - l5;
    const l7 = g.previous_certificates;
    const l8 = l6 - l7;
    const l9 = l3 - l6;

    // Split retainage for display
    let retWork = 0, retStored = 0;
    appData.lines.filter(l => !l.is_header && !l.retainage_exempt).forEach(l => {
        retWork += (c.retainage_work_pct / 100) * (l.from_previous + l.this_period);
    });
    appData.lines.filter(l => !l.is_header).forEach(l => {
        retStored += (c.retainage_stored_pct / 100) * (l.materials_stored || 0);
    });

    document.getElementById('g702L1').textContent = fmt(l1);
    document.getElementById('g702L2').textContent = fmt(l2);
    document.getElementById('g702L3').textContent = fmt(l3);
    document.getElementById('g702L4').textContent = fmt(l4);
    document.getElementById('g702L5a').textContent = fmt(retWork);
    document.getElementById('g702L5b').textContent = fmt(retStored);
    document.getElementById('g702L5').textContent = fmt(l5);
    document.getElementById('g702L6').textContent = fmt(l6);
    document.getElementById('g702L7').textContent = fmt(l7);
    document.getElementById('g702L8').textContent = fmt(l8);
    document.getElementById('g702L9').textContent = fmt(l9);
}

async function saveAllEntries() {
    const entries = appData.lines.filter(l => !l.is_header).map(l => ({
        sov_item_id: l.sov_item_id,
        work_this_period: l.this_period || 0,
        materials_stored: l.materials_stored || 0,
    }));
    await fetch('/api/payapps/applications/' + PA_APP_ID, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ entries })
    });
    // Visual feedback
    const btn = event.target;
    const orig = btn.textContent;
    btn.textContent = 'Saved!';
    setTimeout(() => btn.textContent = orig, 1500);
}

async function saveAppMeta() {
    await fetch('/api/payapps/applications/' + PA_APP_ID, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            period_to: document.getElementById('periodTo').value,
        })
    });
    document.getElementById('g702PeriodTo').textContent = document.getElementById('periodTo').value || '-';
}

async function updateAppStatus(status) {
    await fetch('/api/payapps/applications/' + PA_APP_ID, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ status })
    });
}

function cancelApplication() {
    if (appData && appData.contract) {
        window.location.href = '/payapps/contract/' + appData.contract.id;
    } else {
        window.location.href = '/payapps';
    }
}

async function generatePayAppPDF() {
    const btn = event.target;
    const orig = btn.textContent;
    btn.textContent = 'Generating...';
    btn.disabled = true;
    try {
        // Save entries first
        const entries = appData.lines.filter(l => !l.is_header).map(l => ({
            sov_item_id: l.sov_item_id,
            work_this_period: l.this_period || 0,
            materials_stored: l.materials_stored || 0,
        }));
        await fetch('/api/payapps/applications/' + PA_APP_ID, {
            method: 'PUT', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                entries,
                period_to: document.getElementById('periodTo').value,
            })
        });
        // Generate PDF
        const res = await fetch('/api/payapps/applications/' + PA_APP_ID + '/generate-pdf', { method: 'POST' });
        const data = await res.json();
        if (data.ok && data.path) {
            window.open(data.path, '_blank');
            btn.textContent = 'PDF Ready!';
            // Update appData and show View button
            if (data.filename) appData.application.pdf_file = data.filename;
            const viewBtn = document.getElementById('viewPdfBtn');
            if (viewBtn) viewBtn.style.display = '';
        } else {
            alert(data.error || 'Failed to generate PDF');
            btn.textContent = orig;
        }
    } catch (e) {
        alert('Error generating PDF');
        btn.textContent = orig;
    }
    btn.disabled = false;
    setTimeout(() => { btn.textContent = orig; }, 3000);
}

async function loadSignaturePreview() {
    const preview = document.getElementById('sigPreview');
    if (!preview) return;
    try {
        const res = await fetch('/api/settings/signature');
        if (res.ok) {
            preview.style.display = '';
            document.getElementById('sigImage').src = '/api/settings/signature?' + Date.now();
        } else {
            preview.style.display = 'none';
        }
    } catch(e) { preview.style.display = 'none'; }
}

async function uploadSignature(input) {
    if (!input.files.length) return;
    const fd = new FormData();
    fd.append('file', input.files[0]);
    const res = await fetch('/api/settings/signature', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.ok) {
        alert('Signature saved! It will appear on the next generated PDF.');
        loadSignaturePreview();
    } else {
        alert(data.error || 'Upload failed');
    }
    input.value = '';
}

async function deleteSignature() {
    if (!confirm('Remove the stored signature?')) return;
    const res = await fetch('/api/settings/signature', { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
        const preview = document.getElementById('sigPreview');
        if (preview) preview.style.display = 'none';
    }
}

async function openPayAppEmailModal() {
    const jobName = appData.job_name || 'Project';
    const appNum = appData.application.application_number || '';
    const gcEmail = appData.contract.gc_email || '';
    document.getElementById('paEmailTo').value = gcEmail;
    document.getElementById('paEmailSubject').value = `Pay Application #${appNum} - ${jobName}`;
    document.getElementById('paEmailBody').value = `Please find attached Pay Application #${appNum} for ${jobName}.\n\nPlease review and let us know if you have any questions.\n\nThank you,\nLGHVAC Mechanical, LLC`;
    document.getElementById('payappEmailModal').style.display = 'flex';
}

async function sendPayAppEmail(e) {
    e.preventDefault();
    const btn = document.getElementById('paEmailSendBtn');
    btn.textContent = 'Sending...';
    btn.disabled = true;
    try {
        const recipients = document.getElementById('paEmailTo').value.split(',').map(e => e.trim()).filter(Boolean);
        const res = await fetch('/api/payapps/applications/' + PA_APP_ID + '/email', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                recipients,
                subject: document.getElementById('paEmailSubject').value,
                body: document.getElementById('paEmailBody').value,
            })
        });
        const data = await res.json();
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            alert('Pay App sent to: ' + data.sent_to.join(', '));
            document.getElementById('payappEmailModal').style.display = 'none';
        }
    } catch (err) {
        alert('Failed to send: ' + err.message);
    } finally {
        btn.textContent = 'Send Email';
        btn.disabled = false;
    }
}

async function uploadSignedCopy(input) {
    if (!input.files.length) return;
    const fd = new FormData();
    fd.append('file', input.files[0]);
    const res = await fetch('/api/payapps/applications/' + PA_APP_ID + '/signed', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.ok) {
        alert('Signed copy uploaded.');
        appData.application.signed_file = data.filename;
        const signedBtn = document.getElementById('viewSignedBtn');
        if (signedBtn) signedBtn.style.display = '';
    } else {
        alert(data.error || 'Upload failed');
    }
    input.value = '';
}

function viewSignedCopy() {
    if (appData && appData.application.signed_file) {
        window.open('/api/payapps/applications/' + PA_APP_ID + '/signed/' + appData.application.signed_file, '_blank');
    } else {
        alert('No signed copy uploaded yet.');
    }
}

// ─── ANALYTICS PAGE ──────────────────────────────────────────

let analyticsBarChart = null;
let analyticsDoughnutChart = null;

async function initAnalytics() {
    await loadAnalytics();
}

async function loadAnalytics() {
    const res = await fetch('/api/payapps/analytics');
    const data = await res.json();
    const { projects, kpis, status_counts } = data;

    // KPI Cards
    document.getElementById('kpiContractValue').textContent = fmt(kpis.total_contract_value);
    document.getElementById('kpiBilled').textContent = fmt(kpis.total_billed);
    document.getElementById('kpiRetainage').textContent = fmt(kpis.total_retainage);
    document.getElementById('kpiBalance').textContent = fmt(kpis.total_balance);

    // Table
    const tbody = document.getElementById('analyticsBody');
    if (!projects.length) {
        tbody.innerHTML = '<tr><td colspan="12" class="empty-state">No pay app contracts found.</td></tr>';
        return;
    }

    const statusColors = { Draft: '#6B7280', Submitted: '#3B82F6', Approved: '#F59E0B', Paid: '#22C55E' };

    tbody.innerHTML = projects.map(p => {
        const color = statusColors[p.latest_status] || '#6B7280';
        const pctWidth = Math.min(100, Math.max(0, p.pct_complete));
        const pctColor = pctWidth >= 90 ? '#22C55E' : pctWidth >= 50 ? '#3B82F6' : '#F59E0B';
        return `<tr style="cursor:pointer;" onclick="window.location='/payapps/contract/${p.contract_id}'">
            <td><strong>${p.job_name || p.project_name || '-'}</strong></td>
            <td>${p.gc_name || '-'}</td>
            <td>${fmt(p.original_contract_sum)}</td>
            <td>${p.net_co ? (p.net_co > 0 ? '+' : '') + fmt(p.net_co) : '-'}</td>
            <td>${fmt(p.contract_sum_to_date)}</td>
            <td>${fmt(p.total_completed)}</td>
            <td>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="flex:1;background:#E5E7EB;border-radius:9999px;height:8px;min-width:60px;">
                        <div style="width:${pctWidth}%;background:${pctColor};height:8px;border-radius:9999px;"></div>
                    </div>
                    <span style="font-size:12px;font-weight:600;white-space:nowrap;">${p.pct_complete}%</span>
                </div>
            </td>
            <td>${fmt(p.total_retainage)}</td>
            <td>${fmt(p.total_billed)}</td>
            <td>${fmt(p.balance_to_finish)}</td>
            <td>${p.latest_app_number ? '#' + p.latest_app_number : '-'}</td>
            <td>${p.latest_status
                ? '<span style="display:inline-block;padding:2px 10px;border-radius:9999px;background:' + color + '20;color:' + color + ';font-weight:600;font-size:12px;">' + p.latest_status + '</span>'
                : '-'}</td>
        </tr>`;
    }).join('');

    // Charts
    renderBarChart(projects);
    renderDoughnutChart(status_counts);
}

function renderBarChart(projects) {
    const ctx = document.getElementById('barChart');
    if (!ctx) return;
    if (analyticsBarChart) analyticsBarChart.destroy();

    const labels = projects.map(p => (p.job_name || p.project_name || 'Project').substring(0, 20));

    analyticsBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Contract Sum', data: projects.map(p => p.contract_sum_to_date), backgroundColor: 'rgba(99, 102, 241, 0.7)' },
                { label: 'Total Billed', data: projects.map(p => p.total_billed), backgroundColor: 'rgba(59, 130, 246, 0.7)' },
                { label: 'Balance', data: projects.map(p => p.balance_to_finish), backgroundColor: 'rgba(239, 68, 68, 0.5)' },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: { label: ctx => ctx.dataset.label + ': ' + fmt(ctx.parsed.y) }
                }
            },
            scales: {
                y: {
                    ticks: { callback: v => '$' + (v >= 1000000 ? (v/1000000).toFixed(1) + 'M' : v >= 1000 ? (v/1000).toFixed(0) + 'K' : v) }
                }
            }
        }
    });
}

function renderDoughnutChart(statusCounts) {
    const ctx = document.getElementById('doughnutChart');
    if (!ctx) return;
    if (analyticsDoughnutChart) analyticsDoughnutChart.destroy();

    const labels = ['Draft', 'Submitted', 'Approved', 'Paid'];
    const colors = ['#6B7280', '#3B82F6', '#F59E0B', '#22C55E'];
    const values = labels.map(l => statusCounts[l] || 0);

    if (values.every(v => v === 0)) {
        ctx.parentElement.innerHTML += '<div class="empty-state" style="padding:20px;text-align:center;">No applications yet</div>';
        return;
    }

    analyticsDoughnutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}
