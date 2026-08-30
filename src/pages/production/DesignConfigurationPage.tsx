import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Save, Loader2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { deleteDesignMaterial, getDesignMaterials, saveDesignMaterial, type DesignMaterial } from '@/api/project';

const blank = (): Omit<DesignMaterial, 'id'> => ({ material_name: '', unit: '', unit_price: 0, calculation_formula: '', is_primary_input: false, sort_order: 0 });

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
      <div className="flex gap-3"><Settings2 className="mt-1 h-6 w-6 text-[var(--primary)]" /><div><h1 className="text-2xl font-bold text-[var(--text-primary)]">Design Configuration</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Set the materials, prices and calculation rules used in Design requests.</p></div></div>
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
