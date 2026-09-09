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

const hrInsuranceFetch = (path: string, options?: RequestInit) =>
  jsonFetch(`${API_URL}/hr/insurance`, path, options);
const selfInsuranceFetch = (path: string, options?: RequestInit) =>
  jsonFetch(`${API_URL}/hr-self/insurance`, path, options);

const postJson = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const INSURANCE_QUERY = {
  staleTime: 30_000,
  gcTime: 10 * 60_000,
  refetchOnWindowFocus: false,
  retry: 1,
  placeholderData: (previousData: unknown) => previousData,
};

export type InsuranceCategoryInput = {
  id?: number;
  name: string;
  outpatientLimit: number;
  inpatientLimit: number;
};

export type InsuranceCategory = {
  id: number;
  name: string;
  isOverride: boolean;
  overrideReason: string | null;
  outpatient: { limit: number; used: number; remaining: number };
  inpatient: { limit: number; used: number; remaining: number };
};

export type InsuranceClaim = {
  id: number;
  categoryId: number;
  categoryName: string;
  claimType: 'inpatient' | 'outpatient';
  amount: number;
  hospitalName: string | null;
  claimDate: string;
  notes: string | null;
  loggedBy: string | null;
  loggedAt: string;
};

export type InsuranceTransfer = {
  id: number;
  fromCategoryId: number;
  fromCategoryName: string;
  toCategoryId: number;
  toCategoryName: string;
  transferType: 'inpatient' | 'outpatient';
  amount: number;
  reason: string | null;
  initiatedBy: string | null;
  initiatedAt: string;
  flowType: 'staff_confirm' | 'hr_override';
  status: 'pending' | 'approved' | 'rejected' | 'acknowledged' | 'reversed';
  staffRespondedAt: string | null;
  notes: string | null;
};

export type InsuranceProfile = {
  policy: { id: number; startDate: string; endDate: string; isActive: boolean };
  template: { id: number; name: string; description: string | null };
  categories: InsuranceCategory[];
  totals: { limit: number; used: number; remaining: number };
  claims: InsuranceClaim[];
  transfers: InsuranceTransfer[];
  pendingForStaff: Array<{
    id: number;
    fromCategoryName: string;
    toCategoryName: string;
    transferType: 'inpatient' | 'outpatient';
    amount: number;
    reason: string | null;
    flowType: 'staff_confirm' | 'hr_override';
    initiatedBy: string | null;
    initiatedAt: string;
  }>;
};

export const insuranceApi = {
  getPolicy: () => hrInsuranceFetch('/policy'),
  saveTemplate: (data: {
    name: string;
    description?: string;
    policyStartDate: string;
    policyEndDate: string;
    categories: InsuranceCategoryInput[];
  }) => hrInsuranceFetch('/policy', postJson(data)),
  resetPolicy: (data?: { newStartDate?: string; newEndDate?: string }) =>
    hrInsuranceFetch('/policy/reset', postJson(data || {})),
  resetHistory: () => hrInsuranceFetch('/policy/resets'),
  getStaffProfile: (employeeId: string | number): Promise<InsuranceProfile> =>
    hrInsuranceFetch(`/staff/${employeeId}`),
  setOverride: (
    employeeId: string | number,
    data: { categoryId: number; outpatientLimit?: number; inpatientLimit?: number; reason?: string }
  ) => hrInsuranceFetch(`/staff/${employeeId}/override`, postJson(data)),
  logClaim: (
    employeeId: string | number,
    data: {
      categoryId: number;
      claimType: 'inpatient' | 'outpatient';
      amount: number;
      hospitalName?: string;
      claimDate?: string;
      notes?: string;
      force?: boolean;
    }
  ) => hrInsuranceFetch(`/staff/${employeeId}/claims`, postJson(data)),
  initiateTransfer: (
    employeeId: string | number,
    data: {
      fromCategoryId: number;
      toCategoryId: number;
      transferType: 'inpatient' | 'outpatient';
      amount: number;
      reason?: string;
      immediate?: boolean;
    }
  ) => hrInsuranceFetch(`/staff/${employeeId}/transfers`, postJson(data)),
  reverseTransfer: (transferId: string | number) =>
    hrInsuranceFetch(`/transfers/${transferId}/reverse`, { method: 'POST' }),
  overview: () => hrInsuranceFetch('/overview'),
  pendingTransfers: () => hrInsuranceFetch('/pending-transfers'),
};

export const insuranceSelfApi = {
  me: (): Promise<InsuranceProfile | null> => selfInsuranceFetch('/me'),
  respondToTransfer: (transferId: string | number, action: 'approve' | 'reject' | 'acknowledge', reason?: string) =>
    selfInsuranceFetch(`/transfers/${transferId}/respond`, postJson({ action, reason })),
};
