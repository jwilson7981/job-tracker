/* Bid Material Takeoff — LGHVAC */
let unitTypes = [];
let items = [];
let config = {};
let _configLoaded = false;

const PHASES = ['Rough-In', 'Trim Out', 'Equipment', 'Startup/Other'];
const CALC_OPTIONS = [
    { value: 'per_system', label: 'Per System' },
    { value: 'per_bedroom', label: 'Per Bedroom' },
    { value: 'per_bathroom', label: 'Per Bathroom' },
    { value: 'per_8in_drop', label: 'Per 8" Drop' },
    { value: 'per_6in_drop', label: 'Per 6" Drop' },
    { value: 'per_total_drop', label: 'Per Total Drop' },
    { value: 'by_tonnage', label: 'By Tonnage' },
    { value: 'fixed', label: 'Fixed Qty' },
];

const fmt = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const $ = id => document.getElementById(id);

// ─── Config Questions ────────────────────────────────────────
// Maps config field IDs to their element IDs
const CONFIG_FIELDS = [
    'cfgBuildType', 'cfgCRD', 'cfgOrientation', 'cfgAHUType', 'cfgDrainPan',
    'cfgMiniSplits', 'cfgDuctboard', 'cfgExhaustType', 'cfgWrapping',
    'cfgPassThroughs', 'cfgCondenserLoc', 'cfgOutsideAir', 'cfgRangeHoods',
    'cfgZoned', 'cfgBagsPerDrop', 'cfgDuctboardPerUnit'
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
    // Auto-save config
    fetch(`/api/bids/${window.BID_ID}/takeoff/config`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(config)
    });
}

// Auto-toggle items on/off and adjust multipliers based on config answers
function applyConfigToItems() {
    if (!_configLoaded) return;
    const cfg = config;

    items.forEach(item => {
        const name = (item.part_name || '').toLowerCase();
        const cat = (item.category || '').toLowerCase();
        const phase = item.phase;

        // ── CRD items: off if "No CRD" ──
        if (name.includes('crd') && !name.includes('boot')) {
            item.enabled = cfg.cfgCRD === 'CRD' ? 1 : 0;
        }
        if (name.includes('crd boot')) {
            item.enabled = cfg.cfgCRD === 'CRD' ? 1 : 0;
        }

        // ── Drain Pans: on/off ──
        if (name.includes('drain pan')) {
            item.enabled = cfg.cfgDrainPan === 'Yes' ? 1 : 0;
        }

        // ── Mini Split items: on/off ──
        if (name.includes('mini split')) {
            item.enabled = cfg.cfgMiniSplits === 'Yes' ? 1 : 0;
        }

        // ── Ductboard: on/off + multiplier ──
        if (name.includes('duct board') || name.includes('ductboard')) {
            item.enabled = cfg.cfgDuctboard === 'Yes' ? 1 : 0;
            if (cfg.cfgDuctboardPerUnit) {
                item.qty_multiplier = parseFloat(cfg.cfgDuctboardPerUnit) || 2;
            }
        }

        // ── Pass-throughs: on/off ──
        if (name.includes('pass-through') || name.includes('pass through')) {
            item.enabled = cfg.cfgPassThroughs === 'Yes' ? 1 : 0;
        }

        // ── Flex duct bags per drop multiplier ──
        if (name.includes('flex') && (name.includes('r6') || name.includes('r8')) && name.includes("'")) {
            const bagsPerDrop = parseFloat(cfg.cfgBagsPerDrop) || 0.75;
            item.qty_multiplier = bagsPerDrop;
        }

        // ── Duct wrap: off if no wrapping ──
        if (name.includes('duct wrap') || (name.includes('wrapping') && cat.includes('insulation'))) {
            item.enabled = cfg.cfgWrapping === 'Yes' ? 1 : 0;
        }

        // ── Build type: Heat Pump vs Straight Heat Cool ──
        // Toggle between condensers and heat pumps based on build type
        if (cat === 'condensers' && name.includes('condenser')) {
            item.enabled = cfg.cfgBuildType === 'Straight Heat Cool' ? 1 : 0;
        }
        // If we later add heat pump line items, toggle them here:
        // if (cat === 'heat pumps') { item.enabled = cfg.cfgBuildType === 'Heat Pump' ? 1 : 0; }

        // ── R6 vs R8 flex: R6 default on, R8 default off ──
        // (already handled by default enabled values, but config could override)
        if (name.includes('flex r8')) {
            // R8 stays as-is unless user manually toggles
        }
    });

    // Re-render to show updated checkboxes
    renderItems();
}

// ─── Init ────────────────────────────────────────────────────
async function init() {
    // Load bid name for title
    try {
        const bidRes = await fetch(`/api/bids/${window.BID_ID}`);
        const bid = await bidRes.json();
        if (bid.bid_name) $('pageTitle').textContent = `Takeoff — ${bid.bid_name}`;
    } catch(e) {}

    // Load config, unit types & items in parallel
    const [cfgRes, utRes, itRes] = await Promise.all([
        fetch(`/api/bids/${window.BID_ID}/takeoff/config`),
        fetch(`/api/bids/${window.BID_ID}/takeoff/unit-types`),
        fetch(`/api/bids/${window.BID_ID}/takeoff/items`)
    ]);
    config = await cfgRes.json();
    unitTypes = await utRes.json();
    items = await itRes.json();

    // Seed defaults if no items exist
    if (items.length === 0) {
        await fetch(`/api/bids/${window.BID_ID}/takeoff/seed-defaults`, { method: 'POST' });
        const res = await fetch(`/api/bids/${window.BID_ID}/takeoff/items`);
        items = await res.json();
    }

    // Load config into UI
    loadConfigToUI();
    _configLoaded = true;

    // If config is empty (first time), apply defaults from UI and save
    if (Object.keys(config).length === 0) {
        readConfigFromUI();
        applyConfigToItems();
        fetch(`/api/bids/${window.BID_ID}/takeoff/config`, {
            method: 'PUT', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(config)
        });
    }

    renderUnitTypes();
    renderItems();
    recalcAll();
}

// ─── Calculation Engine ──────────────────────────────────────
function getUnitTotals() {
    let totalSystems = 0, totalBedrooms = 0, totalBathrooms = 0;
    let total8in = 0, total6in = 0, totalDrops = 0;
    const tonsCounts = {}; // tons_value -> count of units

    unitTypes.forEach(ut => {
        const count = ut.unit_count || 0;
        totalSystems += count;
        totalBedrooms += count * (ut.bedrooms || 0);
        totalBathrooms += count * (ut.bathrooms || 0);
        total8in += count * (ut.drops_8in || 0);
        total6in += count * (ut.drops_6in || 0);
        totalDrops += count * ((ut.drops_8in || 0) + (ut.drops_6in || 0));
        if (ut.tons > 0) {
            tonsCounts[ut.tons] = (tonsCounts[ut.tons] || 0) + count;
        }
    });

    return { totalSystems, totalBedrooms, totalBathrooms, total8in, total6in, totalDrops, tonsCounts };
}

function calcItemQty(item, totals) {
    const m = item.qty_multiplier || 0;
    let baseQty = 0;
    switch (item.calc_basis) {
        case 'per_system':     baseQty = totals.totalSystems * m; break;
        case 'per_bedroom':    baseQty = totals.totalBedrooms * m; break;
        case 'per_bathroom':   baseQty = totals.totalBathrooms * m; break;
        case 'per_8in_drop':   baseQty = totals.total8in * m; break;
        case 'per_6in_drop':   baseQty = totals.total6in * m; break;
        case 'per_total_drop': baseQty = totals.totalDrops * m; break;
        case 'by_tonnage':
            baseQty = (totals.tonsCounts[item.tons_match] || 0) * m;
            break;
        case 'fixed':          baseQty = m; break;
    }
    return baseQty;
}

function recalcAll() {
    const totals = getUnitTotals();
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

    // Update summary bar
    $('sumEnabled').textContent = enabledCount;
    $('sumRoughIn').textContent = fmtShort(phaseTotals['Rough-In'] || 0);
    $('sumTrimOut').textContent = fmtShort(phaseTotals['Trim Out'] || 0);
    $('sumEquipment').textContent = fmtShort(phaseTotals['Equipment'] || 0);
    $('sumStartup').textContent = fmtShort(phaseTotals['Startup/Other'] || 0);
    $('sumGrandTotal').textContent = fmt(grandTotal);

    // Update unit types totals row
    renderUnitTypesTotals(totals);

    // Update calculated fields in item rows
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
        // Dim disabled rows
        row.style.opacity = item.enabled ? '1' : '0.4';
    });

    // Update phase headers
    PHASES.forEach(phase => {
        const hdr = $(`phase-total-${phase.replace(/[^a-zA-Z]/g, '')}`);
        if (hdr) hdr.textContent = fmt(phaseTotals[phase] || 0);
    });
}

// ─── Render Unit Types ───────────────────────────────────────
function renderUnitTypes() {
    const tbody = $('unitTypesBody');
    if (!unitTypes.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No unit types. Click "+ Add Unit Type" to get started.</td></tr>';
        return;
    }
    tbody.innerHTML = unitTypes.map((ut, idx) => `
        <tr data-ut-id="${ut.id}">
            <td><input type="text" class="form-input ut-name" value="${(ut.name || '').replace(/"/g, '&quot;')}" style="min-width:140px;" onchange="updateUT(${idx},'name',this.value)"></td>
            <td><input type="number" class="form-input" value="${ut.unit_count}" min="0" style="width:50px;" onchange="updateUT(${idx},'unit_count',+this.value)"></td>
            <td><input type="number" class="form-input" value="${ut.bedrooms}" min="0" style="width:45px;" onchange="updateUT(${idx},'bedrooms',+this.value)"></td>
            <td><input type="number" class="form-input" value="${ut.bathrooms}" min="0" style="width:45px;" onchange="updateUT(${idx},'bathrooms',+this.value)"></td>
            <td><input type="number" class="form-input" value="${ut.drops_8in}" min="0" style="width:50px;" onchange="updateUT(${idx},'drops_8in',+this.value)"></td>
            <td><input type="number" class="form-input" value="${ut.drops_6in}" min="0" style="width:50px;" onchange="updateUT(${idx},'drops_6in',+this.value)"></td>
            <td><input type="number" class="form-input" value="${ut.stories}" min="1" style="width:45px;" onchange="updateUT(${idx},'stories',+this.value)"></td>
            <td><input type="number" class="form-input" value="${ut.tons}" min="0" step="0.5" style="width:50px;" onchange="updateUT(${idx},'tons',+this.value)"></td>
            <td><input type="number" class="form-input" value="${ut.cfm}" min="0" step="50" style="width:50px;" onchange="updateUT(${idx},'cfm',+this.value)"></td>
            <td><button class="btn btn-secondary btn-small" onclick="deleteUnitType(${idx})" style="color:#EF4444;padding:2px 6px;">&times;</button></td>
        </tr>
    `).join('');
}

function renderUnitTypesTotals(totals) {
    const tfoot = $('unitTypesTotals');
    if (!unitTypes.length) { tfoot.innerHTML = ''; return; }
    tfoot.innerHTML = `<tr style="font-weight:700;background:var(--gray-50);">
        <td>Totals</td>
        <td>${totals.totalSystems}</td>
        <td>${totals.totalBedrooms}</td>
        <td>${totals.totalBathrooms}</td>
        <td>${totals.total8in}</td>
        <td>${totals.total6in}</td>
        <td>-</td><td>-</td><td>-</td><td></td>
    </tr>`;
}

function updateUT(idx, field, value) {
    unitTypes[idx][field] = value;
    recalcAll();
}

const UNIT_TYPE_PRESETS = {
    studio:    { name: 'Studio',         bedrooms: 0, bathrooms: 1 },
    '1b1b':    { name: '1 Bed / 1 Bath', bedrooms: 1, bathrooms: 1 },
    '1b2b':    { name: '1 Bed / 2 Bath', bedrooms: 1, bathrooms: 2 },
    '2b1b':    { name: '2 Bed / 1 Bath', bedrooms: 2, bathrooms: 1 },
    '2b2b':    { name: '2 Bed / 2 Bath', bedrooms: 2, bathrooms: 2 },
    '2b3b':    { name: '2 Bed / 3 Bath', bedrooms: 2, bathrooms: 3 },
    '3b2b':    { name: '3 Bed / 2 Bath', bedrooms: 3, bathrooms: 2 },
    '3b3b':    { name: '3 Bed / 3 Bath', bedrooms: 3, bathrooms: 3 },
    '4b2b':    { name: '4 Bed / 2 Bath', bedrooms: 4, bathrooms: 2 },
    '4b3b':    { name: '4 Bed / 3 Bath', bedrooms: 4, bathrooms: 3 },
    corridor:  { name: 'Corridor',       bedrooms: 0, bathrooms: 0 },
    clubhouse: { name: 'Clubhouse',      bedrooms: 0, bathrooms: 0 },
    custom:    { name: 'Custom',         bedrooms: 1, bathrooms: 1 },
};

async function addPresetUnitType() {
    const sel = $('utPreset');
    const key = sel.value;
    if (!key) return;
    const preset = UNIT_TYPE_PRESETS[key] || UNIT_TYPE_PRESETS.custom;
    const ut = { name: preset.name, unit_count: 0, bedrooms: preset.bedrooms, bathrooms: preset.bathrooms, drops_8in: 0, drops_6in: 0, stories: 1, tons: 0, cfm: 0 };
    const res = await fetch(`/api/bids/${window.BID_ID}/takeoff/unit-types`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(ut)
    });
    const data = await res.json();
    ut.id = data.id;
    ut.sort_order = unitTypes.length;
    unitTypes.push(ut);
    renderUnitTypes();
    recalcAll();
    sel.value = '';
}

async function deleteUnitType(idx) {
    const ut = unitTypes[idx];
    if (!confirm(`Delete unit type "${ut.name}"?`)) return;
    await fetch(`/api/bids/${window.BID_ID}/takeoff/unit-types/${ut.id}`, { method: 'DELETE' });
    unitTypes.splice(idx, 1);
    renderUnitTypes();
    recalcAll();
}

// ─── Render Items ────────────────────────────────────────────
function renderItems() {
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
                            <th style="width:80px;">Unit $</th><th style="width:110px;">Calc Basis</th>
                            <th style="width:50px;">Mult</th><th style="width:55px;">Waste%</th>
                            ${phase === 'Equipment' ? '<th style="width:50px;">Tons</th>' : ''}
                            <th style="width:55px;">Calc Qty</th><th style="width:65px;">Order Qty</th>
                            <th style="width:80px;">Extended</th><th style="width:30px;"></th>
                        </tr></thead>
                        <tbody>
                            ${phaseItems.map(item => renderItemRow(item, phase)).join('')}
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

function renderItemRow(item, phase) {
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
        <td><select class="form-select" style="width:110px;font-size:11px;" onchange="updateItem(${item.id},'calc_basis',this.value)">${calcOpts}</select></td>
        <td><input type="number" class="form-input" value="${item.qty_multiplier}" min="0" step="0.25" style="width:50px;" onchange="updateItem(${item.id},'qty_multiplier',+this.value)"></td>
        <td><input type="number" class="form-input" value="${item.waste_pct}" min="0" step="1" style="width:55px;" onchange="updateItem(${item.id},'waste_pct',+this.value)"></td>
        ${showTons ? `<td><input type="number" class="form-input" value="${item.tons_match || ''}" min="0" step="0.5" style="width:50px;" onchange="updateItem(${item.id},'tons_match',this.value?+this.value:null)"></td>` : ''}
        <td class="calc-qty" style="text-align:right;font-weight:500;">0</td>
        <td><input type="number" class="form-input order-qty" value="0" min="0" step="1" style="width:65px;text-align:right;"
            onchange="overrideQty(${item.id}, this.value)" ondblclick="clearOverride(${item.id})"></td>
        <td class="extended" style="text-align:right;font-weight:600;">$0.00</td>
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
    const totals = getUnitTotals();
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
    const phase = prompt('Phase?\n1) Rough-In\n2) Trim Out\n3) Equipment\n4) Startup/Other', '1');
    const phaseMap = { '1': 'Rough-In', '2': 'Trim Out', '3': 'Equipment', '4': 'Startup/Other' };
    addItemToPhase(phaseMap[phase] || 'Rough-In');
}

async function addItemToPhase(phase) {
    const res = await fetch(`/api/bids/${window.BID_ID}/takeoff/items`, {
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
    await fetch(`/api/bids/${window.BID_ID}/takeoff/items/${id}`, { method: 'DELETE' });
    items = items.filter(i => i.id !== id);
    renderItems();
}

// ─── Calculate All ────────────────────────────────────────────
function calculateAll() {
    readConfigFromUI();
    applyConfigToItems();
    recalcAll();
    // Flash the summary bar to confirm
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
        // Save config + items + unit types
        await Promise.all([
            fetch(`/api/bids/${window.BID_ID}/takeoff/config`, {
                method: 'PUT', headers: {'Content-Type':'application/json'},
                body: JSON.stringify(config)
            }),
            fetch(`/api/bids/${window.BID_ID}/takeoff/items/bulk`, {
                method: 'PUT', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ unit_types: unitTypes, items: items })
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

    await fetch(`/api/bids/${window.BID_ID}/takeoff/push-to-bid`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ total: Math.round(grandTotal * 100) / 100 })
    });
    window._toastShown = true;
    alert(`Material subtotal updated to ${fmt(grandTotal)}`);
}

// ─── Start ───────────────────────────────────────────────────
init();
