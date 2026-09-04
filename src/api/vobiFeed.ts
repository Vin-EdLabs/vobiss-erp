import { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface VobiFeedEntry {
  id: number;
  company: string;
  narrated_text: string;
  created_at: string;
  expires_at: string;
}

export const getVobiFeed = async (company = 'CW'): Promise<{ entries: VobiFeedEntry[] }> => {
  const res = await fetch(`${API_URL}/vobi-feed?company=${encodeURIComponent(company)}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed (${res.status})`);
  }
  return res.json();
};
