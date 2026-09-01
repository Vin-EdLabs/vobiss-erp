import React, { useState } from 'react';
import { Download, FileBarChart, Loader2, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { pdf } from '@react-pdf/renderer';
import { Button } from '@/components/ui/button';
import { buildServiceRequestReport, formatMinutes, type ServiceRequestReportData } from '@/lib/serviceRequestReport';
import { ServiceRequestHistoryPdf } from './ServiceRequestHistoryPdf';

function fmt(v?: string | null) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString(); } catch { return String(v); }
}

/** "Full Report" for one Service Request — the 360° flow's end-to-end, downloadable document:
 *  every stage it passed through, who worked it and how long, every comment, attachment, and
 *  linked Transport/IP Circuit record. Mirrors TicketFullReportPanel's PDF/print pattern. */
export function ServiceRequestReportButton({ requestId, variant = 'outline', size = 'sm' }: {
  requestId: number;
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
}) {
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [report, setReport] = useState<ServiceRequestReportData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const ensureReport = async () => {
    if (report) return report;
    setLoading(true);
    try {
      const data = await buildServiceRequestReport(requestId);
      setReport(data);
      return data;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to build the report');
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const openPreview = async () => {
    try {
      await ensureReport();
      setPreviewOpen(true);
    } catch { /* toasted in ensureReport */ }
  };

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const data = await ensureReport();
      const blob = await pdf(<ServiceRequestHistoryPdf report={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.reference}-history-report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => void openPreview()} disabled={loading}>
        {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileBarChart className="mr-1.5 h-4 w-4" />}
        Full Report
      </Button>

      {previewOpen && report && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3 sm:p-6 print:static print:inset-auto print:bg-white print:p-0">
          <div className="relative flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:max-w-none print:rounded-none print:shadow-none">
            <div className="sr-report-hide flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-[#1e2a6e] px-4 py-3 text-white">
              <div>
                <p className="text-sm font-semibold">Service Request full report</p>
                <p className="text-xs text-indigo-200">{report.reference}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" className="bg-white text-[#1e2a6e] hover:bg-indigo-50" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
                <Button type="button" size="sm" className="bg-indigo-200 text-[#1e2a6e] hover:bg-white" onClick={() => void downloadPdf()} disabled={pdfLoading}>
                  {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download PDF
                </Button>
                <Button type="button" size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => setPreviewOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="overflow-y-auto print:overflow-visible">
              <ServiceRequestHistoryPrintView report={report} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ServiceRequestHistoryPrintView({ report }: { report: ServiceRequestReportData }) {
  return (
    <article className="sr-history-print mx-auto max-w-3xl bg-white px-6 py-8 sm:px-10 text-[13px] text-slate-800">
      <header className="mb-8 overflow-hidden rounded-xl bg-[#1e2a6e] text-white">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <img src="/vobiss-logo.png" alt="Vobiss" className="h-12 w-auto rounded bg-white p-1.5" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-200">VOBISS ERP</p>
              <p className="text-sm text-indigo-100">Service Request — full lifecycle report</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-bold">{report.reference}</p>
            <p className="text-xs text-indigo-200">Generated {new Date().toLocaleString()}</p>
          </div>
        </div>
      </header>

      <h1 className="text-2xl font-bold tracking-tight text-[#1e2a6e]">{report.customer_name} — {report.site_name}</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <Pill>Status: {report.status}</Pill>
        <Pill>Stage: {report.current_stage_label}</Pill>
        {report.service_type ? <Pill>{report.service_type}</Pill> : null}
        {report.turnaround.slaStatus ? <Pill>SLA: {report.turnaround.slaStatus}</Pill> : null}
      </div>

      <Section title="Overview">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Customer" value={report.customer_name || '—'} />
          <Field label="Site" value={report.site_name || '—'} />
          <Field label="Location" value={report.location || '—'} />
          <Field label="Region" value={report.region || '—'} />
          <Field label="Created by" value={report.created_by_name || '—'} />
          <Field label="Submitted" value={fmt(report.created_at)} />
          <Field label="Design confirmed" value={report.design_confirmed_at ? fmt(report.design_confirmed_at) : 'Not yet confirmed'} />
          <Field label="Last updated" value={fmt(report.updated_at)} />
          <Field label="Total elapsed" value={`${formatMinutes(report.turnaround.totalElapsedMinutes)}${report.turnaround.isOpen ? ' (still open)' : ''}`} />
        </dl>
        {(report.circuit_id || report.ip_address || report.mac_address) ? (
          <p className="mt-4 rounded-lg bg-indigo-50 px-4 py-3 text-slate-700">
            Circuit {report.circuit_id || '—'} · IP {report.ip_address || '—'} · MAC {report.mac_address || '—'}
            {report.integrated_by ? ` · Integrated by ${report.integrated_by}` : ''}
          </p>
        ) : null}
      </Section>

      <Section title={`Stage-by-stage timing (${report.stageBreakdown.length})`}>
        {!report.stageBreakdown.length ? (
          <p className="text-slate-500">No timing data recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {report.stageBreakdown.map((s, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-900">{s.stageLabel}{s.unitSlug ? ` (${s.unitSlug.toUpperCase()})` : ''}</p>
                  <p className="text-xs text-slate-500">{s.userFullName || 'Unassigned'}</p>
                </div>
                <p className="text-xs text-slate-500">
                  {fmt(s.startedAt)} → {s.endedAt ? fmt(s.endedAt) : 'in progress'} · {formatMinutes(s.minutes)} · SLA: {s.slaStatus}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {report.designMaterials.length > 0 && (
        <Section title={`Design material request (${report.designMaterials.length})`}>
          <ul className="space-y-2">
            {report.designMaterials.map((m, i) => (
              <li key={i} className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="font-semibold">{m.material_name}</p>
                <p className="text-slate-600">{m.quantity} {m.unit} · GHS {Number(m.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })} each</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={`Linked records (${report.linkedReferences.length})`}>
        {!report.linkedReferences.length ? (
          <p className="text-slate-500">No Transport, IP Circuit, or other linked records yet.</p>
        ) : (
          <ul className="space-y-2">
            {report.linkedReferences.map((l, i) => (
              <li key={i} className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="font-semibold">{l.typeLabel} — {l.referenceNumber || l.title || '—'}</p>
                <p className="text-slate-600">{l.title || ''} · Status: {l.status || '—'} · added by {l.createdByName} on {fmt(l.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`All attachments (${report.attachments.length})`}>
        {!report.attachments.length ? (
          <p className="text-slate-500">No attachments uploaded.</p>
        ) : (
          <ul className="space-y-2">
            {report.attachments.map((a, i) => (
              <li key={i} className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="font-semibold">{a.file_name}</p>
                <p className="text-slate-600">{a.stage_label} · uploaded by {a.uploader_name} on {fmt(a.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Full cross-unit timeline (${report.remarks.length})`}>
        {!report.remarks.length ? (
          <p className="text-slate-500">No comments or remarks recorded.</p>
        ) : (
          <ol className="relative space-y-0 border-l-2 border-indigo-200 pl-5">
            {report.remarks.map((m, i) => (
              <li key={i} className="relative pb-5">
                <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--primary)] ring-4 ring-white" />
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{fmt(m.created_at)} · {m.stage_label}</p>
                <p className="font-semibold text-slate-900">{m.author_name}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{m.comment_text}</p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <footer className="mt-10 border-t border-indigo-200 pt-4 text-[11px] text-slate-500">
        Confidential — Vobiss Solutions Limited · {report.reference}
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 border-b-2 border-indigo-100 pb-1.5 text-sm font-bold uppercase tracking-wide text-[var(--primary)]">
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
    <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-[#1e2a6e]">
      {children}
    </span>
  );
}
