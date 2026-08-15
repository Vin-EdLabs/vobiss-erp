import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Calendar, Loader2, MessageSquare, Paperclip, Send, Wrench } from 'lucide-react';
import { ProductionPageShell } from '@/components/production/ProductionPageShell';
import { DetailCard, FormField, FormSection } from '@/components/production/production-ui';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  createProjectRequestForUnit,
  uploadProjectRequestAttachment,
} from '@/api/project';
import { AttachmentZone } from '@/components/production/AttachmentZone';
import { vobiAmbientStore } from '@/stores/vobiAmbientStore';
import { useVobiFormState } from '@/hooks/useVobiFormState';
import { useVobiSection } from '@/hooks/useVobiSection';

export default function ProductionCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    customer_name: '',
    site_name: '',
    location: '',
    region: '',
    capacity: '',
    bandwidth: '',
    cable_displacement: '',
    service_type: '',
    cpe: '',
    start_date: '',
    completion_date: '',
    confirmation_date: '',
    mrc: '',
    nrc: '',
    initial_remarks: '',
  });

  useEffect(() => {
    vobiAmbientStore.getState().setFormHint('project-request');
  }, []);

  useVobiSection({
    id: 'project-request-form',
    title: 'Service Request Form',
    help: 'Create a service request with the exact customer, site, location, and commercial or technical details for the next unit.',
    priority: 20,
  });

  useVobiFormState({
    formKey: 'project-request',
    requiredFields: [
      { field: 'customer_name', label: 'Customer Name' },
      { field: 'site_name', label: 'Site Name' },
    ],
    currentValues: form,
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const focusNextField = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    if (target instanceof HTMLTextAreaElement && e.shiftKey) return;

    e.preventDefault();
    const fields = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([type="file"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button[type="submit"]:not([disabled])'
      )
    ).filter((el) => el.offsetParent !== null);
    const currentIndex = fields.indexOf(target);
    fields[currentIndex + 1]?.focus();
  };

  const submit = async (routeToStage: 'ts' | 'ip') => {
    const missingFields = [
      !form.customer_name.trim()
        ? { field: 'customer_name', label: 'Customer Name', message: 'Enter the customer name before submitting this service request.' }
        : null,
      !form.site_name.trim()
        ? { field: 'site_name', label: 'Site Name', message: 'Enter the site name before submitting this service request.' }
        : null,
    ].filter(Boolean);

    if (missingFields.length > 0) {
      vobiAmbientStore.getState().setExactIssue({
        title: `${missingFields.length} required field${missingFields.length === 1 ? '' : 's'} missing`,
        body: 'Vobi checked this service request and found only the fields below are missing.',
        formKey: 'project-request',
        fieldErrors: missingFields,
        action: 'Show me',
      });
      return;
    }
    setSaving(true);
    try {
      const created = await createProjectRequestForUnit(routeToStage, {
        ...form,
        mrc: form.mrc ? parseFloat(form.mrc) : null,
        nrc: form.nrc ? parseFloat(form.nrc) : null,
      });
      for (const file of pendingFiles) {
        await uploadProjectRequestAttachment(created.id, file, 'project');
      }
      toast({
        title: 'Service request submitted',
        description: `Sent to ${routeToStage === 'ip' ? 'IP' : 'TS'} for review`,
      });
      navigate(`/project-request/${routeToStage}/${created.id}`);
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProductionPageShell
      backTo="/project-request/project"
      backLabel="Back to Project Unit"
      header={
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <img
                src="/vobiss-logo.png"
                alt="Vobiss"
                className="h-12 w-12 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] object-contain p-1"
              />
              <div>
                <h1 className="text-2xl font-bold text-[var(--text-primary)]">New Service Request</h1>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Complete the form below, then choose whether to send it to <strong>TS</strong> or <strong>IP</strong>.
                </p>
              </div>
            </div>
            <span className="rounded-full border border-transparent bg-[var(--accent-amber-light)] px-3 py-1 text-xs font-bold uppercase text-[var(--warning-text)]">
              Draft
            </span>
          </div>
        </div>
      }
    >
      <form onSubmit={(e) => e.preventDefault()} onKeyDown={focusNextField} className="space-y-6" noValidate>
        <FormSection title="Site & customer" icon={Building2}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Customer Name" value={form.customer_name} onChange={(v) => set('customer_name', v)} required vobiField="customer_name" />
            <FormField label="Site Name" value={form.site_name} onChange={(v) => set('site_name', v)} required vobiField="site_name" />
            <FormField label="Location" value={form.location} onChange={(v) => set('location', v)} className="md:col-span-2" vobiField="location" />
            <FormField label="Region" value={form.region} onChange={(v) => set('region', v)} vobiField="region" />
            <FormField label="Service Type" value={form.service_type} onChange={(v) => set('service_type', v)} vobiField="service_type" />
          </div>
        </FormSection>

        <FormSection title="Technical details" icon={Wrench}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Capacity" value={form.capacity} onChange={(v) => set('capacity', v)} vobiField="capacity" />
            <FormField label="Bandwidth" value={form.bandwidth} onChange={(v) => set('bandwidth', v)} vobiField="bandwidth" />
            <FormField label="Cable Distance" value={form.cable_displacement} onChange={(v) => set('cable_displacement', v)} vobiField="cable_displacement" />
            <FormField label="CPE" value={form.cpe} onChange={(v) => set('cpe', v)} vobiField="cpe" />
          </div>
        </FormSection>

        <FormSection title="Dates & commercial" icon={Calendar}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Start Date" type="date" value={form.start_date} onChange={(v) => set('start_date', v)} vobiField="start_date" />
            <FormField label="Completion Date" type="date" value={form.completion_date} onChange={(v) => set('completion_date', v)} vobiField="completion_date" />
            <FormField label="Confirmation Date" type="date" value={form.confirmation_date} onChange={(v) => set('confirmation_date', v)} vobiField="confirmation_date" />
            <FormField label="MRC" type="number" value={form.mrc} onChange={(v) => set('mrc', v)} vobiField="mrc" />
            <FormField label="NRC" type="number" value={form.nrc} onChange={(v) => set('nrc', v)} vobiField="nrc" />
          </div>
        </FormSection>

        <FormSection title="Remarks / comments" icon={MessageSquare}>
          <FormField
            label="Initial remarks"
            value={form.initial_remarks}
            onChange={(v) => set('initial_remarks', v)}
            as="textarea"
            placeholder="Comment / Remarks for TS and the team..."
            vobiField="initial_remarks"
          />
        </FormSection>

        <DetailCard title="Attachments" icon={Paperclip}>
          <AttachmentZone
            attachments={[]}
            allowUpload
            onUpload={async (file) => setPendingFiles((p) => [...p, file])}
          />
          {pendingFiles.length > 0 && (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              {pendingFiles.length} file(s) will upload when you submit
            </p>
          )}
        </DetailCard>

        <div className="flex flex-wrap gap-3 pt-2">
          <Button
            type="button"
            disabled={saving}
            className="rounded-xl bg-blue-600 px-8 py-6 text-base font-semibold shadow-lg shadow-blue-200/50 hover:bg-blue-700"
            onClick={() => submit('ts')}
          >
            {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
            Submit to TS
          </Button>
          <Button
            type="button"
            disabled={saving}
            className="rounded-xl bg-indigo-600 px-8 py-6 text-base font-semibold shadow-lg shadow-indigo-200/50 hover:bg-indigo-700"
            onClick={() => submit('ip')}
          >
            {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
            Submit to IP
          </Button>
          <Button type="button" variant="outline" className="rounded-xl px-6 py-6" onClick={() => navigate('/project-request/project')}>
            Cancel
          </Button>
        </div>
      </form>
    </ProductionPageShell>
  );
}
