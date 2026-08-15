import React, { useEffect, useState } from 'react';
import { Layers, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  getProjectUnits,
  createProjectUnit,
  type ProjectUnit,
} from '@/api/project';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { vobiAmbientStore } from '@/stores/vobiAmbientStore';

export default function ProductionUnitsPage() {
  const { user, isAdminSuper } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [units, setUnits] = useState<ProjectUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [unitStage, setUnitStage] = useState<string>('project');
  const [saving, setSaving] = useState(false);

  const role = String(user?.main_role || user?.role || '').trim().toLowerCase();
  const isAdmin = isAdminSuper || ['admin', 'superadmin'].includes(role);

  useEffect(() => {
    vobiAmbientStore.getState().setFormHint('unit-group-create');
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    load();
  }, [isAdmin, navigate]);

  const load = async () => {
    try {
      setLoading(true);
      setUnits(await getProjectUnits());
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to load units',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createProjectUnit({
        name: name.trim(),
        unit_stage: unitStage,
      });
      setName('');
      toast({ title: 'Unit created' });
      await load();
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Layers className="h-8 w-8 text-[var(--primary)]" />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--primary)]">Service Requests</p>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Service Request Units</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Manage workflow units (TS, IP, NOC, Project units)
          </p>
        </div>
      </div>

      <form
        onSubmit={handleCreate}
        className="mb-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)]"
      >
        <h2 className="mb-4 font-semibold text-[var(--text-primary)]">Add unit</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            placeholder="Unit name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select value={unitStage} onValueChange={setUnitStage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Project Unit</SelectItem>
              <SelectItem value="ts">TS (Transmission)</SelectItem>
              <SelectItem value="ip">IP</SelectItem>
              <SelectItem value="noc">NOC</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add unit
          </Button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-secondary)] text-left text-[var(--text-secondary)]">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {units.map((u) => (
              <tr key={u.id} className="hover:bg-[var(--surface-hover)]">
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{u.name}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{u.slug}</td>
                <td className="px-4 py-3 capitalize">{u.unit_stage}</td>
                <td className="px-4 py-3">{u.is_active ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
