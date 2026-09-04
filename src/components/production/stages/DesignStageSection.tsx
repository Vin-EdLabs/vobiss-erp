import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, ExternalLink, FileText, Loader2, Paperclip, Send, Sparkles, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { DetailCard, InfoField, InfoGrid } from '@/components/production/production-ui';
import { AttachmentZone } from '@/components/production/AttachmentZone';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GHANA_REGIONS } from '@/lib/lookups';
import { useToast } from '@/hooks/use-toast';
import {
  submitDesignRequest, uploadProjectRequestAttachment, getDesignEngineeringSettings,
  type ProjectRequest, type DesignRequestMaterial, type DesignEngineeringSettings,
} from '@/api/project';
import { computeDesignBom, DESIGN_ENGINEERING_DEFAULTS } from '@/lib/designBom';

const imageFile = (file: File) => file.type.startsWith('image/');
const money = (value: number) => `GH₵ ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Most recent Sales remark while the request is back at Design — the reject reason. Only
 *  meaningful while current_stage is 'design' (a fresh submission/confirm clears the signal by
 *  moving the stage on, so an old rejection from a prior cycle never resurfaces). */
function latestRejection(request: ProjectRequest) {
  if (request.current_stage !== 'design') return null;
  const salesRemarks = (request.remarks || []).filter((r) => r.stage === 'sales');
  if (!salesRemarks.length) return null;
  return salesRemarks.reduce((latest, r) => (new Date(r.created_at) > new Date(latest.created_at) ? r : latest));
}

function RejectionBanner({ request }: { request: ProjectRequest }) {
  const rejection = latestRejection(request);
  if (!rejection) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-semibold">Sent back by Sales — needs fixing</p>
      <p className="mt-1.5 whitespace-pre-wrap">{rejection.comment_text}</p>
      <p className="mt-1.5 text-xs text-red-600">{rejection.author_name} · {new Date(rejection.created_at).toLocaleString()}</p>
    </div>
  );
}

const URL_LIKE = /^(https?:\/\/|www\.)/i;

/** Same look as InfoField, but renders the value as an actual clickable, highlighted link when
 *  it looks like a URL — Design's "Link / reference" field is a KMZ link or external reference,
 *  which is useless to Sales as plain unclickable text. */
function LinkInfoField({ label, value }: { label: string; value?: string | null }) {
  const trimmed = value?.trim();
  const isLink = !!trimmed && URL_LIKE.test(trimmed);
  return (
    <div>
      <p className="mb-1 text-sm text-[var(--text-muted)]">{label}</p>
      {isLink ? (
        <a
          href={trimmed!.startsWith('http') ? trimmed : `https://${trimmed}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-base font-semibold text-[var(--primary)] underline decoration-2 underline-offset-2 hover:text-[var(--primary-hover)]"
        >
          {trimmed} <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <p className="text-base font-semibold text-[var(--text-primary)]">{trimmed || '—'}</p>
      )}
    </div>
  );
}

/** The BOM (Bill of Materials) — fully computed from ADSS/Drop distance and the admin-configured
 *  engineering settings, never hand-typed. Same table shown live to Design while they fill the
 *  survey and, once submitted, to Sales/anyone else reviewing the request. */
function BomTable({
  rows, total, badge,
}: {
  rows: { key: string; label: string; unit: string; quantity: number; unit_price: number; line_cost: number }[];
  total: number;
  badge?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-gradient-to-r from-[var(--accent-green-light)] to-[var(--surface-secondary)] text-left text-[var(--text-secondary)]">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Item</th>
              <th className="px-4 py-2.5 font-semibold">Quantity</th>
              <th className="px-4 py-2.5 font-semibold">Unit rate</th>
              <th className="px-4 py-2.5 text-right font-semibold">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((r) => (
              <tr key={r.key} className="transition hover:bg-[var(--surface-hover)]">
                <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{r.label}</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--text-body)]">{Number(r.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })} {r.unit}</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--text-muted)]">{money(Number(r.unit_price))}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-[var(--text-primary)]">{money(Number(r.line_cost))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gradient-to-r from-[var(--primary)] to-[var(--primary-hover)]">
              <td colSpan={3} className="px-4 py-3 text-right text-sm font-bold uppercase tracking-wide text-[var(--primary-text)]">
                Total Section Budget {badge}
              </td>
              <td className="px-4 py-3 text-right text-lg font-extrabold tabular-nums text-[var(--primary-text)]">{money(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
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
      <RejectionBanner request={request} />
      <InfoGrid>
        <InfoField label="ISP" value={request.isp} />
        <InfoField label="Survey date" value={request.survey_date ? new Date(request.survey_date).toLocaleDateString() : undefined} />
        <LinkInfoField label="Reference" value={request.design_reference} />
        <InfoField label="Cable distance" value={request.cable_displacement} />
        <InfoField label="ADSS distance" value={request.adss ? `${request.adss} m` : undefined} />
        <InfoField label="Drop cable distance" value={request.drop_cable ? `${request.drop_cable} m` : undefined} />
      </InfoGrid>
      {request.design_specification && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-2.5">
            <FileText className="h-4 w-4 text-[var(--primary)]" />
            <h4 className="text-sm font-bold text-[var(--text-primary)]">Design Specification</h4>
          </div>
          <p className="whitespace-pre-wrap p-4 text-sm leading-relaxed text-[var(--text-body)]">{request.design_specification}</p>
        </div>
      )}
      {materials.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Calculator className="h-4 w-4 text-[var(--primary)]" />
            <h4 className="text-sm font-bold text-[var(--text-primary)]">Bill of Materials</h4>
          </div>
          <BomTable
            rows={materials.map((m) => ({ key: String(m.id || m.material_name), label: m.material_name, unit: m.unit, quantity: m.quantity, unit_price: m.unit_price, line_cost: Number(m.line_cost ?? m.quantity * m.unit_price) }))}
            total={total}
          />
        </div>
      )}
      <AttachmentZone attachments={designAttachments} allowUpload={false} size="large" />
    </div>
  );
}

/** Editable — Design fills the survey; the material BOM and its cost are fully computed from
 *  ADSS/Drop distance and the engineering settings (Settings → Design Configuration) — nothing
 *  here is hand-typed. */
export function DesignStageSection({
  request, canEdit, canUpload, onUpdated,
}: {
  request: ProjectRequest;
  canEdit: boolean;
  canUpload: boolean;
  onUpdated: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<DesignEngineeringSettings>(DESIGN_ENGINEERING_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  // Auto-calculate is the default; flip off to skip the BOM engine entirely and hand the material
  // & cost breakdown over to a manually uploaded file instead (via Attachments below).
  const [autoCalculate, setAutoCalculate] = useState(true);
  const [form, setForm] = useState({
    location: request.location || '', isp: request.isp || '',
    region: request.region || '', survey_date: request.survey_date?.slice(0, 10) || '',
    design_specification: request.design_specification || '', design_reference: request.design_reference || '',
    cable_displacement: request.cable_displacement || '', adss: request.adss || '', drop_cable: request.drop_cable || '',
  });

  useEffect(() => {
    if (!canEdit) return;
    getDesignEngineeringSettings().then(setSettings).catch(() => {});
  }, [canEdit]);

  const bom = useMemo(
    () => computeDesignBom(Number(form.adss) || 0, Number(form.drop_cable) || 0, settings),
    [form.adss, form.drop_cable, settings]
  );
  // Cable distance is never hand-typed — it's always ADSS distance + Drop cable distance.
  const cableDistance = (Number(form.adss) || 0) + (Number(form.drop_cable) || 0);

  if (!canEdit) return <DesignReadOnlySummary request={request} />;

  const submit = async () => {
    setSaving(true);
    try {
      const materials: DesignRequestMaterial[] = autoCalculate
        ? bom.items.map((i) => ({ material_id: null, material_name: i.label, unit: i.unit, unit_price: i.unit_price, quantity: i.quantity, calculation_formula: null }))
        : [];
      const payload = { ...form, cable_displacement: cableDistance > 0 ? `${cableDistance} m` : '', materials };
      const updated = await submitDesignRequest(request.id, payload);
      for (const file of files) await uploadProjectRequestAttachment(updated.id, file, 'design');
      toast({ title: 'Sent back to Sales', description: 'Survey and computed material budget submitted for review' });
      await onUpdated();
    } catch (e: unknown) {
      toast({ title: 'Could not submit', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <RejectionBanner request={request} />
      <DetailCard title="Site & survey details" icon={FileText}>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Site name is Sales-owned — Design works the survey against it but can't rename it here. */}
          <InfoField label="Site name (set by Sales)" value={request.site_name} />
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
          <label className="text-sm font-medium">
            Cable distance
            <div className="mt-1 flex h-10 items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-secondary)] px-3 text-sm text-[var(--text-primary)]">
              {cableDistance > 0 ? `${cableDistance} m` : '—'}
            </div>
            <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">Auto-calculated: ADSS + Drop cable distance below</span>
          </label>
        </div>
      </DetailCard>

      <DetailCard title="Design Specification" icon={FileText}>
        <p className="mb-2 text-xs text-[var(--text-muted)]">Coordinates, routing, technical details — everything Sales needs to see when this comes back to them.</p>
        <textarea
          className="min-h-56 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-base leading-relaxed text-[var(--text-primary)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--accent-green-light)]"
          value={form.design_specification}
          placeholder="Coordinates, routing, technical details…"
          onChange={(e) => setForm({ ...form, design_specification: e.target.value })}
        />
      </DetailCard>

      <DetailCard title="Material & Cost Calculator" icon={Calculator}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3">
          <label className="flex items-center gap-3 text-sm font-medium text-[var(--text-primary)]">
            <Switch checked={autoCalculate} onCheckedChange={setAutoCalculate} />
            {autoCalculate ? 'Auto-calculate BOM' : 'Manual upload'}
          </label>
          <span className="text-xs text-[var(--text-muted)]">
            {autoCalculate ? 'Turn off to upload the material & cost breakdown as a file instead.' : 'Calculator is off — add your breakdown file under Attachments below.'}
          </span>
        </div>

        {autoCalculate ? (
          <>
            <p className="mb-4 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
              Enter ADSS Distance — poles, brackets, clamps, banding, buckles, FAT and cost all calculate instantly from Settings → Design Configuration. Everything stays at zero until you do.
            </p>
            <div className="mb-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">
                ADSS Distance (E)
                <div className="relative mt-1">
                  <Input className="pr-12" type="number" min="0" step="0.01" placeholder="e.g. 8500" value={form.adss} onChange={(e) => setForm({ ...form, adss: e.target.value })} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]">m</span>
                </div>
              </label>
              <label className="text-sm font-medium">
                Drop Cable Distance (F)
                <div className="relative mt-1">
                  <Input className="pr-12" type="number" min="0" step="0.01" placeholder="e.g. 50" value={form.drop_cable} onChange={(e) => setForm({ ...form, drop_cable: e.target.value })} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]">m</span>
                </div>
              </label>
            </div>

            {bom.totalUsablePoles > 0 && (
              <div className="mb-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-[var(--surface-secondary)] p-3"><p className="text-xs text-[var(--text-muted)]">ADSS Poles</p><p className="text-lg font-bold text-[var(--text-primary)]">{bom.adssPoles}</p></div>
                <div className="rounded-lg bg-[var(--surface-secondary)] p-3"><p className="text-xs text-[var(--text-muted)]">Drop Poles</p><p className="text-lg font-bold text-[var(--text-primary)]">{bom.dropPoles}</p></div>
                <div className="rounded-lg bg-[var(--accent-green-light)] p-3"><p className="text-xs text-[var(--primary)]">Total Usable Poles</p><p className="text-lg font-bold text-[var(--primary)]">{bom.totalUsablePoles}</p></div>
              </div>
            )}

            <BomTable rows={bom.items} total={bom.total} badge="(auto-calculated)" />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-secondary)] py-10 text-center">
            <Upload className="h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm font-medium text-[var(--text-body)]">No BOM will be submitted from this calculator.</p>
            <p className="max-w-sm text-xs text-[var(--text-muted)]">Add your own materials & cost breakdown (screenshot, spreadsheet export, PDF) under Attachments below — Sales will see it there instead of a calculated table.</p>
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
