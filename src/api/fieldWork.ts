import { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function fieldWorkFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/field-work${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export type FieldWorkStatus = 'assigned' | 'travelling' | 'on_site' | 'in_progress' | 'waiting' | 'completed' | 'noc_confirmed' | 'client_confirmed' | 'closed';
export type EngineerStatus = 'assigned' | 'travelling' | 'on_site' | 'completed';

/** These two endpoints are open to any authenticated user (unlike /api/ip-unit/clients|sites,
 *  which is gated to IP Unit members) — reused as the customer/site picker on Sales's and
 *  Design's Service Request creation forms. */
export const searchClientsForPicker = (q: string): Promise<import('./ipUnit').LookupRow[]> => fieldWorkFetch(`/clients?q=${encodeURIComponent(q)}`);
export const searchSitesForPicker = (q: string): Promise<import('./ipUnit').LookupRow[]> => fieldWorkFetch(`/sites?q=${encodeURIComponent(q)}`);

export interface FieldWorkEngineer {
  id: number;
  field_work_id: number;
  user_id: number;
  full_name: string;
  is_lead: boolean;
  status: EngineerStatus;
  assigned_at: string;
  completed_at: string | null;
  removed_at: string | null;
}

export interface FieldWorkUpdate {
  id: number;
  field_work_id: number;
  user_id: number | null;
  full_name: string | null;
  update_type: string;
  content: string | null;
  progress_percentage: number | null;
  attachments: { path: string; name: string; mime_type?: string }[];
  latitude?: number | null;
  longitude?: number | null;
  distance_from_site_meters?: number | null;
  created_at: string;
}

export interface FieldArrival {
  id: number;
  field_work_id: number;
  content: string | null;
  attachments: { path: string; name: string; mime_type?: string }[];
  latitude: number | null;
  longitude: number | null;
  distance_from_site_meters: number | null;
  created_at: string;
  engineer_name: string | null;
  source_type: 'ticket' | 'service_request';
  source_id: number;
  source_reference: string;
  field_work_title: string;
  site_name: string | null;
}

export interface FieldWorkConfirmation {
  id: number;
  confirmation_type: 'noc' | 'noc_rejected' | 'client';
  confirmed_by_user_id: number | null;
  confirmed_by_name: string | null;
  client_name: string | null;
  client_signature: string | null;
  notes: string | null;
  confirmed_at: string;
}

export interface LinkedRequest {
  linked_record_type: string;
  linked_record_id: number;
  linked_reference_number: string;
  linked_title: string;
  linked_status: string | null;
}

export interface FieldWorkListRow {
  id: number;
  source_type: 'ticket' | 'service_request';
  source_id: number;
  site_id: number | null;
  client_id: number | null;
  site_name: string | null;
  site_region: string | null;
  client_name: string | null;
  title: string;
  work_type: string | null;
  status: FieldWorkStatus;
  priority: string;
  unit_slug: string;
  created_by_user_id: number;
  created_at: string;
  updated_at: string;
  engineer_count: number;
}

export interface FieldWorkDetail extends FieldWorkListRow {
  notes: string | null;
  site_address: string | null;
  site_latitude?: number | null;
  site_longitude?: number | null;
  engineers: FieldWorkEngineer[];
  removedEngineers: FieldWorkEngineer[];
  updates: FieldWorkUpdate[];
  confirmations: FieldWorkConfirmation[];
  linkedRequests: LinkedRequest[];
  sourceReference: string;
  sourceLink: string;
}

export const createFieldWork = (payload: {
  source_type: 'ticket' | 'service_request'; source_id: number; site_id?: number | null; client_id?: number | null;
  title: string; work_type?: string; priority?: string; notes?: string; site_name?: string;
  engineer_ids: number[]; lead_engineer_id?: number;
}): Promise<FieldWorkDetail> => fieldWorkFetch('/', { method: 'POST', body: JSON.stringify(payload) });

export const listFieldWork = (params?: { status?: string; site_id?: number; engineer_id?: number; source_type?: string; dateFrom?: string; dateTo?: string }): Promise<FieldWorkListRow[]> => {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))).toString();
  return fieldWorkFetch(`${qs ? `?${qs}` : ''}`);
};

export const getMyFieldWork = (): Promise<FieldWorkListRow[]> => fieldWorkFetch('/my-work');
export const getSupervisorFieldWork = (): Promise<FieldWorkListRow[]> => fieldWorkFetch('/supervisor-view');
export const getFieldWorkBySource = (sourceType: 'ticket' | 'service_request', sourceId: number | string): Promise<FieldWorkDetail | null> =>
  fieldWorkFetch(`/by-source/${sourceType}/${sourceId}`);
export const getFieldWork = (id: number | string): Promise<FieldWorkDetail> => fieldWorkFetch(`/${id}`);

export const updateFieldWorkStatus = (id: number | string, status: string): Promise<FieldWorkDetail> =>
  fieldWorkFetch(`/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });

export const addFieldWorkEngineers = (id: number | string, engineerIds: number[], leadEngineerId?: number): Promise<FieldWorkDetail> =>
  fieldWorkFetch(`/${id}/engineers`, { method: 'POST', body: JSON.stringify({ engineer_ids: engineerIds, lead_engineer_id: leadEngineerId }) });

export const removeFieldWorkEngineer = (id: number | string, userId: number): Promise<FieldWorkDetail> =>
  fieldWorkFetch(`/${id}/engineers/${userId}`, { method: 'DELETE' });

export const postFieldWorkUpdate = async (id: number | string, payload: { update_type?: string; content?: string; progress_percentage?: number | null; files?: File[]; latitude?: number; longitude?: number }): Promise<FieldWorkUpdate> => {
  const form = new FormData();
  if (payload.update_type) form.append('update_type', payload.update_type);
  if (payload.content) form.append('content', payload.content);
  if (payload.progress_percentage != null) form.append('progress_percentage', String(payload.progress_percentage));
  if (payload.latitude != null) form.append('latitude', String(payload.latitude));
  if (payload.longitude != null) form.append('longitude', String(payload.longitude));
  (payload.files || []).forEach((f) => form.append('files', f));
  const res = await fetch(`${API_URL}/field-work/${id}/updates`, { method: 'POST', headers: getAuthHeader(), body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed (${res.status})`);
  }
  return res.json();
};

export const getFieldArrivals = (params?: { dateFrom?: string; dateTo?: string; limit?: number }): Promise<FieldArrival[]> => {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))).toString();
  return fieldWorkFetch(`/arrivals${qs ? `?${qs}` : ''}`);
};

export const confirmFieldWork = (id: number | string, payload: { confirmation_type: 'noc' | 'client'; notes?: string; client_name?: string; client_signature?: string; outcome?: 'confirm' | 'reject' }): Promise<FieldWorkDetail> =>
  fieldWorkFetch(`/${id}/confirm`, { method: 'POST', body: JSON.stringify(payload) });
