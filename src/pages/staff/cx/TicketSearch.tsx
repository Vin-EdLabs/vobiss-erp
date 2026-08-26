// src/pages/staff/cx/TicketSearch.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  Clock,
  User,
  Calendar,
  CheckCircle2,
  AlertCircle,
  FileText,
  Users,
  TrendingUp,
  X,
  RefreshCw
} from 'lucide-react';
import { cxApi } from '../../../api';

interface TimelineEntry {
  action: string;
  message: string;
  visibility: 'public' | 'internal';
  actor_role: string;
  actor_name: string;
  created_at: string;
}

interface UserWorkedOn {
  id: number;
  fullName: string;
  username: string;
  email: string;
  role: string;
  activityCount: number;
  firstActivity: string;
  lastActivity: string;
}

interface TicketDetails {
  ticket: any;
  timeline: TimelineEntry[];
  usersWorkedOn: UserWorkedOn[];
  resolutionTime: number | null;
  resolutionTimeFormatted: string | null;
  totalActivities: number;
}

const TicketSearch: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ticketDetails, setTicketDetails] = useState<TicketDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setError('Please enter a ticket ID');
      return;
    }

    setLoading(true);
    setError(null);
    setTicketDetails(null);

    try {
      const result = await cxApi.getTicketFullDetailsBySearchTerm(searchTerm.trim().toUpperCase());
      if (result.success && result.data) {
        setTicketDetails(result.data);
      } else {
        setError('Ticket not found');
      }
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.message || 'Failed to search ticket');
    } finally {
      setLoading(false);
    }
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-[#f5ebe0]/40">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/staff/cx')}
            className="flex items-center gap-2 text-[var(--primary)] hover:text-[var(--primary-hover)] mb-4 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <h1 className="text-3xl font-black text-slate-900 mb-2">Ticket Search</h1>
          <p className="text-slate-600">Search for any ticket to view complete details, timeline, and resolution metrics</p>
        </div>

        {/* Search Box */}
        <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-slate-200 p-6 mb-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Enter Ticket ID (e.g., TCK-000123)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[var(--primary)]/40 outline-none text-lg"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-hover)] text-white rounded-lg font-semibold hover:from-[var(--primary-hover)] hover:to-[#5c3a1e] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Search
                </>
              )}
            </button>
          </div>
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}
        </div>

        {/* Ticket Details */}
        {ticketDetails && (
          <div className="space-y-6">
            {/* Ticket Header Card */}
            <div className="bg-gradient-to-r from-[var(--primary)] to-[var(--primary-hover)] rounded-xl shadow-lg p-6 text-white">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold mb-2">{ticketDetails.ticket.title}</h2>
                  <div className="flex items-center gap-4 text-[#f3e6d4]">
                    <span className="font-mono text-lg font-bold">#{ticketDetails.ticket.ticket_id}</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      Created {formatDate(ticketDetails.ticket.created_at)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setTicketDetails(null);
                    setSearchTerm('');
                    setError(null);
                  }}
                  className="p-2 hover:bg-white/20 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-4 mt-4">
                <span className={`px-4 py-2 rounded-full text-sm font-bold uppercase border-2 border-white/30 ${getStatusColor(ticketDetails.ticket.status)}`}>
                  {ticketDetails.ticket.status.replace('_', ' ')}
                </span>
                <div className="flex items-center gap-2 px-4 py-2 bg-white/20 rounded-full">
                  <div className={`w-3 h-3 rounded-full ${getPriorityColor(ticketDetails.ticket.priority)}`} />
                  <span className="text-sm font-semibold">{ticketDetails.ticket.priority}</span>
                </div>
                {ticketDetails.resolutionTimeFormatted && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-white/20 rounded-full">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-semibold">Resolved in {ticketDetails.resolutionTimeFormatted}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">Total Activities</span>
                  <FileText className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div className="text-3xl font-black text-slate-900">{ticketDetails.totalActivities}</div>
              </div>
              <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">Users Involved</span>
                  <Users className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div className="text-3xl font-black text-slate-900">{ticketDetails.usersWorkedOn.length}</div>
              </div>
              <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">Status</span>
                  {ticketDetails.ticket.status === 'CLOSED' || ticketDetails.ticket.status === 'RESOLVED' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                  )}
                </div>
                <div className="text-lg font-bold text-slate-900">
                  {ticketDetails.ticket.status.replace('_', ' ')}
                </div>
              </div>
            </div>

            {/* Ticket Info */}
            <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-slate-200 p-6">
              <h3 className="text-xl font-bold text-slate-900 mb-4">Ticket Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-semibold text-slate-600 mb-2">Customer</h4>
                  <p className="text-slate-900 font-medium">{ticketDetails.ticket.customer_name}</p>
                  <p className="text-sm text-slate-500">{ticketDetails.ticket.customer_code}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-600 mb-2">Project</h4>
                  <p className="text-slate-900 font-medium">{ticketDetails.ticket.project_name}</p>
                  <p className="text-sm text-slate-500">{ticketDetails.ticket.project_code}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-600 mb-2">Category</h4>
                  <p className="text-slate-900">{ticketDetails.ticket.category || 'General'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-600 mb-2">Assigned To</h4>
                  <p className="text-slate-900">{ticketDetails.ticket.assignee_name || 'Unassigned'}</p>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-200">
                <h4 className="text-sm font-semibold text-slate-600 mb-2">Description</h4>
                <p className="text-slate-700 whitespace-pre-wrap">{ticketDetails.ticket.description}</p>
              </div>
            </div>

            {/* Users Who Worked On */}
            {ticketDetails.usersWorkedOn.length > 0 && (
              <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-slate-200 p-6">
                <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-[var(--primary)]" />
                  Users Who Worked On This Ticket
                </h3>
                <div className="space-y-4">
                  {ticketDetails.usersWorkedOn.map(user => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] rounded-full flex items-center justify-center text-white font-bold">
                          {user.fullName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{user.fullName}</p>
                          <p className="text-sm text-slate-600">@{user.username} • {user.role}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            First activity: {formatDate(user.firstActivity)} • Last: {formatTimeAgo(user.lastActivity)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black text-[var(--primary)]">{user.activityCount}</div>
                        <div className="text-xs text-slate-500">activities</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-slate-200 p-6">
              <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-[var(--primary)]" />
                Complete Timeline
              </h3>
              {ticketDetails.timeline.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No timeline entries</p>
              ) : (
                <div className="space-y-4">
                  {ticketDetails.timeline.map((entry, index) => (
                    <div key={index} className="flex gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${
                        entry.visibility === 'public' ? 'bg-teal-600' : 'bg-[var(--primary)]'
                      }`}>
                        {entry.actor_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 bg-slate-50 rounded-lg p-4 border border-slate-200">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-semibold text-slate-900">{entry.actor_name}</p>
                            <p className="text-xs text-slate-500">{entry.actor_role}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-slate-700">{formatDate(entry.created_at)}</p>
                            <p className="text-xs text-slate-500">{formatTimeAgo(entry.created_at)}</p>
                          </div>
                        </div>
                        <p className="text-slate-700 whitespace-pre-wrap mt-2">{entry.message}</p>
                        <div className="flex items-center gap-2 mt-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            entry.action === 'CREATED' ? 'bg-blue-100 text-blue-700' :
                            entry.action === 'STATUS_CHANGE' ? 'bg-[var(--accent-green-light)] text-[var(--primary)]' :
                            entry.action === 'ESCALATED' ? 'bg-[var(--accent-green-light)] text-[var(--primary)]' :
                            entry.action === 'COMMENT' ? 'bg-green-100 text-green-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {entry.action.replace('_', ' ')}
                          </span>
                          {entry.visibility === 'public' && (
                            <span className="px-2 py-1 bg-teal-100 text-teal-800 rounded text-xs font-medium">
                              Visible to customer
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!ticketDetails && !loading && !error && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <Search className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">Search for a Ticket</h3>
            <p className="text-slate-600">Enter a ticket ID above to view complete details, timeline, and resolution metrics</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketSearch;
