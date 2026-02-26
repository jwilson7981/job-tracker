"""Duplicate file detection: MD5 hash for exact matches, Claude AI for near-duplicates (PDFs)."""

import hashlib
import json
import os
import traceback
from database import get_db

# Map doc_type to table info: (table_name, hash_column, title_column, file_path_column)
DOC_TYPE_MAP = {
    'plan':           ('plans', 'file_hash', 'title', 'file_path'),
    'submittal':      ('submittal_files', 'file_hash', 'title', 'file_path'),
    'supplier_quote': ('supplier_quotes', 'file_hash', 'supplier_name', 'file_path'),
    'contract':       ('contracts', 'file_hash', 'title', 'file_path'),
    'license':        ('licenses', 'file_hash', 'license_name', 'file_path'),
    'closeout':       ('closeout_checklists', 'file_hash', 'item_name', 'file_path'),
}


def compute_file_hash(file_content):
    """Compute MD5 hash of file content bytes."""
    return hashlib.md5(file_content).hexdigest()


def check_exact_duplicate_all_tables(file_hash):
    """Check if a file with matching hash exists in ANY file table.

    Returns list of matches with table source info, or empty list.
    """
    if not file_hash:
        return []

    conn = get_db()
    matches = []
    try:
        for doc_type, (table, hash_col, title_col, _) in DOC_TYPE_MAP.items():
            try:
                rows = conn.execute(
                    f"SELECT id, {title_col} as name FROM {table} WHERE {hash_col} = ? AND {hash_col} != ''",
                    (file_hash,)
                ).fetchall()
                for r in rows:
                    d = dict(r)
                    d['source'] = doc_type
                    d['table'] = table
                    matches.append(d)
            except Exception:
                continue
    finally:
        conn.close()
    return matches


def check_exact_duplicate(file_hash, doc_type):
    """Check if a file with matching hash already exists in the relevant table."""
    info = DOC_TYPE_MAP.get(doc_type)
    if not info:
        return []

    table, hash_col, title_col, _ = info
    conn = get_db()
    try:
        rows = conn.execute(
            f"SELECT id, {title_col} as name, {hash_col} FROM {table} WHERE {hash_col} = ? AND {hash_col} != ''",
            (file_hash,)
        ).fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []
    finally:
        conn.close()


def extract_pdf_text(file_content, max_pages=5, max_chars=4000):
    """Extract text from PDF content bytes using pdfplumber."""
    try:
        import pdfplumber
        import io
        with pdfplumber.open(io.BytesIO(file_content)) as pdf:
            text = ''
            for page in pdf.pages[:max_pages]:
                page_text = page.extract_text() or ''
                text += page_text + '\n'
                if len(text) >= max_chars:
                    break
            return text[:max_chars]
    except Exception:
        return ''


def ai_extract_metadata(pdf_text):
    """Use Claude to extract key identifiers from PDF text for near-duplicate matching."""
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key or not pdf_text.strip():
        return None

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{
                "role": "user",
                "content": f"""Extract key identifiers from this document text. Return JSON only:
{{"title": "document title", "vendor": "company/vendor name", "reference_number": "any reference/quote/PO number", "project_name": "project or job name", "doc_type": "type of document"}}

If a field is not found, use empty string. Text:

{pdf_text[:3000]}"""
            }]
        )
        text = response.content[0].text.strip()
        if '```' in text:
            text = text.split('```')[1]
            if text.startswith('json'):
                text = text[4:]
            text = text.strip()
        return json.loads(text)
    except Exception as e:
        print(f"[duplicate_detector] AI metadata extraction failed: {e}")
        return None


def search_near_duplicates(metadata, doc_type):
    """Search for near-duplicates using extracted metadata."""
    if not metadata:
        return []

    info = DOC_TYPE_MAP.get(doc_type)
    if not info:
        return []

    table, _, title_col, _ = info
    conn = get_db()
    matches = []

    try:
        title = metadata.get('title', '')
        vendor = metadata.get('vendor', '')
        ref = metadata.get('reference_number', '')

        conditions = []
        params = []

        if title and len(title) > 3:
            conditions.append(f"{title_col} LIKE ?")
            params.append(f"%{title[:30]}%")

        if vendor and len(vendor) > 2:
            try:
                conn.execute(f"SELECT vendor FROM {table} LIMIT 0")
                conditions.append("vendor LIKE ?")
                params.append(f"%{vendor}%")
            except Exception:
                pass

        if ref and len(ref) > 2:
            for col in ('quote_number', 'license_number', 'title'):
                try:
                    conn.execute(f"SELECT {col} FROM {table} LIMIT 0")
                    conditions.append(f"{col} LIKE ?")
                    params.append(f"%{ref}%")
                    break
                except Exception:
                    continue

        if not conditions:
            return []

        where = " OR ".join(conditions)
        sql = f"SELECT id, {title_col} as name FROM {table} WHERE ({where}) LIMIT 10"
        rows = conn.execute(sql, params).fetchall()
        matches = [dict(r) for r in rows]
    except Exception as e:
        print(f"[duplicate_detector] Near-duplicate search error: {e}")
    finally:
        conn.close()

    return matches


def check_duplicate(file_content, doc_type, filename=''):
    """Full duplicate detection pipeline.

    Args:
        file_content: bytes of the uploaded file
        doc_type: string key from DOC_TYPE_MAP (can be empty to check all tables)
        filename: original filename for type detection

    Returns:
        dict with keys: is_duplicate, match_type ('exact'|'near'|None), matches, file_hash
    """
    file_hash = compute_file_hash(file_content)

    # Step 1: Exact hash match — check ALL tables if no doc_type, else just the one
    if doc_type and doc_type in DOC_TYPE_MAP:
        exact_matches = check_exact_duplicate(file_hash, doc_type)
    else:
        exact_matches = check_exact_duplicate_all_tables(file_hash)

    if exact_matches:
        return {
            'is_duplicate': True,
            'match_type': 'exact',
            'matches': exact_matches,
            'file_hash': file_hash
        }

    # Step 2: AI analysis for PDFs only (needs doc_type for near-dup table search)
    is_pdf = filename.lower().endswith('.pdf') if filename else False
    if is_pdf and doc_type and os.environ.get('ANTHROPIC_API_KEY'):
        pdf_text = extract_pdf_text(file_content)
        if pdf_text.strip():
            metadata = ai_extract_metadata(pdf_text)
            if metadata:
                near_matches = search_near_duplicates(metadata, doc_type)
                if near_matches:
                    return {
                        'is_duplicate': True,
                        'match_type': 'near',
                        'matches': near_matches,
                        'file_hash': file_hash
                    }

    return {
        'is_duplicate': False,
        'match_type': None,
        'matches': [],
        'file_hash': file_hash
    }
