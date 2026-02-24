/* ─── Bids Module ────────────────────────────────────────── */

let bidData = null;
let partnersData = [];
let personnelData = [];

/* ─── Init ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
    await loadJobsDropdown();
    await loadUsersDropdown();
    if (window.BID_ID) {
        await loadBid(window.BID_ID);
    } else {
        recalculate();
    }
});

async function loadJobsDropdown() {
    const res = await fetch('/api/jobs/list');
    const jobs = await res.json();
    const sel = document.getElementById('bidJob');
    jobs.forEach(j => {
        const opt = document.createElement('option');
        opt.value = j.id;
        opt.textContent = j.name;
        sel.appendChild(opt);
    });
}

async function loadUsersDropdown() {
    const res = await fetch('/api/users/list');
    const users = await res.json();
    const sel = document.getElementById('userSelect');
    users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.display_name} (${u.role})`;
        opt.dataset.name = u.display_name;
        opt.dataset.role = u.role;
        sel.appendChild(opt);
    });
}

/* ─── Load Existing Bid ─────────────────────────────────── */
async function loadBid(id) {
    const res = await fetch(`/api/bids/${id}`);
    if (!res.ok) return;
    bidData = await res.json();

    document.getElementById('bidName').value = bidData.bid_name || '';
    document.getElementById('bidJob').value = bidData.job_id || '';
    document.getElementById('bidProjectType').value = bidData.project_type || 'Multi-Family';
    document.getElementById('bidStatus').value = bidData.status || 'Draft';
    document.getElementById('bidMaterialCost').value = bidData.material_cost || 0;
    document.getElementById('bidManHours').value = bidData.total_man_hours || 25;
    document.getElementById('bidCrewSize').value = bidData.crew_size || 1;
    document.getElementById('bidHoursPerDay').value = bidData.hours_per_day || 8;
    document.getElementById('bidLaborRate').value = bidData.labor_rate_per_hour || 0;
    document.getElementById('bidMgmtFee').value = bidData.management_fee || 0;
    document.getElementById('bidPerDiemRate').value = bidData.per_diem_rate || 0;
    document.getElementById('bidPerDiemDays').value = bidData.per_diem_days || 0;
    document.getElementById('bidProfitPct').value = bidData.company_profit_pct || 0;
    document.getElementById('bidNotes').value = bidData.notes || '';

    document.getElementById('pageTitle').textContent = bidData.bid_name || 'Edit Bid';

    // Load partners
    partnersData = bidData.partners || [];
    renderPartners();

    // Load personnel
    personnelData = bidData.personnel || [];
    renderPersonnel();

    recalculate();
}

/* ─── Recalculate ────────────────────────────────────────── */
function recalculate() {
    const manHours = parseFloat(document.getElementById('bidManHours').value) || 0;
    const crewSize = parseInt(document.getElementById('bidCrewSize').value) || 1;
    const hoursPerDay = parseFloat(document.getElementById('bidHoursPerDay').value) || 8;
    const laborRate = parseFloat(document.getElementById('bidLaborRate').value) || 0;
    const materialCost = parseFloat(document.getElementById('bidMaterialCost').value) || 0;
    const mgmtFee = parseFloat(document.getElementById('bidMgmtFee').value) || 0;
    const perDiemRate = parseFloat(document.getElementById('bidPerDiemRate').value) || 0;
    const perDiemDays = parseFloat(document.getElementById('bidPerDiemDays').value) || 0;
    const profitPct = parseFloat(document.getElementById('bidProfitPct').value) || 0;

    const duration = crewSize > 0 && hoursPerDay > 0 ? (manHours / (crewSize * hoursPerDay)) : 0;
    const laborCost = manHours * laborRate;
    const perDiemTotal = perDiemRate * perDiemDays;
    const subtotal = materialCost + laborCost + mgmtFee + perDiemTotal;
    const companyProfit = subtotal * (profitPct / 100);
    const totalBid = subtotal + companyProfit;

    document.getElementById('bidDuration').value = duration.toFixed(2);
    document.getElementById('bidLaborCost').value = fmt(laborCost);
    document.getElementById('bidPerDiemTotal').value = fmt(perDiemTotal);
    document.getElementById('bidProfitAmt').value = fmt(companyProfit);

    // Summary card
    document.getElementById('sumMaterial').textContent = fmt(materialCost);
    document.getElementById('sumLabor').textContent = fmt(laborCost);
    document.getElementById('sumMgmt').textContent = fmt(mgmtFee);
    document.getElementById('sumPerDiem').textContent = fmt(perDiemTotal);
    document.getElementById('sumSubtotal').textContent = fmt(subtotal);
    document.getElementById('sumProfit').textContent = fmt(companyProfit);
    document.getElementById('sumTotal').textContent = fmt(totalBid);

    // Recalculate partner profit amounts
    recalcPartners(companyProfit);
}

function fmt(val) {
    return '$' + (val || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* ─── Partners ──────────────────────────────────────────── */
function renderPartners() {
    const tbody = document.getElementById('partnersBody');
    tbody.innerHTML = '';
    partnersData.forEach((p, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="cell-editable"><input type="text" value="${escapeAttr(p.partner_name)}" onchange="partnersData[${i}].partner_name=this.value"></td>
            <td class="cell-editable"><input type="number" value="${p.profit_pct || 0}" min="0" step="0.1" onchange="partnersData[${i}].profit_pct=parseFloat(this.value)||0;recalculate()"></td>
            <td class="cell-computed partner-amount">${fmt(p.profit_amount || 0)}</td>
            <td style="text-align:center;"><button class="btn-delete-row" onclick="removePartner(${i})">&times;</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function addPartnerRow() {
    partnersData.push({ id: null, partner_name: '', profit_pct: 0, profit_amount: 0 });
    renderPartners();
}

function removePartner(idx) {
    partnersData.splice(idx, 1);
    renderPartners();
    recalculate();
}

function recalcPartners(companyProfit) {
    const amountCells = document.querySelectorAll('.partner-amount');
    partnersData.forEach((p, i) => {
        p.profit_amount = (companyProfit * (p.profit_pct / 100));
        if (amountCells[i]) amountCells[i].textContent = fmt(p.profit_amount);
    });
}

/* ─── Personnel ──────────────────────────────────────────── */
function renderPersonnel() {
    const tbody = document.getElementById('personnelBody');
    tbody.innerHTML = '';
    personnelData.forEach((p, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="cell-editable"><input type="text" value="${escapeAttr(p.name)}" onchange="personnelData[${i}].name=this.value"></td>
            <td class="cell-editable"><input type="text" value="${escapeAttr(p.role || '')}" onchange="personnelData[${i}].role=this.value"></td>
            <td class="cell-editable"><input type="number" value="${p.hourly_rate || 0}" min="0" step="0.01" onchange="personnelData[${i}].hourly_rate=parseFloat(this.value)||0"></td>
            <td style="text-align:center;"><button class="btn-delete-row" onclick="removePersonnel(${i})">&times;</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function addPersonnelFromUser() {
    const sel = document.getElementById('userSelect');
    if (!sel.value) return;
    const opt = sel.options[sel.selectedIndex];
    personnelData.push({
        id: null, user_id: parseInt(sel.value),
        name: opt.dataset.name, role: opt.dataset.role, hourly_rate: 0
    });
    renderPersonnel();
    sel.value = '';
}

function addPersonnelManual() {
    personnelData.push({ id: null, user_id: null, name: '', role: '', hourly_rate: 0 });
    renderPersonnel();
}

function removePersonnel(idx) {
    personnelData.splice(idx, 1);
    renderPersonnel();
}

/* ─── Save ──────────────────────────────────────────────── */
async function saveBid() {
    const bidPayload = {
        bid_name: document.getElementById('bidName').value,
        job_id: document.getElementById('bidJob').value || null,
        project_type: document.getElementById('bidProjectType').value,
        status: document.getElementById('bidStatus').value,
        material_cost: parseFloat(document.getElementById('bidMaterialCost').value) || 0,
        total_man_hours: parseFloat(document.getElementById('bidManHours').value) || 25,
        crew_size: parseInt(document.getElementById('bidCrewSize').value) || 1,
        hours_per_day: parseFloat(document.getElementById('bidHoursPerDay').value) || 8,
        labor_rate_per_hour: parseFloat(document.getElementById('bidLaborRate').value) || 0,
        management_fee: parseFloat(document.getElementById('bidMgmtFee').value) || 0,
        per_diem_rate: parseFloat(document.getElementById('bidPerDiemRate').value) || 0,
        per_diem_days: parseFloat(document.getElementById('bidPerDiemDays').value) || 0,
        company_profit_pct: parseFloat(document.getElementById('bidProfitPct').value) || 0,
        notes: document.getElementById('bidNotes').value,
    };

    let bidId = window.BID_ID;

    try {
        if (bidId) {
            // Update existing bid
            await fetch(`/api/bids/${bidId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bidPayload)
            });
        } else {
            // Create new bid
            const res = await fetch('/api/bids', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bidPayload)
            });
            const data = await res.json();
            bidId = data.id;
            window.BID_ID = bidId;
            history.replaceState(null, '', `/bids/${bidId}`);
        }

        // Save partners: delete all existing, re-create
        if (bidData && bidData.partners) {
            for (const p of bidData.partners) {
                await fetch(`/api/bids/${bidId}/partners/${p.id}`, { method: 'DELETE' });
            }
        }
        for (const p of partnersData) {
            await fetch(`/api/bids/${bidId}/partners`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(p)
            });
        }

        // Save personnel: delete all existing, re-create
        if (bidData && bidData.personnel) {
            for (const p of bidData.personnel) {
                await fetch(`/api/bids/${bidId}/personnel/${p.id}`, { method: 'DELETE' });
            }
        }
        for (const p of personnelData) {
            await fetch(`/api/bids/${bidId}/personnel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(p)
            });
        }

        // Reload bid data
        await loadBid(bidId);
        alert('Bid saved successfully!');
    } catch (err) {
        alert('Error saving bid: ' + err.message);
    }
}

/* ─── Helpers ────────────────────────────────────────────── */
function escapeAttr(text) {
    return (text || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
