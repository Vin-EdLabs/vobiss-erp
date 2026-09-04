import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark, Package, DollarSign, Plus, Trash2, Loader2, AlertCircle, Shield, Truck } from 'lucide-react';
import { getUsers, getRealmApprovers, updateRealmApprovers, type User } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';

type Kind = 'material' | 'cash' | 'transport' | 'transport_supervisor' | 'vehicle' | 'finance';

const RealmPage = () => {
  const { user, isAdminSuper } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [materialIds, setMaterialIds] = useState<number[]>([]);
  const [cashIds, setCashIds] = useState<number[]>([]);
  const [transportIds, setTransportIds] = useState<number[]>([]);
  const [transportSupervisorIds, setTransportSupervisorIds] = useState<number[]>([]);
  const [vehicleIds, setVehicleIds] = useState<number[]>([]);
  const [financeIds, setFinanceIds] = useState<number[]>([]);
  const [materialPick, setMaterialPick] = useState('');
  const [cashPick, setCashPick] = useState('');
  const [transportPick, setTransportPick] = useState('');
  const [transportSupervisorPick, setTransportSupervisorPick] = useState('');
  const [vehiclePick, setVehiclePick] = useState('');
  const [financePick, setFinancePick] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<'CW' | 'PTEL'>('CW');

  useEffect(() => {
    const role = String(user?.main_role || user?.role || '').trim().toLowerCase();
    const canManage = isAdminSuper || ['admin', 'superadmin'].includes(role);
    if (!canManage) {
      navigate('/');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, user, isAdminSuper, selectedCompany]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [userRows, realm] = await Promise.all([
        getUsers(),
        getRealmApprovers(isAdminSuper ? selectedCompany : undefined),
      ]);
      setUsers((userRows || []).filter((u: any) => !isAdminSuper || (u.company || 'CW') === selectedCompany));
      setMaterialIds(realm.material_user_ids || []);
      setCashIds(realm.cash_user_ids || []);
      setTransportIds(realm.transport_approver_ids || []);
      setTransportSupervisorIds(realm.transport_supervisor_ids || []);
      setVehicleIds(realm.vehicle_request_approver_ids || []);
      setFinanceIds(realm.finance_user_ids || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Realm');
    } finally {
      setLoading(false);
    }
  };

  const byId = useMemo(() => {
    const map = new Map<number, User>();
    users.forEach((u) => map.set(Number(u.id), u));
    return map;
  }, [users]);

  const labelFor = (id: number) => {
    const u = byId.get(Number(id));
    if (!u) return `User #${id}`;
    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
    const extra = [u.position, u.unit].filter(Boolean).join(' · ');
    return extra ? `${name} — ${extra}` : name;
  };

  const available = (kind: Kind) => {
    const taken = new Set(
      kind === 'material'
        ? materialIds
        : kind === 'cash'
          ? cashIds
          : kind === 'transport'
            ? transportIds
            : kind === 'transport_supervisor'
              ? transportSupervisorIds
              : kind === 'vehicle'
                ? vehicleIds
                : financeIds
    );
    return users.filter((u) => !taken.has(Number(u.id)));
  };

  const persist = async (
    nextMaterial: number[],
    nextCash: number[],
    nextTransport: number[] = transportIds,
    nextTransportSupervisor: number[] = transportSupervisorIds,
    nextVehicle: number[] = vehicleIds,
    nextFinance: number[] = financeIds,
  ) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await updateRealmApprovers({
        material_user_ids: nextMaterial,
        cash_user_ids: nextCash,
        transport_approver_ids: nextTransport,
        transport_supervisor_ids: nextTransportSupervisor,
        vehicle_request_approver_ids: nextVehicle,
        finance_user_ids: nextFinance,
      }, isAdminSuper ? selectedCompany : undefined);
      setMaterialIds(saved.material_user_ids || nextMaterial);
      setCashIds(saved.cash_user_ids || nextCash);
      setTransportIds(saved.transport_approver_ids || nextTransport);
      setTransportSupervisorIds(saved.transport_supervisor_ids || nextTransportSupervisor);
      setVehicleIds(saved.vehicle_request_approver_ids || nextVehicle);
      setFinanceIds(saved.finance_user_ids || nextFinance);
      setSuccess('Realm saved. Approval lists for Material, Cash, Transport, Vehicle, and Finance are updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save Realm');
    } finally {
      setSaving(false);
    }
  };

  const addPerson = (kind: Kind) => {
    const raw =
      kind === 'material'
        ? materialPick
        : kind === 'cash'
          ? cashPick
          : kind === 'transport'
            ? transportPick
            : kind === 'transport_supervisor'
              ? transportSupervisorPick
              : kind === 'vehicle'
                ? vehiclePick
                : financePick;
    const id = Number(raw);
    if (!id) return;

    if (kind === 'material') {
      if (materialIds.includes(id)) return;
      setMaterialPick('');
      persist([...materialIds, id], cashIds, transportIds, transportSupervisorIds, vehicleIds, financeIds);
    } else if (kind === 'cash') {
      if (cashIds.includes(id)) return;
      setCashPick('');
      persist(materialIds, [...cashIds, id], transportIds, transportSupervisorIds, vehicleIds, financeIds);
    } else if (kind === 'transport') {
      if (transportIds.includes(id)) return;
      setTransportPick('');
      persist(materialIds, cashIds, [...transportIds, id], transportSupervisorIds, vehicleIds, financeIds);
    } else if (kind === 'transport_supervisor') {
      if (transportSupervisorIds.includes(id)) return;
      setTransportSupervisorPick('');
      persist(materialIds, cashIds, transportIds, [...transportSupervisorIds, id], vehicleIds, financeIds);
    } else if (kind === 'vehicle') {
      if (vehicleIds.includes(id)) return;
      setVehiclePick('');
      persist(materialIds, cashIds, transportIds, transportSupervisorIds, [...vehicleIds, id], financeIds);
    } else {
      if (financeIds.includes(id)) return;
      setFinancePick('');
      persist(materialIds, cashIds, transportIds, transportSupervisorIds, vehicleIds, [...financeIds, id]);
    }
  };

  const removePerson = (kind: Kind, id: number) => {
    if (kind === 'material') persist(materialIds.filter((x) => x !== id), cashIds, transportIds, transportSupervisorIds, vehicleIds, financeIds);
    else if (kind === 'cash') persist(materialIds, cashIds.filter((x) => x !== id), transportIds, transportSupervisorIds, vehicleIds, financeIds);
    else if (kind === 'transport') persist(materialIds, cashIds, transportIds.filter((x) => x !== id), transportSupervisorIds, vehicleIds, financeIds);
    else if (kind === 'transport_supervisor') persist(materialIds, cashIds, transportIds, transportSupervisorIds.filter((x) => x !== id), vehicleIds, financeIds);
    else if (kind === 'vehicle') persist(materialIds, cashIds, transportIds, transportSupervisorIds, vehicleIds.filter((x) => x !== id), financeIds);
    else persist(materialIds, cashIds, transportIds, transportSupervisorIds, vehicleIds, financeIds.filter((x) => x !== id));
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  const column = (kind: Kind) => {
    const ids =
      kind === 'material'
        ? materialIds
        : kind === 'cash'
          ? cashIds
          : kind === 'transport'
            ? transportIds
            : kind === 'transport_supervisor'
              ? transportSupervisorIds
              : kind === 'vehicle'
                ? vehicleIds
                : financeIds;
    const pick =
      kind === 'material'
        ? materialPick
        : kind === 'cash'
          ? cashPick
          : kind === 'transport'
            ? transportPick
            : kind === 'transport_supervisor'
              ? transportSupervisorPick
              : kind === 'vehicle'
                ? vehiclePick
                : financePick;
    const setPick =
      kind === 'material'
        ? setMaterialPick
        : kind === 'cash'
          ? setCashPick
          : kind === 'transport'
            ? setTransportPick
            : kind === 'transport_supervisor'
              ? setTransportSupervisorPick
              : kind === 'vehicle'
                ? setVehiclePick
                : setFinancePick;
    const Icon =
      kind === 'material'
        ? Package
        : kind === 'cash'
          ? DollarSign
          : kind === 'transport'
            ? Shield
            : kind === 'transport_supervisor'
              ? Shield
              : kind === 'vehicle'
                ? Truck
                : Landmark;
    const title =
      kind === 'material'
        ? 'Material Approvals'
        : kind === 'cash'
          ? 'Cash Approvals'
          : kind === 'transport'
            ? 'Transport Approvers'
            : kind === 'transport_supervisor'
              ? 'Transport Supervisors'
              : kind === 'vehicle'
                ? 'Vehicle Request Approvers'
                : 'Finance Users';
    const hint =
      kind === 'material'
        ? 'People who can approve or reject material requests assigned to them.'
        : kind === 'cash'
          ? 'People who can approve or reject cash requests assigned to them.'
          : kind === 'transport'
            ? 'People who can approve transport requests before the supervisor step.'
            : kind === 'transport_supervisor'
              ? 'People who can final approve transport requests and close the workflow.'
              : kind === 'vehicle'
                ? 'Manager/HR approvers for vehicle request forms before finance.'
                : 'Users who can approve vehicle cash issuance and release payment.';

    return (
      <section className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-secondary)] px-6 py-4">
          <Icon className="h-5 w-5 text-[var(--primary)]" />
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
            <p className="text-xs text-[var(--text-muted)]">{hint}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-4 p-6">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]"
            >
              <option value="">Select a user…</option>
              {available(kind).map((u) => (
                <option key={u.id} value={u.id}>
                  {`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username}
                  {u.position ? ` · ${u.position}` : ''}
                </option>
              ))}
            </select>
            <Button type="button" disabled={!pick || saving} onClick={() => addPerson(kind)}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
          {ids.length === 0 ? (
            <p className="rounded-[var(--radius)] border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
              No one added yet. Pick a user and click Add.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)] rounded-[var(--radius)] border border-[var(--border)]">
              {ids.map((id) => (
                <li key={id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{labelFor(id)}</span>
                  <button
                    type="button"
                    onClick={() => removePerson(kind, id)}
                    disabled={saving}
                    className="rounded-[var(--radius-sm)] p-2 text-[var(--danger)] hover:bg-[var(--accent-red-light)]"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Landmark className="mt-0.5 h-9 w-9 text-[var(--primary)]" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Realm</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Choose who can approve material and cash requests. Unit and position do not matter. Added to Material only
              → Material Approvals. Added to Cash only → Cash Approvals. Added to both → both. Directors, Finance, and
              Issuers keep their existing access.
            </p>
          </div>
        </div>
        {isAdminSuper && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-[var(--text-muted)]">Company</label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value as 'CW' | 'PTEL')}
              className="h-9 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]"
            >
              <option value="CW">C&amp;W</option>
              <option value="PTEL">PTEL</option>
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-[var(--radius)] border border-[var(--danger)] bg-[var(--accent-red-light)] p-4 text-sm text-[var(--danger-text)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--accent-green-light)] p-4 text-sm text-[var(--success-text)]">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {column('material')}
        {column('cash')}
        {column('transport')}
        {column('transport_supervisor')}
        {column('vehicle')}
        {column('finance')}
      </div>
    </div>
  );
};

export default RealmPage;
