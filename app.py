from flask import Flask, render_template, request, jsonify, send_file, session, redirect, url_for, g
from functools import wraps
import json
import os
import socket
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders
from datetime import datetime
from database import init_db, get_db, build_snapshot, save_snapshot, restore_snapshot, get_job_data
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
    if role == 'owner':
        return redirect(url_for('dashboard'))
    elif role == 'project_manager':
        return redirect(url_for('materials_list'))
    else:
        return redirect(url_for('time_entry'))

# ─── Dashboard ───────────────────────────────────────────────────

@app.route('/dashboard')
@role_required('owner')
def dashboard():
    return render_template('dashboard.html')

@app.route('/api/dashboard')
@api_role_required('owner')
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
@role_required('owner', 'project_manager')
def materials_list():
    conn = get_db()
    jobs = conn.execute('SELECT * FROM jobs ORDER BY updated_at DESC').fetchall()
    conn.close()
    return render_template('materials/list.html', jobs=jobs)

@app.route('/materials/job/<int:job_id>')
@role_required('owner', 'project_manager')
def materials_job(job_id):
    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    conn.close()
    if not job:
        return 'Job not found', 404
    return render_template('materials/job.html', job=job)

@app.route('/materials/job/<int:job_id>/history')
@role_required('owner', 'project_manager')
def materials_history(job_id):
    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    conn.close()
    if not job:
        return 'Job not found', 404
    return render_template('materials/history.html', job=job)

# ─── Existing Job API Routes (unchanged functionality) ───────────

@app.route('/api/jobs', methods=['POST'])
@api_role_required('owner', 'project_manager')
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

    conn = get_db()
    cursor = conn.execute(
        'INSERT INTO jobs (name, status, address, city, state, zip_code, tax_rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
        (name, 'Needs Bid', address, city, state, zip_code, tax_rate)
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
@api_role_required('owner', 'project_manager')
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

    for field in ('address', 'city', 'state', 'zip_code'):
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
@api_role_required('owner')
def delete_job(job_id):
    conn = get_db()
    conn.execute('DELETE FROM jobs WHERE id = ?', (job_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/analytics')
@api_role_required('owner')
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
@api_role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
def save_received(job_id):
    return _save_entries(job_id, 'received_entries', request.get_json())

@app.route('/api/job/<int:job_id>/shipped', methods=['PUT'])
@api_role_required('owner', 'project_manager')
def save_shipped(job_id):
    return _save_entries(job_id, 'shipped_entries', request.get_json())

@app.route('/api/job/<int:job_id>/invoiced', methods=['PUT'])
@api_role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
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
@role_required('owner')
def accounting_overview():
    conn = get_db()
    jobs = conn.execute('SELECT * FROM jobs ORDER BY name').fetchall()
    conn.close()
    return render_template('accounting/overview.html', jobs=jobs)

@app.route('/accounting/job/<int:job_id>')
@role_required('owner')
def accounting_job(job_id):
    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    conn.close()
    if not job:
        return 'Job not found', 404
    return render_template('accounting/job.html', job=job)

@app.route('/api/accounting/job/<int:job_id>')
@api_role_required('owner')
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
@api_role_required('owner')
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
@api_role_required('owner')
def delete_expense(eid):
    conn = get_db()
    conn.execute('DELETE FROM expenses WHERE id = ?', (eid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/accounting/payments', methods=['POST'])
@api_role_required('owner')
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
@api_role_required('owner')
def delete_payment(pid):
    conn = get_db()
    conn.execute('DELETE FROM payments WHERE id = ?', (pid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/accounting/invoices', methods=['POST'])
@api_role_required('owner')
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
@api_role_required('owner')
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
@api_role_required('owner')
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

# ─── Warranty ───────────────────────────────────────────────────

@app.route('/warranty')
@role_required('owner', 'project_manager')
def warranty_list():
    return render_template('warranty/list.html')

@app.route('/warranty/job/<int:job_id>')
@role_required('owner', 'project_manager')
def warranty_job(job_id):
    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    conn.close()
    if not job:
        return 'Job not found', 404
    return render_template('warranty/job.html', job=job)

@app.route('/api/warranty')
@api_role_required('owner', 'project_manager')
def api_warranty_list():
    conn = get_db()
    items = conn.execute(
        '''SELECT wi.*, j.name as job_name FROM warranty_items wi
           LEFT JOIN jobs j ON wi.job_id = j.id ORDER BY wi.warranty_end ASC'''
    ).fetchall()
    conn.close()
    return jsonify([dict(i) for i in items])

@app.route('/api/warranty/job/<int:job_id>')
@api_role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
def delete_warranty_item(wid):
    conn = get_db()
    conn.execute('DELETE FROM warranty_items WHERE id = ?', (wid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/warranty/claims', methods=['POST'])
@api_role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
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
@role_required('owner', 'project_manager')
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
@role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
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

# ─── Projects ───────────────────────────────────────────────────

@app.route('/projects')
@role_required('owner', 'project_manager')
def projects_overview():
    return render_template('projects/overview.html')

@app.route('/projects/<int:job_id>')
@role_required('owner', 'project_manager')
def projects_detail(job_id):
    conn = get_db()
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    conn.close()
    if not job:
        return 'Project not found', 404
    return render_template('projects/detail.html', job=job)

@app.route('/api/projects')
@api_role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
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
@role_required('owner', 'project_manager')
def bids_list():
    return render_template('bids/list.html')

@app.route('/bids/new')
@role_required('owner', 'project_manager')
def bids_new():
    return render_template('bids/detail.html', bid_id=0)

@app.route('/bids/<int:bid_id>')
@role_required('owner', 'project_manager')
def bids_detail(bid_id):
    return render_template('bids/detail.html', bid_id=bid_id)

@app.route('/api/bids')
@api_role_required('owner', 'project_manager')
def api_bids():
    conn = get_db()
    bids = conn.execute(
        '''SELECT b.*, j.name as job_name FROM bids b
           LEFT JOIN jobs j ON b.job_id = j.id
           ORDER BY b.updated_at DESC'''
    ).fetchall()
    conn.close()
    return jsonify([dict(b) for b in bids])

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
@api_role_required('owner', 'project_manager')
def api_create_bid():
    data = request.get_json()
    calcs = calculate_bid(data)
    fields = _bid_fields(data, calcs)
    placeholders = ','.join(['?'] * (len(fields) + 1))  # +1 for created_by
    conn = get_db()
    cursor = conn.execute(
        f'INSERT INTO bids ({_BID_INSERT_COLS}, created_by) VALUES ({placeholders})',
        fields + (session.get('user_id'),)
    )
    bid_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': bid_id}), 201

@app.route('/api/bids/<int:bid_id>')
@api_role_required('owner', 'project_manager')
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
    return jsonify(result)

@app.route('/api/bids/<int:bid_id>', methods=['PUT'])
@api_role_required('owner', 'project_manager')
def api_update_bid(bid_id):
    data = request.get_json()
    calcs = calculate_bid(data)
    fields = _bid_fields(data, calcs)
    set_clause = ', '.join([f'{col.strip()}=?' for col in _BID_INSERT_COLS.split(',')])
    conn = get_db()
    conn.execute(
        f"UPDATE bids SET {set_clause}, updated_at=datetime('now','localtime') WHERE id=?",
        fields + (bid_id,)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/bids/<int:bid_id>', methods=['DELETE'])
@api_role_required('owner', 'project_manager')
def api_delete_bid(bid_id):
    conn = get_db()
    conn.execute('DELETE FROM bids WHERE id = ?', (bid_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/bids/<int:bid_id>/calculate', methods=['POST'])
@api_role_required('owner', 'project_manager')
def api_bid_calculate(bid_id):
    data = request.get_json()
    calcs = calculate_bid(data)
    return jsonify(calcs)

@app.route('/api/bids/<int:bid_id>/partners', methods=['POST'])
@api_role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
def api_delete_bid_partner(bid_id, pid):
    conn = get_db()
    conn.execute('DELETE FROM bid_partners WHERE id = ? AND bid_id = ?', (pid, bid_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/bids/<int:bid_id>/personnel', methods=['POST'])
@api_role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
def api_delete_bid_personnel(bid_id, pid):
    conn = get_db()
    conn.execute('DELETE FROM bid_personnel WHERE id = ? AND bid_id = ?', (pid, bid_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ─── Proposals (PDF + Email) ─────────────────────────────────

@app.route('/api/bids/<int:bid_id>/generate-proposal', methods=['POST'])
@api_role_required('owner', 'project_manager')
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
@api_role_required('owner', 'project_manager')
def api_download_proposal(bid_id, filename):
    """Download a generated proposal PDF."""
    proposals_dir = os.path.join(os.path.dirname(__file__), 'data', 'proposals')
    filepath = os.path.join(proposals_dir, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    return send_file(filepath, as_attachment=True, download_name=filename)


@app.route('/api/bids/<int:bid_id>/email-proposal', methods=['POST'])
@api_role_required('owner', 'project_manager')
def api_email_proposal(bid_id):
    """Email a proposal PDF to specified recipients."""
    data = request.get_json()
    recipients = [e.strip() for e in data.get('recipients', []) if e.strip()]
    subject = data.get('subject', 'HVAC Installation Proposal')
    body_text = data.get('body', '')
    smtp_host = data.get('smtp_host', '')
    smtp_port = int(data.get('smtp_port', 587) or 587)
    smtp_user = data.get('smtp_user', '')
    smtp_pass = data.get('smtp_pass', '')
    from_email = data.get('from_email', smtp_user)

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


@app.route('/api/email-settings', methods=['GET', 'POST'])
@api_role_required('owner')
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

    # Generate bot response
    bot_response = generate_bot_response(conn, user_msg)

    # Save bot message
    conn.execute('INSERT INTO chat_messages (session_id, role, content) VALUES (?,?,?)',
                 (sid, 'assistant', bot_response))

    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'response': bot_response})

def generate_bot_response(conn, message):
    """Pattern-matching bot that answers questions about the app."""
    msg = message.lower().strip()

    # Help command
    if msg in ('help', '/help', '?'):
        return ("I can help with:\n"
                "- **search code [query]** — Search code book sections\n"
                "- **warranty status [job name]** — Check warranty items\n"
                "- **open service calls** — List open service calls\n"
                "- **howto [topic]** — Search how-to articles\n"
                "- **bid [job name]** — Show bid summary\n"
                "- **job status** — List all jobs and their statuses\n"
                "- **help** — Show this help message")

    # Search code books
    if msg.startswith('search code') or msg.startswith('code search') or msg.startswith('find code'):
        query = msg.replace('search code', '').replace('code search', '').replace('find code', '').strip()
        if not query:
            return "Please provide a search term. Example: **search code fire protection**"
        sections = conn.execute(
            '''SELECT cs.section_number, cs.title, cb.code FROM code_sections cs
               JOIN code_books cb ON cs.book_id = cb.id
               WHERE cs.section_number LIKE ? OR cs.title LIKE ?
               ORDER BY cb.code, cs.sort_order LIMIT 10''',
            (f'%{query}%', f'%{query}%')
        ).fetchall()
        if not sections:
            return f"No code sections found matching **{query}**."
        lines = [f"Found **{len(sections)}** matching sections:"]
        for s in sections:
            lines.append(f"- **[{s['code']}]** {s['section_number']}: {s['title']}")
        return '\n'.join(lines)

    # Warranty status
    if 'warranty' in msg and ('status' in msg or 'check' in msg):
        query = msg.replace('warranty', '').replace('status', '').replace('check', '').strip()
        if query:
            items = conn.execute(
                '''SELECT wi.*, j.name as job_name FROM warranty_items wi
                   JOIN jobs j ON wi.job_id = j.id WHERE j.name LIKE ? ORDER BY wi.warranty_end LIMIT 10''',
                (f'%{query}%',)
            ).fetchall()
        else:
            items = conn.execute(
                '''SELECT wi.*, j.name as job_name FROM warranty_items wi
                   JOIN jobs j ON wi.job_id = j.id ORDER BY wi.warranty_end LIMIT 10'''
            ).fetchall()
        if not items:
            return "No warranty items found." + (f" for **{query}**" if query else "")
        lines = [f"Found **{len(items)}** warranty items:"]
        for w in items:
            lines.append(f"- **{w['job_name']}** — {w['item_description']} ({w['status']}, expires {w['warranty_end'] or 'N/A'})")
        return '\n'.join(lines)

    # Open service calls
    if 'service call' in msg or 'service calls' in msg:
        calls = conn.execute(
            '''SELECT sc.*, j.name as job_name FROM service_calls sc
               LEFT JOIN jobs j ON sc.job_id = j.id
               WHERE sc.status NOT IN ('Resolved','Closed')
               ORDER BY CASE sc.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 ELSE 2 END
               LIMIT 10'''
        ).fetchall()
        if not calls:
            return "No open service calls found."
        lines = [f"**{len(calls)}** open service call(s):"]
        for c in calls:
            job = c['job_name'] or 'No job'
            lines.append(f"- **#{c['id']}** [{c['priority']}] {c['description'][:60]} — {job} ({c['status']})")
        return '\n'.join(lines)

    # How-to search
    if msg.startswith('howto') or msg.startswith('how to') or msg.startswith('how-to'):
        query = msg.replace('howto', '').replace('how to', '').replace('how-to', '').strip()
        if not query:
            articles = conn.execute('SELECT id, title, category FROM howto_articles ORDER BY updated_at DESC LIMIT 10').fetchall()
        else:
            articles = conn.execute(
                'SELECT id, title, category FROM howto_articles WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC LIMIT 10',
                (f'%{query}%', f'%{query}%')
            ).fetchall()
        if not articles:
            return "No how-to articles found." + (f" matching **{query}**" if query else "")
        lines = [f"Found **{len(articles)}** article(s):"]
        for a in articles:
            cat = f" [{a['category']}]" if a['category'] else ""
            lines.append(f"- **{a['title']}**{cat} — [View](/howtos/{a['id']})")
        return '\n'.join(lines)

    # Bid lookup
    if msg.startswith('bid'):
        query = msg.replace('bid', '').strip()
        if query:
            bids = conn.execute(
                '''SELECT b.*, j.name as job_name FROM bids b
                   LEFT JOIN jobs j ON b.job_id = j.id
                   WHERE b.bid_name LIKE ? OR j.name LIKE ? ORDER BY b.updated_at DESC LIMIT 10''',
                (f'%{query}%', f'%{query}%')
            ).fetchall()
        else:
            bids = conn.execute(
                '''SELECT b.*, j.name as job_name FROM bids b
                   LEFT JOIN jobs j ON b.job_id = j.id ORDER BY b.updated_at DESC LIMIT 10'''
            ).fetchall()
        if not bids:
            return "No bids found." + (f" matching **{query}**" if query else "")
        lines = [f"Found **{len(bids)}** bid(s):"]
        for b in bids:
            job = b['job_name'] or 'No job'
            lines.append(f"- **{b['bid_name']}** — {job} | Status: {b['status']} | Total: ${b['total_bid']:,.2f}")
        return '\n'.join(lines)

    # Job status
    if 'job' in msg and 'status' in msg:
        jobs = conn.execute('SELECT id, name, status FROM jobs ORDER BY name').fetchall()
        if not jobs:
            return "No jobs found."
        lines = [f"**{len(jobs)}** job(s):"]
        for j in jobs:
            lines.append(f"- **{j['name']}** — {j['status']}")
        return '\n'.join(lines)

    # Fallback
    return ("I can help with: **code lookups**, **warranty checks**, **service call status**, "
            "**how-to searches**, **bid summaries**, and **job status**.\n\n"
            "Try asking something like:\n"
            "- search code fire protection\n"
            "- open service calls\n"
            "- warranty status\n"
            "- howto electrical\n"
            "- bid summary\n"
            "- job status\n\n"
            "Type **help** for a full list of commands.")

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
