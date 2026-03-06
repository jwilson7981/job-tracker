/* Bid Material Takeoff — LGHVAC */
let unitTypes = [];
let items = [];
let config = {};
let _configLoaded = false;

const PHASES = ['Rough-In', 'Trim Out', 'Equipment', 'Startup/Other', 'Suggested Parts'];
const CALC_OPTIONS = [
    { value: 'per_system', label: 'Per System' },
    { value: 'per_bedroom', label: 'Per Bedroom' },
    { value: 'per_bathroom', label: 'Per Bathroom' },
    { value: 'per_8in_drop', label: 'Per 8" Drop' },
    { value: 'per_6in_drop', label: 'Per 6" Drop' },
    { value: 'per_total_drop', label: 'Per Total Drop' },
    { value: 'by_tonnage', label: 'By Tonnage' },
    { value: 'fixed', label: 'Fixed Qty' },
    { value: 'flex_6r6', label: '6" Flex R6' },
    { value: 'flex_6r8', label: '6" Flex R8' },
    { value: 'flex_8r6', label: '8" Flex R6' },
    { value: 'flex_8r8', label: '8" Flex R8' },
    { value: 'conductor_pipe', label: 'Conductor Pipe' },
    { value: 'adj_90', label: 'Adj 90 Formula' },
    { value: 'venthood_covers', label: 'Venthood Covers' },
    { value: 'per_venthood', label: 'Per Venthood' },
    { value: 'rails', label: 'Rails Formula' },
    { value: 'zip_ties', label: 'Zip Ties Formula' },
    { value: 'per_ductboard_config', label: 'Ductboard/Unit' },
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
    'cfgZoned', 'cfgDryerFireWrap', 'cfgBagsPerDrop', 'cfgDuctboardPerUnit'
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

// Auto-toggle items on/off based on config answers (matches Excel Use? column logic)
function applyConfigToItems() {
    if (!_configLoaded) return;
    // Read from DOM elements (getCfg) so defaults work even if config key was never saved
    const isCRD = getCfg('cfgCRD') === 'CRD';
    const isHP = getCfg('cfgBuildType') === 'Heat Pump';
    const isSidewall = getCfg('cfgExhaustType') === 'Side Wall';
    const isCeiling = getCfg('cfgExhaustType') === 'Ceiling';
    const isVertical = getCfg('cfgOrientation') === 'Vertical';
    const isHorizontal = getCfg('cfgOrientation') === 'Horizontal';
    const activeTons = new Set(unitTypes.filter(ut => ut.unit_count > 0 && ut.tons > 0).map(ut => ut.tons));

    items.forEach(item => {
        const name = (item.part_name || '').toLowerCase();
        const cat = (item.category || '').toLowerCase();
        const sku = (item.sku || '').toLowerCase();

        // ── CRD items: on when CRD ──
        if (name.includes('12x14 crd') || name.includes('crd boot') || name.includes('8x6 reducer')) {
            item.enabled = isCRD ? 1 : 0;
        }
        // ── 80CFM CRD/Exhaust Fan: CRD + Ceiling exhaust ──
        if (name.includes('80cfm') || sku === 'qtxeg080') {
            item.enabled = (isCRD && isCeiling) ? 1 : 0;
        }
        // ── 4" Round CRD: Outside Air + CRD ──
        if (name.includes('round crd')) {
            item.enabled = (getCfg('cfgOutsideAir') === 'Yes' && isCRD) ? 1 : 0;
        }
        // ── Broan 688: Non-CRD or Sidewall exhaust ──
        if (name.includes('broan 688') || sku === '688') {
            item.enabled = (!isCRD || isSidewall) ? 1 : 0;
        }
        // ── 8" Foam Boot: Non-CRD only ──
        if (name === '8" foam boot') {
            item.enabled = !isCRD ? 1 : 0;
        }
        // ── 6" Foam Boot: Non-CRD only ──
        if (name === '6" foam boot') {
            item.enabled = !isCRD ? 1 : 0;
        }
        // ── Sidewall-only items: 3" Adj 90, 3" Conductor Pipe, 4x3 Reducer ──
        if (name.includes('3" adjustable 90') || name.includes('3" conductor pipe')) {
            item.enabled = isSidewall ? 1 : 0;
        }
        if (name === '4x3 reducer') {
            item.enabled = (!isCRD || isSidewall) ? 1 : 0;
        }
        // ── Ductboard items: on/off ──
        if (name.includes('duct board') || name.includes('boca plate')) {
            item.enabled = getCfg('cfgDuctboard') === 'Yes' ? 1 : 0;
        }
        // ── Hanging Duct Strap: on when ductboard ──
        if (name.includes('hanging duct strap') || (sku === 'm0069')) {
            item.enabled = getCfg('cfgDuctboard') === 'Yes' ? 1 : 0;
        }
        // ── Drain Pans: depends on orientation + config ──
        if (name.includes('30x30 drain pan')) {
            item.enabled = (isVertical && getCfg('cfgDrainPan') === 'Yes') ? 1 : 0;
        }
        if (name.includes('30x60 drain pan')) {
            item.enabled = (isHorizontal && getCfg('cfgDrainPan') === 'Yes') ? 1 : 0;
        }
        // ── 6" Pump Ups: Horizontal only ──
        if (name.includes('6" pump ups')) {
            item.enabled = isHorizontal ? 1 : 0;
        }
        // ── Mini Split items: on/off ──
        if (cat === 'mini split' || name.includes('mini split line set') || name.includes('14/4')) {
            item.enabled = getCfg('cfgMiniSplits') === 'Yes' ? 1 : 0;
        }
        // ── Pass-throughs ──
        if (name.includes('pass through')) {
            item.enabled = getCfg('cfgPassThroughs') === 'Yes' ? 1 : 0;
        }
        // ── Dryer Fire Wrap: separate config ──
        if (name.includes('fire wrap') || sku === 'sa') {
            item.enabled = getCfg('cfgDryerFireWrap') === 'Yes' ? 1 : 0;
        }
        // ── Wrapping items: Duct Wrap, Tie Wire ──
        if (name.includes('duct wrap') || name === 'tie wire') {
            item.enabled = getCfg('cfgWrapping') === 'Yes' ? 1 : 0;
        }
        // ── Silver Locking Caps: Ground condenser only ──
        if (name.includes('locking caps')) {
            item.enabled = getCfg('cfgCondenserLoc') === 'Ground' ? 1 : 0;
        }
        // ── Two Story Zone: Zoned only ──
        if (name.includes('two story zone')) {
            item.enabled = getCfg('cfgZoned') === 'Yes' ? 1 : 0;
        }
        // ── Build type: Condensers vs Heat Pumps ──
        if (cat === 'condensers') {
            item.enabled = !isHP ? 1 : 0;
        }
        if (cat === 'heat pumps') {
            item.enabled = isHP ? 1 : 0;
        }
        // ── Thermostats: HP Thermostat vs Programmable ──
        if (name.includes('heat pump thermostat')) {
            item.enabled = isHP ? 1 : 0;
        }
        if (name.includes('programmable thermostat')) {
            item.enabled = !isHP ? 1 : 0;
        }
        // ── CRD vs Non-CRD Supply Registers ──
        if (name.includes('stamped supply')) {
            item.enabled = isCRD ? 1 : 0;
        }
        if (name === '8" supply register') {
            item.enabled = !isCRD ? 1 : 0;
        }
        if (name === '6" supply register') {
            item.enabled = !isCRD ? 1 : 0;
        }
        // ── Equipment: auto-disable if tons_match not in active unit types ──
        if (item.phase === 'Equipment' && item.tons_match != null && !activeTons.has(item.tons_match)) {
            item.enabled = 0;
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
function getCfg(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function getUnitTotals() {
    let totalSystems = 0, totalBedrooms = 0, totalBathrooms = 0;
    let total8in = 0, total6in = 0, totalDrops = 0;
    const tonsCounts = {}; // tons_value -> count of units
    // Flex bag totals — story-based R6/R8 split per Excel formula
    let flex6r6 = 0, flex6r8 = 0, flex8r6 = 0, flex8r8 = 0;
    const bagsPerDrop = parseFloat(getCfg('cfgBagsPerDrop')) || 0.75;

    unitTypes.forEach(ut => {
        const count = ut.unit_count || 0;
        const stories = ut.stories || 1;
        const d8 = (ut.drops_8in || 0) * count;
        const d6 = (ut.drops_6in || 0) * count;

        totalSystems += count;
        totalBedrooms += count * (ut.bedrooms || 0);
        totalBathrooms += count * (ut.bathrooms || 0);
        total8in += d8;
        total6in += d6;
        totalDrops += d8 + d6;
        if (ut.tons > 0) {
            tonsCounts[ut.tons] = (tonsCounts[ut.tons] || 0) + count;
        }

        // Flex bags: split between R6 and R8 based on # of stories
        // 1-story=100% R8, 2=50/50, 3=67/33, 4=75/25, 5=80/20, 6+=84/16
        // All floors use bags_per_drop factor. Top floor(s) get R8, lower floors get R6.
        {
            const r6pct = stories <= 1 ? 0 : stories === 2 ? 0.5 : stories === 3 ? 0.67 : stories === 4 ? 0.75 : stories === 5 ? 0.8 : 0.84;
            const r8pct = 1 - r6pct;
            flex6r6 += d6 * bagsPerDrop * r6pct;
            flex6r8 += d6 * bagsPerDrop * r8pct;
            flex8r6 += d8 * bagsPerDrop * r6pct;
            flex8r8 += d8 * bagsPerDrop * r8pct;
        }
    });

    return { totalSystems, totalBedrooms, totalBathrooms, total8in, total6in, totalDrops, tonsCounts,
             flex6r6, flex6r8, flex8r6, flex8r8 };
}

// Compute intermediate values for inter-item dependency formulas
function getIntermediates(totals) {
    const isCRD = getCfg('cfgCRD') === 'CRD';
    const isCeiling = getCfg('cfgExhaustType') === 'Ceiling';
    const isSidewall = getCfg('cfgExhaustType') === 'Side Wall';
    const hasOutsideAir = getCfg('cfgOutsideAir') === 'Yes';

    // Exhaust fan counts (per Excel logic)
    const broan688 = (!isCRD || isSidewall) ? totals.totalBathrooms : 0;
    const crdFan = (isCRD && isCeiling) ? totals.totalBathrooms : 0;
    const roundCRD = (hasOutsideAir && isCRD) ? totals.totalSystems : 0;
    const dryerBox = totals.totalSystems; // always 1 per system

    // Boot counts
    const crdBoots = isCRD ? totals.totalDrops : 0;
    const foamBoots8 = !isCRD ? totals.total8in : 0;
    const foamBoots6 = !isCRD ? totals.total6in : 0;
    const totalBoots = crdBoots + foamBoots8 + foamBoots6;

    // Venthood = exhaust fans + CRD fans + dryer boxes
    const venthoodCovers = broan688 + crdFan + dryerBox;

    return { broan688, crdFan, roundCRD, dryerBox, crdBoots, foamBoots8, foamBoots6, totalBoots, venthoodCovers };
}

function getTonsHeatKitMap() {
    const map = {};
    unitTypes.forEach(ut => {
        if (ut.tons > 0 && ut.heat_kit) map[ut.tons] = ut.heat_kit;
    });
    return map;
}

function calcItemQty(item, totals, inter) {
    const m = item.qty_multiplier || 0;
    const ductboardPerUnit = parseFloat(getCfg('cfgDuctboardPerUnit')) || 2;
    switch (item.calc_basis) {
        case 'per_system':     return totals.totalSystems * m;
        case 'per_bedroom':    return totals.totalBedrooms * m;
        case 'per_bathroom':   return totals.totalBathrooms * m;
        case 'per_8in_drop':   return totals.total8in * m;
        case 'per_6in_drop':   return totals.total6in * m;
        case 'per_total_drop': return totals.totalDrops * m;
        case 'by_tonnage':     return (totals.tonsCounts[item.tons_match] || 0) * m;
        case 'fixed':          return m;
        // ── Flex bags (story-based R6/R8 split from Excel) ──
        case 'flex_6r6':       return totals.flex6r6 || 0;
        case 'flex_6r8':       return totals.flex6r8 || 0;
        case 'flex_8r6':       return totals.flex8r6 || 0;
        case 'flex_8r8':       return totals.flex8r8 || 0;
        // ── 4" Conductor Pipe: (CRD fans × 35) + (dryer boxes × 25) + (round CRDs × 25) ──
        case 'conductor_pipe': return inter ? (inter.crdFan * 35) + (inter.dryerBox * 25) + (inter.roundCRD * 25) : 0;
        // ── 4" Adj 90: (dryer + round CRD + CRD fan) × multiplier ──
        case 'adj_90':         return inter ? (inter.dryerBox + inter.roundCRD + inter.crdFan) * m : 0;
        // ── Venthood Covers: exhaust fans + CRD fans + dryer boxes ──
        case 'venthood_covers': return inter ? inter.venthoodCovers : 0;
        // ── Items that depend on venthood count ──
        case 'per_venthood':   return inter ? inter.venthoodCovers * m : 0;
        // ── Rails: (CRD boots + 8" foam boots + 6" foam boots × 2) × 2 ──
        case 'rails':          return inter ? (inter.crdBoots + inter.foamBoots8 + inter.foamBoots6 * 2) * 2 : 0;
        // ── Zip Ties: total boots × 4 ──
        case 'zip_ties':       return inter ? inter.totalBoots * 4 : 0;
        // ── Ductboard: per system × config ductboard_per_unit ──
        case 'per_ductboard_config': return totals.totalSystems * ductboardPerUnit;
        default:               return 0;
    }
}

function recalcAll() {
    const totals = getUnitTotals();
    const inter = getIntermediates(totals);
    const phaseTotals = {};
    let enabledCount = 0;
    let grandTotal = 0;

    items.forEach(item => {
        const baseQty = calcItemQty(item, totals, inter);
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
    const sugEl = $('sumSuggested');
    if (sugEl) sugEl.textContent = fmtShort(phaseTotals['Suggested Parts'] || 0);
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
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No unit types. Click "+ Add Unit Type" to get started.</td></tr>';
        return;
    }
    tbody.innerHTML = unitTypes.map((ut, idx) => `
        <tr data-ut-id="${ut.id}">
            <td><input type="text" class="form-input ut-name" value="${(ut.name || '').replace(/"/g, '&quot;')}" style="min-width:160px;" onchange="updateUT(${idx},'name',this.value)"></td>
            <td><input type="number" class="form-input" value="${ut.unit_count}" min="0" style="width:65px;text-align:center;" onchange="updateUT(${idx},'unit_count',+this.value)"></td>
            <td><input type="number" class="form-input" value="${ut.bedrooms}" min="0" style="width:60px;text-align:center;" onchange="updateUT(${idx},'bedrooms',+this.value)"></td>
            <td><input type="number" class="form-input" value="${ut.bathrooms}" min="0" style="width:60px;text-align:center;" onchange="updateUT(${idx},'bathrooms',+this.value)"></td>
            <td><input type="number" class="form-input" value="${ut.drops_8in}" min="0" style="width:65px;text-align:center;" onchange="updateUT(${idx},'drops_8in',+this.value)"></td>
            <td><input type="number" class="form-input" value="${ut.drops_6in}" min="0" style="width:65px;text-align:center;" onchange="updateUT(${idx},'drops_6in',+this.value)"></td>
            <td><input type="number" class="form-input" value="${ut.stories}" min="1" style="width:60px;text-align:center;" onchange="updateUT(${idx},'stories',+this.value)"></td>
            <td><input type="number" class="form-input" value="${ut.tons}" min="0" step="0.5" style="width:65px;text-align:center;" onchange="updateUT(${idx},'tons',+this.value)"></td>
            <td><select class="form-select" style="width:70px;font-size:11px;" onchange="updateUT(${idx},'heat_kit',this.value)">
                <option value=""${(ut.heat_kit||'')=== '' ? ' selected':''}></option>
                <option value="5kw"${(ut.heat_kit||'')==='5kw' ? ' selected':''}>5kw</option>
                <option value="7.5kw"${(ut.heat_kit||'')==='7.5kw' ? ' selected':''}>7.5kw</option>
                <option value="10kw"${(ut.heat_kit||'')==='10kw' ? ' selected':''}>10kw</option>
                <option value="15kw"${(ut.heat_kit||'')==='15kw' ? ' selected':''}>15kw</option>
                <option value="20kw"${(ut.heat_kit||'')==='20kw' ? ' selected':''}>20kw</option>
            </select></td>
            <td><button class="btn btn-secondary btn-small" onclick="deleteUnitType(${idx})" style="color:#EF4444;padding:2px 6px;">&times;</button></td>
        </tr>
    `).join('');
}

function renderUnitTypesTotals(totals) {
    const tfoot = $('unitTypesTotals');
    if (!unitTypes.length) { tfoot.innerHTML = ''; return; }
    tfoot.innerHTML = `<tr style="font-weight:700;background:var(--gray-50);">
        <td>Totals</td>
        <td style="text-align:center;">${totals.totalSystems}</td>
        <td style="text-align:center;">${totals.totalBedrooms}</td>
        <td style="text-align:center;">${totals.totalBathrooms}</td>
        <td style="text-align:center;">${totals.total8in}</td>
        <td style="text-align:center;">${totals.total6in}</td>
        <td>-</td><td>-</td><td></td><td></td>
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
    const ut = { name: preset.name, unit_count: 0, bedrooms: preset.bedrooms, bathrooms: preset.bathrooms, drops_8in: 0, drops_6in: 0, stories: 1, tons: 0, heat_kit: '' };
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
    const totals = getUnitTotals();
    const inter = getIntermediates(totals);
    const heatKitMap = getTonsHeatKitMap();
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
                            <th style="width:70px;">Mult</th><th style="width:75px;">Waste%</th>
                            ${phase === 'Equipment' ? '<th style="width:55px;">Tons</th>' : ''}
                            <th style="width:70px;">Calc Qty</th><th style="width:85px;">Order Qty</th>
                            <th style="width:80px;">Extended</th><th style="width:30px;"></th>
                        </tr></thead>
                        <tbody>
                            ${phaseItems.map(item => renderItemRow(item, phase, totals, inter, heatKitMap)).join('')}
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

function renderItemRow(item, phase, totals, inter, heatKitMap) {
    const calcQty = (totals && inter) ? calcItemQty(item, totals, inter) : 0;
    const wasteMult = 1 + (item.waste_pct || 0) / 100;
    const orderQty = item.qty_override != null ? item.qty_override : Math.ceil(calcQty * wasteMult);
    const extended = item.enabled ? orderQty * (item.unit_price || 0) : 0;
    const calcOpts = CALC_OPTIONS.map(o =>
        `<option value="${o.value}" ${item.calc_basis === o.value ? 'selected' : ''}>${o.label}</option>`
    ).join('');
    const showTons = phase === 'Equipment';
    const hkCat = (item.category || '').toLowerCase();
    const isAHU = showTons && hkCat !== 'condensers' && hkCat !== 'heat pumps';
    const hkLabel = (isAHU && item.tons_match != null && heatKitMap && heatKitMap[item.tons_match]) ? heatKitMap[item.tons_match].toUpperCase() : '';
    return `<tr data-item-id="${item.id}" style="opacity:${item.enabled ? 1 : 0.4};">
        <td><input type="checkbox" ${item.enabled ? 'checked' : ''} onchange="toggleItem(${item.id}, this.checked)" title="Enable/disable"></td>
        <td><input type="text" class="form-input" value="${(item.part_name || '').replace(/"/g, '&quot;')}" style="min-width:120px;" onchange="updateItem(${item.id},'part_name',this.value)">${hkLabel ? ` <span style="font-size:10px;color:#7C3AED;font-weight:600;">${hkLabel}</span>` : ''}</td>
        <td><input type="text" class="form-input" value="${(item.sku || '').replace(/"/g, '&quot;')}" style="width:80px;" onchange="updateItem(${item.id},'sku',this.value)"></td>
        <td><input type="text" class="form-input" value="${(item.category || '').replace(/"/g, '&quot;')}" style="width:90px;" onchange="updateItem(${item.id},'category',this.value)"></td>
        <td><input type="number" class="form-input" value="${item.unit_price}" min="0" step="0.01" style="width:80px;" onchange="updateItem(${item.id},'unit_price',+this.value)"></td>
        <td><select class="form-select" style="width:110px;font-size:11px;" onchange="updateItem(${item.id},'calc_basis',this.value)">${calcOpts}</select></td>
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
    const totals = getUnitTotals();
    const inter = getIntermediates(totals);
    const baseQty = calcItemQty(item, totals, inter);
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

// ─── Reset to Defaults ────────────────────────────────────────
async function resetToDefaults() {
    if (!confirm('This will DELETE all current takeoff items and replace them with the latest defaults (correct SKUs, prices, and formulas from the master template).\n\nYour unit types and config will be kept.\n\nContinue?')) return;
    try {
        const res = await fetch(`/api/bids/${window.BID_ID}/takeoff/reset-defaults`, { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
            const itRes = await fetch(`/api/bids/${window.BID_ID}/takeoff/items`);
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

// ─── PDF / Print / Email ──────────────────────────────────────

function buildPDFPayload() {
    const totals = getUnitTotals();
    const inter = getIntermediates(totals);
    const heatKitMap = getTonsHeatKitMap();
    const phases = {};
    const phaseTotals = {};
    let grandTotal = 0;

    PHASES.forEach(phase => {
        const phaseItems = items.filter(i => i.phase === phase && i.enabled);
        if (!phaseItems.length) return;
        let phaseTotal = 0;
        phases[phase] = phaseItems.map(item => {
            const calcQty = calcItemQty(item, totals, inter);
            const wasteMult = 1 + (item.waste_pct || 0) / 100;
            const orderQty = item.qty_override != null ? item.qty_override : Math.ceil(calcQty * wasteMult);
            const extended = orderQty * (item.unit_price || 0);
            phaseTotal += extended;
            const pdfCat = (item.category || '').toLowerCase();
            const hk = (phase === 'Equipment' && pdfCat !== 'condensers' && pdfCat !== 'heat pumps' && item.tons_match != null && heatKitMap[item.tons_match]) ? ' - ' + heatKitMap[item.tons_match].toUpperCase() : '';
            return {
                part_name: item.part_name + hk, sku: item.sku || '', category: item.category || '',
                unit_price: item.unit_price || 0, _calc_qty: Math.round(calcQty * 100) / 100,
                waste_pct: item.waste_pct || 0, _order_qty: orderQty, _extended: Math.round(extended * 100) / 100
            };
        });
        phaseTotals[phase] = Math.round(phaseTotal * 100) / 100;
        grandTotal += phaseTotal;
    });

    return { phases, phase_totals: phaseTotals, grand_total: Math.round(grandTotal * 100) / 100 };
}

async function generateTakeoffPDF() {
    await saveAllItems();
    const payload = buildPDFPayload();
    const res = await fetch(`/api/bids/${window.BID_ID}/takeoff/generate-pdf`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok && data.path) {
        window.open(data.path, '_blank');
    } else {
        alert('PDF generation failed: ' + (data.error || 'Unknown error'));
    }
}

function printTakeoff() {
    window.print();
}

function showEmailTakeoff() {
    document.getElementById('emailTakeoffModal').style.display = 'flex';
}

async function sendTakeoffEmail() {
    const recipients = document.getElementById('takeoffEmailTo').value.split(',').map(e => e.trim()).filter(Boolean);
    const subject = document.getElementById('takeoffEmailSubject').value;
    const body = document.getElementById('takeoffEmailBody').value;

    if (!recipients.length) { alert('Enter at least one email address.'); return; }

    // Generate PDF first if needed
    await saveAllItems();
    const payload = buildPDFPayload();
    const pdfRes = await fetch(`/api/bids/${window.BID_ID}/takeoff/generate-pdf`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
    });
    const pdfData = await pdfRes.json();
    if (!pdfData.ok) { alert('PDF generation failed: ' + (pdfData.error || 'Unknown')); return; }

    const res = await fetch(`/api/bids/${window.BID_ID}/takeoff/email`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ recipients, subject, body })
    });
    const data = await res.json();
    if (data.ok) {
        document.getElementById('emailTakeoffModal').style.display = 'none';
        alert('Takeoff emailed to: ' + data.sent_to.join(', '));
    } else {
        alert('Email failed: ' + (data.error || 'Unknown error'));
    }
}

// ─── Start ───────────────────────────────────────────────────
init();
