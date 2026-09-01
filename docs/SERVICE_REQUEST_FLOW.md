# Service Request (360°) — How It Works

One request, one number (SR-XXXX), tracked end to end across every unit until it's done.

## The Flow

```
Sales → Design → Sales → Project → TX → IP → NOC
```

1. **Sales** creates the request (customer, site, notes, optional files) and sends it to Design.
2. **Design** completes the survey + material request, sends it back to Sales.
3. **Sales** reviews and forwards to Project. This is also where **Confirm Design** can be done — this is the moment the request becomes a real SR-XXXX (before that it shows as "Draft").
4. **Project** routes the work to **TX** (or IP directly).
5. **TX** does the transmission/implementation work, sends to IP.
6. **IP** does integration (circuit ID, IP/MAC address, etc.), sends to **NOC**.
7. **NOC** reviews and approves, sending it back to Project for final sign-off.
8. **Project** marks it complete. Done.

Every request lives at exactly one `current_stage` at a time: `sales`, `design`, `project`, `ts` (=TX), `ip`, `noc`, `done`, or `rejected`.

## One Page, Every Unit

Every unit opens the **same URL** — `/project-request/:id` — for a given request. There's no separate page per department. The page shows:

- Whoever's turn it is, right now (the stage stepper).
- The action buttons for **your** unit, only when it's currently your turn.
- Everything from every unit below that — attachments, comments, linked records — always visible to everyone, regardless of stage.

Old bookmarked links like `/project-request/ts/12` still work — they redirect to the new URL automatically.

## Who Can Do What

**Approvals, forwarding, filling in technical fields (circuit ID, IP address, etc.)** — locked to whichever unit currently owns the stage. TX can't approve while it's sitting with IP. This is enforced twice: the button doesn't even show up if it's not your turn, and the server independently re-checks your unit + the request's current stage on every save — so it can't be bypassed by hitting the API directly.

**Comments and file attachments** — open to everyone, any time, regardless of stage. The whole point of one shared page is that every department can leave notes or drop in documents for the others to see, even before or after their own turn.

## Finding a Request / The Report

Sidebar → **Report System → Service Request Report**. Search by customer, site, region, or SR number. Every request shows up here from the moment Sales creates it, through every stage, done or not.

Click **Full Report** on any request (from that list, or from the request's own page) to get a complete, downloadable document: every stage it passed through and how long each took, every comment from every unit, every file, and any linked Transport/IP Circuit records. Print it or download as PDF.

## Linked, Not Stages

**Transport** and **IP Circuit** allocation aren't steps in the stepper — they're linked records attached to the SR (shown in the "Linked References" section). They can happen more than once, or run in parallel with the main flow, so they don't fit one fixed position in the sequence.

## Key Files

| What | Where |
|---|---|
| The shared profile page | `src/pages/production/ProductionDetail.tsx` |
| The stage stepper | `src/components/production/StageIndicator.tsx` |
| Report list + search | `src/pages/staff/reports/ServiceRequestReport.tsx` |
| Full Report / PDF | `src/components/production/ServiceRequestReportPanel.tsx`, `ServiceRequestHistoryPdf.tsx` |
| Sales/Design/Project unit pages | `src/pages/production/{SalesUnitPage,DesignUnitPage,ProjectUnitHub}.tsx` |
| Backend routes | `backend/routes/project.routes.js` |
| Backend stage logic | `backend/db/project.js` |
