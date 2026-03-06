// ─── Material Order Detail Page ──────────────────────────────
const ORDER_ID = parseInt(window.location.pathname.split('/').pop());
let order = null;
let orderItems = [];

const fmt = v => '$' + parseFloat(v||0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

async function loadOrder() {
    const res = await fetch(`/api/orders/${ORDER_ID}`);
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    order = data;
    orderItems = data.items || [];
    renderOrder();
}

function renderOrder() {
    const o = order;
    document.getElementById('pageTitle').textContent = o.order_number || ('ORD-' + o.id);
    document.getElementById('fldJob').value = o.job_name || '';
    document.getElementById('fldSupplier').value = o.supplier_name || '';
    document.getElementById('fldOrderNumber').value = o.order_number || '';
    document.getElementById('fldTakeoffType').value = o.takeoff_type || '';
    document.getElementById('fldDelivery').value = o.expected_delivery || '';
    document.getElementById('fldStatus').value = o.status || 'Draft';
    document.getElementById('fldNotes').value = o.notes || '';
    document.getElementById('fldSubtotal').value = (o.subtotal||0).toFixed(2);
    document.getElementById('fldTax').value = (o.tax_amount||0).toFixed(2);
    document.getElementById('fldFreight').value = (o.freight||0).toFixed(2);
    calcTotal();

    // Status badge
    const badge = document.getElementById('statusBadge');
    badge.textContent = o.status;
    badge.className = 'status-badge status-' + (o.status||'draft').toLowerCase();

    // Show/hide action buttons based on status
    const isDraft = o.status === 'Draft';
    const isSubmitted = o.status === 'Submitted';
    const isConfirmed = o.status === 'Confirmed';
    const isPartial = o.status === 'Partial';

    document.getElementById('btnSave').style.display = '';
    document.getElementById('btnSubmit').style.display = isDraft ? '' : 'none';
    document.getElementById('btnConfirm').style.display = isSubmitted ? '' : 'none';
    document.getElementById('btnReceive').style.display = (isConfirmed || isPartial) ? '' : 'none';
    document.getElementById('btnDelete').style.display = isDraft ? '' : 'none';
    document.getElementById('addItemRow').style.display = isDraft ? '' : 'none';
    document.getElementById('colActions').style.display = isDraft ? '' : 'none';

    // Lock fields if not draft
    const editableFields = ['fldOrderNumber', 'fldDelivery', 'fldNotes', 'fldTax', 'fldFreight'];
    const draftOnlyFields = ['fldOrderNumber'];
    editableFields.forEach(id => {
        const el = document.getElementById(id);
        if (!isDraft && draftOnlyFields.includes(id)) el.readOnly = true;
    });

    renderItems();
}

function renderItems() {
    const isDraft = order.status === 'Draft';
    const tbody = document.getElementById('itemsBody');
    if (!orderItems.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No items.</td></tr>';
        return;
    }
    tbody.innerHTML = orderItems.map((item, idx) => {
        const disc = item.discrepancy || '';
        const rowClass = disc==='Qty Mismatch'?'row-mismatch':
                         disc==='Quote Only'?'row-quote-only':
                         disc==='Takeoff Only'?'row-takeoff-only':'';
        const badgeClass = disc==='Matched'?'disc-matched':
                           disc==='Qty Mismatch'?'disc-mismatch':
                           disc==='Quote Only'?'disc-quote-only':
                           disc==='Takeoff Only'?'disc-takeoff-only':'disc-manual';
        const ext = (item.order_qty||0) * (item.unit_price||0);
        const rcvd = item.received_qty || 0;
        const rcvdStyle = rcvd >= (item.order_qty||0) ? 'color:#15803d;font-weight:600;' :
                          rcvd > 0 ? 'color:#92400e;font-weight:600;' : '';
        return `<tr class="${rowClass}">
            <td>${item.line_number||idx+1}</td>
            <td style="font-family:monospace;font-size:12px;">${item.sku||''}</td>
            <td>${item.description||''}</td>
            <td style="text-align:right;">${item.quote_qty||'-'}</td>
            <td style="text-align:right;">${item.takeoff_qty||'-'}</td>
            <td style="text-align:right;">${isDraft ?
                `<input type="number" value="${item.order_qty||0}" min="0" style="width:80px;text-align:right;" class="form-input"
                    onchange="updateItemQty(${idx},this.value)">` :
                (item.order_qty||0)}</td>
            <td style="text-align:right;${rcvdStyle}">${rcvd}</td>
            <td style="text-align:right;">${fmt(item.unit_price)}</td>
            <td style="text-align:right;font-weight:600;">${fmt(ext)}</td>
            <td><span class="disc-badge ${badgeClass}">${disc||'—'}</span></td>
            <td style="${isDraft?'':'display:none;'}">
                ${isDraft ? `<button class="btn btn-danger btn-small" onclick="removeItem(${idx})">&#10005;</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

function updateItemQty(idx, val) {
    orderItems[idx].order_qty = parseFloat(val)||0;
    orderItems[idx].extended_price = orderItems[idx].order_qty * (orderItems[idx].unit_price||0);
    recalcSubtotal();
    renderItems();
}

function removeItem(idx) {
    orderItems.splice(idx, 1);
    // Renumber
    orderItems.forEach((item, i) => item.line_number = i+1);
    recalcSubtotal();
    renderItems();
}

function addItem() {
    const sku = document.getElementById('addSku').value.trim();
    const desc = document.getElementById('addDesc').value.trim();
    const qty = parseFloat(document.getElementById('addQty').value)||0;
    const price = parseFloat(document.getElementById('addPrice').value)||0;
    if (!desc) return alert('Please enter a description.');
    orderItems.push({
        line_number: orderItems.length+1,
        sku, description: desc,
        quote_qty: 0, takeoff_qty: 0,
        order_qty: qty, received_qty: 0,
        unit_price: price,
        extended_price: qty*price,
        takeoff_sku: '', source: 'manual',
        discrepancy: 'Manual', notes: ''
    });
    document.getElementById('addSku').value = '';
    document.getElementById('addDesc').value = '';
    document.getElementById('addQty').value = '';
    document.getElementById('addPrice').value = '';
    recalcSubtotal();
    renderItems();
}

function recalcSubtotal() {
    const subtotal = orderItems.reduce((s, i) => s + (i.order_qty||0)*(i.unit_price||0), 0);
    document.getElementById('fldSubtotal').value = subtotal.toFixed(2);
    calcTotal();
}

function calcTotal() {
    const sub = parseFloat(document.getElementById('fldSubtotal').value)||0;
    const tax = parseFloat(document.getElementById('fldTax').value)||0;
    const freight = parseFloat(document.getElementById('fldFreight').value)||0;
    document.getElementById('fldTotal').value = fmt(sub + tax + freight);
}

async function saveOrder() {
    const body = {
        order_number: document.getElementById('fldOrderNumber').value.trim(),
        expected_delivery: document.getElementById('fldDelivery').value,
        notes: document.getElementById('fldNotes').value.trim(),
        tax_amount: parseFloat(document.getElementById('fldTax').value)||0,
        freight: parseFloat(document.getElementById('fldFreight').value)||0,
        items: orderItems.map((item, i) => ({
            id: item.id || null,
            line_number: i+1,
            sku: item.sku||'',
            description: item.description||'',
            quote_qty: item.quote_qty||0,
            takeoff_qty: item.takeoff_qty||0,
            order_qty: item.order_qty||0,
            unit_price: item.unit_price||0,
            extended_price: (item.order_qty||0)*(item.unit_price||0),
            takeoff_sku: item.takeoff_sku||'',
            source: item.source||'manual',
            discrepancy: item.discrepancy||'',
            notes: item.notes||''
        }))
    };
    const res = await fetch(`/api/orders/${ORDER_ID}`, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.ok) loadOrder();
    else alert(data.error || 'Save failed.');
}

async function submitOrder() {
    if (!confirm('Submit this order? Items will no longer be editable.')) return;
    const res = await fetch(`/api/orders/${ORDER_ID}/submit`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) loadOrder();
    else alert(data.error || 'Submit failed.');
}

async function confirmOrder() {
    if (!confirm('Mark this order as confirmed by the supplier?')) return;
    const res = await fetch(`/api/orders/${ORDER_ID}/confirm`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) loadOrder();
    else alert(data.error || 'Confirm failed.');
}

async function deleteOrder() {
    if (!confirm('Delete this draft order? This cannot be undone.')) return;
    const res = await fetch(`/api/orders/${ORDER_ID}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) window.location = '/orders';
    else alert(data.error || 'Delete failed.');
}

// ─── Receive Modal ───────────────────────────────────────────
function openReceiveModal() {
    const tbody = document.getElementById('receiveBody');
    tbody.innerHTML = orderItems.map((item, idx) => {
        const remaining = (item.order_qty||0) - (item.received_qty||0);
        return `<tr>
            <td style="font-family:monospace;font-size:12px;">${item.sku||''}</td>
            <td>${item.description||''}</td>
            <td style="text-align:right;">${item.order_qty||0}</td>
            <td style="text-align:right;">${item.received_qty||0}</td>
            <td><input type="number" class="form-input rcv-input" data-idx="${idx}"
                value="${remaining > 0 ? remaining : 0}" min="0" max="${remaining}"
                style="width:90px;text-align:right;"></td>
        </tr>`;
    }).join('');
    document.getElementById('receiveModal').style.display = 'flex';
}

function closeReceiveModal() {
    document.getElementById('receiveModal').style.display = 'none';
}

async function submitReceive() {
    const inputs = document.querySelectorAll('.rcv-input');
    const receivedItems = [];
    inputs.forEach(inp => {
        const qty = parseFloat(inp.value)||0;
        if (qty > 0) {
            const idx = parseInt(inp.dataset.idx);
            receivedItems.push({ item_id: orderItems[idx].id, received_qty: qty });
        }
    });
    if (!receivedItems.length) return alert('No quantities entered.');
    const res = await fetch(`/api/orders/${ORDER_ID}/receive`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ items: receivedItems })
    });
    const data = await res.json();
    if (data.ok) {
        closeReceiveModal();
        loadOrder();
    } else {
        alert(data.error || 'Receive failed.');
    }
}

document.addEventListener('DOMContentLoaded', loadOrder);
