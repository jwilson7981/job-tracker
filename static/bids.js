/* Bids JS — LGHVAC Bid Form */
let bidPartners = [];
let bidPersonnel = [];
const isOwner = (window.USER_ROLE === 'owner');

var DEFAULT_INCLUSIONS = '1 Year parts and labor warranty\nManufacturer\'s Warranty per submittals\nInsurances, licenses, and required HVAC Permits\nPrice includes sales tax';
var DEFAULT_EXCLUSIONS = 'Cutting or coring any concrete, block, or brick\nConcrete work and Lifting\nFramed openings or structural support\nCondenser pads, Disconnects, and Whips\nWeather-tight of exterior and roof penetrations';

if (window.BID_ID !== undefined) {
    loadJobs();
    if (isOwner) loadUsers();
    if (window.BID_ID > 0) loadBid();
    else {
        loadNextBidNumber();
        document.getElementById('bidInclusions').value = DEFAULT_INCLUSIONS;
        document.getElementById('bidExclusions').value = DEFAULT_EXCLUSIONS;
    }
}

const $ = id => document.getElementById(id);
const val = id => parseFloat($(id)?.value || 0) || 0;
const ival = id => parseInt($(id)?.value || 0) || 0;
const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Customer autocomplete for GC field
let _searchTimeout = null;
function searchCustomers(q) {
    clearTimeout(_searchTimeout);
    const dd = $('gcDropdown');
    if (!dd) return;
    if (q.length < 1) { dd.style.display = 'none'; return; }
    $('bidCustomerId').value = '';
    _searchTimeout = setTimeout(async () => {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(q)}`);
        const results = await res.json();
        if (!results.length) { dd.style.display = 'none'; return; }
        dd.innerHTML = results.map(c =>
            `<div style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--gray-100);"
                  onmousedown="selectCustomer(${c.id}, '${c.company_name.replace(/'/g, "\\'")}')"
                  onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background=''">
                <strong>${c.company_name}</strong> <span style="color:var(--gray-400);margin-left:4px;">${c.company_type}</span>
                ${c.primary_contact ? `<br><small style="color:var(--gray-500);">${c.primary_contact}</small>` : ''}
            </div>`
        ).join('');
        dd.style.display = 'block';
    }, 200);
}
function selectCustomer(id, name) {
    $('bidGC').value = name;
    $('bidCustomerId').value = id;
    $('gcDropdown').style.display = 'none';
}
document.addEventListener('click', e => {
    const dd = $('gcDropdown');
    if (dd && !dd.contains(e.target) && e.target.id !== 'bidGC') dd.style.display = 'none';
});

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

function toggleProfitMode() {
    const mode = $('bidProfitMode') ? $('bidProfitMode').value : 'percentage';
    if ($('profitPctField')) $('profitPctField').style.display = mode === 'percentage' ? '' : 'none';
    if ($('profitPerSystemField')) $('profitPerSystemField').style.display = mode === 'per_system' ? '' : 'none';
    if ($('effectivePctField')) $('effectivePctField').style.display = mode === 'per_system' ? '' : 'none';
}

function recalculate() {
    if (!isOwner) return; // Non-owners don't have cost fields
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

    // Labor cost: override > per-unit > hourly
    const laborRate = val('bidLaborRate');
    const laborPerUnit = val('bidLaborPerUnit');
    const laborOverride = val('bidLaborOverride');
    let laborCost, laborCalc;
    if (laborPerUnit > 0) {
        laborCalc = totalSystems * laborPerUnit;
    } else {
        laborCalc = totalMH * laborRate;
    }
    if (laborOverride > 0) {
        laborCost = laborOverride;
        if ($('laborOverrideInfo')) $('laborOverrideInfo').style.display = '';
    } else {
        laborCost = laborCalc;
        if ($('laborOverrideInfo')) $('laborOverrideInfo').style.display = 'none';
    }
    $('bidLaborCost').value = fmt(laborCost);

    // Per diem: rate x duration days x crew size
    const perDiemRate = val('bidPerDiemRate');
    const perDiemTotal = perDiemRate * durationDays * crewSize;
    $('bidPerDiemTotal').value = fmt(perDiemTotal);

    // Material cost breakdown
    const matSubtotal = val('bidMatSubtotal');
    const matShipping = val('bidMatShipping');
    const matTaxRate = val('bidMatTaxRate');
    const matTaxAmount = Math.round(matSubtotal * matTaxRate / 100 * 100) / 100;
    const materialCost = Math.round((matSubtotal + matShipping + matTaxAmount) * 100) / 100;
    if ($('bidMatTaxAmount')) $('bidMatTaxAmount').value = fmt(matTaxAmount);
    $('bidMaterialCost').value = fmt(materialCost);
    $('bidMatPerSystem').value = totalSystems > 0 ? fmt(materialCost / totalSystems) : '$0.00';
    $('bidMatPerApt').value = numApt > 0 ? fmt(materialCost / numApt) : '$0.00';

    // Overhead
    const insurance = val('bidInsurance');
    const permits = val('bidPermits');
    const mgmtFee = val('bidMgmtFee');

    // Admin costs
    const adminCosts = val('bidAdminCosts');

    // Housing (monthly rate × months derived from bid duration)
    const housingRate = val('bidHousingRate');
    const numWeeks = parseFloat($('bidWeeks').value) || 0;
    const housingMonths = numWeeks > 0 ? Math.round((numWeeks / 4.33) * 100) / 100 : 0;
    const housingTotal = housingRate * housingMonths;
    if ($('bidHousingMonths')) $('bidHousingMonths').value = housingMonths.toFixed(2);
    if ($('bidHousingTotal')) $('bidHousingTotal').value = fmt(housingTotal);

    // Totals
    const totalCostToBuild = materialCost + laborCost + insurance + permits + mgmtFee + perDiemTotal + adminCosts + housingTotal;
    const profitMode = $('bidProfitMode') ? $('bidProfitMode').value : 'percentage';
    let companyProfit;
    if (profitMode === 'per_system') {
        const profitPerSystem = val('bidProfitPerSystem');
        companyProfit = totalSystems * profitPerSystem;
        // Show effective percentage
        if ($('bidEffectivePct')) {
            $('bidEffectivePct').textContent = totalCostToBuild > 0
                ? (companyProfit / totalCostToBuild * 100).toFixed(1) + '%' : '0%';
        }
    } else {
        const profitPct = val('bidProfitPct');
        companyProfit = totalCostToBuild * (profitPct / 100);
    }
    const suggestedBid = totalCostToBuild + companyProfit;

    $('bidProfitAmt').value = fmt(companyProfit);

    // Actual bid override — if set, recalc profit from override
    const bidOverride = val('bidOverride');
    let actualBid, actualProfit;
    if (bidOverride > 0) {
        actualBid = bidOverride;
        actualProfit = bidOverride - totalCostToBuild;
        if ($('overrideInfo')) $('overrideInfo').style.display = '';
        if ($('sumActualBidRow')) { $('sumActualBidRow').style.display = ''; $('sumActualBid').textContent = fmt(actualBid); }
    } else {
        actualBid = suggestedBid;
        actualProfit = companyProfit;
        if ($('overrideInfo')) $('overrideInfo').style.display = 'none';
        if ($('sumActualBidRow')) $('sumActualBidRow').style.display = 'none';
    }

    // Profit breakdown (30/35/35) — uses actual profit (override or suggested)
    if ($('breakdownCompany')) $('breakdownCompany').textContent = fmt(actualProfit * 0.30);
    if ($('breakdownDan')) $('breakdownDan').textContent = fmt(actualProfit * 0.35);
    if ($('breakdownJames')) $('breakdownJames').textContent = fmt(actualProfit * 0.35);

    // Per-unit calcs
    const costPerApt = numApt > 0 ? totalCostToBuild / numApt : 0;
    const costPerSys = totalSystems > 0 ? totalCostToBuild / totalSystems : 0;
    const laborPerApt = numApt > 0 ? laborCost / numApt : 0;
    const laborPerSys = totalSystems > 0 ? laborCost / totalSystems : 0;

    // Suggested bids
    let sugAptBid = actualBid, sugClubBid = 0;
    if (hasClub && clubSystems > 0 && totalSystems > 0) {
        const aptShare = (totalSystems - clubSystems) / totalSystems;
        sugAptBid = actualBid * aptShare;
        sugClubBid = actualBid * (1 - aptShare);
    }

    // Update summary
    $('sumMaterial').textContent = fmt(materialCost);
    $('sumLabor').textContent = fmt(laborCost);
    $('sumInsurance').textContent = fmt(insurance);
    $('sumPermits').textContent = fmt(permits);
    $('sumMgmt').textContent = fmt(mgmtFee);
    $('sumPerDiem').textContent = fmt(perDiemTotal);
    if ($('sumAdmin')) $('sumAdmin').textContent = fmt(adminCosts);
    if ($('sumHousing')) $('sumHousing').textContent = fmt(housingTotal);
    $('sumCostToBuild').textContent = fmt(totalCostToBuild);
    $('sumProfit').textContent = fmt(companyProfit);
    $('sumTotal').textContent = fmt(suggestedBid);
    $('sumNetProfit').textContent = fmt(actualProfit);
    if ($('sumBreakdownCompany')) $('sumBreakdownCompany').textContent = fmt(actualProfit * 0.30);
    if ($('sumBreakdownDan')) $('sumBreakdownDan').textContent = fmt(actualProfit * 0.35);
    if ($('sumBreakdownJames')) $('sumBreakdownJames').textContent = fmt(actualProfit * 0.35);
    $('sumAptBid').textContent = fmt(sugAptBid);
    $('sumClubBid').textContent = fmt(sugClubBid);
    $('sumCostPerApt').textContent = fmt(costPerApt);
    $('sumCostPerSys').textContent = fmt(costPerSys);
    $('sumLaborPerApt').textContent = fmt(laborPerApt);
    $('sumLaborPerSys').textContent = fmt(laborPerSys);
    const bidPerApt = numApt > 0 ? actualBid / numApt : 0;
    const bidPerSys = totalSystems > 0 ? actualBid / totalSystems : 0;
    if ($('sumBidPerApt')) $('sumBidPerApt').textContent = fmt(bidPerApt);
    if ($('sumBidPerSys')) $('sumBidPerSys').textContent = fmt(bidPerSys);

    // Recalc partner profit amounts — uses actual profit
    recalcPartners(actualProfit);
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

async function loadNextBidNumber() {
    const res = await fetch('/api/bids/next-number');
    const data = await res.json();
    if (data.bid_number && !$('bidNumber').value) {
        $('bidNumber').value = data.bid_number;
    }
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
    if ($('sumJobName')) $('sumJobName').textContent = bid.bid_name || '';
    $('bidName').value = bid.bid_name || '';
    $('bidJob').value = bid.job_id || '';
    $('bidProjectType').value = bid.project_type || 'Multi-Family';
    $('bidStatus').value = bid.status || 'Draft';
    $('bidLead').value = bid.lead_name || '';

    $('bidGC').value = bid.contracting_gc || '';
    if ($('bidCustomerId')) $('bidCustomerId').value = bid.customer_id || '';
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
    if (isOwner && $('bidPricePerTon')) $('bidPricePerTon').value = bid.price_per_ton || 0;
    toggleClubhouse();

    if (isOwner) {
        // Material cost breakdown — backward compat: if old bid has material_cost but no subtotal, load into subtotal
        const matSub = bid.material_subtotal || 0;
        const matCost = bid.material_cost || 0;
        $('bidMatSubtotal').value = (matSub > 0) ? matSub : matCost;
        $('bidMatShipping').value = bid.material_shipping || 0;
        $('bidMatTaxRate').value = bid.material_tax_rate || 0;

        // Auto-fill tax rate from job if not set and bid has a job
        if ((bid.material_tax_rate || 0) === 0 && matSub === 0 && bid.job_id) {
            fetch(`/api/projects/${bid.job_id}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (data && data.job && data.job.tax_rate && $('bidMatTaxRate')) {
                        $('bidMatTaxRate').value = data.job.tax_rate;
                        recalculate();
                    }
                }).catch(() => {});
        }

        // Populate supplier quote dropdown for this job
        if (bid.job_id && $('bidQuoteSelect')) {
            loadQuotesForJob(bid.job_id);
        }

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
        $('bidProfitPct').value = bid.company_profit_pct || 0;
        if ($('bidProfitMode')) $('bidProfitMode').value = bid.profit_mode || 'percentage';
        if ($('bidProfitPerSystem')) $('bidProfitPerSystem').value = bid.profit_per_system || 0;
        if ($('bidOverride')) $('bidOverride').value = bid.actual_bid_override || 0;
        if ($('bidType')) $('bidType').value = bid.bid_type || '';
        if ($('bidLaborOverride')) $('bidLaborOverride').value = bid.labor_cost_override || 0;
        if ($('bidAdminCosts')) $('bidAdminCosts').value = bid.admin_costs || 0;
        if ($('bidAdminNotes')) $('bidAdminNotes').value = bid.admin_costs_notes || '';
        if ($('bidHousingRate')) $('bidHousingRate').value = bid.housing_rate || 0;
        toggleProfitMode();

        bidPartners = bid.partners || [];
        renderPartners();

        bidPersonnel = bid.personnel || [];
        renderPersonnel();
    }

    $('bidInclusions').value = bid.inclusions || DEFAULT_INCLUSIONS;
    $('bidExclusions').value = bid.exclusions || DEFAULT_EXCLUSIONS;
    $('bidDescription').value = bid.bid_description || '';
    $('bidNotes').value = bid.notes || '';

    // Proposal line items
    proposalLines = bid.proposal_lines || [];
    renderProposalLines();

    // Show proposal buttons if a PDF already exists
    if (bid.proposal_pdf) {
        $('btnPreview').href = bid.proposal_pdf;
        $('btnPreview').style.display = '';
        $('btnDownload').href = bid.proposal_pdf + '?download=1';
        $('btnDownload').style.display = '';
        $('btnEmail').style.display = '';
        $('btnGenerate').textContent = 'Regenerate Proposal';
    }

    recalculate();

    // Check for takeoff data
    if (isOwner && window.BID_ID > 0) {
        fetch(`/api/bids/${window.BID_ID}/takeoff/items`).then(r => r.json()).then(tkItems => {
            if (tkItems.length > 0) {
                let total = 0;
                tkItems.forEach(ti => {
                    if (ti.enabled) {
                        const oq = ti.qty_override != null ? ti.qty_override : 0;
                        // Show info bar — exact total computed server-side via push
                        total += (oq || 0) * (ti.unit_price || 0);
                    }
                });
                const bar = $('takeoffInfoBar');
                const link = $('takeoffEditLink');
                if (bar) {
                    bar.style.display = '';
                    $('takeoffTotal').textContent = fmt(val('bidMatSubtotal'));
                    if (link) link.href = `/bids/${window.BID_ID}/takeoff`;
                }
            }
        }).catch(() => {});
    }
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
    const data = {
        bid_name: $('bidName').value,
        job_id: $('bidJob').value || null,
        project_type: $('bidProjectType').value,
        status: $('bidStatus').value,
        lead_name: $('bidLead').value,

        contracting_gc: $('bidGC').value,
        customer_id: $('bidCustomerId')?.value || null,
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

        inclusions: $('bidInclusions').value,
        exclusions: $('bidExclusions').value,
        bid_description: $('bidDescription').value,
        notes: $('bidNotes').value,
    };

    // Only include cost/financial fields for owners
    if (isOwner) {
        Object.assign(data, {
            price_per_ton: val('bidPricePerTon'),
            material_subtotal: val('bidMatSubtotal'),
            material_shipping: val('bidMatShipping'),
            material_tax_rate: val('bidMatTaxRate'),
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
            company_profit_pct: val('bidProfitPct'),
            profit_mode: $('bidProfitMode') ? $('bidProfitMode').value : 'percentage',
            profit_per_system: val('bidProfitPerSystem'),
            actual_bid_override: val('bidOverride'),
            bid_type: $('bidType') ? $('bidType').value : '',
            labor_cost_override: val('bidLaborOverride'),
            admin_costs: val('bidAdminCosts'),
            admin_costs_notes: $('bidAdminNotes') ? $('bidAdminNotes').value : '',
            housing_rate: val('bidHousingRate'),
        });
    }

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

    // Sync partners + personnel (owner only)
    if (isOwner) {
        const partners = collectPartnersFromDOM();
        const personnel = collectPersonnelFromDOM();

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
    }

    // Save proposal line items
    const lines = collectProposalLines();
    await fetch(`/api/bids/${bidId}/proposal-lines`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ lines })
    });

    // Reload to get fresh IDs
    window.BID_ID = bidId;
    loadBid();
    $('pageTitle').textContent = $('bidName').value || 'Edit Bid';
}

// ─── Proposal Preview + PDF ────────────────────────────────
function previewProposal() {
    if (!window.BID_ID || window.BID_ID <= 0) return alert('Save the bid first.');
    window.open(`/api/bids/${window.BID_ID}/preview-proposal`, '_blank');
}

async function generateProposal() {
    if (!window.BID_ID || window.BID_ID <= 0) return alert('Save the bid first.');
    const btn = $('btnGenerate');
    btn.textContent = 'Generating...';
    btn.disabled = true;
    try {
        const res = await fetch(`/api/bids/${window.BID_ID}/generate-proposal`, { method: 'POST' });
        if (!res.ok && res.headers.get('content-type')?.indexOf('json') === -1) {
            alert('Server error generating proposal. Check the server logs.'); return;
        }
        const result = await res.json();
        if (result.error) { alert(result.error); return; }
        // Show preview, download + email buttons
        const previewBtn = $('btnPreview');
        previewBtn.href = result.path;
        previewBtn.style.display = '';
        const dlBtn = $('btnDownload');
        dlBtn.href = result.path + '?download=1';
        dlBtn.style.display = '';
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
        // Auto-expand SMTP settings if not yet configured
        if (!settings.smtp_host) {
            $('smtpDetails').open = true;
        }
    } catch(e) {
        $('smtpDetails').open = true;
    }
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

// ─── Follow-ups ─────────────────────────────────────────────
let followups = [];

async function loadFollowups() {
    if (!window.BID_ID || window.BID_ID <= 0) return;
    document.getElementById('followupsSection').style.display = '';
    const res = await fetch(`/api/bids/${window.BID_ID}/followups`);
    followups = await res.json();
    renderFollowups();
    // Show award button if bid is Submitted
    const status = document.getElementById('bidStatus')?.value;
    if (status === 'Submitted' || status === 'Draft') {
        document.getElementById('awardSection').style.display = '';
    }
}

function renderFollowups() {
    const tbody = document.getElementById('followupsBody');
    if (!followups.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No follow-ups yet</td></tr>';
        return;
    }
    tbody.innerHTML = followups.map(f => {
        const statusClass = f.status === 'Completed' ? 'status-complete' : f.status === 'Skipped' ? 'status-cancelled' : 'status-in-progress';
        return `<tr>
            <td>${f.followup_date || '-'}</td>
            <td>${f.followup_type || '-'}</td>
            <td>${f.assigned_name || '-'}</td>
            <td><span class="status-badge ${statusClass}">${f.status}</span></td>
            <td>${f.notes || '-'}</td>
            <td>${f.result || '-'}</td>
            <td style="text-align:right;">
                <select class="form-select" style="width:auto;display:inline;font-size:12px;padding:2px 4px;" onchange="updateFollowupStatus(${f.id}, this.value)">
                    <option value="Scheduled" ${f.status==='Scheduled'?'selected':''}>Scheduled</option>
                    <option value="Completed" ${f.status==='Completed'?'selected':''}>Completed</option>
                    <option value="Skipped" ${f.status==='Skipped'?'selected':''}>Skipped</option>
                </select>
                <button class="btn btn-secondary btn-small" onclick="deleteFollowup(${f.id})" style="color:red;margin-left:4px;">Del</button>
            </td>
        </tr>`;
    }).join('');
}

function showAddFollowup() {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    const dateStr = date.toISOString().split('T')[0];
    const html = `<div style="display:grid;gap:12px;padding:12px;background:var(--gray-50);border-radius:8px;margin-top:8px;" id="newFollowupForm">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
            <div><label class="form-label">Date</label><input type="date" id="fuDate" class="form-input" value="${dateStr}"></div>
            <div><label class="form-label">Type</label><select id="fuType" class="form-select"><option>Call</option><option>Email</option><option>In Person</option><option>Other</option></select></div>
            <div><label class="form-label">Assigned To</label><select id="fuAssigned" class="form-select"><option value="">--</option></select></div>
        </div>
        <div><label class="form-label">Notes</label><input type="text" id="fuNotes" class="form-input"></div>
        <div style="display:flex;gap:8px;"><button class="btn btn-primary btn-small" onclick="saveFollowup()">Save</button><button class="btn btn-secondary btn-small" onclick="document.getElementById('newFollowupForm').remove()">Cancel</button></div>
    </div>`;
    document.getElementById('followupsSection').insertAdjacentHTML('beforeend', html);
    fetch('/api/users').then(r => r.json()).then(users => {
        const sel = document.getElementById('fuAssigned');
        users.forEach(u => { const o = document.createElement('option'); o.value = u.id; o.textContent = u.display_name; sel.appendChild(o); });
    });
}

async function saveFollowup() {
    await fetch(`/api/bids/${window.BID_ID}/followups`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            followup_date: document.getElementById('fuDate').value,
            followup_type: document.getElementById('fuType').value,
            assigned_to: document.getElementById('fuAssigned').value || null,
            notes: document.getElementById('fuNotes').value
        })
    });
    const form = document.getElementById('newFollowupForm');
    if (form) form.remove();
    loadFollowups();
}

async function updateFollowupStatus(fid, status) {
    const f = followups.find(x => x.id === fid);
    await fetch(`/api/bids/${window.BID_ID}/followups/${fid}`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({...f, status})
    });
    loadFollowups();
}

async function deleteFollowup(fid) {
    if (!confirm('Delete this follow-up?')) return;
    await fetch(`/api/bids/${window.BID_ID}/followups/${fid}`, { method: 'DELETE' });
    loadFollowups();
}

async function awardBid() {
    if (!confirm('Award this bid? This will:\n- Create a project (if not already linked)\n- Set bid status to Accepted\n- Set job status to Awarded\n- Create pay app contract\n- Create precon meeting\n- Seed schedule phases, PM benchmarks & closeout checklist\n- Notify team')) return;
    const res = await fetch(`/api/bids/${window.BID_ID}/award`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
        window._toastShown = true;
        if (data.job_id && confirm('Bid awarded successfully!\n\nGo to the new project page?')) {
            location.href = '/projects/' + data.job_id;
        } else {
            location.reload();
        }
    } else {
        alert(data.error || 'Failed to award bid');
    }
}

// ─── Proposal Line Items ──────────────────────────────────
let proposalLines = [];

function renderProposalLines() {
    const container = $('proposalLinesContainer');
    if (!container) return;
    if (!proposalLines.length) {
        container.innerHTML = '<p style="color:var(--gray-400);font-size:13px;margin:4px 0;">No line items. The proposal will show the total bid amount only.</p>';
        return;
    }
    container.innerHTML = proposalLines.map((line, i) => `
        <div class="proposal-line-row" style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
            <input type="text" class="form-input pl-desc" value="${(line.description || '').replace(/"/g, '&quot;')}"
                placeholder="e.g. Commercial Space" style="flex:2;">
            <input type="number" class="form-input pl-amount" value="${line.amount || 0}" step="0.01" min="0"
                placeholder="Amount" style="flex:1;">
            <button type="button" class="btn btn-small btn-secondary" onclick="removeProposalLine(${i})" style="color:#EF4444;">X</button>
        </div>
    `).join('');
}

function addProposalLine() {
    proposalLines.push({ description: '', amount: 0 });
    renderProposalLines();
    // Focus the new description input
    const inputs = document.querySelectorAll('.pl-desc');
    if (inputs.length) inputs[inputs.length - 1].focus();
}

function removeProposalLine(index) {
    // Save current values before removing
    syncProposalLinesFromDOM();
    proposalLines.splice(index, 1);
    renderProposalLines();
}

function syncProposalLinesFromDOM() {
    const rows = document.querySelectorAll('.proposal-line-row');
    proposalLines = Array.from(rows).map(row => ({
        description: row.querySelector('.pl-desc').value.trim(),
        amount: parseFloat(row.querySelector('.pl-amount').value) || 0,
    }));
}

function collectProposalLines() {
    syncProposalLinesFromDOM();
    return proposalLines.filter(l => l.description);
}

// ─── Supplier Quote Integration ──────────────────────────────
let _bidQuotes = [];

async function loadQuotesForJob(jobId) {
    const sel = $('bidQuoteSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Manual Entry --</option>';
    _bidQuotes = [];
    if (!jobId) return;
    try {
        const res = await fetch('/api/supplier-quotes?job_id=' + jobId);
        _bidQuotes = await res.json();
        _bidQuotes.forEach(q => {
            const label = (q.supplier_name || 'Quote') +
                (q.quote_number ? ' #' + q.quote_number : '') +
                ' — ' + fmt(q.total || 0) +
                (q.is_baseline ? ' [Baseline]' : '');
            const opt = document.createElement('option');
            opt.value = q.id;
            opt.textContent = label;
            sel.appendChild(opt);
        });
    } catch(e) {}
}

function loadQuoteIntoBid() {
    const sel = $('bidQuoteSelect');
    const info = $('bidQuoteInfo');
    if (!sel) return;
    const qid = parseInt(sel.value);
    if (!qid) {
        if (info) info.textContent = '';
        return;
    }
    const q = _bidQuotes.find(x => x.id === qid);
    if (!q) return;

    // Fill material fields from quote
    $('bidMatSubtotal').value = q.subtotal || 0;
    $('bidMatShipping').value = q.freight || 0;
    // Back-calculate tax rate from quote's tax_amount and subtotal
    if (q.tax_amount > 0 && q.subtotal > 0) {
        $('bidMatTaxRate').value = Math.round(q.tax_amount / q.subtotal * 100 * 100) / 100;
    }
    if (info) info.textContent = 'Loaded from ' + (q.supplier_name || 'quote') + '. You can override any field.';
    recalculate();
}

// ─── Takeoff Navigation ────────────────────────────────────────
async function goToTakeoff() {
    // If bid isn't saved yet, save it first
    if (!window.BID_ID || window.BID_ID <= 0) {
        await saveBid();
        if (!window.BID_ID || window.BID_ID <= 0) {
            alert('Please save the bid first.');
            return;
        }
    }
    location.href = `/bids/${window.BID_ID}/takeoff`;
}

async function goToCommercialTakeoff() {
    if (!window.BID_ID || window.BID_ID <= 0) {
        await saveBid();
        if (!window.BID_ID || window.BID_ID <= 0) {
            alert('Please save the bid first.');
            return;
        }
    }
    location.href = `/bids/${window.BID_ID}/commercial-takeoff`;
}

// Load followups after bid loads
if (window.BID_ID > 0) {
    document.addEventListener('DOMContentLoaded', () => setTimeout(loadFollowups, 500));
}
