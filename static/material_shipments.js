/* ─── Material Shipments ──────────────────────────────────────── */

var shipments = [];
var availItems = [];

function loadJobs() {
    fetch('/api/jobs')
        .then(function(r) { return r.json(); })
        .then(function(jobs) {
            var sel = document.getElementById('shipJob');
            sel.innerHTML = '<option value="">Select Job...</option>';
            jobs.forEach(function(j) {
                sel.innerHTML += '<option value="' + j.id + '">' + j.name + '</option>';
            });
        });
}

function loadShipments() {
    fetch('/api/material-shipments')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            shipments = data;
            renderShipments();
        });
}

function renderShipments() {
    var body = document.getElementById('shipmentsBody');
    if (!shipments.length) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#6B7280;padding:40px;">No shipments yet.</td></tr>';
        return;
    }
    var html = '';
    var statusColors = { Draft: '#6B7280', Ready: '#3B82F6', Shipped: '#F59E0B', Delivered: '#10B981' };
    shipments.forEach(function(s) {
        var color = statusColors[s.status] || '#6B7280';
        html += '<tr>';
        html += '<td><strong>' + (s.job_name || '') + '</strong></td>';
        html += '<td>' + s.phase + '</td>';
        html += '<td>' + (s.shipment_date || '') + '</td>';
        html += '<td><span style="font-size:12px;padding:2px 8px;border-radius:9999px;background:' + color + '20;color:' + color + ';font-weight:600;">' + s.status + '</span></td>';
        html += '<td>' + (s.items ? s.items.length : 0) + ' items</td>';
        html += '<td>';
        html += '<button class="btn btn-secondary btn-small" onclick="editShipment(' + s.id + ')">Edit</button> ';
        html += '<button class="btn btn-secondary btn-small" onclick="deleteShipment(' + s.id + ')" style="color:#EF4444;">Del</button>';
        html += '</td>';
        html += '</tr>';
    });
    body.innerHTML = html;
}

function showShipmentModal(shipment) {
    document.getElementById('shipmentId').value = shipment ? shipment.id : '';
    document.getElementById('shipmentModalTitle').textContent = shipment ? 'Edit Shipment' : 'New Shipment';
    document.getElementById('shipJob').value = shipment ? shipment.job_id : '';
    document.getElementById('shipPhase').value = shipment ? shipment.phase : 'Rough-In';
    document.getElementById('shipDate').value = shipment ? shipment.shipment_date : '';
    document.getElementById('shipStatus').value = shipment ? shipment.status : 'Draft';
    document.getElementById('shipNotes').value = shipment ? shipment.notes : '';
    document.getElementById('availableMaterials').innerHTML = '';
    if (shipment && shipment.job_id) loadAvailableMaterials(shipment);
    document.getElementById('shipmentModal').style.display = 'flex';
}

function loadAvailableMaterials(existingShipment) {
    var jobId = document.getElementById('shipJob').value;
    if (!jobId) { document.getElementById('availableMaterials').innerHTML = '<p style="color:#6B7280;text-align:center;">Select a job first</p>'; return; }
    fetch('/api/jobs/' + jobId + '/available-materials')
        .then(function(r) { return r.json(); })
        .then(function(items) {
            availItems = items;
            var existingItems = existingShipment ? (existingShipment.items || []) : [];
            var html = '';
            items.forEach(function(item) {
                var existing = existingItems.find(function(ei) { return ei.line_item_id === item.id; });
                var checked = existing ? ' checked' : '';
                var qty = existing ? existing.quantity : item.qty_available;
                html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #F3F4F6;">';
                html += '<input type="checkbox" id="shipItem_' + item.id + '"' + checked + ' style="width:18px;height:18px;">';
                html += '<div style="flex:1;min-width:0;">';
                html += '<span style="font-weight:600;font-size:13px;">' + (item.sku || 'No SKU') + '</span> ';
                html += '<span style="font-size:12px;color:#6B7280;">' + (item.description || '').substring(0, 40) + '</span>';
                html += '</div>';
                html += '<span style="font-size:11px;color:#6B7280;">Avail: ' + item.qty_available + '</span>';
                html += '<input type="number" id="shipQty_' + item.id + '" value="' + qty + '" min="0" max="' + item.qty_available + '" ';
                html += 'style="width:70px;padding:4px;border:1px solid #D1D5DB;border-radius:4px;font-size:12px;text-align:center;">';
                html += '</div>';
            });
            if (!items.length) html = '<p style="color:#6B7280;text-align:center;">No available materials for this job.</p>';
            document.getElementById('availableMaterials').innerHTML = html;
        });
}

function saveShipment(e) {
    e.preventDefault();
    var id = document.getElementById('shipmentId').value;
    var items = [];
    availItems.forEach(function(item) {
        var cb = document.getElementById('shipItem_' + item.id);
        var qtyInput = document.getElementById('shipQty_' + item.id);
        if (cb && cb.checked) {
            items.push({
                line_item_id: item.id,
                sku: item.sku,
                description: item.description,
                quantity: parseFloat(qtyInput.value || 0),
                quantity_loaded: parseFloat(qtyInput.value || 0)
            });
        }
    });
    var payload = {
        job_id: document.getElementById('shipJob').value,
        phase: document.getElementById('shipPhase').value,
        shipment_date: document.getElementById('shipDate').value,
        status: document.getElementById('shipStatus').value,
        notes: document.getElementById('shipNotes').value,
        items: items
    };
    var url = id ? '/api/material-shipments/' + id : '/api/material-shipments';
    var method = id ? 'PUT' : 'POST';
    fetch(url, {
        method: method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.ok) {
            document.getElementById('shipmentModal').style.display = 'none';
            loadShipments();
        }
    });
}

function editShipment(id) {
    var s = shipments.find(function(s) { return s.id === id; });
    if (s) showShipmentModal(s);
}

function deleteShipment(id) {
    if (!confirm('Delete this shipment?')) return;
    fetch('/api/material-shipments/' + id, { method: 'DELETE' })
        .then(function() { loadShipments(); });
}

document.addEventListener('DOMContentLoaded', function() {
    loadJobs();
    loadShipments();
});
