import React from 'react';
import { Building2 } from 'lucide-react';
import { DetailCard, InfoField, InfoGrid } from '@/components/production/production-ui';
import type { ProjectRequest } from '@/api/project';

/** All fields submitted by Project Unit (read-only) */
export function SubmittedRequestDetails({ request }: { request: ProjectRequest }) {
  return (
    <DetailCard title="Submitted by Project Unit" icon={Building2}>
      <InfoGrid>
        <InfoField label="Customer name" value={request.customer_name} />
        <InfoField label="Site name" value={request.site_name} />
        <InfoField label="Location" value={request.location} />
        <InfoField label="Region" value={request.region} />
        <InfoField label="Capacity" value={request.capacity} />
        <InfoField label="Bandwidth" value={request.bandwidth} />
        <InfoField label="Cable distance" value={request.cable_displacement} />
        <InfoField label="Service type" value={request.service_type} />
        <InfoField label="CPE" value={request.cpe} />
        <InfoField label="Start date" value={request.start_date} />
        <InfoField label="Completion date" value={request.completion_date} />
        <InfoField label="Confirmation date" value={request.confirmation_date} />
        <InfoField label="MRC" value={request.mrc != null ? String(request.mrc) : undefined} />
        <InfoField label="NRC" value={request.nrc != null ? String(request.nrc) : undefined} />
        <InfoField label="Submitted by" value={request.created_by_name} />
        <InfoField label="Project unit" value={request.project_unit_name} />
      </InfoGrid>
    </DetailCard>
  );
}

export function IpIntegrationDetails({ request }: { request: ProjectRequest }) {
  const ipRemarks = (request.remarks || []).filter((r) => r.stage === 'ip');
  const latestIpRemark = ipRemarks.length ? ipRemarks[ipRemarks.length - 1] : null;

  return (
    <DetailCard title="IP unit — integration details" icon={Building2}>
      <InfoGrid>
        <InfoField label="Circuit ID" value={request.circuit_id} />
        <InfoField label="Integration date" value={request.integration_date} />
        <InfoField label="IP address" value={request.ip_address} />
        <InfoField label="MAC address" value={request.mac_address} />
        <InfoField label="Integrated by" value={request.integrated_by} />
      </InfoGrid>
      {latestIpRemark && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
          <p className="mb-1 text-sm font-semibold text-[var(--text-body)]">IP comment</p>
          <p className="text-sm text-[var(--text-muted)]">
            {latestIpRemark.author_name} · {new Date(latestIpRemark.created_at).toLocaleString()}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-primary)]">{latestIpRemark.comment_text}</p>
        </div>
      )}
    </DetailCard>
  );
}
