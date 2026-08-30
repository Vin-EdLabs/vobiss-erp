import { ListChecks } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusPill } from '@/components/ui/status-pill';
import type { ByWorkflowRow } from '@/api/assessment';
import { formatMinutes, formatWorkflowType } from './shared';

const EXCLUDED_LABELS: Record<string, string> = {
  service_request: 'Service Requests',
  design_request: 'Design Requests',
  sales_request: 'Sales Requests',
  project_request: 'Project Requests',
};

function complianceTone(pct: number | null): 'success' | 'warning' | 'danger' | 'info' {
  if (pct == null) return 'info';
  if (pct >= 90) return 'success';
  if (pct >= 70) return 'warning';
  return 'danger';
}

export function ByWorkflowTable({ rows, excludedTypes }: { rows: ByWorkflowRow[]; excludedTypes: string[] }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <ListChecks className="h-4 w-4" /> By Workflow
      </h2>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">No scored work in this period yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workflow</TableHead>
                <TableHead>Segments</TableHead>
                <TableHead>Avg</TableHead>
                <TableHead>Median</TableHead>
                <TableHead>Compliance</TableHead>
                <TableHead>Breaches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.workflowType}>
                  <TableCell className="font-medium">{formatWorkflowType(r.workflowType)}</TableCell>
                  <TableCell>{r.segments}</TableCell>
                  <TableCell>{formatMinutes(r.avgMinutes)}</TableCell>
                  <TableCell>{formatMinutes(r.medianMinutes)}</TableCell>
                  <TableCell>
                    {r.compliancePct != null ? <StatusPill tone={complianceTone(r.compliancePct)}>{r.compliancePct}%</StatusPill> : '—'}
                  </TableCell>
                  <TableCell>{r.breaches}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {excludedTypes.length > 0 && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Unit only — not in your score: {excludedTypes.map((t) => EXCLUDED_LABELS[t] || formatWorkflowType(t)).join(', ')}
        </p>
      )}
    </div>
  );
}
