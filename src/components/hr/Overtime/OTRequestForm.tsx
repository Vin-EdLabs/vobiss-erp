import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, MapPin, Paperclip, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, inputClass } from '@/pages/hr/components';
import { hrSelfApi } from '@/api/hrSelf';
import otApi, { type OTCategory, type OTDocumentType, type OTFileEntry, type OTRateType } from '@/api/overtime';
import { LeaveSignatureDialog } from '@/components/hr/Leave/LeaveSignatureDialog';
import { OTTicketRow, emptyOTTicketRow, ticketRowHasClientSite, type OTTicketRowValue } from './OTTicketRow';

const CATEGORIES: { value: OTCategory; label: string }[] = [
  { value: 'emergency_fault', label: 'Emergency Fault' },
  { value: 'planned_maintenance', label: 'Planned Maintenance' },
  { value: 'weekend_support', label: 'Weekend Support' },
  { value: 'public_holiday_support', label: 'Public Holiday Support' },
];
const RATES: { value: OTRateType; label: string }[] = [
  { value: 'standard', label: 'Standard OT' },
  { value: 'weekend', label: 'Weekend Rate' },
  { value: 'public_holiday', label: 'Public Holiday Rate' },
  { value: 'special_approval', label: 'Special Approval Rate' },
];
const GENERAL_DOC_TYPES: { value: OTDocumentType; label: string }[] = [
  { value: 'attendance_log', label: 'Attendance Log' },
  { value: 'call_out_log', label: 'Call-Out Log' },
  { value: 'maintenance_report', label: 'Maintenance Report' },
  { value: 'supervisor_approval', label: 'Supervisor Approval' },
  { value: 'other', label: 'Other' },
];

function todayLong() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** The complete Overtime Payment Request submission form — Employee Details auto-filled and
 *  locked, OT category/rate, one-or-more ticket/site rows (the core of the form), a live
 *  summary bar, general supporting documents, and the employee declaration + signature that
 *  actually submits. */
export function OTRequestForm({ onSubmitted }: { onSubmitted: () => void }) {
  const meQ = useQuery({ queryKey: ['hr-self', 'me'], queryFn: hrSelfApi.me, staleTime: 60_000 });
  const emp = meQ.data as any;

  const [category, setCategory] = useState<OTCategory>('weekend_support');
  const [rateType, setRateType] = useState<OTRateType>('standard');
  const [normalShiftHours, setNormalShiftHours] = useState('');
  const [tickets, setTickets] = useState<OTTicketRowValue[]>([emptyOTTicketRow()]);
  const [generalFiles, setGeneralFiles] = useState<{ file: File; documentType: OTDocumentType }[]>([]);
  const [signOpen, setSignOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const updateTicket = (index: number, patch: Partial<OTTicketRowValue>) => {
    setTickets((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };
  const addTicket = () => setTickets((prev) => [...prev, emptyOTTicketRow()]);
  const removeTicket = (index: number) => setTickets((prev) => prev.filter((_, i) => i !== index));

  const totalHours = useMemo(() => {
    return tickets.reduce((sum, t) => {
      if (!t.startTime || !t.endTime) return sum;
      const [sh, sm] = t.startTime.split(':').map(Number);
      const [eh, em] = t.endTime.split(':').map(Number);
      let minutes = (eh * 60 + em) - (sh * 60 + sm);
      if (minutes < 0) minutes += 24 * 60;
      return sum + Math.round((minutes / 60) * 100) / 100;
    }, 0);
  }, [tickets]);
  const sites = useMemo(() => [...new Set(tickets.map((t) => t.siteId ? `${t.siteName} • ${t.clientName}` : null).filter(Boolean))], [tickets]);
  const dates = useMemo(() => tickets.map((t) => t.otDate).filter(Boolean).sort(), [tickets]);

  const addGeneralFiles = (type: OTDocumentType, fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    setGeneralFiles((prev) => [...prev, ...Array.from(fileList).map((file) => ({ file, documentType: type }))]);
  };

  const validate = (): string | null => {
    if (tickets.length === 0) return 'Add at least one ticket/site row';
    for (let i = 0; i < tickets.length; i++) {
      const t = tickets[i];
      if (!ticketRowHasClientSite(t)) {
        return t.ticketId
          ? `Ticket/Site ${i + 1}: this ticket is missing a Client or Site — fix the ticket or choose a different one before submitting.`
          : `Ticket/Site ${i + 1}: search and select a Client/Site (or a ticket that has one) before submitting.`;
      }
      if (!t.otDate || !t.startTime || !t.endTime || !t.workSummary.trim()) {
        return 'Every ticket row needs a date, start/end time, and work summary';
      }
    }
    if (category === 'emergency_fault' && !tickets.some((t) => t.ticketType === 'fault_ticket' && t.ticketRef.trim())) {
      return 'Emergency Fault requires at least one ticket row with a fault ticket reference';
    }
    if (category === 'planned_maintenance' && !tickets.some((t) => t.ticketType === 'work_order' && t.ticketRef.trim())) {
      return 'Planned Maintenance requires at least one ticket row with a work order reference';
    }
    return null;
  };

  const openSign = () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSignOpen(true);
  };

  const submit = async (signature: string) => {
    setSubmitting(true);
    try {
      const files: OTFileEntry[] = [];
      tickets.forEach((t, i) => t.files.forEach((f) => files.push({ file: f.file, ticketIndex: i, documentType: f.documentType, otherLabel: f.otherLabel })));
      generalFiles.forEach((f) => files.push({ file: f.file, ticketIndex: null, documentType: f.documentType }));

      const documentTypeByFile: Record<string, { documentType: OTDocumentType; otherLabel?: string }>[] = tickets.map((t) => {
        const map: Record<string, { documentType: OTDocumentType; otherLabel?: string }> = {};
        t.files.forEach((f) => { map[f.file.name] = { documentType: f.documentType, otherLabel: f.otherLabel }; });
        return map;
      });

      await otApi.submit(
        {
          otCategory: category,
          otRateType: rateType,
          normalShiftHours,
          employeeSignature: signature,
          tickets: tickets.map((t, i) => ({
            ticketType: t.ticketType,
            ticketRef: t.ticketRef || undefined,
            ticketId: t.ticketId,
            siteId: t.siteId,
            siteName: t.siteName || undefined,
            region: t.region || undefined,
            digitalAddress: t.digitalAddress || undefined,
            clientId: t.clientId,
            clientName: t.clientName || undefined,
            otDate: t.otDate,
            dayType: t.dayType,
            startTime: t.startTime,
            endTime: t.endTime,
            workSummary: t.workSummary,
            documentTypeByFile: documentTypeByFile[i],
          })),
        },
        files
      );
      toast.success('Overtime request submitted');
      setTickets([emptyOTTicketRow()]);
      setGeneralFiles([]);
      setCategory('weekend_support');
      setRateType('standard');
      setNormalShiftHours('');
      setSignOpen(false);
      onSubmitted();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to submit overtime request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <CalendarClock className="h-4 w-4 text-[var(--primary)]" /> Overtime Payment Request
      </h2>

      {/* A. Employee Details */}
      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Employee Details</p>
        <div className="grid grid-cols-2 gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-secondary)] p-3 sm:grid-cols-4">
          <Field label="Full Name"><div className={`${inputClass} bg-[var(--surface)] text-[var(--text-muted)]`}>{emp?.full_name || '—'}</div></Field>
          <Field label="Department / Unit"><div className={`${inputClass} bg-[var(--surface)] text-[var(--text-muted)]`}>{emp?.department || '—'}</div></Field>
          <Field label="Job Title / Position"><div className={`${inputClass} bg-[var(--surface)] text-[var(--text-muted)]`}>{emp?.position || '—'}</div></Field>
          <Field label="Contact Number"><div className={`${inputClass} bg-[var(--surface)] text-[var(--text-muted)]`}>{emp?.phone || '—'}</div></Field>
        </div>
      </div>

      {/* B. Overtime Details */}
      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Overtime Details</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="OT Category" required>
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as OTCategory)}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Applicable OT Rate" required>
            <select className={inputClass} value={rateType} onChange={(e) => setRateType(e.target.value as OTRateType)}>
              {RATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Normal Shift Hours" hint='e.g. "8am - 5pm"'>
            <input className={inputClass} placeholder="e.g. 8am - 5pm" value={normalShiftHours} onChange={(e) => setNormalShiftHours(e.target.value)} />
          </Field>
        </div>
      </div>

      {/* C. Site summary (read-only, driven by tickets) */}
      <div className="mb-5 flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
        <MapPin className="h-4 w-4 shrink-0 text-[var(--primary)]" />
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {sites.length === 0 ? 'Add a ticket row to fill in site details' : sites.length === 1 ? sites[0] : `Multiple Sites (${sites.length}) — see ticket details below`}
        </p>
      </div>

      {/* D & E. Ticket rows */}
      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Ticket / Site Rows</p>
        <div className="space-y-3">
          {tickets.map((t, i) => (
            <OTTicketRow key={i} index={i} value={t} onChange={(patch) => updateTicket(i, patch)} onRemove={() => removeTicket(i)} canRemove={tickets.length > 1} />
          ))}
        </div>
        <Button type="button" variant="outline" className="mt-3" onClick={addTicket}>
          <Plus className="mr-1 h-4 w-4" /> Add Another Ticket / Site
        </Button>

        <div className="mt-4 flex flex-wrap gap-6 rounded-[var(--radius-lg)] border border-[var(--primary)] bg-[var(--accent-amber-light)] p-4">
          <div><p className="text-lg font-bold text-[var(--primary)]">{totalHours.toFixed(2)}h</p><p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Total OT Hours</p></div>
          <div><p className="text-lg font-bold text-[var(--primary)]">{sites.length}</p><p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Sites Visited</p></div>
          <div><p className="text-lg font-bold text-[var(--primary)]">{dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : '—'}</p><p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Date Range</p></div>
        </div>
      </div>

      {/* G. General supporting documents */}
      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">General Supporting Documents (optional)</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {GENERAL_DOC_TYPES.map((dt) => (
            <label key={dt.value} className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2 text-xs font-medium text-[var(--text-primary)]">
              <Paperclip className="h-3.5 w-3.5 text-[var(--primary)]" /> {dt.label}
              <input type="file" multiple className="hidden" onChange={(e) => { addGeneralFiles(dt.value, e.target.files); e.target.value = ''; }} />
            </label>
          ))}
        </div>
        {generalFiles.length > 0 && (
          <div className="mt-2 space-y-1">
            {generalFiles.map((f, i) => (
              <div key={i} className="flex items-center justify-between rounded bg-[var(--surface-secondary)] px-2 py-1 text-xs">
                <span className="truncate">{f.file.name}</span>
                <button type="button" onClick={() => setGeneralFiles((prev) => prev.filter((_, idx) => idx !== i))}><X className="h-3.5 w-3.5 text-[var(--text-muted)]" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* H. Declaration */}
      <div className="mb-5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
        <p className="text-xs italic text-[var(--text-secondary)]">"I confirm the overtime work stated above was performed by me and the hours claimed are accurate."</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Declaration date: {todayLong()} (auto-filled)</p>
      </div>

      <Button type="button" className="w-full" onClick={openSign}>Submit Overtime Request</Button>

      <LeaveSignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        title="Employee Declaration"
        description='Type your full name to confirm: "I confirm the overtime work stated above was performed by me and the hours claimed are accurate."'
        confirmLabel="Sign & Submit"
        pending={submitting}
        onConfirm={submit}
      />
    </div>
  );
}
