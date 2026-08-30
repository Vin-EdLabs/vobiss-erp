// src/pages/staff/cx/TicketDetailPage.tsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Clock, User, Mail, Phone, Calendar, FileText,
  AlertCircle, CheckCircle, X, Image as ImageIcon, Send,
  UserCheck, MessageSquare, RefreshCw, Eye, Globe
} from 'lucide-react';
import { cxApi, getRequestsByTicketId } from '../../../api';
import { API_URL } from '@/lib/api';
import { useAuth } from '../../../context/AuthContext';
import { RecordChatButton } from '@/components/chat/RecordChatButton';
import { ShareButton } from '@/components/ShareButton';
import { useSharedView } from '@/context/SharedViewContext';
import { WorkflowTimeline } from '@/components/timeline/WorkflowTimeline';
import { buildPreviewTable } from '@/lib/shareRecord';
import { staffCxTicketPath, toFullTicketNumber } from '@/lib/ticketPaths';
import { vobiAmbientStore } from '@/stores/vobiAmbientStore';
import { TicketTagsEditor } from '@/components/tickets/TicketTagsEditor';
import { TicketFullReportPanel } from '@/components/tickets/TicketFullReportPanel';

interface MaterialRequest {
  id: number;
  material_name: string;
  quantity_requested: number;
  quantity_approved: number;
  quantity_received: number;
  created_at: string;
  status: string;
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
  id?: number;
  ticket_id: string;
  title: string;
  status: string;
  priority: string;
  customer_name: string;
  customer_code?: string;
  customer_email?: string;
  customer_phone?: string;
  contact_email?: string;
  contact_phone?: string;
  project_name: string;
  project_id?: string;
  site_name?: string;
  site_code?: string;
  site?: { id?: number; site_name?: string; site_code?: string; connection_status?: string } | null;
  source?: 'portal' | 'email' | 'phone';
  description?: string;
  creator_name?: string;
  assignee_name?: string;
  created_at: string;
  updated_at?: string;
  chat_channel_id?: string | null;
  attachments?: any;
  timeline?: TimelineEntry[];
  tags?: { id: number; name: string; color: string }[];
}

interface TeamMember {
  id: number;
  fullName: string;
  role: string;
}

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
        <label className="block text-xs font-medium text-slate-700 mb-1">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={`Update on Ticket ${ticketId}`}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter your message to the customer..."
          rows={4}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
        />
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
      {success && <p className="text-green-600 text-xs">{success}</p>}
      <button
        onClick={handleSend}
        disabled={sending || !message.trim()}
        className="w-full px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:bg-[var(--primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Mail className="w-4 h-4" />
        {sending ? 'Sending...' : 'Send Email'}
      </button>
    </div>
  );
};

const TicketDetailPage: React.FC = () => {
  const { isSharedView, routeParams } = useSharedView();
  const { id: paramRouteId } = useParams<{ id: string }>();
  const rawRouteId = isSharedView ? routeParams?.id : paramRouteId;
  const ticketRouteId = rawRouteId
    ? decodeURIComponent(rawRouteId).trim().replace(/^#/, '')
    : '';
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [linkedRequests, setLinkedRequests] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);
  const [showAckPrompt, setShowAckPrompt] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [statusPopupOpen, setStatusPopupOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [assigningTicketId, setAssigningTicketId] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const isNOC = location.pathname.includes('/noc/');
  const isIP = location.pathname.includes('/ip/');
  const isField = location.pathname.includes('/field/');

  const navState = location.state as { returnTo?: string; returnLabel?: string } | null;
  const returnFromQuery = new URLSearchParams(location.search).get('from');
  const defaultBackPath = isNOC
    ? '/staff/noc/tickets'
    : isIP
      ? '/staff/ip/tickets'
      : isField
        ? '/staff/field/tickets'
        : '/staff/cx/tickets';

  const REPORT_RETURN_LABELS: Record<string, string> = {
    '/staff/reports/tickets': 'Back to Ticket Report',
    '/staff/reports/cash': 'Back to Cash Report',
    '/staff/reports': 'Back to Report System',
    '/reports': 'Back to Inventory Report',
  };

  const backPath = navState?.returnTo || returnFromQuery || defaultBackPath;
  const backLabel =
    navState?.returnLabel ||
    (backPath && REPORT_RETURN_LABELS[backPath]) ||
    (isNOC || isIP || isField ? 'Back to Tickets' : 'Back to Tickets');

  useEffect(() => {
    if (ticketRouteId) {
      fetchTicket();
      fetchTeamMembers();
      fetchLinkedRequests();
    }
  }, [ticketRouteId]);

  useEffect(() => {
    if (!ticket) return;
    const priority = String(ticket.priority || '').toUpperCase();
    const status = String(ticket.status || '').toUpperCase();
    const alerts = [];

    if (['URGENT', 'HIGH', 'P1', 'P2'].includes(priority) && !['RESOLVED', 'CLOSED'].includes(status)) {
      alerts.push({
        label: 'Priority warning',
        text: 'This ticket is high priority. Update status or escalate if the team is blocked.',
        severity: 'error' as const,
      });
    }

    if (status === 'NEW' || status === 'OPEN') {
      alerts.push({
        label: 'Ownership needed',
        text: 'Claim or assign this ticket so the next owner is clear.',
        severity: 'warn' as const,
      });
    }

    vobiAmbientStore.getState().setPageAlerts(alerts);
    return () => vobiAmbientStore.getState().setPageAlerts([]);
  }, [ticket]);

  const fetchLinkedRequests = async () => {
    try {
      const response = await getRequestsByTicketId(ticketRouteId);
      if (response.success) {
        setLinkedRequests(response.data || []);
      }
    } catch (err) {
      console.error('Failed to load linked requests:', err);
    }
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

      let filtered = data;
      if (isNOC) {
        filtered = data.filter((m: any) => m.role?.toLowerCase() === 'noc' || m.role?.toLowerCase().includes('noc'));
      } else if (isIP) {
        filtered = data.filter((m: any) =>
          m.role?.toLowerCase() === 'ip' ||
          m.role?.toLowerCase().includes('implementation') ||
          m.role?.toLowerCase().includes('project')
        );
      } else if (isField) {
        filtered = data.filter((m: any) =>
          ['field_engineer', 'field_engineer_admin'].includes(m.role?.toLowerCase())
        );
      }

      setTeamMembers(filtered);
    } catch (err) {
      console.error('Failed to load team members:', err);
    } finally {
      setLoadingTeam(false);
    }
  };

  const fetchTicket = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await cxApi.getTicketDetails(ticketRouteId);
      const detailData = data.data || data;
      const fullTicketInfo = detailData.ticket || detailData;
      if (!fullTicketInfo?.ticket_id && !fullTicketInfo?.title && !fullTicketInfo?.status) {
        throw new Error('Ticket not found');
      }
      const timeline = detailData.timeline || [];

      const publicId = toFullTicketNumber(fullTicketInfo.ticket_id) || '';
      if (!publicId) {
        throw new Error('Ticket not found');
      }

      const processed: Ticket = {
        ...fullTicketInfo,
        ticket_id: publicId,
        title: fullTicketInfo.title || 'No Title',
        status: fullTicketInfo.status || 'NEW',
        priority: fullTicketInfo.priority || 'NORMAL',
        customer_name: fullTicketInfo.customer_name || 'Unknown',
        customer_code: fullTicketInfo.customer_code,
        customer_email: fullTicketInfo.customer_email || fullTicketInfo.contact_email,
        customer_phone: fullTicketInfo.customer_phone || fullTicketInfo.contact_phone,
        project_name: fullTicketInfo.project_name || 'General',
        site_name: fullTicketInfo.site_name || fullTicketInfo.site?.site_name,
        site_code: fullTicketInfo.site_code || fullTicketInfo.site?.site_code,
        site: fullTicketInfo.site || null,
        description: fullTicketInfo.description || 'No description provided.',
        creator_name: fullTicketInfo.creator_name || 'Unknown',
        assignee_name: fullTicketInfo.assignee_name,
        created_at: fullTicketInfo.created_at || new Date().toISOString(),
        attachments: fullTicketInfo.attachments,
        tags: Array.isArray(fullTicketInfo.tags) ? fullTicketInfo.tags : [],
        timeline: timeline.map((entry: any) => ({
          action: entry.action,
          message: entry.message,
          visibility: entry.visibility || 'public',
          actor_role: entry.actor_role || 'Staff',
          actor_name: entry.actor_name || 'Unknown',
          created_at: entry.created_at,
        })),
      };

      setTicket(processed);

      if (!isSharedView && ticketRouteId && publicId && ticketRouteId.toUpperCase() !== publicId.toUpperCase()) {
        navigate(staffCxTicketPath(publicId), { replace: true, state: location.state });
      }
    } catch (err: any) {
      console.error('Failed to load ticket:', err);
      setError(err.message || 'Failed to load ticket details');
    } finally {
      setLoading(false);
    }
  };

  const assignTicket = async (userId: number | '') => {
    if (!userId || !ticket) return;
    setAssigningTicketId(ticket.ticket_id);
    setAssignSuccess(null);
    setAssignError(null);
    try {
      await cxApi.updateTicket(ticket.ticket_id, { assigned_to: userId });
      const assignedName = teamMembers.find(m => m.id === userId)?.fullName || 'Team Member';
      setAssignSuccess(`Assigned to ${assignedName}`);
      await fetchTicket();
      setTimeout(() => setAssignSuccess(null), 5000);
    } catch (err: any) {
      console.error('Assignment failed:', err);
      const errorMessage = err?.response?.data?.error || err?.message || 'Failed to assign ticket';
      const errorCode = err?.response?.data?.code;

      if (errorCode === 'PERMISSION_DENIED' || errorMessage.includes('Only the assigned person') || 
          errorMessage.includes('can reassign') || errorMessage.includes('can assign')) {
        setAssignError('You do not have permission to reassign this ticket. Only the currently assigned person or CX members can reassign tickets.');
      } else {
        setAssignError(errorMessage);
      }
      setTimeout(() => setAssignError(null), 8000);
    } finally {
      setAssigningTicketId(null);
    }
  };

  const handleStatusAction = (newStatus: string) => {
    if (!ticket || newStatus === ticket.status) return;
    if (ticket.status === 'CLOSED' && newStatus !== 'REOPEN') return;

    if ((newStatus === 'IN_PROGRESS' || newStatus === 'OPEN') &&
        ticket.status !== 'IN_PROGRESS' && ticket.status !== 'OPEN') {
      setPendingStatus(newStatus);
      setShowAckPrompt(true);
      return;
    }

    if (['RESOLVED', 'CLOSED', 'REOPEN'].includes(newStatus)) {
      setPendingStatus(newStatus);
      setReason('');
      setStatusPopupOpen(true);
      return;
    }

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
    if (!ticket) return;

    setUpdatingStatus(true);
    setStatusSuccess(null);
    try {
      let commentText = `Status changed to ${status.replace('_', ' ')}`;
      if (acknowledged) {
        commentText = `Ticket acknowledged for work by ${user?.first_name} ${user?.last_name}`;
      }

      await cxApi.updateTicket(ticket.ticket_id, {
        status,
        comment: commentText,
        visibility: 'public'
      });

      await fetchTicket();
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
    if (!ticket || !pendingStatus) return;

    const needsReason = ['RESOLVED', 'CLOSED', 'REOPEN'].includes(pendingStatus);
    if (needsReason && !reason.trim()) {
      alert('Please provide a description/reason for this action');
      return;
    }

    setStatusPopupOpen(false);
    setUpdatingStatus(true);
    setStatusSuccess(null);

    try {
      let commentText = `Status changed to ${pendingStatus.replace('_', ' ')}`;
      if (pendingStatus === 'RESOLVED') commentText = `Resolved: ${reason.trim()}`;
      if (pendingStatus === 'CLOSED') commentText = `Closed: ${reason.trim()}`;
      if (pendingStatus === 'REOPEN') commentText = `Reopened: ${reason.trim()}`;

      await cxApi.updateTicket(ticket.ticket_id, {
        status: pendingStatus,
        comment: commentText,
        visibility: ['RESOLVED', 'CLOSED'].includes(pendingStatus) ? 'public' : 'internal'
      });

      await fetchTicket();
      setStatusSuccess(`Ticket successfully ${pendingStatus.toLowerCase().replace('_', ' ')}`);
      setTimeout(() => setStatusSuccess(null), 4000);
    } catch (err) {
      console.error('Status update failed:', err);
      alert('Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim() || !ticket) return;
    try {
      setSubmitting(true);
      await cxApi.updateTicket(ticket.ticket_id, { comment: comment.trim() });
      setComment('');
      await fetchTicket();
    } catch (err: any) {
      console.error('Failed to add comment:', err);
      alert('Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const normalizeAttachmentPath = (attachment: any): string | null => {
    if (!attachment) return null;
    let imagePath: string;
    if (typeof attachment === 'string') {
      imagePath = attachment;
    } else if (attachment.path) {
      imagePath = attachment.path;
    } else if (attachment.filename) {
      imagePath = attachment.filename;
    } else {
      return null;
    }
    if (typeof imagePath === 'string' && imagePath.trim()) {
      if (imagePath.startsWith('http')) return imagePath;
      if (imagePath.startsWith('/uploads')) return imagePath;
      if (imagePath.startsWith('uploads/')) return `/${imagePath}`;
      if (imagePath.startsWith('tickets/')) return `/uploads/${imagePath}`;
      return `/uploads/tickets/${imagePath}`;
    }
    return null;
  };

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

  const getSourceIcon = (source?: string) => {
    switch (source?.toLowerCase()) {
      case 'email': return <Mail className="w-3.5 h-3.5" />;
      case 'phone': return <Phone className="w-3.5 h-3.5" />;
      default: return <Globe className="w-3.5 h-3.5" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading || loadingTeam) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-[#f5ebe0]/40 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-[var(--primary)] animate-spin mx-auto mb-4" />
          <p className="text-slate-600 text-sm">Loading ticket details...</p>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-[#f5ebe0]/40 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 text-center border border-slate-100">
          <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-slate-800 mb-3">Ticket Not Found</h2>
          <p className="text-slate-600 mb-8">{error || 'The ticket you are looking for does not exist.'}</p>
          <button
            onClick={() => navigate(backPath)}
            className="px-8 py-3 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-hover)] transition shadow-lg shadow-[#8b5a2b]/25"
          >
            {backLabel}
          </button>
        </div>
      </div>
    );
  }

  const attachments = ticket.attachments
    ? (Array.isArray(ticket.attachments) ? ticket.attachments : [ticket.attachments])
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-[#f5ebe0]/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate(backPath)}
            className="flex items-center gap-2 text-[var(--primary)] hover:text-[var(--primary-hover)] text-sm font-medium mb-4 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            {backLabel}
          </button>

          <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-slate-200 p-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <h1 className="text-2xl font-bold text-slate-900">{ticket.title}</h1>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${getStatusColor(ticket.status)}`}>
                    {ticket.status.replace('_', ' ')}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${getPriorityColor(ticket.priority)}`}></span>
                    <span className="text-sm font-semibold text-slate-700">{ticket.priority}</span>
                  </div>
                </div>
                <p className="text-sm text-slate-500 font-mono">{ticket.ticket_id}</p>
                <div className="mt-3">
                  {isSharedView ? (
                    (ticket.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {(ticket.tags || []).map((tag: any) => (
                          <span
                            key={tag.id}
                            className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                            style={{ backgroundColor: tag.color || '#64748b' }}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )
                  ) : (
                    <TicketTagsEditor
                      ticketId={ticket.ticket_id}
                      initialTags={ticket.tags || []}
                      onChange={(tags) => setTicket((prev) => (prev ? { ...prev, tags } : prev))}
                      onMutated={() => {
                        void (async () => {
                          try {
                            const data = await cxApi.getTicketDetails(ticketRouteId);
                            const detailData = data.data || data;
                            const timeline = detailData.timeline || [];
                            setTicket((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    timeline: timeline.map((entry: any) => ({
                                      action: entry.action,
                                      message: entry.message,
                                      visibility: entry.visibility || 'public',
                                      actor_role: entry.actor_role || 'Staff',
                                      actor_name: entry.actor_name || 'Unknown',
                                      created_at: entry.created_at,
                                    })),
                                  }
                                : prev
                            );
                          } catch {
                            /* ignore soft refresh errors */
                          }
                        })();
                      }}
                    />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isSharedView && (
                <ShareButton
                  recordType="ticket"
                  recordId={ticket.id ?? Number(ticketRouteId)}
                  pagePath={window.location.pathname}
                  pageTitle={`${ticket.title} (${ticket.ticket_id})`}
                  recordPreview={{
                    title: ticket.title,
                    reference: ticket.ticket_id,
                    status: ticket.status,
                    client: ticket.customer_name,
                    priority: ticket.priority,
                    site: ticket.site_name,
                    project: ticket.project_name,
                    creator: ticket.creator_name,
                    assignee: ticket.assignee_name,
                    description: ticket.description,
                    submitted: ticket.created_at,
                    tables: [
                      buildPreviewTable(
                        'Timeline',
                        ticket.timeline
                          ?.filter((t) => t.visibility === 'public')
                          .map((t) => ({ action: t.action, message: t.message, actor: t.actor_role, when: new Date(t.created_at).toLocaleString() })),
                        [
                          { key: 'action', label: 'Action' },
                          { key: 'message', label: 'Message' },
                          { key: 'actor', label: 'Actor' },
                          { key: 'when', label: 'When' },
                        ]
                      ),
                    ].filter(Boolean),
                  }}
                />
                )}
                {!isSharedView && (
                <RecordChatButton
                  recordType="ticket"
                  recordId={ticket.ticket_id}
                  chatChannelId={ticket.chat_channel_id}
                />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-[var(--primary)]" />
                Customer Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500 mb-1">Customer Name</p>
                  <p className="text-base font-semibold text-slate-900">{ticket.customer_name}</p>
                </div>
                {ticket.customer_code && (
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Customer ID</p>
                    <p className="text-base font-semibold text-slate-900 font-mono">{ticket.customer_code}</p>
                  </div>
                )}
                {ticket.customer_email && (
                  <div>
                    <p className="text-sm text-slate-500 mb-1 flex items-center gap-1">
                      <Mail className="w-4 h-4" /> Email
                    </p>
                    <p className="text-base font-semibold text-slate-900">{ticket.customer_email}</p>
                  </div>
                )}
                {ticket.customer_phone && (
                  <div>
                    <p className="text-sm text-slate-500 mb-1 flex items-center gap-1">
                      <Phone className="w-4 h-4" /> Phone
                    </p>
                    <p className="text-base font-semibold text-slate-900">{ticket.customer_phone}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-slate-500 mb-1">Site</p>
                  <p className="text-base font-semibold text-slate-900">
                    {ticket.site_name || ticket.site?.site_name || ticket.project_name || '—'}
                    {(ticket.site_code || ticket.site?.site_code) && (
                      <span className="ml-2 rounded bg-[var(--accent-green-light)] px-2 py-0.5 font-mono text-xs text-[var(--primary)]">
                        {ticket.site_code || ticket.site?.site_code}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 mb-1 flex items-center gap-1">
                    <Calendar className="w-4 h-4" /> Created
                  </p>
                  <p className="text-base font-semibold text-slate-900">{formatDate(ticket.created_at)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-[var(--primary)]" />
                Description
              </h2>
              <p className="text-slate-700 whitespace-pre-wrap">{ticket.description}</p>
            </div>

            {attachments.length > 0 && (
              <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-[var(--primary)]" />
                  Attachments
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {attachments.map((att, idx) => {
                    const imagePath = normalizeAttachmentPath(att);
                    if (!imagePath) return null;
                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedImage(imagePath)}
                        className="relative aspect-square rounded-lg overflow-hidden border-2 border-slate-200 hover:border-[var(--primary)] cursor-pointer group"
                      >
                        <img
                          src={imagePath}
                          alt={`Attachment ${idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/placeholder-image.png';
                          }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <TicketFullReportPanel ticketId={ticket.ticket_id} status={ticket.status} />

            {!isSharedView && <WorkflowTimeline workflowType="ticket" recordId={ticket.id ?? Number(ticketRouteId)} />}

            {linkedRequests.length > 0 && (
              <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[var(--primary)]" />
                  Linked Requests
                </h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Material Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty Requested</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty Approved</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty Issued</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {linkedRequests.map((request) => (
                        <tr key={request.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{request.material_name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{request.quantity_requested}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{request.quantity_approved}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{request.quantity_received}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(request.created_at)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{request.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!isSharedView && (
            <div className="bg-gradient-to-r from-[var(--accent-green-light)] to-[#f8f1e8] rounded-xl p-5 border border-[#e0c4a0]">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[var(--primary)]" />
                Update Status
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPEN'].map((status) => {
                  const isCurrent = ticket.status === status;
                  const disabled = updatingStatus || isCurrent ||
                    (ticket.status === 'CLOSED' && status !== 'REOPEN');

                  let btnStyle = "bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white";
                  if (status === 'RESOLVED') btnStyle = "bg-green-600 hover:bg-green-700 text-white";
                  if (status === 'CLOSED') btnStyle = "bg-red-600 hover:bg-red-700 text-white";
                  if (status === 'REOPEN') btnStyle = "bg-amber-600 hover:bg-amber-700 text-white";

                  return (
                    <button
                      key={status}
                      onClick={() => handleStatusAction(status)}
                      disabled={disabled}
                      className={`px-4 py-2 rounded-xl text-white text-xs sm:text-sm font-medium transition ${btnStyle} ${disabled ? 'opacity-50 cursor-not-allowed' : 'shadow hover:shadow-md'}`}
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
            )}

            <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-[var(--primary)]" />
                Timeline
              </h2>
              <div className="space-y-4">
                {ticket.timeline && ticket.timeline.length > 0 ? (
                  ticket.timeline.map((entry, idx) => (
                    <div key={idx} className="flex gap-4 pb-4 border-b border-slate-100 last:border-0">
                      <div className="flex-shrink-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                          entry.visibility === 'public' ? 'bg-teal-600' : 'bg-[var(--primary)]'
                        }`}>
                          {entry.actor_name?.[0]?.toUpperCase() || '?'}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-slate-900">{entry.actor_name}</span>
                          <span className="text-xs text-slate-500">({entry.actor_role})</span>
                          <span className="text-xs text-slate-400">{formatDate(entry.created_at)}</span>
                          {entry.visibility === 'internal' && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Internal</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-700">{entry.message}</p>
                        <span className="text-xs text-[var(--primary)] font-medium">{entry.action.replace('_', ' ')}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 text-center py-8">No timeline entries yet</p>
                )}
              </div>
            </div>

            {!isSharedView && (
            <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[var(--primary)]" />
                Add Comment
              </h2>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment or update..."
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)] outline-none resize-none"
                rows={4}
              />
              <button
                onClick={handleAddComment}
                disabled={!comment.trim() || submitting}
                className="mt-3 px-6 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-[var(--primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Post Comment
              </button>
            </div>
            )}
          </div>

          <div className="space-y-6">
            {!isSharedView && (
            <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-slate-200 p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Assign To</label>
                  <select
                    disabled={assigningTicketId === ticket.ticket_id}
                    onChange={(e) => assignTicket(parseInt(e.target.value) || '')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)] outline-none"
                    defaultValue=""
                  >
                    <option value="" disabled>Select team member</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.fullName}
                      </option>
                    ))}
                  </select>
                  {assignSuccess && (
                    <p className="mt-2 text-green-600 text-xs flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> {assignSuccess}
                    </p>
                  )}
                  {assignError && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-red-700 text-xs flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        <span>{assignError}</span>
                      </p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => navigate(`/staff/cx/escalate/${ticket.ticket_id}`)}
                  className="w-full px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:bg-[var(--primary-hover)]"
                >
                  Ticket Escalation
                </button>
              </div>
            </div>
            )}

            {!isSharedView && (ticket.customer_email || ticket.contact_email) && (
              <div className="bg-gradient-to-r from-[var(--accent-green-light)] to-[#f8f1e8] rounded-xl p-5 border border-blue-100">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-[var(--primary)]" />
                  Send Email to Customer
                </h3>
                <ManualEmailForm ticketId={ticket.ticket_id} customerEmail={ticket.customer_email || ticket.contact_email!} />
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-slate-200 p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Ticket Details</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-slate-500">Assigned To</p>
                  <p className="font-semibold text-slate-900">{ticket.assignee_name || 'Unassigned'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Source</p>
                  <p className="font-semibold text-slate-900 capitalize flex items-center gap-1">
                    {getSourceIcon(ticket.source)} {ticket.source || 'Portal'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Created By</p>
                  <p className="font-semibold text-slate-900">{ticket.creator_name || 'Unknown'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAckPrompt && pendingStatus && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
              {pendingStatus === 'RESOLVED' && <p>Marking as resolved will send an email to the customer. Please describe the resolution.</p>}
              {pendingStatus === 'CLOSED' && <p>Closing finalizes the ticket and will send an email to the customer. Provide a summary or final note.</p>}
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

      {selectedImage && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300"
            >
              <X className="w-8 h-8" />
            </button>
            <img
              src={selectedImage}
              alt="Full size"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketDetailPage;