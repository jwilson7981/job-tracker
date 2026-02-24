/* Bids JS — LGHVAC Bid Form */
let bidPartners = [];
let bidPersonnel = [];

if (window.BID_ID !== undefined) {
    loadJobs();
    loadUsers();
    if (window.BID_ID > 0) loadBid();
}

const $ = id => document.getElementById(id);
const val = id => parseFloat($(id)?.value || 0) || 0;
const ival = id => parseInt($(id)?.value || 0) || 0;
const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toggleClubhouse() {
    const show = $('bidHasClub').value === '1';
    document.querySelectorAll('.clubhouse-field').forEach(el => el.style.display = show ? '' : 'none');
}

function autoPerDiem() {
    const miles = val('bidMileage');
    let rate = 0;
    if (miles >= 250) rate = 75;
    else if (miles >= 101) rate = 60;
    $('bidPerDiemRate').value = rate;
}

function recalculate() {
    // System counts
    const numApt = ival('bidNumApt');
    const numNonApt = ival('bidNumNonApt');
    const numMini = ival('bidNumMini');
    const hasClub = $('bidHasClub').value === '1';
    const clubSystems = hasClub ? ival('bidClubSystems') : 0;
    // Mini splits = 0.75 of a standard system
    const totalSystems = numApt + numNonApt + (numMini * 0.75) + clubSystems;
    $('bidTotalSystems').value = totalSystems % 1 === 0 ? totalSystems : totalSystems.toFixed(2);

    // Man hours per system (from breakdown)
    const roughIn = val('bidRoughIn');
    const ahu = val('bidAHU');
    const condenser = val('bidCondenser');
    const trim = val('bidTrimOut');
    const startup = val('bidStartup');
    const mhPerSystem = roughIn + ahu + condenser + trim + startup;
    $('bidMHPerSystem').value = mhPerSystem;

    // Total man hours
    const totalMH = totalSystems * mhPerSystem;
    $('bidTotalMH').value = Math.round(totalMH * 100) / 100;

    // Duration
    const crewSize = ival('bidCrewSize') || 1;
    const hoursPerDay = val('bidHoursPerDay') || 8;
    const durationDays = crewSize > 0 && hoursPerDay > 0 ? totalMH / (crewSize * hoursPerDay) : 0;
    $('bidDuration').value = Math.round(durationDays * 100) / 100;
    $('bidWeeks').value = Math.round((durationDays / 5) * 100) / 100;

    // Labor cost
    const laborRate = val('bidLaborRate');
    const laborPerUnit = val('bidLaborPerUnit');
    let laborCost;
    if (laborPerUnit > 0) {
        laborCost = totalSystems * laborPerUnit;
    } else {
        laborCost = totalMH * laborRate;
    }
    $('bidLaborCost').value = fmt(laborCost);

    // Per diem: rate x duration days x crew size
    const perDiemRate = val('bidPerDiemRate');
    const perDiemTotal = perDiemRate * durationDays * crewSize;
    $('bidPerDiemTotal').value = fmt(perDiemTotal);

    // Material per-unit
    const materialCost = val('bidMaterialCost');
    $('bidMatPerSystem').value = totalSystems > 0 ? fmt(materialCost / totalSystems) : '$0.00';
    $('bidMatPerApt').value = numApt > 0 ? fmt(materialCost / numApt) : '$0.00';

    // Overhead
    const insurance = val('bidInsurance');
    const permits = val('bidPermits');
    const mgmtFee = val('bidMgmtFee');

    // Totals
    const totalCostToBuild = materialCost + laborCost + insurance + permits + mgmtFee + perDiemTotal;
    const profitPct = val('bidProfitPct');
    const companyProfit = totalCostToBuild * (profitPct / 100);
    const totalBid = totalCostToBuild + companyProfit;
    const netProfit = companyProfit;

    $('bidProfitAmt').value = fmt(companyProfit);

    // Per-unit calcs
    const costPerApt = numApt > 0 ? totalCostToBuild / numApt : 0;
    const costPerSys = totalSystems > 0 ? totalCostToBuild / totalSystems : 0;
    const laborPerApt = numApt > 0 ? laborCost / numApt : 0;
    const laborPerSys = totalSystems > 0 ? laborCost / totalSystems : 0;

    // Suggested bids
    let sugAptBid = totalBid, sugClubBid = 0;
    if (hasClub && clubSystems > 0 && totalSystems > 0) {
        const aptShare = (totalSystems - clubSystems) / totalSystems;
        sugAptBid = totalBid * aptShare;
        sugClubBid = totalBid * (1 - aptShare);
    }

    // Update summary
    $('sumMaterial').textContent = fmt(materialCost);
    $('sumLabor').textContent = fmt(laborCost);
    $('sumInsurance').textContent = fmt(insurance);
    $('sumPermits').textContent = fmt(permits);
    $('sumMgmt').textContent = fmt(mgmtFee);
    $('sumPerDiem').textContent = fmt(perDiemTotal);
    $('sumCostToBuild').textContent = fmt(totalCostToBuild);
    $('sumProfit').textContent = fmt(companyProfit);
    $('sumTotal').textContent = fmt(totalBid);
    $('sumNetProfit').textContent = fmt(netProfit);
    $('sumAptBid').textContent = fmt(sugAptBid);
    $('sumClubBid').textContent = fmt(sugClubBid);
    $('sumCostPerApt').textContent = fmt(costPerApt);
    $('sumCostPerSys').textContent = fmt(costPerSys);
    $('sumLaborPerApt').textContent = fmt(laborPerApt);
    $('sumLaborPerSys').textContent = fmt(laborPerSys);

    // Recalc partner profit amounts
    recalcPartners(companyProfit);
}

function recalcPartners(companyProfit) {
    document.querySelectorAll('#partnersBody tr').forEach(tr => {
        const pctInput = tr.querySelector('.partner-pct');
        const amtCell = tr.querySelector('.partner-amt');
        if (pctInput && amtCell) {
            const pct = parseFloat(pctInput.value) || 0;
            amtCell.textContent = fmt(companyProfit * (pct / 100));
        }
    });
}

// ─── Data Loading ──────────────────────────────────────────
async function loadJobs() {
    const res = await fetch('/api/jobs/list');
    const jobs = await res.json();
    const sel = $('bidJob');
    jobs.forEach(j => {
        const opt = document.createElement('option');
        opt.value = j.id;
        opt.textContent = j.name;
        sel.appendChild(opt);
    });
}

async function loadUsers() {
    const res = await fetch('/api/users');
    const users = await res.json();
    const sel = $('userSelect');
    users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.display_name;
        opt.dataset.name = u.display_name;
        sel.appendChild(opt);
    });
}

async function loadBid() {
    const res = await fetch(`/api/bids/${window.BID_ID}`);
    const bid = await res.json();
    if (bid.error) return;

    $('pageTitle').textContent = bid.bid_name || 'Edit Bid';
    $('bidName').value = bid.bid_name || '';
    $('bidJob').value = bid.job_id || '';
    $('bidProjectType').value = bid.project_type || 'Multi-Family';
    $('bidStatus').value = bid.status || 'Draft';
    $('bidLead').value = bid.lead_name || '';

    $('bidGC').value = bid.contracting_gc || '';
    $('bidAttention').value = bid.gc_attention || '';
    $('bidNumber').value = bid.bid_number || '';
    $('bidDate').value = bid.bid_date || '';
    $('bidWorkupDate').value = bid.bid_workup_date || '';
    $('bidDueDate').value = bid.bid_due_date || '';
    $('bidSubmittedDate').value = bid.bid_submitted_date || '';

    $('bidNumApt').value = bid.num_apartments || 0;
    $('bidNumNonApt').value = bid.num_non_apartment_systems || 0;
    $('bidNumMini').value = bid.num_mini_splits || 0;
    $('bidHasClub').value = bid.has_clubhouse ? '1' : '0';
    $('bidClubSystems').value = bid.clubhouse_systems || 0;
    $('bidClubTons').value = bid.clubhouse_tons || 0;
    $('bidTotalTons').value = bid.total_tons || 0;
    $('bidPricePerTon').value = bid.price_per_ton || 0;
    toggleClubhouse();

    $('bidMaterialCost').value = bid.material_cost || 0;

    $('bidRoughIn').value = bid.rough_in_hours ?? 15;
    $('bidAHU').value = bid.ahu_install_hours ?? 1;
    $('bidCondenser').value = bid.condenser_install_hours ?? 1;
    $('bidTrimOut').value = bid.trim_out_hours ?? 1;
    $('bidStartup').value = bid.startup_hours ?? 2;
    $('bidCrewSize').value = bid.crew_size || 4;
    $('bidHoursPerDay').value = bid.hours_per_day || 8;
    $('bidLaborRate').value = bid.labor_rate_per_hour || 37;
    $('bidLaborPerUnit').value = bid.labor_cost_per_unit || 0;

    $('bidMileage').value = bid.job_mileage || 0;
    $('bidPerDiemRate').value = bid.per_diem_rate || 0;

    $('bidInsurance').value = bid.insurance_cost || 0;
    $('bidPermits').value = bid.permit_cost || 0;
    $('bidMgmtFee').value = bid.management_fee || 0;
    $('bidPaySchedule').value = Math.round((bid.pay_schedule_pct || 0.33) * 100);

    $('bidProfitPct').value = bid.company_profit_pct || 0;

    $('bidInclusions').value = bid.inclusions || '';
    $('bidExclusions').value = bid.exclusions || '';
    $('bidDescription').value = bid.bid_description || '';
    $('bidNotes').value = bid.notes || '';

    bidPartners = bid.partners || [];
    renderPartners();

    bidPersonnel = bid.personnel || [];
    renderPersonnel();

    recalculate();
}

// ─── Partners ──────────────────────────────────────────────
function renderPartners() {
    const tbody = $('partnersBody');
    tbody.innerHTML = bidPartners.map((p, i) => `
        <tr data-id="${p.id || ''}">
            <td><input type="text" class="form-input partner-name" value="${p.partner_name || ''}" style="min-width:120px;"></td>
            <td><input type="number" class="form-input partner-pct" value="${p.profit_pct || 0}" min="0" step="0.1" style="width:80px;" oninput="recalculate()"></td>
            <td class="partner-amt">${fmt(p.profit_amount || 0)}</td>
            <td><button class="btn btn-secondary btn-small" onclick="removePartner(${i})">&times;</button></td>
        </tr>
    `).join('');
}

function addPartnerRow() {
    bidPartners.push({ partner_name: '', profit_pct: 0, profit_amount: 0 });
    renderPartners();
}

function removePartner(idx) {
    const p = bidPartners[idx];
    if (p.id && window.BID_ID > 0) {
        fetch(`/api/bids/${window.BID_ID}/partners/${p.id}`, { method: 'DELETE' });
    }
    bidPartners.splice(idx, 1);
    renderPartners();
    recalculate();
}

// ─── Personnel ─────────────────────────────────────────────
function renderPersonnel() {
    const tbody = $('personnelBody');
    tbody.innerHTML = bidPersonnel.map((p, i) => `
        <tr data-id="${p.id || ''}">
            <td><input type="text" class="form-input person-name" value="${p.name || ''}" style="min-width:120px;"></td>
            <td><select class="form-select person-role">
                <option value="">--</option>
                <option value="Foreman" ${p.role==='Foreman'?'selected':''}>Foreman</option>
                <option value="Journeyman" ${p.role==='Journeyman'?'selected':''}>Journeyman</option>
                <option value="Apprentice" ${p.role==='Apprentice'?'selected':''}>Apprentice</option>
                <option value="Laborer" ${p.role==='Laborer'?'selected':''}>Laborer</option>
                <option value="Labor MGR" ${p.role==='Labor MGR'?'selected':''}>Labor MGR</option>
                <option value="Manager" ${p.role==='Manager'?'selected':''}>Manager</option>
                <option value="PM" ${p.role==='PM'?'selected':''}>PM</option>
            </select></td>
            <td><input type="number" class="form-input person-rate" value="${p.hourly_rate || 0}" min="0" step="0.01" style="width:80px;"></td>
            <td><input type="number" class="form-input person-hours" value="${p.total_hours || 0}" min="0" step="0.5" style="width:80px;"></td>
            <td><button class="btn btn-secondary btn-small" onclick="removePersonnel(${i})">&times;</button></td>
        </tr>
    `).join('');
}

function addPersonnelFromUser() {
    const sel = $('userSelect');
    if (!sel.value) return;
    const opt = sel.options[sel.selectedIndex];
    bidPersonnel.push({ user_id: parseInt(sel.value), name: opt.dataset.name, role: '', hourly_rate: 0, total_hours: 0 });
    renderPersonnel();
    sel.value = '';
}

function addPersonnelManual() {
    bidPersonnel.push({ name: '', role: '', hourly_rate: 0, total_hours: 0 });
    renderPersonnel();
}

function removePersonnel(idx) {
    const p = bidPersonnel[idx];
    if (p.id && window.BID_ID > 0) {
        fetch(`/api/bids/${window.BID_ID}/personnel/${p.id}`, { method: 'DELETE' });
    }
    bidPersonnel.splice(idx, 1);
    renderPersonnel();
}

// ─── Save ──────────────────────────────────────────────────
function collectPartnersFromDOM() {
    const rows = document.querySelectorAll('#partnersBody tr');
    return Array.from(rows).map((tr, i) => ({
        id: bidPartners[i]?.id || null,
        partner_name: tr.querySelector('.partner-name').value,
        profit_pct: parseFloat(tr.querySelector('.partner-pct').value) || 0,
    }));
}

function collectPersonnelFromDOM() {
    const rows = document.querySelectorAll('#personnelBody tr');
    return Array.from(rows).map((tr, i) => ({
        id: bidPersonnel[i]?.id || null,
        user_id: bidPersonnel[i]?.user_id || null,
        name: tr.querySelector('.person-name').value,
        role: tr.querySelector('.person-role').value,
        hourly_rate: parseFloat(tr.querySelector('.person-rate').value) || 0,
        total_hours: parseFloat(tr.querySelector('.person-hours').value) || 0,
    }));
}

async function saveBid() {
    const partners = collectPartnersFromDOM();
    const personnel = collectPersonnelFromDOM();

    const data = {
        bid_name: $('bidName').value,
        job_id: $('bidJob').value || null,
        project_type: $('bidProjectType').value,
        status: $('bidStatus').value,
        lead_name: $('bidLead').value,

        contracting_gc: $('bidGC').value,
        gc_attention: $('bidAttention').value,
        bid_number: $('bidNumber').value,
        bid_date: $('bidDate').value,
        bid_workup_date: $('bidWorkupDate').value,
        bid_due_date: $('bidDueDate').value,
        bid_submitted_date: $('bidSubmittedDate').value,

        num_apartments: ival('bidNumApt'),
        num_non_apartment_systems: ival('bidNumNonApt'),
        num_mini_splits: ival('bidNumMini'),
        has_clubhouse: $('bidHasClub').value === '1' ? 1 : 0,
        clubhouse_systems: ival('bidClubSystems'),
        clubhouse_tons: val('bidClubTons'),
        total_tons: val('bidTotalTons'),
        price_per_ton: val('bidPricePerTon'),

        material_cost: val('bidMaterialCost'),

        rough_in_hours: val('bidRoughIn'),
        ahu_install_hours: val('bidAHU'),
        condenser_install_hours: val('bidCondenser'),
        trim_out_hours: val('bidTrimOut'),
        startup_hours: val('bidStartup'),
        crew_size: ival('bidCrewSize'),
        hours_per_day: val('bidHoursPerDay'),
        labor_rate_per_hour: val('bidLaborRate'),
        labor_cost_per_unit: val('bidLaborPerUnit'),

        job_mileage: val('bidMileage'),
        per_diem_rate: val('bidPerDiemRate'),

        insurance_cost: val('bidInsurance'),
        permit_cost: val('bidPermits'),
        management_fee: val('bidMgmtFee'),
        pay_schedule_pct: val('bidPaySchedule') / 100,

        company_profit_pct: val('bidProfitPct'),

        inclusions: $('bidInclusions').value,
        exclusions: $('bidExclusions').value,
        bid_description: $('bidDescription').value,
        notes: $('bidNotes').value,
    };

    let bidId = window.BID_ID;
    if (bidId > 0) {
        await fetch(`/api/bids/${bidId}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(data)
        });
    } else {
        const res = await fetch('/api/bids', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        bidId = result.id;
        window.BID_ID = bidId;
        history.replaceState(null, '', `/bids/${bidId}`);
    }

    // Sync partners
    for (const p of partners) {
        if (p.id) {
            await fetch(`/api/bids/${bidId}/partners/${p.id}`, { method: 'DELETE' });
        }
        if (p.partner_name.trim()) {
            await fetch(`/api/bids/${bidId}/partners`, {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify(p)
            });
        }
    }

    // Sync personnel
    for (const p of personnel) {
        if (p.id) {
            await fetch(`/api/bids/${bidId}/personnel/${p.id}`, { method: 'DELETE' });
        }
        if (p.name.trim()) {
            await fetch(`/api/bids/${bidId}/personnel`, {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify(p)
            });
        }
    }

    // Reload to get fresh IDs
    window.BID_ID = bidId;
    loadBid();
    $('pageTitle').textContent = $('bidName').value || 'Edit Bid';
}

// ─── Proposal PDF ──────────────────────────────────────────
async function generateProposal() {
    if (!window.BID_ID || window.BID_ID <= 0) return alert('Save the bid first.');
    const btn = $('btnGenerate');
    btn.textContent = 'Generating...';
    btn.disabled = true;
    try {
        const res = await fetch(`/api/bids/${window.BID_ID}/generate-proposal`, { method: 'POST' });
        const result = await res.json();
        if (result.error) { alert(result.error); return; }
        // Show download + email buttons
        const dlBtn = $('btnDownload');
        dlBtn.href = result.path;
        dlBtn.style.display = '';
        dlBtn.textContent = 'Download PDF';
        $('btnEmail').style.display = '';
        btn.textContent = 'Regenerate Proposal';
    } catch (e) {
        alert('Error generating proposal: ' + e.message);
    } finally {
        btn.disabled = false;
    }
}

// ─── Email Modal ───────────────────────────────────────────
async function openEmailModal() {
    $('emailModal').style.display = 'flex';
    // Set default subject
    const bidName = $('bidName').value || 'HVAC Proposal';
    $('emailSubject').value = `HVAC Installation Proposal - ${bidName}`;
    $('emailBody').value = `Please find attached our HVAC installation proposal for ${bidName}.\n\nPlease review and let us know if you have any questions.\n\nThank you,\nLGHVAC Mechanical, LLC\n918-351-3092`;
    // Load saved SMTP settings
    try {
        const res = await fetch('/api/email-settings');
        const settings = await res.json();
        if (settings.smtp_host) $('smtpHost').value = settings.smtp_host;
        if (settings.smtp_port) $('smtpPort').value = settings.smtp_port;
        if (settings.smtp_user) $('smtpUser').value = settings.smtp_user;
        if (settings.from_email) $('smtpFrom').value = settings.from_email;
        // Pre-fill team emails into To field
        if (settings.team_emails) {
            $('emailTo').value = settings.team_emails;
        }
    } catch(e) {}
}

function closeEmailModal() {
    $('emailModal').style.display = 'none';
}

async function saveSmtpSettings() {
    const data = {
        smtp_host: $('smtpHost').value,
        smtp_port: parseInt($('smtpPort').value) || 587,
        smtp_user: $('smtpUser').value,
        smtp_pass: $('smtpPass').value,
        from_email: $('smtpFrom').value,
        team_emails: $('emailTo').value,
    };
    await fetch('/api/email-settings', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(data)
    });
    alert('SMTP settings saved.');
}

async function sendEmail() {
    const btn = $('btnSendEmail');
    btn.textContent = 'Sending...';
    btn.disabled = true;
    try {
        const recipients = $('emailTo').value.split(',').map(e => e.trim()).filter(Boolean);
        const data = {
            recipients,
            subject: $('emailSubject').value,
            body: $('emailBody').value,
            smtp_host: $('smtpHost').value,
            smtp_port: parseInt($('smtpPort').value) || 587,
            smtp_user: $('smtpUser').value,
            smtp_pass: $('smtpPass').value,
            from_email: $('smtpFrom').value || $('smtpUser').value,
        };
        const res = await fetch(`/api/bids/${window.BID_ID}/email-proposal`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.error) {
            alert('Error: ' + result.error);
        } else {
            alert('Proposal sent to: ' + result.sent_to.join(', '));
            closeEmailModal();
        }
    } catch (e) {
        alert('Failed to send: ' + e.message);
    } finally {
        btn.textContent = 'Send Email';
        btn.disabled = false;
    }
}
