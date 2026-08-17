// src/pages/assets/assignments/history.tsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Package, User, Calendar, CheckCircle, AlertCircle, Search } from 'lucide-react';

interface HistoryEntry {
  person_id: string;
  person_name: string;
  asset_id: string;
  asset_name: string;
  asset_tag: string;
  action: 'assigned' | 'returned';
  date: string;
  condition?: string;
  notes?: string;
}

export default function AssignmentHistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'assigned' | 'returned'>('all');

  useEffect(() => {
    const allHistory: HistoryEntry[] = [];

    // Load from all people
    const people = JSON.parse(localStorage.getItem('people') || '[]');
    people.forEach((person: any) => {
      const assignmentsKey = `assignments_${person.id}`;
      const assignments = JSON.parse(localStorage.getItem(assignmentsKey) || '[]');
      const personName = `${person.first_name} ${person.last_name}`;

      assignments.forEach((a: any) => {
        if (a.status === 'assigned' || a.status === 'returned') {
          allHistory.push({
            person_id: person.id,
            person_name: personName,
            asset_id: a.asset_id,
            asset_name: a.asset_name,
            asset_tag: a.asset_tag,
            action: a.status === 'assigned' ? 'assigned' : 'returned',
            date: a.status === 'assigned' ? a.assigned_date : a.returned_date || a.assigned_date,
            condition: a.status === 'assigned' ? a.condition_before : a.condition_after,
            notes: a.status === 'assigned' ? a.notes_before : a.notes_after,
          });
        }
      });
    });

    // Sort newest first
    allHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setHistory(allHistory);
  }, []);

  const filtered = history.filter(entry => {
    const matchesSearch = 
      entry.person_name.toLowerCase().includes(search.toLowerCase()) ||
      entry.asset_name.toLowerCase().includes(search.toLowerCase()) ||
      entry.asset_tag.toLowerCase().includes(search.toLowerCase());
    
    const matchesFilter = filter === 'all' || entry.action === filter;

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-6">
        <Link to="/assets/assignments" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 text-lg font-medium">
          <ArrowLeft className="h-5 w-5" /> Back to People
        </Link>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Assignment History</h1>
          <p className="text-gray-600 mt-2">Complete log of all asset check-outs and returns</p>
        </div>

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by person or asset..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-12 pr-5 py-4 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-lg"
            />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setFilter('all')} className={`px-6 py-4 rounded-xl font-medium transition ${filter === 'all' ? 'bg-gray-900 text-white' : 'bg-white border hover:bg-gray-50'}`}>
              All ({history.length})
            </button>
            <button onClick={() => setFilter('assigned')} className={`px-6 py-4 rounded-xl font-medium transition flex items-center gap-2 ${filter === 'assigned' ? 'bg-blue-600 text-white' : 'bg-white border hover:bg-gray-50'}`}>
              <Package className="h-5 w-5" /> Assigned
            </button>
            <button onClick={() => setFilter('returned')} className={`px-6 py-4 rounded-xl font-medium transition flex items-center gap-2 ${filter === 'returned' ? 'bg-emerald-600 text-white' : 'bg-white border hover:bg-gray-50'}`}>
              <CheckCircle className="h-5 w-5" /> Returned
            </button>
          </div>
        </div>

        {/* History Table */}
        <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Action</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Person</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Asset</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Condition</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center text-gray-500">
                      <Package className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg">No history found</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((entry, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-500" />
                          <span className="font-medium">{new Date(entry.date).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${
                          entry.action === 'assigned' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {entry.action === 'assigned' ? <Package className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                          {entry.action === 'assigned' ? 'Assigned' : 'Returned'}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <User className="h-5 w-5 text-blue-600" />
                          </div>
                          <span className="font-medium">{entry.person_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div>
                          <p className="font-medium">{entry.asset_name}</p>
                          <p className="text-sm text-gray-600">#{entry.asset_tag}</p>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                          entry.condition?.toLowerCase().includes('good') || entry.condition?.toLowerCase().includes('perfect')
                            ? 'bg-emerald-100 text-emerald-800'
                            : entry.condition?.toLowerCase().includes('damage') || entry.condition?.toLowerCase().includes('repair')
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {entry.condition || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-sm text-gray-600">
                        {entry.notes || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}