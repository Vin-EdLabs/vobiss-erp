import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getUnitTheme } from './unitThemes';

export function ProductionPageShell({
  children,
  backTo,
  backLabel = 'Back',
  unitSlug,
  header,
}: {
  children: React.ReactNode;
  backTo?: string;
  backLabel?: string;
  unitSlug?: string;
  header?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const theme = unitSlug ? getUnitTheme(unitSlug) : null;

  return (
    <div className="min-h-full max-w-[100vw] overflow-x-hidden bg-[var(--content-bg)]">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        {backTo && (
          <button
            type="button"
            onClick={() => navigate(backTo)}
            className={`group mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--surface-hover)] ${
              theme ? theme.accentText : ''
            }`}
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            {backLabel}
          </button>
        )}

        {header && <div className="mb-6">{header}</div>}

        {children}
      </div>
    </div>
  );
}
