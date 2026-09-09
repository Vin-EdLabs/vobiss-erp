import { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function jsonFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/hr/overtime${path}`, {
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

export const OT_QUERY = {
  staleTime: 30_000,
  gcTime: 10 * 60_000,
  refetchOnWindowFocus: false,
  retry: 1,
  placeholderData: (previousData: unknown) => previousData,
};

export type OTStage = 'supervisor' | 'manager' | 'hr' | 'finance';
export type OTCategory = 'emergency_fault' | 'planned_maintenance' | 'weekend_support' | 'public_holiday_support';
export type OTRateType = 'standard' | 'weekend' | 'public_holiday' | 'special_approval';
export type OTDayType = 'weekday' | 'weekend' | 'public_holiday';
export type OTTicketType = 'fault_ticket' | 'work_order';
export type OTDocumentType = 'attendance_log' | 'call_out_log' | 'fault_ticket' | 'maintenance_report' | 'supervisor_approval' | 'other';
export type OTPaymentMethod = 'cash' | 'transfer' | 'mobile_money';

export type OTTicket = {
  id: number;
  ot_request_id: number;
  ticket_type: OTTicketType;
  ticket_ref: string | null;
  ticket_id: number | null;
  site_id: number | null;
  site_name: string | null;
  region: string | null;
  digital_address: string | null;
  client_id: number | null;
  client_name: string | null;
  ot_date: string;
  day_type: OTDayType;
  start_time: string;
  end_time: string;
  hours_worked: number;
  work_summary: string | null;
  sort_order: number;
};

export type OTDocument = {
  id: number;
  ot_request_id: number;
  ot_request_ticket_id: number | null;
  document_type: OTDocumentType;
  other_label: string | null;
  file_name: string;
  file_path: string;
  file_size: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

export type OTHistoryEntry = {
  id: number;
  ot_request_id: number;
  stage: 'submitted' | OTStage;
  actor_id: number | null;
  actor_name: string | null;
  action: 'submitted' | 'approved' | 'declined' | 'paid';
  reason: string | null;
  amount_paid: number | null;
  payment_method: OTPaymentMethod | null;
  acted_at: string;
  waiting_duration_minutes: number | null;
};

export type OTRequest = {
  id: number;
  staff_id: number;
  staff_name: string;
  department: string | null;
  job_title: string | null;
  contact_number: string | null;
  ot_category: OTCategory;
  ot_rate_type: OTRateType;
  normal_shift_hours: string | null;
  total_ot_hours: number;
  employee_signature: string | null;
  declaration_date: string | null;
  supervisor_id: number | null;
  manager_id: number | null;
  current_stage: OTStage | 'paid' | 'declined' | 'cancelled';
  status: 'pending' | 'paid' | 'declined' | 'cancelled';
  declined_reason: string | null;
  declined_by_stage: OTStage | null;
  amount_paid: number | null;
  payment_method: OTPaymentMethod | null;
  submitted_at: string;
  completed_at: string | null;
  ticket_count?: number;
  site_count?: number;
  tickets?: OTTicket[];
  documents?: OTDocument[];
  history?: OTHistoryEntry[];
};

export type OTTicketDraft = {
  ticketType: OTTicketType;
  ticketRef?: string;
  ticketId?: number;
  /** Used only when there's no linked ticket — a searched-and-selected site (never free text).
   *  Client/site display fields are always re-derived server-side from ticketId or siteId. */
  siteId?: number;
  siteName?: string;
  region?: string;
  digitalAddress?: string;
  clientId?: number;
  clientName?: string;
  otDate: string;
  dayType: OTDayType;
  startTime: string;
  endTime: string;
  hoursWorked?: number;
  workSummary?: string;
  documentTypeByFile?: Record<string, { documentType: OTDocumentType; otherLabel?: string }>;
};

export type OTFileEntry = { file: File; ticketIndex: number | null; documentType: OTDocumentType; otherLabel?: string };

const otApi = {
  submit: (payload: {
    otCategory: OTCategory;
    otRateType: OTRateType;
    normalShiftHours?: string;
    employeeSignature: string;
    tickets: OTTicketDraft[];
  }, files: OTFileEntry[]): Promise<OTRequest> => {
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    files.forEach((f) => {
      const field = f.ticketIndex != null ? `ticket_${f.ticketIndex}_files` : 'general_files';
      fd.append(field, f.file, f.file.name);
    });
    return jsonFetch('/requests', { method: 'POST', body: fd });
  },
  allRequests: (params?: { status?: string }): Promise<{ requests: OTRequest[] }> => {
    const q = params?.status ? `?status=${encodeURIComponent(params.status)}` : '';
    return jsonFetch(`/requests${q}`);
  },
  myRequests: (): Promise<{ requests: OTRequest[] }> => jsonFetch('/requests/my'),
  pendingOnMe: (): Promise<{ requests: OTRequest[] }> => jsonFetch('/requests/pending/mine'),
  requestDetail: (id: number | string): Promise<OTRequest> => jsonFetch(`/requests/${id}`),
  history: (id: number | string): Promise<{ history: OTHistoryEntry[] }> => jsonFetch(`/requests/${id}/history`),
  respond: (
    id: number | string,
    body: { action: 'approve' | 'decline'; reason?: string; comment?: string; amountPaid?: number; paymentMethod?: OTPaymentMethod; signature?: string }
  ): Promise<OTRequest> =>
    jsonFetch(`/requests/${id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};

export async function downloadOTPdf(id: number | string) {
  const res = await fetch(`${API_URL}/hr/overtime/requests/${id}/pdf`, { headers: getAuthHeader() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to generate PDF');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `overtime-request-${id}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export type TicketSearchResult = {
  id: number; ticket_id: string; title: string; status: string;
  customer_id: number | null; customer_name: string; project_name: string;
  site_id: number | null; site_name: string | null; site_code: string | null;
  region: string | null; site_address: string | null;
  latitude: number | null; longitude: number | null;
};
export type SiteSearchResult = {
  id: number; site_name: string; site_address: string | null; region: string | null;
  customer_id: number | null; customer_name: string | null; customer_code: string | null;
  latitude: number | null; longitude: number | null;
};

export async function searchTickets(q: string): Promise<TicketSearchResult[]> {
  if (!q || q.trim().length < 2) return [];
  const res = await fetch(`${API_URL}/tickets/summary/search?q=${encodeURIComponent(q)}`, { headers: getAuthHeader() });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function searchSites(q: string): Promise<SiteSearchResult[]> {
  if (!q || q.trim().length < 2) return [];
  const res = await fetch(`${API_URL}/field-work/sites?q=${encodeURIComponent(q)}`, { headers: getAuthHeader() });
  if (!res.ok) return [];
  return res.json();
}

export default otApi;
