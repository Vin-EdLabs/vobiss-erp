import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  Inbox,
  ArrowRight,
  Activity,
  RefreshCw,
  UserCheck,
  TrendingUp,
  Zap,
  Ticket,
  Network,
  FileBarChart,
  Home,
} from 'lucide-react';
import { cxApi } from '@/api';
import { API_URL } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { StatCard as UiStatCard } from '@/components/ui/stat-card';
import { GreetingBanner, OutlinePill } from '@/components/ui/greeting-banner';
import { Button } from '@/components/ui/button';

export type TicketUnitKey = 'noc' | 'ip' | 'tx';

type DashTicket = {
  ticket_id: string;
  title: string;
  status: string;
  priority: string;
  customer_name: string;
  project_name: string;
  assignee_name?: string;
  created_at: string;
  escalation_stage?: string;
  assignee_role?: string;
};

const UNIT_THEME: Record<
  TicketUnitKey,
  {
    label: string;
    queuePath: string;
    detailBase: string;
    projectPath: string;
    accentHover: string;
    spinClass: string;
    linkHover: string;
    iconClass: string;
  }
> = {
  noc: {
    label: 'NOC',
    queuePath: '/staff/noc/tickets',
    detailBase: '/staff/noc/tickets',
    projectPath: '/project-request/noc',
    accentHover: 'hover:bg-[var(--accent-green-light)]/60',
    spinClass: 'text-[var(--primary)]',
    linkHover: 'text-[var(--primary)] hover:text-[var(--primary-hover)]',
    iconClass: 'text-[var(--primary)]',
  },
  ip: {
    label: 'IP',
    queuePath: '/staff/ip/tickets',
    detailBase: '/staff/ip/tickets',
    projectPath: '/project-request/ip',
    accentHover: 'hover:bg-[var(--accent-green-light)]/60',
    spinClass: 'text-[var(--primary)]',
    linkHover: 'text-[var(--primary)] hover:text-[var(--primary-hover)]',
    iconClass: 'text-[var(--primary)]',
  },
  tx: {
    label: 'TX',
    queuePath: '/staff/field/tickets',
    detailBase: '/staff/field/tickets',
    projectPath: '/project-request/tx',
    accentHover: 'hover:bg-[var(--accent-green-light)]/60',
    spinClass: 'text-[var(--primary)]',
    linkHover: 'text-[var(--primary)] hover:text-[var(--primary-hover)]',
    iconClass: 'text-[var(--primary)]',
  },
};

function filterUnitTickets(tickets: DashTicket[], unit: TicketUnitKey, teamNames: Set<string>) {
  return tickets.filter((t) => {
    const stage = String(t.escalation_stage || '').toLowerCase();
    const role = String(t.assignee_role || '').toLowerCase();
    const assignee = String(t.assignee_name || '');

    if (unit === 'noc') {
      return stage === 'noc' || !assignee || role === 'noc' || role.includes('noc');
    }
    if (unit === 'ip') {
      return stage === 'ip' || role === 'ip' || role.includes('ip') || (assignee && teamNames.has(assignee));
    }
    // TS / field / tx
    return (
      stage === 'tx' ||
      stage === 'ts' ||
      role.includes('field') ||
      role.includes('tx') ||
      role.includes('ts') ||
      (assignee && teamNames.has(assignee))
    );
  });
}

export function UnitTicketDashboard({ unit }: { unit: TicketUnitKey }) {
  const theme = UNIT_THEME[unit];
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<DashTicket[]>([]);
  const [stats, setStats] = useState({
    open: 0,
    inProgress: 0,
    resolved: 0,
    assignedToMe: 0,
    urgent: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('token');
      const [ticketsRes, teamRes] = await Promise.all([
        cxApi.getAllTickets(),
        fetch(`${API_URL}/cx/team-members`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
      ]);

      let teamNames = new Set<string>();
      if (teamRes?.ok) {
        const members = await teamRes.json();
        const list = Array.isArray(members) ? members : members?.data || [];
        const filtered = list.filter((m: any) => {
          const r = String(m.role || '').toLowerCase();
          if (unit === 'ip') return r === 'ip' || r.includes('ip');
          if (unit === 'tx') return r.includes('field') || r.includes('tx') || r.includes('ts');
          return r.includes('noc');
        });
        teamNames = new Set(filtered.map((m: any) => m.fullName || `${m.first_name || ''} ${m.last_name || ''}`.trim()));
      }

      const ticketsArray =
        ticketsRes?.data || ticketsRes?.tickets || (Array.isArray(ticketsRes) ? ticketsRes : []);

      const processed: DashTicket[] = ticketsArray.map((ticket: Record<string, unknown>) => ({
        ticket_id: String(ticket.ticket_id || ticket.id || ''),
        title: String(ticket.title || ticket.subject || 'No Title'),
        status: String(ticket.status || 'NEW'),
        priority: String(ticket.priority || 'NORMAL'),
        customer_name: String(ticket.customer_name || 'Unknown Customer'),
        project_name: String(ticket.site_name || ticket.project_name || 'General'),
        site_name: ticket.site_name ? String(ticket.site_name) : undefined,
        assignee_name: ticket.assignee_name ? String(ticket.assignee_name) : undefined,
        created_at: String(ticket.created_at || new Date().toISOString()),
        escalation_stage: ticket.escalation_stage ? String(ticket.escalation_stage) : undefined,
        assignee_role: ticket.assignee_role ? String(ticket.assignee_role) : undefined,
      }));

      const unitTickets = filterUnitTickets(processed, unit, teamNames);
      setTickets(unitTickets);

      const myName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
      setStats({
        open: unitTickets.filter((t) => ['OPEN', 'NEW'].includes(t.status?.toUpperCase())).length,
        inProgress: unitTickets.filter((t) => t.status?.toUpperCase() === 'IN_PROGRESS').length,
        resolved: unitTickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status?.toUpperCase())).length,
        assignedToMe: unitTickets.filter((t) => t.assignee_name === myName).length,
        urgent: unitTickets.filter((t) =>
          ['URGENT', 'CRITICAL', 'HIGH'].includes(t.priority?.toUpperCase())
        ).length,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDashboardData();
  }, [unit]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <RefreshCw className={`mx-auto mb-4 h-10 w-10 animate-spin ${theme.spinClass}`} />
          <p className="text-sm font-medium text-slate-600">Loading {theme.label} dashboard…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md rounded-[var(--radius-lg)] border border-[var(--danger-light)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow-md)]">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-[var(--danger)]" />
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Something went wrong</h2>
          <p className="mt-2 text-[var(--text-secondary)]">{error}</p>
          <button
            type="button"
            onClick={() => void fetchDashboardData()}
            className="mt-6 rounded-xl bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GreetingBanner
        name={user?.first_name || String(user?.full_name || 'there').split(/\s+/)[0]}
        pills={
          <>
            <OutlinePill icon={Ticket}>
              {tickets.length} in {theme.label} queue
            </OutlinePill>
            <OutlinePill icon={UserCheck}>{stats.assignedToMe} assigned to you</OutlinePill>
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void fetchDashboardData()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" asChild>
              <Link to={theme.projectPath}>
                <Network className="h-4 w-4" />
                Project requests
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <UiStatCard label="Open" value={stats.open} icon={Inbox} accentIndex={0} />
        <UiStatCard label="In progress" value={stats.inProgress} icon={TrendingUp} accentIndex={1} />
        <UiStatCard label="High / Urgent" value={stats.urgent} icon={Zap} accentIndex={2} />
        <UiStatCard label="Resolved" value={stats.resolved} icon={CheckCircle2} accentIndex={3} />
        <UiStatCard label="Assigned to me" value={stats.assignedToMe} icon={UserCheck} accentIndex={4} />
        <UiStatCard label="Total queue" value={tickets.length} icon={Ticket} accentIndex={0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] lg:col-span-2">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 sm:px-5 sm:py-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{theme.label} ticket queue</h2>
            <Link to={theme.queuePath} className={`inline-flex items-center gap-1 text-sm font-medium ${theme.linkHover}`}>
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Ticket</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.slice(0, 8).map((ticket) => (
                  <tr key={ticket.ticket_id} className={theme.accentHover}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">{ticket.title}</p>
                      <p className="font-mono text-xs text-slate-500">{ticket.ticket_id}</p>
                    </td>
                    <td className="px-4 py-4">
                      <StatusPill status={ticket.status} />
                    </td>
                    <td className="px-4 py-4">
                      <PriorityDot priority={ticket.priority} />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => navigate(`${theme.detailBase}/${ticket.ticket_id}`)}
                        className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--primary-hover)]"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
                {tickets.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-500">
                      No tickets in queue — all clear.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[var(--shadow-md)]">
            <h3 className="text-sm font-semibold text-slate-900">Quick access</h3>
            <ul className="mt-4 space-y-2">
              <QuickLink to={theme.queuePath} icon={Ticket} label={`${theme.label} ticket queue`} iconClass={theme.iconClass} />
              <QuickLink to={theme.projectPath} icon={Network} label={`${theme.label} service requests`} iconClass={theme.iconClass} />
              <QuickLink to="/staff/reports/tickets" icon={FileBarChart} label="Ticket report" iconClass={theme.iconClass} />
              <QuickLink to="/staff/cx/create-ticket" icon={Activity} label="Create ticket" iconClass={theme.iconClass} />
              <QuickLink to="/staff/cx/user-work-history" icon={Home} label="User work history" iconClass={theme.iconClass} />
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
  iconClass,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  iconClass: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm font-medium text-slate-800 transition hover:border-slate-200 hover:bg-slate-50"
      >
        <Icon className={`h-4 w-4 ${iconClass}`} />
        {label}
        <ArrowRight className="ml-auto h-3.5 w-3.5 text-slate-400" />
      </Link>
    </li>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = (status || 'OPEN').toUpperCase();
  let style = 'bg-slate-100 text-slate-700';
  if (s === 'NEW' || s === 'OPEN') style = 'bg-blue-100 text-[var(--primary-hover)]';
  if (s === 'RESOLVED' || s === 'CLOSED') style = 'bg-emerald-100 text-emerald-800';
  if (s === 'IN_PROGRESS') style = 'bg-amber-100 text-amber-900';
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>{s.replace('_', ' ')}</span>;
}

function PriorityDot({ priority }: { priority: string }) {
  const p = (priority || 'NORMAL').toUpperCase();
  const colors: Record<string, string> = {
    URGENT: 'bg-red-500',
    CRITICAL: 'bg-red-600',
    HIGH: 'bg-orange-500',
    MEDIUM: 'bg-amber-400',
    NORMAL: 'bg-[#c4a882]',
    LOW: 'bg-slate-400',
  };
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
      <span className={`h-2 w-2 rounded-full ${colors[p] || colors.NORMAL}`} />
      {p}
    </span>
  );
}
