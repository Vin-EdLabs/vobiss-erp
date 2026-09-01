import { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function assessmentFetch(path: string) {
  const res = await fetch(`${API_URL}/time-engine${path}`, { headers: { 'Content-Type': 'application/json', ...getAuthHeader() } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed (${res.status})`);
  }
  return res.json();
}

async function downloadFile(path: string, fallbackFilename: string) {
  const res = await fetch(`${API_URL}/time-engine${path}`, { headers: getAuthHeader() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed (${res.status})`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || fallbackFilename;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface AssessmentScore {
  overall: number | null;
  label: string;
  speedScore: number | null;
  compliancePct: number | null;
  avgMinutes: number | null;
  medianMinutes: number | null;
  segmentsCompleted: number;
  recordsHandled: number;
  criticalBreaches: number;
  totalActiveHours: number;
  minSegmentsRequired: number;
  vsPrevious: { scoreDelta: number | null; complianceDeltaPts: number | null; avgMinutesDeltaPct: number | null };
}

export interface UnitRankingMember {
  userId: number;
  fullName: string;
  segments: number;
  records: number;
  avgMinutes: number | null;
  medianMinutes: number | null;
  breaches: number;
  compliancePct: number | null;
  score: number | null;
  isCurrentUser: boolean;
}

export interface VsUnit {
  unitSlug: string;
  unitAvgMinutes: number | null;
  unitCompliancePct: number | null;
  unitMedianVolume: number | null;
  unitAvgBreaches: number | null;
  rankByCompliance: number | null;
  rankByVolume: number | null;
  membersInUnit: number;
}

export interface ByWorkflowRow {
  workflowType: string;
  segments: number;
  avgMinutes: number | null;
  medianMinutes: number | null;
  compliancePct: number | null;
  breaches: number;
}

export interface TrendPoint {
  weekStart: string;
  segments: number;
  avgMinutes: number | null;
  compliancePct: number | null;
  score: number | null;
}

export interface NotableEntry {
  workflowType: string;
  recordId: number;
  reference: string;
  stage: string | null;
  durationMinutes: number;
  link: string;
}

export interface BreachEntry {
  workflowType: string;
  recordId: number;
  reference: string;
  stage: string | null;
  expectedMinutes: number | null;
  actualMinutes: number;
  exceededBy: number;
  link: string;
}

export interface AttendanceSummary {
  rate: number | null;
  presentDays: number;
  totalDays: number;
}

export interface StaffAssessment {
  user: { id: number; name: string; unit: string | null; role: string | null };
  period: { from: string; to: string };
  previousPeriod: { from: string; to: string };
  score: AssessmentScore;
  attendance: AttendanceSummary;
  vsUnit: VsUnit | null;
  byWorkflow: ByWorkflowRow[];
  trend: TrendPoint[];
  fastest: NotableEntry[];
  slowest: NotableEntry[];
  breaches: BreachEntry[];
  unitPerformance: { unitSlug: string; summary: { segments: number; avgMinutes: number | null; compliancePct: number | null; breaches: number }; ranking: UnitRankingMember[] } | null;
  notes: { excludedFromPersonalScore: string[]; fairnessBlurb: string };
}

export interface StaffAssessmentSummaryRow {
  userId: number;
  fullName: string;
  unitSlug: string | null;
  segments: number;
  records: number;
  avgMinutes: number | null;
  medianMinutes: number | null;
  breaches: number;
  compliancePct: number | null;
  score: number | null;
  label: string;
}

type Period = { dateFrom?: string; dateTo?: string };

const qs = (params: Record<string, string | undefined>) => {
  const filtered = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '')) as Record<string, string>;
  const s = new URLSearchParams(filtered).toString();
  return s ? `?${s}` : '';
};

export const getMyAssessment = (period?: Period): Promise<StaffAssessment> => assessmentFetch(`/assessment/me${qs(period || {})}`);

export const getStaffAssessment = (userId: number | string, period?: Period): Promise<StaffAssessment> =>
  assessmentFetch(`/assessment/staff/${userId}${qs(period || {})}`);

export const getAllStaffAssessments = (params?: Period & { unitSlug?: string }): Promise<StaffAssessmentSummaryRow[]> =>
  assessmentFetch(`/assessment/staff${qs(params || {})}`);

export const exportMyAssessment = (period?: Period) => downloadFile(`/assessment/me/export${qs(period || {})}`, 'my-assessment.xlsx');

export const exportStaffAssessment = (userId: number | string, period?: Period) =>
  downloadFile(`/assessment/staff/${userId}/export${qs(period || {})}`, 'assessment.xlsx');

export const exportTeamAssessments = (params?: Period & { unitSlug?: string }) =>
  downloadFile(`/assessment/export${qs(params || {})}`, 'team-assessments.xlsx');
