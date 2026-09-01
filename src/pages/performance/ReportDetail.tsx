import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, FileText, Building2, Calendar, User, CheckCircle2, Circle, Paperclip,
  Upload, Send, ThumbsDown, Award, Gauge, ArrowUpRight, MessageSquare, UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import {
  getReport, submitReport, reviewReport, sendBackReport, finalizeReport, uploadDocuments, getNextReviewers,
  type PerformanceReport, type ReportTier, type ReviewerCandidate,
} from '@/api/performanceReports';
import { DocumentViewer } from '@/components/performance/DocumentViewer';

const TIER_ORDER: ReportTier[] = ['employee', 'supervisor', 'manager', 'cto'];
const TIER_LABEL: Record<string, string> = { employee: 'Employee', supervisor: 'Supervisor', manager: 'Manager', cto: 'CTO', done: 'Finalized' };

// Most real accounts carry their job title in `position` ("IP Supervisor", "Director") with
// role/main_role left generic ("admin"/"superadmin"/"user") — must match backend tierOfUser().
function tierOfUser(user: any): ReportTier {
  const role = String(user?.main_role || user?.role || '').toLowerCase();
  const position = String(user?.position || '').toLowerCase();
  if (['director', 'cto'].includes(role) || position === 'director' || position === 'cto') return 'cto';
  if (role.endsWith('_manager') || position.includes('manager')) return 'manager';
  if (role.endsWith('_supervisor') || position.includes('supervisor')) return 'supervisor';
  return 'employee';
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'finalized') return 'success';
  if (status === 'needs_revision') return 'danger';
  if (status === 'draft') return 'info';
  return 'warning';
}
function statusLabel(status: string) {
  return status.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState('');
  const [comments, setComments] = useState('');
  const [acting, setActing] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [candidates, setCandidates] = useState<ReviewerCandidate[]>([]);
  const [recipientId, setRecipientId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setReport(await getReport(id));
    } catch (e) {
      toast({ title: 'Could not load report', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  // Who could this go to next? Only relevant when submitting or forwarding (not finalizing —
  // the CTO is the end of the line). Lets the sender see the name(s) and, when a unit has more
  // than one Supervisor/Manager, choose which one.
  useEffect(() => {
    if (!report || !user) { setCandidates([]); setRecipientId(''); return; }
    const tier = tierOfUser(user);
    const isOwner = report.employee_id === user.id;
    const submitting = report.current_stage === 'employee' && isOwner && ['draft', 'needs_revision'].includes(report.status);
    const forwarding = report.current_stage !== 'employee' && report.current_stage === tier
      && ['submitted_supervisor', 'under_supervisor_review', 'submitted_manager', 'under_manager_review'].includes(report.status);
    if (!submitting && !forwarding) { setCandidates([]); setRecipientId(''); return; }
    let cancelled = false;
    getNextReviewers(report.id)
      .then((res) => {
        if (cancelled) return;
        setCandidates(res.candidates);
        setRecipientId(res.candidates.length === 1 ? String(res.candidates[0].id) : '');
      })
      .catch(() => { if (!cancelled) setCandidates([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id, report?.current_stage, report?.status, user?.id]);

  if (loading) {
    return <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6"><Skeleton className="h-24 w-full rounded-2xl" /><Skeleton className="h-96 w-full rounded-2xl" /></div>;
  }
  if (!report) return <div className="p-6 text-center text-sm text-[var(--text-muted)]">Report not found.</div>;

  const myTier = tierOfUser(user);
  const isOwner = report.employee_id === user?.id;
  const isMyTurn = report.current_stage === myTier || (report.current_stage === 'employee' && isOwner);
  const canSubmit = isOwner && ['draft', 'needs_revision'].includes(report.status) && report.current_stage === 'employee';
  const canReview = isMyTurn && myTier !== 'employee' && ['submitted_supervisor', 'under_supervisor_review', 'submitted_manager', 'under_manager_review', 'submitted_cto', 'under_cto_review'].includes(report.status);
  const canFinalize = myTier === 'cto' && report.current_stage === 'cto' && report.status !== 'finalized';
  const myScoreField = myTier !== 'employee' ? (report as any)[`${myTier}_score`] : null;

  const stageIndex = report.current_stage === 'done' ? 4 : TIER_ORDER.indexOf(report.current_stage as ReportTier);

  const doSubmit = async () => {
    if (candidates.length > 1 && !recipientId) return toast({ title: `Choose who to send this to`, variant: 'destructive' });
    setActing(true);
    try { await submitReport(report.id, recipientId ? Number(recipientId) : undefined); toast({ title: 'Report submitted' }); await load(); }
    catch (e) { toast({ title: 'Could not submit', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
    finally { setActing(false); }
  };

  const doReview = async () => {
    if (candidates.length > 1 && !recipientId) return toast({ title: `Choose who to send this to`, variant: 'destructive' });
    setActing(true);
    try {
      await reviewReport(report.id, { score: score ? Number(score) : undefined, comments: comments || undefined, recipientId: recipientId ? Number(recipientId) : undefined });
      toast({ title: 'Scored and forwarded' });
      setScore(''); setComments('');
      await load();
    } catch (e) { toast({ title: 'Could not submit review', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
    finally { setActing(false); }
  };

  const doFinalize = async () => {
    setActing(true);
    try {
      await finalizeReport(report.id, { score: score ? Number(score) : undefined, comments: comments || undefined });
      toast({ title: 'Report finalized' });
      await load();
    } catch (e) { toast({ title: 'Could not finalize', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
    finally { setActing(false); }
  };

  const doSendBack = async () => {
    if (!comments.trim()) return toast({ title: 'A comment is required to send back for revision', variant: 'destructive' });
    setSendingBack(true);
    try {
      await sendBackReport(report.id, comments);
      toast({ title: 'Sent back for revision' });
      setComments('');
      await load();
    } catch (e) { toast({ title: 'Could not send back', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
    finally { setSendingBack(false); }
  };

  const onFilesChosen = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      await uploadDocuments(report.id, Array.from(files));
      toast({ title: `${files.length} file(s) uploaded` });
      await load();
    } catch (e) { toast({ title: 'Upload failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Header */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <div className="border-b border-[var(--border)] bg-gradient-to-r from-[var(--accent-blue-light)] via-[var(--surface)] to-[var(--surface)] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Performance Report</p>
              <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{report.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-[var(--text-secondary)]">
                <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> {report.employee_name}</span>
                <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {(report.unit || 'unit').toUpperCase()}</span>
                <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {report.period?.name || '—'}</span>
                {report.recipient_name && report.current_stage !== 'done' && (
                  <span className="flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5" /> Sent to {report.recipient_name}</span>
                )}
              </div>
            </div>
            <StatusPill tone={statusTone(report.status)} className="!text-sm !px-3 !py-1.5">{statusLabel(report.status)}</StatusPill>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex items-center gap-2 overflow-x-auto px-6 py-5">
          {TIER_ORDER.map((tier, i) => {
            const done = i < stageIndex || report.current_stage === 'done';
            const active = i === stageIndex && report.current_stage !== 'done';
            return (
              <div key={tier} className="flex flex-1 items-center gap-2">
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${
                    done ? 'border-[var(--success-text)] bg-[var(--accent-green-light)] text-[var(--success-text)]'
                      : active ? 'border-[var(--primary)] bg-[var(--primary)] text-white shadow-[var(--shadow-sm)]'
                      : 'border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-muted)]'
                  }`}>
                    {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-4 w-4" />}
                  </span>
                  <span className={`text-[11px] font-semibold ${active ? 'text-[var(--primary)]' : done ? 'text-[var(--success-text)]' : 'text-[var(--text-muted)]'}`}>{TIER_LABEL[tier]}</span>
                </div>
                {i < TIER_ORDER.length - 1 && <div className={`h-0.5 flex-1 rounded ${done ? 'bg-[var(--success-text)]' : 'bg-[var(--border)]'}`} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          {report.summary && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <h2 className="mb-2 text-sm font-bold text-[var(--text-primary)]">Report Summary</h2>
              <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{report.summary}</p>
            </div>
          )}

          {/* Documents */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Paperclip className="h-4 w-4" /> Supporting Documents</h2>
              <div>
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx" className="hidden" onChange={(e) => onFilesChosen(e.target.files)} />
                <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> {uploading ? 'Uploading…' : 'Upload'}
                </Button>
              </div>
            </div>
            {!report.documents?.length ? (
              <p className="py-8 text-center text-sm text-[var(--text-muted)]">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-6">
                {report.documents.map((doc) => (
                  <div key={doc.id}>
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
                      <FileText className="h-3.5 w-3.5" /> {doc.original_name}
                      <span className="rounded-full bg-[var(--surface-secondary)] px-2 py-0.5 text-[10px] uppercase text-[var(--text-muted)]">{TIER_LABEL[doc.stage]}</span>
                    </div>
                    <DocumentViewer document={doc} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Review history */}
          {!!report.reviews?.length && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><MessageSquare className="h-4 w-4" /> Review History</h2>
              <div className="space-y-3">
                {report.reviews.map((r) => (
                  <div key={r.id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--text-primary)]">{r.reviewer_name} <span className="font-normal text-[var(--text-muted)]">— {TIER_LABEL[r.stage]}</span></span>
                      <span className="text-xs text-[var(--text-muted)]">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-xs uppercase tracking-wide text-[var(--primary)]">{r.action.replace('_', ' ')}{r.score != null ? ` · Score: ${r.score}` : ''}</p>
                    {r.comment_text && <p className="mt-1 text-[var(--text-secondary)]">{r.comment_text}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Side column */}
        <div className="space-y-6">
          {/* System Assessment — always visible */}
          <div className="overflow-hidden rounded-2xl border border-[var(--accent-blue-light)] bg-gradient-to-b from-[var(--accent-blue-light)] to-[var(--surface)] shadow-[var(--shadow-sm)]">
            <div className="p-5">
              <h2 className="mb-3 text-sm font-bold text-[var(--info-text)]">System Assessment</h2>
              <div className="mb-3 rounded-xl bg-white/70 p-4 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">System Score</p>
                <p className="text-3xl font-bold text-[var(--text-primary)]">{report.system_score != null ? report.system_score : '—'}</p>
              </div>
              <Button
                type="button" variant="outline" size="sm" className="w-full"
                onClick={() => navigate(isOwner ? '/my-assessment' : `/staff-assessment/${report.employee_id}`)}
              >
                View full breakdown in {isOwner ? 'My Assessment' : `${report.employee_name}'s Assessment`} <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Scoring panel */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Gauge className="h-4 w-4" /> Scoring</h2>
            <div className="space-y-2.5">
              {(['supervisor', 'manager', 'cto'] as const).map((tier) => {
                const s = (report as any)[`${tier}_score`];
                const c = (report as any)[`${tier}_comments`];
                return (
                  <div key={tier} className="rounded-xl border border-[var(--border)] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">{TIER_LABEL[tier]}</span>
                      <span className="text-sm font-bold text-[var(--text-primary)]">{s != null ? s : '—'}</span>
                    </div>
                    {c && <p className="mt-1 text-xs text-[var(--text-secondary)]">{c}</p>}
                  </div>
                );
              })}
              {report.final_score != null && (
                <div className="rounded-xl border border-[var(--accent-amber)]/40 bg-[var(--accent-amber-light)] p-3 text-center">
                  <span className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--warning-text)]"><Award className="h-3.5 w-3.5" /> Final Score</span>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{report.final_score}</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          {(canSubmit || canReview || canFinalize) && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <h2 className="mb-3 text-sm font-bold text-[var(--text-primary)]">Actions</h2>
              {canSubmit && (
                <div className="space-y-2.5">
                  {candidates.length > 0 && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                        Send to{candidates.length === 1 ? ` — ${candidates[0].name}` : ''}
                      </label>
                      {candidates.length > 1 && (
                        <Select value={recipientId} onValueChange={setRecipientId}>
                          <SelectTrigger><SelectValue placeholder="Choose who to send this to" /></SelectTrigger>
                          <SelectContent>
                            {candidates.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.position ? ` — ${c.position}` : ''}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                  <Button type="button" className="w-full" onClick={doSubmit} disabled={acting}>
                    <Send className="mr-1.5 h-4 w-4" /> {acting ? 'Submitting…' : 'Submit for Review'}
                  </Button>
                </div>
              )}
              {(canReview || canFinalize) && (
                <div className="space-y-2.5">
                  {canReview && !canFinalize && candidates.length > 0 && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                        Send to{candidates.length === 1 ? ` — ${candidates[0].name}` : ''}
                      </label>
                      {candidates.length > 1 && (
                        <Select value={recipientId} onValueChange={setRecipientId}>
                          <SelectTrigger><SelectValue placeholder="Choose who to send this to" /></SelectTrigger>
                          <SelectContent>
                            {candidates.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.position ? ` — ${c.position}` : ''}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Score (0-100){myScoreField != null ? ` — currently ${myScoreField}` : ''}</label>
                    <Input type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} placeholder="e.g. 85" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Comments</label>
                    <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} placeholder="Your feedback…" />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={doSendBack} disabled={sendingBack}>
                      <ThumbsDown className="mr-1.5 h-3.5 w-3.5" /> Send Back
                    </Button>
                    {canFinalize ? (
                      <Button type="button" className="flex-1" onClick={doFinalize} disabled={acting}>
                        <Award className="mr-1.5 h-3.5 w-3.5" /> {acting ? 'Finalizing…' : 'Finalize'}
                      </Button>
                    ) : (
                      <Button type="button" className="flex-1" onClick={doReview} disabled={acting}>
                        <Send className="mr-1.5 h-3.5 w-3.5" /> {acting ? 'Saving…' : 'Score & Forward'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
