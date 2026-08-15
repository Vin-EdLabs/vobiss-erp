import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { GlobalExecutiveSearch } from '@/components/GlobalExecutiveSearch';

export default function GlobalSearchPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to="/director/dashboard"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Directors Dashboard
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md">
          <Search className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Global Search</h1>
          <p className="text-sm text-slate-500">
            Find tickets, cash &amp; material requests, item returns, and service requests in one place.
          </p>
        </div>
      </div>

      <GlobalExecutiveSearch variant="page" autoFocus />
    </div>
  );
}
