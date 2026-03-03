/* Equipment Manuals JS */
let allManuals = [];

loadManuals();
loadFilterOptions();

async function loadFilterOptions() {
    try {
        const res = await fetch('/api/manuals/brands');
        const data = await res.json();

        // Populate brand dropdown
        const brandSel = document.getElementById('manualBrand');
        if (brandSel) {
            data.brands.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b;
                opt.textContent = b;
                brandSel.appendChild(opt);
            });
        }

        // Populate equipment type dropdown
        const typeSel = document.getElementById('manualType');
        if (typeSel) {
            data.equipment_types.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t;
                typeSel.appendChild(opt);
            });
        }

        // Populate manufacturer dropdown dynamically from existing data
        const mfgSel = document.getElementById('manualMfg');
        if (mfgSel) {
            // Get distinct manufacturers from the loaded manuals
            const mfgRes = await fetch('/api/manuals');
            const mfgData = await mfgRes.json();
            const manufacturers = [...new Set(mfgData.map(m => m.manufacturer).filter(Boolean))].sort();
            manufacturers.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                mfgSel.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Failed to load filter options:', e);
    }
}

async function loadManuals() {
    const q = document.getElementById('manualSearch')?.value || '';
    const mfg = document.getElementById('manualMfg')?.value || '';
    const brand = document.getElementById('manualBrand')?.value || '';
    const etype = document.getElementById('manualType')?.value || '';

    // Use enhanced search if brand or type filters are active
    if (brand || etype) {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (brand) params.set('brand', brand);
        if (etype) params.set('type', etype);
        const res = await fetch('/api/manuals/search?' + params.toString());
        let results = await res.json();
        // Also apply manufacturer filter client-side if set
        if (mfg) {
            results = results.filter(m => m.manufacturer === mfg);
        }
        allManuals = results;
    } else {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (mfg) params.set('manufacturer', mfg);
        const res = await fetch('/api/manuals?' + params.toString());
        allManuals = await res.json();
    }
    renderManuals();
}

function renderManuals() {
    const tbody = document.getElementById('manualsBody');
    if (!allManuals.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No manuals found.</td></tr>';
        return;
    }
    const userRole = document.body.dataset.role || '';
    const canDelete = ['owner', 'project_manager'].includes(userRole);
    tbody.innerHTML = allManuals.map(m => `<tr>
        <td>${esc(m.manufacturer)}</td>
        <td>${esc(m.model_number)}</td>
        <td>${esc(m.title || '-')}${m.tags ? `<div class="manual-tags">${m.tags.split(',').map(t => `<span class="tag-badge">${esc(t.trim())}</span>`).join('')}</div>` : ''}</td>
        <td>${esc(m.manual_type || '-')}</td>
        <td>${esc(m.equipment_type || '-')}</td>
        <td>${esc(m.tonnage || '-')}</td>
        <td>
            ${m.file_path
                ? `<a href="/api/manuals/${m.id}/file" target="_blank" class="btn btn-small btn-secondary">View PDF</a>`
                : m.external_url
                ? `<a href="${m.external_url}" target="_blank" class="btn btn-small btn-secondary">Open Link</a>`
                : '-'}
            ${canDelete ? `<button class="btn btn-small btn-danger" onclick="deleteManual(${m.id})" style="margin-left:4px;">Delete</button>` : ''}
        </td>
    </tr>`).join('');
}

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showAddManual() {
    document.getElementById('mmModel').value = '';
    document.getElementById('mmTitle').value = '';
    document.getElementById('mmFile').value = '';
    document.getElementById('mmUrl').value = '';
    document.getElementById('mmTonnage').value = '';
    document.getElementById('mmTags').value = '';
    document.getElementById('mmEquipType').value = '';
    document.getElementById('mmFuelType').value = '';
    document.getElementById('manualModal').style.display = 'flex';
}

function toggleManualSource() {
    const isFile = document.querySelector('input[name="mmSource"]:checked').value === 'file';
    document.getElementById('mmFileWrap').style.display = isFile ? '' : 'none';
    document.getElementById('mmUrlWrap').style.display = isFile ? 'none' : '';
}

async function saveManual(e) {
    e.preventDefault();
    const source = document.querySelector('input[name="mmSource"]:checked').value;
    const mfgVal = document.getElementById('mmMfg').value;
    if (source === 'file') {
        const fd = new FormData();
        fd.append('manufacturer', mfgVal);
        fd.append('model_number', document.getElementById('mmModel').value);
        fd.append('title', document.getElementById('mmTitle').value);
        fd.append('manual_type', document.getElementById('mmType').value);
        const file = document.getElementById('mmFile').files[0];
        if (file) fd.append('file', file);
        await fetch('/api/manuals', { method: 'POST', body: fd });
    } else {
        await fetch('/api/manuals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                manufacturer: mfgVal,
                model_number: document.getElementById('mmModel').value,
                title: document.getElementById('mmTitle').value,
                manual_type: document.getElementById('mmType').value,
                external_url: document.getElementById('mmUrl').value,
                brand: mfgVal,
                equipment_type: document.getElementById('mmEquipType').value,
                tonnage: document.getElementById('mmTonnage').value,
                fuel_type: document.getElementById('mmFuelType').value,
                tags: document.getElementById('mmTags').value,
            })
        });
    }
    document.getElementById('manualModal').style.display = 'none';
    loadManuals();
}

async function deleteManual(id) {
    if (!confirm('Delete this manual?')) return;
    await fetch('/api/manuals/' + id, { method: 'DELETE' });
    loadManuals();
}
