// src/pages/customer/Dashboard.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerSidebar from '../../components/customer/CustomerSidebar';
import MobileBottomNav from '../../components/customer/MobileBottomNav';
import CustomerHeader from '../../components/customer/CustomerHeader';
import { API_URL } from '@/lib/api';
import { 
  FileText,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Sparkles,
  MessageSquare,
  Package,
  TrendingUp
} from 'lucide-react';
import { getCustomerTickets } from '../../api';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface CustomerData {
  id: number;
  customer_code: string;
  name: string;
  created_at: string;
  project: {
    id: number;
    code: string;
    name: string;
  };
}

interface Ticket {
  ticket_id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
}

const Dashboard: React.FC = () => {
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = localStorage.getItem('customer_token');
        if (!token) {
          navigate('/customer/login');
          return;
        }
        const res = await fetch(`${API_URL}/customer/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Session expired');
        const json = await res.json();
        setCustomer(json.customer || json);
      } catch (err) {
        localStorage.removeItem('customer_token');
        navigate('/customer/login');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [navigate]);

  useEffect(() => {
    if (!customer) return;

    const loadTickets = async () => {
      try {
        const data = await getCustomerTickets();
        setTickets(Array.isArray(data) ? data : data.tickets || []);
      } catch (err) {
        console.error('Failed to load tickets:', err);
      } finally {
        setLoadingTickets(false);
      }
    };
    loadTickets();
  }, [customer]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mx-auto mb-6" />
          <p className="text-xl text-gray-700 font-medium">Loading your support portal...</p>
        </div>
      </div>
    );
  }

  if (!customer) return null;

  const stats = {
    total: tickets.length,
    open: tickets.filter(t => ['NEW', 'OPEN'].includes((t.status || '').toUpperCase())).length,
    resolved: tickets.filter(t => (t.status || '').toUpperCase() === 'RESOLVED').length,
    closed: tickets.filter(t => (t.status || '').toUpperCase() === 'CLOSED').length,
  };

  // Premium StatCard Component
  interface StatCardProps {
    icon: React.ElementType;
    title: string;
    value: number | string;
    color: string;
    description?: string;
  }

  const StatCard: React.FC<StatCardProps> = ({ icon: Icon, title, value, description }, _i?: number) => (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-5 py-[18px] shadow-[var(--shadow-md)]"
      style={{ borderLeftWidth: 3, borderLeftColor: 'var(--accent-green)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{title}</p>
        <Icon className="h-5 w-5 text-[var(--accent-green)]" />
      </div>
      <p className="mt-2.5 text-2xl font-bold leading-none text-[var(--text-primary)]">{value}</p>
      {description && <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>}
    </div>
  );

  const getStatusConfig = (status: string) => {
    const upper = (status || '').toUpperCase();
    switch (upper) {
      case 'NEW': return { bg: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-5 w-5" />, label: 'New' };
      case 'OPEN': return { bg: 'bg-blue-100 text-blue-800', icon: <AlertCircle className="h-5 w-5" />, label: 'In Progress' };
      case 'RESOLVED': return { bg: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-5 w-5" />, label: 'Resolved' };
      case 'CLOSED': return { bg: 'bg-gray-100 text-gray-800', icon: <CheckCircle className="h-5 w-5" />, label: 'Closed' };
      default: return { bg: 'bg-gray-100 text-gray-700', icon: <Clock className="h-5 w-5" />, label: 'Pending' };
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 flex">
      <CustomerSidebar />
      <div className="flex-1 md:ml-64 pb-20 md:pb-0">
        <CustomerHeader name={customer.name} customer_code={customer.customer_code} heightClass="py-4" />

        {/* Proper spacing - no overlap */}
        <div className="pt-28 md:pt-32 lg:pt-36 px-4 md:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto space-y-8">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between relative">
              <div>
                <h1 className="text-3xl font-black text-gray-900 mb-1">Welcome back, {customer.name.split(' ')[0]}!</h1>
                <div className="w-32 h-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full mt-2"></div>
                <p className="text-gray-600 mt-3">Here's an overview of your support activity.</p>
              </div>
              <Sparkles className="absolute top-0 right-0 h-12 w-12 text-purple-400 opacity-30 animate-pulse" />
            </div>

            {/* Premium Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                icon={Package}
                title="Total Tickets"
                value={stats.total}
                color="from-indigo-500 to-indigo-600 bg-gradient-to-br"
                description="All time"
              />
              <StatCard
                icon={Clock}
                title="Open Tickets"
                value={stats.open}
                color="from-blue-500 to-blue-600 bg-gradient-to-br"
                description="Needs attention"
              />
              <StatCard
                icon={CheckCircle}
                title="Resolved"
                value={stats.resolved}
                color="from-green-500 to-green-600 bg-gradient-to-br"
                description="Successfully closed"
              />
              <StatCard
                icon={FileText}
                title="Closed"
                value={stats.closed}
                color="from-purple-500 to-purple-600 bg-gradient-to-br"
                description="Archived"
              />
            </div>

            {/* Project Card - Premium Style */}
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-[var(--shadow-md)] border border-white/30">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800 mb-3 flex items-center">
                    <Package className="h-7 w-7 mr-3 text-indigo-600" />
                    Your Project
                  </h2>
                  <h3 className="text-4xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    {customer.project.name}
                  </h3>
                  <p className="text-lg text-gray-600 mt-3">
                    Code: <span className="font-mono text-xl bg-gradient-to-r from-indigo-100 to-purple-100 px-4 py-2 rounded-lg">{customer.project.code}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Member since</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {new Date(customer.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                  </p>
                </div>
              </div>
            </div>

            {/* Recent Tickets */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-[var(--shadow-md)] border border-white/20">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2 text-indigo-600" />
                  Recent Tickets
                </h2>
                <Button 
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                  onClick={() => navigate('/customer/create-ticket')}
                >
                  <Plus className="h-4 w-4 mr-2" /> New Ticket
                </Button>
              </div>

              {loadingTickets ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-indigo-600 mx-auto mb-4" />
                  <p className="text-gray-600">Loading tickets...</p>
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <FileText className="h-12 w-12 text-indigo-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800 mb-3">All clear!</h3>
                  <p className="text-gray-600 mb-8">No tickets yet — everything is running smoothly.</p>
                  <Button className="bg-gradient-to-r from-indigo-600 to-purple-600">
                    <Plus className="h-5 w-5 mr-2" /> Create Ticket
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {tickets.slice(0, 5).map((ticket) => {
                    const statusConfig = getStatusConfig(ticket.status);
                    return (
                      <div
                        key={ticket.ticket_id}
                        onClick={() => navigate(`/customer/tickets/${ticket.ticket_id}`)}
                        className="group flex items-center p-5 rounded-xl bg-gradient-to-r from-gray-50 to-white border border-gray-200 shadow-[var(--shadow-md)] hover:shadow-lg hover:border-indigo-200 transition-all duration-300 cursor-pointer"
                      >
                        <div className={`p-3 rounded-xl ${statusConfig.bg} mr-4 shadow-sm group-hover:scale-110 transition-transform`}>
                          {statusConfig.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-mono font-semibold text-gray-700">#{ticket.ticket_id}</span>
                            <Badge className={`${statusConfig.bg} text-xs px-3 py-1`}>
                              {statusConfig.label}
                            </Badge>
                          </div>
                          <h3 className="font-medium text-gray-900 truncate">{ticket.title}</h3>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(ticket.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-2 transition-all" />
                      </div>
                    );
                  })}
                  {tickets.length > 5 && (
                    <div className="text-center pt-4">
                      <Button variant="outline" onClick={() => navigate('/customer/tickets')}>
                        View All Tickets ({tickets.length})
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Support Portal Info Card */}
            <div className="bg-white/90 backdrop-blur-md rounded-2xl p-8 shadow-[var(--shadow-md)] border border-white/30 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <MessageSquare className="h-9 w-9 text-indigo-600" />
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-6">
                Customer Support Portal
              </h2>
              <p className="text-gray-700 text-lg leading-relaxed max-w-3xl mx-auto mb-10">
                This portal helps you easily report issues, request support, and track progress from start to finish.
                <br /><br />
                Our team is here to ensure your services run smoothly, with clear updates every step of the way.
              </p>
              <div className="flex flex-col sm:flex-row gap-6 justify-center">
                <Button 
                  size="lg"
                  variant="outline"
                  className="border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 font-medium px-10 py-6 text-lg"
                  onClick={() => navigate('/customer/tickets')}
                >
                  View All Tickets
                  <ArrowRight className="h-5 w-5 ml-3" />
                </Button>
                <Button 
                  size="lg"
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 font-medium px-10 py-6 text-lg shadow-lg hover:shadow-xl"
                  onClick={() => navigate('/customer/create-ticket')}
                >
                  <Plus className="h-5 w-5 mr-3" />
                  Create New Ticket
                </Button>
              </div>
            </div>

          </div>
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default Dashboard;