import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, FileText, ShieldCheck, Truck, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getRealmApprovers, getTransportRequests, type TransportRequest } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '@/components/ui/button';

const statusStyles: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 border border-rose-200',
};

export default function TransportSupervisorDashboard() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<TransportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSupervisor, setIsSupervisor] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [allRequests, realm] = await Promise.all([getTransportRequests(), getRealmApprovers()]);
      const supervisorIds = (realm.transport_supervisor_ids || []).map(Number).filter(Boolean);
      const role = String(user?.main_role || user?.role || '').toLowerCase();
      const isAllowed = ['admin', 'superadmin', 'system_admin'].includes(role) || supervisorIds.includes(Number(user?.id));
      setIsSupervisor(isAllowed);
      setRequests(allRequests);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.id, user?.role, user?.main_role]);

  const summary = useMemo(() => {
    return {
      total: requests.length,
      pending: requests.filter((item) => item.status === 'pending').length,
      approved: requests.filter((item) => item.status === 'approved').length,
      rejected: requests.filter((item) => item.status === 'rejected').length,
      awaitingSupervisor: requests.filter((item) => item.status === 'pending' && item.current_stage === 'supervisor').length,
    };
  }, [requests]);

  const queue = useMemo(
    () => requests.filter((item) => item.status === 'pending' || item.status === 'approved').slice(0, 12),
    [requests]
  );

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading transport dashboard…</div>;
  }

  if (!isSupervisor) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          You do not have supervisor access for the transport workflow.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-100 p-3 text-amber-700 shadow-sm">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Transport</p>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
            <Link to="/transport-approvals">View approvals</Link>
          </Button>
          <Button asChild className="bg-amber-600 hover:bg-amber-700">
            <Link to="/transport-request">New transport request</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Total</span>
            <Truck className="h-4 w-4 text-slate-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">{summary.total}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Pending</span>
            <Clock3 className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">{summary.pending}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Awaiting review</span>
            <ShieldCheck className="h-4 w-4 text-sky-600" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">{summary.awaitingSupervisor}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Approved</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">{summary.approved}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Rejected</span>
            <XCircle className="h-4 w-4 text-rose-600" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">{summary.rejected}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
            <span className="text-sm font-semibold text-slate-700">Transport queue</span>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm">{queue.length} items</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Request</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Requester</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Site</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {queue.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-500">No transport requests found.</td>
                  </tr>
                ) : (
                  queue.map((request) => (
                    <tr key={request.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-semibold text-slate-900">#{request.id}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">{request.requester_name}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">{request.site_name}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[request.status] || statusStyles.pending}`}>
                          {request.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Link to={`/transport-requests/${request.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-500">
                            <FileText className="h-4 w-4" /> Review
                          </Link>
                          {request.status === 'approved' && (
                            <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700">
                              <Link to={`/transport/vehicle-request/${request.id}`}>
                                Vehicle form <ArrowRight className="ml-1 h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800">Quick actions</h2>
            <div className="mt-4 space-y-3">
              <Link to="/transport-request" className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700 transition hover:border-amber-300 hover:bg-amber-50">
                <span>Submit new transport request</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/transport-approvals" className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700 transition hover:border-amber-300 hover:bg-amber-50">
                <span>Open approval queue</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-amber-50 via-white to-slate-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-700">Workflow</p>
            <ol className="mt-4 space-y-3 text-sm text-slate-700">
              <li className="flex items-start gap-3"><span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-[10px] font-bold text-white">1</span> Request submitted by any user</li>
              <li className="flex items-start gap-3"><span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-[10px] font-bold text-white">2</span> First approval by configured approvers</li>
              <li className="flex items-start gap-3"><span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-[10px] font-bold text-white">3</span> Supervisor review and vehicle form creation</li>
              <li className="flex items-start gap-3"><span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-[10px] font-bold text-white">4</span> Finance issues cash after final approval</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
