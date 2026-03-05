// ─── Supplier Quotes Detail Page JS ─────────────────────────────

let quoteData = null;
let lineItems = [];

// ─── Load Quote ─────────────────────────────────────────────────

async function loadQuote() {
    const res = await fetch('/api/supplier-quotes/' + window.QUOTE_ID);
    if (!res.ok) {
        alert('Quote not found');
        window.location = '/supplier-quotes';
        return;
    }
    quoteData = await res.json();
    lineItems = quoteData.items || [];

    // Populate fields
    document.getElementById('pageTitle').textContent = quoteData.supplier_name
        ? 'Quote: ' + quoteData.supplier_name
        : 'Supplier Quote #' + quoteData.id;

    document.getElementById('qSupplier').value = quoteData.supplier_name || '';
    document.getElementById('qJobName').textContent = quoteData.job_name || '-';
    document.getElementById('qNumber').value = quoteData.quote_number || '';
    document.getElementById('qStatus').value = quoteData.status || 'Requested';
    document.getElementById('qDate').value = quoteData.quote_date || '';
    document.getElementById('qExpDate').value = quoteData.expiration_date || '';
    document.getElementById('qSubtotal').value = fmt(quoteData.subtotal);
    document.getElementById('qFreight').value = quoteData.freight || 0;
    document.getElementById('qNotes').value = quoteData.notes || '';

    // Tax rate: back-calculate from existing tax_amount/subtotal, or fetch from job
    const existingTax = quoteData.tax_amount || 0;
    const existingSub = quoteData.subtotal || 0;
    if (existingTax > 0 && existingSub > 0) {
        document.getElementById('qTaxRate').value = Math.round(existingTax / existingSub * 100 * 100) / 100;
    } else if (quoteData.job_id) {
        // Auto-fill tax rate from job
        fetch('/api/projects/' + quoteData.job_id)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data && data.job && data.job.tax_rate) {
                    document.getElementById('qTaxRate').value = data.job.tax_rate;
                    recalcTotal();
                }
            }).catch(() => {});
    }
    recalcTotal();

    // File link + parse button
    if (quoteData.file_path) {
        const link = document.getElementById('qFileLink');
        link.href = '/api/supplier-quotes/' + window.QUOTE_ID + '/file';
        link.style.display = '';
        document.getElementById('btnParsePdf').style.display = '';
    }

    // Baseline
    if (quoteData.is_baseline) {
        document.getElementById('baselineIndicator').style.display = '';
        document.getElementById('btnBaseline').style.display = 'none';
    } else {
        document.getElementById('baselineIndicator').style.display = 'none';
        document.getElementById('btnBaseline').style.display = '';
    }

    renderItems();
}

// ─── Format Helpers ─────────────────────────────────────────────

function fmt(n) {
    return '$' + parseFloat(n || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function parseMoney(s) {
    return parseFloat((s || '0').toString().replace(/[^0-9.\-]/g, '')) || 0;
}

// ─── Totals ─────────────────────────────────────────────────────

function recalcTotal() {
    const subtotal = parseMoney(document.getElementById('qSubtotal').value);
    const taxRate = parseFloat(document.getElementById('qTaxRate').value) || 0;
    const tax = Math.round(subtotal * taxRate / 100 * 100) / 100;
    const freight = parseFloat(document.getElementById('qFreight').value) || 0;
    document.getElementById('qTax').value = fmt(tax);
    document.getElementById('qTotal').value = fmt(subtotal + tax + freight);
}

function recalcSubtotal() {
    let subtotal = 0;
    lineItems.forEach(item => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unit_price) || 0;
        item.extended_price = qty * price;
        subtotal += item.extended_price;
    });
    document.getElementById('qSubtotal').value = fmt(subtotal);
    recalcTotal();
}

// ─── Line Items ─────────────────────────────────────────────────

function renderItems() {
    const tbody = document.getElementById('itemsBody');
    if (!lineItems.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No line items. Click "+ Add Line" to add items.</td></tr>';
        return;
    }
    tbody.innerHTML = lineItems.map((item, idx) => {
        const ext = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
        return `<tr>
            <td style="text-align:center;color:var(--gray-400);font-size:13px;">${idx + 1}</td>
            <td><input type="text" class="form-input" value="${esc(item.sku)}" onchange="updateItem(${idx},'sku',this.value)" style="font-size:13px;"></td>
            <td><input type="text" class="form-input" value="${esc(item.description)}" onchange="updateItem(${idx},'description',this.value)" style="font-size:13px;"></td>
            <td><input type="number" class="form-input" value="${item.quantity || 0}" min="0" step="0.01" onchange="updateItem(${idx},'quantity',this.value)" style="font-size:13px;text-align:right;"></td>
            <td><input type="number" class="form-input" value="${item.unit_price || 0}" min="0" step="0.01" onchange="updateItem(${idx},'unit_price',this.value)" style="font-size:13px;text-align:right;"></td>
            <td style="text-align:right;font-weight:600;font-size:13px;">${fmt(ext)}</td>
            <td><input type="text" class="form-input" value="${esc(item.takeoff_sku)}" onchange="updateItem(${idx},'takeoff_sku',this.value)" style="font-size:13px;"></td>
            <td style="text-align:center;"><button class="btn btn-secondary btn-small" onclick="removeLine(${idx})" style="color:var(--red-500,#ef4444);padding:2px 8px;">X</button></td>
        </tr>`;
    }).join('');
}

function esc(s) {
    return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function updateItem(idx, field, value) {
    if (field === 'quantity' || field === 'unit_price') {
        lineItems[idx][field] = parseFloat(value) || 0;
    } else {
        lineItems[idx][field] = value;
    }
    if (field === 'quantity' || field === 'unit_price') {
        recalcSubtotal();
        renderItems();
    }
}

function addLineItem() {
    lineItems.push({
        sku: '',
        description: '',
        quantity: 0,
        unit_price: 0,
        extended_price: 0,
        takeoff_sku: '',
        notes: ''
    });
    renderItems();
    // Focus the SKU input on the new row
    const rows = document.getElementById('itemsBody').querySelectorAll('tr');
    if (rows.length) {
        const lastRow = rows[rows.length - 1];
        const firstInput = lastRow.querySelector('input');
        if (firstInput) firstInput.focus();
    }
}

function removeLine(idx) {
    lineItems.splice(idx, 1);
    recalcSubtotal();
    renderItems();
}

// ─── Save Operations ────────────────────────────────────────────

async function saveQuote() {
    const body = {
        supplier_name: document.getElementById('qSupplier').value.trim(),
        quote_number: document.getElementById('qNumber').value.trim(),
        quote_date: document.getElementById('qDate').value,
        expiration_date: document.getElementById('qExpDate').value,
        status: document.getElementById('qStatus').value,
        subtotal: parseMoney(document.getElementById('qSubtotal').value),
        tax_amount: parseMoney(document.getElementById('qTax').value),
        freight: parseFloat(document.getElementById('qFreight').value) || 0,
        total: parseMoney(document.getElementById('qTotal').value),
        notes: document.getElementById('qNotes').value.trim(),
        file_path: quoteData ? quoteData.file_path || '' : ''
    };
    const res = await fetch('/api/supplier-quotes/' + window.QUOTE_ID, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.ok) {
        showToast('Quote saved.');
    } else {
        alert(data.error || 'Failed to save.');
    }
}

async function saveItems() {
    const res = await fetch('/api/supplier-quotes/' + window.QUOTE_ID + '/items', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({items: lineItems})
    });
    const data = await res.json();
    if (data.ok) {
        document.getElementById('qSubtotal').value = fmt(data.subtotal);
        recalcTotal();
        showToast('Line items saved.');
    } else {
        alert(data.error || 'Failed to save items.');
    }
}

async function uploadFile() {
    const input = document.getElementById('qFileInput');
    if (!input.files.length) return alert('Please select a file.');
    const fd = new FormData();
    fd.append('file', input.files[0]);
    const res = await fetch('/api/supplier-quotes/' + window.QUOTE_ID + '/upload', {
        method: 'POST',
        body: fd
    });
    const data = await res.json();
    if (data.ok) {
        const link = document.getElementById('qFileLink');
        link.href = '/api/supplier-quotes/' + window.QUOTE_ID + '/file';
        link.style.display = '';
        if (quoteData) quoteData.file_path = data.file_path;
        showToast('File uploaded.');
        input.value = '';
    } else {
        alert(data.error || 'Upload failed.');
    }
}

async function selectAsBaseline() {
    if (!confirm('Select this quote as the baseline for this job? This will unset any current baseline.')) return;
    const res = await fetch('/api/supplier-quotes/' + window.QUOTE_ID + '/select', {method: 'POST'});
    const data = await res.json();
    if (data.ok) {
        document.getElementById('baselineIndicator').style.display = '';
        document.getElementById('btnBaseline').style.display = 'none';
        document.getElementById('qStatus').value = 'Selected';
        showToast('Quote selected as baseline.');
    } else {
        alert(data.error || 'Failed to select baseline.');
    }
}

async function deleteQuote() {
    if (!confirm('Delete this supplier quote? This cannot be undone.')) return;
    const res = await fetch('/api/supplier-quotes/' + window.QUOTE_ID, {method: 'DELETE'});
    const data = await res.json();
    if (data.ok) {
        window.location = '/supplier-quotes';
    } else {
        alert(data.error || 'Failed to delete.');
    }
}

// ─── Toast ──────────────────────────────────────────────────────

function showToast(msg) {
    let toast = document.getElementById('sq-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sq-toast';
        toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1e293b;color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;z-index:9999;opacity:0;transition:opacity .3s;';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

// ─── Parse PDF ──────────────────────────────────────────────────

async function parsePdf() {
    if (!confirm('Parse line items from the uploaded PDF? This will replace any existing line items.')) return;
    const btn = document.getElementById('btnParsePdf');
    btn.disabled = true;
    btn.textContent = 'Parsing...';
    try {
        const res = await fetch('/api/supplier-quotes/' + window.QUOTE_ID + '/parse', {method: 'POST'});
        const data = await res.json();
        if (data.ok) {
            showToast(`Parsed ${data.items_parsed} line items.`);
            loadQuote();
        } else {
            alert(data.error || 'Failed to parse PDF.');
        }
    } catch (e) {
        alert('Error parsing PDF: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Parse Line Items from PDF';
    }
}

// ─── AI Price Check ─────────────────────────────────────────────

let competitorItems = [];

function showPriceCheckModal() {
    competitorItems = [];
    document.getElementById('pcCompetitorText').value = '';
    document.getElementById('pcCompetitorFile').value = '';
    document.getElementById('pcCompetitorPreview').style.display = 'none';
    document.getElementById('pcCompetitorBody').innerHTML = '';
    document.getElementById('pcExtractStatus').textContent = '';
    const modal = document.getElementById('priceCheckModal');
    modal.style.display = 'flex';
}

function closePriceCheckModal() {
    document.getElementById('priceCheckModal').style.display = 'none';
}

async function uploadCompetitorPdf() {
    const input = document.getElementById('pcCompetitorFile');
    if (!input.files.length) return alert('Please select a PDF file.');
    const btn = document.getElementById('btnExtractPdf');
    const status = document.getElementById('pcExtractStatus');
    btn.disabled = true;
    btn.textContent = 'Extracting...';
    status.textContent = 'AI is reading the PDF and extracting line items...';
    try {
        const fd = new FormData();
        fd.append('file', input.files[0]);
        const res = await fetch('/api/supplier-quotes/' + window.QUOTE_ID + '/price-check/competitor', {
            method: 'POST', body: fd
        });
        const data = await res.json();
        if (data.ok && data.items) {
            competitorItems = data.items;
            renderCompetitorPreview();
            status.textContent = `Extracted ${data.items.length} items from ${data.supplier_name || 'competitor'}.`;
        } else {
            status.textContent = data.error || 'Failed to extract items.';
            status.style.color = 'var(--red-500,#ef4444)';
        }
    } catch (e) {
        status.textContent = 'Error: ' + e.message;
        status.style.color = 'var(--red-500,#ef4444)';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Extract Items';
    }
}

function renderCompetitorPreview() {
    const preview = document.getElementById('pcCompetitorPreview');
    const tbody = document.getElementById('pcCompetitorBody');
    if (!competitorItems.length) {
        preview.style.display = 'none';
        return;
    }
    preview.style.display = '';
    tbody.innerHTML = competitorItems.map((it, idx) =>
        `<tr>
            <td>${esc(it.sku || '')}</td>
            <td>${esc(it.description || '')}</td>
            <td style="text-align:right;">${fmt(it.unit_price || 0)}</td>
            <td>${esc(it.supplier_name || '')}</td>
            <td><button class="btn btn-secondary btn-small" onclick="removeCompetitorItem(${idx})" style="color:var(--red-500);padding:1px 6px;font-size:11px;">X</button></td>
        </tr>`
    ).join('');
}

function removeCompetitorItem(idx) {
    competitorItems.splice(idx, 1);
    renderCompetitorPreview();
}

async function runPriceCheck() {
    const btn = document.getElementById('btnRunPriceCheck');
    btn.disabled = true;
    btn.textContent = 'Analyzing...';
    try {
        const body = {};
        const text = document.getElementById('pcCompetitorText').value.trim();
        if (text) body.competitor_text = text;
        if (competitorItems.length) body.competitor_items = competitorItems;

        const res = await fetch('/api/supplier-quotes/' + window.QUOTE_ID + '/price-check', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.error) {
            alert(data.error);
            return;
        }
        closePriceCheckModal();
        renderPriceCheck(data);
        showToast('Price check complete.');
    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Run Price Check';
    }
}

function renderPriceCheck(review) {
    const section = document.getElementById('priceCheckResults');
    section.style.display = '';

    // Cached timestamp
    const cachedEl = document.getElementById('pcCachedAt');
    if (review.cached_at || review.created_at) {
        cachedEl.textContent = 'Last run: ' + (review.cached_at || review.created_at);
    }

    // Summary cards
    const cards = document.getElementById('pcSummaryCards');
    const badgeColors = {
        excellent: {bg:'#dcfce7',fg:'#166534'},
        fair: {bg:'#dbeafe',fg:'#1e40af'},
        above_average: {bg:'#fef9c3',fg:'#854d0e'},
        high: {bg:'#fee2e2',fg:'#991b1b'}
    };
    cards.innerHTML = `
        <div style="background:var(--gray-50,#f9fafb);border-radius:8px;padding:14px 16px;text-align:center;">
            <div style="font-size:12px;color:var(--gray-500);margin-bottom:4px;">Items Reviewed</div>
            <div style="font-size:22px;font-weight:700;">${review.items_reviewed || 0}</div>
        </div>
        <div style="background:var(--gray-50,#f9fafb);border-radius:8px;padding:14px 16px;text-align:center;">
            <div style="font-size:12px;color:var(--gray-500);margin-bottom:4px;">Savings Opportunities</div>
            <div style="font-size:22px;font-weight:700;color:var(--green-600,#16a34a);">${review.items_with_savings || 0}</div>
        </div>
        <div style="background:var(--gray-50,#f9fafb);border-radius:8px;padding:14px 16px;text-align:center;">
            <div style="font-size:12px;color:var(--gray-500);margin-bottom:4px;">Est. Savings Range</div>
            <div style="font-size:22px;font-weight:700;color:var(--green-600,#16a34a);">${fmt(review.total_savings_low)} - ${fmt(review.total_savings_high)}</div>
        </div>
        <div style="background:var(--gray-50,#f9fafb);border-radius:8px;padding:14px 16px;text-align:center;">
            <div style="font-size:12px;color:var(--gray-500);margin-bottom:4px;">Quote Total</div>
            <div style="font-size:22px;font-weight:700;">${fmt(review.quote_total)}</div>
        </div>
    `;

    // AI Summary
    const sumEl = document.getElementById('pcSummary');
    if (review.summary) {
        sumEl.textContent = review.summary;
        sumEl.style.display = '';
    } else {
        sumEl.style.display = 'none';
    }

    // Items table
    const tbody = document.getElementById('pcTableBody');
    if (review.items && review.items.length) {
        tbody.innerHTML = review.items.map(it => {
            const colors = badgeColors[it.assessment] || badgeColors.fair;
            const histAvg = it.historical_avg != null ? fmt(it.historical_avg) : '-';
            const compPrice = it.competitor_price != null ? fmt(it.competitor_price) : '-';
            const webRange = (it.web_low != null && it.web_high != null)
                ? `${fmt(it.web_low)} - ${fmt(it.web_high)}` : '-';
            const savings = it.savings_high > 0
                ? `${fmt(it.savings_low)} - ${fmt(it.savings_high)}` : '-';
            return `<tr>
                <td style="font-size:12px;font-weight:600;">${esc(it.sku)}</td>
                <td style="font-size:12px;">${esc(it.description)}</td>
                <td style="text-align:right;font-size:12px;">${fmt(it.unit_price)}</td>
                <td style="text-align:right;font-size:12px;">${histAvg}</td>
                <td style="text-align:right;font-size:12px;">${compPrice}</td>
                <td style="text-align:right;font-size:12px;">${webRange}</td>
                <td style="text-align:center;">
                    <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${colors.bg};color:${colors.fg};">
                        ${it.assessment || 'fair'}
                    </span>
                </td>
                <td style="text-align:right;font-size:12px;color:var(--green-600,#16a34a);">${savings}</td>
                <td style="font-size:11px;color:var(--gray-500);">${esc(it.ai_note || '')}</td>
            </tr>`;
        }).join('');
    }

    // Recommendations
    const recSection = document.getElementById('pcRecommendations');
    const recList = document.getElementById('pcRecList');
    if (review.recommendations && review.recommendations.length) {
        recList.innerHTML = review.recommendations.map(r => `<li style="margin-bottom:4px;">${esc(r)}</li>`).join('');
        recSection.style.display = '';
    } else {
        recSection.style.display = 'none';
    }
}

async function loadCachedPriceCheck() {
    try {
        const res = await fetch('/api/supplier-quotes/' + window.QUOTE_ID + '/price-check');
        if (!res.ok) return;
        const data = await res.json();
        if (data.cached && data.items) {
            renderPriceCheck(data);
        }
    } catch (e) {
        // Silently ignore
    }
}

// ─── Init ───────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadQuote();
    loadCachedPriceCheck();
});
