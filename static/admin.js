/* Admin / User Management JS */
let editingUserId = null;

document.addEventListener('DOMContentLoaded', loadUsers);

async function loadUsers() {
    const res = await fetch('/api/admin/users');
    const users = await res.json();
    const tbody = document.getElementById('usersBody');
    if (!users.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No users.</td></tr>'; return; }
    tbody.innerHTML = users.map(u => {
        const uJson = JSON.stringify(u).replace(/"/g, '&quot;');
        const safeName = u.username.replace(/'/g, "\\'");
        return `<tr>
        <td>${u.username}</td>
        <td>${u.display_name}</td>
        <td><span class="badge">${u.role.replace('_',' ')}</span></td>
        <td>${u.email || '-'}</td>
        <td>${u.phone || '-'}</td>
        <td>$${(u.hourly_rate || 0).toFixed(2)}</td>
        <td>${u.is_active ? '<span style="color:#16A34A;font-weight:600;">Active</span>' : '<span style="color:#DC2626;">Inactive</span>'}</td>
        <td>
            <button class="btn btn-small btn-secondary" onclick="editUser(${uJson})">Edit</button>
            ${u.is_active
                ? `<button class="btn btn-small btn-danger" onclick="toggleUserActive(${u.id}, '${safeName}', false)">Deactivate</button>`
                : `<button class="btn btn-small" style="background:#16A34A;color:#fff;" onclick="toggleUserActive(${u.id}, '${safeName}', true)">Reactivate</button>`
            }
        </td>
    </tr>`;
    }).join('');
}

function showAddUser() {
    editingUserId = null;
    document.getElementById('userModalTitle').textContent = 'Add User';
    document.getElementById('userId').value = '';
    document.getElementById('userUsername').value = '';
    document.getElementById('userUsername').disabled = false;
    document.getElementById('userDisplayName').value = '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').required = true;
    document.getElementById('pwdHint').textContent = '(required)';
    document.getElementById('userRole').value = 'employee';
    document.getElementById('userEmail').value = '';
    document.getElementById('userPhone').value = '';
    document.getElementById('userRate').value = '';
    document.getElementById('userModal').style.display = 'flex';
}

function editUser(user) {
    editingUserId = user.id;
    document.getElementById('userModalTitle').textContent = 'Edit User';
    document.getElementById('userId').value = user.id;
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userUsername').disabled = true;
    document.getElementById('userDisplayName').value = user.display_name;
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').required = false;
    document.getElementById('pwdHint').textContent = '(leave blank to keep current)';
    document.getElementById('userRole').value = user.role;
    document.getElementById('userEmail').value = user.email || '';
    document.getElementById('userPhone').value = user.phone || '';
    document.getElementById('userRate').value = user.hourly_rate || '';
    document.getElementById('userModal').style.display = 'flex';
}

async function saveUser(e) {
    e.preventDefault();
    const payload = {
        display_name: document.getElementById('userDisplayName').value,
        role: document.getElementById('userRole').value,
        email: document.getElementById('userEmail').value,
        phone: document.getElementById('userPhone').value,
        hourly_rate: parseFloat(document.getElementById('userRate').value) || 0,
    };

    const pwd = document.getElementById('userPassword').value;
    if (pwd) payload.password = pwd;

    if (editingUserId) {
        await fetch(`/api/admin/users/${editingUserId}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
    } else {
        payload.username = document.getElementById('userUsername').value;
        payload.password = pwd;
        const res = await fetch('/api/admin/users', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.error) { alert(data.error); return; }
    }

    document.getElementById('userModal').style.display = 'none';
    loadUsers();
}

async function toggleUserActive(id, username, activate) {
    const action = activate ? 'reactivate' : 'deactivate';
    if (!confirm(`${activate ? 'Reactivate' : 'Deactivate'} user "${username}"?${activate ? '' : ' They will no longer be able to log in.'}`)) return;
    try {
        const res = await fetch(`/api/admin/users/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ is_active: activate ? 1 : 0 })
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert(data.error || `Failed to ${action} user (${res.status})`);
            return;
        }
        loadUsers();
    } catch (err) {
        alert(`Error: ${err.message}`);
    }
}
