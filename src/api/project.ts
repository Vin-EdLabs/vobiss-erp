import BASE_URL, { API_URL } from '@/lib/api';
import { getActiveShareToken, isSharedRoute, shareTokenHeaders } from '@/lib/shareSession';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const clearStaffSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('vobiss-auth-logout'));
};

/** Base path for service request API — avoids double `/project-request` if env already includes it. */
function projectRequestApiBase(): string {
  const base = API_URL.replace(/\/$/, '');
  return base.endsWith('/project-request') ? base : `${base}/project-request`;
}

function projectRequestUrl(...segments: string[]): string {
  const path = segments.filter(Boolean).join('/');
  return `${projectRequestApiBase()}/${path}`;
}

async function prjFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...options.headers, ...getAuthHeader(), ...shareTokenHeaders(options.method) },
  });
  if (res.status === 401) {
    if (getActiveShareToken() || isSharedRoute()) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'This content is not available in the shared view.');
    }
    clearStaffSession();
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res;
}

/** POST helper that tries alternate paths (e.g. older backends only expose /noc/complete). */
async function prjPostFirst(paths: string[], options: RequestInit = {}): Promise<Response> {
  let lastStatus = 0;
  let lastMessage = '';
  for (const path of paths) {
    const res = await fetch(projectRequestUrl(path), {
      ...options,
      method: 'POST',
      headers: { ...options.headers, ...getAuthHeader() },
    });
    if (res.status === 401) {
      clearStaffSession();
      throw new Error('Session expired. Please log in again.');
    }
    if (res.status === 404) {
      lastStatus = 404;
      continue;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    return res;
  }
  if (lastStatus === 404) {
    throw new Error(
      lastMessage ||
        'NOC approve endpoint not found. Restart the backend server to load the latest service request routes.'
    );
  }
  throw new Error(lastMessage || 'Request failed');
}

export type ProjectUnit = {
  id: number;
  name: string;
  slug: string;
  unit_stage: 'project' | 'ts' | 'ip' | 'noc';
  description?: string;
  sort_order: number;
  is_active: boolean;
};

export type WipEntry = Record<string, any> & { id: number; customer_name?: string; status?: string; start_date?: string; completion_date?: string };
export const listWipEntries = async (): Promise<WipEntry[]> => (await prjFetch(projectRequestUrl('wip'))).json();
export const createWipEntry = async (data: Partial<WipEntry>): Promise<WipEntry> => (await prjFetch(projectRequestUrl('wip'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json();
export const updateWipEntry = async (id: number, data: Partial<WipEntry>): Promise<WipEntry> => (await prjFetch(projectRequestUrl('wip', String(id)), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json();
export const deleteWipEntry = async (id: number) => prjFetch(projectRequestUrl('wip', String(id)), { method: 'DELETE' });
export const getWipOptions = async (): Promise<{ regions: string[]; serviceTypes: string[] }> => (await prjFetch(projectRequestUrl('wip', 'options'))).json();
export const getWipHistory = async (id: number) => (await prjFetch(projectRequestUrl('wip', String(id), 'history'))).json();
export const getWipRemarks = async (id: number) => (await prjFetch(projectRequestUrl('wip', String(id), 'remarks'))).json();
export const addWipRemark = async (id: number, note_text: string) => (await prjFetch(projectRequestUrl('wip', String(id), 'remarks'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note_text }) })).json();

export type SignoffStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type SignoffForm = {
  id: number; reference_no: string; status: SignoffStatus; contractor: string;
  site_name: string; circuit_id?: string | null; type_of_service?: string | null; contractual_bandwidth?: string | null; test_date?: string | null;
  device_type?: string | null; device_model?: string | null; device_serial_number?: string | null;
  packet_loss?: string | null; latency?: string | null; jitter?: string | null; billing_date?: string | null;
  client_signature?: string | null; client_name?: string | null; client_date?: string | null; client_telephone?: string | null; client_company_name?: string | null;
  vobiss_signature?: string | null; vobiss_name?: string | null; vobiss_date?: string | null; vobiss_telephone?: string | null;
  manager_signature?: string | null; manager_name?: string | null; manager_date?: string | null; rejection_reason?: string | null;
  linked_record_type?: string | null; linked_record_id?: number | null; linked_record_ref?: string | null;
  created_by: number; created_by_name: string; created_at: string; updated_at: string;
};
export const listSignoffForms = async (params: { status?: string; search?: string; linked_record_type?: string; linked_record_id?: number } = {}): Promise<SignoffForm[]> => {
  const q = new URLSearchParams();
  if (params.status && params.status !== 'all') q.set('status', params.status);
  if (params.search) q.set('search', params.search);
  if (params.linked_record_type) q.set('linked_record_type', params.linked_record_type);
  if (params.linked_record_id != null) q.set('linked_record_id', String(params.linked_record_id));
  return (await prjFetch(`${projectRequestUrl('signoff')}${q.toString() ? `?${q}` : ''}`)).json();
};
export const getSignoffForm = async (id: number): Promise<SignoffForm> => (await prjFetch(projectRequestUrl('signoff', String(id)))).json();
export const getSignoffLinkOptions = async (): Promise<{ service_requests: Array<{ id: number; label: string; reference: string }>; wip_entries: Array<{ id: number; label: string; reference: string }> }> => (await prjFetch(projectRequestUrl('signoff', 'link-options'))).json();
export const createSignoffForm = async (data: Partial<SignoffForm>): Promise<SignoffForm> => (await prjFetch(projectRequestUrl('signoff'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json();
export const updateSignoffForm = async (id: number, data: Partial<SignoffForm>): Promise<SignoffForm> => (await prjFetch(projectRequestUrl('signoff', String(id)), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json();
export const submitSignoffForm = async (id: number): Promise<SignoffForm> => (await prjFetch(projectRequestUrl('signoff', String(id), 'submit'), { method: 'POST' })).json();
export const approveSignoffForm = async (id: number, manager_signature: string): Promise<SignoffForm> => (await prjFetch(projectRequestUrl('signoff', String(id), 'approve'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ manager_signature }) })).json();
export const rejectSignoffForm = async (id: number, reason: string): Promise<SignoffForm> => (await prjFetch(projectRequestUrl('signoff', String(id), 'reject'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })).json();

export type ProjectRequestStatus =
  | 'pending'
  | 'ongoing'
  | 'integrated'
  | 'rejected'
  | 'completed'
  | 'noc_approved';

export type ProjectRequest = {
  id: number;
  customer_name: string;
  site_name: string;
  location?: string;
  region?: string;
  capacity?: string;
  bandwidth?: string;
  cable_displacement?: string;
  service_type?: string;
  cpe?: string;
  start_date?: string;
  completion_date?: string;
  confirmation_date?: string;
  status: ProjectRequestStatus;
  current_stage: string;
  mrc?: number | null;
  nrc?: number | null;
  initial_remarks?: string;
  project_unit_name?: string;
  created_by_name?: string;
  created_by_user_id?: number;
  circuit_id?: string;
  integration_date?: string;
  ip_address?: string;
  mac_address?: string;
  integrated_by?: string;
  created_at: string;
  updated_at: string;
  chat_channel_id?: string | null;
  remarks?: ProjectRequestRemark[];
  attachments?: ProjectRequestAttachment[];
  isp?: string;
  survey_date?: string;
  design_specification?: string;
  design_reference?: string;
  is_design_request?: boolean;
  design_materials?: DesignRequestMaterial[];
  design_assigned_to?: number | null;
  design_assigned_name?: string | null;
  design_assigned_at?: string | null;
  customer_id?: number | null;
  site_id?: number | null;
  design_confirmed_at?: string | null;
  account_manager?: string | null;
  feasibility_type?: string | null;
  request_type?: string | null;
  technical_contact_name?: string | null;
  technical_contact_email?: string | null;
  technical_contact_phone?: string | null;
  site_coordinates?: string | null;
  ts_notes?: string | null;
  noc_notes?: string | null;
};

export type DesignMaterial = {
  id: number;
  material_name: string;
  unit: string;
  unit_price: number;
  calculation_formula?: string | null;
  is_primary_input: boolean;
  sort_order: number;
};

export type DesignRequestMaterial = {
  id?: number;
  material_id?: number | null;
  material_name: string;
  unit: string;
  unit_price: number;
  quantity: number;
  line_cost?: number;
  calculation_formula?: string | null;
};

export type ProjectRequestRemark = {
  id: number;
  request_id: number;
  author_name: string;
  stage: string;
  comment_text: string;
  created_at: string;
};

export type ProjectRequestAttachment = {
  id: number;
  file_path: string;
  file_name: string;
  mime_type?: string;
  uploader_name: string;
  stage: string;
  created_at: string;
};

export async function getProjectUnits(): Promise<ProjectUnit[]> {
  const res = await prjFetch(projectRequestUrl('units'));
  return res.json();
}

export async function getDesignMaterials(): Promise<DesignMaterial[]> {
  const res = await prjFetch(projectRequestUrl('design', 'materials'));
  return res.json();
}

export async function saveDesignMaterial(data: Omit<DesignMaterial, 'id'>, id?: number): Promise<DesignMaterial> {
  const res = await prjFetch(projectRequestUrl('design', 'materials', id ? String(id) : ''), {
    method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteDesignMaterial(id: number): Promise<void> {
  await prjFetch(projectRequestUrl('design', 'materials', String(id)), { method: 'DELETE' });
}

/** The fixed formula-driven BOM calculator's configurable ratios and unit rates — see
 *  src/lib/designBom.ts for the formulas these numbers feed. */
export type DesignEngineeringSettings = {
  pole_span_m: number;
  bracket_ratio: number;
  tension_termination_allowance: number;
  steel_banding_ratio: number;
  buckle_ratio: number;
  default_fat_allocation: number;
  default_9m_replacement_poles: number;
  default_11m_road_crossing_poles: number;
  default_duc_segment_m: number;
  rate_adss_cable: number;
  rate_duc_ducting: number;
  rate_drop_cable: number;
  rate_bracket: number;
  rate_clamp: number;
  rate_banding: number;
  rate_buckle: number;
  rate_fat: number;
  rate_pole: number;
};

export async function getDesignEngineeringSettings(): Promise<DesignEngineeringSettings> {
  const res = await prjFetch(projectRequestUrl('design', 'settings'));
  const data = await res.json();
  const parsed: Record<string, number> = {};
  for (const key of Object.keys(data)) {
    const n = Number(data[key]);
    if (Number.isFinite(n)) parsed[key] = n;
  }
  return parsed as unknown as DesignEngineeringSettings;
}

export async function updateDesignEngineeringSettings(data: Partial<DesignEngineeringSettings>): Promise<DesignEngineeringSettings> {
  const res = await prjFetch(projectRequestUrl('design', 'settings'), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  return res.json();
}

export async function createDesignRequest(data: Record<string, unknown>): Promise<ProjectRequest> {
  const res = await prjFetch(projectRequestUrl('design', 'requests'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  return res.json();
}

export async function listDesignRequests(): Promise<ProjectRequest[]> {
  const res = await prjFetch(projectRequestUrl('design', 'requests'));
  return res.json();
}

export async function listSalesRequests(): Promise<ProjectRequest[]> {
  const res = await prjFetch(projectRequestUrl('sales', 'requests'));
  return res.json();
}

export async function createSalesRequest(data: Record<string, unknown>): Promise<ProjectRequest> {
  const res = await prjFetch(projectRequestUrl('sales', 'requests'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return res.json();
}

/** Sales-only: rename the customer/site identity on a request that's already in flight. Every
 *  other unit's view reads the same columns, so the change is visible everywhere immediately. */
export async function updateSalesRequestIdentity(id: number, data: { customer_name: string; site_name: string }): Promise<ProjectRequest> {
  const res = await prjFetch(projectRequestUrl('sales', 'requests', String(id)), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return res.json();
}

export async function submitDesignRequest(id: number, data: Record<string, unknown>): Promise<ProjectRequest> {
  const res = await prjFetch(projectRequestUrl('design', 'requests', String(id), 'submit'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return res.json();
}

export interface DesignUnitMember {
  id: number;
  name: string;
  position: string | null;
}

export async function listDesignUnitMembers(): Promise<DesignUnitMember[]> {
  const res = await prjFetch(projectRequestUrl('design', 'members'));
  return res.json();
}

export async function claimDesignRequest(id: number): Promise<ProjectRequest> {
  const res = await prjFetch(projectRequestUrl('design', 'requests', String(id), 'claim'), { method: 'POST' });
  return res.json();
}

export async function assignDesignRequest(id: number, userId: number): Promise<ProjectRequest> {
  const res = await prjFetch(projectRequestUrl('design', 'requests', String(id), 'assign'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId }) });
  return res.json();
}

export async function releaseDesignRequest(id: number): Promise<ProjectRequest> {
  const res = await prjFetch(projectRequestUrl('design', 'requests', String(id), 'release'), { method: 'POST' });
  return res.json();
}

/** "Confirm & Forward to Project" — Sales's review of Design's completed survey
 *  (current_stage='sales'). Generates the SR's real identity (design_confirmed_at) and moves
 *  current_stage straight to 'project'. */
export async function confirmDesignRequest(id: number): Promise<ProjectRequest> {
  const res = await prjFetch(projectRequestUrl('sales', 'requests', String(id), 'confirm'), { method: 'POST' });
  return res.json();
}

/** Sales rejects Design's survey and bounces it back to Design — comment required. */
export async function rejectSalesReview(id: number, comment: string): Promise<ProjectRequest> {
  const res = await prjFetch(projectRequestUrl('sales', 'requests', String(id), 'reject'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) });
  return res.json();
}

export async function salesForwardProjectRequest(id: number): Promise<ProjectRequest> {
  const res = await prjFetch(projectRequestUrl('sales', 'requests', String(id), 'forward'), { method: 'POST' });
  return res.json();
}

export type ProjectStageFields = {
  capacity?: string; bandwidth?: string; cpe?: string; cable_displacement?: string;
  adss?: string; drop_cable?: string; start_date?: string; completion_date?: string;
  confirmation_date?: string; mrc?: string | number; nrc?: string | number;
};

export async function projectForwardProjectRequest(id: number, routeToStage: 'ts' | 'ip' | 'noc', fields?: ProjectStageFields): Promise<ProjectRequest> {
  const res = await prjFetch(projectRequestUrl('requests', String(id), 'project', 'forward'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ route_to_stage: routeToStage, fields }) });
  return res.json();
}

export async function createProjectUnit(data: {
  name: string;
  slug?: string;
  unit_stage: string;
  description?: string;
}): Promise<ProjectUnit> {
  const res = await prjFetch(projectRequestUrl('units'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateProjectUnit(
  id: number,
  data: Partial<ProjectUnit>
): Promise<ProjectUnit> {
  const res = await prjFetch(projectRequestUrl('units', String(id)), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getMyProjectUnits(): Promise<{
  units: ProjectUnit[];
  canCreate: boolean;
  pipelineUnits: ProjectUnit[];
  projectUnits: ProjectUnit[];
}> {
  const res = await prjFetch(projectRequestUrl('my-units'));
  return res.json();
}

export async function getProjectRequestDashboard(unitSlug: string) {
  const res = await prjFetch(projectRequestUrl('dashboard', unitSlug));
  return res.json();
}

export async function listProjectRequests(
  unitSlug: string,
  params?: {
    status?: string;
    search?: string;
    sort?: string;
    order?: string;
    view?: 'active' | 'history';
  }
): Promise<ProjectRequest[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.search) q.set('search', params.search);
  if (params?.sort) q.set('sort', params.sort);
  if (params?.order) q.set('order', params.order);
  if (params?.view) q.set('view', params.view);
  const res = await prjFetch(
    `${projectRequestUrl('requests', unitSlug)}?${q.toString()}`
  );
  return res.json();
}

export async function createProjectRequest(
  data: Record<string, unknown>
): Promise<ProjectRequest> {
  const res = await prjFetch(projectRequestUrl('requests'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function createProjectRequestForUnit(
  routeTo: 'ts' | 'ip',
  data: Record<string, unknown>
): Promise<ProjectRequest> {
  const res = await prjFetch(projectRequestUrl('requests', 'to', routeTo), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getProjectRequest(
  id: number
): Promise<ProjectRequest & { fullPipeline?: boolean }> {
  const res = await prjFetch(projectRequestUrl('requests', 'detail', String(id)));
  return res.json();
}

export async function addProjectRequestRemark(
  id: number,
  comment_text: string,
  stage: string
): Promise<ProjectRequestRemark> {
  const res = await prjFetch(projectRequestUrl('requests', String(id), 'remarks'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment_text, stage }),
  });
  return res.json();
}

export async function uploadProjectRequestAttachment(
  id: number,
  file: File,
  stage: string
): Promise<ProjectRequestAttachment> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('stage', stage);
  const res = await prjFetch(projectRequestUrl('requests', String(id), 'attachments'), {
    method: 'POST',
    body: fd,
  });
  return res.json();
}

export async function tsAcceptProjectRequest(id: number, routeTo: 'ip' | 'project' = 'ip', notes?: string) {
  const res = await prjFetch(projectRequestUrl('requests', String(id), 'ts', 'accept'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route_to_stage: routeTo, notes }),
  });
  return res.json();
}

export async function tsRejectProjectRequest(id: number) {
  const res = await prjFetch(projectRequestUrl('requests', String(id), 'ts', 'reject'), {
    method: 'POST',
  });
  return res.json();
}

export async function ipUpdateProjectRequest(id: number, data: Record<string, unknown>) {
  const res = await prjFetch(projectRequestUrl('requests', String(id), 'ip'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function ipForwardProjectRequest(id: number, data: Record<string, unknown>) {
  const res = await prjFetch(projectRequestUrl('requests', String(id), 'ip', 'forward'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function nocApproveProjectRequest(id: number, notes?: string) {
  const res = await prjPostFirst(
    [`requests/${id}/noc/complete`, `requests/${id}/noc/approve`, `noc-approve/${id}`],
    { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) }
  );
  return res.json();
}

/** @deprecated use nocApproveProjectRequest */
export async function nocCompleteProjectRequest(id: number) {
  return nocApproveProjectRequest(id);
}

export async function projectCompleteProjectRequest(id: number) {
  const res = await prjPostFirst([`requests/${id}/project/complete`]);
  return res.json();
}

export function projectRequestFileUrl(filePath: string) {
  if (!filePath?.trim()) return '';
  if (filePath.startsWith('http')) return filePath;

  let p = filePath.trim().replace(/\\/g, '/');
  if (p.startsWith('uploads/')) p = `/${p}`;
  if (!p.startsWith('/uploads')) {
    const name = p.split('/').pop() || p;
    p = `/uploads/project-request/${name}`;
  }

  const base =
    BASE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base.replace(/\/$/, '')}${p}`;
}
