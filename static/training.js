/* Training Center JS */

const userRole = document.body.dataset.role || 'employee';
let completedLessons = new Set();
let currentLessonKey = null;

// ─── Training Content Data ────────────────────────────────────

const TRAINING_MODULES = [
    // ══════════════════════════════════════════════════════
    // GETTING STARTED
    // ══════════════════════════════════════════════════════
    {
        id: 'getting-started',
        title: 'Getting Started',
        icon: '&#128640;',
        roles: ['owner','admin','project_manager','warehouse','employee'],
        lessons: [
            {
                key: 'gs-login',
                title: 'Logging In & Your Account',
                summary: 'How to log in, change your password, and understand your role.',
                steps: [
                    'Open your web browser and go to the app URL provided by your administrator (e.g. http://192.168.1.x:5001).',
                    'Enter your <strong>username</strong> and <strong>password</strong> on the login screen. Default credentials are provided by your admin.',
                    'If this is your first login, you may be prompted to <strong>change your password</strong>. Choose a strong password and confirm it.',
                    'Once logged in, you\'ll see the <strong>sidebar navigation</strong> on the left with your name and role displayed at the bottom.',
                    'Your <strong>role</strong> determines which features you can access. The sidebar will only show features available to your role.',
                    'To <strong>log out</strong>, click the "Logout" link at the bottom of the sidebar.'
                ]
            },
            {
                key: 'gs-navigation',
                title: 'Navigating the App',
                summary: 'Understanding the sidebar, groups, and page layout.',
                steps: [
                    'The <strong>sidebar</strong> on the left is your main navigation. It organizes features into collapsible groups.',
                    'Click a <strong>group header</strong> (e.g. "Projects & Scheduling") to expand or collapse that section. Your preference is remembered.',
                    'The <strong>active page</strong> is highlighted in blue in the sidebar so you always know where you are.',
                    'On <strong>mobile devices</strong>, tap the hamburger menu (three lines) in the top-left to open/close the sidebar.',
                    'Most pages follow a consistent layout: <strong>Page Header</strong> (title + action buttons) at top, <strong>Summary Cards</strong> showing key metrics, <strong>Filter Bar</strong> for narrowing results, and a <strong>Data Table</strong> below.',
                    'Look for <strong>action buttons</strong> in the page header (like "+ Add...") and in table rows (Edit, Delete, etc.).'
                ]
            },
            {
                key: 'gs-notifications',
                title: 'Notification Bell',
                summary: 'How the notification system alerts you to important events.',
                steps: [
                    'The <strong>notification bell</strong> &#128276; is in the top-right corner of the sidebar header.',
                    'A <strong>red badge</strong> with a number appears when you have unread notifications.',
                    'Click the bell to open the <strong>notification panel</strong> showing recent alerts.',
                    'Notifications are generated automatically for events like: license expirations, reminder due dates, material requests, and more.',
                    'Click <strong>"Mark all read"</strong> to clear the badge count.',
                    'Click on a notification to <strong>navigate directly</strong> to the related page.'
                ]
            },
            {
                key: 'gs-calculator',
                title: 'Built-in Calculator',
                summary: 'Using the floating calculator widget.',
                steps: [
                    'A <strong>floating calculator</strong> is available on every page, located in the bottom-right corner.',
                    'Click the <strong>calculator header</strong> to expand or collapse it.',
                    'Use it for quick math without leaving the page — supports standard arithmetic operations.',
                    'The calculator <strong>stays visible</strong> as you scroll, so you can reference numbers on the page while calculating.'
                ]
            },
            {
                key: 'gs-team-chat',
                title: 'Team Chat',
                summary: 'Communicating with your team in real-time.',
                steps: [
                    'Click <strong>"Team Chat"</strong> in the sidebar to open the messaging system.',
                    'The left panel shows <strong>Channels</strong> (group conversations) and <strong>Direct Messages</strong> (private 1-on-1).',
                    'Click a channel or DM to open the conversation. Type your message in the input box at the bottom and press Enter or click Send.',
                    'To <strong>create a new channel</strong>, click the "+" icon next to the Channels header. Give it a name and select members.',
                    'To <strong>start a DM</strong>, click the "+" icon next to Direct Messages and select a team member.',
                    'A <strong>badge</strong> on the sidebar shows your total unread message count across all channels and DMs.'
                ]
            },
            {
                key: 'gs-ai-assistant',
                title: 'AI Assistant',
                summary: 'Using the AI chatbot for help and questions.',
                steps: [
                    'Click <strong>"AI Assistant"</strong> in the sidebar to open the AI chatbot.',
                    'Type any question or request in the input box — the AI can help with construction questions, calculations, code lookups, and general assistance.',
                    'Your <strong>chat history</strong> is saved in sessions listed in the left panel. Click "New" to start a fresh conversation.',
                    'The AI has context about HVAC, construction codes, and industry practices to help answer technical questions.',
                    'You can also use the <strong>floating chat widget</strong> in the bottom-right corner for quick questions without leaving your current page.'
                ]
            },
            {
                key: 'gs-reminders',
                title: 'Personal Reminders',
                summary: 'Creating and managing your personal to-do reminders.',
                steps: [
                    'Click <strong>"Reminders"</strong> in the Resources section of the sidebar.',
                    'Click <strong>"+ Add Reminder"</strong> to create a new reminder. Enter a title (required), optional description, and optional due date.',
                    'The <strong>summary cards</strong> at the top show your Active, Due Today, Overdue, and Completed counts.',
                    'Use the <strong>status filter</strong> to switch between All, Active, Completed, and Dismissed reminders.',
                    'Overdue reminders are <strong>highlighted in red</strong> in the table. Due Today items show an orange badge.',
                    'Click the <strong>checkmark button</strong> to mark a reminder as complete. Use Edit to change details or Delete to remove it.',
                    'Reminders due today or tomorrow will trigger a <strong>notification bell alert</strong>. Each user only sees their own reminders.'
                ]
            },
            {
                key: 'gs-feedback',
                title: 'Submitting Feedback',
                summary: 'How to report bugs, request features, and give feedback.',
                steps: [
                    'Click <strong>"Feedback"</strong> in the sidebar to open the feedback system.',
                    'Click <strong>"+ Submit Feedback"</strong> to report a bug, request a feature, suggest an improvement, or ask a question.',
                    'Fill in the <strong>title</strong>, select a <strong>category</strong> (Bug, Feature, Improvement, Question), set the <strong>priority</strong>, and add a description.',
                    'You can <strong>upvote</strong> other people\'s feedback to show support for their ideas.',
                    'Track the <strong>status</strong> of your feedback: New → Under Review → Planned → In Progress → Complete.'
                ]
            }
        ]
    },

    // ══════════════════════════════════════════════════════
    // CUSTOMERS & VENDORS
    // ══════════════════════════════════════════════════════
    {
        id: 'customers-vendors',
        title: 'Customers & Vendors',
        icon: '&#9819;',
        roles: ['owner','admin','project_manager'],
        lessons: [
            {
                key: 'cv-customers',
                title: 'Managing Customers',
                summary: 'Adding, editing, and organizing customer records.',
                steps: [
                    'Navigate to <strong>Customers</strong> in the "Customers & Vendors" sidebar group.',
                    'Click <strong>"+ Add Customer"</strong> to create a new customer record.',
                    'Fill in company details: <strong>Company Name</strong>, Company Type (General Contractor, Owner, Developer, etc.), address, phone, and email.',
                    'Add <strong>contacts</strong> for each customer — these are the individual people you work with (name, title, phone, email).',
                    'Use the <strong>search bar</strong> to quickly find customers by name.',
                    'Click on a customer row to <strong>view/edit</strong> their details. You can update information or add notes at any time.',
                    'Customers can be linked to <strong>Bids</strong> and <strong>Projects</strong> for tracking relationships.'
                ]
            },
            {
                key: 'cv-vendors',
                title: 'Managing Vendors',
                summary: 'Tracking suppliers, subcontractors, and vendor contacts.',
                steps: [
                    'Navigate to <strong>Vendors</strong> in the "Customers & Vendors" sidebar group.',
                    'Click <strong>"+ Add Vendor"</strong> to create a new vendor record.',
                    'Fill in details: <strong>Company Name</strong>, Vendor Type (Supplier, Subcontractor, Equipment Rental, etc.), address, phone, email, and website.',
                    'Add the vendor\'s <strong>account number</strong> if you have one for quick reference on orders.',
                    'Add <strong>contacts</strong> — your sales reps, account managers, or other key people at the vendor.',
                    'Vendors link to <strong>Supplier Quotes</strong> and <strong>Invoices</strong> for cost tracking.',
                    'Use <strong>notes</strong> to record payment terms, delivery preferences, or other important details.'
                ]
            },
            {
                key: 'cv-bids',
                title: 'Bids & Proposals',
                summary: 'Creating bids with the calculator, generating proposal PDFs, and emailing proposals.',
                steps: [
                    'Navigate to <strong>Bids</strong> in the "Customers & Vendors" sidebar group.',
                    'Click <strong>"+ New Bid"</strong> to create a bid. Enter the project name, customer, bid type, and due date.',
                    'The <strong>Bid Calculator</strong> lets you build your bid with line items: systems, equipment, materials, labor, and overhead.',
                    'For each line item, enter description, quantity, unit cost. The calculator computes extended costs and totals.',
                    'Set your <strong>profit mode</strong>: percentage markup or per-system flat amount. Adjust the overall profit margin.',
                    'Add <strong>admin costs</strong>, housing costs, and any other overhead items to get a complete bid total.',
                    'Click <strong>"Generate Proposal"</strong> to create a professional PDF proposal ready to send to the customer.',
                    'Use the <strong>"Email Proposal"</strong> button to send the proposal directly from the app.',
                    'Track bid status through the pipeline: Needs Bid → Bid Submitted → Awarded → In Progress.'
                ]
            },
            {
                key: 'cv-supplier-quotes',
                title: 'Supplier Quotes',
                summary: 'Uploading and comparing supplier pricing for bid takeoffs.',
                steps: [
                    'Navigate to <strong>Supplier Quotes</strong> in the "Customers & Vendors" sidebar group.',
                    'Click <strong>"+ Upload Quote"</strong> to add a supplier quote PDF. Select the vendor and optionally link it to a bid.',
                    'The system helps you <strong>compare pricing</strong> across different suppliers for the same items.',
                    'Note: Some suppliers use <strong>per-C pricing</strong> (per 100 units) or <strong>per-M pricing</strong> (per 1000 units). The unit price on the quote is NOT the per-each price.',
                    'Use the pricing review feature to track and compare costs over time.',
                    'Quotes can be linked to specific bids for reference during takeoffs.'
                ]
            }
        ]
    },

    // ══════════════════════════════════════════════════════
    // PROJECTS & SCHEDULING
    // ══════════════════════════════════════════════════════
    {
        id: 'projects-scheduling',
        title: 'Projects & Scheduling',
        icon: '&#9635;',
        roles: ['owner','admin','project_manager'],
        lessons: [
            {
                key: 'ps-projects',
                title: 'Project Management',
                summary: 'Creating and managing construction projects.',
                steps: [
                    'Navigate to <strong>Projects</strong> in the "Projects & Scheduling" sidebar group.',
                    'Each project represents a <strong>construction job</strong> with its own materials, documents, schedule, and billing.',
                    'Click <strong>"+ New Project"</strong> to create one. Fill in the job name, customer, project manager, and address.',
                    'The project <strong>status/stage</strong> tracks where it is in the pipeline: Needs Bid → Bid Submitted → Awarded → In Progress → Complete.',
                    'Click on a project to open its <strong>detail page</strong> where you can manage all associated items: materials, documents, schedule events, expenses, etc.',
                    'Use the <strong>project dashboard</strong> for a high-level view of budget vs. actuals, material status, and upcoming schedule items.'
                ]
            },
            {
                key: 'ps-schedule',
                title: 'Job Scheduling',
                summary: 'Creating schedule events, managing crews, and tracking progress.',
                steps: [
                    'Navigate to <strong>Schedule</strong> in the "Projects & Scheduling" sidebar group.',
                    'The schedule shows a <strong>calendar/timeline view</strong> of all job events across projects.',
                    'Click <strong>"+ Add Event"</strong> to create a schedule item. Select the job, enter the task name, assign crew members, and set start/end dates.',
                    'Set <strong>estimated hours</strong> and <strong>crew size</strong> to help with resource planning.',
                    'Use the <strong>percent complete</strong> field to track progress on each task (0-100%).',
                    'Events can have <strong>dependencies</strong> — a task that must finish before another can start.',
                    'Schedule plans can be saved as <strong>templates</strong> for reuse on similar projects.',
                    'Filter the schedule view by <strong>job, date range, or crew member</strong> to focus on what matters.'
                ]
            },
            {
                key: 'ps-pipeline',
                title: 'Pipeline / Workflow',
                summary: 'Tracking projects through pipeline stages and managing workflow.',
                steps: [
                    'Navigate to <strong>Pipeline</strong> in the "Projects & Scheduling" sidebar group.',
                    'The pipeline view shows <strong>all projects organized by stage</strong> — a visual workflow of your project lifecycle.',
                    'Each project flows through stages: Bid → Pre-Construction → Contracts → Submittals → Material Ordering → Rough-In → Trim → Startup → Closeout → Complete.',
                    'Click on a <strong>pipeline step</strong> to mark it complete or view its linked module (e.g., the Permits step links to the Permits page).',
                    'Use this view for <strong>weekly team meetings</strong> to review where every project stands.',
                    'The pipeline helps ensure <strong>nothing falls through the cracks</strong> — each step is a checklist item that must be addressed.'
                ]
            },
            {
                key: 'ps-import',
                title: 'Importing Jobs',
                summary: 'Bulk importing job data from spreadsheets.',
                roles: ['owner','admin'],
                steps: [
                    'Navigate to <strong>Import Jobs</strong> in the "Projects & Scheduling" sidebar group (owner/admin only).',
                    'Download the <strong>template spreadsheet</strong> to see the expected format.',
                    'Fill in your job data following the template columns: job name, status, address, customer, etc.',
                    'Upload the completed spreadsheet and <strong>review the preview</strong> before confirming the import.',
                    'The system will create new projects for each row and flag any errors or duplicates.',
                    'This is useful for <strong>initial setup</strong> when migrating from another system or spreadsheets.'
                ]
            }
        ]
    },

    // ══════════════════════════════════════════════════════
    // MATERIALS & INVENTORY
    // ══════════════════════════════════════════════════════
    {
        id: 'materials-inventory',
        title: 'Materials & Inventory',
        icon: '&#128230;',
        roles: ['owner','admin','project_manager','warehouse'],
        lessons: [
            {
                key: 'mi-materials',
                title: 'Materials Tracking',
                summary: 'Managing material line items for each job — ordering, receiving, and invoicing.',
                steps: [
                    'Navigate to <strong>Materials</strong> in the "Materials & Inventory" sidebar group.',
                    'Select a <strong>job</strong> to view its material list. Each job has its own set of material line items.',
                    'Each line item tracks: <strong>Stock/NS</strong>, SKU, Description, Quote Qty, Qty Ordered, Price Per, and Total Net Price.',
                    'The <strong>receiving columns</strong> (up to 15) let you log partial deliveries over time.',
                    'Similarly, <strong>shipped</strong> and <strong>invoiced</strong> columns track those quantities.',
                    'Compare <strong>Quote Qty vs. Ordered vs. Received</strong> to identify shortages or over-orders.',
                    'Use the <strong>Versions</strong> feature to save snapshots of the material list at key milestones.',
                    'Export the material list to <strong>Excel or PDF</strong> using the export buttons in the page header.'
                ]
            },
            {
                key: 'mi-inventory',
                title: 'Inventory Management',
                summary: 'Tracking warehouse stock levels and inventory transactions.',
                steps: [
                    'Navigate to <strong>Inventory</strong> in the "Materials & Inventory" sidebar group.',
                    'This tracks items <strong>in your warehouse</strong> — not job-specific materials, but general stock.',
                    'Click <strong>"+ Add Item"</strong> to add an inventory item: name, SKU, category, unit of measure, and current quantity.',
                    'Log <strong>transactions</strong> when items come in (Purchase, Return) or go out (Usage, Transfer, Adjustment).',
                    'Each transaction records: type, quantity, reference (PO#, job name), and notes.',
                    'The system calculates <strong>current stock levels</strong> based on all transactions.',
                    'Set <strong>reorder points</strong> to be alerted when stock drops below a threshold.'
                ]
            },
            {
                key: 'mi-requests',
                title: 'Material Requests',
                summary: 'Submitting and approving material requests for jobs.',
                steps: [
                    'Navigate to <strong>Material Requests</strong> in the "Materials & Inventory" sidebar group.',
                    'Project managers create requests when materials are needed for a job. Click <strong>"+ New Request"</strong>.',
                    'Select the <strong>job</strong>, add line items with descriptions and quantities, and set the phase/area.',
                    'Mark items as <strong>"Order Needed"</strong> to flag them for the warehouse team.',
                    'Warehouse staff reviews requests and can link them to <strong>existing inventory</strong> or create purchase orders.',
                    'Track request status: Pending → Approved → Ordered → Received.',
                    'This creates a clear <strong>paper trail</strong> for who requested what and when.'
                ]
            },
            {
                key: 'mi-receiving',
                title: 'Receiving Deliveries',
                summary: 'Logging incoming material deliveries and verifying quantities.',
                steps: [
                    'Navigate to <strong>Receiving</strong> in the "Materials & Inventory" sidebar group.',
                    'When a delivery arrives, create a <strong>receiving entry</strong> by selecting the job and logging each item received.',
                    'Compare received quantities against <strong>purchase orders</strong> and packing slips.',
                    'Note any <strong>damages, shortages, or wrong items</strong> in the notes field.',
                    'Receiving entries automatically update the <strong>material tracking columns</strong> on the Materials page.',
                    'Upload <strong>delivery receipt photos</strong> for documentation.'
                ]
            },
            {
                key: 'mi-shipments',
                title: 'Material Shipments',
                summary: 'Tracking outbound shipments of materials to job sites.',
                steps: [
                    'Navigate to <strong>Shipments</strong> in the "Materials & Inventory" sidebar group.',
                    'Create a shipment when sending materials from the warehouse to a <strong>job site</strong>.',
                    'Select the job, add items being shipped with quantities, and assign a <strong>driver/delivery method</strong>.',
                    'Track shipment status: Pending → In Transit → Delivered.',
                    'Job site personnel can <strong>confirm receipt</strong> of the shipment.',
                    'Shipment records update the <strong>shipped columns</strong> on the Materials page.'
                ]
            }
        ]
    },

    // ══════════════════════════════════════════════════════
    // JOB DOCUMENTS
    // ══════════════════════════════════════════════════════
    {
        id: 'job-documents',
        title: 'Job Documents',
        icon: '&#128196;',
        roles: ['owner','admin','project_manager'],
        lessons: [
            {
                key: 'jd-plans',
                title: 'Plans',
                summary: 'Uploading and managing construction plans and drawings.',
                steps: [
                    'Navigate to <strong>Plans</strong> in the "Job Documents" sidebar group.',
                    'Click <strong>"+ Upload Plans"</strong> to upload PDF plan sets for a job.',
                    'Select the <strong>job</strong> and provide a description (e.g., "Mechanical Plans Rev 2").',
                    'Uploaded plans are organized by job and can be <strong>viewed inline</strong> or downloaded.',
                    'The system detects <strong>duplicate uploads</strong> using file hashing to prevent confusion.',
                    'Team members can access plans from the field on any device.'
                ]
            },
            {
                key: 'jd-contracts',
                title: 'Contracts',
                summary: 'Managing contracts and agreements for each job.',
                steps: [
                    'Navigate to <strong>Contracts</strong> in the "Job Documents" sidebar group.',
                    'Click <strong>"+ Add Contract"</strong> to upload a contract PDF for a specific job.',
                    'Track contract details: type (Prime, Subcontract, PO), value, start/end dates, and status.',
                    'Upload the <strong>signed contract PDF</strong> for reference.',
                    'Contract values integrate with <strong>Pay Applications</strong> for billing tracking.',
                    'Keep all contract amendments and change orders linked to the original contract.'
                ]
            },
            {
                key: 'jd-permits',
                title: 'Permits & Inspections',
                summary: 'Tracking building permits and scheduling inspections.',
                steps: [
                    'Navigate to <strong>Permits</strong> in the "Job Documents" sidebar group.',
                    'Click <strong>"+ Add Permit"</strong> to create a permit record. Select the job, permit type (Mechanical, Building, Plumbing, etc.), and enter the permit number.',
                    'Track permit details: issuing authority, application date, approval date, expiration, and fees.',
                    'Add <strong>inspections</strong> under each permit. Click "+ Add Inspection" and select the type (Rough-In, Underground, Final, etc.).',
                    'Schedule inspections with a date and inspector name. Track status: Requested → Scheduled → Passed/Failed.',
                    'Failed inspections can include <strong>notes on corrections needed</strong>.',
                    'The Pipeline view links to permits so you can track this step in the overall workflow.'
                ]
            },
            {
                key: 'jd-rfis',
                title: 'RFIs (Requests for Information)',
                summary: 'Creating and tracking RFIs for job clarifications.',
                steps: [
                    'Navigate to <strong>RFIs</strong> in the "Job Documents" sidebar group.',
                    'Click <strong>"+ New RFI"</strong> to create a Request for Information. Select the job — the RFI number is auto-assigned.',
                    'Fill in: <strong>Subject</strong>, the question/request, addressed to (GC, engineer, architect), and priority.',
                    'RFIs track status: <strong>Open → Responded → Closed</strong>.',
                    'When a response comes in, edit the RFI to add the <strong>response text</strong> and update the status.',
                    'RFIs are numbered sequentially per job (e.g., RFI-001, RFI-002) for organized record keeping.',
                    'Filter RFIs by job, status, or date to quickly find what you need.'
                ]
            },
            {
                key: 'jd-change-orders',
                title: 'Change Orders',
                summary: 'Creating change orders with proposal PDFs and integrating with billing.',
                steps: [
                    'Navigate to <strong>Change Orders</strong> in the "Job Documents" sidebar group.',
                    'Click <strong>"+ New Change Order"</strong> to create one for a specific job.',
                    'Enter the change description, reason, cost breakdown (materials, labor, equipment, overhead, profit).',
                    'Generate a professional <strong>Change Order Proposal PDF</strong> to submit to the GC or owner.',
                    'Track status: <strong>Draft → Submitted → Approved → Rejected</strong>.',
                    'When a change order is <strong>approved</strong>, it automatically adds a line item to the Pay Application Schedule of Values.',
                    'This ensures approved changes are properly billed and tracked.'
                ]
            },
            {
                key: 'jd-submittals',
                title: 'Submittals',
                summary: 'Managing equipment submittals with revision tracking.',
                steps: [
                    'Navigate to <strong>Submittals</strong> in the "Job Documents" sidebar group.',
                    'Click <strong>"+ New Submittal"</strong> to create a submittal for a job.',
                    'Fill in: spec section, description, and upload the <strong>submittal PDF</strong> (cut sheets, shop drawings, etc.).',
                    'Track <strong>revisions</strong> — when a submittal is returned for revision, upload the updated version. The system keeps history.',
                    'Submittal statuses: <strong>Pending → Submitted → Approved → Approved as Noted → Revise & Resubmit → Rejected</strong>.',
                    'Link submittals to the <strong>Submittal File Library</strong> for reuse across jobs.',
                    'The Pipeline view tracks submittal completion as a workflow step.'
                ]
            },
            {
                key: 'jd-documents',
                title: 'Documents & Closeout',
                summary: 'Managing closeout documents and generating transmittals.',
                steps: [
                    'Navigate to <strong>Documents</strong> in the "Job Documents" sidebar group.',
                    'Each job has a <strong>closeout checklist</strong> with default items that can be customized.',
                    'Default closeout items include: O&M Manuals, As-Builts, Warranty Letters, Test & Balance Reports, Lien Waivers, etc.',
                    'Upload <strong>document files</strong> for each checklist item as they\'re completed.',
                    'Mark items as <strong>complete</strong> to track closeout progress.',
                    'Generate a <strong>Transmittal PDF</strong> — a formal cover sheet listing all documents being transmitted to the GC or owner.',
                    'Use this to ensure a clean handoff at project completion.'
                ]
            },
            {
                key: 'jd-payapps',
                title: 'Pay Applications (G702/G703)',
                summary: 'Creating AIA-format pay applications for monthly billing.',
                steps: [
                    'Navigate to <strong>Pay Apps</strong> in the "Job Documents" sidebar group.',
                    'First, set up a <strong>Pay App Contract</strong> for the job: enter the contract value, contractor/owner info, and GC contact details.',
                    'Create the <strong>Schedule of Values (SOV)</strong> — a list of line items that break down the contract value (G703).',
                    'Each billing period, create a new <strong>Pay Application</strong>. Enter the period dates and application number.',
                    'For each SOV line item, enter the <strong>work completed this period</strong> (dollar amount or percentage).',
                    'The system automatically calculates: total completed to date, percentage complete, balance to finish, and retainage.',
                    'Generate the <strong>G702/G703 PDF</strong> — an AIA-formatted pay application ready for the GC.',
                    'Track pay app status: <strong>Draft → Submitted → Approved → Paid</strong>.',
                    'Upload the <strong>signed/notarized copy</strong> when returned for your records.'
                ]
            },
            {
                key: 'jd-lien-waivers',
                title: 'Lien Waivers',
                summary: 'Creating and managing lien waivers for billing.',
                steps: [
                    'Navigate to <strong>Lien Waivers</strong> in the "Job Documents" sidebar group.',
                    'Click <strong>"+ New Lien Waiver"</strong> and select the job.',
                    'Choose the type: <strong>Conditional</strong> (upon receipt of payment) or <strong>Unconditional</strong> (payment already received), and whether it\'s Progress or Final.',
                    'Enter the through date, amount, and any conditions.',
                    'Upload the <strong>signed lien waiver</strong> document.',
                    'Lien waivers are typically required with each pay application and at project closeout.'
                ]
            },
            {
                key: 'jd-photos',
                title: 'Job Photos',
                summary: 'Uploading and organizing job site photos.',
                steps: [
                    'Navigate to <strong>Photos</strong> in the "Job Documents" sidebar group.',
                    'Click <strong>"+ Upload Photos"</strong> to add images. Select the job and optionally add a description/category.',
                    'Photos can be organized by <strong>phase</strong> (rough-in, trim, final) or area.',
                    'Use photos for <strong>documentation</strong>: before/after, progress, issues, inspections.',
                    'Photos are stored per-job and can be accessed by any team member in the field.',
                    'This is valuable for <strong>warranty claims</strong>, disputes, and project records.'
                ]
            }
        ]
    },

    // ══════════════════════════════════════════════════════
    // FINANCE
    // ══════════════════════════════════════════════════════
    {
        id: 'finance',
        title: 'Finance',
        icon: '&#128176;',
        roles: ['owner','admin'],
        lessons: [
            {
                key: 'fi-accounting',
                title: 'Accounting Overview',
                summary: 'Understanding the accounting dashboard and financial tracking.',
                steps: [
                    'Navigate to <strong>Accounting</strong> in the "Finance" sidebar group.',
                    'The accounting page provides a <strong>financial overview</strong> of all projects.',
                    'View <strong>revenue vs. expenses</strong> for each job to track profitability.',
                    'Key metrics include: contract value, billed to date, costs to date, and profit margin.',
                    'Use the <strong>filters</strong> to view financials by date range, project status, or project manager.',
                    'Export reports to <strong>Excel</strong> for further analysis or sharing with your accountant.'
                ]
            },
            {
                key: 'fi-invoices',
                title: 'Invoices & Reports',
                summary: 'Managing supplier invoices and generating financial reports.',
                steps: [
                    'Navigate to <strong>Invoices</strong> in the "Finance" sidebar group.',
                    'This tracks <strong>supplier invoices</strong> (bills you receive from vendors/suppliers).',
                    'Click <strong>"+ Add Invoice"</strong> to log a supplier invoice: vendor, invoice number, date, amount, job, and due date.',
                    'Track invoice status: <strong>Pending → Approved → Paid</strong>.',
                    'The <strong>Reports</strong> page (also in Finance) gives you analytical views: spending by vendor, by job, by time period.',
                    'Flag invoices for review if amounts seem <strong>unusual or need verification</strong>.',
                    'Compare supplier invoices against <strong>quotes and POs</strong> for cost control.'
                ]
            },
            {
                key: 'fi-expenses',
                title: 'Expenses & Recurring Expenses',
                summary: 'Tracking job expenses and company-wide recurring overhead.',
                steps: [
                    'Navigate to <strong>Expenses</strong> in the "Finance" sidebar group.',
                    'Log <strong>job expenses</strong>: select the job, enter category (materials, labor, equipment, subcontractor, other), vendor, amount, and date.',
                    'Track <strong>recurring expenses</strong> — company overhead that repeats monthly: rent, insurance, vehicle payments, subscriptions, etc.',
                    'For recurring expenses, set the <strong>amount, frequency, and due date</strong>. The system sends reminders when payments are due.',
                    'Categorize expenses for clean <strong>reporting and tax preparation</strong>.',
                    'Compare actual expenses against <strong>bid estimates</strong> to track job profitability.'
                ]
            },
            {
                key: 'fi-employees',
                title: 'Employee Management',
                summary: 'Managing employee accounts, roles, and profiles.',
                steps: [
                    'Navigate to <strong>Employees</strong> in the "Finance" sidebar group (owner/admin only).',
                    'View all employees with their <strong>roles, contact info, and status</strong>.',
                    'Each employee has a <strong>profile</strong> with: hourly rate, contact info, emergency contact, and employment details.',
                    'Employee hourly rates are used in <strong>payroll calculations</strong>.',
                    'Active vs. inactive status controls <strong>login access</strong> to the system.'
                ]
            },
            {
                key: 'fi-payroll',
                title: 'Payroll',
                summary: 'Processing payroll based on time entries.',
                steps: [
                    'Navigate to <strong>Payroll</strong> in the "Finance" sidebar group.',
                    'Payroll pulls from <strong>time entries</strong> submitted by employees.',
                    'Select a <strong>pay period</strong> to view all employee hours for that range.',
                    'Review <strong>regular hours, overtime, and total pay</strong> for each employee.',
                    'Hours are calculated based on <strong>time entries</strong> and multiplied by each employee\'s hourly rate.',
                    'Export payroll data to <strong>Excel</strong> for processing through your payroll provider.',
                    'Review individual employee payroll history by clicking on their name.'
                ]
            },
            {
                key: 'fi-teampay',
                title: 'Team Pay',
                summary: 'Managing progress-based pay for project teams.',
                roles: ['owner'],
                steps: [
                    'Navigate to <strong>Team Pay</strong> in the "Finance" sidebar group (owner only).',
                    'Team Pay is for <strong>progress-based compensation</strong> — paying team members based on project completion milestones.',
                    'Create a <strong>pay schedule</strong> for a project: define the total payout and milestones.',
                    'Add <strong>team members</strong> to the schedule with their individual share/percentage.',
                    'Create <strong>pay periods</strong> and enter the progress percentage for each member.',
                    'The system calculates <strong>earned amount</strong> based on progress vs. total share.',
                    'This is separate from hourly payroll — it\'s for incentive or milestone-based pay.'
                ]
            }
        ]
    },

    // ══════════════════════════════════════════════════════
    // TIME ENTRY (Employee/Warehouse)
    // ══════════════════════════════════════════════════════
    {
        id: 'time-entry',
        title: 'Time Entry',
        icon: '&#9200;',
        roles: ['employee','warehouse'],
        lessons: [
            {
                key: 'te-basics',
                title: 'Logging Your Time',
                summary: 'How to submit daily time entries for your work hours.',
                steps: [
                    'Navigate to <strong>Time Entry</strong> in the sidebar.',
                    'Select the <strong>date</strong> for your time entry (defaults to today).',
                    'Select the <strong>job/project</strong> you worked on from the dropdown.',
                    'Enter your <strong>start time</strong> and <strong>end time</strong>, or enter total hours directly.',
                    'Add a brief <strong>description</strong> of the work performed.',
                    'Select the <strong>work type</strong>: Regular, Overtime, Travel, etc.',
                    'Click <strong>Save</strong> to submit your time entry.',
                    'You can add <strong>multiple entries per day</strong> if you worked on different jobs.',
                    'Review your <strong>weekly summary</strong> to ensure all hours are logged before payroll processing.',
                    'Time entries feed directly into <strong>payroll</strong> — accuracy is important!'
                ]
            }
        ]
    },

    // ══════════════════════════════════════════════════════
    // SERVICE & WARRANTY
    // ══════════════════════════════════════════════════════
    {
        id: 'service-warranty',
        title: 'Service & Warranty',
        icon: '&#9745;',
        roles: ['owner','admin','project_manager'],
        lessons: [
            {
                key: 'sw-warranty',
                title: 'Warranty Tracking',
                summary: 'Managing equipment warranties and warranty claims.',
                steps: [
                    'Navigate to <strong>Warranty</strong> in the "Service & Warranty" sidebar group.',
                    'Click <strong>"+ Add Warranty"</strong> to register a warranty for installed equipment.',
                    'Enter: equipment description, manufacturer, model/serial numbers, installation date, warranty start/end dates, and the associated job.',
                    'Track warranty <strong>expiration</strong> — items nearing expiration are highlighted.',
                    'When a warranty issue arises, create a <strong>warranty claim</strong> under the relevant warranty item.',
                    'Claims track: issue description, date reported, status (Open, In Progress, Resolved), and resolution notes.',
                    'Having complete warranty records helps when <strong>equipment fails</strong> — you can quickly verify coverage.'
                ]
            },
            {
                key: 'sw-service-calls',
                title: 'Service Calls',
                summary: 'Logging and tracking service/repair calls.',
                steps: [
                    'Navigate to <strong>Service Calls</strong> in the sidebar (available to all roles).',
                    'Click <strong>"+ New Service Call"</strong> to log an incoming service request.',
                    'Enter: customer/contact info, location, issue description, priority (Low, Medium, High, Emergency), and requested date.',
                    'Assign the service call to a <strong>technician</strong>.',
                    'Track status: <strong>New → Scheduled → In Progress → Completed → Invoiced</strong>.',
                    'Log <strong>work performed</strong>, parts used, and time spent.',
                    'Completed service calls can be linked to <strong>invoices</strong> for billing.',
                    'Check if the issue is covered under <strong>warranty</strong> before billing the customer.'
                ]
            }
        ]
    },
    {
        id: 'service-calls-basic',
        title: 'Service Calls',
        icon: '&#9742;',
        roles: ['employee','warehouse'],
        lessons: [
            {
                key: 'sc-basic',
                title: 'Service Calls',
                summary: 'Viewing and updating assigned service calls.',
                steps: [
                    'Navigate to <strong>Service Calls</strong> in the sidebar.',
                    'View service calls <strong>assigned to you</strong> or all open calls.',
                    'Click on a service call to see the <strong>full details</strong>: customer info, issue description, and location.',
                    'Update the <strong>status</strong> as you work on it: In Progress → Completed.',
                    'Log <strong>work performed</strong> and any parts used.',
                    'Add <strong>notes</strong> about what was done for future reference.',
                    'If additional work is needed, update the notes and leave the status as In Progress.'
                ]
            }
        ]
    },

    // ══════════════════════════════════════════════════════
    // RESOURCES
    // ══════════════════════════════════════════════════════
    {
        id: 'resources',
        title: 'Resources & References',
        icon: '&#128214;',
        roles: ['owner','admin','project_manager','warehouse','employee'],
        lessons: [
            {
                key: 'res-howtos',
                title: 'How To\'s',
                summary: 'Finding and creating how-to articles for common procedures.',
                steps: [
                    'Navigate to <strong>How To\'s</strong> in the "Resources" sidebar group.',
                    'Browse the <strong>article library</strong> — these are step-by-step guides for common procedures.',
                    'Use the <strong>search bar</strong> to find articles by keyword.',
                    'Articles are organized by <strong>category and tags</strong> for easy browsing.',
                    'Owners and PMs can <strong>create new articles</strong> by clicking "+ New Article" — write guides for your team\'s specific processes.',
                    'Articles support formatted text for clear, readable instructions.'
                ]
            },
            {
                key: 'res-codebooks',
                title: 'Code Books',
                summary: 'Looking up mechanical and building codes.',
                steps: [
                    'Navigate to <strong>Code Books</strong> in the "Resources" sidebar group.',
                    'Browse available <strong>code books</strong> — International Mechanical Code, International Building Code, etc.',
                    'Click a book to expand its <strong>chapters and sections</strong>.',
                    'Use the <strong>search</strong> to find specific code requirements by keyword.',
                    'Bookmark frequently referenced sections for <strong>quick access</strong>.',
                    'Code references are useful for <strong>inspections, RFIs, and design questions</strong>.'
                ]
            },
            {
                key: 'res-manuals',
                title: 'Equipment Manuals',
                summary: 'Accessing equipment manuals and technical documents.',
                steps: [
                    'Navigate to <strong>Manuals</strong> in the "Resources" sidebar group.',
                    'The manual library stores <strong>equipment manuals, installation guides, and technical documents</strong>.',
                    'Search by <strong>manufacturer, model, or category</strong> to find the manual you need.',
                    'Upload new manuals by clicking "+ Add Manual" — include the manufacturer, model, and equipment type.',
                    'Manuals are accessible from <strong>any device in the field</strong> — no more searching through paper files.',
                    'Link manuals to specific <strong>equipment/warranty items</strong> for easy reference.'
                ]
            },
            {
                key: 'res-coi',
                title: 'Certificates of Insurance',
                summary: 'Managing COI documents and tracking expiration.',
                roles: ['owner','admin','project_manager'],
                steps: [
                    'Navigate to <strong>COI</strong> in the "Resources" sidebar group.',
                    'Click <strong>"+ Add COI"</strong> to upload a certificate of insurance.',
                    'Track: insurance provider, policy number, coverage types, limits, effective/expiration dates.',
                    'Upload the <strong>COI document</strong> (PDF) for reference.',
                    'The system alerts you when COIs are <strong>nearing expiration</strong> so you can request renewals.',
                    'GCs often require current COIs before you can start work — keep them up to date.'
                ]
            },
            {
                key: 'res-licenses',
                title: 'Licenses',
                summary: 'Tracking business and trade licenses with expiration alerts.',
                roles: ['owner'],
                steps: [
                    'Navigate to <strong>Licenses</strong> in the "Resources" sidebar group (owner only).',
                    'Click <strong>"+ Add License"</strong> to register a license.',
                    'Enter: license type (City, State, Trade, Business, Insurance), name, number, issuing body, holder, and expiration date.',
                    'The system automatically calculates <strong>status based on expiration</strong>: Active, Expiring Soon (within 60 days), or Expired.',
                    'Upload the <strong>license PDF</strong> for reference.',
                    '<strong>Notification alerts</strong> are sent to owners when licenses are within 60 days of expiration.',
                    'Track <strong>renewal costs</strong> and total cost of all license renewals.',
                    'Never miss a renewal — expired licenses can <strong>stop you from working</strong>.'
                ]
            }
        ]
    },

    // ══════════════════════════════════════════════════════
    // DASHBOARD
    // ══════════════════════════════════════════════════════
    {
        id: 'dashboard',
        title: 'Dashboard',
        icon: '&#9632;',
        roles: ['owner','admin'],
        lessons: [
            {
                key: 'dash-overview',
                title: 'Dashboard Overview',
                summary: 'Understanding the main dashboard and KPI metrics.',
                steps: [
                    'The <strong>Dashboard</strong> is your home page (owner/admin only). It provides a high-level summary of everything.',
                    'Key metrics displayed: <strong>active projects count, total contract value, open bids, upcoming schedule items</strong>.',
                    'View <strong>recent activity</strong> across the system — new bids, status changes, completed items.',
                    'Quick links let you jump directly to <strong>items needing attention</strong>.',
                    'The dashboard updates automatically — refresh the page to see the latest data.',
                    'Use this as your <strong>daily starting point</strong> to see what needs attention.'
                ]
            }
        ]
    },

    // ══════════════════════════════════════════════════════
    // ADMINISTRATION
    // ══════════════════════════════════════════════════════
    {
        id: 'admin',
        title: 'Administration',
        icon: '&#9881;',
        roles: ['owner'],
        lessons: [
            {
                key: 'admin-users',
                title: 'User Management',
                summary: 'Creating user accounts, assigning roles, and managing access.',
                steps: [
                    'Navigate to <strong>User Mgmt</strong> at the bottom of the sidebar (owner only).',
                    'Click <strong>"+ Add User"</strong> to create a new account.',
                    'Enter: username, display name, password, email, phone, and hourly rate.',
                    'Assign a <strong>role</strong> that determines their access level:',
                    '<strong>Owner</strong> — Full access to everything, including admin tools, user management, and financials.',
                    '<strong>Admin</strong> — Same as owner except Team Pay and User Management.',
                    '<strong>Project Manager</strong> — Access to projects, documents, scheduling, customers, bids, and service. No financial admin.',
                    '<strong>Warehouse</strong> — Access to materials, inventory, receiving, shipments, and time entry.',
                    '<strong>Employee</strong> — Access to time entry, service calls, and basic resources.',
                    'You can <strong>deactivate</strong> users without deleting them — this prevents login while preserving their history.',
                    'Use <strong>"Force Password Change"</strong> to require a user to set a new password on next login.'
                ]
            },
            {
                key: 'admin-activity',
                title: 'Activity Log',
                summary: 'Monitoring system activity and user actions.',
                steps: [
                    'Navigate to <strong>Activity Log</strong> at the bottom of the sidebar (owner only).',
                    'The activity log shows a <strong>chronological record</strong> of important actions in the system.',
                    'Track: who logged in, what was created/modified/deleted, and when.',
                    'Use <strong>filters</strong> to narrow by user, action type, or date range.',
                    'This is useful for <strong>auditing</strong> — understanding who did what and when.',
                    'The log helps identify <strong>issues or unauthorized changes</strong>.'
                ]
            }
        ]
    }
];

// ─── Initialization ────────────────────────────────────────────

loadTrainingProgress();

async function loadTrainingProgress() {
    try {
        const res = await fetch('/api/training/progress');
        const data = await res.json();
        completedLessons = new Set(data.completed || []);
    } catch (err) {
        console.error('Failed to load training progress:', err);
        completedLessons = new Set();
    }
    renderModules();
}

// ─── Rendering ─────────────────────────────────────────────────

function getVisibleModules() {
    return TRAINING_MODULES.filter(mod =>
        mod.roles.includes(userRole)
    ).map(mod => ({
        ...mod,
        lessons: mod.lessons.filter(l => !l.roles || l.roles.includes(userRole))
    })).filter(mod => mod.lessons.length > 0);
}

function renderModules() {
    const container = document.getElementById('trainingModules');
    const modules = getVisibleModules();
    const searchTerm = (document.getElementById('trainingSearch')?.value || '').toLowerCase();

    if (!modules.length) {
        container.innerHTML = '<p class="text-muted" style="text-align:center;padding:40px;">No training content available for your role.</p>';
        updateOverallProgress(modules);
        return;
    }

    let html = '';
    modules.forEach(mod => {
        let lessons = mod.lessons;
        if (searchTerm) {
            lessons = lessons.filter(l =>
                l.title.toLowerCase().includes(searchTerm) ||
                l.summary.toLowerCase().includes(searchTerm) ||
                l.steps.some(s => s.toLowerCase().includes(searchTerm))
            );
        }
        if (searchTerm && !lessons.length) return;

        const totalLessons = lessons.length;
        const completedCount = lessons.filter(l => completedLessons.has(l.key)).length;
        const pct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
        const isComplete = pct === 100;

        html += `
        <div class="training-module" style="margin-bottom:16px;">
            <div class="training-module-header" onclick="toggleModule(this)" style="
                display:flex;align-items:center;justify-content:space-between;
                padding:16px 20px;background:var(--white);border:1px solid var(--gray-200);
                border-radius:8px;cursor:pointer;transition:all 0.15s;
                ${isComplete ? 'border-left:4px solid #22C55E;' : ''}
            ">
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:22px;">${mod.icon}</span>
                    <div>
                        <div style="font-weight:700;font-size:16px;color:var(--gray-900);">${mod.title}</div>
                        <div style="font-size:13px;color:var(--gray-500);margin-top:2px;">${completedCount} of ${totalLessons} lessons complete</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:80px;height:6px;background:var(--gray-200);border-radius:3px;overflow:hidden;">
                        <div style="height:100%;width:${pct}%;background:${isComplete ? '#22C55E' : '#3B82F6'};border-radius:3px;transition:width 0.3s;"></div>
                    </div>
                    <span style="font-size:13px;font-weight:600;color:${isComplete ? '#22C55E' : 'var(--gray-500)'};">${pct}%</span>
                    <span class="training-chevron" style="font-size:12px;transition:transform 0.2s;color:var(--gray-400);">&#9660;</span>
                </div>
            </div>
            <div class="training-module-body" style="display:none;border:1px solid var(--gray-200);border-top:none;border-radius:0 0 8px 8px;background:var(--white);">
                ${lessons.map(l => {
                    const done = completedLessons.has(l.key);
                    return `
                    <div class="training-lesson" style="
                        display:flex;align-items:center;justify-content:space-between;
                        padding:14px 20px;border-bottom:1px solid var(--gray-100);
                        cursor:pointer;transition:background 0.1s;
                        ${done ? 'opacity:0.7;' : ''}
                    " onclick="openLesson('${l.key}')"
                       onmouseenter="this.style.background='var(--gray-50)'"
                       onmouseleave="this.style.background='transparent'">
                        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
                            <span style="font-size:18px;flex-shrink:0;">${done ? '&#9989;' : '&#9898;'}</span>
                            <div style="min-width:0;">
                                <div style="font-weight:600;font-size:14px;color:var(--gray-800);${done ? 'text-decoration:line-through;' : ''}">${escapeHtml(l.title)}</div>
                                <div style="font-size:13px;color:var(--gray-500);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(l.summary)}</div>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:12px;">
                            <span style="font-size:12px;color:var(--gray-400);">${l.steps.length} steps</span>
                            <span style="color:var(--gray-300);">&#10145;</span>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    });

    if (!html) {
        container.innerHTML = '<p class="text-muted" style="text-align:center;padding:40px;">No training topics match your search.</p>';
    } else {
        container.innerHTML = html;
    }

    updateOverallProgress(modules);
}

function toggleModule(header) {
    const body = header.nextElementSibling;
    const chevron = header.querySelector('.training-chevron');
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    if (!isOpen) {
        header.style.borderRadius = '8px 8px 0 0';
    } else {
        header.style.borderRadius = '8px';
    }
}

function updateOverallProgress(modules) {
    let totalLessons = 0;
    let totalCompleted = 0;
    (modules || getVisibleModules()).forEach(mod => {
        mod.lessons.forEach(l => {
            if (!l.roles || l.roles.includes(userRole)) {
                totalLessons++;
                if (completedLessons.has(l.key)) totalCompleted++;
            }
        });
    });
    const pct = totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0;
    document.getElementById('progressBar').style.width = pct + '%';
    document.getElementById('progressPercent').textContent = pct + '%';
    document.getElementById('overallProgress').textContent = totalCompleted + ' / ' + totalLessons + ' lessons';
}

// ─── Lesson Modal ──────────────────────────────────────────────

function openLesson(key) {
    let lesson = null;
    for (const mod of TRAINING_MODULES) {
        lesson = mod.lessons.find(l => l.key === key);
        if (lesson) break;
    }
    if (!lesson) return;

    currentLessonKey = key;
    document.getElementById('lessonTitle').textContent = lesson.title;

    const done = completedLessons.has(key);
    const btn = document.getElementById('lessonCompleteBtn');
    btn.textContent = done ? 'Completed' : 'Mark as Complete';
    btn.disabled = done;
    btn.className = done ? 'btn btn-secondary' : 'btn btn-primary';

    let bodyHtml = `<p style="color:var(--gray-600);margin-bottom:20px;">${escapeHtml(lesson.summary)}</p>`;
    bodyHtml += '<div style="counter-reset:step;">';
    lesson.steps.forEach((step, i) => {
        bodyHtml += `
        <div style="display:flex;gap:12px;margin-bottom:16px;align-items:flex-start;">
            <div style="
                flex-shrink:0;width:28px;height:28px;border-radius:50%;
                background:var(--blue-primary);color:white;display:flex;
                align-items:center;justify-content:center;font-size:13px;font-weight:700;
                margin-top:1px;
            ">${i + 1}</div>
            <div style="font-size:14px;line-height:1.7;color:var(--gray-700);padding-top:3px;">${step}</div>
        </div>`;
    });
    bodyHtml += '</div>';

    document.getElementById('lessonBody').innerHTML = bodyHtml;
    document.getElementById('lessonModal').style.display = 'flex';
}

async function markCurrentLesson() {
    if (!currentLessonKey || completedLessons.has(currentLessonKey)) return;

    try {
        const res = await fetch('/api/training/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lesson_key: currentLessonKey })
        });
        if (!res.ok) {
            alert('Failed to save progress.');
            return;
        }
    } catch (err) {
        alert('Failed to save progress.');
        console.error(err);
        return;
    }

    completedLessons.add(currentLessonKey);
    const btn = document.getElementById('lessonCompleteBtn');
    btn.textContent = 'Completed';
    btn.disabled = true;
    btn.className = 'btn btn-secondary';
    renderModules();
}

async function resetProgress() {
    if (!confirm('Reset all your training progress? This cannot be undone.')) return;

    try {
        const res = await fetch('/api/training/progress', { method: 'DELETE' });
        if (!res.ok) {
            alert('Failed to reset progress.');
            return;
        }
    } catch (err) {
        alert('Failed to reset progress.');
        console.error(err);
        return;
    }

    completedLessons.clear();
    renderModules();
}

// ─── Filter ────────────────────────────────────────────────────

function filterTraining() {
    renderModules();
}

// ─── Utility ───────────────────────────────────────────────────

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
