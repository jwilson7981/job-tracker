"""Smart chatbot engine with intent classification, entity extraction, and role-based permissions."""

import json
import re
from datetime import datetime, timedelta


# ─── Navigation Map ─────────────────────────────────────────────

NAV_MAP = {
    'dashboard': '/dashboard',
    'materials': '/materials',
    'projects': '/projects',
    'schedule': '/schedule',
    'bids': '/bids',
    'pay apps': '/payapps', 'payapps': '/payapps', 'pay applications': '/payapps',
    'rfis': '/rfis', 'rfi': '/rfis',
    'change orders': '/change-orders', 'change order': '/change-orders', 'cos': '/change-orders',
    'submittals': '/submittals', 'submittal': '/submittals',
    'documents': '/documents', 'closeout': '/documents', 'docs': '/documents',
    'accounting': '/accounting',
    'expenses': '/expenses', 'recurring expenses': '/expenses',
    'payroll': '/payroll',
    'licenses': '/licenses', 'license': '/licenses',
    'time entry': '/time-entry', 'time': '/time-entry', 'timesheet': '/time-entry', 'timesheets': '/time-entry',
    'warranty': '/warranty', 'warranties': '/warranty',
    'service calls': '/service-calls', 'service call': '/service-calls',
    'howtos': '/howtos', 'how tos': '/howtos', 'how to': '/howtos', 'how-tos': '/howtos',
    'code books': '/codebooks', 'codebooks': '/codebooks', 'codes': '/codebooks',
    'manuals': '/manuals', 'equipment manuals': '/manuals',
    'reports': '/invoices/reports', 'invoice reports': '/invoices/reports',
    'contracts': '/contracts', 'contract': '/contracts',
    'workflow': '/workflow', 'workflow dashboard': '/workflow',
    'chat': '/chatbot', 'chatbot': '/chatbot',
    'user management': '/admin/users', 'users': '/admin/users', 'admin': '/admin/users',
}

ALL_ROLES = ['owner', 'admin', 'project_manager', 'warehouse', 'employee']


# ─── Intent Definitions ──────────────────────────────────────────

INTENTS = [
    {
        'name': 'navigate',
        'patterns': [
            r'^(go\s+to|take\s+me\s+to|navigate\s+to|bring\s+up|pull\s+up|switch\s+to)\s+',
        ],
        'keywords': [],
        'roles': ALL_ROLES,
        'priority': 200,
    },
    {
        'name': 'help',
        'patterns': [r'^(help|/help|\?)$'],
        'keywords': [],
        'roles': ALL_ROLES,
        'priority': 100,
    },
    {
        'name': 'expenses_summary',
        'patterns': [
            r'(overdue|past\s+due|late)\s+(expense|bill|payment)s?',
            r'(upcoming|next|due)\s+(expense|bill|payment)s?',
            r'(monthly|weekly|recurring)\s+(expense|bill|cost)s?',
            r'expense\s+(summary|status|overview)',
            r'what.*(owe|due|bills?)',
        ],
        'keywords': ['overdue expenses', 'upcoming bills', 'expense summary'],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 36,
    },
    {
        'name': 'licenses_status',
        'patterns': [
            r'(expired?|expiring)\s+license',
            r'license\s+(status|summary|overview|expir)',
            r'(license|cert|certification)s?\s+(due|renew)',
            r'what\s+licenses?\s+(are|is)',
        ],
        'keywords': ['expired licenses', 'license status', 'expiring licenses'],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 36,
    },
    {
        'name': 'rfis_status',
        'patterns': [
            r'(open|pending|unanswered|outstanding)\s+rfis?',
            r'rfi\s+(status|summary|count|overview)',
            r'how\s+many\s+rfis?',
            r'rfis?\s+(open|pending|unanswered)',
        ],
        'keywords': ['open rfis', 'rfi status', 'unanswered rfis'],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 36,
    },
    {
        'name': 'change_orders_status',
        'patterns': [
            r'(pending|approved|draft|submitted)\s+(change\s+orders?|cos?)',
            r'(change\s+orders?|co)\s+(status|summary|total|count|overview)',
            r'how\s+many\s+(change\s+orders?|cos?)',
            r'(change\s+orders?|cos?)\s+(pending|approved|draft)',
        ],
        'keywords': ['pending change orders', 'approved cos', 'co total', 'change order status'],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 36,
    },
    {
        'name': 'submittals_status',
        'patterns': [
            r'(pending|rejected|resubmit|overdue)\s+submittals?',
            r'submittal\s+(status|summary|count|overview)',
            r'how\s+many\s+submittals?',
            r'submittals?\s+(pending|rejected|overdue)',
        ],
        'keywords': ['pending submittals', 'rejected submittals', 'submittal status'],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 36,
    },
    {
        'name': 'documents_status',
        'patterns': [
            r'(closeout|document)\s+(status|summary|progress|overview)',
            r'(incomplete|missing|outstanding)\s+(closeout|document)s?',
            r'closeout\s+(checklist|items?)',
            r'how\s+many\s+(closeout|document)s?\s+(incomplete|missing|remaining)',
        ],
        'keywords': ['closeout status', 'incomplete documents', 'document status'],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 36,
    },
    {
        'name': 'bid_count',
        'patterns': [
            r'how many bids',
            r'number of bids',
            r'count.*bids',
            r'bids?\s+count',
            r'total\s+bids?\s+(sent|submitted)',
        ],
        'keywords': [],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 30,
    },
    {
        'name': 'bid_value',
        'patterns': [
            r'total\s+(value|amount|worth).*bids?',
            r'(value|amount|worth)\s+of\s+bids?',
            r'how much.*bids?\s+(to|for|worth)',
            r'sum.*bids?',
            r'bids?\s+total\s+(value|amount)',
        ],
        'keywords': [],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 31,
    },
    {
        'name': 'bid_win_rate',
        'patterns': [
            r'win\s*rate',
            r'acceptance\s*rate',
            r'accepted\s+vs\.?\s*rejected',
            r'bid\s+(success|performance|stats|statistics)',
            r'how\s+many\s+bids?\s+(accepted|won|rejected|lost)',
        ],
        'keywords': [],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 32,
    },
    {
        'name': 'bid_top_gcs',
        'patterns': [
            r'(top|best|most)\s+g\.?c\.?s?',
            r'which\s+g\.?c\.?s?\s+(accept|approve)',
            r'g\.?c\.?s?\s+(rank|ranked|ranking)',
            r'(best|top)\s+contractors',
            r'(top|best|most)\s+general\s+contractors',
        ],
        'keywords': [],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 33,
    },
    {
        'name': 'bid_by_date',
        'patterns': [
            r'bids?\s+(from|in|during|since)\s+',
            r'bids?\s+(last|this|next)\s+(week|month|quarter|year)',
            r'bids?\s+(due|submitted)\s+(this|last|next)',
            r'(recent|latest|newest)\s+bids?',
            r'bids?\s+q[1-4]\s+\d{4}',
            r'bids?\s+\d{4}',
        ],
        'keywords': [],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 29,
    },
    {
        'name': 'bid_lookup',
        'patterns': [
            r'^bid\s+\w',
            r'bid\s+(summary|details?|info)\s',
            r'(show|find|look\s*up)\s+bid\s+',
        ],
        'keywords': [],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 20,
    },
    {
        'name': 'bid_list',
        'patterns': [
            r'^(all\s+)?bids?$',
            r'^(list|show)\s+(all\s+)?bids?$',
            r'bid\s+(list|summary|overview)$',
        ],
        'keywords': [],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 19,
    },
    {
        'name': 'profit',
        'patterns': [
            r'profit\s+(for|on)\s+',
            r'(revenue|margin|earnings)\s+(for|on)\s+',
            r'financial\s+(summary|breakdown|overview)\s+(for|on)\s+',
            r'how\s+much\s+(money|profit|did\s+we\s+make)\s+(for|on)\s+',
        ],
        'keywords': [],
        'roles': ['owner'],
        'priority': 35,
    },
    {
        'name': 'job_status',
        'patterns': [
            r'job\s*status',
            r'(all|list|show)\s+jobs',
            r'active\s+jobs',
            r'job\s+(list|overview)',
        ],
        'keywords': [],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 15,
    },
    {
        'name': 'warranty',
        'patterns': [
            r'warranty\s+(status|items?|check|expir)',
            r'(check|show|list)\s+warrant',
        ],
        'keywords': ['warranty status', 'warranty items'],
        'roles': ALL_ROLES,
        'priority': 15,
    },
    {
        'name': 'service_calls',
        'patterns': [
            r'service\s*call',
            r'open\s+calls?',
        ],
        'keywords': ['service call'],
        'roles': ALL_ROLES,
        'priority': 15,
    },
    {
        'name': 'my_hours',
        'patterns': [
            r'my\s+(hours?|time)',
            r'(how\s+many|total)\s+hours?\s+(did\s+)?i\s+',
            r'hours?\s+i\s+(worked|logged)',
            r'my\s+(time|timesheet)',
        ],
        'keywords': [],
        'roles': ALL_ROLES,
        'priority': 25,
    },
    {
        'name': 'employee_hours',
        'patterns': [
            r'hours?\s+(for|by)\s+\w',
            r'time\s+(for|by)\s+\w',
            r"(how\s+many|total)\s+hours?\s+(did\s+|has\s+)?\w+\s+(work|log)",
            r'\w+.{0,3}s?\s+hours',
        ],
        'keywords': [],
        'roles': ['owner', 'admin'],
        'priority': 24,
    },
    {
        'name': 'contracts_status',
        'patterns': [
            r'(contract|contracts)\s*(status|summary|overview|list)?',
            r'(active|pending|draft)\s+contracts?',
            r'how\s+many\s+contracts?',
        ],
        'keywords': ['contracts', 'contract status', 'active contracts'],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 25,
    },
    {
        'name': 'workflow_status',
        'patterns': [
            r'workflow\s*(status|summary|overview|dashboard)?',
            r'project\s+(status|progress|overview)',
            r'(what|how).*(pending|open|outstanding)',
        ],
        'keywords': ['workflow status', 'workflow summary', 'project progress'],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 25,
    },
    {
        'name': 'code_search',
        'patterns': [
            r'(search|find|look\s*up)\s+(code|ibc|nec|irc)',
            r'^code\s+(search|lookup)',
            r'(code|building)\s+(section|book)',
        ],
        'keywords': ['search code', 'code search', 'find code'],
        'roles': ALL_ROLES,
        'priority': 15,
    },
    {
        'name': 'howto',
        'patterns': [
            r'^how\s*-?\s*to\s+',
            r'^howto\s+',
            r'how\s+(do\s+)?(i|you|we)\s+(install|fix|replace|repair|connect|mount)',
        ],
        'keywords': ['howto', 'how-to'],
        'roles': ALL_ROLES,
        'priority': 15,
    },
    {
        'name': 'invoice_job_spend',
        'patterns': [
            r'(total\s+)?spend\s+(on|for)\s+',
            r'how\s+much\s+(have\s+we\s+)?(spent|invoiced)\s+(on|for)\s+',
            r'invoice(d|s)?\s+(total|amount|sum)\s+(for|on)\s+',
            r'cost\s+(of|for|on)\s+',
        ],
        'keywords': ['job spend', 'total spend', 'total invoiced'],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 37,
    },
    {
        'name': 'invoice_supplier_spend',
        'patterns': [
            r'(spend|spent|total|invoiced)\s+(by|per|from|with)\s+supplier',
            r'supplier\s+(spend|total|breakdown|cost)',
            r'how\s+much\s+(from|to|with)\s+(locke|plumb)',
        ],
        'keywords': ['supplier spend', 'supplier breakdown', 'supplier totals'],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 37,
    },
    {
        'name': 'invoice_overdue',
        'patterns': [
            r'overdue\s+invoices?',
            r'invoices?\s+(overdue|past\s+due|late)',
            r'outstanding\s+(balance|invoices?)',
            r'unpaid\s+invoices?',
            r'what.*(overdue|past\s+due).*invoice',
        ],
        'keywords': ['overdue invoices', 'unpaid invoices', 'outstanding invoices'],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 37,
    },
    {
        'name': 'invoice_flags',
        'patterns': [
            r'invoice\s*(review\s+)?flags?',
            r'review\s+(flags?|issues?)',
            r'(any|show|list)\s+(invoice\s+)?flags?',
            r'import\s+(issues?|flags?|problems?)',
        ],
        'keywords': ['invoice flags', 'review flags', 'review issues'],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 37,
    },
    {
        'name': 'invoice_compare',
        'patterns': [
            r'compare\s+(costs?|spend|invoices?)\s+(between|for)\s+',
            r'(cost|spend)\s+comparison',
            r'compare\s+\w+\s+(and|vs\.?|versus)\s+',
        ],
        'keywords': ['compare costs', 'compare spend', 'cost comparison'],
        'roles': ['owner', 'admin', 'project_manager'],
        'priority': 38,
    },
    {
        'name': 'material_pricing',
        'patterns': [
            r'(price|pricing|cost)\s+(for|of|on)\s+\w',
            r'how\s+much\s+(does|is|for)\s+\w.*cost',
            r'(look\s*up|find|check)\s+(price|pricing)',
            r'(recent|latest|last)\s+(price|cost)\s+(for|of)',
        ],
        'keywords': ['material price', 'product price', 'material cost'],
        'roles': ['owner', 'admin', 'project_manager', 'warehouse'],
        'priority': 36,
    },
]


# ─── Entity Extraction ───────────────────────────────────────────

def extract_gc_name(msg):
    """Extract general contractor name from message."""
    patterns = [
        r'(?:bids?\s+(?:to|for|sent\s+to|submitted\s+to))\s+(.+?)(?:\?|$|\.)',
        r'(?:to|for|from)\s+([A-Z][A-Za-z\s&\'.]+?)(?:\?|$|\.)',
    ]
    for p in patterns:
        m = re.search(p, msg, re.IGNORECASE)
        if m:
            name = m.group(1).strip().rstrip('?.,!')
            if len(name) > 2 and name.lower() not in ('the', 'all', 'our', 'this', 'last', 'next'):
                return name
    return None


def extract_job_name(msg):
    """Extract job name from message."""
    patterns = [
        r'(?:profit|revenue|margin|financial|earnings)\s+(?:for|on)\s+(.+?)(?:\?|$|\.)',
        r'(?:job|project)\s+(.+?)(?:\?|$|\.|\s+status)',
    ]
    for p in patterns:
        m = re.search(p, msg, re.IGNORECASE)
        if m:
            name = m.group(1).strip().rstrip('?.,!')
            if len(name) > 1:
                return name
    return None


def extract_employee_name(msg):
    """Extract employee name from message."""
    patterns = [
        r'hours?\s+(?:for|by)\s+(.+?)(?:\?|$|\.)',
        r'time\s+(?:for|by)\s+(.+?)(?:\?|$|\.)',
    ]
    for p in patterns:
        m = re.search(p, msg, re.IGNORECASE)
        if m:
            name = m.group(1).strip().rstrip('?.,!')
            if len(name) > 1 and name.lower() not in ('me', 'myself', 'this', 'last', 'next'):
                return name
    return None


def extract_date_range(msg):
    """Extract date range from message. Returns (start_date, end_date) as strings or None."""
    now = datetime.now()

    # "last month"
    if re.search(r'last\s+month', msg, re.IGNORECASE):
        first = (now.replace(day=1) - timedelta(days=1)).replace(day=1)
        last = now.replace(day=1) - timedelta(days=1)
        return first.strftime('%Y-%m-%d'), last.strftime('%Y-%m-%d')

    # "this month"
    if re.search(r'this\s+month', msg, re.IGNORECASE):
        first = now.replace(day=1)
        return first.strftime('%Y-%m-%d'), now.strftime('%Y-%m-%d')

    # "last week"
    if re.search(r'last\s+week', msg, re.IGNORECASE):
        end = now - timedelta(days=now.weekday() + 1)
        start = end - timedelta(days=6)
        return start.strftime('%Y-%m-%d'), end.strftime('%Y-%m-%d')

    # "this week"
    if re.search(r'this\s+week', msg, re.IGNORECASE):
        start = now - timedelta(days=now.weekday())
        return start.strftime('%Y-%m-%d'), now.strftime('%Y-%m-%d')

    # "due this week"
    if re.search(r'due\s+this\s+week', msg, re.IGNORECASE):
        start = now - timedelta(days=now.weekday())
        end = start + timedelta(days=6)
        return start.strftime('%Y-%m-%d'), end.strftime('%Y-%m-%d')

    # Quarter: "Q1 2025"
    m = re.search(r'q([1-4])\s*(\d{4})', msg, re.IGNORECASE)
    if m:
        q, year = int(m.group(1)), int(m.group(2))
        starts = {1: '01-01', 2: '04-01', 3: '07-01', 4: '10-01'}
        ends = {1: '03-31', 2: '06-30', 3: '09-30', 4: '12-31'}
        return f'{year}-{starts[q]}', f'{year}-{ends[q]}'

    # Year only: "2024", "in 2025"
    m = re.search(r'\b(20\d{2})\b', msg)
    if m:
        year = m.group(1)
        return f'{year}-01-01', f'{year}-12-31'

    # "last N days"
    m = re.search(r'last\s+(\d+)\s+days?', msg, re.IGNORECASE)
    if m:
        days = int(m.group(1))
        start = now - timedelta(days=days)
        return start.strftime('%Y-%m-%d'), now.strftime('%Y-%m-%d')

    # "recent" (last 30 days)
    if re.search(r'\b(recent|latest|newest)\b', msg, re.IGNORECASE):
        start = now - timedelta(days=30)
        return start.strftime('%Y-%m-%d'), now.strftime('%Y-%m-%d')

    return None


def extract_bid_search(msg):
    """Extract bid name/query for single bid lookup."""
    clean = re.sub(r'^(bid|show|find|look\s*up)\s+', '', msg.strip(), flags=re.IGNORECASE)
    clean = re.sub(r'\s*(summary|details?|info)\s*', '', clean, flags=re.IGNORECASE).strip()
    return clean if clean else None


def extract_code_query(msg):
    """Extract search query for code books."""
    clean = msg.lower()
    for prefix in ['search code', 'code search', 'find code', 'look up code',
                    'lookup code', 'code lookup', 'code section', 'building code']:
        clean = clean.replace(prefix, '')
    return clean.strip()


def extract_howto_query(msg):
    """Extract search query for how-to articles."""
    clean = msg
    clean = re.sub(r'^(howto|how[\s-]*to)\s+', '', clean, flags=re.IGNORECASE)
    # Keep "how do I install X" → "install X"
    clean = re.sub(r'^how\s+(do\s+)?(i|you|we)\s+', '', clean, flags=re.IGNORECASE)
    return clean.strip()


def extract_nav_target(msg):
    """Extract navigation destination from message."""
    clean = re.sub(
        r'^(go\s+to|take\s+me\s+to|open|navigate\s+to|show\s+me|bring\s+up|pull\s+up|switch\s+to)\s+',
        '', msg.strip(), flags=re.IGNORECASE
    ).strip().rstrip('?.,!')
    # Try exact match first, then partial
    lower = clean.lower()
    if lower in NAV_MAP:
        return lower, NAV_MAP[lower]
    # Partial match
    for key, url in NAV_MAP.items():
        if key in lower or lower in key:
            return key, url
    return None, None


# ─── Intent Classification ───────────────────────────────────────

def classify_intent(msg, role):
    """Match message to best intent the user's role allows."""
    msg_lower = msg.lower().strip()
    best = None
    best_priority = -1

    for intent in INTENTS:
        if role not in intent['roles']:
            continue

        matched = False
        for pattern in intent['patterns']:
            if re.search(pattern, msg_lower):
                matched = True
                break

        if not matched:
            for kw in intent['keywords']:
                if kw in msg_lower:
                    matched = True
                    break

        # For navigation, only match if the target resolves to a known section
        if matched and intent['name'] == 'navigate':
            _, url = extract_nav_target(msg)
            if not url:
                matched = False

        if matched and intent['priority'] > best_priority:
            best = intent['name']
            best_priority = intent['priority']

    return best


# ─── Query Handlers ──────────────────────────────────────────────

def handle_navigate(conn, msg, role, user_id):
    target, url = extract_nav_target(msg)
    if not url:
        sections = ', '.join(sorted(set(NAV_MAP.keys())))
        return f"I couldn't find that section. Try one of: {sections}"
    label = target.title()
    return f"[NAV:{url}] Taking you to **{label}**..."


def handle_help(conn, msg, role, user_id):
    lines = ["I can help with:\n"]

    lines.append("**Navigation** (I can take you anywhere!):")
    lines.append("- **go to [section]** — e.g. \"go to rfis\", \"take me to expenses\", \"open schedule\"")
    lines.append("")

    if role in ('owner', 'admin', 'project_manager'):
        lines.append("**Bids & Jobs:**")
        lines.append("- **how many bids?** — Count bids, filter by GC")
        lines.append("- **total value of bids to [GC]?** — Sum bid values")
        lines.append("- **win rate** — Accepted vs rejected statistics")
        lines.append("- **top GCs** — Which contractors accept our bids most")
        lines.append("- **bids from last month** — Date-filtered bid list")
        lines.append("- **bid [name]** — Look up a specific bid")
        lines.append("- **job status** — List all jobs")
        lines.append("")

    if role == 'owner':
        lines.append("**Financials:**")
        lines.append("- **profit for [job]** — Revenue minus expenses & labor")
        lines.append("- **hours for [name]** — Any employee's time entries")
        lines.append("")

    if role in ('owner', 'admin', 'project_manager'):
        lines.append("**Project Tracking:**")
        lines.append("- **open RFIs** — Open/unanswered RFIs by job")
        lines.append("- **pending change orders** — Change order status & totals")
        lines.append("- **pending submittals** — Submittal status overview")
        lines.append("- **closeout status** — Incomplete closeout items")
        lines.append("- **contract status** — Active/pending contracts")
        lines.append("- **workflow status** — Cross-feature summary")
        lines.append("")
        lines.append("**Company:**")
        lines.append("- **overdue expenses** — Past-due recurring bills")
        lines.append("- **expired licenses** — License expiration status")
        lines.append("")

    lines.append("**General:**")
    if role in ('owner', 'admin', 'project_manager'):
        lines.append("")
        lines.append("**Invoice Analytics:**")
        lines.append("- **spend on [job name]** — Total invoiced for a job")
        lines.append("- **supplier spend** — Breakdown by supplier")
        lines.append("- **overdue invoices** — List past-due invoices")
        lines.append("- **invoice flags** — Unresolved review flags")
        lines.append("- **compare [job1] and [job2]** — Side-by-side cost comparison")
        lines.append("- **price for [product code]** — Recent material pricing")
        lines.append("")

    lines.append("**General:**")
    lines.append("- **my hours** — Your time entries this week")
    lines.append("- **warranty status [job]** — Check warranty items")
    lines.append("- **open service calls** — List open service calls")
    lines.append("- **search code [query]** — Search code book sections")
    lines.append("- **howto [topic]** — Search how-to articles")

    return '\n'.join(lines)


def handle_expenses_summary(conn, msg, role, user_id):
    today = datetime.now().strftime('%Y-%m-%d')
    msg_lower = msg.lower()

    if re.search(r'(overdue|past\s+due|late)', msg_lower):
        rows = conn.execute(
            """SELECT * FROM recurring_expenses
               WHERE is_active = 1 AND next_due_date != '' AND next_due_date < ?
               ORDER BY next_due_date""",
            (today,)
        ).fetchall()
        if not rows:
            return "No overdue expenses found. You're all caught up!"
        total = sum(r['amount'] or 0 for r in rows)
        lines = [f"**{len(rows)}** overdue expense(s) totaling **${total:,.2f}**:\n"]
        for r in rows:
            lines.append(f"- **{r['vendor'] or r['category']}** — ${r['amount']:,.2f} ({r['frequency']}) — due {r['next_due_date']} — [View](/expenses)")
        return '\n'.join(lines)

    if re.search(r'(upcoming|next|due)', msg_lower):
        week_out = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
        rows = conn.execute(
            """SELECT * FROM recurring_expenses
               WHERE is_active = 1 AND next_due_date BETWEEN ? AND ?
               ORDER BY next_due_date""",
            (today, week_out)
        ).fetchall()
        if not rows:
            return "No expenses due in the next 7 days."
        total = sum(r['amount'] or 0 for r in rows)
        lines = [f"**{len(rows)}** expense(s) due this week totaling **${total:,.2f}**:\n"]
        for r in rows:
            lines.append(f"- **{r['vendor'] or r['category']}** — ${r['amount']:,.2f} — due {r['next_due_date']}")
        return '\n'.join(lines)

    # General summary
    active = conn.execute(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total FROM recurring_expenses WHERE is_active = 1"
    ).fetchone()
    overdue = conn.execute(
        "SELECT COUNT(*) as cnt FROM recurring_expenses WHERE is_active = 1 AND next_due_date != '' AND next_due_date < ?",
        (today,)
    ).fetchone()
    lines = [f"**Recurring Expenses Summary:**\n"]
    lines.append(f"- **{active['cnt']}** active expenses — **${active['total']:,.2f}**/cycle")
    lines.append(f"- **{overdue['cnt']}** overdue")
    lines.append(f"\n[View All Expenses](/expenses)")
    return '\n'.join(lines)


def handle_licenses_status(conn, msg, role, user_id):
    today = datetime.now().strftime('%Y-%m-%d')
    msg_lower = msg.lower()

    if re.search(r'expir(ed|ing)', msg_lower):
        # Show expired + expiring soon
        soon = (datetime.now() + timedelta(days=60)).strftime('%Y-%m-%d')
        expired = conn.execute(
            """SELECT * FROM licenses
               WHERE expiration_date != '' AND expiration_date < ?
               ORDER BY expiration_date""",
            (today,)
        ).fetchall()
        expiring = conn.execute(
            """SELECT * FROM licenses
               WHERE expiration_date != '' AND expiration_date BETWEEN ? AND ?
               ORDER BY expiration_date""",
            (today, soon)
        ).fetchall()
        lines = []
        if expired:
            lines.append(f"**{len(expired)} EXPIRED license(s):**\n")
            for l in expired:
                lines.append(f"- **{l['license_name']}** ({l['license_type']}) — {l['holder_name']} — expired {l['expiration_date']}")
        if expiring:
            lines.append(f"\n**{len(expiring)} expiring within 60 days:**\n")
            for l in expiring:
                lines.append(f"- **{l['license_name']}** ({l['license_type']}) — {l['holder_name']} — expires {l['expiration_date']}")
        if not expired and not expiring:
            return "All licenses are current. No expirations within 60 days."
        lines.append(f"\n[View All Licenses](/licenses)")
        return '\n'.join(lines)

    # General summary
    total = conn.execute("SELECT COUNT(*) as cnt FROM licenses").fetchone()
    expired = conn.execute(
        "SELECT COUNT(*) as cnt FROM licenses WHERE expiration_date != '' AND expiration_date < ?",
        (today,)
    ).fetchone()
    soon = (datetime.now() + timedelta(days=60)).strftime('%Y-%m-%d')
    expiring = conn.execute(
        "SELECT COUNT(*) as cnt FROM licenses WHERE expiration_date != '' AND expiration_date BETWEEN ? AND ?",
        (today, soon)
    ).fetchone()
    lines = ["**License Summary:**\n"]
    lines.append(f"- **{total['cnt']}** total licenses")
    lines.append(f"- **{expired['cnt']}** expired")
    lines.append(f"- **{expiring['cnt']}** expiring within 60 days")
    lines.append(f"\n[View All Licenses](/licenses)")
    return '\n'.join(lines)


def handle_rfis_status(conn, msg, role, user_id):
    open_rfis = conn.execute(
        """SELECT r.*, j.name as job_name FROM rfis r
           JOIN jobs j ON r.job_id = j.id
           WHERE r.status = 'Open'
           ORDER BY r.date_submitted DESC"""
    ).fetchall()

    if not open_rfis:
        return "No open RFIs. All caught up!"

    # Group by job
    by_job = {}
    for r in open_rfis:
        job = r['job_name']
        if job not in by_job:
            by_job[job] = []
        by_job[job].append(r)

    lines = [f"**{len(open_rfis)}** open RFI(s) across **{len(by_job)}** job(s):\n"]
    for job, rfis in by_job.items():
        lines.append(f"**{job}** ({len(rfis)}):")
        for r in rfis[:3]:
            overdue = ""
            if r['date_required'] and r['date_required'] < datetime.now().strftime('%Y-%m-%d'):
                overdue = " **OVERDUE**"
            lines.append(f"- RFI #{r['rfi_number']}: {r['subject'][:50]}{overdue}")
        if len(rfis) > 3:
            lines.append(f"  ...and {len(rfis) - 3} more")
    lines.append(f"\n[View All RFIs](/rfis)")
    return '\n'.join(lines)


def handle_change_orders_status(conn, msg, role, user_id):
    msg_lower = msg.lower()

    if re.search(r'approved', msg_lower):
        status_filter = 'Approved'
    elif re.search(r'pending|draft', msg_lower):
        status_filter = None  # Show Draft + Submitted
    else:
        status_filter = None

    if status_filter == 'Approved':
        rows = conn.execute(
            """SELECT co.*, j.name as job_name FROM change_orders co
               JOIN jobs j ON co.job_id = j.id
               WHERE co.status = 'Approved'
               ORDER BY co.approved_date DESC LIMIT 10"""
        ).fetchall()
        total = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) as total FROM change_orders WHERE status = 'Approved'"
        ).fetchone()
        if not rows:
            return "No approved change orders found."
        lines = [f"**{len(rows)}** approved change order(s) — total **${total['total']:,.2f}**:\n"]
        for co in rows:
            lines.append(f"- **CO #{co['co_number']}** {co['title'][:40]} — {co['job_name']} — ${co['amount']:,.2f}")
    else:
        rows = conn.execute(
            """SELECT co.*, j.name as job_name FROM change_orders co
               JOIN jobs j ON co.job_id = j.id
               WHERE co.status IN ('Draft', 'Submitted')
               ORDER BY co.created_at DESC LIMIT 10"""
        ).fetchall()
        if not rows:
            return "No pending change orders. All clear!"
        lines = [f"**{len(rows)}** pending change order(s):\n"]
        for co in rows:
            lines.append(f"- **CO #{co['co_number']}** {co['title'][:40]} — {co['job_name']} — ${co['amount']:,.2f} [{co['status']}]")

    # Always show overall stats
    stats = conn.execute(
        """SELECT status, COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
           FROM change_orders GROUP BY status"""
    ).fetchall()
    if stats:
        lines.append("\n**Overall:**")
        for s in stats:
            lines.append(f"- {s['status']}: {s['cnt']} (${s['total']:,.2f})")
    lines.append(f"\n[View All Change Orders](/change-orders)")
    return '\n'.join(lines)


def handle_submittals_status(conn, msg, role, user_id):
    msg_lower = msg.lower()

    if re.search(r'rejected|resubmit', msg_lower):
        rows = conn.execute(
            """SELECT s.*, j.name as job_name FROM submittals s
               JOIN jobs j ON s.job_id = j.id
               WHERE s.status IN ('Rejected', 'Resubmit')
               ORDER BY s.updated_at DESC"""
        ).fetchall()
        if not rows:
            return "No rejected submittals. All clear!"
        lines = [f"**{len(rows)}** rejected/resubmit submittal(s):\n"]
        for s in rows:
            lines.append(f"- **#{s['submittal_number']}** {s['description'][:40]} — {s['job_name']} [{s['status']}]")
        lines.append(f"\n[View All Submittals](/submittals)")
        return '\n'.join(lines)

    # General status — show pending
    pending = conn.execute(
        """SELECT s.*, j.name as job_name FROM submittals s
           JOIN jobs j ON s.job_id = j.id
           WHERE s.status IN ('Pending', 'Submitted')
           ORDER BY s.date_required ASC"""
    ).fetchall()

    stats = conn.execute(
        "SELECT status, COUNT(*) as cnt FROM submittals GROUP BY status"
    ).fetchall()

    lines = ["**Submittal Summary:**\n"]
    for s in stats:
        lines.append(f"- {s['status']}: **{s['cnt']}**")

    if pending:
        lines.append(f"\n**{len(pending)}** pending/submitted:")
        for s in pending[:5]:
            overdue = ""
            if s['date_required'] and s['date_required'] < datetime.now().strftime('%Y-%m-%d'):
                overdue = " **OVERDUE**"
            lines.append(f"- **#{s['submittal_number']}** {s['description'][:40]} — {s['job_name']}{overdue}")
        if len(pending) > 5:
            lines.append(f"  ...and {len(pending) - 5} more")

    lines.append(f"\n[View All Submittals](/submittals)")
    return '\n'.join(lines)


def handle_documents_status(conn, msg, role, user_id):
    # Get incomplete items grouped by job
    rows = conn.execute(
        """SELECT cl.*, j.name as job_name FROM closeout_checklists cl
           JOIN jobs j ON cl.job_id = j.id
           WHERE cl.status IN ('Not Started', 'In Progress')
           ORDER BY j.name, cl.sort_order"""
    ).fetchall()

    total_items = conn.execute("SELECT COUNT(*) as cnt FROM closeout_checklists").fetchone()
    complete = conn.execute(
        "SELECT COUNT(*) as cnt FROM closeout_checklists WHERE status IN ('Complete', 'N/A')"
    ).fetchone()

    lines = ["**Closeout Document Status:**\n"]
    lines.append(f"- **{complete['cnt']}** / **{total_items['cnt']}** items complete")
    lines.append(f"- **{len(rows)}** remaining\n")

    if rows:
        by_job = {}
        for r in rows:
            job = r['job_name']
            if job not in by_job:
                by_job[job] = []
            by_job[job].append(r)

        for job, items in list(by_job.items())[:5]:
            lines.append(f"**{job}** ({len(items)} remaining):")
            for item in items[:3]:
                lines.append(f"- {item['item_name']} ({item['item_type']}) [{item['status']}]")
            if len(items) > 3:
                lines.append(f"  ...and {len(items) - 3} more")

    lines.append(f"\n[View Documents](/documents)")
    return '\n'.join(lines)


def handle_bid_count(conn, msg, role, user_id):
    gc = extract_gc_name(msg)
    if gc:
        row = conn.execute(
            'SELECT COUNT(*) as cnt FROM bids WHERE contracting_gc LIKE ?',
            (f'%{gc}%',)
        ).fetchone()
        return f"**{row['cnt']}** bid(s) found for GC matching **{gc}**."
    else:
        row = conn.execute('SELECT COUNT(*) as cnt FROM bids').fetchone()
        return f"**{row['cnt']}** total bid(s) in the system."


def handle_bid_value(conn, msg, role, user_id):
    gc = extract_gc_name(msg)
    if gc:
        row = conn.execute(
            'SELECT COUNT(*) as cnt, COALESCE(SUM(total_bid), 0) as total FROM bids WHERE contracting_gc LIKE ?',
            (f'%{gc}%',)
        ).fetchone()
        return (f"**{row['cnt']}** bid(s) to **{gc}**\n"
                f"Total value: **${row['total']:,.2f}**")
    else:
        row = conn.execute(
            'SELECT COUNT(*) as cnt, COALESCE(SUM(total_bid), 0) as total FROM bids'
        ).fetchone()
        return (f"**{row['cnt']}** total bid(s)\n"
                f"Combined value: **${row['total']:,.2f}**")


def handle_bid_win_rate(conn, msg, role, user_id):
    rows = conn.execute(
        "SELECT status, COUNT(*) as cnt FROM bids GROUP BY status ORDER BY cnt DESC"
    ).fetchall()
    if not rows:
        return "No bids found in the system."

    total = sum(r['cnt'] for r in rows)
    accepted = sum(r['cnt'] for r in rows if r['status'] and r['status'].lower() in ('accepted', 'won', 'awarded'))
    rejected = sum(r['cnt'] for r in rows if r['status'] and r['status'].lower() in ('rejected', 'lost', 'declined'))

    lines = [f"**Bid Statistics** ({total} total bids):\n"]
    for r in rows:
        pct = (r['cnt'] / total * 100) if total > 0 else 0
        lines.append(f"- **{r['status'] or 'No Status'}**: {r['cnt']} ({pct:.0f}%)")

    if total > 0:
        win_rate = (accepted / total * 100)
        lines.append(f"\nWin rate: **{win_rate:.0f}%** ({accepted} accepted out of {total})")

    return '\n'.join(lines)


def handle_bid_top_gcs(conn, msg, role, user_id):
    rows = conn.execute(
        """SELECT contracting_gc, COUNT(*) as cnt,
           SUM(CASE WHEN LOWER(status) IN ('accepted','won','awarded') THEN 1 ELSE 0 END) as accepted
           FROM bids WHERE contracting_gc != ''
           GROUP BY contracting_gc ORDER BY accepted DESC, cnt DESC LIMIT 10"""
    ).fetchall()
    if not rows:
        return "No bids with GC information found."

    lines = ["**Top General Contractors** (by accepted bids):\n"]
    for i, r in enumerate(rows, 1):
        rate = (r['accepted'] / r['cnt'] * 100) if r['cnt'] > 0 else 0
        lines.append(f"{i}. **{r['contracting_gc']}** — {r['accepted']}/{r['cnt']} accepted ({rate:.0f}%)")

    return '\n'.join(lines)


def handle_bid_by_date(conn, msg, role, user_id):
    date_range = extract_date_range(msg)
    if not date_range:
        return "I couldn't determine the date range. Try: **bids from last month**, **bids Q1 2025**, or **bids 2024**."

    start, end = date_range
    bids = conn.execute(
        """SELECT b.bid_name, b.status, b.total_bid, b.contracting_gc, b.bid_date,
                  j.name as job_name
           FROM bids b LEFT JOIN jobs j ON b.job_id = j.id
           WHERE (b.bid_date BETWEEN ? AND ?) OR (b.bid_submitted_date BETWEEN ? AND ?)
           ORDER BY b.bid_date DESC LIMIT 15""",
        (start, end, start, end)
    ).fetchall()

    if not bids:
        return f"No bids found between **{start}** and **{end}**."

    lines = [f"**{len(bids)}** bid(s) from **{start}** to **{end}**:\n"]
    for b in bids:
        gc = f" → {b['contracting_gc']}" if b['contracting_gc'] else ""
        job = b['job_name'] or 'No job'
        lines.append(f"- **{b['bid_name']}** — {job}{gc} | {b['status']} | ${b['total_bid']:,.2f}")

    return '\n'.join(lines)


def handle_bid_lookup(conn, msg, role, user_id):
    query = extract_bid_search(msg)
    if not query:
        return "Please specify a bid name. Example: **bid Riverside Apartments**"

    bids = conn.execute(
        """SELECT b.*, j.name as job_name FROM bids b
           LEFT JOIN jobs j ON b.job_id = j.id
           WHERE b.bid_name LIKE ? OR j.name LIKE ?
           ORDER BY b.updated_at DESC LIMIT 10""",
        (f'%{query}%', f'%{query}%')
    ).fetchall()
    if not bids:
        return f"No bids found matching **{query}**."

    lines = [f"Found **{len(bids)}** bid(s):"]
    for b in bids:
        job = b['job_name'] or 'No job'
        gc = f" → {b['contracting_gc']}" if b['contracting_gc'] else ""
        lines.append(f"- **{b['bid_name']}** — {job}{gc} | Status: {b['status']} | Total: ${b['total_bid']:,.2f}")

    return '\n'.join(lines)


def handle_bid_list(conn, msg, role, user_id):
    bids = conn.execute(
        """SELECT b.bid_name, b.status, b.total_bid, b.contracting_gc, j.name as job_name
           FROM bids b LEFT JOIN jobs j ON b.job_id = j.id
           ORDER BY b.updated_at DESC LIMIT 10"""
    ).fetchall()
    if not bids:
        return "No bids found."

    lines = [f"**{len(bids)}** most recent bid(s):"]
    for b in bids:
        job = b['job_name'] or 'No job'
        gc = f" → {b['contracting_gc']}" if b['contracting_gc'] else ""
        lines.append(f"- **{b['bid_name']}** — {job}{gc} | {b['status']} | ${b['total_bid']:,.2f}")

    return '\n'.join(lines)


def handle_profit(conn, msg, role, user_id):
    job_name = extract_job_name(msg)
    if not job_name:
        return "Please specify a job. Example: **profit for Sunrise Estates**"

    job = conn.execute('SELECT * FROM jobs WHERE name LIKE ?', (f'%{job_name}%',)).fetchone()
    if not job:
        return f"No job found matching **{job_name}**."

    jid = job['id']
    expenses = conn.execute('SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE job_id = ?', (jid,)).fetchone()[0]
    payments = conn.execute('SELECT COALESCE(SUM(amount), 0) FROM payments WHERE job_id = ?', (jid,)).fetchone()[0]
    invoiced = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM client_invoices WHERE job_id = ? AND status = 'Paid'", (jid,)
    ).fetchone()[0]
    labor = conn.execute(
        'SELECT COALESCE(SUM(hours * hourly_rate), 0) FROM time_entries WHERE job_id = ?', (jid,)
    ).fetchone()[0]

    # Material cost
    items = conn.execute(
        'SELECT total_net_price, qty_ordered, price_per FROM line_items WHERE job_id = ?', (jid,)
    ).fetchall()
    material_cost = sum(
        (row['total_net_price'] or 0) if (row['total_net_price'] or 0)
        else (row['qty_ordered'] or 0) * (row['price_per'] or 0)
        for row in items
    )

    total_cost = expenses + labor + material_cost
    revenue = invoiced + payments
    profit = revenue - total_cost

    return (f"**Financial Summary for {job['name']}** (Status: {job['status']})\n\n"
            f"Revenue:\n"
            f"- Invoiced (Paid): **${invoiced:,.2f}**\n"
            f"- Payments received: **${payments:,.2f}**\n"
            f"- Total revenue: **${revenue:,.2f}**\n\n"
            f"Costs:\n"
            f"- Expenses: **${expenses:,.2f}**\n"
            f"- Labor: **${labor:,.2f}**\n"
            f"- Materials: **${material_cost:,.2f}**\n"
            f"- Total cost: **${total_cost:,.2f}**\n\n"
            f"Net profit: **${profit:,.2f}**")


def handle_job_status(conn, msg, role, user_id):
    jobs = conn.execute('SELECT id, name, status FROM jobs ORDER BY name').fetchall()
    if not jobs:
        return "No jobs found."

    lines = [f"**{len(jobs)}** job(s):"]
    for j in jobs:
        lines.append(f"- **{j['name']}** — {j['status']}")
    return '\n'.join(lines)


def handle_warranty(conn, msg, role, user_id):
    query = re.sub(r'\b(warranty|status|check|items?|show|list)\b', '', msg, flags=re.IGNORECASE).strip()
    if query:
        items = conn.execute(
            """SELECT wi.*, j.name as job_name FROM warranty_items wi
               JOIN jobs j ON wi.job_id = j.id WHERE j.name LIKE ? ORDER BY wi.warranty_end LIMIT 10""",
            (f'%{query}%',)
        ).fetchall()
    else:
        items = conn.execute(
            """SELECT wi.*, j.name as job_name FROM warranty_items wi
               JOIN jobs j ON wi.job_id = j.id ORDER BY wi.warranty_end LIMIT 10"""
        ).fetchall()

    if not items:
        return "No warranty items found." + (f" for **{query}**" if query else "")

    lines = [f"Found **{len(items)}** warranty item(s):"]
    for w in items:
        lines.append(f"- **{w['job_name']}** — {w['item_description']} ({w['status']}, expires {w['warranty_end'] or 'N/A'})")
    return '\n'.join(lines)


def handle_service_calls(conn, msg, role, user_id):
    calls = conn.execute(
        """SELECT sc.*, j.name as job_name FROM service_calls sc
           LEFT JOIN jobs j ON sc.job_id = j.id
           WHERE sc.status NOT IN ('Resolved','Closed')
           ORDER BY CASE sc.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 ELSE 2 END
           LIMIT 10"""
    ).fetchall()
    if not calls:
        return "No open service calls found."

    lines = [f"**{len(calls)}** open service call(s):"]
    for c in calls:
        job = c['job_name'] or 'No job'
        lines.append(f"- **#{c['id']}** [{c['priority']}] {c['description'][:60]} — {job} ({c['status']})")
    return '\n'.join(lines)


def handle_my_hours(conn, msg, role, user_id):
    date_range = extract_date_range(msg)
    if not date_range:
        # Default to this week
        now = datetime.now()
        start = (now - timedelta(days=now.weekday())).strftime('%Y-%m-%d')
        end = now.strftime('%Y-%m-%d')
    else:
        start, end = date_range

    entries = conn.execute(
        """SELECT te.hours, te.work_date, te.description, te.approved, j.name as job_name
           FROM time_entries te LEFT JOIN jobs j ON te.job_id = j.id
           WHERE te.user_id = ? AND te.work_date BETWEEN ? AND ?
           ORDER BY te.work_date DESC LIMIT 20""",
        (user_id, start, end)
    ).fetchall()

    total = sum(e['hours'] or 0 for e in entries)

    if not entries:
        return f"No time entries found from **{start}** to **{end}**."

    lines = [f"**Your hours** ({start} to {end}) — **{total:.1f}** total hours:\n"]
    for e in entries:
        status = 'Approved' if e['approved'] else 'Pending'
        desc = f" — {e['description']}" if e['description'] else ""
        lines.append(f"- **{e['work_date']}**: {e['hours']:.1f}h on {e['job_name'] or 'N/A'}{desc} [{status}]")
    return '\n'.join(lines)


def handle_employee_hours(conn, msg, role, user_id):
    name = extract_employee_name(msg)
    if not name:
        return "Please specify an employee name. Example: **hours for John Smith**"

    user = conn.execute(
        'SELECT id, display_name FROM users WHERE display_name LIKE ? OR username LIKE ?',
        (f'%{name}%', f'%{name}%')
    ).fetchone()
    if not user:
        return f"No employee found matching **{name}**."

    date_range = extract_date_range(msg)
    if not date_range:
        now = datetime.now()
        start = (now - timedelta(days=now.weekday())).strftime('%Y-%m-%d')
        end = now.strftime('%Y-%m-%d')
    else:
        start, end = date_range

    entries = conn.execute(
        """SELECT te.hours, te.work_date, te.description, te.approved, j.name as job_name
           FROM time_entries te LEFT JOIN jobs j ON te.job_id = j.id
           WHERE te.user_id = ? AND te.work_date BETWEEN ? AND ?
           ORDER BY te.work_date DESC LIMIT 20""",
        (user['id'], start, end)
    ).fetchall()

    total = sum(e['hours'] or 0 for e in entries)

    if not entries:
        return f"No time entries for **{user['display_name']}** from **{start}** to **{end}**."

    lines = [f"**{user['display_name']}** ({start} to {end}) — **{total:.1f}** total hours:\n"]
    for e in entries:
        status = 'Approved' if e['approved'] else 'Pending'
        desc = f" — {e['description']}" if e['description'] else ""
        lines.append(f"- **{e['work_date']}**: {e['hours']:.1f}h on {e['job_name'] or 'N/A'}{desc} [{status}]")
    return '\n'.join(lines)


def handle_contracts_status(conn, msg, role, user_id):
    contracts = conn.execute(
        """SELECT c.*, j.name as job_name FROM contracts c
           JOIN jobs j ON c.job_id = j.id
           ORDER BY c.created_at DESC"""
    ).fetchall()

    if not contracts:
        return "No contracts found. [Go to Contracts](/contracts) to add one."

    by_status = {}
    total_value = 0
    for c in contracts:
        s = c['status']
        if s not in by_status:
            by_status[s] = []
        by_status[s].append(c)
        total_value += c['value'] or 0

    lines = [f"**{len(contracts)}** contract(s) — total value **${total_value:,.2f}**\n"]
    for status in ['Active', 'Draft', 'Complete', 'Terminated']:
        items = by_status.get(status, [])
        if items:
            lines.append(f"**{status}** ({len(items)}):")
            for c in items[:3]:
                val = f" — ${c['value']:,.2f}" if c['value'] else ""
                lines.append(f"- {c['job_name']}: {c['title']}{val}")
            if len(items) > 3:
                lines.append(f"  ...and {len(items) - 3} more")

    lines.append(f"\n[View All Contracts](/contracts)")
    return '\n'.join(lines)


def handle_workflow_status(conn, msg, role, user_id):
    # Get counts across features
    rfis = conn.execute("SELECT COUNT(*) as cnt FROM rfis WHERE status = 'Open'").fetchone()['cnt']
    submittals = conn.execute("SELECT COUNT(*) as cnt FROM submittals WHERE status IN ('Pending','Submitted')").fetchone()['cnt']
    cos = conn.execute("SELECT COUNT(*) as cnt FROM change_orders WHERE status IN ('Draft','Submitted')").fetchone()['cnt']
    sched = conn.execute("SELECT COUNT(*) as cnt FROM job_schedule_events WHERE status = 'In Progress'").fetchone()['cnt']
    pa = conn.execute("SELECT COUNT(*) as cnt FROM pay_applications WHERE status IN ('Draft','Submitted')").fetchone()['cnt']

    lines = ["**Workflow Summary:**\n"]
    lines.append(f"- **Open RFIs:** {rfis}")
    lines.append(f"- **Pending Submittals:** {submittals}")
    lines.append(f"- **Pending Change Orders:** {cos}")
    lines.append(f"- **In-Progress Schedule Items:** {sched}")
    lines.append(f"- **Pending Pay Apps:** {pa}")

    total = rfis + submittals + cos + sched + pa
    if total == 0:
        lines.append("\nAll clear — no pending items!")
    else:
        lines.append(f"\n**{total}** total pending items across all features.")

    lines.append(f"\n[View Workflow Dashboard](/workflow)")
    return '\n'.join(lines)


def handle_code_search(conn, msg, role, user_id):
    query = extract_code_query(msg)
    if not query:
        return "Please provide a search term. Example: **search code fire protection**"

    sections = conn.execute(
        """SELECT cs.section_number, cs.title, cb.code FROM code_sections cs
           JOIN code_books cb ON cs.book_id = cb.id
           WHERE cs.section_number LIKE ? OR cs.title LIKE ?
           ORDER BY cb.code, cs.sort_order LIMIT 10""",
        (f'%{query}%', f'%{query}%')
    ).fetchall()

    if not sections:
        return f"No code sections found matching **{query}**."

    lines = [f"Found **{len(sections)}** matching section(s):"]
    for s in sections:
        lines.append(f"- **[{s['code']}]** {s['section_number']}: {s['title']}")
    return '\n'.join(lines)


def handle_howto(conn, msg, role, user_id):
    query = extract_howto_query(msg)
    if not query:
        articles = conn.execute(
            'SELECT id, title, category FROM howto_articles ORDER BY updated_at DESC LIMIT 10'
        ).fetchall()
    else:
        articles = conn.execute(
            """SELECT id, title, category FROM howto_articles
               WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC LIMIT 10""",
            (f'%{query}%', f'%{query}%')
        ).fetchall()

    if not articles:
        return "No how-to articles found." + (f" matching **{query}**" if query else "")

    lines = [f"Found **{len(articles)}** article(s):"]
    for a in articles:
        cat = f" [{a['category']}]" if a['category'] else ""
        lines.append(f"- **{a['title']}**{cat} — [View](/howtos/{a['id']})")
    return '\n'.join(lines)


# ─── Invoice Analytics Handlers ───────────────────────────────────

def _extract_job_name(msg):
    """Extract job name from message like 'spend on Quail Creek' or 'cost for Smith Residence'."""
    patterns = [
        r'(?:spend|spent|invoiced?|cost|total)\s+(?:on|for)\s+(.+?)(?:\?|$|\.)',
        r'(?:on|for)\s+(.+?)(?:\?|$|\.)',
    ]
    for p in patterns:
        m = re.search(p, msg, re.IGNORECASE)
        if m:
            name = m.group(1).strip().rstrip('?.,!')
            if len(name) > 2 and name.lower() not in ('the', 'all', 'each', 'every', 'a', 'this'):
                return name
    return None


def _find_job_by_name(conn, name):
    """Fuzzy-find a job by name substring."""
    if not name:
        return None
    row = conn.execute("SELECT id, name FROM jobs WHERE LOWER(name) LIKE ? ORDER BY name LIMIT 1",
                       (f'%{name.lower()}%',)).fetchone()
    return row


def handle_invoice_job_spend(conn, msg, role, user_id):
    job_name = _extract_job_name(msg)
    if not job_name:
        # Show top jobs by spend
        rows = conn.execute('''
            SELECT j.name, COUNT(si.id) as cnt, COALESCE(SUM(si.total),0) as total,
                   COALESCE(SUM(si.balance_due),0) as balance
            FROM supplier_invoices si
            LEFT JOIN jobs j ON si.job_id = j.id
            WHERE si.is_duplicate = 0
            GROUP BY si.job_id ORDER BY total DESC LIMIT 10
        ''').fetchall()
        if not rows:
            return "No invoices found."
        lines = ["**Top Jobs by Invoice Spend:**\n"]
        lines.append("| Job | Invoices | Total | Balance |")
        lines.append("|-----|----------|-------|---------|")
        for r in rows:
            lines.append(f"| {r['name'] or 'Unassigned'} | {r['cnt']} | ${r['total']:,.2f} | ${r['balance']:,.2f} |")
        return '\n'.join(lines)

    job = _find_job_by_name(conn, job_name)
    if not job:
        return f"No job found matching **{job_name}**. Try a different name."

    row = conn.execute('''
        SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as total,
               COALESCE(SUM(balance_due),0) as balance
        FROM supplier_invoices WHERE job_id = ? AND is_duplicate = 0
    ''', (job['id'],)).fetchone()

    lines = [f"**Invoice Spend for {job['name']}:**\n"]
    lines.append(f"- **Invoices:** {row['cnt']}")
    lines.append(f"- **Total Invoiced:** ${row['total']:,.2f}")
    lines.append(f"- **Outstanding Balance:** ${row['balance']:,.2f}")
    lines.append(f"\n[View Invoices](/invoices) | [View Reports](/invoices/reports)")
    return '\n'.join(lines)


def handle_invoice_supplier_spend(conn, msg, role, user_id):
    rows = conn.execute('''
        SELECT bc.supplier_name, COUNT(si.id) as cnt,
               COALESCE(SUM(si.total),0) as total,
               COALESCE(SUM(si.balance_due),0) as balance
        FROM supplier_invoices si
        LEFT JOIN billtrust_config bc ON si.supplier_config_id = bc.id
        WHERE si.is_duplicate = 0
        GROUP BY si.supplier_config_id ORDER BY total DESC
    ''').fetchall()
    if not rows:
        return "No supplier invoices found."
    lines = ["**Supplier Spend Breakdown:**\n"]
    lines.append("| Supplier | Invoices | Total | Balance |")
    lines.append("|----------|----------|-------|---------|")
    for r in rows:
        lines.append(f"| {r['supplier_name'] or 'Unknown'} | {r['cnt']} | ${r['total']:,.2f} | ${r['balance']:,.2f} |")
    grand = sum(r['total'] for r in rows)
    lines.append(f"\n**Grand Total:** ${grand:,.2f}")
    lines.append(f"\n[View Reports](/invoices/reports)")
    return '\n'.join(lines)


def handle_invoice_overdue(conn, msg, role, user_id):
    today = datetime.now().strftime('%Y-%m-%d')
    rows = conn.execute('''
        SELECT si.invoice_number, si.due_date, si.total, si.balance_due,
               bc.supplier_name, j.name as job_name
        FROM supplier_invoices si
        LEFT JOIN billtrust_config bc ON si.supplier_config_id = bc.id
        LEFT JOIN jobs j ON si.job_id = j.id
        WHERE si.due_date < ? AND si.due_date != '' AND si.balance_due > 0
              AND si.is_duplicate = 0
        ORDER BY si.due_date ASC LIMIT 20
    ''', (today,)).fetchall()
    if not rows:
        return "No overdue invoices found. All caught up!"
    total_overdue = sum(r['balance_due'] for r in rows)
    lines = [f"**{len(rows)} Overdue Invoice(s)** — Total: ${total_overdue:,.2f}\n"]
    lines.append("| Invoice # | Supplier | Job | Due Date | Balance |")
    lines.append("|-----------|----------|-----|----------|---------|")
    for r in rows:
        lines.append(f"| {r['invoice_number']} | {r['supplier_name'] or '-'} | {r['job_name'] or '-'} | {r['due_date']} | ${r['balance_due']:,.2f} |")
    lines.append(f"\n[View Invoices](/invoices)")
    return '\n'.join(lines)


def handle_invoice_flags(conn, msg, role, user_id):
    rows = conn.execute('''
        SELECT irf.severity, irf.category, irf.invoice_number, irf.message,
               irf.supplier_name, j.name as job_name
        FROM invoice_review_flags irf
        LEFT JOIN jobs j ON irf.job_id = j.id
        WHERE irf.resolved = 0
        ORDER BY CASE irf.severity WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
                 irf.created_at DESC
        LIMIT 15
    ''').fetchall()
    if not rows:
        return "No unresolved invoice flags. Everything looks clean!"
    error_cnt = sum(1 for r in rows if r['severity'] == 'error')
    warn_cnt = sum(1 for r in rows if r['severity'] == 'warning')
    info_cnt = sum(1 for r in rows if r['severity'] == 'info')
    lines = [f"**Unresolved Invoice Flags:** {len(rows)} total"]
    if error_cnt: lines.append(f"- Errors: {error_cnt}")
    if warn_cnt: lines.append(f"- Warnings: {warn_cnt}")
    if info_cnt: lines.append(f"- Info: {info_cnt}")
    lines.append("")
    for r in rows:
        sev = r['severity'].upper()
        lines.append(f"- **[{sev}]** {r['category']}: {r['invoice_number']} — {r['message']}")
    lines.append(f"\n[View All Flags](/invoices/reports)")
    return '\n'.join(lines)


def handle_invoice_compare(conn, msg, role, user_id):
    # Try to extract two job names: "compare X and Y" or "compare X vs Y"
    m = re.search(r'compare\s+(.+?)\s+(?:and|vs\.?|versus|with)\s+(.+?)(?:\?|$|\.)', msg, re.IGNORECASE)
    if not m:
        return "Please specify two jobs to compare, e.g. **compare spend on Quail Creek and Smith Residence**"
    name1, name2 = m.group(1).strip().rstrip('?.,!'), m.group(2).strip().rstrip('?.,!')
    # Strip leading words
    for prefix in ('costs for ', 'spend for ', 'spend on ', 'costs on ', 'invoices for '):
        if name1.lower().startswith(prefix):
            name1 = name1[len(prefix):]
        if name2.lower().startswith(prefix):
            name2 = name2[len(prefix):]

    job1 = _find_job_by_name(conn, name1)
    job2 = _find_job_by_name(conn, name2)
    if not job1:
        return f"Could not find a job matching **{name1}**."
    if not job2:
        return f"Could not find a job matching **{name2}**."

    def get_stats(jid):
        return conn.execute('''
            SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as total,
                   COALESCE(SUM(balance_due),0) as balance
            FROM supplier_invoices WHERE job_id = ? AND is_duplicate = 0
        ''', (jid,)).fetchone()

    s1, s2 = get_stats(job1['id']), get_stats(job2['id'])
    lines = ["**Cost Comparison:**\n"]
    lines.append("| | " + job1['name'] + " | " + job2['name'] + " |")
    lines.append("|---|---|---|")
    lines.append(f"| Invoices | {s1['cnt']} | {s2['cnt']} |")
    lines.append(f"| Total | ${s1['total']:,.2f} | ${s2['total']:,.2f} |")
    lines.append(f"| Balance | ${s1['balance']:,.2f} | ${s2['balance']:,.2f} |")
    diff = s1['total'] - s2['total']
    higher = job1['name'] if diff > 0 else job2['name']
    lines.append(f"\n**{higher}** has ${abs(diff):,.2f} more in total invoices.")
    return '\n'.join(lines)


def handle_material_pricing(conn, msg, role, user_id):
    # Extract product code or search term
    m = re.search(r'(?:price|pricing|cost)\s+(?:for|of|on)\s+(.+?)(?:\?|$|\.)', msg, re.IGNORECASE)
    if not m:
        m = re.search(r'(?:look\s*up|find|check)\s+(?:price|pricing)\s+(?:for|of|on)?\s*(.+?)(?:\?|$|\.)', msg, re.IGNORECASE)
    if not m:
        return "Please specify a product code or item, e.g. **price for L0100** or **price for flex duct**"

    query = m.group(1).strip().rstrip('?.,!')

    # Search in line_items JSON of supplier_invoices
    rows = conn.execute('''
        SELECT si.invoice_number, si.invoice_date, si.line_items,
               bc.supplier_name
        FROM supplier_invoices si
        LEFT JOIN billtrust_config bc ON si.supplier_config_id = bc.id
        WHERE si.line_items LIKE ? AND si.is_duplicate = 0
        ORDER BY si.invoice_date DESC LIMIT 20
    ''', (f'%{query}%',)).fetchall()

    found = []
    for r in rows:
        try:
            items = json.loads(r['line_items']) if r['line_items'] else []
        except Exception:
            continue
        for item in items:
            code = item.get('product_code', '') or ''
            desc = item.get('description', '') or ''
            if query.lower() in code.lower() or query.lower() in desc.lower():
                found.append({
                    'code': code,
                    'desc': desc,
                    'price': item.get('unit_price', 0),
                    'date': r['invoice_date'],
                    'supplier': r['supplier_name'],
                    'invoice': r['invoice_number'],
                })
        if len(found) >= 10:
            break

    if not found:
        return f"No pricing found for **{query}**. Try a product code like **L0100** or a description keyword."

    lines = [f"**Recent Prices for \"{query}\":**\n"]
    lines.append("| Product | Description | Unit Price | Date | Supplier |")
    lines.append("|---------|-------------|-----------|------|----------|")
    for f in found[:10]:
        lines.append(f"| {f['code']} | {f['desc'][:40]} | ${f['price']:,.2f} | {f['date']} | {f['supplier'] or '-'} |")
    lines.append(f"\n*Showing {len(found[:10])} most recent matches.*")
    return '\n'.join(lines)


# ─── Fallback ─────────────────────────────────────────────────────

def get_fallback(role):
    """Role-aware fallback message."""
    lines = ["I'm not sure what you're asking. Here are some things I can help with:\n"]

    lines.append("- **go to [section]** — Navigate anywhere (e.g. \"go to rfis\")")

    if role in ('owner', 'admin', 'project_manager'):
        lines.append("- **how many bids?** / **win rate** / **top GCs**")
        lines.append("- **bids from last month** / **bid [name]**")
        lines.append("- **job status** / **open RFIs** / **pending change orders**")
        lines.append("- **overdue expenses** / **expired licenses**")
        lines.append("- **spend on [job]** / **supplier spend** / **overdue invoices**")
        lines.append("- **invoice flags** / **compare [job1] and [job2]** / **price for [item]**")

    if role == 'owner':
        lines.append("- **profit for [job name]** / **hours for [employee]**")

    lines.append("- **my hours** — your time entries")
    lines.append("- **warranty status** / **open service calls**")
    lines.append("- **search code [query]** / **howto [topic]**")
    lines.append("\nType **help** for a full list of commands.")

    return '\n'.join(lines)


# ─── Handler Map ──────────────────────────────────────────────────

HANDLERS = {
    'navigate': handle_navigate,
    'help': handle_help,
    'expenses_summary': handle_expenses_summary,
    'licenses_status': handle_licenses_status,
    'rfis_status': handle_rfis_status,
    'change_orders_status': handle_change_orders_status,
    'submittals_status': handle_submittals_status,
    'documents_status': handle_documents_status,
    'bid_count': handle_bid_count,
    'bid_value': handle_bid_value,
    'bid_win_rate': handle_bid_win_rate,
    'bid_top_gcs': handle_bid_top_gcs,
    'bid_by_date': handle_bid_by_date,
    'bid_lookup': handle_bid_lookup,
    'bid_list': handle_bid_list,
    'profit': handle_profit,
    'job_status': handle_job_status,
    'warranty': handle_warranty,
    'service_calls': handle_service_calls,
    'my_hours': handle_my_hours,
    'employee_hours': handle_employee_hours,
    'code_search': handle_code_search,
    'howto': handle_howto,
    'contracts_status': handle_contracts_status,
    'workflow_status': handle_workflow_status,
    'invoice_job_spend': handle_invoice_job_spend,
    'invoice_supplier_spend': handle_invoice_supplier_spend,
    'invoice_overdue': handle_invoice_overdue,
    'invoice_flags': handle_invoice_flags,
    'invoice_compare': handle_invoice_compare,
    'material_pricing': handle_material_pricing,
}


# ─── Main Entry Point ────────────────────────────────────────────

def generate_bot_response(conn, message, role='owner', user_id=None):
    """Classify intent, extract entities, run query, return formatted response."""
    intent = classify_intent(message, role)

    if intent and intent in HANDLERS:
        try:
            return HANDLERS[intent](conn, message, role, user_id)
        except Exception:
            return "Sorry, something went wrong processing that query. Please try rephrasing."

    return get_fallback(role)
