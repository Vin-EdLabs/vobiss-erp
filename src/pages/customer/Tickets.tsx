// src/pages/customer/Tickets.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle,
  Search,
} from 'lucide-react';
import CustomerSidebar from '../../components/customer/CustomerSidebar';
import MobileBottomNav from '../../components/customer/MobileBottomNav';
import CustomerHeader from '../../components/customer/CustomerHeader';
import { getCustomerTickets } from '../../api';
import { API_URL } from '@/lib/api';

interface Ticket {
  ticket_id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  project_name?: string;
  project_code?: string;
  customer_name?: string;
}

interface CustomerProfile {
  name: string;
  customer_code: string;
  project?: {
    name: string;
    code: string;
  };
}

const TicketsPage = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      try {
        const token = localStorage.getItem('customer_token');
        if (!token) {
          navigate('/customer/login');
          return;
        }

        let profileData: CustomerProfile | null = null;
        try {
          const profileRes = await fetch(`${API_URL}/customer/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (profileRes.ok) {
            const data = await profileRes.json();
            profileData = data.customer || data;
            setProfile(profileData);
          }
        } catch (err) {
          console.warn('Failed to load profile for header');
        }

        const rawTickets = await getCustomerTickets();
        let ticketList: any[] = [];
        if (Array.isArray(rawTickets)) {
          ticketList = rawTickets;
        } else if (rawTickets?.tickets) {
          ticketList = rawTickets.tickets;
        } else if (rawTickets?.data) {
          ticketList = rawTickets.data;
        }

        const normalizedTickets: Ticket[] = ticketList.map((item: any) => {
          let projectName = 'Unknown Project';
          let projectCode = '';

          if (item.project_name) {
            projectName = item.project_name;
          } else if (item.project?.name) {
            projectName = item.project.name;
            projectCode = item.project.code || '';
          } else if (item.project?.project_name) {
            projectName = item.project.project_name;
          }

          if (projectName === 'Unknown Project' && profileData?.project?.name) {
            projectName = profileData.project.name;
            projectCode = profileData.project.code || '';
          }

          return {
            ticket_id: item.ticket_id || item.id || 'UNKNOWN',
            title: item.title || 'No title',
            status: item.status || 'NEW',
            priority: (item.priority || 'normal').toLowerCase(),
            created_at: item.created_at || new Date().toISOString(),
            updated_at: item.updated_at || item.created_at || new Date().toISOString(),
            project_name: projectName,
            project_code: projectCode,
            customer_name: item.customer_name || profileData?.name || 'Customer',
          };
        });

        setTickets(normalizedTickets);
        setFilteredTickets(normalizedTickets);
      } catch (err: any) {
        console.error('Error loading tickets:', err);
        setError('Failed to load tickets. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [navigate]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredTickets(tickets);
      return;
    }
    const lower = searchTerm.toLowerCase();
    const filtered = tickets.filter(
      (ticket) =>
        ticket.ticket_id.toLowerCase().includes(lower) ||
        ticket.title.toLowerCase().includes(lower) ||
        ticket.project_name?.toLowerCase().includes(lower)
    );
    setFilteredTickets(filtered);
  }, [searchTerm, tickets]);

  const getStatusConfig = (status: string) => {
    switch (status.toUpperCase()) {
      case 'NEW':
        return { color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="w-4 h-4" /> };
      case 'OPEN':
        return { color: 'bg-blue-100 text-blue-800', icon: <AlertTriangle className="w-4 h-4" /> };
      case 'RESOLVED':
      case 'CLOSED':
        return { color: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-4 h-4" /> };
      default:
        return { color: 'bg-gray-100 text-gray-800', icon: <Clock className="w-4 h-4" /> };
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'urgent': return 'Urgent';
      case 'high': return 'High';
      case 'normal': return 'Normal';
      case 'low': return 'Low';
      default: return priority.charAt(0).toUpperCase() + priority.slice(1);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-xl text-gray-700">Loading your tickets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md">
          <FileText className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-3">Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-700 font-medium transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-gray-50 flex">
      <CustomerSidebar />
      <div className="flex-1 md:ml-64 pb-20 md:pb-0">
        <CustomerHeader
          name={profile?.name || 'Customer'}
          customer_code={profile?.customer_code || 'CUST-XXXXX'}
          heightClass="py-4"
        />

        <div className="pt-28 md:pt-32 lg:pt-36 px-4 md:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            {/* Title & Button */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">My Tickets</h1>
                <p className="text-gray-600 mt-1 text-sm md:text-base">
                  {filteredTickets.length} {filteredTickets.length === 1 ? 'ticket' : 'tickets'}
                </p>
              </div>
              <button
                onClick={() => navigate('/customer/create-ticket')}
                className="mt-4 md:mt-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-5 py-2.5 rounded-xl font-medium hover:shadow-lg transition flex items-center gap-2 text-sm"
              >
                <FileText className="w-4 h-4 md:w-5 md:h-5" />
                New Ticket
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by ID, title, or project..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white/80 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
              />
            </div>

            {/* Empty State */}
            {filteredTickets.length === 0 ? (
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-10 text-center">
                <FileText className="w-14 h-14 text-gray-300 mx-auto mb-4" />
                <p className="text-lg text-gray-600 font-medium">No tickets found</p>
                <p className="text-gray-500 mt-2 text-sm">
                  {searchTerm ? 'Try a different search term.' : 'Create your first ticket to get started!'}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop: Table */}
                <div className="hidden md:block bg-white rounded-2xl shadow-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Project</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Ticket ID</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Title</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Created</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Priority</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {filteredTickets.map((ticket) => {
                          const statusConfig = getStatusConfig(ticket.status);
                          return (
                            <tr
                              key={ticket.ticket_id}
                              onClick={() => navigate(`/customer/tickets/${ticket.ticket_id}`)}
                              className="hover:bg-indigo-50 transition cursor-pointer"
                            >
                              <td className="px-6 py-5 text-sm font-medium text-gray-900">
                                <div>
                                  {ticket.project_name}
                                  {ticket.project_code && <span className="text-gray-500 text-xs ml-2 font-mono">({ticket.project_code})</span>}
                                </div>
                              </td>
                              <td className="px-6 py-5 text-sm font-mono text-indigo-600 font-semibold">{ticket.ticket_id}</td>
                              <td className="px-6 py-5 text-sm text-gray-900 max-w-md">
                                <div className="truncate pr-4">{ticket.title}</div>
                              </td>
                              <td className="px-6 py-5 text-sm text-gray-600">{formatDate(ticket.created_at)}</td>
                              <td className="px-6 py-5">
                                <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                                  {statusConfig.icon}
                                  {ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1).toLowerCase()}
                                </span>
                              </td>
                              <td className="px-6 py-5 text-sm font-medium text-gray-700">{getPriorityBadge(ticket.priority)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile: Compact Cards */}
                <div className="md:hidden space-y-4">
                  {filteredTickets.map((ticket) => {
                    const statusConfig = getStatusConfig(ticket.status);
                    return (
                      <div
                        key={ticket.ticket_id}
                        onClick={() => navigate(`/customer/tickets/${ticket.ticket_id}`)}
                        className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer border border-gray-100"
                      >
                        <div className="p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="text-xs text-gray-500 font-medium">{ticket.project_name}</p>
                              <p className="font-mono text-indigo-600 font-bold text-lg">{ticket.ticket_id}</p>
                            </div>
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                              {statusConfig.icon}
                              {ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1).toLowerCase()}
                            </span>
                          </div>
                          <h3 className="font-semibold text-gray-900 text-base line-clamp-2 mb-2">{ticket.title}</h3>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Created {formatDate(ticket.created_at)}</span>
                            <span className="font-medium text-gray-700">{getPriorityBadge(ticket.priority)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default TicketsPage;