import { getProjectRequest, type ProjectRequest } from '@/api/project';
import { getLinkedReferences } from '@/api/references';
import { getRecordTurnaround } from '@/api/timeEngine';
import { referenceTypeLabel } from '@/lib/referenceRegistry';

const STAGE_LABELS: Record<string, string> = {
  sales: 'Sales', design: 'Design', project: 'Project Unit', ts: 'TX',
  ip: 'IP', noc: 'NOC', done: 'Active', rejected: 'Rejected',
};

/** Mirrors PipelineHistory.tsx's buildEntries() — Sales's opening note (initial_remarks) is a
 *  real part of the SR's story but isn't its own row in project_request_remarks, so it has to
 *  be synthesized in here too or the report silently drops how the request actually started. */
function buildRemarksWithInitial(
  r: ProjectRequest,
  stageLabel: (s: string) => string
): ServiceRequestReportData['remarks'] {
  const remarks = r.remarks || [];
  const hasInitialAsRemark = remarks.some(
    (m) => m.stage === 'sales' && r.initial_remarks?.trim() && m.comment_text.trim() === r.initial_remarks.trim()
  );
  const entries = remarks.map((m) => ({
    stage: m.stage, stage_label: stageLabel(m.stage), author_name: m.author_name,
    comment_text: m.comment_text, created_at: m.created_at,
  }));
  if (r.initial_remarks?.trim() && !hasInitialAsRemark) {
    entries.unshift({
      stage: 'sales', stage_label: stageLabel('sales'), author_name: r.created_by_name || 'Sales Unit',
      comment_text: r.initial_remarks, created_at: r.created_at,
    });
  }
  return entries.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export type ServiceRequestReportData = {
  id: number;
  reference: string;
  customer_name: string;
  site_name: string;
  location?: string;
  region?: string;
  service_type?: string;
  capacity?: string;
  bandwidth?: string;
  status: string;
  current_stage: string;
  current_stage_label: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  design_confirmed_at?: string | null;
  mrc?: number | null;
  nrc?: number | null;
  circuit_id?: string;
  ip_address?: string;
  mac_address?: string;
  integrated_by?: string;
  remarks: Array<{ stage: string; stage_label: string; author_name: string; comment_text: string; created_at: string }>;
  attachments: Array<{ file_name: string; uploader_name: string; stage: string; stage_label: string; created_at: string }>;
  designMaterials: Array<{ material_name: string; quantity: number; unit: string; unit_price: number; line_cost?: number }>;
  stageBreakdown: Array<{
    stageName: string | null; stageLabel: string; unitSlug: string | null; userFullName: string | null;
    startedAt: string; endedAt: string | null; minutes: number; isWaiting: boolean; slaStatus: string;
  }>;
  turnaround: { totalElapsedMinutes: number; isOpen: boolean; slaStatus: string | null; notStarted?: boolean };
  linkedReferences: Array<{
    direction: 'outbound' | 'inbound'; typeLabel: string; referenceNumber: string | null;
    title: string | null; status: string | null; createdByName: string; createdAt: string;
  }>;
};

/** Aggregates everything the 360° Service Request Flow touched for one SR — core fields, every
 *  stage's remarks/attachments, the cross-unit timing breakdown, and linked Transport/IP Circuit
 *  records — into one shape the on-screen preview and the PDF export both render from. */
export async function buildServiceRequestReport(id: number): Promise<ServiceRequestReportData> {
  const [request, linked, turnaround] = await Promise.all([
    getProjectRequest(id),
    getLinkedReferences('service_request', id).catch(() => ({ outbound: [], inbound: [] })),
    getRecordTurnaround('service_request', id).catch(() => null),
  ]);

  const r: ProjectRequest & { fullPipeline?: boolean } = request;
  const stageLabel = (s: string) => STAGE_LABELS[s] || s;

  return {
    id: r.id,
    reference: r.design_confirmed_at ? `SR-${String(r.id).padStart(3, '0')}` : `Draft #${r.id}`,
    customer_name: r.customer_name,
    site_name: r.site_name,
    location: r.location,
    region: r.region,
    service_type: r.service_type,
    capacity: r.capacity,
    bandwidth: r.bandwidth,
    status: r.status,
    current_stage: r.current_stage,
    current_stage_label: stageLabel(r.current_stage),
    created_by_name: r.created_by_name,
    created_at: r.created_at,
    updated_at: r.updated_at,
    design_confirmed_at: r.design_confirmed_at,
    mrc: r.mrc,
    nrc: r.nrc,
    circuit_id: r.circuit_id,
    ip_address: r.ip_address,
    mac_address: r.mac_address,
    integrated_by: r.integrated_by,
    remarks: buildRemarksWithInitial(r, stageLabel),
    attachments: (r.attachments || []).map((a) => ({
      file_name: a.file_name, uploader_name: a.uploader_name, stage: a.stage, stage_label: stageLabel(a.stage), created_at: a.created_at,
    })),
    designMaterials: (r.design_materials || []).map((m) => ({
      material_name: m.material_name, quantity: m.quantity, unit: m.unit, unit_price: m.unit_price, line_cost: m.line_cost,
    })),
    stageBreakdown: (turnaround?.byStage || []).map((s) => ({
      stageName: s.stageName, stageLabel: s.stageName ? stageLabel(s.stageName) : 'Unknown stage',
      unitSlug: s.unitSlug, userFullName: s.userFullName, startedAt: s.startedAt, endedAt: s.endedAt,
      minutes: s.minutes, isWaiting: s.isWaiting, slaStatus: s.slaStatus,
    })),
    turnaround: {
      totalElapsedMinutes: turnaround?.totalElapsedMinutes ?? 0,
      isOpen: turnaround?.isOpen ?? false,
      slaStatus: turnaround?.slaStatus ?? null,
      notStarted: turnaround?.notStarted,
    },
    linkedReferences: [...linked.outbound, ...linked.inbound].map((row) => ({
      direction: row.direction, typeLabel: referenceTypeLabel(row.type), referenceNumber: row.referenceNumber,
      title: row.title, status: row.status, createdByName: row.createdByName, createdAt: row.createdAt,
    })),
  };
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
