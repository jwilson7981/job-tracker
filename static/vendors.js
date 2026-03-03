/* Vendors JS — LGHVAC Vendor Management */

function fmt(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ─── List Page ──────────────────────────────────────────────
let allVendors = [];

async function loadVendors() {
    const res = await fetch('/api/vendors');
    allVendors = await res.json();
    filterVendors();
}

function filterVendors() {
    const search = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const type = document.getElementById('typeFilter')?.value || '';
    const showInactive = document.getElementById('showInactive')?.checked || false;

    const filtered = allVendors.filter(v => {
        if (!showInactive && !v.is_active) return false;
        if (type && v.vendor_type !== type) return false;
        if (search) {
            const fields = [v.company_name, v.primary_contact, v.contact_email, v.contact_phone, v.account_number, v.city, v.state].map(f => (f||'').toLowerCase());
            if (!fields.some(f => f.includes(search))) return false;
        }
        return true;
    });

    const countEl = document.getElementById('vendorCount');
    if (countEl) countEl.textContent = `${filtered.length} of ${allVendors.length} vendors`;

    const tbody = document.getElementById('vendorsBody');
    if (!tbody) return;
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No vendors match your filters.</td></tr>';
        return;
    }
    tbody.innerHTML = filtered.map(v => {
        const activeClass = v.is_active ? '' : ' style="opacity:0.5;"';
        return `<tr onclick="window.location='/vendors/${v.id}'"${activeClass} style="cursor:pointer;">
            <td><a href="/vendors/${v.id}" class="link">${v.company_name}</a></td>
            <td>${v.vendor_type}</td>
            <td>${v.account_number || '-'}</td>
            <td>${v.primary_contact || '-'}</td>
            <td>${v.contact_phone || '-'}</td>
            <td style="text-align:center;">${v.quote_count || 0}</td>
            <td style="text-align:center;">${v.invoice_count || 0}</td>
        </tr>`;
    }).join('');
}

function showAddVendor() {
    document.getElementById('editVendorId').value = '';
    document.getElementById('vendorModalTitle').textContent = 'New Vendor';
    ['vendorName','vendorAccount','vendorTerms','vendorContact','vendorEmail','vendorPhone','vendorAddress','vendorCity','vendorState','vendorZip','vendorWebsite','vendorNotes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('vendorType').value = 'Supplier';
    document.getElementById('vendorModal').style.display = 'flex';
}

function closeVendorModal() {
    document.getElementById('vendorModal').style.display = 'none';
}

async function saveVendor() {
    const id = document.getElementById('editVendorId').value;
    const data = {
        company_name: document.getElementById('vendorName').value.trim(),
        vendor_type: document.getElementById('vendorType').value,
        account_number: document.getElementById('vendorAccount').value.trim(),
        payment_terms: document.getElementById('vendorTerms').value.trim(),
        primary_contact: document.getElementById('vendorContact').value.trim(),
        contact_email: document.getElementById('vendorEmail').value.trim(),
        contact_phone: document.getElementById('vendorPhone').value.trim(),
        address: document.getElementById('vendorAddress').value.trim(),
        city: document.getElementById('vendorCity').value.trim(),
        state: document.getElementById('vendorState').value.trim(),
        zip_code: document.getElementById('vendorZip').value.trim(),
        website: document.getElementById('vendorWebsite').value.trim(),
        notes: document.getElementById('vendorNotes').value.trim(),
    };
    if (!data.company_name) return alert('Company name is required');
    const url = id ? `/api/vendors/${id}` : '/api/vendors';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    if (res.ok) {
        closeVendorModal();
        if (id) loadVendors();
        else {
            const result = await res.json();
            window.location = `/vendors/${result.id}`;
        }
    } else {
        const err = await res.json();
        alert(err.error || 'Failed to save');
    }
}

// ─── Detail Page ────────────────────────────────────────────
let vendorData = null;

async function loadVendorDetail() {
    if (typeof window.VENDOR_ID === 'undefined') return;
    const res = await fetch(`/api/vendors/${window.VENDOR_ID}`);
    if (!res.ok) return;
    vendorData = await res.json();
    renderDetail();
}

function renderDetail() {
    const v = vendorData;
    document.getElementById('vendorTitle').textContent = v.company_name;
    document.getElementById('btnToggleActive').textContent = v.is_active ? 'Deactivate' : 'Reactivate';

    // Info
    const loc = [v.address, v.city, v.state, v.zip_code].filter(Boolean).join(', ');
    document.getElementById('vendorInfo').innerHTML = `
        <div><strong>Type:</strong> ${v.vendor_type}</div>
        <div><strong>Account #:</strong> ${v.account_number || '-'}</div>
        <div><strong>Payment Terms:</strong> ${v.payment_terms || '-'}</div>
        <div><strong>Contact:</strong> ${v.primary_contact || '-'}</div>
        <div><strong>Email:</strong> ${v.contact_email ? `<a href="mailto:${v.contact_email}">${v.contact_email}</a>` : '-'}</div>
        <div><strong>Phone:</strong> ${v.contact_phone || '-'}</div>
        <div><strong>Location:</strong> ${loc || '-'}</div>
        <div><strong>Website:</strong> ${v.website ? `<a href="${v.website}" target="_blank">${v.website}</a>` : '-'}</div>
        ${v.notes ? `<div style="margin-top:8px;"><strong>Notes:</strong><br>${v.notes}</div>` : ''}
    `;

    // Stats
    document.getElementById('vendorStats').innerHTML = `
        <div class="cost-row"><span class="cost-label">Total Quoted</span><span class="cost-value">${fmt(v.total_quoted)}</span></div>
        <div class="cost-row"><span class="cost-label">Total Invoiced</span><span class="cost-value">${fmt(v.total_invoiced)}</span></div>
        <div class="cost-row"><span class="cost-label">Open Balance</span><span class="cost-value" style="color:${v.open_balance > 0 ? '#EF4444' : 'inherit'};">${fmt(v.open_balance)}</span></div>
        <div class="cost-row"><span class="cost-label">Quotes</span><span class="cost-value">${(v.quotes || []).length}</span></div>
        <div class="cost-row"><span class="cost-label">Invoices</span><span class="cost-value">${(v.invoices || []).length}</span></div>
    `;

    // Contacts
    const cBody = document.getElementById('contactsBody');
    if (v.contacts && v.contacts.length) {
        cBody.innerHTML = v.contacts.map(ct => `<tr>
            <td>${ct.name}</td>
            <td>${ct.title || '-'}</td>
            <td>${ct.email ? `<a href="mailto:${ct.email}">${ct.email}</a>` : '-'}</td>
            <td>${ct.phone || '-'}</td>
            <td>${ct.is_primary ? '&#9733;' : ''}</td>
            <td style="text-align:right;">
                <button class="btn btn-secondary btn-small" onclick="editContact(${ct.id})">Edit</button>
                <button class="btn btn-secondary btn-small" onclick="deleteContact(${ct.id})" style="color:var(--red);">Del</button>
            </td>
        </tr>`).join('');
    } else {
        cBody.innerHTML = '<tr><td colspan="6" class="empty-state">No contacts yet</td></tr>';
    }

    // Quotes
    const qBody = document.getElementById('quotesBody');
    if (v.quotes && v.quotes.length) {
        qBody.innerHTML = v.quotes.map(q => {
            const statusClass = 'status-' + (q.status || 'requested').toLowerCase().replace(/ /g, '-');
            return `<tr onclick="window.location='/supplier-quotes/${q.id}'" style="cursor:pointer;">
                <td><a href="/supplier-quotes/${q.id}" class="link">${q.quote_number || '-'}</a></td>
                <td>${q.job_name || '-'}</td>
                <td><span class="status-badge ${statusClass}">${q.status}</span></td>
                <td style="text-align:right;">${fmt(q.total)}</td>
                <td>${q.quote_date || '-'}</td>
            </tr>`;
        }).join('');
    } else {
        qBody.innerHTML = '<tr><td colspan="5" class="empty-state">No quotes yet</td></tr>';
    }

    // Invoices
    const iBody = document.getElementById('invoicesBody');
    if (v.invoices && v.invoices.length) {
        iBody.innerHTML = v.invoices.map(i => {
            const statusClass = 'status-' + (i.status || 'open').toLowerCase().replace(/ /g, '-');
            return `<tr>
                <td>${i.invoice_number || '-'}</td>
                <td>${i.job_name || '-'}</td>
                <td><span class="status-badge ${statusClass}">${i.status}</span></td>
                <td style="text-align:right;">${fmt(i.total)}</td>
                <td style="text-align:right;color:${(i.balance_due||0) > 0 ? '#EF4444' : 'inherit'};">${fmt(i.balance_due)}</td>
                <td>${i.invoice_date || '-'}</td>
            </tr>`;
        }).join('');
    } else {
        iBody.innerHTML = '<tr><td colspan="6" class="empty-state">No invoices yet</td></tr>';
    }
}

function editVendor() {
    if (!vendorData) return;
    document.getElementById('editName').value = vendorData.company_name || '';
    document.getElementById('editType').value = vendorData.vendor_type || 'Supplier';
    document.getElementById('editAccount').value = vendorData.account_number || '';
    document.getElementById('editTerms').value = vendorData.payment_terms || '';
    document.getElementById('editContact').value = vendorData.primary_contact || '';
    document.getElementById('editEmail').value = vendorData.contact_email || '';
    document.getElementById('editPhone').value = vendorData.contact_phone || '';
    document.getElementById('editAddress').value = vendorData.address || '';
    document.getElementById('editCity').value = vendorData.city || '';
    document.getElementById('editState').value = vendorData.state || '';
    document.getElementById('editZip').value = vendorData.zip_code || '';
    document.getElementById('editWebsite').value = vendorData.website || '';
    document.getElementById('editNotes').value = vendorData.notes || '';
    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() { document.getElementById('editModal').style.display = 'none'; }

async function saveEdit() {
    const data = {
        company_name: document.getElementById('editName').value.trim(),
        vendor_type: document.getElementById('editType').value,
        account_number: document.getElementById('editAccount').value.trim(),
        payment_terms: document.getElementById('editTerms').value.trim(),
        primary_contact: document.getElementById('editContact').value.trim(),
        contact_email: document.getElementById('editEmail').value.trim(),
        contact_phone: document.getElementById('editPhone').value.trim(),
        address: document.getElementById('editAddress').value.trim(),
        city: document.getElementById('editCity').value.trim(),
        state: document.getElementById('editState').value.trim(),
        zip_code: document.getElementById('editZip').value.trim(),
        website: document.getElementById('editWebsite').value.trim(),
        notes: document.getElementById('editNotes').value.trim(),
    };
    if (!data.company_name) return alert('Company name is required');
    const res = await fetch(`/api/vendors/${window.VENDOR_ID}`, {
        method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
    });
    if (res.ok) { closeEditModal(); loadVendorDetail(); }
}

async function toggleActive() {
    if (!confirm(vendorData.is_active ? 'Deactivate this vendor?' : 'Reactivate this vendor?')) return;
    await fetch(`/api/vendors/${window.VENDOR_ID}`, {
        method: vendorData.is_active ? 'DELETE' : 'PUT',
        headers: {'Content-Type':'application/json'},
        body: vendorData.is_active ? undefined : JSON.stringify({is_active: 1})
    });
    loadVendorDetail();
}

// Contacts
function showAddContact() {
    document.getElementById('editContactId').value = '';
    document.getElementById('contactModalTitle').textContent = 'Add Contact';
    ['contactName','contactTitle','contactEmail','contactPhone'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('contactPrimary').checked = false;
    document.getElementById('contactModal').style.display = 'flex';
}

function closeContactModal() { document.getElementById('contactModal').style.display = 'none'; }

function editContact(cid) {
    const ct = vendorData.contacts.find(c => c.id === cid);
    if (!ct) return;
    document.getElementById('editContactId').value = ct.id;
    document.getElementById('contactModalTitle').textContent = 'Edit Contact';
    document.getElementById('contactName').value = ct.name || '';
    document.getElementById('contactTitle').value = ct.title || '';
    document.getElementById('contactEmail').value = ct.email || '';
    document.getElementById('contactPhone').value = ct.phone || '';
    document.getElementById('contactPrimary').checked = !!ct.is_primary;
    document.getElementById('contactModal').style.display = 'flex';
}

async function saveContact() {
    const cid = document.getElementById('editContactId').value;
    const data = {
        name: document.getElementById('contactName').value.trim(),
        title: document.getElementById('contactTitle').value.trim(),
        email: document.getElementById('contactEmail').value.trim(),
        phone: document.getElementById('contactPhone').value.trim(),
        is_primary: document.getElementById('contactPrimary').checked ? 1 : 0,
    };
    if (!data.name) return alert('Name is required');
    const url = cid ? `/api/vendors/${window.VENDOR_ID}/contacts/${cid}` : `/api/vendors/${window.VENDOR_ID}/contacts`;
    const method = cid ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    if (res.ok) { closeContactModal(); loadVendorDetail(); }
}

async function deleteContact(cid) {
    if (!confirm('Delete this contact?')) return;
    await fetch(`/api/vendors/${window.VENDOR_ID}/contacts/${cid}`, { method: 'DELETE' });
    loadVendorDetail();
}

// Init
document.addEventListener('DOMContentLoaded', function() {
    if (typeof window.VENDOR_ID !== 'undefined') loadVendorDetail();
    else loadVendors();
});
