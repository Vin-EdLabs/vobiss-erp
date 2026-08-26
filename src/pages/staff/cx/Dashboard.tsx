// src/pages/staff/cx/CXDashboard.tsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  CheckCircle2, AlertCircle, Inbox, 
  ArrowRight, Building2, Users, Plus, Activity, RefreshCw, UserCheck 
} from 'lucide-react';
import { cxApi } from '../../../api';
import { API_URL } from '@/lib/api';
import { StatusPill as UiStatusPill } from '@/components/ui/status-pill';
import { StatCard } from '@/components/ui/stat-card';
import { GreetingBanner, OutlinePill } from '@/components/ui/greeting-banner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

interface TeamMember {
  id: number;
  fullName: string;
  role: string;
}

const CXDashboard: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [stats, setStats] = useState({ active: 0, urgent: 0, completed: 0, assigned: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const firstName = user?.first_name || String(user?.full_name || 'there').split(/\s+/)[0];

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [projectsRes, ticketsRes, teamRes] = await Promise.all([
        cxApi.getProjects(),
        cxApi.getAllTickets(),
        fetch(`${API_URL}/cx/team-members`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
      ]);

      setProjects(Array.isArray(projectsRes) ? projectsRes : projectsRes?.data || []);

      const ticketsArray = ticketsRes?.data || ticketsRes?.tickets || (Array.isArray(ticketsRes) ? ticketsRes : []);

      const processedTickets = ticketsArray.map((ticket: any) => ({
        ...ticket,
        ticket_id: ticket.ticket_id || '',
        title: ticket.title || ticket.subject || 'No Title',
        status: ticket.status || 'NEW',
        priority: ticket.priority || 'NORMAL',
        customer_name: 
          ticket.customer_name || 
          ticket.customer?.name || 
          ticket.customer?.full_name || 
          'Unknown Customer',
        customer_id: ticket.customer_id || ticket.customer?.id,
        customer_email: 
          ticket.customer_email || 
          ticket.customer?.email || 
          ticket.contact_email || 
          undefined,
        customer_phone: 
          ticket.customer_phone || 
          ticket.customer?.phone || 
          ticket.contact_phone || 
          ticket.phone || 
          undefined,
        project_name: ticket.project_name || ticket.project?.name || 'General',
        project_id: ticket.project_id || ticket.project?.id,
        source: ticket.source || 'portal',
        description: ticket.description || 'No description provided.',
        creator_name: 
          ticket.creator_name || 
          ticket.created_by?.name || 
          ticket.created_by?.full_name || 
          ticket.created_by?.username || 
          (ticket.creator_type === 'staff' ? 'Staff Member' : 'Customer'),
        creator_type: ticket.creator_type || (ticket.created_by?.role ? 'staff' : 'customer'),
        assignee_name: ticket.assignee_name || ticket.assigned_to?.name,
        created_at: ticket.created_at || new Date().toISOString(),
        timeline: ticket.timeline || ticket.replies || [],
      }));

      processedTickets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTickets(processedTickets);

      const active = processedTickets.filter((t: any) => 
        t.status && !['RESOLVED', 'CLOSED'].includes(t.status.toUpperCase())
      ).length;

      const urgent = processedTickets.filter((t: any) => 
        t.priority?.toUpperCase() === 'URGENT'
      ).length;

      const completed = processedTickets.filter((t: any) => 
        t.status?.toUpperCase() === 'RESOLVED'
      ).length;

      const assigned = processedTickets.filter((t: any) => !!t.assignee_name).length;

      setStats({ active, urgent, completed, assigned });

      if (teamRes.ok) {
        const data = await teamRes.json();
        const nocMembers = data.filter((m: any) =>
          ['noc', 'field_engineer', 'field_engineer_admin'].includes(m.role)
        );
        setTeamMembers(nocMembers);
      }
    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
      setError(err.message || 'Failed to load dashboard data');
      setProjects([]);
      setTickets([]);
      setTeamMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleViewTicket = (ticketNumber: string) => {
    if (!ticketNumber || !/^TCK-/i.test(ticketNumber)) return;
    navigate(`/staff/cx/tickets/${encodeURIComponent(ticketNumber.toUpperCase())}`);
  };

  const getAssignedCount = (memberId: number) => {
    return tickets.filter(t => t.assigned_to === memberId || (t.assignee_name && t.assignee_name === teamMembers.find(m => m.id === memberId)?.fullName)).length;
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin h-12 w-12 border-4 border-[var(--primary)] border-t-transparent rounded-full mx-auto"></div>
          <p className="text-slate-500 font-medium">Loading CX Hub...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-10 text-center shadow-[var(--shadow-md)]">
          <AlertCircle className="mx-auto mb-6 h-16 w-16 text-[var(--danger)]" />
          <h2 className="mb-3 text-2xl font-bold text-[var(--text-primary)]">Something went wrong</h2>
          <p className="mb-8 text-[var(--text-secondary)]">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-hover)] transition shadow-lg shadow-[#8b5a2b]/25"
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
        name={firstName}
        pills={
          <>
            <OutlinePill icon={Inbox}>{tickets.length} tickets</OutlinePill>
            <OutlinePill icon={Building2}>{projects.length} projects</OutlinePill>
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void fetchDashboardData()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" asChild>
              <Link to="/staff/cx/projects/new">
                <Plus className="h-4 w-4" />
                New Project
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <BentoStat
          label="Live Requests"
          value={stats.active}
          trend={`${tickets.length ? Math.round((stats.active / tickets.length) * 100) : 0}% active`}
          icon={<Inbox className="h-5 w-5" />}
          accentIndex={0}
        />
        <BentoStat
          label="Urgent Action"
          value={stats.urgent}
          trend={stats.urgent > 0 ? "Requires immediate attention" : "All clear"}
          icon={<AlertCircle className="h-5 w-5" />}
          accentIndex={1}
        />
          <BentoStat
            label="Resolved"
            value={stats.completed}
            trend={`${tickets.length ? Math.round((stats.completed / tickets.length) * 100) : 0}% resolved`}
            icon={<CheckCircle2 className="h-5 w-5" />}
            accentIndex={2}
          />
          <BentoStat
            label="Assigned Tickets"
            value={stats.assigned}
            trend={`${tickets.length ? Math.round((stats.assigned / tickets.length) * 100) : 0}% assigned`}
            icon={<UserCheck className="h-5 w-5" />}
            accentIndex={3}
          />
          <BentoStat
            label="Projects"
            value={projects.length}
            trend={`${tickets.length} total tickets`}
            icon={<Building2 className="h-5 w-5" />}
            accentIndex={4}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="vobiss-table-wrap lg:col-span-2">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Service Queue</h3>
              <Link to="/staff/cx/tickets" className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--primary)]">
                View All <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="vobiss-table w-full min-w-[700px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500 font-semibold bg-slate-50/70">
                    <th className="px-10 py-5">Ticket</th>
                    <th className="px-8 py-5">Status</th>
                    <th className="px-8 py-5">Priority</th>
                    <th className="px-8 py-5">Assigned To</th>
                    <th className="px-8 py-5 text-right pr-12">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tickets.slice(0, 8).map((ticket) => (
                    <tr
                      key={ticket.ticket_id || `row-${ticket.id}`}
                      className="group hover:bg-[var(--accent-green-light)]/40 transition-colors"
                    >
                      <td className="px-10 py-6">
                        <div className="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors text-lg">
                          {ticket.title || ticket.subject || 'Untitled Ticket'}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 font-mono">
                          {ticket.ticket_id || '—'}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <StatusPill status={ticket.status} />
                      </td>
                      <td className="px-8 py-6">
                        <PriorityDot priority={ticket.priority} />
                      </td>
                      <td className="px-8 py-6">
                        <span className="text-sm text-slate-700 font-medium">
                          {ticket.assignee_name || 'Unassigned'}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right pr-12">
                        <button
                          onClick={() => ticket.ticket_id && handleViewTicket(ticket.ticket_id)}
                          className="p-3 bg-slate-100 text-slate-500 rounded-2xl hover:bg-[var(--primary)] hover:text-white transition-all duration-300 hover:scale-110 active:scale-95"
                        >
                          <ArrowRight className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {tickets.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-16 text-center text-slate-500">
                        No tickets found. All clear!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Sidebar – glass + depth */}
          <aside className="space-y-8">
            <div className="bg-gradient-to-br from-[#5c3a1e] to-[#3c2210] rounded-3xl p-10 text-white shadow-2xl shadow-[#3c2210]/30 relative overflow-hidden group">
              <div className="relative z-10">
                <Users className="w-12 h-12 text-[#e8d5bc] mb-6 opacity-90" />
                <h3 className="text-2xl font-bold mb-3">Quick Actions</h3>
                <p className="text-slate-300 mb-8 leading-relaxed">
                  Managing {projects.length} projects • Stay in control
                </p>
                <Link
                  to="/staff/cx/projects"
                  className="block w-full py-4 bg-[var(--primary)] hover:bg-[var(--primary-hover)] rounded-2xl font-bold text-center transition shadow-lg shadow-[#5c3a1e]/30"
                >
                  Go to Projects →
                </Link>
              </div>
              <div className="absolute inset-0 bg-[var(--primary)]/5 group-hover:bg-[var(--primary)]/10 transition-all duration-500"></div>
            </div>

            <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-slate-100 p-8 shadow-[var(--shadow-md)]">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-800">Recent Projects</h3>
                <Building2 className="w-6 h-6 text-slate-400" />
              </div>
              <div className="space-y-5">
                {projects.slice(0, 5).map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center gap-5 p-4 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200 group"
                  >
                    <div className="h-14 w-14 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center font-bold text-slate-600 text-lg shadow-sm group-hover:scale-105 transition">
                      {project.project_name?.slice(0, 2).toUpperCase() || 'PJ'}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800 group-hover:text-blue-700 transition">
                        {project.project_name || 'Project'}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {project.project_code || project.id}
                      </div>
                    </div>
                  </div>
                ))}
                {projects.length === 0 && (
                  <p className="text-slate-500 text-center py-8">No projects yet</p>
                )}
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-slate-100 p-8 shadow-[var(--shadow-md)]">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-800">Team Assignments</h3>
                <UserCheck className="w-6 h-6 text-slate-400" />
              </div>
              <div className="space-y-5">
                {teamMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200 group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 bg-gradient-to-br from-[var(--accent-green-light)] to-[#e8d5bc] rounded-full flex items-center justify-center font-bold text-[var(--primary)] text-lg shadow-sm group-hover:scale-105 transition">
                        {member.fullName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800 group-hover:text-blue-700 transition">
                          {member.fullName}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 capitalize">
                          {member.role.replace('_', ' ')}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-[var(--primary)] bg-[var(--accent-green-light)] px-3 py-1.5 rounded-full">
                      {getAssignedCount(member.id)} assigned
                    </span>
                  </div>
                ))}
                {teamMembers.length === 0 && (
                  <p className="text-slate-500 text-center py-8">No team members loaded</p>
                )}
              </div>
            </div>
          </aside>
        </div>
    </div>
  );
};

const BentoStat = ({ label, value, trend, icon, accentIndex = 0 }: any) => {
  return (
    <StatCard
      label={label}
      value={value}
      hint={trend}
      accentIndex={accentIndex}
      icon={() => icon}
    />
  );
};

const StatusPill = ({ status }: { status: string }) => {
  const s = (status || 'OPEN').toUpperCase();
  const tone =
    s === 'RESOLVED' || s === 'CLOSED'
      ? 'success'
      : s === 'IN_PROGRESS' || s === 'PENDING'
        ? 'warning'
        : 'info';
  return <UiStatusPill tone={tone}>{s.replace('_', ' ')}</UiStatusPill>;
};

const PriorityDot = ({ priority }: { priority: string }) => {
  const p = (priority || 'NORMAL').toUpperCase();
  const colors: Record<string, string> = {
    URGENT: 'bg-rose-500 ring-rose-200',
    HIGH: 'bg-[var(--accent-green-light)] ring-orange-200',
    NORMAL: 'bg-[var(--accent-green-light)] ring-blue-200',
    LOW: 'bg-slate-400 ring-slate-200',
  };

  return (
    <div className="flex items-center gap-3">
      <span className={`h-3 w-3 rounded-full ring-2 ${colors[p] || 'bg-slate-300 ring-slate-200'}`}></span>
      <span className="text-sm font-semibold text-slate-700">{p}</span>
    </div>
  );
};

export default CXDashboard;