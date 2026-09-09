import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, inputClass } from '@/pages/hr/components';
import { useAuth } from '@/context/AuthContext';
import { hrSelfApi } from '@/api/hrSelf';
import { leaveSelfApi, LEAVE_QUERY, type RelieverCandidate } from '@/api/leave';
import { LeaveSignatureDialog } from './LeaveSignatureDialog';

type ClientTier = 'employee' | 'supervisor' | 'manager' | 'cto' | 'hr';

/** Mirrors backend/services/leave.js's classifyLeaverTier() exactly — used here only to decide
 *  which fields to show; the server independently re-derives and enforces the real tier. */
function clientTier(user: any): ClientTier {
  const role = String(user?.main_role || user?.role || '').toLowerCase();
  const position = String(user?.position || '').toLowerCase();
  const units = [user?.unit, ...(Array.isArray(user?.units) ? user.units : [])].map((u) => String(u || '').toLowerCase());
  if (role === 'hr' || units.includes('hr') || position === 'hr') return 'hr';
  if (['director', 'cto'].includes(role) || position === 'director' || position === 'cto') return 'cto';
  if (role.endsWith('_manager') || position.includes('manager')) return 'manager';
  if (role.endsWith('_supervisor') || position.includes('supervisor')) return 'supervisor';
  return 'employee';
}

function ApproverField({
  label,
  candidates,
  value,
  onChange,
}: {
  label: string;
  candidates: { id: number; first_name: string; last_name: string }[];
  value: number | '';
  onChange: (id: number) => void;
}) {
  if (candidates.length === 0) {
    return (
      <Field label={label}>
        <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--accent-amber)] bg-[var(--accent-amber-light)] px-3 py-2 text-xs text-[var(--warning-text)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>No {label.toLowerCase()} is set up for your unit yet — ask your admin or HR to add one.</span>
        </div>
      </Field>
    );
  }
  if (candidates.length === 1) {
    const c = candidates[0];
    return (
      <Field label={label} hint="Auto-filled — only one available for your unit">
        <input className={`${inputClass} bg-[var(--surface-secondary)]`} value={`${c.first_name} ${c.last_name}`} disabled />
      </Field>
    );
  }
  return (
    <Field label={label} required hint="Your unit has more than one — pick who this should go to">
      <select className={inputClass} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value="">Select {label.toLowerCase()}…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.first_name} {c.last_name}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function LeaveRequestForm({ onSubmitted }: { onSubmitted: () => void }) {
  const { user } = useAuth();
  const tier = useMemo(() => clientTier(user), [user]);
  const needsReliever = tier === 'employee' || tier === 'supervisor' || tier === 'manager';

  const meQ = useQuery({ queryKey: ['hr-self', 'me'], queryFn: hrSelfApi.me, ...LEAVE_QUERY });
  const categoriesQ = useQuery({ queryKey: ['leave', 'categories'], queryFn: leaveSelfApi.categories, ...LEAVE_QUERY });
  const approversQ = useQuery({
    queryKey: ['leave', 'approver-candidates'],
    queryFn: leaveSelfApi.approverCandidates,
    enabled: needsReliever,
    ...LEAVE_QUERY,
  });

  const [leaveType, setLeaveType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [contactDuringLeave, setContactDuringLeave] = useState('');
  const [relieverQuery, setRelieverQuery] = useState('');
  const [reliever, setReliever] = useState<RelieverCandidate | null>(null);
  const [handoverConfirmed, setHandoverConfirmed] = useState(false);
  const [supervisorApproverId, setSupervisorApproverId] = useState<number | ''>('');
  const [managerApproverId, setManagerApproverId] = useState<number | ''>('');
  const [days, setDays] = useState<number | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signOpen, setSignOpen] = useState(false);

  const relieverSearchQ = useQuery({
    queryKey: ['leave', 'reliever-search', relieverQuery],
    queryFn: () => leaveSelfApi.relieverCandidates(relieverQuery),
    enabled: relieverQuery.trim().length > 1 && !reliever,
    ...LEAVE_QUERY,
  });

  useEffect(() => {
    if (!leaveType && categoriesQ.data?.categories?.length) {
      setLeaveType(categoriesQ.data.categories[0].name);
    }
  }, [categoriesQ.data, leaveType]);

  useEffect(() => {
    if (!startDate || !endDate || endDate < startDate) {
      setDays(null);
      return;
    }
    let cancelled = false;
    leaveSelfApi
      .previewDays(startDate, endDate)
      .then((r) => {
        if (!cancelled) setDays(r.days);
      })
      .catch(() => {
        if (!cancelled) setDays(null);
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  const supervisorCandidates = approversQ.data?.supervisor || [];
  const managerCandidates = approversQ.data?.manager || [];
  const emp = meQ.data;

  const resetForm = () => {
    setStartDate('');
    setEndDate('');
    setReason('');
    setContactDuringLeave('');
    setReliever(null);
    setRelieverQuery('');
    setHandoverConfirmed(false);
    setSupervisorApproverId('');
    setManagerApproverId('');
    setDays(null);
    setAttachment(null);
  };

  const validateBeforeSign = (): boolean => {
    if (!leaveType) {
      toast.error('Select a leave type');
      return false;
    }
    if (!startDate || !endDate || endDate < startDate) {
      toast.error('Select a valid date range');
      return false;
    }
    if (!reason.trim()) {
      toast.error('Enter a reason for leave');
      return false;
    }
    if (needsReliever) {
      if (!reliever) {
        toast.error('Select a reliever');
        return false;
      }
      if (!contactDuringLeave.trim()) {
        toast.error('Enter your contact during leave');
        return false;
      }
      if (!handoverConfirmed) {
        toast.error('Confirm the handover statement');
        return false;
      }
      if (supervisorCandidates.length > 1 && !supervisorApproverId) {
        toast.error('Select a supervisor to send this request to');
        return false;
      }
      if (managerCandidates.length > 1 && !managerApproverId) {
        toast.error('Select a manager to send this request to');
        return false;
      }
    }
    return true;
  };

  const submit = async (signature: string) => {
    setSubmitting(true);
    try {
      await leaveSelfApi.submit({
        leaveType,
        startDate,
        endDate,
        reason: reason.trim(),
        contactDuringLeave: needsReliever ? contactDuringLeave.trim() : undefined,
        relieverId: needsReliever ? reliever?.id : undefined,
        employeeSignature: needsReliever ? signature : undefined,
        handoverConfirmed: needsReliever ? handoverConfirmed : undefined,
        supervisorApproverId: supervisorApproverId || undefined,
        managerApproverId: managerApproverId || undefined,
        attachment,
      });
      toast.success('Leave request submitted');
      resetForm();
      setSignOpen(false);
      onSubmitted();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Employee Information</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Employee Name">
            <input className={inputClass} value={emp?.full_name || ''} disabled />
          </Field>
          <Field label="Staff ID">
            <input className={inputClass} value={emp ? `EMP-${String(emp.id).padStart(3, '0')}` : ''} disabled />
          </Field>
          <Field label="Department">
            <input className={inputClass} value={emp?.department || ''} disabled />
          </Field>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Leave Details</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Leave Type" required>
            <select className={inputClass} value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
              {(categoriesQ.data?.categories || []).map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Number of Days" hint="Excludes weekends and public holidays">
            <input className={inputClass} value={days ?? ''} disabled placeholder="Pick dates first" />
          </Field>
          <Field label="Start Date" required>
            <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End Date" required>
            <input type="date" className={inputClass} value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Reason for Leave" required>
            <textarea
              className={`${inputClass} h-auto min-h-[88px] py-2`}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Attachment" optional hint="Everyone in the approval chain can view this — e.g. a medical note or supporting document.">
            <input
              type="file"
              className={inputClass}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={(e) => setAttachment(e.target.files?.[0] || null)}
            />
          </Field>
        </div>
      </div>

      {needsReliever && (
        <>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Reliever &amp; Approvers</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Reliever" required>
                {reliever ? (
                  <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm">
                    <span className="font-medium text-[var(--text-primary)]">{reliever.full_name}</span>
                    <button type="button" className="text-xs font-medium text-[var(--primary)]" onClick={() => setReliever(null)}>
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      className={inputClass}
                      placeholder="Search staff by name…"
                      value={relieverQuery}
                      onChange={(e) => setRelieverQuery(e.target.value)}
                    />
                    {relieverQuery.trim().length > 1 && (
                      <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
                        {(relieverSearchQ.data?.candidates || []).length === 0 ? (
                          <p className="p-3 text-sm text-[var(--text-muted)]">No eligible staff found.</p>
                        ) : (
                          relieverSearchQ.data!.candidates.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="block w-full border-b border-[var(--border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--surface-secondary)]"
                              onClick={() => {
                                setReliever(c);
                                setRelieverQuery('');
                              }}
                            >
                              <span className="font-medium text-[var(--text-primary)]">{c.full_name}</span>
                              <span className="ml-2 text-xs text-[var(--text-muted)]">{c.position || ''}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Field>
              <Field label="Contact During Leave" required>
                <input
                  className={inputClass}
                  value={contactDuringLeave}
                  onChange={(e) => setContactDuringLeave(e.target.value)}
                  placeholder="Phone or email"
                />
              </Field>
              <ApproverField label="Supervisor" candidates={supervisorCandidates} value={supervisorApproverId} onChange={setSupervisorApproverId} />
              <ApproverField label="Manager" candidates={managerCandidates} value={managerApproverId} onChange={setManagerApproverId} />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Handover Confirmation</h3>
            <label className="flex items-start gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-secondary)] p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={handoverConfirmed}
                onChange={(e) => setHandoverConfirmed(e.target.checked)}
              />
              <span>I confirm that tasks will be handed over to the reliever/appropriate personnel before proceeding on leave.</span>
            </label>
          </div>
        </>
      )}

      <div className="flex justify-end">
        <Button
          disabled={submitting}
          onClick={() => {
            if (validateBeforeSign()) setSignOpen(true);
          }}
        >
          {submitting ? 'Submitting…' : 'Submit Leave Request'}
        </Button>
      </div>

      <LeaveSignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        title="Sign & Submit Leave Request"
        description="Type your initials to digitally sign this request before it's sent for approval."
        confirmLabel="Sign & Submit"
        pending={submitting}
        onConfirm={submit}
      />
    </div>
  );
}
