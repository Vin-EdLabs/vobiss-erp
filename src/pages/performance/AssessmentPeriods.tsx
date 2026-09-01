import { useEffect, useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { listPeriods, createPeriod, type PerformancePeriod } from '@/api/performanceReports';

const PERIOD_TYPES = ['weekly', 'monthly', 'quarterly', 'custom'];

export default function AssessmentPeriods() {
  const { toast } = useToast();
  const [periods, setPeriods] = useState<PerformancePeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [periodType, setPeriodType] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try { setLoading(true); setPeriods(await listPeriods()); }
    catch (e) { toast({ title: 'Could not load periods', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const submit = async () => {
    if (!name.trim() || !startDate || !endDate) return toast({ title: 'Name, start date, and end date are required', variant: 'destructive' });
    try {
      setCreating(true);
      await createPeriod({ name: name.trim(), period_type: periodType, start_date: startDate, end_date: endDate });
      toast({ title: 'Assessment period created' });
      setShowCreate(false); setName(''); setStartDate(''); setEndDate('');
      await load();
    } catch (e) { toast({ title: 'Could not create period', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
    finally { setCreating(false); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Performance &amp; Reports</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]"><CalendarDays className="h-7 w-7" /> Assessment Periods</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Weekly, monthly, or quarterly windows that reports and system scores are measured against.</p>
        </div>
        <Button type="button" onClick={() => setShowCreate(true)}><Plus className="mr-1.5 h-4 w-4" /> New Period</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>
      ) : periods.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] py-16 text-center">
          <CalendarDays className="h-8 w-8 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">No assessment periods yet.</p>
          <Button type="button" variant="outline" onClick={() => setShowCreate(true)}><Plus className="mr-1.5 h-4 w-4" /> Create the first period</Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {periods.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
              <div>
                <p className="font-bold text-[var(--text-primary)]">{p.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{new Date(p.start_date).toLocaleDateString()} – {new Date(p.end_date).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone="info">{p.period_type}</StatusPill>
                {p.is_active && <StatusPill tone="success">Active</StatusPill>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={(v) => !v && setShowCreate(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Assessment Period</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q1 2027" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Type</label>
              <Select value={periodType} onValueChange={setPeriodType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PERIOD_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Start Date</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">End Date</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="button" onClick={submit} disabled={creating}>{creating ? 'Creating…' : 'Create Period'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
