import BASE_URL, { API_URL } from '@/lib/api';

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
    headers: { ...options.headers, ...getAuthHeader() },
  });
  if (res.status === 401) {
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

export async function tsAcceptProjectRequest(id: number, routeTo: 'ip' | 'project' = 'ip') {
  const res = await prjFetch(projectRequestUrl('requests', String(id), 'ts', 'accept'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route_to_stage: routeTo }),
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

export async function nocApproveProjectRequest(id: number) {
  const res = await prjPostFirst([
    `requests/${id}/noc/complete`,
    `requests/${id}/noc/approve`,
    `noc-approve/${id}`,
  ]);
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
