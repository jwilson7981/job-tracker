/* ─── Shared Files ─── */
let currentParentId = null;

document.addEventListener('DOMContentLoaded', function() {
    loadFolder(null);
    setupDragDrop();

    // Enter key on modal inputs
    document.getElementById('folderName').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); this.closest('form').dispatchEvent(new Event('submit')); }
    });
    document.getElementById('renameName').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); this.closest('form').dispatchEvent(new Event('submit')); }
    });
});

function loadFolder(parentId) {
    currentParentId = parentId;
    const url = parentId ? `/api/shared-files?parent_id=${parentId}` : '/api/shared-files';
    fetch(url).then(r => r.json()).then(items => {
        renderTable(items);
    });
    // Load breadcrumbs
    if (parentId) {
        fetch(`/api/shared-files/${parentId}/breadcrumbs`).then(r => r.json()).then(renderBreadcrumbs);
    } else {
        renderBreadcrumbs([]);
    }
}

function navigateTo(id) {
    loadFolder(id);
}

function renderBreadcrumbs(path) {
    const el = document.getElementById('breadcrumbs');
    const title = document.getElementById('folderTitle');

    if (!path.length) {
        el.innerHTML = '<span class="breadcrumb-item active">Shared Files</span>';
        title.textContent = 'Shared Files';
        return;
    }

    let html = '<span class="breadcrumb-item" onclick="loadFolder(null)">Shared Files</span>';
    path.forEach((item, i) => {
        html += '<span class="breadcrumb-sep">/</span>';
        if (i === path.length - 1) {
            html += `<span class="breadcrumb-item active">${esc(item.name)}</span>`;
        } else {
            html += `<span class="breadcrumb-item" onclick="navigateTo(${item.id})">${esc(item.name)}</span>`;
        }
    });
    el.innerHTML = html;
    title.textContent = path[path.length - 1].name;
}

function renderTable(items) {
    const tbody = document.getElementById('filesBody');
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:40px;">This folder is empty</td></tr>';
        return;
    }
    tbody.innerHTML = items.map(item => {
        const icon = item.is_folder ? '&#128193;' : getFileIcon(item.mime_type, item.name);
        const name = item.is_folder
            ? `<span class="folder-link" onclick="navigateTo(${item.id})">${esc(item.name)}</span>`
            : esc(item.name);
        const size = item.is_folder ? '—' : formatSize(item.file_size);
        const date = item.created_at ? item.created_at.substring(0, 10) : '';
        const uploader = item.uploader_name || '';

        let actions = '';
        if (item.is_folder) {
            actions = `
                <button class="btn btn-secondary btn-small" onclick="showRename(${item.id},'${escAttr(item.name)}')" title="Rename">Rename</button>
                <button class="btn btn-danger btn-small" onclick="deleteItem(${item.id},'${escAttr(item.name)}',true)" title="Delete">Delete</button>`;
        } else {
            actions = `
                <button class="btn btn-secondary btn-small" onclick="previewFile(${item.id})" title="View">View</button>
                <button class="btn btn-secondary btn-small" onclick="downloadFile(${item.id})" title="Download">&#8615;</button>
                <button class="btn btn-secondary btn-small" onclick="showRename(${item.id},'${escAttr(item.name)}')" title="Rename">Rename</button>
                <button class="btn btn-danger btn-small" onclick="deleteItem(${item.id},'${escAttr(item.name)}',false)" title="Delete">Del</button>`;
        }

        return `<tr>
            <td class="file-icon">${icon}</td>
            <td>${name}</td>
            <td>${size}</td>
            <td>${esc(uploader)}</td>
            <td>${date}</td>
            <td>${actions}</td>
        </tr>`;
    }).join('');
}

/* ─── CRUD ─── */

function showNewFolderModal() {
    document.getElementById('folderName').value = '';
    document.getElementById('folderModal').style.display = 'flex';
    setTimeout(() => document.getElementById('folderName').focus(), 100);
}

function createFolder(e) {
    e.preventDefault();
    const name = document.getElementById('folderName').value.trim();
    if (!name) return;
    fetch('/api/shared-files/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parent_id: currentParentId })
    }).then(r => r.json()).then(data => {
        if (data.error) { alert(data.error); return; }
        document.getElementById('folderModal').style.display = 'none';
        loadFolder(currentParentId);
    });
}

function uploadFiles(files) {
    if (!files || !files.length) return;
    const fd = new FormData();
    for (let i = 0; i < files.length; i++) fd.append('files', files[i]);
    if (currentParentId) fd.append('parent_id', currentParentId);

    fetch('/api/shared-files/upload', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(data => {
            if (data.error) { alert(data.error); return; }
            loadFolder(currentParentId);
        });
    // Reset file input
    document.getElementById('fileInput').value = '';
}

function showRename(id, name) {
    document.getElementById('renameId').value = id;
    document.getElementById('renameName').value = name;
    document.getElementById('renameModal').style.display = 'flex';
    setTimeout(() => {
        const inp = document.getElementById('renameName');
        inp.focus();
        inp.select();
    }, 100);
}

function renameItem(e) {
    e.preventDefault();
    const id = document.getElementById('renameId').value;
    const name = document.getElementById('renameName').value.trim();
    if (!name) return;
    fetch(`/api/shared-files/${id}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    }).then(r => r.json()).then(data => {
        if (data.error) { alert(data.error); return; }
        document.getElementById('renameModal').style.display = 'none';
        loadFolder(currentParentId);
    });
}

function deleteItem(id, name, isFolder) {
    const msg = isFolder
        ? `Delete folder "${name}" and ALL its contents? This cannot be undone.`
        : `Delete "${name}"? This cannot be undone.`;
    if (!confirm(msg)) return;
    fetch(`/api/shared-files/${id}`, { method: 'DELETE' })
        .then(r => r.json())
        .then(data => {
            if (data.error) { alert(data.error); return; }
            loadFolder(currentParentId);
        });
}

function previewFile(id) {
    window.open(`/api/shared-files/${id}/download`, '_blank');
}

function downloadFile(id) {
    window.location.href = `/api/shared-files/${id}/download?download=1`;
}

/* ─── Drag and Drop ─── */

function setupDragDrop() {
    let dragCounter = 0;
    const zone = document.getElementById('dropZone');

    document.addEventListener('dragenter', function(e) {
        e.preventDefault();
        if (e.dataTransfer.types.includes('Files')) {
            dragCounter++;
            zone.style.display = 'flex';
        }
    });
    document.addEventListener('dragleave', function(e) {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            zone.style.display = 'none';
        }
    });
    document.addEventListener('dragover', function(e) {
        e.preventDefault();
    });
    document.addEventListener('drop', function(e) {
        e.preventDefault();
        dragCounter = 0;
        zone.style.display = 'none';
        if (e.dataTransfer.files.length) {
            uploadFiles(e.dataTransfer.files);
        }
    });
}

/* ─── Helpers ─── */

function getFileIcon(mime, name) {
    if (!mime) mime = '';
    if (!name) name = '';
    const ext = name.split('.').pop().toLowerCase();

    if (mime.startsWith('image/')) return '&#128444;';
    if (mime === 'application/pdf' || ext === 'pdf') return '&#128196;';
    if (mime.includes('spreadsheet') || mime.includes('excel') || ['xlsx','xls','csv'].includes(ext)) return '&#128202;';
    if (mime.includes('presentation') || mime.includes('powerpoint') || ['pptx','ppt'].includes(ext)) return '&#128202;';
    if (mime.includes('word') || mime.includes('document') || ['docx','doc'].includes(ext)) return '&#128196;';
    if (mime.includes('zip') || mime.includes('compressed') || ['zip','rar','7z','tar','gz'].includes(ext)) return '&#128230;';
    if (mime.includes('video/') || ['mp4','mov','avi','mkv'].includes(ext)) return '&#127909;';
    if (mime.includes('audio/') || ['mp3','wav','ogg','m4a'].includes(ext)) return '&#127925;';
    if (mime.startsWith('text/') || ['txt','log','json','xml','html','css','js'].includes(ext)) return '&#128221;';
    return '&#128196;';
}

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return size.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function escAttr(s) {
    return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
