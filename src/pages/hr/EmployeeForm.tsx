import React from 'react';
import { Plus, X } from 'lucide-react';
import { SYSTEM_ROLE_OPTIONS } from '@/api/hrSelf';
import { Button } from '@/components/ui/button';
import { Field, inputClass } from './components';

export const EMPLOYEE_DOC_CATEGORIES = ['Contract', 'ID', 'Certificate', 'Offer Letter', 'Warning Letter', 'Other'];

export const DEPARTMENT_OPTIONS = [
  { value: '', label: 'Select department' },
  { value: 'NOC', label: 'NOC (Network Operations Center)' },
  { value: 'IP', label: 'IP (Infrastructure & Provisioning)' },
  { value: 'TS', label: 'TS (Transmission Unit)' },
  { value: 'Project Unit', label: 'Project Unit' },
  { value: 'CX', label: 'CX (Customer Experience)' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Sales', label: 'Sales' },
  { value: 'Procurement', label: 'Procurement' },
  { value: 'Operations', label: 'Operations' },
  { value: 'HR', label: 'HR' },
];

export const POSITION_OPTIONS = [
  { value: 'Staff', label: 'Staff' },
  { value: 'Director', label: 'Director' },
  { value: 'NOC Manager', label: 'NOC Manager' },
  { value: 'IP Manager', label: 'IP Manager' },
  { value: 'TX Manager', label: 'TS Manager' },
  { value: 'Project Manager', label: 'Project Manager' },
  { value: 'IP Supervisor', label: 'IP Supervisor' },
  { value: 'NOC Supervisor', label: 'NOC Supervisor' },
  { value: 'TX Supervisor', label: 'TS Supervisor' },
  { value: 'Project Supervisor', label: 'Project Supervisor' },
  { value: 'Procurement', label: 'Procurement' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Engineer', label: 'Engineer' },
  { value: 'Account Manager', label: 'Account Manager' },
  { value: 'Relationship Officer', label: 'Relationship Officer' },
  { value: 'Customer Support', label: 'Customer Support' },
  { value: 'Sales', label: 'Sales' },
  { value: 'HR', label: 'HR' },
];

const DEPT_BY_ROLE: Record<string, string> = {
  noc: 'NOC',
  ip: 'IP',
  tx: 'TS',
  ts: 'TS',
  finance: 'Finance',
  cx: 'CX',
  project_unit: 'Project Unit',
  hr: 'HR',
};

function optionsWithCurrent(options: { value: string; label: string }[], current: string) {
  const value = String(current || '').trim();
  if (!value || options.some((opt) => opt.value === value)) return options;
  return [...options, { value, label: value }];
}

export type EmployeeDocDraft = {
  key: string;
  document_name: string;
  category: string;
  file: File | null;
};

export const emptyEmployeeForm = {
  full_name: '',
  email: '',
  phone: '',
  department: '',
  position: 'Staff',
  location: '',
  gender: '',
  employment_type: 'full-time',
  start_date: '',
  contract_end_date: '',
  basic_salary: '',
  allowances: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  line_manager: '',
  status: 'active',
  system_role: '',
};

export type EmployeeFormValues = typeof emptyEmployeeForm;

export function EmployeeForm({
  form,
  setForm,
  photo,
  setPhoto,
  submitting,
  onSubmit,
  onCancel,
  mode,
  managerNames = [],
  documents,
  setDocuments,
}: {
  form: EmployeeFormValues;
  setForm: (next: EmployeeFormValues) => void;
  photo: File | null;
  setPhoto: (file: File | null) => void;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  mode: 'add' | 'edit';
  managerNames?: string[];
  documents?: EmployeeDocDraft[];
  setDocuments?: (next: EmployeeDocDraft[]) => void;
}) {
  const update = (patch: Partial<EmployeeFormValues>) => setForm({ ...form, ...patch });

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Profile</p>
        <Field label="Full name" required><input className={inputClass} required value={form.full_name} onChange={(e) => update({ full_name: e.target.value })} /></Field>
        <Field label="Photo">
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
          {photo && <p className="mt-1 text-xs text-[var(--text-muted)]">{photo.name}</p>}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => update({ email: e.target.value })} /></Field>
          <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => update({ phone: e.target.value })} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Gender" required>
            <select className={inputClass} required value={form.gender} onChange={(e) => update({ gender: e.target.value })}>
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
          <Field label="Location">
            <input className={inputClass} placeholder="Office, site, or city" value={form.location} onChange={(e) => update({ location: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Department" required>
            <select className={inputClass} required value={form.department} onChange={(e) => update({ department: e.target.value })}>
              {optionsWithCurrent(DEPARTMENT_OPTIONS, form.department).map((opt) => (
                <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Position" optional hint="Choose Staff if they have no specific title.">
            <select className={inputClass} value={form.position} onChange={(e) => update({ position: e.target.value })}>
              {optionsWithCurrent(POSITION_OPTIONS, form.position).map((opt) => (
                <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Line manager">
          {managerNames.length > 0 ? (
            <select className={inputClass} value={form.line_manager} onChange={(e) => update({ line_manager: e.target.value })}>
              <option value="">Select…</option>
              {[form.line_manager, ...managerNames].filter((name, i, arr) => name && arr.indexOf(name) === i).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          ) : (
            <input className={inputClass} value={form.line_manager} onChange={(e) => update({ line_manager: e.target.value })} />
          )}
        </Field>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Employment</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Employment type">
            <select className={inputClass} value={form.employment_type} onChange={(e) => update({ employment_type: e.target.value })}>
              <option value="full-time">Full-time</option>
              <option value="part-time">Part-time</option>
              <option value="contract">Contract</option>
            </select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start date" required hint="The day this person joined Vobiss.">
            <input
              className={inputClass}
              type="date"
              required
              value={form.start_date}
              onChange={(e) => update({ start_date: e.target.value })}
            />
          </Field>
          <Field
            label="End date"
            optional
            hint={
              form.employment_type === 'contract'
                ? 'Leave blank if the contract end is not known yet.'
                : 'Leave blank for permanent or open-ended roles.'
            }
          >
            <input
              className={inputClass}
              type="date"
              min={form.start_date || undefined}
              value={form.contract_end_date}
              onChange={(e) => update({ contract_end_date: e.target.value })}
            />
            {form.contract_end_date && (
              <button
                type="button"
                className="mt-1 text-xs font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
                onClick={() => update({ contract_end_date: '' })}
              >
                Clear end date
              </button>
            )}
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Basic salary (GHS)"><input className={inputClass} type="number" value={form.basic_salary} onChange={(e) => update({ basic_salary: e.target.value })} /></Field>
          <Field label="Allowances"><input className={inputClass} type="number" value={form.allowances} onChange={(e) => update({ allowances: e.target.value })} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Emergency contact"><input className={inputClass} value={form.emergency_contact_name} onChange={(e) => update({ emergency_contact_name: e.target.value })} /></Field>
          <Field label="Emergency phone"><input className={inputClass} value={form.emergency_contact_phone} onChange={(e) => update({ emergency_contact_phone: e.target.value })} /></Field>
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">System access</p>
        <Field label="System Role">
          <select
            className={inputClass}
            value={form.system_role}
            onChange={(e) => {
              const system_role = e.target.value;
              update({
                system_role,
                department: form.department || DEPT_BY_ROLE[system_role] || form.department,
              });
            }}
          >
            {SYSTEM_ROLE_OPTIONS.map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <p className="text-xs text-[var(--text-muted)]">
          {mode === 'add'
            ? 'Choosing a role creates a Users login with matching unit and permissions. Choose “No System Access” to add the employee without a login.'
            : 'You can update the employee’s system role here. Leave as No System Access if they should not have a login.'}
        </p>
      </div>

      {mode === 'add' && documents && setDocuments && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Documents</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">Optional. Attach CV, ID, contract, certificates, and other files now.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDocuments([...documents, { key: `${Date.now()}-${documents.length}`, document_name: '', category: 'Certificate', file: null }])}
            >
              <Plus className="h-4 w-4" /> Add document
            </Button>
          </div>
          {documents.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">No documents added yet.</p>
          ) : documents.map((doc, index) => (
            <div key={doc.key} className="space-y-3 rounded-[var(--radius-sm)] border border-[var(--border)] p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[var(--text-primary)]">Document {index + 1}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDocuments(documents.filter((d) => d.key !== doc.key))}
                >
                  <X className="h-4 w-4" /> Remove
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <input
                    className={inputClass}
                    value={doc.document_name}
                    placeholder="CV, Certificate…"
                    onChange={(e) => setDocuments(documents.map((d) => d.key === doc.key ? { ...d, document_name: e.target.value } : d))}
                  />
                </Field>
                <Field label="Category">
                  <select
                    className={inputClass}
                    value={doc.category}
                    onChange={(e) => setDocuments(documents.map((d) => d.key === doc.key ? { ...d, category: e.target.value } : d))}
                  >
                    {EMPLOYEE_DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="File">
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setDocuments(documents.map((d) => d.key === doc.key ? {
                      ...d,
                      file,
                      document_name: d.document_name || (file ? file.name.replace(/\.[^.]+$/, '') : ''),
                    } : d));
                  }}
                />
                {doc.file && <p className="mt-1 text-xs text-[var(--text-muted)]">{doc.file.name}</p>}
              </Field>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : mode === 'add' ? 'Save employee' : 'Save changes'}</Button>
      </div>
    </form>
  );
}
