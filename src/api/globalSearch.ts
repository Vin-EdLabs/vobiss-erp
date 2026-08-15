import { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export type GlobalSearchResultKind =
  | 'ticket'
  | 'cash_request'
  | 'material_request'
  | 'item_return'
  | 'project_request';

export interface GlobalSearchResult {
  kind: GlobalSearchResultKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export async function globalExecutiveSearch(query: string): Promise<GlobalSearchResult[]> {
  const q = encodeURIComponent(query.trim());
  const res = await fetch(`${API_URL}/search/global?q=${q}`, {
    headers: { ...getAuthHeader() },
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Search failed');
  }
  const data = await res.json();
  if (!data.success) return [];
  return data.results || [];
}
