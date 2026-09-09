# CTO / Director Portal

This portal is the executive command center for the Vobiss ERP system. It is designed for CTOs, directors, executive managers, and senior operations leaders who need a single place to track operational health, escalations, approvals, service delivery, customer issues, field activity, and performance across the business.

The Director portal is not a basic dashboard. It is a decision-making layer that gives leaders immediate visibility into what is blocked, what is progressing, what requires attention, and where intervention is needed.

---

## 1. Purpose of the Director Portal

The Director portal helps leadership answer the most important questions quickly:

- What is happening across the company right now?
- Which tickets, requests, or escalations need executive attention?
- Which teams are under pressure or delayed?
- Are approvals, cash requests, material issues, and work orders moving correctly?
- Which operational areas need intervention or support?
- Are there customer or service issues that should be escalated?
- Are there performance trends, audit events, or workflow bottlenecks to review?

The system intentionally gives directors a cross-functional view instead of only unit-level details.

---

## 2. Who Can Access It

The Director/CTO portal is available to executive and director-level roles, including:

- Director
- CTO
- Executive stakeholders
- Senior managers with executive access
- Authorized system administrators
- Selected HR or operational users who have been granted director-level visibility

Access is controlled by backend role checks and route protection. Users are allowed in only when their role, unit, permissions, or position aligns with the executive access model.

---

## 3. What the Director Sees in the Portal

The portal brings together operational information from multiple areas of the business:

### Executive dashboard
- Cross-system overview of operational activity
- Inventory and stock movement signals
- Cash disbursement status
- Pending approvals
- Inventory request backlog
- Operational attention counts
- Recent system activity and work trends

### Ticket visibility
- All support tickets across relevant business units
- Executive escalation queue
- Ticket status, ownership, and escalation stage
- Tickets requiring leadership intervention
- Priority and blocked work indicators

### Service request visibility
- Project and service request progress across units
- Overall in-progress work
- Completed, pending, and delayed requests
- Work spanning design, project, sales, TX, IP, and NOC areas

### Inventory and approvals
- High-level stock and issuance trends
- Pending inventory requests
- Approval bottlenecks
- Cash request status and pending attention

### Field operations and activity
- Team field activity visibility
- Field engineer activity map
- Site and operational location context
- Work that may be delayed or requiring supervisor intervention

### Search and investigation tools
- Global search to jump straight to tickets, records, requests, projects, or sites
- Site-based investigations
- Customer and project history visibility
- Executive search to find a record without navigating through modules manually

### Reporting and audit review
- Executive reporting pages
- Ticket, service, and operational reports
- Audit logs for sensitive activity and workflow review
- Workflow performance monitoring where authorized

---

## 4. Main Director Portal Pages

These are the key pages available to the Director/CTO workspace.

### Executive dashboard
- /director/dashboard

This is the main landing page for leaders. It presents a consolidated view of operations and the current attention areas. It is intended to help directors quickly evaluate company health and identify work that needs intervention.

Typical information includes:
- item and stock activity
- cash disbursed today
- pending cash approvals
- pending inventory requests
- issue activity
- recent operational trends
- current attention items

### Global search
- /director/search

This page allows leaders to search across major work records, client, site, and business activity. It is built to answer direct executive questions such as:

- Where is this ticket?
- Which site owns this issue?
- What is the current status of this request?
- Which project or customer is connected to this record?

This is one of the most valuable investigative tools for executives who need speed and clarity.

### Executive escalations
- /staff/director/escalations

This queue contains tickets that have reached the executive escalation stage. It is the final escalation level for unresolved issues requiring leadership visibility or action.

Leadership can:
- review escalated tickets
- check ownership and stage
- see what is blocked
- move issues toward final resolution
- collaborate across operational units

### Ticket detail pages
- /staff/director/tickets/:id

Directors can open detailed ticket records to inspect issue notes, status history, assignments, context, and related activity.

### All service requests
- /project-request/project

This provides a single service request view for leadership without needing to jump through separate unit queues. It helps directors monitor status across project, design, sales, TX, IP, and NOC work.

### Reports and operational analytics
- /staff/reports
- /staff/reports/tickets
- /staff/reports/cash
- /staff/reports/service-requests
- /performance-reports/analytics

These give executives visibility into workloads, trends, operational performance, and system-generated reporting.

### Audit and control pages
- /audit-logs
- /workflow-performance
- /settings
- /configuration

These pages are for authorized leadership and administrative users. They support review of operational behavior, workflow health, and sensitive control actions.

### Field map and operational visibility
- /field/map

The director can see field work and engineer activity on a map, which is essential for field operations and live coordination.

---

## 5. What the Director Portal Is Built Around

The director experience is built around four main executive needs:

### 1. Oversight
Directors want a high-level view of what is moving, what is delayed, and what is urgent.

### 2. Escalation
When an issue sits too long in a lower queue, it is escalated upward. The director portal shows those escalations clearly.

### 3. Cross-functional visibility
The platform combines inventory, tickets, field work, service requests, finance, and operations into one decision layer.

### 4. Actionable investigation
The portal does not only show data; it allows leaders to drill deeper into records, customers, workflow stages, and underlying operational activity.

---

## 6. Executive Dashboard Experience

The Executive Dashboard is designed to give leadership a fast operational picture without overwhelming them.

### Typical dashboard sections
- Inventory and stock status
- Today’s stock issue activity
- Cash disbursed today
- Pending approval counts
- Pending inventory requests
- Recent request and issue events
- Activity timeline of key work

### Dashboard behavior
- Information refreshes periodically
- High-priority waiting items are surfaced clearly
- Operational activity is summarized for quick decision-making
- The dashboard is intentionally built for leadership speed rather than deep workflow management

The dashboard is a top-level overview page, while detailed workflows remain in their modules such as tickets, projects, inventory, finance, and reports.

---

## 7. Executive Search and Site Intelligence

Directors can use the global search page to find information very quickly.

The search experience helps them:
- find a site and inspect its history
- open the full site 360 view
- follow a customer’s operational trail
- locate tickets and related requests
- understand previous activity around a site, ticket, or project

This is especially useful when a customer issue crosses multiple operational areas.

---

## 8. Escalation Model

The director portal sits at the end of the escalation chain.

Lower teams may handle work first, but once an issue is blocked, overdue, or needs leadership attention, it moves into the executive escalation path.

Escalations are not just “notifications”; they are a formal operational workflow. They help leaders understand:
- where the bottleneck is
- which team owns the problem
- whether the issue is urgent
- whether resolution requires cross-unit coordination

The Director Escalations queue is a final visibility layer for unresolved work.

---

## 9. Director Access to Business Functions

The Director portal gives executive users broad visibility into many areas, including:

### Inventory and operations
- inventory dashboards
- low stock monitoring
- request activity
- issues and stock movement

### Financial activity
- cash request visibility
- approval states
- finance-related operational summaries

### Tickets and support
- entire support queue visibility
- escalated cases
- ticket histories
- cross-team support visibility

### Service requests and projects
- work across project units
- current project movement
- completion and approval status

### Field work
- engineer movement
- field work updates
- operational site activity

### Reporting and governance
- report system pages
- performance reporting
- audit trails and workflow review

---

## 10. Sidebar and Navigation Experience

Director users see a role-aware menu with executive-focused sections. These usually include:

- CTO / Directors Dashboard
- Executive Escalations
- Service Requests
- Tickets
- Report System
- Global Search
- Audit Logs
- Workflow Performance
- Settings and configuration where authorized
- Related unit and operational links when needed

The navigation is intentionally compact but complete. It gives the leadership role enough operational access without exposing every lower-level admin function that is not relevant.

---

## 11. What Directors Should Use the Portal For

A director should use the portal for:

- business monitoring
- high-priority issue review
- escalation response management
- operational intervention
- reporting and trend review
- identifying stuck or blocked work
- checking whether teams are following operational process
- understanding business health before meetings or decisions

This is not just a reporting tool; it is an operational control and oversight tool.

---

## 12. Typical Executive Workflow

A typical director workflow can look like this:

1. Open the Executive Dashboard.
2. Review counts and recent operational activity.
3. Check escalations and blocked work.
4. Use Global Search to find a problem record or customer site.
5. Open the relevant ticket or request for detail.
6. Review status, notes, ownership, and history.
7. Determine whether intervention is needed.
8. Move the case forward or escalate further if necessary.
9. Review operational and financial reports for trend analysis.
10. Confirm whether the team is on track or needs support.

---

## 13. Role and Permission Rule

The Director portal is governed by role-based access. Not every user sees everything.

The platform checks:
- user role
- main role
- assigned unit or department
- position
- authorization for executive or admin functions

This prevents non-executive staff from seeing executive-only queues, controls, or confidential system activity.

---

## 14. Key Portal Routes

Main Director routes include:

- /director/dashboard
- /director/search
- /staff/director/escalations
- /staff/director/tickets/:id
- /project-request/project
- /staff/reports
- /staff/reports/tickets
- /field/map
- /audit-logs
- /workflow-performance
- /settings
- /configuration

These routes are the operational backbone of the leadership portal experience.

---

## 15. Summary

The CTO / Director portal is the executive view of the Vobiss ERP system. It gives leadership a dependable way to:

- monitor business health
- review escalations
- investigate operational issues
- monitor field activity
- access reporting and performance data
- understand the company’s operational status in real time

It is designed to help leaders act faster, intervene earlier, and keep service delivery, operations, and approvals moving smoothly.

This portal is the highest-level operational lens in the platform, turning a large ERP system into a usable executive command center.
