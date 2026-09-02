# Vobiss Community Chat — Full Documentation

This is the **complete reference** for **Community Chat** in Vobiss Inventory Hub: team messaging, operational record threads, category activity feeds, system automation, in-chat approvals, mobile layout, bookmarks, and forwarding.

For platform setup (inventory, tickets, auth, deployment), see [README.md](./README.md).

---

## Table of contents

1. [What Community Chat does](#what-community-chat-does)
2. [Who can use it](#who-can-use-it)
3. [Architecture](#high-level-architecture)
4. [Channel types](#channel-types)
5. [Category hubs vs record threads](#category-hubs-vs-record-threads)
6. [Record threads](#record-threads--membership-and-titles)
7. [System messages & in-chat actions](#system-messages-automation)
8. [Record context bar](#record-context-bar)
9. [Opening chat from record pages](#opening-chat-from-a-record-page)
10. [Ticket links in chat](#ticket-links-in-chat)
11. [Permissions](#permissions-summary)
12. [User interface (desktop)](#user-interface-desktop)
13. [Mobile experience](#mobile-experience)
14. [Messaging features](#messaging-features)
15. [Bookmarks & saved messages](#bookmarks--saved-messages)
16. [Message forwarding](#message-forwarding)
17. [Real-time (Socket.IO)](#real-time-events-socketio)
18. [REST API](#rest-api-reference)
19. [Database schema](#database-schema)
20. [Workspace integration](#workspace-integration)
21. [Setup & operations](#setup--operations)
22. [Troubleshooting](#troubleshooting)
23. [File index](#related-files-index)
24. [Mental model](#mental-model-quick-reference)
25. {Assest res=gister added"}

---

## What Community Chat does

Community Chat is the **primary staff communication layer** for Vobiss. It combines:

| Capability | Description |
|------------|-------------|
| **Team messaging** | Slack-style channels, unit groups, DMs, attachments, voice notes, reactions, pins, presence, typing indicators |
| **Operational threads** | Dedicated chat per ticket, material/cash/return request, or service request — linked in PostgreSQL with auto membership |
| **Category activity feeds** | Four hubs (`#tickets`, `#material-requests`, `#cash-requests`, `#project-requests`) show **system updates only** — not a place to type messages |
| **In-chat actions** | Approve / reject material, cash, and item-return requests from system messages (same rules as request UI) |
| **Record context** | Context bar + optional details panel with live status and link to the record |
| **Bookmarks** | Save messages to a personal **Saved** panel |
| **Forwarding** | Forward user messages to other channels or DMs (not system messages) |

---

## Who can use it

| Rule | Detail |
|------|--------|
| **Access** | All authenticated **staff roles** (`WORKSPACE_ROLES` in `src/config/roles.ts`) |
| **Route** | `/chat` (protected in `src/pages/Index.tsx`) |
| **Navigation** | Sidebar **Community Chat** with unread badge; **My Workspace** shows unread summary |
| **Auth** | JWT on REST (`Authorization: Bearer …`) and on Socket.IO handshake |

Customers and unauthenticated users **cannot** access chat.

---

## High-level architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Chat.tsx · RecordChatUI.tsx · chat-theme.css · chat-mobile.css            │
│  useChatMobileNav.ts · src/api/chat.ts · ticketPaths.ts                    │
└────────────┬───────────────────────────────┬─────────────────────────────┘
             │ REST + multipart               │ Socket.IO
             ▼                                ▼
┌────────────────────────┐          ┌────────────────────────┐
│  /api/chat/*           │          │  chatSocket.js         │
│  routes/chat.js        │          │  rooms: user:,         │
│  routes/chatActions.js │          │        channel:, dm:   │
│  /api/chat/context/*   │          └────────────────────────┘
│  routes/chatContext.js │
└────────────┬───────────┘
             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL: chat_* tables · record_type/record_id on channels            │
│  tickets.chat_channel_id · requests.chat_channel_id ·                     │
│  project_requests.chat_channel_id                                         │
└──────────────────────────────────────────────────────────────────────────┘
             ▲
             │ ensure*Thread · post*SystemMessage
┌────────────┴──────────────────────────────────────────────────────────────┐
│  server.js · ticket.routes.js · cx.routes.js · project.routes.js           │
│  chatSystemMessage.js · chatRecordThreads.js                               │
└───────────────────────────────────────────────────────────────────────────┘
```

| Layer | Location |
|--------|----------|
| Main UI | `src/pages/Chat.tsx` |
| Record UI | `src/components/chat/RecordChatUI.tsx` |
| Open chat from records | `src/components/chat/RecordChatButton.tsx` |
| Forward modal | `src/components/chat/ForwardMessageModal.tsx` |
| Mobile nav hook | `src/hooks/useChatMobileNav.ts` |
| API client | `src/api/chat.ts` |
| Ticket URL helpers | `src/lib/ticketPaths.ts` |
| Theme | `src/styles/chat-theme.css` (dark/light, `localStorage` key `chat-theme`, default **dark**) |
| Mobile layout | `src/styles/chat-mobile.css` |
| Workspace strip | `src/components/workspace/WorkspaceChatSection.tsx` |
| REST core | `backend/routes/chat.js` |
| REST actions | `backend/routes/chatActions.js` |
| REST context | `backend/routes/chatContext.js` |
| Socket | `backend/realtime/chatSocket.js` |
| Init & hubs | `backend/services/chatInit.js`, `chatCategories.js` |
| Threads | `backend/services/chatRecordThreads.js` |
| Automation | `backend/services/chatSystemMessage.js` |
| Helpers / audit | `backend/services/chatHelpers.js`, `chatAudit.js` |

**Mounts:** `/api/chat`, `/api/chat/context` — default API port **3001**.

---

## Channel types

On startup, `initChat()` ensures system channels, **four category hubs**, and adds every active user to `#general`, `#announcements`, and all category hubs.

### Core channels

| Channel | `channel_type` | Who can post | Purpose |
|---------|----------------|--------------|---------|
| `#general` | `general` | All members | Company-wide conversation |
| `#announcements` | `announcements` | Admins only* | Official broadcasts |

\* Channel admin or roles: `superadmin`, `director`, `cto`.

### Category hubs (activity feed — read-only in main panel)

| Hub name | `channel_type` | Record types in sidebar nest |
|----------|----------------|------------------------------|
| `#tickets` | `category` | `ticket` |
| `#material-requests` | `category` | `material_request`, `item_return` |
| `#cash-requests` | `category` | `cash_request` |
| `#project-requests` | `category` | `project_request` |

Defined in `backend/services/chatCategories.js` and `RecordChatUI.tsx` (`CATEGORY_SECTIONS`).

### Manual unit groups

| Type | Created by | Notes |
|------|------------|--------|
| **Unit group** (`unit`, no `record_type`) | Managers via **Create unit group** | Custom teams |

### Record-linked threads (where you chat)

| `channel_type` | `record_type` | Created when |
|----------------|---------------|--------------|
| `unit` | `ticket`, `material_request`, `cash_request`, `item_return`, `project_request` | Record created or first **Start thread** / `POST /threads/...` |

Each thread has unique `(record_type, record_id)` on `chat_channels` and `chat_channel_id` on the source row.

Legacy `department` channels are **archived** at startup and hidden from the UI.

---

## Category hubs vs record threads

This is the intended workflow (updated UX):

```
Sidebar                          Main panel
────────                         ──────────
#tickets  [Activity feed]   →   System messages only (flow)
  ├─ TCK-000022 (thread)    →   Full chat + composer + context bar
  └─ TCK-000031 (thread)    →   Full chat + composer + context bar
```

| Location | What you see | Can you type messages? |
|----------|--------------|------------------------|
| **Hub row** (`Activity feed`) | Brief system updates for that category | **No** — composer hidden; banner explains to pick a thread |
| **Nested thread row** | Full conversation for one ticket/request/project | **Yes** — normal chat |
| **Header thread switcher** (layers icon) | Switch between threads in the **same** category only | Opens other **threads**, not the hub |

Implementation details:

- `isCategoryHubView` in `Chat.tsx` — `channel_type === 'category'`
- `canCompose` is false on category hubs
- Message list on hubs filters to `message_type === 'system'` only
- `CategoryHubFlowBanner` + footer hint in `RecordChatUI.tsx`
- `CategoryChannelRow` — hub uses Activity icon; threads use type badges (TKT/MAT/CSH/PRJ/RET)

Category hubs still receive **short** system posts from automation; **detailed** text, @mentions, and approve/reject buttons go to the **record thread**.

---

## Record threads — membership and titles

`backend/services/chatRecordThreads.js`

### Tickets

| Item | Detail |
|------|--------|
| Trigger | `ensureTicketThread()` on ticket create/update |
| Title | `Ticket #<ticket_id> – <truncated title>` |
| Members | Creator, assignee when assigned, CX/NOC roles, and **director / cto / relationship_officer / noc_manager** (oversight); `syncTicketThreadAssignee()` on claim |
| System | `postTicketSystemMessage()` — premium **thread summary card** on create/routed (customer, project, priority, queue, description snippet); assigned/status/escalation updates stay compact |

**Assignment & escalation** (`backend/ticketEscalation.js`): Times and stage order come from **Configuration → Ticket Escalation Matrix** (`workflow_config.ticket_escalation`). Each stage’s **Minutes until escalate** sets `escalation_due_at`; saving configuration resyncs open unassigned tickets. New tickets start at the **first configured stage**, **unassigned**. Staff assign to stop the timer; if still unassigned when due, the ticket advances through the configured stages (still unassigned). `POST /tickets/:id/accept` only acknowledges the stage; it does not replace assignment.

### Material / cash / item-return requests

| Item | Detail |
|------|--------|
| Trigger | `ensureRequestThread()` on request create (`server.js`) |
| Title | `Mat. Request #n`, `Cash Request #n`, `Item Return #n` |
| Members | Creator, approvers, role-based (finance / warehouse) |
| System | `postRequestSystemMessage()` — may include **Approve/Reject** actions |

### Project requests

| Item | Detail |
|------|--------|
| Trigger | `ensureProjectRequestThread()` on project create |
| Title | `Project #<id> – <site or customer>` |
| Members | Creator, pipeline units (`project`, `ts`, `ip`, `noc`), managers |
| System | `postProjectRequestSystemMessage()` |

**Re-sync** after unit/role fixes:

```bash
cd backend
node scripts/sync-project-users-and-threads.mjs
```

---

## System messages (automation)

`backend/services/chatSystemMessage.js` — `sender_id = NULL`, `message_type = 'system'`, optional **`meta` JSONB**:

| `meta` field | Purpose |
|--------------|---------|
| `relatedType` / `relatedId` | Link to operational record |
| `linkUrl` / `linkLabel` | In-app chip in UI |
| `actions` | Approve / Reject (requests) |
| `actionState` | `approved` / `rejected` after action |

**Dual posting:** (1) category brief in hub, (2) premium **summary card** in record thread (`meta.summaryCard` from `chatRecordSummaries.js`) for tickets, material/cash/returns, and projects — then follow-up messages (e.g. approver mentions) as needed.

**In-chat actions:** `POST /api/chat/actions` — `material_request`, `cash_request`, `item_return`. Socket `chat:action_required` for approver alerts. UI: `RecordSystemMessage`, `ActionRequiredBanner`.

---

## Record context bar

When `record_type` + `record_id` are set on the active channel:

| Record | API |
|--------|-----|
| Ticket | `GET /api/chat/context/ticket/:ticketId` |
| Material | `GET /api/chat/context/material-request/:id` |
| Cash | `GET /api/chat/context/cash-request/:id` |
| Return | `GET /api/chat/context/item-return/:id` |
| Project | `GET /api/chat/context/project-request/:id` |

`RecordContextBar`: badge, title, status, **Open record**, optional **Details** side panel.

---

## Opening chat from a record page

`RecordChatButton` (`recordType`, `recordId`, `chatChannelId`):

| Page | Record type |
|------|-------------|
| `TicketDetailPage.tsx` | `ticket` |
| `RequestDetails.tsx` | `material_request` / `item_return` |
| `CashDetails.tsx` | `cash_request` |
| `ProjectRequestDetailHeader.tsx` | `project_request` |
| `ProductionRequestsTable.tsx` | `project_request` (per row) |

Behavior:

1. If `chat_channel_id` exists → `/chat?channel=<uuid>`
2. Else → `POST /api/chat/threads/:recordType/:recordId` then open

---

## Ticket links in chat

Ticket URLs must use the public ticket number (`TCK-000022`), **never** the internal database row id.

| Helper | File | Rule |
|--------|------|------|
| `staffCxTicketPath()` | `src/lib/ticketPaths.ts` | Only builds `/staff/cx/tickets/TCK-…` when value matches `TCK-\d+` |
| `toFullTicketNumber()` | same | Normalizes display codes |
| Backend workspace/chat | `chatRecordThreads.js`, `chatContext.js` | Links use `ticket_id` column only |

`TicketDetailPage` redirects to canonical `TCK-*` URL after load if needed.

---

## Permissions summary

| Action | Rule |
|--------|------|
| View channel / DM | Member of `channel_members` or `dm_participants` |
| View category hub | All staff (auto-member at init) |
| View record thread | Auto-added when thread created/synced |
| Post in `#general` / record thread / unit group | Members |
| Post in `#announcements` | Channel admin or superadmin / director / cto |
| Post in **category hub** | Blocked in UI (system-only traffic) |
| Create unit group | `canManageUnitGroups()` managers |
| Edit own message | Within **15 minutes** |
| Pin / react / bookmark | Channel/DM members |
| Forward | User messages only; not system messages |
| Approve/reject from chat | Same as request approval API |

---

## User interface (desktop)

Route: **`/chat`**

### Layout

1. **Chat sidebar** — Back to Workspace, search, Channels (`#general`, `#announcements`), **Operations** (category hubs + nested threads), Unit groups, DMs, create group / new DM  
2. **Conversation panel** — Top bar (title, badge, thread switcher, search, pins, members, context, theme, hide main nav)  
3. **Context bar** — Record threads only  
4. **Messages** — Wallpaper, grouped bubbles, system banners, hover actions (reply, react, pin, edit, bookmark, forward)  
5. **Composer** — Hidden on category hubs  
6. **Members / context panels** — Optional right columns  

### Main app navigation

- Vobiss sidebar visible by default on `/chat`
- Header control can hide main nav for more space
- `body.chat-route-active` hides system top header on chat route

### Saved messages

Sidebar entry opens **Saved** panel (`activePanelView === 'saved'`) — all bookmarked messages with jump-to-message.

### Deep links

| URL | Behavior |
|-----|----------|
| `/chat?channel=<uuid>` | Channel by ID (preferred) |
| `/chat?channel=general` | Channel by name |
| `/chat?dm=<uuid>` | DM thread |

---

## Mobile experience

Files: `chat-mobile.css`, `useChatMobileNav.ts`, mobile classes in `Chat.tsx`.

| Behavior | Detail |
|----------|--------|
| **Two screens** | `list` (conversation list) and `thread` (active chat) |
| **Back button** | In thread view → returns to list and clears selection/URL |
| **No auto-open #general** | On mobile, opening `/chat` stays on list until user picks a conversation |
| **Deep links** | `?channel=` / `?dm=` still opens thread via `goToThread()` |
| **Nav drawer** | Menu icon in thread header for workspace-style drawer |
| **Layout** | No horizontal scroll; 16px inputs to avoid iOS zoom; PWA-friendly viewport in `index.html` |

Popstate / `history.pushState` syncs Android back with leaving a thread.

---

## Messaging features

- Markdown-style `**bold**`, `_italic_` in composer  
- **@mentions** — `@[Name](userId)`  
- **Reply**, **edit** (15 min), **reactions**, **pins**  
- **Attachments** — up to 5 files, 50 MB, images/video/audio/PDF → `backend/uploads/chat/`  
- **Voice** — `ChatVoiceRecorder` + `ChatAudioPlayer`  
- **Unread** — counts only **record threads**, `#general`, `#announcements`, and **DMs**; category hubs (`#project-requests`, etc.) do not increment badges (`chatUnreadPolicy.js`)  
- **Search** — sidebar filter + in-conversation API search  

---

## Bookmarks & saved messages

| API | Purpose |
|-----|---------|
| `GET /api/chat/bookmarks` | List saved messages |
| `POST /api/chat/bookmarks` | `{ message_id }` |
| `DELETE /api/chat/bookmarks/:id` | Remove |
| `GET /api/chat/bookmarks/check?message_ids=` | Batch check |

Migration: `backend/migrations/chat_bookmarks.sql`

UI: bookmark action on messages; **Saved** view in chat sidebar; toast on save.

---

## Message forwarding

| API | Purpose |
|-----|---------|
| `POST /api/chat/messages/:messageId/forward` | `{ destinations: [{ channelId \| dmId }] }` — max 10 |

- Creates new messages with `forwarded_from` pointing to source  
- UI shows forwarded preview via `forwardedOrigin`  
- **System messages cannot be forwarded**  
- Migration: `backend/migrations/chat_forward.sql`  
- Component: `ForwardMessageModal.tsx`  

---

## Real-time events (Socket.IO)

Rooms: `user:{id}`, `channel:{id}`, `dm:{id}`

| Event | Purpose |
|-------|---------|
| `new_message` | New message in room |
| `message_edit` | Edited message (incl. system meta) |
| `reaction_update` | Reaction counts |
| `pin_update` | Pins changed |
| `unread_increment` | Badge refresh |
| `chat:typing` | Typing indicator |
| `presence_update` | Online users |
| `chat:action_required` | Approver alert |
| `chat:group_created` / `chat:added_to_group` / `chat:removed_from_group` | Refresh channel list |
| `chat:join_channel` / `chat:join_dm` | Client joins room |

---

## REST API reference

Base: **`/api/chat`** (JWT required).

### Core messaging

| Method | Path | Description |
|--------|------|-------------|
| GET | `/unread-total` | Total unread |
| GET | `/channels` | User channels (`record_type`, `record_id`, unread) |
| GET | `/channels/:id/messages` | Paginated (`?before=&limit=`) |
| POST | `/channels/:id/messages` | Send (multipart) |
| POST | `/channels/:id/read` | Mark read |
| GET | `/channels/:id/members` | Members |
| GET | `/channels/:id/pins` | Pins |
| GET | `/channels/:id/search?q=` | Search |
| POST | `/channels/:id/messages/:msgId/react` | Reaction |
| GET/POST | `/dms` … | DM list, open, messages, react, pins, search |
| PATCH | `/messages/:messageId` | Edit |
| POST/DELETE | `/messages/:messageId/pin` | Pin / unpin |
| POST | `/groups` | Create unit group |
| POST/DELETE | `/channels/:id/members` | Add/remove members |
| GET | `/users` | Staff directory |

### Bookmarks & forward

| Method | Path |
|--------|------|
| GET | `/bookmarks` |
| POST | `/bookmarks` |
| DELETE | `/bookmarks/:id` |
| GET | `/bookmarks/check?message_ids=` |
| POST | `/messages/:messageId/forward` |

### Record integration

| Method | Path |
|--------|------|
| POST | `/threads/:recordType/:recordId` | Ensure thread → `{ channelId }` |
| POST | `/actions` | In-chat approve/reject |

### Record context (`/api/chat/context`)

| GET | Path |
|-----|------|
| `/ticket/:ticketId` |
| `/material-request/:id` |
| `/cash-request/:id` |
| `/item-return/:id` |
| `/project-request/:id` |

---

## Database schema

### Core (`chat_tables.sql`)

`chat_channels`, `channel_members`, `dm_conversations`, `dm_participants`, `chat_messages`, `message_reactions`, `chat_attachments`, `message_mentions`, `message_pins`

### Record integration (`chat_record_integration.sql`)

`chat_channels.record_type`, `record_id`, `chat_messages.meta`, `tickets.chat_channel_id`, `requests.chat_channel_id`, `project_requests.chat_channel_id`

### Extensions

| Migration | Purpose |
|-----------|---------|
| `chat_bookmarks.sql` | Saved messages |
| `chat_forward.sql` | `forwarded_from` on messages |

---

## Workspace integration

**My Workspace** (`/workspace`):

- Stat: unread chat count → `/chat`  
- **Community Chat** strip: preview of unread threads  

Refreshes on `chat:unread-changed` and polling.

---

## Setup & operations

### Backend boot

`initChat()` runs migrations, archives legacy channels, creates hubs, syncs memberships.

```bash
cd backend
node server.js
# or npm run dev
```

### Manual migrations (optional)

```bash
psql -U <user> -d <database> -f backend/migrations/chat_tables.sql
psql -U <user> -d <database> -f backend/migrations/chat_record_integration.sql
psql -U <user> -d <database> -f backend/migrations/chat_bookmarks.sql
psql -U <user> -d <database> -f backend/migrations/chat_forward.sql
```

### Uploads & assets

| Path | Purpose |
|------|---------|
| `backend/uploads/chat/` | Attachments (writable) |
| `public/chat-wallpaper.png` | Message area wallpaper |

### Scripts

| Script | Purpose |
|--------|---------|
| `sync-project-users-and-threads.mjs` | Fix units; re-sync project threads |
| `add-project-units-to-users.mjs` | Add `project` unit to project-role users |
| `seed-chat-demo.mjs` | Demo threads/messages |

### New users

`ensureUserChatMembership()` adds `#general` and `#announcements`. Category hubs on full `initChat()` sync.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Chat 404 / empty | Backend on **3001**; log: `[chat] Synced #general…` |
| Cannot type in `#tickets` hub | **Expected** — open a nested **thread** to chat |
| Hub shows no user messages | **Expected** — hubs show **system** flow only |
| No thread in sidebar | Use **Start thread** on record or `POST /threads/...` |
| Project user missing from thread | Run `sync-project-users-and-threads.mjs`; re-login |
| Ticket link goes to wrong id | Must be `TCK-*`; see `ticketPaths.ts` |
| Approve button 403 | User not approver for stage |
| Mobile back does nothing | Ensure latest `useChatMobileNav` (no auto-thread on mount) |
| Cannot see chat list on phone | Should land on **list** first; pick a thread |
| Real-time stale | Valid JWT on socket; joined `channel:` / `dm:` room |
| Forward fails | Not a system message; max 10 destinations |
| Bookmark missing | `chat_bookmarks` migration applied |

---

## Related files (index)

```
src/pages/Chat.tsx
src/api/chat.ts
src/lib/ticketPaths.ts
src/hooks/useChatMobileNav.ts
src/styles/chat-theme.css
src/styles/chat-mobile.css
public/chat-wallpaper.png

src/components/chat/RecordChatUI.tsx
src/components/chat/RecordChatButton.tsx
src/components/chat/ForwardMessageModal.tsx
src/components/chat/ChatAttachments.tsx
src/components/chat/ChatAudioPlayer.tsx
src/components/chat/ChatVoiceRecorder.tsx
src/components/chat/mobile/MobileChatToasts.tsx
src/components/workspace/WorkspaceChatSection.tsx

src/pages/staff/cx/TicketDetailPage.tsx
src/pages/RequestDetails.tsx
src/pages/finance/CashDetails.tsx
src/components/production/ProjectRequestDetailHeader.tsx
src/components/production/ProductionRequestsTable.tsx

backend/routes/chat.js
backend/routes/chatActions.js
backend/routes/chatContext.js
backend/realtime/chatSocket.js
backend/services/chatInit.js
backend/services/chatCategories.js
backend/services/chatRecordThreads.js
backend/services/chatSystemMessage.js
backend/services/chatHelpers.js
backend/services/chatAudit.js
backend/migrations/chat_tables.sql
backend/migrations/chat_record_integration.sql
backend/migrations/chat_bookmarks.sql
backend/migrations/chat_forward.sql
backend/scripts/sync-project-users-and-threads.mjs
```

---

## Mental model (quick reference)

```
Staff opens /chat
├── #general / #announcements     → chat normally
├── #tickets [Activity feed]      → read-only system flow (no composer)
│     ├── Ticket TCK-… (thread)   → chat + context + approvals
│     └── …
├── #material-requests [Activity]
│     └── Mat. / Return threads   → chat here
├── #cash-requests [Activity]
│     └── Cash Request threads
├── #project-requests [Activity]
│     └── Project #n threads      → pipeline discussion
├── Unit groups                   → manual teams
├── Direct messages               → 1:1
└── Saved                         → bookmarked messages

Record pages → RecordChatButton → /chat?channel=<uuid>
```

Operational records **push** updates into chat; staff **read the flow** in hubs, **discuss** in threads, **act** (approve), and **jump back** to records without leaving workflow.

---

*Last updated to reflect category hub read-only UX, mobile navigation, bookmarks, forwarding, project-request chat buttons, and TCK-only ticket links.*
