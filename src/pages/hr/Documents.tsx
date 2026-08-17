import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { hrApi, HR_QUERY } from '@/api/hr';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { EmptyState, Field, HrPageHeader, TableSkeleton, inputClass } from './components';
import { DocumentPreview } from './DocumentPreview';

const CATEGORIES = ['Contract', 'ID', 'Certificate', 'Offer Letter', 'Warning Letter', 'Other'];

const HrDocuments = () => {
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: '', document_name: '', category: 'Contract', notes: '' });
  const [file, setFile] = useState<File | null>(null);

  const docsQ = useQuery({ queryKey: ['hr', 'docs'], queryFn: () => hrApi.documents(), ...HR_QUERY });
  const employeesQ = useQuery({ queryKey: ['hr', 'employees'], queryFn: () => hrApi.employees(), ...HR_QUERY });

  const uploadMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('file', file);
      return hrApi.uploadDocument(fd);
    },
    onSuccess: () => {
      toast.success('Document uploaded');
      qc.invalidateQueries({ queryKey: ['hr', 'docs'] });
      setOpen(false);
      setFile(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => hrApi.deleteDocument(id),
    onSuccess: () => {
      toast.success('Document deleted');
      qc.invalidateQueries({ queryKey: ['hr', 'docs'] });
    },
  });

  const rows = useMemo(() => {
    let list = docsQ.data || [];
    if (employeeId) list = list.filter((d: any) => String(d.employee_id) === employeeId);
    if (category) list = list.filter((d: any) => d.category === category);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((d: any) => String(d.document_name || '').toLowerCase().includes(s) || String(d.full_name || '').toLowerCase().includes(s));
    }
    return list;
  }, [docsQ.data, employeeId, category, q]);

  return (
    <div>
      <HrPageHeader
        title="HR Documents"
        description="Contracts, IDs, certificates, and letters in one store."
        actions={<Button onClick={() => setOpen(true)}>Upload document</Button>}
      />

      <div className="mb-4 grid gap-3 rounded-xl border bg-white p-3 shadow-[var(--shadow-md)] md:grid-cols-3">
        <input className={inputClass} placeholder="Search documents…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={inputClass} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">All employees</option>
          {(employeesQ.data || []).map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
        <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {docsQ.isLoading && !docsQ.data ? <TableSkeleton /> : rows.length === 0 ? (
        <EmptyState title="No documents yet" action={<Button onClick={() => setOpen(true)}>Upload document</Button>} />
      ) : (
        <div className="rounded-xl border bg-white shadow-card">
          <Accordion type="single" collapsible className="w-full">
            {rows.map((d: any) => (
              <AccordionItem key={d.id} value={String(d.id)} className="px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="grid w-full grid-cols-1 gap-1 pr-4 text-left sm:grid-cols-4 sm:items-center">
                    <span className="text-sm font-medium text-[var(--text-primary)]">{d.document_name}</span>
                    <span className="text-sm text-[var(--text-secondary)]">{d.full_name}</span>
                    <span className="text-sm text-[var(--text-secondary)]">{d.category}</span>
                    <span className="text-xs text-[var(--text-muted)]">{d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pb-2">
                    <DocumentPreview fileUrl={d.file_url} documentName={d.document_name} />
                    <button type="button" className="text-sm text-red-600" onClick={() => delMut.mutate(d.id)}>Delete</button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload document</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); uploadMut.mutate(); }}>
            <Field label="Employee">
              <select className={inputClass} required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">Select…</option>
                {(employeesQ.data || []).map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Document name"><input className={inputClass} required value={form.document_name} onChange={(e) => setForm({ ...form, document_name: e.target.value })} /></Field>
            <Field label="File"><input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
            <Field label="Notes"><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <Button type="submit" className="w-full" disabled={uploadMut.isPending}>Upload</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HrDocuments;
