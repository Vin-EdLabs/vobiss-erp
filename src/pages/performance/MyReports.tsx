import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { listMyReports, listPeriods, createReport, type PerformanceReport, type PerformancePeriod } from '@/api/performanceReports';

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'finalized') return 'success';
  if (status === 'needs_revision') return 'danger';
  if (status === 'draft') return 'info';
  return 'warning';
}
function statusLabel(status: string) {
  return status.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export default function MyReports() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [reports, setReports] = useState<PerformanceReport[]>([]);
  const [periods, setPeriods] = useState<PerformancePeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [periodId, setPeriodId] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [r, p] = await Promise.all([listMyReports(), listPeriods()]);
      setReports(r); setPeriods(p);
    } catch (e) { toast({ title: 'Could not load your reports', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const submitCreate = async () => {
    if (!periodId) return toast({ title: 'Select an assessment period', variant: 'destructive' });
    if (!title.trim()) return toast({ title: 'Title is required', variant: 'destructive' });
    try {
      setCreating(true);
      const report = await createReport({ period_id: Number(periodId), title: title.trim(), summary: summary.trim() || undefined });
      toast({ title: 'Report created' });
      setShowCreate(false); setTitle(''); setSummary(''); setPeriodId('');
      navigate(`/performance-reports/report/${report.id}`);
    } catch (e) { toast({ title: 'Could not create report', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
    finally { setCreating(false); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Performance &amp; Reports</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]"><FileText className="h-7 w-7" /> My Reports</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Every performance report you've submitted, and where it stands.</p>
        </div>
        <Button type="button" onClick={() => setShowCreate(true)}><Plus className="mr-1.5 h-4 w-4" /> Create New Report</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] py-16 text-center">
          <FileText className="h-8 w-8 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">You haven't submitted any performance reports yet.</p>
          <Button type="button" variant="outline" onClick={() => setShowCreate(true)}><Plus className="mr-1.5 h-4 w-4" /> Create your first report</Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Sent To</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/performance-reports/report/${r.id}`)}>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell className="text-[var(--text-muted)]">{r.period?.name || `Period #${r.period_id}`}</TableCell>
                    <TableCell className="text-[var(--text-muted)]">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-[var(--text-muted)]">{r.recipient_name || '—'}</TableCell>
                    <TableCell className="font-semibold">{r.final_score != null ? r.final_score : '—'}</TableCell>
                    <TableCell><StatusPill tone={statusTone(r.status)}>{statusLabel(r.status)}</StatusPill></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={(v) => !v && setShowCreate(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create New Report</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Assessment Period</label>
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger><SelectValue placeholder="Select a period…" /></SelectTrigger>
                <SelectContent>{periods.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              {!periods.length && <p className="mt-1 text-xs text-[var(--text-muted)]">No assessment periods yet — ask an admin to create one.</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. September Performance Report" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Summary (optional)</label>
              <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} placeholder="What did you work on this period?" />
            </div>
            <p className="text-xs text-[var(--text-muted)]">You can attach supporting documents (PDF, Word, PowerPoint) after creating the report.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="button" onClick={submitCreate} disabled={creating}>{creating ? 'Creating…' : 'Create Report'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
