// src/pages/assets/assignments/index.tsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, User, Building, Mail, Phone, Package, Search, ChevronDown, ChevronUp, Calendar, Clock, CheckCircle, Loader2 } from 'lucide-react';
import { assetApi } from '../../../api';

interface Person {
  id: number | string;
  first_name: string;
  last_name: string;
  personnel_number?: string;
  job_title?: string;
  group?: string;
  location?: string;
  email?: string;
  phone?: string;
}

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
  status: 'With Person' | 'Returned';
}

export default function AssignmentsPage() {
  const navigate = useNavigate();
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [assignmentsByPerson, setAssignmentsByPerson] = useState<Record<string, any[]>>({});

  useEffect(() => {
    assetApi.getPeople()
      .then((data) => setPeople(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (people.length === 0) return;
    Promise.all(people.map((p: Person) => assetApi.getAssignmentsByPerson(String(p.id))))
      .then((results) => {
        const map: Record<string, any[]> = {};
        people.forEach((p, i) => { map[String(p.id)] = results[i] || []; });
        setAssignmentsByPerson(map);
      })
      .catch(console.error);
  }, [people]);

  const getAssignedCount = (personId: string | number) => {
    const list = assignmentsByPerson[String(personId)] || [];
    return list.filter((a: any) => a.status === 'assigned').length;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const loadHistory = () => {
    assetApi.getAssignmentHistory()
      .then((rows: any[]) => {
        const entries: HistoryEntry[] = (rows || []).map((r) => ({
          person_id: r.person_id,
          person_name: r.person_name,
          asset_id: r.asset_id,
          asset_name: r.asset_name,
          asset_tag: r.asset_tag,
          action: r.action,
          date: r.date,
          condition: r.condition,
          notes: r.notes,
          status: r.status,
        }));
        setHistory(entries);
      })
      .catch(console.error);
  };

  useEffect(() => {
    if (showHistory) loadHistory();
  }, [showHistory]);

  const filteredPeople = people
    .map(p => ({ ...p, assignedCount: getAssignedCount(String(p.id)) }))
    .filter(p => {
      const matchesSearch =
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
        (p.personnel_number || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.job_title || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.group || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.location || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.email && p.email.toLowerCase().includes(search.toLowerCase())) ||
        (p.phone && p.phone.toLowerCase().includes(search.toLowerCase()));

      const matchesFilter =
        filter === 'all' ||
        (filter === 'assigned' && p.assignedCount > 0) ||
        (filter === 'unassigned' && p.assignedCount === 0);

      return matchesSearch && matchesFilter;
    });

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">People & Assignments</h1>
            <p className="text-gray-600 mt-1">Click a row to assign or return assets</p>
          </div>
          <Link
            to="/assets/assignments/new"
            className="inline-flex items-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition"
          >
            <Plus className="h-5 w-5" />
            Add Person
          </Link>
        </div>

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search people..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-12 pr-5 py-4 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-lg"
            />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setFilter('all')} className={`px-5 py-4 rounded-xl font-medium transition ${filter === 'all' ? 'bg-gray-900 text-white' : 'bg-white border hover:bg-gray-50'}`}>
              All ({people.length})
            </button>
            <button onClick={() => setFilter('assigned')} className={`px-5 py-4 rounded-xl font-medium transition flex items-center gap-2 ${filter === 'assigned' ? 'bg-emerald-600 text-white' : 'bg-white border hover:bg-gray-50'}`}>
              <Package className="h-5 w-5" /> Assigned ({people.filter(p => getAssignedCount(p.id) > 0).length})
            </button>
            <button onClick={() => setFilter('unassigned')} className={`px-5 py-4 rounded-xl font-medium transition ${filter === 'unassigned' ? 'bg-gray-600 text-white' : 'bg-white border hover:bg-gray-50'}`}>
              Unassigned ({people.filter(p => getAssignedCount(p.id) === 0).length})
            </button>
          </div>
        </div>

        {/* History Toggle */}
        <div className="mb-8">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-700 text-white rounded-xl hover:from-purple-700 hover:to-indigo-800 font-medium shadow-lg transition"
          >
            {showHistory ? <ChevronUp className="h-6 w-6" /> : <ChevronDown className="h-6 w-6" />}
            {showHistory ? 'Hide' : 'View'} Assignment History ({history.length} events)
          </button>
        </div>

        {/* History Table */}
        {showHistory && (
          <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-gray-200 overflow-hidden mb-8">
            <div className="p-6 border-b border-gray-200 bg-gray-50">
              <h2 className="text-2xl font-bold text-gray-900">Full Assignment History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Action</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Person</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Asset</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Condition</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center text-gray-500">
                        <Package className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                        <p className="text-lg">No assignment history yet</p>
                      </td>
                    </tr>
                  ) : (
                    history.map((entry, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-500" />
                            <span className="font-medium">{formatDate(entry.date)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${
                            entry.action === 'assigned' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {entry.action === 'assigned' ? 'Assigned' : 'Returned'}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${
                            entry.status === 'With Person' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-700'
                          }`}>
                            <Clock className="h-4 w-4" />
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-6 py-5 font-medium">{entry.person_name}</td>
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
        )}

        {/* People Table */}
        <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Personnel #</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Job Title</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Department</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Assigned Assets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredPeople.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center text-gray-500">
                      <User className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg">No people found</p>
                    </td>
                  </tr>
                ) : (
                  filteredPeople.map((person) => {
                    const assignedCount = person.assignedCount;

                    return (
                      <tr
                        key={person.id}
                        onClick={() => navigate(`/assets/assignments/${person.id}`)}
                        className="hover:bg-gray-50 transition cursor-pointer"
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <User className="h-6 w-6 text-blue-600" />
                            </div>
                            <p className="font-medium text-gray-900">{person.first_name} {person.last_name}</p>
                          </div>
                        </td>
                        <td className="px-6 py-5 font-mono text-blue-600">#{person.personnel_number || person.id}</td>
                        <td className="px-6 py-5 text-gray-700">{person.job_title}</td>
                        <td className="px-6 py-5 text-gray-700">{person.group}</td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2 text-gray-700">
                            <Building className="h-4 w-4 text-gray-500" />
                            {person.location}
                          </div>
                        </td>
                        <td className="px-6 py-5 text-sm text-gray-600">
                          {person.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4" /> {person.email}</div>}
                          {person.phone && <div className="flex items-center gap-2 mt-1"><Phone className="h-4 w-4" /> {person.phone}</div>}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${
                            assignedCount > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                          }`}>
                            <Package className="h-5 w-5" />
                            {assignedCount}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}