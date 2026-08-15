import { API_URL } from '@/lib/api';

const authHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function todosFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/todos${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('vobiss-auth-logout'));
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export type UserTodo = {
  id: number;
  user_id: number;
  text: string;
  completed: boolean;
  reminder_at: string | null;
  created_at: string;
  updated_at: string;
};

export const todosApi = {
  list: () => todosFetch('') as Promise<UserTodo[]>,
  create: (body: { text: string; reminder_at?: string | null }) =>
    todosFetch('', { method: 'POST', body: JSON.stringify(body) }) as Promise<UserTodo>,
  update: (id: number, body: { text?: string; completed?: boolean; reminder_at?: string | null }) =>
    todosFetch(`/${id}`, { method: 'PATCH', body: JSON.stringify(body) }) as Promise<UserTodo>,
  remove: (id: number) => todosFetch(`/${id}`, { method: 'DELETE' }) as Promise<{ ok: boolean }>,
};
