/* Reminders JS */
let allReminders = [];

loadReminders();

async function loadReminders() {
    try {
        const res = await fetch('/api/reminders');
        allReminders = await res.json();
    } catch (err) {
        allReminders = [];
        console.error('Failed to load reminders:', err);
    }
    updateSummaryCards();
    applyFilters();
}

function updateSummaryCards() {
    let active = 0, dueToday = 0, overdue = 0, completed = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    allReminders.forEach(r => {
        if (r.status === 'Completed') { completed++; return; }
        if (r.status === 'Dismissed') return;
        active++;
        if (r.due_date) {
            const due = new Date(r.due_date + 'T00:00:00');
            const diffDays = Math.floor((due - today) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) overdue++;
            else if (diffDays === 0) dueToday++;
        }
    });

    document.getElementById('summaryActive').textContent = active;
    document.getElementById('summaryDueToday').textContent = dueToday;
    document.getElementById('summaryOverdue').textContent = overdue;
    document.getElementById('summaryCompleted').textContent = completed;
}

function applyFilters() {
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    let filtered = allReminders;
    if (statusFilter) {
        filtered = filtered.filter(r => r.status === statusFilter);
    }
    const countEl = document.getElementById('reminderCount');
    if (countEl) {
        countEl.textContent = filtered.length + ' of ' + allReminders.length + ' reminders';
    }
    renderTable(filtered);
}

function renderTable(reminders) {
    const tbody = document.getElementById('remindersBody');
    if (!reminders.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No reminders found.</td></tr>';
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    tbody.innerHTML = reminders.map(r => {
        let dueBadge = '';
        let rowStyle = '';
        let dueDateDisplay = r.due_date || '-';
        let dueDateStyle = '';

        if (r.due_date && r.status === 'Active') {
            const due = new Date(r.due_date + 'T00:00:00');
            const diffDays = Math.floor((due - today) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) {
                dueBadge = '<span class="status-badge status-expired" style="margin-left:6px;">Overdue</span>';
                rowStyle = 'background:#FEF2F2;';
                dueDateStyle = 'color:#DC2626;font-weight:600;';
            } else if (diffDays === 0) {
                dueBadge = '<span class="status-badge status-expiring-soon" style="margin-left:6px;">Due Today</span>';
                dueDateStyle = 'color:#D97706;font-weight:600;';
            } else if (diffDays === 1) {
                dueDateStyle = 'color:#CA8A04;';
            }
        }

        const statusClass = r.status === 'Active' ? 'status-active' :
                           r.status === 'Completed' ? 'status-badge' :
                           'status-badge';
        const statusColor = r.status === 'Completed' ? 'background:#DEF7EC;color:#03543F;' :
                           r.status === 'Dismissed' ? 'background:#E5E7EB;color:#6B7280;' : '';

        const desc = r.description ? (r.description.length > 80 ? r.description.substring(0, 80) + '...' : r.description) : '-';

        return `<tr style="${rowStyle}">
            <td style="font-weight:500;">${escapeHtml(r.title)}</td>
            <td style="font-size:13px;color:var(--gray-600);">${escapeHtml(desc)}</td>
            <td style="${dueDateStyle}">${dueDateDisplay}${dueBadge}</td>
            <td><span class="status-badge ${r.status === 'Active' ? 'status-active' : ''}" style="${statusColor}">${r.status}</span></td>
            <td>
                ${r.status === 'Active' ? `<button class="btn btn-small btn-primary" onclick="completeReminder(${r.id})" style="margin-right:4px;" title="Mark Complete">&#10003;</button>` : ''}
                <button class="btn btn-small btn-secondary" onclick="editReminder(${r.id})" style="margin-right:4px;">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteReminder(${r.id})">Delete</button>
            </td>
        </tr>`;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showAddReminder() {
    document.getElementById('reminderModalTitle').textContent = 'Add Reminder';
    document.getElementById('reminderId').value = '';
    document.getElementById('remTitle').value = '';
    document.getElementById('remDescription').value = '';
    document.getElementById('remDueDate').value = '';
    document.getElementById('reminderModal').style.display = 'flex';
}

function editReminder(id) {
    const r = allReminders.find(rem => rem.id === id);
    if (!r) return;
    document.getElementById('reminderModalTitle').textContent = 'Edit Reminder';
    document.getElementById('reminderId').value = r.id;
    document.getElementById('remTitle').value = r.title || '';
    document.getElementById('remDescription').value = r.description || '';
    document.getElementById('remDueDate').value = r.due_date || '';
    document.getElementById('reminderModal').style.display = 'flex';
}

async function saveReminder(event) {
    event.preventDefault();
    const id = document.getElementById('reminderId').value;
    const isEdit = !!id;

    const payload = {
        title: document.getElementById('remTitle').value,
        description: document.getElementById('remDescription').value,
        due_date: document.getElementById('remDueDate').value
    };

    const url = isEdit ? '/api/reminders/' + id : '/api/reminders';
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'Failed to save reminder.');
            return;
        }
    } catch (err) {
        alert('Failed to save reminder.');
        console.error(err);
        return;
    }

    document.getElementById('reminderModal').style.display = 'none';
    loadReminders();
}

async function completeReminder(id) {
    try {
        const res = await fetch('/api/reminders/' + id + '/complete', { method: 'PUT' });
        if (!res.ok) {
            alert('Failed to complete reminder.');
            return;
        }
    } catch (err) {
        alert('Failed to complete reminder.');
        console.error(err);
        return;
    }
    loadReminders();
}

async function deleteReminder(id) {
    if (!confirm('Delete this reminder?')) return;
    try {
        const res = await fetch('/api/reminders/' + id, { method: 'DELETE' });
        if (!res.ok) {
            alert('Failed to delete reminder.');
            return;
        }
    } catch (err) {
        alert('Failed to delete reminder.');
        console.error(err);
        return;
    }
    loadReminders();
}
