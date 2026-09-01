export type ReferenceType = 'ticket' | 'project' | 'material_request';

export interface LinkedReference {
  type: ReferenceType;
  id: number;
  number: string;
  title: string;
  status?: string | null;
  link?: string | null;
}

export const REFERENCE_TYPE_META: Record<
  ReferenceType,
  { label: string; short: string; emoji: string; viewLabel: string }
> = {
  ticket: { label: 'Ticket', short: 'TKT', emoji: '📋', viewLabel: 'View Ticket' },
  project: { label: 'Project', short: 'PRJ', emoji: '🏗️', viewLabel: 'View Project' },
  material_request: { label: 'Material Request', short: 'MR', emoji: '📦', viewLabel: 'View Material Request' },
};

export function normalizeLinkedReference(row?: {
  reference_type?: string | null;
  reference_id?: number | null;
  reference_number?: string | null;
  reference_title?: string | null;
  reference_status?: string | null;
} | null): LinkedReference | null {
  if (!row) return null;
  const raw = String(row.reference_type || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const type: ReferenceType | null =
    raw === 'ticket' ? 'ticket' : raw === 'project' ? 'project' : raw === 'material_request' || raw === 'material' ? 'material_request' : null;
  const id = Number(row.reference_id);
  if (!type || !Number.isInteger(id) || id <= 0) return null;
  const link =
    type === 'ticket'
      ? `/staff/cx/tickets/${id}`
      : type === 'project'
        ? `/project-request/${id}`
        : `/request-forms/${id}`;
  return {
    type,
    id,
    number: row.reference_number || `${REFERENCE_TYPE_META[type].short}-${String(id).padStart(3, '0')}`,
    title: row.reference_title || REFERENCE_TYPE_META[type].label,
    status: row.reference_status || null,
    link,
  };
}

export function referencePayload(value: LinkedReference | null) {
  if (!value) {
    return {
      reference_type: null,
      reference_id: null,
      reference_number: null,
      reference_title: null,
    };
  }
  return {
    reference_type: value.type,
    reference_id: value.id,
    reference_number: value.number,
    reference_title: value.title,
  };
}
