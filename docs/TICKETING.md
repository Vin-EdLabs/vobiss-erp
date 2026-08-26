# VOBISS ERP — Ticketing Module

Complete reference for how customer and staff support tickets are created, routed, worked, escalated, resolved, and closed.

---

## 1. What ticketing does

Ticketing is the support / incident workflow for **customer issues** and **staff-raised operational tickets**. It connects:

| Surface | Purpose |
|---------|---------|
| **Customer portal** | Customer logs in (customer code + PIN), creates a ticket, tracks status and the public timeline |
| **CX (Customer Experience)** | Master queue, create-on-behalf, customers/projects, search, escalate, work history |
| **NOC** | First-line queue for tickets at escalation stage `noc` |
| **IP** | Queue for tickets assigned to IP team members |
| **Field / TS (TX)** | Queue for field / transmission assignees; staff can route new tickets to unit `tx` |
| **Escalation desks** | NOC Manager → Relationship Officer → CTO / Director |
| **Email ingest** | Inbound IMAP mail can create a ticket (`source: email`) |
| **Chat** | Each ticket can be linked to a staff chat thread |
| **Material requests** | Optional link via `requests.ticket_id` |

Public ticket numbers look like **`TCK-000123`** (`tickets.ticket_id`). Internal numeric `tickets.id` is used in APIs and FKs.

**Currency of truth for status names (DB):**  
`NEW` · `OPEN` · `IN_PROGRESS` · `ON_HOLD` · `RESOLVED` · `CLOSED`

---

## 2. Who can use what

### Support API gate (`/api/cx/*`)

Roles in `TICKET_SUPPORT_ROLES` (`backend/roles.js`, mirrored in `src/config/roles.ts`):

`cx`, `noc`, `noc_manager`, `noc_supervisor`, `ip`, `ip_manager`, `ip_supervisor`, `ts_manager`, `ts_supervisor`, `field_engineer`, `field_engineer_admin`, `relationship_officer`, `approver`, `director`, `cto`, `superadmin`

Also allowed by **unit** `cx` / `noc` / `ip` / `tx`, or matching **positions** (Customer Support, Relationship Officer, Engineer, manager / supervisor / director).

### Permissions at a glance

| Action | Who |
|--------|-----|
| Create (customer) | Authenticated customer |
| Create (staff) | Support-role user via CX |
| See all tickets | Managers / directors / CTO / superadmin |
| See own queue | Assignee, or staff who created the ticket |
| Claim unassigned | Support staff with access |
| Reassign / manual escalate | Current assignee, CX, or superadmin |
| Accept escalation stage | Support user with ticket access |
| Change status / resolve / close | Staff with view access |
| Comment (public / internal) | Staff |
| Customer edit status | **No** — customers are read-only after create |

---

## 3. Lifecycle (status flow)

```
Create → NEW
         ↓  auto-routing (applyNewTicketRouting)
       OPEN   (stage = noc / ip / tx; usually unassigned)
         ↓  claim / assign + work
   IN_PROGRESS  (or stay OPEN)
         ↓
    RESOLVED → CLOSED
```

`ON_HOLD` is allowed in the DB and used in some attention queries; it is less prominent in the main CX status buttons.

### Status buttons commonly shown to staff

`OPEN` · `IN_PROGRESS` · `RESOLVED` · `CLOSED`  
(Some UIs also offer reopen-style actions; the live DB check constraint is the list in §1 — do not rely on a separate `REOPEN` status unless the constraint is updated.)

### Customer-facing labels (approx.)

| DB status | Customer sees |
|-----------|----------------|
| `NEW` | New |
| `OPEN` / `IN_PROGRESS` | In progress |
| `RESOLVED` | Resolved |
| `CLOSED` | Closed |

---

## 4. Categories, priorities, sources

These are **free strings** with app defaults (not hard enums beyond UI options).

### Category (examples)

| Portal | Staff create |
|--------|----------------|
| `general`, `billing`, `technical`, `account`, `feature` | `general`, `connectivity`, `hardware`, `billing`, `outage`, `configuration`, `other` |

Default: **`general`**.

### Priority (examples)

| Portal | Staff |
|--------|--------|
| `low`, `normal`, `high`, `urgent` | `low`, `normal`, `high`, `critical` |

Default: **`normal`**.

### Source

`portal` · `email` · `phone` · `staff`  
(DB check on `tickets.source`.)

---

## 5. How a ticket is created

### 5.1 Customer portal

| Item | Detail |
|------|--------|
| UI | `src/pages/customer/CreateTicket.tsx` |
| Route | `/customer/create-ticket` |
| API | `POST /api/customer/tickets` |
| Auth | Customer JWT (`authenticateCustomer`) |
| Required | `title`, `description` |
| Optional | category, priority, image attachments |
| Uploads | Images, ≤ 5 MB each, ≤ 10 files → `uploads/tickets/` |
| Result | `status = NEW`, `source = portal`, `created_by_type = customer`, then **auto-routed** to `OPEN` + first escalation stage |

### 5.2 Staff (CX)

| Item | Detail |
|------|--------|
| UI | `src/pages/staff/cx/CreateStaffTicket.tsx` |
| Route | `/staff/cx/create-ticket` |
| API | `POST /api/cx/tickets` |
| Required | `customer_id`, `title`, `description` |
| Optional | category, priority, `assigned_to`, **`route_to_unit`** (`noc` \| `ip` \| `tx`) |
| Project | Taken from the customer’s `project_id` |
| Result | Staff source; may land in a chosen unit queue. **Manual unit routing turns off auto-escalation** for that ticket. |

### 5.3 Email

IMAP / inbound mail (`backend/inboundEmailService.js` or related) can create tickets with `source: email`, matching customer by email when possible.

---

## 6. Routing & queues

### Auto-routing on create — `applyNewTicketRouting` (`backend/ticketEscalation.js`)

1. Sets `escalation_stage` (default first config stage, usually **`noc`**, or manual `noc` / `ip` / `tx`)
2. Sets `stage_entered_at`, clears `stage_accepted_at`
3. If auto-escalation is on and stage minutes &gt; 0 → sets `escalation_due_at`
4. Forces `NEW` → **`OPEN`**
5. Leaves **`assigned_to` NULL** until someone claims
6. Writes timeline action **`ROUTED`**

### Unit queues (how the UI filters `GET /api/cx/tickets`)

| Queue | Typical filter |
|-------|----------------|
| **NOC** | `escalation_stage = noc`, unassigned or NOC assignee |
| **IP** | Assignee is an IP team member |
| **Field / TS** | Assignee in field / TS / TX unit |
| **CX** | Managers: all; others: assigned to me or created by me |
| **Escalation desks** | `escalation_stage` = `noc_manager` / `relationship_officer` / `director` |

---

## 7. Working a ticket (ack → progress → close)

| Step | What happens | API |
|------|----------------|-----|
| **Stage accept** | Marks stage acknowledged (`stage_accepted_at`). Does **not** stop the auto-escalation timer | `POST /api/cx/tickets/:id/accept` |
| **Claim / assign** | Sets `assigned_to`; **clears `escalation_due_at`** (SLA clock stops) | `PATCH /api/cx/tickets/:id` or `.../assign` |
| **Work acknowledge** | Status move toward OPEN / IN_PROGRESS; may email customer | `PATCH` + comment |
| **Progress comment** | Public or internal timeline entry | `PATCH` with `comment` + `visibility` |
| **Resolve / close** | Status `RESOLVED` / `CLOSED`; often requires a reason; may set `closed_at`; emails customer | `PATCH` |
| **Manual email** | Staff sends an email to the customer from the ticket | `POST /api/cx/tickets/:id/send-email` |

Core mutation logic lives in `backend/db.ticketing.cjs` (e.g. staff update helpers).

**Shared UI:** `src/components/shared/TicketDetailView.tsx`  
**CX detail page:** `src/pages/staff/cx/TicketDetailPage.tsx`

---

## 8. Escalation (auto + manual)

### Default matrix (`backend/ticketEscalationConfig.js`)

Configurable under **Configuration → workflow** as `ticket_escalation`. Defaults:

| Stage key | Label | Minutes if still unassigned | Target roles |
|-----------|-------|-----------------------------|--------------|
| `noc` | NOC Unit | 30 | `noc` |
| `noc_manager` | NOC Manager | 60 | `noc_manager` |
| `relationship_officer` | R.O | 120 | `relationship_officer` |
| `director` | CTO / Directors | 0 (no further timer) | `director`, `cto` |

Saving config resyncs open timers (`resyncOpenTicketEscalationTimers`).

### Automatic escalation

- Cron / interval in `backend/server.js` (about every **60 seconds**) → `processAutoEscalations`
- Runs when: auto-escalation enabled, **`assigned_to IS NULL`**, `escalation_due_at <= now`, status not `RESOLVED` / `CLOSED`
- Advances `escalation_stage`, timeline **`AUTO_ESCALATED`**, may post a chat system message
- **Accepting the stage does not stop the timer**
- **Assigning an owner does**

### Manual escalation

- UI: `/staff/cx/escalate` and `/staff/cx/escalate/:ticketId`
- Reassign with escalation flag → timeline **`ESCALATED`** + emails

### Escalation desk routes

| Path | Audience |
|------|----------|
| `/staff/noc-manager/escalations` | NOC Manager |
| `/staff/ro/escalations` (and related) | Relationship Officer |
| `/staff/director/escalations` | Director / CTO |

---

## 9. Timeline (activity log)

**Table:** `ticket_timeline`

| Column | Meaning |
|--------|---------|
| `ticket_id` | FK → `tickets.id` |
| `action` | e.g. `CREATED`, `ROUTED`, `ASSIGNED`, `UNASSIGNED`, `ESCALATED`, `AUTO_ESCALATED`, `ACCEPTED`, `STATUS_CHANGE`, `COMMENT`, `EMAIL_SENT`, `EMAIL_FAILED` |
| `message` | Human-readable text |
| `visibility` | `public` or `internal` |
| `actor_id` / `actor_role` / `actor_name` | Who did it |
| `created_at` | When |

- Staff see the full timeline on ticket detail.
- Customers only see **`visibility = public`**.

Audit-style logs may also be written separately for create/update.

---

## 10. Notifications & realtime

| Channel | Behavior |
|---------|----------|
| **Email (customer)** | Assign, escalate, acknowledge, resolve, close, manual send |
| **Email (staff)** | Assignment / escalation notices |
| **Staff realtime** | Socket / `staff:realtime` (topic tickets) → toast + React Query invalidate |
| **Chat** | System messages on create / route / assign / status / auto-escalate |
| **My Workspace** | Open assigned tickets surface as attention items |

Frontend realtime: `src/context/RealtimeContext.tsx` (and related staff socket handlers).

---

## 11. Frontend map (routes → pages)

### Customer

| Route | Page |
|-------|------|
| `/customer/dashboard` | `src/pages/customer/Dashboard.tsx` |
| `/customer/create-ticket` | `src/pages/customer/CreateTicket.tsx` |
| `/customer/tickets/:id` | `src/pages/customer/TicketDetail.tsx` |
| *(list component)* | `src/pages/customer/Tickets.tsx` |

### CX

| Route | Page |
|-------|------|
| `/staff/cx/dashboard` | `src/pages/staff/cx/Dashboard.tsx` |
| `/staff/cx/tickets` | `src/pages/staff/cx/Tickets.tsx` |
| `/staff/cx/tickets/:id` | `src/pages/staff/cx/TicketDetailPage.tsx` |
| `/staff/cx/create-ticket` | `src/pages/staff/cx/CreateStaffTicket.tsx` |
| `/staff/cx/escalate`, `.../:ticketId` | `src/pages/staff/cx/EscalateTicket.tsx` |
| `/staff/cx/assign` | `src/pages/staff/cx/AssignUser.tsx` |
| `/staff/cx/ticket-search` | `src/pages/staff/cx/TicketSearch.tsx` |
| `/staff/cx/user-work-history` | `src/pages/staff/cx/UserWorkHistory.tsx` |
| `/staff/cx/customers` | `src/pages/staff/cx/Customers.tsx` |
| `/staff/cx/projects` | `src/pages/staff/cx/Projects.tsx` |

### Unit queues

| Route | Page |
|-------|------|
| `/staff/noc/dashboard` | `src/pages/staff/noc/Dashboard.tsx` |
| `/staff/noc/tickets` | `src/pages/staff/noc/NOCAllTickets.tsx` |
| `/staff/noc/tickets/:id` | Shared detail |
| `/staff/ip/tickets` | `src/pages/staff/ip/IPAllTickets.tsx` |
| `/staff/field/tickets` | Field / TS list |
| `/staff/reports/tickets` | `src/pages/staff/reports/TicketReport.tsx` |

Router wiring: **`src/pages/Index.tsx`**.  
Path helpers: `src/lib/ticketPaths.ts`.  
API client helpers: `src/api.ts` (`cxApi`, customer ticket helpers).

---

## 12. Backend map

### Mounts (`backend/server.js`)

| Mount | Router file |
|-------|-------------|
| `/api/customer/tickets` | `backend/routes/ticket.routes.js` |
| `/api/customer` | `backend/routes/customer.routes.js` |
| `/api/cx` | `backend/routes/cx.routes.js` |
| `/api/tickets` | `backend/routes/staff_ticket.routes.js` (search / linked requests) |
| Reports | `backend/routes/reports.routes.js` → e.g. `GET /api/reports/tickets` |

### Core modules

| File | Role |
|------|------|
| `backend/db.ticketing.cjs` | Schema init, CRUD, timeline, staff updates |
| `backend/ticketEscalation.js` | Route new tickets, accept stage, auto-escalate, resync timers |
| `backend/ticketEscalationConfig.js` | Default matrix + normalize |
| `backend/Schema_ticket.sql` | SQL notes / upgrades |
| Email helpers | `backend/emailService.js`, inbound mail services |

### Main endpoints

**Customer**

- `POST /api/customer/tickets` — create (+ attachments)
- `GET /api/customer/tickets/my` — my tickets
- `GET /api/customer/tickets/:id` — detail + public timeline

**CX / staff**

- `GET /api/cx/tickets` — list (`status`, `project_id`, `escalation_stage`, `tag_ids` AND, `tag_ids_any` OR, …)
- `GET /api/cx/tickets/:id` — detail + full timeline (+ `tags`)
- `POST /api/cx/tickets` — staff create (optional `tag_ids`)
- `PATCH /api/cx/tickets/:id` — status / assign / comment / escalate flag
- `PATCH /api/cx/tickets/:id/assign` — assign only
- `POST /api/cx/tickets/:id/accept` — stage accept
- `POST /api/cx/tickets/:id/send-email` — manual customer email
- `POST /api/cx/tickets/:id/tags` / `DELETE .../tags/:tagId` — add/remove tags (timeline `TAGGED` / `UNTAGGED`)
- `GET|POST /api/cx/tags`, `PATCH|DELETE /api/cx/tags/:id` — tag catalog (managers for write)
- `GET /api/cx/team-members`, `/users`, `/users/:id/work-history`
- `GET|POST /api/cx/projects`, `/customers`
- Ticket search helpers under CX and `/api/tickets/search`

---

## 13. Database

### `tickets`

| Column | Notes |
|--------|--------|
| `id` | Serial PK |
| `ticket_id` | `TCK-######` unique public id |
| `project_id`, `customer_id` | FKs |
| `title`, `description` | Required |
| `category`, `priority` | Defaults `general` / `normal` |
| `status` | See §1 |
| `source` | `portal` \| `email` \| `phone` \| `staff` |
| `assigned_to` | FK `users` |
| `created_by_id`, `created_by_type` | `customer` \| `staff` |
| `attachments` | JSONB |
| `created_at`, `updated_at`, `closed_at` | |
| `escalation_stage` | e.g. `noc`, `noc_manager`, … |
| `stage_entered_at`, `stage_accepted_at` | Stage timing |
| `escalation_due_at` | Auto-escalate deadline |
| `auto_escalation_enabled` | Boolean (manual unit route may disable) |

### `ticket_timeline`

See §9.

### Related

- `customers`, `projects`
- `ticket_tags` / `ticket_tag_map` — colored labels; list filters via `tag_ids` / `tag_ids_any`
- `requests.ticket_id` — optional material-request link
- Workflow JSON config includes `ticket_escalation`

Schema bootstrap: `initTicketTables()` in `backend/db.ticketing.cjs`.

---

## 15. Unit dashboards, work history & full ticket report

### Unit ticketing dashboards
- **NOC** — `/staff/noc/dashboard`
- **IP** — `/staff/ip/dashboard`
- **TS** — `/staff/field/dashboard`

Each shows open / in-progress / high-priority / assigned-to-me stats and a queue snapshot filtered by unit stage / assignee.

### User Work History (`/staff/cx/user-work-history`)
Cross-module for a selected staff user:
- **Tickets** — assigned or timeline actor
- **Material requests** — requester or approver
- **Cash requests** — requester or approver

API: `GET /api/cx/users/:id/work-history` → `{ tickets, material_requests, cash_requests, summary }`

### Full ticket report
On any ticket detail page, **Generate report** builds a lifecycle pack:
- Start / end times and resolution duration
- Everyone who worked on the ticket (from timeline)
- Linked material + cash requests (and line items)
- SLA deadlines / first response
- Narrative text (downloadable `.txt`)

When a ticket is **RESOLVED** or **CLOSED**, a brown **Print history** bar appears with:
- **View report** — printable on-screen history (timeline, workers, materials, cash)
- **Print** — browser print of that document
- **PDF** — branded multi-page PDF download (`TCK-######-history-report.pdf`)

API: `GET /api/tickets/search?q=TCK-######` or `GET /api/cx/tickets/search/:ticketId`

### Vobi / AI ticket lookup
Paste a ticket id (e.g. `TCK-000123`) in Vobi. The assistant loads the full report into context and answers with status, stage, workers, materials, SLA, and progress.

---

## 16. Architecture snapshot

```text
  Customer portal ──POST──► create (NEW)
  Staff CX ────────POST──► create (staff / optional unit)
  Email IMAP ─────────────► create (email)
                │
                ▼
        applyNewTicketRouting
                │
                ▼
     OPEN @ escalation_stage (usually noc)
     assigned_to = NULL, timer may be set
                │
     ┌──────────┴──────────┐
     │ unassigned timeout  │ someone assigns
     ▼                     ▼
  noc → noc_manager     owner set;
  → RO → director       escalation_due_at cleared
     │                     │
     └──────────┬──────────┘
                ▼
         IN_PROGRESS / work
                ▼
         RESOLVED → CLOSED
```

---

## 17. Hard rules (do not break these)

1. **Auto-escalation only while unassigned** — assignment stops the clock; stage “accept” does not.
2. **Manual route to `noc` / `ip` / `tx`** typically **disables** auto-escalation for that ticket.
3. **Customers** create + view own tickets only; public timeline only; no assign/status API.
4. **Non-managers** generally cannot open tickets that are not assigned to them (except ones they created as staff).
5. **Reassign / escalate** once assigned: assignee, CX, or superadmin.
6. **Public id** is `TCK-######`; APIs often use numeric `id` — be consistent in clients.
7. **Priority labels** differ slightly between portal (`urgent`) and staff (`critical`) — normalize in UI if comparing.
8. Prefer the **DB status set** in §1 when writing new code; avoid inventing statuses without migrating the check constraint.

---

## 18. Where to start reading code

| Goal | Start here |
|------|------------|
| Schema + CRUD | `backend/db.ticketing.cjs` |
| Routing + SLA | `backend/ticketEscalation.js` + `ticketEscalationConfig.js` |
| Staff HTTP API | `backend/routes/cx.routes.js` |
| Customer HTTP API | `backend/routes/ticket.routes.js` |
| Staff ticket UI | `src/pages/staff/cx/` + `TicketDetailView.tsx` |
| Unit dashboards | `src/components/tickets/UnitTicketDashboard.tsx` |
| Full ticket report | `src/components/tickets/TicketFullReportPanel.tsx` |
| User work history | `src/pages/staff/cx/UserWorkHistory.tsx` |
| Customer UI | `src/pages/customer/` |
| Roles | `backend/roles.js` → `TICKET_SUPPORT_ROLES` |
| Routes registry | `src/pages/Index.tsx` |


---

*This document describes the ticketing system as implemented in the VOBISS ERP codebase. When behavior and this file disagree, trust the live code and update this README.*
