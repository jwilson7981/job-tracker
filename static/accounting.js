/* Accounting JS */
function fmt(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// Overview page
if (!window.JOB_ID && document.getElementById('accountingBody')) {
    loadAccountingOverview();
}

async function loadAccountingOverview() {
    const res = await fetch('/api/projects');
    const jobs = await res.json();
    const tbody = document.getElementById('accountingBody');
    if (!jobs.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No jobs yet.</td></tr>';
        return;
    }
    tbody.innerHTML = jobs.map(j => {
        const totalCost = j.material_cost + j.expenses;
        return `<tr>
            <td><a href="/accounting/job/${j.id}" class="link">${j.name}</a></td>
            <td class="cell-computed">${fmt(j.material_cost)}</td>
            <td class="cell-computed">${fmt(j.expenses)}</td>
            <td class="cell-computed" style="font-weight:700;">${fmt(totalCost)}</td>
            <td class="cell-computed">-</td>
            <td class="cell-computed">-</td>
            <td class="cell-computed">-</td>
            <td><a href="/accounting/job/${j.id}" class="btn btn-small btn-secondary">Details</a></td>
        </tr>`;
    }).join('');
}

// Job detail page
if (window.JOB_ID) {
    loadJobAccounting();
}

async function loadJobAccounting() {
    const res = await fetch(`/api/accounting/job/${JOB_ID}`);
    const data = await res.json();
    renderExpenses(data.expenses);
    renderInvoices(data.invoices);
    renderPayments(data.payments);
    updateSummary(data);
}

function renderExpenses(expenses) {
    const tbody = document.getElementById('expensesBody');
    if (!tbody) return;
    if (!expenses.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No expenses recorded.</td></tr>'; return; }
    tbody.innerHTML = expenses.map(e => `<tr>
        <td>${e.expense_date || '-'}</td><td>${e.category || '-'}</td><td>${e.vendor || '-'}</td>
        <td>${e.description || '-'}</td><td class="cell-computed">${fmt(e.amount)}</td>
        <td><button class="btn btn-small btn-danger" onclick="deleteExpense(${e.id})">Del</button></td>
    </tr>`).join('');
}

function renderInvoices(invoices) {
    const tbody = document.getElementById('invoicesBody');
    if (!tbody) return;
    if (!invoices.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No invoices.</td></tr>'; return; }
    tbody.innerHTML = invoices.map(i => `<tr>
        <td>${i.invoice_number || '-'}</td><td>${i.issue_date || '-'}</td><td>${i.due_date || '-'}</td>
        <td class="cell-computed">${fmt(i.amount)}</td>
        <td><span class="status-badge status-${(i.status||'Draft').toLowerCase().replace(' ','-')}">${i.status}</span></td>
        <td>
            <select onchange="updateInvoiceStatus(${i.id}, this.value)" style="padding:4px;border-radius:4px;border:1px solid var(--gray-300);">
                ${['Draft','Sent','Paid','Overdue'].map(s => `<option value="${s}" ${i.status===s?'selected':''}>${s}</option>`).join('')}
            </select>
            <button class="btn btn-small btn-danger" onclick="deleteInvoice(${i.id})">Del</button>
        </td>
    </tr>`).join('');
}

function renderPayments(payments) {
    const tbody = document.getElementById('paymentsBody');
    if (!tbody) return;
    if (!payments.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No payments received.</td></tr>'; return; }
    tbody.innerHTML = payments.map(p => `<tr>
        <td>${p.payment_date || '-'}</td><td>${p.payment_method || '-'}</td><td>${p.reference_number || '-'}</td>
        <td>${p.description || '-'}</td><td class="cell-computed">${fmt(p.amount)}</td>
        <td><button class="btn btn-small btn-danger" onclick="deletePayment(${p.id})">Del</button></td>
    </tr>`).join('');
}

function updateSummary(data) {
    const el = id => document.getElementById(id);
    if (el('sumMaterial')) el('sumMaterial').textContent = fmt(data.material_cost);
    if (el('sumExpenses')) el('sumExpenses').textContent = fmt(data.total_expenses);
    if (el('sumTotalCost')) el('sumTotalCost').textContent = fmt(data.material_cost + data.total_expenses);
    if (el('sumInvoiced')) el('sumInvoiced').textContent = fmt(data.total_invoiced);
    if (el('sumPayments')) el('sumPayments').textContent = fmt(data.total_payments);
}

function switchAcctTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tab).style.display = 'block';
    event.target.classList.add('active');
}

function showAddExpense() { document.getElementById('expDate').valueAsDate = new Date(); document.getElementById('expenseModal').style.display = 'flex'; }
function showAddInvoice() { document.getElementById('invIssueDate').valueAsDate = new Date(); document.getElementById('invoiceModal').style.display = 'flex'; }
function showAddPayment() { document.getElementById('payDate').valueAsDate = new Date(); document.getElementById('paymentModal').style.display = 'flex'; }

async function saveExpense(e) {
    e.preventDefault();
    await fetch('/api/accounting/expenses', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ job_id: JOB_ID, category: document.getElementById('expCategory').value, vendor: document.getElementById('expVendor').value,
            description: document.getElementById('expDescription').value, amount: document.getElementById('expAmount').value, expense_date: document.getElementById('expDate').value })
    });
    document.getElementById('expenseModal').style.display = 'none';
    loadJobAccounting();
}

async function saveInvoice(e) {
    e.preventDefault();
    await fetch('/api/accounting/invoices', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ job_id: JOB_ID, invoice_number: document.getElementById('invNumber').value, amount: document.getElementById('invAmount').value,
            description: document.getElementById('invDescription').value, issue_date: document.getElementById('invIssueDate').value, due_date: document.getElementById('invDueDate').value })
    });
    document.getElementById('invoiceModal').style.display = 'none';
    loadJobAccounting();
}

async function savePayment(e) {
    e.preventDefault();
    await fetch('/api/accounting/payments', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ job_id: JOB_ID, amount: document.getElementById('payAmount').value, payment_method: document.getElementById('payMethod').value,
            reference_number: document.getElementById('payRef').value, description: document.getElementById('payDescription').value, payment_date: document.getElementById('payDate').value })
    });
    document.getElementById('paymentModal').style.display = 'none';
    loadJobAccounting();
}

async function deleteExpense(id) { if (confirm('Delete this expense?')) { await fetch(`/api/accounting/expenses/${id}`, {method:'DELETE'}); loadJobAccounting(); } }
async function deleteInvoice(id) { if (confirm('Delete this invoice?')) { await fetch(`/api/accounting/invoices/${id}`, {method:'DELETE'}); loadJobAccounting(); } }
async function deletePayment(id) { if (confirm('Delete this payment?')) { await fetch(`/api/accounting/payments/${id}`, {method:'DELETE'}); loadJobAccounting(); } }
async function updateInvoiceStatus(id, status) {
    await fetch(`/api/accounting/invoices/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({status}) });
    loadJobAccounting();
}
