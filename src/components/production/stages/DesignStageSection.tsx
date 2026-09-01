import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DetailCard, InfoField, InfoGrid } from '@/components/production/production-ui';
import { AttachmentZone } from '@/components/production/AttachmentZone';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GHANA_REGIONS } from '@/lib/lookups';
import { useToast } from '@/hooks/use-toast';
import {
  getDesignMaterials, submitDesignRequest, uploadProjectRequestAttachment,
  type ProjectRequest, type DesignMaterial,
} from '@/api/project';

const imageFile = (file: File) => file.type.startsWith('image/');
const money = (value: number) => `GH₵ ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function calculate(formula: string | null | undefined, primaryName: string, base: number) {
  if (!formula) return 0;
  const expression = formula.replace(new RegExp(primaryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), String(base)).replace(/,/g, '');
  if (!/^[\d.\s+\-*/()%]+$/.test(expression)) return 0;
  try { const result = Function(`"use strict"; return (${expression})`)(); return Number.isFinite(result) ? Math.max(0, Number(result)) : 0; } catch { return 0; }
}

/** Read-only display of whatever Design already submitted — used once this stage is done.
 *  Shows everything Design entered, including distances/KM and their own attachments — nothing
 *  they filled in disappears once the card collapses. */
export function DesignReadOnlySummary({ request }: { request: ProjectRequest }) {
  const materials = request.design_materials || [];
  const total = materials.reduce((sum, item) => sum + Number(item.line_cost ?? item.quantity * item.unit_price), 0);
  const designAttachments = (request.attachments || []).filter((a) => a.stage === 'design');
  return (
    <div className="space-y-4">
      <InfoGrid>
        <InfoField label="ISP" value={request.isp} />
        <InfoField label="Survey date" value={request.survey_date ? new Date(request.survey_date).toLocaleDateString() : undefined} />
        <InfoField label="Reference" value={request.design_reference} />
        <InfoField label="Cable distance" value={request.cable_displacement} />
        <InfoField label="ADSS distance" value={request.adss} />
        <InfoField label="Drop cable distance" value={request.drop_cable} />
      </InfoGrid>
      {request.design_specification && (
        <p className="whitespace-pre-wrap rounded-lg bg-[var(--surface-secondary)] p-3 text-sm text-[var(--text-body)]">{request.design_specification}</p>
      )}
      {materials.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-[var(--text-muted)]"><tr><th className="pb-2">Material</th><th className="pb-2">Quantity</th><th className="pb-2">Unit price</th><th className="pb-2 text-right">Line cost</th></tr></thead>
            <tbody>
              {materials.map((item) => (
                <tr key={item.id || item.material_name} className="border-t border-[var(--border)]">
                  <td className="py-2.5 font-medium">{item.material_name}</td>
                  <td className="py-2.5">{item.quantity} {item.unit}</td>
                  <td className="py-2.5">{money(Number(item.unit_price))}</td>
                  <td className="py-2.5 text-right">{money(Number(item.line_cost ?? item.quantity * item.unit_price))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-[var(--border-strong)]"><td colSpan={3} className="pt-3 text-right font-bold">Grand total</td><td className="pt-3 text-right font-bold text-[var(--primary)]">{money(total)}</td></tr></tfoot>
          </table>
        </div>
      )}
      <AttachmentZone attachments={designAttachments} allowUpload={false} />
    </div>
  );
}

/** Editable — Design fills the survey + material request inline, then sends it back to Sales. */
export function DesignStageSection({
  request, canEdit, canUpload, onUpdated,
}: {
  request: ProjectRequest;
  canEdit: boolean;
  canUpload: boolean;
  onUpdated: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [materials, setMaterials] = useState<DesignMaterial[]>([]);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    site_name: request.site_name || '', location: request.location || '', isp: request.isp || '',
    region: request.region || '', survey_date: request.survey_date?.slice(0, 10) || '',
    design_specification: request.design_specification || '', design_reference: request.design_reference || '',
    cable_displacement: request.cable_displacement || '', adss: request.adss || '', drop_cable: request.drop_cable || '',
  });
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [manualQuantities, setManualQuantities] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!canEdit) return;
    getDesignMaterials().then(setMaterials).catch(() => {});
  }, [canEdit]);

  const primary = materials.find((m) => m.is_primary_input);
  const calculated = useMemo(
    () => materials.map((m) => ({
      ...m,
      quantity: m.is_primary_input ? Number(quantities[m.id] || 0) : manualQuantities[m.id] ?? calculate(m.calculation_formula, primary?.material_name || '', Number(quantities[primary?.id || -1] || 0)),
    })),
    [materials, quantities, manualQuantities, primary]
  );
  const grandTotal = calculated.reduce((sum, m) => sum + m.quantity * Number(m.unit_price), 0);

  if (!canEdit) return <DesignReadOnlySummary request={request} />;

  const submit = async () => {
    if (!form.site_name.trim()) { toast({ title: 'Site name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = { ...form, materials: calculated.map((m) => ({ material_id: m.id, material_name: m.material_name, unit: m.unit, unit_price: m.unit_price, quantity: m.quantity, calculation_formula: m.calculation_formula })) };
      const updated = await submitDesignRequest(request.id, payload);
      for (const file of files) await uploadProjectRequestAttachment(updated.id, file, 'design');
      toast({ title: 'Sent back to Sales', description: 'Survey and material request submitted for review' });
      await onUpdated();
    } catch (e: unknown) {
      toast({ title: 'Could not submit', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <DetailCard title="Site & survey details" icon={FileText}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">Site name<Input className="mt-1" value={form.site_name} onChange={(e) => setForm({ ...form, site_name: e.target.value })} /></label>
          <label className="text-sm font-medium">Location<Input className="mt-1" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
          <label className="text-sm font-medium">ISP<Input className="mt-1" value={form.isp} onChange={(e) => setForm({ ...form, isp: e.target.value })} /></label>
          <label className="text-sm font-medium">
            Region
            <Select value={form.region} onValueChange={(v) => setForm({ ...form, region: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>{GHANA_REGIONS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <label className="text-sm font-medium">Survey date<Input className="mt-1" type="date" value={form.survey_date} onChange={(e) => setForm({ ...form, survey_date: e.target.value })} /></label>
          <label className="text-sm font-medium">Link / reference<Input className="mt-1" value={form.design_reference} placeholder="KMZ link or external reference" onChange={(e) => setForm({ ...form, design_reference: e.target.value })} /></label>
          <label className="text-sm font-medium">Cable distance<Input className="mt-1" placeholder="e.g. 1.2km" value={form.cable_displacement} onChange={(e) => setForm({ ...form, cable_displacement: e.target.value })} /></label>
          <label className="text-sm font-medium">ADSS distance<Input className="mt-1" placeholder="e.g. 800m" value={form.adss} onChange={(e) => setForm({ ...form, adss: e.target.value })} /></label>
          <label className="text-sm font-medium">Drop cable distance<Input className="mt-1" placeholder="e.g. 50m" value={form.drop_cable} onChange={(e) => setForm({ ...form, drop_cable: e.target.value })} /></label>
          <label className="text-sm font-medium md:col-span-2">Design specification<textarea className="mt-1 min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.design_specification} placeholder="Coordinates, routing, technical details…" onChange={(e) => setForm({ ...form, design_specification: e.target.value })} /></label>
        </div>
      </DetailCard>

      <DetailCard title="Material request" icon={FileText}>
        {!materials.length ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">No materials configured. Add them in Settings → Design Configuration.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-[var(--surface-secondary)] text-left text-[var(--text-secondary)]"><tr><th className="px-3 py-2">Material</th><th className="px-3 py-2">Quantity</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2 text-right">Cost</th></tr></thead>
              <tbody>
                {calculated.map((m) => (
                  <tr key={m.id} className="border-b border-[var(--border)]">
                    <td className="px-3 py-3 font-medium">{m.material_name}{m.is_primary_input && <span className="ml-2 text-xs text-[var(--primary)]">Primary input</span>}</td>
                    <td className="px-3 py-3"><Input className="h-9 w-32" type="number" min="0" step="0.01" value={m.is_primary_input ? quantities[m.id] || '' : manualQuantities[m.id] ?? m.quantity} onChange={(e) => m.is_primary_input ? setQuantities({ ...quantities, [m.id]: Number(e.target.value) }) : setManualQuantities({ ...manualQuantities, [m.id]: Number(e.target.value) })} /></td>
                    <td className="px-3 py-3">{m.unit}</td>
                    <td className="px-3 py-3 text-right text-[var(--text-muted)]">{money(m.quantity * Number(m.unit_price))}</td>
                  </tr>
                ))}
                <tr className="bg-[var(--surface-secondary)]"><td colSpan={3} className="px-3 py-3 text-right font-bold">Grand total</td><td className="px-3 py-3 text-right font-bold text-[var(--primary)]">{money(grandTotal)}</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </DetailCard>

      {canUpload && (
        <div>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-secondary)] p-5 text-sm font-medium">
            <Paperclip className="h-5 w-5" />
            Add images and files
            <input className="hidden" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.kmz,.kml" onChange={(e) => setFiles((current) => [...current, ...Array.from(e.target.files || [])])} />
          </label>
          {files.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)]">
                  {imageFile(file) ? <img src={URL.createObjectURL(file)} alt={file.name} className="aspect-video w-full object-cover" /> : (
                    <div className="flex aspect-video flex-col items-center justify-center gap-2 px-3 text-center"><FileText className="h-8 w-8 text-[var(--text-muted)]" /><span className="truncate text-xs">{file.name}</span></div>
                  )}
                  <button type="button" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <AttachmentZone attachments={(request.attachments || []).filter((a) => a.stage === 'design')} allowUpload={false} />

      <Button size="lg" disabled={saving} onClick={() => void submit()}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
        Send back to Sales
      </Button>
    </div>
  );
}
