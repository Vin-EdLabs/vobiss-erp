import { useEffect, useMemo, useState } from 'react';
import { matchPath, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Eye, LogIn } from 'lucide-react';
import { viewSharedLink, type SharedLink } from '@/api';
import { humanizeRecordType, iconForRecordType, previewDetailFields, previewTables, statusBadgeClass } from '@/lib/shareRecord';
import { Badge } from '@/components/ui/badge';
import { SharedViewProvider } from '@/context/SharedViewContext';
import { SHARED_PAGE_REGISTRY } from '@/lib/sharedPageRegistry';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; link: SharedLink }
  | { kind: 'login_required' }
  | { kind: 'expired' }
  | { kind: 'revoked' }
  | { kind: 'not_found' }
  | { kind: 'rate_limited' }
  | { kind: 'error'; message: string };

function BrandedShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <img src="/vobiss-logo.png" alt="Vobiss" className="h-8 w-auto" />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-center text-xs text-slate-400">
        Powered by Vobiss
      </footer>
    </div>
  );
}

function CenteredMessage({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
        {action && <div className="mt-6">{action}</div>}
      </div>
    </div>
  );
}

/** Fallback for a link whose page isn't in the registry yet — a summary card, not the real page. */
function FallbackPreview({ link }: { link: SharedLink }) {
  const preview = link.recordPreview;
  const Icon = iconForRecordType(link.recordType);
  const title = preview?.title || link.pageTitle || humanizeRecordType(link.recordType);
  const details = previewDetailFields(preview);
  const tables = previewTables(preview);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start gap-4 border-b border-slate-100 p-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
              {preview?.status && (
                <Badge className={`${statusBadgeClass(preview.status)} rounded-full px-2.5 py-0.5 text-xs font-medium`}>
                  {preview.status}
                </Badge>
              )}
            </div>
            {preview?.reference && <p className="mt-1 text-sm text-slate-500">Ref: {preview.reference}</p>}
            <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">{humanizeRecordType(link.recordType)}</p>
          </div>
        </div>

        {details.length > 0 && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-6 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
                <dd className="mt-0.5 text-sm text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 text-xs text-slate-500">
          Shared by {link.createdByName || 'a Vobiss team member'} · Recipient can view only — they cannot make any changes.
        </div>
      </div>

      {tables.map((table) => (
        <div key={table.title} className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-6 py-4 text-sm font-semibold text-slate-800">{table.title}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {table.columns.map((col) => (
                    <th key={col.key} className="px-4 py-2.5">{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    {table.columns.map((col) => (
                      <td key={col.key} className="px-4 py-2.5 text-slate-700">
                        {row[col.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Renders the exact same page component the sender was on, seeded with the record's real URL. */
function LiveSharedPage({ link, token }: { link: SharedLink; token: string }) {
  const { entry: match, params: routeParams } = useMemo(() => {
    for (const candidate of SHARED_PAGE_REGISTRY) {
      const m = matchPath({ path: candidate.pattern, end: true }, link.pagePath);
      if (m) return { entry: candidate, params: m.params as Record<string, string | undefined> };
    }
    return { entry: undefined, params: {} };
  }, [link.pagePath]);

  if (!match) return <FallbackPreview link={link} />;

  const { Component } = match;
  // Render the target page directly — no nested Router (React Router forbids a <Router>
  // inside another <Router>) and no <Routes location=> override (React Router forbids
  // overriding to a path outside the current route's own subtree, and `/shared/:token`
  // and the record's real path share no prefix). Pages read the record id from
  // `routeParams` on this context instead of `useParams()`/`useLocation()`.
  return (
    <SharedViewProvider
      value={{
        isSharedView: true,
        shareToken: token,
        recordType: link.recordType,
        recordId: link.recordId,
        visibility: link.visibility,
        routeParams,
      }}
    >
      <Component />
    </SharedViewProvider>
  );
}

export default function SharedRecordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const result = await viewSharedLink(token);
      if (cancelled) return;
      if (result.ok && result.link) {
        setState({ kind: 'ready', link: result.link });
        return;
      }
      if (result.status === 429) return setState({ kind: 'rate_limited' });
      switch (result.reason) {
        case 'login_required':
          return setState({ kind: 'login_required' });
        case 'expired':
          return setState({ kind: 'expired' });
        case 'revoked':
          return setState({ kind: 'revoked' });
        case 'not_found':
          return setState({ kind: 'not_found' });
        default:
          return setState({ kind: 'error', message: result.error || 'Could not load this shared record.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.kind === 'loading') {
    return (
      <BrandedShell>
        <CenteredMessage title="Loading shared record…" description="Please wait a moment." />
      </BrandedShell>
    );
  }

  if (state.kind === 'login_required') {
    return (
      <BrandedShell>
        <CenteredMessage
          title="Private shared record"
          description="This is a private shared record. Please log in to view it."
          action={
            <button
              type="button"
              onClick={() => navigate('/login', { state: { from: location } })}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <LogIn className="h-4 w-4" /> Log in to view
            </button>
          }
        />
      </BrandedShell>
    );
  }

  if (state.kind === 'expired') {
    return (
      <BrandedShell>
        <CenteredMessage title="Link expired" description="This link has expired. Please contact the sender for a new link." />
      </BrandedShell>
    );
  }

  if (state.kind === 'revoked') {
    return (
      <BrandedShell>
        <CenteredMessage title="Link unavailable" description="This link is no longer available." />
      </BrandedShell>
    );
  }

  if (state.kind === 'not_found') {
    return (
      <BrandedShell>
        <CenteredMessage title="Link not found" description="This shared link doesn't exist. Double-check the URL and try again." />
      </BrandedShell>
    );
  }

  if (state.kind === 'rate_limited') {
    return (
      <BrandedShell>
        <CenteredMessage title="Too many views" description="This link has reached its hourly view limit. Please try again later." />
      </BrandedShell>
    );
  }

  if (state.kind === 'error') {
    return (
      <BrandedShell>
        <CenteredMessage title="Something went wrong" description={state.message} />
      </BrandedShell>
    );
  }

  return (
    <>
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800 sm:text-sm">
        <Eye className="mr-1.5 inline h-3.5 w-3.5 sm:h-4 sm:w-4" />
        You are viewing a shared record — read only
      </div>
      <LiveSharedPage link={state.link} token={token!} />
    </>
  );
}
