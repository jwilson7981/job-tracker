from flask import Flask, render_template, request, jsonify, send_file, session, redirect, url_for, g
from functools import wraps
import json
import os
import hashlib
import socket
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()
from database import init_db, get_db, build_snapshot, save_snapshot, restore_snapshot, get_job_data
from chatbot_engine import generate_bot_response
from claude_chatbot import generate_claude_response
from duplicate_detector import check_duplicate
from tax_rates import lookup_tax
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False
app.secret_key = os.environ.get('SECRET_KEY', 'construction-mgmt-secret-key-change-in-prod')

# ─── Auth Helpers ────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

def role_required(*roles):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if 'user_id' not in session:
                return redirect(url_for('login'))
            if session.get('role') not in roles:
                return 'Access denied', 403
            return f(*args, **kwargs)
        return decorated
    return decorator

def api_login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Not authenticated'}), 401
        return f(*args, **kwargs)
    return decorated

def api_role_required(*roles):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if 'user_id' not in session:
                return jsonify({'error': 'Not authenticated'}), 401
            if session.get('role') not in roles:
                return jsonify({'error': 'Access denied'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator

@app.context_processor
def inject_user():
    if 'user_id' in session:
        return {
            'current_user': {
                'id': session['user_id'],
                'username': session.get('username', ''),
                'display_name': session.get('display_name', ''),
                'role': session.get('role', 'employee'),
            }
        }
    return {'current_user': None}

# ─── Auth Routes ─────────────────────────────────────────────────

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        conn = get_db()
        user = conn.execute('SELECT * FROM users WHERE username = ? AND is_active = 1', (username,)).fetchone()
        conn.close()
        if user and check_password_hash(user['password_hash'], password):
            session['user_id'] = user['id']
            session['username'] = user['username']
            session['display_name'] = user['display_name']
            session['role'] = user['role']
            return redirect(url_for('index'))
        return render_template('login.html', error='Invalid username or password')
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

# ─── Index / Role Redirect ──────────────────────────────────────

@app.route('/')
@login_required
def index():
    role = session.get('role', 'employee')
    if role in ('owner', 'admin'):
        return redirect(url_for('dashboard'))
    elif role == 'project_manager':
        return redirect(url_for('materials_list'))
    elif role == 'warehouse':
        return redirect(url_for('materials_list'))
    else:
        return redirect(url_for('time_entry'))

# ─── Dashboard ───────────────────────────────────────────────────

@app.route('/dashboard')
@role_required('owner', 'admin')
def dashboard():
    return render_template('dashboard.html')

@app.route('/api/dashboard')
@api_role_required('owner', 'admin')
def api_dashboard():
    conn = get_db()
    jobs = conn.execute('SELECT * FROM jobs ORDER BY name').fetchall()

    total_jobs = len(jobs)
    active_jobs = sum(1 for j in jobs if j['status'] == 'In Progress')
    completed_jobs = sum(1 for j in jobs if j['status'] == 'Complete')

    # Financial summary
    total_expenses = conn.execute('SELECT COALESCE(SUM(amount), 0) FROM expenses').fetchone()[0]
    total_payments = conn.execute('SELECT COALESCE(SUM(amount), 0) FROM payments').fetchone()[0]
    total_invoiced = conn.execute("SELECT COALESCE(SUM(amount), 0) FROM client_invoices WHERE status = 'Paid'").fetchone()[0]

    # Material costs
    material_cost = 0
    for job in jobs:
        items = conn.execute(
            'SELECT total_net_price, qty_ordered, price_per FROM line_items WHERE job_id = ?',
            (job['id'],)
        ).fetchall()
        material_cost += sum(
            (row['total_net_price'] or 0) if (row['total_net_price'] or 0)
            else (row['qty_ordered'] or 0) * (row['price_per'] or 0)
            for row in items
        )

    # Open service calls
    open_calls = conn.execute("SELECT COUNT(*) FROM service_calls WHERE status NOT IN ('Resolved','Closed')").fetchone()[0]

    # Pending time entries
    pending_hours = conn.execute("SELECT COALESCE(SUM(hours), 0) FROM time_entries WHERE approved = 0").fetchone()[0]

    # Stage breakdown
    stages = ['Needs Bid', 'Bid Complete', 'In Progress', 'Complete']
    stage_counts = {}
    for s in stages:
        stage_counts[s] = sum(1 for j in jobs if j['status'] == s)

    conn.close()
    return jsonify({
        'total_jobs': total_jobs,
        'active_jobs': active_jobs,
        'completed_jobs': completed_jobs,
        'material_cost': round(material_cost, 2),
        'total_expenses': round(total_expenses, 2),
        'total_payments': round(total_payments, 2),
        'total_invoiced': round(total_invoiced, 2),
        'open_service_calls': open_calls,
        'pending_hours': round(pending_hours, 1),
        'stage_counts': stage_counts,
    })

# ─── Materials (relocated from old / and /job routes) ────────────

@app.route('/materials')
@role_required('owner', 'admin', 'project_manager', 'warehouse')
def materials_list():
    conn = get_db()
    jobs = conn.execute('SELECT * FROM jobs ORDER BY updated_at DESC').fetchall()
    conn.close()
    return render_template('materials/list.html', jobs=jobs)

@app.route('/materials/job/<int:job_id>')
@role_required('owner', 'admin', 'project_manager', 'warehouse')
def materials_job(job_id):
    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    conn.close()
    if not job:
        return 'Job not found', 404
    return render_template('materials/job.html', job=job)

@app.route('/materials/job/<int:job_id>/history')
@role_required('owner', 'admin', 'project_manager', 'warehouse')
def materials_history(job_id):
    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    conn.close()
    if not job:
        return 'Job not found', 404
    return render_template('materials/history.html', job=job)

# ─── Existing Job API Routes (unchanged functionality) ───────────

@app.route('/api/jobs', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def create_job():
    data = request.get_json()
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Job name is required'}), 400

    address = (data.get('address') or '').strip()
    city = (data.get('city') or '').strip()
    state = (data.get('state') or '').strip()
    zip_code = (data.get('zip_code') or '').strip()
    tax_rate = data.get('tax_rate')

    if tax_rate is None and zip_code:
        tax_info = lookup_tax(zip_code)
        tax_rate = tax_info['tax_rate']
        if not city:
            city = tax_info['city']
        if not state:
            state = tax_info['state']
    tax_rate = tax_rate or 0
    supplier_account = (data.get('supplier_account') or '').strip()

    conn = get_db()
    cursor = conn.execute(
        'INSERT INTO jobs (name, status, address, city, state, zip_code, tax_rate, supplier_account) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        (name, 'Needs Bid', address, city, state, zip_code, tax_rate, supplier_account)
    )
    job_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'id': job_id, 'name': name}), 201

@app.route('/api/job/<int:job_id>')
@api_login_required
def get_job(job_id):
    conn = get_db()
    data = get_job_data(conn, job_id)
    conn.close()
    if not data:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify(data)

@app.route('/api/job/<int:job_id>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def update_job(job_id):
    data = request.get_json()
    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    if not job:
        conn.close()
        return jsonify({'error': 'Job not found'}), 404

    name = (data.get('name') or '').strip()
    status = (data.get('status') or '').strip()
    if name:
        conn.execute('UPDATE jobs SET name = ?, updated_at = datetime("now","localtime") WHERE id = ?', (name, job_id))
    if status:
        conn.execute('UPDATE jobs SET status = ?, updated_at = datetime("now","localtime") WHERE id = ?', (status, job_id))

    for field in ('address', 'city', 'state', 'zip_code', 'supplier_account'):
        if field in data:
            val = (data[field] or '').strip()
            conn.execute(f'UPDATE jobs SET {field} = ?, updated_at = datetime("now","localtime") WHERE id = ?', (val, job_id))
    if 'tax_rate' in data:
        conn.execute('UPDATE jobs SET tax_rate = ?, updated_at = datetime("now","localtime") WHERE id = ?',
                     (float(data['tax_rate'] or 0), job_id))

    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/job/<int:job_id>', methods=['DELETE'])
@api_role_required('owner', 'admin')
def delete_job(job_id):
    conn = get_db()
    conn.execute('DELETE FROM jobs WHERE id = ?', (job_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/analytics')
@api_role_required('owner', 'admin')
def get_analytics():
    conn = get_db()
    jobs = conn.execute('SELECT * FROM jobs ORDER BY name').fetchall()

    stages = ['Needs Bid', 'Bid Complete', 'In Progress', 'Complete']
    result = {}
    grand_subtotal = 0
    grand_tax = 0
    grand_shipping = 0

    for stage in stages:
        result[stage] = {'count': 0, 'jobs': [], 'subtotal': 0, 'tax': 0, 'shipping': 0, 'total': 0}

    for job in jobs:
        stage = job['status'] if job['status'] in stages else 'Needs Bid'
        items = conn.execute(
            'SELECT total_net_price, qty_ordered, price_per FROM line_items WHERE job_id = ?',
            (job['id'],)
        ).fetchall()
        subtotal = sum((row['total_net_price'] or 0) if (row['total_net_price'] or 0) else (row['qty_ordered'] or 0) * (row['price_per'] or 0) for row in items)
        tax_rate = job['tax_rate'] or 0
        tax_amount = round(subtotal * tax_rate / 100, 2)

        is_out_of_state = (job['state'] or '').strip().upper() not in ('', 'OK', 'OKLAHOMA')
        shipping = 10000.0 if is_out_of_state else 0.0

        job_total = round(subtotal + tax_amount + shipping, 2)

        result[stage]['count'] += 1
        result[stage]['subtotal'] += subtotal
        result[stage]['tax'] += tax_amount
        result[stage]['shipping'] += shipping
        result[stage]['total'] += job_total
        result[stage]['jobs'].append({
            'id': job['id'],
            'name': job['name'],
            'location': f"{job['city'] or ''} {job['state'] or ''}".strip() or '—',
            'subtotal': round(subtotal, 2),
            'tax': tax_amount,
            'shipping': shipping,
            'total': job_total,
        })

        grand_subtotal += subtotal
        grand_tax += tax_amount
        grand_shipping += shipping

    for stage in stages:
        result[stage]['subtotal'] = round(result[stage]['subtotal'], 2)
        result[stage]['tax'] = round(result[stage]['tax'], 2)
        result[stage]['shipping'] = round(result[stage]['shipping'], 2)
        result[stage]['total'] = round(result[stage]['total'], 2)

    conn.close()
    return jsonify({
        'stages': result,
        'stage_order': stages,
        'grand_subtotal': round(grand_subtotal, 2),
        'grand_tax': round(grand_tax, 2),
        'grand_shipping': round(grand_shipping, 2),
        'grand_total': round(grand_subtotal + grand_tax + grand_shipping, 2),
    })

@app.route('/api/job/<int:job_id>/line-items', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def save_line_items(job_id):
    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    if not job:
        conn.close()
        return jsonify({'error': 'Job not found'}), 404

    save_snapshot(conn, job_id, 'Before master list update')

    data = request.get_json()
    items = data.get('line_items', [])

    existing = conn.execute('SELECT id, line_number FROM line_items WHERE job_id = ?', (job_id,)).fetchall()
    existing_ids = {row['id'] for row in existing}

    incoming_ids = set()
    for item in items:
        li_id = item.get('id')
        line_number = item.get('line_number', 0)
        stock_ns = item.get('stock_ns', '')
        sku = item.get('sku', '')
        description = item.get('description', '')
        quote_qty = item.get('quote_qty', 0) or 0
        qty_ordered = item.get('qty_ordered', 0) or 0
        price_per = item.get('price_per', 0) or 0
        total_net_price = item.get('total_net_price', 0) or 0

        if li_id and li_id in existing_ids:
            conn.execute(
                '''UPDATE line_items SET line_number=?, stock_ns=?, sku=?, description=?,
                   quote_qty=?, qty_ordered=?, price_per=?, total_net_price=? WHERE id=? AND job_id=?''',
                (line_number, stock_ns, sku, description, quote_qty, qty_ordered, price_per, total_net_price, li_id, job_id)
            )
            incoming_ids.add(li_id)
        else:
            cursor = conn.execute(
                '''INSERT INTO line_items (job_id, line_number, stock_ns, sku, description, quote_qty, qty_ordered, price_per, total_net_price)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (job_id, line_number, stock_ns, sku, description, quote_qty, qty_ordered, price_per, total_net_price)
            )
            incoming_ids.add(cursor.lastrowid)

    removed = existing_ids - incoming_ids
    for rid in removed:
        conn.execute('DELETE FROM line_items WHERE id = ?', (rid,))

    conn.execute('UPDATE jobs SET updated_at = datetime("now","localtime") WHERE id = ?', (job_id,))
    conn.commit()

    result = get_job_data(conn, job_id)
    conn.close()
    return jsonify(result)

def _save_entries(job_id, table_name, data):
    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    if not job:
        conn.close()
        return jsonify({'error': 'Job not found'}), 404

    tab_label = table_name.replace('_entries', '')
    save_snapshot(conn, job_id, f'Before {tab_label} update')

    entries = data.get('entries', [])

    valid_items = conn.execute('SELECT id FROM line_items WHERE job_id = ?', (job_id,)).fetchall()
    valid_ids = {row['id'] for row in valid_items}

    for entry in entries:
        line_item_id = entry.get('line_item_id')
        if line_item_id not in valid_ids:
            continue
        column_number = entry.get('column_number')
        quantity = entry.get('quantity', 0) or 0

        if quantity == 0:
            conn.execute(
                f'DELETE FROM {table_name} WHERE line_item_id = ? AND column_number = ?',
                (line_item_id, column_number)
            )
        else:
            existing = conn.execute(
                f'SELECT id, entry_date FROM {table_name} WHERE line_item_id = ? AND column_number = ?',
                (line_item_id, column_number)
            ).fetchone()

            if existing:
                conn.execute(
                    f'UPDATE {table_name} SET quantity = ? WHERE id = ?',
                    (quantity, existing['id'])
                )
            else:
                entry_date = datetime.now().strftime('%Y-%m-%d')
                conn.execute(
                    f'INSERT INTO {table_name} (line_item_id, column_number, quantity, entry_date) VALUES (?, ?, ?, ?)',
                    (line_item_id, column_number, quantity, entry_date)
                )

    conn.execute('UPDATE jobs SET updated_at = datetime("now","localtime") WHERE id = ?', (job_id,))
    conn.commit()

    result = get_job_data(conn, job_id)
    conn.close()
    return jsonify(result)

@app.route('/api/job/<int:job_id>/received', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def save_received(job_id):
    return _save_entries(job_id, 'received_entries', request.get_json())

@app.route('/api/job/<int:job_id>/shipped', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def save_shipped(job_id):
    return _save_entries(job_id, 'shipped_entries', request.get_json())

@app.route('/api/job/<int:job_id>/invoiced', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def save_invoiced(job_id):
    return _save_entries(job_id, 'invoiced_entries', request.get_json())

# ─── Tax Lookup ─────────────────────────────────────────────────

@app.route('/api/tax-lookup/<zip_code>')
@api_login_required
def tax_lookup(zip_code):
    result = lookup_tax(zip_code)
    return jsonify(result)

# ─── Version History ────────────────────────────────────────────

@app.route('/api/job/<int:job_id>/versions')
@api_login_required
def list_versions(job_id):
    conn = get_db()
    versions = conn.execute(
        'SELECT id, description, created_at FROM versions WHERE job_id = ? ORDER BY created_at DESC',
        (job_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(v) for v in versions])

@app.route('/api/job/<int:job_id>/versions/<int:vid>')
@api_login_required
def get_version(job_id, vid):
    conn = get_db()
    version = conn.execute(
        'SELECT * FROM versions WHERE id = ? AND job_id = ?', (vid, job_id)
    ).fetchone()
    conn.close()
    if not version:
        return jsonify({'error': 'Version not found'}), 404
    return jsonify({
        'id': version['id'],
        'description': version['description'],
        'created_at': version['created_at'],
        'snapshot': json.loads(version['snapshot']),
    })

@app.route('/api/job/<int:job_id>/versions/<int:vid>/revert', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def revert_version(job_id, vid):
    conn = get_db()
    version = conn.execute(
        'SELECT * FROM versions WHERE id = ? AND job_id = ?', (vid, job_id)
    ).fetchone()
    if not version:
        conn.close()
        return jsonify({'error': 'Version not found'}), 404

    save_snapshot(conn, job_id, f'Before revert to version {vid}')

    snapshot_data = json.loads(version['snapshot'])
    restore_snapshot(conn, job_id, snapshot_data)
    conn.commit()

    result = get_job_data(conn, job_id)
    conn.close()
    return jsonify(result)

# ─── PDF Import ─────────────────────────────────────────────────

@app.route('/api/job/<int:job_id>/import-pdf', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def import_pdf(job_id):
    import re
    import pdfplumber

    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    conn.close()
    if not job:
        return jsonify({'error': 'Job not found'}), 404

    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'File must be a PDF'}), 400

    try:
        pdf = pdfplumber.open(file)
        all_text = '\n'.join(page.extract_text() or '' for page in pdf.pages)
        pdf.close()
    except Exception as e:
        return jsonify({'error': f'Could not read PDF: {str(e)}'}), 400

    pattern = re.compile(
        r'^(\d+)\s+(.+)\s+([\d,]+)\s+(\d+)\s+(\d+)\s+(\w+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)$'
    )

    lines = all_text.split('\n')
    items = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        m = pattern.match(line)
        if m:
            qty_ordered = float(m.group(3).replace(',', ''))
            price_per = float(m.group(7).replace(',', ''))
            amount_net = float(m.group(8).replace(',', ''))

            desc = ''
            if i + 1 < len(lines):
                desc = lines[i + 1].strip()

            items.append({
                'line_number': int(m.group(1)),
                'sku': m.group(2).strip(),
                'description': desc,
                'qty_ordered': qty_ordered,
                'quote_qty': qty_ordered,
                'price_per': price_per,
                'total_net_price': amount_net,
                'stock_ns': '',
            })
            i += 2
        else:
            i += 1

    if not items:
        return jsonify({'error': 'No line items found in PDF. Check that the format matches a supplier quote.'}), 400

    return jsonify({'items': items, 'count': len(items)})

# ─── Excel Export ───────────────────────────────────────────────

@app.route('/api/job/<int:job_id>/export')
@api_role_required('owner', 'admin', 'project_manager')
def export_excel(job_id):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    conn = get_db()
    data = get_job_data(conn, job_id)
    conn.close()
    if not data:
        return 'Job not found', 404

    wb = Workbook()
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )
    header_fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
    header_font = Font(color='FFFFFF', bold=True, size=11)
    editable_fill = PatternFill(start_color='D6E4F0', end_color='D6E4F0', fill_type='solid')
    computed_fill = PatternFill(start_color='D9D9D9', end_color='D9D9D9', fill_type='solid')
    green_fill = PatternFill(start_color='C6EFCE', end_color='C6EFCE', fill_type='solid')
    amber_fill = PatternFill(start_color='FFEB9C', end_color='FFEB9C', fill_type='solid')
    money_format = '#,##0.00'

    items = data['line_items']

    ws1 = wb.active
    ws1.title = 'Master List'
    headers1 = ['Line #', 'Stock/NS', 'SKU', 'Description', 'Quote QTY',
                 'QTY Ordered', 'Price Per', 'Total Net Price',
                 'Total Received', 'Total Shipped', 'Total Invoiced']
    for c, h in enumerate(headers1, 1):
        cell = ws1.cell(row=1, column=c, value=h)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center')
        cell.border = thin_border

    for r, item in enumerate(items, 2):
        vals = [
            item['line_number'], item['stock_ns'], item['sku'], item['description'],
            item['quote_qty'], item['qty_ordered'], item['price_per'],
        ]
        for c, v in enumerate(vals, 1):
            cell = ws1.cell(row=r, column=c, value=v)
            cell.fill = editable_fill
            cell.border = thin_border
            if c in (5, 6, 7):
                cell.number_format = money_format if c == 7 else '#,##0'

        cell = ws1.cell(row=r, column=8)
        cell.value = item['total_net_price']
        cell.fill = computed_fill
        cell.border = thin_border
        cell.number_format = money_format

        for offset, sheet_name in [(9, 'Received'), (10, 'Shipped to Site'), (11, 'Invoiced')]:
            cell = ws1.cell(row=r, column=offset)
            cell.value = f"='{sheet_name}'!D{r}"
            cell.fill = green_fill
            cell.border = thin_border
            cell.number_format = '#,##0'

    widths1 = [8, 10, 15, 35, 12, 12, 12, 15, 14, 14, 14]
    for i, w in enumerate(widths1, 1):
        ws1.column_dimensions[get_column_letter(i)].width = w

    tab_configs = [
        ('Received', 'received_entries'),
        ('Shipped to Site', 'shipped_entries'),
        ('Invoiced', 'invoiced_entries'),
    ]

    for tab_name, entry_key in tab_configs:
        ws = wb.create_sheet(title=tab_name)
        headers = ['Line #', 'Description', 'Total Ordered', 'Total']
        date_headers = {}
        for item in items:
            entries = item.get(entry_key, {})
            for col_num, entry in entries.items():
                if entry.get('entry_date') and col_num not in date_headers:
                    date_headers[col_num] = entry['entry_date']

        for c in range(1, 16):
            headers.append(date_headers.get(str(c), f'Col {c}'))

        for c, h in enumerate(headers, 1):
            cell = ws.cell(row=1, column=c, value=h)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal='center')
            cell.border = thin_border

        for r, item in enumerate(items, 2):
            cell = ws.cell(row=r, column=1, value=item['line_number'])
            cell.fill = computed_fill
            cell.border = thin_border

            cell = ws.cell(row=r, column=2, value=item['description'])
            cell.fill = computed_fill
            cell.border = thin_border

            cell = ws.cell(row=r, column=3)
            cell.value = f"='Master List'!F{r}"
            cell.fill = computed_fill
            cell.border = thin_border

            cell = ws.cell(row=r, column=4)
            cell.value = f'=SUM(E{r}:S{r})'
            cell.border = thin_border
            cell.number_format = '#,##0'

            total_val = sum(
                (item.get(entry_key, {}).get(str(c), {}).get('quantity', 0) or 0)
                for c in range(1, 16)
            )
            ordered_val = item['qty_ordered']
            if ordered_val > 0 and total_val >= ordered_val:
                cell.fill = green_fill
            elif total_val > 0:
                cell.fill = amber_fill
            else:
                cell.fill = computed_fill

            entries = item.get(entry_key, {})
            for col in range(1, 16):
                cell = ws.cell(row=r, column=col + 4)
                entry = entries.get(str(col), {})
                qty = entry.get('quantity', 0) or 0
                if qty:
                    cell.value = qty
                cell.fill = editable_fill
                cell.border = thin_border

        ws.column_dimensions['A'].width = 8
        ws.column_dimensions['B'].width = 35
        ws.column_dimensions['C'].width = 14
        ws.column_dimensions['D'].width = 10
        for col in range(5, 20):
            ws.column_dimensions[get_column_letter(col)].width = 12

    export_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
    os.makedirs(export_dir, exist_ok=True)
    safe_name = "".join(c if c.isalnum() or c in ' -_' else '' for c in data['job']['name'])
    filepath = os.path.join(export_dir, f'{safe_name}.xlsx')
    wb.save(filepath)

    return send_file(filepath, as_attachment=True,
                     download_name=f"{safe_name}.xlsx",
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

# ─── Accounting ─────────────────────────────────────────────────

@app.route('/accounting')
@role_required('owner', 'admin')
def accounting_overview():
    conn = get_db()
    jobs = conn.execute('SELECT * FROM jobs ORDER BY name').fetchall()
    conn.close()
    return render_template('accounting/overview.html', jobs=jobs)

@app.route('/accounting/job/<int:job_id>')
@role_required('owner', 'admin')
def accounting_job(job_id):
    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    conn.close()
    if not job:
        return 'Job not found', 404
    return render_template('accounting/job.html', job=job)

@app.route('/api/accounting/job/<int:job_id>')
@api_role_required('owner', 'admin')
def api_accounting_job(job_id):
    conn = get_db()
    expenses = conn.execute('SELECT * FROM expenses WHERE job_id = ? ORDER BY expense_date DESC', (job_id,)).fetchall()
    payments = conn.execute('SELECT * FROM payments WHERE job_id = ? ORDER BY payment_date DESC', (job_id,)).fetchall()
    invoices = conn.execute('SELECT * FROM client_invoices WHERE job_id = ? ORDER BY issue_date DESC', (job_id,)).fetchall()

    # Material costs
    items = conn.execute(
        'SELECT total_net_price, qty_ordered, price_per FROM line_items WHERE job_id = ?', (job_id,)
    ).fetchall()
    material_cost = sum(
        (row['total_net_price'] or 0) if (row['total_net_price'] or 0)
        else (row['qty_ordered'] or 0) * (row['price_per'] or 0)
        for row in items
    )

    conn.close()
    return jsonify({
        'expenses': [dict(e) for e in expenses],
        'payments': [dict(p) for p in payments],
        'invoices': [dict(i) for i in invoices],
        'material_cost': round(material_cost, 2),
        'total_expenses': round(sum(e['amount'] or 0 for e in expenses), 2),
        'total_payments': round(sum(p['amount'] or 0 for p in payments), 2),
        'total_invoiced': round(sum(i['amount'] or 0 for i in invoices), 2),
    })

@app.route('/api/accounting/expenses', methods=['POST'])
@api_role_required('owner', 'admin')
def create_expense():
    data = request.get_json()
    conn = get_db()
    conn.execute(
        'INSERT INTO expenses (job_id, category, vendor, description, amount, expense_date, created_by) VALUES (?,?,?,?,?,?,?)',
        (data['job_id'], data.get('category',''), data.get('vendor',''), data.get('description',''),
         float(data.get('amount', 0)), data.get('expense_date', datetime.now().strftime('%Y-%m-%d')),
         session.get('user_id'))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True}), 201

@app.route('/api/accounting/expenses/<int:eid>', methods=['DELETE'])
@api_role_required('owner', 'admin')
def delete_expense(eid):
    conn = get_db()
    conn.execute('DELETE FROM expenses WHERE id = ?', (eid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/accounting/payments', methods=['POST'])
@api_role_required('owner', 'admin')
def create_payment():
    data = request.get_json()
    conn = get_db()
    conn.execute(
        'INSERT INTO payments (job_id, amount, payment_method, reference_number, description, payment_date, created_by) VALUES (?,?,?,?,?,?,?)',
        (data['job_id'], float(data.get('amount', 0)), data.get('payment_method',''),
         data.get('reference_number',''), data.get('description',''),
         data.get('payment_date', datetime.now().strftime('%Y-%m-%d')), session.get('user_id'))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True}), 201

@app.route('/api/accounting/payments/<int:pid>', methods=['DELETE'])
@api_role_required('owner', 'admin')
def delete_payment(pid):
    conn = get_db()
    conn.execute('DELETE FROM payments WHERE id = ?', (pid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/accounting/invoices', methods=['POST'])
@api_role_required('owner', 'admin')
def create_invoice():
    data = request.get_json()
    conn = get_db()
    conn.execute(
        '''INSERT INTO client_invoices (job_id, invoice_number, amount, status, description, issue_date, due_date, created_by)
           VALUES (?,?,?,?,?,?,?,?)''',
        (data['job_id'], data.get('invoice_number',''), float(data.get('amount', 0)),
         data.get('status', 'Draft'), data.get('description',''),
         data.get('issue_date', datetime.now().strftime('%Y-%m-%d')),
         data.get('due_date',''), session.get('user_id'))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True}), 201

@app.route('/api/accounting/invoices/<int:iid>', methods=['PUT'])
@api_role_required('owner', 'admin')
def update_invoice(iid):
    data = request.get_json()
    conn = get_db()
    fields = []
    values = []
    for f in ('status', 'amount', 'invoice_number', 'description', 'due_date', 'paid_date'):
        if f in data:
            fields.append(f'{f} = ?')
            values.append(data[f])
    if fields:
        values.append(iid)
        conn.execute(f"UPDATE client_invoices SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/accounting/invoices/<int:iid>', methods=['DELETE'])
@api_role_required('owner', 'admin')
def delete_invoice(iid):
    conn = get_db()
    conn.execute('DELETE FROM client_invoices WHERE id = ?', (iid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ─── Payroll / Time Entry ───────────────────────────────────────

@app.route('/payroll')
@role_required('owner')
def payroll_overview():
    return render_template('payroll/overview.html')

@app.route('/payroll/employee/<int:user_id>')
@role_required('owner')
def payroll_employee(user_id):
    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    conn.close()
    if not user:
        return 'Employee not found', 404
    return render_template('payroll/employee.html', employee=user)

@app.route('/time-entry')
@login_required
def time_entry():
    conn = get_db()
    jobs = conn.execute('SELECT id, name FROM jobs ORDER BY name').fetchall()
    conn.close()
    return render_template('payroll/time_entry.html', jobs=jobs)

@app.route('/api/payroll/summary')
@api_role_required('owner')
def api_payroll_summary():
    conn = get_db()
    users = conn.execute('SELECT * FROM users WHERE is_active = 1 ORDER BY display_name').fetchall()
    result = []
    for u in users:
        entries = conn.execute(
            'SELECT COALESCE(SUM(hours), 0) as total_hours, COALESCE(SUM(hours * hourly_rate), 0) as total_pay FROM time_entries WHERE user_id = ?',
            (u['id'],)
        ).fetchone()
        pending = conn.execute(
            'SELECT COALESCE(SUM(hours), 0) FROM time_entries WHERE user_id = ? AND approved = 0',
            (u['id'],)
        ).fetchone()[0]
        result.append({
            'id': u['id'],
            'display_name': u['display_name'],
            'username': u['username'],
            'role': u['role'],
            'hourly_rate': u['hourly_rate'] or 0,
            'total_hours': round(entries['total_hours'], 1),
            'total_pay': round(entries['total_pay'], 2),
            'pending_hours': round(pending, 1),
        })
    conn.close()
    return jsonify(result)

@app.route('/api/payroll/employee/<int:user_id>')
@api_role_required('owner')
def api_payroll_employee(user_id):
    conn = get_db()
    entries = conn.execute(
        '''SELECT te.*, j.name as job_name FROM time_entries te
           LEFT JOIN jobs j ON te.job_id = j.id
           WHERE te.user_id = ? ORDER BY te.work_date DESC''',
        (user_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(e) for e in entries])

@app.route('/api/time-entries', methods=['GET'])
@api_login_required
def get_time_entries():
    conn = get_db()
    user_id = session['user_id']
    if session.get('role') == 'owner':
        user_id = request.args.get('user_id', user_id, type=int)
    entries = conn.execute(
        '''SELECT te.*, j.name as job_name FROM time_entries te
           LEFT JOIN jobs j ON te.job_id = j.id
           WHERE te.user_id = ? ORDER BY te.work_date DESC LIMIT 100''',
        (user_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(e) for e in entries])

@app.route('/api/time-entries', methods=['POST'])
@api_login_required
def create_time_entry():
    data = request.get_json()
    user_id = session['user_id']
    conn = get_db()
    user = conn.execute('SELECT hourly_rate FROM users WHERE id = ?', (user_id,)).fetchone()
    rate = float(data.get('hourly_rate', 0)) or (user['hourly_rate'] or 0) if user else 0
    conn.execute(
        'INSERT INTO time_entries (user_id, job_id, hours, hourly_rate, work_date, description) VALUES (?,?,?,?,?,?)',
        (user_id, data['job_id'], float(data.get('hours', 0)), rate,
         data.get('work_date', datetime.now().strftime('%Y-%m-%d')), data.get('description', ''))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True}), 201

@app.route('/api/time-entries/<int:tid>/approve', methods=['POST'])
@api_role_required('owner')
def approve_time_entry(tid):
    conn = get_db()
    conn.execute('UPDATE time_entries SET approved = 1, approved_by = ? WHERE id = ?',
                 (session['user_id'], tid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/time-entries/<int:tid>', methods=['DELETE'])
@api_login_required
def delete_time_entry(tid):
    conn = get_db()
    entry = conn.execute('SELECT user_id FROM time_entries WHERE id = ?', (tid,)).fetchone()
    if not entry:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    if entry['user_id'] != session['user_id'] and session.get('role') != 'owner':
        conn.close()
        return jsonify({'error': 'Access denied'}), 403
    conn.execute('DELETE FROM time_entries WHERE id = ?', (tid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/time-entries/week')
@api_login_required
def api_time_entries_week():
    """Get weekly grid data for a user."""
    from datetime import datetime, timedelta
    date_str = request.args.get('date', '')
    user_id = request.args.get('user_id', session.get('user_id'))
    # Only owners can view others' time
    if str(user_id) != str(session.get('user_id')) and session.get('role') != 'owner':
        return jsonify({'error': 'Access denied'}), 403
    try:
        target = datetime.strptime(date_str, '%Y-%m-%d') if date_str else datetime.now()
    except ValueError:
        target = datetime.now()
    # Get Monday of the week
    monday = target - timedelta(days=target.weekday())
    sunday = monday + timedelta(days=6)
    conn = get_db()
    entries = conn.execute(
        '''SELECT te.*, j.name as job_name FROM time_entries te
           LEFT JOIN jobs j ON te.job_id = j.id
           WHERE te.user_id = ? AND te.work_date BETWEEN ? AND ?
           ORDER BY j.name, te.work_date''',
        (user_id, monday.strftime('%Y-%m-%d'), sunday.strftime('%Y-%m-%d'))
    ).fetchall()
    jobs = conn.execute("SELECT id, name FROM jobs WHERE status IN ('In Progress','Awarded','Pre-Construction') ORDER BY name").fetchall()
    conn.close()
    # Build grid: {job_id: {date: hours}}
    grid = {}
    for e in entries:
        jid = e['job_id']
        if jid not in grid:
            grid[jid] = {'job_id': jid, 'job_name': e['job_name'], 'entries': {}}
        grid[jid]['entries'][e['work_date']] = {
            'id': e['id'], 'hours': e['hours'], 'entry_type': e['entry_type'] or 'regular',
            'description': e['description'] or ''
        }
    dates = [(monday + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(7)]
    return jsonify({
        'week_start': monday.strftime('%Y-%m-%d'),
        'week_end': sunday.strftime('%Y-%m-%d'),
        'dates': dates,
        'grid': list(grid.values()),
        'available_jobs': [{'id': j['id'], 'name': j['name']} for j in jobs],
    })

@app.route('/api/time-entries/batch', methods=['POST'])
@api_login_required
def api_time_entries_batch():
    """Bulk save a week of time entries."""
    data = request.get_json()
    user_id = data.get('user_id', session.get('user_id'))
    if str(user_id) != str(session.get('user_id')) and session.get('role') != 'owner':
        return jsonify({'error': 'Access denied'}), 403
    entries = data.get('entries', [])
    conn = get_db()
    user = conn.execute('SELECT hourly_rate FROM users WHERE id = ?', (user_id,)).fetchone()
    rate = user['hourly_rate'] if user else 0
    for entry in entries:
        job_id = entry.get('job_id')
        work_date = entry.get('work_date')
        hours = float(entry.get('hours', 0) or 0)
        entry_type = entry.get('entry_type', 'regular')
        desc = entry.get('description', '')
        if hours <= 0:
            conn.execute('DELETE FROM time_entries WHERE user_id = ? AND job_id = ? AND work_date = ?',
                         (user_id, job_id, work_date))
        else:
            existing = conn.execute('SELECT id FROM time_entries WHERE user_id = ? AND job_id = ? AND work_date = ?',
                                    (user_id, job_id, work_date)).fetchone()
            if existing:
                conn.execute('''UPDATE time_entries SET hours = ?, hourly_rate = ?, entry_type = ?, description = ?
                                WHERE id = ?''', (hours, rate, entry_type, desc, existing['id']))
            else:
                conn.execute('''INSERT INTO time_entries (user_id, job_id, hours, hourly_rate, work_date, entry_type, description)
                                VALUES (?,?,?,?,?,?,?)''', (user_id, job_id, hours, rate, work_date, entry_type, desc))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/payroll/period-summary')
@api_role_required('owner')
def api_payroll_period_summary():
    """Summary by employee for a date range."""
    start = request.args.get('start', '')
    end = request.args.get('end', '')
    if not start or not end:
        return jsonify({'error': 'start and end required'}), 400
    conn = get_db()
    rows = conn.execute(
        '''SELECT u.id, u.display_name, u.hourly_rate,
                  SUM(te.hours) as total_hours,
                  SUM(CASE WHEN te.entry_type = 'overtime' THEN te.hours ELSE 0 END) as ot_hours,
                  COUNT(DISTINCT te.work_date) as days_worked,
                  COUNT(DISTINCT te.job_id) as jobs_worked
           FROM time_entries te JOIN users u ON te.user_id = u.id
           WHERE te.work_date BETWEEN ? AND ?
           GROUP BY u.id ORDER BY u.display_name''', (start, end)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/payroll/approve-period', methods=['POST'])
@api_role_required('owner')
def api_payroll_approve_period():
    """Bulk approve all entries in a period."""
    data = request.get_json()
    start = data.get('start', '')
    end = data.get('end', '')
    if not start or not end:
        return jsonify({'error': 'start and end required'}), 400
    conn = get_db()
    conn.execute(
        '''UPDATE time_entries SET approved = 1, approved_by = ?
           WHERE work_date BETWEEN ? AND ? AND approved = 0''',
        (session.get('user_id'), start, end)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ─── Warranty ───────────────────────────────────────────────────

@app.route('/warranty')
@role_required('owner', 'admin', 'project_manager')
def warranty_list():
    return render_template('warranty/list.html')

@app.route('/warranty/job/<int:job_id>')
@role_required('owner', 'admin', 'project_manager')
def warranty_job(job_id):
    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    conn.close()
    if not job:
        return 'Job not found', 404
    return render_template('warranty/job.html', job=job)

@app.route('/api/warranty')
@api_role_required('owner', 'admin', 'project_manager')
def api_warranty_list():
    conn = get_db()
    items = conn.execute(
        '''SELECT wi.*, j.name as job_name FROM warranty_items wi
           LEFT JOIN jobs j ON wi.job_id = j.id ORDER BY wi.warranty_end ASC'''
    ).fetchall()
    conn.close()
    return jsonify([dict(i) for i in items])

@app.route('/api/warranty/job/<int:job_id>')
@api_role_required('owner', 'admin', 'project_manager')
def api_warranty_job(job_id):
    conn = get_db()
    items = conn.execute('SELECT * FROM warranty_items WHERE job_id = ? ORDER BY warranty_end', (job_id,)).fetchall()
    result = []
    for item in items:
        claims = conn.execute('SELECT * FROM warranty_claims WHERE warranty_id = ? ORDER BY claim_date DESC', (item['id'],)).fetchall()
        d = dict(item)
        d['claims'] = [dict(c) for c in claims]
        result.append(d)
    conn.close()
    return jsonify(result)

@app.route('/api/warranty/items', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def create_warranty_item():
    data = request.get_json()
    conn = get_db()
    conn.execute(
        '''INSERT INTO warranty_items (job_id, item_description, manufacturer, warranty_start, warranty_end, coverage_details, status)
           VALUES (?,?,?,?,?,?,?)''',
        (data['job_id'], data.get('item_description',''), data.get('manufacturer',''),
         data.get('warranty_start',''), data.get('warranty_end',''),
         data.get('coverage_details',''), data.get('status','Active'))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True}), 201

@app.route('/api/warranty/items/<int:wid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def update_warranty_item(wid):
    data = request.get_json()
    conn = get_db()
    fields = []
    values = []
    for f in ('item_description','manufacturer','warranty_start','warranty_end','coverage_details','status'):
        if f in data:
            fields.append(f'{f} = ?')
            values.append(data[f])
    if fields:
        values.append(wid)
        conn.execute(f"UPDATE warranty_items SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/warranty/items/<int:wid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def delete_warranty_item(wid):
    conn = get_db()
    conn.execute('DELETE FROM warranty_items WHERE id = ?', (wid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/warranty/claims', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def create_warranty_claim():
    data = request.get_json()
    conn = get_db()
    conn.execute(
        'INSERT INTO warranty_claims (warranty_id, claim_date, description, resolution, status) VALUES (?,?,?,?,?)',
        (data['warranty_id'], data.get('claim_date', datetime.now().strftime('%Y-%m-%d')),
         data.get('description',''), data.get('resolution',''), data.get('status','Open'))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True}), 201

@app.route('/api/warranty/claims/<int:cid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def update_warranty_claim(cid):
    data = request.get_json()
    conn = get_db()
    fields = []
    values = []
    for f in ('description','resolution','status'):
        if f in data:
            fields.append(f'{f} = ?')
            values.append(data[f])
    if fields:
        values.append(cid)
        conn.execute(f"UPDATE warranty_claims SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ─── Service Calls ──────────────────────────────────────────────

@app.route('/service-calls')
@login_required
def service_calls_list():
    return render_template('service_calls/list.html')

@app.route('/service-calls/<int:call_id>')
@login_required
def service_call_detail(call_id):
    return render_template('service_calls/detail.html', call_id=call_id)

@app.route('/api/service-calls')
@api_login_required
def api_service_calls():
    conn = get_db()
    calls = conn.execute(
        '''SELECT sc.*, j.name as job_name, u.display_name as assigned_name
           FROM service_calls sc
           LEFT JOIN jobs j ON sc.job_id = j.id
           LEFT JOIN users u ON sc.assigned_to = u.id
           ORDER BY
             CASE sc.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END,
             sc.created_at DESC'''
    ).fetchall()
    conn.close()
    return jsonify([dict(c) for c in calls])

@app.route('/api/service-calls', methods=['POST'])
@api_login_required
def create_service_call():
    data = request.get_json()
    conn = get_db()
    conn.execute(
        '''INSERT INTO service_calls (job_id, caller_name, caller_phone, caller_email, description, priority, status, assigned_to, scheduled_date, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?)''',
        (data.get('job_id') or None, data.get('caller_name',''), data.get('caller_phone',''),
         data.get('caller_email',''), data.get('description',''),
         data.get('priority','Normal'), data.get('status','Open'),
         data.get('assigned_to') or None, data.get('scheduled_date',''), session.get('user_id'))
    )
    conn.commit()

    # Create notification for assigned user
    assigned_to = data.get('assigned_to')
    if assigned_to:
        try:
            conn.execute(
                'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?,?,?,?,?)',
                (int(assigned_to), 'service_call',
                 'New Service Call Assigned',
                 f"A new service call has been assigned to you: {data.get('description', '')[:100]}",
                 '/service-calls')
            )
            conn.commit()
        except Exception:
            pass

    conn.close()
    return jsonify({'ok': True}), 201

@app.route('/api/service-calls/<int:cid>')
@api_login_required
def api_service_call_detail(cid):
    conn = get_db()
    call = conn.execute(
        '''SELECT sc.*, j.name as job_name, u.display_name as assigned_name
           FROM service_calls sc
           LEFT JOIN jobs j ON sc.job_id = j.id
           LEFT JOIN users u ON sc.assigned_to = u.id
           WHERE sc.id = ?''', (cid,)
    ).fetchone()
    conn.close()
    if not call:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(dict(call))

@app.route('/api/service-calls/<int:cid>', methods=['PUT'])
@api_login_required
def update_service_call(cid):
    data = request.get_json()
    conn = get_db()
    fields = []
    values = []
    for f in ('caller_name','caller_phone','caller_email','description','priority','status','assigned_to','resolution','scheduled_date','resolved_date','job_id'):
        if f in data:
            fields.append(f'{f} = ?')
            values.append(data[f] if data[f] != '' else None if f in ('assigned_to','job_id') else data[f])
    if fields:
        values.append(cid)
        conn.execute(f"UPDATE service_calls SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/service-calls/<int:cid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def delete_service_call(cid):
    conn = get_db()
    conn.execute('DELETE FROM service_calls WHERE id = ?', (cid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ─── How To's ───────────────────────────────────────────────────

@app.route('/howtos')
@login_required
def howtos_list():
    return render_template('howtos/list.html')

@app.route('/howtos/new')
@role_required('owner', 'admin', 'project_manager')
def howtos_new():
    return render_template('howtos/edit.html', article=None)

@app.route('/howtos/<int:article_id>')
@login_required
def howtos_article(article_id):
    conn = get_db()
    article = conn.execute('SELECT * FROM howto_articles WHERE id = ?', (article_id,)).fetchone()
    conn.close()
    if not article:
        return 'Article not found', 404
    return render_template('howtos/article.html', article=article)

@app.route('/howtos/<int:article_id>/edit')
@role_required('owner', 'admin', 'project_manager')
def howtos_edit(article_id):
    conn = get_db()
    article = conn.execute('SELECT * FROM howto_articles WHERE id = ?', (article_id,)).fetchone()
    conn.close()
    if not article:
        return 'Article not found', 404
    return render_template('howtos/edit.html', article=article)

@app.route('/api/howtos')
@api_login_required
def api_howtos():
    conn = get_db()
    articles = conn.execute(
        'SELECT id, title, category, tags, created_at, updated_at FROM howto_articles ORDER BY updated_at DESC'
    ).fetchall()
    conn.close()
    return jsonify([dict(a) for a in articles])

@app.route('/api/howtos/<int:aid>')
@api_login_required
def api_howto_detail(aid):
    conn = get_db()
    article = conn.execute('SELECT * FROM howto_articles WHERE id = ?', (aid,)).fetchone()
    conn.close()
    if not article:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(dict(article))

@app.route('/api/howtos', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def create_howto():
    data = request.get_json()
    conn = get_db()
    cursor = conn.execute(
        'INSERT INTO howto_articles (title, category, content, tags, created_by) VALUES (?,?,?,?,?)',
        (data.get('title',''), data.get('category',''), data.get('content',''),
         data.get('tags',''), session.get('user_id'))
    )
    conn.commit()
    aid = cursor.lastrowid
    conn.close()
    return jsonify({'ok': True, 'id': aid}), 201

@app.route('/api/howtos/<int:aid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def update_howto(aid):
    data = request.get_json()
    conn = get_db()
    conn.execute(
        '''UPDATE howto_articles SET title=?, category=?, content=?, tags=?,
           updated_at=datetime('now','localtime') WHERE id=?''',
        (data.get('title',''), data.get('category',''), data.get('content',''),
         data.get('tags',''), aid)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/howtos/<int:aid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def delete_howto(aid):
    conn = get_db()
    conn.execute('DELETE FROM howto_articles WHERE id = ?', (aid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ─── Code Books ─────────────────────────────────────────────────

@app.route('/codebooks')
@login_required
def codebooks_list():
    return render_template('codebooks/list.html')

@app.route('/codebooks/<int:book_id>')
@login_required
def codebooks_browse(book_id):
    conn = get_db()
    book = conn.execute('SELECT * FROM code_books WHERE id = ?', (book_id,)).fetchone()
    conn.close()
    if not book:
        return 'Code book not found', 404
    return render_template('codebooks/browse.html', book=book)

@app.route('/api/codebooks')
@api_login_required
def api_codebooks():
    conn = get_db()
    books = conn.execute('SELECT * FROM code_books ORDER BY code').fetchall()
    conn.close()
    return jsonify([dict(b) for b in books])

@app.route('/api/codebooks/<int:book_id>/sections')
@api_login_required
def api_codebook_sections(book_id):
    conn = get_db()
    sections = conn.execute(
        'SELECT * FROM code_sections WHERE book_id = ? ORDER BY sort_order', (book_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(s) for s in sections])

@app.route('/api/codebooks/search')
@api_login_required
def api_codebook_search():
    q = request.args.get('q', '').strip()
    book_id = request.args.get('book_id', type=int)
    if not q:
        return jsonify([])
    conn = get_db()
    if book_id:
        sections = conn.execute(
            '''SELECT cs.*, cb.code as book_code, cb.name as book_name
               FROM code_sections cs JOIN code_books cb ON cs.book_id = cb.id
               WHERE cs.book_id = ? AND (cs.section_number LIKE ? OR cs.title LIKE ? OR cs.content LIKE ?)
               ORDER BY cs.sort_order LIMIT 50''',
            (book_id, f'%{q}%', f'%{q}%', f'%{q}%')
        ).fetchall()
    else:
        sections = conn.execute(
            '''SELECT cs.*, cb.code as book_code, cb.name as book_name
               FROM code_sections cs JOIN code_books cb ON cs.book_id = cb.id
               WHERE cs.section_number LIKE ? OR cs.title LIKE ? OR cs.content LIKE ?
               ORDER BY cb.code, cs.sort_order LIMIT 50''',
            (f'%{q}%', f'%{q}%', f'%{q}%')
        ).fetchall()
    conn.close()
    return jsonify([dict(s) for s in sections])

@app.route('/api/codebooks/bookmarks')
@api_login_required
def api_codebook_bookmarks():
    conn = get_db()
    bookmarks = conn.execute(
        '''SELECT cb.*, cs.section_number, cs.title, bk.code as book_code
           FROM code_bookmarks cb
           JOIN code_sections cs ON cb.section_id = cs.id
           JOIN code_books bk ON cs.book_id = bk.id
           WHERE cb.user_id = ? ORDER BY cb.created_at DESC''',
        (session['user_id'],)
    ).fetchall()
    conn.close()
    return jsonify([dict(b) for b in bookmarks])

@app.route('/api/codebooks/bookmarks', methods=['POST'])
@api_login_required
def toggle_bookmark():
    data = request.get_json()
    section_id = data.get('section_id')
    note = data.get('note', '')
    conn = get_db()
    existing = conn.execute(
        'SELECT id FROM code_bookmarks WHERE user_id = ? AND section_id = ?',
        (session['user_id'], section_id)
    ).fetchone()
    if existing:
        conn.execute('DELETE FROM code_bookmarks WHERE id = ?', (existing['id'],))
        action = 'removed'
    else:
        conn.execute(
            'INSERT INTO code_bookmarks (user_id, section_id, note) VALUES (?,?,?)',
            (session['user_id'], section_id, note)
        )
        action = 'added'
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'action': action})

# ─── Customers (Phase 1) ─────────────────────────────────────────

@app.route('/customers')
@role_required('owner', 'admin', 'project_manager')
def customers_list():
    return render_template('customers/list.html')

@app.route('/customers/<int:cid>')
@role_required('owner', 'admin', 'project_manager')
def customers_detail(cid):
    return render_template('customers/detail.html', customer_id=cid)

@app.route('/api/customers')
@api_role_required('owner', 'admin', 'project_manager')
def api_customers():
    conn = get_db()
    customers = conn.execute('SELECT * FROM customers ORDER BY company_name').fetchall()
    result = []
    for c in customers:
        total_bids = conn.execute('SELECT COUNT(*) FROM bids WHERE customer_id = ?', (c['id'],)).fetchone()[0]
        accepted_bids = conn.execute("SELECT COUNT(*) FROM bids WHERE customer_id = ? AND status = 'Accepted'", (c['id'],)).fetchone()[0]
        d = dict(c)
        d['total_bids'] = total_bids
        d['accepted_bids'] = accepted_bids
        result.append(d)
    conn.close()
    return jsonify(result)

@app.route('/api/customers', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_create_customer():
    data = request.get_json()
    name = (data.get('company_name') or '').strip()
    if not name:
        return jsonify({'error': 'Company name is required'}), 400
    conn = get_db()
    cursor = conn.execute(
        '''INSERT INTO customers (company_name, company_type, primary_contact, contact_email,
           contact_phone, address, city, state, zip_code, website, notes, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)''',
        (name, data.get('company_type', 'General Contractor'),
         data.get('primary_contact', ''), data.get('contact_email', ''),
         data.get('contact_phone', ''), data.get('address', ''),
         data.get('city', ''), data.get('state', ''),
         data.get('zip_code', ''), data.get('website', ''),
         data.get('notes', ''), session.get('user_id'))
    )
    cid = cursor.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': cid}), 201

@app.route('/api/customers/<int:cid>')
@api_role_required('owner', 'admin', 'project_manager')
def api_customer_detail(cid):
    conn = get_db()
    c = conn.execute('SELECT * FROM customers WHERE id = ?', (cid,)).fetchone()
    if not c:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    contacts = conn.execute('SELECT * FROM customer_contacts WHERE customer_id = ? ORDER BY is_primary DESC, name', (cid,)).fetchall()
    bids = conn.execute(
        '''SELECT b.id, b.bid_name, b.status, b.total_bid, b.bid_date, j.name as job_name
           FROM bids b LEFT JOIN jobs j ON b.job_id = j.id
           WHERE b.customer_id = ? ORDER BY b.bid_date DESC''', (cid,)
    ).fetchall()
    jobs = conn.execute(
        'SELECT * FROM jobs WHERE customer_id = ? ORDER BY updated_at DESC', (cid,)
    ).fetchall()
    total_bids = len(bids)
    accepted_bids = sum(1 for b in bids if b['status'] == 'Accepted')
    active_jobs = sum(1 for j in jobs if j['status'] in ('In Progress', 'Awarded', 'Pre-Construction'))
    total_revenue = sum(b['total_bid'] or 0 for b in bids if b['status'] == 'Accepted')
    conn.close()
    result = dict(c)
    result['contacts'] = [dict(ct) for ct in contacts]
    result['bids'] = [dict(b) for b in bids]
    result['jobs'] = [dict(j) for j in jobs]
    result['total_bids'] = total_bids
    result['accepted_bids'] = accepted_bids
    result['active_jobs'] = active_jobs
    result['total_revenue'] = total_revenue
    return jsonify(result)

@app.route('/api/customers/<int:cid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_update_customer(cid):
    data = request.get_json()
    conn = get_db()
    fields = []
    params = []
    for col in ('company_name', 'company_type', 'primary_contact', 'contact_email',
                'contact_phone', 'address', 'city', 'state', 'zip_code', 'website', 'notes'):
        if col in data:
            fields.append(f'{col} = ?')
            params.append(data[col])
    if 'is_active' in data:
        fields.append('is_active = ?')
        params.append(int(data['is_active']))
    if fields:
        fields.append("updated_at = datetime('now','localtime')")
        params.append(cid)
        conn.execute(f"UPDATE customers SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/customers/<int:cid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_deactivate_customer(cid):
    conn = get_db()
    conn.execute("UPDATE customers SET is_active = 0, updated_at = datetime('now','localtime') WHERE id = ?", (cid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/customers/<int:cid>/contacts', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_add_customer_contact(cid):
    data = request.get_json()
    conn = get_db()
    if data.get('is_primary'):
        conn.execute('UPDATE customer_contacts SET is_primary = 0 WHERE customer_id = ?', (cid,))
    cursor = conn.execute(
        'INSERT INTO customer_contacts (customer_id, name, title, email, phone, is_primary) VALUES (?,?,?,?,?,?)',
        (cid, data.get('name', ''), data.get('title', ''), data.get('email', ''),
         data.get('phone', ''), 1 if data.get('is_primary') else 0)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': cursor.lastrowid}), 201

@app.route('/api/customers/<int:cid>/contacts/<int:ctid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_update_customer_contact(cid, ctid):
    data = request.get_json()
    conn = get_db()
    if data.get('is_primary'):
        conn.execute('UPDATE customer_contacts SET is_primary = 0 WHERE customer_id = ?', (cid,))
    conn.execute(
        'UPDATE customer_contacts SET name=?, title=?, email=?, phone=?, is_primary=? WHERE id=? AND customer_id=?',
        (data.get('name', ''), data.get('title', ''), data.get('email', ''),
         data.get('phone', ''), 1 if data.get('is_primary') else 0, ctid, cid)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/customers/<int:cid>/contacts/<int:ctid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_delete_customer_contact(cid, ctid):
    conn = get_db()
    conn.execute('DELETE FROM customer_contacts WHERE id = ? AND customer_id = ?', (ctid, cid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/customers/search')
@api_role_required('owner', 'admin', 'project_manager')
def api_customers_search():
    q = request.args.get('q', '').strip()
    if len(q) < 1:
        return jsonify([])
    conn = get_db()
    results = conn.execute(
        "SELECT id, company_name, company_type, primary_contact FROM customers WHERE is_active = 1 AND company_name LIKE ? ORDER BY company_name LIMIT 15",
        (f'%{q}%',)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in results])

# ─── Projects ───────────────────────────────────────────────────

@app.route('/projects')
@role_required('owner', 'admin', 'project_manager')
def projects_overview():
    return render_template('projects/overview.html')

@app.route('/projects/<int:job_id>')
@role_required('owner', 'admin', 'project_manager')
def projects_detail(job_id):
    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    conn.close()
    if not job:
        return 'Project not found', 404
    return render_template('projects/detail.html', job=job)

@app.route('/api/projects')
@api_role_required('owner', 'admin', 'project_manager')
def api_projects():
    conn = get_db()
    jobs = conn.execute('SELECT * FROM jobs ORDER BY updated_at DESC').fetchall()
    result = []
    for job in jobs:
        items = conn.execute(
            'SELECT total_net_price, qty_ordered, price_per FROM line_items WHERE job_id = ?',
            (job['id'],)
        ).fetchall()
        material_cost = sum(
            (row['total_net_price'] or 0) if (row['total_net_price'] or 0)
            else (row['qty_ordered'] or 0) * (row['price_per'] or 0)
            for row in items
        )
        expenses = conn.execute('SELECT COALESCE(SUM(amount),0) FROM expenses WHERE job_id = ?', (job['id'],)).fetchone()[0]
        service_count = conn.execute("SELECT COUNT(*) FROM service_calls WHERE job_id = ? AND status NOT IN ('Resolved','Closed')", (job['id'],)).fetchone()[0]
        warranty_count = conn.execute('SELECT COUNT(*) FROM warranty_items WHERE job_id = ?', (job['id'],)).fetchone()[0]

        result.append({
            'id': job['id'],
            'name': job['name'],
            'status': job['status'],
            'location': f"{job['city'] or ''} {job['state'] or ''}".strip() or '-',
            'material_cost': round(material_cost, 2),
            'expenses': round(expenses, 2),
            'open_service_calls': service_count,
            'warranty_items': warranty_count,
            'updated_at': job['updated_at'],
        })
    conn.close()
    return jsonify(result)

@app.route('/api/projects/<int:job_id>')
@api_role_required('owner', 'admin', 'project_manager')
def api_project_detail(job_id):
    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    if not job:
        conn.close()
        return jsonify({'error': 'Not found'}), 404

    items = conn.execute(
        'SELECT total_net_price, qty_ordered, price_per FROM line_items WHERE job_id = ?', (job_id,)
    ).fetchall()
    material_cost = sum(
        (row['total_net_price'] or 0) if (row['total_net_price'] or 0)
        else (row['qty_ordered'] or 0) * (row['price_per'] or 0)
        for row in items
    )

    expenses = conn.execute('SELECT * FROM expenses WHERE job_id = ? ORDER BY expense_date DESC', (job_id,)).fetchall()
    payments = conn.execute('SELECT * FROM payments WHERE job_id = ? ORDER BY payment_date DESC', (job_id,)).fetchall()
    invoices = conn.execute('SELECT * FROM client_invoices WHERE job_id = ? ORDER BY issue_date DESC', (job_id,)).fetchall()
    service_calls = conn.execute(
        '''SELECT sc.*, u.display_name as assigned_name FROM service_calls sc
           LEFT JOIN users u ON sc.assigned_to = u.id
           WHERE sc.job_id = ? ORDER BY sc.created_at DESC''', (job_id,)
    ).fetchall()
    warranties = conn.execute('SELECT * FROM warranty_items WHERE job_id = ? ORDER BY warranty_end', (job_id,)).fetchall()
    time_entries = conn.execute(
        '''SELECT te.*, u.display_name as employee_name FROM time_entries te
           LEFT JOIN users u ON te.user_id = u.id
           WHERE te.job_id = ? ORDER BY te.work_date DESC''', (job_id,)
    ).fetchall()

    conn.close()
    return jsonify({
        'job': dict(job),
        'material_cost': round(material_cost, 2),
        'expenses': [dict(e) for e in expenses],
        'payments': [dict(p) for p in payments],
        'invoices': [dict(i) for i in invoices],
        'service_calls': [dict(c) for c in service_calls],
        'warranties': [dict(w) for w in warranties],
        'time_entries': [dict(t) for t in time_entries],
    })

# ─── User Management ────────────────────────────────────────────

@app.route('/admin/users')
@role_required('owner')
def admin_users():
    return render_template('admin/users.html')

@app.route('/api/admin/users')
@api_role_required('owner')
def api_admin_users():
    conn = get_db()
    users = conn.execute('SELECT id, username, display_name, role, email, phone, hourly_rate, is_active, created_at FROM users ORDER BY display_name').fetchall()
    conn.close()
    return jsonify([dict(u) for u in users])

@app.route('/api/admin/users', methods=['POST'])
@api_role_required('owner')
def api_create_user():
    data = request.get_json()
    username = (data.get('username') or '').strip()
    password = data.get('password', '')
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400

    conn = get_db()
    existing = conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': 'Username already taken'}), 400

    conn.execute(
        '''INSERT INTO users (username, display_name, password_hash, role, email, phone, hourly_rate)
           VALUES (?,?,?,?,?,?,?)''',
        (username, data.get('display_name', username), generate_password_hash(password),
         data.get('role', 'employee'), data.get('email', ''), data.get('phone', ''),
         float(data.get('hourly_rate', 0)))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True}), 201

@app.route('/api/admin/users/<int:uid>', methods=['PUT'])
@api_role_required('owner')
def api_update_user(uid):
    data = request.get_json()
    conn = get_db()
    fields = []
    values = []
    for f in ('display_name', 'role', 'email', 'phone', 'hourly_rate', 'is_active'):
        if f in data:
            fields.append(f'{f} = ?')
            values.append(data[f])
    if 'password' in data and data['password']:
        fields.append('password_hash = ?')
        values.append(generate_password_hash(data['password']))
    if fields:
        fields.append("updated_at = datetime('now','localtime')")
        values.append(uid)
        conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/admin/users/<int:uid>', methods=['DELETE'])
@api_role_required('owner')
def api_delete_user(uid):
    if uid == session.get('user_id'):
        return jsonify({'error': 'Cannot delete your own account'}), 400
    conn = get_db()
    conn.execute('DELETE FROM users WHERE id = ?', (uid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# Helper: list of users for dropdowns
@app.route('/api/users/list')
@api_login_required
def api_users_list():
    conn = get_db()
    users = conn.execute('SELECT id, username, display_name, role FROM users WHERE is_active = 1 ORDER BY display_name').fetchall()
    conn.close()
    return jsonify([dict(u) for u in users])

# Helper: list of jobs for dropdowns
@app.route('/api/jobs/list')
@api_login_required
def api_jobs_list():
    conn = get_db()
    jobs = conn.execute('SELECT id, name, status FROM jobs ORDER BY name').fetchall()
    conn.close()
    return jsonify([dict(j) for j in jobs])

# ─── Notifications ──────────────────────────────────────────

def create_notification(user_id, ntype, title, message='', link=''):
    """Helper to create a notification for a user."""
    conn = get_db()
    conn.execute(
        'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?,?,?,?,?)',
        (user_id, ntype, title, message, link)
    )
    conn.commit()
    conn.close()

@app.route('/api/notifications')
@api_login_required
def api_notifications():
    conn = get_db()
    notifs = conn.execute(
        '''SELECT * FROM notifications WHERE user_id = ?
           ORDER BY created_at DESC LIMIT 50''',
        (session['user_id'],)
    ).fetchall()
    conn.close()
    return jsonify([dict(n) for n in notifs])

@app.route('/api/notifications/unread-count')
@api_login_required
def api_notifications_unread_count():
    conn = get_db()
    count = conn.execute(
        'SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0',
        (session['user_id'],)
    ).fetchone()[0]
    conn.close()
    return jsonify({'count': count})

@app.route('/api/notifications/<int:nid>/read', methods=['PUT'])
@api_login_required
def api_notification_read(nid):
    conn = get_db()
    conn.execute(
        'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
        (nid, session['user_id'])
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/notifications/mark-all-read', methods=['POST'])
@api_login_required
def api_notifications_mark_all_read():
    conn = get_db()
    conn.execute(
        'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
        (session['user_id'],)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ─── Bids ───────────────────────────────────────────────────

def calculate_bid(data):
    """Calculate all derived bid fields from system counts."""
    # System counts
    num_apartments = int(data.get('num_apartments', 0) or 0)
    num_non_apt = int(data.get('num_non_apartment_systems', 0) or 0)
    num_mini_splits = int(data.get('num_mini_splits', 0) or 0)
    has_clubhouse = int(data.get('has_clubhouse', 0) or 0)
    clubhouse_systems = int(data.get('clubhouse_systems', 0) or 0) if has_clubhouse else 0
    # Mini splits count as 0.75 of a standard system for labor calculation
    total_systems = num_apartments + num_non_apt + (num_mini_splits * 0.75) + clubhouse_systems

    # Man hours breakdown per system
    rough_in = float(data.get('rough_in_hours', 15) or 15)
    ahu = float(data.get('ahu_install_hours', 1) or 1)
    condenser = float(data.get('condenser_install_hours', 1) or 1)
    trim = float(data.get('trim_out_hours', 1) or 1)
    startup = float(data.get('startup_hours', 2) or 2)
    man_hours_per_system = rough_in + ahu + condenser + trim + startup
    total_man_hours = total_systems * man_hours_per_system

    # Labor
    crew_size = int(data.get('crew_size', 4) or 4)
    hours_per_day = float(data.get('hours_per_day', 8) or 8)
    labor_rate = float(data.get('labor_rate_per_hour', 0) or 0)
    labor_cost_per_unit = float(data.get('labor_cost_per_unit', 0) or 0)

    # Labor cost: use per-unit price if set, otherwise hourly rate × total hours
    if labor_cost_per_unit > 0:
        labor_cost = round(total_systems * labor_cost_per_unit, 2)
    else:
        labor_cost = round(total_man_hours * labor_rate, 2)

    # Duration
    duration_days = round(total_man_hours / (crew_size * hours_per_day), 2) if crew_size > 0 and hours_per_day > 0 else 0
    num_weeks = round(duration_days / 5, 2)

    # Per diem (auto from mileage)
    job_mileage = float(data.get('job_mileage', 0) or 0)
    per_diem_rate = float(data.get('per_diem_rate', 0) or 0)
    # Auto-set per diem rate from mileage if rate is 0
    if per_diem_rate == 0 and job_mileage > 0:
        if job_mileage >= 250:
            per_diem_rate = 75
        elif job_mileage >= 101:
            per_diem_rate = 60
    per_diem_total = round(per_diem_rate * duration_days * crew_size, 2)

    # Overhead
    material_cost = float(data.get('material_cost', 0) or 0)
    insurance_cost = float(data.get('insurance_cost', 0) or 0)
    permit_cost = float(data.get('permit_cost', 0) or 0)
    management_fee = float(data.get('management_fee', 0) or 0)

    # Totals
    total_cost_to_build = round(material_cost + labor_cost + insurance_cost + permit_cost + management_fee + per_diem_total, 2)
    subtotal = total_cost_to_build
    profit_pct = float(data.get('company_profit_pct', 0) or 0)
    company_profit = round(subtotal * (profit_pct / 100), 2)
    total_bid = round(subtotal + company_profit, 2)
    net_profit = round(total_bid - total_cost_to_build, 2)

    # Per-unit calcs
    cost_per_apartment = round(total_cost_to_build / num_apartments, 2) if num_apartments > 0 else 0
    cost_per_system = round(total_cost_to_build / total_systems, 2) if total_systems > 0 else 0
    labor_cost_per_apt = round(labor_cost / num_apartments, 2) if num_apartments > 0 else 0
    labor_cost_per_sys = round(labor_cost / total_systems, 2) if total_systems > 0 else 0

    # Suggested bids (proportional split if clubhouse)
    if has_clubhouse and clubhouse_systems > 0 and total_systems > 0:
        apt_share = (total_systems - clubhouse_systems) / total_systems
        suggested_apartment_bid = round(total_bid * apt_share, 2)
        suggested_clubhouse_bid = round(total_bid * (1 - apt_share), 2)
    else:
        suggested_apartment_bid = total_bid
        suggested_clubhouse_bid = 0

    return {
        'total_systems': total_systems,
        'man_hours_per_system': man_hours_per_system,
        'total_man_hours': total_man_hours,
        'duration_days': duration_days,
        'num_weeks': num_weeks,
        'labor_cost': labor_cost,
        'per_diem_rate': per_diem_rate,
        'per_diem_total': per_diem_total,
        'total_cost_to_build': total_cost_to_build,
        'subtotal': subtotal,
        'company_profit': company_profit,
        'total_bid': total_bid,
        'net_profit': net_profit,
        'cost_per_apartment': cost_per_apartment,
        'cost_per_system': cost_per_system,
        'labor_cost_per_apartment': labor_cost_per_apt,
        'labor_cost_per_system': labor_cost_per_sys,
        'suggested_apartment_bid': suggested_apartment_bid,
        'suggested_clubhouse_bid': suggested_clubhouse_bid,
    }

@app.route('/bids')
@role_required('owner', 'admin', 'project_manager')
def bids_list():
    return render_template('bids/list.html')

@app.route('/bids/new')
@role_required('owner', 'admin', 'project_manager')
def bids_new():
    return render_template('bids/detail.html', bid_id=0)

@app.route('/bids/<int:bid_id>')
@role_required('owner', 'admin', 'project_manager')
def bids_detail(bid_id):
    return render_template('bids/detail.html', bid_id=bid_id)

@app.route('/api/bids')
@api_role_required('owner', 'admin', 'project_manager')
def api_bids():
    conn = get_db()
    bids = conn.execute(
        '''SELECT b.*, j.name as job_name FROM bids b
           LEFT JOIN jobs j ON b.job_id = j.id
           ORDER BY b.updated_at DESC'''
    ).fetchall()
    conn.close()

    proposals_dir = os.path.join(os.path.dirname(__file__), 'data', 'proposals')
    results = []
    for b in bids:
        d = dict(b)
        if os.path.isdir(proposals_dir):
            pdf_files = sorted([f for f in os.listdir(proposals_dir) if f.endswith('.pdf') and f'_{b["id"]}.pdf' in f])
            if pdf_files:
                d['proposal_pdf'] = f'/api/bids/{b["id"]}/proposal/{pdf_files[-1]}'
        results.append(d)

    return jsonify(results)

def _bid_fields(data, calcs):
    """Extract all bid fields from request data + calculated values."""
    f = lambda key, default=0: float(data.get(key, default) or default)
    i = lambda key, default=0: int(data.get(key, default) or default)
    s = lambda key, default='': data.get(key, default) or default
    return (
        data.get('job_id') or None, s('bid_name'), s('status', 'Draft'), s('project_type', 'Multi-Family'),
        i('num_apartments'), i('num_non_apartment_systems'), i('num_mini_splits'),
        i('has_clubhouse'), i('clubhouse_systems'), f('clubhouse_tons'), calcs['total_systems'],
        f('total_tons'), f('price_per_ton'), f('material_cost'),
        calcs['man_hours_per_system'], f('rough_in_hours', 15), f('ahu_install_hours', 1),
        f('condenser_install_hours', 1), f('trim_out_hours', 1), f('startup_hours', 2),
        calcs['total_man_hours'], i('crew_size', 4), f('hours_per_day', 8),
        calcs['duration_days'], calcs['num_weeks'],
        f('labor_rate_per_hour', 37), f('labor_cost_per_unit'), calcs['labor_cost'],
        f('job_mileage'), calcs['per_diem_rate'], calcs['duration_days'], calcs['per_diem_total'],
        f('insurance_cost'), f('permit_cost'), f('management_fee'), f('pay_schedule_pct', 0.33),
        f('company_profit_pct'), calcs['company_profit'], calcs['subtotal'], calcs['total_bid'],
        calcs['total_cost_to_build'], calcs['net_profit'],
        calcs['cost_per_apartment'], calcs['cost_per_system'],
        calcs['labor_cost_per_apartment'], calcs['labor_cost_per_system'],
        calcs['suggested_apartment_bid'], calcs['suggested_clubhouse_bid'],
        s('contracting_gc'), s('gc_attention'), s('bid_number'), s('bid_date'),
        s('bid_workup_date'), s('bid_due_date'), s('bid_submitted_date'), s('lead_name'),
        s('inclusions'), s('exclusions'), s('bid_description'), s('notes'),
    )

_BID_INSERT_COLS = '''job_id, bid_name, status, project_type,
    num_apartments, num_non_apartment_systems, num_mini_splits,
    has_clubhouse, clubhouse_systems, clubhouse_tons, total_systems,
    total_tons, price_per_ton, material_cost,
    man_hours_per_system, rough_in_hours, ahu_install_hours,
    condenser_install_hours, trim_out_hours, startup_hours,
    total_man_hours, crew_size, hours_per_day,
    duration_days, num_weeks,
    labor_rate_per_hour, labor_cost_per_unit, labor_cost,
    job_mileage, per_diem_rate, per_diem_days, per_diem_total,
    insurance_cost, permit_cost, management_fee, pay_schedule_pct,
    company_profit_pct, company_profit, subtotal, total_bid,
    total_cost_to_build, net_profit,
    cost_per_apartment, cost_per_system,
    labor_cost_per_apartment, labor_cost_per_system,
    suggested_apartment_bid, suggested_clubhouse_bid,
    contracting_gc, gc_attention, bid_number, bid_date,
    bid_workup_date, bid_due_date, bid_submitted_date, lead_name,
    inclusions, exclusions, bid_description, notes'''

@app.route('/api/bids', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_create_bid():
    data = request.get_json()
    calcs = calculate_bid(data)
    fields = _bid_fields(data, calcs)
    placeholders = ','.join(['?'] * (len(fields) + 2))  # +2 for created_by, customer_id
    conn = get_db()
    customer_id = data.get('customer_id') or None
    cursor = conn.execute(
        f'INSERT INTO bids ({_BID_INSERT_COLS}, created_by, customer_id) VALUES ({placeholders})',
        fields + (session.get('user_id'), customer_id)
    )
    bid_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': bid_id}), 201

@app.route('/api/bids/<int:bid_id>')
@api_role_required('owner', 'admin', 'project_manager')
def api_bid_detail(bid_id):
    conn = get_db()
    bid = conn.execute(
        '''SELECT b.*, j.name as job_name FROM bids b
           LEFT JOIN jobs j ON b.job_id = j.id WHERE b.id = ?''', (bid_id,)
    ).fetchone()
    if not bid:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    partners = conn.execute('SELECT * FROM bid_partners WHERE bid_id = ? ORDER BY id', (bid_id,)).fetchall()
    personnel = conn.execute(
        '''SELECT bp.*, u.display_name as user_display_name FROM bid_personnel bp
           LEFT JOIN users u ON bp.user_id = u.id WHERE bp.bid_id = ? ORDER BY bp.id''', (bid_id,)
    ).fetchall()
    conn.close()
    result = dict(bid)
    result['partners'] = [dict(p) for p in partners]
    result['personnel'] = [dict(p) for p in personnel]

    # Check if a proposal PDF exists for this bid
    proposals_dir = os.path.join(os.path.dirname(__file__), 'data', 'proposals')
    if os.path.isdir(proposals_dir):
        pdf_files = sorted([f for f in os.listdir(proposals_dir) if f.endswith('.pdf') and f'_{bid_id}.pdf' in f])
        if pdf_files:
            result['proposal_pdf'] = f'/api/bids/{bid_id}/proposal/{pdf_files[-1]}'

    return jsonify(result)

@app.route('/api/bids/<int:bid_id>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_update_bid(bid_id):
    data = request.get_json()
    calcs = calculate_bid(data)
    fields = _bid_fields(data, calcs)
    set_clause = ', '.join([f'{col.strip()}=?' for col in _BID_INSERT_COLS.split(',')])
    customer_id = data.get('customer_id') or None
    conn = get_db()
    conn.execute(
        f"UPDATE bids SET {set_clause}, customer_id=?, updated_at=datetime('now','localtime') WHERE id=?",
        fields + (customer_id, bid_id)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/bids/<int:bid_id>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_delete_bid(bid_id):
    conn = get_db()
    conn.execute('DELETE FROM bids WHERE id = ?', (bid_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/bids/<int:bid_id>/calculate', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_bid_calculate(bid_id):
    data = request.get_json()
    calcs = calculate_bid(data)
    return jsonify(calcs)

@app.route('/api/bids/<int:bid_id>/partners', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_add_bid_partner(bid_id):
    data = request.get_json()
    conn = get_db()
    cursor = conn.execute(
        'INSERT INTO bid_partners (bid_id, partner_name, profit_pct, profit_amount) VALUES (?,?,?,?)',
        (bid_id, data.get('partner_name', ''), float(data.get('profit_pct', 0) or 0),
         float(data.get('profit_amount', 0) or 0))
    )
    pid = cursor.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': pid}), 201

@app.route('/api/bids/<int:bid_id>/partners/<int:pid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_delete_bid_partner(bid_id, pid):
    conn = get_db()
    conn.execute('DELETE FROM bid_partners WHERE id = ? AND bid_id = ?', (pid, bid_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/bids/<int:bid_id>/personnel', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_add_bid_personnel(bid_id):
    data = request.get_json()
    conn = get_db()
    cursor = conn.execute(
        'INSERT INTO bid_personnel (bid_id, user_id, name, role, hourly_rate) VALUES (?,?,?,?,?)',
        (bid_id, data.get('user_id') or None, data.get('name', ''),
         data.get('role', ''), float(data.get('hourly_rate', 0) or 0))
    )
    pid = cursor.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': pid}), 201

@app.route('/api/bids/<int:bid_id>/personnel/<int:pid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_delete_bid_personnel(bid_id, pid):
    conn = get_db()
    conn.execute('DELETE FROM bid_personnel WHERE id = ? AND bid_id = ?', (pid, bid_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ─── Proposals (PDF + Email) ─────────────────────────────────

@app.route('/api/bids/<int:bid_id>/generate-proposal', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_generate_proposal(bid_id):
    """Generate a PDF proposal from bid data."""
    conn = get_db()
    bid = conn.execute(
        'SELECT b.*, j.name as job_name FROM bids b LEFT JOIN jobs j ON b.job_id = j.id WHERE b.id = ?',
        (bid_id,)
    ).fetchone()
    conn.close()
    if not bid:
        return jsonify({'error': 'Bid not found'}), 404

    bid = dict(bid)
    today = datetime.now().strftime('%B %d, %Y')
    logo_path = os.path.abspath(os.path.join(app.static_folder, 'logo.jpg'))

    html = render_template('bids/proposal_pdf.html', bid=bid, today=today, logo_path='file://' + logo_path)

    proposals_dir = os.path.join(os.path.dirname(__file__), 'data', 'proposals')
    os.makedirs(proposals_dir, exist_ok=True)

    safe_name = ''.join(c if c.isalnum() or c in ' -_' else '' for c in (bid.get('bid_name') or 'proposal')).strip()
    filename = f"Proposal_{safe_name}_{bid_id}.pdf"
    filepath = os.path.join(proposals_dir, filename)

    # Write HTML to a temp file for Chrome to render
    import subprocess, tempfile
    with tempfile.NamedTemporaryFile(suffix='.html', delete=False, mode='w') as tmp:
        tmp.write(html)
        tmp_path = tmp.name

    try:
        chrome_paths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
        chrome = next((p for p in chrome_paths if os.path.exists(p)), None)
        if not chrome:
            return jsonify({'error': 'Chrome not found. Install Google Chrome to generate PDFs.'}), 500

        result = subprocess.run([
            chrome,
            '--headless',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-software-rasterizer',
            f'--print-to-pdf={filepath}',
            '--no-pdf-header-footer',
            f'file://{tmp_path}',
        ], capture_output=True, text=True, timeout=30)

        if not os.path.exists(filepath):
            return jsonify({'error': f'PDF generation failed: {result.stderr[:200]}'}), 500
    finally:
        os.unlink(tmp_path)

    return jsonify({'ok': True, 'filename': filename, 'path': f'/api/bids/{bid_id}/proposal/{filename}'})


@app.route('/api/bids/<int:bid_id>/proposal/<filename>')
@api_role_required('owner', 'admin', 'project_manager')
def api_download_proposal(bid_id, filename):
    """View or download a generated proposal PDF."""
    proposals_dir = os.path.join(os.path.dirname(__file__), 'data', 'proposals')
    filepath = os.path.join(proposals_dir, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    # Serve inline for preview (browser renders PDF), download param forces download
    if request.args.get('download'):
        return send_file(filepath, as_attachment=True, download_name=filename)
    return send_file(filepath, mimetype='application/pdf')


@app.route('/api/bids/<int:bid_id>/email-proposal', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_email_proposal(bid_id):
    """Email a proposal PDF to specified recipients."""
    data = request.get_json()
    recipients = [e.strip() for e in data.get('recipients', []) if e.strip()]
    subject = data.get('subject', 'HVAC Installation Proposal')
    body_text = data.get('body', '')

    # Load saved SMTP settings as fallback (password is never sent to browser)
    saved_settings = {}
    settings_path = os.path.join(os.path.dirname(__file__), 'data', 'email_settings.json')
    if os.path.exists(settings_path):
        with open(settings_path) as f:
            saved_settings = json.load(f)

    smtp_host = data.get('smtp_host') or saved_settings.get('smtp_host', '')
    smtp_port = int(data.get('smtp_port') or saved_settings.get('smtp_port', 587) or 587)
    smtp_user = data.get('smtp_user') or saved_settings.get('smtp_user', '')
    smtp_pass = data.get('smtp_pass') or saved_settings.get('smtp_pass', '')
    from_email = data.get('from_email') or saved_settings.get('from_email', '') or smtp_user

    if not recipients:
        return jsonify({'error': 'No recipients specified'}), 400
    if not smtp_host or not smtp_user:
        return jsonify({'error': 'SMTP settings required. Configure in Settings or provide in request.'}), 400

    # Find the most recent proposal PDF for this bid
    proposals_dir = os.path.join(os.path.dirname(__file__), 'data', 'proposals')
    pdf_files = [f for f in os.listdir(proposals_dir) if f.endswith('.pdf') and f'_{bid_id}.pdf' in f]
    if not pdf_files:
        return jsonify({'error': 'No proposal PDF found. Generate the proposal first.'}), 404
    pdf_path = os.path.join(proposals_dir, sorted(pdf_files)[-1])

    try:
        msg = MIMEMultipart()
        msg['From'] = from_email
        msg['To'] = ', '.join(recipients)
        msg['Subject'] = subject

        msg.attach(MIMEText(body_text, 'plain'))

        with open(pdf_path, 'rb') as f:
            part = MIMEBase('application', 'pdf')
            part.set_payload(f.read())
            encoders.encode_base64(part)
            part.add_header('Content-Disposition', f'attachment; filename="{os.path.basename(pdf_path)}"')
            msg.attach(part)

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)

        return jsonify({'ok': True, 'sent_to': recipients})

    except Exception as e:
        return jsonify({'error': f'Email failed: {str(e)}'}), 500

# ─── Bid Follow-ups (Phase 4) ───────────────────────────────────

@app.route('/api/bids/<int:bid_id>/followups')
@api_role_required('owner', 'admin', 'project_manager')
def api_bid_followups(bid_id):
    conn = get_db()
    rows = conn.execute(
        '''SELECT bf.*, u.display_name as assigned_name FROM bid_followups bf
           LEFT JOIN users u ON bf.assigned_to = u.id
           WHERE bf.bid_id = ? ORDER BY bf.followup_date''', (bid_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/bids/<int:bid_id>/followups', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_create_bid_followup(bid_id):
    data = request.get_json()
    conn = get_db()
    cursor = conn.execute(
        '''INSERT INTO bid_followups (bid_id, followup_date, followup_type, notes, assigned_to, created_by)
           VALUES (?,?,?,?,?,?)''',
        (bid_id, data.get('followup_date',''), data.get('followup_type','Call'),
         data.get('notes',''), data.get('assigned_to') or None, session.get('user_id'))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': cursor.lastrowid}), 201

@app.route('/api/bids/<int:bid_id>/followups/<int:fid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_update_bid_followup(bid_id, fid):
    data = request.get_json()
    conn = get_db()
    conn.execute(
        '''UPDATE bid_followups SET followup_date=?, followup_type=?, notes=?, result=?,
           status=?, assigned_to=? WHERE id=? AND bid_id=?''',
        (data.get('followup_date',''), data.get('followup_type','Call'), data.get('notes',''),
         data.get('result',''), data.get('status','Scheduled'),
         data.get('assigned_to') or None, fid, bid_id)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/bids/<int:bid_id>/followups/<int:fid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_delete_bid_followup(bid_id, fid):
    conn = get_db()
    conn.execute('DELETE FROM bid_followups WHERE id = ? AND bid_id = ?', (fid, bid_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/followups/upcoming')
@api_role_required('owner', 'admin', 'project_manager')
def api_upcoming_followups():
    from datetime import datetime, timedelta
    today = datetime.now().strftime('%Y-%m-%d')
    week_out = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
    conn = get_db()
    rows = conn.execute(
        '''SELECT bf.*, b.bid_name, j.name as job_name, u.display_name as assigned_name
           FROM bid_followups bf
           JOIN bids b ON bf.bid_id = b.id
           LEFT JOIN jobs j ON b.job_id = j.id
           LEFT JOIN users u ON bf.assigned_to = u.id
           WHERE bf.status = 'Scheduled' AND bf.followup_date BETWEEN ? AND ?
           ORDER BY bf.followup_date''', (today, week_out)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/bids/<int:bid_id>/award', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_award_bid(bid_id):
    from datetime import datetime
    conn = get_db()
    bid = conn.execute('SELECT * FROM bids WHERE id = ?', (bid_id,)).fetchone()
    if not bid:
        conn.close()
        return jsonify({'error': 'Bid not found'}), 404
    job_id = bid['job_id']
    if not job_id:
        conn.close()
        return jsonify({'error': 'Bid must be linked to a job before awarding'}), 400

    today = datetime.now().strftime('%Y-%m-%d')
    # 1. Set bid status to Accepted
    conn.execute("UPDATE bids SET status = 'Accepted', updated_at = datetime('now','localtime') WHERE id = ?", (bid_id,))
    # 2. Set job status to Awarded
    conn.execute("UPDATE jobs SET status = 'Awarded', awarded_date = ?, updated_at = datetime('now','localtime') WHERE id = ?", (today, job_id))
    # 3. Create precon meeting record
    existing_precon = conn.execute('SELECT id FROM precon_meetings WHERE job_id = ?', (job_id,)).fetchone()
    if not existing_precon:
        conn.execute(
            "INSERT INTO precon_meetings (job_id, status, created_by) VALUES (?, 'Not Scheduled', ?)",
            (job_id, session.get('user_id'))
        )
    # 4. Auto-create schedule phases
    phases = [
        ('Pre-Construction', 0), ('Rough-In', 1), ('Trim Out', 2), ('Startup', 3), ('Closeout', 4)
    ]
    for phase_name, sort in phases:
        existing = conn.execute('SELECT id FROM job_schedule_events WHERE job_id = ? AND phase_name = ?', (job_id, phase_name)).fetchone()
        if not existing:
            conn.execute(
                '''INSERT INTO job_schedule_events (job_id, phase_name, status, sort_order, created_by)
                   VALUES (?,?,?,?,?)''',
                (job_id, phase_name, 'Pending', sort, session.get('user_id'))
            )
    # 5. Seed default PM benchmarks
    default_benchmarks = [
        ('Pre-Construction', 'Precon meeting completed', 0),
        ('Pre-Construction', 'Contract signed', 1),
        ('Pre-Construction', 'Insurance submitted', 2),
        ('Pre-Construction', 'Permits applied for', 3),
        ('Pre-Construction', 'Material ordered', 4),
        ('Pre-Construction', 'Schedule set with GC', 5),
        ('Rough-In', 'Ductwork installed', 6),
        ('Rough-In', 'Line sets run', 7),
        ('Rough-In', 'Condensate drains installed', 8),
        ('Rough-In', 'Low voltage wire pulled', 9),
        ('Rough-In', 'Disconnects installed', 10),
        ('Rough-In', 'Gas piping complete', 11),
        ('Rough-In', 'Rough inspection passed', 12),
        ('Trim Out', 'AHUs installed', 13),
        ('Trim Out', 'Condensers set', 14),
        ('Trim Out', 'Registers and grilles installed', 15),
        ('Trim Out', 'Thermostats installed', 16),
        ('Trim Out', 'Refrigerant lines connected', 17),
        ('Trim Out', 'Condensate tested', 18),
        ('Startup', 'System startup complete', 19),
        ('Startup', 'Charge verified', 20),
        ('Startup', 'Airflow balanced', 21),
        ('Startup', 'Thermostat programmed', 22),
        ('Startup', 'Startup report completed', 23),
        ('Closeout', 'O&M manuals delivered', 24),
        ('Closeout', 'Warranty letters submitted', 25),
        ('Closeout', 'As-builts delivered', 26),
        ('Closeout', 'Lien waiver submitted', 27),
        ('Closeout', 'Final inspection passed', 28),
        ('Closeout', 'Punch list complete', 29),
    ]
    existing_benchmarks = conn.execute('SELECT COUNT(*) FROM pm_benchmarks WHERE job_id = ?', (job_id,)).fetchone()[0]
    if existing_benchmarks == 0:
        for phase, task, sort in default_benchmarks:
            conn.execute(
                'INSERT INTO pm_benchmarks (job_id, phase, task_name, sort_order) VALUES (?,?,?,?)',
                (job_id, phase, task, sort)
            )
    # 6. Notify owners + PMs
    users = conn.execute("SELECT id FROM users WHERE role IN ('owner','project_manager') AND is_active = 1").fetchall()
    job = conn.execute('SELECT name FROM jobs WHERE id = ?', (job_id,)).fetchone()
    conn.commit()
    conn.close()
    for u in users:
        create_notification(u['id'], 'bid', f'Bid Awarded: {bid["bid_name"]}',
                          f'Job "{job["name"]}" has been awarded.', f'/projects/{job_id}')
    return jsonify({'ok': True})

# ─── Precon Meetings (Phase 4) ──────────────────────────────────

@app.route('/api/jobs/<int:job_id>/precon')
@api_role_required('owner', 'admin', 'project_manager')
def api_precon_meeting(job_id):
    conn = get_db()
    meeting = conn.execute('SELECT * FROM precon_meetings WHERE job_id = ?', (job_id,)).fetchone()
    conn.close()
    return jsonify(dict(meeting) if meeting else {'status': 'No Meeting'})

@app.route('/api/jobs/<int:job_id>/precon', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_update_precon_meeting(job_id):
    data = request.get_json()
    conn = get_db()
    existing = conn.execute('SELECT id FROM precon_meetings WHERE job_id = ?', (job_id,)).fetchone()
    if existing:
        conn.execute(
            '''UPDATE precon_meetings SET meeting_date=?, attendees=?, location=?, agenda=?,
               minutes=?, gc_contact=?, status=?, updated_at=datetime('now','localtime') WHERE job_id=?''',
            (data.get('meeting_date',''), data.get('attendees',''), data.get('location',''),
             data.get('agenda',''), data.get('minutes',''), data.get('gc_contact',''),
             data.get('status','Not Scheduled'), job_id)
        )
    else:
        conn.execute(
            '''INSERT INTO precon_meetings (job_id, meeting_date, attendees, location, agenda, minutes, gc_contact, status, created_by)
               VALUES (?,?,?,?,?,?,?,?,?)''',
            (job_id, data.get('meeting_date',''), data.get('attendees',''), data.get('location',''),
             data.get('agenda',''), data.get('minutes',''), data.get('gc_contact',''),
             data.get('status','Not Scheduled'), session.get('user_id'))
        )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/jobs/<int:job_id>/precon/complete', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_complete_precon_meeting(job_id):
    conn = get_db()
    conn.execute("UPDATE precon_meetings SET status = 'Completed', updated_at=datetime('now','localtime') WHERE job_id = ?", (job_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ─── PM Benchmarks (Phase 4/6) ──────────────────────────────────

@app.route('/api/jobs/<int:job_id>/benchmarks')
@api_role_required('owner', 'admin', 'project_manager')
def api_job_benchmarks(job_id):
    conn = get_db()
    rows = conn.execute(
        '''SELECT pb.*, u.display_name as completed_by_name FROM pm_benchmarks pb
           LEFT JOIN users u ON pb.completed_by = u.id
           WHERE pb.job_id = ? ORDER BY pb.sort_order''', (job_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/jobs/<int:job_id>/benchmarks/<int:bid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_update_benchmark(job_id, bid):
    data = request.get_json()
    from datetime import datetime
    conn = get_db()
    new_status = data.get('status', 'Not Started')
    completed_by = session.get('user_id') if new_status == 'Complete' else None
    completed_date = datetime.now().strftime('%Y-%m-%d') if new_status == 'Complete' else ''
    conn.execute(
        '''UPDATE pm_benchmarks SET status=?, completed_date=?, completed_by=?, notes=?,
           updated_at=datetime('now','localtime') WHERE id=? AND job_id=?''',
        (new_status, completed_date, completed_by, data.get('notes',''), bid, job_id)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/email-settings', methods=['GET', 'POST'])
@api_role_required('owner', 'admin')
def api_email_settings():
    """Get or save email/SMTP settings."""
    settings_path = os.path.join(os.path.dirname(__file__), 'data', 'email_settings.json')
    if request.method == 'GET':
        if os.path.exists(settings_path):
            with open(settings_path) as f:
                settings = json.load(f)
            settings.pop('smtp_pass', None)  # never return password
            return jsonify(settings)
        return jsonify({})
    else:
        data = request.get_json()
        # Load existing to preserve password if not provided
        existing = {}
        if os.path.exists(settings_path):
            with open(settings_path) as f:
                existing = json.load(f)
        settings = {
            'smtp_host': data.get('smtp_host', existing.get('smtp_host', '')),
            'smtp_port': data.get('smtp_port', existing.get('smtp_port', 587)),
            'smtp_user': data.get('smtp_user', existing.get('smtp_user', '')),
            'from_email': data.get('from_email', existing.get('from_email', '')),
            'team_emails': data.get('team_emails', existing.get('team_emails', '')),
        }
        if data.get('smtp_pass'):
            settings['smtp_pass'] = data['smtp_pass']
        elif existing.get('smtp_pass'):
            settings['smtp_pass'] = existing['smtp_pass']
        with open(settings_path, 'w') as f:
            json.dump(settings, f)
        return jsonify({'ok': True})


# ─── Chatbot ────────────────────────────────────────────────

@app.route('/chatbot')
@login_required
def chatbot_page():
    return render_template('chatbot.html')

@app.route('/api/chatbot/sessions')
@api_login_required
def api_chat_sessions():
    conn = get_db()
    sessions = conn.execute(
        'SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY created_at DESC',
        (session['user_id'],)
    ).fetchall()
    conn.close()
    return jsonify([dict(s) for s in sessions])

@app.route('/api/chatbot/sessions', methods=['POST'])
@api_login_required
def api_create_chat_session():
    conn = get_db()
    cursor = conn.execute(
        'INSERT INTO chat_sessions (user_id, title) VALUES (?, ?)',
        (session['user_id'], 'New Chat')
    )
    sid = cursor.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': sid}), 201

@app.route('/api/chatbot/sessions/<int:sid>/messages')
@api_login_required
def api_chat_messages(sid):
    conn = get_db()
    msgs = conn.execute(
        'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
        (sid,)
    ).fetchall()
    conn.close()
    return jsonify([dict(m) for m in msgs])

@app.route('/api/chatbot/sessions/<int:sid>/messages', methods=['POST'])
@api_login_required
def api_send_chat_message(sid):
    data = request.get_json()
    user_msg = (data.get('content') or '').strip()
    if not user_msg:
        return jsonify({'error': 'Empty message'}), 400

    conn = get_db()
    # Verify session belongs to user
    sess = conn.execute('SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?',
                        (sid, session['user_id'])).fetchone()
    if not sess:
        conn.close()
        return jsonify({'error': 'Session not found'}), 404

    # Save user message
    conn.execute('INSERT INTO chat_messages (session_id, role, content) VALUES (?,?,?)',
                 (sid, 'user', user_msg))

    # Update session title from first message
    msg_count = conn.execute('SELECT COUNT(*) FROM chat_messages WHERE session_id = ?', (sid,)).fetchone()[0]
    if msg_count <= 1:
        title = user_msg[:50] + ('...' if len(user_msg) > 50 else '')
        conn.execute('UPDATE chat_sessions SET title = ? WHERE id = ?', (title, sid))

    # Generate bot response -- try Claude first, fall back to rule-based
    bot_response = generate_claude_response(
        conn, user_msg,
        role=session.get('role', 'employee'),
        user_id=session.get('user_id'),
        session_id=sid
    )
    if bot_response is None:
        # Fallback to rule-based engine
        bot_response = generate_bot_response(conn, user_msg, role=session.get('role', 'employee'), user_id=session.get('user_id'))

    # Save bot message
    conn.execute('INSERT INTO chat_messages (session_id, role, content) VALUES (?,?,?)',
                 (sid, 'assistant', bot_response))

    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'response': bot_response})


# ─── Pay Applications (AIA G702/G703) ────────────────────────────

@app.route('/payapps')
@role_required('owner', 'admin', 'project_manager')
def payapps_page():
    return render_template('payapps/list.html')

@app.route('/payapps/contract/<int:contract_id>')
@role_required('owner', 'admin', 'project_manager')
def payapps_contract_page(contract_id):
    return render_template('payapps/contract.html', contract_id=contract_id)

@app.route('/payapps/application/<int:app_id>')
@role_required('owner', 'admin', 'project_manager')
def payapps_application_page(app_id):
    return render_template('payapps/application.html', app_id=app_id)

@app.route('/api/payapps/contracts')
@api_role_required('owner', 'admin', 'project_manager')
def api_payapps_contracts():
    conn = get_db()
    rows = conn.execute('''
        SELECT c.*, j.name as job_name,
            (SELECT COUNT(*) FROM pay_applications WHERE contract_id = c.id) as app_count,
            (SELECT status FROM pay_applications WHERE contract_id = c.id ORDER BY application_number DESC LIMIT 1) as latest_status
        FROM pay_app_contracts c
        LEFT JOIN jobs j ON c.job_id = j.id
        ORDER BY c.created_at DESC
    ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/payapps/contracts', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_payapps_contracts_create():
    data = request.get_json(force=True)
    conn = get_db()
    job = conn.execute('SELECT name, address, city, state FROM jobs WHERE id = ?', (data.get('job_id'),)).fetchone()
    project_name = job['name'] if job else ''
    project_address = f"{job['address'] or ''}, {job['city'] or ''} {job['state'] or ''}".strip(', ') if job else ''
    cursor = conn.execute(
        '''INSERT INTO pay_app_contracts (job_id, gc_name, gc_address, project_name, project_address,
           project_no, contract_for, contract_date, original_contract_sum,
           retainage_work_pct, retainage_stored_pct, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)''',
        (data.get('job_id'), data.get('gc_name', ''), data.get('gc_address', ''),
         project_name, project_address,
         data.get('project_no', ''), data.get('contract_for', ''), data.get('contract_date', ''),
         data.get('original_contract_sum', 0),
         data.get('retainage_work_pct', 10), data.get('retainage_stored_pct', 0),
         session['user_id'])
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': cursor.lastrowid})

@app.route('/api/payapps/contracts/<int:cid>/detail')
@api_role_required('owner', 'admin', 'project_manager')
def api_payapps_contract_detail(cid):
    conn = get_db()
    c = conn.execute('SELECT * FROM pay_app_contracts WHERE id = ?', (cid,)).fetchone()
    if not c:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    job = conn.execute('SELECT name FROM jobs WHERE id = ?', (c['job_id'],)).fetchone()
    result = dict(c)
    result['job_name'] = job['name'] if job else ''
    conn.close()
    return jsonify(result)

@app.route('/api/payapps/contracts/<int:cid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_payapps_contracts_delete(cid):
    conn = get_db()
    conn.execute('DELETE FROM pay_app_contracts WHERE id = ?', (cid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# --- SOV Items ---

@app.route('/api/payapps/contracts/<int:cid>/sov')
@api_role_required('owner', 'admin', 'project_manager')
def api_payapps_sov_list(cid):
    conn = get_db()
    rows = conn.execute(
        'SELECT * FROM pay_app_sov_items WHERE contract_id = ? ORDER BY sort_order, id', (cid,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/payapps/contracts/<int:cid>/sov', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_payapps_sov_create(cid):
    data = request.get_json(force=True)
    conn = get_db()
    # Auto-assign item number
    max_num = conn.execute('SELECT MAX(item_number) FROM pay_app_sov_items WHERE contract_id = ?', (cid,)).fetchone()[0] or 0
    conn.execute(
        '''INSERT INTO pay_app_sov_items (contract_id, item_number, description, scheduled_value,
           is_header, retainage_exempt, sort_order)
           VALUES (?,?,?,?,?,?,?)''',
        (cid, max_num + 1, data.get('description', ''), data.get('scheduled_value', 0),
         data.get('is_header', 0), data.get('retainage_exempt', 0), data.get('sort_order', max_num + 1))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/payapps/sov/<int:sid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_payapps_sov_update(sid):
    data = request.get_json(force=True)
    conn = get_db()
    fields = []
    params = []
    for key in ('description', 'scheduled_value', 'is_header', 'retainage_exempt', 'sort_order', 'item_number'):
        if key in data:
            fields.append(f'{key} = ?')
            params.append(data[key])
    if fields:
        params.append(sid)
        conn.execute(f'UPDATE pay_app_sov_items SET {", ".join(fields)} WHERE id = ?', params)
        conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/payapps/sov/<int:sid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_payapps_sov_delete(sid):
    conn = get_db()
    conn.execute('DELETE FROM pay_app_sov_items WHERE id = ?', (sid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# --- Applications ---

@app.route('/api/payapps/contracts/<int:cid>/applications')
@api_role_required('owner', 'admin', 'project_manager')
def api_payapps_apps_list(cid):
    conn = get_db()
    apps = conn.execute(
        'SELECT * FROM pay_applications WHERE contract_id = ? ORDER BY application_number', (cid,)
    ).fetchall()
    contract = conn.execute('SELECT * FROM pay_app_contracts WHERE id = ?', (cid,)).fetchone()
    result = []
    for a in apps:
        row = dict(a)
        row['current_payment_due'] = _calc_current_payment(conn, contract, a)
        result.append(row)
    conn.close()
    return jsonify(result)

@app.route('/api/payapps/contracts/<int:cid>/applications', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_payapps_apps_create(cid):
    conn = get_db()
    max_num = conn.execute(
        'SELECT MAX(application_number) FROM pay_applications WHERE contract_id = ?', (cid,)
    ).fetchone()[0] or 0
    today = datetime.now().strftime('%Y-%m-%d')
    cursor = conn.execute(
        '''INSERT INTO pay_applications (contract_id, application_number, period_to, application_date, created_by)
           VALUES (?,?,?,?,?)''',
        (cid, max_num + 1, today, today, session['user_id'])
    )
    app_id = cursor.lastrowid
    # Create empty entries for all SOV items
    sov_items = conn.execute('SELECT id FROM pay_app_sov_items WHERE contract_id = ? AND is_header = 0', (cid,)).fetchall()
    for item in sov_items:
        conn.execute(
            'INSERT INTO pay_app_line_entries (pay_app_id, sov_item_id, work_this_period, materials_stored) VALUES (?,?,0,0)',
            (app_id, item['id'])
        )
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': app_id})

@app.route('/api/payapps/applications/<int:aid>')
@api_role_required('owner', 'admin', 'project_manager')
def api_payapps_app_detail(aid):
    conn = get_db()
    app_row = conn.execute('SELECT * FROM pay_applications WHERE id = ?', (aid,)).fetchone()
    if not app_row:
        conn.close()
        return jsonify({'error': 'Not found'}), 404

    contract = conn.execute('SELECT * FROM pay_app_contracts WHERE id = ?', (app_row['contract_id'],)).fetchone()
    job = conn.execute('SELECT name FROM jobs WHERE id = ?', (contract['job_id'],)).fetchone()

    sov_items = conn.execute(
        'SELECT * FROM pay_app_sov_items WHERE contract_id = ? ORDER BY sort_order, id',
        (contract['id'],)
    ).fetchall()

    # Current entries
    current_entries = {}
    for entry in conn.execute('SELECT * FROM pay_app_line_entries WHERE pay_app_id = ?', (aid,)).fetchall():
        current_entries[entry['sov_item_id']] = dict(entry)

    # Prior apps
    prior_apps = conn.execute(
        'SELECT id FROM pay_applications WHERE contract_id = ? AND application_number < ? ORDER BY application_number',
        (contract['id'], app_row['application_number'])
    ).fetchall()
    prior_ids = [p['id'] for p in prior_apps]

    # "From previous" for each SOV item
    from_previous = {}
    if prior_ids:
        placeholders = ','.join('?' * len(prior_ids))
        for row in conn.execute(
            f'SELECT sov_item_id, SUM(work_this_period) as total_prev FROM pay_app_line_entries WHERE pay_app_id IN ({placeholders}) GROUP BY sov_item_id',
            prior_ids
        ).fetchall():
            from_previous[row['sov_item_id']] = row['total_prev'] or 0

    # Prior change orders
    prior_co_add = 0
    prior_co_ded = 0
    if prior_ids:
        placeholders = ','.join('?' * len(prior_ids))
        co = conn.execute(
            f'SELECT SUM(co_additions) as a, SUM(co_deductions) as d FROM pay_applications WHERE id IN ({placeholders})', prior_ids
        ).fetchone()
        prior_co_add = co['a'] or 0
        prior_co_ded = co['d'] or 0

    # Previous Line 6
    prev_line_6 = 0
    if prior_ids:
        prev_line_6 = _calc_earned_less_retainage(conn, contract, app_row['application_number'] - 1)

    # Build lines
    lines = []
    t = dict(scheduled_value=0, from_previous=0, this_period=0, materials_stored=0, total_completed=0, balance=0, retainage=0)

    for item in sov_items:
        entry = current_entries.get(item['id'], {})
        prev = from_previous.get(item['id'], 0)
        this_p = entry.get('work_this_period', 0) or 0
        mats = entry.get('materials_stored', 0) or 0
        sv = item['scheduled_value'] or 0

        completed = prev + this_p + mats
        pct = (completed / sv * 100) if sv else 0
        bal = sv - completed

        ret = 0
        if not item['is_header'] and not item['retainage_exempt'] and sv > 0:
            ret = (contract['retainage_work_pct'] / 100) * (prev + this_p)
            ret += (contract['retainage_stored_pct'] / 100) * mats
            ret = round(ret, 2)

        lines.append({
            'sov_item_id': item['id'], 'item_number': item['item_number'],
            'description': item['description'], 'scheduled_value': sv,
            'is_header': item['is_header'], 'retainage_exempt': item['retainage_exempt'],
            'from_previous': prev, 'this_period': this_p, 'materials_stored': mats,
            'total_completed': completed, 'pct_complete': round(pct, 0),
            'balance': bal, 'retainage': ret,
        })

        if not item['is_header']:
            t['scheduled_value'] += sv
            t['from_previous'] += prev
            t['this_period'] += this_p
            t['materials_stored'] += mats
            t['total_completed'] += completed
            t['balance'] += bal
            t['retainage'] += ret

    t['retainage'] = round(t['retainage'], 2)

    conn.close()
    return jsonify({
        'application': dict(app_row),
        'contract': dict(contract),
        'job_name': job['name'] if job else '',
        'lines': lines,
        'totals': t,
        'g702': {
            'co_prev_additions': prior_co_add,
            'co_prev_deductions': prior_co_ded,
            'previous_certificates': prev_line_6,
        }
    })

@app.route('/api/payapps/applications/<int:aid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_payapps_app_update(aid):
    data = request.get_json(force=True)
    conn = get_db()

    # Update meta fields
    for field in ('period_to', 'application_date', 'co_additions', 'co_deductions', 'status'):
        if field in data:
            conn.execute(f'UPDATE pay_applications SET {field} = ? WHERE id = ?', (data[field], aid))

    # Update line entries
    if 'entries' in data:
        for entry in data['entries']:
            conn.execute(
                '''INSERT INTO pay_app_line_entries (pay_app_id, sov_item_id, work_this_period, materials_stored)
                   VALUES (?,?,?,?)
                   ON CONFLICT(pay_app_id, sov_item_id) DO UPDATE SET
                   work_this_period = excluded.work_this_period,
                   materials_stored = excluded.materials_stored''',
                (aid, entry['sov_item_id'], entry.get('work_this_period', 0), entry.get('materials_stored', 0))
            )

    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/payapps/applications/<int:aid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_payapps_app_delete(aid):
    conn = get_db()
    conn.execute('DELETE FROM pay_applications WHERE id = ?', (aid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


def _calc_earned_less_retainage(conn, contract, up_to_app_number):
    """Calculate Total Earned Less Retainage (G702 Line 6) through a given app number."""
    sov_items = conn.execute(
        'SELECT * FROM pay_app_sov_items WHERE contract_id = ? ORDER BY sort_order',
        (contract['id'],)
    ).fetchall()
    apps = conn.execute(
        'SELECT id, application_number FROM pay_applications WHERE contract_id = ? AND application_number <= ? ORDER BY application_number',
        (contract['id'], up_to_app_number)
    ).fetchall()
    if not apps:
        return 0

    app_ids = [a['id'] for a in apps]
    latest_app_id = app_ids[-1]

    # Sum work_this_period per SOV item across all apps, and get latest materials_stored
    all_entries = {}
    placeholders = ','.join('?' * len(app_ids))
    for row in conn.execute(
        f'SELECT sov_item_id, pay_app_id, work_this_period, materials_stored FROM pay_app_line_entries WHERE pay_app_id IN ({placeholders})',
        app_ids
    ).fetchall():
        sid = row['sov_item_id']
        if sid not in all_entries:
            all_entries[sid] = {'work_total': 0, 'latest_materials': 0}
        all_entries[sid]['work_total'] += (row['work_this_period'] or 0)
        if row['pay_app_id'] == latest_app_id:
            all_entries[sid]['latest_materials'] = row['materials_stored'] or 0

    total_completed = 0
    total_retainage = 0
    for item in sov_items:
        if item['is_header']:
            continue
        ed = all_entries.get(item['id'], {'work_total': 0, 'latest_materials': 0})
        work = ed['work_total']
        mats = ed['latest_materials']
        total_completed += work + mats
        if not item['retainage_exempt'] and (item['scheduled_value'] or 0) > 0:
            total_retainage += (contract['retainage_work_pct'] / 100) * work
            total_retainage += (contract['retainage_stored_pct'] / 100) * mats

    return round(total_completed - total_retainage, 2)


def _calc_current_payment(conn, contract, app_row):
    """Quick calculation of current payment due for list display."""
    sov_items = conn.execute(
        'SELECT * FROM pay_app_sov_items WHERE contract_id = ? AND is_header = 0',
        (contract['id'],)
    ).fetchall()
    all_apps = conn.execute(
        'SELECT id, application_number FROM pay_applications WHERE contract_id = ? AND application_number <= ? ORDER BY application_number',
        (contract['id'], app_row['application_number'])
    ).fetchall()
    if not all_apps:
        return 0

    app_ids = [a['id'] for a in all_apps]
    current_id = app_row['id']
    prior_ids = [a['id'] for a in all_apps if a['id'] != current_id]

    # Current entries
    entries = {}
    for e in conn.execute('SELECT * FROM pay_app_line_entries WHERE pay_app_id = ?', (current_id,)).fetchall():
        entries[e['sov_item_id']] = e

    # From previous
    from_prev = {}
    if prior_ids:
        ph = ','.join('?' * len(prior_ids))
        for r in conn.execute(f'SELECT sov_item_id, SUM(work_this_period) as t FROM pay_app_line_entries WHERE pay_app_id IN ({ph}) GROUP BY sov_item_id', prior_ids).fetchall():
            from_prev[r['sov_item_id']] = r['t'] or 0

    total_completed = 0
    total_retainage = 0
    for item in sov_items:
        prev = from_prev.get(item['id'], 0)
        e = entries.get(item['id'])
        this_p = (e['work_this_period'] or 0) if e else 0
        mats = (e['materials_stored'] or 0) if e else 0
        total_completed += prev + this_p + mats
        if not item['retainage_exempt'] and (item['scheduled_value'] or 0) > 0:
            total_retainage += (contract['retainage_work_pct'] / 100) * (prev + this_p)
            total_retainage += (contract['retainage_stored_pct'] / 100) * mats

    line_6 = total_completed - total_retainage

    # Previous line 6
    prev_line_6 = 0
    if prior_ids:
        prev_line_6 = _calc_earned_less_retainage(conn, contract, app_row['application_number'] - 1)

    return round(line_6 - prev_line_6, 2)


# ─── Equipment Manuals ───────────────────────────────────────────

MANUALS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'manuals')
os.makedirs(MANUALS_DIR, exist_ok=True)

@app.route('/manuals')
@login_required
def manuals_page():
    return render_template('manuals/list.html')

@app.route('/api/manuals')
@api_login_required
def api_manuals_list():
    q = request.args.get('q', '').strip()
    mfg = request.args.get('manufacturer', '').strip()
    conn = get_db()
    sql = 'SELECT * FROM equipment_manuals WHERE 1=1'
    params = []
    if q:
        sql += ' AND (model_number LIKE ? OR title LIKE ? OR manufacturer LIKE ?)'
        params += [f'%{q}%', f'%{q}%', f'%{q}%']
    if mfg:
        sql += ' AND manufacturer = ?'
        params.append(mfg)
    sql += ' ORDER BY manufacturer, model_number'
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/manuals', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_manuals_create():
    conn = get_db()
    if request.content_type and 'multipart' in request.content_type:
        mfg = request.form.get('manufacturer', '')
        model = request.form.get('model_number', '')
        title = request.form.get('title', '')
        mtype = request.form.get('manual_type', 'Installation')
        file = request.files.get('file')
        file_path = ''
        if file and file.filename:
            from werkzeug.utils import secure_filename
            fname = secure_filename(file.filename)
            # Avoid collisions
            fname = f"{int(datetime.now().timestamp())}_{fname}"
            file.save(os.path.join(MANUALS_DIR, fname))
            file_path = fname
        conn.execute(
            '''INSERT INTO equipment_manuals (manufacturer, model_number, manual_type, title, file_path, uploaded_by)
               VALUES (?,?,?,?,?,?)''',
            (mfg, model, mtype, title, file_path, session['user_id'])
        )
    else:
        data = request.get_json(force=True)
        conn.execute(
            '''INSERT INTO equipment_manuals (manufacturer, model_number, manual_type, title, external_url, brand, equipment_type, tonnage, fuel_type, tags, uploaded_by)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
            (data.get('manufacturer', ''), data.get('model_number', ''), data.get('manual_type', 'Installation'),
             data.get('title', ''), data.get('external_url', ''),
             data.get('brand', data.get('manufacturer', '')), data.get('equipment_type', ''),
             data.get('tonnage', ''), data.get('fuel_type', ''), data.get('tags', ''),
             session['user_id'])
        )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/manuals/<int:mid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_manuals_delete(mid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM equipment_manuals WHERE id = ?', (mid,)).fetchone()
    if row and row['file_path']:
        fpath = os.path.join(MANUALS_DIR, row['file_path'])
        if os.path.exists(fpath):
            os.remove(fpath)
    conn.execute('DELETE FROM equipment_manuals WHERE id = ?', (mid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/manuals/<int:mid>/file')
@api_login_required
def api_manuals_file(mid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM equipment_manuals WHERE id = ?', (mid,)).fetchone()
    conn.close()
    if not row or not row['file_path']:
        return 'Not found', 404
    fpath = os.path.join(MANUALS_DIR, row['file_path'])
    if not os.path.exists(fpath):
        return 'File not found', 404
    return send_file(fpath, mimetype='application/pdf')

@app.route('/api/manuals/bulk-import', methods=['POST'])
@api_role_required('owner', 'admin')
def api_manuals_bulk_import():
    """Import manuals from JSON data."""
    data = request.get_json()
    items = data.get('items', [])
    conn = get_db()
    count = 0
    for item in items:
        conn.execute(
            '''INSERT INTO equipment_manuals (manufacturer, model_number, manual_type, title, external_url, brand, equipment_type, tonnage, fuel_type, tags, uploaded_by)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
            (item.get('manufacturer',''), item.get('model_number',''), item.get('manual_type','Installation'),
             item.get('title',''), item.get('external_url',''), item.get('brand',''),
             item.get('equipment_type',''), item.get('tonnage',''), item.get('fuel_type',''),
             item.get('tags',''), session.get('user_id'))
        )
        count += 1
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'imported': count})

@app.route('/api/manuals/brands')
@api_login_required
def api_manuals_brands():
    """Get distinct brand list."""
    conn = get_db()
    brands = conn.execute("SELECT DISTINCT brand FROM equipment_manuals WHERE brand != '' ORDER BY brand").fetchall()
    types = conn.execute("SELECT DISTINCT equipment_type FROM equipment_manuals WHERE equipment_type != '' ORDER BY equipment_type").fetchall()
    conn.close()
    return jsonify({
        'brands': [b['brand'] for b in brands],
        'equipment_types': [t['equipment_type'] for t in types]
    })

@app.route('/api/manuals/search')
@api_login_required
def api_manuals_search():
    """Enhanced search with brand/type/tonnage filters."""
    q = request.args.get('q', '').strip()
    brand = request.args.get('brand', '')
    etype = request.args.get('type', '')
    clauses = []
    params = []
    if q:
        clauses.append("(manufacturer LIKE ? OR model_number LIKE ? OR title LIKE ? OR tags LIKE ?)")
        params.extend([f'%{q}%'] * 4)
    if brand:
        clauses.append("brand = ?")
        params.append(brand)
    if etype:
        clauses.append("equipment_type = ?")
        params.append(etype)
    where = ' AND '.join(clauses) if clauses else '1=1'
    conn = get_db()
    results = conn.execute(f'SELECT * FROM equipment_manuals WHERE {where} ORDER BY manufacturer, model_number', params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in results])

@app.route('/api/codebooks/<int:book_id>/sections/<int:sid>/content', methods=['POST'])
@api_role_required('owner', 'admin')
def api_codebook_update_section_content(book_id, sid):
    """Update section content."""
    data = request.get_json()
    conn = get_db()
    conn.execute('UPDATE code_sections SET content = ?, is_complete = 1 WHERE id = ? AND book_id = ?',
                 (data.get('content', ''), sid, book_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/codebooks/import-sections', methods=['POST'])
@api_role_required('owner', 'admin')
def api_codebook_import_sections():
    """Bulk import code book sections."""
    data = request.get_json()
    sections = data.get('sections', [])
    conn = get_db()
    count = 0
    for s in sections:
        conn.execute(
            '''INSERT INTO code_sections (book_id, section_number, title, content, parent_section_id, depth, sort_order, is_complete)
               VALUES (?,?,?,?,?,?,?,?)''',
            (s.get('book_id'), s.get('section_number',''), s.get('title',''), s.get('content',''),
             s.get('parent_section_id'), s.get('depth', 0), s.get('sort_order', 0), 1 if s.get('content') else 0)
        )
        count += 1
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'imported': count})


# ─── Job Schedule ────────────────────────────────────────────────

@app.route('/schedule')
@role_required('owner', 'admin', 'project_manager')
def schedule_page():
    return render_template('schedule/list.html')

@app.route('/schedule/job/<int:job_id>')
@role_required('owner', 'admin', 'project_manager')
def schedule_job_page(job_id):
    return render_template('schedule/job.html', job_id=job_id)

@app.route('/api/schedule/events')
@api_role_required('owner', 'admin', 'project_manager')
def api_schedule_events():
    job_id = request.args.get('job_id', '')
    conn = get_db()
    if job_id:
        rows = conn.execute(
            'SELECT * FROM job_schedule_events WHERE job_id = ? ORDER BY sort_order, id',
            (job_id,)
        ).fetchall()
    else:
        rows = conn.execute(
            'SELECT * FROM job_schedule_events ORDER BY job_id, sort_order, id'
        ).fetchall()
    result = [dict(r) for r in rows]
    conn.close()
    # Check for upcoming due-date notifications
    _check_schedule_notifications(result)
    return jsonify(result)

def _check_schedule_notifications(events):
    """Create notifications for events with end_date within 24 hours."""
    from datetime import timedelta
    now = datetime.now()
    tomorrow = now + timedelta(hours=24)
    conn = get_db()
    for e in events:
        if not e.get('end_date') or e['status'] in ('Complete', 'Cancelled'):
            continue
        if not e.get('assigned_to'):
            continue
        try:
            end_dt = datetime.strptime(e['end_date'], '%Y-%m-%d')
        except (ValueError, TypeError):
            continue
        if now <= end_dt <= tomorrow:
            # Check if already notified today
            today_str = now.strftime('%Y-%m-%d')
            existing = conn.execute(
                '''SELECT id FROM notifications WHERE user_id = ? AND type = 'schedule'
                   AND message LIKE ? AND created_at >= ?''',
                (e['assigned_to'], f'%event #{e["id"]}%', today_str)
            ).fetchone()
            if not existing:
                # Get job name
                job = conn.execute('SELECT name FROM jobs WHERE id = ?', (e['job_id'],)).fetchone()
                job_name = job['name'] if job else f'Job #{e["job_id"]}'
                conn.execute(
                    'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?,?,?,?,?)',
                    (e['assigned_to'], 'schedule', 'Schedule: Due Soon',
                     f'{e["phase_name"]} on {job_name} due {e["end_date"]} (event #{e["id"]})',
                     f'/schedule/job/{e["job_id"]}')
                )
    conn.commit()
    conn.close()

@app.route('/api/schedule/events', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_schedule_create():
    data = request.get_json(force=True)
    conn = get_db()
    cursor = conn.execute(
        '''INSERT INTO job_schedule_events (job_id, phase_name, description, start_date, end_date,
           assigned_to, sort_order, created_by)
           VALUES (?,?,?,?,?,?,?,?)''',
        (data.get('job_id'), data.get('phase_name', ''), data.get('description', ''),
         data.get('start_date', ''), data.get('end_date', ''),
         data.get('assigned_to') or None, data.get('sort_order', 0), session['user_id'])
    )
    event_id = cursor.lastrowid
    conn.commit()
    # Notify assigned user
    if data.get('assigned_to'):
        job = conn.execute('SELECT name FROM jobs WHERE id = ?', (data['job_id'],)).fetchone()
        job_name = job['name'] if job else f'Job #{data["job_id"]}'
        start = data.get('start_date', '')
        end = data.get('end_date', '')
        date_range = f'{start} to {end}' if start and end else start or end or 'TBD'
        create_notification(
            int(data['assigned_to']), 'schedule', 'Schedule: Phase Assigned',
            f'{data["phase_name"]} on {job_name} — {date_range}',
            f'/schedule/job/{data["job_id"]}'
        )
    conn.close()
    return jsonify({'ok': True, 'id': event_id})

@app.route('/api/schedule/events/<int:eid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_schedule_update(eid):
    data = request.get_json(force=True)
    conn = get_db()
    old = conn.execute('SELECT * FROM job_schedule_events WHERE id = ?', (eid,)).fetchone()
    if not old:
        conn.close()
        return jsonify({'error': 'Not found'}), 404

    phase_name = data.get('phase_name', old['phase_name'])
    description = data.get('description', old['description'])
    start_date = data.get('start_date', old['start_date'])
    end_date = data.get('end_date', old['end_date'])
    assigned_to = data.get('assigned_to', old['assigned_to']) or None
    status = data.get('status', old['status'])
    sort_order = data.get('sort_order', old['sort_order'])

    conn.execute(
        '''UPDATE job_schedule_events SET phase_name=?, description=?, start_date=?, end_date=?,
           assigned_to=?, status=?, sort_order=?, updated_at=datetime('now','localtime')
           WHERE id=?''',
        (phase_name, description, start_date, end_date, assigned_to, status, sort_order, eid)
    )
    conn.commit()

    # Notify if assigned_to changed
    new_assigned = int(assigned_to) if assigned_to else None
    old_assigned = old['assigned_to']
    if new_assigned and new_assigned != old_assigned:
        job = conn.execute('SELECT name FROM jobs WHERE id = ?', (old['job_id'],)).fetchone()
        job_name = job['name'] if job else f'Job #{old["job_id"]}'
        date_range = f'{start_date} to {end_date}' if start_date and end_date else start_date or end_date or 'TBD'
        create_notification(
            new_assigned, 'schedule', 'Schedule: Phase Assigned',
            f'{phase_name} on {job_name} — {date_range}',
            f'/schedule/job/{old["job_id"]}'
        )
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/schedule/events/<int:eid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_schedule_delete(eid):
    conn = get_db()
    conn.execute('DELETE FROM job_schedule_events WHERE id = ?', (eid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ─── Recurring Expenses ──────────────────────────────────────────

@app.route('/expenses')
@role_required('owner', 'admin')
def expenses_page():
    return render_template('expenses/overview.html')

@app.route('/api/expenses/recurring')
@api_role_required('owner', 'admin')
def api_recurring_expenses():
    conn = get_db()
    rows = conn.execute('SELECT * FROM recurring_expenses ORDER BY next_due_date ASC, category').fetchall()
    result = [dict(r) for r in rows]
    conn.close()
    # Check for upcoming due notifications
    _check_expense_notifications(result)
    return jsonify(result)

def _check_expense_notifications(expenses):
    from datetime import timedelta
    now = datetime.now()
    week_ahead = now + timedelta(days=7)
    conn = get_db()
    owners = conn.execute("SELECT id FROM users WHERE role IN ('owner','admin') AND is_active = 1").fetchall()
    for exp in expenses:
        if not exp.get('next_due_date') or not exp.get('is_active'):
            continue
        try:
            due_dt = datetime.strptime(exp['next_due_date'], '%Y-%m-%d')
        except (ValueError, TypeError):
            continue
        if due_dt <= week_ahead:
            today_str = now.strftime('%Y-%m-%d')
            for owner in owners:
                existing = conn.execute(
                    "SELECT id FROM notifications WHERE user_id = ? AND type = 'expense' AND message LIKE ? AND created_at >= ?",
                    (owner['id'], f'%expense #{exp["id"]}%', today_str)
                ).fetchone()
                if not existing:
                    status = 'OVERDUE' if due_dt < now else 'due soon'
                    conn.execute(
                        'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?,?,?,?,?)',
                        (owner['id'], 'expense', f'Expense: {status.title()}',
                         f'{exp["category"]} - {exp["vendor"]} ${exp["amount"]:.2f} {status} ({exp["next_due_date"]}) (expense #{exp["id"]})',
                         '/expenses')
                    )
    conn.commit()
    conn.close()

@app.route('/api/expenses/recurring', methods=['POST'])
@api_role_required('owner', 'admin')
def api_create_recurring_expense():
    data = request.get_json()
    conn = get_db()
    cursor = conn.execute(
        '''INSERT INTO recurring_expenses (category, vendor, description, amount, frequency,
           due_day, start_date, end_date, is_active, next_due_date, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
        (data.get('category', ''), data.get('vendor', ''), data.get('description', ''),
         float(data.get('amount', 0)), data.get('frequency', 'Monthly'),
         int(data.get('due_day', 1)), data.get('start_date', ''), data.get('end_date', ''),
         1 if data.get('is_active', True) else 0,
         data.get('next_due_date', ''), session.get('user_id'))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': cursor.lastrowid}), 201

@app.route('/api/expenses/recurring/<int:eid>', methods=['PUT'])
@api_role_required('owner', 'admin')
def api_update_recurring_expense(eid):
    data = request.get_json()
    conn = get_db()
    fields = []
    values = []
    for f in ('category', 'vendor', 'description', 'amount', 'frequency', 'due_day',
              'start_date', 'end_date', 'is_active', 'next_due_date', 'last_paid_date'):
        if f in data:
            fields.append(f'{f} = ?')
            values.append(data[f])
    if fields:
        values.append(eid)
        conn.execute(f"UPDATE recurring_expenses SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/expenses/recurring/<int:eid>', methods=['DELETE'])
@api_role_required('owner', 'admin')
def api_delete_recurring_expense(eid):
    conn = get_db()
    conn.execute('DELETE FROM recurring_expenses WHERE id = ?', (eid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/expenses/recurring/<int:eid>/pay', methods=['POST'])
@api_role_required('owner', 'admin')
def api_record_expense_payment(eid):
    data = request.get_json()
    conn = get_db()
    conn.execute(
        '''INSERT INTO recurring_expense_payments (recurring_expense_id, amount_paid, payment_date,
           payment_method, reference_number, notes, created_by)
           VALUES (?,?,?,?,?,?,?)''',
        (eid, float(data.get('amount_paid', 0)), data.get('payment_date', datetime.now().strftime('%Y-%m-%d')),
         data.get('payment_method', ''), data.get('reference_number', ''),
         data.get('notes', ''), session.get('user_id'))
    )
    # Update last_paid_date and next_due_date
    if data.get('next_due_date'):
        conn.execute(
            'UPDATE recurring_expenses SET last_paid_date = ?, next_due_date = ? WHERE id = ?',
            (data.get('payment_date', datetime.now().strftime('%Y-%m-%d')), data['next_due_date'], eid)
        )
    else:
        conn.execute(
            'UPDATE recurring_expenses SET last_paid_date = ? WHERE id = ?',
            (data.get('payment_date', datetime.now().strftime('%Y-%m-%d')), eid)
        )
    conn.commit()
    conn.close()
    return jsonify({'ok': True}), 201

@app.route('/api/expenses/recurring/<int:eid>/payments')
@api_role_required('owner', 'admin')
def api_expense_payments(eid):
    conn = get_db()
    rows = conn.execute(
        'SELECT * FROM recurring_expense_payments WHERE recurring_expense_id = ? ORDER BY payment_date DESC',
        (eid,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# ─── Licenses ────────────────────────────────────────────────────

LICENSES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'licenses')
os.makedirs(LICENSES_DIR, exist_ok=True)

@app.route('/licenses')
@role_required('owner')
def licenses_page():
    return render_template('licenses/list.html')

@app.route('/api/licenses')
@api_role_required('owner')
def api_licenses_list():
    conn = get_db()
    rows = conn.execute('SELECT * FROM licenses ORDER BY expiration_date ASC').fetchall()
    result = []
    now = datetime.now()
    owners = conn.execute("SELECT id FROM users WHERE role = 'owner' AND is_active = 1").fetchall()
    for r in rows:
        d = dict(r)
        # Auto-update status based on expiration
        if d.get('expiration_date'):
            try:
                exp_dt = datetime.strptime(d['expiration_date'], '%Y-%m-%d')
                days_left = (exp_dt - now).days
                if days_left < 0:
                    d['status'] = 'Expired'
                elif days_left <= 60:
                    d['status'] = 'Expiring Soon'
                else:
                    if d['status'] not in ('Pending Renewal',):
                        d['status'] = 'Active'
                d['days_until_expiry'] = days_left
            except (ValueError, TypeError):
                d['days_until_expiry'] = None
        # Update status in DB if changed
        if d['status'] != r['status']:
            conn.execute('UPDATE licenses SET status = ?, updated_at = datetime("now","localtime") WHERE id = ?',
                         (d['status'], d['id']))
        result.append(d)
    conn.commit()
    # Check for notifications (within 60 days)
    _check_license_notifications(result, owners, conn)
    conn.close()
    return jsonify(result)

def _check_license_notifications(licenses, owners, conn):
    now = datetime.now()
    today_str = now.strftime('%Y-%m-%d')
    from datetime import timedelta
    week_ago = (now - timedelta(days=7)).strftime('%Y-%m-%d')
    for lic in licenses:
        days = lic.get('days_until_expiry')
        if days is not None and days <= 60:
            for owner in owners:
                existing = conn.execute(
                    "SELECT id FROM notifications WHERE user_id = ? AND type = 'license' AND message LIKE ? AND created_at >= ?",
                    (owner['id'], f'%license #{lic["id"]}%', week_ago)
                ).fetchone()
                if not existing:
                    status = 'EXPIRED' if days < 0 else f'expires in {days} days'
                    conn.execute(
                        'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?,?,?,?,?)',
                        (owner['id'], 'license', f'License: {lic["license_name"]}',
                         f'{lic["license_name"]} ({lic["license_number"]}) {status} (license #{lic["id"]})',
                         '/licenses')
                    )
    conn.commit()

@app.route('/api/licenses', methods=['POST'])
@api_role_required('owner')
def api_create_license():
    conn = get_db()
    if request.content_type and 'multipart' in request.content_type:
        data = request.form
        file = request.files.get('file')
        file_path = ''
        file_hash = ''
        if file and file.filename:
            from werkzeug.utils import secure_filename
            content = file.read()
            file_hash = hashlib.md5(content).hexdigest()
            fname = secure_filename(file.filename)
            fname = f"{int(datetime.now().timestamp())}_{fname}"
            file.seek(0)
            file.save(os.path.join(LICENSES_DIR, fname))
            file_path = fname
        conn.execute(
            '''INSERT INTO licenses (license_type, license_name, license_number, issuing_body,
               holder_name, issue_date, expiration_date, renewal_cost, status, notes, file_path, file_hash, created_by)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            (data.get('license_type', ''), data.get('license_name', ''), data.get('license_number', ''),
             data.get('issuing_body', ''), data.get('holder_name', ''),
             data.get('issue_date', ''), data.get('expiration_date', ''),
             float(data.get('renewal_cost', 0) or 0), data.get('status', 'Active'),
             data.get('notes', ''), file_path, file_hash, session.get('user_id'))
        )
    else:
        data = request.get_json(force=True)
        conn.execute(
            '''INSERT INTO licenses (license_type, license_name, license_number, issuing_body,
               holder_name, issue_date, expiration_date, renewal_cost, status, notes, created_by)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
            (data.get('license_type', ''), data.get('license_name', ''), data.get('license_number', ''),
             data.get('issuing_body', ''), data.get('holder_name', ''),
             data.get('issue_date', ''), data.get('expiration_date', ''),
             float(data.get('renewal_cost', 0) or 0), data.get('status', 'Active'),
             data.get('notes', ''), session.get('user_id'))
        )
    conn.commit()
    conn.close()
    return jsonify({'ok': True}), 201

@app.route('/api/licenses/<int:lid>', methods=['PUT'])
@api_role_required('owner')
def api_update_license(lid):
    conn = get_db()
    if request.content_type and 'multipart' in request.content_type:
        data = request.form
        file = request.files.get('file')
        fields = []
        values = []
        for f in ('license_type', 'license_name', 'license_number', 'issuing_body',
                   'holder_name', 'issue_date', 'expiration_date', 'renewal_cost', 'status', 'notes'):
            if f in data:
                fields.append(f'{f} = ?')
                values.append(float(data[f]) if f == 'renewal_cost' else data[f])
        if file and file.filename:
            from werkzeug.utils import secure_filename
            content = file.read()
            fh = hashlib.md5(content).hexdigest()
            fname = secure_filename(file.filename)
            fname = f"{int(datetime.now().timestamp())}_{fname}"
            file.seek(0)
            file.save(os.path.join(LICENSES_DIR, fname))
            fields.append('file_path = ?')
            values.append(fname)
            fields.append('file_hash = ?')
            values.append(fh)
        if fields:
            fields.append("updated_at = datetime('now','localtime')")
            values.append(lid)
            conn.execute(f"UPDATE licenses SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()
    else:
        data = request.get_json(force=True)
        fields = []
        values = []
        for f in ('license_type', 'license_name', 'license_number', 'issuing_body',
                   'holder_name', 'issue_date', 'expiration_date', 'renewal_cost', 'status', 'notes'):
            if f in data:
                fields.append(f'{f} = ?')
                values.append(data[f])
        if fields:
            fields.append("updated_at = datetime('now','localtime')")
            values.append(lid)
            conn.execute(f"UPDATE licenses SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/licenses/<int:lid>', methods=['DELETE'])
@api_role_required('owner')
def api_delete_license(lid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM licenses WHERE id = ?', (lid,)).fetchone()
    if row and row['file_path']:
        fpath = os.path.join(LICENSES_DIR, row['file_path'])
        if os.path.exists(fpath):
            os.remove(fpath)
    conn.execute('DELETE FROM licenses WHERE id = ?', (lid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/licenses/<int:lid>/file')
@api_role_required('owner')
def api_license_file(lid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM licenses WHERE id = ?', (lid,)).fetchone()
    conn.close()
    if not row or not row['file_path']:
        return 'Not found', 404
    fpath = os.path.join(LICENSES_DIR, row['file_path'])
    if not os.path.exists(fpath):
        return 'File not found', 404
    return send_file(fpath, mimetype='application/pdf')

# ─── RFIs ────────────────────────────────────────────────────────

@app.route('/rfis')
@role_required('owner', 'admin', 'project_manager')
def rfis_page():
    return render_template('rfis/list.html')

@app.route('/api/rfis')
@api_role_required('owner', 'admin', 'project_manager')
def api_rfis_list():
    job_id = request.args.get('job_id', '')
    status = request.args.get('status', '')
    conn = get_db()
    sql = '''SELECT r.*, j.name as job_name FROM rfis r
             LEFT JOIN jobs j ON r.job_id = j.id WHERE 1=1'''
    params = []
    if job_id:
        sql += ' AND r.job_id = ?'
        params.append(job_id)
    if status:
        sql += ' AND r.status = ?'
        params.append(status)
    sql += ' ORDER BY r.date_submitted DESC, r.rfi_number DESC'
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/rfis', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_create_rfi():
    data = request.get_json()
    conn = get_db()
    # Auto-assign RFI number per job
    max_num = conn.execute('SELECT MAX(rfi_number) FROM rfis WHERE job_id = ?',
                           (data['job_id'],)).fetchone()[0] or 0
    cursor = conn.execute(
        '''INSERT INTO rfis (job_id, rfi_number, subject, question, requested_by,
           assigned_to, date_required, created_by)
           VALUES (?,?,?,?,?,?,?,?)''',
        (data['job_id'], max_num + 1, data.get('subject', ''), data.get('question', ''),
         data.get('requested_by', ''), data.get('assigned_to') or None,
         data.get('date_required', ''), session.get('user_id'))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': cursor.lastrowid}), 201

@app.route('/api/rfis/<int:rid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_update_rfi(rid):
    data = request.get_json()
    conn = get_db()
    fields = []
    values = []
    for f in ('subject', 'question', 'answer', 'requested_by', 'assigned_to',
              'status', 'date_required', 'date_answered'):
        if f in data:
            fields.append(f'{f} = ?')
            values.append(data[f] if data[f] != '' else (None if f == 'assigned_to' else data[f]))
    if fields:
        fields.append("updated_at = datetime('now','localtime')")
        values.append(rid)
        conn.execute(f"UPDATE rfis SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/rfis/<int:rid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_delete_rfi(rid):
    conn = get_db()
    conn.execute('DELETE FROM rfis WHERE id = ?', (rid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ─── Change Orders ───────────────────────────────────────────────

@app.route('/change-orders')
@role_required('owner', 'admin', 'project_manager')
def change_orders_page():
    return render_template('change_orders/list.html')

@app.route('/api/change-orders')
@api_role_required('owner', 'admin', 'project_manager')
def api_change_orders_list():
    job_id = request.args.get('job_id', '')
    status = request.args.get('status', '')
    conn = get_db()
    sql = '''SELECT co.*, j.name as job_name FROM change_orders co
             LEFT JOIN jobs j ON co.job_id = j.id WHERE 1=1'''
    params = []
    if job_id:
        sql += ' AND co.job_id = ?'
        params.append(job_id)
    if status:
        sql += ' AND co.status = ?'
        params.append(status)
    sql += ' ORDER BY co.created_at DESC'
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/change-orders', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_create_change_order():
    data = request.get_json()
    conn = get_db()
    max_num = conn.execute('SELECT MAX(co_number) FROM change_orders WHERE job_id = ?',
                           (data['job_id'],)).fetchone()[0] or 0
    cursor = conn.execute(
        '''INSERT INTO change_orders (job_id, co_number, title, scope_description, reason,
           amount, gc_name, created_by)
           VALUES (?,?,?,?,?,?,?,?)''',
        (data['job_id'], max_num + 1, data.get('title', ''), data.get('scope_description', ''),
         data.get('reason', ''), float(data.get('amount', 0)),
         data.get('gc_name', ''), session.get('user_id'))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': cursor.lastrowid}), 201

@app.route('/api/change-orders/<int:coid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_update_change_order(coid):
    data = request.get_json()
    conn = get_db()
    fields = []
    values = []
    for f in ('title', 'scope_description', 'reason', 'amount', 'status',
              'gc_name', 'submitted_date', 'approved_date', 'approved_by'):
        if f in data:
            fields.append(f'{f} = ?')
            values.append(data[f])
    if fields:
        fields.append("updated_at = datetime('now','localtime')")
        values.append(coid)
        conn.execute(f"UPDATE change_orders SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/change-orders/<int:coid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_delete_change_order(coid):
    conn = get_db()
    conn.execute('DELETE FROM change_orders WHERE id = ?', (coid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/change-orders/<int:coid>/generate-proposal', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_generate_co_proposal(coid):
    conn = get_db()
    co = conn.execute(
        '''SELECT co.*, j.name as job_name, j.address as job_address, j.city as job_city, j.state as job_state
           FROM change_orders co LEFT JOIN jobs j ON co.job_id = j.id WHERE co.id = ?''',
        (coid,)
    ).fetchone()
    conn.close()
    if not co:
        return jsonify({'error': 'Change order not found'}), 404

    co = dict(co)
    today = datetime.now().strftime('%B %d, %Y')
    logo_path = os.path.abspath(os.path.join(app.static_folder, 'logo.jpg'))

    html = render_template('change_orders/proposal_pdf.html', co=co, today=today, logo_path='file://' + logo_path)

    proposals_dir = os.path.join(os.path.dirname(__file__), 'data', 'proposals')
    os.makedirs(proposals_dir, exist_ok=True)

    safe_title = ''.join(c if c.isalnum() or c in ' -_' else '' for c in (co.get('title') or 'CO')).strip()
    filename = f"CO_{co['job_id']}_{co['co_number']}_{safe_title}.pdf"
    filepath = os.path.join(proposals_dir, filename)

    import subprocess, tempfile
    with tempfile.NamedTemporaryFile(suffix='.html', delete=False, mode='w') as tmp:
        tmp.write(html)
        tmp_path = tmp.name

    try:
        chrome_paths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
        chrome = next((p for p in chrome_paths if os.path.exists(p)), None)
        if not chrome:
            return jsonify({'error': 'Chrome not found. Install Google Chrome to generate PDFs.'}), 500

        result = subprocess.run([
            chrome, '--headless', '--disable-gpu', '--no-sandbox',
            '--disable-software-rasterizer',
            f'--print-to-pdf={filepath}', '--no-pdf-header-footer',
            f'file://{tmp_path}',
        ], capture_output=True, text=True, timeout=30)

        if not os.path.exists(filepath):
            return jsonify({'error': f'PDF generation failed: {result.stderr[:200]}'}), 500
    finally:
        os.unlink(tmp_path)

    # Store filename on CO
    conn2 = get_db()
    conn2.execute('UPDATE change_orders SET proposal_file = ? WHERE id = ?', (filename, coid))
    conn2.commit()
    conn2.close()

    return jsonify({'ok': True, 'filename': filename, 'path': f'/api/change-orders/{coid}/proposal/{filename}'})

@app.route('/api/change-orders/<int:coid>/proposal/<filename>')
@api_role_required('owner', 'admin', 'project_manager')
def api_download_co_proposal(coid, filename):
    proposals_dir = os.path.join(os.path.dirname(__file__), 'data', 'proposals')
    filepath = os.path.join(proposals_dir, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    if request.args.get('download'):
        return send_file(filepath, as_attachment=True, download_name=filename)
    return send_file(filepath, mimetype='application/pdf')

@app.route('/api/change-orders/<int:coid>/approve', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_approve_change_order(coid):
    conn = get_db()
    co = conn.execute('SELECT * FROM change_orders WHERE id = ?', (coid,)).fetchone()
    if not co:
        conn.close()
        return jsonify({'error': 'Change order not found'}), 404

    today = datetime.now().strftime('%Y-%m-%d')
    conn.execute(
        "UPDATE change_orders SET status = 'Approved', approved_date = ?, approved_by = ?, updated_at = datetime('now','localtime') WHERE id = ?",
        (today, session.get('display_name', session.get('username', '')), coid)
    )

    # Pay App Integration: add SOV line item
    contract = conn.execute(
        'SELECT id FROM pay_app_contracts WHERE job_id = ? ORDER BY id LIMIT 1',
        (co['job_id'],)
    ).fetchone()

    sov_item_id = None
    if contract:
        cid = contract['id']
        max_num = conn.execute('SELECT MAX(item_number) FROM pay_app_sov_items WHERE contract_id = ?', (cid,)).fetchone()[0] or 0
        max_sort = conn.execute('SELECT MAX(sort_order) FROM pay_app_sov_items WHERE contract_id = ?', (cid,)).fetchone()[0] or 0
        cursor = conn.execute(
            '''INSERT INTO pay_app_sov_items (contract_id, item_number, description, scheduled_value, sort_order)
               VALUES (?,?,?,?,?)''',
            (cid, max_num + 1, f"CO #{co['co_number']}: {co['title']}", co['amount'], max_sort + 1)
        )
        sov_item_id = cursor.lastrowid

        # Backfill existing pay apps with 0 entries
        existing_apps = conn.execute(
            'SELECT id FROM pay_applications WHERE contract_id = ?', (cid,)
        ).fetchall()
        for pa in existing_apps:
            conn.execute(
                'INSERT OR IGNORE INTO pay_app_line_entries (pay_app_id, sov_item_id, work_this_period, materials_stored) VALUES (?,?,0,0)',
                (pa['id'], sov_item_id)
            )

        conn.execute(
            'UPDATE change_orders SET pay_app_contract_id = ?, sov_item_id = ? WHERE id = ?',
            (cid, sov_item_id, coid)
        )

    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'sov_item_id': sov_item_id})

# ─── Submittals ──────────────────────────────────────────────────

SUBMITTALS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'submittals')
os.makedirs(SUBMITTALS_DIR, exist_ok=True)

@app.route('/submittals')
@role_required('owner', 'admin', 'project_manager')
def submittals_page():
    return render_template('submittals/list.html')

@app.route('/api/submittals')
@api_role_required('owner', 'admin', 'project_manager')
def api_submittals_list():
    job_id = request.args.get('job_id', '')
    status = request.args.get('status', '')
    conn = get_db()
    sql = '''SELECT s.*, j.name as job_name, sf.title as library_title, sf.id as library_file_id
             FROM submittals s
             LEFT JOIN jobs j ON s.job_id = j.id
             LEFT JOIN submittal_files sf ON s.submittal_file_id = sf.id
             WHERE 1=1'''
    params = []
    if job_id:
        sql += ' AND s.job_id = ?'
        params.append(job_id)
    if status:
        sql += ' AND s.status = ?'
        params.append(status)
    sql += ' ORDER BY s.created_at DESC'
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/submittals', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_create_submittal():
    conn = get_db()
    if request.content_type and 'multipart' in request.content_type:
        data = request.form
        file = request.files.get('file')
        file_path = ''
        if file and file.filename:
            from werkzeug.utils import secure_filename
            fname = secure_filename(file.filename)
            fname = f"{int(datetime.now().timestamp())}_{fname}"
            file.save(os.path.join(SUBMITTALS_DIR, fname))
            file_path = fname
        job_id = data.get('job_id')
        max_num = conn.execute('SELECT MAX(submittal_number) FROM submittals WHERE job_id = ?',
                               (job_id,)).fetchone()[0] or 0
        conn.execute(
            '''INSERT INTO submittals (job_id, submittal_number, spec_section, description, vendor,
               date_required, file_path, created_by)
               VALUES (?,?,?,?,?,?,?,?)''',
            (job_id, max_num + 1, data.get('spec_section', ''), data.get('description', ''),
             data.get('vendor', ''), data.get('date_required', ''),
             file_path, session.get('user_id'))
        )
    else:
        data = request.get_json(force=True)
        job_id = data.get('job_id')
        max_num = conn.execute('SELECT MAX(submittal_number) FROM submittals WHERE job_id = ?',
                               (job_id,)).fetchone()[0] or 0
        conn.execute(
            '''INSERT INTO submittals (job_id, submittal_number, spec_section, description, vendor,
               date_required, created_by)
               VALUES (?,?,?,?,?,?,?)''',
            (job_id, max_num + 1, data.get('spec_section', ''), data.get('description', ''),
             data.get('vendor', ''), data.get('date_required', ''), session.get('user_id'))
        )
    conn.commit()
    conn.close()
    return jsonify({'ok': True}), 201

@app.route('/api/submittals/<int:sid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_update_submittal(sid):
    conn = get_db()
    if request.content_type and 'multipart' in request.content_type:
        data = request.form
        file = request.files.get('file')
        fields = []
        values = []
        for f in ('spec_section', 'description', 'vendor', 'status', 'revision_number',
                   'date_submitted', 'date_required', 'date_returned', 'reviewer', 'reviewer_comments'):
            if f in data:
                fields.append(f'{f} = ?')
                values.append(int(data[f]) if f == 'revision_number' else data[f])
        if file and file.filename:
            from werkzeug.utils import secure_filename
            fname = secure_filename(file.filename)
            fname = f"{int(datetime.now().timestamp())}_{fname}"
            file.save(os.path.join(SUBMITTALS_DIR, fname))
            fields.append('file_path = ?')
            values.append(fname)
        if fields:
            fields.append("updated_at = datetime('now','localtime')")
            values.append(sid)
            conn.execute(f"UPDATE submittals SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()
    else:
        data = request.get_json(force=True)
        fields = []
        values = []
        for f in ('spec_section', 'description', 'vendor', 'status', 'revision_number',
                   'date_submitted', 'date_required', 'date_returned', 'reviewer', 'reviewer_comments'):
            if f in data:
                fields.append(f'{f} = ?')
                values.append(data[f])
        if fields:
            fields.append("updated_at = datetime('now','localtime')")
            values.append(sid)
            conn.execute(f"UPDATE submittals SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/submittals/<int:sid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_delete_submittal(sid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM submittals WHERE id = ?', (sid,)).fetchone()
    if row and row['file_path']:
        fpath = os.path.join(SUBMITTALS_DIR, row['file_path'])
        if os.path.exists(fpath):
            os.remove(fpath)
    conn.execute('DELETE FROM submittals WHERE id = ?', (sid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/submittals/<int:sid>/file')
@api_role_required('owner', 'admin', 'project_manager')
def api_submittal_file(sid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM submittals WHERE id = ?', (sid,)).fetchone()
    conn.close()
    if not row or not row['file_path']:
        return 'Not found', 404
    fpath = os.path.join(SUBMITTALS_DIR, row['file_path'])
    if not os.path.exists(fpath):
        return 'File not found', 404
    return send_file(fpath, mimetype='application/pdf')

# ─── Submittal Library ────────────────────────────────────────

@app.route('/api/submittal-library')
@api_role_required('owner', 'admin', 'project_manager')
def api_submittal_library_list():
    conn = get_db()
    rows = conn.execute(
        '''SELECT sf.*, COUNT(s.id) as usage_count
           FROM submittal_files sf
           LEFT JOIN submittals s ON s.submittal_file_id = sf.id
           GROUP BY sf.id ORDER BY sf.title'''
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/submittal-library', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_create_submittal_library():
    conn = get_db()
    if request.content_type and 'multipart' in request.content_type:
        data = request.form
        file = request.files.get('file')
        file_path = ''
        file_hash = ''
        if file and file.filename:
            import hashlib
            from werkzeug.utils import secure_filename
            content = file.read()
            file_hash = hashlib.md5(content).hexdigest()
            # Check for duplicate
            existing = conn.execute('SELECT id, title FROM submittal_files WHERE file_hash = ?', (file_hash,)).fetchone()
            if existing:
                conn.close()
                return jsonify({'ok': False, 'duplicate': True, 'existing_id': existing['id'],
                                'existing_title': existing['title']}), 409
            fname = secure_filename(file.filename)
            fname = f"{int(datetime.now().timestamp())}_{fname}"
            file.seek(0)
            file.save(os.path.join(SUBMITTALS_DIR, fname))
            file_path = fname
        cursor = conn.execute(
            '''INSERT INTO submittal_files (title, file_path, file_hash, vendor, category, description)
               VALUES (?,?,?,?,?,?)''',
            (data.get('title', ''), file_path, file_hash,
             data.get('vendor', ''), data.get('category', ''), data.get('description', ''))
        )
        lib_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return jsonify({'ok': True, 'id': lib_id}), 201
    else:
        data = request.get_json(force=True)
        cursor = conn.execute(
            '''INSERT INTO submittal_files (title, file_path, file_hash, vendor, category, description)
               VALUES (?,?,?,?,?,?)''',
            (data.get('title', ''), data.get('file_path', ''), data.get('file_hash', ''),
             data.get('vendor', ''), data.get('category', ''), data.get('description', ''))
        )
        lib_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return jsonify({'ok': True, 'id': lib_id}), 201

@app.route('/api/submittal-library/<int:lid>/file')
@api_role_required('owner', 'admin', 'project_manager')
def api_submittal_library_file(lid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM submittal_files WHERE id = ?', (lid,)).fetchone()
    conn.close()
    if not row or not row['file_path']:
        return 'Not found', 404
    fpath = os.path.join(SUBMITTALS_DIR, row['file_path'])
    if not os.path.exists(fpath):
        return 'File not found', 404
    return send_file(fpath, mimetype='application/pdf')

@app.route('/api/submittals/<int:sid>/link-library', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_link_submittal_to_library(sid):
    data = request.get_json(force=True)
    lib_id = data.get('submittal_file_id')
    if not lib_id:
        return jsonify({'error': 'submittal_file_id required'}), 400
    conn = get_db()
    lib = conn.execute('SELECT id, file_path FROM submittal_files WHERE id = ?', (lib_id,)).fetchone()
    if not lib:
        conn.close()
        return jsonify({'error': 'Library file not found'}), 404
    conn.execute(
        "UPDATE submittals SET submittal_file_id = ?, updated_at = datetime('now','localtime') WHERE id = ?",
        (lib_id, sid)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ─── Documents (Closeout) ───────────────────────────────────────

CLOSEOUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'closeout')
os.makedirs(CLOSEOUT_DIR, exist_ok=True)

@app.route('/documents')
@role_required('owner', 'admin', 'project_manager')
def documents_page():
    return render_template('documents/list.html')

@app.route('/documents/job/<int:job_id>')
@role_required('owner', 'admin', 'project_manager')
def documents_job_page(job_id):
    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    conn.close()
    if not job:
        return 'Job not found', 404
    return render_template('documents/job.html', job=job)

@app.route('/api/documents/checklist')
@api_role_required('owner', 'admin', 'project_manager')
def api_checklist_list():
    job_id = request.args.get('job_id', '')
    conn = get_db()
    if job_id:
        rows = conn.execute('SELECT * FROM closeout_checklists WHERE job_id = ? ORDER BY sort_order, id', (job_id,)).fetchall()
    else:
        rows = conn.execute('SELECT * FROM closeout_checklists ORDER BY job_id, sort_order, id').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/documents/checklist', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_checklist_create():
    conn = get_db()
    if request.content_type and 'multipart' in request.content_type:
        data = request.form
        file = request.files.get('file')
        file_path = ''
        file_hash = ''
        if file and file.filename:
            from werkzeug.utils import secure_filename
            content = file.read()
            file_hash = hashlib.md5(content).hexdigest()
            fname = secure_filename(file.filename)
            fname = f"{int(datetime.now().timestamp())}_{fname}"
            file.seek(0)
            file.save(os.path.join(CLOSEOUT_DIR, fname))
            file_path = fname
        conn.execute(
            '''INSERT INTO closeout_checklists (job_id, item_name, item_type, status, file_path, file_hash, notes, sort_order, created_by)
               VALUES (?,?,?,?,?,?,?,?,?)''',
            (data.get('job_id'), data.get('item_name', ''), data.get('item_type', 'Other'),
             data.get('status', 'Not Started'), file_path, file_hash, data.get('notes', ''),
             int(data.get('sort_order', 0)), session.get('user_id'))
        )
    else:
        data = request.get_json(force=True)
        conn.execute(
            '''INSERT INTO closeout_checklists (job_id, item_name, item_type, status, notes, sort_order, created_by)
               VALUES (?,?,?,?,?,?,?)''',
            (data.get('job_id'), data.get('item_name', ''), data.get('item_type', 'Other'),
             data.get('status', 'Not Started'), data.get('notes', ''),
             int(data.get('sort_order', 0)), session.get('user_id'))
        )
    conn.commit()
    conn.close()
    return jsonify({'ok': True}), 201

@app.route('/api/documents/checklist/<int:cid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_checklist_update(cid):
    conn = get_db()
    if request.content_type and 'multipart' in request.content_type:
        data = request.form
        file = request.files.get('file')
        fields = []
        values = []
        for f in ('item_name', 'item_type', 'status', 'notes', 'sort_order'):
            if f in data:
                fields.append(f'{f} = ?')
                values.append(int(data[f]) if f == 'sort_order' else data[f])
        if file and file.filename:
            from werkzeug.utils import secure_filename
            content = file.read()
            fh = hashlib.md5(content).hexdigest()
            fname = secure_filename(file.filename)
            fname = f"{int(datetime.now().timestamp())}_{fname}"
            file.seek(0)
            file.save(os.path.join(CLOSEOUT_DIR, fname))
            fields.append('file_path = ?')
            values.append(fname)
            fields.append('file_hash = ?')
            values.append(fh)
        if fields:
            fields.append("updated_at = datetime('now','localtime')")
            values.append(cid)
            conn.execute(f"UPDATE closeout_checklists SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()
    else:
        data = request.get_json(force=True)
        fields = []
        values = []
        for f in ('item_name', 'item_type', 'status', 'notes', 'sort_order'):
            if f in data:
                fields.append(f'{f} = ?')
                values.append(data[f])
        if fields:
            fields.append("updated_at = datetime('now','localtime')")
            values.append(cid)
            conn.execute(f"UPDATE closeout_checklists SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/documents/checklist/<int:cid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_checklist_delete(cid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM closeout_checklists WHERE id = ?', (cid,)).fetchone()
    if row and row['file_path']:
        fpath = os.path.join(CLOSEOUT_DIR, row['file_path'])
        if os.path.exists(fpath):
            os.remove(fpath)
    conn.execute('DELETE FROM closeout_checklists WHERE id = ?', (cid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/documents/checklist/<int:cid>/file')
@api_role_required('owner', 'admin', 'project_manager')
def api_checklist_file(cid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM closeout_checklists WHERE id = ?', (cid,)).fetchone()
    conn.close()
    if not row or not row['file_path']:
        return 'Not found', 404
    fpath = os.path.join(CLOSEOUT_DIR, row['file_path'])
    if not os.path.exists(fpath):
        return 'File not found', 404
    return send_file(fpath, mimetype='application/pdf')

@app.route('/api/documents/checklist/defaults', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_checklist_add_defaults():
    data = request.get_json(force=True)
    job_id = data.get('job_id')
    if not job_id:
        return jsonify({'error': 'job_id required'}), 400

    defaults = [
        ('O&M Manual', 'O&M Manual'),
        ('Warranty Letter', 'Warranty Letter'),
        ('As-Built Drawings', 'As-Built'),
        ('Start-Up Report', 'Start-Up Report'),
        ('Balancing Report', 'Balancing Report'),
        ('Test Report', 'Test Report'),
        ('Lien Waiver', 'Lien Waiver'),
        ('Certificate of Completion', 'Certificate of Completion'),
        ('Permit Closeout', 'Permit'),
    ]
    conn = get_db()
    existing = conn.execute('SELECT item_name FROM closeout_checklists WHERE job_id = ?', (job_id,)).fetchall()
    existing_names = {r['item_name'] for r in existing}
    sort_idx = len(existing)
    for name, item_type in defaults:
        if name not in existing_names:
            conn.execute(
                '''INSERT INTO closeout_checklists (job_id, item_name, item_type, sort_order, created_by)
                   VALUES (?,?,?,?,?)''',
                (job_id, name, item_type, sort_idx, session.get('user_id'))
            )
            sort_idx += 1
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/documents/transmittals')
@api_role_required('owner', 'admin', 'project_manager')
def api_transmittals_list():
    job_id = request.args.get('job_id', '')
    conn = get_db()
    if job_id:
        rows = conn.execute('SELECT * FROM transmittals WHERE job_id = ? ORDER BY transmittal_number DESC', (job_id,)).fetchall()
    else:
        rows = conn.execute('SELECT * FROM transmittals ORDER BY created_at DESC').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/documents/transmittals', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_transmittal_create():
    data = request.get_json(force=True)
    conn = get_db()
    job_id = data.get('job_id')
    max_num = conn.execute('SELECT MAX(transmittal_number) FROM transmittals WHERE job_id = ?',
                           (job_id,)).fetchone()[0] or 0
    cursor = conn.execute(
        '''INSERT INTO transmittals (job_id, transmittal_number, to_company, to_attention,
           subject, notes, sent_date, sent_via, created_by)
           VALUES (?,?,?,?,?,?,?,?,?)''',
        (job_id, max_num + 1, data.get('to_company', ''), data.get('to_attention', ''),
         data.get('subject', ''), data.get('notes', ''), data.get('sent_date', ''),
         data.get('sent_via', 'Email'), session.get('user_id'))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': cursor.lastrowid}), 201

@app.route('/api/documents/transmittals/<int:tid>/generate', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_generate_transmittal(tid):
    conn = get_db()
    trans = conn.execute('SELECT * FROM transmittals WHERE id = ?', (tid,)).fetchone()
    if not trans:
        conn.close()
        return jsonify({'error': 'Transmittal not found'}), 404

    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (trans['job_id'],)).fetchone()
    # Get completed checklist items for this job
    items = conn.execute(
        "SELECT * FROM closeout_checklists WHERE job_id = ? AND status = 'Complete' ORDER BY sort_order",
        (trans['job_id'],)
    ).fetchall()
    conn.close()

    trans = dict(trans)
    job = dict(job) if job else {}
    items = [dict(i) for i in items]
    today = datetime.now().strftime('%B %d, %Y')
    logo_path = os.path.abspath(os.path.join(app.static_folder, 'logo.jpg'))

    html = render_template('documents/transmittal_pdf.html',
                           transmittal=trans, job=job, documents=items,
                           today=today, logo_path='file://' + logo_path)

    proposals_dir = os.path.join(os.path.dirname(__file__), 'data', 'proposals')
    os.makedirs(proposals_dir, exist_ok=True)

    filename = f"Transmittal_{trans['job_id']}_{trans['transmittal_number']}.pdf"
    filepath = os.path.join(proposals_dir, filename)

    import subprocess, tempfile
    with tempfile.NamedTemporaryFile(suffix='.html', delete=False, mode='w') as tmp:
        tmp.write(html)
        tmp_path = tmp.name

    try:
        chrome_paths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
        chrome = next((p for p in chrome_paths if os.path.exists(p)), None)
        if not chrome:
            return jsonify({'error': 'Chrome not found.'}), 500

        result = subprocess.run([
            chrome, '--headless', '--disable-gpu', '--no-sandbox',
            '--disable-software-rasterizer',
            f'--print-to-pdf={filepath}', '--no-pdf-header-footer',
            f'file://{tmp_path}',
        ], capture_output=True, text=True, timeout=30)

        if not os.path.exists(filepath):
            return jsonify({'error': f'PDF generation failed: {result.stderr[:200]}'}), 500
    finally:
        os.unlink(tmp_path)

    # Store filename
    conn2 = get_db()
    conn2.execute('UPDATE transmittals SET proposal_file = ? WHERE id = ?', (filename, tid))
    conn2.commit()
    conn2.close()

    return jsonify({'ok': True, 'filename': filename, 'path': f'/api/documents/transmittals/{tid}/pdf/{filename}'})

@app.route('/api/documents/transmittals/<int:tid>/pdf/<filename>')
@api_role_required('owner', 'admin', 'project_manager')
def api_download_transmittal(tid, filename):
    proposals_dir = os.path.join(os.path.dirname(__file__), 'data', 'proposals')
    filepath = os.path.join(proposals_dir, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    if request.args.get('download'):
        return send_file(filepath, as_attachment=True, download_name=filename)
    return send_file(filepath, mimetype='application/pdf')


# ─── Contracts ───────────────────────────────────────────────────

CONTRACTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'contracts')
os.makedirs(CONTRACTS_DIR, exist_ok=True)

@app.route('/contracts')
@role_required('owner', 'admin', 'project_manager')
def contracts_page():
    return render_template('contracts/list.html')

@app.route('/api/contracts')
@api_role_required('owner', 'admin', 'project_manager')
def api_contracts_list():
    job_id = request.args.get('job_id', type=int)
    status = request.args.get('status', '')
    ctype = request.args.get('type', '')
    conn = get_db()
    sql = '''SELECT c.*, j.name as job_name FROM contracts c
             JOIN jobs j ON c.job_id = j.id WHERE 1=1'''
    params = []
    if job_id:
        sql += ' AND c.job_id = ?'
        params.append(job_id)
    if status:
        sql += ' AND c.status = ?'
        params.append(status)
    if ctype:
        sql += ' AND c.contract_type = ?'
        params.append(ctype)
    sql += ' ORDER BY c.created_at DESC'
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d['type'] = d.get('contract_type', '')
        d['has_file'] = bool(d.get('file_path'))
        d['has_review'] = bool(d.get('ai_review'))
        result.append(d)
    return jsonify(result)

@app.route('/api/contracts', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_contracts_create():
    conn = get_db()
    file_path = ''
    file_hash = ''
    if request.content_type and 'multipart' in request.content_type:
        job_id = request.form.get('job_id', type=int)
        title = request.form.get('title', '')
        contractor = request.form.get('contractor', '')
        contract_type = request.form.get('contract_type', 'Prime')
        value = float(request.form.get('value', 0))
        status = request.form.get('status', 'Draft')
        notes = request.form.get('notes', '')
        file = request.files.get('file')
        if file and file.filename:
            from werkzeug.utils import secure_filename
            content = file.read()
            file_hash = hashlib.md5(content).hexdigest()
            fname = secure_filename(file.filename)
            fname = f"{int(datetime.now().timestamp())}_{fname}"
            file.seek(0)
            file.save(os.path.join(CONTRACTS_DIR, fname))
            file_path = fname
    else:
        data = request.get_json(force=True)
        job_id = data.get('job_id')
        title = data.get('title', '')
        contractor = data.get('contractor', '')
        contract_type = data.get('contract_type', 'Prime')
        value = float(data.get('value', 0))
        status = data.get('status', 'Draft')
        notes = data.get('notes', '')

    cursor = conn.execute(
        '''INSERT INTO contracts (job_id, title, contractor, contract_type, file_path, file_hash,
           upload_date, value, status, notes, created_by)
           VALUES (?,?,?,?,?,?,date('now','localtime'),?,?,?,?)''',
        (job_id, title, contractor, contract_type, file_path, file_hash, value, status, notes, session['user_id'])
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return jsonify({'ok': True, 'id': new_id}), 201

@app.route('/api/contracts/<int:cid>')
@api_role_required('owner', 'admin', 'project_manager')
def api_contracts_get(cid):
    conn = get_db()
    row = conn.execute(
        '''SELECT c.*, j.name as job_name FROM contracts c
           JOIN jobs j ON c.job_id = j.id WHERE c.id = ?''', (cid,)
    ).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Contract not found'}), 404
    d = dict(row)
    d['type'] = d.get('contract_type', '')
    d['has_file'] = bool(d.get('file_path'))
    d['has_review'] = bool(d.get('ai_review'))
    if d.get('ai_review'):
        try:
            d['ai_review'] = json.loads(d['ai_review'])
        except (json.JSONDecodeError, TypeError):
            pass
    return jsonify(d)

@app.route('/api/contracts/<int:cid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_contracts_update(cid):
    conn = get_db()
    file_path_update = None
    if request.content_type and 'multipart' in request.content_type:
        title = request.form.get('title', '')
        contractor = request.form.get('contractor', '')
        contract_type = request.form.get('contract_type', 'Prime')
        value = float(request.form.get('value', 0))
        status = request.form.get('status', 'Draft')
        notes = request.form.get('notes', '')
        file = request.files.get('file')
        if file and file.filename:
            from werkzeug.utils import secure_filename
            fname = secure_filename(file.filename)
            fname = f"{int(datetime.now().timestamp())}_{fname}"
            file.save(os.path.join(CONTRACTS_DIR, fname))
            file_path_update = fname
    else:
        data = request.get_json(force=True)
        title = data.get('title', '')
        contractor = data.get('contractor', '')
        contract_type = data.get('contract_type', 'Prime')
        value = float(data.get('value', 0))
        status = data.get('status', 'Draft')
        notes = data.get('notes', '')

    if file_path_update:
        conn.execute(
            '''UPDATE contracts SET title=?, contractor=?, contract_type=?, value=?,
               status=?, notes=?, file_path=?, upload_date=date('now','localtime'),
               updated_at=datetime('now','localtime') WHERE id=?''',
            (title, contractor, contract_type, value, status, notes, file_path_update, cid)
        )
    else:
        conn.execute(
            '''UPDATE contracts SET title=?, contractor=?, contract_type=?, value=?,
               status=?, notes=?, updated_at=datetime('now','localtime') WHERE id=?''',
            (title, contractor, contract_type, value, status, notes, cid)
        )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/contracts/<int:cid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_contracts_delete(cid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM contracts WHERE id = ?', (cid,)).fetchone()
    if row and row['file_path']:
        fpath = os.path.join(CONTRACTS_DIR, row['file_path'])
        if os.path.exists(fpath):
            os.remove(fpath)
    conn.execute('DELETE FROM contracts WHERE id = ?', (cid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/contracts/<int:cid>/file')
@api_role_required('owner', 'admin', 'project_manager')
def api_contracts_file(cid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM contracts WHERE id = ?', (cid,)).fetchone()
    conn.close()
    if not row or not row['file_path']:
        return 'Not found', 404
    fpath = os.path.join(CONTRACTS_DIR, row['file_path'])
    if not os.path.exists(fpath):
        return 'File not found', 404
    return send_file(fpath, mimetype='application/pdf')

@app.route('/api/contracts/<int:cid>/review', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_contracts_review(cid):
    """AI review of a contract — compare against job bid data."""
    conn = get_db()
    contract = conn.execute('SELECT * FROM contracts WHERE id = ?', (cid,)).fetchone()
    if not contract:
        conn.close()
        return jsonify({'error': 'Contract not found'}), 404

    # Get bid data for comparison
    bid = conn.execute(
        'SELECT * FROM bids WHERE job_id = ? ORDER BY id DESC LIMIT 1', (contract['job_id'],)
    ).fetchone()

    # Try to extract text from the PDF
    pdf_text = ''
    if contract['file_path']:
        fpath = os.path.join(CONTRACTS_DIR, contract['file_path'])
        if os.path.exists(fpath):
            try:
                import pdfplumber
                with pdfplumber.open(fpath) as pdf:
                    for page in pdf.pages[:20]:
                        pdf_text += (page.extract_text() or '') + '\n'
            except ImportError:
                pdf_text = '[PDF text extraction unavailable - install pdfplumber]'
            except Exception as e:
                pdf_text = f'[Error extracting PDF text: {str(e)}]'

    # Build structured review
    findings = []
    concerns = []
    recommendations = []
    key_terms = []

    # ── Value comparison against bid ──
    bid_total = 0
    if bid:
        bid_total = bid['total_price'] if 'total_price' in bid.keys() else 0
        if contract['value'] and bid_total:
            diff = contract['value'] - bid_total
            pct = (diff / bid_total * 100) if bid_total else 0
            key_terms.append(f"Contract Value: ${contract['value']:,.2f}")
            key_terms.append(f"Bid Total: ${bid_total:,.2f}")
            if abs(pct) > 10:
                concerns.append(f"Contract value differs from bid total by {pct:+.1f}% — significant variance requires review")
                findings.append({'type': 'warning', 'category': 'Value Comparison',
                    'message': f"Contract value (${contract['value']:,.2f}) differs from bid total (${bid_total:,.2f}) by {pct:+.1f}%"})
            elif abs(pct) > 5:
                concerns.append(f"Contract value differs from bid total by {pct:+.1f}%")
                findings.append({'type': 'warning', 'category': 'Value Comparison',
                    'message': f"Contract value (${contract['value']:,.2f}) differs from bid total (${bid_total:,.2f}) by {pct:+.1f}%"})
            else:
                findings.append({'type': 'ok', 'category': 'Value Comparison',
                    'message': f"Contract value (${contract['value']:,.2f}) aligns with bid total (${bid_total:,.2f}) within 5%"})
        elif contract['value']:
            key_terms.append(f"Contract Value: ${contract['value']:,.2f}")
    else:
        recommendations.append("No bid found for this job — add bid data for value comparison")
        findings.append({'type': 'info', 'category': 'Bid Data',
            'message': 'No bid found for this job — cannot compare contract value to bid'})

    # ── Contract metadata checks ──
    if contract['contractor']:
        key_terms.append(f"Contractor: {contract['contractor']}")
    if contract['contract_type']:
        key_terms.append(f"Type: {contract['contract_type']}")
    if contract['status']:
        key_terms.append(f"Status: {contract['status']}")

    # ── PDF clause analysis ──
    clause_checks = [
        ('scope of work', 'Scope of Work', 'Defines the specific work to be performed'),
        ('payment terms', 'Payment Terms', 'Outlines how and when payments are made'),
        ('change order', 'Change Order Process', 'Defines procedure for contract modifications'),
        ('termination', 'Termination Clause', 'Conditions under which contract can be ended'),
        ('insurance', 'Insurance Requirements', 'Required coverage types and amounts'),
        ('warranty', 'Warranty Provisions', 'Post-completion warranty obligations'),
        ('liquidated damages', 'Liquidated Damages', 'Penalties for delayed completion'),
        ('retainage', 'Retainage', 'Percentage withheld until project completion'),
        ('indemnif', 'Indemnification', 'Liability protection and hold-harmless clauses'),
        ('dispute', 'Dispute Resolution', 'Process for resolving disagreements'),
        ('lien', 'Lien Waiver', 'Mechanic\'s lien release requirements'),
        ('safety', 'Safety Requirements', 'Jobsite safety obligations'),
    ]

    clauses_found = []
    clauses_missing = []

    if pdf_text and not pdf_text.startswith('['):
        text_lower = pdf_text.lower()
        for keyword, label, desc in clause_checks:
            if keyword in text_lower:
                clauses_found.append(label)
                findings.append({'type': 'ok', 'category': 'Clause Check', 'message': f'{label} — {desc}'})
            else:
                clauses_missing.append(label)
                findings.append({'type': 'warning', 'category': 'Clause Check', 'message': f'{label} NOT found — {desc}'})

        if clauses_missing:
            for clause in clauses_missing[:3]:
                concerns.append(f"Missing clause: {clause}")
            if len(clauses_missing) > 3:
                concerns.append(f"...and {len(clauses_missing) - 3} more missing clauses")
            recommendations.append("Review contract for missing standard clauses listed above")
        if clauses_found:
            recommendations.append(f"{len(clauses_found)} of {len(clause_checks)} standard clauses found in contract")
    elif not contract['file_path']:
        recommendations.append("Upload a contract PDF for full clause analysis")
        findings.append({'type': 'info', 'category': 'Document', 'message': 'No PDF uploaded — upload a contract document for full review'})
    elif pdf_text.startswith('['):
        recommendations.append(pdf_text.strip('[]'))

    # ── Risk assessment ──
    risk_score = len(concerns)
    if risk_score == 0:
        risk_level = 'Low'
    elif risk_score <= 2:
        risk_level = 'Medium'
    else:
        risk_level = 'High'

    # ── Summary ──
    summary_parts = []
    summary_parts.append(f"Contract \"{contract['title']}\" for {contract['contractor'] or 'unknown contractor'}")
    if contract['value']:
        summary_parts.append(f"valued at ${contract['value']:,.2f}")
    if clauses_found:
        summary_parts.append(f"{len(clauses_found)}/{len(clause_checks)} standard clauses detected")
    if concerns:
        summary_parts.append(f"{len(concerns)} concern(s) identified")
    else:
        summary_parts.append("no major concerns identified")

    review = {
        'reviewed_at': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'contract_title': contract['title'],
        'contract_value': contract['value'],
        'bid_total': bid_total,
        'pdf_extracted': bool(pdf_text and not pdf_text.startswith('[')),
        'summary': ' — '.join(summary_parts) + '.',
        'risk_level': risk_level,
        'key_terms': key_terms,
        'concerns': concerns,
        'recommendations': recommendations,
        'findings': findings,
    }

    if not findings:
        findings.append({'type': 'info', 'category': 'General', 'message': 'Review complete — no issues found'})

    # Save review to contract
    conn.execute('UPDATE contracts SET ai_review = ? WHERE id = ?', (json.dumps(review), cid))
    conn.commit()
    conn.close()

    return jsonify(review)


# ─── Lien Waivers ────────────────────────────────────────────────

LIEN_WAIVERS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'lien_waivers')
os.makedirs(LIEN_WAIVERS_DIR, exist_ok=True)

@app.route('/lien-waivers')
@role_required('owner', 'admin', 'project_manager')
def lien_waivers_page():
    return render_template('lien_waivers/list.html')

@app.route('/api/lien-waivers')
@api_role_required('owner', 'admin', 'project_manager')
def api_lien_waivers_list():
    job_id = request.args.get('job_id', type=int)
    status = request.args.get('status', '')
    wtype = request.args.get('type', '')
    conn = get_db()
    sql = '''SELECT lw.*, j.name as job_name FROM lien_waivers lw
             JOIN jobs j ON lw.job_id = j.id WHERE 1=1'''
    params = []
    if job_id:
        sql += ' AND lw.job_id = ?'
        params.append(job_id)
    if status:
        sql += ' AND lw.status = ?'
        params.append(status)
    if wtype:
        sql += ' AND lw.waiver_type = ?'
        params.append(wtype)
    sql += ' ORDER BY lw.created_at DESC'
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d['has_file'] = bool(d.get('file_path'))
        d['has_pdf'] = bool(d.get('proposal_file'))
        result.append(d)
    return jsonify(result)

@app.route('/api/lien-waivers', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_lien_waivers_create():
    data = request.get_json(force=True)
    job_id = data.get('job_id')
    if not job_id:
        return jsonify({'error': 'job_id is required'}), 400

    conn = get_db()

    # Auto-number per job
    max_num = conn.execute(
        'SELECT MAX(waiver_number) FROM lien_waivers WHERE job_id = ?', (job_id,)
    ).fetchone()[0]
    waiver_number = (max_num or 0) + 1

    # Auto-fill from job and contract data
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    contract = conn.execute(
        'SELECT * FROM contracts WHERE job_id = ? AND status = ? ORDER BY value DESC LIMIT 1',
        (job_id, 'Active')
    ).fetchone()
    customer = None
    if job and job['customer_id']:
        customer = conn.execute('SELECT * FROM customers WHERE id = ?', (job['customer_id'],)).fetchone()

    contract_amount = float(data.get('contract_amount', 0))
    if not contract_amount and contract:
        contract_amount = contract['value'] or 0

    against_company = data.get('against_company', '')
    if not against_company and customer:
        against_company = customer['company_name'] or ''

    premises = data.get('premises_description', '')
    if not premises and job:
        premises = job['name'] or ''

    state_val = data.get('state', '')
    if not state_val and job:
        state_val = job['state'] or ''

    # Auto-calculate previous payments from executed waivers
    prev_row = conn.execute(
        'SELECT COALESCE(SUM(current_payment), 0) FROM lien_waivers WHERE job_id = ? AND status = ?',
        (job_id, 'Executed')
    ).fetchone()
    auto_previous = prev_row[0] if prev_row else 0
    previous_payments = float(data.get('previous_payments', 0)) or auto_previous

    current_payment = float(data.get('current_payment', 0))
    contract_balance = contract_amount - previous_payments - current_payment

    cursor = conn.execute(
        '''INSERT INTO lien_waivers (job_id, waiver_number, waiver_type, waiver_date,
           title_company, file_number, state, county, contract_amount, previous_payments,
           current_payment, contract_balance, claimant, against_company, premises_description,
           through_date, signer_name, signer_title, status, notes, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
        (job_id, waiver_number,
         data.get('waiver_type', 'Conditional Progress'),
         data.get('waiver_date', datetime.now().strftime('%Y-%m-%d')),
         data.get('title_company', ''),
         data.get('file_number', ''),
         state_val,
         data.get('county', ''),
         contract_amount,
         previous_payments,
         current_payment,
         contract_balance,
         data.get('claimant', 'LGHVAC Mechanical, LLC'),
         against_company,
         premises,
         data.get('through_date', ''),
         data.get('signer_name', ''),
         data.get('signer_title', ''),
         'Draft',
         data.get('notes', ''),
         session['user_id'])
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return jsonify({'ok': True, 'id': new_id, 'waiver_number': waiver_number}), 201

@app.route('/api/lien-waivers/<int:wid>')
@api_role_required('owner', 'admin', 'project_manager')
def api_lien_waivers_get(wid):
    conn = get_db()
    row = conn.execute(
        '''SELECT lw.*, j.name as job_name FROM lien_waivers lw
           JOIN jobs j ON lw.job_id = j.id WHERE lw.id = ?''', (wid,)
    ).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Lien waiver not found'}), 404
    d = dict(row)
    d['has_file'] = bool(d.get('file_path'))
    d['has_pdf'] = bool(d.get('proposal_file'))
    return jsonify(d)

@app.route('/api/lien-waivers/<int:wid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_lien_waivers_update(wid):
    data = request.get_json(force=True)
    conn = get_db()

    contract_amount = float(data.get('contract_amount', 0))
    previous_payments = float(data.get('previous_payments', 0))
    current_payment = float(data.get('current_payment', 0))
    contract_balance = contract_amount - previous_payments - current_payment

    conn.execute(
        '''UPDATE lien_waivers SET waiver_type=?, waiver_date=?, title_company=?,
           file_number=?, state=?, county=?, contract_amount=?, previous_payments=?,
           current_payment=?, contract_balance=?, claimant=?, against_company=?,
           premises_description=?, through_date=?, signer_name=?, signer_title=?,
           status=?, notes=?, updated_at=datetime('now','localtime') WHERE id=?''',
        (data.get('waiver_type', 'Conditional Progress'),
         data.get('waiver_date', ''),
         data.get('title_company', ''),
         data.get('file_number', ''),
         data.get('state', ''),
         data.get('county', ''),
         contract_amount,
         previous_payments,
         current_payment,
         contract_balance,
         data.get('claimant', 'LGHVAC Mechanical, LLC'),
         data.get('against_company', ''),
         data.get('premises_description', ''),
         data.get('through_date', ''),
         data.get('signer_name', ''),
         data.get('signer_title', ''),
         data.get('status', 'Draft'),
         data.get('notes', ''),
         wid)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/lien-waivers/<int:wid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_lien_waivers_delete(wid):
    conn = get_db()
    row = conn.execute('SELECT status, file_path, proposal_file FROM lien_waivers WHERE id = ?', (wid,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    if row['status'] != 'Draft':
        conn.close()
        return jsonify({'error': 'Only Draft waivers can be deleted'}), 400
    # Clean up files
    if row['file_path']:
        fpath = os.path.join(LIEN_WAIVERS_DIR, row['file_path'])
        if os.path.exists(fpath):
            os.remove(fpath)
    if row['proposal_file']:
        proposals_dir = os.path.join(os.path.dirname(__file__), 'data', 'proposals')
        fpath = os.path.join(proposals_dir, row['proposal_file'])
        if os.path.exists(fpath):
            os.remove(fpath)
    conn.execute('DELETE FROM lien_waivers WHERE id = ?', (wid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/lien-waivers/<int:wid>/generate', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_lien_waivers_generate(wid):
    conn = get_db()
    waiver = conn.execute('SELECT * FROM lien_waivers WHERE id = ?', (wid,)).fetchone()
    if not waiver:
        conn.close()
        return jsonify({'error': 'Lien waiver not found'}), 404

    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (waiver['job_id'],)).fetchone()
    conn.close()

    waiver = dict(waiver)
    job = dict(job) if job else {}
    logo_path = os.path.abspath(os.path.join(app.static_folder, 'logo.jpg'))

    html = render_template('lien_waivers/waiver_pdf.html',
                           waiver=waiver, job=job,
                           logo_path='file://' + logo_path)

    proposals_dir = os.path.join(os.path.dirname(__file__), 'data', 'proposals')
    os.makedirs(proposals_dir, exist_ok=True)

    filename = f"LienWaiver_{waiver['job_id']}_{waiver['waiver_number']}.pdf"
    filepath = os.path.join(proposals_dir, filename)

    import subprocess, tempfile
    with tempfile.NamedTemporaryFile(suffix='.html', delete=False, mode='w') as tmp:
        tmp.write(html)
        tmp_path = tmp.name

    try:
        chrome_paths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
        chrome = next((p for p in chrome_paths if os.path.exists(p)), None)
        if not chrome:
            return jsonify({'error': 'Chrome not found.'}), 500

        result = subprocess.run([
            chrome, '--headless', '--disable-gpu', '--no-sandbox',
            '--disable-software-rasterizer',
            f'--print-to-pdf={filepath}', '--no-pdf-header-footer',
            f'file://{tmp_path}',
        ], capture_output=True, text=True, timeout=30)

        if not os.path.exists(filepath):
            return jsonify({'error': f'PDF generation failed: {result.stderr[:200]}'}), 500
    finally:
        os.unlink(tmp_path)

    # Store filename
    conn2 = get_db()
    conn2.execute('UPDATE lien_waivers SET proposal_file = ? WHERE id = ?', (filename, wid))
    conn2.commit()
    conn2.close()

    return jsonify({'ok': True, 'filename': filename,
                    'path': f'/api/lien-waivers/{wid}/pdf/{filename}'})

@app.route('/api/lien-waivers/<int:wid>/pdf/<filename>')
@api_role_required('owner', 'admin', 'project_manager')
def api_lien_waivers_pdf(wid, filename):
    proposals_dir = os.path.join(os.path.dirname(__file__), 'data', 'proposals')
    filepath = os.path.join(proposals_dir, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    if request.args.get('download'):
        return send_file(filepath, as_attachment=True, download_name=filename)
    return send_file(filepath, mimetype='application/pdf')

@app.route('/api/lien-waivers/<int:wid>/upload', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_lien_waivers_upload(wid):
    file = request.files.get('file')
    if not file or not file.filename:
        return jsonify({'error': 'No file provided'}), 400
    from werkzeug.utils import secure_filename
    fname = secure_filename(file.filename)
    fname = f"{int(datetime.now().timestamp())}_{fname}"
    file.save(os.path.join(LIEN_WAIVERS_DIR, fname))
    conn = get_db()
    conn.execute('UPDATE lien_waivers SET file_path = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?',
                 (fname, wid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'filename': fname})

@app.route('/api/lien-waivers/<int:wid>/file')
@api_role_required('owner', 'admin', 'project_manager')
def api_lien_waivers_file(wid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM lien_waivers WHERE id = ?', (wid,)).fetchone()
    conn.close()
    if not row or not row['file_path']:
        return 'Not found', 404
    fpath = os.path.join(LIEN_WAIVERS_DIR, row['file_path'])
    if not os.path.exists(fpath):
        return 'File not found', 404
    return send_file(fpath, mimetype='application/pdf')


# ─── Workflow Dashboard ─────────────────────────────────────────

@app.route('/workflow')
@role_required('owner', 'admin', 'project_manager')
def workflow_page():
    return render_template('workflow/dashboard.html')

@app.route('/api/workflow/summary')
@api_role_required('owner', 'admin', 'project_manager')
def api_workflow_summary():
    job_id = request.args.get('job_id', type=int)
    conn = get_db()

    # Get jobs
    if job_id:
        jobs = conn.execute('SELECT id, name, status FROM jobs WHERE id = ?', (job_id,)).fetchall()
    else:
        jobs = conn.execute("SELECT id, name, status FROM jobs WHERE status NOT IN ('Complete','Cancelled') ORDER BY name").fetchall()

    job_ids = [j['id'] for j in jobs]
    if not job_ids:
        conn.close()
        return jsonify({'summary': {}, 'jobs': []})

    placeholders = ','.join('?' * len(job_ids))

    # Aggregate RFIs
    rfis = conn.execute(
        f'SELECT job_id, status, COUNT(*) as cnt FROM rfis WHERE job_id IN ({placeholders}) GROUP BY job_id, status',
        job_ids
    ).fetchall()

    # Aggregate Submittals
    submittals = conn.execute(
        f'SELECT job_id, status, COUNT(*) as cnt FROM submittals WHERE job_id IN ({placeholders}) GROUP BY job_id, status',
        job_ids
    ).fetchall()

    # Aggregate Change Orders
    change_orders = conn.execute(
        f'SELECT job_id, status, COUNT(*) as cnt FROM change_orders WHERE job_id IN ({placeholders}) GROUP BY job_id, status',
        job_ids
    ).fetchall()

    # Aggregate Schedule Events
    schedule = conn.execute(
        f'SELECT job_id, status, COUNT(*) as cnt FROM job_schedule_events WHERE job_id IN ({placeholders}) GROUP BY job_id, status',
        job_ids
    ).fetchall()

    # Aggregate Pay Apps (through contracts)
    pay_apps = conn.execute(
        f'''SELECT pac.job_id, pa.status, COUNT(*) as cnt
            FROM pay_applications pa
            JOIN pay_app_contracts pac ON pa.contract_id = pac.id
            WHERE pac.job_id IN ({placeholders})
            GROUP BY pac.job_id, pa.status''',
        job_ids
    ).fetchall()

    # Aggregate Closeout Checklists
    closeout = conn.execute(
        f'SELECT job_id, status, COUNT(*) as cnt FROM closeout_checklists WHERE job_id IN ({placeholders}) GROUP BY job_id, status',
        job_ids
    ).fetchall()

    # Aggregate Contracts
    contracts = conn.execute(
        f'SELECT job_id, status, COUNT(*) as cnt FROM contracts WHERE job_id IN ({placeholders}) GROUP BY job_id, status',
        job_ids
    ).fetchall()

    conn.close()

    # Build per-job and summary dicts
    def build_status_dict(rows):
        result = {}
        for row in rows:
            jid = row['job_id']
            if jid not in result:
                result[jid] = {}
            result[jid][row['status']] = row['cnt']
        return result

    rfi_map = build_status_dict(rfis)
    sub_map = build_status_dict(submittals)
    co_map = build_status_dict(change_orders)
    sched_map = build_status_dict(schedule)
    pa_map = build_status_dict(pay_apps)
    cl_map = build_status_dict(closeout)
    ct_map = build_status_dict(contracts)

    # Build summary totals
    def merge_totals(status_map):
        totals = {}
        for jid, statuses in status_map.items():
            for s, c in statuses.items():
                totals[s] = totals.get(s, 0) + c
        return totals

    summary = {
        'rfis': merge_totals(rfi_map),
        'submittals': merge_totals(sub_map),
        'change_orders': merge_totals(co_map),
        'schedule': merge_totals(sched_map),
        'pay_apps': merge_totals(pa_map),
        'closeout': merge_totals(cl_map),
        'contracts': merge_totals(ct_map),
    }

    # Build per-job data
    job_data = []
    for j in jobs:
        jid = j['id']
        job_data.append({
            'id': jid,
            'name': j['name'],
            'status': j['status'],
            'rfis': rfi_map.get(jid, {}),
            'submittals': sub_map.get(jid, {}),
            'change_orders': co_map.get(jid, {}),
            'schedule': sched_map.get(jid, {}),
            'pay_apps': pa_map.get(jid, {}),
            'closeout': cl_map.get(jid, {}),
            'contracts': ct_map.get(jid, {}),
        })

    return jsonify({'summary': summary, 'jobs': job_data})


# ─── BillTrust Integration ──────────────────────────────────────

@app.route('/api/billtrust/config')
@api_role_required('owner', 'admin')
def api_billtrust_config():
    conn = get_db()
    configs = conn.execute('SELECT id, supplier_name, is_active, use_mock, last_sync_at FROM billtrust_config ORDER BY supplier_name').fetchall()
    conn.close()
    return jsonify([dict(c) for c in configs])

@app.route('/api/billtrust/config/<int:cid>', methods=['PUT'])
@api_role_required('owner', 'admin')
def api_billtrust_config_update(cid):
    data = request.get_json()
    conn = get_db()
    conn.execute(
        '''UPDATE billtrust_config SET client_id=?, client_secret=?, is_active=?, use_mock=?,
           updated_at=datetime('now','localtime') WHERE id=?''',
        (data.get('client_id', ''), data.get('client_secret', ''),
         data.get('is_active', 1), data.get('use_mock', 1), cid)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/billtrust/sync/<int:config_id>', methods=['POST'])
@api_role_required('owner', 'admin')
def api_billtrust_sync(config_id):
    conn = get_db()
    try:
        from billtrust import get_client_for_supplier
        client = get_client_for_supplier(conn, config_id)
        if not client:
            conn.close()
            return jsonify({'error': 'Supplier config not found'}), 404

        result = client.sync_invoices(conn, config_id)
        conn.execute(
            "UPDATE billtrust_config SET last_sync_at = datetime('now','localtime') WHERE id = ?",
            (config_id,)
        )
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

    conn.close()
    return jsonify(result)

@app.route('/api/billtrust/invoices')
@api_role_required('owner', 'admin')
def api_billtrust_invoices():
    supplier_id = request.args.get('supplier_id', type=int)
    status = request.args.get('status', '')
    conn = get_db()
    sql = '''SELECT si.*, bc.supplier_name FROM supplier_invoices si
             JOIN billtrust_config bc ON si.supplier_config_id = bc.id WHERE 1=1'''
    params = []
    if supplier_id:
        sql += ' AND si.supplier_config_id = ?'
        params.append(supplier_id)
    if status:
        sql += ' AND LOWER(si.status) = LOWER(?)'
        params.append(status)
    sql += ' ORDER BY si.invoice_date DESC'
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/billtrust/invoices/<int:iid>/link', methods=['PUT'])
@api_role_required('owner', 'admin')
def api_billtrust_invoice_link(iid):
    """Link a supplier invoice to a job."""
    data = request.get_json()
    conn = get_db()
    conn.execute('UPDATE supplier_invoices SET job_id = ? WHERE id = ?', (data.get('job_id'), iid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/billtrust/test/<int:config_id>', methods=['POST'])
@api_role_required('owner', 'admin')
def api_billtrust_test(config_id):
    conn = get_db()
    try:
        from billtrust import test_connection
        result = test_connection(conn, config_id)
        conn.close()
        return jsonify(result)
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/billtrust/import', methods=['POST'])
@api_role_required('owner', 'admin')
def api_billtrust_import():
    """Import invoices from BillTrust CSV + PDF export files."""
    csv_file = request.files.get('csv_file')
    pdf_file = request.files.get('pdf_file')
    supplier_name = request.form.get('supplier_name', 'Locke Supply')

    if not csv_file:
        return jsonify({'error': 'CSV file is required'}), 400

    csv_content = csv_file.read()
    pdf_content = pdf_file.read() if pdf_file else None

    conn = get_db()
    try:
        # Look up supplier config
        config = conn.execute(
            'SELECT id FROM billtrust_config WHERE supplier_name = ?', (supplier_name,)
        ).fetchone()
        if not config:
            conn.close()
            return jsonify({'error': f'Supplier "{supplier_name}" not found in config'}), 404

        supplier_config_id = config['id']

        from invoice_import import import_billtrust_files
        result = import_billtrust_files(csv_content, pdf_content, supplier_config_id, conn)

        # Log to sync log
        stats = result.get('stats', {})
        conn.execute('''
            INSERT INTO billtrust_sync_log (config_id, sync_type, invoices_found, invoices_new, invoices_updated, errors)
            VALUES (?, 'csv_pdf_import', ?, ?, ?, ?)
        ''', (supplier_config_id, stats.get('total', 0), stats.get('new', 0),
              stats.get('updated', 0), json.dumps([])))
        conn.commit()

        # Notify other owners/admins
        current_user = session.get('user_id')
        admins = conn.execute(
            "SELECT id FROM users WHERE role IN ('owner','admin') AND id != ?",
            (current_user,)
        ).fetchall()
        conn.close()

        for admin in admins:
            create_notification(
                admin['id'], 'invoice',
                f'BillTrust Import: {stats.get("new",0)} new, {stats.get("updated",0)} updated',
                f'{supplier_name} — {stats.get("total",0)} invoices imported via CSV/PDF',
                '/invoices'
            )

        return jsonify(result)
    except Exception as e:
        conn.close()
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ─── Plans ─────────────────────────────────────────────────────

PLANS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'plans')
os.makedirs(PLANS_DIR, exist_ok=True)

# ── Takeoff Template (matches Takeoff_Template.xlsm "Program" tab) ──
TAKEOFF_TEMPLATE = {
    "sections": [
        {
            "name": "Rough - In",
            "items": [
                {"part": "12x14 CRD", "sku": "I-CRD50", "category": "CRD", "price": 43.00, "default_use": True},
                {"part": "6x12x8 CRD Boot", "sku": "50CRD", "category": "CRD", "price": 35.00, "default_use": True},
                {"part": "80CFM CRD Fan", "sku": "QTXE080-22016845", "category": "CRD", "price": 100.50, "default_use": True},
                {"part": "6\" Finger Taps", "sku": "L0090", "category": "Duct Adapter", "price": 1.30, "default_use": True},
                {"part": "8\" Finger Taps", "sku": "L0092", "category": "Duct Adapter", "price": 1.65, "default_use": True},
                {"part": "10\" Finger Taps", "sku": "L0094", "category": "Duct Adapter", "price": 2.10, "default_use": False},
                {"part": "6\" R6 Flex (bags)", "sku": "L1972", "category": "Flex", "price": 31.46, "default_use": True},
                {"part": "8\" R6 Flex (bags)", "sku": "L1974", "category": "Flex", "price": 37.56, "default_use": True},
                {"part": "10\" R6 Flex (bags)", "sku": "L1976", "category": "Flex", "price": 48.50, "default_use": False},
                {"part": "12\" R6 Flex (bags)", "sku": "L1978", "category": "Flex", "price": 55.20, "default_use": False},
                {"part": "3/8 Line Set (in feet)", "sku": "H0716", "category": "Line Set", "price": 57.00, "default_use": True},
                {"part": "3/4 Line Set (in feet)", "sku": "H0719", "category": "Line Set", "price": 130.00, "default_use": True},
                {"part": "7/8 Line Set (in feet)", "sku": "H0720", "category": "Line Set", "price": 165.00, "default_use": False},
                {"part": "1-1/8 Line Set (in feet)", "sku": "H0722", "category": "Line Set", "price": 210.00, "default_use": False},
                {"part": "3/4\" Armaflex (6ft stick)", "sku": "H0750", "category": "Insulation", "price": 8.50, "default_use": True},
                {"part": "7/8\" Armaflex (6ft stick)", "sku": "H0752", "category": "Insulation", "price": 10.25, "default_use": False},
                {"part": "1-1/8\" Armaflex (6ft stick)", "sku": "H0754", "category": "Insulation", "price": 13.50, "default_use": False},
                {"part": "Armaflex Glue (qt)", "sku": "H0760", "category": "Insulation", "price": 22.00, "default_use": True},
                {"part": "3/4\" PVC (10ft stick)", "sku": "P0340", "category": "Condensate", "price": 4.50, "default_use": True},
                {"part": "3/4\" PVC Fittings (bag)", "sku": "P0345", "category": "Condensate", "price": 12.00, "default_use": True},
                {"part": "PVC Cement & Primer Kit", "sku": "P0350", "category": "Condensate", "price": 8.75, "default_use": True},
                {"part": "Condensate Trap", "sku": "P0360", "category": "Condensate", "price": 6.50, "default_use": True},
                {"part": "Metal Hanger Strap (100ft roll)", "sku": "L0200", "category": "Hangers", "price": 18.50, "default_use": True},
                {"part": "1\" Metal Screws (box)", "sku": "L0210", "category": "Hangers", "price": 12.00, "default_use": True},
                {"part": "Threaded Rod 3/8x36\"", "sku": "L0220", "category": "Hangers", "price": 3.25, "default_use": True},
                {"part": "Duct Mastic (gal)", "sku": "L0300", "category": "Sealant", "price": 15.00, "default_use": True},
                {"part": "Mastic Tape (roll)", "sku": "L0305", "category": "Sealant", "price": 8.50, "default_use": True},
                {"part": "Foil Tape (roll)", "sku": "L0310", "category": "Sealant", "price": 7.25, "default_use": True},
                {"part": "14x8 Return Air Boot", "sku": "L0400", "category": "Return Air", "price": 18.00, "default_use": True},
                {"part": "20x20 Return Air Box", "sku": "L0410", "category": "Return Air", "price": 35.00, "default_use": True},
                {"part": "20x25 Filter Grille", "sku": "L0420", "category": "Return Air", "price": 22.00, "default_use": True},
                {"part": "Plenum Board (4x8 sheet)", "sku": "L0500", "category": "Plenum", "price": 32.00, "default_use": True},
                {"part": "Plenum Clips (box)", "sku": "L0505", "category": "Plenum", "price": 6.50, "default_use": True},
                {"part": "R8 Duct Board (4x10 sheet)", "sku": "L0510", "category": "Plenum", "price": 52.00, "default_use": False},
                {"part": "Low Voltage Wire (250ft)", "sku": "E0100", "category": "Electrical", "price": 35.00, "default_use": True},
                {"part": "Disconnect 60A Non-Fused", "sku": "E0200", "category": "Electrical", "price": 18.50, "default_use": True},
                {"part": "Disconnect 60A Fused", "sku": "E0205", "category": "Electrical", "price": 28.00, "default_use": False},
                {"part": "Whip 3/4\" x 6ft", "sku": "E0210", "category": "Electrical", "price": 22.00, "default_use": True},
                {"part": "Whip 1\" x 6ft", "sku": "E0215", "category": "Electrical", "price": 32.00, "default_use": False},
                {"part": "Wire Nuts / Connectors (box)", "sku": "E0220", "category": "Electrical", "price": 8.00, "default_use": True},
                {"part": "10-2 Romex (250ft)", "sku": "E0300", "category": "Electrical", "price": 145.00, "default_use": False},
                {"part": "6-2 Romex (125ft)", "sku": "E0310", "category": "Electrical", "price": 185.00, "default_use": False},
                {"part": "Gas Flex 1/2\" (per ft)", "sku": "G0100", "category": "Gas", "price": 3.50, "default_use": False},
                {"part": "Gas Flex 3/4\" (per ft)", "sku": "G0105", "category": "Gas", "price": 5.25, "default_use": False},
                {"part": "Gas Valve 1/2\"", "sku": "G0110", "category": "Gas", "price": 12.00, "default_use": False},
                {"part": "Gas Drip Leg Kit", "sku": "G0120", "category": "Gas", "price": 8.50, "default_use": False},
            ]
        },
        {
            "name": "Trim Out",
            "items": [
                {"part": "3\" Pump Ups", "sku": "L0681", "category": "Shorts & Smalls", "price": 3.80, "default_use": True},
                {"part": "Safe T Switch", "sku": "L2507", "category": "Shorts & Smalls", "price": 17.70, "default_use": True},
                {"part": "Float Switch", "sku": "L2510", "category": "Shorts & Smalls", "price": 14.50, "default_use": True},
                {"part": "Drain Pan (plastic)", "sku": "L0700", "category": "Shorts & Smalls", "price": 18.00, "default_use": True},
                {"part": "Drain Pan (metal)", "sku": "L0705", "category": "Shorts & Smalls", "price": 25.00, "default_use": False},
                {"part": "6x6 Register (white)", "sku": "R0100", "category": "Registers & Grilles", "price": 5.50, "default_use": True},
                {"part": "8x4 Register (white)", "sku": "R0105", "category": "Registers & Grilles", "price": 5.50, "default_use": True},
                {"part": "10x4 Register (white)", "sku": "R0110", "category": "Registers & Grilles", "price": 6.25, "default_use": True},
                {"part": "10x6 Register (white)", "sku": "R0115", "category": "Registers & Grilles", "price": 6.75, "default_use": True},
                {"part": "12x4 Register (white)", "sku": "R0120", "category": "Registers & Grilles", "price": 6.50, "default_use": True},
                {"part": "12x6 Register (white)", "sku": "R0125", "category": "Registers & Grilles", "price": 7.25, "default_use": True},
                {"part": "14x6 Register (white)", "sku": "R0130", "category": "Registers & Grilles", "price": 8.00, "default_use": False},
                {"part": "6\" Round Ceiling Diffuser", "sku": "R0200", "category": "Registers & Grilles", "price": 9.50, "default_use": False},
                {"part": "8\" Round Ceiling Diffuser", "sku": "R0205", "category": "Registers & Grilles", "price": 11.00, "default_use": False},
                {"part": "20x25x1 Filter (12-pack)", "sku": "F0100", "category": "Filters", "price": 42.00, "default_use": True},
                {"part": "16x25x1 Filter (12-pack)", "sku": "F0105", "category": "Filters", "price": 38.00, "default_use": False},
                {"part": "20x20x1 Filter (12-pack)", "sku": "F0110", "category": "Filters", "price": 38.00, "default_use": False},
                {"part": "Cork Pads (set of 4)", "sku": "L0800", "category": "Mounting", "price": 12.00, "default_use": True},
                {"part": "Condenser Pad (plastic)", "sku": "L0810", "category": "Mounting", "price": 28.00, "default_use": True},
                {"part": "Wall Brackets (pair)", "sku": "L0820", "category": "Mounting", "price": 45.00, "default_use": False},
                {"part": "Refrigerant R-410A (25lb)", "sku": "H1000", "category": "Refrigerant", "price": 185.00, "default_use": True},
                {"part": "Refrigerant R-410A (50lb)", "sku": "H1005", "category": "Refrigerant", "price": 310.00, "default_use": False},
                {"part": "Nitrogen (tank rental + gas)", "sku": "H1020", "category": "Refrigerant", "price": 75.00, "default_use": True},
                {"part": "Silver Brazing Rods (pkg)", "sku": "H1030", "category": "Brazing", "price": 55.00, "default_use": True},
                {"part": "Stay-Brite #8 Solder (1lb)", "sku": "H1035", "category": "Brazing", "price": 42.00, "default_use": True},
                {"part": "Flux Paste", "sku": "H1040", "category": "Brazing", "price": 12.00, "default_use": True},
                {"part": "Pipe Cutter 1/4-1-5/8\"", "sku": "T0100", "category": "Tools (consumable)", "price": 28.00, "default_use": False},
                {"part": "Flare Tool Kit", "sku": "T0105", "category": "Tools (consumable)", "price": 65.00, "default_use": False},
                {"part": "Torque Wrench (refrigerant)", "sku": "T0110", "category": "Tools (consumable)", "price": 45.00, "default_use": False},
                {"part": "Duct Knife / Blade (pkg)", "sku": "T0115", "category": "Tools (consumable)", "price": 15.00, "default_use": True},
                {"part": "Zip Ties 11\" (bag of 100)", "sku": "L0900", "category": "Misc Supplies", "price": 6.50, "default_use": True},
                {"part": "Caulk / Firestop (tube)", "sku": "L0910", "category": "Misc Supplies", "price": 8.00, "default_use": True},
                {"part": "Metal Tape Measure 25ft", "sku": "T0200", "category": "Misc Supplies", "price": 14.00, "default_use": False},
                {"part": "Condensate Pump (mini)", "sku": "P0400", "category": "Condensate", "price": 85.00, "default_use": False},
                {"part": "Condensate Pump (full size)", "sku": "P0405", "category": "Condensate", "price": 125.00, "default_use": False},
                {"part": "UV Light Kit", "sku": "L0950", "category": "IAQ", "price": 145.00, "default_use": False},
                {"part": "Media Filter Cabinet", "sku": "L0960", "category": "IAQ", "price": 165.00, "default_use": False},
            ]
        },
        {
            "name": "Equipment",
            "items": [
                {"part": "1.5 Ton Air Handler", "sku": "", "category": "Furnace/Air Handler/Heat Strip", "price": 500, "default_use": False},
                {"part": "2 Ton Air Handler", "sku": "", "category": "Furnace/Air Handler/Heat Strip", "price": 506, "default_use": False},
                {"part": "2.5 Ton Air Handler", "sku": "", "category": "Furnace/Air Handler/Heat Strip", "price": 575, "default_use": False},
                {"part": "3 Ton Air Handler", "sku": "", "category": "Furnace/Air Handler/Heat Strip", "price": 650, "default_use": False},
                {"part": "3.5 Ton Air Handler", "sku": "", "category": "Furnace/Air Handler/Heat Strip", "price": 720, "default_use": False},
                {"part": "4 Ton Air Handler", "sku": "", "category": "Furnace/Air Handler/Heat Strip", "price": 800, "default_use": False},
                {"part": "5 Ton Air Handler", "sku": "", "category": "Furnace/Air Handler/Heat Strip", "price": 950, "default_use": False},
                {"part": "5kW Heat Strip", "sku": "", "category": "Furnace/Air Handler/Heat Strip", "price": 85, "default_use": False},
                {"part": "8kW Heat Strip", "sku": "", "category": "Furnace/Air Handler/Heat Strip", "price": 105, "default_use": False},
                {"part": "10kW Heat Strip", "sku": "", "category": "Furnace/Air Handler/Heat Strip", "price": 125, "default_use": False},
                {"part": "15kW Heat Strip", "sku": "", "category": "Furnace/Air Handler/Heat Strip", "price": 155, "default_use": False},
                {"part": "60K BTU Gas Furnace 96%", "sku": "", "category": "Furnace/Air Handler/Heat Strip", "price": 1100, "default_use": False},
                {"part": "80K BTU Gas Furnace 96%", "sku": "", "category": "Furnace/Air Handler/Heat Strip", "price": 1250, "default_use": False},
                {"part": "100K BTU Gas Furnace 96%", "sku": "", "category": "Furnace/Air Handler/Heat Strip", "price": 1400, "default_use": False},
                {"part": "1.5 Ton Condenser", "sku": "", "category": "Heat Pump/Condenser", "price": 820, "default_use": False},
                {"part": "2 Ton Condenser", "sku": "", "category": "Heat Pump/Condenser", "price": 950, "default_use": False},
                {"part": "2.5 Ton Condenser", "sku": "", "category": "Heat Pump/Condenser", "price": 1100, "default_use": False},
                {"part": "3 Ton Condenser", "sku": "", "category": "Heat Pump/Condenser", "price": 1300, "default_use": False},
                {"part": "3.5 Ton Condenser", "sku": "", "category": "Heat Pump/Condenser", "price": 1450, "default_use": False},
                {"part": "4 Ton Condenser", "sku": "", "category": "Heat Pump/Condenser", "price": 1650, "default_use": False},
                {"part": "5 Ton Condenser", "sku": "", "category": "Heat Pump/Condenser", "price": 1950, "default_use": False},
                {"part": "1.5 Ton Heat Pump", "sku": "", "category": "Heat Pump/Condenser", "price": 1050, "default_use": False},
                {"part": "2 Ton Heat Pump", "sku": "", "category": "Heat Pump/Condenser", "price": 1200, "default_use": False},
                {"part": "2.5 Ton Heat Pump", "sku": "", "category": "Heat Pump/Condenser", "price": 1380, "default_use": False},
                {"part": "3 Ton Heat Pump", "sku": "", "category": "Heat Pump/Condenser", "price": 1580, "default_use": False},
                {"part": "3.5 Ton Heat Pump", "sku": "", "category": "Heat Pump/Condenser", "price": 1750, "default_use": False},
                {"part": "4 Ton Heat Pump", "sku": "", "category": "Heat Pump/Condenser", "price": 1980, "default_use": False},
                {"part": "5 Ton Heat Pump", "sku": "", "category": "Heat Pump/Condenser", "price": 2350, "default_use": False},
                {"part": "Mini Split 9K BTU", "sku": "", "category": "Mini Split", "price": 850, "default_use": False},
                {"part": "Mini Split 12K BTU", "sku": "", "category": "Mini Split", "price": 950, "default_use": False},
                {"part": "Mini Split 18K BTU", "sku": "", "category": "Mini Split", "price": 1150, "default_use": False},
                {"part": "Mini Split 24K BTU", "sku": "", "category": "Mini Split", "price": 1350, "default_use": False},
                {"part": "Mini Split Multi-Zone Outdoor 2-zone", "sku": "", "category": "Mini Split", "price": 1800, "default_use": False},
                {"part": "Mini Split Multi-Zone Outdoor 3-zone", "sku": "", "category": "Mini Split", "price": 2400, "default_use": False},
                {"part": "Mini Split Multi-Zone Outdoor 4-zone", "sku": "", "category": "Mini Split", "price": 3000, "default_use": False},
                {"part": "Programmable Thermostat", "sku": "L7170", "category": "Thermostat", "price": 52.50, "default_use": True},
                {"part": "WiFi Thermostat", "sku": "L7175", "category": "Thermostat", "price": 125.00, "default_use": False},
                {"part": "Smart Thermostat (Ecobee/Nest)", "sku": "", "category": "Thermostat", "price": 185.00, "default_use": False},
                {"part": "ERV Unit", "sku": "", "category": "Ventilation", "price": 650, "default_use": False},
                {"part": "HRV Unit", "sku": "", "category": "Ventilation", "price": 580, "default_use": False},
                {"part": "Inline Exhaust Fan 6\"", "sku": "", "category": "Ventilation", "price": 125, "default_use": False},
                {"part": "Inline Exhaust Fan 8\"", "sku": "", "category": "Ventilation", "price": 165, "default_use": False},
                {"part": "Bath Exhaust Fan 80CFM", "sku": "", "category": "Ventilation", "price": 95, "default_use": False},
                {"part": "Bath Exhaust Fan 110CFM", "sku": "", "category": "Ventilation", "price": 125, "default_use": False},
                {"part": "Range Hood Vent Kit", "sku": "", "category": "Ventilation", "price": 85, "default_use": False},
                {"part": "Dryer Vent Kit", "sku": "", "category": "Ventilation", "price": 45, "default_use": False},
                {"part": "Zoning Panel (2 zone)", "sku": "", "category": "Zoning", "price": 350, "default_use": False},
                {"part": "Zoning Panel (3 zone)", "sku": "", "category": "Zoning", "price": 450, "default_use": False},
                {"part": "Zone Damper (round)", "sku": "", "category": "Zoning", "price": 85, "default_use": False},
                {"part": "Zone Damper (rect)", "sku": "", "category": "Zoning", "price": 110, "default_use": False},
            ]
        },
        {
            "name": "Freight",
            "items": [
                {"part": "Freight to jobsite", "sku": "", "category": "Shipping", "price": 3000, "default_use": False},
                {"part": "Crane / Lift Rental", "sku": "", "category": "Shipping", "price": 1500, "default_use": False},
                {"part": "Dumpster Rental", "sku": "", "category": "Shipping", "price": 500, "default_use": False},
            ]
        }
    ],
    "waste_factor": 0.075,
    "tax_rate": 0.0885
}


@app.route('/plans')
@role_required('owner', 'admin', 'project_manager')
def plans_page():
    return render_template('plans/list.html')


@app.route('/api/plans')
@api_role_required('owner', 'admin', 'project_manager')
def api_plans_list():
    job_id = request.args.get('job_id', type=int)
    status = request.args.get('status', '')
    plan_type = request.args.get('plan_type', '')
    conn = get_db()
    sql = '''SELECT p.*, j.name as job_name FROM plans p
             JOIN jobs j ON p.job_id = j.id WHERE 1=1'''
    params = []
    if job_id:
        sql += ' AND p.job_id = ?'
        params.append(job_id)
    if status:
        sql += ' AND p.status = ?'
        params.append(status)
    if plan_type:
        sql += ' AND p.plan_type = ?'
        params.append(plan_type)
    sql += ' ORDER BY p.created_at DESC'
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d['has_file'] = bool(d.get('file_path'))
        d['has_review'] = bool(d.get('ai_review'))
        d['has_takeoff'] = bool(d.get('takeoff_data'))
        result.append(d)
    return jsonify(result)


@app.route('/api/plans', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_plans_create():
    conn = get_db()
    file_path = ''
    file_hash = ''
    page_count = 0
    if request.content_type and 'multipart' in request.content_type:
        job_id = request.form.get('job_id', type=int)
        title = request.form.get('title', '')
        plan_type = request.form.get('plan_type', 'Mechanical')
        notes = request.form.get('notes', '')
        file = request.files.get('file')
        if file and file.filename:
            from werkzeug.utils import secure_filename
            content = file.read()
            file_hash = hashlib.md5(content).hexdigest()
            fname = secure_filename(file.filename)
            fname = f"{int(datetime.now().timestamp())}_{fname}"
            file.seek(0)
            file.save(os.path.join(PLANS_DIR, fname))
            file_path = fname
            # Count pages
            try:
                import pdfplumber
                with pdfplumber.open(os.path.join(PLANS_DIR, fname)) as pdf:
                    page_count = len(pdf.pages)
            except Exception:
                pass
    else:
        data = request.get_json(force=True)
        job_id = data.get('job_id')
        title = data.get('title', '')
        plan_type = data.get('plan_type', 'Mechanical')
        notes = data.get('notes', '')

    cursor = conn.execute(
        '''INSERT INTO plans (job_id, title, plan_type, file_path, file_hash, upload_date,
           notes, page_count, created_by)
           VALUES (?,?,?,?,?,date('now','localtime'),?,?,?)''',
        (job_id, title, plan_type, file_path, file_hash, notes, page_count, session['user_id'])
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return jsonify({'ok': True, 'id': new_id}), 201


@app.route('/api/plans/<int:pid>')
@api_role_required('owner', 'admin', 'project_manager')
def api_plans_get(pid):
    conn = get_db()
    row = conn.execute(
        '''SELECT p.*, j.name as job_name FROM plans p
           JOIN jobs j ON p.job_id = j.id WHERE p.id = ?''', (pid,)
    ).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Plan not found'}), 404
    d = dict(row)
    d['has_file'] = bool(d.get('file_path'))
    d['has_review'] = bool(d.get('ai_review'))
    d['has_takeoff'] = bool(d.get('takeoff_data'))
    if d.get('ai_review'):
        try:
            d['ai_review'] = json.loads(d['ai_review'])
        except (json.JSONDecodeError, TypeError):
            pass
    if d.get('takeoff_data'):
        try:
            d['takeoff_data'] = json.loads(d['takeoff_data'])
        except (json.JSONDecodeError, TypeError):
            pass
    return jsonify(d)


@app.route('/api/plans/<int:pid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_plans_update(pid):
    conn = get_db()
    file_path_update = None
    page_count_update = None
    if request.content_type and 'multipart' in request.content_type:
        title = request.form.get('title', '')
        plan_type = request.form.get('plan_type', 'Mechanical')
        status = request.form.get('status', 'Uploaded')
        notes = request.form.get('notes', '')
        takeoff_data = request.form.get('takeoff_data', '')
        file = request.files.get('file')
        if file and file.filename:
            from werkzeug.utils import secure_filename
            fname = secure_filename(file.filename)
            fname = f"{int(datetime.now().timestamp())}_{fname}"
            file.save(os.path.join(PLANS_DIR, fname))
            file_path_update = fname
            try:
                import pdfplumber
                with pdfplumber.open(os.path.join(PLANS_DIR, fname)) as pdf:
                    page_count_update = len(pdf.pages)
            except Exception:
                page_count_update = 0
    else:
        data = request.get_json(force=True)
        title = data.get('title', '')
        plan_type = data.get('plan_type', 'Mechanical')
        status = data.get('status', 'Uploaded')
        notes = data.get('notes', '')
        takeoff_data = data.get('takeoff_data', '')

    if file_path_update is not None:
        conn.execute(
            '''UPDATE plans SET title=?, plan_type=?, status=?, notes=?, file_path=?,
               upload_date=date('now','localtime'), page_count=?,
               updated_at=datetime('now','localtime') WHERE id=?''',
            (title, plan_type, status, notes, file_path_update, page_count_update, pid)
        )
    elif takeoff_data:
        conn.execute(
            '''UPDATE plans SET title=?, plan_type=?, status=?, notes=?, takeoff_data=?,
               updated_at=datetime('now','localtime') WHERE id=?''',
            (title, plan_type, status, notes, takeoff_data if isinstance(takeoff_data, str) else json.dumps(takeoff_data), pid)
        )
    else:
        conn.execute(
            '''UPDATE plans SET title=?, plan_type=?, status=?, notes=?,
               updated_at=datetime('now','localtime') WHERE id=?''',
            (title, plan_type, status, notes, pid)
        )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/plans/<int:pid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_plans_delete(pid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM plans WHERE id = ?', (pid,)).fetchone()
    if row and row['file_path']:
        fpath = os.path.join(PLANS_DIR, row['file_path'])
        if os.path.exists(fpath):
            os.remove(fpath)
    conn.execute('DELETE FROM plans WHERE id = ?', (pid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/plans/<int:pid>/file')
@api_role_required('owner', 'admin', 'project_manager')
def api_plans_file(pid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM plans WHERE id = ?', (pid,)).fetchone()
    conn.close()
    if not row or not row['file_path']:
        return 'Not found', 404
    fpath = os.path.join(PLANS_DIR, row['file_path'])
    if not os.path.exists(fpath):
        return 'File not found', 404
    return send_file(fpath, mimetype='application/pdf')


@app.route('/api/plans/<int:pid>/review', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_plans_review(pid):
    """AI HVAC review of construction plans PDF."""
    conn = get_db()
    plan = conn.execute('SELECT * FROM plans WHERE id = ?', (pid,)).fetchone()
    if not plan:
        conn.close()
        return jsonify({'error': 'Plan not found'}), 404

    # Mark as reviewing
    conn.execute("UPDATE plans SET status='Reviewing', updated_at=datetime('now','localtime') WHERE id=?", (pid,))
    conn.commit()

    # Extract PDF text
    pdf_text = ''
    page_count = 0
    if plan['file_path']:
        fpath = os.path.join(PLANS_DIR, plan['file_path'])
        if os.path.exists(fpath):
            try:
                import pdfplumber
                with pdfplumber.open(fpath) as pdf:
                    page_count = len(pdf.pages)
                    for page in pdf.pages[:30]:
                        pdf_text += (page.extract_text() or '') + '\n'
            except ImportError:
                pdf_text = '[PDF text extraction unavailable - install pdfplumber]'
            except Exception as e:
                pdf_text = f'[Error extracting PDF text: {str(e)}]'

    if not pdf_text or pdf_text.startswith('['):
        conn.execute("UPDATE plans SET status='Uploaded', updated_at=datetime('now','localtime') WHERE id=?", (pid,))
        conn.commit()
        conn.close()
        error_msg = pdf_text if pdf_text.startswith('[') else 'No text could be extracted from this PDF. The file may be image-based (scanned plans).'
        return jsonify({'error': error_msg}), 400

    text_lower = pdf_text.lower()

    findings = []
    concerns = []
    recommendations = []
    equipment_found = []
    duct_sizes = []
    ventilation = {"cfm_total": 0, "exhaust_fans": 0, "notes": ""}

    # ── 1. Equipment Schedule Detection ──
    import re

    # Tonnage patterns
    tonnage_pattern = re.compile(r'(\d\.?\d?)\s*(?:ton|tn)\b', re.IGNORECASE)
    tonnage_matches = tonnage_pattern.findall(pdf_text)
    if tonnage_matches:
        for t in set(tonnage_matches):
            equipment_found.append({"description": f"{t} Ton unit", "location": "Plan text", "notes": ""})
        findings.append({"type": "ok", "category": "Equipment", "message": f"Found tonnage references: {', '.join(set(t + 'T' for t in tonnage_matches))}"})
    else:
        findings.append({"type": "warning", "category": "Equipment", "message": "No tonnage values detected in plan text"})
        concerns.append("No equipment tonnage found — verify equipment schedule exists")

    # Model numbers (common HVAC patterns)
    model_patterns = [
        re.compile(r'\b([A-Z]{2,4}[\-]?\d{2,5}[A-Z]?\d{0,4}[A-Z]{0,3})\b'),  # Generic: AB-12345
        re.compile(r'\b((?:GSX|GSZ|AVPTC|GMVC|GMEC|ASPT|AMST|CBA|4TTR|TWA|TEM|TUD|TUH|FEM|WCA)\d[\w\-]*)\b', re.IGNORECASE),  # Trane/Goodman/etc
    ]
    models_found = set()
    for mp in model_patterns:
        for m in mp.findall(pdf_text):
            if len(m) >= 6:
                models_found.add(m)
    if models_found:
        for m in list(models_found)[:10]:
            equipment_found.append({"description": f"Model: {m}", "location": "Plan text", "notes": ""})
        findings.append({"type": "info", "category": "Equipment", "message": f"Found {len(models_found)} potential model number(s)"})

    # BTU ratings
    btu_pattern = re.compile(r'(\d{2,3}[,.]?\d{0,3})\s*(?:btu|btuh)', re.IGNORECASE)
    btu_matches = btu_pattern.findall(pdf_text)
    if btu_matches:
        findings.append({"type": "ok", "category": "Equipment", "message": f"Found BTU ratings: {', '.join(set(btu_matches[:5]))}"})

    # SEER/EER
    seer_pattern = re.compile(r'(\d{1,2}\.?\d?)\s*(?:seer|eer)\b', re.IGNORECASE)
    seer_matches = seer_pattern.findall(pdf_text)
    if seer_matches:
        for s in set(seer_matches):
            val = float(s)
            if val < 14:
                findings.append({"type": "warning", "category": "Equipment", "message": f"SEER {s} — below current minimum efficiency standard (14 SEER)"})
                concerns.append(f"SEER {s} may not meet current code minimum")
            else:
                findings.append({"type": "ok", "category": "Equipment", "message": f"SEER {s} meets minimum efficiency requirements"})

    # Air handler specs
    ah_pattern = re.compile(r'air\s*handler|AHU|fan\s*coil|evaporator\s*coil', re.IGNORECASE)
    ah_matches = ah_pattern.findall(pdf_text)
    if ah_matches:
        findings.append({"type": "info", "category": "Equipment", "message": f"Air handler/fan coil references found ({len(ah_matches)} mentions)"})

    # ── 2. Duct Sizing ──
    # Rectangular ducts
    rect_duct = re.compile(r'(\d{1,2})\s*[xX]\s*(\d{1,2})(?:\s*(?:duct|supply|return))?')
    rect_matches = rect_duct.findall(pdf_text)
    rect_sizes = {}
    for w, h in rect_matches:
        size = f"{w}x{h}"
        rect_sizes[size] = rect_sizes.get(size, 0) + 1
    for size, count in rect_sizes.items():
        duct_sizes.append({"size": size, "location": "Rectangular duct", "count": count})

    # Round ducts
    round_duct = re.compile(r'(\d{1,2})[\"\u2033]?\s*(?:round|rd|dia|diameter|flex)', re.IGNORECASE)
    round_matches = round_duct.findall(pdf_text)
    round_sizes = {}
    for d in round_matches:
        size = f'{d}" round'
        round_sizes[size] = round_sizes.get(size, 0) + 1
    for size, count in round_sizes.items():
        duct_sizes.append({"size": size, "location": "Round/flex duct", "count": count})

    if duct_sizes:
        findings.append({"type": "ok", "category": "Duct Sizing", "message": f"Found {len(duct_sizes)} distinct duct size(s)"})
        # Flag potentially undersized ducts for larger tonnage
        if tonnage_matches:
            max_ton = max(float(t) for t in tonnage_matches)
            for ds in duct_sizes:
                if 'round' in ds['size'].lower():
                    dia = int(ds['size'].split('"')[0])
                    if max_ton >= 2 and dia <= 6:
                        findings.append({"type": "warning", "category": "Duct Sizing", "message": f'{ds["size"]} on {max_ton}T unit may restrict airflow'})
                        concerns.append(f'{ds["size"]} flex on {max_ton}-ton unit may be undersized')
    else:
        findings.append({"type": "info", "category": "Duct Sizing", "message": "No duct dimensions detected — plan may be image-based or duct layout on separate sheet"})

    # ── 3. Ventilation / Exhaust ──
    cfm_pattern = re.compile(r'(\d{2,5})\s*(?:cfm|CFM)')
    cfm_matches = cfm_pattern.findall(pdf_text)
    if cfm_matches:
        cfm_values = [int(c) for c in cfm_matches]
        ventilation["cfm_total"] = sum(cfm_values)
        findings.append({"type": "ok", "category": "Ventilation", "message": f"CFM values found: {', '.join(cfm_matches[:8])} (total: {sum(cfm_values)} CFM)"})
    else:
        findings.append({"type": "info", "category": "Ventilation", "message": "No CFM values detected in plan text"})

    exhaust_pattern = re.compile(r'exhaust\s*fan|EF[\-\s]?\d', re.IGNORECASE)
    exhaust_matches = exhaust_pattern.findall(pdf_text)
    if exhaust_matches:
        ventilation["exhaust_fans"] = len(exhaust_matches)
        findings.append({"type": "ok", "category": "Ventilation", "message": f"Found {len(exhaust_matches)} exhaust fan reference(s)"})

    fresh_air = re.compile(r'fresh\s*air|outside\s*air|OA\s*duct|ventilation\s*air|make[\-\s]?up\s*air', re.IGNORECASE)
    if fresh_air.search(pdf_text):
        findings.append({"type": "ok", "category": "Ventilation", "message": "Fresh air / outside air requirements referenced"})
    else:
        findings.append({"type": "warning", "category": "Ventilation", "message": "No fresh air / outside air requirements found"})
        recommendations.append("Verify fresh air / ventilation requirements per IMC Section 401")

    # ── 4. Refrigerant Lines ──
    lineset_pattern = re.compile(r'(\d\/\d{1,2})[\"\u2033]?\s*(?:line|suction|liquid|lineset|line\s*set)', re.IGNORECASE)
    lineset_matches = lineset_pattern.findall(pdf_text)
    if lineset_matches:
        findings.append({"type": "ok", "category": "Refrigerant Lines", "message": f"Line set sizes found: {', '.join(set(lineset_matches))}"})
    else:
        findings.append({"type": "info", "category": "Refrigerant Lines", "message": "No line set sizes specified in plan text"})
        recommendations.append("Verify refrigerant line set sizes match equipment specifications")

    insulation_ref = re.compile(r'insulat|armaflex|rubatex', re.IGNORECASE)
    if insulation_ref.search(pdf_text):
        findings.append({"type": "ok", "category": "Refrigerant Lines", "message": "Line insulation requirements referenced"})
    else:
        findings.append({"type": "info", "category": "Refrigerant Lines", "message": "No insulation requirements found for refrigerant lines"})

    # ── 5. Electrical ──
    disconnect_pattern = re.compile(r'(\d{2,3})\s*(?:amp|A)\s*(?:disconnect|disc|DS)', re.IGNORECASE)
    disc_matches = disconnect_pattern.findall(pdf_text)
    if disc_matches:
        findings.append({"type": "ok", "category": "Electrical", "message": f"Disconnect sizes found: {', '.join(set(d + 'A' for d in disc_matches))}"})
    else:
        findings.append({"type": "warning", "category": "Electrical", "message": "No disconnect sizes specified"})
        concerns.append("No disconnect size specified — verify electrical requirements")

    circuit_pattern = re.compile(r'(\d{1,3})\s*(?:amp|A)\s*(?:circuit|breaker|CB)', re.IGNORECASE)
    circuit_matches = circuit_pattern.findall(pdf_text)
    if circuit_matches:
        findings.append({"type": "ok", "category": "Electrical", "message": f"Circuit/breaker sizes: {', '.join(set(c + 'A' for c in circuit_matches))}"})

    wire_pattern = re.compile(r'(?:#?\d{1,2})\s*(?:AWG|gauge|ga)\b|\b(?:10|8|6|4|2)[\-\s](?:\d)\s*(?:romex|NM|wire)', re.IGNORECASE)
    wire_matches = wire_pattern.findall(pdf_text)
    if wire_matches:
        findings.append({"type": "info", "category": "Electrical", "message": f"Wire gauge references found ({len(wire_matches)} mentions)"})

    # ── 6. Code Compliance ──
    code_refs = [
        ('IMC', 'International Mechanical Code'),
        ('IRC', 'International Residential Code'),
        ('IECC', 'International Energy Conservation Code'),
        ('ASHRAE', 'ASHRAE Standard'),
        ('UMC', 'Uniform Mechanical Code'),
        ('NFPA', 'NFPA Standard'),
    ]
    for code, name in code_refs:
        if code.lower() in text_lower:
            findings.append({"type": "info", "category": "Code Compliance", "message": f"{name} ({code}) referenced in plans"})

    clearance_pattern = re.compile(r'clearance|setback|minimum\s*distance', re.IGNORECASE)
    if clearance_pattern.search(pdf_text):
        findings.append({"type": "ok", "category": "Code Compliance", "message": "Equipment clearance / setback requirements noted"})
    else:
        recommendations.append("Verify equipment clearances meet manufacturer and code requirements")

    combustion_pattern = re.compile(r'combustion\s*air|combustible\s*clearance', re.IGNORECASE)
    if combustion_pattern.search(pdf_text):
        findings.append({"type": "ok", "category": "Code Compliance", "message": "Combustion air requirements referenced"})

    # ── 7. Special Callouts ──
    if re.search(r'zon(?:e|ing)', text_lower):
        findings.append({"type": "info", "category": "Special", "message": "Zoning system referenced — verify zone damper and thermostat quantities"})
    if re.search(r'two[\-\s]?story|2[\-\s]?story|multi[\-\s]?level', text_lower):
        findings.append({"type": "info", "category": "Special", "message": "Multi-story building — verify duct routing and equipment placement per floor"})
    if re.search(r'corridor|common\s*area|hallway\s*system', text_lower):
        findings.append({"type": "info", "category": "Special", "message": "Corridor/common area system referenced"})
    if re.search(r'mini[\-\s]?split|ductless|VRF|VRV', text_lower):
        findings.append({"type": "info", "category": "Special", "message": "Mini split / ductless / VRF system referenced"})
    if re.search(r'multi[\-\s]?family|apartment|condo|unit\s*type', text_lower):
        findings.append({"type": "info", "category": "Special", "message": "Multi-family / apartment project — verify unit counts and types"})

    # Unit count detection
    unit_pattern = re.compile(r'(\d{1,4})\s*(?:units?|apartments?|condos?|suites?)', re.IGNORECASE)
    unit_matches = unit_pattern.findall(pdf_text)
    if unit_matches:
        max_units = max(int(u) for u in unit_matches)
        findings.append({"type": "info", "category": "Special", "message": f"Detected ~{max_units} units referenced in plans"})

    # ── 8. Missing Items ──
    if not tonnage_matches and not models_found and not btu_matches:
        concerns.append("No equipment schedule detected — plans may be missing HVAC equipment specifications")
        findings.append({"type": "warning", "category": "Missing Items", "message": "No equipment schedule found"})
    if not duct_sizes:
        findings.append({"type": "warning", "category": "Missing Items", "message": "No duct layout / sizing found in text"})
    if not re.search(r'thermostat|t[\-\s]?stat', text_lower):
        concerns.append("No thermostat locations specified")
        findings.append({"type": "warning", "category": "Missing Items", "message": "No thermostat locations specified"})
    if not re.search(r'condensate|drain\s*line|p[\-\s]?trap', text_lower):
        recommendations.append("Verify condensate drain routing and trap locations")

    # ── Risk Assessment ──
    risk_score = len(concerns)
    if risk_score == 0:
        risk_level = 'Low'
    elif risk_score <= 3:
        risk_level = 'Medium'
    else:
        risk_level = 'High'

    # ── Summary ──
    summary_parts = []
    summary_parts.append(f"{plan['plan_type']} plan \"{plan['title']}\"")
    summary_parts.append(f"{page_count} page(s)")
    if equipment_found:
        summary_parts.append(f"{len(equipment_found)} equipment item(s) detected")
    if duct_sizes:
        summary_parts.append(f"{len(duct_sizes)} duct size(s) found")
    if concerns:
        summary_parts.append(f"{len(concerns)} concern(s)")
    else:
        summary_parts.append("no major concerns")

    review = {
        "reviewed_at": datetime.now().strftime('%Y-%m-%d %H:%M'),
        "page_count": page_count,
        "summary": ' — '.join(summary_parts) + '.',
        "risk_level": risk_level,
        "equipment_found": equipment_found,
        "duct_sizes": duct_sizes,
        "ventilation": ventilation,
        "concerns": concerns,
        "recommendations": recommendations,
        "findings": findings,
    }

    # Save review
    conn.execute(
        "UPDATE plans SET ai_review=?, status='Reviewed', page_count=?, updated_at=datetime('now','localtime') WHERE id=?",
        (json.dumps(review), page_count, pid)
    )
    conn.commit()
    conn.close()
    return jsonify(review)


@app.route('/api/plans/<int:pid>/takeoff', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_plans_takeoff(pid):
    """Generate material takeoff from plan review data."""
    conn = get_db()
    plan = conn.execute('SELECT * FROM plans WHERE id = ?', (pid,)).fetchone()
    if not plan:
        conn.close()
        return jsonify({'error': 'Plan not found'}), 404

    # Parse existing review to pre-fill quantities
    review_data = {}
    if plan['ai_review']:
        try:
            review_data = json.loads(plan['ai_review'])
        except (json.JSONDecodeError, TypeError):
            pass

    # Parse any existing takeoff data (user may have saved quantities)
    existing_takeoff = {}
    if plan['takeoff_data']:
        try:
            existing_takeoff = json.loads(plan['takeoff_data'])
        except (json.JSONDecodeError, TypeError):
            pass

    # Build takeoff from template
    import copy
    takeoff = copy.deepcopy(TAKEOFF_TEMPLATE)

    # If existing takeoff has saved quantities, restore them
    existing_items = {}
    if existing_takeoff.get('sections'):
        for sec in existing_takeoff['sections']:
            for item in sec.get('items', []):
                key = f"{sec['name']}|{item['part']}"
                existing_items[key] = item

    # Pre-fill from AI review if available
    detected_tonnages = set()
    detected_unit_count = 0
    if review_data:
        for eq in review_data.get('equipment_found', []):
            desc = eq.get('description', '').lower()
            # Extract tonnage
            import re
            ton_match = re.search(r'(\d\.?\d?)\s*ton', desc)
            if ton_match:
                detected_tonnages.add(float(ton_match.group(1)))
        # Detect unit count
        for f in review_data.get('findings', []):
            msg = f.get('message', '').lower()
            unit_match = re.search(r'~?(\d+)\s*units?', msg)
            if unit_match:
                detected_unit_count = max(detected_unit_count, int(unit_match.group(1)))

    for section in takeoff['sections']:
        for item in section['items']:
            key = f"{section['name']}|{item['part']}"
            if key in existing_items:
                item['quantity'] = existing_items[key].get('quantity', 0)
                item['use'] = existing_items[key].get('use', item['default_use'])
            else:
                item['quantity'] = 0
                item['use'] = item['default_use']

                # Auto-fill equipment quantities from review
                if section['name'] == 'Equipment' and detected_tonnages:
                    part_lower = item['part'].lower()
                    for t in detected_tonnages:
                        ton_str = str(t) if t != int(t) else str(int(t))
                        if f"{ton_str} ton" in part_lower and ('air handler' in part_lower or 'condenser' in part_lower):
                            item['use'] = True
                            if detected_unit_count > 0:
                                item['quantity'] = detected_unit_count

            # Calculate item total
            qty = item['quantity']
            waste = qty * takeoff['waste_factor'] if item['use'] and qty > 0 else 0
            item['total_with_waste'] = round((qty + waste) * item['price'], 2) if item['use'] else 0

    # Calculate summary totals
    subtotal = sum(
        item['total_with_waste']
        for section in takeoff['sections']
        for item in section['items']
        if item['use']
    )
    tax = round(subtotal * takeoff['tax_rate'], 2)

    takeoff['summary'] = {
        'subtotal': round(subtotal, 2),
        'tax_rate': takeoff['tax_rate'],
        'tax': tax,
        'grand_total': round(subtotal + tax, 2),
        'detected_tonnages': sorted(detected_tonnages),
        'detected_unit_count': detected_unit_count,
    }
    takeoff['generated_at'] = datetime.now().strftime('%Y-%m-%d %H:%M')

    # Save takeoff data
    new_status = 'Takeoff Complete' if plan['status'] == 'Reviewed' else plan['status']
    conn.execute(
        "UPDATE plans SET takeoff_data=?, status=?, updated_at=datetime('now','localtime') WHERE id=?",
        (json.dumps(takeoff), new_status, pid)
    )
    conn.commit()
    conn.close()
    return jsonify(takeoff)


# ─── Supplier Quotes (Phase 2) ──────────────────────────────────

SUPPLIER_QUOTES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'supplier_quotes')
os.makedirs(SUPPLIER_QUOTES_DIR, exist_ok=True)

@app.route('/supplier-quotes')
@role_required('owner', 'admin', 'project_manager')
def supplier_quotes_list():
    return render_template('supplier_quotes/list.html')

@app.route('/supplier-quotes/compare')
@role_required('owner', 'admin', 'project_manager')
def supplier_quotes_compare():
    return render_template('supplier_quotes/compare.html')

@app.route('/supplier-quotes/<int:qid>')
@role_required('owner', 'admin', 'project_manager')
def supplier_quotes_detail(qid):
    return render_template('supplier_quotes/detail.html', quote_id=qid)

@app.route('/api/supplier-quotes')
@api_role_required('owner', 'admin', 'project_manager')
def api_supplier_quotes():
    job_id = request.args.get('job_id', '')
    status = request.args.get('status', '')
    supplier = request.args.get('supplier', '')
    conn = get_db()
    query = '''SELECT sq.*, j.name as job_name FROM supplier_quotes sq
               LEFT JOIN jobs j ON sq.job_id = j.id WHERE 1=1'''
    params = []
    if job_id:
        query += ' AND sq.job_id = ?'
        params.append(job_id)
    if status:
        query += ' AND sq.status = ?'
        params.append(status)
    if supplier:
        query += ' AND sq.supplier_name LIKE ?'
        params.append(f'%{supplier}%')
    query += ' ORDER BY sq.updated_at DESC'
    quotes = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(q) for q in quotes])

@app.route('/api/supplier-quotes', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_create_supplier_quote():
    conn = get_db()
    if request.content_type and 'multipart' in request.content_type:
        data = request.form
        file = request.files.get('file')
        file_path = ''
        file_hash = ''
        if file and file.filename:
            from werkzeug.utils import secure_filename
            content = file.read()
            file_hash = hashlib.md5(content).hexdigest()
            fname = secure_filename(file.filename)
            fname = f"{int(datetime.now().timestamp())}_{fname}"
            file.seek(0)
            file.save(os.path.join(SUPPLIER_QUOTES_DIR, fname))
            file_path = fname
        cursor = conn.execute(
            '''INSERT INTO supplier_quotes (job_id, plan_id, supplier_name, supplier_config_id,
               quote_number, quote_date, expiration_date, status, notes, file_path, file_hash, created_by)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)''',
            (data.get('job_id'), data.get('plan_id'), data.get('supplier_name', ''),
             data.get('supplier_config_id'), data.get('quote_number', ''),
             data.get('quote_date', ''), data.get('expiration_date', ''),
             data.get('status', 'Received'), data.get('notes', ''),
             file_path, file_hash, session.get('user_id'))
        )
    else:
        data = request.get_json()
        cursor = conn.execute(
            '''INSERT INTO supplier_quotes (job_id, plan_id, supplier_name, supplier_config_id,
               quote_number, quote_date, expiration_date, status, notes, created_by)
               VALUES (?,?,?,?,?,?,?,?,?,?)''',
            (data.get('job_id'), data.get('plan_id'), data.get('supplier_name', ''),
             data.get('supplier_config_id'), data.get('quote_number', ''),
             data.get('quote_date', ''), data.get('expiration_date', ''),
             data.get('status', 'Requested'), data.get('notes', ''), session.get('user_id'))
        )
    qid = cursor.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': qid}), 201

@app.route('/api/supplier-quotes/<int:qid>')
@api_role_required('owner', 'admin', 'project_manager')
def api_supplier_quote_detail(qid):
    conn = get_db()
    q = conn.execute(
        '''SELECT sq.*, j.name as job_name FROM supplier_quotes sq
           LEFT JOIN jobs j ON sq.job_id = j.id WHERE sq.id = ?''', (qid,)
    ).fetchone()
    if not q:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    items = conn.execute('SELECT * FROM supplier_quote_items WHERE quote_id = ? ORDER BY line_number', (qid,)).fetchall()
    conn.close()
    result = dict(q)
    result['items'] = [dict(i) for i in items]
    return jsonify(result)

@app.route('/api/supplier-quotes/<int:qid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager')
def api_update_supplier_quote(qid):
    data = request.get_json()
    conn = get_db()
    conn.execute(
        '''UPDATE supplier_quotes SET supplier_name=?, quote_number=?, quote_date=?,
           expiration_date=?, status=?, subtotal=?, tax_amount=?, freight=?, total=?,
           notes=?, file_path=?, updated_at=datetime('now','localtime') WHERE id=?''',
        (data.get('supplier_name',''), data.get('quote_number',''), data.get('quote_date',''),
         data.get('expiration_date',''), data.get('status','Requested'),
         float(data.get('subtotal',0) or 0), float(data.get('tax_amount',0) or 0),
         float(data.get('freight',0) or 0), float(data.get('total',0) or 0),
         data.get('notes',''), data.get('file_path',''), qid)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/supplier-quotes/<int:qid>/items', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_save_supplier_quote_items(qid):
    data = request.get_json()
    items = data.get('items', [])
    conn = get_db()
    conn.execute('DELETE FROM supplier_quote_items WHERE quote_id = ?', (qid,))
    subtotal = 0
    for i, item in enumerate(items):
        ext = float(item.get('quantity',0) or 0) * float(item.get('unit_price',0) or 0)
        conn.execute(
            '''INSERT INTO supplier_quote_items (quote_id, line_number, sku, description,
               quantity, unit_price, extended_price, takeoff_sku, notes)
               VALUES (?,?,?,?,?,?,?,?,?)''',
            (qid, i+1, item.get('sku',''), item.get('description',''),
             float(item.get('quantity',0) or 0), float(item.get('unit_price',0) or 0),
             ext, item.get('takeoff_sku',''), item.get('notes',''))
        )
        subtotal += ext
    conn.execute('UPDATE supplier_quotes SET subtotal=?, updated_at=datetime("now","localtime") WHERE id=?', (subtotal, qid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'subtotal': subtotal})

@app.route('/api/supplier-quotes/<int:qid>/upload', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_upload_supplier_quote_file(qid):
    file = request.files.get('file')
    if not file or not file.filename:
        return jsonify({'error': 'No file uploaded'}), 400
    from werkzeug.utils import secure_filename
    content = file.read()
    file_hash = hashlib.md5(content).hexdigest()
    fname = secure_filename(file.filename)
    fname = f"{int(datetime.now().timestamp())}_{fname}"
    file.seek(0)
    file.save(os.path.join(SUPPLIER_QUOTES_DIR, fname))
    conn = get_db()
    conn.execute("UPDATE supplier_quotes SET file_path=?, file_hash=?, updated_at=datetime('now','localtime') WHERE id=?", (fname, file_hash, qid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'file_path': fname})

@app.route('/api/supplier-quotes/<int:qid>/file')
@api_role_required('owner', 'admin', 'project_manager')
def api_supplier_quote_file(qid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM supplier_quotes WHERE id = ?', (qid,)).fetchone()
    conn.close()
    if not row or not row['file_path']:
        return jsonify({'error': 'No file'}), 404
    fpath = os.path.join(SUPPLIER_QUOTES_DIR, row['file_path'])
    if not os.path.exists(fpath):
        return jsonify({'error': 'File not found'}), 404
    return send_file(fpath)

@app.route('/api/supplier-quotes/<int:qid>/select', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_select_supplier_quote(qid):
    conn = get_db()
    q = conn.execute('SELECT job_id FROM supplier_quotes WHERE id = ?', (qid,)).fetchone()
    if not q:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    conn.execute('UPDATE supplier_quotes SET is_baseline = 0 WHERE job_id = ?', (q['job_id'],))
    conn.execute("UPDATE supplier_quotes SET is_baseline = 1, status = 'Selected', updated_at=datetime('now','localtime') WHERE id = ?", (qid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/supplier-quotes/compare')
@api_role_required('owner', 'admin', 'project_manager')
def api_supplier_quote_compare():
    job_id = request.args.get('job_id')
    if not job_id:
        return jsonify({'error': 'job_id required'}), 400
    conn = get_db()
    quotes = conn.execute(
        "SELECT * FROM supplier_quotes WHERE job_id = ? AND status IN ('Received','Reviewing','Selected') ORDER BY supplier_name",
        (job_id,)
    ).fetchall()
    result = []
    for q in quotes:
        items = conn.execute('SELECT * FROM supplier_quote_items WHERE quote_id = ? ORDER BY line_number', (q['id'],)).fetchall()
        d = dict(q)
        d['items'] = [dict(i) for i in items]
        result.append(d)
    conn.close()
    return jsonify(result)

@app.route('/api/supplier-quotes/<int:qid>', methods=['DELETE'])
@api_role_required('owner', 'admin', 'project_manager')
def api_delete_supplier_quote(qid):
    conn = get_db()
    row = conn.execute('SELECT file_path FROM supplier_quotes WHERE id = ?', (qid,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    if row['file_path']:
        fpath = os.path.join(SUPPLIER_QUOTES_DIR, row['file_path'])
        if os.path.exists(fpath):
            os.remove(fpath)
    conn.execute('DELETE FROM supplier_quotes WHERE id = ?', (qid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/supplier-quotes/<int:qid>/parse', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_parse_supplier_quote(qid):
    """Parse line items from a Locke Supply PDF quote using pdfplumber."""
    conn = get_db()
    q = conn.execute('SELECT file_path, supplier_name FROM supplier_quotes WHERE id = ?', (qid,)).fetchone()
    if not q or not q['file_path']:
        conn.close()
        return jsonify({'error': 'No PDF file found for this quote'}), 404
    fpath = os.path.join(SUPPLIER_QUOTES_DIR, q['file_path'])
    if not os.path.exists(fpath):
        conn.close()
        return jsonify({'error': 'PDF file not found on disk'}), 404
    try:
        import pdfplumber
        import re
        items = []
        # Locke Supply PDFs: last table on each page has line items in a single cell
        # Format: "LineNo SKU [- Reference] Qty BO Shipped UM UnitPrice ExtPrice\nDescription..."
        # The end pattern (qty BO shipped UM price amount) is consistent
        line_header_pattern = re.compile(
            r'^(\d+)\s+(.+?)\s+(\d[\d,]*)\s+\d+\s+\d+\s+\w+\s+([\d,.]+)\s+([\d,.]+)\s*$'
        )
        with pdfplumber.open(fpath) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                if not tables:
                    continue
                # Last table contains the line items
                last_table = tables[-1]
                for row in last_table:
                    if not row:
                        continue
                    # All item data is in the first cell
                    cell = str(row[0] or '')
                    if not cell.strip():
                        continue
                    # Split cell into lines and parse each item block
                    lines = cell.split('\n')
                    i = 0
                    while i < len(lines):
                        m = line_header_pattern.match(lines[i].strip())
                        if m:
                            line_no = int(m.group(1))
                            sku_ref = m.group(2).strip()
                            # Split SKU from reference (e.g. "PTC073J35AXXX PNFE647695" or "MECHANICAL SALES")
                            sku_parts = sku_ref.split()
                            sku = sku_parts[0] if sku_parts else sku_ref
                            # Remove trailing dash/reference
                            if ' - ' in sku_ref:
                                sku = sku_ref.split(' - ')[0].strip()
                            qty = float(m.group(3).replace(',', ''))
                            unit_price = float(m.group(4).replace(',', ''))
                            ext_price = float(m.group(5).replace(',', ''))
                            # Next line(s) are description until another line item or end
                            desc_parts = []
                            i += 1
                            while i < len(lines):
                                next_line = lines[i].strip()
                                if line_header_pattern.match(next_line):
                                    break
                                if next_line and not next_line.startswith('***'):
                                    desc_parts.append(next_line)
                                i += 1
                            desc = desc_parts[0] if desc_parts else sku
                            items.append({
                                'line_number': line_no, 'sku': sku,
                                'description': desc[:200],
                                'quantity': qty, 'unit_price': unit_price,
                                'extended_price': ext_price
                            })
                        else:
                            i += 1
        # Save parsed items
        conn.execute('DELETE FROM supplier_quote_items WHERE quote_id = ?', (qid,))
        subtotal = 0
        for item in items:
            conn.execute(
                '''INSERT INTO supplier_quote_items (quote_id, line_number, sku, description,
                   quantity, unit_price, extended_price) VALUES (?,?,?,?,?,?,?)''',
                (qid, item['line_number'], item['sku'], item['description'],
                 item['quantity'], item['unit_price'], item['extended_price'])
            )
            subtotal += item['extended_price']
        conn.execute(
            "UPDATE supplier_quotes SET subtotal=?, updated_at=datetime('now','localtime') WHERE id=?",
            (subtotal, qid)
        )
        conn.commit()
        conn.close()
        return jsonify({'ok': True, 'items_parsed': len(items), 'subtotal': subtotal})
    except ImportError:
        conn.close()
        return jsonify({'error': 'pdfplumber not installed'}), 500
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500


# ─── Inventory (Phase 3) ────────────────────────────────────────

@app.route('/inventory')
@role_required('owner', 'admin', 'project_manager', 'warehouse')
def inventory_list():
    return render_template('inventory/list.html')

@app.route('/inventory/<int:iid>')
@role_required('owner', 'admin', 'project_manager', 'warehouse')
def inventory_detail(iid):
    return render_template('inventory/detail.html', item_id=iid)

@app.route('/api/inventory')
@api_role_required('owner', 'admin', 'project_manager', 'warehouse')
def api_inventory():
    search = request.args.get('q', '').strip()
    category = request.args.get('category', '')
    conn = get_db()
    query = 'SELECT * FROM inventory_items WHERE 1=1'
    params = []
    if search:
        query += ' AND (sku LIKE ? OR description LIKE ?)'
        params.extend([f'%{search}%', f'%{search}%'])
    if category:
        query += ' AND category = ?'
        params.append(category)
    query += ' ORDER BY description'
    items = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(i) for i in items])

@app.route('/api/inventory', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager', 'warehouse')
def api_create_inventory_item():
    data = request.get_json()
    conn = get_db()
    cursor = conn.execute(
        '''INSERT INTO inventory_items (sku, description, category, quantity_on_hand, unit,
           location, reorder_point, notes, created_by)
           VALUES (?,?,?,?,?,?,?,?,?)''',
        (data.get('sku',''), data.get('description',''), data.get('category',''),
         float(data.get('quantity_on_hand',0) or 0), data.get('unit','each'),
         data.get('location','Warehouse'), float(data.get('reorder_point',0) or 0),
         data.get('notes',''), session.get('user_id'))
    )
    iid = cursor.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': iid}), 201

@app.route('/api/inventory/<int:iid>')
@api_role_required('owner', 'admin', 'project_manager', 'warehouse')
def api_inventory_detail(iid):
    conn = get_db()
    item = conn.execute('SELECT * FROM inventory_items WHERE id = ?', (iid,)).fetchone()
    if not item:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    transactions = conn.execute(
        '''SELECT it.*, j.name as job_name, u.display_name as user_name
           FROM inventory_transactions it
           LEFT JOIN jobs j ON it.job_id = j.id
           LEFT JOIN users u ON it.created_by = u.id
           WHERE it.inventory_item_id = ? ORDER BY it.created_at DESC LIMIT 100''', (iid,)
    ).fetchall()
    conn.close()
    result = dict(item)
    result['transactions'] = [dict(t) for t in transactions]
    return jsonify(result)

@app.route('/api/inventory/<int:iid>', methods=['PUT'])
@api_role_required('owner', 'admin', 'project_manager', 'warehouse')
def api_update_inventory_item(iid):
    data = request.get_json()
    conn = get_db()
    conn.execute(
        '''UPDATE inventory_items SET sku=?, description=?, category=?, unit=?,
           location=?, reorder_point=?, notes=?, updated_at=datetime('now','localtime') WHERE id=?''',
        (data.get('sku',''), data.get('description',''), data.get('category',''),
         data.get('unit','each'), data.get('location','Warehouse'),
         float(data.get('reorder_point',0) or 0), data.get('notes',''), iid)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/inventory/<int:iid>/adjust', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager', 'warehouse')
def api_inventory_adjust(iid):
    data = request.get_json()
    ttype = data.get('transaction_type', 'adjust')
    qty = float(data.get('quantity', 0) or 0)
    if qty == 0:
        return jsonify({'error': 'Quantity required'}), 400
    conn = get_db()
    conn.execute(
        '''INSERT INTO inventory_transactions (inventory_item_id, transaction_type, quantity,
           job_id, reference, notes, created_by) VALUES (?,?,?,?,?,?,?)''',
        (iid, ttype, qty, data.get('job_id') or None, data.get('reference',''),
         data.get('notes',''), session.get('user_id'))
    )
    if ttype in ('receive', 'return'):
        conn.execute('UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + ?, updated_at=datetime("now","localtime") WHERE id=?', (abs(qty), iid))
    elif ttype == 'issue':
        conn.execute('UPDATE inventory_items SET quantity_on_hand = MAX(0, quantity_on_hand - ?), updated_at=datetime("now","localtime") WHERE id=?', (abs(qty), iid))
    elif ttype == 'adjust':
        conn.execute('UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + ?, updated_at=datetime("now","localtime") WHERE id=?', (qty, iid))
    elif ttype == 'count':
        conn.execute('UPDATE inventory_items SET quantity_on_hand = ?, last_count_date=date("now","localtime"), updated_at=datetime("now","localtime") WHERE id=?', (abs(qty), iid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/inventory/count', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager', 'warehouse')
def api_inventory_bulk_count():
    data = request.get_json()
    counts = data.get('counts', [])
    conn = get_db()
    for c in counts:
        iid = c.get('id')
        qty = float(c.get('quantity', 0) or 0)
        conn.execute(
            '''INSERT INTO inventory_transactions (inventory_item_id, transaction_type, quantity, notes, created_by)
               VALUES (?,?,?,?,?)''',
            (iid, 'count', qty, 'Physical count', session.get('user_id'))
        )
        conn.execute(
            'UPDATE inventory_items SET quantity_on_hand=?, last_count_date=date("now","localtime"), updated_at=datetime("now","localtime") WHERE id=?',
            (qty, iid)
        )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/inventory/check-availability')
@api_role_required('owner', 'admin', 'project_manager', 'warehouse')
def api_inventory_check_availability():
    job_id = request.args.get('job_id')
    if not job_id:
        return jsonify({'error': 'job_id required'}), 400
    conn = get_db()
    plan = conn.execute("SELECT takeoff_data FROM plans WHERE job_id = ? AND status = 'Takeoff Complete' ORDER BY updated_at DESC LIMIT 1", (job_id,)).fetchone()
    if not plan or not plan['takeoff_data']:
        conn.close()
        return jsonify({'error': 'No takeoff data found'}), 404
    import json as _json
    takeoff = _json.loads(plan['takeoff_data']) if isinstance(plan['takeoff_data'], str) else plan['takeoff_data']
    result = []
    for item in takeoff:
        sku = item.get('sku', '')
        needed = float(item.get('quantity', 0) or 0)
        inv = conn.execute('SELECT quantity_on_hand FROM inventory_items WHERE sku = ?', (sku,)).fetchone()
        in_stock = inv['quantity_on_hand'] if inv else 0
        result.append({
            'sku': sku, 'description': item.get('description', ''),
            'needed': needed, 'in_stock': in_stock,
            'to_order': max(0, needed - in_stock)
        })
    conn.close()
    return jsonify(result)


# ─── Phase 5: Invoices & Duplicate Detection ─────────────────────

@app.route('/invoices')
@login_required
def invoices_page():
    return render_template('invoices/list.html')

@app.route('/api/invoices')
@api_login_required
def api_list_invoices():
    conn = get_db()
    rows = conn.execute('''
        SELECT si.*, bc.supplier_name,
               j.name as job_name,
               sq.quote_number as matched_quote_number,
               sq.id as supplier_quote_id
        FROM supplier_invoices si
        LEFT JOIN billtrust_config bc ON si.supplier_config_id = bc.id
        LEFT JOIN jobs j ON si.job_id = j.id
        LEFT JOIN supplier_quotes sq ON si.supplier_quote_id = sq.id
        ORDER BY si.invoice_date DESC
    ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/invoices/<int:iid>')
@api_login_required
def api_get_invoice(iid):
    conn = get_db()
    inv = conn.execute('''
        SELECT si.*, bc.supplier_name,
               j.name as job_name
        FROM supplier_invoices si
        LEFT JOIN billtrust_config bc ON si.supplier_config_id = bc.id
        LEFT JOIN jobs j ON si.job_id = j.id
        WHERE si.id = ?
    ''', (iid,)).fetchone()
    if not inv:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    result = dict(inv)
    # Get line items if they exist
    items = conn.execute('''
        SELECT * FROM supplier_invoice_items WHERE invoice_id = ?
        ORDER BY line_number
    ''', (iid,)).fetchall()
    result['items'] = [dict(i) for i in items]
    conn.close()
    return jsonify(result)

@app.route('/api/invoices/duplicates')
@api_login_required
def api_list_duplicate_invoices():
    conn = get_db()
    rows = conn.execute('''
        SELECT si.*, bc.supplier_name, j.name as job_name
        FROM supplier_invoices si
        LEFT JOIN billtrust_config bc ON si.supplier_config_id = bc.id
        LEFT JOIN jobs j ON si.job_id = j.id
        WHERE si.is_duplicate = 1
        ORDER BY si.invoice_date DESC
    ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/invoices/<int:iid>/resolve-duplicate', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_resolve_duplicate(iid):
    data = request.get_json() or {}
    action = data.get('action', 'dismiss')  # 'dismiss' or 'confirm'
    conn = get_db()
    if action == 'dismiss':
        conn.execute('UPDATE supplier_invoices SET is_duplicate = 0, duplicate_of_id = NULL WHERE id = ?', (iid,))
    elif action == 'confirm':
        # Mark as confirmed duplicate — could archive or delete
        conn.execute("UPDATE supplier_invoices SET status = 'void', notes = COALESCE(notes,'') || ' [Confirmed duplicate]' WHERE id = ?", (iid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/invoices/<int:iid>/match-quote', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_match_invoice_to_quote(iid):
    data = request.get_json() or {}
    quote_id = data.get('supplier_quote_id')
    if not quote_id:
        return jsonify({'error': 'supplier_quote_id required'}), 400
    conn = get_db()
    conn.execute('UPDATE supplier_invoices SET supplier_quote_id = ? WHERE id = ?', (quote_id, iid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/jobs/<int:job_id>/invoice-summary')
@api_login_required
def api_job_invoice_summary(job_id):
    conn = get_db()
    # Total invoiced
    inv_row = conn.execute('''
        SELECT COUNT(*) as count, COALESCE(SUM(total),0) as total_invoiced,
               COALESCE(SUM(balance_due),0) as total_balance
        FROM supplier_invoices WHERE job_id = ? AND is_duplicate = 0
    ''', (job_id,)).fetchone()
    # Total quoted (baseline)
    quote_row = conn.execute('''
        SELECT COALESCE(SUM(total),0) as total_quoted
        FROM supplier_quotes WHERE job_id = ? AND is_baseline = 1
    ''', (job_id,)).fetchone()
    total_invoiced = inv_row['total_invoiced']
    total_quoted = quote_row['total_quoted']
    variance = total_invoiced - total_quoted if total_quoted > 0 else 0
    conn.close()
    return jsonify({
        'invoice_count': inv_row['count'],
        'total_invoiced': total_invoiced,
        'total_balance': inv_row['total_balance'],
        'total_quoted': total_quoted,
        'variance': variance,
        'pct_of_quote': round((total_invoiced / total_quoted * 100), 1) if total_quoted > 0 else 0
    })

@app.route('/api/billtrust/sync-log')
@api_login_required
def api_billtrust_sync_log():
    conn = get_db()
    rows = conn.execute('''
        SELECT sl.*, bc.supplier_name
        FROM billtrust_sync_log sl
        LEFT JOIN billtrust_config bc ON sl.config_id = bc.id
        ORDER BY sl.created_at DESC LIMIT 50
    ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ─── Phase 6: Material Requests ──────────────────────────────────

@app.route('/material-requests')
@login_required
def material_requests_page():
    return render_template('material_requests/list.html')

@app.route('/api/material-requests')
@api_login_required
def api_list_material_requests():
    job_id = request.args.get('job_id')
    status = request.args.get('status')
    conn = get_db()
    sql = '''
        SELECT mr.*, j.name as job_name,
               u.display_name as requester_name
        FROM material_requests mr
        LEFT JOIN jobs j ON mr.job_id = j.id
        LEFT JOIN users u ON mr.requested_by = u.id
        WHERE 1=1
    '''
    params = []
    if job_id:
        sql += ' AND mr.job_id = ?'
        params.append(job_id)
    if status:
        sql += ' AND mr.status = ?'
        params.append(status)
    sql += ' ORDER BY mr.created_at DESC'
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/material-requests', methods=['POST'])
@api_login_required
def api_create_material_request():
    data = request.get_json() or {}
    job_id = data.get('job_id')
    if not job_id:
        return jsonify({'error': 'job_id required'}), 400
    conn = get_db()
    cursor = conn.execute('''
        INSERT INTO material_requests (job_id, requested_by, priority, needed_by, notes, status)
        VALUES (?, ?, ?, ?, ?, 'Pending')
    ''', (job_id, session.get('user_id'), data.get('priority', 'Normal'),
          data.get('needed_by', ''), data.get('notes', '')))
    rid = cursor.lastrowid
    items = data.get('items', [])
    for item in items:
        conn.execute('''
            INSERT INTO material_request_items (request_id, sku, description, quantity_requested, unit)
            VALUES (?, ?, ?, ?, ?)
        ''', (rid, item.get('sku', ''), item.get('description', ''),
              float(item.get('quantity_requested', 0)), item.get('unit', 'each')))
    conn.commit()
    # Notify PMs and owners
    job = conn.execute('SELECT name FROM jobs WHERE id = ?', (job_id,)).fetchone()
    requester = conn.execute('SELECT display_name FROM users WHERE id = ?', (session.get('user_id'),)).fetchone()
    pms = conn.execute("SELECT id FROM users WHERE role IN ('owner','admin','project_manager') AND is_active = 1").fetchall()
    for pm in pms:
        if pm['id'] != session.get('user_id'):
            create_notification(pm['id'], 'material_request',
                f"New Material Request for {job['name'] if job else 'Unknown'}",
                f"{requester['display_name'] if requester else 'Someone'} requested materials ({len(items)} items)",
                f"/material-requests")
    conn.close()
    return jsonify({'id': rid}), 201

@app.route('/api/material-requests/<int:rid>')
@api_login_required
def api_get_material_request(rid):
    conn = get_db()
    req = conn.execute('''
        SELECT mr.*, j.name as job_name, u.display_name as requester_name
        FROM material_requests mr
        LEFT JOIN jobs j ON mr.job_id = j.id
        LEFT JOIN users u ON mr.requested_by = u.id
        WHERE mr.id = ?
    ''', (rid,)).fetchone()
    if not req:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    result = dict(req)
    items = conn.execute('''
        SELECT mri.*, ii.quantity_on_hand as stock_on_hand
        FROM material_request_items mri
        LEFT JOIN inventory_items ii ON mri.inventory_item_id = ii.id
        WHERE mri.request_id = ?
    ''', (rid,)).fetchall()
    result['items'] = [dict(i) for i in items]
    conn.close()
    return jsonify(result)

@app.route('/api/material-requests/<int:rid>', methods=['PUT'])
@api_login_required
def api_update_material_request(rid):
    data = request.get_json() or {}
    conn = get_db()
    conn.execute('''
        UPDATE material_requests
        SET priority = ?, needed_by = ?, notes = ?, updated_at = datetime('now','localtime')
        WHERE id = ?
    ''', (data.get('priority', 'Normal'), data.get('needed_by', ''),
          data.get('notes', ''), rid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/material-requests/<int:rid>/approve', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager')
def api_approve_material_request(rid):
    data = request.get_json() or {}
    conn = get_db()
    items = data.get('items', [])
    for item in items:
        conn.execute('''
            UPDATE material_request_items
            SET quantity_approved = ?
            WHERE id = ?
        ''', (float(item.get('quantity_approved', 0)), item['id']))
    conn.execute('''
        UPDATE material_requests
        SET status = 'Approved', approved_by = ?, approved_at = datetime('now','localtime'),
            updated_at = datetime('now','localtime')
        WHERE id = ?
    ''', (session.get('user_id'), rid))
    conn.commit()
    # Notify requester
    req = conn.execute('SELECT requested_by, job_id FROM material_requests WHERE id = ?', (rid,)).fetchone()
    if req and req['requested_by']:
        job = conn.execute('SELECT name FROM jobs WHERE id = ?', (req['job_id'],)).fetchone()
        create_notification(req['requested_by'], 'material_request',
            f"Material Request #{rid} Approved",
            f"Your material request for {job['name'] if job else 'Unknown'} has been approved",
            f"/material-requests")
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/material-requests/<int:rid>/fulfill', methods=['POST'])
@api_role_required('owner', 'admin', 'project_manager', 'warehouse')
def api_fulfill_material_request(rid):
    data = request.get_json() or {}
    conn = get_db()
    items = data.get('items', [])
    req = conn.execute('SELECT job_id FROM material_requests WHERE id = ?', (rid,)).fetchone()
    all_fulfilled = True
    for item in items:
        qty_fulfilled = float(item.get('quantity_fulfilled', 0))
        qty_requested = float(item.get('quantity_requested', 0))
        if qty_fulfilled < qty_requested:
            all_fulfilled = False
        conn.execute('''
            UPDATE material_request_items
            SET quantity_fulfilled = ?
            WHERE id = ?
        ''', (qty_fulfilled, item['id']))
        # Decrement inventory if inventory_item_id is linked
        inv_id = item.get('inventory_item_id')
        if inv_id and qty_fulfilled > 0:
            conn.execute('''
                UPDATE inventory_items
                SET quantity_on_hand = MAX(0, quantity_on_hand - ?),
                    updated_at = datetime('now','localtime')
                WHERE id = ?
            ''', (qty_fulfilled, inv_id))
            conn.execute('''
                INSERT INTO inventory_transactions
                (inventory_item_id, transaction_type, quantity, job_id, reference, notes, created_by)
                VALUES (?, 'issue', ?, ?, ?, ?, ?)
            ''', (inv_id, -qty_fulfilled, req['job_id'] if req else None,
                  f"Material Request #{rid}", f"Fulfilled from MR #{rid}",
                  session.get('user_id')))
    new_status = 'Fulfilled' if all_fulfilled else 'Partial'
    conn.execute('''
        UPDATE material_requests
        SET status = ?, fulfilled_by = ?, fulfilled_at = datetime('now','localtime'),
            updated_at = datetime('now','localtime')
        WHERE id = ?
    ''', (new_status, session.get('user_id'), rid))
    conn.commit()
    # Notify requester
    mr = conn.execute('SELECT requested_by, job_id FROM material_requests WHERE id = ?', (rid,)).fetchone()
    if mr and mr['requested_by']:
        job = conn.execute('SELECT name FROM jobs WHERE id = ?', (mr['job_id'],)).fetchone()
        create_notification(mr['requested_by'], 'material_request',
            f"Material Request #{rid} {new_status}",
            f"Your material request for {job['name'] if job else 'Unknown'} has been {new_status.lower()}",
            f"/material-requests")
    conn.close()
    return jsonify({'ok': True, 'status': new_status})


# ─── Duplicate File Check ────────────────────────────────────────

@app.route('/api/files/check-duplicate', methods=['POST'])
@api_login_required
def api_check_duplicate():
    file = request.files.get('file')
    doc_type = request.form.get('doc_type', '')
    if not file or not file.filename:
        return jsonify({'error': 'No file'}), 400
    content = file.read()
    file.seek(0)  # Reset for potential subsequent read
    result = check_duplicate(content, doc_type, file.filename)
    return jsonify(result)


# ─── Startup ────────────────────────────────────────────────────

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

if __name__ == '__main__':
    init_db()
    local_ip = get_local_ip()
    print(f'\n  Construction Management')
    print(f'  ────────────────────────────────')
    print(f'  Local:   http://localhost:5001')
    print(f'  Network: http://{local_ip}:5001')
    print(f'  ────────────────────────────────')
    print(f'  Default login: admin / admin')
    print(f'  ────────────────────────────────\n')
    app.run(host='0.0.0.0', port=5001, debug=True)
