// src/pages/customer/Dashboard.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerSidebar from '../../components/customer/CustomerSidebar';
import MobileBottomNav from '../../components/customer/MobileBottomNav';
import CustomerHeader from '../../components/customer/CustomerHeader';
import { API_URL } from '@/lib/api';
import { 
  FileText,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  MessageSquare,
  Package,
  TrendingUp,
  MapPin,
  Wifi,
} from 'lucide-react';
import { getCustomerSites, getCustomerTickets, type CustomerSite } from '../../api';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCustomerPortalTheme } from '../../components/customer/CustomerThemeToggle';

interface CustomerData {
  id: number;
  customer_code: string;
  name: string;
  created_at: string;
  project?: {
    id: number;
    code: string;
    name: string;
  };
  sites?: CustomerSite[];
}

interface Ticket {
  ticket_id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
}

const Dashboard: React.FC = () => {
  useCustomerPortalTheme();
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sites, setSites] = useState<CustomerSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = localStorage.getItem('customer_token');
        if (!token) {
          navigate('/customer/login');
          return;
        }
        const res = await fetch(`${API_URL}/customer/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Session expired');
        const json = await res.json();
        const customerData = json.customer || json;
        setCustomer(customerData);
        if (Array.isArray(customerData.sites)) {
          setSites(customerData.sites);
        } else if (Array.isArray(json.sites)) {
          setSites(json.sites);
        } else {
          setSites(await getCustomerSites());
        }
      } catch (err) {
        localStorage.removeItem('customer_token');
        navigate('/customer/login');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [navigate]);

  useEffect(() => {
    if (!customer) return;

    const loadTickets = async () => {
      try {
        const data = await getCustomerTickets();
        const list = Array.isArray(data)
          ? data
          : Array.isArray((data as any)?.data)
            ? (data as any).data
            : Array.isArray((data as any)?.tickets)
              ? (data as any).tickets
              : [];
        setTickets(list);
      } catch (err) {
        console.error('Failed to load tickets:', err);
      } finally {
        setLoadingTickets(false);
      }
    };
    loadTickets();
  }, [customer]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--content-bg)]">
        <div className="text-center">
          <div className="mx-auto mb-6 h-14 w-14 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--primary)]" />
          <p className="text-lg font-medium text-[var(--text-secondary)]">Loading your support portal…</p>
        </div>
      </div>
    );
  }

  if (!customer) return null;

  const stats = {
    total: tickets.length,
    open: tickets.filter(t => ['NEW', 'OPEN'].includes((t.status || '').toUpperCase())).length,
    resolved: tickets.filter(t => (t.status || '').toUpperCase() === 'RESOLVED').length,
    closed: tickets.filter(t => (t.status || '').toUpperCase() === 'CLOSED').length,
  };

  // Premium StatCard Component
  interface StatCardProps {
    icon: React.ElementType;
    title: string;
    value: number | string;
    color: string;
    description?: string;
  }

  const StatCard: React.FC<StatCardProps> = ({ icon: Icon, title, value, description }, _i?: number) => (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-5 py-[18px] shadow-[var(--shadow-md)]"
      style={{ borderLeftWidth: 3, borderLeftColor: 'var(--accent-green)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{title}</p>
        <Icon className="h-5 w-5 text-[var(--accent-green)]" />
      </div>
      <p className="mt-2.5 text-2xl font-bold leading-none text-[var(--text-primary)]">{value}</p>
      {description && <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>}
    </div>
  );

  const getStatusConfig = (status: string) => {
    const upper = (status || '').toUpperCase();
    switch (upper) {
      case 'NEW': return { bg: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-5 w-5" />, label: 'New' };
      case 'OPEN': return { bg: 'bg-blue-100 text-[var(--primary-hover)]', icon: <AlertCircle className="h-5 w-5" />, label: 'In Progress' };
      case 'RESOLVED': return { bg: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-5 w-5" />, label: 'Resolved' };
      case 'CLOSED': return { bg: 'bg-gray-100 text-gray-800', icon: <CheckCircle className="h-5 w-5" />, label: 'Closed' };
      default: return { bg: 'bg-gray-100 text-gray-700', icon: <Clock className="h-5 w-5" />, label: 'Pending' };
    }
  };

  const getConnectionStatus = (status?: string | null) => {
    switch ((status || 'Pending').toLowerCase()) {
      case 'live':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'down':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'suspended':
        return 'bg-gray-200 text-gray-800 border-gray-300';
      default:
        return 'bg-amber-100 text-amber-800 border-amber-200';
    }
  };

  return (
    <div className="flex min-h-screen bg-[var(--content-bg)]">
      <CustomerSidebar />
      <div className="flex-1 pb-20 md:ml-64 md:pb-0">
        <CustomerHeader name={customer.name} customer_code={customer.customer_code} heightClass="py-4" />

        <div className="px-4 pb-10 pt-28 md:px-6 md:pt-32 lg:px-8 lg:pt-36">
          <div className="mx-auto max-w-7xl space-y-8">

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl font-bold text-[var(--text-primary)]">
                  Welcome back, {customer.name.split(' ')[0]}
                </h1>
                <p className="mt-2 text-[var(--text-muted)]">Overview of your sites and support activity.</p>
              </div>
              <Button
                className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
                onClick={() => navigate('/customer/create-ticket')}
              >
                <Plus className="mr-2 h-4 w-4" /> New Ticket
              </Button>
            </div>

            {/* Premium Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                icon={Package}
                title="Total Tickets"
                value={stats.total}
                color="from-[var(--primary)] to-[var(--primary-hover)] bg-gradient-to-br"
                description="All time"
              />
              <StatCard
                icon={Clock}
                title="Open Tickets"
                value={stats.open}
                color="from-[#a67c52] to-[var(--primary)] bg-gradient-to-br"
                description="Needs attention"
              />
              <StatCard
                icon={CheckCircle}
                title="Resolved"
                value={stats.resolved}
                color="from-green-500 to-green-600 bg-gradient-to-br"
                description="Successfully closed"
              />
              <StatCard
                icon={FileText}
                title="Closed"
                value={stats.closed}
                color="from-[#a67c52] to-[var(--primary)] bg-gradient-to-br"
                description="Archived"
              />
            </div>

            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)] md:p-8">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="flex items-center text-2xl font-bold text-[var(--text-primary)]">
                  <MapPin className="mr-3 h-7 w-7 text-[var(--primary)]" />
                  Your Sites
                </h2>
                {sites.length > 0 && (
                  <button type="button" onClick={() => navigate('/customer/sites')} className="text-sm font-semibold text-[var(--primary)] hover:underline">
                    View all
                  </button>
                )}
              </div>
              {sites.length === 0 ? (
                <p className="rounded-xl bg-[var(--surface-secondary)] p-6 text-center text-[var(--text-muted)]">
                  No sites configured yet. Contact support if you believe this is an error.
                </p>
              ) : (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {sites.slice(0, 6).map((site) => (
                    <article key={site.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-lg font-bold text-[var(--text-primary)]">{site.site_name}</h3>
                        <span className="rounded-full bg-[var(--accent-green-light)] px-2.5 py-1 font-mono text-xs font-semibold text-[var(--primary)]">
                          {site.site_code}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${getConnectionStatus(site.connection_status)}`}>
                          <Wifi className="h-3.5 w-3.5" />
                          {site.connection_status || 'Pending'}
                        </span>
                        {site.region && <span className="text-[var(--text-secondary)]">{site.region}</span>}
                      </div>
                      <p className="mt-3 text-sm text-[var(--text-secondary)]">
                        Bandwidth: <span className="font-semibold text-[var(--text-primary)]">{site.bandwidth || 'Not specified'}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => navigate(`/customer/create-ticket?site_id=${site.id}`)}
                        className="mt-5 w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
                      >
                        Report Issue
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="flex items-center text-xl font-semibold text-[var(--text-primary)]">
                  <TrendingUp className="mr-2 h-5 w-5 text-[var(--primary)]" />
                  Recent Tickets
                </h2>
                <Button
                  className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
                  onClick={() => navigate('/customer/create-ticket')}
                >
                  <Plus className="mr-2 h-4 w-4" /> New Ticket
                </Button>
              </div>

              {loadingTickets ? (
                <div className="py-12 text-center text-[var(--text-muted)]">Loading tickets…</div>
              ) : tickets.length === 0 ? (
                <div className="py-16 text-center">
                  <FileText className="mx-auto mb-4 h-12 w-12 text-[var(--primary)]" />
                  <h3 className="mb-2 text-xl font-bold text-[var(--text-primary)]">No tickets yet</h3>
                  <p className="mb-6 text-[var(--text-muted)]">Create a ticket when you need support.</p>
                  <Button className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]" onClick={() => navigate('/customer/create-ticket')}>
                    <Plus className="mr-2 h-4 w-4" /> Create Ticket
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {tickets.slice(0, 5).map((ticket) => {
                    const statusConfig = getStatusConfig(ticket.status);
                    return (
                      <button
                        key={ticket.ticket_id}
                        type="button"
                        onClick={() => navigate(`/customer/tickets/${ticket.ticket_id}`)}
                        className="group flex w-full items-center rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 text-left transition hover:bg-[var(--surface-hover)]"
                      >
                        <div className={`mr-4 rounded-xl p-3 ${statusConfig.bg}`}>{statusConfig.icon}</div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-[var(--text-secondary)]">#{ticket.ticket_id}</span>
                            <Badge className={`${statusConfig.bg} text-xs`}>{statusConfig.label}</Badge>
                          </div>
                          <h3 className="truncate font-medium text-[var(--text-primary)]">{ticket.title}</h3>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">{new Date(ticket.created_at).toLocaleDateString()}</p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-[var(--text-muted)] group-hover:text-[var(--primary)]" />
                      </button>
                    );
                  })}
                  {tickets.length > 5 && (
                    <div className="pt-2 text-center">
                      <Button variant="outline" onClick={() => navigate('/customer/tickets')}>
                        View All Tickets ({tickets.length})
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow-md)]">
              <MessageSquare className="mx-auto mb-4 h-10 w-10 text-[var(--primary)]" />
              <h2 className="mb-3 text-2xl font-bold text-[var(--text-primary)]">Need help?</h2>
              <p className="mx-auto mb-8 max-w-2xl text-[var(--text-secondary)]">
                Report issues, track progress, and stay updated with your support team from this portal.
              </p>
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Button variant="outline" onClick={() => navigate('/customer/tickets')}>
                  View All Tickets <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]" onClick={() => navigate('/customer/create-ticket')}>
                  <Plus className="mr-2 h-4 w-4" /> Create New Ticket
                </Button>
              </div>
            </div>

          </div>
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default Dashboard;