import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, MapPin } from 'lucide-react';
import { GlobalExecutiveSearch } from '@/components/GlobalExecutiveSearch';
import { useAuth } from '@/context/AuthContext';
import { isHrStaff } from '@/config/roles';

export default function GlobalSearchPage() {
  const { user, isAdminSuper } = useAuth();

  const { backPath, backLabel } = (() => {
    if (isAdminSuper) return { backPath: '/dashboard', backLabel: 'Back to Dashboard' };
    if (isHrStaff(user)) return { backPath: '/hr/dashboard', backLabel: 'Back to HR Dashboard' };
    return { backPath: '/director/dashboard', backLabel: 'Back to Directors Dashboard' };
  })();

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <Link
          to={backPath}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
            <Search className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Global Search</h1>
            <p className="text-sm text-slate-500">
              Find a site and see its full history, or jump straight to a ticket, request, or record.
            </p>
          </div>
        </div>

        <GlobalExecutiveSearch variant="page" autoFocus />

        <div className="mt-8 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <MapPin className="h-4 w-4" />
          </span>
          <div className="text-sm text-blue-900">
            <p className="font-medium">Looking for a client's full history?</p>
            <p className="mt-0.5 text-blue-800/80">
              Search for one of their sites instead — every site opens a Site 360 view with its
              tickets, materials, overtime, and more, plus the client shown right at the top.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
