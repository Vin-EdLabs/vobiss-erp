// src/pages/staff/field/FieldAllTickets.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ArrowLeft,
  Eye,
  Clock,
  RefreshCw,
  X,
  User,
  Building,
  Mail,
  Globe,
  Phone,
  AlertCircle,
  CheckCircle,
  Wrench,
  Calendar,
  MessageCircle,
  UserCheck
} from 'lucide-react';
import { cxApi } from '../../api';
import { API_URL } from '@/lib/api';

interface TeamMember {
  id: number;
  fullName: string;
  role: string;
  unit?: string;
  position?: string;
}

interface TimelineEntry {
  action: string;
  message: string;
  visibility: 'public' | 'internal';
  actor_role: string;
  actor_name: string;
  created_at: string;
}

interface Ticket {
  ticket_id: string;
  title: string;
  status: string;
  priority: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_id?: string;
  project_name: string;
  project_id?: string;
  source?: 'portal' | 'email' | 'phone' | 'staff';
  description?: string;
  creator_name: string;
  creator_type?: 'customer' | 'staff';
  assignee_name?: string;
  assignee_role?: string;
  assignee_unit?: string;
  assignee_position?: string;
  created_at: string;
  timeline?: TimelineEntry[];
}

const FieldAllTickets: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [assigningTicketId, setAssigningTicketId] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);

  // Status change popup
  const [statusPopupOpen, setStatusPopupOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [showAckPrompt, setShowAckPrompt] = useState(false);

  const navigate = useNavigate();

  const formatId = (prefix: 'CUST' | 'PROJ', id?: string | number) => {
    if (!id) return 'N/A';
    const num = parseInt(id.toString().replace(/\D/g, '')) || 0;
    return `${prefix}-${String(num).padStart(5, '0')}`;
  };

  const fetchTeamMembers = async () => {
    try {
      setLoadingTeam(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/cx/team-members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load team members');
      const data = await response.json();
      const fieldMembers = data.filter((m: any) => {
        const role = String(m.role || '').toLowerCase();
        const unit = String(m.unit || '').toLowerCase();
        const position = String(m.position || '').toLowerCase();
        return (
          ['field_engineer', 'field_engineer_admin'].includes(role) ||
          unit === 'tx' ||
          unit === 'ts' ||
          position.includes('tx') ||
          position.includes('ts') ||
          position.includes('transmission') ||
          position === 'engineer'
        );
      });
      setTeamMembers(fieldMembers);
      return fieldMembers;
    } catch (err) {
      console.error('Failed to load team members:', err);
      return [];
    } finally {
      setLoadingTeam(false);
    }
  };

  const fetchTickets = async () => {
    try {
      setLoading(true);
      setError(null);

      const fieldMembers = await fetchTeamMembers();
      const fieldMemberNames = new Set(fieldMembers.map((m: any) => m.fullName));

      const data = await cxApi.getAllTickets();
      let ticketList: any[] = [];
      if (data?.data) ticketList = data.data;
      else if (Array.isArray(data)) ticketList = data;
      else if (data?.tickets) ticketList = data.tickets;

      const processedTickets = ticketList
        .filter((t: any) => {
          const assignee = t.assignee_name || t.assigned_to?.name || '';
          const assigneeUnit = String(t.assignee_unit || t.assigned_to?.unit || '').toLowerCase();
          const assigneePosition = String(t.assignee_position || t.assigned_to?.position || '').toLowerCase();
          return (
            (assignee && fieldMemberNames.has(assignee)) ||
            assigneeUnit === 'tx' ||
            assigneeUnit === 'ts' ||
            assigneePosition.includes('tx') ||
            assigneePosition.includes('ts') ||
            assigneePosition.includes('transmission') ||
            assigneePosition === 'engineer'
          );
        })
        .map((t: any) => ({
          ticket_id: t.ticket_id || t.id || `TKT-${Date.now()}`,
          title: t.title || t.subject || 'No Title',
          status: (t.status || 'OPEN').toUpperCase(),
          priority: (t.priority || 'NORMAL').toUpperCase(),
          customer_name:
            t.customer_name ||
            t.customer?.name ||
            t.customer?.full_name ||
            'Unknown Customer',
          customer_email:
            t.customer_email ||
            t.customer?.email ||
            t.contact_email ||
            undefined,
          customer_phone:
            t.customer_phone ||
            t.customer?.phone ||
            t.contact_phone ||
            t.phone ||
            undefined,
          customer_id: t.customer_id || t.customer?.id,
          project_name: t.project_name || t.project?.name || 'General',
          project_id: t.project_id || t.project?.id,
          source: t.source?.toLowerCase() || 'portal',
          description: t.description || 'No description provided.',
          creator_name:
            t.creator_name ||
            t.created_by?.name ||
            t.created_by?.full_name ||
            t.created_by?.username ||
            (t.creator_type === 'staff' ? 'Staff Member' : 'Customer'),
          creator_type: t.creator_type || (t.created_by?.role ? 'staff' : 'customer'),
          assignee_name: t.assignee_name || t.assigned_to?.name || 'Unassigned',
          assignee_role: t.assignee_role,
          assignee_unit: t.assignee_unit,
          assignee_position: t.assignee_position,
          created_at: t.created_at || new Date().toISOString(),
          timeline: t.timeline || [],
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setTickets(processedTickets);
      setFilteredTickets(processedTickets);
    } catch (err: any) {
      setError(err.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    fetchTeamMembers();
  }, []);

  useEffect(() => {
    let result = tickets;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(t =>
        t.ticket_id.toLowerCase().includes(term) ||
        t.title.toLowerCase().includes(term) ||
        t.customer_name.toLowerCase().includes(term) ||
        t.project_name.toLowerCase().includes(term)
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter(t => t.status.toUpperCase() === statusFilter.toUpperCase());
    }
    if (priorityFilter !== 'all') {
      result = result.filter(t => t.priority.toUpperCase() === priorityFilter.toUpperCase());
    }
    setFilteredTickets(result);
  }, [searchTerm, statusFilter, priorityFilter, tickets]);

  const assignTicket = async (ticketId: string, userId: number | '') => {
    if (!userId) return;

    const member = teamMembers.find(m => m.id === userId);
    if (!member) return;

    const confirmed = window.confirm(`Are you sure you want to assign this ticket to ${member.fullName}?`);
    if (!confirmed) {
        const select = document.getElementById(`assign-${ticketId}`) as HTMLSelectElement;
        if(select) select.value = "";
        return;
    }

    setAssigningTicketId(ticketId);
    setAssignSuccess(null);
    setAssignError(null);

    try {
      await cxApi.updateTicket(ticketId, { assigned_to: userId });
      const name = member.fullName || 'Engineer';
      setAssignSuccess(`Assigned to ${name}`);
      setTickets(prev => prev.map(t => 
        t.ticket_id === ticketId ? { ...t, assignee_name: name, status: 'OPEN' } : t
      ));
      setTimeout(() => setAssignSuccess(null), 5000);
      fetchTickets();
    } catch (err: any) {
      if (err.response && err.response.status === 403) {
        setAssignError(err.response.data.error || 'You do not have permission to assign this ticket.');
      } else {
        setAssignError('Failed to assign ticket. Please try again.');
      }
      setTimeout(() => setAssignError(null), 7000);
    } finally {
      setAssigningTicketId(null);
    }
  };

  const handleStatusAction = (newStatus: string) => {
    if (!selectedTicket || newStatus === selectedTicket.status) return;
    if (selectedTicket.status === 'CLOSED' && newStatus !== 'REOPEN') return;

    // Show acknowledgement prompt for IN_PROGRESS or OPEN
    if ((newStatus === 'IN_PROGRESS' || newStatus === 'OPEN') && 
        selectedTicket.status !== 'IN_PROGRESS' && selectedTicket.status !== 'OPEN') {
      setPendingStatus(newStatus);
      setShowAckPrompt(true);
      return;
    }

    // For RESOLVED, CLOSED, REOPEN - show description prompt
    if (['RESOLVED', 'CLOSED', 'REOPEN'].includes(newStatus)) {
      setPendingStatus(newStatus);
      setReason('');
      setStatusPopupOpen(true);
      return;
    }

    // For other status changes, update directly
    setPendingStatus(newStatus);
    setReason('');
    confirmStatusChangeDirect(newStatus);
  };

  const handleAcknowledge = async (acknowledged: boolean) => {
    setShowAckPrompt(false);
    if (acknowledged && pendingStatus) {
      await confirmStatusChangeDirect(pendingStatus, true);
    }
    setPendingStatus(null);
  };

  const confirmStatusChangeDirect = async (status: string, acknowledged: boolean = false) => {
    if (!selectedTicket) return;

    setUpdatingStatus(true);
    try {
      let comment = `Status changed to ${status.replace('_', ' ')}`;
      if (acknowledged) {
        comment = `Ticket acknowledged for work by ${teamMembers.find(m => m.fullName === selectedTicket.assignee_name)?.fullName || 'Field Engineer'}`;
      }

      await cxApi.updateTicket(selectedTicket.ticket_id, {
        status,
        comment,
        visibility: 'public'
      });

      const data = await cxApi.getTicketDetails(selectedTicket.ticket_id);
      const detail = data.data || data;
      const fullTicket = {
        ...selectedTicket,
        status: detail.ticket?.status || status,
        timeline: (detail.timeline || []).map((e: any) => ({
          action: e.action,
          message: e.message,
          visibility: e.visibility,
          actor_role: e.actor_role,
          actor_name: e.actor_name,
          created_at: e.created_at,
        }))
      };

      setSelectedTicket(fullTicket);
      setTickets(prev => prev.map(t => 
        t.ticket_id === selectedTicket.ticket_id ? { ...t, status } : t
      ));

      setStatusSuccess(`Ticket successfully ${status.toLowerCase().replace('_', ' ')}${acknowledged ? ' and acknowledged' : ''}`);
      setTimeout(() => setStatusSuccess(null), 4000);
    } catch (err: any) {
      console.error(err);
      alert('Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const confirmStatusChange = async () => {
    if (!selectedTicket || !pendingStatus) return;

    const needsReason = ['RESOLVED', 'CLOSED', 'REOPEN'].includes(pendingStatus);
    if (needsReason && !reason.trim()) {
      alert('Please provide a description/reason for this action');
      return;
    }

    setStatusPopupOpen(false);
    setUpdatingStatus(true);
    setStatusSuccess(null);

    try {
      let comment = `Status changed to ${pendingStatus.replace('_', ' ')}`;
      if (pendingStatus === 'RESOLVED') comment = `Resolved: ${reason.trim()}`;
      if (pendingStatus === 'CLOSED') comment = `Closed: ${reason.trim()}`;
      if (pendingStatus === 'REOPEN') comment = `Reopened: ${reason.trim()}`;

      await cxApi.updateTicket(selectedTicket.ticket_id, {
        status: pendingStatus,
        comment,
        visibility: ['RESOLVED', 'CLOSED'].includes(pendingStatus) ? 'public' : 'internal'
      });

      const data = await cxApi.getTicketDetails(selectedTicket.ticket_id);
      const detail = data.data || data;
      const fullTicket = {
        ...selectedTicket,
        status: detail.ticket?.status || pendingStatus,
        timeline: (detail.timeline || []).map((e: any) => ({
          action: e.action,
          message: e.message,
          visibility: e.visibility,
          actor_role: e.actor_role,
          actor_name: e.actor_name,
          created_at: e.created_at,
        }))
      };

      setSelectedTicket(fullTicket);
      fetchTickets(); // refresh list

      setStatusSuccess(`Ticket successfully ${pendingStatus.toLowerCase().replace('_', ' ')}`);
      setTimeout(() => setStatusSuccess(null), 4000);
    } catch (err: any) {
      console.error(err);
      alert('Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const openModal = async (ticket: Ticket) => {
    setModalLoading(true);
    setSelectedTicket(ticket);
    setModalOpen(true);
    document.body.style.overflow = 'hidden';

    try {
      const data = await cxApi.getTicketDetails(ticket.ticket_id);
      const detail = data.data || data;
      const full = {
        ...ticket,
        ...detail.ticket,
        creator_name:
          detail.ticket?.creator_name ||
          ticket.creator_name ||
          detail.ticket?.created_by?.name ||
          'Unknown',
        customer_phone:
          detail.ticket?.customer_phone ||
          ticket.customer_phone ||
          detail.ticket?.customer?.phone ||
          undefined,
        timeline: detail.timeline || []
      };
      setSelectedTicket(full);
    } catch (err) {
      console.error('Failed to load details');
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedTicket(null);
    setModalLoading(false);
    document.body.style.overflow = 'unset';
    setStatusPopupOpen(false);
    setShowAckPrompt(false);
  };

  const getStatusColor = (status: string) => {
    const s = status?.toUpperCase() || '';
    switch (s) {
      case 'NEW': return { bg: 'bg-blue-100', text: 'text-blue-700' };
      case 'OPEN': return { bg: 'bg-yellow-100', text: 'text-yellow-700' };
      case 'IN_PROGRESS': return { bg: 'bg-amber-100', text: 'text-amber-800' };
      case 'RESOLVED': return { bg: 'bg-green-100', text: 'text-green-700' };
      case 'CLOSED': return { bg: 'bg-gray-200', text: 'text-gray-700' };
      default: return { bg: 'bg-gray-100', text: 'text-gray-600' };
    }
  };

  const getPriorityColor = (priority: string) => {
    const p = priority?.toUpperCase() || '';
    switch (p) {
      case 'URGENT': return 'bg-red-500';
      case 'HIGH': return 'bg-[var(--accent-green-light)]';
      case 'MEDIUM': return 'bg-yellow-500';
      default: return 'bg-gray-400';
    }
  };

  const getSourceIcon = (source?: string) => {
    if (source === 'email') return <Mail className="w-3.5 h-3.5" />;
    if (source === 'phone') return <Phone className="w-3.5 h-3.5" />;
    return <Globe className="w-3.5 h-3.5" />;
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    const diff = Math.floor((Date.now() - date.getTime()) / (1000 * 3600 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff}d ago`;
    return date.toLocaleDateString();
  };

  const formatFullDate = (d: string) => new Date(d).toLocaleString();

  if (loading || loadingTeam) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-[#f5ebe0]/40 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-[var(--primary)] animate-spin mx-auto mb-4" />
          <p className="text-slate-600 text-sm">Loading field tickets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-[#f5ebe0]/40 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-[#f5ebe0]/40 text-xs">
        <div className="p-3 md:p-4 max-w-[1700px] mx-auto">
          {/* Header */}
          <div className="mb-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-[var(--primary)] hover:text-[var(--primary-hover)] text-xs font-medium mb-2 group"
            >
              <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition" />
              Back
            </button>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h1 className="text-lg md:text-xl font-black text-slate-900 flex items-center gap-3">
                  <Wrench className="w-7 h-7 text-[var(--primary)]" />
                  TS Ticketing Queue
                </h1>
                <p className="text-xs text-slate-600">
                  {tickets.length} total • {filteredTickets.length} shown
                </p>
              </div>
              <button
                onClick={fetchTickets}
                className="px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:bg-[var(--primary-hover)] flex items-center gap-1 shadow-sm"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 mb-3 shadow-[var(--shadow-md)]">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search tickets..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 w-full bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[var(--primary)]/30 outline-none"
                  />
                </div>
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none"
              >
                <option value="all">All Status</option>
                <option value="NEW">New</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none"
              >
                <option value="all">All Priority</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>

          {/* Table - Clean names only */}
          <div className="bg-white rounded-lg shadow-[var(--shadow-md)] border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-[#5c3a1e] to-[#4a2c16] text-white text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">ID</th>
                    <th className="px-3 py-2.5 text-left font-medium">Source</th>
                    <th className="px-3 py-2.5 text-left font-medium">Customer</th>
                    <th className="px-3 py-2.5 text-left font-medium">Project</th>
                    <th className="px-3 py-2.5 text-left font-medium">Created By</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                    <th className="px-3 py-2.5 text-left font-medium">Priority</th>
                    <th className="px-3 py-2.5 text-left font-medium">Assigned</th>
                    <th className="px-3 py-2.5 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTickets.map((ticket) => {
                    const statusColors = getStatusColor(ticket.status);
                    const priorityDot = getPriorityColor(ticket.priority);
                    return (
                      <tr 
                      key={ticket.ticket_id} 
                      className="hover:bg-[var(--accent-green-light)]/30 transition cursor-pointer"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('select, button')) return;
                        navigate(`/staff/field/tickets/${ticket.ticket_id}`);
                      }}
                    >
                        <td className="px-3 py-2.5">
                          <span className="font-mono bg-[var(--accent-green-light)] text-[var(--primary)] px-2 py-0.5 rounded-full text-xs font-bold">
                            #{ticket.ticket_id}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {getSourceIcon(ticket.source)}
                            <span className="capitalize text-xs">{ticket.source}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-xs">{ticket.customer_name}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-xs">{ticket.project_name}</p>
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          <p className="font-medium">{ticket.creator_name}</p>
                          <p className="text-slate-500 text-xs capitalize">{ticket.creator_type}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${statusColors.bg} ${statusColors.text}`}>
                            {ticket.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${priorityDot}`} />
                            <span className="text-xs capitalize">{ticket.priority.toLowerCase()}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {ticket.assignee_name || <span className="italic text-slate-400">Unassigned</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <select
                              id={`assign-${ticket.ticket_id}`}
                              onChange={(e) => assignTicket(ticket.ticket_id, parseInt(e.target.value))}
                              className="text-xs px-2 py-1 border rounded bg-white"
                              defaultValue=""
                            >
                              <option value="" disabled>Reassign</option>
                              {teamMembers.map(m => (
                                <option key={m.id} value={m.id}>{m.fullName}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => navigate(`/staff/field/tickets/${ticket.ticket_id}`)}
                              className="px-2 py-1 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-hover)] text-white rounded hover:from-[var(--primary-hover)] hover:to-[#5c3a1e]"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {assignError && assigningTicketId === ticket.ticket_id && (
                              <div className="text-red-500 text-xs mt-1">{assignError}</div>
                          )}
                          {assignSuccess && assigningTicketId === ticket.ticket_id && (
                            <div className="text-green-500 text-xs mt-1">{assignSuccess}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredTickets.length === 0 && (
              <div className="py-12 text-center text-gray-500">
                <Wrench className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No tickets assigned to TS Ticketing</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Beautiful Blur Modal */}
      {modalOpen && selectedTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col transform transition-all"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-[#5c3a1e] to-[#4a2c16] text-white p-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-3">
                  <Wrench className="w-6 h-6" />
                  Field Ticket #{selectedTicket.ticket_id}
                </h2>
                <p className="text-xs opacity-90 mt-1">
                  Created by <strong>{selectedTicket.creator_name || 'Unknown'}</strong> • {formatFullDate(selectedTicket.created_at)}
                </p>
              </div>
              <button onClick={closeModal} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-br from-slate-50 to-white">
              {modalLoading ? (
                <div className="flex items-center justify-center h-64">
                  <RefreshCw className="w-8 h-8 text-[var(--primary)] animate-spin" />
                </div>
              ) : (
                <>
                  {/* Title */}
                  <div className="bg-gradient-to-r from-[var(--accent-green-light)] to-[#e8d5bc] rounded-xl p-5 border border-[#e0c4a0]">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <MessageCircle className="w-5 h-5 text-[var(--primary)]" />
                      Ticket Title
                    </h3>
                    <p className="mt-2 text-slate-800">{selectedTicket.title}</p>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="bg-white rounded-xl p-5 shadow border shadow-[var(--shadow-md)]">
                      <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                        <User className="w-4 h-4 text-[var(--primary)]" /> Customer
                      </h4>
                      <p className="text-xs">{selectedTicket.customer_name}</p>
                      {selectedTicket.customer_email && <p className="text-xs text-gray-600 mt-1">{selectedTicket.customer_email}</p>}
                      {selectedTicket.customer_phone && <p className="text-xs text-gray-600">{selectedTicket.customer_phone}</p>}
                    </div>

                    <div className="bg-white rounded-xl p-5 shadow border shadow-[var(--shadow-md)]">
                      <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                        <Building className="w-4 h-4 text-[var(--primary)]" /> Project
                      </h4>
                      <p className="text-xs">{selectedTicket.project_name}</p>
                    </div>

                    <div className="bg-white rounded-xl p-5 shadow border shadow-[var(--shadow-md)]">
                      <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 text-[var(--primary)]" /> Status & Priority
                      </h4>
                      <p className="mb-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${getStatusColor(selectedTicket.status).bg} ${getStatusColor(selectedTicket.status).text}`}>
                          {selectedTicket.status.replace('_', ' ')}
                        </span>
                      </p>
                      <p className="flex items-center gap-1 text-xs">
                        <div className={`w-2 h-2 rounded-full ${getPriorityColor(selectedTicket.priority)}`} />
                        {selectedTicket.priority.toLowerCase()}
                      </p>
                    </div>
                  </div>

                  {/* Status Update - with popup trigger */}
                  <div className="bg-gradient-to-r from-[var(--accent-green-light)] to-[#f8f1e8] rounded-xl p-5 border border-[#e0c4a0]">
                    <h4 className="font-bold mb-4 flex items-center gap-2">
                      <UserCheck className="w-5 h-5 text-[var(--primary)]" />
                      Update Status
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPEN'].map(status => {
                        const isCurrent = selectedTicket.status === status;
                        const disabled = updatingStatus || isCurrent ||
                          (selectedTicket.status === 'CLOSED' && status !== 'REOPEN');

                        let btnClass = "bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white";
                        if (status === 'RESOLVED') btnClass = "bg-green-600 hover:bg-green-700 text-white";
                        if (status === 'CLOSED') btnClass = "bg-red-600 hover:bg-red-700 text-white";
                        if (status === 'REOPEN') btnClass = "bg-amber-600 hover:bg-amber-700 text-white";

                        return (
                          <button
                            key={status}
                            onClick={() => handleStatusAction(status)}
                            disabled={disabled}
                            className={`px-4 py-2 rounded-lg text-xs font-medium transition ${btnClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {status === 'REOPEN' ? 'Reopen' : (isCurrent ? 'Current' : status.replace('_', ' '))}
                          </button>
                        );
                      })}
                    </div>

                    {statusSuccess && (
                      <p className="mt-4 text-green-700 text-xs flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" /> {statusSuccess}
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <div className="bg-white rounded-xl p-5 shadow border shadow-[var(--shadow-md)]">
                    <h4 className="font-bold mb-3 flex items-center gap-2 text-sm">
                      <MessageCircle className="w-4 h-4 text-[var(--primary)]" />
                      Description
                    </h4>
                    <p className="text-gray-700 whitespace-pre-wrap text-xs">{selectedTicket.description}</p>
                  </div>

                  {/* Timeline */}
                  <div className="bg-white rounded-xl p-5 shadow border shadow-[var(--shadow-md)]">
                    <h4 className="font-bold mb-4 flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-[var(--primary)]" />
                      Timeline
                    </h4>
                    {selectedTicket.timeline?.length ? (
                      <div className="space-y-4">
                        {selectedTicket.timeline.map((e, i) => (
                          <div key={i} className="flex gap-4">
                            <div className="w-10 h-10 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {e.actor_role?.[0] || '?'}
                            </div>
                            <div className="flex-1 bg-gray-50 p-4 rounded-lg border">
                              <div className="flex justify-between mb-2">
                                <p className="font-medium text-xs">{e.actor_name}</p>
                                <p className="text-xs text-gray-500">{formatFullDate(e.created_at)}</p>
                              </div>
                              <p className="text-xs whitespace-pre-wrap">{e.message}</p>
                              {e.visibility === 'public' && (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded mt-2 inline-block">Visible to customer</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-gray-500 py-4 text-xs">No activity yet</p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="p-5 border-t bg-gray-50 text-right">
              <button
                onClick={closeModal}
                className="px-6 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 font-medium text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Acknowledgement Prompt */}
      {showAckPrompt && pendingStatus && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Acknowledge Ticket</h3>
            <p className="text-slate-700 mb-6">
              Do you acknowledge this ticket for work? This will mark the ticket as acknowledged and notify the customer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleAcknowledge(true)}
                className="flex-1 px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-[var(--primary-hover)]"
              >
                Yes, Acknowledge
              </button>
              <button
                onClick={() => handleAcknowledge(false)}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Change Confirmation Popup */}
      {statusPopupOpen && pendingStatus && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setStatusPopupOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold text-slate-800">
                {pendingStatus === 'RESOLVED' ? 'Resolve Ticket' :
                 pendingStatus === 'CLOSED' ? 'Close Ticket' :
                 pendingStatus === 'REOPEN' ? 'Reopen Ticket' : 'Change Status'}
              </h3>
              <button onClick={() => setStatusPopupOpen(false)}>
                <X className="w-6 h-6 text-slate-500 hover:text-slate-700" />
              </button>
            </div>

            <div className="mb-5 text-sm text-slate-600 space-y-2">
              {pendingStatus === 'RESOLVED' && <p>Marking as resolved will send an email to the customer. Please describe what was done.</p>}
              {pendingStatus === 'CLOSED' && <p>Closing finalizes the ticket and will send an email to the customer. Please summarize.</p>}
              {pendingStatus === 'REOPEN' && <p>Reopening returns ticket to active. Please explain why.</p>}
            </div>

            {['RESOLVED', 'CLOSED', 'REOPEN'].includes(pendingStatus) && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {pendingStatus === 'RESOLVED' ? 'What was done to resolve?' :
                   pendingStatus === 'CLOSED' ? 'Final summary' :
                   'Reason for reopening'} <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full h-32 p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]/40 outline-none resize-none"
                  placeholder="Write explanation here..."
                />
              </div>
            )}

            <div className="flex justify-end gap-4">
              <button
                onClick={() => setStatusPopupOpen(false)}
                className="px-6 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-700 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmStatusChange}
                disabled={['RESOLVED', 'CLOSED', 'REOPEN'].includes(pendingStatus) && !reason.trim()}
                className={`px-6 py-2 rounded-lg text-white text-sm transition ${
                  ['RESOLVED', 'CLOSED', 'REOPEN'].includes(pendingStatus) && !reason.trim()
                    ? 'bg-gray-400 cursor-not-allowed'
                    : pendingStatus === 'RESOLVED' ? 'bg-green-600 hover:bg-green-700' :
                      pendingStatus === 'CLOSED' ? 'bg-red-600 hover:bg-red-700' :
                      'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FieldAllTickets;