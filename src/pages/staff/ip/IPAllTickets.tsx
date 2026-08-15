// src/pages/staff/IPAllTickets.tsx
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
  MessageSquare,
  Calendar,
  Mail,
  Plus,
  AlertCircle,
  CheckCircle,
  UserCheck,
  Globe,
  Phone
} from 'lucide-react';
import { cxApi } from '../../../api';
import { API_URL } from '@/lib/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';

interface TeamMember {
  id: number;
  fullName: string;
  role: string;
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
  source?: 'portal' | 'email' | 'phone';
  description?: string;
  creator_name?: string;
  creator_type?: 'customer' | 'staff';
  assignee_name?: string;
  created_at: string;
  updated_at?: string;
  timeline?: TimelineEntry[];
}

const IPAllTickets: React.FC = () => {
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
  const [isAssignConfirmOpen, setAssignConfirmOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ ticketId: string; userId: number; userName: string } | null>(null);

  // Status change popup state
  const [statusPopupOpen, setStatusPopupOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [showAckPrompt, setShowAckPrompt] = useState(false);

  const navigate = useNavigate();

  const fetchTeamMembers = async () => {
    try {
      setLoadingTeam(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/cx/team-members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load team members');
      const data = await response.json();

      // Filter for IP/Implementation/Project members
      const ipMembers = data.filter((m: any) =>
        m.role?.toLowerCase() === 'ip' ||
        m.role?.toLowerCase().includes('implementation') ||
        m.role?.toLowerCase().includes('project') ||
        m.role?.toLowerCase().includes('implementer')
      );

      setTeamMembers(ipMembers);
      return ipMembers;
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

      const ipMembers = await fetchTeamMembers();
      const ipMemberNames = new Set(ipMembers.map(m => m.fullName));

      const data = await cxApi.getAllTickets();
      let ticketList: any[] = [];
      if (data?.data) ticketList = data.data;
      else if (Array.isArray(data)) ticketList = data;
      else if (data?.tickets) ticketList = data.tickets;

      const processed = ticketList
        .filter((t: any) => {
          const assignee = t.assignee_name || t.assigned_to?.name || '';
          return assignee && ipMemberNames.has(assignee);
        })
        .map((t: any) => ({
          ...t,
          ticket_id: t.ticket_id || t.id || `TKT-${Date.now()}`,
          title: t.title || t.subject || 'No Title',
          status: (t.status || 'NEW').toUpperCase(),
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
          assignee_name: t.assignee_name || t.assigned_to?.name,
          created_at: t.created_at || new Date().toISOString(),
          timeline: t.timeline || t.replies || [],
        }));

      processed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setTickets(processed);
      setFilteredTickets(processed);
    } catch (err: any) {
      console.error('Failed to fetch tickets:', err);
      setError(err.message || 'Failed to load tickets');
      setTickets([]);
      setFilteredTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    const interval = setInterval(fetchTickets, 45000); // refresh every 45s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let result = tickets;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(t =>
        t.title?.toLowerCase().includes(term) ||
        t.customer_name?.toLowerCase().includes(term) ||
        t.project_name?.toLowerCase().includes(term) ||
        t.ticket_id?.toLowerCase().includes(term) ||
        t.customer_email?.toLowerCase().includes(term) ||
        t.customer_phone?.toLowerCase().includes(term)
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter(t => t.status === statusFilter.toUpperCase());
    }
    if (priorityFilter !== 'all') {
      result = result.filter(t => t.priority === priorityFilter.toUpperCase());
    }
    setFilteredTickets(result);
  }, [searchTerm, statusFilter, priorityFilter, tickets]);

  const assignTicket = (ticketId: string, userId: number | '') => {
    if (!userId) return;
  
    const member = teamMembers.find(m => m.id === userId);
    if (!member) return;
  
    setAssignTarget({ ticketId, userId: Number(userId), userName: member.fullName });
    setAssignConfirmOpen(true);
  };
  
  const handleAssignConfirm = async () => {
    if (!assignTarget) return;
  
    const { ticketId, userId, userName } = assignTarget;
  
    setAssigningTicketId(ticketId);
    setAssignSuccess(null);
    setAssignError(null);
  
    try {
      await cxApi.updateTicket(ticketId, { assigned_to: userId });
      setAssignSuccess(`Reassigned to ${userName}`);
      setTickets(prev => prev.map(t => t.ticket_id === ticketId ? { ...t, assignee_name: userName } : t));
      setTimeout(() => setAssignSuccess(null), 5000);
    } catch (err: any) {
      if (err.response && err.response.status === 403) {
        setAssignError(err.response.data.error || 'You do not have permission to assign this ticket.');
      } else {
        setAssignError('Failed to assign ticket. Please try again.');
      }
      setTimeout(() => setAssignError(null), 7000);
    } finally {
      setAssigningTicketId(null);
      setAssignConfirmOpen(false);
      setAssignTarget(null);
    }
  };
  
  const handleCancelAssign = () => {
    if (assignTarget) {
      const select = document.getElementById(`assign-${assignTarget.ticketId}`) as HTMLSelectElement;
      if(select) select.value = "";
    }
    setAssignConfirmOpen(false);
    setAssignTarget(null);
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
        comment = `Ticket acknowledged for work by ${teamMembers.find(m => m.fullName === selectedTicket.assignee_name)?.fullName || 'IP Staff'}`;
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
    } catch (err) {
      console.error('Status update failed:', err);
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
      setTickets(prev => prev.map(t => 
        t.ticket_id === selectedTicket.ticket_id ? { ...t, status: pendingStatus } : t
      ));

      setStatusSuccess(`Ticket successfully ${pendingStatus.toLowerCase().replace('_', ' ')}`);
      setTimeout(() => setStatusSuccess(null), 4000);
    } catch (err) {
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
      console.error('Failed to load full details');
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
      case 'NEW': return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' };
      case 'OPEN': return { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' };
      case 'IN_PROGRESS': return { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' };
      case 'RESOLVED': return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' };
      case 'CLOSED': return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' };
      default: return { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };
    }
  };

  const getPriorityColor = (priority: string) => {
    const p = priority?.toUpperCase() || '';
    switch (p) {
      case 'URGENT': return { dot: 'bg-red-500', text: 'text-red-600' };
      case 'HIGH': return { dot: 'bg-orange-500', text: 'text-orange-600' };
      case 'MEDIUM': return { dot: 'bg-yellow-500', text: 'text-yellow-600' };
      case 'LOW': return { dot: 'bg-blue-500', text: 'text-blue-600' };
      default: return { dot: 'bg-slate-400', text: 'text-slate-600' };
    }
  };

  const getSourceIcon = (source?: string) => {
    switch (source?.toLowerCase()) {
      case 'email': return <Mail className="w-3.5 h-3.5" />;
      case 'phone': return <Phone className="w-3.5 h-3.5" />;
      default: return <Globe className="w-3.5 h-3.5" />;
    }
  };

  const formatCreatedTime = (dateString: string) => {
    const date = new Date(dateString);
    const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatFullDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  if (loading || loadingTeam) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 text-sm">Loading IP tickets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Error loading tickets</h3>
          <p className="text-slate-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 text-xs">
        <div className="p-3 md:p-4 max-w-[1700px] mx-auto">
          {/* Header */}
          <div className="mb-4">
            <button
              onClick={() => navigate('/staff/ip')}
              className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-xs font-medium mb-2 group"
            >
              <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
              Back to IP Dashboard
            </button>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h1 className="text-lg md:text-xl font-black text-slate-900">IP Ticket Queue</h1>
                <p className="text-xs text-slate-600">
                  {tickets.length} total • {filteredTickets.length} shown
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/staff/ip/create-ticket')}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 flex items-center gap-1 shadow-sm"
                >
                  <Plus className="w-3 h-3" /> New Ticket
                </button>
                <button
                  onClick={fetchTickets}
                  className="p-1.5 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                  title="Refresh"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                </button>
              </div>
            </div>
          </div>

          {/* Filters - same as original */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 mb-3 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1">SEARCH</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ID, customer, project, email, phone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 w-full bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/30 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">STATUS</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none"
                >
                  <option value="all">All Status</option>
                  <option value="NEW">New</option>
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">PRIORITY</label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none"
                >
                  <option value="all">All Priority</option>
                  <option value="URGENT">Urgent</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>

            {(searchTerm || statusFilter !== 'all' || priorityFilter !== 'all') && (
              <div className="mt-2 text-right">
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setPriorityFilter('all');
                  }}
                  className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          {/* Table - No IDs under names */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-800 to-indigo-800 text-white text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">Ticket ID</th>
                    <th className="px-3 py-2.5 text-left font-medium">Source</th>
                    <th className="px-3 py-2.5 text-left font-medium">Customer</th>
                    <th className="px-3 py-2.5 text-left font-medium">Project</th>
                    <th className="px-3 py-2.5 text-left font-medium">Created</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                    <th className="px-3 py-2.5 text-left font-medium">Priority</th>
                    <th className="px-3 py-2.5 text-left font-medium">Assigned</th>
                    <th className="px-3 py-2.5 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTickets.map((ticket, idx) => {
                    const statusColors = getStatusColor(ticket.status);
                    const priorityColors = getPriorityColor(ticket.priority);
                    return (
                      <tr
                        key={ticket.ticket_id}
                        className={`hover:bg-indigo-50/50 transition-colors cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('select, button')) return;
                          navigate(`/staff/ip/tickets/${ticket.ticket_id}`);
                        }}
                      >
                        <td className="px-3 py-2.5">
                          <span className="font-mono bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-bold">
                            #{ticket.ticket_id}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            {getSourceIcon(ticket.source)}
                            <span className="capitalize text-xs">{ticket.source || 'portal'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-slate-800 text-xs">{ticket.customer_name}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-slate-800 text-xs">{ticket.project_name}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1 text-xs text-slate-600">
                            <Clock className="w-3.5 h-3.5" />
                            {formatCreatedTime(ticket.created_at)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${statusColors.bg} ${statusColors.text} border ${statusColors.border}`}>
                            {ticket.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2.5 h-2.5 rounded-full ${priorityColors.dot}`} />
                            <span className={`font-medium capitalize text-xs ${priorityColors.text}`}>
                              {ticket.priority.toLowerCase()}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {ticket.assignee_name || <span className="text-slate-400 italic">Unassigned</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <select
                              id={`assign-${ticket.ticket_id}`}
                              disabled={assigningTicketId === ticket.ticket_id}
                              onChange={(e) => assignTicket(ticket.ticket_id, parseInt(e.target.value) || '')}
                              className="text-xs px-2 py-1 border border-slate-300 rounded bg-white outline-none"
                            >
                              <option value="">Assign</option>
                              {teamMembers.map((member) => (
                                <option key={member.id} value={member.id}>
                                  {member.fullName}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => navigate(`/staff/ip/tickets/${ticket.ticket_id}`)}
                              className="px-2.5 py-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold rounded hover:from-indigo-700 hover:to-purple-700 transition"
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
              <div className="py-12 text-center">
                <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">No tickets found</p>
                <p className="text-slate-500 text-xs mt-1">Try adjusting your filters</p>
              </div>
            )}

            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
              Showing <strong>{filteredTickets.length}</strong> of <strong>{tickets.length}</strong> tickets
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-500">
            <p>📊 Quick Stats: {tickets.filter(t => t.status === 'NEW').length} new • {tickets.filter(t => t.priority === 'URGENT').length} urgent</p>
          </div>
        </div>
      </div>

      <AlertDialog open={isAssignConfirmOpen} onOpenChange={setAssignConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Ticket Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to assign this ticket to <strong>{assignTarget?.userName}</strong>?
              They will be notified and this action will be logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelAssign}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAssignConfirm}>Assign</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ticket Detail Modal */}
      {modalOpen && selectedTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col text-sm transform transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-slate-800 to-indigo-800 text-white p-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Ticket #{selectedTicket.ticket_id}</h2>
                <p className="text-indigo-200 text-xs mt-1">
                  Created by: <strong>{selectedTicket.creator_name || 'Unknown'}</strong> • {formatFullDate(selectedTicket.created_at)}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-gradient-to-br from-slate-50 to-white">
              {modalLoading ? (
                <div className="flex items-center justify-center h-full min-h-[200px]">
                  <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mr-4" />
                  <p className="text-slate-600 text-sm">Loading details...</p>
                </div>
              ) : (
                <>
                  {/* Title */}
                  <div className="bg-gradient-to-r from-indigo-100 to-purple-100 rounded-xl p-5 border border-indigo-200">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-indigo-700" />
                      Ticket Title
                    </h3>
                    <p className="mt-2 text-slate-800 text-base">{selectedTicket.title}</p>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl p-4 shadow-md border border-slate-100">
                      <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2 text-sm">
                        <User className="w-4 h-4 text-indigo-600" /> Customer Details
                      </h3>
                      <div className="space-y-2 text-xs">
                        <p><span className="font-medium">Name:</span> {selectedTicket.customer_name}</p>
                        <p><span className="font-medium">Email:</span> {selectedTicket.customer_email || 'N/A'}</p>
                        <p><span className="font-medium">Phone:</span> {selectedTicket.customer_phone || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl p-4 shadow-md border border-slate-100">
                      <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2 text-sm">
                        <MessageSquare className="w-4 h-4 text-indigo-600" /> Project Details
                      </h3>
                      <div className="space-y-2 text-xs">
                        <p><span className="font-medium">Name:</span> {selectedTicket.project_name}</p>
                        <p><span className="font-medium">Source:</span> 
                          <span className="capitalize flex items-center gap-1 ml-1">
                            {getSourceIcon(selectedTicket.source)} {selectedTicket.source}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl p-4 shadow-md border border-slate-100">
                      <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 text-indigo-600" /> Status & Priority
                      </h3>
                      <div className="space-y-2 text-xs">
                        <p>
                          <span className="font-medium">Status:</span>{' '}
                          <span className={`ml-1 px-2 py-1 rounded-full text-xs font-bold uppercase ${getStatusColor(selectedTicket.status).bg} ${getStatusColor(selectedTicket.status).text}`}>
                            {selectedTicket.status.replace('_', ' ')}
                          </span>
                        </p>
                        <p>
                          <span className="font-medium">Priority:</span>{' '}
                          <span className="ml-1 flex items-center gap-1">
                            <div className={`w-2.5 h-2.5 rounded-full ${getPriorityColor(selectedTicket.priority).dot}`} />
                            {selectedTicket.priority.toLowerCase()}
                          </span>
                        </p>
                        <p><span className="font-medium">Created:</span> {formatFullDate(selectedTicket.created_at)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Status Update Section */}
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-200 shadow-md">
                    <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <UserCheck className="w-5 h-5 text-indigo-600" />
                      Update Status
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPEN'].map((status) => {
                        const isCurrent = selectedTicket.status === status;
                        const disabled = updatingStatus || isCurrent || 
                          (selectedTicket.status === 'CLOSED' && status !== 'REOPEN');

                        let btnStyle = "bg-indigo-600 hover:bg-indigo-700 text-white";
                        if (status === 'RESOLVED') btnStyle = "bg-green-600 hover:bg-green-700 text-white";
                        if (status === 'CLOSED') btnStyle = "bg-red-600 hover:bg-red-700 text-white";
                        if (status === 'REOPEN') btnStyle = "bg-amber-600 hover:bg-amber-700 text-white";

                        return (
                          <button
                            key={status}
                            onClick={() => handleStatusAction(status)}
                            disabled={disabled}
                            className={`px-4 py-2 rounded-xl font-medium text-xs transition-all shadow hover:shadow-md ${btnStyle} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {status === 'REOPEN' ? 'Reopen' : (isCurrent ? 'Current' : status.replace('_', ' '))}
                          </button>
                        );
                      })}
                    </div>

                    {statusSuccess && (
                      <p className="mt-3 text-green-700 font-medium text-xs flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" /> {statusSuccess}
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <div className="bg-white rounded-xl p-4 shadow-md border border-slate-100">
                    <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
                      <MessageSquare className="w-4 h-4 text-indigo-600" /> Description
                    </h3>
                    <p className="text-slate-700 whitespace-pre-wrap text-xs">{selectedTicket.description}</p>
                  </div>

                  {/* Timeline */}
                  <div className="bg-white rounded-xl p-4 shadow-md border border-slate-100">
                    <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-indigo-600" /> Timeline
                    </h3>
                    {selectedTicket.timeline && selectedTicket.timeline.length > 0 ? (
                      <div className="space-y-4">
                        {selectedTicket.timeline.map((entry, idx) => (
                          <div key={idx} className="flex gap-3">
                            <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${
                              entry.visibility === 'public' ? 'bg-teal-600' : 'bg-indigo-600'
                            }`}>
                              {entry.actor_role[0].toUpperCase()}
                            </div>
                            <div className="flex-1 bg-slate-50 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2 text-xs">
                                <p className="font-semibold text-slate-900">{entry.actor_name}</p>
                                <p className="text-slate-500">{formatFullDate(entry.created_at)}</p>
                              </div>
                              <p className="text-slate-700 whitespace-pre-wrap text-xs">{entry.message}</p>
                              {entry.visibility === 'public' && (
                                <span className="inline-block mt-2 px-2 py-1 bg-teal-100 text-teal-700 rounded-full text-xs">
                                  Visible to customer
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-slate-500 py-4 text-xs">
                        No activity yet. Awaiting response.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-slate-200 px-5 py-4 bg-white">
              <button
                onClick={closeModal}
                className="px-5 py-2 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300 transition text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Change Popup - higher z-index */}
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
              {pendingStatus === 'RESOLVED' && <p>Marking as resolved will send an email to the customer. Please describe what was done to solve the issue.</p>}
              {pendingStatus === 'CLOSED' && <p>Closing finalizes the ticket and will send an email to the customer. Please write a final summary.</p>}
              {pendingStatus === 'REOPEN' && <p>Reopening returns the ticket to active status. Please explain why it needs to be reopened.</p>}
            </div>

            {['RESOLVED', 'CLOSED', 'REOPEN'].includes(pendingStatus) && (
              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {pendingStatus === 'RESOLVED' ? 'Resolution description' :
                   pendingStatus === 'CLOSED' ? 'Final summary / reason' :
                   'Reason for reopening'} <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full h-28 p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                  placeholder="Please explain here..."
                />
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStatusPopupOpen(false)}
                className="px-5 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmStatusChange}
                disabled={['RESOLVED', 'CLOSED', 'REOPEN'].includes(pendingStatus) && !reason.trim()}
                className={`px-6 py-2 rounded-lg text-white text-sm font-medium transition ${
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

export default IPAllTickets;