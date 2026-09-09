import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Building2,
  Calendar,
  Activity,
  Ticket,
  Package,
  Banknote,
  Clock,
  FolderKanban,
  Wrench,
  Loader2,
  AlertCircle,
  ArrowRight,
  Radio,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { site360Api, type SiteOverview, type SiteModuleInfo, type SiteActivityItem } from '@/api/site360';
import { cn } from '@/lib/utils';

const MODULE_META: Record<string, { icon: React.ElementType; chip: string }> = {
  ticket: { icon: Ticket, chip: 'bg-blue-100 text-blue-800' },
  material_request: { icon: Package, chip: 'bg-amber-100 text-amber-800' },
  cash_request: { icon: Banknote, chip: 'bg-emerald-100 text-emerald-800' },
  overtime: { icon: Clock, chip: 'bg-violet-100 text-violet-800' },
  service_request: { icon: FolderKanban, chip: 'bg-indigo-100 text-indigo-800' },
  field_work: { icon: Wrench, chip: 'bg-orange-100 text-orange-800' },
};

function statusClasses(status?: string | null) {
  const s = String(status || '').toLowerCase();
  if (['approved', 'completed', 'paid', 'closed', 'active', 'resolved'].some((k) => s.includes(k))) {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (['declined', 'rejected', 'cancelled', 'canceled'].some((k) => s.includes(k))) {
    return 'bg-red-100 text-red-700';
  }
  if (['pending', 'progress', 'awaiting', 'open', 'new'].some((k) => s.includes(k))) {
    return 'bg-amber-100 text-amber-700';
  }
  return 'bg-slate-100 text-slate-700';
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function ActivityRow({ item }: { item: SiteActivityItem }) {
  const meta = MODULE_META[item.module] || MODULE_META.ticket;
  const Icon = meta.icon;
  return (
    <Link
      to={item.href}
      className="flex items-start gap-3 rounded-lg border border-transparent px-3 py-3 transition hover:border-slate-200 hover:bg-slate-50"
    >
      <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', meta.chip)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">{item.title}</span>
          {item.status && (
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', statusClasses(item.status))}>
              {item.status}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">
          {item.ref}
          {item.subtitle ? ` · ${item.subtitle}` : ''}
          {item.actor ? ` · ${item.actor}` : ''} · {formatDate(item.date)}
        </span>
      </span>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
    </Link>
  );
}

function ModuleTab({ siteId, moduleKey }: { siteId: string; moduleKey: string }) {
  const [items, setItems] = useState<SiteActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const PAGE = 20;

  const load = (offset: number) => {
    setLoading(true);
    site360Api
      .getModuleActivity(siteId, moduleKey, { limit: PAGE, offset })
      .then((res) => {
        setItems((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setItems([]);
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, moduleKey]);

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertCircle className="h-4 w-4" /> {error}
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">No records for this site yet.</p>;
  }

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <ActivityRow key={`${item.module}-${item.id}`} item={item} />
      ))}
      {items.length < total && (
        <div className="pt-2 text-center">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => load(items.length)}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Load more (${total - items.length} remaining)`}
          </Button>
        </div>
      )}
    </div>
  );
}

function TimelineTab({ siteId }: { siteId: string }) {
  const [items, setItems] = useState<SiteActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const PAGE = 25;

  const load = (offset: number) => {
    setLoading(true);
    site360Api
      .getTimeline(siteId, { limit: PAGE, offset })
      .then((res) => {
        setItems((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setItems([]);
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertCircle className="h-4 w-4" /> {error}
      </div>
    );
  }
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">Nothing has happened at this site yet.</p>;
  }
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <ActivityRow key={`${item.module}-${item.id}`} item={item} />
      ))}
      {items.length < total && (
        <div className="pt-2 text-center">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => load(items.length)}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Load more (${total - items.length} remaining)`}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function SiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [site, setSite] = useState<SiteOverview | null>(null);
  const [modules, setModules] = useState<SiteModuleInfo[]>([]);
  const [stats, setStats] = useState<Record<string, { label: string; count: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([site360Api.getOverview(id), site360Api.getStats(id)])
      .then(([ov, st]) => {
        setSite(ov.site);
        setModules(ov.modules);
        setStats(st.stats);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load site'))
      .finally(() => setLoading(false));
  }, [id]);

  const statCards = useMemo(() => {
    const order = ['ticket', 'material_request', 'cash_request', 'overtime', 'service_request', 'field_work'];
    return order.filter((k) => stats[k]).map((k) => ({ key: k, ...stats[k] }));
  }, [stats]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading site…
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/director/search" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-700">
          <ArrowLeft className="h-4 w-4" /> Back to Search
        </Link>
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" /> {error || 'Site not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <Link to="/director/search" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-blue-700">
          <ArrowLeft className="h-4 w-4" /> Back to Search
        </Link>

        {/* Site Information — read-only, sourced directly from centralized master records. */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-md shadow-pink-500/20">
                <MapPin className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{site.siteName}</h1>
                <p className="mt-0.5 text-sm text-slate-500">{site.siteCode}</p>
              </div>
            </div>
            {site.status && (
              <span className={cn('rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide', statusClasses(site.status))}>
                {site.status}
              </span>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-xs text-slate-400">Client</p>
                <p className="text-sm font-medium text-slate-800">{site.client?.name || 'No client linked'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-xs text-slate-400">Location</p>
                <p className="text-sm font-medium text-slate-800">{[site.address, site.region].filter(Boolean).join(' · ') || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Radio className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-xs text-slate-400">Service</p>
                <p className="text-sm font-medium text-slate-800">{[site.serviceType, site.bandwidth].filter(Boolean).join(' · ') || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-xs text-slate-400">Date Created</p>
                <p className="text-sm font-medium text-slate-800">{formatDate(site.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-xs text-slate-400">Sales Owner</p>
                <p className="text-sm font-medium text-slate-800">{site.salesOwner || 'Not assigned'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Site Statistics */}
        {statCards.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {statCards.map(({ key, label, count }) => {
              const meta = MODULE_META[key] || MODULE_META.ticket;
              const Icon = meta.icon;
              return (
                <div key={key} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                  <span className={cn('mb-2 flex h-8 w-8 items-center justify-center rounded-lg', meta.chip)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="text-lg font-bold text-slate-900">{count}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Tabbed activity */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="overview">
                <Activity className="mr-1.5 h-3.5 w-3.5" /> Overview
              </TabsTrigger>
              {modules.map((m) => {
                const meta = MODULE_META[m.key] || MODULE_META.ticket;
                const Icon = meta.icon;
                return (
                  <TabsTrigger key={m.key} value={m.key}>
                    <Icon className="mr-1.5 h-3.5 w-3.5" /> {m.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <TimelineTab siteId={site.id.toString()} />
            </TabsContent>

            {modules.map((m) => (
              <TabsContent key={m.key} value={m.key} className="mt-4">
                <ModuleTab siteId={site.id.toString()} moduleKey={m.key} />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
