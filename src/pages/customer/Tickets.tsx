// src/pages/customer/Tickets.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle,
  Search,
} from 'lucide-react';
import CustomerSidebar from '../../components/customer/CustomerSidebar';
import MobileBottomNav from '../../components/customer/MobileBottomNav';
import CustomerHeader from '../../components/customer/CustomerHeader';
import { getCustomerTickets } from '../../api';
import { API_URL } from '@/lib/api';

interface Ticket {
  ticket_id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  project_name?: string;
  project_code?: string;
  customer_name?: string;
  site_id?: number | null;
  site_name?: string | null;
  site_code?: string | null;
}

interface CustomerProfile {
  name: string;
  customer_code: string;
  project?: {
    name: string;
    code: string;
  };
}

const TicketsPage = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      try {
        const token = localStorage.getItem('customer_token');
        if (!token) {
          navigate('/customer/login');
          return;
        }

        let profileData: CustomerProfile | null = null;
        try {
          const profileRes = await fetch(`${API_URL}/customer/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (profileRes.ok) {
            const data = await profileRes.json();
            profileData = data.customer || data;
            setProfile(profileData);
          }
        } catch (err) {
          console.warn('Failed to load profile for header');
        }

        const rawTickets = await getCustomerTickets();
        let ticketList: any[] = [];
        if (Array.isArray(rawTickets)) {
          ticketList = rawTickets;
        } else if (rawTickets?.tickets) {
          ticketList = rawTickets.tickets;
        } else if (rawTickets?.data) {
          ticketList = rawTickets.data;
        }

        const normalizedTickets: Ticket[] = ticketList.map((item: any) => {
          let projectName = 'Unknown Project';
          let projectCode = '';

          if (item.project_name) {
            projectName = item.project_name;
          } else if (item.project?.name) {
            projectName = item.project.name;
            projectCode = item.project.code || '';
          } else if (item.project?.project_name) {
            projectName = item.project.project_name;
          }

          if (projectName === 'Unknown Project' && profileData?.project?.name) {
            projectName = profileData.project.name;
            projectCode = profileData.project.code || '';
          }

          return {
            ticket_id: item.ticket_id || item.id || 'UNKNOWN',
            title: item.title || 'No title',
            status: item.status || 'NEW',
            priority: (item.priority || 'normal').toLowerCase(),
            created_at: item.created_at || new Date().toISOString(),
            updated_at: item.updated_at || item.created_at || new Date().toISOString(),
            project_name: projectName,
            project_code: projectCode,
            customer_name: item.customer_name || profileData?.name || 'Customer',
            site_id: item.site_id || null,
            site_name: item.site_name || null,
            site_code: item.site_code || null,
          };
        });

        setTickets(normalizedTickets);
        setFilteredTickets(normalizedTickets);
      } catch (err: any) {
        console.error('Error loading tickets:', err);
        setError('Failed to load tickets. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [navigate]);

  useEffect(() => {
    const lower = searchTerm.toLowerCase();
    const filtered = tickets.filter(
      (ticket) =>
        (!siteFilter || String(ticket.site_id) === siteFilter) &&
        (!lower ||
          ticket.ticket_id.toLowerCase().includes(lower) ||
          ticket.title.toLowerCase().includes(lower) ||
          ticket.site_name?.toLowerCase().includes(lower) ||
          ticket.project_name?.toLowerCase().includes(lower))
    );
    setFilteredTickets(filtered);
  }, [searchTerm, siteFilter, tickets]);

  const getStatusConfig = (status: string) => {
    switch (status.toUpperCase()) {
      case 'NEW':
        return { color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="w-4 h-4" /> };
      case 'OPEN':
        return { color: 'bg-blue-100 text-[var(--primary-hover)]', icon: <AlertTriangle className="w-4 h-4" /> };
      case 'RESOLVED':
      case 'CLOSED':
        return { color: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-4 h-4" /> };
      default:
        return { color: 'bg-gray-100 text-gray-800', icon: <Clock className="w-4 h-4" /> };
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'urgent': return 'Urgent';
      case 'high': return 'High';
      case 'normal': return 'Normal';
      case 'low': return 'Low';
      default: return priority.charAt(0).toUpperCase() + priority.slice(1);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--content-bg)]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--primary)]" />
          <p className="text-lg text-[var(--text-secondary)]">Loading your tickets…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--content-bg)] p-4">
        <div className="max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow-md)]">
          <FileText className="mx-auto mb-4 h-16 w-16 text-red-500" />
          <h2 className="mb-3 text-2xl font-bold text-[var(--text-primary)]">Error</h2>
          <p className="mb-6 text-[var(--text-muted)]">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-[var(--primary)] px-6 py-3 font-medium text-white transition hover:bg-[var(--primary-hover)]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--content-bg)]">
      <CustomerSidebar />
      <div className="flex-1 pb-20 md:ml-64 md:pb-0">
        <CustomerHeader
          name={profile?.name || 'Customer'}
          customer_code={profile?.customer_code || 'CUST-XXXXX'}
          heightClass="py-4"
        />

        <div className="px-4 pb-10 pt-28 md:px-6 md:pt-32 lg:px-8 lg:pt-36">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-[var(--text-primary)] md:text-3xl">My Tickets</h1>
                <p className="mt-1 text-sm text-[var(--text-muted)] md:text-base">
                  {filteredTickets.length} {filteredTickets.length === 1 ? 'ticket' : 'tickets'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/customer/create-ticket')}
                className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--primary-hover)] md:mt-0"
              >
                <FileText className="h-4 w-4 md:h-5 md:w-5" />
                New Ticket
              </button>
            </div>

            <div className="mb-6 grid gap-3 md:grid-cols-[1fr_240px]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search by ID, title, or site..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-3 pl-12 pr-4 text-sm text-[var(--text-primary)] shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                />
              </div>
              <select
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-primary)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
              >
                <option value="">All sites</option>
                {Array.from(new Map(tickets.filter((ticket) => ticket.site_id).map((ticket) => [ticket.site_id, ticket])).values()).map((ticket) => (
                  <option key={ticket.site_id} value={String(ticket.site_id)}>{ticket.site_name || 'Unnamed site'}</option>
                ))}
              </select>
            </div>

            {filteredTickets.length === 0 ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center shadow-[var(--shadow-md)]">
                <FileText className="mx-auto mb-4 h-14 w-14 text-[var(--text-muted)]" />
                <p className="text-lg font-medium text-[var(--text-primary)]">No tickets found</p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  {searchTerm ? 'Try a different search term.' : 'Create your first ticket to get started!'}
                </p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] md:block">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-[var(--border)]">
                      <thead className="bg-[var(--surface-secondary)]">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Site</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Ticket ID</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Title</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Created</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Status</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Priority</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
                        {filteredTickets.map((ticket) => {
                          const statusConfig = getStatusConfig(ticket.status);
                          return (
                            <tr
                              key={ticket.ticket_id}
                              onClick={() => navigate(`/customer/tickets/${ticket.ticket_id}`)}
                              className="cursor-pointer transition hover:bg-[var(--surface-hover)]"
                            >
                              <td className="px-6 py-5 text-sm font-medium text-[var(--text-primary)]">
                                <div>
                                  {ticket.site_name || 'Not assigned'}
                                  {ticket.site_code && <span className="ml-2 font-mono text-xs text-[var(--text-muted)]">({ticket.site_code})</span>}
                                </div>
                              </td>
                              <td className="px-6 py-5 font-mono text-sm font-semibold text-[var(--primary)]">{ticket.ticket_id}</td>
                              <td className="max-w-md px-6 py-5 text-sm text-[var(--text-primary)]">
                                <div className="truncate pr-4">{ticket.title}</div>
                              </td>
                              <td className="px-6 py-5 text-sm text-[var(--text-muted)]">{formatDate(ticket.created_at)}</td>
                              <td className="px-6 py-5">
                                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${statusConfig.color}`}>
                                  {statusConfig.icon}
                                  {ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1).toLowerCase()}
                                </span>
                              </td>
                              <td className="px-6 py-5 text-sm font-medium text-[var(--text-secondary)]">{getPriorityBadge(ticket.priority)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-4 md:hidden">
                  {filteredTickets.map((ticket) => {
                    const statusConfig = getStatusConfig(ticket.status);
                    return (
                      <div
                        key={ticket.ticket_id}
                        onClick={() => navigate(`/customer/tickets/${ticket.ticket_id}`)}
                        className="cursor-pointer rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] transition hover:bg-[var(--surface-hover)]"
                      >
                        <div className="p-5">
                          <div className="mb-3 flex items-start justify-between">
                            <div>
                              <p className="text-xs font-medium text-[var(--text-muted)]">{ticket.site_name || 'No site assigned'}</p>
                              <p className="font-mono text-lg font-bold text-[var(--primary)]">{ticket.ticket_id}</p>
                            </div>
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${statusConfig.color}`}>
                              {statusConfig.icon}
                              {ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1).toLowerCase()}
                            </span>
                          </div>
                          <h3 className="mb-2 line-clamp-2 text-base font-semibold text-[var(--text-primary)]">{ticket.title}</h3>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-[var(--text-muted)]">Created {formatDate(ticket.created_at)}</span>
                            <span className="font-medium text-[var(--text-secondary)]">{getPriorityBadge(ticket.priority)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default TicketsPage;