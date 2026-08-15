import React from 'react';
import { Printer } from 'lucide-react';
import { formatTenure } from '@/api/hrSelf';
import { formatGhs } from '@/lib/taxCalculations';
import { Button } from '@/components/ui/button';
import { Avatar, StatusBadge } from './components';

function dash(value?: string | number | null) {
  const text = value == null ? '' : String(value).trim();
  return text || '—';
}

function dateOnly(value?: string | null) {
  if (!value) return '—';
  const text = String(value).slice(0, 10);
  return text || '—';
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{value || '—'}</p>
    </div>
  );
}

export function EmploymentRecord({
  employee,
  documents = [],
  heading = 'Employment Record',
}: {
  employee: any;
  documents?: { document_name?: string; category?: string; created_at?: string }[];
  heading?: string;
}) {
  if (!employee) return null;

  const print = () => window.print();
  const printedAt = new Date().toLocaleString();

  return (
    <div className="employment-print-sheet rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
      <style>{`
        @media print {
          @page { margin: 14mm; }
          html, body, #root, .app-shell, .staff-main-scroll {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            background: white !important;
          }
          body * { visibility: hidden !important; }
          .employment-print-sheet, .employment-print-sheet * { visibility: visible !important; }
          .employment-print-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            background: white !important;
          }
          .employment-print-hide { display: none !important; }
        }
      `}</style>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-secondary)] p-2">
            <img src="/vobiss-logo.png" alt="Vobiss" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Vobiss Solutions</p>
            <p className="text-sm text-[var(--text-secondary)]">{heading}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Confidential staff record</p>
          </div>
        </div>
        <Button type="button" variant="outline" className="employment-print-hide" onClick={print}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <Avatar name={employee.full_name} src={employee.photo_url} size="lg" />
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">{dash(employee.full_name)}</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {[employee.position, employee.department, employee.location].filter(Boolean).join(' · ') || '—'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-[var(--text-muted)]">EMP-{employee.id}</span>
            <StatusBadge status={employee.status} />
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Personal</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" value={dash(employee.email)} />
            <Field label="Phone" value={dash(employee.phone)} />
            <Field label="Location" value={dash(employee.location)} />
            <Field label="Status" value={dash(employee.status)} />
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Employment</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employment type" value={dash(employee.employment_type)} />
            <Field label="Position" value={dash(employee.position)} />
            <Field label="Department" value={dash(employee.department)} />
            <Field label="Line manager" value={dash(employee.line_manager)} />
            <Field label="Start date" value={dateOnly(employee.start_date)} />
            <Field label="Contract end" value={dateOnly(employee.contract_end_date)} />
            <Field label="Tenure" value={formatTenure(employee.start_date)} />
            <Field label="System role" value={dash(employee.system_role)} />
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Compensation</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Basic salary" value={formatGhs(Number(employee.basic_salary || 0))} />
            <Field label="Allowances" value={formatGhs(Number(employee.allowances || 0))} />
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Emergency contact</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={dash(employee.emergency_contact_name)} />
            <Field label="Phone" value={dash(employee.emergency_contact_phone)} />
          </div>
        </section>

        {documents.length > 0 && (
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Documents on file</p>
            <div className="space-y-2">
              {documents.map((doc, i) => (
                <div key={`${doc.document_name}-${i}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] py-2 text-sm last:border-b-0">
                  <span className="font-medium text-[var(--text-primary)]">{dash(doc.document_name)}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {dash(doc.category)}{doc.created_at ? ` · ${new Date(doc.created_at).toLocaleDateString()}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <p className="mt-6 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-muted)]">
        Printed {printedAt} · Vobiss Erp
      </p>
    </div>
  );
}
