"""BillTrust API Integration for supplier invoice management.

Handles OAuth2 authentication and invoice operations for suppliers
(Locke Supply and Plumb Supply) that use BillTrust for invoicing/billing.
"""

import requests
import json
import random
import hashlib
from datetime import datetime, timedelta


# ---------------------------------------------------------------------------
# Real BillTrust API Client
# ---------------------------------------------------------------------------

class BillTrustClient:
    """Client for BillTrust API - handles authentication and invoice operations."""

    BASE_URL = 'https://api.billtrust.com/v1'

    def __init__(self, client_id, client_secret, supplier_name=''):
        self.client_id = client_id
        self.client_secret = client_secret
        self.supplier_name = supplier_name
        self.access_token = None
        self.token_expires = None

    def authenticate(self):
        """Get OAuth2 access token from BillTrust.

        Posts client credentials to the token endpoint and stores
        the access token and its expiry time.

        Returns:
            True if authentication succeeded, False otherwise.
        """
        try:
            resp = requests.post(
                f'{self.BASE_URL}/oauth/token',
                json={
                    'grant_type': 'client_credentials',
                    'client_id': self.client_id,
                    'client_secret': self.client_secret,
                },
                headers={'Content-Type': 'application/json'},
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            self.access_token = data.get('access_token')
            expires_in = data.get('expires_in', 3600)
            self.token_expires = datetime.utcnow() + timedelta(seconds=expires_in - 60)
            return True
        except requests.RequestException as exc:
            print(f'[BillTrust] Auth failed for {self.supplier_name}: {exc}')
            self.access_token = None
            self.token_expires = None
            return False

    def _ensure_auth(self):
        """Ensure we have a valid token, refresh if expired or missing."""
        if self.access_token and self.token_expires and datetime.utcnow() < self.token_expires:
            return
        self.authenticate()

    def _request(self, method, endpoint, **kwargs):
        """Make an authenticated API request.

        Automatically ensures a valid token is present, attaches the
        Authorization header, and returns the parsed JSON response.

        Args:
            method: HTTP method string ('GET', 'POST', etc.)
            endpoint: API path relative to BASE_URL (e.g. '/invoices')
            **kwargs: Passed through to requests.request()

        Returns:
            Parsed JSON dict on success, or dict with 'error' key on failure.
        """
        self._ensure_auth()
        if not self.access_token:
            return {'error': 'Not authenticated'}

        headers = kwargs.pop('headers', {})
        headers['Authorization'] = f'Bearer {self.access_token}'
        headers.setdefault('Content-Type', 'application/json')

        url = f'{self.BASE_URL}{endpoint}'
        try:
            resp = requests.request(method, url, headers=headers, timeout=30, **kwargs)
            resp.raise_for_status()
            return resp.json()
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else 0
            # Token expired mid-session -- retry once
            if status == 401:
                if self.authenticate():
                    headers['Authorization'] = f'Bearer {self.access_token}'
                    try:
                        resp = requests.request(method, url, headers=headers, timeout=30, **kwargs)
                        resp.raise_for_status()
                        return resp.json()
                    except requests.RequestException as retry_exc:
                        return {'error': f'Retry failed: {retry_exc}'}
            return {'error': f'HTTP {status}: {exc}'}
        except requests.ConnectionError as exc:
            return {'error': f'Connection error: {exc}'}
        except requests.Timeout:
            return {'error': 'Request timed out'}
        except requests.RequestException as exc:
            return {'error': f'Request failed: {exc}'}

    # -- Invoice endpoints ---------------------------------------------------

    def get_invoices(self, status=None, date_from=None, date_to=None, page=1, per_page=50):
        """Fetch invoices with optional filters.

        Args:
            status: Filter by invoice status ('open', 'paid', 'overdue', 'disputed').
            date_from: Start date string (YYYY-MM-DD).
            date_to: End date string (YYYY-MM-DD).
            page: Page number for pagination (1-based).
            per_page: Number of results per page (max 100).

        Returns:
            List of invoice dicts, or dict with 'error' key.
        """
        params = {'page': page, 'per_page': min(per_page, 100)}
        if status:
            params['status'] = status
        if date_from:
            params['date_from'] = date_from
        if date_to:
            params['date_to'] = date_to

        data = self._request('GET', '/invoices', params=params)
        if isinstance(data, dict) and 'error' in data:
            return data
        # The API may wrap results in a 'data' or 'invoices' key
        if isinstance(data, dict):
            return data.get('invoices', data.get('data', []))
        return data

    def get_invoice(self, invoice_id):
        """Fetch a single invoice with full line-item detail.

        Args:
            invoice_id: BillTrust invoice identifier.

        Returns:
            Invoice dict, or dict with 'error' key.
        """
        return self._request('GET', f'/invoices/{invoice_id}')

    def get_payments(self, date_from=None, date_to=None):
        """Fetch payment records.

        Args:
            date_from: Start date string (YYYY-MM-DD).
            date_to: End date string (YYYY-MM-DD).

        Returns:
            List of payment dicts, or dict with 'error' key.
        """
        params = {}
        if date_from:
            params['date_from'] = date_from
        if date_to:
            params['date_to'] = date_to

        data = self._request('GET', '/payments', params=params)
        if isinstance(data, dict) and 'error' in data:
            return data
        if isinstance(data, dict):
            return data.get('payments', data.get('data', []))
        return data

    def get_account_summary(self):
        """Get account balance summary (current, 30/60/90 day aging).

        Returns:
            Account summary dict, or dict with 'error' key.
        """
        return self._request('GET', '/account/summary')

    # -- Sync ----------------------------------------------------------------

    def sync_invoices(self, db_conn, supplier_config_id):
        """Sync invoices from BillTrust to local database.

        Fetches invoices from the last 90 days and upserts into the
        supplier_invoices table.  Matching is done on invoice_number +
        supplier_config_id.

        Args:
            db_conn: SQLite connection (with row_factory = sqlite3.Row).
            supplier_config_id: ID from the billtrust_config table.

        Returns:
            Dict with 'new', 'updated', 'total', and 'errors' counts.
        """
        date_from = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')
        date_to = datetime.now().strftime('%Y-%m-%d')

        stats = {'new': 0, 'updated': 0, 'total': 0, 'errors': 0}
        page = 1

        while True:
            invoices = self.get_invoices(date_from=date_from, date_to=date_to, page=page, per_page=100)
            if isinstance(invoices, dict) and 'error' in invoices:
                stats['errors'] += 1
                break
            if not invoices:
                break

            for inv in invoices:
                stats['total'] += 1
                try:
                    was_new = _upsert_invoice(db_conn, supplier_config_id, inv)
                    if was_new:
                        stats['new'] += 1
                    else:
                        stats['updated'] += 1
                except Exception as exc:
                    print(f'[BillTrust] Sync error for invoice {inv.get("invoice_number", "?")}: {exc}')
                    stats['errors'] += 1

            # If we got fewer than a full page, we are done
            if len(invoices) < 100:
                break
            page += 1

        db_conn.commit()
        return stats


# ---------------------------------------------------------------------------
# Mock BillTrust Client (for testing / demo without real credentials)
# ---------------------------------------------------------------------------

class MockBillTrustClient:
    """Mock client that returns realistic HVAC supply invoice data.

    Generates deterministic sample invoices for Locke Supply and
    Plumb Supply so the UI can be developed and demoed without
    requiring real BillTrust API credentials.
    """

    def __init__(self, supplier_name='Mock Supplier'):
        self.supplier_name = supplier_name
        self.authenticated = True
        self._seed = int(hashlib.md5(supplier_name.encode()).hexdigest()[:8], 16)

    def authenticate(self):
        self.authenticated = True
        return True

    # -- Catalog of realistic HVAC parts ------------------------------------

    _HVAC_ITEMS = [
        # (description, unit, price_low, price_high)
        ('3/4" Type L Copper Pipe - 10ft', 'length', 28.00, 55.00),
        ('1-1/8" Type L Copper Pipe - 10ft', 'length', 48.00, 95.00),
        ('1-3/8" ACR Copper Tubing - 50ft', 'coil', 125.00, 280.00),
        ('R-410A Refrigerant - 25lb Cylinder', 'cylinder', 125.00, 350.00),
        ('R-22 Refrigerant - 30lb (reclaimed)', 'cylinder', 275.00, 500.00),
        ('3/4" Copper Elbow 90-deg (bag of 10)', 'bag', 18.00, 35.00),
        ('1" Copper Tee Fitting', 'each', 8.50, 22.00),
        ('1/2" x 3/4" Reducer Coupling', 'each', 4.50, 12.00),
        ('Silver Brazing Alloy Rods - 1lb', 'pkg', 45.00, 85.00),
        ('6" Round Galvanized Duct - 5ft', 'piece', 12.00, 28.00),
        ('8" Round Galvanized Duct - 5ft', 'piece', 16.00, 35.00),
        ('12x12 Sheet Metal Duct - 5ft', 'piece', 32.00, 65.00),
        ('24x12 Sheet Metal Duct - 5ft', 'piece', 48.00, 95.00),
        ('Flex Duct 6" x 25ft R-8 Insulated', 'roll', 38.00, 72.00),
        ('Flex Duct 8" x 25ft R-8 Insulated', 'roll', 52.00, 95.00),
        ('4-Ton 14 SEER Condenser Unit', 'unit', 2800.00, 4500.00),
        ('3-Ton 16 SEER Heat Pump Condenser', 'unit', 3200.00, 5500.00),
        ('5-Ton Package Unit 14 SEER', 'unit', 4500.00, 7200.00),
        ('2.5-Ton Air Handler with TXV', 'unit', 1200.00, 2200.00),
        ('4-Ton Air Handler with TXV', 'unit', 1800.00, 3200.00),
        ('Programmable Thermostat - WiFi', 'each', 85.00, 175.00),
        ('50-gal Gas Water Heater', 'unit', 550.00, 950.00),
        ('Condensate Pump - 120V', 'each', 45.00, 85.00),
        ('Condensate Drain Line Kit', 'kit', 22.00, 45.00),
        ('3/4" Armaflex Insulation - 6ft', 'piece', 6.50, 14.00),
        ('1-1/8" Armaflex Insulation - 6ft', 'piece', 9.00, 18.00),
        ('HVAC Foil Tape 2.5" x 60yd', 'roll', 8.00, 16.00),
        ('Mastic Duct Sealant - 1 Gallon', 'gallon', 14.00, 28.00),
        ('24x24 Return Air Grille', 'each', 18.00, 38.00),
        ('12x6 Supply Register - White', 'each', 8.00, 18.00),
        ('10x6 Supply Register - White', 'each', 7.00, 15.00),
        ('Filter Rack 20x25', 'each', 22.00, 45.00),
        ('20x25x1 Pleated Filter (4-pack)', 'pack', 18.00, 35.00),
        ('Line Set 3/8 x 3/4 - 25ft', 'set', 65.00, 140.00),
        ('Line Set 3/8 x 7/8 - 50ft', 'set', 120.00, 250.00),
        ('Disconnect Box 60A Non-Fused', 'each', 12.00, 28.00),
        ('Whip 3/4" x 6ft Liquid-Tight', 'each', 14.00, 30.00),
        ('Concrete Condenser Pad 36x36', 'each', 35.00, 65.00),
        ('Pipe Hangers 1" (box of 50)', 'box', 22.00, 48.00),
        ('Gas Flex Connector 3/4" x 24"', 'each', 18.00, 38.00),
    ]

    _STATUSES = ['Open', 'Open', 'Open', 'Paid', 'Paid', 'Paid', 'Paid', 'Overdue']

    def _generate_invoices(self, count=18):
        """Generate a deterministic set of realistic invoices."""
        rng = random.Random(self._seed)
        invoices = []
        base_date = datetime.now() - timedelta(days=85)

        # Choose a prefix based on supplier name
        if 'locke' in self.supplier_name.lower():
            prefix = 'LS'
            base_num = 580000
        elif 'plumb' in self.supplier_name.lower():
            prefix = 'PS'
            base_num = 420000
        else:
            prefix = 'BT'
            base_num = 100000

        for i in range(count):
            inv_num = f'{prefix}-{base_num + i * rng.randint(1, 12)}'
            inv_date = base_date + timedelta(days=rng.randint(0, 80))
            due_date = inv_date + timedelta(days=30)
            status = rng.choice(self._STATUSES)

            # If due_date has passed and status is open, mark overdue
            if status == 'Open' and due_date < datetime.now():
                status = 'Overdue'
            # If status is paid, set a paid_date
            paid_date = None
            if status == 'Paid':
                paid_date = (due_date - timedelta(days=rng.randint(0, 15))).strftime('%Y-%m-%d')

            # Generate 1-6 line items per invoice
            num_items = rng.randint(1, 6)
            line_items = []
            subtotal = 0.0

            for j in range(num_items):
                item = rng.choice(self._HVAC_ITEMS)
                desc, unit, lo, hi = item
                qty = rng.randint(1, 20)
                unit_price = round(rng.uniform(lo, hi), 2)
                ext_price = round(qty * unit_price, 2)
                subtotal += ext_price
                line_items.append({
                    'line_number': j + 1,
                    'description': desc,
                    'unit': unit,
                    'quantity': qty,
                    'unit_price': unit_price,
                    'extended_price': ext_price,
                })

            tax_rate = 0.085  # 8.5% Oklahoma tax
            tax_amount = round(subtotal * tax_rate, 2)
            total = round(subtotal + tax_amount, 2)

            invoices.append({
                'id': f'bt-inv-{self._seed}-{i}',
                'invoice_number': inv_num,
                'invoice_date': inv_date.strftime('%Y-%m-%d'),
                'due_date': due_date.strftime('%Y-%m-%d'),
                'status': status,
                'po_number': f'PO-{rng.randint(1000, 9999)}',
                'subtotal': subtotal,
                'tax_rate': tax_rate,
                'tax_amount': tax_amount,
                'total': total,
                'amount_paid': total if status == 'Paid' else 0.0,
                'balance_due': 0.0 if status == 'Paid' else total,
                'paid_date': paid_date,
                'line_items': line_items,
                'supplier_name': self.supplier_name,
            })

        # Sort by date descending
        invoices.sort(key=lambda x: x['invoice_date'], reverse=True)
        return invoices

    def get_invoices(self, status=None, date_from=None, date_to=None, page=1, per_page=50):
        """Return sample invoice data with optional filtering.

        Generates ~18 realistic HVAC supply invoices and filters them
        the same way the real API would.
        """
        all_invoices = self._generate_invoices(18)

        # Apply filters
        filtered = all_invoices
        if status:
            filtered = [inv for inv in filtered if inv['status'] == status]
        if date_from:
            filtered = [inv for inv in filtered if inv['invoice_date'] >= date_from]
        if date_to:
            filtered = [inv for inv in filtered if inv['invoice_date'] <= date_to]

        # Paginate
        start = (page - 1) * per_page
        end = start + per_page
        return filtered[start:end]

    def get_invoice(self, invoice_id):
        """Return a single mock invoice by ID."""
        for inv in self._generate_invoices(18):
            if inv['id'] == invoice_id:
                return inv
        return {'error': f'Invoice {invoice_id} not found'}

    def get_payments(self, date_from=None, date_to=None):
        """Return mock payment data derived from paid invoices."""
        rng = random.Random(self._seed + 999)
        paid_invoices = [inv for inv in self._generate_invoices(18) if inv['status'] == 'Paid']

        payments = []
        for inv in paid_invoices:
            payments.append({
                'id': f'pmt-{inv["id"]}',
                'payment_date': inv['paid_date'],
                'amount': inv['total'],
                'method': rng.choice(['ACH', 'Check', 'ACH', 'Wire']),
                'reference': f'CHK-{rng.randint(10000, 99999)}' if rng.random() > 0.5 else f'ACH-{rng.randint(100000, 999999)}',
                'invoice_number': inv['invoice_number'],
                'supplier_name': self.supplier_name,
            })

        if date_from:
            payments = [p for p in payments if p['payment_date'] and p['payment_date'] >= date_from]
        if date_to:
            payments = [p for p in payments if p['payment_date'] and p['payment_date'] <= date_to]

        payments.sort(key=lambda x: x['payment_date'] or '', reverse=True)
        return payments

    def get_account_summary(self):
        """Return mock account summary with aging buckets."""
        invoices = self._generate_invoices(18)
        now = datetime.now()

        current = 0.0
        over_30 = 0.0
        over_60 = 0.0
        over_90 = 0.0
        total_paid = 0.0

        for inv in invoices:
            if inv['status'] == 'Paid':
                total_paid += inv['total']
                continue

            due = datetime.strptime(inv['due_date'], '%Y-%m-%d')
            days_past = (now - due).days
            balance = inv['balance_due']

            if days_past <= 0:
                current += balance
            elif days_past <= 30:
                over_30 += balance
            elif days_past <= 60:
                over_60 += balance
            else:
                over_90 += balance

        total_outstanding = current + over_30 + over_60 + over_90
        return {
            'supplier_name': self.supplier_name,
            'total_outstanding': round(total_outstanding, 2),
            'current': round(current, 2),
            'over_30_days': round(over_30, 2),
            'over_60_days': round(over_60, 2),
            'over_90_days': round(over_90, 2),
            'total_paid_90_days': round(total_paid, 2),
            'last_payment_date': next(
                (inv['paid_date'] for inv in invoices if inv['status'] == 'Paid' and inv['paid_date']),
                None,
            ),
            'as_of': now.strftime('%Y-%m-%d %H:%M'),
        }

    def sync_invoices(self, db_conn, supplier_config_id):
        """Insert mock invoices into the supplier_invoices table.

        Works exactly like the real sync -- upserts every generated
        invoice so the UI has data to display.

        Returns:
            Dict with 'new', 'updated', 'total', and 'errors' counts.
        """
        invoices = self._generate_invoices(18)
        stats = {'new': 0, 'updated': 0, 'total': 0, 'errors': 0}

        for inv in invoices:
            stats['total'] += 1
            try:
                was_new = _upsert_invoice(db_conn, supplier_config_id, inv)
                if was_new:
                    stats['new'] += 1
                else:
                    stats['updated'] += 1
            except Exception as exc:
                print(f'[MockBillTrust] Sync error for {inv["invoice_number"]}: {exc}')
                stats['errors'] += 1

        db_conn.commit()
        return stats


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def _upsert_invoice(db_conn, supplier_config_id, inv):
    """Insert or update a single invoice in supplier_invoices.

    Args:
        db_conn: SQLite connection.
        supplier_config_id: FK to billtrust_config.id.
        inv: Invoice dict (from API or mock).

    Returns:
        True if a new row was inserted, False if an existing row was updated.
    """
    invoice_number = inv.get('invoice_number', '')
    existing = db_conn.execute(
        'SELECT id FROM supplier_invoices WHERE invoice_number = ? AND supplier_config_id = ?',
        (invoice_number, supplier_config_id)
    ).fetchone()

    line_items_json = json.dumps(inv.get('line_items', []))

    if existing:
        db_conn.execute('''
            UPDATE supplier_invoices SET
                invoice_date   = ?,
                due_date       = ?,
                status         = ?,
                po_number      = ?,
                subtotal       = ?,
                tax_amount     = ?,
                total          = ?,
                amount_paid    = ?,
                balance_due    = ?,
                paid_date      = ?,
                line_items     = ?,
                billtrust_id   = ?,
                job_id         = COALESCE(?, job_id),
                updated_at     = datetime('now','localtime')
            WHERE id = ?
        ''', (
            inv.get('invoice_date', ''),
            inv.get('due_date', ''),
            inv.get('status', 'Open'),
            inv.get('po_number', ''),
            inv.get('subtotal', 0),
            inv.get('tax_amount', 0),
            inv.get('total', 0),
            inv.get('amount_paid', 0),
            inv.get('balance_due', 0),
            inv.get('paid_date'),
            line_items_json,
            inv.get('id', ''),
            inv.get('job_id'),
            existing['id'],
        ))
        return False
    else:
        db_conn.execute('''
            INSERT INTO supplier_invoices
                (supplier_config_id, billtrust_id, invoice_number, invoice_date,
                 due_date, status, po_number, subtotal, tax_amount, total,
                 amount_paid, balance_due, paid_date, line_items, job_id,
                 created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    datetime('now','localtime'), datetime('now','localtime'))
        ''', (
            supplier_config_id,
            inv.get('id', ''),
            invoice_number,
            inv.get('invoice_date', ''),
            inv.get('due_date', ''),
            inv.get('status', 'Open'),
            inv.get('po_number', ''),
            inv.get('subtotal', 0),
            inv.get('tax_amount', 0),
            inv.get('total', 0),
            inv.get('amount_paid', 0),
            inv.get('balance_due', 0),
            inv.get('paid_date'),
            line_items_json,
            inv.get('job_id'),
        ))
        return True


def ensure_tables(db_conn):
    """Create the BillTrust-related tables if they don't already exist.

    Call this from init_db() or at app startup to ensure the schema is ready.
    """
    db_conn.executescript('''
        CREATE TABLE IF NOT EXISTS billtrust_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_name TEXT NOT NULL,
            client_id TEXT NOT NULL DEFAULT '',
            client_secret TEXT NOT NULL DEFAULT '',
            is_active INTEGER NOT NULL DEFAULT 1,
            use_mock INTEGER NOT NULL DEFAULT 0,
            last_sync_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS supplier_invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_config_id INTEGER NOT NULL,
            billtrust_id TEXT DEFAULT '',
            invoice_number TEXT NOT NULL DEFAULT '',
            invoice_date TEXT DEFAULT '',
            due_date TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open',
            po_number TEXT DEFAULT '',
            subtotal REAL DEFAULT 0,
            tax_amount REAL DEFAULT 0,
            total REAL DEFAULT 0,
            amount_paid REAL DEFAULT 0,
            balance_due REAL DEFAULT 0,
            paid_date TEXT,
            line_items TEXT DEFAULT '[]',
            job_id INTEGER,
            notes TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (supplier_config_id) REFERENCES billtrust_config(id) ON DELETE CASCADE,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
            UNIQUE(invoice_number, supplier_config_id)
        );

        CREATE INDEX IF NOT EXISTS idx_supplier_invoices_number
            ON supplier_invoices(invoice_number);
        CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status
            ON supplier_invoices(status);
        CREATE INDEX IF NOT EXISTS idx_supplier_invoices_date
            ON supplier_invoices(invoice_date);
        CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier
            ON supplier_invoices(supplier_config_id);
    ''')


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def get_client_for_supplier(db_conn, supplier_id):
    """Create the appropriate BillTrustClient from stored supplier config.

    If the config row has use_mock=1 or blank credentials, returns a
    MockBillTrustClient instead.

    Args:
        db_conn: SQLite connection with row_factory = sqlite3.Row.
        supplier_id: billtrust_config.id value.

    Returns:
        BillTrustClient or MockBillTrustClient instance, or None if not found.
    """
    config = db_conn.execute(
        'SELECT * FROM billtrust_config WHERE id = ?', (supplier_id,)
    ).fetchone()
    if not config:
        return None

    supplier_name = config['supplier_name']

    # Use mock if flagged or if credentials are missing
    if config['use_mock'] or not config['client_id'] or not config['client_secret']:
        return MockBillTrustClient(supplier_name=supplier_name)

    return BillTrustClient(
        client_id=config['client_id'],
        client_secret=config['client_secret'],
        supplier_name=supplier_name,
    )


def test_connection(db_conn, supplier_id):
    """Test whether we can successfully authenticate with BillTrust.

    Looks up the supplier config, creates the appropriate client, and
    attempts authentication.

    Args:
        db_conn: SQLite connection with row_factory = sqlite3.Row.
        supplier_id: billtrust_config.id value.

    Returns:
        Dict with 'success' (bool), 'message' (str), and optionally
        'supplier_name'.
    """
    config = db_conn.execute(
        'SELECT * FROM billtrust_config WHERE id = ?', (supplier_id,)
    ).fetchone()
    if not config:
        return {
            'success': False,
            'message': f'Supplier config #{supplier_id} not found.',
        }

    supplier_name = config['supplier_name']

    # Mock mode always succeeds
    if config['use_mock'] or not config['client_id'] or not config['client_secret']:
        return {
            'success': True,
            'message': f'Mock mode active for {supplier_name}. No real API call made.',
            'supplier_name': supplier_name,
            'mock': True,
        }

    client = BillTrustClient(
        client_id=config['client_id'],
        client_secret=config['client_secret'],
        supplier_name=supplier_name,
    )

    try:
        if client.authenticate():
            return {
                'success': True,
                'message': f'Successfully authenticated with BillTrust for {supplier_name}.',
                'supplier_name': supplier_name,
                'mock': False,
            }
        else:
            return {
                'success': False,
                'message': f'Authentication failed for {supplier_name}. Check client_id and client_secret.',
                'supplier_name': supplier_name,
            }
    except Exception as exc:
        return {
            'success': False,
            'message': f'Connection error for {supplier_name}: {exc}',
            'supplier_name': supplier_name,
        }


def seed_default_suppliers(db_conn):
    """Insert default Locke Supply and Plumb Supply configs if not present.

    Both are created with use_mock=1 so the app works out of the box
    without real BillTrust credentials.
    """
    for name in ('Locke Supply', 'Plumb Supply'):
        existing = db_conn.execute(
            'SELECT id FROM billtrust_config WHERE supplier_name = ?', (name,)
        ).fetchone()
        if not existing:
            db_conn.execute('''
                INSERT INTO billtrust_config (supplier_name, client_id, client_secret, use_mock)
                VALUES (?, '', '', 1)
            ''', (name,))
    db_conn.commit()
