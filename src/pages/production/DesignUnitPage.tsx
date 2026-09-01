import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, FileText, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { listDesignRequests, type ProjectRequest } from '@/api/project';

/** Design's queue — filling the survey and material request now happens inline on the SR's own
 *  profile page (/project-request/:id), not here. This page is just search + "Open". */
export default function DesignUnitPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try { setRequests(await listDesignRequests()); }
      catch (e: unknown) { toast({ title: 'Could not load Design Unit', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' }); }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = requests.filter((r) => [r.customer_name, r.site_name, r.region, r.created_by_name].some((v) => String(v || '').toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--primary)]">Service Requests</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">Design Unit</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Requests waiting on a survey. Open one to fill it in and send it back to Sales.</p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-5">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[var(--primary)]" />
            <h2 className="font-semibold text-[var(--text-primary)]">Design requests</h2>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, site, region…" />
          </div>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {loading ? (
            <div className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-[var(--primary)]" /></div>
          ) : visible.length ? (
            visible.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{r.customer_name} — {r.site_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{r.region || 'No region'} · {r.created_by_name || 'Sales Unit'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
                    {r.current_stage === 'design' ? 'Awaiting Design' : r.current_stage === 'sales' ? 'With Sales' : r.current_stage}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/project-request/${r.id}`)}><Eye className="mr-1 h-4 w-4" />Open</Button>
                </div>
              </div>
            ))
          ) : (
            <p className="p-6 text-sm text-[var(--text-muted)]">No Design requests yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
