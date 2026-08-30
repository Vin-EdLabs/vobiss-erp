import { useNavigate } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { UnitRankingMember } from '@/api/assessment';
import { formatMinutes } from './shared';

export function UnitRankingTable({
  unitSlug,
  summary,
  ranking,
  canNavigate,
}: {
  unitSlug: string;
  summary: { segments: number; avgMinutes: number | null; compliancePct: number | null; breaches: number };
  ranking: UnitRankingMember[];
  canNavigate: boolean;
}) {
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Trophy className="h-4 w-4" /> Unit Performance — {unitSlug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </h2>
        <div className="flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
          <span><b className="text-[var(--text-primary)]">{summary.segments}</b> segments</span>
          <span>avg <b className="text-[var(--text-primary)]">{formatMinutes(summary.avgMinutes)}</b></span>
          <span>compliance <b className="text-[var(--text-primary)]">{summary.compliancePct ?? '—'}%</b></span>
          <span><b className="text-[var(--text-primary)]">{summary.breaches}</b> breaches</span>
        </div>
      </div>

      {ranking.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">No scored work recorded for this unit yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Segments</TableHead>
                <TableHead>Avg Time</TableHead>
                <TableHead>Compliance</TableHead>
                <TableHead>Breaches</TableHead>
                <TableHead>Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.map((m, i) => (
                <TableRow
                  key={m.userId}
                  className={`${m.isCurrentUser ? 'bg-[var(--accent-blue-light)]' : ''} ${canNavigate && !m.isCurrentUser ? 'cursor-pointer hover:bg-[var(--surface-secondary)]' : ''}`}
                  onClick={() => canNavigate && !m.isCurrentUser && navigate(`/staff-assessment/${m.userId}`)}
                >
                  <TableCell className="text-[var(--text-muted)]">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    {m.fullName} {m.isCurrentUser && <span className="ml-1 rounded-full bg-[var(--accent-blue)] px-2 py-0.5 text-[10px] font-bold text-white">YOU</span>}
                  </TableCell>
                  <TableCell>{m.segments}</TableCell>
                  <TableCell>{formatMinutes(m.avgMinutes)}</TableCell>
                  <TableCell>{m.compliancePct != null ? `${m.compliancePct}%` : '—'}</TableCell>
                  <TableCell>{m.breaches}</TableCell>
                  <TableCell className="font-bold">{m.score ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
