import { API_URL } from '@/lib/api';
import type { LinkedReferenceRow, ReferenceSummary } from '@/lib/referenceRegistry';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function refFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/references${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export type ValidateReferenceResult =
  | ({ found: true } & ReferenceSummary)
  | { found: false; message: string };

/** GET /api/references/validate?ref=... — never throws on "not found", only on a real request failure. */
export async function validateReference(ref: string): Promise<ValidateReferenceResult> {
  const res = await fetch(`${API_URL}/references/validate?ref=${encodeURIComponent(ref)}`, {
    headers: { ...getAuthHeader() },
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok || res.status === 404) return data;
  throw new Error(data.error || data.message || 'Failed to validate the reference number.');
}

export async function searchReferencesFreeText(q: string): Promise<ReferenceSummary[]> {
  const data = await refFetch(`/search?q=${encodeURIComponent(q)}`);
  return data.results || [];
}

export async function getLinkedReferences(type: string, id: number | string): Promise<{ outbound: LinkedReferenceRow[]; inbound: LinkedReferenceRow[] }> {
  return refFetch(`/linked/${type}/${id}`);
}

export async function linkReference(sourceType: string, sourceId: number | string, linkedType: string, linkedId: number | string): Promise<LinkedReferenceRow> {
  return refFetch('/link', {
    method: 'POST',
    body: JSON.stringify({ sourceType, sourceId, linkedType, linkedId }),
  });
}

export async function unlinkReference(id: number): Promise<{ success: boolean }> {
  return refFetch(`/link/${id}`, { method: 'DELETE' });
}

export interface ReferenceFlow {
  record: ReferenceSummary;
  linkedTo: ReferenceSummary[];
  linkedFrom: ReferenceSummary[];
}

export async function getReferenceFlow(type: string, id: number | string): Promise<ReferenceFlow> {
  return refFetch(`/flow/${type}/${id}`);
}
