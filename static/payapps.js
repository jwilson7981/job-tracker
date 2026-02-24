/* Pay Applications (AIA G702/G703) JS */
function fmt(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ─── Page Router ─────────────────────────────────────────────
if (window.PA_PAGE === 'list') initList();
else if (window.PA_PAGE === 'contract') initContract();
else if (window.PA_PAGE === 'application') initApplication();

// ─── LIST PAGE ───────────────────────────────────────────────
let paJobs = [];
async function initList() {
    const res = await fetch('/api/jobs/list');
    paJobs = await res.json();
    const sel = document.getElementById('ncJob');
    paJobs.forEach(j => { const o = document.createElement('option'); o.value = j.id; o.textContent = j.name; sel.appendChild(o); });
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
    document.getElementById('coAdd').value = appData.application.co_additions || 0;
    document.getElementById('coDed').value = appData.application.co_deductions || 0;

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

    const coAdd = parseFloat(document.getElementById('coAdd').value) || 0;
    const coDed = parseFloat(document.getElementById('coDed').value) || 0;
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
            co_additions: parseFloat(document.getElementById('coAdd').value) || 0,
            co_deductions: parseFloat(document.getElementById('coDed').value) || 0,
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
