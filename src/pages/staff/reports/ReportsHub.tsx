import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Ticket, ChevronRight, DollarSign, BarChart3, Network, Package } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  TICKET_REPORT_ROLES,
  CASH_REPORT_ROLES,
  SERVICE_REQUEST_REPORT_ROLES,
  REPORTS_ROLES,
  getUserRoles,
} from '@/config/roles';

type ReportCard = {
  title: string;
  description: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  roles: string[];
};

const ALL_REPORTS: ReportCard[] = [
  {
    title: 'Ticket Report',
    description:
      'Pending and completed tickets, resolution times, staff activity, and visual analytics.',
    path: '/staff/reports/tickets',
    icon: Ticket,
    accent: 'from-indigo-500 to-violet-600',
    roles: TICKET_REPORT_ROLES,
  },
  {
    title: 'Cash Report',
    description:
      'All cash advance requests with totals, line-item descriptions, quantities, and approval status.',
    path: '/staff/reports/cash',
    icon: DollarSign,
    accent: 'from-amber-500 to-orange-600',
    roles: CASH_REPORT_ROLES,
  },
  {
    title: 'Service Request Report',
    description:
      'Project, TS, IP, and NOC service requests with stage, status, customer, site, and value summaries.',
    path: '/staff/reports/service-requests',
    icon: Network,
    accent: 'from-cyan-500 to-blue-700',
    roles: SERVICE_REQUEST_REPORT_ROLES,
  },
  {
    title: 'Inventory Report',
    description:
      'Inventory movement, issued and returned quantities, source breakdowns, low-stock insight, and item usage trends.',
    path: '/reports',
    icon: Package,
    accent: 'from-emerald-500 to-teal-700',
    roles: REPORTS_ROLES,
  },
];

export default function ReportsHub() {
  const { user } = useAuth();
  const userRoles = useMemo(() => getUserRoles(user), [user]);
  const unit = String(user?.unit || '').trim().toLowerCase();
  const units = [
    unit === 'tx' ? 'ts' : unit,
    ...(Array.isArray(user?.units)
      ? user.units.map((u) => {
          const slug = String(u || '').trim().toLowerCase();
          return slug === 'tx' ? 'ts' : slug;
        })
      : []),
  ].filter(Boolean);
  const position = String(user?.position || '').trim().toLowerCase();
  const isGlobal = userRoles.includes('superadmin') || position === 'director' || userRoles.includes('director') || userRoles.includes('cto');
  const isManagerOrSupervisor = position.includes('manager') || position.includes('supervisor');
  const hasAnyUnit = (...values: string[]) => values.some((value) => units.includes(value));

  const visibleReports = useMemo(
    () =>
      ALL_REPORTS.filter((card) => {
        if (card.roles.some((r) => userRoles.includes(r))) return true;
        if (isGlobal) return true;
        if (card.path === '/staff/reports/tickets') {
          return isManagerOrSupervisor && hasAnyUnit('noc', 'ip', 'ts', 'tx', 'cx');
        }
        if (card.path === '/staff/reports/cash') {
          return isManagerOrSupervisor && hasAnyUnit('finance');
        }
        if (card.path === '/staff/reports/service-requests') {
          return isManagerOrSupervisor && hasAnyUnit('project', 'tx', 'ts', 'ip', 'noc');
        }
        if (card.path === '/reports') {
          return hasAnyUnit('procurement');
        }
        return false;
      }),
    [userRoles, isGlobal, isManagerOrSupervisor, units.join('|')]
  );

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Report System
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Reports</h1>
          <p className="mt-2 text-slate-600">
            Central hub for ticket, inventory, and cash advance reporting.
          </p>
        </div>

        {visibleReports.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-[var(--shadow-md)]">
            No reports are available for your role. Contact an administrator if you need access.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleReports.map((card) => (
              <Link
                key={card.path}
                to={card.path}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-[var(--shadow-md)] transition hover:border-indigo-200 hover:shadow-[var(--shadow-md)]"
              >
                <div
                  className={`mb-4 inline-flex rounded-xl bg-gradient-to-br ${card.accent} p-3 text-white shadow`}
                >
                  <card.icon className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">{card.title}</h2>
                <p className="mt-2 text-sm text-slate-600">{card.description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 transition-all group-hover:gap-2">
                  Open report
                  <ChevronRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-[var(--shadow-md)]">
          <div className="flex items-start gap-3">
            <BarChart3 className="mt-0.5 h-5 w-5 text-indigo-500" />
            <div className="text-sm text-slate-600">
              <p className="font-medium text-slate-800">Tip</p>
              <p className="mt-1">
                Asset reports remain under <strong>Assets Manager → Reports</strong> in the sidebar
                when your role includes asset management.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
