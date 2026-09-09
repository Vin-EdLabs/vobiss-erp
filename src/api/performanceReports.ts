import { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function prFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/performance-reports${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export type ReportTier = 'employee' | 'supervisor' | 'manager' | 'cto';
export type ReportStatus =
  | 'draft' | 'submitted_supervisor' | 'under_supervisor_review' | 'submitted_manager'
  | 'under_manager_review' | 'submitted_cto' | 'under_cto_review' | 'finalized' | 'needs_revision';

export interface PerformancePeriod {
  id: number;
  name: string;
  period_type: 'weekly' | 'monthly' | 'quarterly' | 'custom';
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

export interface PerformanceReportDocument {
  id: number;
  report_id: number;
  stage: ReportTier;
  original_name: string;
  display_name: string | null;
  mime_type: string | null;
  extension: string | null;
  size_bytes: number | null;
  conversion_status: 'not_needed' | 'pending' | 'done' | 'failed';
  uploaded_by: number;
  created_at: string;
}

export interface PerformanceReportReview {
  id: number;
  report_id: number;
  stage: ReportTier;
  reviewer_id: number | null;
  reviewer_name: string;
  action: 'submit' | 'forward' | 'send_back' | 'finalize' | 'score';
  score: number | null;
  comment_text: string | null;
  created_at: string;
}

export interface PerformanceReport {
  id: number;
  period_id: number;
  employee_id: number;
  employee_name: string;
  unit: string | null;
  title: string;
  summary: string | null;
  status: ReportStatus;
  current_stage: ReportTier | 'done';
  system_score: number | null;
  attendance_score: number | null;
  system_score_breakdown: { attendance: number | null; kpi: number | null; weights: { attendance: string; kpi: string } } | null;
  supervisor_score: number | null; supervisor_comments: string | null; supervisor_reviewed_by: number | null; supervisor_reviewed_at: string | null;
  manager_score: number | null; manager_comments: string | null; manager_reviewed_by: number | null; manager_reviewed_at: string | null;
  cto_score: number | null; cto_comments: string | null; cto_reviewed_by: number | null; cto_reviewed_at: string | null;
  final_score: number | null;
  chat_channel_id: string | null;
  recipient_id: number | null;
  recipient_name: string | null;
  created_at: string; updated_at: string; submitted_at: string | null; finalized_at: string | null;
  period?: PerformancePeriod;
  reviews?: PerformanceReviewRow[];
  documents?: PerformanceReportDocument[];
}
type PerformanceReviewRow = PerformanceReportReview;

export interface ReviewerCandidate {
  id: number;
  name: string;
  position: string | null;
}

export const listPeriods = (): Promise<PerformancePeriod[]> => prFetch('/periods');
export const createPeriod = (data: { name: string; period_type: string; start_date: string; end_date: string }): Promise<PerformancePeriod> =>
  prFetch('/periods', { method: 'POST', body: JSON.stringify(data) });

export const getWeights = (): Promise<any> => prFetch('/weights');

export const listMyReports = (): Promise<PerformanceReport[]> => prFetch('/my-reports');
export const createReport = (data: { period_id: number; title: string; summary?: string }): Promise<PerformanceReport> =>
  prFetch('/reports', { method: 'POST', body: JSON.stringify(data) });
export const getReport = (id: number | string): Promise<PerformanceReport> => prFetch(`/reports/${id}`);
export const getNextReviewers = (id: number | string): Promise<{ next_stage: ReportTier | 'done'; candidates: ReviewerCandidate[] }> =>
  prFetch(`/reports/${id}/next-reviewers`);
export const submitReport = (id: number | string, recipientId?: number | null): Promise<PerformanceReport> =>
  prFetch(`/reports/${id}/submit`, { method: 'POST', body: JSON.stringify({ recipient_id: recipientId || undefined }) });
export const reviewReport = (id: number | string, data: { score?: number; comments?: string; recipientId?: number | null }): Promise<PerformanceReport> =>
  prFetch(`/reports/${id}/review`, { method: 'POST', body: JSON.stringify({ score: data.score, comments: data.comments, recipient_id: data.recipientId || undefined }) });
export const sendBackReport = (id: number | string, comment: string): Promise<PerformanceReport> =>
  prFetch(`/reports/${id}/send-back`, { method: 'POST', body: JSON.stringify({ comment }) });
export const finalizeReport = (id: number | string, data: { score?: number; comments?: string }): Promise<PerformanceReport> =>
  prFetch(`/reports/${id}/finalize`, { method: 'POST', body: JSON.stringify(data) });

export const listQueue = (params?: { status?: string; period_id?: number }): Promise<PerformanceReport[]> => {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))).toString();
  return prFetch(`/queue${qs ? `?${qs}` : ''}`);
};
export const listHrAccessible = (params?: { status?: string; period_id?: number; unit?: string }): Promise<PerformanceReport[]> => {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))).toString();
  return prFetch(`/hr-access${qs ? `?${qs}` : ''}`);
};

export interface EmployeeSearchResult {
  id: number;
  name: string;
  username: string;
  position: string | null;
  unit: string | null;
}
export const searchEmployeesForPerformance = (q: string): Promise<EmployeeSearchResult[]> =>
  prFetch(`/employee-search?q=${encodeURIComponent(q)}`);
export const getEmployeePerformance = (employeeId: number | string): Promise<PerformanceReport[]> =>
  prFetch(`/by-employee/${employeeId}`);

export interface RecentActivityItem {
  report_id: number;
  action: string;
  score: number | null;
  created_at: string;
  title: string;
  employee_name: string;
  unit: string | null;
  status: ReportStatus;
  current_stage: ReportTier | 'done';
}
export const listMyActivity = (): Promise<RecentActivityItem[]> => prFetch('/my-activity');

export async function uploadDocuments(reportId: number | string, files: File[]): Promise<PerformanceReportDocument[]> {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const res = await fetch(`${API_URL}/performance-reports/reports/${reportId}/documents`, {
    method: 'POST', headers: getAuthHeader(), body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Upload failed (${res.status})`);
  }
  return res.json();
}

export const getDocumentStatus = (id: number): Promise<{ id: number; conversion_status: string; has_pdf: boolean }> =>
  prFetch(`/documents/${id}/status`);

/** Fetches the file as an authenticated blob and returns an object URL — matches the pattern
 *  already used by src/pages/hr/DocumentPreview.tsx and FilePreviewModal.tsx elsewhere in this
 *  app. The download route requires the Authorization header, which a plain <iframe>/<object>
 *  src can't attach, so this can't just be a URL string. */
export async function fetchDocumentBlobUrl(id: number, viewAsPdf: boolean): Promise<string> {
  const res = await fetch(`${API_URL}/performance-reports/documents/${id}/file${viewAsPdf ? '?view=pdf' : ''}`, {
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error(`Could not load document (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
