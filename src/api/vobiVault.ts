import { API_URL } from '@/lib/api';

const VAULT_TOKEN_KEY = 'vobi_vault_token';

const authHeaders = (extra: HeadersInit = {}): HeadersInit => {
  const token = localStorage.getItem('token');
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
};

export function getStoredVaultToken(): string | null {
  return sessionStorage.getItem(VAULT_TOKEN_KEY);
}

export function storeVaultToken(token: string) {
  sessionStorage.setItem(VAULT_TOKEN_KEY, token);
}

export function clearVaultToken() {
  sessionStorage.removeItem(VAULT_TOKEN_KEY);
}

async function vaultFetch(path: string, options: RequestInit = {}, needsUnlock = false) {
  const headers: Record<string, string> = {
    ...(authHeaders() as Record<string, string>),
    ...(options.headers as Record<string, string> | undefined),
  };
  if (needsUnlock) {
    const vt = getStoredVaultToken();
    if (vt) headers['X-Vobi-Vault-Token'] = vt;
  }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_URL}/vobi-vault${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data?.code === 'VAULT_LOCKED') clearVaultToken();
    throw new Error(data.error || `Vault request failed (${res.status})`);
  }
  return data;
}

export function getVobiVaultStatus() {
  return vaultFetch('/status') as Promise<{
    success: boolean;
    configured: boolean;
    created_at: string | null;
    updated_at: string | null;
    last_unlocked_at: string | null;
  }>;
}

export async function setupVobiVaultKey(accessKey: string, confirmKey: string) {
  const data = await vaultFetch('/setup', {
    method: 'POST',
    body: JSON.stringify({ accessKey, confirmKey }),
  });
  if (data.vaultToken) storeVaultToken(data.vaultToken);
  return data as { success: boolean; vaultToken: string; expiresIn: string; message: string };
}

export async function unlockVobiVault(accessKey: string) {
  const data = await vaultFetch('/unlock', {
    method: 'POST',
    body: JSON.stringify({ accessKey }),
  });
  if (data.vaultToken) storeVaultToken(data.vaultToken);
  return data as { success: boolean; vaultToken: string; expiresIn: string };
}

export function getVobiVaultStats() {
  return vaultFetch('/stats', {}, true) as Promise<{
    success: boolean;
    stats: {
      threads: number;
      messages: number;
      vobi_replies: number;
      user_messages: number;
      last_activity: string | null;
    };
  }>;
}

export function listVobiVaultThreads(params?: { q?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.q) qs.set('q', params.q);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const q = qs.toString();
  return vaultFetch(`/threads${q ? `?${q}` : ''}`, {}, true) as Promise<{
    success: boolean;
    total: number;
    threads: Array<{
      channel_id: string;
      user_id: number;
      username: string;
      display_name: string;
      email: string | null;
      role: string | null;
      main_role: string | null;
      position: string | null;
      message_count: number;
      vobi_replies: number;
      user_messages: number;
      last_message_at: string | null;
      last_preview: string | null;
      thread_created_at: string;
    }>;
  }>;
}

export function getVobiVaultMessages(userId: number | string, params?: { limit?: number }) {
  const qs = params?.limit ? `?limit=${params.limit}` : '';
  return vaultFetch(`/threads/${userId}/messages${qs}`, {}, true) as Promise<{
    success: boolean;
    thread: {
      channel_id: string;
      user_id: number;
      username: string;
      display_name: string;
      email: string | null;
      role: string | null;
      position: string | null;
      created_at: string;
    };
    messages: Array<{
      id: string;
      role: 'user' | 'assistant';
      body: string;
      message_type: string;
      meta: unknown;
      created_at: string;
      sender_id: number | null;
    }>;
  }>;
}
