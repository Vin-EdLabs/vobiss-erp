'use client';

import React, { useEffect, useState } from 'react';
import {
  MapPin,
  Edit2,
  Trash2,
  Copy,
  Navigation,
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronUp,
  History,
  Clock,
  X,
  Calendar,
  MapPinned,
  FileText,
} from 'lucide-react';
import { fieldApi, FieldActivity } from '@/api';

interface Activity {
  id: string;
  versions: FieldActivity[];
  latest: FieldActivity;
}

const ActivitiesTable: React.FC = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FieldActivity>>({});
  const [showWipe, setShowWipe] = useState(false);
  const [historyModal, setHistoryModal] = useState<Activity | null>(null);

  const copyCoords = (lat: number, lng: number) => {
    navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    alert('Copied!');
  };

  const loadActivities = async () => {
    try {
      setLoading(true);
      const data = await fieldApi.getAll();
      const migrated = data.map(item => ({
        id: item.id.toString(),
        versions: [item],
        latest: item,
      }));
      setActivities(migrated);
    } catch (err: any) {
      alert('Failed to load projects: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivities();
  }, []);

  const filtered = activities.filter(act => {
    const q = searchQuery.toLowerCase();
    const l = act.latest;
    return l.projectName.toLowerCase().includes(q) || (l.town || '').toLowerCase().includes(q);
  });

  const startEdit = (act: Activity) => {
    const l = act.latest;
    setEditingId(act.id);
    setEditForm({
      projectName: l.projectName,
      town: l.town || '',
      description: l.description,
      lat: l.lat,
      lng: l.lng,
    });
  };

  const saveEdit = async () => {
    if (!editingId || !editForm.projectName?.trim() || !editForm.town?.trim()) {
      return alert('Name & town required');
    }

    try {
      const updated = await fieldApi.update(Number(editingId), {
        projectName: editForm.projectName!.trim(),
        town: editForm.town!.trim(),
        description: editForm.description?.trim() || '',
        lat: Number(editForm.lat),
        lng: Number(editForm.lng),
      });

      setActivities(prev => prev.map(act =>
        act.id === editingId
          ? { ...act, latest: updated, versions: [...act.versions, updated] }
          : act
      ));

      setEditingId(null);
      setEditForm({});
      alert('Project updated!');
    } catch (err: any) {
      alert(err.message || 'Update failed');
    }
  };

  const deleteActivity = async (id: string) => {
    if (!confirm('Delete project + all history permanently?')) return;
    try {
      await fieldApi.delete(Number(id));
      setActivities(prev => prev.filter(a => a.id !== id));
      alert('Deleted');
    } catch (err: any) {
      alert(err.message || 'Delete failed');
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-2xl text-emerald-600 font-semibold">Loading projects...</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto min-h-screen bg-gray-50">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 flex items-center gap-3">
            <MapPin className="w-10 h-10 text-emerald-600" />
            Field Projects Tracker
          </h1>
          {activities.length > 0 && (
            <button
              onClick={() => setShowWipe(true)}
              className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl flex items-center gap-2 shadow-lg"
            >
              <AlertTriangle className="w-5 h-5" /> Wipe All
            </button>
          )}
        </div>

        <div className="relative max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search project or town..."
            className="w-full pl-14 pr-6 py-4 text-lg border border-gray-300 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-200 shadow-md"
          />
        </div>
        <p className="text-gray-600 mt-4 text-lg">{filtered.length} of {activities.length} projects</p>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
              <tr>
                <th className="px-8 py-5 text-left">No.</th>
                <th className="px-8 py-5 text-left">Project Name</th>
                <th className="px-8 py-5 text-left">Town / Area</th>
                <th className="px-8 py-5 text-left">Coordinates</th>
                <th className="px-8 py-5 text-left">Last Updated</th>
                <th className="px-8 py-5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((act, i) => {
                const l = act.latest;
                const hasHistory = act.versions.length > 1;

                return (
                  <React.Fragment key={act.id}>
                    <tr className="hover:bg-emerald-50/50 transition-all duration-200">
                      <td className="px-8 py-6 font-medium text-gray-700">{i + 1}</td>
                      <td className="px-8 py-6">
                        <div className="font-bold text-xl text-gray-900">{l.projectName}</div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="text-emerald-700 font-semibold text-lg">{l.town || '—'}</span>
                      </td>
                      <td className="px-8 py-6 font-mono text-sm">
                        <div className="flex items-center gap-3">
                          <span>{l.lat.toFixed(6)}, {l.lng.toFixed(6)}</span>
                          <button onClick={() => copyCoords(l.lat, l.lng)} className="text-emerald-600 hover:scale-110 transition">
                            <Copy className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-gray-600">
                        {new Date(l.updatedAt).toLocaleDateString('en-GH', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-center gap-4">
                          <a href={`https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-700">
                            <Navigation className="w-6 h-6" />
                          </a>
                          {hasHistory && (
                            <button onClick={() => setHistoryModal(act)} className="text-amber-600 hover:text-amber-700 transform hover:scale-110 transition">
                              <History className="w-6 h-6" />
                            </button>
                          )}
                          <button onClick={() => setExpandedId(expandedId === act.id ? null : act.id)}>
                            {expandedId === act.id ? <ChevronUp className="w-6 h-6 text-emerald-600" /> : <ChevronDown className="w-6 h-6 text-gray-500" />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expandedId === act.id && (
                      <tr>
                        <td colSpan={6} className="bg-gradient-to-br from-emerald-50 to-teal-50 px-10 py-8">
                          {editingId === act.id ? (
                            <div className="space-y-6 max-w-4xl mx-auto">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <input placeholder="Project Name" value={editForm.projectName || ''} onChange={e => setEditForm({ ...editForm, projectName: e.target.value })} className="px-6 py-4 border-2 border-gray-200 rounded-2xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100" />
                                <input placeholder="Town / Area" value={editForm.town || ''} onChange={e => setEditForm({ ...editForm, town: e.target.value })} className="px-6 py-4 border-2 border-gray-200 rounded-2xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100" />
                              </div>
                              <input placeholder="Coordinates" value={editForm.lat && editForm.lng ? `${editForm.lat}, ${editForm.lng}` : ''} onChange={e => {
                                const [l, g] = e.target.value.split(',').map(s => s.trim());
                                setEditForm({ ...editForm, lat: l, lng: g });
                              }} className="w-full px-6 py-4 border-2 border-gray-200 rounded-2xl font-mono" />
                              <textarea placeholder="Description" value={editForm.description || ''} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={4} className="w-full px-6 py-4 border-2 border-gray-200 rounded-2xl resize-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100" />
                              <div className="flex gap-4">
                                <button onClick={saveEdit} className="flex-1 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl transition">Save New Version</button>
                                <button onClick={() => { setEditingId(null); setEditForm({}); }} className="px-8 py-4 border-2 border-gray-300 rounded-2xl hover:bg-gray-100 transition">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                              <div>
                                <p className="text-gray-600 font-medium flex items-center gap-2"><MapPinned className="w-5 h-5" /> Town / Area</p>
                                <p className="text-2xl font-bold text-emerald-700 mt-2">{l.town || '—'}</p>
                              </div>
                              <div>
                                <p className="text-gray-600 font-medium flex items-center gap-2"><FileText className="w-5 h-5" /> Description</p>
                                <p className="text-gray-800 leading-relaxed mt-2">{l.description || 'No description provided.'}</p>
                              </div>
                              <div className="col-span-2 mt-6 flex gap-4">
                                <button onClick={() => startEdit(act)} className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-3">
                                  <Edit2 className="w-5 h-5" /> Edit Project
                                </button>
                                <button onClick={() => deleteActivity(act.id)} className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-3">
                                  <Trash2 className="w-5 h-5" /> Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </-mobile>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-5">
        {filtered.map((act, i) => {
          const l = act.latest;
          const hasHistory = act.versions.length > 1;

          return (
            <div key={act.id} className="bg-white rounded-3xl shadow-xl overflow-hidden transform transition-all hover:scale-[1.02]">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-bold text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full">#{i + 1}</span>
                      <h3 className="text-xl font-bold text-gray-900">{l.projectName}</h3>
                    </div>
                    <p className="text-emerald-700 font-semibold text-lg">{l.town || '—'}</p>
                  </div>
                  <div className="flex gap-3">
                    {hasHistory && (
                      <button onClick={() => setHistoryModal(act)} className="p-3 bg-amber-100 rounded-xl">
                        <History className="w-6 h-6 text-amber-600" />
                      </button>
                    )}
                    <button onClick={() => setExpandedId(expandedId === act.id ? null : act.id)}>
                      {expandedId === act.id ? <ChevronUp className="w-7 h-7 text-emerald-600" /> : <ChevronDown className="w-7 h-7 text-gray-400" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3 font-mono text-sm bg-gray-100 px-4 py-2 rounded-xl">
                    <span>{l.lat.toFixed(6)}, {l.lng.toFixed(6)}</span>
                    <button onClick={() => copyCoords(l.lat, l.lng)}>
                      <Copy className="w-5 h-5 text-emerald-600" />
                    </button>
                  </div>
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`} target="_blank" rel="noopener noreferrer">
                    <Navigation className="w-8 h-8 text-emerald-600" />
                  </a>
                </div>

                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <Calendar className="w-4 h-4" />
                  {new Date(l.updatedAt).toLocaleDateString('en-GH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>

              {expandedId === act.id && (
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 px-6 py-6 border-t-4 border-emerald-200">
                  {editingId === act.id ? (
                    <div className="space-y-5">
                      <input placeholder="Project Name" value={editForm.projectName || ''} onChange={e => setEditForm({ ...editForm, projectName: e.target.value })} className="w-full px-5 py-4 border-2 rounded-2xl" />
                      <input placeholder="Town" value={editForm.town || ''} onChange={e => setEditForm({ ...editForm, town: e.target.value })} className="w-full px-5 py-4 border-2 rounded-2xl" />
                      <input placeholder="Coordinates" value={editForm.lat && editForm.lng ? `${editForm.lat}, ${editForm.lng}` : ''} onChange={e => {
                        const [l, g] = e.target.value.split(',').map(s => s.trim());
                        setEditForm({ ...editForm, lat: l, lng: g });
                      }} className="w-full px-5 py-4 border-2 rounded-2xl font-mono text-sm" />
                      <textarea placeholder="Description" value={editForm.description || ''} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={4} className="w-full px-5 py-4 border-2 rounded-2xl resize-none" />
                      <div className="flex gap-4">
                        <button onClick={saveEdit} className="flex-1 py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg">Save</button>
                        <button onClick={() => setEditingId(null)} className="flex-1 py-4 border-2 rounded-2xl">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-gray-700 leading-relaxed mb-6">{l.description || 'No description'}</p>
                      <div className="flex gap-4">
                        <button onClick={() => startEdit(act)} className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2">
                          <Edit2 className="w-5 h-5" /> Edit
                        </button>
                        <button onClick={() => deleteActivity(act.id)} className="flex-1 py-4 bg-red-600 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2">
                          <Trash2 className="w-5 h-5" /> Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* HISTORY MODAL */}
      {historyModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-8 py-6 px-8 flex justify-between items-center rounded-t-3xl">
              <div className="flex items-center gap-4">
                <History className="w-10 h-10" />
                <div>
                  <h2 className="text-2xl font-bold">{historyModal.latest.projectName}</h2>
                  <p className="text-emerald-100">Version History</p>
                </div>
              </div>
              <button onClick={() => setHistoryModal(null)} className="p-3 bg-white/20 rounded-xl hover:bg-white/30 transition">
                <X className="w-7 h-7" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {historyModal.versions
                .slice()
                .reverse()
                .map((v, i, arr) => (
                  <div
                    key={v.id}
                    className={`rounded-2xl p-6 border-3 transition-all ${
                      v.id === historyModal.latest.id
                        ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-400 shadow-lg'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-3">
                        <Clock className="w-6 h-6 text-gray-600" />
                        <span className="font-bold text-lg">
                          {v.id === historyModal.latest.id ? 'Current Version' : `Version ${arr.length - i}`}
                        </span>
                        {v.id === historyModal.latest.id && (
                          <span className="bg-emerald-600 text-white px-4 py-1 rounded-full text-sm font-bold">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-gray-500">
                        {new Date(v.updatedAt).toLocaleDateString('en-GH', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: 'numeric'
                        })}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <p className="text-gray-600 font-medium">Project Name</p>
                        <p className="text-xl font-bold text-gray-900 mt-1">{v.projectName}</p>
                      </div>
                      <div>
                        <p className="text-gray-600 font-medium">Town / Area</p>
                        <p className="text-xl font-semibold text-emerald-700 mt-1">{v.town || '—'}</p>
                      </div>
                      <div>
                        <p className="text-gray-600 font-medium">Coordinates</p>
                        <p className="font-mono text-sm bg-gray-100 px-3 py-2 rounded-lg mt-1">
                          {v.lat.toFixed(6)}, {v.lng.toFixed(6)}
                        </p>
                      </div>
                    </div>

                    {v.description && (
                      <div className="mt-6">
                        <p className="text-gray-600 font-medium mb-2">Description</p>
                        <div className="bg-white p-5 rounded-xl border border-gray-200 text-gray-800 leading-relaxed">
                          {v.description}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* WIPE ALL MODAL */}
      {showWipe && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
            <AlertTriangle className="w-20 h-20 text-red-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-3">Delete All Data?</h2>
            <p className="text-gray-600 mb-8">
              This will permanently remove <strong>{activities.length}</strong> projects and all history.
            </p>
            <div className="flex gap-4">
              <button onClick={() => setShowWipe(false)} className="flex-1 py-4 border-2 rounded-2xl font-bold">Cancel</button>
              <button onClick={async () => {
                for (const act of activities) {
                  await fieldApi.delete(Number(act.id)).catch(() => {});
                }
                setActivities([]);
                setShowWipe(false);
                alert('All data wiped');
              }} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold shadow-lg">
                Yes, Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivitiesTable;