import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Fuel, ArrowLeft, Send, Users } from 'lucide-react';
import { createFuelRequest, getRequestApproverIds, getTransportSettings, getWorkflowConfig, getUserDirectory } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import ReferencePicker from '@/components/transport/ReferencePicker';
import { referencePayload, type LinkedReference } from '@/lib/referenceLink';
import { ReferenceLinkPicker } from '@/components/references/ReferenceLinkPicker';
import type { ReferenceSummary } from '@/lib/referenceRegistry';

export default function FuelRequestFormPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const fieldWorkLinks = (location.state as { fieldWorkLinks?: ReferenceSummary[] } | null)?.fieldWorkLinks;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pricePerLitre, setPricePerLitre] = useState<number | null>(null);

  const [approvers, setApprovers] = useState<Array<{ id: number; fullName: string; username?: string }>>([]);
  const [selectedApproverIds, setSelectedApproverIds] = useState<number[]>([]);
  const [linkedReference, setLinkedReference] = useState<LinkedReference | null>(null);
  const [referenceError, setReferenceError] = useState('');
  const [requireReference, setRequireReference] = useState(false);
  const [linkedReferences, setLinkedReferences] = useState<ReferenceSummary[]>(fieldWorkLinks || []);

  const [vehiclePlate, setVehiclePlate] = useState('');
  const [fuelType, setFuelType] = useState<'Petrol' | 'Diesel'>('Petrol');
  const [quantity, setQuantity] = useState<string>('');
  const [manualEstimatedAmount, setManualEstimatedAmount] = useState<string>('');
  const [purpose, setPurpose] = useState('');

  const nowString = useMemo(() => new Date().toLocaleString(), []);

  const requesterName = useMemo(() => {
    if (user?.fullName) return user.fullName;
    const name = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
    return name || user?.username || 'Current User';
  }, [user]);

  const departmentName = user?.unit || (user as any)?.department || 'Transport / Operations';

  useEffect(() => {
    const loadInitData = async () => {
      try {
        setLoading(true);
        const [settings, realm, workflow, users] = await Promise.all([
          getTransportSettings().catch(() => ({}) as any),
          getRequestApproverIds().catch(() => ({ transport_approver_ids: [], fuel_request_approver_ids: [] } as any)),
          getWorkflowConfig().catch(() => ({ transport: { approver_ids: [], fuel_request_approver_ids: [] } } as any)),
          getUserDirectory().catch(() => []),
        ]);

        setRequireReference(Boolean(workflow?.transport?.require_reference_link_fuel || settings.require_reference_link_fuel));
        const realmApproverIds = [...new Set([...(realm?.transport_approver_ids || []), ...(realm?.fuel_request_approver_ids || [])])];
        const workflowApproverIds = [...new Set([...(workflow?.transport?.approver_ids || []), ...(workflow?.transport?.fuel_request_approver_ids || [])])];
        const candidateIds = [...new Set([...realmApproverIds, ...workflowApproverIds])].map(Number).filter(Boolean);
        const peopleById = new Map((users || []).map((person: any) => [Number(person.id), person]));
        const userMap = candidateIds.flatMap((id) => {
          const person = peopleById.get(id);
          if (!person) return [];
          return [{
            id,
            fullName: `${person.first_name || ''} ${person.last_name || ''}`.trim() || person.username || 'User',
            username: person.username,
          }];
        });
        setApprovers(userMap);
        setSelectedApproverIds([]);
        if (settings.price_per_litre && Number(settings.price_per_litre) > 0) {
          setPricePerLitre(Number(settings.price_per_litre));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    void loadInitData();
  }, []);

  const calculatedEstimatedAmount = useMemo(() => {
    const qty = Number(quantity || 0);
    if (pricePerLitre && pricePerLitre > 0 && qty > 0) {
      return (qty * pricePerLitre).toFixed(2);
    }
    return manualEstimatedAmount;
  }, [quantity, pricePerLitre, manualEstimatedAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehiclePlate.trim()) {
      toast({ title: 'Validation Error', description: 'Please enter vehicle plate number.', variant: 'destructive' });
      return;
    }
    if (requireReference && !linkedReference && linkedReferences.length === 0) {
      setReferenceError('Select a ticket, project, or material request before submitting.');
      toast({ title: 'Reference required', description: 'Link this request to an existing record.', variant: 'destructive' });
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast({ title: 'Validation Error', description: 'Please enter a valid fuel quantity (litres).', variant: 'destructive' });
      return;
    }

    const estAmount = Number(calculatedEstimatedAmount);
    if (!Number.isFinite(estAmount) || estAmount <= 0) {
      toast({ title: 'Validation Error', description: 'Please enter a valid estimated amount.', variant: 'destructive' });
      return;
    }
    if (!selectedApproverIds.length) {
      toast({ title: 'Approval required', description: 'Select at least one approver from the Realm list.', variant: 'destructive' });
      return;
    }

    try {
      setSubmitting(true);
      const res = await createFuelRequest({
        project_ticket_ref: linkedReference?.number,
        project_id: linkedReference?.type === 'project' ? linkedReference.id : null,
        ticket_id: linkedReference?.type === 'ticket' ? linkedReference.id : null,
        vehicle_plate: vehiclePlate.trim(),
        fuel_type: fuelType,
        quantity_litres: qty,
        estimated_amount: estAmount,
        purpose: purpose.trim(),
        selected_approver_ids: selectedApproverIds,
        ...referencePayload(linkedReference),
        linked_references: linkedReferences.map((ref) => ({ type: ref.type, id: ref.id })),
      });

      toast({
        title: 'Fuel Request Submitted',
        description: `Request ${res.ref_no} has been submitted for approval.`,
        variant: 'default',
      });

      navigate('/transport/fuel-requests', { state: { submitted: true } });
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'Submission Failed',
        description: err.message || 'Failed to submit fuel request.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6 space-y-6">
      {/* Top Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/transport/fuel-requests')}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Fuel Request</h1>
          <p className="text-sm text-slate-500">Fill in the fuel request details for vehicle refueling.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        {/* Auto-filled Section */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Requester Information (Auto-filled)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-slate-500 text-xs block">Requester Name</span>
              <span className="font-semibold text-slate-800">{requesterName}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs block">Department / Unit</span>
              <span className="font-semibold text-slate-800">{departmentName}</span>
            </div>
            <div>
              <span className="text-slate-500 text-xs block">Date & Time Submitted</span>
              <span className="font-semibold text-slate-800">{nowString}</span>
            </div>
          </div>
        </div>

        <ReferencePicker
          value={linkedReference}
          onChange={(next) => {
            setLinkedReference(next);
            setReferenceError('');
          }}
          required={requireReference}
          error={referenceError}
        />

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <ReferenceLinkPicker
            value={linkedReferences}
            onChange={setLinkedReferences}
            required={requireReference && !linkedReference}
            hint="Link this fuel request to at least one Ticket, Material Request, Cash Request, Transport Request, or Service Request."
          />
        </div>

        {/* Form Fields Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Vehicle Plate Number */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Vehicle Plate Number <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. GR-4029-23"
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
            />
          </div>

          {/* Fuel Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Fuel Type <span className="text-rose-500">*</span>
            </label>
            <select
              value={fuelType}
              onChange={(e) => setFuelType(e.target.value as 'Petrol' | 'Diesel')}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none bg-white"
            >
              <option value="Petrol">Petrol</option>
              <option value="Diesel">Diesel</option>
            </select>
          </div>

          {/* Quantity Requested */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Quantity Requested (Litres) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              required
              min="0.1"
              step="0.1"
              placeholder="e.g. 50"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
            />
          </div>

          {/* Estimated Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Estimated Amount (GHC) <span className="text-rose-500">*</span>
            </label>
            {pricePerLitre ? (
              <div>
                <input
                  type="text"
                  readOnly
                  value={calculatedEstimatedAmount ? `GHC ${calculatedEstimatedAmount}` : 'GHC 0.00'}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-slate-800 text-sm outline-none cursor-not-allowed"
                />
                <p className="text-xs text-amber-700 mt-1">
                  Auto-calculated based on GHC {pricePerLitre.toFixed(2)} / litre.
                </p>
              </div>
            ) : (
              <div>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  placeholder="Enter estimated amount in GHC"
                  value={manualEstimatedAmount}
                  onChange={(e) => setManualEstimatedAmount(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Manual entry allowed as no standard price per litre is configured in settings.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Purpose / Notes */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Purpose / Notes
          </label>
          <textarea
            rows={3}
            placeholder="Explain the purpose of this fuel request (e.g., generator refuel at site, vehicle trip to site)..."
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="w-full p-4 rounded-xl border border-slate-200 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none resize-none"
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Users className="h-4 w-4 text-amber-600" /> Select approvers from Realm
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {approvers.length === 0 ? (
              <p className="text-sm text-slate-500">No transport approvers are configured for fuel requests yet.</p>
            ) : (
              approvers.map((approver) => {
                const checked = selectedApproverIds.includes(approver.id);
                return (
                  <label key={approver.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <span>{approver.fullName}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setSelectedApproverIds((prev) => checked ? prev.filter((id) => id !== approver.id) : [...prev, approver.id])}
                      className="h-4 w-4 accent-amber-600"
                    />
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => navigate('/transport/fuel-requests')}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || loading}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 rounded-xl shadow-sm transition"
          >
            <Send className="h-4 w-4" />
            {submitting ? 'Submitting...' : 'Submit Fuel Request'}
          </button>
        </div>
      </form>
    </div>
  );
}
