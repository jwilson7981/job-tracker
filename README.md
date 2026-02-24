# Construction Management Platform

A full-featured web application for managing construction projects, bids, materials, payroll, warranties, service calls, and more. Built with Flask and SQLite for easy local deployment — no cloud services required.

## Features

- **Dashboard** — Overview of active jobs, recent activity, and key metrics
- **Project Management** — Track jobs with detailed project pages, material history, and status updates
- **Bid Management** — Create and manage multi-family construction bids with automatic labor/cost calculations, partner profit splits, and personnel assignments
- **Materials Tracking** — Log materials per job with Excel import support
- **Accounting** — Job-level financial tracking and overview
- **Payroll & Time Entry** — Employee management with time tracking
- **Warranty Tracking** — Monitor warranty items and expiration dates per job
- **Service Calls** — Create, assign, and track service calls with status workflow
- **Code Books** — Browse and search construction code books (IBC, NEC, IRC, etc.) with section trees and bookmarks
- **How-To Articles** — Internal knowledge base with rich text editing
- **Chatbot** — Context-aware help assistant that can search code books, check warranty status, look up service calls, and find how-to articles
- **Notifications** — Real-time notification system with bell icon, unread badges, and auto-polling
- **User Management** — Role-based access control (Owner, Project Manager, Employee)

## Tech Stack

- **Backend:** Python / Flask
- **Database:** SQLite
- **Frontend:** Vanilla JavaScript, HTML, CSS
- **Dependencies:** `flask`, `openpyxl`, `pdfplumber`

## Quick Start

### Prerequisites

- Python 3.8+

### Install & Run

```bash
# Clone the repo
git clone https://github.com/jwilson7981/job-tracker.git
cd job-tracker

# Install dependencies
pip3 install -r requirements.txt

# Start the server
python3 app.py
```

The app will be available at **http://localhost:5001**.

On macOS, you can also double-click `start.command` to launch — it installs dependencies automatically and opens your browser.

### Default Login

```
Username: admin
Password: admin
```

## Project Structure

```
job-tracker/
├── app.py                  # Flask application (all routes)
├── database.py             # Database schema and initialization
├── tax_rates.py            # Tax rate lookup utilities
├── requirements.txt        # Python dependencies
├── start.command            # macOS quick-start script
├── stop.command             # macOS stop script
├── data/
│   └── jobs.db             # SQLite database (auto-created)
├── static/
│   ├── style.css           # All application styles
│   ├── app.js              # Global JS (notifications, utilities)
│   ├── dashboard.js        # Dashboard module
│   ├── projects.js         # Project detail module
│   ├── bids.js             # Bid calculations and CRUD
│   ├── accounting.js       # Accounting module
│   ├── payroll.js          # Payroll module
│   ├── warranty.js         # Warranty tracking module
│   ├── service_calls.js    # Service calls module
│   ├── codebooks.js        # Code book browser module
│   ├── howtos.js           # How-to articles module
│   ├── chatbot.js          # Chat interface module
│   └── admin.js            # User management module
└── templates/
    ├── base.html           # Base layout template
    ├── sidebar.html        # Navigation sidebar
    ├── login.html          # Login page
    ├── dashboard.html      # Dashboard
    ├── bids/               # Bid list and detail
    ├── projects/           # Project overview and detail
    ├── materials/          # Material tracking
    ├── accounting/         # Financial tracking
    ├── payroll/            # Payroll and time entry
    ├── warranty/           # Warranty management
    ├── service_calls/      # Service call tracking
    ├── codebooks/          # Code book browser
    ├── howtos/             # Knowledge base
    ├── chatbot.html        # Chat interface
    └── admin/              # User management
```

## Bid Calculator

The bid system calculates costs automatically:

- **Duration** = Total Man-Hours / (Crew Size x Hours per Day)
- **Labor Cost** = Total Man-Hours x Hourly Rate
- **Per Diem Total** = Per Diem Rate x Number of Days
- **Subtotal** = Materials + Labor + Management Fee + Per Diem
- **Company Profit** = Subtotal x Profit %
- **Total Bid** = Subtotal + Company Profit

Partner profit splits are calculated from the company profit based on each partner's percentage.

## Network Access

When running on a local network, coworkers can access the app using your machine's IP address on port 5001 (shown at startup). No internet connection required.

## License

Private project.
