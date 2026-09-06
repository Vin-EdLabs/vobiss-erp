import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, Clock, ArrowUpRight } from 'lucide-react';
import { API_URL } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useSubmittedToast } from '@/hooks/useSubmittedToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReferenceBadge } from '@/components/transport/ReferenceBadge';
import { CopyRefButton } from '@/components/CopyRefButton';
import { formatOwnReference } from '@/lib/referenceRegistry';

interface VehicleRentalRequest {
  id: number;
  ref_no?: string;
  transport_request_id?: number | null;
  requester_name?: string | null;
  purpose?: string | null;
  status: string;
  current_stage?: string | null;
  created_at?: string;
  updated_at?: string;
  grand_total?: number;
  department?: string;
  reference_type?: string | null;
  reference_id?: number | null;
  reference_number?: string | null;
  reference_title?: string | null;
  reference_status?: string | null;
}

const statusStyles: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-800' },
  pending: { bg: 'bg-amber-100', text: 'text-amber-800' },
  pending_manager: { bg: 'bg-amber-100', text: 'text-amber-800' },
  approved: { bg: 'bg-sky-100', text: 'text-sky-800' },
  sent_to_finance: { bg: 'bg-sky-100', text: 'text-sky-800' },
  pending_finance: { bg: 'bg-sky-100', text: 'text-sky-800' },
  cash_issued: { bg: 'bg-blue-100', text: 'text-blue-800' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  rejected: { bg: 'bg-rose-100', text: 'text-rose-800' },
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  pending_manager: 'Pending',
  approved: 'Approved',
  sent_to_finance: 'Sent to Finance',
  pending_finance: 'Sent to Finance',
  cash_issued: 'Cash Issued',
  completed: 'Completed',
  rejected: 'Rejected',
};

export default function VehicleRentalRequestsListPage() {
  const { user } = useAuth();
  useSubmittedToast();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<VehicleRentalRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'approved_manager' | 'sent_finance' | 'cash_issued' | 'completed' | 'rejected'>('pending');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/transport/vehicle-requests`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      });

      if (!response.ok) {
        throw new Error('Failed to load vehicle rental requests');
      }

      const data = await response.json();
      setRequests(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Error loading data', description: err.message || 'Please try again.', variant: 'destructive' });
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) loadData();
  }, [user?.id]);

  const filteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return requests.filter((req) => {
      const status = (req.status || '').toLowerCase();
      let matchesTab = false;

      if (activeTab === 'pending') {
        matchesTab = status === 'pending' || status === 'pending_manager';
      } else if (activeTab === 'approved_manager') {
        matchesTab = status === 'approved' || status === 'sent_to_finance' || status === 'pending_finance';
      } else if (activeTab === 'sent_finance') {
        matchesTab = status === 'approved' || status === 'sent_to_finance' || status === 'pending_finance';
      } else if (activeTab === 'cash_issued') {
        matchesTab = status === 'cash_issued';
      } else if (activeTab === 'completed') {
        matchesTab = status === 'completed';
      } else if (activeTab === 'rejected') {
        matchesTab = status === 'rejected';
      }

      const matchesSearch =
        !term ||
        [req.ref_no, req.requester_name, req.purpose, String(req.transport_request_id)]
          .some((val) => (val || '').toLowerCase().includes(term));

      return matchesTab && matchesSearch;
    });
  }, [requests, searchTerm, activeTab]);

  const getStatusBadge = (status: string) => {
    const style = statusStyles[status] || statusStyles.draft;
    const label = statusLabels[status] || status;
    return { style, label };
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatGrandTotal = (total?: number) => {
    if (!total) return 'GHC 0.00';
    return `GHC ${Number(total).toFixed(2)}`;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="shrink-0 rounded-xl bg-amber-100 p-3 text-amber-700">
            <FileText className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Vehicle Rental Requests</h1>
            <p className="text-sm text-slate-500">Submit and manage vehicle rental requests</p>
          </div>
        </div>

        <Button onClick={() => navigate('/transport/new-rental-vehicle-request')} className="w-full bg-amber-600 hover:bg-amber-700 sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          New Rental Request
        </Button>
      </div>

      {/* Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Ref No., Requestor, Purpose, Linked Transport Request..."
            className="w-full pl-9"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full">
        <TabsList className="flex w-full justify-start gap-1 overflow-x-auto sm:grid sm:grid-cols-6 sm:justify-center sm:gap-0 sm:overflow-visible">
          <TabsTrigger value="pending" className="shrink-0 sm:shrink">
            Pending ({requests.filter((r) => r.status === 'pending_manager').length})
          </TabsTrigger>
          <TabsTrigger value="approved_manager" className="shrink-0 sm:shrink">
            Approved by Manager ({requests.filter((r) => r.status === 'pending_finance').length})
          </TabsTrigger>
          <TabsTrigger value="sent_finance" className="shrink-0 sm:shrink">
            Sent to Finance ({requests.filter((r) => r.status === 'pending_finance' || r.status === 'cash_issued').length})
          </TabsTrigger>
          <TabsTrigger value="cash_issued" className="shrink-0 sm:shrink">
            Cash Issued ({requests.filter((r) => r.status === 'cash_issued').length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="shrink-0 sm:shrink">
            Completed ({requests.filter((r) => r.status === 'completed' || r.status === 'cash_issued').length})
          </TabsTrigger>
          <TabsTrigger value="rejected" className="shrink-0 sm:shrink">
            Rejected ({requests.filter((r) => r.status === 'rejected').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500">Loading vehicle rental requests...</p>
            ) : filteredRequests.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500">No rental requests found in this status.</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="min-w-full divide-y divide-slate-200 text-left">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Ref No.</th>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Requestor</th>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Linked Transport Request</th>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Reference</th>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Purpose</th>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Grand Total (GHC)</th>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Date</th>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredRequests.map((request) => {
                        const { style, label } = getStatusBadge(request.status);
                        return (
                          <tr key={request.id} className="group hover:bg-slate-50">
                            <td className="px-6 py-4 font-semibold text-amber-700">
                              <span className="inline-flex items-center gap-1">
                                <Link to={`/transport/vehicle-rental-requests/${request.id}`} className="hover:underline flex items-center gap-1">
                                  {formatOwnReference('vehicle_request', request.id)} <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
                                </Link>
                                <span className="opacity-0 transition group-hover:opacity-100">
                                  <CopyRefButton value={formatOwnReference('vehicle_request', request.id)} size="sm" />
                                </span>
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                              {request.requester_name || '—'}
                              {request.department && <div className="text-xs text-slate-400">{request.department}</div>}
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-700">
                              {request.transport_request_id ? (
                                <Link to={`/transport-requests/${request.transport_request_id}`} className="text-blue-600 hover:underline">
                                  #{request.transport_request_id}
                                </Link>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-6 py-4"><ReferenceBadge reference={request} /></td>
                            <td className="px-6 py-4 text-sm text-slate-700 max-w-xs truncate">{request.purpose || '—'}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-900">{formatGrandTotal(request.grand_total)}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{formatDate(request.created_at)}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border ${style.bg} ${style.text}`}>
                                <Clock className="h-3.5 w-3.5" />
                                {label}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <Link to={`/transport/vehicle-rental-requests/${request.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-500">
                                <FileText className="h-4 w-4" /> View Details
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-slate-200 sm:hidden">
                  {filteredRequests.map((request) => {
                    const { style, label } = getStatusBadge(request.status);
                    return (
                      <Link
                        key={request.id}
                        to={`/transport/vehicle-rental-requests/${request.id}`}
                        className="block p-4 active:bg-slate-50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-amber-700">{formatOwnReference('vehicle_request', request.id)}</p>
                            <p className="truncate text-sm font-medium text-slate-700">{request.requester_name || '—'}</p>
                            <p className="truncate text-xs text-slate-500">{request.purpose || '—'}</p>
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border ${style.bg} ${style.text}`}>
                            <Clock className="h-3.5 w-3.5" />
                            {label}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-sm">
                          <span className="text-slate-500">{formatDate(request.created_at)}</span>
                          <span className="font-bold text-slate-900">{formatGrandTotal(request.grand_total)}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
