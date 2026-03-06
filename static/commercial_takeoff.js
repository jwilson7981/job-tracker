/* Commercial Bid Material Takeoff — LGHVAC */
let systems = [];
let items = [];
let config = {};
let _configLoaded = false;

const PHASES = ['Rough-In', 'Trim Out', 'Equipment', 'Startup/Other', 'Suggested Parts'];
const CALC_OPTIONS = [
    { value: 'per_system', label: 'Per System' },
    { value: 'per_supply_run', label: 'Per Supply Run' },
    { value: 'per_return_run', label: 'Per Return Run' },
    { value: 'per_total_run', label: 'Per Total Run' },
    { value: 'by_tonnage', label: 'By Tonnage' },
    { value: 'fixed', label: 'Fixed Qty' },
    { value: 'per_ton_total', label: 'Per Ton (Total)' },
];

const fmt = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const $ = id => document.getElementById(id);

// ─── Config Questions ────────────────────────────────────────
const CONFIG_FIELDS = [
    'cfgSystemType', 'cfgHeatSource', 'cfgMounting', 'cfgCurbAdapters', 'cfgEconomizers',
    'cfgDuctworkType', 'cfgGasPiping', 'cfgCondensate', 'cfgControls', 'cfgDisconnects'
];

function loadConfigToUI() {
    CONFIG_FIELDS.forEach(id => {
        const el = $(id);
        if (!el) return;
        if (config[id] !== undefined) el.value = config[id];
    });
}

function readConfigFromUI() {
    CONFIG_FIELDS.forEach(id => {
        const el = $(id);
        if (!el) return;
        config[id] = el.value;
    });
}

function onConfigChange() {
    readConfigFromUI();
    applyConfigToItems();
    recalcAll();
    fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/config`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(config)
    });
}

// Auto-toggle items on/off based on config answers
function applyConfigToItems() {
    if (!_configLoaded) return;
    const isRTU = getCfg('cfgSystemType') === 'RTU';
    const isSplit = getCfg('cfgSystemType') === 'Split System';
    const hasCurbs = getCfg('cfgCurbAdapters') === 'Yes';
    const hasEconomizers = getCfg('cfgEconomizers') === 'Yes';
    const hasGasPiping = getCfg('cfgGasPiping') === 'Yes';
    const usesPump = getCfg('cfgCondensate') === 'Condensate Pump';
    const hasDisconnects = getCfg('cfgDisconnects') === 'Yes';
    const isBMS = getCfg('cfgControls') === 'BMS';
    const isProgrammable = getCfg('cfgControls') === 'Programmable' || isBMS;
    const isFlexOnly = getCfg('cfgDuctworkType') === 'Flex';
    const isSheetMetalOnly = getCfg('cfgDuctworkType') === 'Sheet Metal';
    const activeTons = new Set(systems.filter(s => s.system_count > 0 && s.tons > 0).map(s => s.tons));

    items.forEach(item => {
        const name = (item.part_name || '').toLowerCase();
        const cat = (item.category || '').toLowerCase();

        // RTU Curb/Adapter: only when RTU + curbs
        if (name.includes('curb') && name.includes('adapter') || name.includes('rtu curb')) {
            item.enabled = (isRTU && hasCurbs) ? 1 : 0;
        }
        // RTU equipment: only when RTU
        if (cat === 'rtu') {
            item.enabled = isRTU ? 1 : 0;
        }
        // Split equipment: only when Split
        if (cat === 'split') {
            item.enabled = isSplit ? 1 : 0;
        }
        // Crane rental: RTU + rooftop
        if (name.includes('crane')) {
            item.enabled = (isRTU && getCfg('cfgMounting') === 'Rooftop') ? 1 : 0;
        }
        // Economizer
        if (name.includes('economizer') && item.phase === 'Suggested Parts') {
            item.enabled = hasEconomizers ? 1 : 0;
        }
        // Gas piping allowance
        if (name.includes('gas piping')) {
            item.enabled = hasGasPiping ? 1 : 0;
        }
        // Condensate pump
        if (name.includes('condensate pump')) {
            item.enabled = usesPump ? 1 : 0;
        }
        // Disconnects
        if (name.includes('disconnect') || name.includes('whip kit')) {
            item.enabled = hasDisconnects ? 1 : 0;
        }
        // Thermostat types
        if (name.includes('programmable thermostat')) {
            item.enabled = (isProgrammable && !isBMS) ? 1 : 0;
        }
        if (name.includes('bms') || name.includes('smart thermostat')) {
            item.enabled = isBMS ? 1 : 0;
        }
        // Sheet metal duct items: off when Flex only
        if ((name.includes('sheet metal') && cat === 'ductwork')) {
            item.enabled = !isFlexOnly ? 1 : 0;
        }
        // Spiral pipe: off when Flex only
        if (name.includes('spiral pipe')) {
            item.enabled = !isFlexOnly ? 1 : 0;
        }
        // Flex duct items: off when Sheet Metal only
        if (cat === 'flex' && item.phase === 'Rough-In') {
            item.enabled = !isSheetMetalOnly ? 1 : 0;
        }
        // Line sets: only for split systems
        if (cat === 'line sets') {
            item.enabled = isSplit ? 1 : 0;
        }
        // Condenser pads: only for split/ground level
        if (name.includes('condenser pad')) {
            item.enabled = (isSplit && getCfg('cfgMounting') === 'Ground Level') ? 1 : 0;
        }
        // Roof jacks: rooftop only
        if (name.includes('roof jack')) {
            item.enabled = getCfg('cfgMounting') === 'Rooftop' ? 1 : 0;
        }
        // Equipment: auto-disable if tons_match not in active systems
        if (item.phase === 'Equipment' && item.tons_match != null && !activeTons.has(item.tons_match)) {
            item.enabled = 0;
        }
    });

    renderItems();
}

// ─── Init ────────────────────────────────────────────────────
async function init() {
    try {
        const bidRes = await fetch(`/api/bids/${window.BID_ID}`);
        const bid = await bidRes.json();
        if (bid.bid_name) $('pageTitle').textContent = `Commercial Takeoff — ${bid.bid_name}`;
    } catch(e) {}

    const [cfgRes, sysRes, itRes] = await Promise.all([
        fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/config`),
        fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/systems`),
        fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/items`)
    ]);
    config = await cfgRes.json();
    systems = await sysRes.json();
    items = await itRes.json();

    if (items.length === 0) {
        await fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/seed-defaults`, { method: 'POST' });
        const res = await fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/items`);
        items = await res.json();
    }

    loadConfigToUI();
    _configLoaded = true;

    if (Object.keys(config).length === 0) {
        readConfigFromUI();
        applyConfigToItems();
        fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/config`, {
            method: 'PUT', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(config)
        });
    }

    renderSystems();
    renderItems();
    recalcAll();
}

// ─── Calculation Engine ──────────────────────────────────────
function getCfg(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function getSystemTotals() {
    let totalSystems = 0, totalSupplyRuns = 0, totalReturnRuns = 0, totalTonCount = 0;
    const tonsCounts = {};

    systems.forEach(sys => {
        const count = sys.system_count || 0;
        totalSystems += count;
        totalSupplyRuns += (sys.supply_runs || 0) * count;
        totalReturnRuns += (sys.return_runs || 0) * count;
        totalTonCount += (sys.tons || 0) * count;
        if (sys.tons > 0) {
            tonsCounts[sys.tons] = (tonsCounts[sys.tons] || 0) + count;
        }
    });

    const totalRuns = totalSupplyRuns + totalReturnRuns;
    return { totalSystems, totalSupplyRuns, totalReturnRuns, totalRuns, totalTonCount, tonsCounts };
}

function calcItemQty(item, totals) {
    const m = item.qty_multiplier || 0;
    switch (item.calc_basis) {
        case 'per_system':      return totals.totalSystems * m;
        case 'per_supply_run':  return totals.totalSupplyRuns * m;
        case 'per_return_run':  return totals.totalReturnRuns * m;
        case 'per_total_run':   return totals.totalRuns * m;
        case 'by_tonnage':      return (totals.tonsCounts[item.tons_match] || 0) * m;
        case 'fixed':           return m;
        case 'per_ton_total':   return totals.totalTonCount * m;
        default:                return 0;
    }
}

function recalcAll() {
    const totals = getSystemTotals();
    const phaseTotals = {};
    let enabledCount = 0;
    let grandTotal = 0;

    items.forEach(item => {
        const baseQty = calcItemQty(item, totals);
        item._calcQty = baseQty;
        const wasteMult = 1 + (item.waste_pct || 0) / 100;
        const orderQty = item.qty_override != null ? item.qty_override : Math.ceil(baseQty * wasteMult);
        item._orderQty = orderQty;
        item._extended = orderQty * (item.unit_price || 0);

        if (item.enabled) {
            enabledCount++;
            grandTotal += item._extended;
            phaseTotals[item.phase] = (phaseTotals[item.phase] || 0) + item._extended;
        }
    });

    $('sumEnabled').textContent = enabledCount;
    $('sumRoughIn').textContent = fmtShort(phaseTotals['Rough-In'] || 0);
    $('sumTrimOut').textContent = fmtShort(phaseTotals['Trim Out'] || 0);
    $('sumEquipment').textContent = fmtShort(phaseTotals['Equipment'] || 0);
    $('sumStartup').textContent = fmtShort(phaseTotals['Startup/Other'] || 0);
    const sugEl = $('sumSuggested');
    if (sugEl) sugEl.textContent = fmtShort(phaseTotals['Suggested Parts'] || 0);
    $('sumGrandTotal').textContent = fmt(grandTotal);

    renderSystemsTotals(totals);

    items.forEach(item => {
        const row = document.querySelector(`tr[data-item-id="${item.id}"]`);
        if (!row) return;
        const calcQtyEl = row.querySelector('.calc-qty');
        const orderQtyEl = row.querySelector('.order-qty');
        const extEl = row.querySelector('.extended');
        if (calcQtyEl) calcQtyEl.textContent = Math.round(item._calcQty * 100) / 100;
        if (orderQtyEl) {
            orderQtyEl.value = Math.round(item._orderQty * 100) / 100;
            orderQtyEl.style.background = item.qty_override != null ? '#FEF3C7' : '';
        }
        if (extEl) extEl.textContent = item.enabled ? fmt(item._extended) : '$0.00';
        row.style.opacity = item.enabled ? '1' : '0.4';
    });

    PHASES.forEach(phase => {
        const hdr = $(`phase-total-${phase.replace(/[^a-zA-Z]/g, '')}`);
        if (hdr) hdr.textContent = fmt(phaseTotals[phase] || 0);
    });
}

// ─── Render Systems ───────────────────────────────────────────
function renderSystems() {
    const tbody = $('systemsBody');
    if (!systems.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No systems. Click "+ Add System" to get started.</td></tr>';
        return;
    }
    tbody.innerHTML = systems.map((sys, idx) => `
        <tr data-sys-id="${sys.id}">
            <td><input type="text" class="form-input" value="${(sys.name || '').replace(/"/g, '&quot;')}" style="min-width:120px;" onchange="updateSystem(${idx},'name',this.value)"></td>
            <td><input type="number" class="form-input" value="${sys.system_count}" min="0" style="width:65px;text-align:center;" onchange="updateSystem(${idx},'system_count',+this.value)"></td>
            <td><input type="number" class="form-input" value="${sys.tons}" min="0" step="0.5" style="width:65px;text-align:center;" onchange="updateSystem(${idx},'tons',+this.value)"></td>
            <td><input type="number" class="form-input" value="${sys.cfm}" min="0" style="width:65px;text-align:center;" onchange="updateSystem(${idx},'cfm',+this.value)"></td>
            <td><input type="number" class="form-input" value="${sys.supply_runs}" min="0" style="width:75px;text-align:center;" onchange="updateSystem(${idx},'supply_runs',+this.value)"></td>
            <td><input type="number" class="form-input" value="${sys.return_runs}" min="0" style="width:75px;text-align:center;" onchange="updateSystem(${idx},'return_runs',+this.value)"></td>
            <td><button class="btn btn-secondary btn-small" onclick="deleteSystem(${idx})" style="color:#EF4444;padding:2px 6px;">&times;</button></td>
        </tr>
    `).join('');
}

function renderSystemsTotals(totals) {
    const tfoot = $('systemsTotals');
    if (!systems.length) { tfoot.innerHTML = ''; return; }
    tfoot.innerHTML = `<tr style="font-weight:700;background:var(--gray-50);">
        <td>Totals</td>
        <td style="text-align:center;">${totals.totalSystems}</td>
        <td style="text-align:center;">${totals.totalTonCount}</td>
        <td>-</td>
        <td style="text-align:center;">${totals.totalSupplyRuns}</td>
        <td style="text-align:center;">${totals.totalReturnRuns}</td>
        <td></td>
    </tr>`;
}

function updateSystem(idx, field, value) {
    systems[idx][field] = value;
    recalcAll();
}

const SYSTEM_PRESETS = {
    rtu1:    { name: 'RTU-1',    system_count: 1, tons: 5, cfm: 2000, supply_runs: 4, return_runs: 2 },
    rtu2:    { name: 'RTU-2',    system_count: 1, tons: 7.5, cfm: 3000, supply_runs: 6, return_runs: 3 },
    split1:  { name: 'Split-1',  system_count: 1, tons: 3, cfm: 1200, supply_runs: 3, return_runs: 1 },
    split2:  { name: 'Split-2',  system_count: 1, tons: 5, cfm: 2000, supply_runs: 4, return_runs: 2 },
    custom:  { name: 'Custom',   system_count: 1, tons: 0, cfm: 0, supply_runs: 0, return_runs: 0 },
};

async function addPresetSystem() {
    const sel = $('sysPreset');
    const key = sel.value;
    if (!key) return;
    const preset = SYSTEM_PRESETS[key] || SYSTEM_PRESETS.custom;
    const sys = { ...preset };
    const res = await fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/systems`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(sys)
    });
    const data = await res.json();
    sys.id = data.id;
    sys.sort_order = systems.length;
    systems.push(sys);
    renderSystems();
    recalcAll();
    sel.value = '';
}

async function deleteSystem(idx) {
    const sys = systems[idx];
    if (!confirm(`Delete system "${sys.name}"?`)) return;
    await fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/systems/${sys.id}`, { method: 'DELETE' });
    systems.splice(idx, 1);
    renderSystems();
    recalcAll();
}

// ─── Render Items ────────────────────────────────────────────
function renderItems() {
    const totals = getSystemTotals();
    const container = $('phaseSections');
    container.innerHTML = PHASES.map(phase => {
        const phaseItems = items.filter(i => i.phase === phase);
        const phaseKey = phase.replace(/[^a-zA-Z]/g, '');
        return `
        <div class="bid-section" style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="togglePhase('${phaseKey}')">
                <h3 style="margin:0;">${phase} <span style="font-weight:400;font-size:13px;color:var(--gray-400);">(${phaseItems.length} items)</span></h3>
                <span style="font-weight:600;color:var(--blue-primary);" id="phase-total-${phaseKey}">$0.00</span>
            </div>
            <div id="phase-body-${phaseKey}" style="margin-top:8px;">
                <div style="overflow-x:auto;">
                    <table class="data-table" style="font-size:12px;">
                        <thead><tr>
                            <th style="width:30px;"></th>
                            <th>Part Name</th><th style="width:80px;">SKU</th><th style="width:90px;">Category</th>
                            <th style="width:80px;">Unit $</th><th style="width:120px;">Calc Basis</th>
                            <th style="width:70px;">Mult</th><th style="width:75px;">Waste%</th>
                            ${phase === 'Equipment' ? '<th style="width:55px;">Tons</th>' : ''}
                            <th style="width:70px;">Calc Qty</th><th style="width:85px;">Order Qty</th>
                            <th style="width:80px;">Extended</th><th style="width:30px;"></th>
                        </tr></thead>
                        <tbody>
                            ${phaseItems.map(item => renderItemRow(item, phase, totals)).join('')}
                            ${phaseItems.length === 0 ? `<tr><td colspan="13" class="empty-state">No items</td></tr>` : ''}
                        </tbody>
                    </table>
                    <button class="btn btn-secondary btn-small" style="margin-top:6px;" onclick="addItemToPhase('${phase}')">+ Add Item</button>
                </div>
            </div>
        </div>`;
    }).join('');
    recalcAll();
}

function renderItemRow(item, phase, totals) {
    const calcQty = totals ? calcItemQty(item, totals) : 0;
    const wasteMult = 1 + (item.waste_pct || 0) / 100;
    const orderQty = item.qty_override != null ? item.qty_override : Math.ceil(calcQty * wasteMult);
    const extended = item.enabled ? orderQty * (item.unit_price || 0) : 0;
    const calcOpts = CALC_OPTIONS.map(o =>
        `<option value="${o.value}" ${item.calc_basis === o.value ? 'selected' : ''}>${o.label}</option>`
    ).join('');
    const showTons = phase === 'Equipment';
    return `<tr data-item-id="${item.id}" style="opacity:${item.enabled ? 1 : 0.4};">
        <td><input type="checkbox" ${item.enabled ? 'checked' : ''} onchange="toggleItem(${item.id}, this.checked)" title="Enable/disable"></td>
        <td><input type="text" class="form-input" value="${(item.part_name || '').replace(/"/g, '&quot;')}" style="min-width:120px;" onchange="updateItem(${item.id},'part_name',this.value)"></td>
        <td><input type="text" class="form-input" value="${(item.sku || '').replace(/"/g, '&quot;')}" style="width:80px;" onchange="updateItem(${item.id},'sku',this.value)"></td>
        <td><input type="text" class="form-input" value="${(item.category || '').replace(/"/g, '&quot;')}" style="width:90px;" onchange="updateItem(${item.id},'category',this.value)"></td>
        <td><input type="number" class="form-input" value="${item.unit_price}" min="0" step="0.01" style="width:80px;" onchange="updateItem(${item.id},'unit_price',+this.value)"></td>
        <td><select class="form-select" style="width:120px;font-size:11px;" onchange="updateItem(${item.id},'calc_basis',this.value)">${calcOpts}</select></td>
        <td><input type="number" class="form-input" value="${item.qty_multiplier}" min="0" step="0.25" style="width:70px;text-align:center;" onchange="updateItem(${item.id},'qty_multiplier',+this.value)"></td>
        <td><input type="number" class="form-input" value="${item.waste_pct}" min="0" step="1" style="width:75px;text-align:center;" onchange="updateItem(${item.id},'waste_pct',+this.value)"></td>
        ${showTons ? `<td><input type="number" class="form-input" value="${item.tons_match || ''}" min="0" step="0.5" style="width:55px;text-align:center;" onchange="updateItem(${item.id},'tons_match',this.value?+this.value:null)"></td>` : ''}
        <td class="calc-qty" style="text-align:right;font-weight:500;">${Math.round(calcQty * 100) / 100}</td>
        <td><input type="number" class="form-input order-qty" value="${Math.round(orderQty * 100) / 100}" min="0" step="1" style="width:85px;text-align:right;${item.qty_override != null ? 'background:#FEF3C7;' : ''}"
            onchange="overrideQty(${item.id}, this.value)" ondblclick="clearOverride(${item.id})"></td>
        <td class="extended" style="text-align:right;font-weight:600;">${fmt(extended)}</td>
        <td><button class="btn btn-secondary btn-small" onclick="deleteItem(${item.id})" style="color:#EF4444;padding:2px 6px;">&times;</button></td>
    </tr>`;
}

function togglePhase(phaseKey) {
    const body = $(`phase-body-${phaseKey}`);
    body.style.display = body.style.display === 'none' ? '' : 'none';
}

// ─── Item Updates ────────────────────────────────────────────
function updateItem(id, field, value) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    item[field] = value;
    recalcAll();
}

function toggleItem(id, checked) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    item.enabled = checked ? 1 : 0;
    recalcAll();
}

function overrideQty(id, value) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const totals = getSystemTotals();
    const baseQty = calcItemQty(item, totals);
    const wasteMult = 1 + (item.waste_pct || 0) / 100;
    const autoQty = Math.ceil(baseQty * wasteMult);
    const entered = parseFloat(value) || 0;
    if (Math.abs(entered - autoQty) < 0.01) {
        item.qty_override = null;
    } else {
        item.qty_override = entered;
    }
    recalcAll();
}

function clearOverride(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    item.qty_override = null;
    recalcAll();
}

async function addItem() {
    const phase = prompt('Phase?\n1) Rough-In\n2) Trim Out\n3) Equipment\n4) Startup/Other\n5) Suggested Parts', '1');
    const phaseMap = { '1': 'Rough-In', '2': 'Trim Out', '3': 'Equipment', '4': 'Startup/Other', '5': 'Suggested Parts' };
    addItemToPhase(phaseMap[phase] || 'Rough-In');
}

async function addItemToPhase(phase) {
    const res = await fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/items`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ phase: phase, part_name: 'New Item', calc_basis: 'per_system', qty_multiplier: 1 })
    });
    const data = await res.json();
    items.push({
        id: data.id, bid_id: window.BID_ID, phase: phase, category: '', part_name: 'New Item',
        sku: '', unit_price: 0, calc_basis: 'per_system', qty_multiplier: 1, tons_match: null,
        waste_pct: 0, enabled: 1, qty_override: null, sort_order: 999, notes: ''
    });
    renderItems();
}

async function deleteItem(id) {
    if (!confirm('Delete this item?')) return;
    await fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/items/${id}`, { method: 'DELETE' });
    items = items.filter(i => i.id !== id);
    renderItems();
}

// ─── Reset to Defaults ────────────────────────────────────────
async function resetToDefaults() {
    if (!confirm('This will DELETE all current commercial takeoff items and replace them with the latest defaults.\n\nYour systems and config will be kept.\n\nContinue?')) return;
    try {
        const res = await fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/reset-defaults`, { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
            const itRes = await fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/items`);
            items = await itRes.json();
            applyConfigToItems();
            renderItems();
            alert('Reset complete — ' + items.length + ' items loaded from defaults.');
        } else {
            alert('Reset failed: ' + (data.error || 'Unknown error'));
        }
    } catch(e) {
        alert('Reset failed: ' + e.message);
    }
}

// ─── Calculate All ────────────────────────────────────────────
function calculateAll() {
    readConfigFromUI();
    applyConfigToItems();
    const bar = $('summaryBar');
    bar.style.transition = 'box-shadow 0.3s';
    bar.style.boxShadow = '0 0 0 3px #34D399';
    setTimeout(() => { bar.style.boxShadow = ''; }, 800);
}

// ─── Save All ────────────────────────────────────────────────
async function saveAllItems() {
    const btn = document.querySelector('.page-header .btn-primary');
    btn.textContent = 'Saving...';
    btn.disabled = true;
    try {
        await Promise.all([
            fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/config`, {
                method: 'PUT', headers: {'Content-Type':'application/json'},
                body: JSON.stringify(config)
            }),
            fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/items/bulk`, {
                method: 'PUT', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ systems: systems, items: items })
            })
        ]);
    } finally {
        btn.textContent = 'Save All';
        btn.disabled = false;
    }
}

// ─── Push to Bid ─────────────────────────────────────────────
async function pushToBid() {
    let grandTotal = 0;
    items.forEach(item => {
        if (item.enabled) grandTotal += (item._extended || 0);
    });

    if (!confirm(`Push material total of ${fmt(grandTotal)} to bid's material subtotal?`)) return;

    await saveAllItems();

    await fetch(`/api/bids/${window.BID_ID}/commercial-takeoff/push-to-bid`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ total: Math.round(grandTotal * 100) / 100 })
    });
    window._toastShown = true;
    alert(`Material subtotal updated to ${fmt(grandTotal)}`);
}

// ─── Start ───────────────────────────────────────────────────
init();
