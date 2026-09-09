import { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function ipUnitFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/ip-unit${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export type CircuitStatus = 'active' | 'available' | 'inactive' | 'decommissioned';
export type CircuitRequestStatus = 'submitted' | 'circuit_generated' | 'added_to_inventory' | 'returned_to_requester' | 'rejected';

export interface IpCircuitListRow {
  id: number;
  circuit_id: string;
  client_id: number | null;
  client_name: string | null;
  site_id: number | null;
  site_name: string | null;
  site_region: string | null;
  pop_id: number | null;
  pop_name: string | null;
  region: string | null;
  service_type: string;
  capacity: string | null;
  vlan: string | null;
  status: CircuitStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface IpCircuitHistoryRow {
  id: number;
  circuit_id: number;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: number | null;
  changed_by_name: string | null;
  changed_at: string;
}

export interface IpCircuitAttachment {
  id: number;
  circuit_id: number;
  user_id: number | null;
  uploader_name: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  created_at: string;
}

export interface LinkedReferenceRow {
  id: number;
  source_record_type: string;
  source_record_id: number;
  linked_record_type: string;
  linked_record_id: number;
  linked_reference_number: string | null;
  linked_title: string | null;
  linked_status: string | null;
  created_at: string;
}

export interface IpCircuitDetail extends IpCircuitListRow {
  history: IpCircuitHistoryRow[];
  attachments: IpCircuitAttachment[];
  linkedReferences: LinkedReferenceRow[];
}

export interface IpCircuitRequestListRow {
  id: number;
  requested_by_user_id: number | null;
  requested_by_user_name: string | null;
  requested_by_name: string | null;
  requested_by_department: string | null;
  logged_by_name: string | null;
  client_id: number | null;
  client_name: string | null;
  site_id: number | null;
  site_name: string | null;
  pop_id: number | null;
  pop_name: string | null;
  region: string | null;
  service_type: string;
  capacity: string | null;
  vlan: string | null;
  purpose: string | null;
  status: CircuitRequestStatus;
  generated_circuit_id: number | null;
  reviewed_by_user_id: number | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface IpCircuitRequestDetail extends IpCircuitRequestListRow {
  turnaround: any;
}

export interface IpUnitDashboardStats {
  activeCircuits: number;
  availableIds: number;
  addedToday: number;
  pendingRequests: number;
  recentActivity: { id: number; action_type: string; description: string; record_type: string; record_id: number; created_at: string; actor_name: string }[];
}

export interface LookupRow {
  id: number;
  name?: string;
  site_name?: string;
  site_address?: string;
  location_name?: string;
  region?: string;
  customer_id?: number;
  customer_name?: string;
  customer_code?: string;
  position?: string;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const filtered = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
  const s = new URLSearchParams(filtered).toString();
  return s ? `?${s}` : '';
};

export const getIpUnitDashboard = (): Promise<IpUnitDashboardStats> => ipUnitFetch('/dashboard');
export const getIpUnitReportsSummary = (params?: { dateFrom?: string; dateTo?: string }): Promise<{ byStatus: any[]; byServiceType: any[]; total: number }> =>
  ipUnitFetch(`/reports/summary${qs(params || {})}`);

export const previewNextCircuitId = (serviceType: string): Promise<{ circuit_id: string }> =>
  ipUnitFetch(`/circuits/next-id${qs({ service_type: serviceType })}`);

export const listCircuits = (params?: { q?: string; status?: string; client_id?: number; pop_id?: number; service_type?: string }): Promise<{ circuits: IpCircuitListRow[] }> =>
  ipUnitFetch(`/circuits${qs(params || {})}`);

export const createCircuit = (payload: {
  circuit_id?: string; client_id: number; site_id: number; pop_id?: number | null; pop_name?: string; region?: string;
  service_type: string; capacity?: string; vlan?: string; notes?: string; status?: CircuitStatus;
}): Promise<IpCircuitDetail> => ipUnitFetch('/circuits', { method: 'POST', body: JSON.stringify(payload) });

export const getCircuit = (id: number | string): Promise<IpCircuitDetail> => ipUnitFetch(`/circuits/${id}`);

export const updateCircuit = (id: number | string, patch: Partial<{
  service_type: string; capacity: string; vlan: string; client_id: number; site_id: number;
  pop_id: number | null; pop_name: string; region: string; notes: string; status: CircuitStatus;
}>): Promise<IpCircuitDetail> => ipUnitFetch(`/circuits/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const listCircuitAttachments = (circuitId: number | string): Promise<IpCircuitAttachment[]> => ipUnitFetch(`/circuits/${circuitId}/attachments`);

export const uploadCircuitAttachment = async (circuitId: number | string, file: File): Promise<IpCircuitAttachment> => {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/ip-unit/circuits/${circuitId}/attachments`, { method: 'POST', headers: getAuthHeader(), body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Upload failed (${res.status})`);
  }
  return res.json();
};

export const deleteCircuitAttachment = (attachmentId: number | string): Promise<{ deleted: boolean }> =>
  ipUnitFetch(`/attachments/${attachmentId}`, { method: 'DELETE' });

export const circuitAttachmentDownloadUrl = (attachmentId: number | string) => `${API_URL}/ip-unit/attachments/${attachmentId}/download`;

export const downloadCircuitAttachment = async (attachmentId: number | string, filename: string) => {
  const res = await fetch(circuitAttachmentDownloadUrl(attachmentId), { headers: getAuthHeader() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const listCircuitRequests = (status?: string): Promise<IpCircuitRequestListRow[]> => ipUnitFetch(`/requests${qs({ status })}`);

export const createCircuitRequest = (payload: {
  requested_by_user_id?: number | null; requested_by_name?: string; requested_by_department?: string;
  client_id: number; site_id: number; pop_id?: number | null; pop_name?: string; region?: string;
  service_type: string; capacity?: string; vlan?: string; purpose?: string;
}): Promise<IpCircuitRequestDetail> => ipUnitFetch('/requests', { method: 'POST', body: JSON.stringify(payload) });

export const getCircuitRequest = (id: number | string): Promise<IpCircuitRequestDetail> => ipUnitFetch(`/requests/${id}`);

export const generateCircuitFromRequest = (id: number | string, circuitId?: string): Promise<IpCircuitRequestDetail> =>
  ipUnitFetch(`/requests/${id}/generate`, { method: 'POST', body: JSON.stringify({ circuit_id: circuitId }) });

export const returnCircuitRequest = (id: number | string, notes?: string): Promise<IpCircuitRequestDetail> =>
  ipUnitFetch(`/requests/${id}/return`, { method: 'POST', body: JSON.stringify({ notes }) });

export const rejectCircuitRequest = (id: number | string, notes?: string): Promise<IpCircuitRequestDetail> =>
  ipUnitFetch(`/requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ notes }) });

export const searchIpClients = (q: string): Promise<LookupRow[]> => ipUnitFetch(`/clients${qs({ q })}`);
export const searchIpSites = (q: string): Promise<LookupRow[]> => ipUnitFetch(`/sites${qs({ q })}`);
export const searchIpPops = (q: string): Promise<LookupRow[]> => ipUnitFetch(`/pops${qs({ q })}`);
export const searchIpStaff = (q: string): Promise<LookupRow[]> => ipUnitFetch(`/staff${qs({ q })}`);
