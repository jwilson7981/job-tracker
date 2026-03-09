import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'jobs.db')

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
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
            column_number INTEGER NOT NULL CHECK(column_number BETWEEN 1 AND 200),
            quantity REAL DEFAULT 0,
            entry_date TEXT,
            FOREIGN KEY (line_item_id) REFERENCES line_items(id) ON DELETE CASCADE,
            UNIQUE(line_item_id, column_number)
        );

        CREATE TABLE IF NOT EXISTS shipped_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            line_item_id INTEGER NOT NULL,
            column_number INTEGER NOT NULL CHECK(column_number BETWEEN 1 AND 200),
            quantity REAL DEFAULT 0,
            entry_date TEXT,
            FOREIGN KEY (line_item_id) REFERENCES line_items(id) ON DELETE CASCADE,
            UNIQUE(line_item_id, column_number)
        );

        CREATE TABLE IF NOT EXISTS invoiced_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            line_item_id INTEGER NOT NULL,
            column_number INTEGER NOT NULL CHECK(column_number BETWEEN 1 AND 200),
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
            role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('owner','admin','project_manager','warehouse','employee','supplier')),
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

        CREATE TABLE IF NOT EXISTS bid_proposal_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bid_id INTEGER NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            amount REAL DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (bid_id) REFERENCES bids(id) ON DELETE CASCADE
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

        /* ─── Bid Takeoff ─── */

        CREATE TABLE IF NOT EXISTS bid_commercial_takeoff_systems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bid_id INTEGER NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            system_count INTEGER NOT NULL DEFAULT 1,
            tons REAL NOT NULL DEFAULT 0,
            cfm REAL NOT NULL DEFAULT 0,
            supply_runs INTEGER NOT NULL DEFAULT 0,
            return_runs INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (bid_id) REFERENCES bids(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS bid_commercial_takeoff_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bid_id INTEGER NOT NULL,
            phase TEXT NOT NULL DEFAULT 'Rough-In',
            category TEXT NOT NULL DEFAULT '',
            part_name TEXT NOT NULL DEFAULT '',
            sku TEXT DEFAULT '',
            unit_price REAL NOT NULL DEFAULT 0,
            calc_basis TEXT NOT NULL DEFAULT 'per_system'
                CHECK(calc_basis IN ('per_system','per_supply_run','per_return_run',
                    'per_total_run','by_tonnage','fixed','per_ton_total')),
            qty_multiplier REAL NOT NULL DEFAULT 1,
            tons_match REAL DEFAULT NULL,
            waste_pct REAL NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            qty_override REAL DEFAULT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            notes TEXT DEFAULT '',
            FOREIGN KEY (bid_id) REFERENCES bids(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS bid_takeoff_unit_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bid_id INTEGER NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            unit_count INTEGER NOT NULL DEFAULT 0,
            bedrooms INTEGER NOT NULL DEFAULT 1,
            bathrooms INTEGER NOT NULL DEFAULT 1,
            drops_8in INTEGER NOT NULL DEFAULT 0,
            drops_6in INTEGER NOT NULL DEFAULT 0,
            stories INTEGER NOT NULL DEFAULT 1,
            tons REAL NOT NULL DEFAULT 0,
            cfm REAL NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (bid_id) REFERENCES bids(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS bid_takeoff_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bid_id INTEGER NOT NULL,
            phase TEXT NOT NULL DEFAULT 'Rough-In',
            category TEXT NOT NULL DEFAULT '',
            part_name TEXT NOT NULL DEFAULT '',
            sku TEXT DEFAULT '',
            unit_price REAL NOT NULL DEFAULT 0,
            calc_basis TEXT NOT NULL DEFAULT 'per_system'
                CHECK(calc_basis IN ('per_system','per_bedroom','per_bathroom',
                    'per_8in_drop','per_6in_drop','per_total_drop','by_tonnage','fixed')),
            qty_multiplier REAL NOT NULL DEFAULT 1,
            tons_match REAL DEFAULT NULL,
            waste_pct REAL NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            qty_override REAL DEFAULT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            notes TEXT DEFAULT '',
            FOREIGN KEY (bid_id) REFERENCES bids(id) ON DELETE CASCADE
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

        /* ─── Saved Schedule Plans ─── */

        CREATE TABLE IF NOT EXISTS schedule_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            plan_name TEXT NOT NULL DEFAULT '',
            deadline_date TEXT NOT NULL,
            hours_per_day INTEGER DEFAULT 10,
            crew_override INTEGER,
            plan_data TEXT NOT NULL DEFAULT '{}',
            summary_data TEXT NOT NULL DEFAULT '{}',
            weather_data TEXT NOT NULL DEFAULT '[]',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
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

        /* ─── Submittal Library (shared PDFs across jobs) ─── */

        CREATE TABLE IF NOT EXISTS submittal_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT '',
            file_path TEXT DEFAULT '',
            file_hash TEXT DEFAULT '',
            vendor TEXT DEFAULT '',
            category TEXT DEFAULT '',
            description TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE INDEX IF NOT EXISTS idx_submittal_files_hash ON submittal_files(file_hash);

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

        /* ─── Contracts ─── */

        CREATE TABLE IF NOT EXISTS contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            contractor TEXT DEFAULT '',
            contract_type TEXT DEFAULT 'Prime'
                CHECK(contract_type IN ('Prime','Sub','Vendor')),
            file_path TEXT DEFAULT '',
            upload_date TEXT DEFAULT '',
            value REAL DEFAULT 0,
            status TEXT DEFAULT 'Draft'
                CHECK(status IN ('Draft','Active','Complete','Terminated')),
            notes TEXT DEFAULT '',
            ai_review TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        /* ─── BillTrust Integration ─── */

        CREATE TABLE IF NOT EXISTS billtrust_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_name TEXT NOT NULL DEFAULT '',
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

        /* ─── Invoice Review Flags ─── */

        CREATE TABLE IF NOT EXISTS invoice_review_flags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER,
            invoice_number TEXT NOT NULL DEFAULT '',
            job_id INTEGER,
            supplier_name TEXT DEFAULT '',
            severity TEXT NOT NULL DEFAULT 'info'
                CHECK(severity IN ('error','warning','info')),
            category TEXT NOT NULL DEFAULT '',
            message TEXT NOT NULL DEFAULT '',
            resolved INTEGER NOT NULL DEFAULT 0,
            resolved_by INTEGER,
            resolved_at TEXT,
            import_batch TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id) ON DELETE SET NULL,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
            FOREIGN KEY (resolved_by) REFERENCES users(id)
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

        /* ─── Payroll Runs ─── */

        CREATE TABLE IF NOT EXISTS payroll_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_number INTEGER NOT NULL,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            check_date TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Finalized')),
            notes TEXT DEFAULT '',
            total_hours REAL DEFAULT 0,
            total_gross_pay REAL DEFAULT 0,
            created_by INTEGER,
            finalized_by INTEGER,
            finalized_at TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (created_by) REFERENCES users(id),
            FOREIGN KEY (finalized_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS payroll_run_employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payroll_run_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            hourly_rate REAL DEFAULT 0,
            regular_hours REAL DEFAULT 0,
            overtime_hours REAL DEFAULT 0,
            total_hours REAL DEFAULT 0,
            gross_pay REAL DEFAULT 0,
            check_number TEXT DEFAULT '',
            check_date TEXT DEFAULT '',
            check_printed INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(payroll_run_id, user_id)
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
        CREATE INDEX IF NOT EXISTS idx_contracts_job ON contracts(job_id);
        CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
        CREATE INDEX IF NOT EXISTS idx_billtrust_config_active ON billtrust_config(is_active);
        CREATE INDEX IF NOT EXISTS idx_supplier_invoices_config ON supplier_invoices(supplier_config_id);
        CREATE INDEX IF NOT EXISTS idx_supplier_invoices_job ON supplier_invoices(job_id);
        CREATE INDEX IF NOT EXISTS idx_supplier_invoices_number ON supplier_invoices(invoice_number);
        CREATE INDEX IF NOT EXISTS idx_invoice_flags_invoice ON invoice_review_flags(invoice_id);
        CREATE INDEX IF NOT EXISTS idx_invoice_flags_job ON invoice_review_flags(job_id);
        CREATE INDEX IF NOT EXISTS idx_invoice_flags_resolved ON invoice_review_flags(resolved);
        CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(status);
        CREATE INDEX IF NOT EXISTS idx_payroll_run_employees_run ON payroll_run_employees(payroll_run_id);
        CREATE INDEX IF NOT EXISTS idx_payroll_run_employees_user ON payroll_run_employees(user_id);

        /* ─── Plans ─── */

        CREATE TABLE IF NOT EXISTS plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            file_path TEXT DEFAULT '',
            upload_date TEXT DEFAULT '',
            plan_type TEXT DEFAULT 'Mechanical'
                CHECK(plan_type IN ('Mechanical','Architectural','Structural','Plumbing','Electrical','Site','Full Set')),
            status TEXT DEFAULT 'Uploaded'
                CHECK(status IN ('Uploaded','Reviewing','Reviewed','Takeoff Complete')),
            notes TEXT DEFAULT '',
            ai_review TEXT DEFAULT '',
            takeoff_data TEXT DEFAULT '',
            page_count INTEGER DEFAULT 0,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_plans_job ON plans(job_id);
        CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);

        /* ─── Customers (Phase 1) ─── */

        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            company_type TEXT NOT NULL DEFAULT 'General Contractor'
                CHECK(company_type IN ('General Contractor','Developer','Owner','Subcontractor','Supplier','Other')),
            primary_contact TEXT DEFAULT '',
            contact_email TEXT DEFAULT '',
            contact_phone TEXT DEFAULT '',
            address TEXT DEFAULT '',
            city TEXT DEFAULT '',
            state TEXT DEFAULT '',
            zip_code TEXT DEFAULT '',
            website TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS customer_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            title TEXT DEFAULT '',
            email TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            is_primary INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active);
        CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(company_type);
        CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts(customer_id);

        /* ─── Vendors ─── */

        CREATE TABLE IF NOT EXISTS vendors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            vendor_type TEXT NOT NULL DEFAULT 'Supplier'
                CHECK(vendor_type IN ('Supplier','Manufacturer','Distributor','Rental','Subcontractor','Other')),
            account_number TEXT DEFAULT '',
            payment_terms TEXT DEFAULT '',
            primary_contact TEXT DEFAULT '',
            contact_email TEXT DEFAULT '',
            contact_phone TEXT DEFAULT '',
            address TEXT DEFAULT '',
            city TEXT DEFAULT '',
            state TEXT DEFAULT '',
            zip_code TEXT DEFAULT '',
            website TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS vendor_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendor_id INTEGER NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            title TEXT DEFAULT '',
            email TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            is_primary INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_vendors_active ON vendors(is_active);
        CREATE INDEX IF NOT EXISTS idx_vendors_type ON vendors(vendor_type);
        CREATE INDEX IF NOT EXISTS idx_vendor_contacts_vendor ON vendor_contacts(vendor_id);

        /* ─── Supplier Quotes (Phase 2) ─── */

        CREATE TABLE IF NOT EXISTS supplier_quotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            plan_id INTEGER,
            supplier_name TEXT NOT NULL DEFAULT '',
            supplier_config_id INTEGER,
            quote_number TEXT DEFAULT '',
            quote_date TEXT DEFAULT '',
            expiration_date TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Requested'
                CHECK(status IN ('Requested','Received','Reviewing','Selected','Rejected','Expired')),
            subtotal REAL DEFAULT 0,
            tax_amount REAL DEFAULT 0,
            freight REAL DEFAULT 0,
            total REAL DEFAULT 0,
            notes TEXT DEFAULT '',
            file_path TEXT DEFAULT '',
            is_baseline INTEGER NOT NULL DEFAULT 0,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL,
            FOREIGN KEY (supplier_config_id) REFERENCES billtrust_config(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS supplier_quote_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quote_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL DEFAULT 0,
            sku TEXT DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            quantity REAL DEFAULT 0,
            unit_price REAL DEFAULT 0,
            extended_price REAL DEFAULT 0,
            takeoff_sku TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            FOREIGN KEY (quote_id) REFERENCES supplier_quotes(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_supplier_quotes_job ON supplier_quotes(job_id);
        CREATE INDEX IF NOT EXISTS idx_supplier_quotes_status ON supplier_quotes(status);
        CREATE INDEX IF NOT EXISTS idx_supplier_quote_items_quote ON supplier_quote_items(quote_id);
        CREATE INDEX IF NOT EXISTS idx_sqi_takeoff_sku ON supplier_quote_items(takeoff_sku);

        /* ─── Pricing Reviews ─── */

        CREATE TABLE IF NOT EXISTS pricing_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quote_id INTEGER NOT NULL,
            review_data TEXT NOT NULL DEFAULT '{}',
            total_savings_low REAL DEFAULT 0,
            total_savings_high REAL DEFAULT 0,
            items_reviewed INTEGER DEFAULT 0,
            items_with_savings INTEGER DEFAULT 0,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (quote_id) REFERENCES supplier_quotes(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_pricing_reviews_quote ON pricing_reviews(quote_id);

        /* ─── Inventory (Phase 3) ─── */

        CREATE TABLE IF NOT EXISTS inventory_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sku TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            category TEXT DEFAULT '',
            quantity_on_hand REAL NOT NULL DEFAULT 0,
            unit TEXT DEFAULT 'each',
            location TEXT DEFAULT 'Warehouse',
            reorder_point REAL DEFAULT 0,
            last_count_date TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS inventory_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            inventory_item_id INTEGER NOT NULL,
            transaction_type TEXT NOT NULL CHECK(transaction_type IN ('receive','issue','adjust','count','return')),
            quantity REAL NOT NULL DEFAULT 0,
            job_id INTEGER,
            reference TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON inventory_items(sku);
        CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category);
        CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item ON inventory_transactions(inventory_item_id);
        CREATE INDEX IF NOT EXISTS idx_inventory_transactions_job ON inventory_transactions(job_id);

        /* ─── Bid Follow-ups & Precon Meetings (Phase 4) ─── */

        CREATE TABLE IF NOT EXISTS bid_followups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bid_id INTEGER NOT NULL,
            followup_date TEXT NOT NULL,
            followup_type TEXT DEFAULT 'Call' CHECK(followup_type IN ('Call','Email','In Person','Other')),
            notes TEXT DEFAULT '',
            result TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Scheduled' CHECK(status IN ('Scheduled','Completed','Skipped')),
            assigned_to INTEGER,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (bid_id) REFERENCES bids(id) ON DELETE CASCADE,
            FOREIGN KEY (assigned_to) REFERENCES users(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS precon_meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL UNIQUE,
            meeting_date TEXT DEFAULT '',
            attendees TEXT DEFAULT '',
            location TEXT DEFAULT '',
            agenda TEXT DEFAULT '',
            minutes TEXT DEFAULT '',
            gc_contact TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Not Scheduled'
                CHECK(status IN ('Not Scheduled','Scheduled','Completed')),
            file_path TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_bid_followups_bid ON bid_followups(bid_id);
        CREATE INDEX IF NOT EXISTS idx_bid_followups_date ON bid_followups(followup_date);
        CREATE INDEX IF NOT EXISTS idx_precon_meetings_job ON precon_meetings(job_id);

        /* ─── BillTrust Sync Log (Phase 5) ─── */

        CREATE TABLE IF NOT EXISTS billtrust_sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            config_id INTEGER NOT NULL,
            sync_type TEXT DEFAULT 'manual',
            invoices_found INTEGER DEFAULT 0,
            invoices_new INTEGER DEFAULT 0,
            invoices_updated INTEGER DEFAULT 0,
            duplicates_found INTEGER DEFAULT 0,
            errors TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (config_id) REFERENCES billtrust_config(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_billtrust_sync_log_config ON billtrust_sync_log(config_id);

        /* ─── Material Requests (Phase 6) ─── */

        CREATE TABLE IF NOT EXISTS material_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            requested_by INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'Pending'
                CHECK(status IN ('Pending','Approved','Fulfilled','Partial','Rejected','Cancelled')),
            priority TEXT NOT NULL DEFAULT 'Normal'
                CHECK(priority IN ('Low','Normal','High','Urgent')),
            needed_by TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            approved_by INTEGER,
            approved_at TEXT DEFAULT '',
            fulfilled_by INTEGER,
            fulfilled_at TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (requested_by) REFERENCES users(id),
            FOREIGN KEY (approved_by) REFERENCES users(id),
            FOREIGN KEY (fulfilled_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS material_request_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            sku TEXT DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            quantity_requested REAL DEFAULT 0,
            quantity_approved REAL DEFAULT 0,
            quantity_fulfilled REAL DEFAULT 0,
            unit TEXT DEFAULT 'each',
            notes TEXT DEFAULT '',
            inventory_item_id INTEGER,
            FOREIGN KEY (request_id) REFERENCES material_requests(id) ON DELETE CASCADE,
            FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE SET NULL
        );

        /* ─── PM Benchmarks (Phase 6) ─── */

        CREATE TABLE IF NOT EXISTS pm_benchmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            phase TEXT NOT NULL DEFAULT '',
            task_name TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Not Started'
                CHECK(status IN ('Not Started','In Progress','Complete','N/A')),
            completed_date TEXT DEFAULT '',
            completed_by INTEGER,
            notes TEXT DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (completed_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_material_requests_job ON material_requests(job_id);
        CREATE INDEX IF NOT EXISTS idx_material_requests_status ON material_requests(status);
        CREATE INDEX IF NOT EXISTS idx_material_request_items_request ON material_request_items(request_id);
        CREATE INDEX IF NOT EXISTS idx_pm_benchmarks_job ON pm_benchmarks(job_id);
        CREATE INDEX IF NOT EXISTS idx_pm_benchmarks_phase ON pm_benchmarks(phase);

        /* ─── Lien Waivers ─── */

        CREATE TABLE IF NOT EXISTS lien_waivers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            waiver_number INTEGER NOT NULL DEFAULT 1,
            waiver_type TEXT NOT NULL DEFAULT 'Conditional Progress'
                CHECK(waiver_type IN ('Conditional Progress','Unconditional Progress',
                                      'Conditional Final','Unconditional Final')),
            waiver_date TEXT DEFAULT '',
            title_company TEXT DEFAULT '',
            file_number TEXT DEFAULT '',
            state TEXT DEFAULT '',
            county TEXT DEFAULT '',
            contract_amount REAL DEFAULT 0,
            previous_payments REAL DEFAULT 0,
            current_payment REAL DEFAULT 0,
            contract_balance REAL DEFAULT 0,
            claimant TEXT DEFAULT 'LGHVAC Mechanical, LLC',
            against_company TEXT DEFAULT '',
            premises_description TEXT DEFAULT '',
            through_date TEXT DEFAULT '',
            signer_name TEXT DEFAULT '',
            signer_title TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Draft'
                CHECK(status IN ('Draft','Sent','Executed')),
            notes TEXT DEFAULT '',
            file_path TEXT DEFAULT '',
            proposal_file TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        /* ─── Feedback Requests ─── */

        CREATE TABLE IF NOT EXISTS feedback_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            category TEXT NOT NULL DEFAULT 'Feature'
                CHECK(category IN ('Bug','Feature','Improvement','Question')),
            priority TEXT NOT NULL DEFAULT 'Medium'
                CHECK(priority IN ('Low','Medium','High')),
            status TEXT NOT NULL DEFAULT 'New'
                CHECK(status IN ('New','Under Review','Planned','In Progress','Complete','Wont Fix')),
            submitted_by INTEGER NOT NULL,
            owner_response TEXT DEFAULT '',
            upvotes INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (submitted_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS feedback_upvotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            feedback_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            FOREIGN KEY (feedback_id) REFERENCES feedback_requests(id) ON DELETE CASCADE,
            UNIQUE(feedback_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_lien_waivers_job ON lien_waivers(job_id);
        CREATE INDEX IF NOT EXISTS idx_lien_waivers_status ON lien_waivers(status);
        CREATE INDEX IF NOT EXISTS idx_lien_waivers_type ON lien_waivers(waiver_type);
        CREATE INDEX IF NOT EXISTS idx_feedback_submitted_by ON feedback_requests(submitted_by);
        CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback_requests(status);
        CREATE INDEX IF NOT EXISTS idx_feedback_upvotes_fid ON feedback_upvotes(feedback_id);

        /* ─── Job Pipeline (32-Step Workflow) ─── */

        CREATE TABLE IF NOT EXISTS job_pipeline_steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            step_number INTEGER NOT NULL,
            step_name TEXT NOT NULL,
            step_category TEXT NOT NULL DEFAULT 'bidding',
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','active','complete','skipped','blocked')),
            completed_date TEXT,
            completed_by INTEGER,
            notes TEXT DEFAULT '',
            linked_module TEXT DEFAULT '',
            linked_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (completed_by) REFERENCES users(id),
            UNIQUE(job_id, step_number)
        );

        CREATE INDEX IF NOT EXISTS idx_pipeline_job ON job_pipeline_steps(job_id);
        CREATE INDEX IF NOT EXISTS idx_pipeline_status ON job_pipeline_steps(status);

        /* ─── Delivery Receipts (Material Receiving) ─── */

        CREATE TABLE IF NOT EXISTS delivery_receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            delivery_date TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            supplier_name TEXT DEFAULT '',
            po_number TEXT DEFAULT '',
            received_by INTEGER,
            notes TEXT DEFAULT '',
            shortage_notes TEXT DEFAULT '',
            photo_path TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (received_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_delivery_receipts_job ON delivery_receipts(job_id);

        /* ─── Job Photos ─── */

        CREATE TABLE IF NOT EXISTS job_photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            thumbnail_path TEXT DEFAULT '',
            caption TEXT DEFAULT '',
            category TEXT NOT NULL DEFAULT 'General'
                CHECK(category IN ('General','Rough-In','Trim Out','Startup','Closeout','Issue','Progress','Before','After')),
            taken_date TEXT DEFAULT '',
            uploaded_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (uploaded_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_job_photos_job ON job_photos(job_id);
        CREATE INDEX IF NOT EXISTS idx_job_photos_category ON job_photos(category);

        /* ─── Photo Albums ─── */

        CREATE TABLE IF NOT EXISTS photo_albums (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_photo_albums_job ON photo_albums(job_id);

        /* ─── Material Shipments ─── */

        CREATE TABLE IF NOT EXISTS material_shipments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            phase TEXT NOT NULL DEFAULT 'Rough-In'
                CHECK(phase IN ('Rough-In','Trim Out','Equipment','Startup')),
            shipment_date TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Draft'
                CHECK(status IN ('Draft','Ready','Shipped','Delivered')),
            shipped_by INTEGER,
            notes TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (shipped_by) REFERENCES users(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS material_shipment_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shipment_id INTEGER NOT NULL,
            line_item_id INTEGER,
            sku TEXT DEFAULT '',
            description TEXT DEFAULT '',
            quantity REAL DEFAULT 0,
            quantity_loaded REAL DEFAULT 0,
            notes TEXT DEFAULT '',
            FOREIGN KEY (shipment_id) REFERENCES material_shipments(id) ON DELETE CASCADE,
            FOREIGN KEY (line_item_id) REFERENCES line_items(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_material_shipments_job ON material_shipments(job_id);
        CREATE INDEX IF NOT EXISTS idx_material_shipment_items_ship ON material_shipment_items(shipment_id);

        /* ─── Billing Schedules ─── */

        CREATE TABLE IF NOT EXISTS billing_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            billing_number INTEGER NOT NULL DEFAULT 1,
            description TEXT DEFAULT '',
            scheduled_date TEXT DEFAULT '',
            amount REAL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'Pending'
                CHECK(status IN ('Pending','Ready','Submitted','Paid')),
            pay_app_id INTEGER,
            required_docs TEXT DEFAULT '[]',
            notes TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (pay_app_id) REFERENCES pay_applications(id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_billing_schedules_job ON billing_schedules(job_id);

        /* ─── Certificates of Insurance (COI) ─── */

        CREATE TABLE IF NOT EXISTS certificates_of_insurance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER,
            policy_type TEXT NOT NULL DEFAULT 'General Liability'
                CHECK(policy_type IN ('General Liability','Auto','Workers Comp','Umbrella','Professional','Builders Risk','GL/WC')),
            carrier TEXT DEFAULT '',
            policy_number TEXT DEFAULT '',
            effective_date TEXT DEFAULT '',
            expiration_date TEXT DEFAULT '',
            coverage_amount REAL DEFAULT 0,
            certificate_holder TEXT DEFAULT '',
            file_path TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Active'
                CHECK(status IN ('Active','Expiring Soon','Expired','Renewed')),
            notes TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_coi_job ON certificates_of_insurance(job_id);
        CREATE INDEX IF NOT EXISTS idx_coi_expiration ON certificates_of_insurance(expiration_date);

        /* ─── Delivery Schedules (Supplier) ─── */

        CREATE TABLE IF NOT EXISTS delivery_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            supplier_name TEXT DEFAULT '',
            expected_date TEXT DEFAULT '',
            actual_date TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Scheduled'
                CHECK(status IN ('Scheduled','Confirmed','In Transit','Delivered','Partial','Delayed')),
            items_summary TEXT DEFAULT '',
            tracking_number TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_delivery_schedules_job ON delivery_schedules(job_id);
        CREATE INDEX IF NOT EXISTS idx_delivery_schedules_status ON delivery_schedules(status);

        /* ─── Permits ─── */

        CREATE TABLE IF NOT EXISTS permits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            permit_type TEXT NOT NULL DEFAULT 'Mechanical'
                CHECK(permit_type IN ('Mechanical','Building','Plumbing','Electrical','Fire','Roofing','Demolition','Other')),
            permit_number TEXT DEFAULT '',
            issuing_authority TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Not Applied'
                CHECK(status IN ('Not Applied','Applied','Under Review','Approved','Denied','Expired','N/A')),
            applied_date TEXT DEFAULT '',
            approved_date TEXT DEFAULT '',
            expiration_date TEXT DEFAULT '',
            cost REAL DEFAULT 0,
            inspector_name TEXT DEFAULT '',
            inspector_phone TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            file_path TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS permit_inspections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            permit_id INTEGER NOT NULL,
            inspection_type TEXT NOT NULL DEFAULT 'Rough-In',
            status TEXT NOT NULL DEFAULT 'Scheduled'
                CHECK(status IN ('Scheduled','Passed','Failed','Cancelled','Re-Inspect')),
            scheduled_date TEXT DEFAULT '',
            completed_date TEXT DEFAULT '',
            inspector TEXT DEFAULT '',
            result_notes TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (permit_id) REFERENCES permits(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_permits_job ON permits(job_id);
        CREATE INDEX IF NOT EXISTS idx_permits_status ON permits(status);
        CREATE INDEX IF NOT EXISTS idx_permit_inspections_permit ON permit_inspections(permit_id);
        CREATE INDEX IF NOT EXISTS idx_permit_inspections_status ON permit_inspections(status);

        /* ─── Employee Profiles (HR Data) ─── */

        CREATE TABLE IF NOT EXISTS employee_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            employee_number TEXT DEFAULT '',
            ssn_encrypted TEXT DEFAULT '',
            ssn_last4 TEXT DEFAULT '',
            date_of_birth TEXT DEFAULT '',
            hire_date TEXT DEFAULT '',
            termination_date TEXT DEFAULT '',
            employment_status TEXT NOT NULL DEFAULT 'Active'
                CHECK(employment_status IN ('Active','Inactive','Terminated')),
            address_street TEXT DEFAULT '',
            address_city TEXT DEFAULT '',
            address_state TEXT DEFAULT '',
            address_zip TEXT DEFAULT '',
            shirt_size TEXT DEFAULT '',
            emergency_contact_name TEXT DEFAULT '',
            emergency_contact_phone TEXT DEFAULT '',
            emergency_contact_relationship TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_employee_profiles_user ON employee_profiles(user_id);
        CREATE INDEX IF NOT EXISTS idx_employee_profiles_status ON employee_profiles(employment_status);

        /* ─── Activity Log ─── */

        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL DEFAULT '',
            entity_type TEXT DEFAULT '',
            entity_id INTEGER,
            description TEXT DEFAULT '',
            ip_address TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);

        /* ─── User Sessions (daily heartbeat tracking) ─── */

        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_date TEXT NOT NULL,
            first_seen TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            last_seen TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            page_views INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, session_date)
        );

        CREATE INDEX IF NOT EXISTS idx_user_sessions_user_date ON user_sessions(user_id, session_date);

        /* ─── Team Chat ─── */

        CREATE TABLE IF NOT EXISTS tc_channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT DEFAULT '',
            is_default INTEGER NOT NULL DEFAULT 0,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS tc_channel_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            joined_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (channel_id) REFERENCES tc_channels(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(channel_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS tc_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER,
            sender_id INTEGER NOT NULL,
            dm_recipient_id INTEGER,
            content TEXT DEFAULT '',
            file_path TEXT DEFAULT '',
            file_name TEXT DEFAULT '',
            file_type TEXT DEFAULT '',
            is_system INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (channel_id) REFERENCES tc_channels(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id),
            FOREIGN KEY (dm_recipient_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS tc_read_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            channel_id INTEGER,
            dm_peer_id INTEGER,
            last_read_message_id INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (channel_id) REFERENCES tc_channels(id) ON DELETE CASCADE,
            UNIQUE(user_id, channel_id),
            UNIQUE(user_id, dm_peer_id)
        );

        CREATE INDEX IF NOT EXISTS idx_tc_channel_members_channel ON tc_channel_members(channel_id);
        CREATE INDEX IF NOT EXISTS idx_tc_channel_members_user ON tc_channel_members(user_id);
        CREATE INDEX IF NOT EXISTS idx_tc_messages_channel ON tc_messages(channel_id);
        CREATE INDEX IF NOT EXISTS idx_tc_messages_sender ON tc_messages(sender_id);
        CREATE INDEX IF NOT EXISTS idx_tc_messages_dm ON tc_messages(dm_recipient_id);
        CREATE INDEX IF NOT EXISTS idx_tc_messages_created ON tc_messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_tc_read_status_user ON tc_read_status(user_id);

        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            description TEXT DEFAULT '',
            due_date TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Completed','Dismissed')),
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
        CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);

        CREATE TABLE IF NOT EXISTS training_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            lesson_key TEXT NOT NULL,
            completed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, lesson_key)
        );
        CREATE INDEX IF NOT EXISTS idx_training_progress_user ON training_progress(user_id);

        /* ─── Shared Files (Dropbox Replacement) ─── */

        CREATE TABLE IF NOT EXISTS shared_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id INTEGER DEFAULT NULL,
            name TEXT NOT NULL,
            is_folder INTEGER NOT NULL DEFAULT 0,
            file_path TEXT DEFAULT '',
            file_size INTEGER DEFAULT 0,
            mime_type TEXT DEFAULT '',
            uploaded_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (parent_id) REFERENCES shared_files(id) ON DELETE CASCADE,
            FOREIGN KEY (uploaded_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_shared_files_parent ON shared_files(parent_id);

        /* ─── Project Documents (General File Upload) ─── */

        CREATE TABLE IF NOT EXISTS project_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            file_name TEXT NOT NULL DEFAULT '',
            file_path TEXT DEFAULT '',
            file_size INTEGER DEFAULT 0,
            mime_type TEXT DEFAULT '',
            category TEXT DEFAULT 'Other'
                CHECK(category IN ('Supplier Quote','Plans','Specs','Submittal','Contract','Invoice','Photo','Other')),
            notes TEXT DEFAULT '',
            uploaded_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (uploaded_by) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_project_documents_job ON project_documents(job_id);

        CREATE TABLE IF NOT EXISTS email_autocomplete (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            used_count INTEGER NOT NULL DEFAULT 1,
            last_used_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
    ''')

    # Migration: add total_net_price, pricing_type, notes columns if missing
    cols = [row[1] for row in conn.execute("PRAGMA table_info(line_items)").fetchall()]
    if 'total_net_price' not in cols:
        conn.execute("ALTER TABLE line_items ADD COLUMN total_net_price REAL DEFAULT 0")
    if 'pricing_type' not in cols:
        conn.execute("ALTER TABLE line_items ADD COLUMN pricing_type TEXT DEFAULT 'each'")
    if 'notes' not in cols:
        conn.execute("ALTER TABLE line_items ADD COLUMN notes TEXT DEFAULT ''")

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

    # Migration: add missing columns to billtrust_config if table was created earlier
    bt_cols = [row[1] for row in conn.execute("PRAGMA table_info(billtrust_config)").fetchall()]
    if bt_cols:  # table exists
        for col, typedef in [
            ('use_mock', "INTEGER NOT NULL DEFAULT 0"),
            ('last_sync_at', "TEXT"),
            ('client_id', "TEXT NOT NULL DEFAULT ''"),
            ('client_secret', "TEXT NOT NULL DEFAULT ''"),
            ('is_active', "INTEGER NOT NULL DEFAULT 1"),
        ]:
            if col not in bt_cols:
                conn.execute(f"ALTER TABLE billtrust_config ADD COLUMN {col} {typedef}")
        # Ensure existing configs default to mock mode if use_mock was just added
        if 'use_mock' not in bt_cols:
            conn.execute("UPDATE billtrust_config SET use_mock = 1")

    # Migration: add missing columns to supplier_invoices if table was created earlier
    si_cols = [row[1] for row in conn.execute("PRAGMA table_info(supplier_invoices)").fetchall()]
    if si_cols:  # table exists
        for col, typedef in [
            ('billtrust_id', "TEXT DEFAULT ''"),
            ('subtotal', "REAL DEFAULT 0"),
            ('tax_amount', "REAL DEFAULT 0"),
            ('total', "REAL DEFAULT 0"),
            ('amount_paid', "REAL DEFAULT 0"),
            ('balance_due', "REAL DEFAULT 0"),
            ('paid_date', "TEXT"),
            ('notes', "TEXT DEFAULT ''"),
            ('po_number', "TEXT DEFAULT ''"),
        ]:
            if col not in si_cols:
                conn.execute(f"ALTER TABLE supplier_invoices ADD COLUMN {col} {typedef}")
        # Also add created_at/updated_at if missing
        for col, typedef in [
            ('created_at', "TEXT NOT NULL DEFAULT (datetime('now','localtime'))"),
            ('updated_at', "TEXT NOT NULL DEFAULT (datetime('now','localtime'))"),
        ]:
            if col not in si_cols:
                conn.execute(f"ALTER TABLE supplier_invoices ADD COLUMN {col} {typedef}")

    # Migration: convert old statuses to new pipeline stages
    conn.execute("UPDATE jobs SET status = 'Needs Bid' WHERE status = 'Active'")
    conn.execute("UPDATE jobs SET status = 'In Progress' WHERE status = 'On Hold'")

    # Migration: add customer_id, awarded_date, project_manager_id to jobs (Phase 1)
    job_cols = [row[1] for row in conn.execute("PRAGMA table_info(jobs)").fetchall()]
    for col, typedef in [
        ('customer_id', "INTEGER"),
        ('awarded_date', "TEXT DEFAULT ''"),
        ('project_manager_id', "INTEGER"),
    ]:
        if col not in job_cols:
            conn.execute(f"ALTER TABLE jobs ADD COLUMN {col} {typedef}")

    # Migration: add customer_id to bids (Phase 1)
    bid_cols = [row[1] for row in conn.execute("PRAGMA table_info(bids)").fetchall()]
    if 'customer_id' not in bid_cols:
        conn.execute("ALTER TABLE bids ADD COLUMN customer_id INTEGER")

    # Migration: add profit_mode and profit_per_system to bids
    if 'profit_mode' not in bid_cols:
        conn.execute("ALTER TABLE bids ADD COLUMN profit_mode TEXT DEFAULT 'percentage'")
    if 'profit_per_system' not in bid_cols:
        conn.execute("ALTER TABLE bids ADD COLUMN profit_per_system REAL DEFAULT 0")
    if 'actual_bid_override' not in bid_cols:
        conn.execute("ALTER TABLE bids ADD COLUMN actual_bid_override REAL DEFAULT 0")
    if 'bid_type' not in bid_cols:
        conn.execute("ALTER TABLE bids ADD COLUMN bid_type TEXT DEFAULT ''")
    if 'labor_cost_override' not in bid_cols:
        conn.execute("ALTER TABLE bids ADD COLUMN labor_cost_override REAL DEFAULT 0")
    if 'admin_costs' not in bid_cols:
        conn.execute("ALTER TABLE bids ADD COLUMN admin_costs REAL DEFAULT 0")
    if 'admin_costs_notes' not in bid_cols:
        conn.execute("ALTER TABLE bids ADD COLUMN admin_costs_notes TEXT DEFAULT ''")
    if 'housing_rate' not in bid_cols:
        conn.execute("ALTER TABLE bids ADD COLUMN housing_rate REAL DEFAULT 0")
    if 'housing_months' not in bid_cols:
        conn.execute("ALTER TABLE bids ADD COLUMN housing_months REAL DEFAULT 0")
    if 'housing_total' not in bid_cols:
        conn.execute("ALTER TABLE bids ADD COLUMN housing_total REAL DEFAULT 0")

    # Migration: add material cost breakdown columns to bids
    for col, typedef in [
        ('material_subtotal', "REAL DEFAULT 0"),
        ('material_shipping', "REAL DEFAULT 0"),
        ('material_tax_rate', "REAL DEFAULT 0"),
    ]:
        if col not in bid_cols:
            conn.execute(f"ALTER TABLE bids ADD COLUMN {col} {typedef}")

    # Migration: add duplicate/quote columns to supplier_invoices (Phase 5)
    si_cols2 = [row[1] for row in conn.execute("PRAGMA table_info(supplier_invoices)").fetchall()]
    for col, typedef in [
        ('duplicate_hash', "TEXT DEFAULT ''"),
        ('is_duplicate', "INTEGER NOT NULL DEFAULT 0"),
        ('duplicate_of_id', "INTEGER"),
        ('supplier_quote_id', "INTEGER"),
    ]:
        if col not in si_cols2:
            conn.execute(f"ALTER TABLE supplier_invoices ADD COLUMN {col} {typedef}")

    # Migration: add columns to time_entries (Phase 7)
    te_cols = [row[1] for row in conn.execute("PRAGMA table_info(time_entries)").fetchall()]
    for col, typedef in [
        ('pay_period', "TEXT DEFAULT ''"),
        ('entry_type', "TEXT DEFAULT 'regular'"),
    ]:
        if col not in te_cols:
            conn.execute(f"ALTER TABLE time_entries ADD COLUMN {col} {typedef}")

    # Migration: add columns to equipment_manuals (Phase 8)
    em_cols = [row[1] for row in conn.execute("PRAGMA table_info(equipment_manuals)").fetchall()]
    for col, typedef in [
        ('brand', "TEXT DEFAULT ''"),
        ('equipment_type', "TEXT DEFAULT ''"),
        ('tonnage', "TEXT DEFAULT ''"),
        ('fuel_type', "TEXT DEFAULT ''"),
        ('tags', "TEXT DEFAULT ''"),
    ]:
        if col not in em_cols:
            conn.execute(f"ALTER TABLE equipment_manuals ADD COLUMN {col} {typedef}")

    # Migration: add columns to code_sections (Phase 8)
    cs_cols = [row[1] for row in conn.execute("PRAGMA table_info(code_sections)").fetchall()]
    for col, typedef in [
        ('source_url', "TEXT DEFAULT ''"),
        ('is_complete', "INTEGER NOT NULL DEFAULT 0"),
    ]:
        if col not in cs_cols:
            conn.execute(f"ALTER TABLE code_sections ADD COLUMN {col} {typedef}")

    # Migration: add submittal_file_id to submittals for library linking
    sub_cols = [row[1] for row in conn.execute("PRAGMA table_info(submittals)").fetchall()]
    if 'submittal_file_id' not in sub_cols:
        conn.execute("ALTER TABLE submittals ADD COLUMN submittal_file_id INTEGER")

    # Migration: add file_hash column to tables for duplicate detection
    for tbl in ('plans', 'supplier_quotes', 'contracts', 'licenses', 'closeout_checklists'):
        tbl_cols = [row[1] for row in conn.execute(f"PRAGMA table_info({tbl})").fetchall()]
        if 'file_hash' not in tbl_cols:
            conn.execute(f"ALTER TABLE {tbl} ADD COLUMN file_hash TEXT DEFAULT ''")
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{tbl}_file_hash ON {tbl}(file_hash)")

    # Migration: pricing_reviews table
    try:
        conn.execute("SELECT 1 FROM pricing_reviews LIMIT 0")
    except Exception:
        conn.execute("""CREATE TABLE IF NOT EXISTS pricing_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quote_id INTEGER NOT NULL,
            review_data TEXT NOT NULL DEFAULT '{}',
            total_savings_low REAL DEFAULT 0,
            total_savings_high REAL DEFAULT 0,
            items_reviewed INTEGER DEFAULT 0,
            items_with_savings INTEGER DEFAULT 0,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (quote_id) REFERENCES supplier_quotes(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pricing_reviews_quote ON pricing_reviews(quote_id)")

    # Migration: add dependency/planning columns to job_schedule_events
    sched_cols = [row[1] for row in conn.execute("PRAGMA table_info(job_schedule_events)").fetchall()]
    if 'depends_on' not in sched_cols:
        conn.execute("ALTER TABLE job_schedule_events ADD COLUMN depends_on INTEGER")
    if 'estimated_hours' not in sched_cols:
        conn.execute("ALTER TABLE job_schedule_events ADD COLUMN estimated_hours REAL DEFAULT 0")
    if 'crew_size' not in sched_cols:
        conn.execute("ALTER TABLE job_schedule_events ADD COLUMN crew_size INTEGER DEFAULT 1")
    if 'pct_complete' not in sched_cols:
        conn.execute("ALTER TABLE job_schedule_events ADD COLUMN pct_complete INTEGER DEFAULT 0")

    # Migration: schedule_plans table
    existing_tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    if 'schedule_plans' not in existing_tables:
        conn.execute("""CREATE TABLE IF NOT EXISTS schedule_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            plan_name TEXT NOT NULL DEFAULT '',
            deadline_date TEXT NOT NULL,
            hours_per_day INTEGER DEFAULT 10,
            crew_override INTEGER,
            plan_data TEXT NOT NULL DEFAULT '{}',
            summary_data TEXT NOT NULL DEFAULT '{}',
            weather_data TEXT NOT NULL DEFAULT '[]',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )""")

    # Migration: add verification columns to supplier_invoices
    si_cols3 = [row[1] for row in conn.execute("PRAGMA table_info(supplier_invoices)").fetchall()]
    for col, typedef in [
        ('verification_status', "TEXT DEFAULT ''"),
        ('verification_data', "TEXT DEFAULT '{}'"),
    ]:
        if col not in si_cols3:
            conn.execute(f"ALTER TABLE supplier_invoices ADD COLUMN {col} {typedef}")

    # Migration: add pay_app_id to lien_waivers
    lw_cols = [row[1] for row in conn.execute("PRAGMA table_info(lien_waivers)").fetchall()]
    if 'pay_app_id' not in lw_cols:
        conn.execute("ALTER TABLE lien_waivers ADD COLUMN pay_app_id INTEGER")

    # Migration: add days_to_pay to client_invoices
    ci_cols = [row[1] for row in conn.execute("PRAGMA table_info(client_invoices)").fetchall()]
    if 'days_to_pay' not in ci_cols:
        conn.execute("ALTER TABLE client_invoices ADD COLUMN days_to_pay INTEGER")

    # Migration: add must_change_password to users
    u_cols = [row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()]
    if 'must_change_password' not in u_cols:
        conn.execute("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0")

    # Migration: add first_name, last_name, home_base_city to users
    u_cols = [row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()]
    if 'first_name' not in u_cols:
        conn.execute("ALTER TABLE users ADD COLUMN first_name TEXT DEFAULT ''")
        conn.execute("ALTER TABLE users ADD COLUMN last_name TEXT DEFAULT ''")
        conn.execute("ALTER TABLE users ADD COLUMN home_base_city TEXT DEFAULT ''")
        # Populate first_name/last_name from existing display_name
        users = conn.execute("SELECT id, display_name FROM users").fetchall()
        for u in users:
            parts = (u['display_name'] or '').strip().split(' ', 1)
            fn = parts[0] if parts else ''
            ln = parts[1] if len(parts) > 1 else ''
            conn.execute("UPDATE users SET first_name = ?, last_name = ? WHERE id = ?", (fn, ln, u['id']))

    # Migration: add 'supplier' to users role CHECK constraint
    role_check = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").fetchone()
    if role_check and 'supplier' not in role_check[0]:
        conn.execute("PRAGMA writable_schema = ON")
        conn.execute("""UPDATE sqlite_master SET sql = REPLACE(sql,
            "role IN ('owner','admin','project_manager','warehouse','employee')",
            "role IN ('owner','admin','project_manager','warehouse','employee','supplier')")
            WHERE type='table' AND name='users'""")
        conn.execute("PRAGMA writable_schema = OFF")
        conn.execute("PRAGMA integrity_check")
        conn.commit()

    # Migration: expand column_number CHECK to 200 on entry tables
    for tbl in ['received_entries', 'shipped_entries', 'invoiced_entries']:
        tbl_sql = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (tbl,)).fetchone()
        if tbl_sql:
            for old_limit in ['BETWEEN 1 AND 15', 'BETWEEN 1 AND 50']:
                if old_limit in tbl_sql[0]:
                    conn.execute("PRAGMA writable_schema = ON")
                    conn.execute("""UPDATE sqlite_master SET sql = REPLACE(sql,
                        ?, 'BETWEEN 1 AND 200')
                        WHERE type='table' AND name=?""", (old_limit, tbl))
                    conn.execute("PRAGMA writable_schema = OFF")
                    break
    conn.execute("PRAGMA integrity_check")
    conn.commit()

    # Migration: Team Pay tables (internal progress-based payroll)
    existing_tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    if 'team_pay_schedules' not in existing_tables:
        conn.execute("""CREATE TABLE IF NOT EXISTS team_pay_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL UNIQUE,
            total_job_value REAL NOT NULL DEFAULT 0,
            notes TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_team_pay_schedules_job ON team_pay_schedules(job_id)")

    if 'team_pay_members' not in existing_tables:
        conn.execute("""CREATE TABLE IF NOT EXISTS team_pay_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            scheduled_amount REAL NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (schedule_id) REFERENCES team_pay_schedules(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(schedule_id, user_id)
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_team_pay_members_schedule ON team_pay_members(schedule_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_team_pay_members_user ON team_pay_members(user_id)")

    if 'team_pay_periods' not in existing_tables:
        conn.execute("""CREATE TABLE IF NOT EXISTS team_pay_periods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_id INTEGER NOT NULL,
            period_number INTEGER NOT NULL,
            payment_date TEXT NOT NULL DEFAULT (date('now','localtime')),
            source_payment_id INTEGER,
            source_amount REAL DEFAULT 0,
            notes TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Finalized')),
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (schedule_id) REFERENCES team_pay_schedules(id) ON DELETE CASCADE,
            FOREIGN KEY (source_payment_id) REFERENCES payments(id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_team_pay_periods_schedule ON team_pay_periods(schedule_id)")

    if 'team_pay_entries' not in existing_tables:
        conn.execute("""CREATE TABLE IF NOT EXISTS team_pay_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period_id INTEGER NOT NULL,
            member_id INTEGER NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            FOREIGN KEY (period_id) REFERENCES team_pay_periods(id) ON DELETE CASCADE,
            FOREIGN KEY (member_id) REFERENCES team_pay_members(id) ON DELETE CASCADE,
            UNIQUE(period_id, member_id)
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_team_pay_entries_period ON team_pay_entries(period_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_team_pay_entries_member ON team_pay_entries(member_id)")

    # Migration: material_requests.phase, material_request_items.line_item_id, material_request_items.order_needed
    mr_cols = [row[1] for row in conn.execute("PRAGMA table_info(material_requests)").fetchall()]
    if 'phase' not in mr_cols:
        conn.execute("ALTER TABLE material_requests ADD COLUMN phase TEXT DEFAULT ''")
    mri_cols = [row[1] for row in conn.execute("PRAGMA table_info(material_request_items)").fetchall()]
    if 'line_item_id' not in mri_cols:
        conn.execute("ALTER TABLE material_request_items ADD COLUMN line_item_id INTEGER")
    if 'order_needed' not in mri_cols:
        conn.execute("ALTER TABLE material_request_items ADD COLUMN order_needed INTEGER DEFAULT 0")

    # Migration: add vendor_id to billtrust_config and supplier_quotes
    bt_cols2 = [row[1] for row in conn.execute("PRAGMA table_info(billtrust_config)").fetchall()]
    if 'vendor_id' not in bt_cols2:
        conn.execute("ALTER TABLE billtrust_config ADD COLUMN vendor_id INTEGER")
    sq_cols = [row[1] for row in conn.execute("PRAGMA table_info(supplier_quotes)").fetchall()]
    if 'vendor_id' not in sq_cols:
        conn.execute("ALTER TABLE supplier_quotes ADD COLUMN vendor_id INTEGER")

    # Migration: move customers with company_type='Supplier' into vendors table
    existing_tables2 = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    if 'vendors' in existing_tables2:
        supplier_custs = conn.execute("SELECT * FROM customers WHERE company_type = 'Supplier'").fetchall()
        for sc in supplier_custs:
            # Check if already migrated (by company_name)
            existing = conn.execute("SELECT id FROM vendors WHERE company_name = ?", (sc['company_name'],)).fetchone()
            if existing:
                continue
            cursor = conn.execute(
                '''INSERT INTO vendors (company_name, vendor_type, primary_contact, contact_email,
                   contact_phone, address, city, state, zip_code, website, notes, is_active,
                   created_by, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                (sc['company_name'], 'Supplier', sc['primary_contact'], sc['contact_email'],
                 sc['contact_phone'], sc['address'], sc['city'], sc['state'],
                 sc['zip_code'], sc['website'], sc['notes'], sc['is_active'],
                 sc['created_by'], sc['created_at'], sc['updated_at'])
            )
            vid = cursor.lastrowid
            # Migrate contacts
            contacts = conn.execute("SELECT * FROM customer_contacts WHERE customer_id = ?", (sc['id'],)).fetchall()
            for ct in contacts:
                conn.execute(
                    'INSERT INTO vendor_contacts (vendor_id, name, title, email, phone, is_primary) VALUES (?,?,?,?,?,?)',
                    (vid, ct['name'], ct['title'], ct['email'], ct['phone'], ct['is_primary'])
                )
            # Link billtrust_config by supplier_name match
            conn.execute("UPDATE billtrust_config SET vendor_id = ? WHERE supplier_name = ? AND (vendor_id IS NULL OR vendor_id = 0)",
                         (vid, sc['company_name']))
            # Link supplier_quotes by supplier_name match
            conn.execute("UPDATE supplier_quotes SET vendor_id = ? WHERE supplier_name = ? AND (vendor_id IS NULL OR vendor_id = 0)",
                         (vid, sc['company_name']))
            # Delete migrated customer row
            conn.execute("DELETE FROM customer_contacts WHERE customer_id = ?", (sc['id'],))
            conn.execute("DELETE FROM customers WHERE id = ?", (sc['id'],))

    # Seed default vendors if table is empty
    vendor_count = conn.execute("SELECT COUNT(*) FROM vendors").fetchone()[0]
    if vendor_count == 0:
        conn.execute("INSERT INTO vendors (company_name, vendor_type) VALUES (?, 'Supplier')", ('Locke Supply',))
        conn.execute("INSERT INTO vendors (company_name, vendor_type) VALUES (?, 'Supplier')", ('Plumb Supply',))
        # Link billtrust_config to seeded vendors
        for vname in ('Locke Supply', 'Plumb Supply'):
            v = conn.execute("SELECT id FROM vendors WHERE company_name = ?", (vname,)).fetchone()
            if v:
                conn.execute("UPDATE billtrust_config SET vendor_id = ? WHERE supplier_name = ? AND (vendor_id IS NULL OR vendor_id = 0)",
                             (v['id'], vname))

    # Migration: renumber pipeline steps — move Permits from step 18 to step 13
    # Check if any job still has old step 18 named 'Permits & Inspections'
    old_permit_step = conn.execute(
        "SELECT id FROM job_pipeline_steps WHERE step_number = 18 AND step_name = 'Permits & Inspections' LIMIT 1"
    ).fetchone()
    if old_permit_step:
        # Get all jobs that have pipeline steps
        pipeline_jobs = conn.execute("SELECT DISTINCT job_id FROM job_pipeline_steps").fetchall()
        for pj in pipeline_jobs:
            jid = pj['job_id']
            # Move old 18 (Permits) to temp 99
            conn.execute("UPDATE job_pipeline_steps SET step_number = 99 WHERE job_id = ? AND step_number = 18", (jid,))
            # Shift 13→14, 14→15, 15→16, 16→17, 17→18 (reverse order to avoid conflicts)
            for old, new in [(17, 18), (16, 17), (15, 16), (14, 15), (13, 14)]:
                conn.execute("UPDATE job_pipeline_steps SET step_number = ? WHERE job_id = ? AND step_number = ?", (new, jid, old))
            # Move temp 99 → 13
            conn.execute("UPDATE job_pipeline_steps SET step_number = 13, step_category = 'contract', linked_module = 'permits' WHERE job_id = ? AND step_number = 99", (jid,))

    # Migration: add pdf_file column to pay_applications
    pa_cols = [row[1] for row in conn.execute("PRAGMA table_info(pay_applications)").fetchall()]
    if 'pdf_file' not in pa_cols:
        conn.execute("ALTER TABLE pay_applications ADD COLUMN pdf_file TEXT DEFAULT ''")

    # Migration: backfill employee_profiles for existing users
    users_without_profile = conn.execute(
        'SELECT id FROM users WHERE id NOT IN (SELECT user_id FROM employee_profiles)'
    ).fetchall()
    for u in users_without_profile:
        conn.execute(
            "INSERT INTO employee_profiles (user_id, employment_status, hire_date) VALUES (?, 'Active', date('now','localtime'))",
            (u['id'],)
        )

    # Migration: add requested_by, requested_date to permit_inspections + update CHECK for 'Requested' status
    pi_sql = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='permit_inspections'").fetchone()
    if pi_sql and 'Requested' not in pi_sql[0]:
        # Must recreate table to update CHECK constraint (SQLite limitation)
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS permit_inspections_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                permit_id INTEGER NOT NULL,
                inspection_type TEXT NOT NULL DEFAULT 'Rough-In',
                status TEXT NOT NULL DEFAULT 'Scheduled'
                    CHECK(status IN ('Requested','Scheduled','Passed','Failed','Cancelled','Re-Inspect')),
                scheduled_date TEXT DEFAULT '',
                completed_date TEXT DEFAULT '',
                inspector TEXT DEFAULT '',
                result_notes TEXT DEFAULT '',
                created_by INTEGER,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                requested_by INTEGER,
                requested_date TEXT DEFAULT '',
                FOREIGN KEY (permit_id) REFERENCES permits(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users(id),
                FOREIGN KEY (requested_by) REFERENCES users(id)
            );
            INSERT INTO permit_inspections_new (id, permit_id, inspection_type, status, scheduled_date, completed_date, inspector, result_notes, created_by, created_at)
                SELECT id, permit_id, inspection_type, status, scheduled_date, completed_date, inspector, result_notes, created_by, created_at FROM permit_inspections;
            DROP TABLE permit_inspections;
            ALTER TABLE permit_inspections_new RENAME TO permit_inspections;
            CREATE INDEX IF NOT EXISTS idx_permit_inspections_permit ON permit_inspections(permit_id);
            CREATE INDEX IF NOT EXISTS idx_permit_inspections_status ON permit_inspections(status);
        ''')

    # Migration: add gc_contact, gc_email, gc_phone to pay_app_contracts
    pac_cols = [row[1] for row in conn.execute("PRAGMA table_info(pay_app_contracts)").fetchall()]
    for col, typedef in [
        ('gc_contact', "TEXT DEFAULT ''"),
        ('gc_email', "TEXT DEFAULT ''"),
        ('gc_phone', "TEXT DEFAULT ''"),
    ]:
        if col not in pac_cols:
            conn.execute(f"ALTER TABLE pay_app_contracts ADD COLUMN {col} {typedef}")

    # Migration: add benchmarks_data to schedule_plans
    sp_cols = [row[1] for row in conn.execute("PRAGMA table_info(schedule_plans)").fetchall()]
    if 'benchmarks_data' not in sp_cols:
        conn.execute("ALTER TABLE schedule_plans ADD COLUMN benchmarks_data TEXT NOT NULL DEFAULT '[]'")

    # Migration: add signed_file to pay_applications (for uploaded signed/notarized copies)
    pa_cols2 = [row[1] for row in conn.execute("PRAGMA table_info(pay_applications)").fetchall()]
    if 'signed_file' not in pa_cols2:
        conn.execute("ALTER TABLE pay_applications ADD COLUMN signed_file TEXT DEFAULT ''")

    # Migration: add album_id to job_photos
    jp_cols = [row[1] for row in conn.execute("PRAGMA table_info(job_photos)").fetchall()]
    if 'album_id' not in jp_cols:
        conn.execute("ALTER TABLE job_photos ADD COLUMN album_id INTEGER REFERENCES photo_albums(id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_job_photos_album ON job_photos(album_id)")

    # Migration: add payroll_run_id to time_entries
    te_cols = [row[1] for row in conn.execute("PRAGMA table_info(time_entries)").fetchall()]
    if 'payroll_run_id' not in te_cols:
        conn.execute("ALTER TABLE time_entries ADD COLUMN payroll_run_id INTEGER")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_time_entries_payroll_run ON time_entries(payroll_run_id)")

    # Migration: add takeoff_config JSON to bids
    bid_cols_tk = [row[1] for row in conn.execute("PRAGMA table_info(bids)").fetchall()]
    if 'takeoff_config' not in bid_cols_tk:
        conn.execute("ALTER TABLE bids ADD COLUMN takeoff_config TEXT DEFAULT '{}'")

    # Migration: add contract_date to contracts
    contracts_cols = [row[1] for row in conn.execute("PRAGMA table_info(contracts)").fetchall()]
    if 'contract_date' not in contracts_cols:
        conn.execute("ALTER TABLE contracts ADD COLUMN contract_date TEXT DEFAULT ''")

    # Migration: add commercial_takeoff_config JSON to bids
    if 'commercial_takeoff_config' not in bid_cols_tk:
        conn.execute("ALTER TABLE bids ADD COLUMN commercial_takeoff_config TEXT DEFAULT '{}'")

    # Migration: add heat_kit to bid_takeoff_unit_types
    ut_cols = [row[1] for row in conn.execute("PRAGMA table_info(bid_takeoff_unit_types)").fetchall()]
    if 'heat_kit' not in ut_cols:
        conn.execute("ALTER TABLE bid_takeoff_unit_types ADD COLUMN heat_kit TEXT NOT NULL DEFAULT ''")

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

    # Seed detailed code book sections (depth > 0) if not yet populated
    detailed_count = conn.execute("SELECT COUNT(*) FROM code_sections WHERE depth > 0").fetchone()[0]
    if detailed_count == 0:
        try:
            from seed_codebooks import seed_detailed_sections
            seed_detailed_sections(conn)
        except ImportError:
            pass

    # Seed default BillTrust supplier configs if none exist
    bt_count = conn.execute("SELECT COUNT(*) FROM billtrust_config").fetchone()[0]
    if bt_count == 0:
        conn.execute("INSERT INTO billtrust_config (supplier_name, use_mock) VALUES (?, 1)", ('Locke Supply',))
        conn.execute("INSERT INTO billtrust_config (supplier_name, use_mock) VALUES (?, 1)", ('Plumb Supply',))

    # Seed equipment manuals if none exist
    manual_count = conn.execute("SELECT COUNT(*) FROM equipment_manuals").fetchone()[0]
    if manual_count == 0:
        try:
            from seed_manuals import seed_equipment_manuals
            seed_equipment_manuals(conn)
        except ImportError:
            pass

    # Seed Team Chat default channels + enroll all active users
    tc_count = conn.execute("SELECT COUNT(*) FROM tc_channels").fetchone()[0]
    if tc_count == 0:
        conn.execute("INSERT INTO tc_channels (name, description, is_default, created_by) VALUES ('general', 'General discussion for the team', 1, NULL)")
        conn.execute("INSERT INTO tc_channels (name, description, is_default, created_by) VALUES ('announcements', 'Company announcements', 1, NULL)")
    # Auto-enroll active users into default channels
    default_channels = conn.execute("SELECT id FROM tc_channels WHERE is_default = 1").fetchall()
    active_users = conn.execute("SELECT id FROM users WHERE is_active = 1").fetchall()
    for ch in default_channels:
        for u in active_users:
            conn.execute("INSERT OR IGNORE INTO tc_channel_members (channel_id, user_id) VALUES (?, ?)", (ch['id'], u['id']))

    # Migration: remove CHECK constraint on bid_takeoff_items.calc_basis to allow new formula types
    try:
        tbl_sql = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='bid_takeoff_items'").fetchone()
        if tbl_sql and 'CHECK' in (tbl_sql[0] or ''):
            conn.execute("""CREATE TABLE IF NOT EXISTS bid_takeoff_items_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bid_id INTEGER NOT NULL,
                phase TEXT NOT NULL DEFAULT 'Rough-In',
                category TEXT NOT NULL DEFAULT '',
                part_name TEXT NOT NULL DEFAULT '',
                sku TEXT DEFAULT '',
                unit_price REAL NOT NULL DEFAULT 0,
                calc_basis TEXT NOT NULL DEFAULT 'per_system',
                qty_multiplier REAL NOT NULL DEFAULT 1,
                tons_match REAL DEFAULT NULL,
                waste_pct REAL NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                qty_override REAL DEFAULT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                notes TEXT DEFAULT '',
                FOREIGN KEY (bid_id) REFERENCES bids(id) ON DELETE CASCADE
            )""")
            conn.execute("""INSERT INTO bid_takeoff_items_new
                (id, bid_id, phase, category, part_name, sku, unit_price, calc_basis,
                 qty_multiplier, tons_match, waste_pct, enabled, qty_override, sort_order, notes)
                SELECT id, bid_id, phase, category, part_name, sku, unit_price, calc_basis,
                 qty_multiplier, tons_match, waste_pct, enabled, qty_override, sort_order, notes
                FROM bid_takeoff_items""")
            conn.execute("DROP TABLE bid_takeoff_items")
            conn.execute("ALTER TABLE bid_takeoff_items_new RENAME TO bid_takeoff_items")
    except Exception:
        pass

    # ─── Material Orders tables ──────────────────────────────────
    conn.execute('''CREATE TABLE IF NOT EXISTS material_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        quote_id INTEGER,
        bid_id INTEGER,
        takeoff_type TEXT NOT NULL DEFAULT 'residential',
        order_number TEXT DEFAULT '',
        supplier_name TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Draft'
            CHECK(status IN ('Draft','Submitted','Confirmed','Partial','Received')),
        subtotal REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        freight REAL DEFAULT 0,
        total REAL DEFAULT 0,
        notes TEXT DEFAULT '',
        submitted_date TEXT DEFAULT '',
        confirmed_date TEXT DEFAULT '',
        expected_delivery TEXT DEFAULT '',
        received_date TEXT DEFAULT '',
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (quote_id) REFERENCES supplier_quotes(id) ON DELETE SET NULL,
        FOREIGN KEY (bid_id) REFERENCES bids(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id)
    )''')

    conn.execute('''CREATE TABLE IF NOT EXISTS material_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        line_number INTEGER NOT NULL DEFAULT 0,
        sku TEXT DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        quote_qty REAL DEFAULT 0,
        takeoff_qty REAL DEFAULT 0,
        order_qty REAL DEFAULT 0,
        received_qty REAL DEFAULT 0,
        unit_price REAL DEFAULT 0,
        extended_price REAL DEFAULT 0,
        takeoff_sku TEXT DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manual',
        discrepancy TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        FOREIGN KEY (order_id) REFERENCES material_orders(id) ON DELETE CASCADE
    )''')

    # ─── Service Invoices tables & migrations ──────────────────────
    ci_cols2 = [row[1] for row in conn.execute("PRAGMA table_info(client_invoices)").fetchall()]
    for col, typedef in [
        ('customer_name', "TEXT DEFAULT ''"),
        ('customer_email', "TEXT DEFAULT ''"),
        ('customer_address', "TEXT DEFAULT ''"),
        ('notes', "TEXT DEFAULT ''"),
        ('pdf_file', "TEXT DEFAULT ''"),
        ('terms', "TEXT DEFAULT 'Net 30'"),
        ('tax_rate', "REAL DEFAULT 0"),
        ('subtotal', "REAL DEFAULT 0"),
        ('tax_amount', "REAL DEFAULT 0"),
        ('balance_due', "REAL DEFAULT 0"),
        ('amount_paid', "REAL DEFAULT 0"),
    ]:
        if col not in ci_cols2:
            conn.execute(f"ALTER TABLE client_invoices ADD COLUMN {col} {typedef}")

    # Make job_id nullable for service invoices not tied to a job
    ci_sql = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='client_invoices'").fetchone()
    if ci_sql and 'NOT NULL' in (ci_sql[0] or '') and 'job_id INTEGER NOT NULL' in (ci_sql[0] or ''):
        try:
            conn.executescript('''
                CREATE TABLE IF NOT EXISTS client_invoices_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id INTEGER,
                    invoice_number TEXT DEFAULT '',
                    amount REAL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Sent','Paid','Overdue','Partial')),
                    description TEXT DEFAULT '',
                    issue_date TEXT DEFAULT (date('now','localtime')),
                    due_date TEXT DEFAULT '',
                    paid_date TEXT DEFAULT '',
                    created_by INTEGER,
                    days_to_pay INTEGER,
                    customer_name TEXT DEFAULT '',
                    customer_email TEXT DEFAULT '',
                    customer_address TEXT DEFAULT '',
                    notes TEXT DEFAULT '',
                    pdf_file TEXT DEFAULT '',
                    terms TEXT DEFAULT 'Net 30',
                    tax_rate REAL DEFAULT 0,
                    subtotal REAL DEFAULT 0,
                    tax_amount REAL DEFAULT 0,
                    balance_due REAL DEFAULT 0,
                    amount_paid REAL DEFAULT 0,
                    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
                    FOREIGN KEY (created_by) REFERENCES users(id)
                );
                INSERT INTO client_invoices_new
                    SELECT id, job_id, invoice_number, amount, status, description, issue_date, due_date,
                           paid_date, created_by, days_to_pay,
                           COALESCE(customer_name,''), COALESCE(customer_email,''),
                           COALESCE(customer_address,''), COALESCE(notes,''),
                           COALESCE(pdf_file,''), COALESCE(terms,'Net 30'),
                           COALESCE(tax_rate,0), COALESCE(subtotal,0),
                           COALESCE(tax_amount,0), COALESCE(balance_due,0),
                           COALESCE(amount_paid,0)
                    FROM client_invoices;
                DROP TABLE client_invoices;
                ALTER TABLE client_invoices_new RENAME TO client_invoices;
                CREATE INDEX IF NOT EXISTS idx_invoices_job ON client_invoices(job_id);
            ''')
        except Exception:
            pass

    # Also update CHECK constraint to include 'Partial' if missing
    ci_sql2 = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='client_invoices'").fetchone()
    if ci_sql2 and 'Partial' not in (ci_sql2[0] or ''):
        try:
            conn.executescript('''
                CREATE TABLE IF NOT EXISTS client_invoices_new2 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id INTEGER,
                    invoice_number TEXT DEFAULT '',
                    amount REAL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Sent','Paid','Overdue','Partial')),
                    description TEXT DEFAULT '',
                    issue_date TEXT DEFAULT (date('now','localtime')),
                    due_date TEXT DEFAULT '',
                    paid_date TEXT DEFAULT '',
                    created_by INTEGER,
                    days_to_pay INTEGER,
                    customer_name TEXT DEFAULT '',
                    customer_email TEXT DEFAULT '',
                    customer_address TEXT DEFAULT '',
                    notes TEXT DEFAULT '',
                    pdf_file TEXT DEFAULT '',
                    terms TEXT DEFAULT 'Net 30',
                    tax_rate REAL DEFAULT 0,
                    subtotal REAL DEFAULT 0,
                    tax_amount REAL DEFAULT 0,
                    balance_due REAL DEFAULT 0,
                    amount_paid REAL DEFAULT 0,
                    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
                    FOREIGN KEY (created_by) REFERENCES users(id)
                );
                INSERT INTO client_invoices_new2
                    SELECT id, job_id, invoice_number, amount,
                           CASE WHEN status='Overdue' THEN 'Overdue'
                                WHEN status='Paid' THEN 'Paid'
                                WHEN status='Sent' THEN 'Sent'
                                ELSE 'Draft' END,
                           description, issue_date, due_date, paid_date, created_by, days_to_pay,
                           COALESCE(customer_name,''), COALESCE(customer_email,''),
                           COALESCE(customer_address,''), COALESCE(notes,''),
                           COALESCE(pdf_file,''), COALESCE(terms,'Net 30'),
                           COALESCE(tax_rate,0), COALESCE(subtotal,0),
                           COALESCE(tax_amount,0), COALESCE(balance_due,0),
                           COALESCE(amount_paid,0)
                    FROM client_invoices;
                DROP TABLE client_invoices;
                ALTER TABLE client_invoices_new2 RENAME TO client_invoices;
                CREATE INDEX IF NOT EXISTS idx_invoices_job ON client_invoices(job_id);
            ''')
        except Exception:
            pass

    conn.execute('''CREATE TABLE IF NOT EXISTS service_invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        quantity REAL NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0,
        amount REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (invoice_id) REFERENCES client_invoices(id) ON DELETE CASCADE
    )''')

    conn.execute('''CREATE TABLE IF NOT EXISTS service_invoice_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        payment_date TEXT NOT NULL DEFAULT (date('now','localtime')),
        payment_method TEXT DEFAULT '',
        reference_number TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (invoice_id) REFERENCES client_invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
    )''')

    conn.execute('''CREATE TABLE IF NOT EXISTS tax_forms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        form_type TEXT NOT NULL DEFAULT 'W9'
            CHECK(form_type IN ('W4','W9','1099','I9','Other')),
        entity_type TEXT NOT NULL DEFAULT 'employee'
            CHECK(entity_type IN ('employee','company')),
        status TEXT NOT NULL DEFAULT 'Draft'
            CHECK(status IN ('Draft','Complete','Signed','Expired')),
        -- W9 fields
        w9_name TEXT DEFAULT '',
        w9_business_name TEXT DEFAULT '',
        w9_tax_class TEXT DEFAULT '',
        w9_exemptions TEXT DEFAULT '',
        w9_address TEXT DEFAULT '',
        w9_city_state_zip TEXT DEFAULT '',
        w9_account_numbers TEXT DEFAULT '',
        w9_tin TEXT DEFAULT '',
        w9_tin_type TEXT DEFAULT 'EIN',
        w9_signature_name TEXT DEFAULT '',
        w9_signature_date TEXT DEFAULT '',
        -- W4 fields
        w4_first_name TEXT DEFAULT '',
        w4_last_name TEXT DEFAULT '',
        w4_address TEXT DEFAULT '',
        w4_city_state_zip TEXT DEFAULT '',
        w4_ssn TEXT DEFAULT '',
        w4_filing_status TEXT DEFAULT 'Single',
        w4_multiple_jobs INTEGER DEFAULT 0,
        w4_dependents_amount REAL DEFAULT 0,
        w4_other_income REAL DEFAULT 0,
        w4_deductions REAL DEFAULT 0,
        w4_extra_withholding REAL DEFAULT 0,
        w4_exempt INTEGER DEFAULT 0,
        w4_signature_name TEXT DEFAULT '',
        w4_signature_date TEXT DEFAULT '',
        w4_employer_name TEXT DEFAULT '',
        w4_employer_ein TEXT DEFAULT '',
        w4_first_date_employment TEXT DEFAULT '',
        -- 1099 fields
        f1099_payer_name TEXT DEFAULT '',
        f1099_payer_tin TEXT DEFAULT '',
        f1099_recipient_name TEXT DEFAULT '',
        f1099_recipient_tin TEXT DEFAULT '',
        f1099_recipient_address TEXT DEFAULT '',
        f1099_recipient_city_state_zip TEXT DEFAULT '',
        f1099_amount REAL DEFAULT 0,
        f1099_tax_year TEXT DEFAULT '',
        f1099_type TEXT DEFAULT 'NEC',
        -- file
        file_path TEXT DEFAULT '',
        original_filename TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
    )''')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_tax_forms_user ON tax_forms(user_id)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_tax_forms_type ON tax_forms(form_type, entity_type)')

    # Migration: add GL/WC policy type to certificates_of_insurance
    # SQLite can't ALTER CHECK constraints, so recreate the table
    coi_check = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='certificates_of_insurance'").fetchone()
    if coi_check and 'GL/WC' not in (coi_check[0] or ''):
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS certificates_of_insurance_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER,
                policy_type TEXT NOT NULL DEFAULT 'General Liability'
                    CHECK(policy_type IN ('General Liability','Auto','Workers Comp','Umbrella','Professional','Builders Risk','GL/WC')),
                carrier TEXT DEFAULT '',
                policy_number TEXT DEFAULT '',
                effective_date TEXT DEFAULT '',
                expiration_date TEXT DEFAULT '',
                coverage_amount REAL DEFAULT 0,
                certificate_holder TEXT DEFAULT '',
                file_path TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'Active'
                    CHECK(status IN ('Active','Expiring Soon','Expired','Renewed')),
                notes TEXT DEFAULT '',
                created_by INTEGER,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
                FOREIGN KEY (created_by) REFERENCES users(id)
            );
            INSERT INTO certificates_of_insurance_new SELECT * FROM certificates_of_insurance;
            DROP TABLE certificates_of_insurance;
            ALTER TABLE certificates_of_insurance_new RENAME TO certificates_of_insurance;
            CREATE INDEX IF NOT EXISTS idx_coi_job ON certificates_of_insurance(job_id);
            CREATE INDEX IF NOT EXISTS idx_coi_expiration ON certificates_of_insurance(expiration_date);
        ''')

    # Migration: expand warranty_items with equipment details and file upload
    wi_cols = [row[1] for row in conn.execute("PRAGMA table_info(warranty_items)").fetchall()]
    wi_new = {
        'building': "TEXT DEFAULT ''",
        'unit_number': "TEXT DEFAULT ''",
        'model_number': "TEXT DEFAULT ''",
        'serial_number': "TEXT DEFAULT ''",
        'equipment_type': "TEXT DEFAULT ''",
        'file_path': "TEXT DEFAULT ''",
        'original_filename': "TEXT DEFAULT ''",
    }
    for col, typedef in wi_new.items():
        if col not in wi_cols:
            conn.execute(f"ALTER TABLE warranty_items ADD COLUMN {col} {typedef}")

    # Migration: expand warranty_claims to work like service calls
    wc_cols = [row[1] for row in conn.execute("PRAGMA table_info(warranty_claims)").fetchall()]
    wc_new = {
        'priority': "TEXT NOT NULL DEFAULT 'Normal'",
        'assigned_to': "INTEGER",
        'caller_name': "TEXT DEFAULT ''",
        'caller_phone': "TEXT DEFAULT ''",
        'caller_email': "TEXT DEFAULT ''",
        'building': "TEXT DEFAULT ''",
        'unit_number': "TEXT DEFAULT ''",
        'scheduled_date': "TEXT DEFAULT ''",
        'resolved_date': "TEXT DEFAULT ''",
        'created_by': "INTEGER",
        'created_at': "TEXT NOT NULL DEFAULT (datetime('now','localtime'))",
    }
    for col, typedef in wc_new.items():
        if col not in wc_cols:
            conn.execute(f"ALTER TABLE warranty_claims ADD COLUMN {col} {typedef}")

    # Migration: add requires_submittal and submittal_file_id to supplier_quote_items
    sqi_cols = [row[1] for row in conn.execute("PRAGMA table_info(supplier_quote_items)").fetchall()]
    if 'requires_submittal' not in sqi_cols:
        conn.execute("ALTER TABLE supplier_quote_items ADD COLUMN requires_submittal INTEGER NOT NULL DEFAULT 0")
    if 'submittal_file_id' not in sqi_cols:
        conn.execute("ALTER TABLE supplier_quote_items ADD COLUMN submittal_file_id INTEGER")

    # Migration: add keywords column to submittal_files for better search matching
    sf_cols = [row[1] for row in conn.execute("PRAGMA table_info(submittal_files)").fetchall()]
    if 'keywords' not in sf_cols:
        conn.execute("ALTER TABLE submittal_files ADD COLUMN keywords TEXT DEFAULT ''")

    # ── Daily Logs table ──────────────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS daily_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            log_date TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            hours REAL DEFAULT 8,
            notes TEXT DEFAULT '',
            time_entry_id INTEGER,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY (time_entry_id) REFERENCES time_entries(id),
            FOREIGN KEY (created_by) REFERENCES users(id),
            UNIQUE(log_date, user_id, job_id)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs(log_date)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_daily_logs_user ON daily_logs(user_id)")

    # Migration: add original_filename to lien_waivers
    lw_cols2 = [row[1] for row in conn.execute("PRAGMA table_info(lien_waivers)").fetchall()]
    if 'original_filename' not in lw_cols2:
        conn.execute("ALTER TABLE lien_waivers ADD COLUMN original_filename TEXT DEFAULT ''")
        # Backfill from existing file_path (strip timestamp prefix)
        rows = conn.execute("SELECT id, file_path FROM lien_waivers WHERE file_path != '' AND file_path IS NOT NULL").fetchall()
        for row in rows:
            fp = row[1]
            # file_path format: "1709123456_Original_Name.pdf"
            parts = fp.split('_', 1)
            if len(parts) == 2 and parts[0].isdigit():
                original = parts[1]
            else:
                original = fp
            conn.execute("UPDATE lien_waivers SET original_filename = ? WHERE id = ?", (original, row[0]))

    # Migration: column_headers table for custom entry tab column names
    existing_tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    if 'column_headers' not in existing_tables:
        conn.execute("""CREATE TABLE IF NOT EXISTS column_headers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            tab_type TEXT NOT NULL,
            column_number INTEGER NOT NULL,
            header_name TEXT DEFAULT '',
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            UNIQUE(job_id, tab_type, column_number)
        )""")

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
            'pricing_type': li['pricing_type'] if 'pricing_type' in li.keys() else 'each',
            'notes': (li['notes'] if 'notes' in li.keys() else '') or '',
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

    # Include column headers in snapshot
    try:
        headers = conn.execute(
            'SELECT tab_type, column_number, header_name FROM column_headers WHERE job_id = ?',
            (job_id,)
        ).fetchall()
        col_headers = {}
        for h in headers:
            tab = h['tab_type']
            if tab not in col_headers:
                col_headers[tab] = {}
            col_headers[tab][str(h['column_number'])] = h['header_name']
        snapshot['column_headers'] = col_headers
    except Exception:
        snapshot['column_headers'] = {}

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
            '''INSERT INTO line_items (job_id, line_number, stock_ns, sku, description, quote_qty, qty_ordered, price_per, total_net_price, pricing_type, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (job_id, item['line_number'], item['stock_ns'], item['sku'],
             item['description'], item['quote_qty'], item['qty_ordered'], item['price_per'],
             item.get('total_net_price', 0), item.get('pricing_type', 'each'), item.get('notes', ''))
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

    # Restore column headers
    conn.execute('DELETE FROM column_headers WHERE job_id = ?', (job_id,))
    for tab, cols in snapshot_data.get('column_headers', {}).items():
        for col_num, header_name in cols.items():
            if header_name:
                conn.execute(
                    'INSERT INTO column_headers (job_id, tab_type, column_number, header_name) VALUES (?, ?, ?, ?)',
                    (job_id, tab, int(col_num), header_name)
                )

def _calc_price(qty, price, pricing_type):
    """Calculate extended price based on pricing type."""
    if pricing_type == 'per_c':
        return qty * price / 100
    elif pricing_type == 'per_m':
        return qty * price / 1000
    return qty * price

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
        pricing_type = li['pricing_type'] if 'pricing_type' in li.keys() else 'each'
        stored_net = li['total_net_price'] or 0
        if stored_net:
            total_net_price = stored_net
        else:
            total_net_price = _calc_price((li['qty_ordered'] or 0), (li['price_per'] or 0), pricing_type)

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

        quote_total = _calc_price((li['quote_qty'] or 0), (li['price_per'] or 0), pricing_type)

        item = {
            'id': li['id'],
            'line_number': li['line_number'],
            'stock_ns': li['stock_ns'] or '',
            'sku': li['sku'] or '',
            'description': li['description'] or '',
            'quote_qty': li['quote_qty'] or 0,
            'qty_ordered': li['qty_ordered'] or 0,
            'price_per': li['price_per'] or 0,
            'pricing_type': pricing_type or 'each',
            'notes': (li['notes'] if 'notes' in li.keys() else '') or '',
            'quote_total': round(quote_total, 2),
            'total_net_price': round(total_net_price, 2),
            'total_received': total_received,
            'total_shipped': total_shipped,
            'total_invoiced': total_invoiced,
            'received_entries': {str(r['column_number']): {'quantity': r['quantity'], 'entry_date': r['entry_date']} for r in received},
            'shipped_entries': {str(s['column_number']): {'quantity': s['quantity'], 'entry_date': s['entry_date']} for s in shipped},
            'invoiced_entries': {str(i['column_number']): {'quantity': i['quantity'], 'entry_date': i['entry_date']} for i in invoiced},
        }
        items.append(item)

    # Load custom column headers
    column_headers = {}
    try:
        headers = conn.execute(
            'SELECT tab_type, column_number, header_name FROM column_headers WHERE job_id = ?',
            (job_id,)
        ).fetchall()
        for h in headers:
            tab = h['tab_type']
            if tab not in column_headers:
                column_headers[tab] = {}
            column_headers[tab][str(h['column_number'])] = h['header_name']
    except Exception:
        pass  # table may not exist yet

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
        'column_headers': column_headers,
    }
