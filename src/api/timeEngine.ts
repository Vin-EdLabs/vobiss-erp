import { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function timeEngineFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/time-engine${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export type SlaStatus = 'on_track' | 'warning' | 'breached' | 'no_config';

export interface StageBreakdown {
  stageName: string | null;
  unitSlug: string | null;
  userId: number | null;
  userFullName: string | null;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  isWaiting: boolean;
  slaStatus: SlaStatus;
  expectedMinutes: number | null;
}

export interface RecordTurnaround {
  workflowType: string;
  recordId: number;
  startedAt: string;
  isOpen: boolean;
  totalElapsedMinutes: number;
  waitingMinutes: number;
  activeMinutes: number;
  byUnit: { unitSlug: string; minutes: number }[];
  byUser: { userId: number; fullName: string; minutes: number }[];
  byStage: StageBreakdown[];
  slaStatus: SlaStatus | null;
  exceededStages: { stageName: string | null; minutes: number; criticalThresholdMinutes: number | null }[];
  notStarted?: boolean;
}

export interface LiveSegment {
  segmentId: number;
  workflowType: string;
  recordId: number;
  stageName: string | null;
  unitSlug: string | null;
  userId: number | null;
  userFullName: string | null;
  startedAt: string;
  elapsedMinutes: number;
  slaStatus: SlaStatus;
  expectedMinutes: number | null;
  warningThresholdMinutes: number | null;
  criticalThresholdMinutes: number | null;
}

export interface WorkflowTimeConfigRow {
  id: number;
  workflow_type: string;
  stage_name: string;
  unit_slug: string | null;
  expected_duration_minutes: number | null;
  warning_threshold_minutes: number | null;
  critical_threshold_minutes: number | null;
  is_active: boolean;
}

export interface OverviewStats {
  totalActive: number;
  averageTurnaroundMinutesToday: number | null;
  slaBreachesActive: number;
  overdueCount: number;
}

export interface SlaBreach {
  workflowType: string;
  recordId: number;
  stageName: string | null;
  unitSlug: string | null;
  startedAt: string;
  endedAt: string | null;
  actualMinutes: number;
  expectedMinutes: number | null;
  criticalThresholdMinutes: number | null;
}

export interface StaffPerformanceRow {
  workflowType: string;
  count: number;
  avgMinutes: number | null;
  fastestMinutes: number | null;
  slowestMinutes: number | null;
}

export interface StaffLeaderboardRow {
  userId: number;
  fullName: string;
  unitSlug: string | null;
  count: number;
  avgMinutes: number | null;
  fastestMinutes: number | null;
  slowestMinutes: number | null;
}

export interface UnitPerformance {
  unitSlug: string;
  stages: { workflowType: string; stageName: string; count: number; avgMinutes: number | null; slaStatus: SlaStatus }[];
  slaComplianceRate: number | null;
}

export const getRecordTurnaround = (workflowType: string, recordId: number | string): Promise<RecordTurnaround> =>
  timeEngineFetch(`/record/${encodeURIComponent(workflowType)}/${recordId}`);

export const getOverview = (params?: { dateFrom?: string; dateTo?: string }): Promise<OverviewStats> => {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return timeEngineFetch(`/overview${qs ? `?${qs}` : ''}`);
};

export const getLive = (): Promise<LiveSegment[]> => timeEngineFetch('/live');

export const getSlaBreaches = (params?: { dateFrom?: string; dateTo?: string; workflowType?: string; unitId?: string }): Promise<SlaBreach[]> => {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return timeEngineFetch(`/sla-breaches${qs ? `?${qs}` : ''}`);
};

export const getStaffPerformance = (userId: number | string, params?: { dateFrom?: string; dateTo?: string; workflowType?: string }): Promise<StaffPerformanceRow[]> => {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return timeEngineFetch(`/staff/${userId}${qs ? `?${qs}` : ''}`);
};

export const getStaffLeaderboard = (params?: { dateFrom?: string; dateTo?: string; workflowType?: string }): Promise<StaffLeaderboardRow[]> => {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return timeEngineFetch(`/staff-leaderboard${qs ? `?${qs}` : ''}`);
};

export const getUnitPerformance = (unitSlug: string, params?: { dateFrom?: string; dateTo?: string; workflowType?: string }): Promise<UnitPerformance> => {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return timeEngineFetch(`/unit/${encodeURIComponent(unitSlug)}${qs ? `?${qs}` : ''}`);
};

export const getWorkflowTimeConfig = (): Promise<WorkflowTimeConfigRow[]> => timeEngineFetch('/config');

export const saveWorkflowTimeConfig = (payload: Partial<WorkflowTimeConfigRow>): Promise<WorkflowTimeConfigRow> =>
  timeEngineFetch('/config', { method: 'POST', body: JSON.stringify(payload) });
