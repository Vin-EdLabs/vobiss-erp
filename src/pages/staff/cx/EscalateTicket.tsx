// src/pages/staff/cx/EscalateTicket.tsx
// FIXED: Unit now correctly derived from assignee_role (like your working version) + improved fallback
// January 10, 2026

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Search, Ticket, Wrench, Globe, Headphones, Network,
  AlertCircle, CheckCircle, Info, ChevronDown
} from 'lucide-react';
import { cxApi } from '../../../api';
import { API_URL } from '@/lib/api';

interface User {
  id: number;
  fullName: string;
  roles: string[];
  unit: string | null;
}

interface TicketSummary {
  ticket_id: string;
  title: string;
  status: string;
  priority: string;
  customer_name: string;
  project_name: string;
  assignee_name: string;
  assignee_id?: number;
  current_unit: string;
}

interface FullTicket extends TicketSummary {
  description?: string;
}

type TargetUnit = 'CX Support' | 'NOC' | 'IP Ticketing' | 'TX Ticketing';

const unitConfig: Record<TargetUnit, {
  label: string;
  icon: React.ReactNode;
  roleKey: string;
}> = {
  'CX Support': { label: 'CX Support', icon: <Headphones className="w-8 h-8" />, roleKey: 'cx' },
  'NOC': { label: 'NOC', icon: <Network className="w-8 h-8" />, roleKey: 'noc' },
  'IP Ticketing': { label: 'IP Ticketing', icon: <Globe className="w-8 h-8" />, roleKey: 'ip' },
  'TX Ticketing': { label: 'TS Ticketing', icon: <Wrench className="w-8 h-8" />, roleKey: 'field_engineer' },
};

const statusColors: Record<string, string> = {
  'NEW': 'bg-blue-200 text-blue-800',
  'OPEN': 'bg-yellow-200 text-yellow-800',
  'IN_PROGRESS': 'bg-orange-200 text-orange-800',
};

const priorityColors: Record<string, string> = {
  'LOW': 'bg-green-200 text-green-800',
  'NORMAL': 'bg-blue-200 text-blue-800',
  'HIGH': 'bg-orange-200 text-orange-800',
  'CRITICAL': 'bg-red-200 text-red-800',
};

// FIXED UNIT DETECTION - same logic that worked before
const getCurrentUnit = (role: string = '', assigneeName: string = ''): string => {
  const r = (role || '').toLowerCase();

  // Priority 1: Use role (this is what made your old version work)
  if (r.includes('cx')) return 'CX Support';
  if (r.includes('noc')) return 'NOC';
  if (r.includes('ip')) return 'IP Ticketing';
  if (r.includes('field') || r.includes('tx') || r.includes('ts')) return 'TX Ticketing';

  // Priority 2: Improved name-based fallback (when no role is available)
  const name = assigneeName.toLowerCase();
  if (!name || name === 'unassigned') return 'Unassigned';
  if (name.includes('noc') || name.includes('network') || name.includes('ops') || name.includes('monitor')) return 'NOC';
  if (name.includes('field') || name.includes('tx') || name.includes('ts') || name.includes('technician') || name.includes('on-site') || name.includes('deployment')) return 'TX Ticketing';
  if (name.includes('ip') || name.includes('core') || name.includes('routing') || name.includes('engineer ip')) return 'IP Ticketing';

  // Ultimate fallback (only if absolutely nothing matches)
  return 'CX Support';
};

const EscalateTicket: React.FC = () => {
  const { ticketId: paramTicketId } = useParams<{ ticketId?: string }>();
  const [allTickets, setAllTickets] = useState<TicketSummary[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<FullTicket | null>(null);
  const [targetUnit, setTargetUnit] = useState<TargetUnit>('IP Ticketing');
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showGuidelines, setShowGuidelines] = useState(false);
  const navigate = useNavigate();

  const currentUnit = unitConfig[targetUnit];

  const loadAllUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/cx/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const users: User[] = await res.json();
      setAllUsers(users);
    } catch {}
  };

  const fetchAllTickets = async () => {
    try {
      setTicketsLoading(true);
      const data = await cxApi.getAllTickets();
      let ticketList: any[] = data?.data || data?.tickets || data || [];

      const validStatuses = ['NEW', 'OPEN', 'IN_PROGRESS'];
      const openTickets = ticketList
        .filter((t: any) => validStatuses.includes(t.status?.toUpperCase()))
        .map((t: any) => {
          const assigneeId = t.assigned_to?.id || t.assignee_id;
          return {
            ticket_id: t.ticket_id || t.id || 'UNKNOWN',
            title: t.title || 'No Title',
            status: t.status || 'OPEN',
            priority: t.priority || 'NORMAL',
            customer_name: t.customer_name || 'Unknown',
            project_name: t.project_name || 'General',
            assignee_name: t.assignee_name || 'Unassigned',
            assignee_id: assigneeId,
            current_unit: getCurrentUnit(t.assignee_role || t.role || '', t.assignee_name || ''),
          };
        })
        .sort((a, b) => b.ticket_id.localeCompare(a.ticket_id));

      setAllTickets(openTickets);
    } catch {
      setError('Failed to load tickets');
    } finally {
      setTicketsLoading(false);
    }
  };

  const loadTicket = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await cxApi.getTicketDetails(id);
      const ticket = data.data?.ticket || data.data || data || {};

      const assigneeName = ticket.assignee_name || 'Unassigned';

      setSelectedTicket({
        ticket_id: ticket.ticket_id || id,
        title: ticket.title || 'No Title',
        status: ticket.status || 'OPEN',
        priority: ticket.priority || 'NORMAL',
        customer_name: ticket.customer_name || 'Unknown',
        project_name: ticket.project_name || 'General',
        assignee_name: assigneeName,
        assignee_id: ticket.assigned_to?.id || ticket.assignee_id,
        description: ticket.description || '',
        current_unit: getCurrentUnit(ticket.assignee_role || ticket.role || '', assigneeName),
      });
    } catch {
      setError('Failed to load ticket details');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/cx/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const users: User[] = await res.json();
      const roleKey = currentUnit.roleKey;
      setTeamMembers(users.filter(u => u.roles.includes(roleKey)));
    } catch {
      setTeamMembers([]);
    }
  };

  useEffect(() => {
    loadAllUsers();
  }, []);

  useEffect(() => {
    if (paramTicketId) {
      loadTicket(paramTicketId);
    } else {
      fetchAllTickets();
    }
  }, [paramTicketId]);

  useEffect(() => {
    if (selectedTicket) {
      fetchTeamMembers();
    }
  }, [targetUnit, selectedTicket]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !selectedAssignee || !reason.trim()) return;

    setSubmitting(true);
    setSuccess(null);
    setError(null);

    try {
      const unitName = currentUnit.label;

      await cxApi.updateTicket(selectedTicket.ticket_id, {
        assigned_to: selectedAssignee,
        comment: `Escalated to ${unitName}`,
        visibility: 'public',
        status: 'IN_PROGRESS',
        isEscalation: true,
      });

      await cxApi.updateTicket(selectedTicket.ticket_id, {
        comment: `**Escalation Details (Internal)**\n\nReason: ${reason.trim()}\nNotes: ${description.trim() || 'None'}`,
        visibility: 'internal',
      });

      setSuccess(`Ticket escalated to ${unitName}`);

      setTimeout(async () => {
        if (paramTicketId) {
          navigate('/staff/cx/tickets');
        } else {
          setSelectedTicket(null);
          setReason('');
          setDescription('');
          setSelectedAssignee('');
          setSuccess(null);
          await fetchAllTickets();
        }
      }, 1600);
    } catch (err: any) {
      console.error('Escalation failed:', err);
      const errorMessage = err?.response?.data?.error || err?.message || 'Failed to escalate ticket';
      const errorCode = err?.response?.data?.code;
      
      if (errorCode === 'PERMISSION_DENIED' || errorMessage.includes('Only the assigned person') || errorMessage.includes('can escalate') || errorMessage.includes('can assign')) {
        setError('You do not have permission to escalate this ticket. Only the currently assigned person or CX members can escalate tickets. The ticket must be assigned to you first, or you must be a CX member.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTickets = allTickets.filter(t =>
    t.ticket_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 text-sm font-medium mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="bg-white rounded-xl border shadow-[var(--shadow-md)] p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <Ticket className="w-8 h-8 text-indigo-600" />
                <div>
                  <h1 className="text-xl font-bold text-gray-900">
                    {selectedTicket ? `Escalate #${selectedTicket.ticket_id}` : 'Ticket Escalation'}
                  </h1>
                  <p className="text-sm text-gray-600 mt-1">
                    Move open or in-progress tickets to the correct team
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowGuidelines(!showGuidelines)}
                className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 text-sm font-medium"
              >
                <Info className="w-5 h-5" />
                Guidelines
                <ChevronDown className={`w-5 h-5 transition-transform ${showGuidelines ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {showGuidelines && (
              <div className="mt-5 bg-indigo-50 rounded-lg p-5 text-sm text-gray-700 border border-indigo-100">
                <h3 className="font-bold text-indigo-800 mb-3">Escalation Rules</h3>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>Choose target team</li>
                  <li>Select responsible person</li>
                  <li>Write clear internal reason</li>
                  <li>Optional: add technical notes</li>
                  <li>Submit → ticket moves to new unit</li>
                </ol>
              </div>
            )}
          </div>
        </div>

        {/* Ticket list view */}
        {!paramTicketId && !selectedTicket && (
          <div className="bg-white rounded-xl border shadow-[var(--shadow-md)] overflow-hidden">
            <div className="p-5 border-b bg-gray-50">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by ID, title, customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            {ticketsLoading ? (
              <div className="text-center py-20">
                <div className="inline-block w-10 h-10 border-4 border-gray-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <p className="mt-4 text-gray-600">Loading tickets...</p>
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <Ticket className="w-16 h-16 mx-auto mb-4 opacity-40" />
                <p className="text-lg">No open/in-progress tickets found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 p-5">
                {filteredTickets.map(t => (
                  <button
                    key={t.ticket_id}
                    onClick={() => loadTicket(t.ticket_id)}
                    className="text-left p-5 bg-gray-50 rounded-xl border hover:border-indigo-300 hover:shadow-md transition-all"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span className="font-mono font-bold text-indigo-700">#{t.ticket_id}</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${priorityColors[t.priority] || 'bg-gray-200 text-gray-800'}`}>
                        {t.priority}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900 mb-3 line-clamp-2">{t.title}</h3>
                    <div className="text-sm text-gray-600 space-y-1.5">
                      <p>{t.customer_name}</p>
                      <p>Current Unit: <span className="font-medium text-indigo-700">{t.current_unit}</span></p>
                      <p>Assigned: {t.assignee_name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Back button when viewing single ticket */}
        {!paramTicketId && selectedTicket && (
          <button
            onClick={() => setSelectedTicket(null)}
            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 mb-6 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to list
          </button>
        )}

        {/* Escalation form */}
        {selectedTicket && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl border shadow-[var(--shadow-md)] p-6 sticky top-6">
                <h2 className="font-bold text-gray-900 mb-5 flex items-center gap-2 text-lg">
                  <Ticket className="w-6 h-6 text-indigo-600" />
                  Ticket #{selectedTicket.ticket_id}
                </h2>
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-gray-500">Title</dt>
                    <dd className="font-medium mt-1">{selectedTicket.title}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Customer</dt>
                    <dd className="mt-1">{selectedTicket.customer_name}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Current Unit</dt>
                    <dd className="font-medium mt-1 text-indigo-700">{selectedTicket.current_unit}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">→ Will move to</dt>
                    <dd className="font-bold text-indigo-700 mt-1">{currentUnit.label}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Priority</dt>
                    <dd className="mt-1">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${priorityColors[selectedTicket.priority]}`}>
                        {selectedTicket.priority}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Status</dt>
                    <dd className="mt-1">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColors[selectedTicket.status]}`}>
                        {selectedTicket.status}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl border shadow-[var(--shadow-md)] p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Ticket Escalation</h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Unit selection */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-3">Escalate To</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {Object.entries(unitConfig).map(([key, cfg]) => {
                        const k = key as TargetUnit;
                        const selected = targetUnit === k;
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setTargetUnit(k)}
                            className={`p-5 rounded-xl border-2 flex flex-col items-center gap-3 transition-all
                              ${selected ? 'border-indigo-600 bg-indigo-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                          >
                            <div className="text-indigo-600">{cfg.icon}</div>
                            <p className="font-semibold">{cfg.label}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Assignee */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-2">
                      Assign to {currentUnit.label} Member
                    </label>
                    <select
                      value={selectedAssignee}
                      onChange={e => setSelectedAssignee(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      required
                    >
                      <option value="">{teamMembers.length === 0 ? 'No members' : 'Select member...'}</option>
                      {teamMembers.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.fullName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Reason */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-2">
                      Reason for Escalation <span className="text-red-600">*</span>
                      <span className="text-gray-500 text-xs ml-2">(internal)</span>
                    </label>
                    <textarea
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      rows={4}
                      required
                      className="w-full px-4 py-3 border rounded-lg resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Explain why escalation is needed..."
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-2">
                      Additional Notes <span className="text-gray-500 text-xs ml-2">(optional)</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border rounded-lg resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Extra context or instructions..."
                    />
                  </div>

                  {success && (
                    <div className="bg-green-50 border border-green-200 p-4 rounded-lg text-green-800 flex items-center gap-3">
                      <CheckCircle className="w-6 h-6" />
                      {success}
                    </div>
                  )}

                  {error && (
                    <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-red-800 flex items-center gap-3">
                      <AlertCircle className="w-6 h-6" />
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !selectedAssignee || !reason.trim() || teamMembers.length === 0}
                    className="w-full py-4 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 transition text-base"
                  >
                    {submitting ? 'Escalating...' : `Escalate to ${currentUnit.label}`}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EscalateTicket;