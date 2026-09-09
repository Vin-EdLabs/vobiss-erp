import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Search, Building2, ArrowRight } from 'lucide-react';
import { cxApi } from '@/api';

export default function SiteReport() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [recent, setRecent] = useState<any[]>([]);

  // A handful of sites to land on something useful before the user types anything —
  // same "open in a working state, not an empty shell" idea as the other report pages.
  useEffect(() => {
    cxApi
      .searchSites('a')
      .then((res: any) => setRecent((Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []).slice(0, 6)))
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      cxApi
        .searchSites(query)
        .then((res: any) => { if (!cancelled) setResults(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  const openSite = (site: any) => navigate(`/site360/${site.id}`);

  const shown = query.trim() ? results : recent;

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-pink-50/30 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <Link
          to="/staff/reports"
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Report System
        </Link>
        <p className="text-xs font-semibold uppercase tracking-widest text-pink-600">Report System · Sites</p>
        <h1 className="text-3xl font-bold text-slate-900">Site Report</h1>
        <p className="mt-1 max-w-2xl text-slate-600">
          Pick a site to see everything that's happened there — tickets, materials, cash, overtime, projects, and field work,
          plus the client it belongs to — in one place.
        </p>

        <div className="relative mt-6">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by site name, code, or client…"
            autoComplete="off"
            autoFocus
            className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-12 pr-4 text-base shadow-[var(--shadow-md)] outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-500/20"
          />
        </div>

        <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {query.trim() ? (searching ? 'Searching…' : `${results.length} match${results.length === 1 ? '' : 'es'}`) : 'Recently added sites'}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {shown.length === 0 && !searching && (
            <div className="sm:col-span-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-sm text-slate-500">
              {query.trim() ? 'No sites match that search.' : 'No sites on file yet.'}
            </div>
          )}
          {shown.map((site) => (
            <button
              key={site.id}
              type="button"
              onClick={() => openSite(site)}
              className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-pink-300 hover:shadow-[var(--shadow-md)]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow">
                <MapPin className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-900">{site.site_name}</span>
                <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                  <Building2 className="h-3 w-3 shrink-0" />
                  {site.client_name || site.customer_name || 'No client linked'}
                  {site.region ? ` · ${site.region}` : ''}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-pink-500" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
