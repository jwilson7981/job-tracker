/* Inventory JS - Shared for list and detail pages */

let allItems = [];
let knownCategories = [];
let jobsList = [];
let currentItem = null;
let debounceTimer = null;

// ─── Detect Page ─────────────────────────────────────────────
const isDetailPage = typeof window.ITEM_ID !== 'undefined';

if (isDetailPage) {
    loadJobs();
    loadDetail();
} else {
    loadInventory();
}

// ─── Debounce for search ─────────────────────────────────────
function debounceLoad() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadInventory, 300);
}

// ═══════════════════════════════════════════════════════════════
// LIST PAGE
// ═══════════════════════════════════════════════════════════════

async function loadInventory() {
    const searchEl = document.getElementById('searchInput');
    const catEl = document.getElementById('filterCategory');
    const lowEl = document.getElementById('filterLowStock');
    if (!searchEl) return; // not on list page

    const params = new URLSearchParams();
    const q = searchEl.value.trim();
    const cat = catEl.value;
    if (q) params.set('q', q);
    if (cat) params.set('category', cat);

    try {
        const res = await fetch('/api/inventory?' + params.toString());
        allItems = await res.json();
    } catch (err) {
        allItems = [];
        console.error('Failed to load inventory:', err);
    }

    // Build category list from all items
    buildCategoryFilter();
    updateSummary();
    renderList();
}

function buildCategoryFilter() {
    const cats = new Set();
    allItems.forEach(item => {
        if (item.category) cats.add(item.category);
    });
    knownCategories = Array.from(cats).sort();

    // Update filter dropdown (preserve current selection)
    const sel = document.getElementById('filterCategory');
    const current = sel.value;
    const opts = sel.querySelectorAll('option:not(:first-child)');
    opts.forEach(o => o.remove());
    knownCategories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        sel.appendChild(opt);
    });
    sel.value = current;

    // Update datalist in modal
    const dl = document.getElementById('categoryList');
    if (dl) {
        dl.innerHTML = '';
        knownCategories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            dl.appendChild(opt);
        });
    }
}

function updateSummary() {
    const total = allItems.length;
    let inStock = 0, low = 0, outOfStock = 0;
    allItems.forEach(item => {
        if (item.quantity_on_hand <= 0) {
            outOfStock++;
        } else if (item.reorder_point > 0 && item.quantity_on_hand <= item.reorder_point) {
            low++;
        } else {
            inStock++;
        }
    });

    document.getElementById('sumTotal').textContent = total;
    document.getElementById('sumInStock').textContent = inStock;
    document.getElementById('sumLow').textContent = low;
    document.getElementById('sumOutOfStock').textContent = outOfStock;

    // Alert styling on low stock card
    const lowCard = document.getElementById('sumLowCard');
    if (low > 0) {
        lowCard.style.background = '#FEF2F2';
        lowCard.style.borderColor = '#EF4444';
    } else {
        lowCard.style.background = '';
        lowCard.style.borderColor = '';
    }
}

function renderList() {
    const tbody = document.getElementById('inventoryBody');
    const lowOnly = document.getElementById('filterLowStock')?.checked;
    const countEl = document.getElementById('itemCount');

    let items = allItems;
    if (lowOnly) {
        items = items.filter(i => i.reorder_point > 0 && i.quantity_on_hand <= i.reorder_point);
    }

    if (countEl) {
        countEl.textContent = items.length + ' of ' + allItems.length + ' items';
    }

    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No inventory items found.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(item => {
        const isLow = item.reorder_point > 0 && item.quantity_on_hand <= item.reorder_point;
        const isOut = item.quantity_on_hand <= 0;
        let statusBadge, rowStyle = '';

        if (isOut) {
            statusBadge = '<span class="badge" style="background:#FEE2E2;color:#991B1B;">Out of Stock</span>';
            rowStyle = 'background:#FEF2F2;';
        } else if (isLow) {
            statusBadge = '<span class="badge" style="background:#FEF3C7;color:#92400E;">Low Stock</span>';
            rowStyle = 'background:#FFFBEB;';
        } else {
            statusBadge = '<span class="badge" style="background:#DCFCE7;color:#166534;">In Stock</span>';
        }

        const qtyStyle = isOut ? 'color:#DC2626;font-weight:700;' : isLow ? 'color:#92400E;font-weight:600;' : '';

        return `<tr style="${rowStyle}">
            <td style="font-family:monospace;font-size:13px;">${escHtml(item.sku) || '<span style="color:var(--gray-400);">-</span>'}</td>
            <td><a href="/inventory/${item.id}" style="color:var(--primary);text-decoration:none;font-weight:500;">${escHtml(item.description) || '-'}</a></td>
            <td>${escHtml(item.category) || '-'}</td>
            <td style="${qtyStyle}">${formatQty(item.quantity_on_hand)}</td>
            <td>${escHtml(item.unit) || 'each'}</td>
            <td>${escHtml(item.location) || '-'}</td>
            <td>${item.reorder_point > 0 ? formatQty(item.reorder_point) : '-'}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-small btn-secondary" onclick="editItem(${item.id})" style="margin-right:4px;">Edit</button>
                <button class="btn btn-small btn-primary" onclick="window.location.href='/inventory/${item.id}'">Detail</button>
            </td>
        </tr>`;
    }).join('');
}

// ─── List Page: Add/Edit Item ────────────────────────────────

function showAddItem() {
    document.getElementById('itemModalTitle').textContent = 'Add Inventory Item';
    document.getElementById('itemId').value = '';
    document.getElementById('itemSku').value = '';
    document.getElementById('itemCategory').value = '';
    document.getElementById('itemDescription').value = '';
    document.getElementById('itemQty').value = '0';
    document.getElementById('itemUnit').value = 'each';
    document.getElementById('itemReorder').value = '0';
    document.getElementById('itemLocation').value = 'Warehouse';
    document.getElementById('itemNotes').value = '';
    document.getElementById('itemModal').style.display = 'flex';
}

function editItem(id) {
    const item = allItems.find(i => i.id === id);
    if (!item) return;
    document.getElementById('itemModalTitle').textContent = 'Edit Inventory Item';
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemSku').value = item.sku || '';
    document.getElementById('itemCategory').value = item.category || '';
    document.getElementById('itemDescription').value = item.description || '';
    document.getElementById('itemQty').value = item.quantity_on_hand || 0;
    document.getElementById('itemUnit').value = item.unit || 'each';
    document.getElementById('itemReorder').value = item.reorder_point || 0;
    document.getElementById('itemLocation').value = item.location || 'Warehouse';
    document.getElementById('itemNotes').value = item.notes || '';
    document.getElementById('itemModal').style.display = 'flex';
}

async function saveItem(event) {
    event.preventDefault();
    const id = document.getElementById('itemId').value;
    const isEdit = !!id;

    const payload = {
        sku: document.getElementById('itemSku').value.trim(),
        description: document.getElementById('itemDescription').value.trim(),
        category: document.getElementById('itemCategory').value.trim(),
        quantity_on_hand: parseFloat(document.getElementById('itemQty').value) || 0,
        unit: document.getElementById('itemUnit').value,
        location: document.getElementById('itemLocation').value.trim(),
        reorder_point: parseFloat(document.getElementById('itemReorder').value) || 0,
        notes: document.getElementById('itemNotes').value.trim(),
    };

    const url = isEdit ? '/api/inventory/' + id : '/api/inventory';
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'Failed to save item.');
            return;
        }
        const data = await res.json();
        document.getElementById('itemModal').style.display = 'none';
        if (!isEdit && data.id) {
            // Navigate to the new item's detail page
            window.location.href = '/inventory/' + data.id;
        } else {
            loadInventory();
        }
    } catch (err) {
        alert('Failed to save item.');
        console.error(err);
    }
}


// ═══════════════════════════════════════════════════════════════
// DETAIL PAGE
// ═══════════════════════════════════════════════════════════════

async function loadJobs() {
    try {
        const res = await fetch('/api/jobs/list');
        jobsList = await res.json();
        const sel = document.getElementById('adjJob');
        if (sel) {
            jobsList.forEach(j => {
                const opt = document.createElement('option');
                opt.value = j.id;
                opt.textContent = j.name;
                sel.appendChild(opt);
            });
        }
    } catch (err) {
        console.error('Failed to load jobs:', err);
    }
}

async function loadDetail() {
    if (!isDetailPage) return;
    try {
        const res = await fetch('/api/inventory/' + window.ITEM_ID);
        if (!res.ok) {
            document.getElementById('itemInfoCard').innerHTML = '<p style="color:#DC2626;">Item not found.</p>';
            return;
        }
        currentItem = await res.json();
    } catch (err) {
        document.getElementById('itemInfoCard').innerHTML = '<p style="color:#DC2626;">Failed to load item.</p>';
        console.error(err);
        return;
    }

    renderItemInfo();
    renderTransactions();
}

function renderItemInfo() {
    const item = currentItem;
    if (!item) return;

    // Update page title
    document.getElementById('detailTitle').textContent = item.description || 'Inventory Item #' + item.id;

    const isLow = item.reorder_point > 0 && item.quantity_on_hand <= item.reorder_point;
    const isOut = item.quantity_on_hand <= 0;
    let statusBadge;
    if (isOut) {
        statusBadge = '<span class="badge" style="background:#FEE2E2;color:#991B1B;font-size:14px;padding:4px 12px;">Out of Stock</span>';
    } else if (isLow) {
        statusBadge = '<span class="badge" style="background:#FEF3C7;color:#92400E;font-size:14px;padding:4px 12px;">Low Stock</span>';
    } else {
        statusBadge = '<span class="badge" style="background:#DCFCE7;color:#166534;font-size:14px;padding:4px 12px;">In Stock</span>';
    }

    const qtyStyle = isOut ? 'color:#DC2626;font-weight:700;' : isLow ? 'color:#92400E;font-weight:600;' : 'font-weight:600;';

    document.getElementById('itemInfoCard').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;">
            <div>
                <div style="font-size:12px;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">SKU</div>
                <div style="font-family:monospace;font-size:15px;">${escHtml(item.sku) || '-'}</div>
            </div>
            <div>
                <div style="font-size:12px;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Category</div>
                <div>${escHtml(item.category) || '-'}</div>
            </div>
            <div>
                <div style="font-size:12px;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Quantity On Hand</div>
                <div style="font-size:22px;${qtyStyle}">${formatQty(item.quantity_on_hand)} <span style="font-size:14px;font-weight:400;color:var(--gray-500);">${escHtml(item.unit) || 'each'}</span></div>
            </div>
            <div>
                <div style="font-size:12px;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Status</div>
                <div>${statusBadge}</div>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:16px;">
            <div>
                <div style="font-size:12px;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Location</div>
                <div>${escHtml(item.location) || '-'}</div>
            </div>
            <div>
                <div style="font-size:12px;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Reorder Point</div>
                <div>${item.reorder_point > 0 ? formatQty(item.reorder_point) : 'Not set'}</div>
            </div>
            <div>
                <div style="font-size:12px;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Last Count Date</div>
                <div>${item.last_count_date || 'Never'}</div>
            </div>
            <div>
                <div style="font-size:12px;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Last Updated</div>
                <div>${item.updated_at || '-'}</div>
            </div>
        </div>
        ${item.notes ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--gray-200);"><div style="font-size:12px;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Notes</div><div style="white-space:pre-wrap;">${escHtml(item.notes)}</div></div>` : ''}
    `;
}

function renderTransactions() {
    const tbody = document.getElementById('transactionsBody');
    const txns = currentItem?.transactions || [];

    if (!txns.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No transactions recorded.</td></tr>';
        return;
    }

    tbody.innerHTML = txns.map(t => {
        const typeBadge = getTypeBadge(t.transaction_type);
        const qtyDisplay = formatTransactionQty(t.transaction_type, t.quantity);
        return `<tr>
            <td>${t.created_at || '-'}</td>
            <td>${typeBadge}</td>
            <td>${qtyDisplay}</td>
            <td>${escHtml(t.job_name) || '-'}</td>
            <td>${escHtml(t.user_name) || '-'}</td>
            <td>${escHtml(t.reference) || '-'}</td>
            <td>${escHtml(t.notes) || '-'}</td>
        </tr>`;
    }).join('');
}

function getTypeBadge(type) {
    const map = {
        'receive': { bg: '#DCFCE7', color: '#166534', label: 'Receive' },
        'issue':   { bg: '#FEE2E2', color: '#991B1B', label: 'Issue' },
        'return':  { bg: '#DBEAFE', color: '#1E40AF', label: 'Return' },
        'adjust':  { bg: '#F3F4F6', color: '#374151', label: 'Adjust' },
        'count':   { bg: '#E0E7FF', color: '#3730A3', label: 'Count' },
    };
    const s = map[type] || { bg: '#F3F4F6', color: '#6B7280', label: type };
    return `<span class="badge" style="background:${s.bg};color:${s.color};">${s.label}</span>`;
}

function formatTransactionQty(type, qty) {
    if (type === 'count') return formatQty(qty) + ' (set)';
    if (type === 'issue') return '<span style="color:#DC2626;">-' + formatQty(Math.abs(qty)) + '</span>';
    if (type === 'receive' || type === 'return') return '<span style="color:#166534;">+' + formatQty(Math.abs(qty)) + '</span>';
    // adjust
    if (qty >= 0) return '<span style="color:#166534;">+' + formatQty(qty) + '</span>';
    return '<span style="color:#DC2626;">' + formatQty(qty) + '</span>';
}

// ─── Detail Page: Adjustment Form ────────────────────────────

function updateAdjLabel() {
    const type = document.getElementById('adjType').value;
    const label = document.getElementById('adjQtyLabel');
    if (type === 'count') {
        label.textContent = 'Actual Count';
    } else if (type === 'adjust') {
        label.textContent = 'Quantity (+/-)';
    } else {
        label.textContent = 'Quantity';
    }
}

async function submitAdjustment(event) {
    event.preventDefault();

    const payload = {
        transaction_type: document.getElementById('adjType').value,
        quantity: parseFloat(document.getElementById('adjQty').value) || 0,
        job_id: document.getElementById('adjJob').value || null,
        reference: document.getElementById('adjReference').value.trim(),
        notes: document.getElementById('adjNotes').value.trim(),
    };

    if (payload.quantity === 0) {
        alert('Please enter a quantity.');
        return;
    }

    try {
        const res = await fetch('/api/inventory/' + window.ITEM_ID + '/adjust', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'Failed to submit adjustment.');
            return;
        }
    } catch (err) {
        alert('Failed to submit adjustment.');
        console.error(err);
        return;
    }

    // Reset form and reload
    document.getElementById('adjQty').value = '';
    document.getElementById('adjJob').value = '';
    document.getElementById('adjReference').value = '';
    document.getElementById('adjNotes').value = '';
    loadDetail();
}

// ─── Detail Page: Edit Item Modal ────────────────────────────

function editCurrentItem() {
    if (!currentItem) return;
    document.getElementById('itemModalTitle').textContent = 'Edit Inventory Item';
    document.getElementById('itemSku').value = currentItem.sku || '';
    document.getElementById('itemCategory').value = currentItem.category || '';
    document.getElementById('itemDescription').value = currentItem.description || '';
    document.getElementById('itemUnit').value = currentItem.unit || 'each';
    document.getElementById('itemReorder').value = currentItem.reorder_point || 0;
    document.getElementById('itemLocation').value = currentItem.location || 'Warehouse';
    document.getElementById('itemNotes').value = currentItem.notes || '';
    document.getElementById('itemModal').style.display = 'flex';
}

async function saveItemEdit(event) {
    event.preventDefault();
    const payload = {
        sku: document.getElementById('itemSku').value.trim(),
        description: document.getElementById('itemDescription').value.trim(),
        category: document.getElementById('itemCategory').value.trim(),
        unit: document.getElementById('itemUnit').value,
        location: document.getElementById('itemLocation').value.trim(),
        reorder_point: parseFloat(document.getElementById('itemReorder').value) || 0,
        notes: document.getElementById('itemNotes').value.trim(),
    };

    try {
        const res = await fetch('/api/inventory/' + window.ITEM_ID, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'Failed to update item.');
            return;
        }
    } catch (err) {
        alert('Failed to update item.');
        console.error(err);
        return;
    }

    document.getElementById('itemModal').style.display = 'none';
    loadDetail();
}


// ═══════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════════════════

function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatQty(val) {
    const n = parseFloat(val) || 0;
    // Show integer if whole number, otherwise 2 decimal places
    return n === Math.floor(n) ? n.toString() : n.toFixed(2);
}
