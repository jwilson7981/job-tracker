/* ─── Material Receiving ─────────────────────────────────────── */

var recvItems = [];

function loadJobs() {
    fetch('/api/jobs')
        .then(function(r) { return r.json(); })
        .then(function(jobs) {
            var sel = document.getElementById('jobSelect');
            sel.innerHTML = '<option value="">Choose a project...</option>';
            jobs.forEach(function(j) {
                sel.innerHTML += '<option value="' + j.id + '">' + j.name + '</option>';
            });
        });
}

function loadReceiving() {
    var jobId = document.getElementById('jobSelect').value;
    if (!jobId) {
        document.getElementById('itemsGrid').innerHTML = '';
        document.getElementById('receivingSummary').style.display = 'none';
        document.getElementById('receiveForm').style.display = 'none';
        document.getElementById('deliveryScheduleSection').style.display = 'none';
        return;
    }
    fetch('/api/receiving/' + jobId)
        .then(function(r) { return r.json(); })
        .then(function(items) {
            recvItems = items;
            renderItems();
            document.getElementById('receivingSummary').style.display = '';
            document.getElementById('receiveForm').style.display = '';
        });
    // Load delivery schedules
    fetch('/api/delivery-schedules?job_id=' + jobId)
        .then(function(r) { return r.json(); })
        .then(function(schedules) {
            var section = document.getElementById('deliveryScheduleSection');
            var list = document.getElementById('deliveryScheduleList');
            if (schedules.length > 0) {
                section.style.display = '';
                var html = '';
                schedules.forEach(function(s) {
                    var statusColor = s.status === 'Delivered' ? '#10B981' : (s.status === 'Delayed' ? '#EF4444' : '#3B82F6');
                    html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:#F9FAFB;border-radius:6px;margin-bottom:4px;">';
                    html += '<span style="font-weight:600;">' + s.supplier_name + '</span>';
                    html += '<span style="color:#6B7280;">' + (s.expected_date || 'TBD') + '</span>';
                    html += '<span style="font-size:12px;padding:2px 8px;border-radius:9999px;background:' + statusColor + ';color:white;">' + s.status + '</span>';
                    if (s.tracking_number) html += '<span style="font-size:11px;color:#6B7280;">Track: ' + s.tracking_number + '</span>';
                    html += '</div>';
                });
                list.innerHTML = html;
            } else {
                section.style.display = 'none';
            }
        });
}

function renderItems() {
    var grid = document.getElementById('itemsGrid');
    var total = recvItems.length, received = 0, partial = 0, pending = 0;
    var html = '';
    recvItems.forEach(function(item) {
        var pct = item.qty_ordered > 0 ? Math.round(item.qty_received / item.qty_ordered * 100) : 0;
        var bg = '#FFFFFF', border = '#E5E7EB';
        if (item.qty_remaining <= 0) { bg = '#F0FDF4'; border = '#BBF7D0'; received++; }
        else if (item.qty_received > 0) { bg = '#FFFBEB'; border = '#FDE68A'; partial++; }
        else { pending++; }

        html += '<div class="card" style="padding:12px;background:' + bg + ';border:1px solid ' + border + ';">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        html += '<span style="font-weight:700;font-size:14px;">' + (item.sku || 'No SKU') + '</span>';
        html += '<span style="font-size:12px;padding:2px 8px;border-radius:9999px;background:' + (pct >= 100 ? '#DCFCE7' : '#F3F4F6') + ';color:' + (pct >= 100 ? '#166534' : '#374151') + ';">' + pct + '%</span>';
        html += '</div>';
        html += '<div style="font-size:13px;color:#374151;margin-bottom:8px;max-height:36px;overflow:hidden;">' + (item.description || '') + '</div>';
        html += '<div style="display:flex;gap:8px;font-size:12px;color:#6B7280;margin-bottom:8px;">';
        html += '<span>Ordered: <strong>' + item.qty_ordered + '</strong></span>';
        html += '<span>Received: <strong>' + item.qty_received + '</strong></span>';
        html += '<span>Remaining: <strong style="color:' + (item.qty_remaining > 0 ? '#DC2626' : '#16A34A') + ';">' + item.qty_remaining + '</strong></span>';
        html += '</div>';
        if (item.qty_remaining > 0) {
            html += '<div style="display:flex;gap:8px;align-items:center;">';
            html += '<input type="number" id="recv_' + item.id + '" value="' + item.qty_remaining + '" min="0" max="' + item.qty_remaining + '" ';
            html += 'style="width:80px;padding:6px;border:1px solid #D1D5DB;border-radius:6px;font-size:14px;text-align:center;">';
            html += '<button class="btn btn-primary btn-small" onclick="markReceive(' + item.id + ')" style="font-size:13px;padding:6px 16px;">Receive</button>';
            html += '</div>';
        }
        html += '</div>';
    });
    grid.innerHTML = html;
    document.getElementById('kpiTotalItems').textContent = total;
    document.getElementById('kpiReceived').textContent = received;
    document.getElementById('kpiPartial').textContent = partial;
    document.getElementById('kpiPending').textContent = pending;
}

function markReceive(itemId) {
    var input = document.getElementById('recv_' + itemId);
    if (input) input.dataset.receive = input.value;
}

function receiveAll() {
    recvItems.forEach(function(item) {
        if (item.qty_remaining > 0) {
            var input = document.getElementById('recv_' + item.id);
            if (input) {
                input.value = item.qty_remaining;
                input.dataset.receive = item.qty_remaining;
            }
        }
    });
}

function submitReceive() {
    var jobId = document.getElementById('jobSelect').value;
    if (!jobId) return;
    var items = [];
    recvItems.forEach(function(item) {
        var input = document.getElementById('recv_' + item.id);
        var qty = input ? parseFloat(input.value || 0) : 0;
        if (qty > 0) {
            items.push({ line_item_id: item.id, qty: qty });
        }
    });
    if (items.length === 0) { alert('No items to receive.'); return; }
    fetch('/api/receiving/' + jobId + '/quick', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            items: items,
            supplier_name: document.getElementById('recvSupplier').value,
            po_number: document.getElementById('recvPO').value,
            notes: document.getElementById('recvNotes').value
        })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.ok) {
            alert('Received ' + items.length + ' item(s) successfully!');
            loadReceiving();
        } else {
            alert('Error: ' + (data.error || 'Unknown'));
        }
    });
}

function showPending() {
    fetch('/api/receiving/pending')
        .then(function(r) { return r.json(); })
        .then(function(jobs) {
            var html = '';
            jobs.forEach(function(j) {
                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid #F3F4F6;cursor:pointer;" onclick="selectPendingJob(' + j.id + ')">';
                html += '<span style="font-weight:600;">' + j.name + '</span>';
                html += '<span style="font-size:13px;color:#6B7280;">' + j.items_pending + ' / ' + j.total_items + ' pending</span>';
                html += '</div>';
            });
            if (!jobs.length) html = '<p style="text-align:center;color:#6B7280;padding:20px;">No pending materials.</p>';
            document.getElementById('pendingList').innerHTML = html;
            document.getElementById('pendingModal').style.display = 'flex';
        });
}

function selectPendingJob(id) {
    document.getElementById('jobSelect').value = id;
    document.getElementById('pendingModal').style.display = 'none';
    loadReceiving();
}

document.addEventListener('DOMContentLoaded', loadJobs);
