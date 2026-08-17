// System Guide — Vobiss Erp (updated May 2026)
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  ChevronDown,
  ChevronUp,
  Hash,
  Lock,
  LayoutDashboard,
  Users,
  Package,
  FileText,
  CheckCircle,
  ArrowUpRight,
  RotateCcw,
  AlertTriangle,
  BarChart3,
  Settings,
  Mail,
  BookOpen,
  HelpCircle,
  MessageSquare,
  Ticket,
  Clock,
  Bell,
  Layers,
  AtSign,
  Sparkles,
  Globe,
  Shield,
  Workflow,
  ExternalLink,
} from 'lucide-react';

function Tip({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'info' | 'warn' | 'success' }) {
  const styles =
    variant === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-950'
      : variant === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
        : 'border-indigo-200 bg-indigo-50 text-indigo-950';
  return <div className={`rounded-lg border p-4 text-sm leading-relaxed ${styles}`}>{children}</div>;
}

function StepList({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

type Section = {
  id: number;
  icon: React.ElementType;
  title: string;
  keywords: string;
  content: React.ReactNode;
};

const sections: Section[] = [
  {
    id: 1,
    icon: Lock,
    title: 'Getting started',
    keywords: 'login password workspace session sign in',
    content: (
      <>
        <StepList
          items={[
            'Open the staff login page and sign in with your username and password.',
            'After login you land on My Workspace — your home for quick links, notifications, and chat activity.',
            'Your session stays active for about 13 hours of inactivity before you need to sign in again.',
            'Use the sidebar to reach your role-specific menus; only items you are allowed to see will appear.',
          ]}
        />
        <div className="mt-4">
          <Tip>
            <strong>Install the app (optional):</strong> Use your browser’s install prompt to add Vobiss to
            your desktop or phone home screen for a faster, app-like experience.
          </Tip>
        </div>
      </>
    ),
  },
  {
    id: 2,
    icon: Users,
    title: 'Roles & access',
    keywords: 'noc cx director approver finance superadmin permissions',
    content: (
      <>
        <p className="mb-3 text-sm text-slate-600">Each role sees a tailored sidebar and workspace. Common roles:</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['Requester / Field', 'Submit material, cash, and return requests'],
            ['Approver / Finance', 'Approve or reject requests; finance steps on cash'],
            ['Issuer / Stock admin', 'Issue stock, manage inventory, process returns'],
            ['CX / NOC', 'Customer tickets, NOC queues, ticket chat threads'],
            ['NOC Manager / R.O', 'Escalation queues when tickets are unassigned too long'],
            ['Director / CTO', 'Executive dashboard, global search, all tickets, Community Chat'],
            ['Superadmin', 'Users, Configuration, system messages, backups'],
          ].map(([role, desc]) => (
            <div key={role} className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-[var(--shadow-md)]">
              <p className="font-semibold text-slate-900">{role}</p>
              <p className="mt-1 text-slate-600">{desc}</p>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    id: 3,
    icon: MessageSquare,
    title: 'Community Chat',
    keywords: 'chat mention thread ticket material cash project hub',
    content: (
      <>
        <p className="mb-3 text-sm text-slate-600">
          Open <strong>Community Chat</strong> from the sidebar. Staff can message in channels, DMs, and operational
          threads linked to live records.
        </p>
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-md)]">
            <h4 className="flex items-center gap-2 font-semibold text-slate-900">
              <Hash className="h-4 w-4 text-indigo-500" />
              Channels & activity feeds
            </h4>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              <li>
                <strong>#general</strong> and <strong>#announcements</strong> — company-wide (admins post in
                announcements).
              </li>
              <li>
                <strong>#tickets</strong>, <strong>#material-requests</strong>, <strong>#cash-requests</strong>,{' '}
                <strong>#project-requests</strong> — <em>activity feeds only</em> (system updates). You cannot type in
                the hub; open a <strong>thread</strong> from the list on the left to chat.
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <h4 className="flex items-center gap-2 font-semibold text-indigo-900">
              <Sparkles className="h-4 w-4" />
              Thread summaries
            </h4>
            <p className="mt-2 text-sm text-slate-700">
              When a ticket, request, or project thread is created, Vobiss posts a <strong>premium summary card</strong>{' '}
              at the top (customer, amounts, items, priority, status, and more). Use <strong>Open record</strong> on the
              card to jump to the live form.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-md)]">
            <h4 className="flex items-center gap-2 font-semibold text-slate-900">
              <AtSign className="h-4 w-4 text-blue-500" />
              Mentions & alerts
            </h4>
            <StepList
              items={[
                'Type @ in the composer to mention a teammate.',
                'They receive an in-app notification (bell icon), a toast, and push alert if enabled.',
                'The bell badge includes mentions plus unread chat.',
                'Click Enable alerts in the header once per device to allow desktop/phone push.',
              ]}
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-md)]">
            <h4 className="flex items-center gap-2 font-semibold text-slate-900">
              <Layers className="h-4 w-4" />
              Open chat from a record
            </h4>
            <p className="mt-2 text-sm text-slate-700">
              On ticket details, request details, cash details, or project headers use <strong>Open chat</strong> or{' '}
              <strong>Start thread</strong>. Ticket links always use the public number (e.g.{' '}
              <code className="rounded bg-slate-100 px-1">TCK-000022</code>), never the internal database id.
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm">
          <Link to="/chat" className="font-medium text-indigo-600 hover:text-indigo-800">
            Open Community Chat →
          </Link>
          {' · '}
          <span className="text-slate-500">Technical reference: CHAT.md in the project docs</span>
        </p>
      </>
    ),
  },
  {
    id: 4,
    icon: Ticket,
    title: 'Support tickets & escalation',
    keywords: 'ticket noc escalate director assign TCK unassigned SLA',
    content: (
      <>
        <Tip variant="success">
          <strong>New flow:</strong> Tickets are created <strong>unassigned</strong>. NOC (or the current queue) must{' '}
          <strong>Assign to me</strong> or assign a teammate. Escalation timers come from{' '}
          <strong>Configuration → Ticket Escalation Matrix</strong>.
        </Tip>
        <h4 className="mt-4 font-semibold text-slate-900">Typical path</h4>
        <StepList
          items={[
            'Ticket is created (portal, email, or staff) → routed to NOC, unassigned, chat thread + summary card created.',
            'NOC staff work the NOC queue; use Assign to me to take ownership (stops the SLA timer for that stage).',
            'If still unassigned when time runs out, ticket auto-escalates: NOC Manager → Relationship Officer → Director.',
            'At each stage the ticket stays unassigned until someone assigns; chat and timeline update on assign and escalate.',
            'Accept on a queue only acknowledges the stage — it does not replace assigning an owner.',
          ]}
        />
        <h4 className="mt-4 font-semibold text-slate-900">Queues by role</h4>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>
            <strong>NOC</strong> — tickets at stage <code className="rounded bg-slate-100 px-1">noc</code>
          </li>
          <li>
            <strong>NOC Manager</strong> — Manager Escalations
          </li>
          <li>
            <strong>Relationship Officer</strong> — R.O queue
          </li>
          <li>
            <strong>Director / CTO</strong> — Executive Escalations; can view all tickets, global search, and ticket chat
          </li>
        </ul>
        <p className="mt-3 text-sm text-slate-600">
          Ticket URLs look like <code className="rounded bg-slate-100 px-1">/staff/cx/tickets/TCK-000123</code> (or
          director/NOC paths with the same <code className="rounded bg-slate-100 px-1">TCK-*</code> id).
        </p>
      </>
    ),
  },
  {
    id: 5,
    icon: Workflow,
    title: 'Configuration (Superadmin)',
    keywords: 'settings escalation minutes workflow approval',
    content: (
      <>
        <p className="mb-3 text-sm text-slate-600">
          <strong>Configuration</strong> (superadmin) controls approval rules and ticket escalation times.
        </p>
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <h4 className="flex items-center gap-2 font-semibold text-violet-900">
            <Clock className="h-4 w-4" />
            Ticket Escalation Matrix
          </h4>
          <StepList
            items={[
              'Set Minutes until escalate for each stage (NOC → NOC Manager → R.O → Director).',
              '0 on the last stage means hold at Director until someone assigns.',
              'Saving updates SLA timers on open unassigned tickets.',
              'Disable automatic escalation with the checkbox if needed.',
            ]}
          />
        </div>
        <p className="mt-3 text-sm text-slate-600">Material and cash approval thresholds are configured in the same page.</p>
        <Link
          to="/configuration"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          Open Configuration <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </>
    ),
  },
  {
    id: 6,
    icon: FileText,
    title: 'Material & cash requests',
    keywords: 'request approve material cash return form',
    content: (
      <>
        <h4 className="font-semibold text-slate-900">Material request</h4>
        <StepList
          items={[
            'Request Forms → New Request → Material Request.',
            'Add items, project details, approvers; submit.',
            'Approvers see Pending Approvals; approve or reject with reason.',
            'Issuer finalizes from Approved Forms; stock deducts; record in Items Out.',
            'A chat thread opens with a summary card; approvers may get @mentions in chat.',
          ]}
        />
        <h4 className="mt-4 font-semibold text-slate-900">Cash request</h4>
        <StepList
          items={[
            'Submit via cash request form with expenses and purpose.',
            'Supervisor and finance approval steps apply per Configuration.',
            'Large amounts may require director approval.',
            'Chat thread shows amount, purpose, and status in the opening summary.',
          ]}
        />
        <h4 className="mt-4 font-semibold text-slate-900">Item return</h4>
        <p className="text-sm text-slate-700">
          Same pattern as material requests; stock increases after approval and finalize. Chat category:{' '}
          <strong>#material-requests</strong> (includes returns).
        </p>
      </>
    ),
  },
  {
    id: 7,
    icon: ArrowUpRight,
    title: 'Project requests',
    keywords: 'project production site comments remarks ts ip noc',
    content: (
      <>
        <StepList
          items={[
            'Project unit members create requests with site, customer, and technical details.',
            'Service requests move through workflow stages (TS, IP, NOC) per your process.',
            'Each project has a chat thread with a summary (site, customer, stage, capacity, etc.).',
            'Directors and project workflow staff are added to project threads automatically.',
            'Open chat from the project table or detail header.',
          ]}
        />
        <Link
          to="/project-request/project"
          className="mt-3 inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          All Service Requests →
        </Link>
      </>
    ),
  },
  {
    id: 8,
    icon: Package,
    title: 'Inventory & stock',
    keywords: 'items stock low threshold issuer warehouse',
    content: (
      <>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>
            <strong>Inventory → Items</strong> — add/edit items, quantities, low-stock thresholds, receipts.
          </li>
          <li>
            <strong>Low Stock Alerts</strong> — items at or below threshold; email may notify admins.
          </li>
          <li>
            <strong>Items Out</strong> — history of issued stock linked to approved material requests.
          </li>
          <li>
            <strong>Item Returns</strong> — return workflow and stock restoration.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 9,
    icon: BarChart3,
    title: 'Reports',
    keywords: 'report ticket inventory analytics export',
    content: (
      <>
        <p className="mb-3 text-sm text-slate-600">Report System in the sidebar (role-dependent):</p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>
            <strong>Ticket Report</strong> — volumes, status, escalation; links use <code className="rounded bg-slate-100 px-1">TCK-*</code> ids.
          </li>
          <li>
            <strong>Inventory Report</strong> — modern dashboard with date range / All time, charts, tables; View links
            open the related request or return.
          </li>
          <li>
            <strong>Cash / material reports</strong> — operational and finance views.
          </li>
          <li>
            <strong>Audit logs</strong> (superadmin &amp; CTO/Director) — actions with user, IP, and timestamp.
          </li>
        </ul>
        <Link to="/staff/reports" className="mt-3 inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-800">
          Open Report System →
        </Link>
      </>
    ),
  },
  {
    id: 10,
    icon: Shield,
    title: 'Director & executive tools',
    keywords: 'director search escalation executive dashboard',
    content: (
      <>
        <StepList
          items={[
            'CTO / Directors Dashboard — executive overview.',
            'Global Search (sidebar) — tickets by TCK number, requests, and projects.',
            'Search for Tickets — dedicated ticket lookup by number.',
            'Field Engineer Map — live field activity map (directors only in sidebar).',
            'Executive Escalations — director-stage unassigned tickets; Open chat on each row.',
            'Audit Logs — system actions (logins, approvals, tickets, inventory) with user, IP, and timestamp.',
            'All Tickets / User Work History — full visibility.',
            'Community Chat — full access to ticket threads and #tickets activity feed.',
            'Approvals and inventory reports as configured for your role.',
          ]}
        />
        <Link to="/director/search" className="mt-3 inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-800">
          Global Search →
        </Link>
      </>
    ),
  },
  {
    id: 11,
    icon: Globe,
    title: 'Customer portal',
    keywords: 'customer portal ticket PIN submit',
    content: (
      <>
        <p className="text-sm text-slate-600">
          Customers sign in with customer code and PIN to submit and track tickets. Staff-created tickets can still link
          to the same customer record. Portal tickets follow the same NOC routing and escalation rules.
        </p>
      </>
    ),
  },
  {
    id: 12,
    icon: Bell,
    title: 'Notifications & push',
    keywords: 'bell push mention alert enable',
    content: (
      <>
        <StepList
          items={[
            'Bell icon (top right) — personal alerts: @mentions, system broadcasts, and related messages; Open → jumps to chat or record.',
            'Red badge — unread notifications plus unread chat total.',
            'Enable alerts — one-time per browser/device for Web Push (desktop and installed PWA).',
            'Superadmin System Messages — broadcast to all staff (separate from mentions).',
            'Request approvals also trigger realtime toasts and pushes when configured.',
          ]}
        />
        <Tip>
          If push does not work, allow notifications in the browser site settings and confirm VAPID keys are set on the
          server (<code className="rounded bg-slate-100 px-1">VAPID_PUBLIC_KEY</code> /{' '}
          <code className="rounded bg-slate-100 px-1">VAPID_PRIVATE_KEY</code> in backend .env).
        </Tip>
      </>
    ),
  },
  {
    id: 13,
    icon: CheckCircle,
    title: 'Approvals & issuing (summary)',
    keywords: 'approve reject issue finalize pending',
    content: (
      <>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>
            <strong>Pending Approvals</strong> — only requests where you are an assigned approver.
          </li>
          <li>
            Approve / reject with comments; some flows allow approve from chat system messages.
          </li>
          <li>
            <strong>Approved Forms</strong> — issuers finalize quantities; inventory updates automatically.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 14,
    icon: Settings,
    title: 'Admin & system',
    keywords: 'users backup superadmin email smtp',
    content: (
      <>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>
            <strong>Users</strong> — accounts, roles, units, password reset.
          </li>
          <li>
            <strong>Configuration</strong> — workflows and ticket escalation (superadmin).
          </li>
          <li>
            <strong>System Messages</strong> — company-wide broadcasts with push.
          </li>
          <li>
            <strong>Settings / Email</strong> — SMTP and operational email.
          </li>
          <li>
            <strong>Backup / restore</strong> — restricted; follow IT policy.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 15,
    icon: Mail,
    title: 'Email (automatic)',
    keywords: 'email imap smtp ticket inbound',
    content: (
      <>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>Inbound email can create support tickets.</li>
          <li>Ticket and request status changes may email customers or staff per templates.</li>
          <li>Low-stock and credential emails per server configuration.</li>
        </ul>
      </>
    ),
  },
  {
    id: 16,
    icon: BookOpen,
    title: 'Best practices',
    keywords: 'tips quality security logout',
    content: (
      <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
        <li>Assign yourself on tickets you own — do not rely only on Accept.</li>
        <li>Use @mentions in chat for handoffs instead of only email.</li>
        <li>Chat in the <strong>thread</strong>, not the category hub feed.</li>
        <li>Always share ticket links with the <strong>TCK-</strong> number.</li>
        <li>Return stock and close tickets when work is done.</li>
        <li>Enable push alerts on devices you actively monitor.</li>
        <li>Log out on shared computers.</li>
      </ul>
    ),
  },
  {
    id: 17,
    icon: HelpCircle,
    title: 'Need help?',
    keywords: 'support contact admin',
    content: (
      <>
        <p className="mb-3 text-sm text-slate-700">Contact your superadmin or IT lead for access issues.</p>
        <ul className="space-y-2 text-sm text-slate-700">
          <li>
            Reopen this guide anytime: sidebar → <strong>System Guide</strong>
          </li>
          <li>
            Chat deep dive: project file <strong>CHAT.md</strong> (linked from README)
          </li>
          <li>
            <strong>My Workspace</strong> — unread chat and notification summary
          </li>
        </ul>
      </>
    ),
  },
];

const SystemGuide = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [openSections, setOpenSections] = useState<Set<number>>(new Set([1, 3, 4]));

  const toggleSection = (id: number) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setOpenSections(new Set(sections.map((s) => s.id)));
  const collapseAll = () => setOpenSections(new Set());

  const filteredSections = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter(
      (s) => s.title.toLowerCase().includes(q) || s.keywords.toLowerCase().includes(q)
    );
  }, [searchTerm]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Documentation</p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Vobiss System Guide</h1>
              <p className="mt-1 text-sm text-slate-600">Inventory · Tickets · Chat · Escalation · May 2026</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  placeholder="Search topics…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={expandAll}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Expand all
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Collapse
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          {[
            { icon: MessageSquare, label: 'Community Chat', path: '/chat', color: 'text-indigo-600' },
            { icon: Ticket, label: 'CX Tickets', path: '/staff/cx/tickets', color: 'text-blue-600' },
            { icon: LayoutDashboard, label: 'My Workspace', path: '/workspace', color: 'text-emerald-600' },
          ].map(({ icon: Icon, label, path, color }) => (
            <Link
              key={path}
              to={path}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-md)] transition hover:border-indigo-200 hover:shadow-md"
            >
              <Icon className={`h-8 w-8 ${color}`} />
              <span className="text-sm font-semibold text-slate-800">{label}</span>
            </Link>
          ))}
        </div>

        <Tip>
          <strong>What&apos;s new:</strong> Ticket escalation from Configuration, unassigned-until-claimed workflow,
          premium chat thread summaries, @mention push + bell alerts, director global search & chat access, inventory
          report dashboard, and 13-hour sessions.
        </Tip>

        {filteredSections.length === 0 && (
          <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500">
            No sections match your search. Try &quot;chat&quot;, &quot;ticket&quot;, or &quot;escalation&quot;.
          </div>
        )}

        <div className="mt-6 space-y-3">
          {filteredSections.map((section) => {
            const Icon = section.icon;
            const open = openSections.has(section.id);
            return (
              <div
                key={section.id}
                className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[var(--shadow-md)] transition hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-slate-50/80"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-base font-semibold text-slate-900 sm:text-lg">
                      {section.title}
                    </span>
                  </div>
                  {open ? (
                    <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
                  )}
                </button>
                {open && (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-5">{section.content}</div>
                )}
              </div>
            );
          })}
        </div>

        {searchTerm && filteredSections.length > 0 && (
          <p className="mt-6 text-right text-xs text-slate-500">
            {filteredSections.length} of {sections.length} sections
          </p>
        )}
      </main>
    </div>
  );
};

export default SystemGuide;
