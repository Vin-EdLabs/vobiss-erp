import {
  AlertTriangle,
  Briefcase,
  Car,
  FileCheck,
  FileText,
  Fuel,
  ListTodo,
  Network,
  Package,
  Ticket,
  Truck,
  Users as UsersIcon,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

/** Icon representing each known record type; falls back to a generic document icon. */
const RECORD_ICONS: Record<string, LucideIcon> = {
  ticket: Ticket,
  cash_request: Wallet,
  material_request: Package,
  item_return: Package,
  transport_request: Truck,
  fuel_request: Fuel,
  vehicle_request: Car,
  project_request: Briefcase,
  service_request: Briefcase,
  design_request: Briefcase,
  sales_request: Briefcase,
  incident_note: AlertTriangle,
  signoff_form: FileCheck,
  network_asset: Network,
  hr_employee: UsersIcon,
  maintenance: Wrench,
  wip_entry: ListTodo,
};

export function iconForRecordType(recordType: string): LucideIcon {
  return RECORD_ICONS[recordType] || FileText;
}

export function humanizeRecordType(recordType: string): string {
  return String(recordType || 'record')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function humanizeKey(key: string): string {
  return String(key || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusBadgeClass(status?: string | null): string {
  const s = String(status || '').toLowerCase();
  if (/(approved|completed|resolved|active|success|paid|closed[\s-]?won|delivered)/.test(s)) {
    return 'bg-green-100 text-green-800';
  }
  if (/(rejected|failed|cancel|closed|declined|revoked|expired)/.test(s)) {
    return 'bg-red-100 text-red-800';
  }
  if (/(pending|review|progress|open|new|awaiting|draft)/.test(s)) {
    return 'bg-yellow-100 text-yellow-800';
  }
  return 'bg-slate-100 text-slate-700';
}

/** Preview keys that get special top-of-card treatment rather than the generic field list. */
export const PREVIEW_PRIMARY_KEYS = ['title', 'reference', 'status', 'tables'];

/** Keys never shown to a share recipient, even when a full record object is passed as the preview. */
const PREVIEW_HIDDEN_KEYS = new Set(['id', 'chat_channel_id', 'created_by_id', 'deleted_at', 'password', 'token', 'signature']);

export type RecordPreviewTable = { title: string; columns: { key: string; label: string }[]; rows: Record<string, any>[] };

export type RecordPreview = {
  title?: string;
  reference?: string;
  status?: string;
  /** Named tables (items, approvals, expenses, timeline, attachments...) shown in full on the external shared page. */
  tables?: RecordPreviewTable[];
  [key: string]: any;
};

function isPlainScalar(value: any): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

/** The remaining scalar preview fields, as [label, value] pairs, for generic rendering. Object/array values are skipped here — use previewTables for those. */
export function previewDetailFields(preview: RecordPreview | null | undefined): [string, string][] {
  if (!preview) return [];
  return Object.entries(preview)
    .filter(
      ([key, value]) =>
        !PREVIEW_PRIMARY_KEYS.includes(key) &&
        !PREVIEW_HIDDEN_KEYS.has(key) &&
        isPlainScalar(value) &&
        value !== null &&
        value !== undefined &&
        value !== ''
    )
    .map(([key, value]) => [humanizeKey(key), String(value)]);
}

/** Named tables (items, approvals, expenses, timeline...) carried on the preview, for the full-fidelity external page. */
export function previewTables(preview: RecordPreview | null | undefined): RecordPreviewTable[] {
  return preview?.tables || [];
}

/** Builds a RecordPreviewTable from an array of row objects, auto-deriving columns from the first row's keys unless given. */
export function buildPreviewTable(title: string, rows: Record<string, any>[] | undefined | null, columns?: { key: string; label: string }[]): RecordPreviewTable | null {
  if (!rows || rows.length === 0) return null;
  const cols = columns || Object.keys(rows[0]).map((key) => ({ key, label: humanizeKey(key) }));
  return { title, columns: cols, rows };
}
