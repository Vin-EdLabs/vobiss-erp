import { useQuery } from '@tanstack/react-query';
import { Navigation, MapPin, Ticket, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getFieldArrivals } from '@/api/fieldWork';
import BASE_URL from '@/lib/api';

function fullUrl(path: string) {
  if (path.startsWith('http')) return path;
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function FieldArrivals() {
  const { data, isLoading } = useQuery({
    queryKey: ['field-arrivals'],
    queryFn: () => getFieldArrivals({ limit: 100 }),
    refetchInterval: 60000,
  });

  const arrivals = data || [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Human Resources</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]">
          <Navigation className="h-7 w-7" /> Field Arrivals
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Every "Confirm I'm here" check-in from field engineers, with their location verified against the site.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      ) : arrivals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-green-light)]">
            <Navigation className="h-6 w-6 text-[var(--success-text)]" />
          </span>
          <p className="text-sm font-semibold text-[var(--text-primary)]">No check-ins yet</p>
          <p className="text-xs text-[var(--text-muted)]">Field engineer arrivals will show up here as they confirm they're on site.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {arrivals.map((a) => {
            const photo = a.attachments.find((att) => att.mime_type?.startsWith('image/'));
            const verified = a.distance_from_site_meters != null && a.distance_from_site_meters <= 150;
            const flagged = a.distance_from_site_meters != null && a.distance_from_site_meters > 150;
            return (
              <div key={a.id} className="vobiss-card flex gap-3 rounded-2xl border bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
                {photo ? (
                  <a href={fullUrl(photo.path)} target="_blank" rel="noreferrer" className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[var(--border)]">
                    <img src={fullUrl(photo.path)} alt="Check-in" className="h-full w-full object-cover" loading="lazy" />
                  </a>
                ) : (
                  <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-secondary)]">
                    <Navigation className="h-6 w-6 text-[var(--text-muted)]" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-[var(--text-primary)]">{a.engineer_name || 'Field Engineer'}</p>
                    <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]"><Clock className="h-3.5 w-3.5" /> {timeAgo(a.created_at)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                    {a.site_name && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {a.site_name}</span>}
                    <span className="flex items-center gap-1"><Ticket className="h-3.5 w-3.5" /> {a.source_reference} — {a.field_work_title}</span>
                  </div>
                  <p
                    className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      verified
                        ? 'bg-[var(--accent-green-light)] text-[var(--success-text)]'
                        : flagged
                          ? 'bg-[var(--accent-amber-light)] text-[var(--accent-amber)]'
                          : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]'
                    }`}
                  >
                    <MapPin className="h-2.5 w-2.5" />
                    {a.distance_from_site_meters == null
                      ? 'Site has no saved coordinates to verify against'
                      : verified
                        ? `Verified — ${a.distance_from_site_meters}m from site`
                        : `${a.distance_from_site_meters}m from site — unusually far`}
                  </p>
                  {a.content && <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{a.content}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
