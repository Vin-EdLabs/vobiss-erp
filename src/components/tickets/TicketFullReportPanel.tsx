import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  FileBarChart,
  Loader2,
  Users,
  Package,
  Wallet,
  Clock,
  Printer,
  CheckCircle2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { pdf } from '@react-pdf/renderer';
import { cxApi } from '@/api';
import { Button } from '@/components/ui/button';
import {
  TicketHistoryReportPdf,
  type TicketHistoryReportData,
} from '@/components/tickets/TicketHistoryReportPdf';

function isClosedStatus(status?: string | null) {
  const s = String(status || '').toUpperCase();
  return s === 'CLOSED' || s === 'RESOLVED';
}

function fmt(v?: string | null) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function normalizeReport(raw: any, ticketId: string): TicketHistoryReportData {
  const ticket = raw?.ticket || {};
  const report = raw?.report || raw || {};
  return {
    ticket_id: report.ticket_id || ticket.ticket_id || ticketId,
    title: report.title || ticket.title || 'Untitled ticket',
    status: report.status || ticket.status,
    priority: report.priority || ticket.priority,
    category: report.category || ticket.category,
    customer_name: report.customer_name || ticket.customer_name,
    customer_code: report.customer_code || ticket.customer_code,
    project_name: report.project_name || ticket.project_name,
    description: report.description || ticket.description,
    assignee_name: report.assignee_name || ticket.assignee_name,
    started_at: report.started_at || report.startedAt || ticket.created_at,
    ended_at: report.ended_at || report.endedAt || ticket.closed_at || null,
    resolution_time: report.resolution_time || report.resolutionTimeFormatted || null,
    escalation_stage: report.escalation_stage || ticket.escalation_stage,
    workers: report.workers || raw?.usersWorkedOn || [],
    timeline: report.timeline || raw?.timeline || [],
    material_requests: report.material_requests || raw?.materialRequests || [],
    cash_requests: report.cash_requests || raw?.cashRequests || [],
    sla: report.sla || {
      response_due_at: ticket.response_due_at,
      resolution_due_at: ticket.resolution_due_at,
      first_response_at: ticket.first_response_at,
    },
    tags: report.tags || ticket.tags || [],
  };
}

/** Full ticket lifecycle report with print preview + PDF (especially after close). */
export function TicketFullReportPanel({
  ticketId,
  status,
}: {
  ticketId: string;
  status?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [report, setReport] = useState<TicketHistoryReportData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const closed = isClosedStatus(status);

  const load = async (opts?: { openPreview?: boolean }) => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const res = await cxApi.getTicketFullDetailsBySearchTerm(ticketId);
      const data = res?.data || res;
      if (!data?.ticket && !data?.report) {
        throw new Error(res?.error || 'Ticket report not found');
      }
      const normalized = normalizeReport(data, ticketId);
      setReport(normalized);
      if (opts?.openPreview) setPreviewOpen(true);
      toast.success('Full ticket history ready');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (closed && ticketId && !report) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed, ticketId]);

  const ensureReport = async () => {
    if (report) return report;
    setLoading(true);
    try {
      const res = await cxApi.getTicketFullDetailsBySearchTerm(ticketId);
      const data = res?.data || res;
      if (!data?.ticket && !data?.report) {
        throw new Error(res?.error || 'Ticket report not found');
      }
      const normalized = normalizeReport(data, ticketId);
      setReport(normalized);
      return normalized;
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const data = await ensureReport();
      if (!data) throw new Error('No report data');
      const blob = await pdf(<TicketHistoryReportPdf report={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.ticket_id}-history-report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const printReport = async () => {
    try {
      const data = report || (await ensureReport());
      if (!data) return;
      setPreviewOpen(true);
      // Wait for dialog paint
      window.setTimeout(() => {
        window.print();
      }, 250);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to prepare print');
    }
  };

  const openPreview = async () => {
    if (!report) await load({ openPreview: true });
    else setPreviewOpen(true);
  };

  return (
    <>
      <div
        className={`rounded-2xl border shadow-[var(--shadow-md)] overflow-hidden ${
          closed
            ? 'border-[#e0c4a0] bg-gradient-to-br from-[var(--accent-green-light)] via-white to-[#f8f1e8]'
            : 'border-slate-200 bg-white'
        }`}
      >
        {closed && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e0c4a0]/70 bg-[#5c3a1e] px-5 py-3.5 text-white">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-[#e8d5bc]" />
              <div>
                <p className="text-sm font-semibold tracking-tight">Ticket closed — history report ready</p>
                <p className="text-xs text-[#e8d5bc]">
                  Print or download the full lifecycle: workers, timeline, materials & cash
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="bg-white text-[#5c3a1e] hover:bg-[#f3e6d4]"
                onClick={() => void openPreview()}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
                View report
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="bg-white/15 text-white hover:bg-white/25 border border-white/20"
                onClick={() => void printReport()}
                disabled={loading}
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-[#f3e6d4] text-[#3c2210] hover:bg-white"
                onClick={() => void downloadPdf()}
                disabled={loading || pdfLoading}
              >
                {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                PDF
              </Button>
            </div>
          </div>
        )}

        <div className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileBarChart className="w-5 h-5 text-[var(--primary)]" />
              Full Ticket History Report
            </h2>
            {!closed && (
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
                  {report ? 'Refresh' : 'Generate report'}
                </Button>
                {report && (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={() => void openPreview()}>
                      Preview
                    </Button>
                    <Button type="button" size="sm" onClick={() => void downloadPdf()} disabled={pdfLoading}>
                      {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      PDF
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {!report && !closed && (
            <p className="text-sm text-slate-600">
              Generate a full lifecycle report: who worked on this ticket, when it started/ended, SLA,
              linked material and cash requests, and the complete timeline.
            </p>
          )}

          {!report && closed && loading && (
            <div className="flex items-center gap-2 text-sm text-[var(--primary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Building closed-ticket history…
            </div>
          )}

          {report && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Info icon={Clock} label="Started" value={fmt(report.started_at)} />
                <Info icon={Clock} label="Ended" value={report.ended_at ? fmt(report.ended_at) : 'Still open'} />
                <Info icon={Clock} label="Resolution time" value={report.resolution_time || '—'} />
                <Info icon={Users} label="Workers" value={String(report.workers?.length || 0)} />
                <Info icon={Package} label="Material requests" value={String(report.material_requests?.length || 0)} />
                <Info icon={Wallet} label="Cash requests" value={String(report.cash_requests?.length || 0)} />
              </div>

              {closed && (
                <p className="text-xs text-slate-500">
                  Use <span className="font-semibold text-[var(--primary)]">View report</span> for the full printable
                  history, or download the PDF for archives.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {previewOpen && report && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3 sm:p-6 print:static print:inset-auto print:bg-white print:p-0">
          <div className="relative flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:max-w-none print:rounded-none print:shadow-none">
            <div className="ticket-print-hide flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-[#5c3a1e] px-4 py-3 text-white">
              <div>
                <p className="text-sm font-semibold">Printable ticket history</p>
                <p className="text-xs text-[#e8d5bc]">{report.ticket_id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="bg-white text-[#5c3a1e] hover:bg-[#f3e6d4]"
                  onClick={() => window.print()}
                >
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-[#f3e6d4] text-[#3c2210] hover:bg-white"
                  onClick={() => void downloadPdf()}
                  disabled={pdfLoading}
                >
                  {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download PDF
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/10"
                  onClick={() => setPreviewOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="overflow-y-auto print:overflow-visible" ref={printRef}>
              <TicketHistoryPrintView report={report} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 font-medium text-slate-900">{value}</div>
    </div>
  );
}

/** Screen + print layout for the history report */
export function TicketHistoryPrintView({ report }: { report: TicketHistoryReportData }) {
  return (
    <article className="ticket-history-print mx-auto max-w-3xl bg-white px-6 py-8 sm:px-10 text-[13px] text-slate-800">
      <header className="mb-8 overflow-hidden rounded-xl bg-[#5c3a1e] text-white">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <img src="/vobiss-logo.png" alt="Vobiss" className="h-12 w-auto rounded bg-white p-1.5" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#e8d5bc]">VOBISS ERP</p>
              <p className="text-sm text-[#f3e6d4]">Ticket history report</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-bold">{report.ticket_id}</p>
            <p className="text-xs text-[#e8d5bc]">Generated {new Date().toLocaleString()}</p>
          </div>
        </div>
      </header>

      <h1 className="text-2xl font-bold tracking-tight text-[#3c2210]">{report.title}</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <Pill>Status: {report.status || '—'}</Pill>
        <Pill>Priority: {report.priority || '—'}</Pill>
        {report.category ? <Pill>{report.category}</Pill> : null}
        {report.escalation_stage ? <Pill>Stage: {report.escalation_stage}</Pill> : null}
      </div>

      <Section title="Overview">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Customer" value={`${report.customer_name || '—'}${report.customer_code ? ` (${report.customer_code})` : ''}`} />
          <Field label="Project" value={report.project_name || '—'} />
          <Field label="Started" value={fmt(report.started_at)} />
          <Field label="Ended" value={report.ended_at ? fmt(report.ended_at) : 'Still open'} />
          <Field label="Resolution time" value={report.resolution_time || '—'} />
          <Field label="Assignee" value={report.assignee_name || '—'} />
        </dl>
        {report.description ? (
          <p className="mt-4 whitespace-pre-wrap rounded-lg bg-[#f8f1e8] px-4 py-3 text-slate-700">{report.description}</p>
        ) : null}
        {!!report.tags?.length && (
          <p className="mt-3 text-xs text-slate-500">Tags: {report.tags.map((t) => t.name).join(', ')}</p>
        )}
      </Section>

      {(report.sla?.first_response_at || report.sla?.response_due_at || report.sla?.resolution_due_at) && (
        <Section title="SLA">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="First response" value={fmt(report.sla?.first_response_at)} />
            <Field label="Response due" value={fmt(report.sla?.response_due_at)} />
            <Field label="Resolution due" value={fmt(report.sla?.resolution_due_at)} />
          </dl>
        </Section>
      )}

      <Section title={`People who worked on it (${report.workers?.length || 0})`}>
        {!report.workers?.length ? (
          <p className="text-slate-500">No workers recorded.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {report.workers.map((w) => (
              <li key={w.id ?? w.fullName} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-900">{w.fullName}</p>
                  <p className="text-xs text-slate-500">{w.role || '—'}</p>
                </div>
                <p className="text-xs text-slate-500">
                  {w.activityCount ?? 0} actions
                  {w.firstActivity ? ` · first ${fmt(w.firstActivity)}` : ''}
                  {w.lastActivity ? ` · last ${fmt(w.lastActivity)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Material requests (${report.material_requests?.length || 0})`}>
        {!report.material_requests?.length ? (
          <p className="text-slate-500">None linked.</p>
        ) : (
          <ul className="space-y-2">
            {report.material_requests.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="font-semibold">
                  #{r.id} · {r.status}
                </p>
                <p className="text-slate-600">{r.purpose || '—'}</p>
                {!!r.items?.length && (
                  <ul className="mt-1 text-xs text-slate-500">
                    {r.items.map((it, i) => (
                      <li key={i}>
                        {it.name} × {it.quantity_requested}
                        {it.quantity_received != null ? ` (received ${it.quantity_received})` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Cash requests (${report.cash_requests?.length || 0})`}>
        {!report.cash_requests?.length ? (
          <p className="text-slate-500">None linked.</p>
        ) : (
          <ul className="space-y-2">
            {report.cash_requests.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="font-semibold">
                  #{r.id} · {r.status}
                  {r.total_amount != null ? ` · GHS ${r.total_amount}` : ''}
                </p>
                <p className="text-slate-600">{r.purpose || '—'}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Full timeline (${report.timeline?.length || 0})`}>
        {!report.timeline?.length ? (
          <p className="text-slate-500">No timeline entries.</p>
        ) : (
          <ol className="relative space-y-0 border-l-2 border-[#e0c4a0] pl-5">
            {report.timeline.map((entry, i) => (
              <li key={i} className="relative pb-5">
                <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--primary)] ring-4 ring-white" />
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{fmt(entry.created_at)}</p>
                <p className="font-semibold text-slate-900">
                  {entry.action || 'Update'}
                  {entry.actor_name ? ` — ${entry.actor_name}` : ''}
                  {entry.actor_role ? ` (${entry.actor_role})` : ''}
                </p>
                {entry.message ? <p className="mt-0.5 text-slate-600 whitespace-pre-wrap">{entry.message}</p> : null}
                {entry.visibility ? (
                  <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                    {entry.visibility}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <footer className="mt-10 border-t border-[#e0c4a0] pt-4 text-[11px] text-slate-500">
        Confidential — Vobiss Solutions Limited · {report.ticket_id}
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 border-b-2 border-[#f3e6d4] pb-1.5 text-sm font-bold uppercase tracking-wide text-[var(--primary)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-[#f3e6d4] px-2.5 py-1 text-[11px] font-semibold text-[#5c3a1e]">
      {children}
    </span>
  );
}
