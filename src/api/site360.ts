import { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function get(path: string) {
  const res = await fetch(`${API_URL}/site360${path}`, { headers: { ...getAuthHeader() } });
  if (res.status === 401) {
    localStorage.removeItem('token');
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export interface SiteOverview {
  id: number;
  siteCode: string;
  siteName: string;
  address: string | null;
  region: string | null;
  status: string | null;
  bandwidth: string | null;
  serviceType: string | null;
  createdAt: string;
  updatedAt: string;
  client: { id: number; code: string; name: string } | null;
  salesOwner: string | null;
}

export interface SiteModuleInfo {
  key: string;
  label: string;
}

export interface SiteActivityItem {
  id: number;
  module: string;
  ref: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  actor: string | null;
  date: string;
  href: string;
}

export const site360Api = {
  getOverview: (siteId: number | string): Promise<{ success: boolean; site: SiteOverview; modules: SiteModuleInfo[] }> =>
    get(`/${siteId}/overview`),

  getStats: (siteId: number | string): Promise<{ success: boolean; stats: Record<string, { label: string; count: number }> }> =>
    get(`/${siteId}/stats`),

  getModuleActivity: (
    siteId: number | string,
    moduleKey: string,
    params: { limit?: number; offset?: number } = {}
  ): Promise<{ success: boolean; items: SiteActivityItem[]; total: number }> => {
    const q = new URLSearchParams({ module: moduleKey });
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    return get(`/${siteId}/activity?${q.toString()}`);
  },

  getTimeline: (
    siteId: number | string,
    params: { limit?: number; offset?: number } = {}
  ): Promise<{ success: boolean; items: SiteActivityItem[]; total: number }> => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return get(`/${siteId}/timeline${suffix}`);
  },
};
