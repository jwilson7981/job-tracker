/* Customers JS — LGHVAC Customer Management */

// ─── List Page ──────────────────────────────────────────────
let allCustomers = [];

async function loadCustomers() {
    const res = await fetch('/api/customers');
    allCustomers = await res.json();
    filterCustomers();
}

function filterCustomers() {
    const search = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const type = document.getElementById('typeFilter')?.value || '';
    const showInactive = document.getElementById('showInactive')?.checked || false;

    const filtered = allCustomers.filter(c => {
        if (!showInactive && !c.is_active) return false;
        if (type && c.company_type !== type) return false;
        if (search) {
            const fields = [c.company_name, c.primary_contact, c.contact_email, c.contact_phone, c.city, c.state].map(f => (f||'').toLowerCase());
            if (!fields.some(f => f.includes(search))) return false;
        }
        return true;
    });

    const countEl = document.getElementById('custCount');
    if (countEl) countEl.textContent = `${filtered.length} of ${allCustomers.length} customers`;

    const tbody = document.getElementById('customersBody');
    if (!tbody) return;
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No customers match your filters.</td></tr>';
        return;
    }
    tbody.innerHTML = filtered.map(c => {
        const winRate = c.total_bids > 0 ? Math.round((c.accepted_bids / c.total_bids) * 100) + '%' : '-';
        const activeClass = c.is_active ? '' : ' style="opacity:0.5;"';
        return `<tr onclick="window.location='/customers/${c.id}'"${activeClass} style="cursor:pointer;">
            <td><a href="/customers/${c.id}" class="link">${c.company_name}</a></td>
            <td>${c.company_type}</td>
            <td>${c.primary_contact || '-'}</td>
            <td>${c.contact_email || '-'}</td>
            <td>${c.contact_phone || '-'}</td>
            <td style="text-align:center;">${c.total_bids || 0}</td>
            <td style="text-align:center;">${winRate}</td>
        </tr>`;
    }).join('');
}

function showAddCustomer() {
    document.getElementById('editCustId').value = '';
    document.getElementById('modalTitle').textContent = 'New Customer';
    ['custName','custContact','custEmail','custPhone','custAddress','custCity','custState','custZip','custWebsite','custNotes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('custType').value = 'General Contractor';
    document.getElementById('customerModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('customerModal').style.display = 'none';
}

async function saveCustomer() {
    const id = document.getElementById('editCustId').value;
    const data = {
        company_name: document.getElementById('custName').value.trim(),
        company_type: document.getElementById('custType').value,
        primary_contact: document.getElementById('custContact').value.trim(),
        contact_email: document.getElementById('custEmail').value.trim(),
        contact_phone: document.getElementById('custPhone').value.trim(),
        address: document.getElementById('custAddress').value.trim(),
        city: document.getElementById('custCity').value.trim(),
        state: document.getElementById('custState').value.trim(),
        zip_code: document.getElementById('custZip').value.trim(),
        website: document.getElementById('custWebsite').value.trim(),
        notes: document.getElementById('custNotes').value.trim(),
    };
    if (!data.company_name) return alert('Company name is required');
    const url = id ? `/api/customers/${id}` : '/api/customers';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    if (res.ok) {
        closeModal();
        if (id) loadCustomers();
        else {
            const result = await res.json();
            window.location = `/customers/${result.id}`;
        }
    } else {
        const err = await res.json();
        alert(err.error || 'Failed to save');
    }
}

// ─── Detail Page ────────────────────────────────────────────
let custData = null;

async function loadCustomerDetail() {
    if (typeof window.CUSTOMER_ID === 'undefined') return;
    const res = await fetch(`/api/customers/${window.CUSTOMER_ID}`);
    if (!res.ok) return;
    custData = await res.json();
    renderDetail();
}

function renderDetail() {
    const c = custData;
    document.getElementById('custTitle').textContent = c.company_name;
    document.getElementById('btnToggleActive').textContent = c.is_active ? 'Deactivate' : 'Reactivate';

    // Info
    const loc = [c.address, c.city, c.state, c.zip_code].filter(Boolean).join(', ');
    document.getElementById('custInfo').innerHTML = `
        <div><strong>Type:</strong> ${c.company_type}</div>
        <div><strong>Contact:</strong> ${c.primary_contact || '-'}</div>
        <div><strong>Email:</strong> ${c.contact_email ? `<a href="mailto:${c.contact_email}">${c.contact_email}</a>` : '-'}</div>
        <div><strong>Phone:</strong> ${c.contact_phone || '-'}</div>
        <div><strong>Location:</strong> ${loc || '-'}</div>
        <div><strong>Website:</strong> ${c.website ? `<a href="${c.website}" target="_blank">${c.website}</a>` : '-'}</div>
        ${c.notes ? `<div style="margin-top:8px;"><strong>Notes:</strong><br>${c.notes}</div>` : ''}
    `;

    // Stats
    const winRate = c.total_bids > 0 ? Math.round((c.accepted_bids / c.total_bids) * 100) + '%' : '-';
    document.getElementById('custStats').innerHTML = `
        <div class="cost-row"><span class="cost-label">Total Bids</span><span class="cost-value">${c.total_bids || 0}</span></div>
        <div class="cost-row"><span class="cost-label">Accepted</span><span class="cost-value">${c.accepted_bids || 0}</span></div>
        <div class="cost-row"><span class="cost-label">Win Rate</span><span class="cost-value">${winRate}</span></div>
        <div class="cost-row"><span class="cost-label">Active Jobs</span><span class="cost-value">${c.active_jobs || 0}</span></div>
        <div class="cost-row"><span class="cost-label">Total Revenue</span><span class="cost-value">$${(c.total_revenue || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</span></div>
    `;

    // Contacts
    const cBody = document.getElementById('contactsBody');
    if (c.contacts && c.contacts.length) {
        cBody.innerHTML = c.contacts.map(ct => `<tr>
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

    // Bids
    const bBody = document.getElementById('bidsBody');
    if (c.bids && c.bids.length) {
        bBody.innerHTML = c.bids.map(b => {
            const statusClass = 'status-' + (b.status || 'draft').toLowerCase().replace(/ /g,'-');
            return `<tr onclick="window.location='/bids/${b.id}'" style="cursor:pointer;">
                <td><a href="/bids/${b.id}" class="link">${b.bid_name || 'Untitled'}</a></td>
                <td>${b.job_name || '-'}</td>
                <td><span class="status-badge ${statusClass}">${b.status}</span></td>
                <td style="text-align:right;">$${(b.total_bid || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                <td>${b.bid_date || '-'}</td>
            </tr>`;
        }).join('');
    } else {
        bBody.innerHTML = '<tr><td colspan="5" class="empty-state">No bids yet</td></tr>';
    }

    // Jobs
    const jBody = document.getElementById('jobsBody');
    if (c.jobs && c.jobs.length) {
        jBody.innerHTML = c.jobs.map(j => `<tr onclick="window.location='/projects/${j.id}'" style="cursor:pointer;">
            <td><a href="/projects/${j.id}" class="link">${j.name}</a></td>
            <td><span class="status-badge status-${(j.status||'').toLowerCase().replace(/ /g,'-')}">${j.status}</span></td>
            <td>${[j.city, j.state].filter(Boolean).join(', ') || '-'}</td>
            <td>${j.awarded_date || '-'}</td>
        </tr>`).join('');
    } else {
        jBody.innerHTML = '<tr><td colspan="4" class="empty-state">No jobs yet</td></tr>';
    }
}

function editCustomer() {
    if (!custData) return;
    document.getElementById('editName').value = custData.company_name || '';
    document.getElementById('editType').value = custData.company_type || 'General Contractor';
    document.getElementById('editContact').value = custData.primary_contact || '';
    document.getElementById('editEmail').value = custData.contact_email || '';
    document.getElementById('editPhone').value = custData.contact_phone || '';
    document.getElementById('editAddress').value = custData.address || '';
    document.getElementById('editCity').value = custData.city || '';
    document.getElementById('editState').value = custData.state || '';
    document.getElementById('editZip').value = custData.zip_code || '';
    document.getElementById('editWebsite').value = custData.website || '';
    document.getElementById('editNotes').value = custData.notes || '';
    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() { document.getElementById('editModal').style.display = 'none'; }

async function saveEdit() {
    const data = {
        company_name: document.getElementById('editName').value.trim(),
        company_type: document.getElementById('editType').value,
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
    const res = await fetch(`/api/customers/${window.CUSTOMER_ID}`, {
        method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
    });
    if (res.ok) { closeEditModal(); loadCustomerDetail(); }
}

async function toggleActive() {
    if (!confirm(custData.is_active ? 'Deactivate this customer?' : 'Reactivate this customer?')) return;
    await fetch(`/api/customers/${window.CUSTOMER_ID}`, {
        method: custData.is_active ? 'DELETE' : 'PUT',
        headers: {'Content-Type':'application/json'},
        body: custData.is_active ? undefined : JSON.stringify({is_active: 1})
    });
    loadCustomerDetail();
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
    const ct = custData.contacts.find(c => c.id === cid);
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
    const url = cid ? `/api/customers/${window.CUSTOMER_ID}/contacts/${cid}` : `/api/customers/${window.CUSTOMER_ID}/contacts`;
    const method = cid ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    if (res.ok) { closeContactModal(); loadCustomerDetail(); }
}

async function deleteContact(cid) {
    if (!confirm('Delete this contact?')) return;
    await fetch(`/api/customers/${window.CUSTOMER_ID}/contacts/${cid}`, { method: 'DELETE' });
    loadCustomerDetail();
}

// Init
document.addEventListener('DOMContentLoaded', function() {
    if (typeof window.CUSTOMER_ID !== 'undefined') loadCustomerDetail();
    else loadCustomers();
});
