import { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function jsonFetch(base: string, path: string, options: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...options.headers, ...getAuthHeader() },
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('vobiss-auth-logout'));
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = Object.assign(new Error(err.error || `Request failed (${res.status})`), err);
    throw error;
  }
  if (res.status === 204) return null;
  return res.json();
}

const hrLeaveFetch = (path: string, options?: RequestInit) => jsonFetch(`${API_URL}/hr/leave`, path, options);
const selfLeaveFetch = (path: string, options?: RequestInit) => jsonFetch(`${API_URL}/hr-self/leave`, path, options);

const postJson = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const putJson = (body: unknown) => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const LEAVE_QUERY = {
  staleTime: 30_000,
  gcTime: 10 * 60_000,
  refetchOnWindowFocus: false,
  retry: 1,
  placeholderData: (previousData: unknown) => previousData,
};

export type LeaveStage = 'reliever' | 'supervisor' | 'manager' | 'cto' | 'hr';
export type LeaverTier = 'employee' | 'supervisor' | 'manager' | 'cto' | 'hr';

export type LeaveCategory = {
  id: number;
  name: string;
  max_days_per_year: number;
  max_requests_per_year: number;
  company: string;
  is_active: boolean;
};

export type LeaveHistoryEntry = {
  id: number;
  leave_request_id: number;
  stage: LeaveStage;
  actor_id: number | null;
  actor_name: string | null;
  action: 'submitted' | 'confirmed' | 'approved' | 'declined' | 'acknowledged' | 'cancelled';
  reason: string | null;
  acted_at: string;
  waiting_duration_minutes: number | null;
};

export type LeaveRequest = {
  id: number;
  user_id: number;
  employee_id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'declined' | 'cancelled' | 'rejected';
  contact_during_leave: string | null;
  reliever_id: number | null;
  reliever_name?: string | null;
  employee_signature: string | null;
  leaver_tier: LeaverTier | null;
  supervisor_approver_id: number | null;
  manager_approver_id: number | null;
  current_stage: LeaveStage | 'approved' | 'declined' | 'cancelled' | null;
  declined_reason: string | null;
  declined_by_stage: LeaveStage | null;
  submitted_at: string;
  completed_at: string | null;
  created_at: string;
  employee_name?: string | null;
  department?: string | null;
  position?: string | null;
  employee_photo_url?: string | null;
  employee_email?: string | null;
  employee_phone?: string | null;
  employee_employment_type?: string | null;
  employee_start_date?: string | null;
  employee_line_manager?: string | null;
  employee_gender?: string | null;
  employee_location?: string | null;
  reliever_photo_url?: string | null;
  reliever_department?: string | null;
  reliever_position?: string | null;
  reliever_phone?: string | null;
  supervisor_approver_name?: string | null;
  manager_approver_name?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  resolved_stages?: LeaveStage[] | null;
  history?: LeaveHistoryEntry[];
  my_action?: string;
  my_stage?: LeaveStage;
  my_acted_at?: string;
};

export type ApproverCandidate = { id: number; first_name: string; last_name: string; username: string; position: string | null };
export type RelieverCandidate = { id: number; full_name: string; position: string | null; department: string | null; photo_url: string | null; user_id: number | null };

export const leaveSelfApi = {
  categories: (): Promise<{ categories: LeaveCategory[] }> => selfLeaveFetch('/categories'),
  previewDays: (startDate: string, endDate: string): Promise<{ days: number }> =>
    selfLeaveFetch(`/preview-days?startDate=${startDate}&endDate=${endDate}`),
  relieverCandidates: (q: string): Promise<{ candidates: RelieverCandidate[] }> =>
    selfLeaveFetch(`/reliever-candidates?q=${encodeURIComponent(q)}`),
  approverCandidates: (): Promise<{ supervisor?: ApproverCandidate[]; manager?: ApproverCandidate[] }> =>
    selfLeaveFetch('/approver-candidates'),
  submit: (payload: {
    leaveType: string; startDate: string; endDate: string; reason: string;
    contactDuringLeave?: string; relieverId?: number; employeeSignature?: string; handoverConfirmed?: boolean;
    supervisorApproverId?: number; managerApproverId?: number; attachment?: File | null;
  }): Promise<LeaveRequest> => {
    const fd = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (key === 'attachment') return;
      if (value === undefined || value === null) return;
      fd.append(key, String(value));
    });
    if (payload.attachment) fd.append('attachment', payload.attachment);
    return jsonFetch(`${API_URL}/hr-self/leave`, '/requests', { method: 'POST', body: fd });
  },
  myRequests: (): Promise<{ requests: LeaveRequest[] }> => selfLeaveFetch('/requests/my'),
  pendingOnMe: (): Promise<{ requests: LeaveRequest[] }> => selfLeaveFetch('/requests/pending/mine'),
  actedByMe: (): Promise<{ requests: LeaveRequest[] }> => selfLeaveFetch('/requests/acted/mine'),
  requestDetail: (id: number | string): Promise<LeaveRequest> => selfLeaveFetch(`/requests/${id}`),
  history: (id: number | string): Promise<{ history: LeaveHistoryEntry[] }> => selfLeaveFetch(`/requests/${id}/history`),
  respond: (id: number | string, action: 'confirm' | 'approve' | 'decline', reason?: string, signature?: string): Promise<LeaveRequest> =>
    selfLeaveFetch(`/requests/${id}/respond`, postJson({ action, reason, signature })),
};

export const leaveApi = {
  allRequests: (params?: { status?: string; department?: string; from?: string; to?: string }): Promise<{ requests: LeaveRequest[] }> => {
    const q = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return hrLeaveFetch(`/requests${q}`);
  },
  requestDetail: (id: number | string): Promise<LeaveRequest> => hrLeaveFetch(`/requests/${id}`),
  history: (id: number | string): Promise<{ history: LeaveHistoryEntry[] }> => hrLeaveFetch(`/requests/${id}/history`),
  categories: (): Promise<{ categories: LeaveCategory[] }> => hrLeaveFetch('/categories'),
  createCategory: (data: { name: string; maxDaysPerYear: number; maxRequestsPerYear: number }): Promise<{ category: LeaveCategory }> =>
    hrLeaveFetch('/categories', postJson(data)),
  updateCategory: (id: number | string, data: Partial<{ name: string; maxDaysPerYear: number; maxRequestsPerYear: number; isActive: boolean }>): Promise<{ category: LeaveCategory }> =>
    hrLeaveFetch(`/categories/${id}`, putJson(data)),
  overview: (): Promise<{ pendingCount: number; byCategory: { leave_type: string; count: number }[]; byStage: { current_stage: string; count: number }[] }> =>
    hrLeaveFetch('/overview'),
};

export async function downloadLeavePdf(id: number | string, scope: 'self' | 'hr') {
  const base = scope === 'hr' ? `${API_URL}/hr/leave` : `${API_URL}/hr-self/leave`;
  const res = await fetch(`${base}/requests/${id}/pdf`, { headers: getAuthHeader() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to generate PDF');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leave-request-${id}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
