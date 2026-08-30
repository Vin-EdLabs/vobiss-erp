import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, Plus, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { isSystemAdminAccount } from '@/config/roles';
import { getWorkflowTimeConfig, saveWorkflowTimeConfig, type WorkflowTimeConfigRow } from '@/api/timeEngine';

const KNOWN_WORKFLOW_TYPES = [
  'ticket', 'transport_request', 'fuel_request', 'vehicle_request', 'material_request',
  'cash_request', 'item_return', 'signoff_form', 'service_request', 'design_request',
  'sales_request', 'wip_entry',
];

function formatLabel(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ConfigRow({ row, onSaved, readOnly }: { row: WorkflowTimeConfigRow; onSaved: () => void; readOnly: boolean }) {
  const { toast } = useToast();
  const [values, setValues] = useState({
    expected_duration_minutes: row.expected_duration_minutes ?? 0,
    warning_threshold_minutes: row.warning_threshold_minutes ?? 0,
    critical_threshold_minutes: row.critical_threshold_minutes ?? 0,
    is_active: row.is_active,
  });
  const [saving, setSaving] = useState(false);

  const save = async (overrides: Partial<typeof values> = {}) => {
    const next = { ...values, ...overrides };
    setValues(next);
    try {
      setSaving(true);
      await saveWorkflowTimeConfig({
        workflow_type: row.workflow_type,
        stage_name: row.stage_name,
        unit_slug: row.unit_slug,
        ...next,
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-b border-[var(--border)]">
      <td className="px-3 py-2 text-sm font-medium text-[var(--text-primary)]">{formatLabel(row.stage_name)}</td>
      <td className="px-3 py-2 text-sm text-[var(--text-secondary)]">{row.unit_slug || '—'}</td>
      <td className="px-3 py-2">
        <Input type="number" min={0} className="w-24" value={values.expected_duration_minutes}
          onChange={(e) => setValues((v) => ({ ...v, expected_duration_minutes: Number(e.target.value) }))}
          onBlur={() => save()} disabled={saving || readOnly} />
      </td>
      <td className="px-3 py-2">
        <Input type="number" min={0} className="w-24" value={values.warning_threshold_minutes}
          onChange={(e) => setValues((v) => ({ ...v, warning_threshold_minutes: Number(e.target.value) }))}
          onBlur={() => save()} disabled={saving || readOnly} />
      </td>
      <td className="px-3 py-2">
        <Input type="number" min={0} className="w-24" value={values.critical_threshold_minutes}
          onChange={(e) => setValues((v) => ({ ...v, critical_threshold_minutes: Number(e.target.value) }))}
          onBlur={() => save()} disabled={saving || readOnly} />
      </td>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={values.is_active} disabled={saving || readOnly}
          onChange={(e) => save({ is_active: e.target.checked })}
          className="h-4 w-4 accent-[var(--primary)]" />
      </td>
    </tr>
  );
}

export default function WorkflowTimeConfig() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = isSystemAdminAccount(user);
  const queryClient = useQueryClient();
  const configQuery = useQuery({ queryKey: ['time-engine', 'config'], queryFn: getWorkflowTimeConfig });

  const [newStageWorkflow, setNewStageWorkflow] = useState(KNOWN_WORKFLOW_TYPES[0]);
  const [newStageName, setNewStageName] = useState('');
  const [copySource, setCopySource] = useState(KNOWN_WORKFLOW_TYPES[0]);
  const [copyTarget, setCopyTarget] = useState(KNOWN_WORKFLOW_TYPES[1]);
  const [copying, setCopying] = useState(false);
  const [addingStage, setAddingStage] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, WorkflowTimeConfigRow[]>();
    for (const row of configQuery.data || []) {
      const list = map.get(row.workflow_type) || [];
      list.push(row);
      map.set(row.workflow_type, list);
    }
    return map;
  }, [configQuery.data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['time-engine', 'config'] });

  const addStage = async () => {
    const stageName = newStageName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!stageName) return;
    try {
      setAddingStage(true);
      await saveWorkflowTimeConfig({
        workflow_type: newStageWorkflow, stage_name: stageName, unit_slug: null,
        expected_duration_minutes: 30, warning_threshold_minutes: 25, critical_threshold_minutes: 30, is_active: true,
      });
      setNewStageName('');
      toast({ title: 'Stage added' });
      refresh();
    } catch (e) {
      toast({ title: 'Could not add stage', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setAddingStage(false);
    }
  };

  const copyConfig = async () => {
    if (copySource === copyTarget) return;
    const sourceRows = grouped.get(copySource) || [];
    if (!sourceRows.length) {
      toast({ title: 'Nothing to copy', description: `${formatLabel(copySource)} has no configured stages.`, variant: 'destructive' });
      return;
    }
    try {
      setCopying(true);
      for (const row of sourceRows) {
        await saveWorkflowTimeConfig({
          workflow_type: copyTarget, stage_name: row.stage_name, unit_slug: row.unit_slug,
          expected_duration_minutes: row.expected_duration_minutes,
          warning_threshold_minutes: row.warning_threshold_minutes,
          critical_threshold_minutes: row.critical_threshold_minutes,
          is_active: row.is_active,
        });
      }
      toast({ title: 'Configuration copied', description: `${formatLabel(copySource)} → ${formatLabel(copyTarget)}` });
      refresh();
    } catch (e) {
      toast({ title: 'Could not copy configuration', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">System Settings</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]">
          <Settings className="h-7 w-7" /> Workflow Time Configuration
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Set expected processing time and SLA thresholds per stage, per workflow.</p>
      </div>

      {!isAdmin && (
        <p className="rounded-xl border border-[var(--accent-amber-light)] bg-[var(--accent-amber-light)] px-4 py-2.5 text-sm text-[var(--warning-text)]">
          View only — only System Admins can change workflow time configuration.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-2">
          <Copy className="h-4 w-4 text-[var(--text-secondary)]" />
          <span className="text-sm font-medium text-[var(--text-primary)]">Copy configuration</span>
        </div>
        <Select value={copySource} onValueChange={setCopySource}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{KNOWN_WORKFLOW_TYPES.map((t) => <SelectItem key={t} value={t}>{formatLabel(t)}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-sm text-[var(--text-secondary)]">to</span>
        <Select value={copyTarget} onValueChange={setCopyTarget}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{KNOWN_WORKFLOW_TYPES.map((t) => <SelectItem key={t} value={t}>{formatLabel(t)}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" onClick={copyConfig} disabled={!isAdmin || copying || copySource === copyTarget}>{copying ? 'Copying…' : 'Copy'}</Button>
      </div>

      {configQuery.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        [...grouped.entries()].map(([workflowType, rows]) => (
          <div key={workflowType} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
            <h2 className="mb-3 text-sm font-bold text-[var(--text-primary)]">{formatLabel(workflowType)}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    <th className="px-3 py-2">Stage</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2">Expected (min)</th>
                    <th className="px-3 py-2">Warning At (min)</th>
                    <th className="px-3 py-2">Critical At (min)</th>
                    <th className="px-3 py-2 text-center">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => <ConfigRow key={row.id} row={row} onSaved={refresh} readOnly={!isAdmin} />)}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-4">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-[var(--text-secondary)]" />
          <span className="text-sm font-medium text-[var(--text-primary)]">Add custom stage</span>
        </div>
        <Select value={newStageWorkflow} onValueChange={setNewStageWorkflow}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{KNOWN_WORKFLOW_TYPES.map((t) => <SelectItem key={t} value={t}>{formatLabel(t)}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="Stage name (e.g. quality_check)" className="w-56" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} />
        <Button size="sm" onClick={addStage} disabled={!isAdmin || addingStage || !newStageName.trim()}>{addingStage ? 'Adding…' : 'Add Stage'}</Button>
      </div>
    </div>
  );
}
