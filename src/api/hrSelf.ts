import { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function selfFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/hr-self${path}`, {
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

export const HR_SELF_QUERY = {
  staleTime: 60_000,
  gcTime: 10 * 60_000,
  refetchOnWindowFocus: false,
  retry: 1,
  placeholderData: (previousData: unknown) => previousData,
};

export const hrSelfApi = {
  me: () => selfFetch('/me'),
  attendance: (month: number, year: number) => selfFetch(`/attendance?month=${month}&year=${year}`),
  attendanceToday: () => selfFetch('/attendance/today'),
  clockIn: (latitude: number, longitude: number) =>
    selfFetch('/attendance/clock-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude, longitude }),
    }),
  clockOut: (latitude: number, longitude: number) =>
    selfFetch('/attendance/clock-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude, longitude }),
    }),
  leaveBalances: () => selfFetch('/leave/balances'),
  leaveRequests: () => selfFetch('/leave/requests'),
  createLeaveRequest: (form: FormData) =>
    selfFetch('/leave/requests', {
      method: 'POST',
      body: form,
    }),
  cancelLeaveRequest: (id: number | string) =>
    selfFetch(`/leave/requests/${id}/cancel`, { method: 'POST' }),
  formRequests: () => selfFetch('/forms/requests'),
  createFormRequest: (form: FormData) =>
    selfFetch('/forms/requests', {
      method: 'POST',
      body: form,
    }),
  payslips: () => selfFetch('/payslips'),
  payslip: (month: number, year: number) => selfFetch(`/payslips/${month}/${year}`),
};

export function countWeekdays(start: string, end: string) {
  if (!start || !end) return 0;
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  let n = 0;
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) n += 1;
  }
  return n;
}

export function formatTenure(startDate?: string | null) {
  if (!startDate) return '—';
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return '—';
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0 && rem === 0) return 'Less than a month';
  const y = years ? `${years} year${years === 1 ? '' : 's'}` : '';
  const m = rem ? `${rem} month${rem === 1 ? '' : 's'}` : '';
  return [y, m].filter(Boolean).join(', ');
}

export const SYSTEM_ROLE_OPTIONS = [
  { label: 'NOC Engineer', value: 'noc' },
  { label: 'IP Engineer', value: 'ip' },
  { label: 'TS Engineer', value: 'ts' },
  { label: 'Finance Officer', value: 'finance' },
  { label: 'CX / Support', value: 'cx' },
  { label: 'Project Unit', value: 'project_unit' },
  { label: 'HR', value: 'hr' },
  { label: 'Admin', value: 'admin' },
  { label: 'Director', value: 'director' },
  { label: 'No System Access', value: '' },
];

export const SELF_LEAVE_TYPES = [
  { label: 'Annual Leave', value: 'Annual' },
  { label: 'Sick Leave', value: 'Sick' },
  { label: 'Emergency Leave', value: 'Emergency' },
  { label: 'Maternity Leave', value: 'Maternity' },
  { label: 'Paternity Leave', value: 'Paternity' },
  { label: 'Unpaid Leave', value: 'Unpaid' },
];

export const SELF_FORM_TYPES = [
  {
    type: 'Reference Letter',
    description: 'A formal letter confirming your employment for external use',
  },
  {
    type: 'Employment Confirmation Letter',
    description: 'Official confirmation of your current position and tenure',
  },
  {
    type: 'Salary Advance Request',
    description: 'Request an advance on your monthly salary',
  },
  {
    type: 'Transfer Request',
    description: 'Request a transfer to a different department or location',
  },
  {
    type: 'Complaint/Grievance',
    description: 'Submit a formal complaint or grievance to HR',
  },
];
