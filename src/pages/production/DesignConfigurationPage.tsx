import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Save, Loader2, Settings2, Calculator, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  deleteDesignMaterial, getDesignMaterials, saveDesignMaterial, type DesignMaterial,
  getDesignEngineeringSettings, updateDesignEngineeringSettings, type DesignEngineeringSettings,
} from '@/api/project';
import { DESIGN_ENGINEERING_DEFAULTS } from '@/lib/designBom';

const blank = (): Omit<DesignMaterial, 'id'> => ({ material_name: '', unit: '', unit_price: 0, calculation_formula: '', is_primary_input: false, sort_order: 0 });

const RATIO_FIELDS: { key: keyof DesignEngineeringSettings; label: string; suffix?: string; step?: string }[] = [
  { key: 'pole_span_m', label: 'Pole Span Length', suffix: 'meters per pole', step: '1' },
  { key: 'bracket_ratio', label: 'Bracket Ratio', suffix: 'of usable poles need brackets', step: '0.01' },
  { key: 'tension_termination_allowance', label: 'Tension Termination Allowance', suffix: 'additional clamp offset', step: '1' },
  { key: 'steel_banding_ratio', label: 'Steel Banding Ratio', suffix: 'meters per usable pole', step: '0.01' },
  { key: 'buckle_ratio', label: 'Buckle Ratio', suffix: 'matching steel banding meters', step: '0.01' },
  { key: 'default_fat_allocation', label: 'Default FAT Allocation', suffix: 'terminal per route segment', step: '1' },
  { key: 'default_9m_replacement_poles', label: 'Default 9m Replacement Poles', suffix: 'poles', step: '1' },
  { key: 'default_11m_road_crossing_poles', label: 'Default 11m Road-Crossing Poles', suffix: 'poles', step: '1' },
  { key: 'default_duc_segment_m', label: 'Default Underground DUC Segment', suffix: 'meters', step: '1' },
];

const RATE_FIELDS: { key: keyof DesignEngineeringSettings; label: string; unit: string }[] = [
  { key: 'rate_adss_cable', label: 'ADSS Cable', unit: '/ meter' },
  { key: 'rate_duc_ducting', label: 'DUC Ducting', unit: '/ meter' },
  { key: 'rate_drop_cable', label: 'Drop Cable', unit: '/ meter' },
  { key: 'rate_bracket', label: 'Pole Brackets', unit: '/ pc' },
  { key: 'rate_clamp', label: 'Clamps (tension & suspension)', unit: '/ pc' },
  { key: 'rate_banding', label: 'Steel Banding', unit: '/ meter' },
  { key: 'rate_buckle', label: 'Buckles', unit: '/ pc' },
  { key: 'rate_fat', label: 'FAT (Fiber Access Terminal)', unit: '/ pc' },
  { key: 'rate_pole', label: 'Poles (usable, deadend, 9m, 11m)', unit: '/ pc' },
];

function EngineeringSettingsPanel() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<DesignEngineeringSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try { setSettings(await getDesignEngineeringSettings()); }
      catch (e: unknown) { toast({ title: 'Could not load engineering settings', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' }); }
      finally { setLoading(false); }
    })();
  }, [toast]);

  const set = (key: keyof DesignEngineeringSettings, value: string) =>
    setSettings((current) => (current ? { ...current, [key]: value === '' ? 0 : Number(value) } : current));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await updateDesignEngineeringSettings(settings);
      setSettings(updated);
      toast({ title: 'Engineering settings saved', description: 'The Design BOM calculator will use these values immediately.' });
    } catch (e: unknown) {
      toast({ title: 'Could not save settings', description: e instanceof Error ? e.message : 'Check the values and try again', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-12">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }
  if (!settings) return null;
  const s = settings;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] bg-gradient-to-r from-[var(--accent-green-light)] to-transparent px-5 py-3.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-green-light)]"><Calculator className="h-4.5 w-4.5 text-[var(--primary)]" /></span>
          <div>
            <h2 className="font-bold text-[var(--text-primary)]">Engineering Ratios</h2>
            <p className="text-xs text-[var(--text-secondary)]">Baseline formula rules the BOM calculator applies to every ADSS / Drop distance Design enters.</p>
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {RATIO_FIELDS.map((f) => (
            <label key={f.key} className="text-sm font-medium text-[var(--text-primary)]">
              {f.label}
              <Input className="mt-1" type="number" min="0" step={f.step || '0.01'} value={s[f.key]} onChange={(e) => set(f.key, e.target.value)} />
              {f.suffix && <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">{f.suffix}</span>}
            </label>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] bg-gradient-to-r from-[var(--accent-green-light)] to-transparent px-5 py-3.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-green-light)]"><Wallet className="h-4.5 w-4.5 text-[var(--primary)]" /></span>
          <div>
            <h2 className="font-bold text-[var(--text-primary)]">Unit Rates</h2>
            <p className="text-xs text-[var(--text-secondary)]">GH₵ per unit — multiplied against each calculated quantity for the total section budget.</p>
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {RATE_FIELDS.map((f) => (
            <label key={f.key} className="text-sm font-medium text-[var(--text-primary)]">
              {f.label}
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]">GH₵</span>
                <Input className="pl-11" type="number" min="0" step="0.01" value={s[f.key]} onChange={(e) => set(f.key, e.target.value)} />
              </div>
              <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">{f.unit}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
        <p className="text-xs text-[var(--text-muted)]">Defaults match the standard engineering spec (Pole Span {DESIGN_ENGINEERING_DEFAULTS.pole_span_m}m, Bracket Ratio {DESIGN_ENGINEERING_DEFAULTS.bracket_ratio}).</p>
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save engineering settings
        </Button>
      </div>
    </div>
  );
}

export default function DesignConfigurationPage() {
  const { toast } = useToast();
  const [materials, setMaterials] = useState<DesignMaterial[]>([]);
  const [editing, setEditing] = useState<DesignMaterial | Omit<DesignMaterial, 'id'> | null>(null);
  const [saving, setSaving] = useState(false);
  const load = async () => { try { setMaterials(await getDesignMaterials()); } catch (e: unknown) { toast({ title: 'Could not load design configuration', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' }); } };
  useEffect(() => { void load(); }, []);
  const update = (key: keyof Omit<DesignMaterial, 'id'>, value: string | number | boolean) => setEditing((current) => current ? { ...current, [key]: value } : current);
  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { id, ...payload } = editing as DesignMaterial;
      await saveDesignMaterial(payload, id);
      toast({ title: id ? 'Material updated' : 'Material added', description: 'The next Design request will use this configuration.' });
      setEditing(null); await load();
    } catch (e: unknown) { toast({ title: 'Could not save material', description: e instanceof Error ? e.message : 'Check the values and try again', variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  const remove = async (id: number) => { if (!window.confirm('Delete this material from future Design requests?')) return; try { await deleteDesignMaterial(id); await load(); } catch (e: unknown) { toast({ title: 'Could not delete material', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' }); } };

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]">
      <div className="flex gap-3"><Settings2 className="mt-1 h-6 w-6 text-[var(--primary)]" /><div><h1 className="text-2xl font-bold text-[var(--text-primary)]">Design Configuration</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Engineering ratios, unit rates and the legacy materials catalog used in Design requests.</p></div></div>
    </div>

    <EngineeringSettingsPanel />

    <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]">
      <div><h2 className="text-lg font-bold text-[var(--text-primary)]">Legacy Materials Catalog</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Older, freeform material list — the BOM calculator above is what Design requests actually use now.</p></div>
      <Button onClick={() => setEditing(blank())}><Plus className="mr-2 h-4 w-4" />Add material</Button>
    </div>
    {editing && <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
      <h2 className="mb-4 font-semibold text-[var(--text-primary)]">{'id' in editing ? 'Edit material' : 'New material'}</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium">Material name<Input className="mt-1" value={editing.material_name} onChange={(e) => update('material_name', e.target.value)} /></label>
        <label className="text-sm font-medium">Unit<Input className="mt-1" placeholder="meters, pcs, rolls" value={editing.unit} onChange={(e) => update('unit', e.target.value)} /></label>
        <label className="text-sm font-medium">Unit price (GHC)<Input className="mt-1" type="number" min="0" step="0.01" value={editing.unit_price} onChange={(e) => update('unit_price', Number(e.target.value))} /></label>
        <label className="text-sm font-medium">Order<Input className="mt-1" type="number" min="0" value={editing.sort_order} onChange={(e) => update('sort_order', Number(e.target.value))} /></label>
      </div>
      <label className="mt-4 block text-sm font-medium">Calculation formula <span className="font-normal text-[var(--text-muted)]">(for example: ADSS Distance / 64)</span><Input className="mt-1" value={editing.calculation_formula || ''} onChange={(e) => update('calculation_formula', e.target.value)} /></label>
      <label className="mt-4 flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={editing.is_primary_input} onChange={(e) => update('is_primary_input', e.target.checked)} />Primary input — the quantity the Design team enters manually</label>
      <div className="mt-5 flex gap-3"><Button disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save material</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div>
    </section>}
    <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]"><table className="w-full min-w-[760px] text-sm"><thead className="bg-[var(--surface-secondary)] text-left text-[var(--text-secondary)]"><tr><th className="px-4 py-3">Material</th><th className="px-4 py-3">Unit</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Formula / ratio</th><th className="px-4 py-3">Input</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-[var(--border)]">{materials.map((m) => <tr key={m.id}><td className="px-4 py-3 font-medium">{m.material_name}</td><td className="px-4 py-3">{m.unit}</td><td className="px-4 py-3">GH₵ {Number(m.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td className="px-4 py-3 font-mono text-xs">{m.calculation_formula || '—'}</td><td className="px-4 py-3">{m.is_primary_input ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">Primary</span> : '—'}</td><td className="px-4 py-3"><div className="flex gap-2"><Button size="icon" variant="ghost" onClick={() => setEditing(m)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-red-600" onClick={() => void remove(m.id)}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}{!materials.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-[var(--text-muted)]">No materials configured yet.</td></tr>}</tbody></table></div>
  </div>;
}
