import React from 'react';
import { InfoField, InfoGrid } from '@/components/production/production-ui';
import { AttachmentZone } from '@/components/production/AttachmentZone';
import { uploadProjectRequestAttachment, type ProjectRequest } from '@/api/project';

/** Read-only fields — Sales's Feasibility Request Form is only ever filled at creation time,
 *  never edited inline later. Attachments stay open the same as every other card (uploaded at
 *  creation or added later by anyone on the flow), so this card always shows everything Sales
 *  has on file, not just the form fields. */
export function SalesStageSection({
  request, canUpload, onUpdated,
}: {
  request: ProjectRequest;
  canUpload: boolean;
  onUpdated: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <InfoGrid>
        <InfoField label="Customer name" value={request.customer_name} />
        <InfoField label="Site name" value={request.site_name} />
        <InfoField label="Account manager" value={request.account_manager} />
        <InfoField label="Product type" value={request.service_type} />
        <InfoField label="Required capacity" value={request.capacity} />
        <InfoField label="Feasibility type" value={request.feasibility_type} />
        <InfoField label="Request type" value={request.request_type} />
        <InfoField label="Region" value={request.region} />
        <InfoField label="Site address" value={request.location} />
        <InfoField label="Site coordinates" value={request.site_coordinates} />
        <InfoField label="Technical contact" value={request.technical_contact_name} />
        <InfoField label="Contact email" value={request.technical_contact_email} />
        <InfoField label="Contact mobile" value={request.technical_contact_phone} />
        <InfoField label="Created by" value={request.created_by_name} />
      </InfoGrid>
      {request.initial_remarks && (
        <p className="whitespace-pre-wrap rounded-lg bg-[var(--surface-secondary)] p-3 text-sm text-[var(--text-body)]">
          {request.initial_remarks}
        </p>
      )}
      <AttachmentZone
        attachments={(request.attachments || []).filter((a) => a.stage === 'sales')}
        allowUpload={canUpload}
        onUpload={async (file) => { await uploadProjectRequestAttachment(request.id, file, 'sales'); await onUpdated(); }}
      />
    </div>
  );
}
