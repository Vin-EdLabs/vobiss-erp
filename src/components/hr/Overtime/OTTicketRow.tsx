import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Building2, MapPin, Navigation, Paperclip, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, inputClass } from '@/pages/hr/components';
import { API_URL } from '@/lib/api';
import { searchSites, searchTickets, type OTDayType, type OTDocumentType, type OTTicketType, type SiteSearchResult, type TicketSearchResult } from '@/api/overtime';

export type OTFileAttachment = { file: File; documentType: OTDocumentType; otherLabel?: string };

export type OTTicketRowValue = {
  ticketType: OTTicketType;
  ticketRef: string;
  ticketId?: number;
  siteId?: number;
  siteName: string;
  region: string;
  digitalAddress: string;
  latitude?: number | null;
  longitude?: number | null;
  clientId?: number;
  clientName: string;
  otDate: string;
  dayType: OTDayType;
  startTime: string;
  endTime: string;
  workSummary: string;
  files: OTFileAttachment[];
};

export function emptyOTTicketRow(): OTTicketRowValue {
  return {
    ticketType: 'fault_ticket', ticketRef: '', siteName: '', region: '', digitalAddress: '',
    latitude: null, longitude: null, clientName: '',
    otDate: '', dayType: 'weekday', startTime: '', endTime: '', workSummary: '', files: [],
  };
}

/** A row is only submittable once it has both a Client and a Site — resolved either from the
 *  linked ticket or from a directly-searched site. Never from free text. */
export function ticketRowHasClientSite(row: OTTicketRowValue) {
  return !!row.clientId && !!row.siteId;
}

function calcHours(start: string, end: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}

function suggestDayType(dateStr: string): OTDayType {
  if (!dateStr) return 'weekday';
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}

const DOC_TYPES: { value: OTDocumentType; label: string }[] = [
  { value: 'attendance_log', label: 'Attendance Log' },
  { value: 'call_out_log', label: 'Call-Out Log' },
  { value: 'fault_ticket', label: 'Fault Ticket' },
  { value: 'maintenance_report', label: 'Maintenance Report' },
  { value: 'supervisor_approval', label: 'Supervisor Approval' },
  { value: 'other', label: 'Other' },
];

function useDebouncedSearch<T>(query: string, fetcher: (q: string) => Promise<T[]>, delay = 300) {
  const [results, setResults] = useState<T[]>([]);
  useEffect(() => {
    if (!query || query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      fetcher(query).then(setResults).catch(() => setResults([]));
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  return { results };
}

function authHeader() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** One expandable card for a single ticket/site an employee worked overtime at — the core
 *  repeating unit of the OT submission form. Client and Site are master data, never free text:
 *  selecting a real ticket auto-fills and locks them from the ticket's own record; a ticket
 *  missing a site can be fixed right here (search a site, save it to the ticket); with no ticket
 *  linked at all, the user searches a site directly and its client comes along automatically. */
export function OTTicketRow({
  index,
  value,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  value: OTTicketRowValue;
  onChange: (patch: Partial<OTTicketRowValue>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [ticketQuery, setTicketQuery] = useState('');
  const [ticketOpen, setTicketOpen] = useState(false);
  const [siteQuery, setSiteQuery] = useState('');
  const [siteOpen, setSiteOpen] = useState(false);
  const [fixingTicketSite, setFixingTicketSite] = useState(false);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [otherLabel, setOtherLabel] = useState('');

  const ticketSearch = useDebouncedSearch<TicketSearchResult>(ticketQuery, searchTickets);
  const siteSearch = useDebouncedSearch<SiteSearchResult>(siteQuery, searchSites);

  const hours = calcHours(value.startTime, value.endTime);
  const hasClientSite = ticketRowHasClientSite(value);
  const ticketMissingSite = !!value.ticketId && !hasClientSite;

  const handleDateChange = (date: string) => {
    onChange({ otDate: date, dayType: suggestDayType(date) });
  };

  const selectTicket = (t: TicketSearchResult) => {
    onChange({
      ticketRef: t.ticket_id,
      ticketId: t.id,
      siteId: t.site_id || undefined,
      siteName: t.site_name || '',
      region: t.region || '',
      digitalAddress: t.site_address || '',
      latitude: t.latitude ?? null,
      longitude: t.longitude ?? null,
      clientId: t.customer_id || undefined,
      clientName: t.customer_name || '',
    });
    setTicketQuery(t.ticket_id);
    setTicketOpen(false);
  };

  const clearTicket = () => {
    onChange({
      ticketRef: '', ticketId: undefined, siteId: undefined, siteName: '', region: '',
      digitalAddress: '', latitude: null, longitude: null, clientId: undefined, clientName: '',
    });
    setTicketQuery('');
  };

  const selectSite = (s: SiteSearchResult) => {
    onChange({
      siteId: s.id, siteName: s.site_name, region: s.region || '', digitalAddress: s.site_address || '',
      latitude: s.latitude ?? null, longitude: s.longitude ?? null,
      clientId: s.customer_id || undefined, clientName: s.customer_name || '',
    });
    setSiteQuery(s.site_name);
    setSiteOpen(false);
  };

  const fixTicketSite = async (s: SiteSearchResult) => {
    if (!value.ticketRef) return;
    try {
      const res = await fetch(`${API_URL}/cx/tickets/${encodeURIComponent(value.ticketRef)}/site`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ site_id: s.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update the ticket');
      onChange({
        siteId: s.id, siteName: s.site_name, region: s.region || '', digitalAddress: s.site_address || '',
        latitude: s.latitude ?? null, longitude: s.longitude ?? null,
        clientId: s.customer_id || undefined, clientName: s.customer_name || '',
      });
      setFixingTicketSite(false);
      setSiteQuery('');
      toast.success('Ticket updated with its Client and Site');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update the ticket');
    }
  };

  const filesFor = (type: OTDocumentType) => value.files.filter((f) => f.documentType === type);

  const addFiles = (type: OTDocumentType, fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    const added: OTFileAttachment[] = Array.from(fileList).map((file) => ({
      file, documentType: type, otherLabel: type === 'other' ? otherLabel : undefined,
    }));
    onChange({ files: [...value.files, ...added] });
  };

  const removeFile = (file: File) => {
    onChange({ files: value.files.filter((f) => f.file !== file) });
  };

  return (
    <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-md)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--primary)]">Ticket / Site {index + 1}</span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="flex items-center gap-1 text-xs font-medium text-[var(--accent-red)] hover:underline">
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>

      {/* Ticket type toggle */}
      <div className="mb-3 flex gap-2">
        {(['fault_ticket', 'work_order'] as OTTicketType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange({ ticketType: t })}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              value.ticketType === t ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-secondary)]'
            }`}
          >
            {t === 'fault_ticket' ? 'Fault Ticket' : 'Work Order'}
          </button>
        ))}
      </div>

      <div className="relative">
        <Field label="Ticket Search" hint="Search an existing ticket — Client and Site auto-fill from it.">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              className={`${inputClass} pl-8`}
              placeholder="Search by ticket number, title, or client…"
              value={ticketQuery || value.ticketRef}
              onChange={(e) => {
                setTicketQuery(e.target.value);
                if (value.ticketId) clearTicket();
                onChange({ ticketRef: e.target.value });
                setTicketOpen(true);
              }}
              onFocus={() => setTicketOpen(true)}
              onBlur={() => setTimeout(() => setTicketOpen(false), 150)}
            />
          </div>
        </Field>
        {ticketOpen && ticketSearch.results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
            {ticketSearch.results.map((t) => (
              <button
                key={t.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-secondary)]"
                onMouseDown={() => selectTicket(t)}
              >
                <span className="font-semibold">{t.ticket_id}</span> — {t.title}
                <span className="ml-1 text-xs text-[var(--text-muted)]">
                  {t.customer_name}{t.site_name ? ` • ${t.site_name}` : ' • no site assigned'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Client / Site — always read-only, auto-filled from master data, never typed. Client and
          Site are shown as distinct labeled fields (never merged into one line) so it's clear
          which is which; Location and GPS coordinates get their own row underneath. */}
      {hasClientSite && (
        <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Client</p>
              <span className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" /> {value.clientName}
              </span>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Site</p>
              <span className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" /> {value.siteName}
              </span>
            </div>
          </div>

          {(value.digitalAddress || value.region) && (
            <div className="mt-3 border-t border-[var(--border)] pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Location</p>
              <p className="mt-0.5 text-sm text-[var(--text-body)]">
                {[value.digitalAddress, value.region].filter(Boolean).join(', ')}
              </p>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
            <div className="flex items-center gap-1.5">
              <Navigation className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              {value.latitude != null && value.longitude != null ? (
                <a
                  href={`https://www.google.com/maps?q=${value.latitude},${value.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-[var(--primary)] hover:underline"
                >
                  {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)} — View on map
                </a>
              ) : (
                <span className="text-xs text-[var(--text-muted)]">No GPS coordinates on file for this site</span>
              )}
            </div>
            {value.ticketId && (
              <button type="button" className="shrink-0 text-xs font-medium text-[var(--primary)] hover:underline" onClick={clearTicket}>
                Change ticket
              </button>
            )}
          </div>
        </div>
      )}

      {ticketMissingSite && !fixingTicketSite && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--accent-red)] bg-[var(--accent-red-light)] px-3 py-2.5 text-sm text-[var(--danger-text)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          This ticket has no Client/Site assigned — it can't be used for overtime until fixed.
          <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => setFixingTicketSite(true)}>
            Fix this ticket
          </Button>
        </div>
      )}

      {fixingTicketSite && (
        <div className="relative mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
          <Field label="Search a Site to assign to this ticket" hint="Its Client fills in automatically — every site belongs to exactly one client.">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                className={`${inputClass} pl-8`}
                placeholder="Search sites…"
                value={siteQuery}
                onChange={(e) => { setSiteQuery(e.target.value); setSiteOpen(true); }}
                onFocus={() => setSiteOpen(true)}
                autoFocus
              />
            </div>
          </Field>
          {siteOpen && siteSearch.results.length > 0 && (
            <div className="absolute z-10 mt-1 w-[calc(100%-1.5rem)] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
              {siteSearch.results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-secondary)]"
                  onMouseDown={() => fixTicketSite(s)}
                >
                  <span className="font-semibold">{s.site_name}</span> • {s.customer_name || 'No client'}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="mt-2 text-xs text-[var(--text-muted)] hover:underline" onClick={() => setFixingTicketSite(false)}>
            Cancel
          </button>
        </div>
      )}

      {!value.ticketId && !hasClientSite && (
        <div className="relative mt-3">
          <Field label="Site Search" required hint="No matching ticket linked — search and select a Site directly. Its Client fills in automatically.">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                className={`${inputClass} pl-8`}
                placeholder="Search sites…"
                value={siteQuery}
                onChange={(e) => { setSiteQuery(e.target.value); setSiteOpen(true); }}
                onFocus={() => setSiteOpen(true)}
                onBlur={() => setTimeout(() => setSiteOpen(false), 150)}
              />
            </div>
          </Field>
          {siteOpen && siteSearch.results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
              {siteSearch.results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-secondary)]"
                  onMouseDown={() => selectSite(s)}
                >
                  <span className="font-semibold">{s.site_name}</span> • {s.customer_name || 'No client'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {hasClientSite && !value.ticketId && (
        <button type="button" className="mt-2 text-xs font-medium text-[var(--primary)] hover:underline" onClick={() => onChange({ siteId: undefined, siteName: '', region: '', digitalAddress: '', latitude: null, longitude: null, clientId: undefined, clientName: '' })}>
          Change site
        </button>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="OT Date" required><input type="date" className={inputClass} value={value.otDate} onChange={(e) => handleDateChange(e.target.value)} /></Field>
        <Field label="Day Type" required>
          <select className={inputClass} value={value.dayType} onChange={(e) => onChange({ dayType: e.target.value as OTDayType })}>
            <option value="weekday">Weekday</option>
            <option value="weekend">Weekend</option>
            <option value="public_holiday">Public Holiday</option>
          </select>
        </Field>
        <div />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="OT Start Time" required><input type="time" className={inputClass} value={value.startTime} onChange={(e) => onChange({ startTime: e.target.value })} /></Field>
        <Field label="OT End Time" required><input type="time" className={inputClass} value={value.endTime} onChange={(e) => onChange({ endTime: e.target.value })} /></Field>
        <Field label="Hours Worked"><div className={`${inputClass} flex items-center font-semibold text-[var(--primary)]`}>{hours.toFixed(2)}h</div></Field>
      </div>

      <div className="mt-3">
        <Field label="Work Summary" required hint="Describe work performed, equipment handled, faults resolved, installations, tests conducted, or operational support provided.">
          <textarea className={`${inputClass} h-auto min-h-[88px] py-2`} rows={3} value={value.workSummary} onChange={(e) => onChange({ workSummary: e.target.value })} />
        </Field>
      </div>

      <div className="mt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Supporting Documents for this Ticket</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {DOC_TYPES.map((dt) => {
            const files = filesFor(dt.value);
            return (
              <div key={dt.value} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-secondary)] p-2.5">
                <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
                  <input type="checkbox" checked={files.length > 0} readOnly className="h-3.5 w-3.5 accent-[var(--primary)]" />
                  {dt.label}
                  <button
                    type="button"
                    className="ml-auto flex items-center gap-1 text-[var(--primary)] hover:underline"
                    onClick={() => fileInputs.current[dt.value]?.click()}
                  >
                    <Paperclip className="h-3 w-3" /> Attach
                  </button>
                  <input
                    ref={(el) => { fileInputs.current[dt.value] = el; }}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => { addFiles(dt.value, e.target.files); e.target.value = ''; }}
                  />
                </label>
                {dt.value === 'other' && (
                  <input
                    className={`${inputClass} mt-1.5 h-7 text-xs`}
                    placeholder="Label this document…"
                    value={otherLabel}
                    onChange={(e) => setOtherLabel(e.target.value)}
                  />
                )}
                {files.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between gap-1 rounded bg-[var(--surface)] px-2 py-1 text-[11px]">
                        <span className="truncate">{f.file.name}</span>
                        <button type="button" onClick={() => removeFile(f.file)}><X className="h-3 w-3 text-[var(--text-muted)]" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
