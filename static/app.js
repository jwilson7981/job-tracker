/* ─── Notification Polling ──────────────────────────────────── */
(function() {
    async function pollNotifications() {
        try {
            const res = await fetch('/api/notifications/unread-count');
            if (!res.ok) return;
            const data = await res.json();
            const badge = document.getElementById('notifBadge');
            if (badge) {
                if (data.count > 0) {
                    badge.textContent = data.count > 99 ? '99+' : data.count;
                    badge.style.display = 'flex';
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (e) { /* ignore */ }
    }

    // Poll every 60 seconds, plus on page load
    if (document.getElementById('notifBadge')) {
        pollNotifications();
        setInterval(pollNotifications, 60000);
    }
})();

async function toggleNotifPanel(e) {
    if (e) e.stopPropagation();
    const panel = document.getElementById('notifPanel');
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        await loadNotifications();
    } else {
        panel.style.display = 'none';
    }
}

async function loadNotifications() {
    try {
        const res = await fetch('/api/notifications');
        const notifs = await res.json();
        const list = document.getElementById('notifList');
        if (!notifs.length) {
            list.innerHTML = '<p class="text-muted" style="padding:12px;text-align:center;">No notifications</p>';
            return;
        }
        list.innerHTML = notifs.map(n => `
            <div class="notif-item ${n.is_read ? 'read' : 'unread'}" onclick="clickNotif(${n.id}, '${(n.link || '').replace(/'/g, "\\'")}')">
                <div class="notif-title">${escapeHtml(n.title)}</div>
                <div class="notif-message">${escapeHtml(n.message || '')}</div>
                <div class="notif-time">${n.created_at}</div>
            </div>
        `).join('');
    } catch (e) { /* ignore */ }
}

async function clickNotif(id, link) {
    await fetch(`/api/notifications/${id}/read`, { method: 'PUT' });
    if (link) window.location.href = link;
    else await loadNotifications();
}

async function markAllNotifRead() {
    await fetch('/api/notifications/mark-all-read', { method: 'POST' });
    await loadNotifications();
    const badge = document.getElementById('notifBadge');
    if (badge) badge.style.display = 'none';
}

// Close notif panel on outside click
document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifPanel');
    const bell = document.querySelector('.notif-bell-wrapper');
    if (panel && bell && !panel.contains(e.target) && !bell.contains(e.target)) {
        panel.style.display = 'none';
    }
});

/* ─── Global State ──────────────────────────────────────────── */
let jobId = null;
let jobData = null;
let hasUnsavedChanges = false;
let currentTab = 'master';

/* ─── Init ──────────────────────────────────────────────────── */
function initJobView(id) {
    jobId = id;
    setupTabs();
    setupTitleEditing();
    setupStatusChange();
    setupBeforeUnload();
    loadJobData();
}

/* ─── Tab Switching ─────────────────────────────────────────── */
function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

/* ─── Title Editing ─────────────────────────────────────────── */
function setupTitleEditing() {
    const title = document.getElementById('jobName');
    if (!title) return;

    title.addEventListener('click', () => {
        title.contentEditable = 'true';
        title.focus();
    });

    title.addEventListener('blur', async () => {
        title.contentEditable = 'false';
        const newName = title.textContent.trim();
        if (newName && newName !== jobData?.job?.name) {
            await fetch(`/api/job/${jobId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
        }
    });

    title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
    });
}

/* ─── Status Change ─────────────────────────────────────────── */
function setupStatusChange() {
    const select = document.getElementById('jobStatus');
    if (!select) return;
    select.addEventListener('change', async () => {
        await fetch(`/api/job/${jobId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: select.value })
        });
    });
}

/* ─── Unsaved Changes Warning ───────────────────────────────── */
function setupBeforeUnload() {
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

function markUnsaved() {
    hasUnsavedChanges = true;
    const status = document.getElementById('saveStatus');
    if (status) {
        status.textContent = 'Unsaved changes';
        status.className = 'save-status unsaved';
    }
}

function markSaved() {
    hasUnsavedChanges = false;
    const status = document.getElementById('saveStatus');
    if (status) {
        status.textContent = 'All changes saved';
        status.className = 'save-status saved';
        setTimeout(() => {
            if (!hasUnsavedChanges) status.textContent = '';
        }, 3000);
    }
}

function markSaving() {
    const status = document.getElementById('saveStatus');
    if (status) {
        status.textContent = 'Saving...';
        status.className = 'save-status saving';
    }
}

/* ─── Load Job Data ─────────────────────────────────────────── */
async function loadJobData() {
    const res = await fetch(`/api/job/${jobId}`);
    jobData = await res.json();
    renderMasterList();
    renderEntryTab('received');
    renderEntryTab('shipped');
    renderEntryTab('invoiced');
    renderCostSummary();
    hasUnsavedChanges = false;
}

/* ─── Master List Rendering ─────────────────────────────────── */
function renderMasterList() {
    const tbody = document.getElementById('masterBody');
    tbody.innerHTML = '';

    if (!jobData.line_items.length) {
        addMasterRow();
        return;
    }

    jobData.line_items.forEach(item => {
        addMasterRowWithData(item);
    });
}

function addMasterRow() {
    const tbody = document.getElementById('masterBody');
    const nextLine = tbody.children.length + 1;
    addMasterRowWithData({
        id: null,
        line_number: nextLine,
        stock_ns: '',
        sku: '',
        description: '',
        quote_qty: 0,
        qty_ordered: 0,
        price_per: 0,
        total_net_price: 0,
        total_received: 0,
        total_shipped: 0,
        total_invoiced: 0,
    });
    markUnsaved();
}

function addMasterRowWithData(item) {
    const tbody = document.getElementById('masterBody');
    const tr = document.createElement('tr');
    tr.dataset.itemId = item.id || '';

    tr.innerHTML = `
        <td class="cell-editable">
            <input type="number" class="input-line-number" value="${item.line_number}" min="1" step="1">
        </td>
        <td class="cell-editable">
            <select class="input-stock-ns">
                <option value="" ${!item.stock_ns ? 'selected' : ''}></option>
                <option value="Stock" ${item.stock_ns === 'Stock' ? 'selected' : ''}>Stock</option>
                <option value="NS" ${item.stock_ns === 'NS' ? 'selected' : ''}>NS</option>
            </select>
        </td>
        <td class="cell-editable">
            <input type="text" class="input-sku" value="${escapeAttr(item.sku)}">
        </td>
        <td class="cell-editable">
            <input type="text" class="input-description" value="${escapeAttr(item.description)}">
        </td>
        <td class="cell-editable">
            <input type="number" class="input-quote-qty" value="${item.quote_qty || ''}" min="0" step="any">
        </td>
        <td class="cell-editable">
            <input type="number" class="input-qty-ordered" value="${item.qty_ordered || ''}" min="0" step="any">
        </td>
        <td class="cell-editable">
            <input type="number" class="input-price-per" value="${item.price_per || ''}" min="0" step="any">
        </td>
        <td class="cell-computed total-net-price">${formatMoney(item.total_net_price)}</td>
        <td class="cell-summary total-received">${item.total_received || 0}</td>
        <td class="cell-summary total-shipped">${item.total_shipped || 0}</td>
        <td class="cell-summary total-invoiced">${item.total_invoiced || 0}</td>
        <td class="cell-editable" style="background:transparent;text-align:center;">
            <button class="btn-delete-row" onclick="deleteMasterRow(this)" title="Remove line item">&times;</button>
        </td>
    `;

    // Wire up live calculation
    const qtyInput = tr.querySelector('.input-qty-ordered');
    const priceInput = tr.querySelector('.input-price-per');
    const calcTotal = () => {
        const qty = parseFloat(qtyInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;
        tr.querySelector('.total-net-price').textContent = formatMoney(qty * price);
    };
    qtyInput.addEventListener('input', () => { calcTotal(); markUnsaved(); });
    priceInput.addEventListener('input', () => { calcTotal(); markUnsaved(); });

    // Mark unsaved on any edit
    tr.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', markUnsaved);
    });

    tbody.appendChild(tr);
}

function deleteMasterRow(btn) {
    const tr = btn.closest('tr');
    const tbody = tr.parentElement;
    if (tbody.children.length <= 1) {
        alert('Cannot delete the last row.');
        return;
    }
    tr.remove();
    markUnsaved();
}

/* ─── Entry Tab Rendering (Received / Shipped / Invoiced) ──── */
function renderEntryTab(tabType) {
    const headEl = document.getElementById(`${tabType}Head`);
    const bodyEl = document.getElementById(`${tabType}Body`);
    const entryKey = `${tabType}_entries`;

    // Determine which columns have dates (from any row)
    const dateHeaders = {};
    jobData.line_items.forEach(item => {
        const entries = item[entryKey] || {};
        for (const [col, entry] of Object.entries(entries)) {
            if (entry.entry_date && !dateHeaders[col]) {
                dateHeaders[col] = entry.entry_date;
            }
        }
    });

    // Build header
    let headerHtml = '<tr>';
    headerHtml += '<th class="col-line">Line #</th>';
    headerHtml += '<th class="col-desc">Description</th>';
    headerHtml += '<th class="col-num">Total Ordered</th>';
    headerHtml += '<th class="col-num">Total</th>';
    for (let c = 1; c <= 15; c++) {
        const label = dateHeaders[String(c)] || `Col ${c}`;
        headerHtml += `<th>${label}</th>`;
    }
    headerHtml += '</tr>';
    headEl.innerHTML = headerHtml;

    // Build rows
    bodyEl.innerHTML = '';
    jobData.line_items.forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.itemId = item.id;

        const entries = item[entryKey] || {};
        let totalEntries = 0;
        for (let c = 1; c <= 15; c++) {
            totalEntries += (entries[String(c)]?.quantity || 0);
        }

        // Determine conditional formatting for total cell
        const ordered = item.qty_ordered || 0;
        let totalClass = 'cell-total-none';
        if (ordered > 0 && totalEntries >= ordered) {
            totalClass = 'cell-total-green';
        } else if (totalEntries > 0) {
            totalClass = 'cell-total-amber';
        }

        let html = '';
        html += `<td class="cell-readonly" style="text-align:center;">${item.line_number}</td>`;
        html += `<td class="cell-readonly">${escapeHtml(item.description)}</td>`;
        html += `<td class="cell-readonly" style="text-align:right;">${item.qty_ordered || 0}</td>`;
        html += `<td class="cell-computed entry-total ${totalClass}" style="text-align:right;">${totalEntries}</td>`;

        for (let c = 1; c <= 15; c++) {
            const qty = entries[String(c)]?.quantity || '';
            html += `<td class="cell-entry"><input type="number" min="0" step="any" data-col="${c}" value="${qty || ''}"></td>`;
        }

        tr.innerHTML = html;

        // Wire up live total calculation
        tr.querySelectorAll('.cell-entry input').forEach(input => {
            input.addEventListener('input', () => {
                updateEntryTotal(tr, ordered);
                markUnsaved();
            });
        });

        bodyEl.appendChild(tr);
    });
}

function updateEntryTotal(tr, ordered) {
    let total = 0;
    tr.querySelectorAll('.cell-entry input').forEach(input => {
        total += parseFloat(input.value) || 0;
    });
    const totalCell = tr.querySelector('.entry-total');
    totalCell.textContent = total;

    // Update conditional formatting
    totalCell.classList.remove('cell-total-green', 'cell-total-amber', 'cell-total-none');
    if (ordered > 0 && total >= ordered) {
        totalCell.classList.add('cell-total-green');
    } else if (total > 0) {
        totalCell.classList.add('cell-total-amber');
    } else {
        totalCell.classList.add('cell-total-none');
    }
}

/* ─── Cost Summary ─────────────────────────────────────────── */
function renderCostSummary() {
    if (!jobData) return;

    // Calculate subtotal from all line items
    let subtotal = 0;
    jobData.line_items.forEach(item => {
        subtotal += item.total_net_price || 0;
    });

    const taxRate = jobData.job.tax_rate || 0;
    const zipCode = (jobData.job.zip_code || '').trim();
    const jobState = (jobData.job.state || '').trim().toUpperCase();
    const isOutOfState = zipCode.length >= 5 && jobState !== 'OK' && jobState !== '';

    // Tax always applies based on job site rate; shipping fee added for out-of-state
    const taxAmount = subtotal * (taxRate / 100);
    const outOfStateFee = isOutOfState ? 10000 : 0;
    const total = subtotal + taxAmount + outOfStateFee;

    const el = (id) => document.getElementById(id);

    el('costSubtotal').textContent = formatMoney(subtotal);
    el('costTaxRate').textContent = taxRate + '%';
    el('costTaxAmount').textContent = formatMoney(taxAmount);
    el('costTotal').textContent = formatMoney(total);

    const feeRow = el('costFeeRow');
    if (feeRow) feeRow.style.display = isOutOfState ? 'flex' : 'none';

    // Update save bar running total
    const saveBarTotal = el('saveBarTotal');
    if (saveBarTotal) {
        saveBarTotal.textContent = 'Total: ' + formatMoney(total);
    }
}

/* ─── Save ──────────────────────────────────────────────────── */
async function saveCurrentTab() {
    markSaving();

    try {
        if (currentTab === 'master') {
            await saveMasterList();
        } else {
            await saveEntryTab(currentTab);
        }
        markSaved();
    } catch (err) {
        const status = document.getElementById('saveStatus');
        if (status) {
            status.textContent = 'Save failed!';
            status.className = 'save-status unsaved';
        }
        console.error('Save failed:', err);
    }
}

async function saveMasterList() {
    const rows = document.querySelectorAll('#masterBody tr');
    const lineItems = [];

    rows.forEach(tr => {
        // Parse displayed total net price (strip $ and commas)
        const displayedNet = tr.querySelector('.total-net-price').textContent
            .replace(/[$,]/g, '');
        lineItems.push({
            id: tr.dataset.itemId ? parseInt(tr.dataset.itemId) : null,
            line_number: parseInt(tr.querySelector('.input-line-number').value) || 0,
            stock_ns: tr.querySelector('.input-stock-ns').value,
            sku: tr.querySelector('.input-sku').value,
            description: tr.querySelector('.input-description').value,
            quote_qty: parseFloat(tr.querySelector('.input-quote-qty').value) || 0,
            qty_ordered: parseFloat(tr.querySelector('.input-qty-ordered').value) || 0,
            price_per: parseFloat(tr.querySelector('.input-price-per').value) || 0,
            total_net_price: parseFloat(displayedNet) || 0,
        });
    });

    const res = await fetch(`/api/job/${jobId}/line-items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_items: lineItems })
    });

    if (!res.ok) throw new Error('Save failed');

    jobData = await res.json();
    renderMasterList();
    renderEntryTab('received');
    renderEntryTab('shipped');
    renderEntryTab('invoiced');
    renderCostSummary();
}

async function saveEntryTab(tabType) {
    const tbody = document.getElementById(`${tabType}Body`);
    const entries = [];

    tbody.querySelectorAll('tr').forEach(tr => {
        const lineItemId = parseInt(tr.dataset.itemId);
        tr.querySelectorAll('.cell-entry input').forEach(input => {
            const col = parseInt(input.dataset.col);
            const qty = parseFloat(input.value) || 0;
            entries.push({
                line_item_id: lineItemId,
                column_number: col,
                quantity: qty,
            });
        });
    });

    const res = await fetch(`/api/job/${jobId}/${tabType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries })
    });

    if (!res.ok) throw new Error('Save failed');

    jobData = await res.json();
    renderMasterList();
    renderEntryTab('received');
    renderEntryTab('shipped');
    renderEntryTab('invoiced');
    renderCostSummary();
}

/* ─── PDF Import ────────────────────────────────────────────── */
let importedItems = [];

function openImportModal() {
    document.getElementById('importModal').style.display = 'flex';
    document.getElementById('importStep1').style.display = 'block';
    document.getElementById('importStep2').style.display = 'none';
    document.getElementById('importLoading').style.display = 'none';
    document.getElementById('pdfFileInput').value = '';
    importedItems = [];
}

function closeImportModal() {
    document.getElementById('importModal').style.display = 'none';
}

function backToStep1() {
    document.getElementById('importStep1').style.display = 'block';
    document.getElementById('importStep2').style.display = 'none';
}

async function uploadPDF() {
    const fileInput = document.getElementById('pdfFileInput');
    if (!fileInput.files.length) {
        alert('Please select a PDF file.');
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    document.getElementById('importStep1').style.display = 'none';
    document.getElementById('importLoading').style.display = 'block';

    try {
        const res = await fetch(`/api/job/${jobId}/import-pdf`, {
            method: 'POST',
            body: formData
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error || 'Import failed.');
            document.getElementById('importStep1').style.display = 'block';
            document.getElementById('importLoading').style.display = 'none';
            return;
        }

        importedItems = data.items;
        document.getElementById('importCount').textContent =
            `${data.count} line items found in PDF`;

        // Render preview table
        const tbody = document.getElementById('importPreviewBody');
        tbody.innerHTML = '';
        data.items.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align:center;">${item.line_number}</td>
                <td>${escapeHtml(item.sku)}</td>
                <td>${escapeHtml(item.description)}</td>
                <td style="text-align:right;">${item.qty_ordered}</td>
                <td style="text-align:right;">${formatMoney(item.price_per)}</td>
                <td style="text-align:right;">${formatMoney(item.total_net_price)}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('importLoading').style.display = 'none';
        document.getElementById('importStep2').style.display = 'block';
    } catch (err) {
        alert('Error uploading PDF: ' + err.message);
        document.getElementById('importStep1').style.display = 'block';
        document.getElementById('importLoading').style.display = 'none';
    }
}

async function confirmImport() {
    const mode = document.getElementById('importMode').value;

    let lineItems;
    if (mode === 'append') {
        // Gather existing rows from the master table
        const existingRows = document.querySelectorAll('#masterBody tr');
        lineItems = [];
        existingRows.forEach(tr => {
            const sku = tr.querySelector('.input-sku').value;
            const desc = tr.querySelector('.input-description').value;
            // Skip empty placeholder rows
            if (!sku && !desc) return;
            const displayedNet = tr.querySelector('.total-net-price').textContent
                .replace(/[$,]/g, '');
            lineItems.push({
                id: tr.dataset.itemId ? parseInt(tr.dataset.itemId) : null,
                line_number: parseInt(tr.querySelector('.input-line-number').value) || 0,
                stock_ns: tr.querySelector('.input-stock-ns').value,
                sku: sku,
                description: desc,
                quote_qty: parseFloat(tr.querySelector('.input-quote-qty').value) || 0,
                qty_ordered: parseFloat(tr.querySelector('.input-qty-ordered').value) || 0,
                price_per: parseFloat(tr.querySelector('.input-price-per').value) || 0,
                total_net_price: parseFloat(displayedNet) || 0,
            });
        });
        // Re-number imported items to follow existing
        const startLine = lineItems.length > 0
            ? Math.max(...lineItems.map(i => i.line_number)) + 1
            : 1;
        importedItems.forEach((item, idx) => {
            lineItems.push({
                id: null,
                line_number: startLine + idx,
                stock_ns: item.stock_ns || '',
                sku: item.sku,
                description: item.description,
                quote_qty: item.quote_qty,
                qty_ordered: item.qty_ordered,
                price_per: item.price_per,
                total_net_price: item.total_net_price || 0,
            });
        });
    } else {
        // Replace mode — use imported items only
        lineItems = importedItems.map(item => ({
            id: null,
            line_number: item.line_number,
            stock_ns: item.stock_ns || '',
            sku: item.sku,
            description: item.description,
            quote_qty: item.quote_qty,
            qty_ordered: item.qty_ordered,
            price_per: item.price_per,
            total_net_price: item.total_net_price || 0,
        }));
    }

    closeImportModal();
    markSaving();

    try {
        const res = await fetch(`/api/job/${jobId}/line-items`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ line_items: lineItems })
        });

        if (!res.ok) throw new Error('Save failed');

        jobData = await res.json();
        renderMasterList();
        renderEntryTab('received');
        renderEntryTab('shipped');
        renderEntryTab('invoiced');
        renderCostSummary();
        markSaved();
    } catch (err) {
        const status = document.getElementById('saveStatus');
        if (status) {
            status.textContent = 'Import save failed!';
            status.className = 'save-status unsaved';
        }
        console.error('Import save failed:', err);
    }
}

/* ─── Helpers ───────────────────────────────────────────────── */
function formatMoney(val) {
    return '$' + (val || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function escapeAttr(text) {
    return (text || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
