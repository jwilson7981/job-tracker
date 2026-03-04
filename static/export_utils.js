/* Universal Export Utilities — scrape visible table → download Excel/PDF */

function scrapeTable(tableId) {
    const tbody = document.getElementById(tableId);
    if (!tbody) return { headers: [], rows: [] };
    const table = tbody.closest('table');
    if (!table) return { headers: [], rows: [] };

    // Headers — skip "Actions" columns
    const thCells = table.querySelectorAll('thead th');
    const headers = [];
    const skipCols = new Set();
    thCells.forEach((th, i) => {
        const txt = th.textContent.trim();
        if (/^actions?$/i.test(txt) || txt === '') {
            skipCols.add(i);
        } else {
            headers.push(txt);
        }
    });

    // Rows — only visible rows from the tbody
    const rows = [];
    const trs = tbody.querySelectorAll('tr');
    trs.forEach(tr => {
        if (tr.style.display === 'none') return;
        // Skip empty-state rows
        if (tr.querySelector('.empty-state')) return;
        const cells = tr.querySelectorAll('td');
        if (!cells.length) return;
        const row = [];
        cells.forEach((td, i) => {
            if (skipCols.has(i)) return;
            row.push(td.textContent.trim());
        });
        if (row.length) rows.push(row);
    });
    return { headers, rows };
}

async function exportToExcel(title, tableId, filename) {
    const { headers, rows } = scrapeTable(tableId);
    if (!rows.length) { alert('No data to export.'); return; }

    const res = await fetch('/api/export/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, headers, rows, filename })
    });
    if (!res.ok) { alert('Export failed.'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (filename || title) + '.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

async function exportToPDF(title, tableId, filename) {
    const { headers, rows } = scrapeTable(tableId);
    if (!rows.length) { alert('No data to export.'); return; }

    const res = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, headers, rows, filename })
    });
    if (!res.ok) { alert('Export failed.'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (filename || title) + '.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
