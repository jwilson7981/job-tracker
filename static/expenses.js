/* Recurring Expenses JS */
let allExpenses = [];
let editingExpenseId = null;
let currentCategory = 'all';

loadExpenses();

/* ─── Helpers ─────────────────────────────────────────────── */

function fmt(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcNextDueDate(frequency, dueDay, lastPaidDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let base = lastPaidDate ? new Date(lastPaidDate) : new Date(today);
    base.setHours(0, 0, 0, 0);

    if (!dueDay) dueDay = 1;

    switch (frequency) {
        case 'Weekly': {
            let next = new Date(base);
            next.setDate(next.getDate() + 7);
            while (next < today) next.setDate(next.getDate() + 7);
            return next;
        }
        case 'Bi-Weekly': {
            let next = new Date(base);
            next.setDate(next.getDate() + 14);
            while (next < today) next.setDate(next.getDate() + 14);
            return next;
        }
        case 'Monthly': {
            let next = new Date(base.getFullYear(), base.getMonth(), dueDay);
            if (lastPaidDate) {
                next.setMonth(next.getMonth() + 1);
            }
            while (next < today) next.setMonth(next.getMonth() + 1);
            return next;
        }
        case 'Quarterly': {
            let next = new Date(base.getFullYear(), base.getMonth(), dueDay);
            if (lastPaidDate) {
                next.setMonth(next.getMonth() + 3);
            }
            while (next < today) next.setMonth(next.getMonth() + 3);
            return next;
        }
        case 'Annual': {
            let next = new Date(base.getFullYear(), base.getMonth(), dueDay);
            if (lastPaidDate) {
                next.setFullYear(next.getFullYear() + 1);
            }
            while (next < today) next.setFullYear(next.getFullYear() + 1);
            return next;
        }
        default: {
            let next = new Date(base.getFullYear(), base.getMonth() + 1, dueDay);
            while (next < today) next.setMonth(next.getMonth() + 1);
            return next;
        }
    }
}

function dueDateClass(dateStr) {
    if (!dateStr) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr);
    due.setHours(0, 0, 0, 0);
    const diff = (due - today) / (1000 * 60 * 60 * 24);
    if (diff < 0) return 'due-overdue';
    if (diff <= 7) return 'due-soon';
    return '';
}

function formatDate(d) {
    if (!d) return '--';
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toISODate(d) {
    if (!d) return null;
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toISOString().split('T')[0];
}

/* ─── Load & Render ───────────────────────────────────────── */

async function loadExpenses() {
    try {
        const res = await fetch('/api/expenses/recurring');
        allExpenses = await res.json();
    } catch (e) {
        allExpenses = [];
    }
    renderTable();
    updateSummaryCards();
}

function filterCategory(category, btn) {
    document.querySelectorAll('#categoryTabs .tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    currentCategory = category;
    renderTable();
}

function renderTable() {
    const items = currentCategory === 'all'
        ? allExpenses
        : allExpenses.filter(e => e.category === currentCategory);

    const tbody = document.getElementById('expensesBody');
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No recurring expenses found.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(e => {
        const nextDue = e.next_due_date || toISODate(calcNextDueDate(e.frequency, e.due_day, e.last_paid_date));
        const dueClass = dueDateClass(nextDue);
        const isActive = e.is_active !== undefined ? e.is_active : 1;
        const statusBadge = isActive
            ? (dueClass === 'due-overdue'
                ? '<span class="status-badge status-overdue">OVERDUE</span>'
                : dueClass === 'due-soon'
                    ? '<span class="status-badge status-expiring-soon">DUE SOON</span>'
                    : '<span class="status-badge status-active">Active</span>')
            : '<span class="status-badge status-closed">Inactive</span>';

        const dueCellStyle = dueClass === 'due-overdue'
            ? 'background:#FEE2E2;color:#DC2626;font-weight:700;'
            : dueClass === 'due-soon'
                ? 'background:#FEF9C3;color:#92400E;font-weight:600;'
                : '';

        const rowStyle = dueClass === 'due-overdue' && isActive
            ? ' style="background:#FFF5F5;"'
            : '';

        return `<tr${rowStyle}>
            <td><span class="badge">${e.category || '-'}</span></td>
            <td>${e.vendor || '-'}</td>
            <td>${e.description || '-'}</td>
            <td style="text-align:right;font-weight:600;">${fmt(e.amount)}</td>
            <td>${e.frequency || '-'}</td>
            <td style="${dueCellStyle}">${formatDate(nextDue)}</td>
            <td>${statusBadge}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-small btn-primary" onclick="recordPayment(${e.id})" title="Record Payment">Pay</button>
                <button class="btn btn-small btn-secondary" onclick="togglePayments(${e.id}, this)" title="Payment History">History</button>
                <button class="btn btn-small btn-secondary" onclick='editExpense(${JSON.stringify(e).replace(/'/g, "&#39;")})' title="Edit">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteExpense(${e.id})" title="Delete">Del</button>
            </td>
        </tr>
        <tr id="payments-row-${e.id}" style="display:none;">
            <td colspan="8" style="padding:0;">
                <div id="payments-${e.id}" style="padding:12px 16px;background:var(--gray-50);"></div>
            </td>
        </tr>`;
    }).join('');
}

/* ─── Summary Cards ───────────────────────────────────────── */

function updateSummaryCards() {
    const active = allExpenses.filter(e => e.is_active !== 0);
    let monthlyTotal = 0;
    let quarterlyTotal = 0;
    let annualTotal = 0;

    active.forEach(e => {
        const amt = Number(e.amount) || 0;
        switch (e.frequency) {
            case 'Weekly':
                monthlyTotal += amt * 4.33;
                quarterlyTotal += amt * 13;
                annualTotal += amt * 52;
                break;
            case 'Bi-Weekly':
                monthlyTotal += amt * 2.17;
                quarterlyTotal += amt * 6.5;
                annualTotal += amt * 26;
                break;
            case 'Monthly':
                monthlyTotal += amt;
                quarterlyTotal += amt * 3;
                annualTotal += amt * 12;
                break;
            case 'Quarterly':
                monthlyTotal += amt / 3;
                quarterlyTotal += amt;
                annualTotal += amt * 4;
                break;
            case 'Annual':
                monthlyTotal += amt / 12;
                quarterlyTotal += amt / 4;
                annualTotal += amt;
                break;
        }
    });

    document.getElementById('sumMonthly').textContent = fmt(monthlyTotal);
    document.getElementById('sumQuarterly').textContent = fmt(quarterlyTotal);
    document.getElementById('sumAnnual').textContent = fmt(annualTotal);

    // Find nearest due date
    let nearestDue = null;
    let nearestLabel = '--';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    active.forEach(e => {
        const nextDue = e.next_due_date
            ? new Date(e.next_due_date)
            : calcNextDueDate(e.frequency, e.due_day, e.last_paid_date);
        if (!nearestDue || nextDue < nearestDue) {
            nearestDue = nextDue;
            nearestLabel = formatDate(nextDue);
        }
    });

    const nextDueEl = document.getElementById('sumNextDue');
    const nextDueCard = document.getElementById('nextDueCard');
    nextDueEl.textContent = nearestLabel;

    // Red alert styling if the nearest due is overdue
    if (nearestDue && nearestDue < today) {
        nextDueCard.style.borderLeftColor = '#DC2626';
        nextDueCard.style.background = '#FEE2E2';
        nextDueEl.style.color = '#DC2626';
    } else if (nearestDue) {
        const diff = (nearestDue - today) / (1000 * 60 * 60 * 24);
        if (diff <= 7) {
            nextDueCard.style.borderLeftColor = '#F59E0B';
            nextDueCard.style.background = '#FEF9C3';
            nextDueEl.style.color = '#92400E';
        } else {
            nextDueCard.style.borderLeftColor = '#22C55E';
            nextDueCard.style.background = '';
            nextDueEl.style.color = '';
        }
    } else {
        nextDueCard.style.borderLeftColor = '#22C55E';
        nextDueCard.style.background = '';
        nextDueEl.style.color = '';
    }
}

/* ─── Add / Edit Expense ──────────────────────────────────── */

function showAddExpense() {
    editingExpenseId = null;
    document.getElementById('expenseModalTitle').textContent = 'Add Recurring Expense';
    document.getElementById('expCategory').value = '';
    document.getElementById('expVendor').value = '';
    document.getElementById('expDescription').value = '';
    document.getElementById('expAmount').value = '';
    document.getElementById('expFrequency').value = 'Monthly';
    document.getElementById('expDueDay').value = '';
    document.getElementById('expStartDate').value = '';
    document.getElementById('expEndDate').value = '';
    document.getElementById('expActive').value = '1';
    document.getElementById('expenseModal').style.display = 'flex';
}

function editExpense(expense) {
    editingExpenseId = expense.id;
    document.getElementById('expenseModalTitle').textContent = 'Edit Recurring Expense';
    document.getElementById('expCategory').value = expense.category || '';
    document.getElementById('expVendor').value = expense.vendor || '';
    document.getElementById('expDescription').value = expense.description || '';
    document.getElementById('expAmount').value = expense.amount || '';
    document.getElementById('expFrequency').value = expense.frequency || 'Monthly';
    document.getElementById('expDueDay').value = expense.due_day || '';
    document.getElementById('expStartDate').value = expense.start_date || '';
    document.getElementById('expEndDate').value = expense.end_date || '';
    document.getElementById('expActive').value = expense.is_active !== undefined ? String(expense.is_active) : '1';
    document.getElementById('expenseModal').style.display = 'flex';
}

async function saveExpense(event) {
    event.preventDefault();
    const payload = {
        category: document.getElementById('expCategory').value,
        vendor: document.getElementById('expVendor').value,
        description: document.getElementById('expDescription').value,
        amount: parseFloat(document.getElementById('expAmount').value) || 0,
        frequency: document.getElementById('expFrequency').value,
        due_day: parseInt(document.getElementById('expDueDay').value) || null,
        start_date: document.getElementById('expStartDate').value || null,
        end_date: document.getElementById('expEndDate').value || null,
        is_active: parseInt(document.getElementById('expActive').value),
    };

    if (editingExpenseId) {
        await fetch(`/api/expenses/recurring/${editingExpenseId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } else {
        await fetch('/api/expenses/recurring', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    }

    document.getElementById('expenseModal').style.display = 'none';
    editingExpenseId = null;
    loadExpenses();
}

/* ─── Delete Expense ──────────────────────────────────────── */

async function deleteExpense(id) {
    if (!confirm('Delete this recurring expense? This will also remove its payment history.')) return;
    await fetch(`/api/expenses/recurring/${id}`, { method: 'DELETE' });
    loadExpenses();
}

/* ─── Record Payment ──────────────────────────────────────── */

function recordPayment(id) {
    const expense = allExpenses.find(e => e.id === id);
    document.getElementById('payExpenseId').value = id;
    document.getElementById('payAmount').value = expense ? expense.amount : '';
    document.getElementById('payDate').valueAsDate = new Date();
    document.getElementById('payMethod').value = 'Check';
    document.getElementById('payReference').value = '';
    document.getElementById('payNotes').value = '';
    document.getElementById('paymentModal').style.display = 'flex';
}

async function submitPayment(event) {
    event.preventDefault();
    const id = document.getElementById('payExpenseId').value;
    const payload = {
        amount_paid: parseFloat(document.getElementById('payAmount').value) || 0,
        payment_date: document.getElementById('payDate').value,
        payment_method: document.getElementById('payMethod').value,
        reference_number: document.getElementById('payReference').value || null,
        notes: document.getElementById('payNotes').value || null,
    };

    await fetch(`/api/expenses/recurring/${id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    document.getElementById('paymentModal').style.display = 'none';
    loadExpenses();
}

/* ─── Payment History (expandable) ────────────────────────── */

async function togglePayments(id, btn) {
    const row = document.getElementById(`payments-row-${id}`);
    if (row.style.display !== 'none') {
        row.style.display = 'none';
        return;
    }
    row.style.display = '';
    await loadPayments(id);
}

async function loadPayments(id) {
    const container = document.getElementById(`payments-${id}`);
    container.innerHTML = '<span class="loading">Loading payments...</span>';
    try {
        const res = await fetch(`/api/expenses/recurring/${id}/payments`);
        const payments = await res.json();
        if (!payments.length) {
            container.innerHTML = '<p class="text-muted" style="margin:0;">No payments recorded yet.</p>';
            return;
        }
        container.innerHTML = `
            <table class="data-table" style="font-size:13px;">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Reference #</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>
                    ${payments.map(p => `<tr>
                        <td>${formatDate(p.payment_date)}</td>
                        <td style="text-align:right;">${fmt(p.amount_paid)}</td>
                        <td>${p.payment_method || '-'}</td>
                        <td>${p.reference_number || '-'}</td>
                        <td>${p.notes || '-'}</td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
    } catch (e) {
        container.innerHTML = '<p class="text-muted" style="margin:0;color:#DC2626;">Failed to load payment history.</p>';
    }
}
