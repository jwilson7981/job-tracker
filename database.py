import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'jobs.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Needs Bid',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS line_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            stock_ns TEXT DEFAULT '',
            sku TEXT DEFAULT '',
            description TEXT DEFAULT '',
            quote_qty REAL DEFAULT 0,
            qty_ordered REAL DEFAULT 0,
            price_per REAL DEFAULT 0,
            total_net_price REAL DEFAULT 0,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS received_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            line_item_id INTEGER NOT NULL,
            column_number INTEGER NOT NULL CHECK(column_number BETWEEN 1 AND 15),
            quantity REAL DEFAULT 0,
            entry_date TEXT,
            FOREIGN KEY (line_item_id) REFERENCES line_items(id) ON DELETE CASCADE,
            UNIQUE(line_item_id, column_number)
        );

        CREATE TABLE IF NOT EXISTS shipped_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            line_item_id INTEGER NOT NULL,
            column_number INTEGER NOT NULL CHECK(column_number BETWEEN 1 AND 15),
            quantity REAL DEFAULT 0,
            entry_date TEXT,
            FOREIGN KEY (line_item_id) REFERENCES line_items(id) ON DELETE CASCADE,
            UNIQUE(line_item_id, column_number)
        );

        CREATE TABLE IF NOT EXISTS invoiced_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            line_item_id INTEGER NOT NULL,
            column_number INTEGER NOT NULL CHECK(column_number BETWEEN 1 AND 15),
            quantity REAL DEFAULT 0,
            entry_date TEXT,
            FOREIGN KEY (line_item_id) REFERENCES line_items(id) ON DELETE CASCADE,
            UNIQUE(line_item_id, column_number)
        );

        CREATE TABLE IF NOT EXISTS versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            snapshot TEXT NOT NULL,
            description TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        );

        /* ─── New tables for Construction Management ─── */

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL DEFAULT '',
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('owner','admin','project_manager','warehouse','employee')),
            email TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            hourly_rate REAL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            category TEXT DEFAULT '',
            vendor TEXT DEFAULT '',
            description TEXT DEFAULT '',
            amount REAL DEFAULT 0,
            expense_date TEXT DEFAULT (date('now','localtime')),
            created_by INTEGER,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            amount REAL DEFAULT 0,
            payment_method TEXT DEFAULT '',
            reference_number TEXT DEFAULT '',
            description TEXT DEFAULT '',
            payment_date TEXT DEFAULT (date('now','localtime')),
            created_by INTEGER,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS client_invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            invoice_number TEXT DEFAULT '',
            amount REAL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Sent','Paid','Overdue')),
            description TEXT DEFAULT '',
            issue_date TEXT DEFAULT (date('now','localtime')),
            due_date TEXT DEFAULT '',
            paid_date TEXT DEFAULT '',
            created_by INTEGER,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS time_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            hours REAL DEFAULT 0,
            hourly_rate REAL DEFAULT 0,
            work_date TEXT DEFAULT (date('now','localtime')),
            description TEXT DEFAULT '',
            approved INTEGER NOT NULL DEFAULT 0,
            approved_by INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (approved_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS warranty_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            item_description TEXT DEFAULT '',
            manufacturer TEXT DEFAULT '',
            warranty_start TEXT DEFAULT '',
            warranty_end TEXT DEFAULT '',
            coverage_details TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Expiring Soon','Expired','Claimed')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS warranty_claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            warranty_id INTEGER NOT NULL,
            claim_date TEXT DEFAULT (date('now','localtime')),
            description TEXT DEFAULT '',
            resolution TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','In Progress','Resolved','Denied')),
            FOREIGN KEY (warranty_id) REFERENCES warranty_items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS service_calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER,
            caller_name TEXT DEFAULT '',
            caller_phone TEXT DEFAULT '',
            caller_email TEXT DEFAULT '',
            description TEXT DEFAULT '',
            priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low','Normal','High','Urgent')),
            status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Assigned','In Progress','Resolved','Closed')),
            assigned_to INTEGER,
            resolution TEXT DEFAULT '',
            scheduled_date TEXT DEFAULT '',
            resolved_date TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
            FOREIGN KEY (assigned_to) REFERENCES users(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS howto_articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT '',
            category TEXT DEFAULT '',
            content TEXT DEFAULT '',
            tags TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS code_books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL DEFAULT '',
            edition TEXT DEFAULT '',
            description TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS code_sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            section_number TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            content TEXT DEFAULT '',
            parent_section_id INTEGER,
            depth INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (book_id) REFERENCES code_books(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_section_id) REFERENCES code_sections(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS code_bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            section_id INTEGER NOT NULL,
            note TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (section_id) REFERENCES code_sections(id) ON DELETE CASCADE,
            UNIQUE(user_id, section_id)
        );

        /* ─── Notifications ─── */

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL DEFAULT 'system',
            title TEXT NOT NULL,
            message TEXT DEFAULT '',
            link TEXT DEFAULT '',
            is_read INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        /* ─── Bids ─── */

        CREATE TABLE IF NOT EXISTS bids (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER,
            bid_name TEXT NOT NULL,
            status TEXT DEFAULT 'Draft',
            project_type TEXT DEFAULT 'Multi-Family',

            /* System counts */
            num_apartments INTEGER DEFAULT 0,
            num_non_apartment_systems INTEGER DEFAULT 0,
            num_mini_splits INTEGER DEFAULT 0,
            has_clubhouse INTEGER DEFAULT 0,
            clubhouse_systems INTEGER DEFAULT 0,
            clubhouse_tons REAL DEFAULT 0,
            total_systems INTEGER DEFAULT 0,
            total_tons REAL DEFAULT 0,
            price_per_ton REAL DEFAULT 0,

            /* Materials */
            material_cost REAL DEFAULT 0,

            /* Labor */
            man_hours_per_system REAL DEFAULT 20,
            rough_in_hours REAL DEFAULT 15,
            ahu_install_hours REAL DEFAULT 1,
            condenser_install_hours REAL DEFAULT 1,
            trim_out_hours REAL DEFAULT 1,
            startup_hours REAL DEFAULT 2,
            total_man_hours REAL DEFAULT 0,
            crew_size INTEGER DEFAULT 4,
            hours_per_day REAL DEFAULT 8,
            duration_days REAL DEFAULT 0,
            num_weeks REAL DEFAULT 0,
            labor_rate_per_hour REAL DEFAULT 37,
            labor_cost_per_unit REAL DEFAULT 0,
            labor_cost REAL DEFAULT 0,

            /* Per Diem */
            job_mileage REAL DEFAULT 0,
            per_diem_rate REAL DEFAULT 0,
            per_diem_days REAL DEFAULT 0,
            per_diem_total REAL DEFAULT 0,

            /* Overhead */
            insurance_cost REAL DEFAULT 0,
            permit_cost REAL DEFAULT 0,
            management_fee REAL DEFAULT 0,
            pay_schedule_pct REAL DEFAULT 0.33,

            /* Profit */
            company_profit_pct REAL DEFAULT 0,
            company_profit REAL DEFAULT 0,
            subtotal REAL DEFAULT 0,
            total_bid REAL DEFAULT 0,
            total_cost_to_build REAL DEFAULT 0,
            net_profit REAL DEFAULT 0,

            /* Calculated per-unit */
            cost_per_apartment REAL DEFAULT 0,
            cost_per_system REAL DEFAULT 0,
            labor_cost_per_apartment REAL DEFAULT 0,
            labor_cost_per_system REAL DEFAULT 0,
            suggested_apartment_bid REAL DEFAULT 0,
            suggested_clubhouse_bid REAL DEFAULT 0,

            /* Bid info */
            contracting_gc TEXT DEFAULT '',
            gc_attention TEXT DEFAULT '',
            bid_number TEXT DEFAULT '',
            bid_date TEXT DEFAULT '',
            bid_workup_date TEXT DEFAULT '',
            bid_due_date TEXT DEFAULT '',
            bid_submitted_date TEXT DEFAULT '',
            lead_name TEXT DEFAULT '',

            /* Content */
            inclusions TEXT DEFAULT '',
            exclusions TEXT DEFAULT '',
            bid_description TEXT DEFAULT '',
            notes TEXT DEFAULT '',

            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS bid_partners (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bid_id INTEGER NOT NULL,
            partner_name TEXT NOT NULL,
            profit_pct REAL DEFAULT 0,
            profit_amount REAL DEFAULT 0,
            FOREIGN KEY (bid_id) REFERENCES bids(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS bid_personnel (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bid_id INTEGER NOT NULL,
            user_id INTEGER,
            name TEXT NOT NULL,
            role TEXT DEFAULT '',
            hourly_rate REAL DEFAULT 0,
            FOREIGN KEY (bid_id) REFERENCES bids(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        /* ─── Chat ─── */

        CREATE TABLE IF NOT EXISTS chat_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT DEFAULT 'New Chat',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        );

        /* ─── Pay Applications (AIA G702/G703) ─── */

        CREATE TABLE IF NOT EXISTS pay_app_contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            gc_name TEXT DEFAULT '',
            gc_address TEXT DEFAULT '',
            project_name TEXT DEFAULT '',
            project_address TEXT DEFAULT '',
            project_no TEXT DEFAULT '',
            contract_for TEXT DEFAULT '',
            contract_date TEXT DEFAULT '',
            original_contract_sum REAL DEFAULT 0,
            retainage_work_pct REAL DEFAULT 10,
            retainage_stored_pct REAL DEFAULT 0,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS pay_app_sov_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_id INTEGER NOT NULL,
            item_number INTEGER NOT NULL DEFAULT 0,
            description TEXT NOT NULL DEFAULT '',
            scheduled_value REAL DEFAULT 0,
            is_header INTEGER NOT NULL DEFAULT 0,
            retainage_exempt INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (contract_id) REFERENCES pay_app_contracts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS pay_applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_id INTEGER NOT NULL,
            application_number INTEGER NOT NULL DEFAULT 1,
            period_to TEXT DEFAULT '',
            application_date TEXT DEFAULT '',
            co_additions REAL DEFAULT 0,
            co_deductions REAL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'Draft'
                CHECK(status IN ('Draft','Submitted','Approved','Paid')),
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (contract_id) REFERENCES pay_app_contracts(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS pay_app_line_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pay_app_id INTEGER NOT NULL,
            sov_item_id INTEGER NOT NULL,
            work_this_period REAL DEFAULT 0,
            materials_stored REAL DEFAULT 0,
            FOREIGN KEY (pay_app_id) REFERENCES pay_applications(id) ON DELETE CASCADE,
            FOREIGN KEY (sov_item_id) REFERENCES pay_app_sov_items(id) ON DELETE CASCADE,
            UNIQUE(pay_app_id, sov_item_id)
        );

        /* ─── Equipment Manuals ─── */

        CREATE TABLE IF NOT EXISTS equipment_manuals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            manufacturer TEXT NOT NULL DEFAULT '',
            model_number TEXT NOT NULL DEFAULT '',
            manual_type TEXT DEFAULT 'Installation',
            title TEXT DEFAULT '',
            file_path TEXT DEFAULT '',
            external_url TEXT DEFAULT '',
            uploaded_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (uploaded_by) REFERENCES users(id)
        );

        /* ─── Job Schedule Events ─── */

        CREATE TABLE IF NOT EXISTS job_schedule_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            phase_name TEXT NOT NULL DEFAULT '',
            description TEXT DEFAULT '',
            start_date TEXT DEFAULT '',
            end_date TEXT DEFAULT '',
            assigned_to INTEGER,
            status TEXT NOT NULL DEFAULT 'Pending'
                CHECK(status IN ('Pending','In Progress','Complete','Cancelled')),
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (assigned_to) REFERENCES users(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        /* ─── Recurring Expenses ─── */

        CREATE TABLE IF NOT EXISTS recurring_expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL DEFAULT '',
            vendor TEXT DEFAULT '',
            description TEXT DEFAULT '',
            amount REAL DEFAULT 0,
            frequency TEXT NOT NULL DEFAULT 'Monthly'
                CHECK(frequency IN ('Weekly','Bi-Weekly','Monthly','Quarterly','Annual')),
            due_day INTEGER DEFAULT 1,
            start_date TEXT DEFAULT '',
            end_date TEXT DEFAULT '',
            is_active INTEGER DEFAULT 1,
            last_paid_date TEXT DEFAULT '',
            next_due_date TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS recurring_expense_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recurring_expense_id INTEGER NOT NULL,
            amount_paid REAL DEFAULT 0,
            payment_date TEXT DEFAULT (date('now','localtime')),
            payment_method TEXT DEFAULT '',
            reference_number TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_by INTEGER,
            FOREIGN KEY (recurring_expense_id) REFERENCES recurring_expenses(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        /* ─── Licenses ─── */

        CREATE TABLE IF NOT EXISTS licenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            license_type TEXT NOT NULL DEFAULT '',
            license_name TEXT NOT NULL DEFAULT '',
            license_number TEXT DEFAULT '',
            issuing_body TEXT DEFAULT '',
            holder_name TEXT DEFAULT '',
            issue_date TEXT DEFAULT '',
            expiration_date TEXT DEFAULT '',
            renewal_cost REAL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'Active'
                CHECK(status IN ('Active','Expiring Soon','Expired','Pending Renewal')),
            notes TEXT DEFAULT '',
            file_path TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        /* ─── RFIs ─── */

        CREATE TABLE IF NOT EXISTS rfis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            rfi_number INTEGER NOT NULL DEFAULT 1,
            subject TEXT NOT NULL DEFAULT '',
            question TEXT DEFAULT '',
            answer TEXT DEFAULT '',
            requested_by TEXT DEFAULT '',
            assigned_to INTEGER,
            status TEXT NOT NULL DEFAULT 'Open'
                CHECK(status IN ('Open','Answered','Closed')),
            date_submitted TEXT DEFAULT (date('now','localtime')),
            date_required TEXT DEFAULT '',
            date_answered TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (assigned_to) REFERENCES users(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        /* ─── Change Orders ─── */

        CREATE TABLE IF NOT EXISTS change_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            co_number INTEGER NOT NULL DEFAULT 1,
            title TEXT NOT NULL DEFAULT '',
            scope_description TEXT DEFAULT '',
            reason TEXT DEFAULT '',
            amount REAL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'Draft'
                CHECK(status IN ('Draft','Submitted','Approved','Rejected','Void')),
            submitted_date TEXT DEFAULT '',
            approved_date TEXT DEFAULT '',
            approved_by TEXT DEFAULT '',
            gc_name TEXT DEFAULT '',
            pay_app_contract_id INTEGER,
            sov_item_id INTEGER,
            proposal_file TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (pay_app_contract_id) REFERENCES pay_app_contracts(id),
            FOREIGN KEY (sov_item_id) REFERENCES pay_app_sov_items(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        /* ─── Submittals ─── */

        CREATE TABLE IF NOT EXISTS submittals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            submittal_number INTEGER NOT NULL DEFAULT 1,
            spec_section TEXT DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            vendor TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Pending'
                CHECK(status IN ('Pending','Submitted','Approved','Approved as Noted','Rejected','Resubmit')),
            revision_number INTEGER DEFAULT 0,
            date_submitted TEXT DEFAULT '',
            date_required TEXT DEFAULT '',
            date_returned TEXT DEFAULT '',
            reviewer TEXT DEFAULT '',
            reviewer_comments TEXT DEFAULT '',
            file_path TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        /* ─── Documents (Closeout) ─── */

        CREATE TABLE IF NOT EXISTS closeout_checklists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            item_name TEXT NOT NULL DEFAULT '',
            item_type TEXT DEFAULT 'Other'
                CHECK(item_type IN ('O&M Manual','Warranty Letter','As-Built','Test Report',
                      'Lien Waiver','Certificate of Completion','Start-Up Report',
                      'Balancing Report','Permit','Other')),
            status TEXT NOT NULL DEFAULT 'Not Started'
                CHECK(status IN ('Not Started','In Progress','Complete','N/A')),
            file_path TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS transmittals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            transmittal_number INTEGER NOT NULL DEFAULT 1,
            to_company TEXT DEFAULT '',
            to_attention TEXT DEFAULT '',
            subject TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            sent_date TEXT DEFAULT '',
            sent_via TEXT DEFAULT 'Email'
                CHECK(sent_via IN ('Email','Hand Delivered','Mail','FedEx','Other')),
            proposal_file TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        /* ─── Indexes ─── */
        CREATE INDEX IF NOT EXISTS idx_line_items_job ON line_items(job_id);
        CREATE INDEX IF NOT EXISTS idx_received_line ON received_entries(line_item_id);
        CREATE INDEX IF NOT EXISTS idx_shipped_line ON shipped_entries(line_item_id);
        CREATE INDEX IF NOT EXISTS idx_invoiced_line ON invoiced_entries(line_item_id);
        CREATE INDEX IF NOT EXISTS idx_versions_job ON versions(job_id);
        CREATE INDEX IF NOT EXISTS idx_expenses_job ON expenses(job_id);
        CREATE INDEX IF NOT EXISTS idx_payments_job ON payments(job_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_job ON client_invoices(job_id);
        CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
        CREATE INDEX IF NOT EXISTS idx_time_entries_job ON time_entries(job_id);
        CREATE INDEX IF NOT EXISTS idx_warranty_items_job ON warranty_items(job_id);
        CREATE INDEX IF NOT EXISTS idx_warranty_claims_warranty ON warranty_claims(warranty_id);
        CREATE INDEX IF NOT EXISTS idx_service_calls_job ON service_calls(job_id);
        CREATE INDEX IF NOT EXISTS idx_service_calls_assigned ON service_calls(assigned_to);
        CREATE INDEX IF NOT EXISTS idx_howto_category ON howto_articles(category);
        CREATE INDEX IF NOT EXISTS idx_code_sections_book ON code_sections(book_id);
        CREATE INDEX IF NOT EXISTS idx_code_sections_parent ON code_sections(parent_section_id);
        CREATE INDEX IF NOT EXISTS idx_code_bookmarks_user ON code_bookmarks(user_id);
        CREATE INDEX IF NOT EXISTS idx_code_bookmarks_section ON code_bookmarks(section_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
        CREATE INDEX IF NOT EXISTS idx_bids_job ON bids(job_id);
        CREATE INDEX IF NOT EXISTS idx_bid_partners_bid ON bid_partners(bid_id);
        CREATE INDEX IF NOT EXISTS idx_bid_personnel_bid ON bid_personnel(bid_id);
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_pay_app_contracts_job ON pay_app_contracts(job_id);
        CREATE INDEX IF NOT EXISTS idx_pay_app_sov_contract ON pay_app_sov_items(contract_id);
        CREATE INDEX IF NOT EXISTS idx_pay_applications_contract ON pay_applications(contract_id);
        CREATE INDEX IF NOT EXISTS idx_pay_app_entries_app ON pay_app_line_entries(pay_app_id);
        CREATE INDEX IF NOT EXISTS idx_pay_app_entries_sov ON pay_app_line_entries(sov_item_id);
        CREATE INDEX IF NOT EXISTS idx_equipment_manuals_manufacturer ON equipment_manuals(manufacturer);
        CREATE INDEX IF NOT EXISTS idx_equipment_manuals_model ON equipment_manuals(model_number);
        CREATE INDEX IF NOT EXISTS idx_schedule_events_job ON job_schedule_events(job_id);
        CREATE INDEX IF NOT EXISTS idx_schedule_events_assigned ON job_schedule_events(assigned_to);
        CREATE INDEX IF NOT EXISTS idx_recurring_expenses_active ON recurring_expenses(is_active);
        CREATE INDEX IF NOT EXISTS idx_recurring_expense_payments_expense ON recurring_expense_payments(recurring_expense_id);
        CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
        CREATE INDEX IF NOT EXISTS idx_rfis_job ON rfis(job_id);
        CREATE INDEX IF NOT EXISTS idx_change_orders_job ON change_orders(job_id);
        CREATE INDEX IF NOT EXISTS idx_submittals_job ON submittals(job_id);
        CREATE INDEX IF NOT EXISTS idx_closeout_checklists_job ON closeout_checklists(job_id);
        CREATE INDEX IF NOT EXISTS idx_transmittals_job ON transmittals(job_id);
    ''')

    # Migration: add total_net_price column if missing
    cols = [row[1] for row in conn.execute("PRAGMA table_info(line_items)").fetchall()]
    if 'total_net_price' not in cols:
        conn.execute("ALTER TABLE line_items ADD COLUMN total_net_price REAL DEFAULT 0")

    # Migration: add address/tax columns to jobs if missing
    job_cols = [row[1] for row in conn.execute("PRAGMA table_info(jobs)").fetchall()]
    for col, typedef in [
        ('address', "TEXT DEFAULT ''"),
        ('city', "TEXT DEFAULT ''"),
        ('state', "TEXT DEFAULT ''"),
        ('zip_code', "TEXT DEFAULT ''"),
        ('tax_rate', "REAL DEFAULT 0"),
        ('supplier_account', "TEXT DEFAULT ''"),
    ]:
        if col not in job_cols:
            conn.execute(f"ALTER TABLE jobs ADD COLUMN {col} {typedef}")

    # Migration: add content column to code_sections if missing
    code_cols = [row[1] for row in conn.execute("PRAGMA table_info(code_sections)").fetchall()]
    if 'content' not in code_cols:
        conn.execute("ALTER TABLE code_sections ADD COLUMN content TEXT DEFAULT ''")

    # Migration: convert old statuses to new pipeline stages
    conn.execute("UPDATE jobs SET status = 'Needs Bid' WHERE status = 'Active'")
    conn.execute("UPDATE jobs SET status = 'In Progress' WHERE status = 'On Hold'")

    # Seed default admin user if no users exist
    user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if user_count == 0:
        from werkzeug.security import generate_password_hash
        conn.execute(
            '''INSERT INTO users (username, display_name, password_hash, role, email)
               VALUES (?, ?, ?, ?, ?)''',
            ('admin', 'Administrator', generate_password_hash('admin'), 'owner', '')
        )

    # Seed code books if none exist
    book_count = conn.execute("SELECT COUNT(*) FROM code_books").fetchone()[0]
    if book_count == 0:
        _seed_code_books(conn)

    conn.commit()
    conn.close()


def _seed_code_books(conn):
    """Seed the 8 standard construction code books with chapter-level TOC."""
    books = [
        {
            'code': 'IBC',
            'name': 'International Building Code',
            'edition': '2021',
            'description': 'The International Building Code (IBC) is a model code that provides minimum requirements for building systems using prescriptive and performance-related provisions.',
            'chapters': [
                ('1', 'Scope and Administration'),
                ('2', 'Definitions'),
                ('3', 'Use and Occupancy Classification'),
                ('4', 'Special Detailed Requirements Based on Occupancy and Use'),
                ('5', 'General Building Heights and Areas'),
                ('6', 'Types of Construction'),
                ('7', 'Fire and Smoke Protection Features'),
                ('8', 'Interior Finishes'),
                ('9', 'Fire Protection and Life Safety Systems'),
                ('10', 'Means of Egress'),
                ('11', 'Accessibility'),
                ('12', 'Interior Environment'),
                ('13', 'Energy Efficiency'),
                ('14', 'Exterior Walls'),
                ('15', 'Roof Assemblies and Rooftop Structures'),
                ('16', 'Structural Design'),
                ('17', 'Special Inspections and Tests'),
                ('18', 'Soils and Foundations'),
                ('19', 'Concrete'),
                ('20', 'Aluminum'),
                ('21', 'Masonry'),
                ('22', 'Steel'),
                ('23', 'Wood'),
                ('24', 'Glass and Glazing'),
                ('25', 'Gypsum Board, Gypsum Panel Products and Plaster'),
                ('26', 'Plastic'),
                ('27', 'Electrical'),
                ('28', 'Mechanical Systems'),
                ('29', 'Plumbing Systems'),
                ('30', 'Elevators and Conveying Systems'),
                ('31', 'Special Construction'),
                ('32', 'Encroachments Into the Public Right-of-Way'),
                ('33', 'Safeguards During Construction'),
                ('34', 'Existing Buildings and Structures'),
                ('35', 'Referenced Standards'),
            ],
        },
        {
            'code': 'IRC',
            'name': 'International Residential Code',
            'edition': '2021',
            'description': 'The International Residential Code (IRC) is a comprehensive, stand-alone residential code for one- and two-family dwellings and townhouses.',
            'chapters': [
                ('1', 'Scope and Administration'),
                ('2', 'Definitions'),
                ('3', 'Building Planning'),
                ('4', 'Foundations'),
                ('5', 'Floors'),
                ('6', 'Wall Construction'),
                ('7', 'Wall Covering'),
                ('8', 'Roof-Ceiling Construction'),
                ('9', 'Roof Assemblies'),
                ('10', 'Chimneys and Fireplaces'),
                ('11', 'Energy Efficiency'),
                ('12', 'Mechanical Administration'),
                ('13', 'General Mechanical System Requirements'),
                ('14', 'Heating and Cooling Equipment and Appliances'),
                ('15', 'Exhaust Systems'),
                ('16', 'Duct Systems'),
                ('17', 'Combustion Air'),
                ('18', 'Chimneys and Vents'),
                ('19', 'Special Appliances, Equipment and Systems'),
                ('20', 'Boilers and Water Heaters'),
                ('21', 'Hydronic Piping'),
                ('22', 'Special Piping and Storage Systems'),
                ('23', 'Solar Thermal Energy Systems'),
                ('24', 'Fuel Gas'),
                ('25', 'Plumbing Administration'),
                ('26', 'General Plumbing Requirements'),
                ('27', 'Plumbing Fixtures'),
                ('28', 'Water Heaters'),
                ('29', 'Water Supply and Distribution'),
                ('30', 'Sanitary Drainage'),
                ('31', 'Vents'),
                ('32', 'Traps'),
                ('33', 'Storm Drainage'),
                ('34', 'General Requirements (Electrical)'),
                ('35', 'Electrical Definitions'),
                ('36', 'Services'),
                ('37', 'Branch Circuit and Feeder Requirements'),
                ('38', 'Wiring Methods'),
                ('39', 'Power and Lighting Distribution'),
                ('40', 'Devices and Luminaires'),
                ('41', 'Appliance Installation'),
                ('42', 'Swimming Pools'),
                ('43', 'Class 2 Remote-Control, Signaling and Power-Limited Circuits'),
                ('44', 'Referenced Standards'),
            ],
        },
        {
            'code': 'NEC',
            'name': 'National Electrical Code',
            'edition': '2023',
            'description': 'NFPA 70, the National Electrical Code (NEC) is the benchmark for safe electrical design, installation, and inspection.',
            'chapters': [
                ('1', 'General'),
                ('2', 'Wiring and Protection'),
                ('3', 'Wiring Methods and Materials'),
                ('4', 'Equipment for General Use'),
                ('5', 'Special Occupancies'),
                ('6', 'Special Equipment'),
                ('7', 'Special Conditions'),
                ('8', 'Communications Systems'),
                ('9', 'Tables'),
            ],
        },
        {
            'code': 'IPC',
            'name': 'International Plumbing Code',
            'edition': '2021',
            'description': 'The International Plumbing Code (IPC) sets minimum regulations for plumbing facilities in terms of performance objectives and prescriptive requirements.',
            'chapters': [
                ('1', 'Scope and Administration'),
                ('2', 'Definitions'),
                ('3', 'General Regulations'),
                ('4', 'Fixtures, Faucets and Fixture Fittings'),
                ('5', 'Water Heaters'),
                ('6', 'Water Supply and Distribution'),
                ('7', 'Sanitary Drainage'),
                ('8', 'Indirect/Special Waste'),
                ('9', 'Vents'),
                ('10', 'Traps, Interceptors and Separators'),
                ('11', 'Storm Drainage'),
                ('12', 'Special Piping and Storage Systems'),
                ('13', 'Referenced Standards'),
            ],
        },
        {
            'code': 'IMC',
            'name': 'International Mechanical Code',
            'edition': '2021',
            'description': 'The International Mechanical Code (IMC) establishes minimum requirements for mechanical systems using prescriptive and performance-related provisions.',
            'chapters': [
                ('1', 'Scope and Administration'),
                ('2', 'Definitions'),
                ('3', 'General Regulations'),
                ('4', 'Ventilation'),
                ('5', 'Exhaust Systems'),
                ('6', 'Duct Systems'),
                ('7', 'Combustion Air'),
                ('8', 'Chimneys and Vents'),
                ('9', 'Specific Appliances, Fireplaces and Solid Fuel-Burning Equipment'),
                ('10', 'Boilers, Water Heaters and Pressure Vessels'),
                ('11', 'Refrigeration'),
                ('12', 'Hydronic Piping'),
                ('13', 'Fuel Oil Piping and Storage'),
                ('14', 'Solar Thermal Energy Systems'),
                ('15', 'Referenced Standards'),
            ],
        },
        {
            'code': 'IECC',
            'name': 'International Energy Conservation Code',
            'edition': '2021',
            'description': 'The International Energy Conservation Code (IECC) establishes minimum energy efficiency requirements for new buildings and additions/alterations to existing buildings.',
            'chapters': [
                ('C1', 'Commercial - Scope and Administration'),
                ('C2', 'Commercial - Definitions'),
                ('C3', 'Commercial - General Requirements'),
                ('C4', 'Commercial Energy Efficiency'),
                ('C5', 'Commercial - Referenced Standards'),
                ('R1', 'Residential - Scope and Administration'),
                ('R2', 'Residential - Definitions'),
                ('R3', 'Residential - General Requirements'),
                ('R4', 'Residential Energy Efficiency'),
                ('R5', 'Residential - Referenced Standards'),
            ],
        },
        {
            'code': 'IFGC',
            'name': 'International Fuel Gas Code',
            'edition': '2021',
            'description': 'The International Fuel Gas Code (IFGC) addresses the design and installation of fuel gas systems and gas-fired appliances.',
            'chapters': [
                ('1', 'Scope and Administration'),
                ('2', 'Definitions'),
                ('3', 'General Regulations'),
                ('4', 'Gas Piping Installations'),
                ('5', 'Chimneys and Vents'),
                ('6', 'Specific Appliances'),
                ('7', 'Gaseous Hydrogen Systems'),
                ('8', 'Referenced Standards'),
            ],
        },
        {
            'code': 'OSHA',
            'name': 'OSHA Construction Standards',
            'edition': '29 CFR 1926',
            'description': 'OSHA Construction Industry Standards (29 CFR 1926) cover safety and health regulations for the construction industry.',
            'chapters': [
                ('A', 'General'),
                ('B', 'General Interpretations'),
                ('C', 'General Safety and Health Provisions'),
                ('D', 'Occupational Health and Environmental Controls'),
                ('E', 'Personal Protective and Lifesaving Equipment'),
                ('F', 'Fire Protection and Prevention'),
                ('G', 'Signs, Signals and Barricades'),
                ('H', 'Materials Handling, Storage, Use and Disposal'),
                ('I', 'Tools — Hand and Power'),
                ('J', 'Welding and Cutting'),
                ('K', 'Electrical'),
                ('L', 'Scaffolds'),
                ('M', 'Fall Protection'),
                ('N', 'Helicopters, Hoists, Elevators and Conveyors'),
                ('O', 'Motor Vehicles, Mechanized Equipment and Marine Operations'),
                ('P', 'Excavations'),
                ('Q', 'Concrete and Masonry Construction'),
                ('R', 'Steel Erection'),
                ('S', 'Underground Construction, Caissons, Cofferdams and Compressed Air'),
                ('T', 'Demolition'),
                ('U', 'Blasting and the Use of Explosives'),
                ('V', 'Power Transmission and Distribution'),
                ('W', 'Rollover Protective Structures; Overhead Protection'),
                ('X', 'Stairways and Ladders'),
                ('Z', 'Toxic and Hazardous Substances'),
                ('AA', 'Reserved'),
                ('CC', 'Cranes and Derricks in Construction'),
            ],
        },
    ]

    for book in books:
        cursor = conn.execute(
            'INSERT INTO code_books (code, name, edition, description) VALUES (?, ?, ?, ?)',
            (book['code'], book['name'], book['edition'], book['description'])
        )
        book_id = cursor.lastrowid

        for sort_idx, (section_num, title) in enumerate(book['chapters']):
            conn.execute(
                '''INSERT INTO code_sections (book_id, section_number, title, parent_section_id, depth, sort_order)
                   VALUES (?, ?, ?, NULL, 0, ?)''',
                (book_id, section_num, title, sort_idx)
            )


def build_snapshot(conn, job_id):
    """Build a complete JSON snapshot of a job's current state."""
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    if not job:
        return None

    line_items = conn.execute(
        'SELECT * FROM line_items WHERE job_id = ? ORDER BY line_number', (job_id,)
    ).fetchall()

    snapshot = {
        'job': {
            'id': job['id'],
            'name': job['name'],
            'status': job['status'],
            'address': job['address'] or '',
            'city': job['city'] or '',
            'state': job['state'] or '',
            'zip_code': job['zip_code'] or '',
            'tax_rate': job['tax_rate'] or 0,
        },
        'line_items': [],
    }

    for li in line_items:
        item = {
            'line_number': li['line_number'],
            'stock_ns': li['stock_ns'],
            'sku': li['sku'],
            'description': li['description'],
            'quote_qty': li['quote_qty'],
            'qty_ordered': li['qty_ordered'],
            'price_per': li['price_per'],
            'total_net_price': li['total_net_price'] or 0,
            'received': {},
            'shipped': {},
            'invoiced': {},
        }

        for entry in conn.execute(
            'SELECT column_number, quantity, entry_date FROM received_entries WHERE line_item_id = ?',
            (li['id'],)
        ).fetchall():
            item['received'][str(entry['column_number'])] = {
                'quantity': entry['quantity'],
                'entry_date': entry['entry_date'],
            }

        for entry in conn.execute(
            'SELECT column_number, quantity, entry_date FROM shipped_entries WHERE line_item_id = ?',
            (li['id'],)
        ).fetchall():
            item['shipped'][str(entry['column_number'])] = {
                'quantity': entry['quantity'],
                'entry_date': entry['entry_date'],
            }

        for entry in conn.execute(
            'SELECT column_number, quantity, entry_date FROM invoiced_entries WHERE line_item_id = ?',
            (li['id'],)
        ).fetchall():
            item['invoiced'][str(entry['column_number'])] = {
                'quantity': entry['quantity'],
                'entry_date': entry['entry_date'],
            }

        snapshot['line_items'].append(item)

    return snapshot

def save_snapshot(conn, job_id, description='Auto-save'):
    """Save current state as a version snapshot, then clean up old versions."""
    snapshot = build_snapshot(conn, job_id)
    if snapshot is None:
        return
    conn.execute(
        'INSERT INTO versions (job_id, snapshot, description) VALUES (?, ?, ?)',
        (job_id, json.dumps(snapshot), description)
    )
    # Keep only the last 100 versions per job
    conn.execute('''
        DELETE FROM versions WHERE job_id = ? AND id NOT IN (
            SELECT id FROM versions WHERE job_id = ? ORDER BY created_at DESC LIMIT 100
        )
    ''', (job_id, job_id))

def restore_snapshot(conn, job_id, snapshot_data):
    """Restore a job from a snapshot dict."""
    # Update job info
    sj = snapshot_data['job']
    conn.execute(
        '''UPDATE jobs SET name = ?, status = ?, address = ?, city = ?, state = ?, zip_code = ?, tax_rate = ?,
           updated_at = datetime("now","localtime") WHERE id = ?''',
        (sj['name'], sj['status'], sj.get('address', ''), sj.get('city', ''),
         sj.get('state', ''), sj.get('zip_code', ''), sj.get('tax_rate', 0), job_id)
    )

    # Delete all existing line items (cascades to entries)
    conn.execute('DELETE FROM line_items WHERE job_id = ?', (job_id,))

    # Re-create line items and entries
    for item in snapshot_data['line_items']:
        cursor = conn.execute(
            '''INSERT INTO line_items (job_id, line_number, stock_ns, sku, description, quote_qty, qty_ordered, price_per, total_net_price)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (job_id, item['line_number'], item['stock_ns'], item['sku'],
             item['description'], item['quote_qty'], item['qty_ordered'], item['price_per'],
             item.get('total_net_price', 0))
        )
        li_id = cursor.lastrowid

        for col, entry in item.get('received', {}).items():
            conn.execute(
                'INSERT INTO received_entries (line_item_id, column_number, quantity, entry_date) VALUES (?, ?, ?, ?)',
                (li_id, int(col), entry['quantity'], entry['entry_date'])
            )
        for col, entry in item.get('shipped', {}).items():
            conn.execute(
                'INSERT INTO shipped_entries (line_item_id, column_number, quantity, entry_date) VALUES (?, ?, ?, ?)',
                (li_id, int(col), entry['quantity'], entry['entry_date'])
            )
        for col, entry in item.get('invoiced', {}).items():
            conn.execute(
                'INSERT INTO invoiced_entries (line_item_id, column_number, quantity, entry_date) VALUES (?, ?, ?, ?)',
                (li_id, int(col), entry['quantity'], entry['entry_date'])
            )

def get_job_data(conn, job_id):
    """Get full job data with all computed fields for the API."""
    job = conn.execute('SELECT * FROM jobs WHERE id = ?', (job_id,)).fetchone()
    if not job:
        return None

    line_items = conn.execute(
        'SELECT * FROM line_items WHERE job_id = ? ORDER BY line_number', (job_id,)
    ).fetchall()

    items = []
    for li in line_items:
        stored_net = li['total_net_price'] or 0
        total_net_price = stored_net if stored_net else (li['qty_ordered'] or 0) * (li['price_per'] or 0)

        received = conn.execute(
            'SELECT column_number, quantity, entry_date FROM received_entries WHERE line_item_id = ? ORDER BY column_number',
            (li['id'],)
        ).fetchall()
        shipped = conn.execute(
            'SELECT column_number, quantity, entry_date FROM shipped_entries WHERE line_item_id = ? ORDER BY column_number',
            (li['id'],)
        ).fetchall()
        invoiced = conn.execute(
            'SELECT column_number, quantity, entry_date FROM invoiced_entries WHERE line_item_id = ? ORDER BY column_number',
            (li['id'],)
        ).fetchall()

        total_received = sum(r['quantity'] or 0 for r in received)
        total_shipped = sum(s['quantity'] or 0 for s in shipped)
        total_invoiced = sum(i['quantity'] or 0 for i in invoiced)

        item = {
            'id': li['id'],
            'line_number': li['line_number'],
            'stock_ns': li['stock_ns'] or '',
            'sku': li['sku'] or '',
            'description': li['description'] or '',
            'quote_qty': li['quote_qty'] or 0,
            'qty_ordered': li['qty_ordered'] or 0,
            'price_per': li['price_per'] or 0,
            'total_net_price': round(total_net_price, 2),
            'total_received': total_received,
            'total_shipped': total_shipped,
            'total_invoiced': total_invoiced,
            'received_entries': {str(r['column_number']): {'quantity': r['quantity'], 'entry_date': r['entry_date']} for r in received},
            'shipped_entries': {str(s['column_number']): {'quantity': s['quantity'], 'entry_date': s['entry_date']} for s in shipped},
            'invoiced_entries': {str(i['column_number']): {'quantity': i['quantity'], 'entry_date': i['entry_date']} for i in invoiced},
        }
        items.append(item)

    return {
        'job': {
            'id': job['id'],
            'name': job['name'],
            'status': job['status'],
            'created_at': job['created_at'],
            'updated_at': job['updated_at'],
            'address': job['address'] or '',
            'city': job['city'] or '',
            'state': job['state'] or '',
            'zip_code': job['zip_code'] or '',
            'tax_rate': job['tax_rate'] or 0,
        },
        'line_items': items,
    }
