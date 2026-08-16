import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark, Package, DollarSign, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { getUsers, getRealmApprovers, updateRealmApprovers, type User } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';

type Kind = 'material' | 'cash';

const RealmPage = () => {
  const { user, isAdminSuper } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [materialIds, setMaterialIds] = useState<number[]>([]);
  const [cashIds, setCashIds] = useState<number[]>([]);
  const [materialPick, setMaterialPick] = useState('');
  const [cashPick, setCashPick] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const role = String(user?.main_role || user?.role || '').trim().toLowerCase();
    const canManage = isAdminSuper || ['admin', 'superadmin'].includes(role);
    if (!canManage) {
      navigate('/');
      return;
    }
    load();
  }, [navigate, user, isAdminSuper]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [userRows, realm] = await Promise.all([getUsers(), getRealmApprovers()]);
      setUsers(userRows || []);
      setMaterialIds(realm.material_user_ids || []);
      setCashIds(realm.cash_user_ids || []);
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
    const taken = new Set(kind === 'material' ? materialIds : cashIds);
    return users.filter((u) => !taken.has(Number(u.id)));
  };

  const persist = async (nextMaterial: number[], nextCash: number[]) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await updateRealmApprovers({
        material_user_ids: nextMaterial,
        cash_user_ids: nextCash,
      });
      setMaterialIds(saved.material_user_ids || nextMaterial);
      setCashIds(saved.cash_user_ids || nextCash);
      setSuccess('Realm saved. Each person sees only the list they were added to (Material, Cash, or both). They may need to refresh once.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save Realm');
    } finally {
      setSaving(false);
    }
  };

  const addPerson = (kind: Kind) => {
    const raw = kind === 'material' ? materialPick : cashPick;
    const id = Number(raw);
    if (!id) return;
    if (kind === 'material') {
      if (materialIds.includes(id)) return;
      setMaterialPick('');
      persist([...materialIds, id], cashIds);
    } else {
      if (cashIds.includes(id)) return;
      setCashPick('');
      persist(materialIds, [...cashIds, id]);
    }
  };

  const removePerson = (kind: Kind, id: number) => {
    if (kind === 'material') persist(materialIds.filter((x) => x !== id), cashIds);
    else persist(materialIds, cashIds.filter((x) => x !== id));
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  const column = (kind: Kind) => {
    const ids = kind === 'material' ? materialIds : cashIds;
    const pick = kind === 'material' ? materialPick : cashPick;
    const setPick = kind === 'material' ? setMaterialPick : setCashPick;
    const Icon = kind === 'material' ? Package : DollarSign;
    const title = kind === 'material' ? 'Material Approvals' : 'Cash Approvals';
    const hint =
      kind === 'material'
        ? 'People who can approve or reject material requests assigned to them.'
        : 'People who can approve or reject cash requests assigned to them.';

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
      <div className="mb-6 flex items-start gap-3">
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
      </div>
    </div>
  );
};

export default RealmPage;
