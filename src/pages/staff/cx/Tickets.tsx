// src/pages/staff/AllTickets.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  Phone,
  ChevronLeft,
  ChevronRight,
  FileText,
  Send
} from 'lucide-react';
import { cxApi } from '../../../api';
import { API_URL } from '@/lib/api';
import { TicketTagBadgesRow } from '@/components/tickets/TicketTagBadge';
import {
  TicketListTagFilter,
  type TagFilterMode,
} from '@/components/tickets/TicketListTagFilter';

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
  customer_code?: string;
  contact_email?: string;
  contact_phone?: string;
  project_name: string;
  project_id?: string;
  source?: 'portal' | 'email' | 'phone';
  description?: string;
  creator_name?: string;
  creator_type?: 'customer' | 'staff';
  assignee_name?: string;
  created_at: string;
  updated_at?: string;
  attachments?: any;
  timeline?: TimelineEntry[];
  tags?: { id: number; name: string; color: string }[];
}

const ITEMS_PER_PAGE = 10;

// Manual Email Form Component
const ManualEmailForm: React.FC<{ ticketId: string; customerEmail: string }> = ({ ticketId, customerEmail }) => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!message.trim()) {
      setError('Message is required');
      return;
    }

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/cx/tickets/${ticketId}/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          subject: subject.trim() || `Update on Ticket ${ticketId}`,
          message: message.trim()
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send email');
      }

      setSuccess('Email sent successfully to customer');
      setSubject('');
      setMessage('');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={`Update on Ticket ${ticketId}`}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Message <span className="text-red-600">*</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter your message to the customer..."
          rows={4}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none text-sm resize-none"
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Email will be sent to: <strong>{customerEmail}</strong>
        </p>
        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="px-6 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
        >
          {sending ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send Email
            </>
          )}
        </button>
      </div>
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
          <CheckCircle className="w-4 h-4" />
          {success}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  );
};

const AllTickets: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [tagFilterIds, setTagFilterIds] = useState<number[]>([]);
  const [tagFilterMode, setTagFilterMode] = useState<TagFilterMode>('all');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [assigningTicketId, setAssigningTicketId] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);

  const [statusPopupOpen, setStatusPopupOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [showAckPrompt, setShowAckPrompt] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const REFRESH_INTERVAL_MS = 6000;

  const shouldResetPage = React.useRef(true); // ← key fix: control when to reset page

  const processTicketList = (rawTickets: any[]): Ticket[] => {
    const processed = rawTickets.map((ticket: any) => ({
      ...ticket,
      ticket_id: ticket.ticket_id || '',
      title: ticket.title || ticket.subject || 'No Title',
      status: ticket.status || 'NEW',
      priority: ticket.priority || 'NORMAL',
      customer_name:
        ticket.customer_name ||
        ticket.customer?.name ||
        ticket.customer?.full_name ||
        'Unknown Customer',
      customer_id: ticket.customer_id || ticket.customer?.id,
      customer_email:
        ticket.customer_email ||
        ticket.contact_email ||
        ticket.customer?.email ||
        undefined,
      customer_phone:
        ticket.customer_phone ||
        ticket.contact_phone ||
        ticket.customer?.phone ||
        ticket.phone ||
        undefined,
      customer_code: ticket.customer_code,
      attachments: ticket.attachments,
      project_name: ticket.project_name || ticket.project?.name || 'General',
      project_id: ticket.project_id || ticket.project?.id,
      source: ticket.source || 'portal',
      description: ticket.description || 'No description provided.',
      creator_name:
        ticket.creator_name ||
        ticket.created_by?.name ||
        ticket.created_by?.full_name ||
        ticket.created_by?.username ||
        (ticket.creator_type === 'staff' ? 'Staff Member' : 'Customer'),
      creator_type: ticket.creator_type || (ticket.created_by?.role ? 'staff' : 'customer'),
      assignee_name: ticket.assignee_name || ticket.assigned_to?.name,
      created_at: ticket.created_at || new Date().toISOString(),
      timeline: ticket.timeline || ticket.replies || [],
      tags: Array.isArray(ticket.tags) ? ticket.tags : [],
    }));

    processed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return processed;
  };

  const tagQueryParams = React.useMemo(() => {
    if (!tagFilterIds.length) return undefined;
    return tagFilterMode === 'any'
      ? { tag_ids_any: tagFilterIds }
      : { tag_ids: tagFilterIds };
  }, [tagFilterIds, tagFilterMode]);

  const fetchTicketsSilent = useCallback(async () => {
    try {
      setBackgroundRefreshing(true);
      const data = await cxApi.getAllTickets(tagQueryParams);
      let ticketList: any[] = [];
      if (data && data.data) ticketList = data.data;
      else if (Array.isArray(data)) ticketList = data;
      else if (data && data.tickets) ticketList = data.tickets;

      const processed = processTicketList(ticketList);
      setTickets(processed);
      setLastUpdated(new Date());
      // IMPORTANT: do NOT reset page here → keep user's current page
    } catch (err: any) {
      console.error('Background refresh failed:', err);
    } finally {
      setBackgroundRefreshing(false);
    }
  }, [tagQueryParams]);

  const fetchTicketsWithReset = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await cxApi.getAllTickets(tagQueryParams);
      let ticketList: any[] = [];
      if (data && data.data) ticketList = data.data;
      else if (Array.isArray(data)) ticketList = data;
      else if (data && data.tickets) ticketList = data.tickets;

      const processed = processTicketList(ticketList);
      setTickets(processed);
      setLastUpdated(new Date());
      shouldResetPage.current = true; // allow reset on next filter effect run
    } catch (err: any) {
      console.error('Failed to fetch tickets:', err);
      setError(err.message || 'Failed to load tickets');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      setLoadingTeam(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/cx/team-members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load team');
      const data = await response.json();
      const nocMembers = data.filter((m: any) =>
        ['noc', 'field_engineer', 'field_engineer_admin'].includes(m.role)
      );
      setTeamMembers(nocMembers);
    } catch (err) {
      console.error('Failed to load team members:', err);
    } finally {
      setLoadingTeam(false);
    }
  };

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  useEffect(() => {
    shouldResetPage.current = true;
    void fetchTicketsWithReset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when tag filters change
  }, [tagQueryParams]);

  useEffect(() => {
    const interval = setInterval(fetchTicketsSilent, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchTicketsSilent]);

  // Filter + pagination reset logic
  useEffect(() => {
    let result = [...tickets];

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(t =>
        t.title?.toLowerCase().includes(lower) ||
        t.customer_name?.toLowerCase().includes(lower) ||
        t.project_name?.toLowerCase().includes(lower) ||
        t.ticket_id?.toLowerCase().includes(lower) ||
        t.customer_email?.toLowerCase().includes(lower) ||
        t.customer_phone?.toLowerCase().includes(lower)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(t => t.status?.toUpperCase() === statusFilter.toUpperCase());
    }

    if (priorityFilter !== 'all') {
      result = result.filter(t => t.priority?.toUpperCase() === priorityFilter.toUpperCase());
    }

    setFilteredTickets(result);

    // Only reset page when explicitly needed (initial load, manual refresh, filter change)
    if (shouldResetPage.current) {
      setCurrentPage(1);
      shouldResetPage.current = false;
    }
  }, [searchTerm, statusFilter, priorityFilter, tickets]);

  // Reset page when user manually refreshes
  const handleManualRefresh = () => {
    shouldResetPage.current = true;
    fetchTicketsWithReset();
  };

  // ────────────────────────────────────────────────
  // assignTicket, handleStatusAction, confirmStatusChange, openModal, closeModal...
  // (keeping the same as your previous version – no changes needed here)
  // ────────────────────────────────────────────────

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
      const assignedName = member.fullName || 'NOC Member';
      setAssignSuccess(`Assigned to ${assignedName}`);
      setTickets(prev => prev.map(t => t.ticket_id === ticketId ? { ...t, assignee_name: assignedName } : t));
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
    }
  };

  const handleStatusAction = (newStatus: string) => {
    if (!selectedTicket || newStatus === selectedTicket.status) return;
    if (selectedTicket.status === 'CLOSED' && newStatus !== 'REOPEN') return;

    // Show acknowledgement prompt for IN_PROGRESS or OPEN if not already in that state
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
        comment = `Ticket acknowledged for work by ${teamMembers.find(m => m.fullName === selectedTicket.assignee_name)?.fullName || 'Staff'}`;
      }

      await cxApi.updateTicket(selectedTicket.ticket_id, {
        status,
        comment,
        visibility: 'public'
      });

      const data = await cxApi.getTicketDetails(selectedTicket.ticket_id);
      const detailData = data.data || data;
      const fullTicketInfo = detailData.ticket || detailData;
      const timeline = detailData.timeline || [];

      const updatedTicket = {
        ...selectedTicket,
        status: fullTicketInfo.status || status,
        timeline: timeline.map((entry: any) => ({
          action: entry.action || 'STATUS_CHANGE',
          message: entry.message,
          visibility: entry.visibility,
          actor_role: entry.actor_role,
          actor_name: entry.actor_name,
          created_at: entry.created_at,
        })),
      };

      setSelectedTicket(updatedTicket);
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
      const detailData = data.data || data;
      const fullTicketInfo = detailData.ticket || detailData;
      const timeline = detailData.timeline || [];

      const updatedTicket = {
        ...selectedTicket,
        status: fullTicketInfo.status || pendingStatus,
        timeline: timeline.map((entry: any) => ({
          action: entry.action || 'STATUS_CHANGE',
          message: entry.message,
          visibility: entry.visibility,
          actor_role: entry.actor_role,
          actor_name: entry.actor_name,
          created_at: entry.created_at,
        })),
      };

      setSelectedTicket(updatedTicket);
      setTickets(prev => prev.map(t =>
        t.ticket_id === selectedTicket.ticket_id ? { ...t, status: pendingStatus } : t
      ));

      setStatusSuccess(`Ticket successfully ${pendingStatus.toLowerCase().replace('_', ' ')}`);
      setTimeout(() => setStatusSuccess(null), 4000);
    } catch (err) {
      console.error('Status update failed:', err);
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
      const detailData = data.data || data;
      const fullTicketInfo = detailData.ticket || detailData;
      const timeline = detailData.timeline || [];

      const processed = {
        ...fullTicketInfo,
        ticket_id: fullTicketInfo.ticket_id || ticket.ticket_id,
        title: fullTicketInfo.title || ticket.title,
        status: fullTicketInfo.status || ticket.status,
        priority: fullTicketInfo.priority || ticket.priority,
        customer_name: fullTicketInfo.customer_name || ticket.customer_name,
        customer_code: fullTicketInfo.customer_code || ticket.customer_code,
        customer_email: fullTicketInfo.customer_email || fullTicketInfo.contact_email || ticket.customer_email || ticket.contact_email,
        customer_phone: fullTicketInfo.customer_phone || fullTicketInfo.contact_phone || ticket.customer_phone || ticket.contact_phone,
        project_name: fullTicketInfo.project_name || ticket.project_name,
        description: fullTicketInfo.description || ticket.description || 'No description provided.',
        creator_name: fullTicketInfo.creator_name || ticket.creator_name || 'Unknown',
        source: fullTicketInfo.source || ticket.source,
        created_at: fullTicketInfo.created_at || ticket.created_at,
        attachments: fullTicketInfo.attachments || ticket.attachments,
        timeline: timeline.map((entry: any) => ({
          action: entry.action,
          message: entry.message,
          visibility: entry.visibility,
          actor_role: entry.actor_role,
          actor_name: entry.actor_name,
          created_at: entry.created_at,
        })),
      };

      setSelectedTicket(processed);
    } catch (err) {
      console.error('Failed to load ticket details:', err);
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
      case 'NEW': return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-[#e0c4a0]' };
      case 'OPEN': return { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' };
      case 'IN_PROGRESS': return { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' };
      case 'RESOLVED': return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' };
      case 'CLOSED': return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' };
      default: return { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };
    }
  };

  const getPriorityColor = (priority: string) => {
    const p = priority?.toUpperCase() || '';
    switch (p) {
      case 'URGENT': return { dot: 'bg-red-500', text: 'text-red-600' };
      case 'HIGH': return { dot: 'bg-[var(--accent-green-light)]', text: 'text-[var(--primary)]' };
      case 'MEDIUM': return { dot: 'bg-yellow-500', text: 'text-yellow-600' };
      case 'LOW': return { dot: 'bg-[var(--accent-green-light)]', text: 'text-[var(--primary)]' };
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
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

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

  const totalPages = Math.ceil(filteredTickets.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedTickets = filteredTickets.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (loading || loadingTeam) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-[#f5ebe0]/40 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-[var(--primary)] animate-spin mx-auto mb-4" />
          <p className="text-slate-600 text-sm">Loading tickets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-[#f5ebe0]/40 flex items-center justify-center">
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-[#f5ebe0]/40 text-xs">
        <div className="p-3 md:p-4 max-w-[1700px] mx-auto">
          <div className="mb-4">
            <button
              onClick={() => navigate('/staff/cx')}
              className="flex items-center gap-1 text-[var(--primary)] hover:text-[var(--primary-hover)] text-xs font-medium mb-2 group"
            >
              <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
              Back to Dashboard
            </button>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h1 className="text-lg md:text-xl font-black text-slate-900">Master Ticket Queue</h1>
                <div className="flex items-center gap-4 text-xs text-slate-600 mt-1">
                  <span>{filteredTickets.length} matching • {tickets.length} total</span>
                  {lastUpdated && (
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className={`w-3.5 h-3.5 ${backgroundRefreshing ? 'animate-spin' : ''}`} />
                      Updated {lastUpdated.toLocaleTimeString([], { timeStyle: 'short' })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/staff/cx/create-ticket')}
                  className="px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-xs font-medium hover:bg-[var(--primary-hover)] flex items-center gap-1 shadow-sm"
                >
                  <Plus className="w-3 h-3" /> New Ticket
                </button>
                <button
                  onClick={handleManualRefresh}
                  disabled={backgroundRefreshing}
                  className={`p-1.5 border rounded-lg ${backgroundRefreshing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'}`}
                  title="Refresh now"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${backgroundRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 mb-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1">SEARCH</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ID, customer, project, email, phone..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-3 py-1.5 w-full border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[var(--primary)]/40 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">STATUS</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs outline-none"
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
                  onChange={e => setPriorityFilter(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs outline-none"
                >
                  <option value="all">All Priority</option>
                  <option value="URGENT">Urgent</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
              <div className="md:col-span-4">
                <TicketListTagFilter
                  selectedIds={tagFilterIds}
                  mode={tagFilterMode}
                  onSelectedIdsChange={(ids) => {
                    shouldResetPage.current = true;
                    setTagFilterIds(ids);
                  }}
                  onModeChange={(m) => {
                    shouldResetPage.current = true;
                    setTagFilterMode(m);
                  }}
                />
              </div>
            </div>
            {(searchTerm || statusFilter !== 'all' || priorityFilter !== 'all' || tagFilterIds.length > 0) && (
              <div className="mt-2 text-right">
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setPriorityFilter('all');
                    setTagFilterIds([]);
                  }}
                  className="text-[var(--primary)] hover:text-[var(--primary-hover)] text-xs font-medium"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow-[var(--shadow-md)] border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead className="bg-gradient-to-r from-[#5c3a1e] to-[#4a2c16] text-white text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Ticket ID</th>
                    <th className="px-4 py-3 text-left font-medium">Source</th>
                    <th className="px-4 py-3 text-left font-medium">Customer</th>
                    <th className="px-4 py-3 text-left font-medium">Tags</th>
                    <th className="px-4 py-3 text-left font-medium">Phone</th>
                    <th className="px-4 py-3 text-left font-medium">Email</th>
                    <th className="px-4 py-3 text-left font-medium">Project</th>
                    <th className="px-4 py-3 text-left font-medium">Created</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Priority</th>
                    <th className="px-4 py-3 text-left font-medium">Assigned</th>
                    <th className="px-4 py-3 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedTickets.map((ticket) => {
                    const statusColors = getStatusColor(ticket.status);
                    const priorityColors = getPriorityColor(ticket.priority);
                    return (
                      <tr 
                      key={ticket.ticket_id} 
                      className="hover:bg-[var(--accent-green-light)]/40 transition-colors cursor-pointer"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('select, button')) return;
                        navigate(`/staff/cx/tickets/${ticket.ticket_id}`);
                      }}
                    >
                        <td className="px-4 py-3">
                          <span className="font-mono bg-[var(--accent-green-light)] text-[var(--primary)] px-2 py-0.5 rounded-full text-xs font-bold">
                            #{ticket.ticket_id}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            {getSourceIcon(ticket.source)}
                            <span className="capitalize">{ticket.source || 'portal'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{ticket.customer_name}</td>
                        <td className="px-4 py-3">
                          <TicketTagBadgesRow tags={ticket.tags} max={3} compact />
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {ticket.customer_phone || ticket.contact_phone || <span className="text-slate-400 italic">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {ticket.customer_email || ticket.contact_email || <span className="text-slate-400 italic">—</span>}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{ticket.project_name}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            {formatCreatedTime(ticket.created_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${statusColors.bg} ${statusColors.text} border ${statusColors.border}`}>
                            {ticket.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${priorityColors.dot}`} />
                            <span className={`${priorityColors.text} font-medium`}>{ticket.priority.toLowerCase()}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {ticket.assignee_name || <span className="text-slate-400 italic">Unassigned</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <select
                              id={`assign-${ticket.ticket_id}`}
                              disabled={assigningTicketId === ticket.ticket_id}
                              onChange={e => assignTicket(ticket.ticket_id, parseInt(e.target.value) || 0)}
                              className="text-xs px-2 py-1 border border-slate-300 rounded bg-white"
                              defaultValue=""
                            >
                              <option value="" disabled>Assign</option>
                              {teamMembers.map(m => (
                                <option key={m.id} value={m.id}>
                                  {m.fullName}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => navigate(`/staff/cx/tickets/${ticket.ticket_id}`)}
                              className="px-3 py-1.5 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-hover)] text-white rounded hover:from-[var(--primary-hover)] hover:to-[#5c3a1e] text-xs font-medium flex items-center gap-1.5"
                            >
                              <Eye className="w-4 h-4" /> View
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

            {paginatedTickets.length === 0 && (
              <div className="py-12 text-center text-slate-500">
                <Search className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No tickets found</p>
                <p className="text-xs mt-1">Try adjusting your search or filters</p>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs">
                <div className="text-slate-600">
                  Showing <strong>{startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, filteredTickets.length)}</strong> of <strong>{filteredTickets.length}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 py-1 font-medium">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal – same design with blur backdrop */}
      {modalOpen && selectedTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-[#5c3a1e] to-[#4a2c16] text-white p-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Ticket #{selectedTicket.ticket_id}</h2>
                <p className="text-[#e8d5bc] text-sm mt-1">
                  Created by <strong>{selectedTicket.creator_name}</strong> • {formatFullDate(selectedTicket.created_at)}
                </p>
              </div>
              <button onClick={closeModal} className="p-2 rounded-full hover:bg-white/20">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-br from-slate-50 to-white">
              {modalLoading ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <RefreshCw className="w-10 h-10 text-[var(--primary)] animate-spin mb-4" />
                  <p className="text-slate-600">Loading ticket details...</p>
                </div>
              ) : (
                <>
                  {/* Title & Description combined for better flow */}
                  <div className="bg-gradient-to-r from-[var(--accent-green-light)] to-[#f8f1e8] rounded-xl p-5 border border-[#e0c4a0]">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                      <MessageSquare className="w-5 h-5 text-[var(--primary)]" />
                      {selectedTicket.title}
                    </h3>
                    <p className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">
                      {selectedTicket.description}
                    </p>
                  </div>

                  {/* Info cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                      <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2 text-sm">
                        <User className="w-4 h-4 text-[var(--primary)]" /> Customer Details
                      </h4>
                      <div className="space-y-1.5 text-xs">
                        <p><strong>Name:</strong> {selectedTicket.customer_name}</p>
                        <p><strong>Customer ID:</strong> {selectedTicket.customer_code || '—'}</p>
                        <p><strong>Email:</strong> {selectedTicket.customer_email || selectedTicket.contact_email || '—'}</p>
                        <p><strong>Phone:</strong> {selectedTicket.customer_phone || selectedTicket.contact_phone || '—'}</p>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                      <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2 text-sm">
                        <Globe className="w-4 h-4 text-[var(--primary)]" /> Project / Source
                      </h4>
                      <div className="space-y-1.5 text-xs">
                        <p><strong>Project:</strong> {selectedTicket.project_name}</p>
                        <p><strong>Source:</strong> <span className="inline-flex items-center gap-1.5">{getSourceIcon(selectedTicket.source)} {selectedTicket.source || 'portal'}</span></p>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-[var(--shadow-md)]">
                      <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 text-[var(--primary)]" /> Status & Priority
                      </h4>
                      <div className="space-y-1.5 text-xs">
                        <p>
                          <strong>Status:</strong>{' '}
                          <span className={`ml-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${getStatusColor(selectedTicket.status).bg} ${getStatusColor(selectedTicket.status).text}`}>
                            {selectedTicket.status.replace('_', ' ')}
                          </span>
                        </p>
                        <p>
                          <strong>Priority:</strong>{' '}
                          <span className="ml-1 inline-flex items-center gap-1.5">
                            <div className={`w-3 h-3 rounded-full ${getPriorityColor(selectedTicket.priority).dot}`} />
                            {selectedTicket.priority.toLowerCase()}
                          </span>
                        </p>
                        <p><strong>Created:</strong> {formatFullDate(selectedTicket.created_at)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Status buttons */}
                  <div className="bg-gradient-to-r from-[var(--accent-green-light)] to-[#f8f1e8] rounded-xl p-5 border border-[#e0c4a0]">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <UserCheck className="w-5 h-5 text-[var(--primary)]" />
                      Update Status
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPEN'].map(status => {
                        const isCurrent = selectedTicket.status === status;
                        const disabled = updatingStatus || isCurrent || (selectedTicket.status === 'CLOSED' && status !== 'REOPEN');
                        let color = "bg-[var(--primary)] hover:bg-[var(--primary-hover)]";
                        if (status === 'RESOLVED') color = "bg-green-600 hover:bg-green-700";
                        if (status === 'CLOSED') color = "bg-red-600 hover:bg-red-700";
                        if (status === 'REOPEN') color = "bg-amber-600 hover:bg-amber-700";

                        return (
                          <button
                            key={status}
                            onClick={() => handleStatusAction(status)}
                            disabled={disabled}
                            className={`px-4 py-2.5 rounded-xl text-white text-xs sm:text-sm font-medium transition ${color} ${disabled ? 'opacity-50 cursor-not-allowed' : 'shadow hover:shadow-md'}`}
                          >
                            {status === 'REOPEN' ? 'Reopen' : status.replace('_', ' ')}
                            {isCurrent && ' (current)'}
                          </button>
                        );
                      })}
                    </div>
                    {statusSuccess && (
                      <p className="mt-4 text-green-700 flex items-center gap-2 text-sm font-medium">
                        <CheckCircle className="w-4 h-4" /> {statusSuccess}
                      </p>
                    )}
                  </div>

                  {/* Attachments */}
                  {selectedTicket.attachments && (() => {
                    try {
                      const attachments = typeof selectedTicket.attachments === 'string' 
                        ? JSON.parse(selectedTicket.attachments) 
                        : selectedTicket.attachments;
                      if (Array.isArray(attachments) && attachments.length > 0) {
                        return (
                          <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-[var(--shadow-md)]">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                              <FileText className="w-5 h-5 text-[var(--primary)]" /> Attachments ({attachments.length})
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {attachments.map((att: any, idx: number) => {
                                // Normalize path - handle both relative and absolute paths
                                let imagePath = att.path || att.savedName || '';
                                if (typeof imagePath === 'string' && imagePath.trim()) {
                                  // Normalize slashes
                                  imagePath = imagePath.replace(/\\/g, '/');
                                  // Remove leading slashes
                                  imagePath = imagePath.replace(/^\/+/, '');
                                  // If it doesn't start with uploads/, add it
                                  if (!imagePath.startsWith('uploads/')) {
                                    // If it starts with tickets/, prepend uploads/
                                    if (imagePath.startsWith('tickets/')) {
                                      imagePath = `uploads/${imagePath}`;
                                    } else {
                                      // Otherwise assume it's a filename in tickets folder
                                      imagePath = `uploads/tickets/${imagePath}`;
                                    }
                                  }
                                  // Ensure it starts with /
                                  const imageUrl = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
                                  console.log('[Tickets] Image URL:', imageUrl, 'from path:', att.path);
                                  return (
                                    <div key={idx} className="relative group">
                                      <img
                                        src={imageUrl}
                                        alt={att.originalName || `Attachment ${idx + 1}`}
                                        className="w-full h-32 object-cover rounded-lg border border-slate-200 cursor-pointer hover:border-[var(--primary)] transition"
                                        onClick={() => window.open(imageUrl, '_blank')}
                                        onError={(e) => {
                                          console.error('Image failed to load:', imageUrl);
                                          (e.target as HTMLImageElement).src = '/placeholder.svg';
                                        }}
                                      />
                                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition rounded-lg flex items-center justify-center">
                                        <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition" />
                                      </div>
                                      <p className="text-xs text-slate-600 mt-1 truncate" title={att.originalName}>
                                        {att.originalName || `Image ${idx + 1}`}
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              })}
                            </div>
                          </div>
                        );
                      }
                    } catch (e) {
                      console.error('Error parsing attachments:', e);
                    }
                    return null;
                  })()}

                  {/* Manual Email Send */}
                  {selectedTicket.customer_email || selectedTicket.contact_email ? (
                    <div className="bg-gradient-to-r from-[var(--accent-green-light)] to-[#f8f1e8] rounded-xl p-5 border border-blue-100">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Mail className="w-5 h-5 text-[var(--primary)]" />
                        Send Email to Customer
                      </h3>
                      <ManualEmailForm ticketId={selectedTicket.ticket_id} customerEmail={selectedTicket.customer_email || selectedTicket.contact_email} />
                    </div>
                  ) : null}

                  {/* Timeline */}
                  <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-[var(--primary)]" /> Activity Timeline
                    </h3>
                    {selectedTicket.timeline?.length ? (
                      <div className="space-y-5">
                        {selectedTicket.timeline.map((entry, i) => (
                          <div key={i} className="flex gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                              entry.visibility === 'public' ? 'bg-teal-600' : 'bg-[var(--primary)]'
                            }`}>
                              {entry.actor_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 bg-slate-50 rounded-lg p-4">
                              <div className="flex justify-between items-start mb-2 text-xs">
                                <p className="font-semibold text-slate-900">{entry.actor_name}</p>
                                <p className="text-slate-500">{formatFullDate(entry.created_at)}</p>
                              </div>
                              <p className="text-slate-700 whitespace-pre-wrap text-sm">{entry.message}</p>
                              {entry.visibility === 'public' && (
                                <span className="mt-2 inline-block px-2.5 py-1 bg-teal-100 text-teal-800 rounded-full text-xs">
                                  Visible to customer
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-slate-500 py-8 text-sm">No activity recorded yet.</p>
                    )}
                  </div>

                  {/* Close ticket at bottom */}
                  <div className="pt-4 border-t border-slate-200">
                    <button
                      onClick={() => handleStatusAction('CLOSED')}
                      disabled={updatingStatus || selectedTicket.status === 'CLOSED'}
                      className={`w-full md:w-auto px-6 py-3 rounded-xl font-medium text-white transition ${
                        selectedTicket.status === 'CLOSED'
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700 shadow-md'
                      }`}
                    >
                      {selectedTicket.status === 'CLOSED' ? 'Already Closed' : 'Close Ticket'}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-slate-200 px-6 py-4 bg-white flex justify-end">
              <button
                onClick={closeModal}
                className="px-6 py-2.5 bg-slate-200 text-slate-800 rounded-xl hover:bg-slate-300 transition font-medium text-sm"
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

      {/* Status popup – unchanged */}
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
              <h3 className="text-xl font-bold text-slate-900">
                {pendingStatus === 'RESOLVED' ? 'Resolve Ticket' :
                 pendingStatus === 'CLOSED' ? 'Close Ticket' :
                 pendingStatus === 'REOPEN' ? 'Reopen Ticket' : 'Confirm Status Change'}
              </h3>
              <button onClick={() => setStatusPopupOpen(false)}>
                <X className="w-6 h-6 text-slate-500 hover:text-slate-700" />
              </button>
            </div>

            <div className="mb-6 text-slate-600 text-sm space-y-2">
              {pendingStatus === 'RESOLVED' && <p>Marking as resolved notifies the customer. Please describe the resolution.</p>}
              {pendingStatus === 'CLOSED' && <p>Closing finalizes the ticket. Provide a summary or final note.</p>}
              {pendingStatus === 'REOPEN' && <p>Explain why this ticket needs to be reopened.</p>}
            </div>

            {['RESOLVED', 'CLOSED', 'REOPEN'].includes(pendingStatus) && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {pendingStatus === 'RESOLVED' ? 'Resolution summary' :
                   pendingStatus === 'CLOSED' ? 'Closing summary' :
                   'Reason for reopening'} <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)] outline-none resize-none text-sm"
                  placeholder="Enter details here..."
                />
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStatusPopupOpen(false)}
                className="px-5 py-2.5 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmStatusChange}
                disabled={['RESOLVED', 'CLOSED', 'REOPEN'].includes(pendingStatus) && !reason.trim()}
                className={`px-6 py-2.5 rounded-lg text-white font-medium ${
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

export default AllTickets;