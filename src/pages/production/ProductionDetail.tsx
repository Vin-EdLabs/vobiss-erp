import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  FileText,
  MessageSquare,
  RefreshCw,
  Send,
  User,
} from 'lucide-react';
import { ProductionPageShell } from '@/components/production/ProductionPageShell';
import { DetailCard, FormField, InfoField, InfoGrid } from '@/components/production/production-ui';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { RemarksThread } from '@/components/production/RemarksThread';
import { AttachmentZone } from '@/components/production/AttachmentZone';
import { PipelineHistory } from '@/components/production/PipelineHistory';
import { SubmittedRequestDetails, IpIntegrationDetails } from '@/components/production/SubmittedRequestDetails';
import { ProjectRequestDetailHeader } from '@/components/production/ProjectRequestDetailHeader';
import {
  getProjectRequest,
  addProjectRequestRemark,
  uploadProjectRequestAttachment,
  tsAcceptProjectRequest,
  ipForwardProjectRequest,
  projectCompleteProjectRequest,
  type ProjectRequest,
} from '@/api/project';

type WorkflowView = 'project' | 'ts' | 'ip' | 'noc';

export default function ProductionDetail() {
  const { id, unitSlug } = useParams<{ id: string; unitSlug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [request, setRequest] = useState<(ProjectRequest & { fullPipeline?: boolean }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [ipForm, setIpForm] = useState({
    circuit_id: '',
    integration_date: '',
    ip_address: '',
    mac_address: '',
    integrated_by: '',
    comment: '',
  });

  const units: string[] = Array.isArray(user?.units) ? user.units : [];
  const isAdmin = user?.role === 'superadmin' || user?.main_role === 'superadmin';
  const isTs = isAdmin || units.includes('ts');
  const isIp = isAdmin || units.includes('ip');
  const isNoc = isAdmin || units.includes('noc');
  const isProject = isAdmin || units.includes('project');
  const isCreator = request?.created_by_user_id === user?.id;
  const fullPipeline = request?.fullPipeline ?? (units.includes('project') || isAdmin);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await getProjectRequest(parseInt(id, 10));
      setRequest(data);
      const ipRemarks = (data.remarks || []).filter((r) => r.stage === 'ip');
      const latestIpComment = ipRemarks.length ? ipRemarks[ipRemarks.length - 1].comment_text : '';
      setIpForm({
        circuit_id: data.circuit_id || '',
        integration_date: data.integration_date?.slice(0, 10) || '',
        ip_address: data.ip_address || '',
        mac_address: data.mac_address || '',
        integrated_by: data.integrated_by || '',
        comment: latestIpComment,
      });
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to load',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    await load();
  };

  const backTo = `/project-request/${unitSlug || 'project'}`;
  const backLabel =
    unitSlug === 'project'
      ? 'Back to Project Unit'
      : unitSlug === 'ts'
        ? 'Back to TS'
        : unitSlug === 'ip'
          ? 'Back to IP'
          : unitSlug === 'noc'
            ? 'Back to NOC'
            : 'Back';

  if (loading || !request) {
    return (
      <ProductionPageShell backTo={backTo} backLabel={backLabel} unitSlug={unitSlug}>
        <div className="flex flex-col items-center justify-center py-24">
          <RefreshCw className="mb-4 h-10 w-10 animate-spin text-indigo-600" />
          <p className="text-sm text-[var(--text-secondary)]">Loading request details…</p>
        </div>
      </ProductionPageShell>
    );
  }

  const workflowView: WorkflowView =
    unitSlug === 'ts' || unitSlug === 'ip' || unitSlug === 'noc'
      ? unitSlug
      : fullPipeline
        ? 'project'
        : 'project';

  const canTsAct =
    workflowView === 'ts' &&
    isTs &&
    request.current_stage === 'ts' &&
    request.status === 'pending';
  const canIpAct =
    workflowView === 'ip' &&
    isIp &&
    request.current_stage === 'ip' &&
    request.status === 'ongoing';
  const isLocked =
    request.status === 'completed' || request.current_stage === 'done';

  const awaitingProjectSignOff =
    request.status === 'integrated' || request.status === 'noc_approved';
  const canProjectComplete =
    workflowView === 'project' &&
    (isProject || isCreator || isAdmin) &&
    !isLocked &&
    awaitingProjectSignOff;

  const showIpIntegration =
    !!(request.circuit_id || request.ip_address || request.mac_address || request.integrated_by);

  const remarks = request.remarks || [];
  const attachments = request.attachments || [];
  const ipRemarks = remarks.filter((r) => r.stage === 'ip');
  const ipAttachments = attachments.filter((a) => a.stage === 'ip');

  const ipForwardPayload = () => {
    const { comment, ...fields } = ipForm;
    return { ...fields, comment_text: comment.trim() || undefined };
  };

  const formatDate = (d?: string | null) =>
    d
      ? new Date(d).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : '—';

  return (
    <ProductionPageShell
      backTo={backTo}
      backLabel={backLabel}
      header={<ProjectRequestDetailHeader request={request} />}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* ── Project Unit: full monitor view (no tabs) ── */}
          {workflowView === 'project' && (
            <>
              <SubmittedRequestDetails request={request} />
              {showIpIntegration && <IpIntegrationDetails request={request} />}
              {canProjectComplete && (
                <DetailCard title="Project Unit — mark complete" icon={Check}>
                  <p className="mb-4 text-sm text-[var(--text-secondary)]">
                    IP has submitted integration details. Review the IP work, then mark this request
                    complete.
                  </p>
                  <Button
                    type="button"
                    disabled={actionLoading}
                    className="w-full rounded-xl bg-emerald-600 py-6 text-base font-semibold hover:bg-emerald-700"
                    onClick={async () => {
                      setActionLoading(true);
                      try {
                        await projectCompleteProjectRequest(request.id);
                        toast({ title: 'Request completed', description: 'Recorded as completed' });
                        await refresh();
                      } catch (e: unknown) {
                        toast({
                          title: 'Could not complete',
                          description: e instanceof Error ? e.message : 'Something went wrong',
                          variant: 'destructive',
                        });
                      } finally {
                        setActionLoading(false);
                      }
                    }}
                  >
                    <Check className="mr-2 h-5 w-5" />
                    {actionLoading ? 'Completing…' : 'Mark as complete'}
                  </Button>
                </DetailCard>
              )}
              <DetailCard title="All attachments" icon={FileText}>
                <AttachmentZone
                  attachments={attachments}
                  allowUpload={!isLocked && (!!isCreator || isAdmin)}
                  onUpload={async (file) => {
                    await uploadProjectRequestAttachment(request.id, file, 'project');
                    await refresh();
                  }}
                />
              </DetailCard>
              <DetailCard title="Comment / Remarks" icon={MessageSquare}>
                <PipelineHistory request={request} remarks={remarks} />
              </DetailCard>
              {isLocked && (
                <p className="rounded-xl border border-transparent bg-[var(--accent-green-light)] px-4 py-3 text-sm text-[var(--success-text)]">
                  This request is complete. No further uploads or comments are allowed.
                </p>
              )}
              {!isLocked && !canProjectComplete && (isCreator || isProject || isAdmin) && (
                <DetailCard title="Add comment (Project Unit)" icon={MessageSquare}>
                  <RemarksThread
                    remarks={remarks}
                    stage="project"
                    onlyAdd
                    addLabel="Add a Project Unit comment"
                    disabled={isLocked}
                    onAdd={async (text) => {
                      await addProjectRequestRemark(request.id, text, 'project');
                      await refresh();
                    }}
                  />
                </DetailCard>
              )}
            </>
          )}

          {/* ── TX: view -> remarks -> send to IP ── */}
          {workflowView === 'ts' && (
            <>
              <SubmittedRequestDetails request={request} />
              <DetailCard title="All attachments" icon={FileText}>
                <AttachmentZone attachments={attachments} allowUpload={false} />
              </DetailCard>
              <DetailCard title="Comment / Remarks" icon={MessageSquare}>
                <PipelineHistory request={request} remarks={remarks} />
              </DetailCard>
              <DetailCard title="TS — your action" icon={MessageSquare}>
                <RemarksThread
                  remarks={remarks}
                  stage="ts"
                  onlyAdd
                  addLabel="Add your TS comment (Project Unit comments stay in history above)"
                  disabled={isLocked || (!canTsAct && !isAdmin)}
                  onAdd={async (text) => {
                    await addProjectRequestRemark(request.id, text, 'ts');
                    await refresh();
                  }}
                />
                {canTsAct && !isLocked && (
                  <div className="mt-6 flex flex-col gap-3 border-t border-[var(--border)] pt-6">
                    <Button
                      className="w-full rounded-xl bg-indigo-600 py-6 text-base font-semibold hover:bg-indigo-700"
                      disabled={actionLoading}
                      onClick={async () => {
                        setActionLoading(true);
                        try {
                          await tsAcceptProjectRequest(request.id, 'ip');
                          toast({
                            title: 'Sent to IP',
                            description: 'Request is now with IP for integration',
                          });
                          await refresh();
                          navigate(`/project-request/ip/${request.id}`);
                        } finally {
                          setActionLoading(false);
                        }
                      }}
                    >
                      <Send className="mr-2 h-5 w-5" />
                      Send to IP
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full rounded-xl py-6 text-base font-semibold"
                      disabled={actionLoading}
                      onClick={async () => {
                        setActionLoading(true);
                        try {
                          await tsAcceptProjectRequest(request.id, 'project');
                          toast({
                            title: 'Sent to Project',
                            description: 'Request returned to Project Unit for review',
                          });
                          await refresh();
                          navigate(`/project-request/project/${request.id}`);
                        } finally {
                          setActionLoading(false);
                        }
                      }}
                    >
                      <Send className="mr-2 h-5 w-5" />
                      Send to Project
                    </Button>
                  </div>
                )}
              </DetailCard>
              {canTsAct && !isLocked && (
                <DetailCard title="TS attachments" icon={FileText}>
                  <AttachmentZone
                    attachments={attachments}
                    allowUpload
                    onUpload={async (file) => {
                      await uploadProjectRequestAttachment(request.id, file, 'ts');
                      await refresh();
                    }}
                  />
                </DetailCard>
              )}
            </>
          )}

          {/* ── IP: form on top → remarks → send to NOC ── */}
          {workflowView === 'ip' && (
            <>
              <SubmittedRequestDetails request={request} />
              <DetailCard title="Comment / Remarks" icon={MessageSquare}>
                <PipelineHistory request={request} remarks={remarks} />
              </DetailCard>
              <DetailCard title="All attachments" icon={FileText}>
                <AttachmentZone attachments={attachments} allowUpload={false} />
              </DetailCard>
              <DetailCard title="IP integration" icon={FileText}>
                {canIpAct ? (
                  <>
                    <p className="mb-4 text-sm text-[var(--text-secondary)]">
                      Fill in integration details below. Comment is optional and is only sent when you
                      submit to Project Unit and NOC.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        label="Circuit ID"
                        value={ipForm.circuit_id}
                        onChange={(v) => setIpForm((f) => ({ ...f, circuit_id: v }))}
                      />
                      <FormField
                        label="Integration Date"
                        type="date"
                        value={ipForm.integration_date}
                        onChange={(v) => setIpForm((f) => ({ ...f, integration_date: v }))}
                      />
                      <FormField
                        label="IP Address"
                        value={ipForm.ip_address}
                        onChange={(v) => setIpForm((f) => ({ ...f, ip_address: v }))}
                      />
                      <FormField
                        label="MAC Address"
                        value={ipForm.mac_address}
                        onChange={(v) => setIpForm((f) => ({ ...f, mac_address: v }))}
                      />
                      <FormField
                        label="Integrated By"
                        value={ipForm.integrated_by}
                        onChange={(v) => setIpForm((f) => ({ ...f, integrated_by: v }))}
                        className="sm:col-span-2"
                      />
                      <FormField
                        label="Comment (optional)"
                        as="textarea"
                        value={ipForm.comment}
                        onChange={(v) => setIpForm((f) => ({ ...f, comment: v }))}
                        placeholder="Optional notes for NOC — not required to send"
                        className="sm:col-span-2"
                      />
                    </div>
                    <div className="mt-6 flex flex-col gap-3 border-t border-[var(--border)] pt-6">
                      <Button
                        type="button"
                        disabled={actionLoading}
                        className="w-full rounded-xl bg-indigo-600 py-6 text-base font-semibold hover:bg-indigo-700"
                        onClick={async () => {
                          setActionLoading(true);
                          try {
                            await ipForwardProjectRequest(request.id, {
                              ...ipForwardPayload(),
                              route_to_stage: 'project',
                            });
                            toast({
                              title: 'Submitted',
                              description: 'Sent to Project Unit for review',
                            });
                            await refresh();
                            navigate(`/project-request/project/${request.id}`);
                          } catch (e: unknown) {
                            toast({
                              title: 'Could not send',
                              description: e instanceof Error ? e.message : 'Something went wrong',
                              variant: 'destructive',
                            });
                          } finally {
                            setActionLoading(false);
                          }
                        }}
                      >
                        <Send className="mr-2 h-5 w-5" />
                        Submit to Project
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={actionLoading}
                        className="w-full rounded-xl py-6 text-base font-semibold"
                        onClick={async () => {
                          setActionLoading(true);
                          try {
                            await ipForwardProjectRequest(request.id, {
                              ...ipForwardPayload(),
                              route_to_stage: 'ts',
                            });
                            toast({
                              title: 'Submitted',
                              description: 'Sent back to TS for follow-up',
                            });
                            await refresh();
                            navigate(`/project-request/ts/${request.id}`);
                          } catch (e: unknown) {
                            toast({
                              title: 'Could not send',
                              description: e instanceof Error ? e.message : 'Something went wrong',
                              variant: 'destructive',
                            });
                          } finally {
                            setActionLoading(false);
                          }
                        }}
                      >
                        <Send className="mr-2 h-5 w-5" />
                        Submit to TS
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">
                    This request is no longer at the IP stage.
                  </p>
                )}
              </DetailCard>

              {canIpAct && !isLocked && (
                <DetailCard title="IP attachments" icon={FileText}>
                  <AttachmentZone
                    attachments={attachments}
                    allowUpload
                    onUpload={async (file) => {
                      await uploadProjectRequestAttachment(request.id, file, 'ip');
                      await refresh();
                    }}
                  />
                </DetailCard>
              )}
            </>
          )}

          {/* ── NOC: IP work only (read-only); Project Unit marks complete ── */}
          {workflowView === 'noc' && (
            <>
              <div className="rounded-2xl border border-amber-200/60 bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950 p-5 text-white shadow-lg sm:p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300/90">
                  NOC review stage
                </p>
                <h2 className="mt-1 text-lg font-bold sm:text-xl">IP integration package</h2>
                <p className="mt-2 max-w-2xl text-sm text-white/75">
                  Review what IP submitted before Project Unit signs off. You cannot edit fields here —
                  use tickets for live network issues.
                </p>
              </div>
              {showIpIntegration ? (
                <DetailCard title="Integration summary" icon={FileText} accent="noc">
                  <IpIntegrationDetails request={request} />
                </DetailCard>
              ) : (
                <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 px-6 py-12 text-center">
                  <p className="text-sm font-medium text-amber-900">Waiting for IP submission</p>
                  <p className="mt-1 text-xs text-amber-800/80">
                    This request will appear here once IP completes integration details.
                  </p>
                </div>
              )}
              <DetailCard title="IP attachments" icon={FileText} accent="noc">
                <AttachmentZone attachments={ipAttachments} allowUpload={false} />
              </DetailCard>
              {ipRemarks.length > 0 && (
                <DetailCard title="IP comments" icon={MessageSquare} accent="noc">
                  <RemarksThread remarks={ipRemarks} stage="ip" readOnly />
                </DetailCard>
              )}
            </>
          )}
        </div>

        <aside className="min-w-0 space-y-6">
          <DetailCard title="Request details">
            <div className="space-y-4">
              <InfoField label="Status" value={request.status} />
              <InfoField label="Current stage" value={request.current_stage?.toUpperCase()} />
              <InfoField label="Service type" value={request.service_type} />
              <InfoField label="Created by" value={request.created_by_name} />
              <InfoField label="Submitted" value={formatDate(request.created_at)} />
              <InfoField label="Last updated" value={formatDate(request.updated_at)} />
            </div>
          </DetailCard>
        </aside>
      </div>
    </ProductionPageShell>
  );
}

const summaryFields = [
  'customer_name',
  'site_name',
  'location',
  'region',
  'capacity',
  'bandwidth',
  'service_type',
  'cpe',
];

function NocLimitedView({
  request,
  remarks,
}: {
  request: ProjectRequest;
  remarks: { stage: string; comment_text: string; author_name: string; created_at: string }[];
}) {
  const ipRemarks = remarks.filter((r) => r.stage === 'ip');
  return (
    <div className="space-y-4">
      <InfoGrid>
        <InfoField label="Customer" value={request.customer_name} />
        <InfoField label="Site" value={request.site_name} />
        <InfoField label="Location" value={request.location} />
        <InfoField label="IP Address" value={request.ip_address} />
        <InfoField label="MAC Address" value={request.mac_address} />
        <InfoField label="Circuit ID" value={request.circuit_id} />
      </InfoGrid>
      {ipRemarks.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--text-body)]">IP remarks</p>
          {ipRemarks.map((r, i) => (
            <div key={i} className="mb-2 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3 text-sm text-[var(--text-body)]">
              <p className="font-medium text-[var(--text-primary)]">{r.author_name}</p>
              <p className="text-xs text-[var(--text-muted)]">{new Date(r.created_at).toLocaleString()}</p>
              <p className="mt-1">{r.comment_text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReadOnlyGrid({
  request,
  nocLimited,
  fields,
}: {
  request: ProjectRequest;
  nocLimited: boolean;
  fields?: string[];
}) {
  const all: [string, string | undefined][] = [
    ['Customer', request.customer_name],
    ['Site', request.site_name],
    ['Location', request.location],
    ['Region', request.region],
    ['Capacity', request.capacity],
    ['Bandwidth', request.bandwidth],
    ['Cable distance', request.cable_displacement],
    ['Service type', request.service_type],
    ['CPE', request.cpe],
    ['Start date', request.start_date],
    ['Completion date', request.completion_date],
    ['Confirmation date', request.confirmation_date],
    ['MRC', request.mrc != null ? String(request.mrc) : undefined],
    ['NRC', request.nrc != null ? String(request.nrc) : undefined],
    ['Circuit ID', request.circuit_id],
    ['Integration date', request.integration_date],
    ['IP address', request.ip_address],
    ['MAC address', request.mac_address],
    ['Integrated by', request.integrated_by],
    ['Created by', request.created_by_name],
    ['Project unit', request.project_unit_name],
  ];

  let items = all;
  if (fields) {
    items = fields.map((f) => {
      const label = f.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return [label, (request as Record<string, unknown>)[f] as string | undefined];
    });
  }
  if (nocLimited) {
    items = all.filter(([k]) =>
      ['Customer', 'Site', 'Location', 'IP address', 'MAC address'].includes(k)
    );
  }
  return (
    <InfoGrid>
      {items.map(([label, value]) => (
        <InfoField key={label} label={label} value={value} />
      ))}
    </InfoGrid>
  );
}

