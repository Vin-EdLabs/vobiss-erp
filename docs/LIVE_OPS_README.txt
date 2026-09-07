VOBISS ERP - LIVE OPERATIONS
============================

Purpose
-------
Live Operations is the VOBISS operational pulse. It gives staff a concise,
company-wide view of work that needs attention, work that is progressing, and
work that has recently been completed.

The feed is produced by Vobi, the VOBISS internal intelligence layer. It is
not a second ticketing system and it does not change tickets, approvals, field
work, or stock. It reads current ERP data, creates an operational snapshot,
and turns that snapshot into a readable update for staff.

Where staff see it
------------------
The Live Ops Feed opens from the staff header. It shows the newest feed entry
first and keeps the most recent entries available for review.

The frontend:
  Component: src/components/VobiLiveOpsPanel.tsx
  API client: src/api/vobiFeed.ts
  Realtime listener: src/context/RealtimeContext.tsx

The feed is available to authenticated staff only. Customer portal accounts do
not use this feed.

How it works
------------
1. The backend starts and waits 30 seconds for the database and tables to
   settle.
2. The first Live Ops sweep runs.
3. A new sweep runs every 15 minutes while the backend process is running.
4. The sweep removes expired feed entries.
5. The system reads open operational records and timing information from the
   database.
6. The snapshot is sent to the dedicated Live Ops Gemini key pool for
   narration.
7. The narrated update is saved in the vobi_feed table with a seven-day
   expiry.
8. The update is broadcast over Socket.IO as vobi:feed-update.
9. Connected staff clients add the new entry without needing a page reload.

Backend implementation:
  Sweep service: backend/services/vobiLiveFeed.js
  Narration service: backend/services/vobiFeedGemini.js
  Feed route: backend/routes/vobiFeed.js
  Server startup: backend/server.js
  Realtime transport: backend/realtime/socket.js

What each sweep checks
----------------------
TICKETS
  Open tickets, priority, queue, assignee, latest timeline note, escalation
  history, response and resolution deadlines, and SLA breach status.

SERVICE REQUESTS
  Open project or service requests, current stage, assigned unit or person,
  time in the current status, and workflow timing status.

APPROVALS
  Open material, cash, transport, and related approval requests, requester,
  amount, department or unit, waiting time, pending approvers, and approvers
  who have already completed their part.

FIELD ACTIVITIES
  Active field work, work type, status, priority, unit, site, customer, and
  assigned engineers.

LOW STOCK
  Items below their configured stock threshold. Low-stock lookup failures do
  not stop the rest of the sweep.

LINKED RECORDS
  Connections between tickets, requests, service work, field work, and other
  records through linked_references. These connections help explain why work
  may be blocked or related.

SINCE LAST UPDATE
  Tickets resolved, requests completed, and service requests completed since
  the previous feed entry.

Timing and escalation
---------------------
Live Ops reuses the ERP workflow timing engine. It does not invent a separate
SLA calculation for service requests or approvals.

Ticket-specific response and resolution deadlines come from the ticket record.
Ticket auto-escalation is handled independently by the backend every 60
seconds. The default escalation path is:

  NOC Unit                 30 minutes
  NOC Manager              60 minutes
  Relationship Officer    120 minutes
  CTO / Directors           no further timer

The escalation matrix is configurable under the workflow configuration. A
ticket that has been assigned to an owner stops the unassigned auto-escalation
clock. Accepting a stage alone does not stop that timer.

The server also runs these recurring operational jobs every 60 seconds:
  - Ticket auto-escalation
  - SLA threshold notifications
  - Idle NOC ticket auto-assignment

Narration rules
---------------
Vobi is instructed to:
  - use real names, record numbers, and amounts from the snapshot;
  - identify who owns each item and who it is waiting on;
  - call out overdue work with the exact phrase SLA BREACH;
  - include escalation reasons and the person who escalated when available;
  - mention positive progress, not only problems;
  - avoid guessing missing departments, owners, statuses, or amounts;
  - finish with an overall system-health summary.

The result is Markdown text rendered in the Live Ops panel. The source snapshot
is not shown directly to staff.

Realtime and API behavior
-------------------------
Socket.IO requires a valid staff JWT during the handshake. Authenticated staff
connections join the staff room and receive:

  vobi:feed-update

The feed history is loaded through:

  GET /api/vobi-feed?company=CW

The endpoint returns the latest 20 entries, newest first. Entries expire after
seven days and are deleted during a sweep.

For a realtime update to appear, confirm that:
  - the user is signed in with a valid staff token;
  - the frontend is connected to the same backend Socket.IO server;
  - CLIENT_URL allows the browser origin;
  - the backend started successfully and completed its Socket.IO setup.

Configuration
-------------
The backend reads environment variables from backend/.env and, when enabled,
backend/.env.production. Keep these files private and out of source control.

Required for narrated Live Ops updates:
  VOBI_FEED_GEMINI_API_KEY_1

Optional dedicated fallback keys:
  VOBI_FEED_GEMINI_API_KEY_2
  VOBI_FEED_GEMINI_API_KEY_3
  VOBI_FEED_GEMINI_API_KEYS      comma, semicolon, or space separated keys
  VOBI_FEED_GEMINI_MODEL         preferred Gemini model

The Live Ops key pool is separate from the Vobi chat key pool. When a key or
model is rate-limited, unavailable, or exhausted, the service cools it down and
tries another configured model or key. A sweep fails safely if narration cannot
be generated; the error is logged and no partial feed entry is inserted.

Database
--------
The feed service creates its table and indexes on first use:

  Table: vobi_feed
  Retention: seven days per entry
  Company scope currently used by the UI: CW

The service also depends on the existing ERP tables for tickets, timelines,
project requests, approvals, field work, inventory, workflow timing, and linked
references. No manual feed-table migration is required for normal startup.

Starting the system
-------------------
From the repository root:

  npm install
  npm run dev

Start the backend in a second terminal:

  cd backend
  npm install
  npm start

Default local endpoints:
  Frontend: http://localhost:3000
  Backend:  http://localhost:3001

The backend needs a working PostgreSQL connection and a valid backend/.env.
The database user must be able to read the operational tables and create the
vobi_feed table and indexes.

Operations checklist
--------------------
When Live Ops is healthy:
  [ ] Backend is listening on its configured port.
  [ ] PostgreSQL is reachable.
  [ ] Staff login and JWT authentication work.
  [ ] At least one VOBI_FEED_GEMINI_API_KEY_* is configured.
  [ ] Socket.IO connects from the staff browser.
  [ ] A fresh feed entry appears within 15 minutes of backend startup.
  [ ] The browser receives vobi:feed-update events.

Useful backend log messages:
  [vobi-live-feed] sweep complete - feed #... saved and broadcast
  [vobi-live-feed] sweep failed: ...
  [vobi-feed-gemini] ... switching to next Live Ops key smoothly
  [workflow-time-engine] Sent ... SLA notification(s)
  [ticket-escalation] Auto-escalated ... ticket(s)

Troubleshooting
---------------
No feed appears
  Check the backend log for a sweep failure. Confirm that the database is
  reachable and that at least one dedicated Gemini key is configured.

Feed is stale
  Confirm the backend process has not restarted repeatedly. A sweep starts
  30 seconds after startup and repeats every 15 minutes. Check for a recent
  [vobi-live-feed] log entry.

Feed loads but does not update live
  Refresh the panel, then inspect the browser connection and Socket.IO logs.
  Confirm the staff JWT is valid and the browser origin matches CLIENT_URL or
  an allowed private LAN origin.

Gemini quota or rate-limit errors
  The service automatically tries configured fallback models and keys. Check
  that the dedicated key pool is populated and that the keys are active. Do
  not reuse the chat key pool unless that is an intentional operational change.

SLA or escalation details look wrong
  Check the underlying ticket deadlines, escalation_stage,
  escalation_due_at, assigned_to, and workflow timing records. Live Ops reports
  those values; it does not repair them.

Missing low-stock section
  Low-stock lookup errors are isolated so the rest of the feed can still run.
  Check inventory database access and the backend warning logs.

Security and credential handling
--------------------------------
Never place service-account JSON, private keys, Gemini keys, SMTP passwords,
VAPID private keys, database passwords, or JWT secrets in this README, source
code, screenshots, tickets, or chat messages.

The Firebase service-account private key shown in the original setup material
must be treated as compromised because it was exposed. Rotate or revoke that
key in Google Cloud / Firebase, issue a replacement, update the deployment
secret, and review access logs. The same rotation review should be applied to
any API or mail credentials exposed alongside it.

Use environment variables or a managed secret store in deployments. Restrict
backend/.env permissions, keep it ignored by Git, and never copy its values
into frontend code or browser-visible configuration.

Source map
----------
  Live Ops sweep:       backend/services/vobiLiveFeed.js
  Gemini narration:     backend/services/vobiFeedGemini.js
  Feed API:             backend/routes/vobiFeed.js
  Feed client:          src/api/vobiFeed.ts
  Staff panel:          src/components/VobiLiveOpsPanel.tsx
  Realtime bridge:      src/context/RealtimeContext.tsx
  Socket authentication: backend/realtime/socket.js
  Ticket escalation:    backend/ticketEscalation.js
  Escalation defaults:  backend/ticketEscalationConfig.js

Document status
---------------
This document describes the current implementation and operational behavior.
Update it when the sweep cadence, data sources, retention period, API route,
Socket.IO event, or credential configuration changes.
