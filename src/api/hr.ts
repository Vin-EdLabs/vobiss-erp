import BASE_URL, { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function hrFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/hr${path}`, {
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
    const error = new Error(err.error || `Request failed (${res.status})`);
    Object.assign(error, err);
    throw error;
  }
  if (res.status === 204) return null;
  return res.json();
}

export function hrFileUrl(
  path?: string | null,
  opts?: { download?: boolean; name?: string | null },
) {
  if (!path) return '';
  const base = path.startsWith('http')
    ? path
    : `${String(BASE_URL || '').replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  if (!opts?.download && !opts?.name) return base;
  try {
    const url = new URL(base, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (opts?.download) url.searchParams.set('download', '1');
    if (opts?.name) url.searchParams.set('name', opts.name);
    return url.toString();
  } catch {
    return base;
  }
}

export type HrEmployee = {
  id: number;
  user_id?: number | null;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  department?: string | null;
  position?: string | null;
  location?: string | null;
  employment_type: string;
  start_date?: string | null;
  contract_end_date?: string | null;
  basic_salary?: number | string;
  allowances?: number | string;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  line_manager?: string | null;
  system_role?: string | null;
  status: string;
  suspension_reason?: string | null;
  suspended_at?: string | null;
  unsuspend_reason?: string | null;
  unsuspended_at?: string | null;
  created_at?: string;
};

export const HR_QUERY = {
  staleTime: 60_000,
  gcTime: 10 * 60_000,
  refetchOnWindowFocus: false,
  retry: 1,
  placeholderData: (previousData: unknown) => previousData,
};

export const hrApi = {
  dashboardStats: () => hrFetch('/dashboard/stats'),
  dashboardActivity: () => hrFetch('/dashboard/activity'),
  employees: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return hrFetch(`/employees${q}`);
  },
  employee: (id: number | string) => hrFetch(`/employees/${id}`),
  createEmployee: (form: FormData) => hrFetch('/employees', { method: 'POST', body: form }),
  updateEmployee: (id: number | string, form: FormData) =>
    hrFetch(`/employees/${id}`, { method: 'PUT', body: form }),
  deactivateEmployee: (id: number | string) => hrFetch(`/employees/${id}`, { method: 'DELETE' }),
  suspendEmployee: (id: number | string, reason: string) =>
    hrFetch(`/employees/${id}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }),
  unsuspendEmployee: (id: number | string, reason: string) =>
    hrFetch(`/employees/${id}/unsuspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }),
  employeeLeave: (id: number | string) => hrFetch(`/employees/${id}/leave`),
  employeePayroll: (id: number | string) => hrFetch(`/employees/${id}/payroll`),
  employeeAttendance: (id: number | string, month: number, year: number) =>
    hrFetch(`/employees/${id}/attendance?month=${month}&year=${year}`),
  employeeDocuments: (id: number | string) => hrFetch(`/employees/${id}/documents`),
  leave: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return hrFetch(`/leave${q}`);
  },
  createLeave: (body: Record<string, unknown>) =>
    hrFetch('/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  updateLeave: (id: number | string, body: Record<string, unknown>) =>
    hrFetch(`/leave/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  leaveBalances: (year?: number) => hrFetch(`/leave/balances${year ? `?year=${year}` : ''}`),
  leaveCalendar: (month: number, year: number) => hrFetch(`/leave/calendar?month=${month}&year=${year}`),
  payroll: (month?: number, year?: number) =>
    month && year ? hrFetch(`/payroll?month=${month}&year=${year}`) : hrFetch('/payroll'),
  generatePayroll: (month: number, year: number, body?: Record<string, unknown>) =>
    hrFetch('/payroll/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year, ...(body || {}) }),
    }),
  previewPayroll: (month: number, year: number, body?: Record<string, unknown>) =>
    hrFetch('/payroll/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year, ...(body || {}) }),
    }),
  payrollSettings: () => hrFetch('/payroll/settings'),
  savePayrollSettings: (body: Record<string, unknown>) =>
    hrFetch('/payroll/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  approvePayroll: (id: number | string) => hrFetch(`/payroll/${id}/approve`, { method: 'PATCH' }),
  markPayrollPaid: (id: number | string) => hrFetch(`/payroll/${id}/mark-paid`, { method: 'PATCH' }),
  employeeAllowances: (employeeId: number | string) => hrFetch(`/employee-allowances/${employeeId}`),
  createEmployeeAllowance: (body: Record<string, unknown>) =>
    hrFetch('/employee-allowances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  updateEmployeeAllowance: (id: number | string, body: Record<string, unknown>) =>
    hrFetch(`/employee-allowances/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteEmployeeAllowance: (id: number | string) => hrFetch(`/employee-allowances/${id}`, { method: 'DELETE' }),
  payrollItems: (id: number | string) => hrFetch(`/payroll/${id}/items`),
  updatePayrollStatus: (id: number | string, status: string) =>
    hrFetch(`/payroll/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
  payslip: (employeeId: number | string, month: number, year: number) =>
    hrFetch(`/payroll/employee/${employeeId}/slip/${month}/${year}`),
  attendanceSummary: (month: number, year: number) =>
    hrFetch(`/attendance/summary?month=${month}&year=${year}`),
  attendanceLive: () => hrFetch('/attendance/live'),
  attendanceTodaySummary: () => hrFetch('/attendance/today-summary'),
  attendanceHeatmap: (month: number, year: number) =>
    hrFetch(`/attendance/heatmap?month=${month}&year=${year}`),
  hrSettings: () => hrFetch('/settings'),
  saveHrSettings: (body: Record<string, unknown>) =>
    hrFetch('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  analytics: (path: string, params?: Record<string, string | number>) => {
    const q = params
      ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))).toString()
      : '';
    return hrFetch(`/analytics/${path}${q}`);
  },
  report: (path: string, params?: Record<string, string | number>) => {
    const q = params
      ? '?' +
        new URLSearchParams(
          Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== '' && v != null)
              .map(([k, v]) => [k, String(v)])
          )
        ).toString()
      : '';
    return hrFetch(`/reports/${path}${q}`);
  },
  attendance: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return hrFetch(`/attendance${q}`);
  },
  logAttendance: (body: Record<string, unknown>) =>
    hrFetch('/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  updateAttendance: (id: number | string, body: Record<string, unknown>) =>
    hrFetch(`/attendance/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  documents: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return hrFetch(`/documents${q}`);
  },
  uploadDocument: (form: FormData) => hrFetch('/documents', { method: 'POST', body: form }),
  deleteDocument: (id: number | string) => hrFetch(`/documents/${id}`, { method: 'DELETE' }),
  leaveRequests: async (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    try {
      return await hrFetch(`/leave-requests${q}`);
    } catch (err: any) {
      if (String(err.message || '').includes('404')) return [];
      throw err;
    }
  },
  reviewLeaveRequest: (id: number | string, body: Record<string, unknown>) =>
    hrFetch(`/leave-requests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  formRequests: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return hrFetch(`/form-requests${q}`);
  },
  reviewFormRequest: (id: number | string, body: Record<string, unknown>) =>
    hrFetch(`/form-requests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};
