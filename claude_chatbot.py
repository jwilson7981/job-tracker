"""Claude AI chatbot engine with role-gated database tools for LGHVAC LLC."""

import json
import os
import traceback
from database import get_db

# ─── Role-Based Tool Access ─────────────────────────────────────

TOOL_ACCESS = {
    'query_jobs':            ['owner', 'admin', 'project_manager', 'warehouse', 'employee'],
    'query_schedule':        ['owner', 'admin', 'project_manager', 'warehouse', 'employee'],
    'query_warranty':        ['owner', 'admin', 'project_manager', 'warehouse', 'employee'],
    'query_service_calls':   ['owner', 'admin', 'project_manager', 'warehouse', 'employee'],
    'query_my_hours':        ['owner', 'admin', 'project_manager', 'warehouse', 'employee'],
    'query_inventory':       ['owner', 'admin', 'project_manager', 'warehouse'],
    'query_bids':            ['owner', 'admin', 'project_manager'],
    'query_submittals':      ['owner', 'admin', 'project_manager'],
    'query_rfis':            ['owner', 'admin', 'project_manager'],
    'query_change_orders':   ['owner', 'admin', 'project_manager'],
    'query_documents':       ['owner', 'admin', 'project_manager'],
    'query_contracts':       ['owner', 'admin', 'project_manager'],
    'query_licenses':        ['owner', 'admin', 'project_manager'],
    'query_pay_apps':        ['owner', 'admin', 'project_manager'],
    'query_customers':       ['owner', 'admin', 'project_manager'],
    'query_supplier_quotes': ['owner', 'admin', 'project_manager'],
    'query_expenses':        ['owner', 'admin'],
    'query_payroll':         ['owner'],
    'query_time_entries':    ['owner', 'admin'],
    'navigate':              ['owner', 'admin', 'project_manager', 'warehouse', 'employee'],
}

# ─── Tool Definitions (Claude tool_use schema) ──────────────────

TOOL_DEFINITIONS = [
    {
        "name": "query_jobs",
        "description": "Query jobs/projects. Can filter by status, name, or get counts. Returns job id, name, status, created_at.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "Filter by status: 'Needs Bid', 'Bid Submitted', 'Awarded', 'In Progress', 'Complete', 'Closed'. Leave empty for all."},
                "search": {"type": "string", "description": "Search job name (partial match)"},
                "count_only": {"type": "boolean", "description": "If true, return only the count"}
            }
        }
    },
    {
        "name": "query_schedule",
        "description": "Query job schedule entries. Can filter by job or date range.",
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "integer", "description": "Filter by job ID"},
                "job_name": {"type": "string", "description": "Filter by job name (partial match)"},
                "upcoming_days": {"type": "integer", "description": "Show entries in the next N days"}
            }
        }
    },
    {
        "name": "query_warranty",
        "description": "Query warranty items. Can filter by job, status, or expiring soon.",
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "integer"},
                "job_name": {"type": "string", "description": "Filter by job name (partial match)"},
                "status": {"type": "string", "description": "Active, Expiring Soon, Expired, Claimed"},
                "expiring_within_days": {"type": "integer", "description": "Show warranties expiring within N days"}
            }
        }
    },
    {
        "name": "query_service_calls",
        "description": "Query service calls. Can filter by status, priority, or job.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "Open, Assigned, In Progress, Resolved, Closed"},
                "priority": {"type": "string", "description": "Low, Normal, High, Urgent"},
                "job_id": {"type": "integer"},
                "count_only": {"type": "boolean"}
            }
        }
    },
    {
        "name": "query_my_hours",
        "description": "Query time entries for a specific user. Returns hours, job, date, description.",
        "input_schema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "integer", "description": "User ID to query (defaults to current user)"},
                "date_from": {"type": "string", "description": "Start date YYYY-MM-DD"},
                "date_to": {"type": "string", "description": "End date YYYY-MM-DD"},
                "job_id": {"type": "integer"}
            }
        }
    },
    {
        "name": "query_inventory",
        "description": "Query inventory items. Can filter by job, search description/SKU.",
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "integer"},
                "job_name": {"type": "string", "description": "Filter by job name (partial match)"},
                "search": {"type": "string", "description": "Search description or SKU"}
            }
        }
    },
    {
        "name": "query_bids",
        "description": "Query bids. Can filter by status, job, or search name.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "Draft, Sent, Won, Lost"},
                "job_name": {"type": "string", "description": "Filter by job name (partial match)"},
                "search": {"type": "string", "description": "Search bid name"},
                "count_only": {"type": "boolean"}
            }
        }
    },
    {
        "name": "query_submittals",
        "description": "Query submittals. Can filter by job, status, vendor.",
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "integer"},
                "job_name": {"type": "string", "description": "Filter by job name (partial match)"},
                "status": {"type": "string", "description": "Pending, Submitted, Approved, Approved as Noted, Rejected, Resubmit"},
                "count_only": {"type": "boolean"}
            }
        }
    },
    {
        "name": "query_rfis",
        "description": "Query RFIs. Can filter by job, status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "integer"},
                "job_name": {"type": "string", "description": "Filter by job name (partial match)"},
                "status": {"type": "string", "description": "Open, Answered, Closed"},
                "count_only": {"type": "boolean"}
            }
        }
    },
    {
        "name": "query_change_orders",
        "description": "Query change orders. Can filter by job, status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "integer"},
                "job_name": {"type": "string", "description": "Filter by job name (partial match)"},
                "status": {"type": "string", "description": "Draft, Submitted, Approved, Rejected, Void"},
                "count_only": {"type": "boolean"}
            }
        }
    },
    {
        "name": "query_documents",
        "description": "Query closeout/document checklist items. Can filter by job, status, type.",
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "integer"},
                "job_name": {"type": "string", "description": "Filter by job name (partial match)"},
                "status": {"type": "string", "description": "Not Started, In Progress, Complete, N/A"},
                "item_type": {"type": "string"}
            }
        }
    },
    {
        "name": "query_contracts",
        "description": "Query contracts. Can filter by job, status, type.",
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "integer"},
                "job_name": {"type": "string", "description": "Filter by job name (partial match)"},
                "status": {"type": "string", "description": "Draft, Active, Complete, Terminated"},
                "contract_type": {"type": "string", "description": "Prime, Sub, Vendor"}
            }
        }
    },
    {
        "name": "query_licenses",
        "description": "Query licenses/certifications. Can filter by status, expiring soon.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "Active, Expiring Soon, Expired, Pending Renewal"},
                "expiring_within_days": {"type": "integer", "description": "Show licenses expiring within N days"}
            }
        }
    },
    {
        "name": "query_pay_apps",
        "description": "Query pay application contracts and applications.",
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "integer"},
                "job_name": {"type": "string", "description": "Filter by job name (partial match)"},
                "status": {"type": "string"}
            }
        }
    },
    {
        "name": "query_customers",
        "description": "Query customers/general contractors. Can search by name, type.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Search company name"},
                "company_type": {"type": "string", "description": "General Contractor, Developer, Owner, etc."}
            }
        }
    },
    {
        "name": "query_supplier_quotes",
        "description": "Query supplier quotes. Can filter by job, supplier, status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "integer"},
                "job_name": {"type": "string", "description": "Filter by job name (partial match)"},
                "supplier_name": {"type": "string"},
                "status": {"type": "string", "description": "Requested, Received, Reviewing, Selected, Rejected, Expired"}
            }
        }
    },
    {
        "name": "query_expenses",
        "description": "Query expenses (job expenses and recurring company expenses). Can filter by job, category, or show overdue.",
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "integer"},
                "category": {"type": "string"},
                "overdue_only": {"type": "boolean", "description": "Show only overdue recurring expenses"},
                "recurring_only": {"type": "boolean", "description": "Show only recurring company expenses"}
            }
        }
    },
    {
        "name": "query_payroll",
        "description": "Query payroll/time entry summaries. Owner only.",
        "input_schema": {
            "type": "object",
            "properties": {
                "pay_period": {"type": "string", "description": "Pay period string to filter"},
                "user_id": {"type": "integer", "description": "Filter by specific employee"},
                "date_from": {"type": "string"},
                "date_to": {"type": "string"}
            }
        }
    },
    {
        "name": "query_time_entries",
        "description": "Query all time entries (not just current user). Owner/admin only.",
        "input_schema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "integer"},
                "job_id": {"type": "integer"},
                "date_from": {"type": "string"},
                "date_to": {"type": "string"},
                "approved_only": {"type": "boolean"}
            }
        }
    },
    {
        "name": "navigate",
        "description": "Navigate the user to a page in the app. Use [NAV:/path] prefix format in your response.",
        "input_schema": {
            "type": "object",
            "properties": {
                "page": {"type": "string", "description": "Page path like /dashboard, /bids, /submittals, /rfis, /payroll, etc."},
                "description": {"type": "string", "description": "Brief description of where you're navigating"}
            },
            "required": ["page"]
        }
    },
]

# ─── Navigation Map ──────────────────────────────────────────────

NAV_MAP = {
    'dashboard': '/dashboard', 'materials': '/materials', 'projects': '/projects',
    'schedule': '/schedule', 'bids': '/bids', 'pay apps': '/payapps',
    'payapps': '/payapps', 'rfis': '/rfis', 'change orders': '/change-orders',
    'submittals': '/submittals', 'documents': '/documents', 'closeout': '/documents',
    'accounting': '/accounting', 'expenses': '/expenses', 'payroll': '/payroll',
    'licenses': '/licenses', 'time entry': '/time-entry', 'timesheets': '/time-entry',
    'warranty': '/warranty', 'service calls': '/service-calls', 'howtos': '/howtos',
    'code books': '/codebooks', 'manuals': '/manuals', 'contracts': '/contracts',
    'workflow': '/workflow', 'chat': '/chatbot', 'users': '/admin/users',
    'inventory': '/materials', 'supplier quotes': '/supplier-quotes',
    'customers': '/customers', 'plans': '/plans',
}

# ─── System Prompt Builder ───────────────────────────────────────

def build_system_prompt(role, display_name):
    restricted = []
    for tool_name, allowed_roles in TOOL_ACCESS.items():
        if role not in allowed_roles:
            label = tool_name.replace('query_', '').replace('_', ' ')
            restricted.append(label)

    restricted_text = ', '.join(restricted) if restricted else 'none'

    return f"""You are the AI assistant for LGHVAC LLC, an HVAC construction company based in Edmond, Oklahoma.

You are chatting with **{display_name}** (role: {role}).

## What You Can Do
- Answer questions about jobs, schedules, bids, submittals, RFIs, change orders, warranties, service calls, and more by querying the database using your tools.
- Navigate the user to pages in the app using the navigate tool.
- Provide helpful construction/HVAC knowledge.

## What You Cannot Do
- You have **read-only** access. You cannot create, update, or delete anything.
- You CANNOT access: {restricted_text}. If asked about restricted data, politely explain it's not available for their role.

## Response Formatting
- Keep responses concise and professional.
- Use **bold** for emphasis, bullet points for lists.
- Format numbers nicely (currency with $, dates readable).
- When showing query results, summarize rather than dumping raw data unless the user wants detail.
- When navigating, include `[NAV:/path]` at the START of your response text, followed by a brief message. Example: `[NAV:/submittals] Taking you to the submittals page.`

## Navigation Paths
Available pages: /dashboard, /materials, /projects, /schedule, /bids, /payapps, /rfis, /change-orders, /submittals, /documents, /accounting, /expenses, /payroll, /licenses, /time-entry, /warranty, /service-calls, /howtos, /codebooks, /manuals, /contracts, /workflow, /chatbot, /admin/users, /customers, /plans, /supplier-quotes

## Company Info
- **LGHVAC LLC** - HVAC construction, Edmond, OK
- Owners: Dan & James
- Uses AIA G702/G703 for pay applications
- Suppliers: Locke Supply, Plumb Supply"""


# ─── Tool Execution ──────────────────────────────────────────────

def _resolve_job_id(conn, job_name):
    """Resolve a job name (partial match) to job_id."""
    if not job_name:
        return None
    row = conn.execute(
        "SELECT id FROM jobs WHERE name LIKE ? ORDER BY id DESC LIMIT 1",
        (f'%{job_name}%',)
    ).fetchone()
    return row['id'] if row else None


def execute_tool(tool_name, tool_input, role, user_id):
    """Execute a tool call and return the result as a JSON string."""
    # Check role access
    if role not in TOOL_ACCESS.get(tool_name, []):
        return json.dumps({"error": f"Access denied: {tool_name} is not available for your role."})

    conn = get_db()
    try:
        result = _run_query(conn, tool_name, tool_input, user_id)
        return json.dumps(result, default=str)
    except Exception as e:
        return json.dumps({"error": f"Query failed: {str(e)}"})
    finally:
        conn.close()


def _run_query(conn, tool_name, inp, user_id):
    """Run the actual database query for a tool."""

    if tool_name == 'query_jobs':
        sql = "SELECT id, name, status, created_at FROM jobs WHERE 1=1"
        params = []
        if inp.get('status'):
            sql += " AND status = ?"
            params.append(inp['status'])
        if inp.get('search'):
            sql += " AND name LIKE ?"
            params.append(f"%{inp['search']}%")
        sql += " ORDER BY id DESC LIMIT 50"
        rows = conn.execute(sql, params).fetchall()
        if inp.get('count_only'):
            return {"count": len(rows)}
        return {"jobs": [dict(r) for r in rows]}

    elif tool_name == 'query_schedule':
        sql = """SELECT s.*, j.name as job_name FROM schedule_entries s
                 JOIN jobs j ON s.job_id = j.id WHERE 1=1"""
        params = []
        if inp.get('job_id'):
            sql += " AND s.job_id = ?"
            params.append(inp['job_id'])
        elif inp.get('job_name'):
            jid = _resolve_job_id(conn, inp['job_name'])
            if jid:
                sql += " AND s.job_id = ?"
                params.append(jid)
        if inp.get('upcoming_days'):
            sql += " AND s.start_date >= date('now','localtime') AND s.start_date <= date('now','localtime','+" + str(int(inp['upcoming_days'])) + " days')"
        sql += " ORDER BY s.start_date ASC LIMIT 50"
        rows = conn.execute(sql, params).fetchall()
        return {"entries": [dict(r) for r in rows]}

    elif tool_name == 'query_warranty':
        sql = """SELECT w.*, j.name as job_name FROM warranty_items w
                 JOIN jobs j ON w.job_id = j.id WHERE 1=1"""
        params = []
        if inp.get('job_id'):
            sql += " AND w.job_id = ?"
            params.append(inp['job_id'])
        elif inp.get('job_name'):
            jid = _resolve_job_id(conn, inp['job_name'])
            if jid:
                sql += " AND w.job_id = ?"
                params.append(jid)
        if inp.get('status'):
            sql += " AND w.status = ?"
            params.append(inp['status'])
        if inp.get('expiring_within_days'):
            sql += " AND w.warranty_end != '' AND w.warranty_end <= date('now','localtime','+" + str(int(inp['expiring_within_days'])) + " days')"
        sql += " ORDER BY w.warranty_end ASC LIMIT 50"
        rows = conn.execute(sql, params).fetchall()
        return {"warranties": [dict(r) for r in rows]}

    elif tool_name == 'query_service_calls':
        sql = """SELECT sc.*, j.name as job_name FROM service_calls sc
                 LEFT JOIN jobs j ON sc.job_id = j.id WHERE 1=1"""
        params = []
        if inp.get('status'):
            sql += " AND sc.status = ?"
            params.append(inp['status'])
        if inp.get('priority'):
            sql += " AND sc.priority = ?"
            params.append(inp['priority'])
        if inp.get('job_id'):
            sql += " AND sc.job_id = ?"
            params.append(inp['job_id'])
        sql += " ORDER BY sc.created_at DESC LIMIT 50"
        rows = conn.execute(sql, params).fetchall()
        if inp.get('count_only'):
            return {"count": len(rows)}
        return {"service_calls": [dict(r) for r in rows]}

    elif tool_name == 'query_my_hours':
        uid = inp.get('user_id', user_id)
        sql = """SELECT te.*, j.name as job_name, u.display_name
                 FROM time_entries te
                 JOIN jobs j ON te.job_id = j.id
                 JOIN users u ON te.user_id = u.id
                 WHERE te.user_id = ?"""
        params = [uid]
        if inp.get('date_from'):
            sql += " AND te.work_date >= ?"
            params.append(inp['date_from'])
        if inp.get('date_to'):
            sql += " AND te.work_date <= ?"
            params.append(inp['date_to'])
        if inp.get('job_id'):
            sql += " AND te.job_id = ?"
            params.append(inp['job_id'])
        sql += " ORDER BY te.work_date DESC LIMIT 100"
        rows = conn.execute(sql, params).fetchall()
        total_hours = sum(r['hours'] for r in rows)
        return {"entries": [dict(r) for r in rows], "total_hours": total_hours}

    elif tool_name == 'query_inventory':
        sql = """SELECT li.*, j.name as job_name FROM line_items li
                 JOIN jobs j ON li.job_id = j.id WHERE 1=1"""
        params = []
        if inp.get('job_id'):
            sql += " AND li.job_id = ?"
            params.append(inp['job_id'])
        elif inp.get('job_name'):
            jid = _resolve_job_id(conn, inp['job_name'])
            if jid:
                sql += " AND li.job_id = ?"
                params.append(jid)
        if inp.get('search'):
            sql += " AND (li.description LIKE ? OR li.sku LIKE ?)"
            params.extend([f"%{inp['search']}%", f"%{inp['search']}%"])
        sql += " ORDER BY li.id DESC LIMIT 50"
        rows = conn.execute(sql, params).fetchall()
        return {"items": [dict(r) for r in rows]}

    elif tool_name == 'query_bids':
        sql = """SELECT b.id, b.bid_name, b.status, b.total_price, b.project_type,
                        j.name as job_name
                 FROM bids b LEFT JOIN jobs j ON b.job_id = j.id WHERE 1=1"""
        params = []
        if inp.get('status'):
            sql += " AND b.status = ?"
            params.append(inp['status'])
        if inp.get('job_name'):
            sql += " AND j.name LIKE ?"
            params.append(f"%{inp['job_name']}%")
        if inp.get('search'):
            sql += " AND b.bid_name LIKE ?"
            params.append(f"%{inp['search']}%")
        sql += " ORDER BY b.id DESC LIMIT 50"
        rows = conn.execute(sql, params).fetchall()
        if inp.get('count_only'):
            return {"count": len(rows)}
        return {"bids": [dict(r) for r in rows]}

    elif tool_name == 'query_submittals':
        sql = """SELECT s.id, s.submittal_number, s.spec_section, s.description,
                        s.vendor, s.status, s.revision_number, s.date_submitted,
                        j.name as job_name
                 FROM submittals s JOIN jobs j ON s.job_id = j.id WHERE 1=1"""
        params = []
        if inp.get('job_id'):
            sql += " AND s.job_id = ?"
            params.append(inp['job_id'])
        elif inp.get('job_name'):
            jid = _resolve_job_id(conn, inp['job_name'])
            if jid:
                sql += " AND s.job_id = ?"
                params.append(jid)
            else:
                sql += " AND j.name LIKE ?"
                params.append(f"%{inp['job_name']}%")
        if inp.get('status'):
            sql += " AND s.status = ?"
            params.append(inp['status'])
        sql += " ORDER BY s.submittal_number ASC LIMIT 100"
        rows = conn.execute(sql, params).fetchall()
        if inp.get('count_only'):
            return {"count": len(rows)}
        return {"submittals": [dict(r) for r in rows]}

    elif tool_name == 'query_rfis':
        sql = """SELECT r.id, r.rfi_number, r.subject, r.status,
                        r.date_submitted, j.name as job_name
                 FROM rfis r JOIN jobs j ON r.job_id = j.id WHERE 1=1"""
        params = []
        if inp.get('job_id'):
            sql += " AND r.job_id = ?"
            params.append(inp['job_id'])
        elif inp.get('job_name'):
            jid = _resolve_job_id(conn, inp['job_name'])
            if jid:
                sql += " AND r.job_id = ?"
                params.append(jid)
        if inp.get('status'):
            sql += " AND r.status = ?"
            params.append(inp['status'])
        sql += " ORDER BY r.rfi_number ASC LIMIT 50"
        rows = conn.execute(sql, params).fetchall()
        if inp.get('count_only'):
            return {"count": len(rows)}
        return {"rfis": [dict(r) for r in rows]}

    elif tool_name == 'query_change_orders':
        sql = """SELECT co.id, co.co_number, co.title, co.amount, co.status,
                        j.name as job_name
                 FROM change_orders co JOIN jobs j ON co.job_id = j.id WHERE 1=1"""
        params = []
        if inp.get('job_id'):
            sql += " AND co.job_id = ?"
            params.append(inp['job_id'])
        elif inp.get('job_name'):
            jid = _resolve_job_id(conn, inp['job_name'])
            if jid:
                sql += " AND co.job_id = ?"
                params.append(jid)
        if inp.get('status'):
            sql += " AND co.status = ?"
            params.append(inp['status'])
        sql += " ORDER BY co.co_number ASC LIMIT 50"
        rows = conn.execute(sql, params).fetchall()
        if inp.get('count_only'):
            return {"count": len(rows)}
        return {"change_orders": [dict(r) for r in rows]}

    elif tool_name == 'query_documents':
        sql = """SELECT cl.id, cl.item_name, cl.item_type, cl.status, cl.notes,
                        j.name as job_name
                 FROM closeout_checklists cl JOIN jobs j ON cl.job_id = j.id WHERE 1=1"""
        params = []
        if inp.get('job_id'):
            sql += " AND cl.job_id = ?"
            params.append(inp['job_id'])
        elif inp.get('job_name'):
            jid = _resolve_job_id(conn, inp['job_name'])
            if jid:
                sql += " AND cl.job_id = ?"
                params.append(jid)
        if inp.get('status'):
            sql += " AND cl.status = ?"
            params.append(inp['status'])
        if inp.get('item_type'):
            sql += " AND cl.item_type = ?"
            params.append(inp['item_type'])
        sql += " ORDER BY cl.sort_order ASC LIMIT 50"
        rows = conn.execute(sql, params).fetchall()
        return {"documents": [dict(r) for r in rows]}

    elif tool_name == 'query_contracts':
        sql = """SELECT c.id, c.title, c.contractor, c.contract_type, c.value,
                        c.status, j.name as job_name
                 FROM contracts c JOIN jobs j ON c.job_id = j.id WHERE 1=1"""
        params = []
        if inp.get('job_id'):
            sql += " AND c.job_id = ?"
            params.append(inp['job_id'])
        elif inp.get('job_name'):
            jid = _resolve_job_id(conn, inp['job_name'])
            if jid:
                sql += " AND c.job_id = ?"
                params.append(jid)
        if inp.get('status'):
            sql += " AND c.status = ?"
            params.append(inp['status'])
        if inp.get('contract_type'):
            sql += " AND c.contract_type = ?"
            params.append(inp['contract_type'])
        sql += " ORDER BY c.id DESC LIMIT 50"
        rows = conn.execute(sql, params).fetchall()
        return {"contracts": [dict(r) for r in rows]}

    elif tool_name == 'query_licenses':
        sql = "SELECT * FROM licenses WHERE 1=1"
        params = []
        if inp.get('status'):
            sql += " AND status = ?"
            params.append(inp['status'])
        if inp.get('expiring_within_days'):
            sql += " AND expiration_date != '' AND expiration_date <= date('now','localtime','+" + str(int(inp['expiring_within_days'])) + " days')"
        sql += " ORDER BY expiration_date ASC LIMIT 50"
        rows = conn.execute(sql, params).fetchall()
        return {"licenses": [dict(r) for r in rows]}

    elif tool_name == 'query_pay_apps':
        sql = """SELECT pac.id, pac.contract_number, pac.gc_name, pac.original_contract_sum,
                        j.name as job_name
                 FROM pay_app_contracts pac
                 JOIN jobs j ON pac.job_id = j.id WHERE 1=1"""
        params = []
        if inp.get('job_id'):
            sql += " AND pac.job_id = ?"
            params.append(inp['job_id'])
        elif inp.get('job_name'):
            jid = _resolve_job_id(conn, inp['job_name'])
            if jid:
                sql += " AND pac.job_id = ?"
                params.append(jid)
        sql += " ORDER BY pac.id DESC LIMIT 50"
        rows = conn.execute(sql, params).fetchall()
        return {"pay_app_contracts": [dict(r) for r in rows]}

    elif tool_name == 'query_customers':
        sql = "SELECT * FROM customers WHERE is_active = 1"
        params = []
        if inp.get('search'):
            sql += " AND company_name LIKE ?"
            params.append(f"%{inp['search']}%")
        if inp.get('company_type'):
            sql += " AND company_type = ?"
            params.append(inp['company_type'])
        sql += " ORDER BY company_name ASC LIMIT 50"
        rows = conn.execute(sql, params).fetchall()
        return {"customers": [dict(r) for r in rows]}

    elif tool_name == 'query_supplier_quotes':
        sql = """SELECT sq.id, sq.supplier_name, sq.quote_number, sq.status,
                        sq.subtotal, sq.total, j.name as job_name
                 FROM supplier_quotes sq
                 JOIN jobs j ON sq.job_id = j.id WHERE 1=1"""
        params = []
        if inp.get('job_id'):
            sql += " AND sq.job_id = ?"
            params.append(inp['job_id'])
        elif inp.get('job_name'):
            jid = _resolve_job_id(conn, inp['job_name'])
            if jid:
                sql += " AND sq.job_id = ?"
                params.append(jid)
        if inp.get('supplier_name'):
            sql += " AND sq.supplier_name LIKE ?"
            params.append(f"%{inp['supplier_name']}%")
        if inp.get('status'):
            sql += " AND sq.status = ?"
            params.append(inp['status'])
        sql += " ORDER BY sq.id DESC LIMIT 50"
        rows = conn.execute(sql, params).fetchall()
        return {"quotes": [dict(r) for r in rows]}

    elif tool_name == 'query_expenses':
        if inp.get('recurring_only') or inp.get('overdue_only'):
            sql = "SELECT * FROM recurring_expenses WHERE 1=1"
            params = []
            if inp.get('overdue_only'):
                sql += " AND next_due_date < date('now','localtime') AND is_active = 1"
            if inp.get('category'):
                sql += " AND category = ?"
                params.append(inp['category'])
            sql += " ORDER BY next_due_date ASC LIMIT 50"
            rows = conn.execute(sql, params).fetchall()
            return {"recurring_expenses": [dict(r) for r in rows]}
        else:
            sql = """SELECT e.*, j.name as job_name FROM expenses e
                     JOIN jobs j ON e.job_id = j.id WHERE 1=1"""
            params = []
            if inp.get('job_id'):
                sql += " AND e.job_id = ?"
                params.append(inp['job_id'])
            if inp.get('category'):
                sql += " AND e.category = ?"
                params.append(inp['category'])
            sql += " ORDER BY e.expense_date DESC LIMIT 50"
            rows = conn.execute(sql, params).fetchall()
            return {"expenses": [dict(r) for r in rows]}

    elif tool_name == 'query_payroll':
        sql = """SELECT te.*, u.display_name, j.name as job_name
                 FROM time_entries te
                 JOIN users u ON te.user_id = u.id
                 JOIN jobs j ON te.job_id = j.id WHERE 1=1"""
        params = []
        if inp.get('user_id'):
            sql += " AND te.user_id = ?"
            params.append(inp['user_id'])
        if inp.get('pay_period'):
            sql += " AND te.pay_period = ?"
            params.append(inp['pay_period'])
        if inp.get('date_from'):
            sql += " AND te.work_date >= ?"
            params.append(inp['date_from'])
        if inp.get('date_to'):
            sql += " AND te.work_date <= ?"
            params.append(inp['date_to'])
        sql += " ORDER BY te.work_date DESC LIMIT 200"
        rows = conn.execute(sql, params).fetchall()
        total_hours = sum(r['hours'] for r in rows)
        total_cost = sum(r['hours'] * r['hourly_rate'] for r in rows)
        return {"entries": [dict(r) for r in rows], "total_hours": total_hours, "total_cost": round(total_cost, 2)}

    elif tool_name == 'query_time_entries':
        sql = """SELECT te.*, u.display_name, j.name as job_name
                 FROM time_entries te
                 JOIN users u ON te.user_id = u.id
                 JOIN jobs j ON te.job_id = j.id WHERE 1=1"""
        params = []
        if inp.get('user_id'):
            sql += " AND te.user_id = ?"
            params.append(inp['user_id'])
        if inp.get('job_id'):
            sql += " AND te.job_id = ?"
            params.append(inp['job_id'])
        if inp.get('date_from'):
            sql += " AND te.work_date >= ?"
            params.append(inp['date_from'])
        if inp.get('date_to'):
            sql += " AND te.work_date <= ?"
            params.append(inp['date_to'])
        if inp.get('approved_only'):
            sql += " AND te.approved = 1"
        sql += " ORDER BY te.work_date DESC LIMIT 200"
        rows = conn.execute(sql, params).fetchall()
        total_hours = sum(r['hours'] for r in rows)
        return {"entries": [dict(r) for r in rows], "total_hours": total_hours}

    elif tool_name == 'navigate':
        page = inp.get('page', '/dashboard')
        desc = inp.get('description', 'Navigating...')
        return {"navigate_to": page, "description": desc}

    return {"error": f"Unknown tool: {tool_name}"}


# ─── Main Response Generator ────────────────────────────────────

def generate_claude_response(conn, user_msg, role='employee', user_id=None, session_id=None):
    """Generate a response using Claude API with tool use.

    Args:
        conn: Database connection (for loading history)
        user_msg: The user's message text
        role: User's role string
        user_id: User's ID
        session_id: Chat session ID for loading history

    Returns:
        String response text
    """
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key:
        return None  # Signal to caller to use fallback

    try:
        import anthropic
    except ImportError:
        return None

    # Build conversation history from DB
    messages = []
    if session_id:
        history = conn.execute(
            'SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
            (session_id,)
        ).fetchall()
        # Load last 20 messages for context
        for msg in history[-20:]:
            messages.append({
                "role": msg['role'] if msg['role'] in ('user', 'assistant') else 'user',
                "content": msg['content']
            })

    # Add current user message
    messages.append({"role": "user", "content": user_msg})

    # Get display name
    user_row = conn.execute('SELECT display_name FROM users WHERE id = ?', (user_id,)).fetchone()
    display_name = user_row['display_name'] if user_row else 'User'

    # Filter tools by role
    available_tools = [t for t in TOOL_DEFINITIONS if role in TOOL_ACCESS.get(t['name'], [])]

    # Call Claude
    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=build_system_prompt(role, display_name),
            tools=available_tools,
            messages=messages,
        )

        # Process response -- handle tool use loop (max 5 iterations)
        for _ in range(5):
            if response.stop_reason != 'tool_use':
                break

            # Extract text and tool calls
            tool_results = []
            for block in response.content:
                if block.type == 'tool_use':
                    result = execute_tool(block.name, block.input, role, user_id)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result
                    })

            # Continue conversation with tool results
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                system=build_system_prompt(role, display_name),
                tools=available_tools,
                messages=messages,
            )

        # Extract final text
        text_parts = []
        for block in response.content:
            if hasattr(block, 'text'):
                text_parts.append(block.text)

        return '\n'.join(text_parts) if text_parts else "I wasn't able to generate a response. Please try again."

    except Exception as e:
        print(f"[Claude chatbot error] {e}")
        traceback.print_exc()
        return None  # Fall back to rule-based engine
