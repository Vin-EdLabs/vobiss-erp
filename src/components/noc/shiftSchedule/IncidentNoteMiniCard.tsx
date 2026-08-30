import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ExternalLink } from 'lucide-react';
import { API_URL } from '@/lib/api';
import { StatusPill } from '@/components/ui/status-pill';

interface IncidentNoteSummary {
  id: number;
  reference_no: string;
  site_name: string;
  status: string;
  description: string;
  created_at: string;
}

/**
 * Read-only summary of the latest Incident Note logged during the current shift's window.
 * Consumes the existing, untouched GET /api/noc/incident-notes?date=... endpoint — never
 * writes anything back to the Incident Notes system.
 */
export function IncidentNoteMiniCard({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const [note, setNote] = useState<IncidentNoteSummary | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('token');
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const dates = new Set([start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]);

    Promise.all(
      [...dates].map((date) =>
        fetch(`${API_URL}/noc/incident-notes?date=${date}`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => (r.ok ? r.json() : { notes: [] }))
          .catch(() => ({ notes: [] }))
      )
    ).then((results) => {
      if (cancelled) return;
      const all: IncidentNoteSummary[] = results.flatMap((r) => r.notes || []);
      const withinShift = all.filter((n) => {
        const createdAt = new Date(n.created_at);
        return createdAt >= start && createdAt < end;
      });
      withinShift.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setNote(withinShift[0] || null);
    });

    return () => {
      cancelled = true;
    };
  }, [startsAt, endsAt]);

  if (note === undefined) return null; // loading — stay quiet, this is a secondary widget
  if (note === null) return null; // no notes this shift — omit the section entirely rather than an empty card

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
          <FileText className="h-3.5 w-3.5" /> Latest Incident Note
        </p>
        <Link to="/noc/incident-notes" className="flex items-center gap-1 text-[11px] font-medium text-[var(--primary)] hover:underline">
          View all notes <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-bold text-[var(--primary)]">{note.reference_no}</span>
        <span className="text-xs text-[var(--text-secondary)]">{note.site_name}</span>
        <StatusPill status={note.status} />
      </div>
      {note.description && (
        <p className="mt-1.5 line-clamp-2 text-xs text-[var(--text-secondary)]">{note.description}</p>
      )}
    </div>
  );
}
