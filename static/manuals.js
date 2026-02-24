/* Equipment Manuals JS */
let allManuals = [];

loadManuals();

async function loadManuals() {
    const q = document.getElementById('manualSearch')?.value || '';
    const mfg = document.getElementById('manualMfg')?.value || '';
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (mfg) params.set('manufacturer', mfg);
    const res = await fetch('/api/manuals?' + params.toString());
    allManuals = await res.json();
    renderManuals();
}

function renderManuals() {
    const tbody = document.getElementById('manualsBody');
    if (!allManuals.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No manuals found.</td></tr>';
        return;
    }
    const userRole = document.body.dataset.role || '';
    const canDelete = ['owner', 'project_manager'].includes(userRole);
    tbody.innerHTML = allManuals.map(m => `<tr>
        <td>${m.manufacturer}</td>
        <td>${m.model_number}</td>
        <td>${m.title || '-'}</td>
        <td>${m.manual_type || '-'}</td>
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

function showAddManual() {
    document.getElementById('mmModel').value = '';
    document.getElementById('mmTitle').value = '';
    document.getElementById('mmFile').value = '';
    document.getElementById('mmUrl').value = '';
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
    if (source === 'file') {
        const fd = new FormData();
        fd.append('manufacturer', document.getElementById('mmMfg').value);
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
                manufacturer: document.getElementById('mmMfg').value,
                model_number: document.getElementById('mmModel').value,
                title: document.getElementById('mmTitle').value,
                manual_type: document.getElementById('mmType').value,
                external_url: document.getElementById('mmUrl').value,
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
