import { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function nocFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/noc/shifts${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export interface ShiftDefinition {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  display_order: number;
}

export interface ShiftStaffMember {
  userId: number;
  fullName: string;
  avatarUrl: string | null;
  isShiftLead: boolean;
  isPrimaryDuty: boolean;
  displayOrder: number;
}

export interface StaffOption {
  id: number;
  fullName: string;
  avatarUrl: string | null;
}

export interface DutySnapshot {
  scheduleId: number | null;
  shiftDefinitionId: number;
  shiftName: string;
  date: string;
  startsAt: string;
  endsAt: string;
  shiftLead: { userId: number; fullName: string } | null;
  primaryDutyStaff: { userId: number; fullName: string } | null;
  staff: ShiftStaffMember[];
}

export interface CurrentDutyResponse {
  asOf: string;
  current: DutySnapshot | null;
  next: DutySnapshot | null;
}

export interface WeekShiftCell {
  shiftDefinitionId: number;
  name: string;
  startTime: string;
  endTime: string;
  scheduleId: number | null;
  status: 'active' | 'upcoming' | 'completed';
  staff: ShiftStaffMember[];
}

export interface WeekDay {
  date: string;
  dayLabel: string;
  shifts: WeekShiftCell[];
}

export interface WeekRosterResponse {
  weekStart: string;
  weekEnd: string;
  days: WeekDay[];
}

export const getShiftDefinitions = (): Promise<ShiftDefinition[]> => nocFetch('/definitions');

export const updateShiftDefinition = (id: number, payload: { start_time: string; end_time: string }): Promise<ShiftDefinition> =>
  nocFetch(`/definitions/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

export const getStaffOptions = (): Promise<StaffOption[]> => nocFetch('/staff-options');

export const getWeekRoster = (weekStart: string): Promise<WeekRosterResponse> =>
  nocFetch(`/week?start=${encodeURIComponent(weekStart)}`);

export const getCurrentDuty = (): Promise<CurrentDutyResponse> => nocFetch('/current-duty');

export const getDutyAt = (isoTimestamp: string): Promise<CurrentDutyResponse> =>
  nocFetch(`/current-duty?at=${encodeURIComponent(isoTimestamp)}`);

export const createDaySchedule = (date: string, shiftDefinitionId: number): Promise<{ scheduleId: number; created: boolean }> =>
  nocFetch('/schedules', { method: 'POST', body: JSON.stringify({ date, shift_definition_id: shiftDefinitionId }) });

export const addStaffToShift = (
  scheduleId: number,
  payload: { userIds: number[]; isShiftLeadUserId?: number | null; isPrimaryDutyUserId?: number | null }
): Promise<{ staff: ShiftStaffMember[] }> =>
  nocFetch(`/schedules/${scheduleId}/staff`, { method: 'POST', body: JSON.stringify(payload) });

export const removeStaffFromShift = (scheduleId: number, userId: number): Promise<{ ok: true }> =>
  nocFetch(`/schedules/${scheduleId}/staff/${userId}`, { method: 'DELETE' });

export const setShiftLead = (scheduleId: number, userId: number, isShiftLead: boolean): Promise<{ staff: ShiftStaffMember[] }> =>
  nocFetch(`/schedules/${scheduleId}/staff/${userId}/lead`, { method: 'PUT', body: JSON.stringify({ isShiftLead }) });

export const setPrimaryDuty = (scheduleId: number, userId: number, isPrimaryDuty: boolean): Promise<{ staff: ShiftStaffMember[] }> =>
  nocFetch(`/schedules/${scheduleId}/staff/${userId}/primary-duty`, { method: 'PUT', body: JSON.stringify({ isPrimaryDuty }) });

export const reorderStaff = (scheduleId: number, order: number[]): Promise<{ staff: ShiftStaffMember[] }> =>
  nocFetch(`/schedules/${scheduleId}/staff/reorder`, { method: 'PUT', body: JSON.stringify({ order }) });

export const copyDayToDay = (scheduleId: number, targetDate: string): Promise<{ scheduleId: number; staff: ShiftStaffMember[] }> =>
  nocFetch(`/schedules/${scheduleId}/copy-to`, { method: 'POST', body: JSON.stringify({ targetDate }) });

export const copyWeekForward = (weekStart: string): Promise<{ copiedScheduleIds: number[]; nextWeekStart: string }> =>
  nocFetch(`/weeks/${weekStart}/copy-forward`, { method: 'POST' });

export const publishWeek = (weekStart: string): Promise<{ ok: true; notifiedCount: number }> =>
  nocFetch(`/weeks/${weekStart}/publish`, { method: 'POST' });

export const deleteSchedule = (scheduleId: number): Promise<{ ok: true }> =>
  nocFetch(`/schedules/${scheduleId}`, { method: 'DELETE' });
