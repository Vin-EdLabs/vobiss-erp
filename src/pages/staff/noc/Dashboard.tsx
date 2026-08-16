// src/pages/staff/noc/Dashboard.tsx
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
} from 'lucide-react';
import { cxApi } from '../../../api';
import { useAuth } from '../../../context/AuthContext';
import { StatCard as UiStatCard } from '@/components/ui/stat-card';
import { GreetingBanner, OutlinePill } from '@/components/ui/greeting-banner';
import { Button } from '@/components/ui/button';

interface Ticket {
  ticket_id: string;
  title: string;
  status: string;
  priority: string;
  customer_name: string;
  project_name: string;
  assignee_name?: string;
  created_at: string;
}

const NOCDashboard: React.FC = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState({
    open: 0,
    inProgress: 0,
    escalated: 0,
    resolved: 0,
    assignedToMe: 0,
    urgent: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const ticketsRes = await cxApi.getAllTickets();
      const ticketsArray = ticketsRes?.data || ticketsRes?.tickets || (Array.isArray(ticketsRes) ? ticketsRes : []);

      const processedTickets = ticketsArray.map((ticket: Record<string, unknown>) => ({
        ticket_id: String(ticket.ticket_id || ticket.id || ''),
        title: String(ticket.title || ticket.subject || 'No Title'),
        status: String(ticket.status || 'NEW'),
        priority: String(ticket.priority || 'NORMAL'),
        customer_name: String(ticket.customer_name || 'Unknown Customer'),
        project_name: String(ticket.project_name || 'General'),
        assignee_name: ticket.assignee_name ? String(ticket.assignee_name) : undefined,
        created_at: String(ticket.created_at || new Date().toISOString()),
        escalation_stage: ticket.escalation_stage,
        assignee_role: ticket.assignee_role,
      }));

      const nocTickets = processedTickets.filter((t: Record<string, unknown>) => {
        const stage = String(t.escalation_stage || 'noc').toLowerCase();
        const assigneeRole = String(t.assignee_role || '').toLowerCase();
        return (
          stage === 'noc' ||
          !t.assignee_name ||
          assigneeRole === 'noc' ||
          assigneeRole.includes('noc')
        );
      }) as Ticket[];

      setTickets(nocTickets);

      const open = nocTickets.filter((t) => ['OPEN', 'NEW'].includes(t.status?.toUpperCase())).length;
      const inProgress = nocTickets.filter((t) => t.status?.toUpperCase() === 'IN_PROGRESS').length;
      const resolved = nocTickets.filter((t) =>
        ['RESOLVED', 'CLOSED'].includes(t.status?.toUpperCase())
      ).length;
      const assignedToMe = nocTickets.filter((t) => {
        const myName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
        return t.assignee_name === myName;
      }).length;
      const urgent = nocTickets.filter((t) => t.priority?.toUpperCase() === 'URGENT').length;

      setStats({ open, inProgress, escalated: 0, resolved, assignedToMe, urgent });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDashboardData();
  }, []);

  const handleViewTicket = (ticketId: string) => {
    navigate(`/staff/noc/tickets`);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openTicket', { detail: { ticketId } }));
    }, 100);
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-4 h-10 w-10 animate-spin text-amber-600" />
          <p className="text-sm font-medium text-slate-600">Loading NOC dashboard…</p>
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
            className="mt-6 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
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
            <OutlinePill icon={Ticket}>{tickets.length} in queue</OutlinePill>
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
              <Link to="/project-request/noc">
                <Network className="h-4 w-4" />
                Project requests
              </Link>
            </Button>
          </>
        }
      />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Open" value={stats.open} icon={Inbox} accentIndex={0} />
          <StatCard label="In progress" value={stats.inProgress} icon={TrendingUp} accentIndex={1} />
          <StatCard label="Urgent" value={stats.urgent} icon={Zap} accentIndex={2} />
          <StatCard label="Resolved" value={stats.resolved} icon={CheckCircle2} accentIndex={3} />
          <StatCard label="Assigned to me" value={stats.assignedToMe} icon={UserCheck} accentIndex={4} />
          <StatCard label="Total queue" value={tickets.length} icon={Ticket} accentIndex={0} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Queue */}
          <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] lg:col-span-2">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 sm:px-5 sm:py-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Ticket queue</h2>
              <Link
                to="/staff/noc/tickets"
                className="inline-flex items-center gap-1 text-sm font-medium text-amber-800 hover:text-amber-950"
              >
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
                    <tr key={ticket.ticket_id} className="hover:bg-amber-50/40">
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
                          onClick={() => handleViewTicket(ticket.ticket_id)}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
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

          {/* Quick links */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[var(--shadow-md)]">
              <h3 className="text-sm font-semibold text-slate-900">Quick access</h3>
              <ul className="mt-4 space-y-2">
                <QuickLink to="/staff/noc/tickets" icon={Ticket} label="NOC ticket queue" />
                <QuickLink to="/project-request/noc" icon={Network} label="NOC service requests" />
                <QuickLink to="/staff/reports/tickets" icon={FileBarChart} label="Ticket report" />
                <QuickLink to="/staff/cx/create-ticket" icon={Activity} label="Create ticket" />
              </ul>
            </div>
          </aside>
        </div>
    </div>
  );
};

function StatCard({
  label,
  value,
  icon,
  accentIndex = 0,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accentIndex?: number;
}) {
  return <UiStatCard label={label} value={value} icon={icon} accentIndex={accentIndex} />;
}

function QuickLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm font-medium text-slate-800 transition hover:border-amber-200 hover:bg-amber-50"
      >
        <Icon className="h-4 w-4 text-amber-700" />
        {label}
        <ArrowRight className="ml-auto h-3.5 w-3.5 text-slate-400" />
      </Link>
    </li>
  );
}

const StatusPill = ({ status }: { status: string }) => {
  const s = (status || 'OPEN').toUpperCase();
  let style = 'bg-slate-100 text-slate-700';
  if (s === 'NEW' || s === 'OPEN') style = 'bg-blue-100 text-blue-800';
  if (s === 'RESOLVED' || s === 'CLOSED') style = 'bg-emerald-100 text-emerald-800';
  if (s === 'IN_PROGRESS') style = 'bg-amber-100 text-amber-900';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {s.replace('_', ' ')}
    </span>
  );
};

const PriorityDot = ({ priority }: { priority: string }) => {
  const p = (priority || 'NORMAL').toUpperCase();
  const colors: Record<string, string> = {
    URGENT: 'bg-red-500',
    HIGH: 'bg-orange-500',
    NORMAL: 'bg-blue-500',
    LOW: 'bg-slate-400',
  };
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
      <span className={`h-2 w-2 rounded-full ${colors[p] || colors.NORMAL}`} />
      {p}
    </span>
  );
};

export default NOCDashboard;
