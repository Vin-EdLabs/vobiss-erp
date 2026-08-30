import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Banknote, CheckCircle2, Clock3, HandCoins, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getFuelRequests, getTransportRequests, getVehicleRequestForm, getTransportSettings, type FuelRequest, type TransportRequest } from '../../api';
import { useToast } from '@/hooks/use-toast';

export default function FinanceDashboardPage() {
  const { toast } = useToast();
  const [fuelRequests, setFuelRequests] = useState<FuelRequest[]>([]);
  const [transportRequests, setTransportRequests] = useState<TransportRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [fuel, transport, settings] = await Promise.all([
          getFuelRequests({ finance_queue: true }),
          getTransportRequests(),
          getTransportSettings().catch(() => ({}) as any),
        ]);
        setFuelRequests(Array.isArray(fuel) ? fuel : []);
        setTransportRequests(Array.isArray(transport) ? transport : []);
      } catch (error: any) {
        toast({ title: 'Unable to load dashboard', description: error.message || 'Please try again.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const metrics = useMemo(() => {
    const pendingFuel = fuelRequests.filter((item) => item.current_stage === 'finance_cash' || item.current_stage === 'awaiting_receipt').length;
    const pendingVehicle = transportRequests.filter((item) => item.status === 'approved').length;
    const approvedFuel = fuelRequests.filter((item) => /(approved|completed)/i.test(String(item.status))).length;
    return {
      pendingFuel,
      pendingVehicle,
      approvedFuel,
      total: pendingFuel + pendingVehicle + approvedFuel,
    };
  }, [fuelRequests, transportRequests]);

  const quickLinks = [
    { label: 'Finance cash queue', path: '/transport/finance-queue', icon: HandCoins },
    { label: 'Fuel cash & receipts', path: '/finance/fuel-requests', icon: Banknote },
    { label: 'Approval history', path: '/finance/approval-history', icon: CheckCircle2 },
  ];

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading finance dashboard…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Finance</p>
          <h1 className="text-3xl font-bold text-slate-900">Finance Dashboard</h1>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
          <ShieldCheck className="h-4 w-4" /> Ready for review
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500"><span>Pending fuel</span><Clock3 className="h-4 w-4" /></div>
          <p className="mt-3 text-3xl font-bold text-slate-900">{metrics.pendingFuel}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500"><span>Vehicle queue</span><HandCoins className="h-4 w-4" /></div>
          <p className="mt-3 text-3xl font-bold text-slate-900">{metrics.pendingVehicle}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500"><span>Approved fuel</span><CheckCircle2 className="h-4 w-4" /></div>
          <p className="mt-3 text-3xl font-bold text-slate-900">{metrics.approvedFuel}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500"><span>Total items</span><Banknote className="h-4 w-4" /></div>
          <p className="mt-3 text-3xl font-bold text-slate-900">{metrics.total}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">Quick actions</h2>
          <div className="mt-4 space-y-3">
            {quickLinks.map(({ label, path, icon: Icon }) => (
              <Link key={path} to={path} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50">
                <span className="flex items-center gap-2"><Icon className="h-4 w-4" /> {label}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-emerald-50 via-white to-slate-50 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">Finance queue snapshot</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            <li className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3"><span>Fuel requests</span><strong>{fuelRequests.length}</strong></li>
            <li className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3"><span>Transport requests</span><strong>{transportRequests.length}</strong></li>
            <li className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3"><span>Awaiting cash</span><strong>{metrics.pendingFuel}</strong></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
