# Vobiss Inventory Hub

Vobiss Inventory Hub is a full-stack operations platform for running Vobiss internal work: inventory, material and cash approvals, service request routing, customer support tickets, field activities, asset tracking, reporting, team chat, and Vobi work assistance.

The system is designed as one operational workspace. Staff can request materials or cash, approve work, issue stock, manage tickets, track projects, chat inside record threads, receive notifications, and use dashboards to see what needs attention.

## Production Readiness

The application is feature-complete enough for a controlled production rollout or pilot, provided the deployment checklist below is completed. Recent frontend production builds pass successfully with only existing bundle-size/Tailwind warnings.

Before final live use, confirm:

- `backend/.env` contains production database, JWT, email, push, and developer protection values.
- PostgreSQL is backed up regularly and restore has been tested.
- The app is served over HTTPS with a stable domain.
- Admin, Director/CTO, Finance, Approver, Issuer, NOC, IP, TX, Project Unit, Customer, and Superadmin roles have been tested with real accounts.
- Email, push notifications, and inbound ticket email are configured or intentionally disabled.
- Default/admin passwords are changed and unused accounts are removed or disabled.
- A short user acceptance test has been completed for inventory issue, cash approval, material approval, ticket escalation, service request routing, chat, and Vobi.

## What The System Does

Vobiss Inventory Hub brings daily operations into one place:

- **Inventory management**: manage items, categories, vendors, stock levels, low-stock alerts, item serials, and issue history.
- **Material requests**: staff request items, assigned approvers review, issuers release approved stock, and completed/rejected requests stay in history.
- **Cash requests**: staff request advances, supervisors/directors approve based on workflow rules, Finance releases funds, and recipients can mark cash as received.
- **Service requests**: Project Unit creates work, TX reviews, IP submits integration details, NOC reviews, and Project Unit signs off completion.
- **Ticketing and escalation**: customer and staff tickets move through NOC, NOC Manager, Relationship Officer, Director/CTO, and support queues.
- **Customer portal**: customers can log in, create support tickets, and track their own tickets.
- **Field activities**: field engineers record activities and directors can view field activity maps.
- **Assets management**: track company assets, categories, locations, vendors, assignments, maintenance, and reports.
- **Reports and executive dashboards**: inventory, cash, ticket, field, and CTO/Director dashboards show live operational status.
- **Notifications**: in-app, realtime, and optional push notifications alert staff when work needs attention.
- **Audit logs**: sensitive actions such as login, approval, inventory, and admin changes are recorded.

## Community Chat

Community Chat is the staff communication layer inside Vobiss. It gives teams Slack-style messaging plus record-specific conversations.

Core chat capabilities:

- **Company and unit communication** through general channels, announcements, unit groups, and direct messages.
- **Record threads** for tickets, material requests, cash requests, item returns, and service requests.
- **Category activity hubs** for tickets, material requests, cash requests, and service requests.
- **System messages** when records are created, approved, rejected, escalated, completed, or updated.
- **In-chat approval actions** for supported request workflows.
- **Attachments, voice notes, reactions, mentions, pins, bookmarks, forwarding, and unread badges**.
- **Context panels** so users can jump from chat to the actual ticket/request/project.
- **Mobile-friendly chat navigation** for staff using phones.

For the full chat guide, including architecture, API routes, database tables, mobile UX, and troubleshooting, see [Community Chat Documentation](./CHAT.md).

## Vobi Work Assistant

Vobi is the built-in work assistant for staff. It helps users understand what needs attention without manually checking every module.

Vobi can:

- Show pending approvals, assigned tickets, overdue items, mentions, and recent work.
- Provide daily or since-last-login summaries.
- Summarize active chat threads and record conversations.
- Open a personal Vobi chat thread inside Community Chat.
- Answer command-style prompts such as approvals, mentions, tickets, daily summary, and work digest.
- Generate operational report summaries from available system data.

Vobi is available through the floating assistant panel and inside Vobiss Workspace. It uses authenticated backend routes under `/api/vobi` and reads from workspace, chat, ticket, request, audit, and project data.

## Main Roles

- **User**: normal staff access. Actual authority comes from the assigned unit and position.
- **Admin**: system management within scope, including staff management and operational monitoring.
- **Superadmin**: full system access, including settings, users, configuration, project units, and audit visibility.

## Superadmin Sidebar

The Superadmin sidebar is arranged in this order:

- **My Workspace**
- **Vobiss Workspace**
- **Service Requests**
  - Project Unit
  - TX — Transmission
  - IP
  - NOC
- **Inventory**
  - Dashboard
  - Items
  - Categories
  - Low Stock Alerts
  - Request History
  - Material Requests
  - Item Returns
  - Issue Item
- **Approve Request**
  - Cash Approvals
  - Material Approvals
- **Reports**
- **Vobi Assistant**
- **Cash Request**
- **Finance Approvals**
- **Assets Manager**
  - All Assets
  - Add New Asset
  - Categories
  - Locations
  - Assignments
  - Maintenance
  - Vendors
  - Reports
- **Field Activities**
  - Dashboard
  - Map View
  - All Activities
  - Add Activity
- **CX System**
  - CX Dashboard
  - Projects & Sites
  - Customer Organizations
  - Master Ticket Queue
  - Create Staff Ticket
  - Ticket Escalation
  - Assign Support
  - User Work History
  - Ticket Search
- **Report System**
- **NOC Ticketing**
  - Dashboard
  - NOC Ticket Queue
  - Create Ticket
  - NOC Escalation
- **IP Ticketing**
  - IP Ticket Queue
  - IP Escalation
- **TX Ticketing**
  - TX Ticket Queue
  - TX Escalation
- **Customer Portal**
  - Dashboard
  - Create Ticket
- **System Guide**
- **System Messages**
- **Audit Logs**
- **Users**
- **Configuration**
- **Service Request Units**
- **Settings**
- **Profile & Security**

## Sidebar Visibility Rule

- **Superadmin** sees the full sidebar without filtering.
- **Admin** sees broad operational modules, reports, users, settings, and audit logs, but not structural controls such as configuration and service request unit setup.
- **Director / global position** users see all unit modules, approvals, reports, and global operational views.
- **User** accounts see only their workspace, their unit modules, their requests, their tickets, and profile access.

## Tech Stack

### Frontend

- React 18 + TypeScript
- Vite
- React Router
- TanStack Query
- Tailwind CSS + Radix UI components
- Socket.IO client
- Chart.js, Recharts, Leaflet, PDF/export tooling

### Backend

- Node.js with ES modules
- Express
- PostgreSQL with `pg`
- JWT authentication
- Socket.IO server
- Multer uploads
- SMTP outbound email and IMAP inbound email
- Web Push and optional Firebase Cloud Messaging

## Architecture Notes

- `backend/server.js` is the main backend entrypoint.
- The backend mounts API groups under `/api/*` and can serve the built frontend from `dist/`.
- `/api/project-request` is the primary project workflow endpoint.
- `/api/production` is kept as a deprecated alias to project routes.
- `/api/chat` powers Community Chat.
- `/api/vobi` powers Vobi overview, actions, summaries, personal digest, thread summary, and commands.
- Staff and customer flows are separated at the routing layer (`/login` vs `/customer/*`).
- Access control uses `role`, `main_role`, `roles[]`, and `units[]`.
- Realtime updates use Socket.IO rooms for users, channels, DMs, and operational events.

## Repository Structure

- `src/` - frontend app, pages, contexts, reusable UI, and API clients
- `src/components/chat/` - record chat, chat actions, forwarding, and chat UI components
- `src/components/vobi/` - Vobi panel, cards, command bar, and chat view
- `src/pages/` - role dashboards, inventory, approvals, reports, chat, and staff pages
- `src/pages/customer/` - customer portal pages
- `backend/` - Express API, database access, services, middleware, and route modules
- `backend/routes/` - domain route groups for chat, Vobi, CX, reports, customer, field, assets, project, and more
- `backend/services/` - chat automation, Vobi service, email, reports, and operational helpers
- `backend/realtime/` - Socket.IO attachment and event handling
- `backend/push/` - Web Push and Firebase push delivery modules
- `scripts/` - helper scripts for assets and maintenance
- `dist/` - built frontend output served by backend in deployment mode

## Environment Configuration

Create and maintain your backend environment file at:

- `backend/.env`

### Database and auth

- `PG_HOST`
- `PG_PORT`
- `PG_DATABASE`
- `PG_USER`
- `PG_PASSWORD`
- `JWT_SECRET`
- `PORT` (default backend port is `3001`)
- `DEVELOPER_CODE` (for protected backup/restore/wipe operations)

### Email and messaging

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `FROM_NAME`
- `FROM_EMAIL`
- `IMAP_USER`
- `IMAP_PASS`
- `IMAP_HOST`
- `IMAP_PORT`

### Push notifications

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `FIREBASE_SERVICE_ACCOUNT_JSON` (optional, enables server-side FCM)
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

### Frontend Vite variables

- `VITE_API_URL`
- `VITE_DEV_PROXY_TARGET`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_VAPID_KEY`

## Local Development (Windows)

Install dependencies in both root and backend:

```powershell
cd "d:\vobiss store\vobiss-inventory-hub"
npm install
cd "d:\vobiss store\vobiss-inventory-hub\backend"
npm install
```

Run the backend:

```powershell
cd "d:\vobiss store\vobiss-inventory-hub\backend"
node server.js
```

Run the frontend:

```powershell
cd "d:\vobiss store\vobiss-inventory-hub"
npm run dev
```

Default local URLs (from `.env.development` / `backend/.env` — no code changes needed):

- Frontend: `CLIENT_URL` (local default is Vite on port 3000)
- Backend API: `VITE_API_URL` (local default is port 3001)

Production URLs are set in `.env.production` and `backend/.env.production`. Run `npm run build` for the frontend and start the backend with `NODE_ENV=production`.

## Build And Serve Via Backend

For a single-process deployment style where backend serves the built frontend:

```powershell
cd "d:\vobiss store\vobiss-inventory-hub"
npm run build
cd "d:\vobiss store\vobiss-inventory-hub\backend"
node server.js
```

**Do this once per code change, not on every restart.** `npm install` and `npm run build` together can take several minutes — that cost should only be paid when the code actually changed, never on a routine reboot or restart. Use the two scripts at the repo root to keep that split explicit:

- `.\deploy.ps1` — installs dependencies (frontend + backend) and rebuilds `dist/`. Run this after every `git pull` / code change, and once on a brand-new machine. Slow, by design.
- `.\start.ps1` — starts the backend, which serves the already-built `dist/` and the API. Run this for every routine start/restart/reboot. Fast (seconds) — it does no install or build, and fails fast with a clear message if `deploy.ps1` was never run.

If the office server is rebuilding on every start, that's the reason first-time page loads feel slow — it's rebuilding the whole frontend before anything is served, not something users are waiting on live. Switching the startup task/shortcut to `start.ps1` (and only running `deploy.ps1` after deploying new code) removes that wait entirely.

## Operational Caveats

- Backend startup initializes database structures and background services.
- Inbound email processing starts automatically if IMAP variables are configured.
- Auto-escalation processing runs on an interval for ticket workflows.
- Push delivery gracefully degrades if Web Push or FCM config is missing.
- Some backend startup migrations are intentionally defensive; review startup logs after deployment.
- Large frontend chunks may produce Vite bundle-size warnings; this does not block builds but should be monitored as the app grows.

## Scripts

From repository root:

- `npm run dev` - start frontend dev server
- `npm run build` - production frontend build
- `npm run preview` - preview built frontend
- `npm run lint` - run lint checks

From `backend/`:

- `node server.js` - start the backend API, realtime server, background services, and static frontend serving when `dist/` exists