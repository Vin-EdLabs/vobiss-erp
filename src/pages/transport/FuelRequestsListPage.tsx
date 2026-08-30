import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Fuel, Plus, Search, CheckCircle2, Clock3, XCircle, FileText, ArrowUpRight, Check } from 'lucide-react';
import {
  getFuelRequests,
  createFuelRequest,
  getFuelRequestReferences,
  getTransportSettings,
  type FuelRequest,
  type FuelRequestReference,
} from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useSubmittedToast } from '@/hooks/useSubmittedToast';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReferenceBadge } from '@/components/transport/ReferenceBadge';
import { PersonName } from '@/components/PersonName';
import { CopyRefButton } from '@/components/CopyRefButton';

export default function FuelRequestsListPage() {
  const { user } = useAuth();
  useSubmittedToast();
  const { toast } = useToast();
  const [requests, setRequests] = useState<FuelRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'awaiting_receipt' | 'completed' | 'rejected'>('pending');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form State
  const [projects, setProjects] = useState<FuelRequestReference[]>([]);
  const [tickets, setTickets] = useState<FuelRequestReference[]>([]);
  const [pricePerLitre, setPricePerLitre] = useState<number | null>(null);
  const [refSearch, setRefSearch] = useState('');
  const [showRefDropdown, setShowRefDropdown] = useState(false);
  const [selectedRef, setSelectedRef] = useState<FuelRequestReference | null>(null);

  const [vehiclePlate, setVehiclePlate] = useState('');
  const [fuelType, setFuelType] = useState<'Petrol' | 'Diesel'>('Petrol');
  const [quantity, setQuantity] = useState<string>('');
  const [manualEstimatedAmount, setManualEstimatedAmount] = useState<string>('');
  const [purpose, setPurpose] = useState('');

  const calculatedEstimatedAmount = useMemo(() => {
    const qty = Number(quantity || 0);
    if (pricePerLitre && pricePerLitre > 0 && qty > 0) {
      return (qty * pricePerLitre).toFixed(2);
    }
    return manualEstimatedAmount;
  }, [quantity, pricePerLitre, manualEstimatedAmount]);

  const allReferences = useMemo(() => [...projects, ...tickets], [projects, tickets]);

  const filteredReferences = useMemo(() => {
    if (!refSearch.trim()) return allReferences;
    const q = refSearch.toLowerCase();
    return allReferences.filter(
      (item) => item.ref.toLowerCase().includes(q) || item.title.toLowerCase().includes(q)
    );
  }, [allReferences, refSearch]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [list, refs, settings] = await Promise.all([
        getFuelRequests(),
        getFuelRequestReferences().catch(() => ({ projects: [], tickets: [] })),
        getTransportSettings().catch(() => ({}) as any),
      ]);
      setRequests(list || []);
      setProjects(refs.projects || []);
      setTickets(refs.tickets || []);
      if (settings.price_per_litre && Number(settings.price_per_litre) > 0) {
        setPricePerLitre(Number(settings.price_per_litre));
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Error loading data', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [user?.id]);

  const filteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return requests.filter((req) => {
      const status = (req.status || '').toLowerCase();
      let matchesTab = false;

      if (activeTab === 'pending') {
        matchesTab = status === 'pending';
      } else if (activeTab === 'approved') {
        matchesTab = status.includes('approved') && !status.includes('cash');
      } else if (activeTab === 'awaiting_receipt') {
        matchesTab = status.includes('cash issued') || status.includes('awaiting receipt') || status.includes('receipt submitted');
      } else if (activeTab === 'completed') {
        matchesTab = status.includes('completed');
      } else if (activeTab === 'rejected') {
        matchesTab = status.includes('rejected');
      }

      const matchesSearch =
        !term ||
        [req.ref_no, req.requester_name, req.vehicle_plate, req.fuel_type, req.project_ticket_ref, req.purpose]
          .some((val) => (val || '').toLowerCase().includes(term));

      return matchesTab && matchesSearch;
    });
  }, [requests, searchTerm, activeTab]);

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehiclePlate.trim()) {
      toast({ title: 'Missing Field', description: 'Please enter vehicle plate number.', variant: 'destructive' });
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast({ title: 'Invalid Quantity', description: 'Please enter a valid fuel quantity in litres.', variant: 'destructive' });
      return;
    }
    const estAmount = Number(calculatedEstimatedAmount);
    if (!Number.isFinite(estAmount) || estAmount <= 0) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid estimated amount.', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      const res = await createFuelRequest({
        project_ticket_ref: selectedRef ? selectedRef.ref : refSearch.trim() || undefined,
        project_id: selectedRef?.type === 'project' ? selectedRef.id : null,
        ticket_id: selectedRef?.type === 'ticket' ? selectedRef.id : null,
        vehicle_plate: vehiclePlate.trim(),
        fuel_type: fuelType,
        quantity_litres: qty,
        estimated_amount: estAmount,
        purpose: purpose.trim(),
      });

      toast({ title: 'Fuel Request Submitted', description: `Request ${res.ref_no} submitted for approval.`, variant: 'default' });
      setIsFormOpen(false);
      setVehiclePlate('');
      setQuantity('');
      setManualEstimatedAmount('');
      setPurpose('');
      setSelectedRef(null);
      setRefSearch('');
      await loadData();
    } catch (err: any) {
      toast({ title: 'Submission Failed', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-100 p-3 text-amber-700">
            <Fuel className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Fuel Requests</h1>
            <p className="text-sm text-slate-500">Submit and track your vehicle fuel requests.</p>
          </div>
        </div>

        <Button onClick={() => setIsFormOpen((prev) => !prev)} className="bg-amber-600 hover:bg-amber-700">
          <Plus className="mr-2 h-4 w-4" />
          {isFormOpen ? 'Close Form' : 'New Fuel Request'}
        </Button>
      </div>

      {/* Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Ref No., Requester, Vehicle Plate, Project/Ticket..."
            className="w-full pl-9"
          />
        </div>
      </div>

      {/* Inline Creation Form */}
      {isFormOpen && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">
            Create fuel request
          </div>
          <form onSubmit={submitForm} className="p-5 md:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Requester Name</span>
                <input
                  value={user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'User' : ''}
                  readOnly
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-slate-700"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Department / Unit</span>
                <input
                  value={user?.unit || (user as any)?.department || 'Operations'}
                  readOnly
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-slate-700"
                />
              </label>

              {/* Project / Ticket Reference Dropdown */}
              <div className="relative md:col-span-2 space-y-2">
                <span className="text-sm font-medium text-slate-700">Project / Ticket Reference (Optional)</span>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search and select existing project or ticket..."
                    value={selectedRef ? selectedRef.ref : refSearch}
                    onChange={(e) => {
                      setSelectedRef(null);
                      setRefSearch(e.target.value);
                      setShowRefDropdown(true);
                    }}
                    onFocus={() => setShowRefDropdown(true)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
                {showRefDropdown && filteredReferences.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto p-1">
                    {filteredReferences.map((item) => (
                      <div
                        key={`${item.type}-${item.id}`}
                        onClick={() => {
                          setSelectedRef(item);
                          setRefSearch(item.ref);
                          setShowRefDropdown(false);
                        }}
                        className="p-2 hover:bg-amber-50 rounded-lg cursor-pointer flex items-center justify-between text-sm"
                      >
                        <div>
                          <span className="font-semibold text-slate-800">{item.ref}</span>
                          <span className="ml-2 text-xs text-slate-400 uppercase">({item.type})</span>
                        </div>
                        {selectedRef?.id === item.id && <Check className="h-4 w-4 text-amber-600" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Vehicle Plate Number *</span>
                <input
                  required
                  placeholder="e.g. GR-4029-23"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-amber-500 focus:outline-none"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Fuel Type *</span>
                <select
                  value={fuelType}
                  onChange={(e) => setFuelType(e.target.value as 'Petrol' | 'Diesel')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-amber-500 focus:outline-none bg-white"
                >
                  <option value="Petrol">Petrol</option>
                  <option value="Diesel">Diesel</option>
                </select>
              </label>

              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Quantity Requested (Litres) *</span>
                <input
                  type="number"
                  required
                  min="0.1"
                  step="0.1"
                  placeholder="e.g. 50"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-amber-500 focus:outline-none"
                />
              </label>

              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Estimated Amount (GHC) *</span>
                {pricePerLitre ? (
                  <div>
                    <input
                      readOnly
                      value={calculatedEstimatedAmount ? `GHC ${calculatedEstimatedAmount}` : 'GHC 0.00'}
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 font-semibold text-slate-800"
                    />
                    <p className="text-xs text-amber-700 mt-1">Auto-calculated at GHC {pricePerLitre.toFixed(2)}/L</p>
                  </div>
                ) : (
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    placeholder="Enter estimated amount in GHC"
                    value={manualEstimatedAmount}
                    onChange={(e) => setManualEstimatedAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-amber-500 focus:outline-none"
                  />
                )}
              </label>

              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                <span>Purpose / Notes</span>
                <textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  rows={3}
                  placeholder="Describe the purpose of the fuel request..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-amber-500 focus:outline-none"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-amber-600 hover:bg-amber-700">
                {saving ? 'Submitting…' : 'Submit Fuel Request'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="pending">
            Pending ({requests.filter((r) => r.status.toLowerCase() === 'pending').length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved ({requests.filter((r) => r.status.toLowerCase().includes('approved') && !r.status.toLowerCase().includes('cash')).length})
          </TabsTrigger>
          <TabsTrigger value="awaiting_receipt">
            Awaiting Receipt ({requests.filter((r) => r.status.toLowerCase().includes('cash issued') || r.status.toLowerCase().includes('awaiting receipt') || r.status.toLowerCase().includes('receipt submitted')).length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({requests.filter((r) => r.status.toLowerCase().includes('completed')).length})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected ({requests.filter((r) => r.status.toLowerCase().includes('rejected')).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Ref No.</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Requester</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Vehicle Plate</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Fuel & Qty</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Est. Amount</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Reference</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">Loading fuel requests...</td>
                    </tr>
                  ) : filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">No fuel requests found in this status.</td>
                    </tr>
                  ) : (
                    filteredRequests.map((request) => (
                      <tr key={request.id} className="group hover:bg-slate-50">
                        <td className="px-6 py-4 font-semibold text-amber-700">
                          <span className="inline-flex items-center gap-1">
                            <Link to={`/transport/fuel-requests/${request.id}`} className="hover:underline flex items-center gap-1">
                              {request.ref_no} <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
                            </Link>
                            <span className="opacity-0 transition group-hover:opacity-100">
                              <CopyRefButton value={request.ref_no} size="sm" />
                            </span>
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                          <PersonName value={request.requester_name} />
                          {request.department && <div className="text-xs text-slate-400">{request.department}</div>}
                        </td>
                        <td className="px-6 py-4 text-sm font-mono font-medium text-slate-700">{request.vehicle_plate}</td>
                        <td className="px-6 py-4 text-sm text-slate-700">
                          {request.fuel_type} ({request.quantity_litres} L)
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-900">
                          GHC {Number(request.estimated_amount).toFixed(2)}
                        </td>
                        <td className="px-6 py-4"><ReferenceBadge reference={request} /></td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                            request.status.toLowerCase().includes('completed')
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : request.status.toLowerCase().includes('rejected')
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : request.status.toLowerCase().includes('cash') || request.status.toLowerCase().includes('receipt')
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : request.status.toLowerCase().includes('approved')
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            <Clock3 className="h-3.5 w-3.5" />
                            {request.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Link to={`/transport/fuel-requests/${request.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-500">
                            <FileText className="h-4 w-4" /> View Details
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
