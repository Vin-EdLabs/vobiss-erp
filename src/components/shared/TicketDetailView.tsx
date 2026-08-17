// src/components/shared/TicketDetailView.tsx
import React from 'react';
import {
  Clock,
  AlertCircle,
  CheckCircle,
  User,
  Calendar,
  Globe,
  Mail,
  Phone,
  FileText,
  MessageCircle,
  ArrowRight,
  Building2,
  Eye,
  Users,
} from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Ticket {
  ticket_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  source?: 'portal' | 'email' | 'phone';
  created_at: string;
  project_name: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
}

interface TimelineEntry {
  action: string;
  message: string;
  visibility: 'public' | 'internal';
  actor_role: string;
  created_at: string;
}

interface TicketDetailViewProps {
  ticket: Ticket;
  timeline: TimelineEntry[];
  mode: 'customer' | 'staff'; // Controls visibility of internal notes
}

const TicketDetailView: React.FC<TicketDetailViewProps> = ({ ticket, timeline, mode }) => {
  const getStatusBadge = (status: string) => {
    const upper = status.toUpperCase();
    const configs: Record<string, { icon: JSX.Element; bg: string; text: string; color: string }> = {
      NEW: { icon: <Clock className="h-4 w-4" />, bg: 'bg-yellow-100', text: 'New', color: 'text-yellow-800' },
      OPEN: { icon: <AlertCircle className="h-4 w-4" />, bg: 'bg-blue-100', text: 'In Progress', color: 'text-blue-800' },
      IN_PROGRESS: { icon: <AlertCircle className="h-4 w-4" />, bg: 'bg-blue-100', text: 'In Progress', color: 'text-blue-800' },
      RESOLVED: { icon: <CheckCircle className="h-4 w-4" />, bg: 'bg-green-100', text: 'Resolved', color: 'text-green-800' },
      CLOSED: { icon: <CheckCircle className="h-4 w-4" />, bg: 'bg-gray-100', text: 'Closed', color: 'text-gray-800' },
    };
    const config = configs[upper] || configs.NEW;
    return (
      <Badge className={`${config.bg} ${config.color} px-4 py-2 font-medium rounded-full flex items-center gap-2`}>
        {config.icon}
        <span>{config.text}</span>
      </Badge>
    );
  };

  const getSourceIcon = (source?: string) => {
    if (!source) return <Globe className="h-5 w-5" />;
    switch (source.toLowerCase()) {
      case 'portal': return <Globe className="h-5 w-5" />;
      case 'email': return <Mail className="h-5 w-5" />;
      case 'phone': return <Phone className="h-5 w-5" />;
      default: return <Globe className="h-5 w-5" />;
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const statusSteps = ['New', 'In Progress', 'Resolved', 'Closed'];
  const statusMap = { NEW: 0, OPEN: 1, IN_PROGRESS: 1, RESOLVED: 2, CLOSED: 3 };
  const currentIndex = statusMap[ticket.status.toUpperCase() as keyof typeof statusMap] ?? 0;

  // Filter timeline: staff sees everything, customer only sees public
  const visibleTimeline = mode === 'staff' 
    ? timeline 
    : timeline.filter(entry => entry.visibility === 'public');

  return (
    <div className="space-y-6">
      {/* Banner */}
      <Card className="border-l-4 border-indigo-500">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{ticket.title}</h1>
              <p className="text-gray-600 mt-1">#{ticket.ticket_id} • {formatDateTime(ticket.created_at)}</p>
            </div>
            <div className="flex-shrink-0">
              {getStatusBadge(ticket.status)}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Status Progress Tracker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center">
            <Eye className="h-5 w-5 mr-2 text-gray-500" />
            Ticket Status Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            {statusSteps.map((step, i) => {
              const isCompleted = i < currentIndex;
              const isActive = i === currentIndex;
              return (
                <div key={step} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold shadow-lg
                      ${isCompleted ? 'bg-green-500' : isActive ? 'bg-indigo-600' : 'bg-gray-300'}
                    `}>
                      {isCompleted ? <CheckCircle className="h-7 w-7" /> : i + 1}
                    </div>
                    <span className={`mt-3 text-sm font-medium
                      ${isCompleted ? 'text-green-700' : isActive ? 'text-indigo-700' : 'text-gray-500'}
                    `}>
                      {step}
                    </span>
                  </div>
                  {i < statusSteps.length - 1 && (
                    <div className="flex-1 flex items-center justify-center mx-4">
                      <ArrowRight className={`h-6 w-6 ${isCompleted ? 'text-green-500' : 'text-gray-300'}`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Info + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="h-5 w-5 mr-2 text-gray-500" />
              Ticket Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-500">Submitted By</p>
                <p className="font-semibold">{ticket.customer_name}</p>
                {(ticket.customer_email || ticket.customer_phone) && (
                  <div className="mt-2 space-y-1 text-sm text-gray-600">
                    {ticket.customer_email && <div className="flex items-center gap-2"><Mail className="h-4 w-4" />{ticket.customer_email}</div>}
                    {ticket.customer_phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4" />{ticket.customer_phone}</div>}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm text-gray-500">Project</p>
                <p className="font-semibold flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-gray-500" />
                  {ticket.project_name}
                </p>
              </div>
              {ticket.source && (
                <div>
                  <p className="text-sm text-gray-500">Source</p>
                  <p className="font-semibold flex items-center gap-2 mt-1">
                    {getSourceIcon(ticket.source)}
                    <span className="capitalize">{ticket.source}</span>
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500">Priority</p>
                <p className="font-semibold capitalize mt-1">{ticket.priority}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="h-5 w-5 mr-2 text-gray-500" />
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-500">Ticket ID</span>
              <span className="font-bold">#{ticket.ticket_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className="font-semibold">{statusSteps[currentIndex]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Priority</span>
              <span className="font-bold capitalize">{ticket.priority}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Created</span>
              <span className="font-medium">{formatDateTime(ticket.created_at)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <MessageCircle className="h-5 w-5 mr-2 text-gray-500" />
            Description
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 rounded-xl p-6 border">
            <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
              {ticket.description || 'No description provided.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      {visibleTimeline.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="h-5 w-5 mr-2 text-gray-500" />
              Activity Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="absolute left-6 top-12 bottom-8 w-0.5 bg-gray-300" />
              <div className="space-y-8">
                {visibleTimeline.map((entry, idx) => (
                  <div key={idx} className="relative flex gap-6">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md z-10">
                      {idx === 0 ? <FileText className="h-6 w-6" /> : <User className="h-6 w-6" />}
                    </div>
                    <div className={`flex-1 pb-8 ${entry.visibility === 'internal' ? 'opacity-75' : ''}`}>
                      <div className="bg-white border rounded-xl p-6 shadow-[var(--shadow-md)]">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold text-gray-900 capitalize">{entry.actor_role}</p>
                            <p className="text-sm text-gray-500 mt-1">{formatDateTime(entry.created_at)}</p>
                          </div>
                          {entry.visibility === 'internal' && mode === 'staff' && (
                            <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-full">
                              Internal Note
                            </span>
                          )}
                        </div>
                        <p className="text-gray-700 leading-relaxed">{entry.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-xl text-gray-600 font-medium">No activity yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TicketDetailView;