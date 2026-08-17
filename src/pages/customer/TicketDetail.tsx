// src/pages/customer/TicketDetail.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Clock,
  AlertCircle,
  CheckCircle,
  User,
  Globe,
  Mail,
  Phone,
  Eye,
  Users,
  MessageCircle,
  ArrowRight,
  Image as ImageIcon,
  X,
  RefreshCw,
} from 'lucide-react';
import CustomerSidebar from '../../components/customer/CustomerSidebar';
import MobileBottomNav from '../../components/customer/MobileBottomNav';
import CustomerHeader from '../../components/customer/CustomerHeader';
import { getCustomerTicketDetail } from '../../api';
import { API_URL } from '@/lib/api';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Attachment {
  originalName: string;
  savedName: string;
  path: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

interface Ticket {
  ticket_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  source: 'portal' | 'email' | 'phone';
  created_at: string;
  project_name: string;
  customer_name: string;
  attachments?: Attachment[];
}

interface TimelineEntry {
  action: string;
  message: string;
  visibility: 'public' | 'internal';
  actor_role: string;
  created_at: string;
}

const TicketDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [customerProfile, setCustomerProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadData = async (isBackground = false) => {
    if (!id) return;

    if (!isBackground) setLoading(true);
    else setBackgroundRefreshing(true);

    try {
      const token = localStorage.getItem('customer_token');
      if (token && !customerProfile) {
        const res = await fetch(`${API_URL}/customer/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCustomerProfile(data.customer || data);
        }
      }

      const data = await getCustomerTicketDetail(id);
      console.log('Ticket data from API:', data);

      setTicket(data.ticket);

      const publicTimeline = (data.timeline || []).filter(
        (entry: TimelineEntry) => entry.visibility === 'public'
      );
      setTimeline(publicTimeline);
    } catch (err: any) {
      console.error('Failed to load ticket:', err);
      if (!isBackground) setError('Failed to load ticket');
    } finally {
      setLoading(false);
      setBackgroundRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();

    // Background refresh every 10 seconds
    const interval = setInterval(() => {
      loadData(true);
    }, 10000);

    return () => clearInterval(interval);
  }, [id]);

  // Debug logging for attachments
  useEffect(() => {
    if (ticket?.attachments?.length) {
      console.log('Attachment paths:', ticket.attachments.map(a => a.path));
      if (ticket.attachments[0]) {
        console.log('Example URL:', `/uploads/${ticket.attachments[0].path.replace(/\\/g, '/')}`);
      }
    }
  }, [ticket]);

  const getStatusBadge = (status: string) => {
    const upper = status.toUpperCase();
    const configs: Record<string, { icon: JSX.Element; bg: string; text: string; color: string }> = {
      NEW: { icon: <Clock className="h-3 w-3" />, bg: 'bg-yellow-100', text: 'New', color: 'text-yellow-800' },
      OPEN: { icon: <AlertCircle className="h-3 w-3" />, bg: 'bg-blue-100', text: 'In Progress', color: 'text-blue-800' },
      IN_PROGRESS: { icon: <AlertCircle className="h-3 w-3" />, bg: 'bg-blue-100', text: 'In Progress', color: 'text-blue-800' },
      RESOLVED: { icon: <CheckCircle className="h-3 w-3" />, bg: 'bg-green-100', text: 'Resolved', color: 'text-green-800' },
      CLOSED: { icon: <CheckCircle className="h-3 w-3" />, bg: 'bg-gray-100', text: 'Closed', color: 'text-gray-800' },
    };
    const config = configs[upper] || configs.NEW;
    return (
      <Badge className={`${config.bg} ${config.color} px-3 py-1.5 font-medium rounded-full flex items-center gap-1.5 text-xs`}>
        {config.icon}
        <span>{config.text}</span>
      </Badge>
    );
  };

  const getSourceIcon = (source: string) => {
    switch (source.toLowerCase()) {
      case 'portal': return <Globe className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'phone': return <Phone className="h-4 w-4" />;
      default: return <Globe className="h-4 w-4" />;
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

  const openImage = (fullUrl: string) => {
    setSelectedImage(fullUrl);
  };

  const closeImage = () => {
    setSelectedImage(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-4 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600 text-xs">Loading ticket...</p>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-sm text-center p-6">
          <FileText className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600 text-xs mb-4">{error || 'Ticket not found'}</p>
          <Button variant="outline" size="sm" onClick={() => navigate('/customer/tickets')}>
            <ArrowLeft className="h-3 w-3 mr-1" /> Back to Tickets
          </Button>
        </Card>
      </div>
    );
  }

  const statusSteps = ['New', 'In Progress', 'Resolved', 'Closed'];
  const statusMap = { NEW: 0, OPEN: 1, IN_PROGRESS: 1, RESOLVED: 2, CLOSED: 3 };
  const currentIndex = statusMap[ticket.status.toUpperCase() as keyof typeof statusMap] ?? 0;

  const baseUploadUrl = '/uploads/';

  return (
    <div className="min-h-screen bg-gray-50 flex text-xs">
      <CustomerSidebar />
      <div className="flex-1 md:ml-64 pb-20 md:pb-0">
        <CustomerHeader
          name={ticket.customer_name}
          customer_code={customerProfile?.customer_code || 'CUST-XXXX'}
          heightClass="py-3"
        />

        <div className="pt-16 md:pt-20 p-3 md:p-5 lg:p-6">
          <div className="max-w-5xl mx-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/customer/tickets')}
              className="mb-6 text-xs flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Back to Tickets
            </Button>

            {/* Banner */}
            <Card className="mb-5 border-l-4 border-indigo-500 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <img src="/vobiss-logo.png" alt="VOBISS" className="h-8" />
                      <h1 className="text-lg font-bold text-gray-900">Support Ticket</h1>
                    </div>
                    <p className="text-gray-600 text-xs flex items-center gap-2">
                      #{ticket.ticket_id} • {formatDateTime(ticket.created_at)}
                      {backgroundRefreshing && (
                        <span className="text-indigo-500 text-xs animate-pulse flex items-center gap-1">
                          <RefreshCw className="h-3 w-3 animate-spin" /> checking...
                        </span>
                      )}
                    </p>
                  </div>
                  <div>{getStatusBadge(ticket.status)}</div>
                </div>
              </CardHeader>
            </Card>

            {/* Status Progress */}
            <Card className="mb-5">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Status Progress
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
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shadow
                              ${isCompleted ? 'bg-green-500' : isActive ? 'bg-indigo-600' : 'bg-gray-300'}
                            `}
                          >
                            {isCompleted ? <CheckCircle className="h-5 w-5" /> : i + 1}
                          </div>
                          <span className={`mt-2 text-xs ${isActive ? 'font-bold text-indigo-700' : 'text-gray-600'}`}>
                            {step}
                          </span>
                        </div>
                        {i < statusSteps.length - 1 && (
                          <ArrowRight className={`h-5 w-5 mx-3 ${isCompleted ? 'text-green-500' : 'text-gray-300'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Info Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Ticket Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-gray-500">Submitted By</p>
                      <p className="font-medium">{ticket.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Project</p>
                      <p className="font-medium">{ticket.project_name}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Source</p>
                      <div className="flex items-center gap-2 mt-1">
                        {getSourceIcon(ticket.source)}
                        <span className="capitalize">{ticket.source}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-gray-500">Priority</p>
                      <p className="font-medium capitalize mt-1">{ticket.priority}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-gray-500">Title</p>
                      <p className="font-medium text-base mt-1">{ticket.title}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Ticket ID</span>
                    <span className="font-bold">#{ticket.ticket_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    <span className="font-medium">{statusSteps[currentIndex]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Priority</span>
                    <span className="font-medium capitalize">{ticket.priority}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Created</span>
                    <span>{formatDateTime(ticket.created_at)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Description */}
            <Card className="mb-5">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-50 rounded-lg p-5 border">
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap text-sm">
                    {ticket.description}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Attachments */}
            <Card className="mb-5">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Attachments
                </CardTitle>
              </CardHeader>
              <CardContent>
                {ticket.attachments && ticket.attachments.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {ticket.attachments.map((att, index) => {
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
                        console.log('[TicketDetail] Image URL:', imageUrl, 'from path:', att.path);
                        return (
                          <div
                            key={index}
                            className="relative group cursor-pointer rounded-lg overflow-hidden border border-gray-200 shadow-sm hover:shadow-md transition"
                            onClick={() => openImage(imageUrl)}
                          >
                            <img
                              src={imageUrl}
                              alt={att.originalName || 'Attachment'}
                              className="w-full h-32 object-cover"
                              loading="lazy"
                              onError={(e) => {
                                console.error('Image failed to load:', imageUrl);
                                (e.target as HTMLImageElement).src = '/placeholder.png';
                              }}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                              <span className="text-white text-xs font-medium px-2 text-center">
                                Click to enlarge
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 mt-1 truncate text-center">
                              {att.originalName}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <ImageIcon className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600 font-medium">No attachments uploaded</p>
                    <p className="text-gray-500 text-xs mt-1">Images will appear here when added</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Timeline */}
            {timeline.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Activity Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <div className="absolute left-5 top-10 bottom-6 w-0.5 bg-gray-200" />
                    <div className="space-y-7">
                      {timeline.map((entry, idx) => (
                        <div key={idx} className="relative flex gap-5">
                          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow z-10">
                            {idx === 0 ? <FileText className="h-5 w-5" /> : <User className="h-5 w-5" />}
                          </div>
                          <div className="flex-1 bg-white border rounded-lg p-4 shadow-[var(--shadow-md)]">
                            <div className="flex justify-between mb-2">
                              <p className="font-medium text-gray-900 text-xs">{entry.actor_role}</p>
                              <p className="text-xs text-gray-500">{formatDateTime(entry.created_at)}</p>
                            </div>
                            <p className="text-gray-700 text-sm leading-relaxed">{entry.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="text-center py-10">
                  <Clock className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">No updates yet</p>
                  <p className="text-gray-500 text-xs mt-1">We're reviewing your ticket. Check back soon.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={closeImage}
        >
          <button
            className="absolute top-6 right-6 text-white bg-gray-900/70 rounded-full p-3 hover:bg-gray-800"
            onClick={closeImage}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={selectedImage}
            alt="Full size attachment"
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <MobileBottomNav />
    </div>
  );
};

export default TicketDetail;