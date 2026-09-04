import React from 'react';
import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

const MODULE_LABELS: Record<string, string> = {
  hr: 'PTEL HR',
  finance: 'PTEL Finance',
  transport: 'PTEL Transport',
  inventory: 'PTEL Inventory',
  assets: 'PTEL Assets',
  'audit-logs': 'PTEL Audit Logs',
};

function moduleLabelFromPath(pathname: string): string {
  const segment = pathname.replace(/^\/ptel\//, '').split('/')[0];
  return MODULE_LABELS[segment] || 'This PTEL module';
}

export default function PtelComingSoon() {
  const { pathname } = useLocation();
  const label = moduleLabelFromPath(pathname);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-16 sm:py-24">
      <div className="vobiss-card w-full rounded-[var(--card-radius)] border bg-[var(--surface)] px-6 py-10">
        <EmptyState
          icon={Construction}
          title={`${label} is coming soon`}
          description="This module hasn't been built out for PTEL yet — Sales is live today, and the rest of the platform will roll out next."
        />
      </div>
    </div>
  );
}
