VOBISS ERP SYSTEM README
=========================

Document purpose
----------------
This document explains the VOBISS ERP system, its modules, users, architecture,
workflows, routes, data movement, setup, security model, and operational rules.
It is written as a plain-text reference for developers, administrators, support
staff, managers, and end users.

SYSTEM NAME
-----------
VOBISS ERP / Vobiss Inventory Hub

VOBISS is a full-stack enterprise operations platform. It combines inventory,
procurement requests, cash advances, transport, service requests, project work,
customer support, network assets, field work, human resources, performance
management, reporting, chat, notifications, PTEL operations, and administrative
controls in one workspace.

The system is role-aware. A user does not automatically see every module. The
sidebar and route protection determine access from the user's system role, unit,
position, permissions, and customer/staff account type.


1. HIGH-LEVEL SYSTEM PURPOSE
----------------------------
VOBISS supports the following operational cycle:

1. Staff create a request, ticket, field activity, project task, or HR action.
2. The request is routed to the correct unit, supervisor, manager, approver, or
   executive.
3. Responsible users review, approve, reject, assign, escalate, or complete it.
4. Finance, Procurement, Operations, or another execution team performs the
   approved action.
5. The system stores the record, status history, approvals, attachments, and
   audit activity.
6. Notifications, chat messages, dashboard counts, and Vobi summaries keep users
   aware of outstanding work.
7. Reports and dashboards expose current operational performance.


2. USER TYPES AND ACCESS
------------------------
STAFF USERS
- Normal users see their workspace, personal records, unit functions, requests,
  tickets, HR self-service, performance pages, and profile.
- Unit access is normally based on unit, position, or assigned role.

ADMINISTRATOR
- Manages users and operational configuration within the administrator scope.
- Can access broad operational modules, reports, audit information, and settings.

SUPERADMINISTRATOR
- Has the broadest system access.
- Can manage users, roles, configuration, realms, workflows, audit data, and
  protected administrative tools.

DIRECTOR / CTO / EXECUTIVE
- Sees global dashboards, cross-unit service requests, executive escalations,
  reports, approvals, field maps, and global ticket views.

FINANCE USER
- Handles cash requests, finance approval queues, cash release, vehicle cash,
  fuel cash, receipts, and finance reports.

PROCUREMENT / STOCK USER
- Manages inventory, material requests, approved stock issues, returns, low stock,
  item history, inventory reports, and related approvals.

PROJECT / DESIGN / SALES / TX / IP / NOC USERS
- See service-request and ticket queues relevant to their unit.
- Unit managers and supervisors receive additional review and escalation access.

CX / CUSTOMER SUPPORT USER
- Manages customers, projects, sites, staff tickets, assignments, searches,
  tags, ticket history, and escalation.

HR USER
- Manages employees, attendance, leave, payroll, advances, documents, forms,
  reports, analytics, and payroll audit.

CUSTOMER PORTAL USER
- Uses a separate customer experience to view sites, create tickets, track ticket
  status, and manage their profile.

PTEL USERS
- PTEL is a company-scoped operating area with separate role names and access
  rules from the main C&W workspace.
- PTEL Sales is currently available at /ptel/sales/dashboard.
- PTEL HR, Finance, Transport, Inventory, Assets, and Audit Logs routes exist as
  protected rollout placeholders until their dedicated experiences are built.

ACCESS MODE
- Some administrator-capable users can switch between Work and System access
  modes from the sidebar.
- A role can be present in role, main_role, roles, unit, units, department, or
  position fields. Backend permission helpers normalize these values.


3. VOBISS WORKSPACE
-------------------
The Vobiss Workspace is the common starting area for signed-in staff.

MAIN WORKSPACE PAGES
- My Workspace: /workspace
- Vobiss Workspace / Chat: /chat
- My Activity: /my-activity
- My Shared Links: /my-shared-links
- Profile and Security: /profile
- System Guide: /system-guide
- Archive: /archive
- My Assessment: /my-assessment

MY WORKSPACE FUNCTION
- Shows work assigned to the current user.
- Shows pending actions, attention counts, recent activity, notifications, and
  relevant operational records.
- Gives the user a personal launch point into requests, tickets, approvals,
  projects, chat, and reports.

CHAT FUNCTION
- Provides company channels, unit communication, direct messages, and record
  threads.
- Record threads may be attached to tickets, material requests, cash requests,
  item returns, and service requests.
- Supports messages, mentions, reactions, attachments, voice notes, pins,
  bookmarks, forwarding, unread counts, context panels, and system messages.
- Chat attachments support images, video, audio, PDF, office documents, text
  files, and common HEIC/HEIF phone photos up to 200 MB per file.
- System messages can be generated when records are created, approved, rejected,
  escalated, completed, or changed.

FILE STORAGE / ARCHIVE
- File Storage is available at /archive for organizing files in folders.
- Users can upload individual files or an entire folder from the browser.
- File Storage accepts general file types up to 2 GB per file, including
  documents, images, video, audio, compressed archives, and map files.
- Supported media previews include images, PDF, video, and audio. Other files
  remain available for download according to access permissions.
- Files can be searched, renamed, moved, deleted, downloaded, previewed, and
  shared through the existing archive access controls.


4. DASHBOARDS
-------------
The application contains several dashboards. The dashboard shown depends on the
user's role and unit.

- Inventory Dashboard: /dashboard
  Shows stock quantities, categories, issued items, low stock, requests, and
  recent inventory activity.

- CTO / Directors Dashboard: /director/dashboard
  Shows cross-system operational information including stock, requests, cash,
  approvals, activity, low stock, and executive attention items.

- Global Search: /director/search
  Provides executive/system-wide searching across supported records.

- Finance Dashboard: /finance/dashboard
  Shows finance workflow status, cash activity, fuel requests, vehicle cash, and
  finance approvals.

- Transport Supervisor Dashboard: /transport-supervisor-dashboard
  Shows transport totals, pending requests, approval status, and transport queue.

- CX Dashboard: /staff/cx/dashboard
  Shows projects, tickets, active work, urgent work, completed work, assignments,
  and support team activity.

- NOC Dashboard: /staff/noc/dashboard
  Shows the NOC ticket queue and unit attention.

- IP Dashboard: /staff/ip/dashboard
  Shows the IP ticket queue and unit attention.

- TX Dashboard: /staff/field/dashboard
  Shows the TX ticket queue and field engineering work.

- Field Operations Dashboard: /field/dashboard
  Shows field activities, statuses, team members, recent work, and personal work.

- IP Unit Dashboard: /ip-unit/dashboard
  Shows active circuits, pending circuit requests, circuits added, available IDs,
  and recent IP activities.

- HR Dashboard: /hr/dashboard
  Shows employees, leave, payroll, attendance, department headcount, employment
  type, pending HR approvals, and payroll state.

- Performance Dashboard: /performance-reports/dashboard
  Shows personal performance reports, scores, attendance, recent submissions, and
  reviewer queues.

- Customer Portal Dashboard: /customer/dashboard
  Shows customer sites, ticket totals, ticket statuses, recent tickets, and
  support actions.

- PTEL Sales Dashboard: /ptel/sales/dashboard
  Provides the current PTEL Sales workspace for PTEL sales, executive, and CX
  manager users.


5. INVENTORY AND MATERIAL REQUESTS
----------------------------------
INVENTORY PAGES
- Items: /inventory
- Categories: /categories
- Low Stock Alerts: /low-stock
- Request History / Items Out: /items-out
- Approved Forms / Issue Item: /approved-forms
- Inventory Report: /reports

MATERIAL REQUEST PAGES
- Material Requests: /request-forms
- Request Details: /request-forms/:id
- Item Returns: /item-returns
- Return Details: /item-returns/:id

MATERIAL REQUEST FLOW
1. A staff user opens Material Requests.
2. The user selects items, quantities, purpose, project/work context, and any
   required attachments or references.
3. The request is saved or submitted.
4. The configured material approver or supervisor receives the request.
5. The approver approves or rejects the request.
6. An approved request moves to Procurement/Stock execution.
7. The issuer releases stock and records the issue transaction.
8. The requester can view the final state in history.
9. Items can later be returned through the Item Returns workflow.

INVENTORY CONTROLS
- Item quantity and low-stock thresholds are tracked.
- Low stock counts appear in the sidebar and dashboards.
- Issue history records who received stock, what was issued, quantity, and time.
- Inventory and approval actions are auditable.


6. APPROVALS
------------
APPROVAL PAGES
- Material Approvals: /material-approvals
- Cash Approvals: /cash-approvals
- Transport Approvals: /transport-approvals
- Rental Approvals: /transport/rental-approvals
- Fuel Approvals: /transport/fuel-approvals
- Finance Approvals: /finance-approvals
- Approval History: /finance/approval-history
- Legacy approval redirect: /pending-approvals

APPROVAL RULES
- The backend is the authority for approval permissions.
- Approvers can be assigned through realm/configuration settings.
- Directors and protected administrators may bypass selected approval restrictions.
- Approval counts are loaded into the sidebar and refreshed periodically.
- Approvals can generate notifications, realtime events, chat system messages,
  audit entries, and downstream workflow changes.


7. FINANCE AND CASH ADVANCES
----------------------------
PAGES
- Request Cash Advance: /cash-request
- Finance Approvals: /finance-approvals
- Finance Dashboard: /finance/dashboard
- Cash Details: /cash-details/:id
- Vehicle Cash Issuance: /transport/finance-queue
- Fuel Cash and Receipts: /finance/fuel-requests
- Fuel Request Details: /finance/fuel-requests/:id
- Cash Report: /staff/reports/cash
- Approval History: /finance/approval-history

CASH ADVANCE FLOW
1. Staff submit a cash advance request.
2. The system records the requester, amount, purpose, project/context, and status.
3. The request is routed through supervisor, director, or finance approval as
   required by workflow and user authority.
4. Finance reviews and releases the approved funds.
5. The recipient can mark cash as received where supported.
6. The record remains available for details, history, reports, and audit.

FINANCE ALSO HANDLES
- Vehicle cash issuance.
- Fuel cash and receipt processing.
- Finance approval queues.
- Cash status and approval history.


8. TRANSPORT
------------
PAGES
- Transport Requests: /transport-request
- Transport Supervisor Dashboard: /transport-supervisor-dashboard
- Transport Approvals: /transport-approvals
- Transport Request Details: /transport-requests/:id
- Vehicle Request Form: /transport/vehicle-request/:transportRequestId
- Vehicle Rental Requests: /transport/rental-vehicle-requests
- New Rental Vehicle Request: /transport/new-rental-vehicle-request
- Rental Request Details: /transport/vehicle-rental-requests/:id
- Rental Approvals: /transport/rental-approvals
- Vehicle Finance Queue: /transport/finance-queue
- Fuel Requests: /transport/fuel-requests
- New Fuel Request: /transport/fuel-requests/new
- Fuel Request Details: /transport/fuel-requests/:id
- Fuel Approvals: /transport/fuel-approvals

TRANSPORT FLOW
1. Any eligible staff member creates a transport request.
2. A transport supervisor reviews the request.
3. The request is approved or rejected.
4. An approved request can lead to a vehicle request, rental request, or fuel
   request depending on the operational need.
5. Vehicle rental requests may require selected approvers.
6. Finance processes vehicle or fuel cash when required.
7. Completed records remain available for details, reports, and audit.

LEGACY COMPATIBILITY
- /transport/vehicle-rental-requests redirects to the current rental request list
  in the frontend while older backend references may still exist.


9. ASSETS MANAGER
-----------------
PAGES
- All Assets: /assets
- Add New Asset: /assets/new
- Asset Details: /assets/:id
- Categories: /assets/categories
- Locations: /assets/locations
- Assignments: /assets/assignments
- New Assignment: /assets/assignments/new
- Assignment Details: /assets/assignments/:id
- Maintenance: /assets/maintenance
- New Maintenance: /assets/maintenance/new
- Maintenance Details: /assets/maintenance/:id
- Vendors: /assets/vendors
- New Vendor: /assets/vendors/new
- Vendor Details: /assets/vendors/:id
- Asset Reports: /assets/reports

ASSET LIFECYCLE
1. Create an asset with identification and ownership information.
2. Classify it into a category and location.
3. Register or select a vendor where applicable.
4. Assign it to a person, team, or operational location.
5. Record maintenance and maintenance history.
6. Review asset details and export reports.


10. SERVICE REQUESTS, PRODUCTION, AND PROJECT UNITS
---------------------------------------------------
SERVICE REQUEST ROUTES
- Design Unit: /project-request/design
- Sales Unit: /project-request/sales
- Project Unit: /project-request/project
- TX / Transmission: /project-request/ts
- IP Unit: /project-request/ip
- NOC Unit: /project-request/noc
- Unit configuration: /project-request/admin/units
- Service Request Report: /staff/reports/service-requests

PROJECT UNIT ROUTES
- Project Unit Dashboard: /project-request/project
- Service Requests: /project-request/project
- WIP: /project-unit/wip
- Sign-Off Forms: /project-unit/signoff
- Sign-Off Form Details: /project-unit/signoff/:id

PRODUCTION AREAS
- Production Hub
- Project Unit Hub
- Production Details
- Design Unit
- Sales Unit

SERVICE REQUEST FLOW
1. Project Unit or an authorized unit creates a service request.
2. The request is assigned to the relevant unit such as Design, Sales, TX, IP,
   or NOC.
3. The receiving unit reviews the request and updates progress.
4. Unit managers/supervisors review or approve work where required.
5. Work progresses through WIP and operational status stages.
6. Supporting records, comments, references, and attachments can be linked.
7. Completion is recorded through a sign-off form when required.
8. Reports show request volumes, statuses, ownership, and performance.

SUPPORTED UNIT LABELS
- Design Unit
- Sales Unit
- Project Unit
- TX / Transmission
- IP
- NOC


11. NETWORK ASSETS
------------------
The Network Assets area manages physical and logical network infrastructure.

PAGES
- Network Assets Dashboard: /network-assets
- PoP Register: /network-assets/pops
- Equipment Inventory: /network-assets/equipment
- Passive Infrastructure: /network-assets/passive
- ECG Metro: /network-assets/metro
- NEDCO Metro: /network-assets/nedcoMetro
- Master Backhaul: /network-assets/backhaul
- NEDCO Backhaul: /network-assets/nedcoBackhaul
- Backhaul Accessories: /network-assets/backhaulAccessories
- Metro Accessories: /network-assets/metroAccessories
- Poles Register: /network-assets/poles
- Equipment Catalogue: /network-assets/catalogue
- Reports and Exports: /network-assets/reports

The module is mounted as a protected nested route under /network-assets/*.


12. CX AND SUPPORT TICKETING
----------------------------
CX PAGES
- CX Dashboard: /staff/cx/dashboard
- Projects: /staff/cx/projects
- Sites: /staff/cx/sites
- Clients: /staff/cx/clients
- Client Details: /staff/cx/clients/:id
- Master Ticket Queue: /staff/cx/tickets
- Ticket Details: /staff/cx/tickets/:id
- Create Staff Ticket: /staff/cx/create-ticket
- Ticket Escalation: /staff/cx/escalate
- Ticket Escalation Details: /staff/cx/escalate/:ticketId
- Assign Support: /staff/cx/assign
- User Work History: /staff/cx/user-work-history
- Ticket Search: /staff/cx/ticket-search
- Ticket Tags: /staff/cx/tags

TICKET FLOW
1. A customer or staff user creates a ticket.
2. The ticket receives an identifier, title, description, source, priority, and
   status.
3. The ticket enters the appropriate support queue.
4. NOC, IP, TX, CX, or another support unit reviews and assigns the ticket.
5. The assigned user investigates, adds replies/notes, and updates status.
6. Unresolved work can be escalated to NOC Manager, Relationship Officer, or
   Director/CTO according to escalation rules.
7. The ticket is resolved or closed after work is complete.
8. Customers see only their own permitted tickets in the customer portal.

TICKET STATUSES
- NEW
- OPEN
- IN_PROGRESS
- ON_HOLD
- RESOLVED
- CLOSED

SUPPORT QUEUES
- Master CX Ticket Queue: /staff/cx/tickets
- NOC Ticket Queue: /staff/noc/tickets
- IP Ticket Queue: /staff/ip/tickets
- TX Ticket Queue: /staff/field/tickets
- R.O Ticket Queue: /staff/ro/escalations
- NOC Manager Escalations: /staff/noc-manager/escalations
- Executive Escalations: /staff/director/escalations


13. NOC TICKETING
-----------------
PAGES
- NOC Dashboard: /staff/noc/dashboard
- NOC Ticket Queue: /staff/noc/tickets
- NOC Ticket Details: /staff/noc/tickets/:id
- Incident Notes: /noc/incident-notes
- Incident Note Details: /noc/incident-notes/:id
- Shift Schedule: /noc/shift-schedule
- NOC Manager Escalations: /staff/noc-manager/escalations
- NOC Manager Ticket Details: /staff/noc-manager/tickets/:id

NOC is a common first operational point for new technical support tickets.
NOC staff can review queues, add incident notes, manage shift information, and
escalate unresolved work.


14. IP TICKETING AND IP UNIT CIRCUITS
-------------------------------------
IP TICKETING PAGES
- IP Dashboard: /staff/ip/dashboard
- IP Ticket Queue: /staff/ip/tickets
- IP Ticket Details: /staff/ip/tickets/:id
- IP Escalation: /staff/cx/escalate

IP UNIT CIRCUIT PAGES
- IP Unit Dashboard: /ip-unit/dashboard
- Circuit Inventory: /ip-unit/circuits
- Add Circuit: /ip-unit/circuits/new
- Circuit Profile: /ip-unit/circuits/:id
- Circuit Requests: /ip-unit/requests
- Circuit Request Details: /ip-unit/requests/:id
- IP Unit Reports: /ip-unit/reports

The IP Ticketing module handles support tickets. The separate IP Unit module is
the source of truth for circuits, circuit IDs, circuit requests, and circuit
inventory.


15. TX TICKETING AND FIELD ENGINEERING
--------------------------------------
TX TICKETING PAGES
- TX Dashboard: /staff/field/dashboard
- TX Ticket Queue: /staff/field/tickets
- TX Ticket Details: /staff/field/tickets/:id
- TX Escalation: /staff/cx/escalate

FIELD ENGINEERING WORK PAGES
- Field Work: /staff/field/field-work
- Field Work Details: /staff/field/field-work/:id
- My Field Work: /staff/field/my-field-work

TX handles transmission and technical field ticket work. Field Work provides a
separate work assignment and completion workflow.

FIELD WORK API
- Field work is mounted at /api/field-work.
- Supervisors create and view team assignments; engineers can view work assigned
  to them through /staff/field/my-field-work.
- Non-privileged users see only assignments linked to them, while field
  supervisors, NOC confirmers, and authorized administrators can view the broader
  field-work queue.


16. FIELD ACTIVITIES
--------------------
PAGES
- Field Dashboard: /field/dashboard
- Map View: /field/map
- All Activities: /field/activities
- Add Activity: /field/add

FIELD ACTIVITY FLOW
1. A field user or authorized supervisor creates an activity.
2. The activity records project, town/site, engineer, location, and status.
3. Status normally moves through Pending, Ongoing, and Completed.
4. Supervisors can review team work and directors can view mapped activity.
5. Recent work and activity counts are shown on the dashboard.


17. RELATIONSHIP OFFICER AND EXECUTIVE ESCALATION
------------------------------------------------
RELATIONSHIP OFFICER
- R.O Ticket Queue: /staff/ro/escalations
- R.O Ticket Details: /staff/ro/tickets/:id
- Create Ticket: /staff/cx/create-ticket

DIRECTORS / CTO
- CTO / Directors Dashboard: /director/dashboard
- Global Search: /director/search
- Executive Escalations: /staff/director/escalations
- Executive Ticket Details: /staff/director/tickets/:id
- All Tickets: /staff/cx/tickets
- Search for Tickets: /staff/cx/ticket-search
- User Work History: /staff/cx/user-work-history
- Field Engineer Map: /field/map

ESCALATION PRINCIPLE
A ticket can move upward when the current unit cannot resolve it, when the SLA
threshold is reached, or when management attention is required. Escalation stage
and assignee determine which attention counter appears in the sidebar.


18. HUMAN RESOURCES
-------------------
HR PAGES
- HR Dashboard: /hr/dashboard
- Employees: /hr/employees
- Employee Profile: /hr/employees/:id
- Leave Management: /hr/leave
- Payroll: /hr/payroll
- Salary Advances: /hr/payroll/advances
- Payroll History: /hr/payroll-history
- Payroll Audit: /hr/payroll/audit
- Attendance: /hr/attendance
- HR Analytics: /hr/analytics
- HR Reports: /hr/reports
- HR Documents: /hr/documents
- Form Requests: /hr/forms

MY HR PAGES
- My Attendance: /hr-self/attendance
- My Payslips: /hr-self/payslips
- Leave Request: /hr-self/leave
- My Forms: /hr-self/forms
- Legacy Payslips: /employee/payslips

HR WORKFLOWS
- HR maintains employee records and profiles.
- Employees record or review attendance.
- Staff submit leave requests; HR reviews and approves them.
- HR generates payroll, reviews payroll state, approves it, and marks it Paid.
- Salary advances are tracked separately.
- Documents and form requests are stored for HR processing.
- Payroll audit provides controlled review of payroll actions.
- Employees use My HR for self-service without receiving full HR management
  permissions.


19. PERFORMANCE AND REPORTING
-----------------------------
PERFORMANCE PAGES
- My Performance Dashboard: /performance-reports/dashboard
- My Reports: /performance-reports/my-reports
- Report Details: /performance-reports/report/:id
- Team Reports: /performance-reports/team
- Unit Reviews: /performance-reports/unit-reviews
- Review Queue: /performance-reports/queue
- Executive Review: /performance-reports/executive
- HR Access: /performance-reports/hr
- Assessment Periods: /performance-reports/periods
- Performance Analytics: /performance-reports/analytics
- Staff Assessment: /staff-assessment/:userId
- My Assessment: /my-assessment

REPORT SYSTEM PAGES
- Reports Home: /staff/reports
- Ticket Report: /staff/reports/tickets
- Cash Report: /staff/reports/cash
- Service Request Report: /staff/reports/service-requests
- Inventory Report: /reports
- Asset Reports: /assets/reports
- IP Unit Reports: /ip-unit/reports
- Network Asset Reports: /network-assets/reports
- HR Reports: /hr/reports

PERFORMANCE FLOW
1. An employee creates or submits a performance report.
2. The report can be returned for revision or remain in draft.
3. A supervisor or manager reviews the report.
4. Executive or HR reviewers receive the appropriate queue.
5. Finalized reports contribute to score and performance analytics.
6. Assessment periods define the reporting cycle.


20. CUSTOMER PORTAL
-------------------
The customer portal is a separate authenticated experience. Customer sessions use
a customer token and customer-specific pages.

PAGES
- Customer Login: /customer/login
- Customer Dashboard: /customer/dashboard
- My Sites: /customer/sites
- My Tickets: /customer/tickets
- Ticket Details: /customer/tickets/:id
- Create Ticket: /customer/create-ticket
- Profile and Settings: /customer/profile

CUSTOMER FLOW
1. Customer signs in through Customer Login.
2. Customer views organization/profile and assigned sites.
3. Customer creates a support ticket, optionally linked to a site.
4. CX/NOC/IP/TX staff process the ticket internally.
5. Customer follows ticket status and replies from the portal.
6. Customer can update profile settings and log out.

Customer access is isolated from internal staff access. A customer should not use
staff dashboard routes or staff tokens.

PTEL ROUTES
- PTEL Sales Dashboard: /ptel/sales/dashboard
- PTEL HR placeholder: /ptel/hr
- PTEL Finance placeholder: /ptel/finance
- PTEL Transport placeholder: /ptel/transport
- PTEL Inventory placeholder: /ptel/inventory
- PTEL Assets placeholder: /ptel/assets
- PTEL Audit Logs placeholder: /ptel/audit-logs

PTEL access is protected by dedicated roles including ptel_sales,
ptel_cx_manager, ptel_finance, ptel_hr_admin, ptel_data,
ptel_service_delivery, and ptel_executive. A placeholder route indicates the
protected entry point exists; it does not mean that the module is fully built.


21. SYSTEM ADMINISTRATION
-------------------------
PAGES
- User Management: /users
- Roles and Permissions: /users
- Manage Clients: /admin/clients
- Audit Logs: /audit-logs
- Workflow Performance: /workflow-performance
- Workflow Time Configuration: /settings/workflow-time-config
- System Configuration: /configuration
- Design Configuration: /settings/design-configuration
- Realm: /realm
- System Messages: /system-messages
- System Settings: /settings
- Vobi Vault: /admin/vobi-vault

MULTI-COMPANY ACCESS
- The current company scopes are C&W (CW) and PTEL.
- Company-scoped users, requests, transport records, inventory, HR records,
  projects, tickets, and related operational data remain isolated from other
  companies.
- A company administrator manages users and records within that company. Only
  a true system administrator can manage or inspect company-specific settings.
- Realm approver settings support company-specific approver lists while keeping
  legacy flat C&W settings compatible.

ADMINISTRATIVE FUNCTIONS
- Create, update, disable, and manage staff accounts.
- Configure users, roles, units, positions, approvers, and workflow settings.
- Manage customers and client organizations.
- Review audit logs and workflow performance.
- Configure design settings and system messages.
- Maintain realm-specific approver assignments.
- Access protected Vobi Vault functionality where authorized.

PROTECTED OPERATIONS
Database backup, restore, and wipe operations require the configured developer
protection value and must only be performed by authorized administrators after
checking backups and recovery procedures.


22. VOBI WORK ASSISTANT
-----------------------
Vobi is the built-in work assistant.

Vobi can:
- Summarize pending approvals, assigned tickets, overdue work, mentions, and
  recent activity.
- Provide daily and since-last-login summaries.
- Summarize chat threads and record conversations.
- Open a personal Vobi chat thread.
- Handle command-style requests for approvals, mentions, tickets, summaries, and
  work digests.
- Produce operational summaries from available system data.

Vobi is connected to authenticated backend routes under /api/vobi. It reads
permitted workspace, chat, ticket, request, audit, and project information.


23. NOTIFICATIONS, REALTIME, AND AUDITING
-----------------------------------------
NOTIFICATIONS
- In-app notifications are displayed in the staff shell and sidebar counts.
- Notifications can relate to requests, approvals, tickets, escalations, HR,
  chat, mentions, and workflow changes.
- Optional Web Push and Firebase Cloud Messaging can deliver notifications when
  configured.

REALTIME
- Socket.IO delivers live updates for chat, direct messages, channels, users,
  tickets, requests, and operational events.
- Frontend event names such as staff:requests-changed, staff:tickets-changed,
  staff:notifications-changed, and chat:unread-changed refresh visible counters
  and dashboard data.

AUDIT LOGGING
- Login and security actions are logged.
- Request creation, approval, rejection, finalization, inventory changes,
  configuration changes, user changes, and sensitive administrative operations
  should be auditable.
- Audit Logs is available at /audit-logs to authorized users.


24. TECHNICAL ARCHITECTURE
--------------------------
FRONTEND
- React 18
- TypeScript
- Vite
- React Router 6
- TanStack Query
- Tailwind CSS
- Radix UI components
- Lucide icons
- Chart.js and Recharts
- Leaflet / React Leaflet for maps
- Socket.IO client
- React Hook Form and Zod for form handling/validation
- PDF, Excel, and export libraries
- PWA service worker support

BACKEND
- Node.js ES modules
- Express
- PostgreSQL through pg
- JWT authentication
- bcrypt password hashing
- Socket.IO server
- Multer file uploads
- Nodemailer SMTP email
- IMAP inbound email support
- Web Push and optional Firebase Cloud Messaging
- Puppeteer and document conversion utilities where used by workflows

MAIN FILES
- src/App.tsx: frontend application shell and high-level application wiring.
- src/main.tsx: browser entrypoint, BrowserRouter, styles, and service worker setup.
- src/pages/Index.tsx: protected staff shell, sidebar/header, and frontend routes.
- src/hooks/useCompany.ts: current company context and company labels.
- src/components/Sidebar.tsx: role-aware staff navigation and attention counters.
- src/pages/: frontend pages grouped by module.
- src/api/: frontend API clients.
- src/context/: authentication, realtime, Vobi, and application contexts.
- backend/server.js: main Express backend entrypoint and route registration.
- backend/middleware/tenant.js: company/tenant context attachment.
- backend/db.js: core database access and legacy/general database functions.
- backend/routes/: backend domain route modules.
- backend/services/: workflow, chat, email, reporting, and operational services.
- backend/middleware/: authentication, tenant, role, customer, and share access.
- backend/realtime/: Socket.IO channels and ticket/chat sockets.
- backend/push/: Web Push and FCM delivery.
- backend/migrations/: database migration scripts.
- public/: public assets, service workers, redirects, and static files.
- backend/seeds/ptel-users.js: PTEL user seed data.


25. IMPORTANT BACKEND DOMAIN AREAS
----------------------------------
The backend includes route and service areas for:
- Authentication and profiles.
- Inventory and material requests.
- Cash requests and approvals.
- Transport, vehicle rental, and fuel requests.
- Assets and asset maintenance.
- Projects and service requests.
- Network assets.
- CX, customer portal, tickets, and staff ticket workflows.
- Incident notes and NOC shifts.
- Field activities and field work.
- IP unit circuits and requests.
- HR and HR self-service.
- Performance reports.
- Chat, chat actions, chat administration, and chat context.
- Vobi and Vobi Vault.
- Global search.
- References and linked records.
- Activity logs and shared links.
- Todos and workflow time engine.
- Notifications, email, and push delivery.


26. REQUEST AND RECORD LINKING
------------------------------
Many records can reference other records. Examples include:
- Tickets linked to customers, projects, sites, and service requests.
- Vehicle requests linked to transport requests.
- Chat threads linked to tickets, requests, and projects.
- Service requests linked to related operational records.
- Shared links linked to records for controlled access.

The backend can resolve and persist linked references after a parent record has
been created. Broken or unavailable optional links should not invalidate an
otherwise valid parent submission.


27. AUTHENTICATION AND SECURITY
-------------------------------
STAFF AUTHENTICATION
- Staff requests use a JWT in the Authorization header.
- The frontend stores the current staff token and user context for the session.
- ProtectedRoute checks login state and role/unit/position restrictions.

CUSTOMER AUTHENTICATION
- Customer portal requests use a customer token.
- Customer routes are protected separately from staff routes.

SECURITY RULES
- Never expose JWT secrets, database passwords, SMTP passwords, VAPID private
  keys, Firebase service credentials, or developer protection values.
- Use HTTPS in production.
- Change all default/admin credentials before production use.
- Restrict backup, restore, and wipe operations.
- Use least-privilege roles and remove unused accounts.
- Keep PostgreSQL backups and test restoration.
- Validate upload types and size limits.
- Preserve audit records for sensitive actions.


28. FILES, UPLOADS, EMAIL, AND PUSH
-----------------------------------
UPLOADS
- Backend uploads are stored under backend/uploads or domain-specific storage
  folders such as archive-storage and performance-report-storage.
- Express serves approved uploaded files with detected MIME types.
- File Storage accepts any file extension up to 2 GB; Chat attachments are
  limited to 200 MB per file and use MIME type or supported extension checks.
- Large uploads are supported without the default five-minute Node request
  timeout; available disk space and deployment limits still apply.

EMAIL
- SMTP sends outbound workflow or notification email when configured.
- IMAP/inbound email support can turn incoming messages into supported system
  activity such as ticket communication.

PUSH
- Web Push uses VAPID keys.
- Firebase Cloud Messaging is optional and used when its service account is
  configured.


29. LOCAL DEVELOPMENT SETUP
---------------------------
PREREQUISITES
- Node.js and npm.
- PostgreSQL database.
- A configured backend/.env file.
- Dependencies installed in the root and backend packages.

INSTALL DEPENDENCIES
- From the project root: npm install
- From backend: npm install

ROOT COMMANDS
- npm run dev       Start the Vite frontend development server.
- npm start         Start the Vite frontend development server.
- npm run build     Build the frontend for production.
- npm run build:dev Build the frontend using development mode.
- npm run lint      Run ESLint.
- npm run preview   Preview the built frontend.

BACKEND COMMANDS
- From backend, npm start runs node server.js.
- From backend, npm run build invokes the root frontend build.

DEFAULT DEVELOPMENT PORTS
- Frontend: usually http://localhost:3000 when configured by the Vite setup.
- Backend: port 3001 by default, controlled by backend PORT.

STARTING THE SYSTEM
1. Configure backend/.env.
2. Start PostgreSQL.
3. Start the backend from the backend directory.
4. Start the frontend from the project root.
5. Open the frontend URL in a browser.
6. Sign in with a valid staff or customer account.


30. ENVIRONMENT VARIABLES
-------------------------
The main backend environment file is backend/.env.

DATABASE AND AUTHENTICATION
- PG_HOST
- PG_PORT
- PG_DATABASE
- PG_USER
- PG_PASSWORD
- JWT_SECRET
- PORT
- DEVELOPER_CODE

EMAIL AND INBOUND EMAIL
- SMTP_HOST
- SMTP_PORT
- SMTP_USER
- SMTP_PASS
- FROM_NAME
- FROM_EMAIL
- IMAP_USER
- IMAP_PASS
- IMAP_HOST
- IMAP_PORT

PUSH NOTIFICATIONS
- VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
- FIREBASE_SERVICE_ACCOUNT_JSON (optional)

APPLICATION
- CLIENT_URL
- NODE_ENV

Values and names can vary by deployment. Check backend/server.js and service
configuration before changing production settings.


31. PRODUCTION READINESS CHECKLIST
-----------------------------------
Before production rollout:
- Configure production PostgreSQL and test the connection.
- Set a strong unique JWT_SECRET.
- Set production CLIENT_URL and HTTPS.
- Change all default/admin passwords.
- Back up PostgreSQL and test restore.
- Test staff accounts for Admin, Director/CTO, Finance, Approver, Procurement,
  NOC, IP, TX, Project, HR, Customer, and Superadmin access.
- Test customer login and portal isolation.
- Test material request, approval, issue, and return.
- Test cash request, approval, release, and receipt status.
- Test transport, rental, and fuel workflows.
- Test service-request routing and sign-off.
- Test ticket creation, assignment, escalation, resolution, and closure.
- Test field activity and map views.
- Test assets, maintenance, assignments, and reports.
- Test HR attendance, leave, payroll, and self-service.
- Test performance report submission and review.
- Test chat, record threads, notifications, Vobi, and realtime updates.
- Configure or intentionally disable email, inbound email, Web Push, and FCM.
- Verify upload folders and storage permissions.
- Review audit logs and operational error logs.
- Confirm the frontend production build succeeds.


32. TROUBLESHOOTING
-------------------
BACKEND WILL NOT START
- Check backend/.env values.
- Confirm PostgreSQL is running and reachable.
- Confirm port 3001 is free or change PORT.
- Run the backend from the backend directory.
- Read the first startup error; database and missing environment values are common
  causes.

FRONTEND CANNOT REACH API
- Confirm the backend is running.
- Confirm the frontend API base URL and CLIENT_URL configuration.
- Check CORS origins in backend/server.js.
- Confirm the browser is using the correct staff/customer token.

A MODULE IS NOT VISIBLE
- The sidebar is role-aware and may hide the module.
- Check the user's role, main_role, roles, unit, units, department, and position.
- Check ProtectedRoute allowedRoles, allowedUnits, and allowedPositions in
  src/pages/Index.tsx.
- Check realm approver assignment for approval modules.

A COUNT OR DASHBOARD IS STALE
- Check the backend API response.
- Check Socket.IO connection and realtime event handling.
- Refresh the page and inspect browser/network errors.
- Check that the relevant record mutation emits the expected frontend event.

A CUSTOMER CANNOT SEE A TICKET
- Confirm the customer token is valid.
- Confirm the ticket belongs to the authenticated customer or permitted site.
- Do not use a staff route to test a customer record.

UPLOADS FAIL
- Check the relevant limit: 2 GB for File Storage or 200 MB for Chat
  attachments. File Storage is not restricted to a fixed extension allowlist.
- Check backend/uploads permissions and available disk space.
- Check the backend log for Multer or MIME errors.


33. ROUTE QUICK REFERENCE
-------------------------
COMMON STAFF
- /workspace
- /chat
- /profile
- /my-activity
- /my-shared-links
- /system-guide
- /archive

INVENTORY
- /dashboard
- /inventory
- /categories
- /low-stock
- /items-out
- /request-forms
- /item-returns
- /approved-forms

FINANCE AND TRANSPORT
- /cash-request
- /finance/dashboard
- /finance-approvals
- /transport-request
- /transport-approvals
- /transport/fuel-requests
- /transport/rental-approvals

PROJECT AND NETWORK
- /project-request/project
- /project-request/design
- /project-request/sales
- /project-request/ts
- /project-request/ip
- /project-request/noc
- /project-unit/wip
- /project-unit/signoff
- /network-assets
- /ip-unit/dashboard

TICKETING
- /staff/cx/dashboard
- /staff/cx/tickets
- /staff/noc/dashboard
- /staff/noc/tickets
- /staff/ip/dashboard
- /staff/ip/tickets
- /staff/field/dashboard
- /staff/field/tickets
- /staff/cx/escalate

HR AND PERFORMANCE
- /hr/dashboard
- /hr/employees
- /hr/leave
- /hr/payroll
- /hr-self/attendance
- /hr-self/leave
- /performance-reports/dashboard
- /performance-reports/my-reports

CUSTOMER
- /customer/login
- /customer/dashboard
- /customer/sites
- /customer/tickets
- /customer/create-ticket
- /customer/profile


34. SOURCE OF TRUTH
-------------------
For current implementation details, use these files:
- ALL_MODULES.txt: concise complete module inventory.
- README.md: project overview and production notes.
- src/components/Sidebar.tsx: role-aware visible menu labels.
- src/pages/Index.tsx: protected frontend route declarations.
- backend/server.js: backend startup, middleware, and route registration.
- backend/routes/: backend domain endpoints.
- backend/migrations/: database schema changes.
- CHAT.md: detailed Community Chat documentation.
- docs/: focused workflow and incident documentation.

This document describes the implemented system at the time it was created. When
routes, permissions, workflows, or environment variables change, update this
file and ALL_MODULES.txt together.

END OF VOBISS ERP SYSTEM README
