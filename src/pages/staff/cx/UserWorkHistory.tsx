// src/pages/staff/cx/UserWorkHistory.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Search,
  Calendar,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import { cxApi } from '../../../api';
import { API_URL } from '@/lib/api';

interface Ticket {
  ticket_id: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  project_name: string;
  project_code: string;
  customer_name: string;
  customer_code: string;
  involvement_type: 'assigned' | 'worked_on';
  timeline_entries_count: number;
  last_activity_at: string | null;
}

interface WorkRequest {
  id: number;
  type: string;
  status: string;
  purpose?: string;
  department?: string;
  total_amount?: number | string | null;
  created_at: string;
  linked_ticket_id?: string | null;
  involvement_type?: string;
}

interface UserInfo {
  id: number;
  fullName: string;
  username: string;
  email: string;
  role: string;
}

const UserWorkHistory: React.FC = () => {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [materialRequests, setMaterialRequests] = useState<WorkRequest[]>([]);
  const [cashRequests, setCashRequests] = useState<WorkRequest[]>([]);
  const [tab, setTab] = useState<'tickets' | 'material' | 'cash'>('tickets');
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      fetchWorkHistory(selectedUserId);
    }
  }, [selectedUserId]);

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/cx/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchWorkHistory = async (userId: number) => {
    try {
      setLoading(true);
      const result = await cxApi.getUserWorkHistory(userId);
      const payload = result.data || result;
      // Backward compatible: old API returned a ticket array
      if (Array.isArray(payload)) {
        setTickets(payload);
        setMaterialRequests([]);
        setCashRequests([]);
      } else {
        setTickets(payload.tickets || []);
        setMaterialRequests(payload.material_requests || []);
        setCashRequests(payload.cash_requests || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch work history:', err);
      alert(err.message || 'Failed to load work history');
    } finally {
      setLoading(false);
    }
  };

  const filteredTickets = tickets.filter(ticket =>
    ticket.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ticket.ticket_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ticket.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ticket.project_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedUser = users.find(u => u.id === selectedUserId);

  const getStatusColor = (status: string) => {
    const s = status?.toUpperCase() || '';
    switch (s) {
      case 'NEW': return 'bg-blue-100 text-blue-700 border-[#e0c4a0]';
      case 'OPEN': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'IN_PROGRESS': return 'bg-[var(--accent-green-light)] text-[var(--primary)] border-[#e0c4a0]';
      case 'RESOLVED': return 'bg-green-100 text-green-700 border-green-200';
      case 'CLOSED': return 'bg-gray-100 text-gray-700 border-gray-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    const p = priority?.toUpperCase() || '';
    switch (p) {
      case 'URGENT': return 'bg-red-500';
      case 'HIGH': return 'bg-[var(--accent-green-light)]';
      case 'MEDIUM': return 'bg-yellow-500';
      case 'LOW': return 'bg-[var(--accent-green-light)]';
      default: return 'bg-slate-400';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const calculateResolutionTime = (created: string, closed: string | null) => {
    if (!closed) return null;
    const createdDate = new Date(created);
    const closedDate = new Date(closed);
    const diffMs = closedDate.getTime() - createdDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffDays > 0) {
      return `${diffDays}d ${diffHours % 24}h`;
    } else if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}m`;
    } else {
      return `${diffMinutes}m`;
    }
  };

  const stats = {
    total: tickets.length,
    resolved: tickets.filter(t => ['RESOLVED', 'CLOSED'].includes(t.status?.toUpperCase())).length,
    active: tickets.filter(t => !['RESOLVED', 'CLOSED'].includes(t.status?.toUpperCase())).length,
    avgResolutionTime: tickets.filter(t => t.closed_at).length > 0
      ? tickets
          .filter(t => t.closed_at)
          .reduce((sum, t) => {
            const time = calculateResolutionTime(t.created_at, t.closed_at);
            if (!time) return sum;
            const [days, hours] = time.split('d ').map(s => parseInt(s) || 0);
            return sum + (days * 24 + hours);
          }, 0) / tickets.filter(t => t.closed_at).length
      : 0
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-[#f5ebe0]/40">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/staff/cx')}
            className="flex items-center gap-2 text-[var(--primary)] hover:text-[var(--primary-hover)] mb-4 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <h1 className="text-3xl font-black text-slate-900 mb-2">User Work History</h1>
          <p className="text-slate-600">
            Cross-module history: tickets, material requests, and cash requests for any staff member.
          </p>
        </div>

        {/* User Selection */}
        <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-slate-200 p-6 mb-6">
          <label className="block text-sm font-semibold text-slate-700 mb-3">
            Select User
          </label>
          {loadingUsers ? (
            <div className="flex items-center gap-2 text-slate-500">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading users...
            </div>
          ) : (
            <select
              value={selectedUserId || ''}
              onChange={(e) => setSelectedUserId(parseInt(e.target.value) || null)}
              className="w-full md:w-96 px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[var(--primary)]/40 outline-none"
            >
              <option value="">-- Select a user --</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.fullName} ({user.username}) - {user.role}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedUser && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">Tickets</span>
                  <FileText className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div className="text-3xl font-black text-slate-900">{stats.total}</div>
              </div>
              <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">Resolved tickets</span>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-3xl font-black text-green-700">{stats.resolved}</div>
              </div>
              <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">Material requests</span>
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div className="text-3xl font-black text-amber-700">{materialRequests.length}</div>
              </div>
              <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">Cash requests</span>
                  <TrendingUp className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div className="text-3xl font-black text-blue-700">{cashRequests.length}</div>
              </div>
            </div>

            {/* User Info */}
            <div className="bg-gradient-to-r from-[var(--accent-green-light)] to-[#f8f1e8] rounded-xl border border-[#e0c4a0] p-6 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] rounded-full flex items-center justify-center text-white font-bold text-xl">
                  {selectedUser.fullName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedUser.fullName}</h2>
                  <p className="text-slate-600">@{selectedUser.username} • {selectedUser.role}</p>
                  <p className="text-sm text-slate-500 mt-1">{selectedUser.email}</p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="mb-4 flex flex-wrap gap-2">
              {(
                [
                  { id: 'tickets' as const, label: `Tickets (${tickets.length})` },
                  { id: 'material' as const, label: `Material (${materialRequests.length})` },
                  { id: 'cash' as const, label: `Cash (${cashRequests.length})` },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                    tab === t.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-slate-200 p-4 mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by ID, title, customer, project, or purpose..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[var(--primary)]/40 outline-none"
                />
              </div>
            </div>

            {/* Tickets List */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 text-[var(--primary)] animate-spin" />
              </div>
            ) : tab === 'material' ? (
              <RequestTable
                rows={materialRequests.filter((r) =>
                  !searchTerm ||
                  String(r.id).includes(searchTerm) ||
                  (r.purpose || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (r.linked_ticket_id || '').toLowerCase().includes(searchTerm.toLowerCase())
                )}
                emptyLabel="No material requests for this user"
                onTicket={(id) => id && navigate(`/staff/cx/tickets/${id}`)}
              />
            ) : tab === 'cash' ? (
              <RequestTable
                rows={cashRequests.filter((r) =>
                  !searchTerm ||
                  String(r.id).includes(searchTerm) ||
                  (r.purpose || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (r.linked_ticket_id || '').toLowerCase().includes(searchTerm.toLowerCase())
                )}
                emptyLabel="No cash requests for this user"
                showAmount
                onTicket={(id) => id && navigate(`/staff/cx/tickets/${id}`)}
              />
            ) : filteredTickets.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 font-medium">No tickets found</p>
                <p className="text-sm text-slate-500 mt-1">
                  {searchTerm ? 'Try adjusting your search' : 'This user has not worked on any tickets yet'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gradient-to-r from-[#5c3a1e] to-[#4a2c16] text-white">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-semibold">Ticket ID</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold">Title</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold">Customer</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold">Project</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold">Status</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold">Priority</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold">Activities</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold">Created</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold">Resolution Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTickets.map(ticket => (
                        <tr key={ticket.ticket_id} className="hover:bg-[var(--accent-green-light)]/40 transition-colors">
                          <td className="px-6 py-4">
                            <span className="font-mono bg-[var(--accent-green-light)] text-[var(--primary)] px-2 py-1 rounded text-xs font-bold">
                              {ticket.ticket_id}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-900">{ticket.title}</div>
                            <div className="text-xs text-slate-500 mt-1">
                              {ticket.involvement_type === 'assigned' ? 'Assigned' : 'Worked on'}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-700">{ticket.customer_name}</td>
                          <td className="px-6 py-4 text-slate-700">{ticket.project_name}</td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${getStatusColor(ticket.status)}`}>
                              {ticket.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${getPriorityColor(ticket.priority)}`} />
                              <span className="text-sm text-slate-700">{ticket.priority}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-slate-400" />
                              <span className="text-sm font-medium text-slate-700">
                                {ticket.timeline_entries_count}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {formatDate(ticket.created_at)}
                          </td>
                          <td className="px-6 py-4">
                            {ticket.closed_at ? (
                              <div className="text-sm font-medium text-green-700">
                                {calculateResolutionTime(ticket.created_at, ticket.closed_at)}
                              </div>
                            ) : (
                              <span className="text-sm text-slate-400 italic">In progress</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

function RequestTable({
  rows,
  emptyLabel,
  showAmount,
  onTicket,
}: {
  rows: WorkRequest[];
  emptyLabel: string;
  showAmount?: boolean;
  onTicket: (ticketId?: string | null) => void;
}) {
  if (!rows.length) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-900 text-white text-left">
          <tr>
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Purpose</th>
            {showAmount && <th className="px-4 py-3">Amount</th>}
            <th className="px-4 py-3">Linked ticket</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono">#{r.id}</td>
              <td className="px-4 py-3">{r.status}</td>
              <td className="px-4 py-3">{r.purpose || '—'}</td>
              {showAmount && <td className="px-4 py-3">{r.total_amount != null ? String(r.total_amount) : '—'}</td>}
              <td className="px-4 py-3">
                {r.linked_ticket_id ? (
                  <button
                    type="button"
                    className="font-mono text-[var(--primary)] hover:underline"
                    onClick={() => onTicket(r.linked_ticket_id)}
                  >
                    {r.linked_ticket_id}
                  </button>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-4 py-3 capitalize">{r.involvement_type || '—'}</td>
              <td className="px-4 py-3">{new Date(r.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default UserWorkHistory;
