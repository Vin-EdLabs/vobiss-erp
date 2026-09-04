// Updated api.ts with support for multi-approver selection and item returns
import { statusToVobiErrorCode, type VobiFieldError } from '@/lib/vobiErrorMessages';
import { vobiAmbientStore } from '@/stores/vobiAmbientStore';
import { API_URL } from '@/lib/api';
import { getActiveShareToken, isSharedRoute, shareTokenHeaders } from '@/lib/shareSession';
export { default as BASE_URL, API_URL } from '@/lib/api';

// Helper to get auth header
const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const currentPageContext = () => {
  if (typeof window === 'undefined') return 'unknown';
  return window.location.pathname.replace(/^\/+/, '').replace(/\/+/g, '-') || 'dashboard';
};

const extractFieldErrors = (errorData: any): VobiFieldError[] => {
  const source = errorData?.fieldErrors || errorData?.errors || errorData?.details;
  if (!Array.isArray(source)) return [];

  return source
    .map((entry: any) => {
      if (typeof entry === 'string') return null;
      const field = entry?.field || entry?.path || entry?.name;
      const message = entry?.message || entry?.error;
      return field ? { field: String(field), message: String(message || '') } : null;
    })
    .filter(Boolean) as VobiFieldError[];
};

const notifyVobiApiError = (status: number | undefined, errorData: any, fallbackMessage: string) => {
  const fieldErrors = extractFieldErrors(errorData);
  if (fieldErrors.length > 0) {
    vobiAmbientStore.getState().setExactIssue({
      title: `${fieldErrors.length} thing${fieldErrors.length === 1 ? '' : 's'} need fixing`,
      body: errorData?.error || errorData?.message || fallbackMessage,
      fieldErrors,
      action: 'Show me',
    });
    return;
  }

  vobiAmbientStore.getState().setError({
    errorCode: errorData?.errorCode || errorData?.code || statusToVobiErrorCode(status),
    fieldErrors,
    pageContext: currentPageContext(),
    rawMessage: errorData?.error || errorData?.message || fallbackMessage,
  });
};

const clearStaffSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('vobiss-auth-logout'));
};

// Custom fetch wrapper to handle auth and 401 errors smoothly
const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...getAuthHeader(),
        ...shareTokenHeaders(options.method),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    notifyVobiApiError(undefined, { errorCode: 'NETWORK_ERROR', error: message }, message);
    throw error;
  }

  if (response.status === 401) {
    // In a shared (read-only) view there is no session to expire — surface the error
    // to the caller instead of forcing a logout/redirect that doesn't apply here.
    if (getActiveShareToken() || isSharedRoute()) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'This content is not available in the shared view.');
    }
    clearStaffSession();
    notifyVobiApiError(response.status, { errorCode: 'UNAUTHORIZED', error: 'Session expired. Please log in again.' }, 'Session expired');
    throw new Error('Session expired. Please log in again.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    notifyVobiApiError(response.status, errorData, `HTTP error! status: ${response.status}`);
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  return response;
};

export async function registerFcmToken(token: string): Promise<void> {
  await apiFetch(`${API_URL}/push/fcm-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

export type ActivityFilterType = 'all' | 'requests' | 'approvals' | 'uploads' | 'notes';
export type ActivityDateRange = 'all' | 'today' | 'week' | 'month' | 'custom';

export interface PersonalActivity {
  id: number;
  action_type: string;
  category: Exclude<ActivityFilterType, 'all'> | 'other';
  description: string;
  you_description: string;
  record_type: string;
  record_id: number | null;
  record_label: string;
  view_path: string | null;
  created_at: string;
}

export async function getMyActivity(filters: {
  type?: ActivityFilterType;
  range?: ActivityDateRange;
  from?: string;
  to?: string;
  search?: string;
} = {}): Promise<PersonalActivity[]> {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const response = await apiFetch(`${API_URL}/activity/me${query.size ? `?${query}` : ''}`);
  const payload = await response.json();
  return Array.isArray(payload?.items) ? payload.items : [];
}

export async function unregisterFcmToken(token: string): Promise<void> {
  await apiFetch(`${API_URL}/push/fcm-token`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

/* ── Native Web Push (VAPID) ─────────────────────────────────────── */

export async function getPushPublicKey(): Promise<{ key: string; configured: boolean }> {
  const res = await fetch(`${API_URL}/push/public-key`);
  if (!res.ok) throw new Error('Failed to load push public key');
  return res.json();
}

export async function subscribePush(subscription: PushSubscription): Promise<void> {
  await apiFetch(`${API_URL}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription }),
  });
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  await apiFetch(`${API_URL}/push/subscribe`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}

export interface PushStats {
  webPushSubscriptions: number;
  fcmTokens: number;
  total: number;
  yourDevices: number;
  yourWebPushDevices: number;
  yourFcmDevices: number;
  vapidConfigured: boolean;
  fcmConfigured: boolean;
}

export async function getPushStats(): Promise<PushStats> {
  const res = await apiFetch(`${API_URL}/push/stats`);
  if (!res.ok) throw new Error('Failed to load push stats');
  return res.json();
}

export async function testPushBroadcast(): Promise<{ ok: boolean; push: { sent: number } }> {
  const res = await apiFetch(`${API_URL}/push/test-broadcast`, { method: 'POST' });
  if (!res.ok) throw new Error('Test broadcast failed');
  return res.json();
}

export async function testPushToSelf(): Promise<{ ok: boolean; push: { sent: number } }> {
  const res = await apiFetch(`${API_URL}/push/test-self`, { method: 'POST' });
  if (!res.ok) throw new Error('Self test failed');
  return res.json();
}

// Interfaces for type safety
interface Item {
  id: number;
  name: string;
  description: string | null;
  category_id: number | null;
  quantity: number;
  low_stock_threshold: number;
  vendor_name: string | null;
  unit_price: number | null;
  receipt_image: string | null;
  update_reason: string | null;
  created_at: string;
  updated_at: string;
  category_name?: string;
}

interface Category {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  itemCount: number;
}

interface ItemOut {
  id: number;
  person_name: string;
  item_id: number;
  quantity: number;
  date_time: string;
  item_name: string;
  category_name: string;
}

interface Request {
  id: number;
  created_by: string;
  team_leader_name: string;
  team_leader_phone: string;
  project_name: string;
  isp_name: string;
  location: string;
  deployment_type: 'Deployment' | 'Maintenance';
  release_by: string | null;
  received_by: string | null;
  type: 'material_request' | 'item_return';
  reason?: string;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  created_at: string;
  updated_at: string;
  item_count: number;
  reject_reason?: string | null;
  approver_names?: string;
}

interface RequestDetails extends Request {
  items: {
    id: number;
    request_id: number;
    item_id: number;
    quantity_requested: number | null;
    quantity_received: number | null;
    quantity_returned: number | null;
    item_name: string;
    current_stock: number;
    serial_number?: string | null;
  }[];
  approvals: {
    id: number;
    request_id: number;
    approver_name: string;
    signature: string;
    approved_at: string;
  }[];
  rejections?: {
    id: number;
    request_id: number;
    rejector_name: string;
    reason: string;
    created_at: string;
  }[];
  approvers?: {
    id: number;
    fullName: string;
    username: string;
    assigned_at: string;
  }[];
}

interface ItemRow {
  name: string;
  requested: string;
  received: string;
  returned: string;
}

interface AuditLog {
  id: number;
  user_id: number;
  username?: string;
  full_name?: string;
  action: string;
  ip_address: string;
  details: any;
  timestamp: string;
}

interface Supervisor {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export type UserRole =
  | 'user'
  | 'admin'
  | 'superadmin'
  | 'requester'
  | 'approver'
  | 'transport_unit'
  | 'transport_supervisor'
  | 'issuer'
  | 'stock_admin'
  | 'field_engineer'
  | 'field_engineer_admin'
  | 'finance'
  | 'finance_manager'
  | 'director'
  | 'cto'
  | 'cx'
  | 'noc'
  | 'noc_manager'
  | 'noc_supervisor'
  | 'ip'
  | 'ip_manager'
  | 'ip_supervisor'
  | 'ts_manager'
  | 'ts_supervisor'
  | 'project'
  | 'relationship_officer'
  | 'customer'
  | 'hr';

interface User {
  id: number;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  role: UserRole;
  main_role?: UserRole;
  roles?: string[];
  unit?: string | null;
  position?: string | null;
  units?: string[];
  created_at: string;
  company?: string;
}

interface Setting {
  key_name: string;
  value: string;
  description?: string;
  updated_at: string;
}

interface SerialNumber {
  id: number;
  item_id: number;
  serial_number: string;
  status: string;
  created_at: string;
}

interface Approver {
  id: number;
  fullName: string;
  canApproveMaterial?: boolean;
  canApproveCash?: boolean;
}

// Helper function to fetch public IP
const fetchPublicIP = async (): Promise<string> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    if (!response.ok) throw new Error('Failed to fetch IP');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.warn('Failed to fetch public IP, using fallback:', error);
    return 'unknown';
  }
};

// Get current logged-in user ID
const getCurrentUserId = (): number | null => {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      return user.id || null;
    } catch (e) {
      return null;
    }
  }
  return null;
};

// Auth
/** Fetch current user from DB (main_role, roles, units) so sidebar reflects admin role changes without re-login */
export const getMe = async (): Promise<{
  id: number;
  username: string;
  role: string;
  main_role: string;
  roles: string[];
  units: string[];
  unit?: string | null;
  position?: string | null;
  company?: string | null;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  status?: string;
  suspension_reason?: string | null;
  unsuspend_reason?: string | null;
  unsuspend_ack?: boolean;
  avatar_url?: string | null;
  permissions?: {
    realm_material_approver?: boolean;
    realm_cash_approver?: boolean;
    can_approve_material_request?: boolean;
    can_approve_cash_request?: boolean;
    can_release_cash?: boolean;
    can_execute_material?: boolean;
  };
}> => {
  const response = await apiFetch(`${API_URL}/me`);
  return await response.json();
};

export const ackUnsuspend = async (): Promise<void> => {
  await apiFetch(`${API_URL}/me/ack-unsuspend`, { method: 'POST' });
};

export const loginUser = async (username: string, password: string, ip?: string): Promise<{ token: string; user: { username: string; role: string; company?: string | null; first_name?: string; last_name?: string; full_name?: string } }> => {
  try {
    const effectiveIP = ip || await fetchPublicIP();
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password, ip: effectiveIP }),
    });

    if (response.status === 401) {
      throw new Error('Invalid username or password.');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Login failed (${response.status})`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error logging in:', error);
    throw error;
  }
};

export const logoutUser = async (): Promise<void> => {
  try {
    const response = await apiFetch(`${API_URL}/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error logging out:', error);
  }
};

// =============================================================================
// USERS — FULLY FIXED: NOW SENDS userId + ip TO MATCH BACKEND
// =============================================================================
export const getUsers = async (): Promise<User[]> => {
  try {
    const response = await apiFetch(`${API_URL}/users`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
};

export type UserDirectoryEntry = Pick<User, 'id' | 'first_name' | 'last_name' | 'username' | 'role' | 'position' | 'unit'>;

/** Basic id/name directory any authenticated user can read — for "assign to"/engineer pickers
 *  on self-service request forms (Transport, Fuel, Rental Vehicle). Unlike getUsers(), this
 *  does not require user-management admin access. */
export const getUserDirectory = async (): Promise<UserDirectoryEntry[]> => {
  try {
    const response = await apiFetch(`${API_URL}/users/directory`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching user directory:', error);
    throw error;
  }
};

export const createUser = async (
  firstName: string,
  lastName: string,
  email: string,
  role: UserRole,
  options?: {
    password?: string;
    sendEmail?: boolean;
    useAutoGenerate?: boolean;
    unit?: string;
    position?: string;
    units?: string[];
    company?: string;
  }
): Promise<User & { password?: string; emailSent?: boolean; emailWarning?: string }> => {
  try {
    const response = await apiFetch(`${API_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        role,
        password: options?.password?.trim() || undefined,
        useAutoGenerate: options?.useAutoGenerate === true,
        sendEmail: options?.sendEmail === true,
        unit: options?.unit || null,
        position: options?.position || null,
        units: Array.isArray(options?.units) ? options.units : [],
        company: options?.company || undefined,
      }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

export const updateUser = async (
  userId: number,
  updates: {
    first_name?: string;
    last_name?: string;
    email?: string;
    role?: string;
    roles?: string[];
    unit?: string | null;
    position?: string | null;
    units?: string[];
  }
): Promise<User> => {
  try {
    const currentUserId = getCurrentUserId();
    const ip = await fetchPublicIP();

    const response = await apiFetch(`${API_URL}/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updates, currentUserId, ip }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
};

export const deleteUser = async (userId: number): Promise<{ message: string }> => {
  try {
    const currentUserId = getCurrentUserId();
    const ip = await fetchPublicIP();

    const response = await apiFetch(`${API_URL}/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentUserId, ip }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
};

export const resetUserPassword = async (
  userId: number,
  options?: { password?: string; sendEmail?: boolean }
): Promise<{
  message: string;
  password?: string;
  username?: string;
  email?: string;
  emailSent?: boolean;
}> => {
  try {
    const response = await apiFetch(`${API_URL}/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: options?.password?.trim() || undefined,
        sendEmail: options?.sendEmail === true,
      }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error resetting password:', error);
    throw error;
  }
};

export const updateUserRole = async (
  userId: number,
  role: UserRole
): Promise<User> => {
  try {
    const currentUserId = getCurrentUserId();
    const ip = await fetchPublicIP();

    const response = await apiFetch(`${API_URL}/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, currentUserId, ip }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error updating role:', error);
    throw error;
  }
};

export const getApprovers = async (): Promise<Approver[]> => {
  try {
    const response = await apiFetch(`${API_URL}/users/approvers`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching approvers:', error);
    return [];
  }
};

// =============================================================================
// SUPERVISORS — UNCHANGED
// =============================================================================
export const getSupervisors = async (): Promise<Supervisor[]> => {
  try {
    const response = await apiFetch(`${API_URL}/supervisors`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching supervisors:', error);
    return [];
  }
};

export const addSupervisor = async (supervisorData: { name: string; email: string }): Promise<Supervisor> => {
  try {
    const response = await apiFetch(`${API_URL}/supervisors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(supervisorData),
    });
    return await response.json();
  } catch (error) {
    console.error('Error adding supervisor:', error);
    throw error;
  }
};

export const updateSupervisor = async (supervisorId: number, supervisorData: { name: string; email: string }): Promise<Supervisor> => {
  try {
    const response = await apiFetch(`${API_URL}/supervisors/${supervisorId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(supervisorData),
    });
    return await response.json();
  } catch (error) {
    console.error('Error updating supervisor:', error);
    throw error;
  }
};

export const deleteSupervisor = async (supervisorId: number): Promise<boolean> => {
  try {
    const response = await apiFetch(`${API_URL}/supervisors/${supervisorId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    return true;
  } catch (error) {
    console.error('Error deleting supervisor:', error);
    throw error;
  }
};

// =============================================================================
// LOW STOCK ALERT — UNCHANGED
// =============================================================================
export const sendLowStockAlert = async (data: { lowStockItems: Item[]; supervisors: Supervisor[] }): Promise<{ message: string }> => {
  try {
    const response = await apiFetch(`${API_URL}/send-low-stock-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  } catch (error) {
    console.error('Error sending low stock alert:', error);
    throw error;
  }
};

// =============================================================================
// ITEMS — UNCHANGED
// =============================================================================
export const getItems = async (): Promise<Item[]> => {
  try {
    const response = await apiFetch(`${API_URL}/items`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching items:', error);
    return [];
  }
};

export const addItem = async (formData: FormData): Promise<Item> => {
  try {
    const response = await apiFetch(`${API_URL}/items`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: formData,
    });
    const text = await response.text();
    if (!text.trim()) throw new Error('Server returned empty response for addItem');
    return JSON.parse(text);
  } catch (error) {
    console.error('Error adding item:', error);
    throw error;
  }
};

export const updateItem = async (itemId: number, formData: FormData): Promise<Item> => {
  try {
    const response = await apiFetch(`${API_URL}/items/${itemId}`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: formData,
    });
    const text = await response.text();
    if (!text.trim()) throw new Error('Server returned empty response for updateItem');
    return JSON.parse(text);
  } catch (error) {
    console.error('Error updating item:', error);
    throw error;
  }
};

export const deleteItem = async (itemId: number): Promise<boolean> => {
  try {
    await apiFetch(`${API_URL}/items/${itemId}`, { method: 'DELETE' });
    return true;
  } catch (error) {
    console.error('Error deleting item:', error);
    throw error;
  }
};

// =============================================================================
// CATEGORIES — UNCHANGED
// =============================================================================
export const getCategories = async (): Promise<Category[]> => {
  try {
    const response = await apiFetch(`${API_URL}/categories`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
};

export const addCategory = async (categoryData: { name: string; description?: string }): Promise<Category> => {
  try {
    const response = await apiFetch(`${API_URL}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(categoryData),
    });
    return await response.json();
  } catch (error) {
    console.error('Error adding category:', error);
    throw error;
  }
};

export const updateCategory = async (categoryId: number, categoryData: { name: string; description?: string }): Promise<Category> => {
  try {
    const response = await apiFetch(`${API_URL}/categories/${categoryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(categoryData),
    });
    return await response.json();
  } catch (error) {
    console.error('Error updating category:', error);
    throw error;
  }
};

export const deleteCategory = async (categoryId: number): Promise<boolean> => {
  try {
    await apiFetch(`${API_URL}/categories/${categoryId}`, { method: 'DELETE' });
    return true;
  } catch (error) {
    console.error('Error deleting category:', error);
    throw error;
  }
};

// =============================================================================
// ITEMS OUT — UNCHANGED
// =============================================================================
export const getItemsOut = async (): Promise<ItemOut[]> => {
  try {
    const response = await apiFetch(`${API_URL}/items-out`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching items out:', error);
    return [];
  }
};

export const issueItem = async (issueData: { personName: string; itemId: number; quantity: number }): Promise<ItemOut> => {
  try {
    const response = await apiFetch(`${API_URL}/items-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personName: issueData.personName,
        itemId: issueData.itemId,
        quantity: issueData.quantity,
      }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error issuing item:', error);
    throw error;
  }
};

// =============================================================================
// LOW STOCK & DASHBOARD — UNCHANGED
// =============================================================================
export const getLowStockItems = async (): Promise<Item[]> => {
  try {
    const response = await apiFetch(`${API_URL}/low-stock`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    return [];
  }
};

export const getDashboardStats = async (): Promise<{
  totalItems: number;
  totalCategories: number;
  itemsOut: number;
  lowStockItems: number;
  pendingRequests: number;
}> => {
  try {
    const response = await apiFetch(`${API_URL}/dashboard-stats`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return { totalItems: 0, totalCategories: 0, itemsOut: 0, lowStockItems: 0, pendingRequests: 0 };
  }
};

// =============================================================================
// REQUESTS — UNCHANGED (already perfect)
// =============================================================================
export const createRequest = async (
  requestData: {
    createdBy: string;
    teamLeaderName?: string;
    teamLeaderPhone?: string;
    projectName: string;
    ispName?: string | null;
    location: string;
    deployment?: 'Deployment' | 'Maintenance';
    releaseBy?: string | null;
    receivedBy?: string | null;
    reason?: string;
    items: { name: string; requested: number }[];
    ticket_id?: number | null;
    linked_cash_request_id?: number | null;
    linked_references?: { type: string; id: number }[];
  },
  selectedApproverIds?: number[] | null,
  type: 'material_request' | 'item_return' = 'material_request'
): Promise<Request> => {
  const payload: any = { ...requestData, type };

  if (selectedApproverIds && Array.isArray(selectedApproverIds) && selectedApproverIds.length > 0) {
    payload.selectedApproverIds = selectedApproverIds;
  }

  try {
    const response = await apiFetch(`${API_URL}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await response.json();
  } catch (error) {
    console.error('Error creating request:', error);
    throw error;
  }
};

export const getRequests = async (): Promise<Request[]> => {
  try {
    const response = await apiFetch(`${API_URL}/requests`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching requests:', error);
    return [];
  }
};

// =============================================================================
// SYSTEM NOTIFICATIONS
// =============================================================================

export interface SystemNotification {
  id: number;
  title: string;
  message: string;
  created_at: string;
  is_active: boolean;
  read: boolean;
  link_url?: string | null;
  notification_type?: string | null;
}

export const getNotifications = async (): Promise<SystemNotification[]> => {
  try {
    const response = await apiFetch(`${API_URL}/notifications`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }
};

export const createSystemNotification = async (
  title: string,
  message: string
): Promise<SystemNotification & { push?: { sent: number } }> => {
  const response = await apiFetch(`${API_URL}/notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, message }),
  });
  return await response.json();
};

export const markNotificationAsRead = async (id: number): Promise<{ message: string }> => {
  const response = await apiFetch(`${API_URL}/notifications/${id}/read`, {
    method: 'POST',
  });
  return await response.json();
};

export const deleteSystemNotification = async (id: number): Promise<{ message: string }> => {
  const response = await apiFetch(`${API_URL}/notifications/${id}`, {
    method: 'DELETE',
  });
  return await response.json();
};

export interface WorkspaceActivity {
  id: number;
  action: string;
  ip_address?: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface WorkspaceAttentionItem {
  id: string;
  kind: 'approval' | 'ticket' | 'project' | 'notification' | 'chat';
  title: string;
  subtitle: string;
  link: string;
  /** Present for kind=ticket — public ticket number (TCK-000022), not internal id */
  ticket_id?: string;
  priority: 'high' | 'normal';
  created_at: string;
}

export interface WorkspaceData {
  notifications: SystemNotification[];
  activities: WorkspaceActivity[];
  attentionItems?: WorkspaceAttentionItem[];
  stats: {
    unreadNotifications: number;
    activitiesThisWeek: number;
    lastLoginAt: string | null;
    attentionCount?: number;
  };
}

export const getWorkspace = async (): Promise<WorkspaceData> => {
  const response = await apiFetch(`${API_URL}/workspace`);
  return await response.json();
};

export const updateRequest = async (id: string | number, requestData: {
  createdBy: string;
  teamLeaderName?: string;
  teamLeaderPhone?: string;
  projectName: string;
  ispName?: string | null;
  location: string;
  deployment?: 'Deployment' | 'Maintenance';
  reason?: string;
  items: { name: string; requested: number }[];
}): Promise<{ message: string }> => {
  try {
    const response = await apiFetch(`${API_URL}/requests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
    });
    return await response.json();
  } catch (error) {
    console.error('Error updating request:', error);
    throw error;
  }
};

export const rejectRequest = async (id: string | number, data: { reason: string; rejectorName: string }): Promise<{ message: string }> => {
  try {
    const response = await apiFetch(`${API_URL}/requests/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  } catch (error) {
    console.error('Error rejecting request:', error);
    throw error;
  }
};

export const getRequestDetails = async (id: string | number): Promise<RequestDetails> => {
  try {
    const response = await apiFetch(`${API_URL}/requests/${id}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching request details:', error);
    throw error;
  }
};

export type SharedLinkPreview = Record<string, any>;

export type SharedLink = {
  id: number;
  token: string;
  recordType: string;
  recordId: number;
  pagePath: string;
  pageTitle: string | null;
  recordPreview: SharedLinkPreview | null;
  visibility: 'public' | 'private';
  createdByUserId: number | null;
  createdByName: string | null;
  expiresAt: string | null;
  revoked: boolean;
  viewCount: number;
  createdAt: string;
  status: 'active' | 'expired' | 'revoked';
  url: string;
};

export type ShareExpiry = '24h' | '7d' | '30d' | 'never';

export type GenerateShareLinkPayload = {
  recordType: string;
  recordId: number | string;
  pagePath: string;
  pageTitle?: string;
  recordPreview?: SharedLinkPreview;
  visibility: 'public' | 'private';
  expiry: ShareExpiry;
};

export const generateShareLink = async (payload: GenerateShareLinkPayload) => {
  const response = await apiFetch(`${API_URL}/shared-links/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not create share link');
  return response.json() as Promise<{ token: string; url: string; link: SharedLink }>;
};

export type SharedLinkViewResult = {
  ok: boolean;
  status: number;
  link?: SharedLink;
  error?: string;
  reason?: 'not_found' | 'revoked' | 'expired' | 'login_required';
};

// Not routed through apiFetch: this endpoint is often called anonymously, and a 401 here
// means "login required to view this link", not "your session expired".
export const viewSharedLink = async (token: string): Promise<SharedLinkViewResult> => {
  const response = await fetch(`${API_URL}/shared-links/view/${encodeURIComponent(token)}`, {
    headers: { ...getAuthHeader() },
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, ...data };
};

export const getMyShareLinks = async (): Promise<SharedLink[]> => {
  const response = await apiFetch(`${API_URL}/shared-links/my-links`);
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not load your share links');
  return (await response.json()).links;
};

export const revokeShareLink = async (token: string): Promise<SharedLink> => {
  const response = await apiFetch(`${API_URL}/shared-links/revoke/${encodeURIComponent(token)}`, { method: 'PATCH' });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not revoke share link');
  return (await response.json()).link;
};

export const extendShareLink = async (token: string, expiry: ShareExpiry): Promise<SharedLink> => {
  const response = await apiFetch(`${API_URL}/shared-links/extend/${encodeURIComponent(token)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiry }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not extend share link');
  return (await response.json()).link;
};

export type ShareToChatPayload = {
  recordType: string;
  recordId: number | string;
  pagePath: string;
  pageTitle?: string;
  recordPreview?: SharedLinkPreview;
  destinationType: 'channel' | 'dm';
  destinationId: string;
  destinationName?: string;
};

export const shareRecordToChat = async (payload: ShareToChatPayload) => {
  const response = await apiFetch(`${API_URL}/shared-links/share-to-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not share to chat');
  return response.json() as Promise<{ message: any; chatName: string | null }>;
};

export const approveRequest = async (
  id: string | number,
  data: { approverName: string; signature: string; stage?: 'approver' | 'finance' | 'director' }
): Promise<{ message: string }> => {
  try {
    const response = await apiFetch(`${API_URL}/requests/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  } catch (error) {
    console.error('Error approving request:', error);
    throw error;
  }
};

export const finalizeRequest = async (
  id: string | number,
  finalizeData: {
    items: { itemId: number; quantityReceived: number; quantityReturned: number; serial_number?: string | null }[];
    releasedBy: string;
    waybill?: {
      carNumber: string;
      driversName: string;
      driversContact: string;
      address: string;
      projectDescription: string;
    };
  }
): Promise<{ message: string }> => {
  try {
    const response = await apiFetch(`${API_URL}/requests/${id}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalizeData),
    });
    return await response.json();
  } catch (error: any) {
    console.error('Error finalizing request:', error);
    throw new Error(error.message || 'Failed to finalize request');
  }
};

// =============================================================================
// AUDIT LOGS & SETTINGS — UNCHANGED
// =============================================================================
export const getAuditLogs = async (): Promise<AuditLog[]> => {
  try {
    const response = await apiFetch(`${API_URL}/audit-logs`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return [];
  }
};

export const getSettings = async (): Promise<any> => {
  try {
    const response = await apiFetch(`${API_URL}/settings`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching settings:', error);
    return { from_name: 'Inventory System', from_email: 'noreply@inventory.com', all: [] as Setting[] };
  }
};

export const updateSetting = async (key: string, value: string): Promise<{ key: string; value: string }> => {
  try {
    const response = await apiFetch(`${API_URL}/settings/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error updating setting:', error);
    throw error;
  }
};

export interface TicketEscalationStage {
  key: string;
  label: string;
  minutes: number;
  target_roles: string[];
}

export interface WorkflowConfig {
  material: {
    required_approvers_count: number;
    eligible_approver_roles: string[];
  };
  finance: {
    amount_thresholds: Array<{
      max_amount?: number;
      min_amount?: number;
      required_approvers?: number;
      requires_director?: boolean;
      required_approvers_before_director?: number;
    }>;
  };
  transport?: {
    approver_ids: number[];
    supervisor_id: number | null;
    vehicle_request_approver_ids?: number[];
    finance_user_ids?: number[];
    fuel_request_approver_ids?: number[];
    price_per_litre?: number | null;
    require_reference_link?: boolean;
    require_reference_link_fuel?: boolean;
    require_reference_link_vehicle?: boolean;
  };
  ticket_escalation?: {
    enabled: boolean;
    stages: TicketEscalationStage[];
  };
  ticket_sla?: {
    enabled: boolean;
    priorities: {
      critical: TicketSlaPriorityRule;
      high: TicketSlaPriorityRule;
      medium: TicketSlaPriorityRule;
      low: TicketSlaPriorityRule;
    };
  };
}

export interface TransportSettings {
  approver_ids: number[];
  supervisor_id: number | null;
  vehicle_request_approver_ids?: number[];
  finance_user_ids?: number[];
  fuel_request_approver_ids?: number[];
  price_per_litre?: number | null;
  require_reference_link?: boolean;
  require_reference_link_fuel?: boolean;
  require_reference_link_vehicle?: boolean;
}

export interface FuelRequestApproval {
  id: number;
  request_id: number;
  approver_id: number;
  approver_name: string;
  stage: string;
  decision: string;
  reason?: string;
  created_at: string;
}

export interface FuelRequest {
  id: number;
  ref_no: string;
  requester_id: number;
  requester_name: string;
  department?: string;
  project_ticket_ref?: string;
  reference_type?: 'Ticket' | 'Transport Request' | string;
  reference_number?: string | null;
  reference_title?: string | null;
  reference_id?: number | null;
  project_id?: number | null;
  ticket_id?: number | null;
  vehicle_plate: string;
  fuel_type: 'Petrol' | 'Diesel' | string;
  quantity_litres: number;
  price_per_litre?: number | null;
  estimated_amount: number;
  purpose?: string;
  status: string;
  current_stage: string;
  receipt_url?: string | null;
  receipt_filename?: string | null;
  receipt_uploaded_at?: string | null;
  cash_issued_at?: string | null;
  cash_issued_by?: number | null;
  completed_at?: string | null;
  completed_by?: number | null;
  rejected_at?: string | null;
  rejected_by?: number | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at?: string;
  approvals?: FuelRequestApproval[];
  selected_approver_ids?: number[];
  my_decision?: string | null;
  my_acted_at?: string | null;
  approvals_count?: number;
  approvals_required?: number;
  approval_parties?: { id?: number; name: string; status: string; actedAt?: string | null }[];
}

export interface FuelRequestReference {
  id: number;
  ref: string;
  title: string;
  type: 'project' | 'ticket';
}

export interface TransportRequest {
  id: number;
  requester_id: number | null;
  requester_name: string;
  site_name: string;
  location: string;
  client_name: string;
  engineer_id: number | null;
  engineer_name?: string | null;
  purpose?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  current_stage: 'approver' | 'supervisor';
  created_at: string;
  updated_at?: string | null;
  reference_type?: string | null;
  reference_id?: number | null;
  reference_number?: string | null;
  reference_title?: string | null;
  reference_status?: string | null;
  selected_approver_ids?: number[];
  my_decision?: string | null;
  my_acted_at?: string | null;
  approvals_count?: number;
  approvals_required?: number;
  approval_parties?: { id?: number; name: string; status: string; actedAt?: string | null }[];
}

export interface TransportApprovalTrail {
  id: number;
  stage: 'approver' | 'supervisor';
  approver_name: string;
  decision: 'approved' | 'rejected';
  reason?: string | null;
  created_at: string;
}

export interface TransportRequestDetail extends TransportRequest {
  approvals: TransportApprovalTrail[];
  vehicle_request?: VehicleRequestForm | null;
}

export interface VehicleLineItem {
  id: string;
  description: string;
  qty_days: number | string;
  unit_price: number | string;
  total: number;
}

export interface AttachmentItem {
  id: string;
  name: string;
  type: string;
  url?: string;
  mimeType?: string;
  fileSize?: number;
  isPdf?: boolean;
}

export interface VehicleRequestForm {
  id: number;
  transport_request_id: number;
  requester_id?: number | null;
  supervisor_id?: number | null;
  requester_name?: string;
  department?: string | null;
  purpose?: string | null;
  date_submitted?: string | null;
  deliver_to?: string | null;
  phone?: string | null;
  special_instructions?: string | null;
  order_no?: string | null;
  invoice_terms?: string | null;
  received_by?: string | null;
  line_items: VehicleLineItem[];
  attachments: AttachmentItem[];
  status: 'pending_manager' | 'pending_finance' | 'cash_issued' | 'rejected';
  current_stage: 'manager' | 'finance' | 'cash_issued';
  created_at?: string;
  updated_at?: string;
}

export type TicketSlaUnit = 'minutes' | 'hours' | 'days';

export interface TicketSlaPriorityRule {
  first_response_value: number;
  first_response_unit: TicketSlaUnit;
  resolution_value: number;
  resolution_unit: TicketSlaUnit;
}

export const getWorkflowConfig = async (): Promise<WorkflowConfig> => {
  const response = await apiFetch(`${API_URL}/config/workflow`);
  return await response.json();
};

export const updateWorkflowConfig = async (config: Partial<WorkflowConfig>): Promise<WorkflowConfig> => {
  const response = await apiFetch(`${API_URL}/config/workflow`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return await response.json();
};

export const uploadTransportFiles = async (files: File[]): Promise<AttachmentItem[]> => {
  if (!files.length) return [];
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  const response = await apiFetch(`${API_URL}/transport/uploads`, {
    method: 'POST',
    body: formData,
  });
  return await response.json();
};

export const getTransportSettings = async (): Promise<TransportSettings> => {
  const response = await apiFetch(`${API_URL}/transport/settings`);
  return await response.json();
};

export const updateTransportSettings = async (payload: TransportSettings): Promise<TransportSettings> => {
  const response = await apiFetch(`${API_URL}/transport/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await response.json();
};

export const createVehicleRequestForm = async (payload: {
  transport_request_id: number;
  phone?: string;
  special_instructions?: string;
  order_no?: string;
  invoice_terms?: string;
  received_by?: string;
  line_items?: VehicleLineItem[];
  attachments?: AttachmentItem[];
  selected_approver_ids?: number[];
}): Promise<VehicleRequestForm> => {
  if (!payload.transport_request_id) {
    throw new Error('A valid transport request is required.');
  }
  const response = await apiFetch(`${API_URL}/transport/requests/${payload.transport_request_id}/vehicle-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await response.json();
};

export const getVehicleRequestForm = async (transportRequestId: number | string): Promise<VehicleRequestForm | null> => {
  if (transportRequestId == null || transportRequestId === '' || String(transportRequestId) === 'null' || String(transportRequestId) === 'undefined') {
    return null;
  }
  const response = await apiFetch(`${API_URL}/transport/requests/${transportRequestId}/vehicle-request`);
  return await response.json();
};

export const approveVehicleRequestForm = async (
  id: number | string,
  payload: { reason?: string | null }
): Promise<{ message: string; form: VehicleRequestForm }> => {
  const response = await apiFetch(`${API_URL}/transport/vehicle-requests/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await response.json();
};

export const rejectVehicleRequestForm = async (
  id: number | string,
  payload: { reason?: string | null }
): Promise<{ message: string; form: VehicleRequestForm }> => {
  const response = await apiFetch(`${API_URL}/transport/vehicle-requests/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await response.json();
};

export const issueVehicleCash = async (
  id: number | string,
  payload: { note?: string | null; issued_at?: string | null }
): Promise<{ message: string; form: VehicleRequestForm }> => {
  const response = await apiFetch(`${API_URL}/transport/vehicle-requests/${id}/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await response.json();
};

export const getTransportRequests = async (): Promise<TransportRequest[]> => {
  const response = await apiFetch(`${API_URL}/transport/requests`);
  return await response.json();
};

export const createTransportRequest = async (payload: {
  site_name: string;
  location: string;
  client_name: string;
  engineer_id?: number | null;
  purpose?: string | null;
  selected_approver_ids?: number[];
  reference_type?: string | null;
  reference_id?: number | null;
  reference_number?: string | null;
  reference_title?: string | null;
  linked_references?: Array<{ type: string; id: number }>;
}): Promise<TransportRequest> => {
  const response = await apiFetch(`${API_URL}/transport/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await response.json();
};

export const getTransportRequest = async (id: number | string): Promise<TransportRequestDetail> => {
  if (id == null || id === '' || String(id) === 'null' || String(id) === 'undefined') {
    throw new Error('A valid transport request id is required.');
  }
  const response = await apiFetch(`${API_URL}/transport/requests/${id}`);
  return await response.json();
};

export const approveTransportRequest = async (
  id: number | string,
  payload: { reason?: string | null }
): Promise<{ message: string; request: TransportRequest }> => {
  const response = await apiFetch(`${API_URL}/transport/requests/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await response.json();
};

export const rejectTransportRequest = async (
  id: number | string,
  payload: { reason?: string | null }
): Promise<{ message: string; request: TransportRequest }> => {
  const response = await apiFetch(`${API_URL}/transport/requests/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await response.json();
};

export interface RealmPerson {
  id: number;
  fullName: string;
  username?: string;
  role?: string;
  position?: string | null;
  unit?: string | null;
}

export interface RealmApprovers {
  material_user_ids: number[];
  cash_user_ids: number[];
  transport_approver_ids?: number[];
  transport_supervisor_ids?: number[];
  vehicle_request_approver_ids?: number[];
  finance_user_ids?: number[];
  fuel_request_approver_ids?: number[];
  people?: RealmPerson[];
  company?: string;
}

/** `company` is only honored for a true System Admin — everyone else is always scoped to their
 *  own company server-side, regardless of what's passed here. */
export const getRealmApprovers = async (company?: string): Promise<RealmApprovers> => {
  const response = await apiFetch(`${API_URL}/realm${company ? `?company=${encodeURIComponent(company)}` : ''}`);
  return await response.json();
};

/** Just the approver-id lists (no enriched `people`, no material/cash/finance approvers) — any
 *  authenticated user can read this to pick default approvers on self-service request forms.
 *  Unlike getRealmApprovers(), this does not require superadmin access. */
export const getRequestApproverIds = async (): Promise<RealmApprovers> => {
  const response = await apiFetch(`${API_URL}/realm/approver-ids`);
  return await response.json();
};

export const updateRealmApprovers = async (payload: {
  material_user_ids: number[];
  cash_user_ids: number[];
  transport_approver_ids?: number[];
  transport_supervisor_ids?: number[];
  vehicle_request_approver_ids?: number[];
  finance_user_ids?: number[];
  fuel_request_approver_ids?: number[];
}, company?: string): Promise<RealmApprovers> => {
  const response = await apiFetch(`${API_URL}/realm${company ? `?company=${encodeURIComponent(company)}` : ''}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await response.json();
};

export const getSerialNumbersForItem = async (itemId: number): Promise<SerialNumber[]> => {
  const response = await fetch(`${API_URL}/items/${itemId}/serials`);
  if (!response.ok) throw new Error('Failed to fetch serials');
  return response.json();
};

// =============================================================================
// FIELD ACTIVITIES ENDPOINTS – FINAL WORKING VERSION
// =============================================================================
export interface FieldActivity {
  id: number;
  projectName: string;
  town: string;
  engineer: string;
  description: string;
  status: 'Pending' | 'Ongoing' | 'Completed';
  lat: number;
  lng: number;
  createdAt: string;
  updatedAt: string;
}

export const fieldApi = {
  getAll: async (): Promise<FieldActivity[]> => {
    const res = await apiFetch(`${API_URL}/field`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  getHistory: async (projectName: string): Promise<FieldActivity[]> => {
    const res = await apiFetch(`${API_URL}/field/history/${encodeURIComponent(projectName)}`);
    return res.json();
  },

  create: async (data: {
    projectName: string;
    town: string;
    description?: string;
    lat: number;
    lng: number;
  }): Promise<FieldActivity> => {
    const response = await fetch(`${API_URL}/field`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save project');
    }

    return response.json();
  },

  update: async (
    id: number,
    data: { projectName: string; town: string; description?: string; lat: number; lng: number }
  ): Promise<FieldActivity> => {
    const response = await fetch(`${API_URL}/field/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Update failed');
    }

    return response.json();
  },

  delete: async (id: number): Promise<void> => {
    const response = await fetch(`${API_URL}/field/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Delete failed');
    }
  },
};

// NEW: Get only field engineers — accessible to field_engineer_admin
export const getFieldEngineers = async (): Promise<any[]> => {
  const response = await apiFetch(`${API_URL}/field/users`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
};

// REPLACE these three functions at the bottom of your api.ts

export const createCashRequest = async (
  requestData: any,
  selectedApproverIds: number[],
  lineItems: Array<{ 
    description: string; 
    qty: string | number; 
    unitPrice: string | number 
  }>
) => {
  const cleanedLineItems = lineItems
    .map(item => ({
      description: (item.description || '').trim(),
      qty: Number(item.qty) || 0,
      unitPrice: Number(item.unitPrice) || 0,
    }))
    .filter(item => item.description && item.qty > 0 && item.unitPrice >= 0);

  if (cleanedLineItems.length === 0) {
    throw new Error('At least one valid expense item is required.');
  }

  const { linked_references, ...restRequestData } = requestData || {};

  try {
    const response = await apiFetch(`${API_URL}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'cash_request',
        requestData: restRequestData,
        selectedApproverIds,
        lineItems: cleanedLineItems,
        ...(linked_references?.length ? { linked_references } : {}),
      }),
    });
    return await response.json();
  } catch (error: any) {
    throw new Error(error.message || 'Failed to create cash request');
  }
};

export const approveFinanceRequest = async (requestId: number | string, approverData: { approverName: string; signature?: string }) => {
  try {
    const response = await apiFetch(`${API_URL}/requests/${requestId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...approverData, stage: 'finance' })
    });
    return await response.json();
  } catch (error: any) {
    throw new Error(error.message || 'Failed to approve cash request');
  }
};

export const markCashAsReceived = async (requestId: number | string, receivedBy: string) => {
  try {
    const response = await apiFetch(`${API_URL}/requests/${requestId}/cash-received`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receivedBy })
    });
    return await response.json();
  } catch (error: any) {
    throw new Error(error.message || 'Failed to mark cash as received');
  }
};



// =============================================================================
// CX MODULE — PROJECTS & CUSTOMERS
// =============================================================================



export const getCXProjects = async (): Promise<any[]> => {
  const response = await apiFetch(`${API_URL}/cx/projects`);
  return await response.json();
};

export const createCXProject = async (project_name: string, description: string = ''): Promise<any> => {
  const response = await apiFetch(`${API_URL}/cx/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_name, description }),
  });
  return await response.json();
};

export const getCXCustomers = async (project_id?: number): Promise<any[]> => {
  let url = `${API_URL}/cx/customers`;
  if (project_id) {
    url += `?project_id=${project_id}`;
  }
  const response = await apiFetch(url);
  return await response.json();
};

export const createCXCustomer = async (data: {
  organization_name: string;
  contact_email: string;
  contact_phone: string;
  location: string;
  project_id?: number | null;
}): Promise<any> => {
  const response = await apiFetch(`${API_URL}/cx/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organization_name: data.organization_name,
      customer_name: data.organization_name,
      contact_email: data.contact_email,
      contact_phone: data.contact_phone,
      location: data.location,
      project_id: data.project_id ?? null,
    }),
  });
  return await response.json();
};



// =============================================================================
// CUSTOMER PORTAL API ENDPOINTS
// =============================================================================

export interface CustomerProfile {
  id: number;
  customer_code: string;
  name: string;
  company_name?: string;
  email: string | null;
  phone: string | null;
  location?: string | null;
  status?: string;
  project?: {
    id: number;
    code: string;
    name: string;
  };
  sites?: CustomerSite[];
  created_at: string;
}

export interface CustomerSite {
  id: number;
  site_code: string;
  site_name: string;
  site_address?: string | null;
  region?: string | null;
  bandwidth?: string | null;
  service_type?: string | null;
  ip_address?: string | null;
  connection_status?: string | null;
  ticket_count?: number;
  last_tickets?: Array<{
    ticket_id: string;
    title: string;
    status: string;
    created_at: string;
  }>;
}

// Login customer using customer_code and 5-digit PIN
export const loginCustomer = async (customerCode: string, pin: string): Promise<{ token: string; profile: CustomerProfile }> => {
  try {
    const response = await fetch(`${API_URL}/customer/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customer_code: customerCode, pin }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Invalid Customer ID or PIN');
    }

    return await response.json();
  } catch (error: any) {
    throw new Error(error.message || 'Login failed. Please try again.');
  }
};

/** Email + password login for client portal */
export const loginClientByEmail = async (
  email: string,
  password: string
): Promise<{ token: string; profile: CustomerProfile }> => {
  const response = await fetch(`${API_URL}/customer/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Invalid email or password');
  }
  const data = await response.json();
  return { token: data.token, profile: data.profile || data.client };
};

export const changeClientPassword = async (
  current_password: string,
  new_password: string
): Promise<void> => {
  const token = localStorage.getItem('customer_token');
  if (!token) throw new Error('Not authenticated');
  const response = await fetch(`${API_URL}/customer/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ current_password, new_password }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to change password');
  }
};

export const getCustomerSites = async (): Promise<CustomerSite[]> => {
  const token = localStorage.getItem('customer_token');
  if (!token) throw new Error('Not authenticated');
  const response = await fetch(`${API_URL}/customer/sites`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load sites');
  }
  const data = await response.json();
  return Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
};

// Save customer session (token + profile) to localStorage
export const saveCustomerSession = (data: { token: string; profile: CustomerProfile }) => {
  localStorage.setItem('customer_token', data.token);
  localStorage.setItem('customer_profile', JSON.stringify(data.profile));
};

// Get authenticated customer profile
export const getCustomerProfile = async (): Promise<CustomerProfile> => {
  const token = localStorage.getItem('customer_token');
  if (!token) {
    throw new Error('No session found. Please log in.');
  }

  try {
    const response = await fetch(`${API_URL}/customer/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401) {
      logoutCustomer();
      throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load profile');
    }

    const data = await response.json();
    const profile = data.customer || data.client || data;
    if (!Array.isArray(profile.sites) && Array.isArray(data.sites)) {
      profile.sites = data.sites;
    }
    return profile;
  } catch (error: any) {
    throw new Error(error.message || 'Network error');
  }
};

// Logout customer - clear session
export const logoutCustomer = () => {
  localStorage.removeItem('customer_token');
  localStorage.removeItem('customer_profile');
};

// =============================================================================
// CUSTOMER PORTAL API – TICKETING (FULLY WORKING VERSION)
// =============================================================================

// Helper to get customer token safely
const getCustomerToken = (): string => {
  const token = localStorage.getItem('customer_token');
  if (!token) {
    throw new Error('Your session has expired. Please log in again.');
  }
  return token;
};

// Create a new support ticket
export const createCustomerTicket = async (
  formData: FormData,
  siteId?: number | string | null
): Promise<{ ticket_id: string; title?: string; status?: string }> => {
  const token = getCustomerToken();
  if (siteId !== undefined && siteId !== null && !formData.has('site_id')) {
    formData.append('site_id', String(siteId));
  }

  const response = await fetch(`${API_URL}/customer/tickets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      // Do NOT set Content-Type — let browser set multipart boundary automatically
    },
    body: formData,
  });

  if (!response.ok) {
    let errorMessage = 'Failed to create ticket. Please try again.';

    try {
      const errorData = await response.json();
      // Common backend errors
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch (_) {
      // If JSON parse fails, fall back to status text
      errorMessage = response.statusText || errorMessage;
    }

    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data; // Expected: { success: true, ticket_id: "...", title: "...", status: "NEW" }
};
// In api.ts — FIXED
export const getCustomerTicketDetail = async (ticketId: string): Promise<{ ticket: any; timeline: any[] }> => {
  if (!ticketId) {
    throw new Error('Invalid ticket ID');
  }

  const token = getCustomerToken();

  const response = await fetch(`${API_URL}/customer/tickets/${ticketId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Ticket not found or access denied');
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to load ticket details');
  }

  const result = await response.json();

  // ✅ Handle both shapes: { data: { ticket, timeline } } or { ticket, timeline }
  if (result.data && result.data.ticket) {
    return {
      ticket: result.data.ticket,
      timeline: result.data.timeline || [],
    };
  }
  // Fallback: direct shape
  return {
    ticket: result.ticket,
    timeline: result.timeline || [],
  };
};

// In api.ts
export const getCustomerTickets = async (): Promise<any[]> => {
  const token = getCustomerToken();
  const response = await fetch(`${API_URL}/customer/tickets/my`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to fetch tickets');
  const result = await response.json();
  return result.data || result; // handles both { data: [...] } and [...]
};


// In api.ts - Updated CX-specific API calls
export const cxApi = {
  getTicketReport: async (params?: {
    bucket?: 'pending' | 'completed';
    date_from?: string;
    date_to?: string;
  }): Promise<{
    success: boolean;
    summary: {
      total: number;
      pending: number;
      completed: number;
      by_status: Record<string, number>;
      by_priority: Record<string, number>;
      avg_resolution_ms: number | null;
      avg_resolution_formatted: string | null;
    };
    charts?: {
      pending_vs_completed: { name: string; value: number; color?: string }[];
      by_status: { name: string; value: number; color?: string }[];
      by_priority: { name: string; value: number }[];
      volume_by_month: { month: string; created: number; completed: number }[];
      top_workers: { name: string; actions: number }[];
    };
    tickets: any[];
  }> => {
    const q = new URLSearchParams();
    if (params?.bucket) q.set('bucket', params.bucket);
    if (params?.date_from) q.set('date_from', params.date_from);
    if (params?.date_to) q.set('date_to', params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : '';
    const response = await apiFetch(`${API_URL}/reports/tickets${suffix}`);
    return await response.json();
  },

  getCashReport: async (params?: {
    date_from?: string;
    date_to?: string;
    status?: string;
  }): Promise<{
    success: boolean;
    summary: {
      total_requests: number;
      total_amount: number;
      by_status: Record<string, number>;
      completed_count: number;
      pending_count: number;
    };
    charts?: {
      by_status: { name: string; value: number; color?: string }[];
      amount_by_status: { name: string; value: number; color?: string }[];
      volume_by_month: { month: string; count: number; amount: number }[];
    };
    requests: any[];
  }> => {
    const q = new URLSearchParams();
    if (params?.date_from) q.set('date_from', params.date_from);
    if (params?.date_to) q.set('date_to', params.date_to);
    if (params?.status) q.set('status', params.status);
    const suffix = q.toString() ? `?${q.toString()}` : '';
    const response = await apiFetch(`${API_URL}/reports/cash${suffix}`);
    return await response.json();
  },

  // Get all tickets (for CX/Staff view)
  getAllTickets: async (params?: {
    status?: string;
    project_id?: number;
    escalation_stage?: string;
    tag_ids?: number[] | string;
    tag_ids_any?: number[] | string;
  }): Promise<any> => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.project_id) q.set('project_id', String(params.project_id));
    if (params?.escalation_stage) q.set('escalation_stage', params.escalation_stage);
    if (params?.tag_ids) {
      q.set('tag_ids', Array.isArray(params.tag_ids) ? params.tag_ids.join(',') : String(params.tag_ids));
    }
    if (params?.tag_ids_any) {
      q.set(
        'tag_ids_any',
        Array.isArray(params.tag_ids_any) ? params.tag_ids_any.join(',') : String(params.tag_ids_any)
      );
    }
    const suffix = q.toString() ? `?${q.toString()}` : '';
    const response = await apiFetch(`${API_URL}/cx/tickets${suffix}`);
    return await response.json();
  },

  // Tickets the current user has personally touched today — a personal filter on the same
  // ticket flow, not a separate queue.
  getMyDayTickets: async (): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/tickets/my-day`);
    return await response.json();
  },

  acceptTicket: async (ticketId: string): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/tickets/${ticketId}/accept`, {
      method: 'POST',
    });
    return await response.json();
  },

  // Get ticket details (for CX/Staff view)
  getTicketDetails: async (ticketId: string): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/tickets/${ticketId}`);
    return await response.json();
  },

  // Create a new ticket (CX/NOC initiated)
  createTicket: async (data: {
    customer_id: number;
    title: string;
    description: string;
    category?: string;
    priority?: string;
    assigned_to?: number;
    route_to_unit?: string;
    tag_ids?: number[];
    site_id?: number | null;
  }): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  },

  getTags: async (): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/tags`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load tags');
    }
    return await response.json();
  },

  createTag: async (data: { name: string; color: string }): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create tag');
    }
    return await response.json();
  },

  updateTag: async (id: number | string, data: { name?: string; color?: string }): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update tag');
    }
    return await response.json();
  },

  deleteTag: async (id: number | string): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/tags/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete tag');
    }
    return await response.json();
  },

  addTicketTags: async (ticketId: string, tag_ids: number[]): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/tickets/${ticketId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_ids }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to add tags');
    }
    return await response.json();
  },

  removeTicketTag: async (ticketId: string, tagId: number | string): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/tickets/${ticketId}/tags/${tagId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to remove tag');
    }
    return await response.json();
  },

  // General ticket update (status, comment, visibility, or assigned_to)
  updateTicket: async (
    ticketId: string,
    data: {
      status?: string;
      comment?: string;
      visibility?: 'public' | 'internal';
      assigned_to?: number;
      isEscalation?: boolean;
    }
  ): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  },

  // Move a ticket to a different unit's queue, unassigned — the receiving unit assigns an owner.
  escalateTicket: async (
    ticketId: string,
    data: { target_unit: 'noc' | 'ip' | 'ts' | 'cx'; reason: string; notes?: string }
  ): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/tickets/${ticketId}/escalate-unit`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  },

  // Dedicated ticket assignment (recommended for assign-only actions)
  assignTicket: async (ticketId: string, assigned_to: number): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/tickets/${ticketId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to }),
    });
    return await response.json();
  },

  // Get projects
  getProjects: async (): Promise<any[]> => {
    const response = await apiFetch(`${API_URL}/cx/projects`);
    return await response.json();
  },

  // Get customers (legacy)
  getCustomers: async (projectId?: number): Promise<any[]> => {
    let url = `${API_URL}/cx/customers`;
    if (projectId) {
      url += `?project_id=${projectId}`;
    }
    const response = await apiFetch(url);
    return await response.json();
  },

  // Clients (customers table; UI label = Client)
  getClients: async (params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<any> => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : '';
    const response = await apiFetch(`${API_URL}/cx/clients${suffix}`);
    return await response.json();
  },

  createClient: async (data: {
    company_name: string;
    contact_person?: string;
    email: string;
    phone: string;
    location: string;
    status?: string;
    site_ids?: number[];
  }): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create client');
    }
    return await response.json();
  },

  getClient: async (id: number | string): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/clients/${id}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load client');
    }
    return await response.json();
  },

  updateClient: async (id: number | string, data: Record<string, unknown>): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update client');
    }
    return await response.json();
  },

  resetClientPassword: async (
    id: number | string,
    data?: { new_password?: string; reset_to_code?: boolean; generate?: boolean }
  ): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/clients/${id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || { reset_to_code: true }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to reset password');
    }
    return await response.json();
  },

  getClientSites: async (clientId: number | string): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/clients/${clientId}/sites`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load sites');
    }
    return await response.json();
  },

  createClientSite: async (clientId: number | string, data: Record<string, unknown>): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/clients/${clientId}/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create site');
    }
    return await response.json();
  },

  updateClientSite: async (
    clientId: number | string,
    siteId: number | string,
    data: Record<string, unknown>
  ): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/clients/${clientId}/sites/${siteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update site');
    }
    return await response.json();
  },

  getAllSites: async (params?: {
    client_id?: number;
    unassigned?: boolean;
    assignment?: 'assigned' | 'unassigned';
    connection_status?: string;
    region?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<any> => {
    const q = new URLSearchParams();
    if (params?.client_id) q.set('client_id', String(params.client_id));
    if (params?.unassigned) q.set('unassigned', 'true');
    if (params?.assignment) q.set('assignment', params.assignment);
    if (params?.connection_status) q.set('connection_status', params.connection_status);
    if (params?.region) q.set('region', params.region);
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    if (params?.pageSize) q.set('pageSize', String(params.pageSize));
    const suffix = q.toString() ? `?${q.toString()}` : '';
    const response = await apiFetch(`${API_URL}/cx/sites${suffix}`);
    return await response.json();
  },

  getSitesStats: async (): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/sites/stats`);
    return await response.json();
  },

  createSite: async (data: Record<string, unknown>): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create site');
    }
    return await response.json();
  },

  updateSite: async (siteId: number | string, data: Record<string, unknown>): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/sites/${siteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update site');
    }
    return await response.json();
  },

  linkClientSites: async (clientId: number | string, siteIds: number[]): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/clients/${clientId}/sites`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_ids: siteIds }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to link sites');
    }
    return await response.json();
  },

  // Create project
  createProject: async (project_name: string, description: string = ''): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_name, description }),
    });
    return await response.json();
  },

  createCustomer: createCXCustomer,

  // Get user work history
  getUserWorkHistory: async (userId: number): Promise<any> => {
    const response = await apiFetch(`${API_URL}/cx/users/${userId}/work-history`);
    return await response.json();
  },

  // Search for full ticket details by search term
  getTicketFullDetailsBySearchTerm: async (searchTerm: string): Promise<any> => {
    const response = await apiFetch(`${API_URL}/tickets/search?q=${searchTerm}`);
    return await response.json();
  },

  // Search for summary tickets (for dropdowns/lists)
  searchTicketsSummary: async (searchTerm: string): Promise<any> => {
    const response = await apiFetch(`${API_URL}/tickets/summary/search?q=${searchTerm}`);
    return await response.json();
  },
};

// NEW: Fetch material requests linked to a ticket
export const getRequestsByTicketId = async (ticketId: string): Promise<{ success: boolean; data: any[] }> => {
  const response = await apiFetch(`${API_URL}/tickets/${ticketId}/requests`);
  return await response.json();
};

// =============================================================================
// ASSET MANAGER API
// =============================================================================
const ASSET_API = `${API_URL}/assets`;

export const assetApi = {
  getAssets: () => apiFetch(ASSET_API).then((r) => r.json()),
  getAsset: (id: string) => apiFetch(`${ASSET_API}/${id}`).then((r) => r.json()),
  getNextTag: () => apiFetch(`${ASSET_API}/meta/next-tag`).then((r) => r.json()).then((d: { tag: string }) => d.tag),
  createAsset: (body: Record<string, unknown>) =>
    apiFetch(ASSET_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()),
  updateAsset: (id: string, body: Record<string, unknown>) =>
    apiFetch(`${ASSET_API}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()),
  deleteAsset: (id: string) => apiFetch(`${ASSET_API}/${id}`, { method: 'DELETE' }).then((r) => r.json()),
  getCategories: () => apiFetch(`${ASSET_API}/categories`).then((r) => r.json()),
  createCategory: (data: { name: string; description?: string }) =>
    apiFetch(`${ASSET_API}/categories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
  updateCategory: (id: string, data: { name: string; description?: string }) =>
    apiFetch(`${ASSET_API}/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
  deleteCategory: (id: string) => apiFetch(`${ASSET_API}/categories/${id}`, { method: 'DELETE' }).then((r) => r.json()),
  getLocations: () => apiFetch(`${ASSET_API}/locations`).then((r) => r.json()),
  createLocation: (data: { name: string; description?: string }) =>
    apiFetch(`${ASSET_API}/locations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
  updateLocation: (id: string, data: { name: string; description?: string }) =>
    apiFetch(`${ASSET_API}/locations/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
  deleteLocation: (id: string) => apiFetch(`${ASSET_API}/locations/${id}`, { method: 'DELETE' }).then((r) => r.json()),
  getVendors: () => apiFetch(`${ASSET_API}/vendors`).then((r) => r.json()),
  getVendor: (id: string) => apiFetch(`${ASSET_API}/vendors/${id}`).then((r) => r.json()),
  createVendor: (data: Record<string, unknown>) =>
    apiFetch(`${ASSET_API}/vendors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
  updateVendor: (id: string, data: Record<string, unknown>) =>
    apiFetch(`${ASSET_API}/vendors/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
  deleteVendor: (id: string) => apiFetch(`${ASSET_API}/vendors/${id}`, { method: 'DELETE' }).then((r) => r.json()),
  getPeople: () => apiFetch(`${ASSET_API}/people`).then((r) => r.json()),
  getPerson: (id: string) => apiFetch(`${ASSET_API}/people/${id}`).then((r) => r.json()),
  createPerson: (data: Record<string, unknown>) =>
    apiFetch(`${ASSET_API}/people`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
  updatePerson: (id: string, data: Record<string, unknown>) =>
    apiFetch(`${ASSET_API}/people/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
  deletePerson: (id: string) => apiFetch(`${ASSET_API}/people/${id}`, { method: 'DELETE' }).then((r) => r.json()),
  getAssignmentHistory: () => apiFetch(`${ASSET_API}/assignments/history`).then((r) => r.json()),
  getAssignmentsByPerson: (personId: string) => apiFetch(`${ASSET_API}/assignments/by-person/${personId}`).then((r) => r.json()),
  createAssignment: (data: { asset_id: number; person_id: number; condition_before?: string; notes_before?: string }) =>
    apiFetch(`${ASSET_API}/assignments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
  returnAssignment: (id: number, data?: { condition_after?: string; notes_after?: string }) =>
    apiFetch(`${ASSET_API}/assignments/${id}/return`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) }).then((r) => r.json()),
  getMaintenanceRecords: () => apiFetch(`${ASSET_API}/maintenance/records`).then((r) => r.json()),
  getMaintenanceRecord: (id: string) => apiFetch(`${ASSET_API}/maintenance/records/${id}`).then((r) => r.json()),
  createMaintenanceRecord: (data: Record<string, unknown>) =>
    apiFetch(`${ASSET_API}/maintenance/records`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
  updateMaintenanceRecord: (id: string, data: Record<string, unknown>) =>
    apiFetch(`${ASSET_API}/maintenance/records/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
  deleteMaintenanceRecord: (id: string) => apiFetch(`${ASSET_API}/maintenance/records/${id}`, { method: 'DELETE' }).then((r) => r.json()),
};

// =============================================================================
// FUEL REQUEST MODULE API
// =============================================================================
export const getFuelRequests = async (params?: { finance_queue?: boolean; tab?: 'pending_cash' | 'awaiting_receipt' }): Promise<FuelRequest[]> => {
  const query = new URLSearchParams();
  if (params?.finance_queue) query.set('finance_queue', 'true');
  if (params?.tab) query.set('tab', params.tab);
  const qStr = query.toString() ? `?${query.toString()}` : '';
  const response = await apiFetch(`${API_URL}/transport/fuel-requests${qStr}`);
  return await response.json();
};

export const getFuelRequestDetail = async (id: string | number): Promise<FuelRequest> => {
  const response = await apiFetch(`${API_URL}/transport/fuel-requests/${id}`);
  return await response.json();
};

export const createFuelRequest = async (payload: {
  project_ticket_ref?: string;
  project_id?: number | null;
  ticket_id?: number | null;
  vehicle_plate: string;
  fuel_type: string;
  quantity_litres: number;
  estimated_amount?: number;
  purpose?: string;
  selected_approver_ids?: number[];
  reference_type?: string;
  reference_number?: string;
  reference_title?: string;
  reference_id?: number;
  reference_status?: string;
  linked_references?: Array<{ type: string; id: number }>;
}): Promise<FuelRequest> => {
  const response = await apiFetch(`${API_URL}/transport/fuel-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await response.json();
};

export const getFuelRequestReferences = async (): Promise<{ projects: FuelRequestReference[]; tickets: FuelRequestReference[] }> => {
  const response = await apiFetch(`${API_URL}/transport/fuel-requests/references`);
  return await response.json();
};

export const validateFuelReference = async (type: 'Ticket' | 'Transport Request', number: string): Promise<{ valid: boolean; message?: string; type?: string; id?: number; title?: string; link?: string }> => {
  const response = await apiFetch(`${API_URL}/transport/fuel-requests/validate-reference?type=${encodeURIComponent(type)}&number=${encodeURIComponent(number)}`);
  return await response.json();
};

export const approveFuelRequest = async (id: string | number, payload?: { reason?: string }): Promise<any> => {
  const response = await apiFetch(`${API_URL}/transport/fuel-requests/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  return await response.json();
};

export const rejectFuelRequest = async (id: string | number, payload: { reason: string }): Promise<any> => {
  const response = await apiFetch(`${API_URL}/transport/fuel-requests/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await response.json();
};

export const issueFuelCash = async (id: string | number): Promise<any> => {
  const response = await apiFetch(`${API_URL}/finance/fuel-requests/${id}/issue-cash`, {
    method: 'POST',
  });
  return await response.json();
};

export const uploadFuelReceipt = async (id: string | number, file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('receipt', file);
  const response = await apiFetch(`${API_URL}/transport/fuel-requests/${id}/upload-receipt`, {
    method: 'POST',
    body: formData,
  });
  return await response.json();
};

export const completeFuelRequest = async (id: string | number): Promise<any> => {
  const response = await apiFetch(`${API_URL}/finance/fuel-requests/${id}/complete`, {
    method: 'POST',
  });
  return await response.json();
};
