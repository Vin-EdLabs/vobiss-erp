import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, MapPin, Ticket, Wifi } from 'lucide-react';
import CustomerSidebar from '../../components/customer/CustomerSidebar';
import CustomerHeader from '../../components/customer/CustomerHeader';
import MobileBottomNav from '../../components/customer/MobileBottomNav';
import {
  getCustomerProfile,
  getCustomerSites,
  getCustomerTickets,
  type CustomerProfile,
  type CustomerSite,
} from '../../api';

interface SiteTicket {
  ticket_id: string;
  site_id?: number;
  site_name?: string;
  title: string;
  status: string;
  created_at: string;
}

const statusClasses = (status?: string | null) => {
  switch ((status || 'Pending').toLowerCase()) {
    case 'live':
      return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800';
    case 'down':
      return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';
    case 'suspended':
      return 'bg-[var(--surface-secondary)] text-[var(--text-primary)] border-[var(--border)]';
    default:
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
  }
};

const Sites: React.FC = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [sites, setSites] = useState<CustomerSite[]>([]);
  const [tickets, setTickets] = useState<SiteTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getCustomerProfile(), getCustomerSites(), getCustomerTickets()])
      .then(([profileData, siteData, ticketData]) => {
        setProfile(profileData);
        setSites(siteData);
        setTickets(Array.isArray(ticketData) ? ticketData : []);
      })
      .catch((err: Error) => setError(err.message || 'Unable to load sites.'))
      .finally(() => setLoading(false));
  }, []);

  const ticketsBySite = useMemo(() => {
    const result = new Map<number, SiteTicket[]>();
    tickets.forEach((ticket) => {
      if (!ticket.site_id) return;
      result.set(ticket.site_id, [...(result.get(ticket.site_id) || []), ticket]);
    });
    return result;
  }, [tickets]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--content-bg)]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--content-bg)]">
      <CustomerSidebar />
      <div className="flex-1 pb-24 md:ml-64">
        <CustomerHeader name={profile?.name || 'Customer'} customer_code={profile?.customer_code || ''} heightClass="py-4" />
        <main className="px-4 pb-10 pt-28 md:px-8 md:pt-32 lg:pt-36">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8">
              <h1 className="flex items-center gap-3 text-3xl font-bold text-[var(--text-primary)]">
                <Building2 className="h-8 w-8 text-[var(--primary)]" />
                My Sites
              </h1>
              <p className="mt-2 text-[var(--text-muted)]">View your service locations and report site-specific issues.</p>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>
            ) : sites.length === 0 ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center shadow-[var(--shadow-md)]">
                <MapPin className="mx-auto mb-4 h-12 w-12 text-[var(--text-muted)]" />
                <p className="text-[var(--text-muted)]">No sites configured yet. Contact support if you believe this is an error.</p>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                {sites.map((site) => {
                  const recentTickets = (site.last_tickets || ticketsBySite.get(site.id) || []).slice(0, 3);
                  return (
                    <article key={site.id} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
                      <div className="bg-[var(--surface-secondary)] p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h2 className="text-xl font-bold text-[var(--text-primary)]">{site.site_name}</h2>
                            <p className="mt-1 font-mono text-sm font-semibold text-[var(--primary)]">{site.site_code}</p>
                          </div>
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(site.connection_status)}`}>
                            <Wifi className="h-3.5 w-3.5" />
                            {site.connection_status || 'Pending'}
                          </span>
                        </div>
                        <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-[var(--text-muted)]">Region</p>
                            <p className="font-semibold text-[var(--text-primary)]">{site.region || 'Not specified'}</p>
                          </div>
                          <div>
                            <p className="text-[var(--text-muted)]">Bandwidth</p>
                            <p className="font-semibold text-[var(--text-primary)]">{site.bandwidth || 'Not specified'}</p>
                          </div>
                          <div>
                            <p className="text-[var(--text-muted)]">Service</p>
                            <p className="font-semibold text-[var(--text-primary)]">{site.service_type || 'Not specified'}</p>
                          </div>
                          <div>
                            <p className="text-[var(--text-muted)]">IP address</p>
                            <p className="font-mono font-semibold text-[var(--text-primary)]">{site.ip_address || 'Not specified'}</p>
                          </div>
                        </div>
                        {site.site_address && (
                          <p className="mt-4 flex gap-2 text-sm text-[var(--text-secondary)]">
                            <MapPin className="h-4 w-4 shrink-0" />
                            {site.site_address}
                          </p>
                        )}
                      </div>

                      <div className="border-t border-[var(--border)] p-6">
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                          <Ticket className="h-4 w-4 text-[var(--primary)]" />
                          Recent tickets
                        </h3>
                        {recentTickets.length > 0 ? (
                          <div className="space-y-2">
                            {recentTickets.map((ticket) => (
                              <button
                                key={ticket.ticket_id}
                                type="button"
                                onClick={() => navigate(`/customer/tickets/${ticket.ticket_id}`)}
                                className="flex w-full items-center justify-between rounded-lg bg-[var(--surface-secondary)] px-3 py-2 text-left text-sm text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
                              >
                                <span className="min-w-0 truncate">{ticket.title}</span>
                                <span className="ml-3 shrink-0 font-mono text-xs text-[var(--primary)]">{ticket.ticket_id}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-[var(--text-muted)]">No tickets reported for this site.</p>
                        )}
                        <button
                          type="button"
                          onClick={() => navigate(`/customer/create-ticket?site_id=${site.id}`)}
                          className="mt-5 w-full rounded-xl bg-[var(--primary)] px-4 py-3 font-semibold text-white transition hover:bg-[var(--primary-hover)]"
                        >
                          Report Issue
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default Sites;
