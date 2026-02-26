"""BillTrust CSV + PDF Invoice Import with AI Review.

Parses BillTrust CSV exports and combined PDF invoices, extracts line items
via Claude Haiku, merges data, upserts to DB, and runs AI review for anomalies.
"""

import csv
import io
import json
import os
import re
from datetime import datetime

import pdfplumber


# ---------------------------------------------------------------------------
# CSV Parsing
# ---------------------------------------------------------------------------

def parse_billtrust_csv(file_content):
    """Parse BillTrust CSV export into dict keyed by invoice_number.

    Handles BOM, date normalization (MM/DD/YYYY -> YYYY-MM-DD),
    and money parsing ($1,234.56 -> float).

    Args:
        file_content: bytes or str of CSV data.

    Returns:
        Dict mapping invoice_number -> {invoice_date, total_due, po_number,
        discount_message, due_date, terms, discount_amount}.
    """
    if isinstance(file_content, bytes):
        # Strip BOM if present
        if file_content.startswith(b'\xef\xbb\xbf'):
            file_content = file_content[3:]
        text = file_content.decode('utf-8-sig')
    else:
        text = file_content

    reader = csv.DictReader(io.StringIO(text.strip()))
    # Normalize header names (strip whitespace)
    reader.fieldnames = [f.strip() for f in reader.fieldnames]

    invoices = {}
    for row in reader:
        row = {k.strip(): v.strip() for k, v in row.items()}
        inv_num = row.get('INVOICE_NUMBER', '').strip()
        if not inv_num:
            continue

        invoices[inv_num] = {
            'invoice_number': inv_num,
            'invoice_date': _parse_date(row.get('INVOICE_DATE', '')),
            'total_due': _parse_money(row.get('TOTAL_DUE', '0')),
            'po_number': row.get('PO_NUMBER', ''),
            'discount_message': row.get('DISCOUNT_MESSAGE', ''),
            'due_date': _parse_date(row.get('DUE_DATE', '')),
            'terms': row.get('TERMS', ''),
            'discount_amount': _parse_money(row.get('DISCOUNT_AMOUNT', '0')),
        }

    return invoices


def _parse_date(val):
    """Convert MM/DD/YYYY or M/D/YYYY to YYYY-MM-DD. Pass through if already ISO."""
    val = val.strip()
    if not val:
        return ''
    # Already ISO format
    if re.match(r'^\d{4}-\d{2}-\d{2}$', val):
        return val
    # MM/DD/YYYY
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', val)
    if m:
        return f'{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}'
    return val


def _parse_money(val):
    """Convert '$1,234.56' or '1234.56' to float."""
    if not val:
        return 0.0
    cleaned = re.sub(r'[^0-9.\-]', '', str(val))
    try:
        return round(float(cleaned), 2)
    except ValueError:
        return 0.0


# ---------------------------------------------------------------------------
# PDF Extraction
# ---------------------------------------------------------------------------

def extract_pdf_pages(file_content):
    """Split combined PDF into per-page text strings using pdfplumber.

    Args:
        file_content: bytes of PDF data.

    Returns:
        List of strings, one per page.
    """
    pages = []
    with pdfplumber.open(io.BytesIO(file_content)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ''
            pages.append(text)
    return pages


def ai_extract_all_invoices(pages):
    """Use Claude to extract all invoices from a multi-page PDF at once.

    Args:
        pages: List of page text strings from extract_pdf_pages().

    Returns:
        List of invoice dicts with invoice_number, totals, and line_items.
    """
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key or not pages:
        return []

    try:
        import anthropic
    except ImportError:
        return []

    # Number pages and combine
    combined = ''
    for idx, text in enumerate(pages):
        if text.strip():
            combined += f'\n--- PAGE {idx+1} ---\n{text}\n'

    prompt = """Extract ALL invoices from this supplier PDF document. The PDF may contain multiple separate invoices, and some invoices may span multiple pages.

Return ONLY a valid JSON array of invoice objects with this structure:
[
  {
    "invoice_number": "string",
    "invoice_date": "string (YYYY-MM-DD format if possible)",
    "ship_to_name": "string (job/project name from ship-to section)",
    "ship_to_address": "string",
    "subtotal": number,
    "tax_amount": number,
    "total": number,
    "line_items": [
      {
        "line_number": number,
        "product_code": "string",
        "description": "string",
        "qty_ordered": number,
        "qty_backordered": number,
        "qty_shipped": number,
        "unit": "string",
        "unit_price": number,
        "extended_price": number
      }
    ]
  }
]

IMPORTANT:
- Each unique invoice number = one object in the array
- If an invoice spans multiple pages, combine ALL its line items into one object
- Extract the correct total for each invoice (not subtotals of individual pages)
- If a field is missing, use null for strings and 0 for numbers
- Make sure every invoice in the document is captured — do not skip any

PDF document text:
"""

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt + combined}],
        )
        text = response.content[0].text.strip()
        json_match = re.search(r'\[[\s\S]*\]', text)
        if json_match:
            results = json.loads(json_match.group())
            if isinstance(results, list):
                for inv in results:
                    print(f'[InvoiceImport] Extracted: {inv.get("invoice_number")} '
                          f'total={inv.get("total")} items={len(inv.get("line_items", []))}')
                return results
    except Exception as exc:
        print(f'[InvoiceImport] AI extraction error: {exc}')

    return []


def ai_extract_line_items(page_text):
    """Use Claude Haiku to extract structured invoice data from one PDF page.

    Args:
        page_text: Raw text extracted from a single PDF page.

    Returns:
        Dict with invoice_number, ship_to_name, ship_to_address, subtotal,
        tax_amount, total, line_items list. Returns None on failure.
    """
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key or not page_text.strip():
        return None

    try:
        import anthropic
    except ImportError:
        return None

    prompt = """Extract invoice data from this supplier invoice page. Return ONLY valid JSON with this structure:
{
  "invoice_number": "string",
  "ship_to_name": "string (job/project name from ship-to section)",
  "ship_to_address": "string",
  "subtotal": number,
  "tax_amount": number,
  "total": number,
  "line_items": [
    {
      "line_number": number,
      "product_code": "string",
      "description": "string",
      "qty_ordered": number,
      "qty_backordered": number,
      "qty_shipped": number,
      "unit": "string",
      "unit_price": number,
      "extended_price": number
    }
  ]
}

IMPORTANT: This may be a continuation page of a multi-page invoice. Even if the page only has line items and no header, still extract the invoice number (it is usually shown at the top or in a header row) and all line items. Set subtotal/tax_amount/total to 0 if they are not on this page (they typically only appear on the last page).

If a field is missing or unclear, use null for strings and 0 for numbers. Extract ALL line items.

Invoice page text:
"""

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt + page_text}],
        )
        text = response.content[0].text.strip()
        # Extract JSON from response (may be wrapped in ```json blocks)
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            return json.loads(json_match.group())
    except Exception as exc:
        print(f'[InvoiceImport] AI extraction error: {exc}')

    return None


# ---------------------------------------------------------------------------
# Merge CSV + PDF
# ---------------------------------------------------------------------------

def merge_csv_and_pdf(csv_invoices, pdf_extractions):
    """Match CSV header data with PDF line items by invoice_number.

    Args:
        csv_invoices: Dict from parse_billtrust_csv().
        pdf_extractions: List of dicts from ai_extract_line_items().

    Returns:
        List of merged invoice dicts ready for upsert.
    """
    # Index PDF extractions by invoice number, merging multi-page invoices
    pdf_by_num = {}
    for ext in pdf_extractions:
        if not ext or not ext.get('invoice_number'):
            continue
        inv_num = ext['invoice_number']
        if inv_num in pdf_by_num:
            # Merge: combine line items, keep best header data
            existing = pdf_by_num[inv_num]
            existing['line_items'] = existing.get('line_items', []) + ext.get('line_items', [])
            # Use non-zero totals (typically on last page)
            for field in ('subtotal', 'tax_amount', 'total'):
                if ext.get(field) and (not existing.get(field) or existing[field] == 0):
                    existing[field] = ext[field]
            # Use non-empty header fields from first page
            for field in ('ship_to_name', 'ship_to_address'):
                if ext.get(field) and not existing.get(field):
                    existing[field] = ext[field]
        else:
            pdf_by_num[inv_num] = ext

    merged = []
    seen = set()

    # Start with CSV invoices, enrich with PDF data
    for inv_num, csv_data in csv_invoices.items():
        seen.add(inv_num)
        inv = {
            'invoice_number': inv_num,
            'invoice_date': csv_data.get('invoice_date', ''),
            'due_date': csv_data.get('due_date', ''),
            'po_number': csv_data.get('po_number', ''),
            'terms': csv_data.get('terms', ''),
            'discount_amount': csv_data.get('discount_amount', 0),
            'status': 'Open',
            'total': csv_data.get('total_due', 0),
            'balance_due': csv_data.get('total_due', 0),
            'amount_paid': 0,
            'line_items': [],
            'subtotal': 0,
            'tax_amount': 0,
            'ship_to_name': '',
            'ship_to_address': '',
        }

        pdf = pdf_by_num.get(inv_num)
        if pdf:
            inv['line_items'] = pdf.get('line_items', [])
            inv['subtotal'] = pdf.get('subtotal', 0) or 0
            inv['tax_amount'] = pdf.get('tax_amount', 0) or 0
            inv['ship_to_name'] = pdf.get('ship_to_name', '') or ''
            inv['ship_to_address'] = pdf.get('ship_to_address', '') or ''
            # Use PDF total if CSV total is missing
            if not inv['total'] and pdf.get('total'):
                inv['total'] = pdf['total']
                inv['balance_due'] = pdf['total']

        merged.append(inv)

    # Add any PDF-only invoices not in CSV
    for inv_num, pdf in pdf_by_num.items():
        if inv_num not in seen:
            merged.append({
                'invoice_number': inv_num,
                'invoice_date': pdf.get('invoice_date', '') or '',
                'due_date': pdf.get('due_date', '') or '',
                'po_number': '',
                'terms': '',
                'discount_amount': 0,
                'status': 'Open',
                'total': pdf.get('total', 0) or 0,
                'balance_due': pdf.get('total', 0) or 0,
                'amount_paid': 0,
                'subtotal': pdf.get('subtotal', 0) or 0,
                'tax_amount': pdf.get('tax_amount', 0) or 0,
                'line_items': pdf.get('line_items', []),
                'ship_to_name': pdf.get('ship_to_name', '') or '',
                'ship_to_address': pdf.get('ship_to_address', '') or '',
            })

    return merged


# ---------------------------------------------------------------------------
# Auto Job Linking
# ---------------------------------------------------------------------------

def auto_link_job(conn, ship_to_name, ship_to_address):
    """Fuzzy-match ship-to info against jobs table.

    Uses word overlap in name and address substring matching.

    Args:
        conn: SQLite connection.
        ship_to_name: Ship-to name from invoice.
        ship_to_address: Ship-to address from invoice.

    Returns:
        job_id (int) or None.
    """
    if not ship_to_name and not ship_to_address:
        return None

    jobs = conn.execute('SELECT id, name, address FROM jobs').fetchall()
    if not jobs:
        return None

    best_id = None
    best_score = 0

    name_words = set(w.lower() for w in re.findall(r'\w+', ship_to_name or '') if len(w) > 2)
    addr_lower = (ship_to_address or '').lower().strip()

    for job in jobs:
        score = 0
        job_name = (job['name'] or '').lower()
        job_addr = (job['address'] or '').lower()

        # Word overlap scoring
        if name_words:
            job_words = set(w.lower() for w in re.findall(r'\w+', job_name) if len(w) > 2)
            overlap = name_words & job_words
            if overlap:
                score += len(overlap) * 2

        # Address substring match
        if addr_lower and job_addr and (addr_lower in job_addr or job_addr in addr_lower):
            score += 3

        # Exact name containment
        if name_words and job_name:
            ship_clean = ' '.join(sorted(name_words))
            job_clean = ' '.join(sorted(set(w for w in re.findall(r'\w+', job_name) if len(w) > 2)))
            if ship_clean and job_clean and (ship_clean in job_clean or job_clean in ship_clean):
                score += 5

        if score > best_score:
            best_score = score
            best_id = job['id']

    # Require minimum score to avoid false positives
    return best_id if best_score >= 3 else None


# ---------------------------------------------------------------------------
# AI Review
# ---------------------------------------------------------------------------

def ai_review_invoices(invoices):
    """Review all imported invoices for anomalies using Claude Haiku.

    Checks: math errors, duplicate line items, backorder splits,
    tax anomalies, pricing concerns.

    Args:
        invoices: List of merged invoice dicts.

    Returns:
        List of flag dicts with severity, category, invoice_number, message.
    """
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key or not invoices:
        return []

    try:
        import anthropic
    except ImportError:
        return []

    # Build summary for AI review
    summary = []
    for inv in invoices:
        items_desc = []
        for item in inv.get('line_items', []):
            items_desc.append(
                f"  Line {item.get('line_number','?')}: {item.get('product_code','')} "
                f"{item.get('description','')} - Qty:{item.get('qty_shipped', item.get('qty_ordered',0))} "
                f"x ${item.get('unit_price',0):.2f} = ${item.get('extended_price',0):.2f}"
                f" (ordered:{item.get('qty_ordered',0)}, B/O:{item.get('qty_backordered',0)})"
            )
        summary.append(
            f"Invoice {inv['invoice_number']}:\n"
            f"  Subtotal: ${inv.get('subtotal',0):.2f}, Tax: ${inv.get('tax_amount',0):.2f}, "
            f"Total: ${inv.get('total',0):.2f}\n"
            f"  Ship To: {inv.get('ship_to_name','')}\n" +
            '\n'.join(items_desc)
        )

    prompt = """Review these supplier invoices for issues. Return ONLY valid JSON array of flags:
[{"severity": "error|warning|info", "category": "string", "invoice_number": "string", "message": "string"}]

Check for:
1. MATH ERRORS: qty × unit_price ≠ extended_price (tolerance $0.02)
2. DUPLICATE LINE ITEMS: same product code appearing multiple times on one invoice
3. BACKORDER SPLITS: items with qty_backordered > 0 (info - may have split invoice)
4. TAX ANOMALIES: effective tax rate outside 5-12% range
5. PRICING CONCERNS: $0 unit price, single item qty > 100, extended_price > $10,000

If no issues found, return an empty array [].

Invoices:
""" + '\n\n'.join(summary)

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        json_match = re.search(r'\[[\s\S]*\]', text)
        if json_match:
            return json.loads(json_match.group())
    except Exception as exc:
        print(f'[InvoiceImport] AI review error: {exc}')

    return []


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def import_billtrust_files(csv_content, pdf_content, supplier_config_id, conn):
    """Full import pipeline: parse -> extract -> merge -> upsert -> AI review.

    Args:
        csv_content: bytes of CSV file (may be None for PDF-only import).
        pdf_content: bytes of PDF file (may be None).
        supplier_config_id: FK to billtrust_config.id.
        conn: SQLite connection.

    Returns:
        Dict with stats, invoices, ai_flags, job_links.
    """
    from billtrust import _upsert_invoice

    # 1. Parse CSV (skip if PDF-only)
    csv_invoices = parse_billtrust_csv(csv_content) if csv_content else {}

    # 2. Extract PDF — send all pages together for better context
    pdf_extractions = []
    if pdf_content:
        pages = extract_pdf_pages(pdf_content)
        print(f'[InvoiceImport] PDF has {len(pages)} pages')
        if pages:
            pdf_extractions = ai_extract_all_invoices(pages)
            print(f'[InvoiceImport] AI extracted {len(pdf_extractions)} invoices from PDF')

    # 3. Merge
    merged = merge_csv_and_pdf(csv_invoices, pdf_extractions)

    # 4. Auto-link jobs and upsert
    stats = {'new': 0, 'updated': 0, 'errors': 0, 'total': len(merged)}
    job_links = {}
    imported_invoices = []

    for inv in merged:
        # Try auto-linking job
        job_id = auto_link_job(conn, inv.get('ship_to_name', ''), inv.get('ship_to_address', ''))
        if job_id:
            inv['job_id'] = job_id
            # Look up job name for results display
            job_row = conn.execute('SELECT name FROM jobs WHERE id = ?', (job_id,)).fetchone()
            if job_row:
                job_links[inv['invoice_number']] = job_row['name']

        try:
            was_new = _upsert_invoice(conn, supplier_config_id, inv)
            if was_new:
                stats['new'] += 1
            else:
                stats['updated'] += 1
            imported_invoices.append({
                'invoice_number': inv['invoice_number'],
                'total': inv.get('total', 0),
                'line_item_count': len(inv.get('line_items', [])),
                'is_new': was_new,
                'job_linked': inv['invoice_number'] in job_links,
            })
        except Exception as exc:
            print(f'[InvoiceImport] Upsert error for {inv["invoice_number"]}: {exc}')
            stats['errors'] += 1

    conn.commit()

    # 5. AI Review
    ai_flags = ai_review_invoices(merged)

    return {
        'stats': stats,
        'invoices': imported_invoices,
        'ai_flags': ai_flags,
        'job_links': job_links,
    }
