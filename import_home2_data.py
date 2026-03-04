#!/usr/bin/env python3
"""One-time import script for Home2 Suites project data."""

import os
import sys
import shutil
import hashlib
from datetime import datetime

# Add project dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import get_db, init_db

# Run migrations first
init_db()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
PLANS_DIR = os.path.join(DATA_DIR, 'plans')
SUPPLIER_QUOTES_DIR = os.path.join(DATA_DIR, 'supplier_quotes')
SUBMITTALS_DIR = os.path.join(DATA_DIR, 'submittals')
os.makedirs(PLANS_DIR, exist_ok=True)
os.makedirs(SUPPLIER_QUOTES_DIR, exist_ok=True)
os.makedirs(SUBMITTALS_DIR, exist_ok=True)

DROPBOX = '/Users/James_1/Library/CloudStorage/Dropbox/LGHVAC/Projects/On Going Projects/DPLS Lot 2 Home 2 Suites Lee Summit'
JOB_ID = 1

conn = get_db()

# ─── Task 1: Import Mechanical Plans ─────────────────────────
print("=" * 60)
print("Task 1: Import Mechanical Plans PDF")
print("=" * 60)

src_plans = os.path.join(DROPBOX, 'Plans', 'Mechanical Plans.pdf')
if os.path.exists(src_plans):
    # Check if already imported
    existing = conn.execute("SELECT id FROM plans WHERE job_id = ? AND title = 'Mechanical Plans'", (JOB_ID,)).fetchone()
    if existing:
        print(f"  Already imported as plan ID {existing['id']}, skipping.")
    else:
        fname = f"{int(datetime.now().timestamp())}_Mechanical_Plans.pdf"
        shutil.copy2(src_plans, os.path.join(PLANS_DIR, fname))
        conn.execute(
            '''INSERT INTO plans (job_id, title, file_path, upload_date, plan_type, status, page_count)
               VALUES (?,?,?,?,?,?,?)''',
            (JOB_ID, 'Mechanical Plans', fname, datetime.now().strftime('%Y-%m-%d'),
             'Mechanical', 'Uploaded', 10)
        )
        conn.commit()
        print(f"  Imported: Mechanical Plans.pdf (10 pages) -> {fname}")
else:
    print(f"  ERROR: Source file not found: {src_plans}")

# ─── Task 2: Import Supplier Quote PDF ───────────────────────
print()
print("=" * 60)
print("Task 2: Import Supplier Quote PDF")
print("=" * 60)

src_quote = os.path.join(DROPBOX, 'Quote from Supplier', 'E-52804112-00 REV 7.22.25.pdf')
if os.path.exists(src_quote):
    existing = conn.execute("SELECT id FROM supplier_quotes WHERE job_id = ? AND quote_number = ?",
                           (JOB_ID, '52804112-00')).fetchone()
    if existing:
        print(f"  Already imported as quote ID {existing['id']}, skipping.")
    else:
        fname = f"{int(datetime.now().timestamp())}_E-52804112-00_REV_7.22.25.pdf"
        shutil.copy2(src_quote, os.path.join(SUPPLIER_QUOTES_DIR, fname))
        cursor = conn.execute(
            '''INSERT INTO supplier_quotes (job_id, supplier_name, quote_number, quote_date,
               status, subtotal, tax_amount, freight, total, file_path, notes)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
            (JOB_ID, 'Locke Supply', '52804112-00', '2025-07-22',
             'Received', 385705.61, 33267.11, 4510.00, 423482.72, fname,
             'REV 7.22.25 - Full material quote for Home2 Suites')
        )
        quote_id = cursor.lastrowid
        conn.commit()
        print(f"  Imported: Locke Supply quote #{quote_id} -> {fname}")
        print(f"  Subtotal: $385,705.61 | Tax: $33,267.11 | Freight: $4,510.00 | Total: $423,482.72")
else:
    print(f"  ERROR: Source file not found: {src_quote}")

# ─── Task 3: Import Submittals ───────────────────────────────
print()
print("=" * 60)
print("Task 3: Import Submittal PDFs into Library")
print("=" * 60)

# Source directories
SUBMITTAL_MAIN = os.path.join(DROPBOX, 'Submittals', 'untitled folder')
SUBMITTAL_APPROVED = os.path.join(DROPBOX, 'Submittals', 'Approved Submittals')
# Also loose files in Submittals root
SUBMITTAL_ROOT = os.path.join(DROPBOX, 'Submittals')

imported_count = 0
skipped_count = 0

def import_submittal_file(filepath, status='Submitted', submittal_num=None):
    """Import a submittal PDF into the library and create a submittal record."""
    global imported_count, skipped_count

    filename = os.path.basename(filepath)

    # Skip non-PDF files
    if not filename.lower().endswith('.pdf'):
        return

    # Skip DS_Store and zip files
    if filename.startswith('.') or filename.endswith('.zip'):
        return

    # Compute file hash
    with open(filepath, 'rb') as f:
        file_hash = hashlib.md5(f.read()).hexdigest()

    # Check for duplicate in library
    existing_lib = conn.execute('SELECT id FROM submittal_files WHERE file_hash = ?', (file_hash,)).fetchone()
    if existing_lib:
        lib_id = existing_lib['id']
        # Still create a submittal record if not linked yet for this job
        existing_sub = conn.execute(
            'SELECT id FROM submittals WHERE job_id = ? AND submittal_file_id = ?',
            (JOB_ID, lib_id)
        ).fetchone()
        if existing_sub:
            skipped_count += 1
            return
    else:
        # Copy file to data/submittals/
        safe_name = filename.replace(' ', '_').replace('&', 'and').replace('@', 'AT')
        # Remove special chars that could cause issues
        safe_name = ''.join(c for c in safe_name if c.isalnum() or c in '._-()[]')
        dest_name = f"{int(datetime.now().timestamp())}_{safe_name}"
        shutil.copy2(filepath, os.path.join(SUBMITTALS_DIR, dest_name))

        # Parse description from filename
        desc = filename.replace('.pdf', '').replace('.PDF', '')
        # Extract vendor hint from filename
        vendor = ''
        if 'Locke' in filename:
            vendor = 'Locke Supply'

        # Create library entry
        cursor = conn.execute(
            '''INSERT INTO submittal_files (title, file_path, file_hash, vendor, category, description)
               VALUES (?,?,?,?,?,?)''',
            (desc, dest_name, file_hash, vendor, 'HVAC', desc)
        )
        lib_id = cursor.lastrowid

    # Get next submittal number
    if submittal_num is None:
        max_num = conn.execute('SELECT MAX(submittal_number) FROM submittals WHERE job_id = ?',
                               (JOB_ID,)).fetchone()[0] or 0
        submittal_num = max_num + 1

    # Parse description from filename
    desc = filename.replace('.pdf', '').replace('.PDF', '')

    # Create submittal record linked to library
    conn.execute(
        '''INSERT INTO submittals (job_id, submittal_number, description, status,
           date_submitted, submittal_file_id, file_path, created_by)
           VALUES (?,?,?,?,?,?,?,?)''',
        (JOB_ID, submittal_num, desc, status,
         datetime.now().strftime('%Y-%m-%d'), lib_id, '', None)
    )
    imported_count += 1
    print(f"  [{imported_count:3d}] {status:20s} | {desc[:60]}")


# Import from untitled folder (main submittal files)
if os.path.isdir(SUBMITTAL_MAIN):
    print(f"\nImporting from: untitled folder/")
    for f in sorted(os.listdir(SUBMITTAL_MAIN)):
        fpath = os.path.join(SUBMITTAL_MAIN, f)
        if os.path.isfile(fpath):
            import_submittal_file(fpath, 'Submitted')
else:
    print(f"  Directory not found: {SUBMITTAL_MAIN}")

# Import from Approved Submittals
if os.path.isdir(SUBMITTAL_APPROVED):
    print(f"\nImporting from: Approved Submittals/")
    for f in sorted(os.listdir(SUBMITTAL_APPROVED)):
        fpath = os.path.join(SUBMITTAL_APPROVED, f)
        if os.path.isfile(fpath):
            import_submittal_file(fpath, 'Approved')
else:
    print(f"  Directory not found: {SUBMITTAL_APPROVED}")

# Import loose PDF files from Submittals root (not in subfolders)
print(f"\nImporting from: Submittals/ root (loose files)")
for f in sorted(os.listdir(SUBMITTAL_ROOT)):
    fpath = os.path.join(SUBMITTAL_ROOT, f)
    if os.path.isfile(fpath) and f.lower().endswith('.pdf'):
        import_submittal_file(fpath, 'Submitted')

conn.commit()

print(f"\n{'=' * 60}")
print(f"Import Complete!")
print(f"  Submittals imported: {imported_count}")
print(f"  Duplicates skipped: {skipped_count}")
print(f"{'=' * 60}")

# Summary
plans_count = conn.execute("SELECT COUNT(*) FROM plans WHERE job_id = ?", (JOB_ID,)).fetchone()[0]
quotes_count = conn.execute("SELECT COUNT(*) FROM supplier_quotes WHERE job_id = ?", (JOB_ID,)).fetchone()[0]
submittals_count = conn.execute("SELECT COUNT(*) FROM submittals WHERE job_id = ?", (JOB_ID,)).fetchone()[0]
lib_count = conn.execute("SELECT COUNT(*) FROM submittal_files").fetchone()[0]

print(f"\nHome 2 Suites (Job #{JOB_ID}) totals:")
print(f"  Plans: {plans_count}")
print(f"  Supplier Quotes: {quotes_count}")
print(f"  Submittals: {submittals_count}")
print(f"  Library Files: {lib_count}")

conn.close()
