'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Edit2,
  Trash2,
  Copy,
  Navigation,
  Search,
  ChevronDown,
  ChevronUp,
  History,
  Clock,
  X,
  Calendar,
  MapPinned,
  FileText,
  CheckCircle,
  AlertCircle,
  Plus,
  Upload,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { fieldApi, FieldActivity } from '@/api';

interface Activity {
  id: string;
  versions: FieldActivity[];
  latest: FieldActivity;
}

const PAGE_SIZE = 20;

const ActivitiesTable: React.FC = () => {
  const navigate = useNavigate();
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [displayedActivities, setDisplayedActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FieldActivity>>({});
  const [historyModal, setHistoryModal] = useState<Activity | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [importProgress, setImportProgress] = useState<{
    total: number;
    done: number;
    errors: string[];
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const copyCoords = (lat: number, lng: number) => {
    navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    showToast('Coordinates copied!', 'success');
  };

  const loadActivities = async () => {
    try {
      setLoading(true);
      const latestOnly = await fieldApi.getAll();

      const activities = latestOnly.map((latest) => ({
        id: latest.id.toString(),
        versions: [] as FieldActivity[],
        latest,
      }));

      setAllActivities(activities);
      updateDisplayed(activities, searchQuery, 1);
    } catch (err: any) {
      showToast('Failed to load projects', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivities();
  }, []);

  const updateDisplayed = (activitiesList: Activity[], query: string, page: number) => {
    const lowerQuery = query.toLowerCase();
    const filtered = activitiesList.filter(act => {
      const l = act.latest;
      return l.projectName.toLowerCase().includes(lowerQuery) || (l.town || '').toLowerCase().includes(lowerQuery);
    });

    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    setDisplayedActivities(filtered.slice(start, end));
    setCurrentPage(page);
  };

  useEffect(() => {
    updateDisplayed(allActivities, searchQuery, 1);
  }, [searchQuery, allActivities]);

  const filteredCount = allActivities.filter(act => {
    const q = searchQuery.toLowerCase();
    const l = act.latest;
    return l.projectName.toLowerCase().includes(q) || (l.town || '').toLowerCase().includes(q);
  }).length;

  const totalPages = Math.ceil(filteredCount / PAGE_SIZE);

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages) return;
    updateDisplayed(allActivities, searchQuery, page);
  };

  const startEdit = (act: Activity) => {
    const l = act.latest;
    setEditingId(act.id);
    setEditForm({
      projectName: l.projectName,
      town: l.town || '',
      description: l.description || '',
      lat: l.lat,
      lng: l.lng,
    });
  };

  const saveEdit = async () => {
    if (!editingId || !editForm.projectName?.trim() || !editForm.town?.trim()) {
      showToast('Project Name & Town are required', 'error');
      return;
    }

    try {
      const updated = await fieldApi.update(Number(editingId), {
        projectName: editForm.projectName!.trim(),
        town: editForm.town!.trim(),
        description: editForm.description?.trim() || '',
        lat: Number(editForm.lat),
        lng: Number(editForm.lng),
      });
      
      const allVersions = await fieldApi.getHistory(updated.projectName).catch(() => [updated]);

      setAllActivities(prev => prev.map(act =>
        act.id === editingId
          ? { ...act, latest: updated, versions: allVersions }
          : act
      ));

      setEditingId(null);
      setEditForm({});
      showToast('Project updated successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Update failed', 'error');
    }
  };

  const confirmDelete = (id: string) => {
    setDeleteConfirm(id);
  };

  const deleteActivity = async () => {
    if (!deleteConfirm) return;

    try {
      await fieldApi.delete(Number(deleteConfirm));
      await loadActivities();
      setDeleteConfirm(null);
      showToast('Project deleted successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Delete failed', 'error');
    }
  };

  const openHistory = async (act: Activity) => {
    try {
      const allVersions = await fieldApi.getHistory(act.latest.projectName).catch(() => [act.latest]);

      setHistoryModal({
        ...act,
        versions: allVersions,
      });
    } catch (err) {
      showToast('Failed to load history', 'error');
    }
  };

  const handleJsonImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        showToast('Invalid JSON file. Please check the format.', 'error');
        return;
      }

      let features: any[] = [];

      if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
        features = data.features;
      } else if (Array.isArray(data)) {
        features = data;
      } else {
        showToast('Unsupported format. Expected GeoJSON or array of points.', 'error');
        return;
      }

      if (features.length === 0) {
        showToast('No locations found in the file.', 'error');
        return;
      }

      setImportProgress({ total: features.length, done: 0, errors: [] });

      const errors: string[] = [];

      for (let i = 0; i < features.length; i++) {
        const feature = features[i];
        const props = feature.properties || {};
        let coords = feature.geometry?.coordinates || feature.coordinates;

        if (!coords && feature.lat !== undefined && feature.lng !== undefined) {
          coords = [feature.lng, feature.lat];
        }

        if (!coords || !Array.isArray(coords) || coords.length < 2) {
          errors.push(`Row ${i + 1}: Missing or invalid coordinates`);
          continue;
        }

        const [lng, lat] = coords;

        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          errors.push(`Row ${i + 1}: Invalid coordinates (${lat}, ${lng})`);
          continue;
        }

        let projectName = (props.name || props.title || props.address || '').trim();
        if (!projectName) {
          projectName = `Imported Site ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }
        projectName = projectName.substring(0, 100);

        const address = (props.address || '').toString().toLowerCase();
        let town = '—';
        if (address.includes('accra')) town = 'Accra';
        else if (address.includes('kumasi')) town = 'Kumasi';
        else if (address.includes('tema')) town = 'Tema';
        else if (address.includes('takoradi')) town = 'Takoradi';

        try {
          const payload = {
            projectName,
            town,
            description: 'Imported from JSON file on Dec 2025. Please review and update details.',
            lat: parseFloat(lat.toFixed(7)),
            lng: parseFloat(lng.toFixed(7)),
          };

          try {
            await fieldApi.create(payload);
          } catch (createErr: any) {
            if (!String(createErr?.message || '').includes('already exists')) {
              throw createErr;
            }
          }

          setImportProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null);
        } catch (err: any) {
          errors.push(`Row ${i + 1} "${projectName}": ${err.message || 'Failed'}`);
          setImportProgress(prev => prev ? { ...prev, errors } : null);
        }

        await new Promise(r => setTimeout(r, 100));
      }

      await loadActivities();

      const successCount = features.length - errors.length;
      showToast(`Import complete! ${successCount} sites added${errors.length > 0 ? `, ${errors.length} failed` : ''}.`, successCount > 0 ? 'success' : 'error');
    } catch (err: any) {
      showToast('Import failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setImportProgress(null);
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-2xl text-emerald-600 font-semibold">Loading projects...</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto min-h-screen bg-gray-50">
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 flex items-center gap-3">
            <MapPin className="w-10 h-10 text-emerald-600" />
            Field Projects Tracker
          </h1>

          <div className="flex gap-4">
            <button
              onClick={() => document.getElementById('json-import-input')?.click()}
              disabled={!!importProgress}
              className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-60 text-white font-bold rounded-2xl shadow-lg transition-all transform hover:scale-105"
            >
              <Upload className="w-6 h-6" />
              <span className="hidden sm:inline">
                {importProgress ? `Importing (${importProgress.done}/${importProgress.total})` : 'Import Sites from JSON'}
              </span>
              <span className="sm:hidden">Import JSON</span>
            </button>

            <button
              onClick={() => navigate('/field/add')}
              className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-2xl shadow-lg transition-all transform hover:scale-105"
            >
              <Plus className="w-6 h-6" />
              <span className="hidden sm:inline">Add New Project</span>
              <span className="sm:hidden">Add Project</span>
            </button>
          </div>
        </div>

        <input
          id="json-import-input"
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleJsonImport}
        />

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

        <div className="flex justify-between items-center mt-4">
          <p className="text-gray-600 text-lg">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredCount)} of {filteredCount} projects
          </p>

          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 rounded-lg bg-white shadow hover:bg-gray-100 disabled:opacity-50"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg bg-white shadow hover:bg-gray-100 disabled:opacity-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {importProgress && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Importing Sites...</h3>
            <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden mb-4">
              <div
                className="bg-gradient-to-r from-purple-600 to-indigo-600 h-full transition-all duration-500"
                style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-xl font-semibold text-gray-700">
              {importProgress.done} / {importProgress.total}
            </p>
            <p className="text-sm text-gray-500 mt-2">Adding to database...</p>
            {importProgress.errors.length > 0 && (
              <p className="text-red-600 text-sm mt-4">
                {importProgress.errors.length} error(s) — check console
              </p>
            )}
          </div>
        </div>
      )}

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
              {displayedActivities.map((act, i) => {
                const l = act.latest;
                const globalIndex = (currentPage - 1) * PAGE_SIZE + i + 1;

                return (
                  <React.Fragment key={act.id}>
                    <tr className="hover:bg-emerald-50/50 transition-all duration-200">
                      <td className="px-8 py-6 font-medium text-gray-700">{globalIndex}</td>
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
                          <button onClick={() => openHistory(act)} className="text-amber-600 hover:text-amber-700 transform hover:scale-110 transition">
                            <History className="w-6 h-6" />
                          </button>
                          <button onClick={() => setExpandedId(expandedId === act.id ? null : act.id)}>
                            {expandedId === act.id ? <ChevronUp className="w-6 h-6 text-emerald-600" /> : <ChevronDown className="w-6 h-6 text-gray-500" />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expandedId === act.id && (
                      <tr>
                        <td colSpan={6} className="bg-gradient-to-br from-emerald-50 to-teal-50 px-6 sm:px-10 py-8">
                          {editingId === act.id ? (
                            <div className="space-y-6 max-w-4xl mx-auto">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">Project Name</label>
                                  <input value={editForm.projectName || ''} onChange={e => setEditForm({ ...editForm, projectName: e.target.value })} className="w-full px-5 py-4 border border-gray-300 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-200 shadow-sm" />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">Town / Area</label>
                                  <input value={editForm.town || ''} onChange={e => setEditForm({ ...editForm, town: e.target.value })} className="w-full px-5 py-4 border border-gray-300 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-200 shadow-sm" />
                                </div>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Coordinates (e.g. 6.6666, -1.6162)</label>
                                <input 
                                  value={editForm.lat && editForm.lng ? `${editForm.lat}, ${editForm.lng}` : ''} 
                                  onChange={e => {
                                    const [lat, lng] = e.target.value.split(',').map(s => s.trim());
                                    setEditForm({ ...editForm, lat: lat ? Number(lat) : undefined, lng: lng ? Number(lng) : undefined });
                                  }} 
                                  className="w-full px-5 py-4 border border-gray-300 rounded-2xl font-mono text-sm focus:outline-none focus:ring-4 focus:ring-emerald-200 shadow-sm" 
                                />
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                                <textarea
                                  value={editForm.description || ''}
                                  onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                  rows={4}
                                  className="w-full px-5 py-4 border border-gray-300 rounded-2xl resize-none focus:outline-none focus:ring-4 focus:ring-emerald-200 shadow-sm"
                                />
                              </div>

                              <div className="flex gap-4">
                                <button onClick={saveEdit} className="flex-1 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl transition">Save New Version</button>
                                <button onClick={() => { setEditingId(null); setEditForm({}); }} className="px-8 py-4 border-2 border-gray-300 rounded-2xl hover:bg-gray-100 transition">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <div>
                                <p className="text-gray-600 font-medium flex items-center gap-2"><MapPinned className="w-5 h-5" /> Town / Area</p>
                                <p className="text-2xl font-bold text-emerald-700 mt-2">{l.town || '—'}</p>
                              </div>
                              <div>
                                <p className="text-gray-600 font-medium flex items-center gap-2"><FileText className="w-5 h-5" /> Description</p>
                                <p className="text-gray-800 leading-relaxed mt-2">{l.description || 'No description provided.'}</p>
                              </div>
                              <div className="col-span-2 mt-6 flex gap-3">
                                <button 
                                  onClick={() => startEdit(act)} 
                                  className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg transition"
                                >
                                  <Edit2 className="w-5 h-5" />
                                  Edit
                                </button>
                                <button 
                                  onClick={() => confirmDelete(act.id)}
                                  className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl shadow-lg transition"
                                  title="Delete project"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="lg:hidden space-y-6">
        {displayedActivities.map((act, i) => {
          const l = act.latest;
          const globalIndex = (currentPage - 1) * PAGE_SIZE + i + 1;

          return (
            <div key={act.id} className="bg-white rounded-3xl shadow-xl overflow-hidden">
              <div className="p-5">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">#{globalIndex}</span>
                      <h3 className="text-lg font-bold text-gray-900">{l.projectName}</h3>
                    </div>
                    <p className="text-emerald-700 font-medium text-base">{l.town || '—'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openHistory(act)} className="p-2.5 bg-amber-100 rounded-xl">
                      <History className="w-5 h-5 text-amber-600" />
                    </button>
                    <button onClick={() => setExpandedId(expandedId === act.id ? null : act.id)}>
                      {expandedId === act.id ? <ChevronUp className="w-6 h-6 text-emerald-600" /> : <ChevronDown className="w-6 h-6 text-gray-400" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 font-mono text-xs bg-gray-100 px-3 py-2 rounded-lg">
                    <span>{l.lat.toFixed(6)}, {l.lng.toFixed(6)}</span>
                    <button onClick={() => copyCoords(l.lat, l.lng)}>
                      <Copy className="w-4 h-4 text-emerald-600" />
                    </button>
                  </div>
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`} target="_blank" rel="noopener noreferrer">
                    <Navigation className="w-7 h-7 text-emerald-600" />
                  </a>
                </div>

                <div className="flex items-center gap-2 text-gray-500 text-xs">
                  <Calendar className="w-4 h-4" />
                  {new Date(l.updatedAt).toLocaleDateString('en-GH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>

              {expandedId === act.id && (
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 px-5 py-6 border-t-4 border-emerald-200">
                  {editingId === act.id ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Project Name</label>
                        <input value={editForm.projectName || ''} onChange={e => setEditForm({ ...editForm, projectName: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Town / Area</label>
                        <input value={editForm.town || ''} onChange={e => setEditForm({ ...editForm, town: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Coordinates</label>
                        <input 
                          value={editForm.lat && editForm.lng ? `${editForm.lat}, ${editForm.lng}` : ''} 
                          onChange={e => {
                            const [lat, lng] = e.target.value.split(',').map(s => s.trim());
                            setEditForm({ ...editForm, lat: lat ? Number(lat) : undefined, lng: lng ? Number(lng) : undefined });
                          }} 
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl font-mono text-xs" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                          value={editForm.description || ''}
                          onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                          rows={3}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl resize-none text-sm"
                        />
                      </div>
                      <div className="flex gap-3">
                        <button onClick={saveEdit} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl text-sm shadow-lg">Save</button>
                        <button onClick={() => setEditingId(null)} className="flex-1 py-3 border border-gray-300 rounded-xl text-sm">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-gray-700 text-sm leading-relaxed">{l.description || 'No description'}</p>
                      <div className="flex gap-3">
                        <button 
                          onClick={() => startEdit(act)} 
                          className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition text-sm"
                        >
                          <Edit2 className="w-4 h-4" />
                          Edit
                        </button>
                        <button 
                          onClick={() => confirmDelete(act.id)}
                          className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-lg transition"
                          title="Delete project"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {historyModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6 flex justify-between items-center rounded-t-3xl">
              <div className="flex items-center gap-3">
                <History className="w-8 h-8" />
                <div>
                  <h2 className="text-xl font-bold">{historyModal.latest.projectName}</h2>
                  <p className="text-emerald-100 text-sm">Version History</p>
                </div>
              </div>
              <button onClick={() => setHistoryModal(null)} className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {historyModal.versions.length <= 1 ? (
                <div className="text-center py-10 text-gray-500">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No previous versions yet</p>
                </div>
              ) : (
                historyModal.versions
                  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                  .map((v, i) => (
                    <div
                      key={v.id}
                      className={`rounded-2xl p-5 border-2 transition-all ${
                        v.id === historyModal.latest.id
                          ? 'bg-emerald-50 border-emerald-400 shadow-md'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          <Clock className="w-5 h-5 text-gray-600" />
                          <span className="font-bold text-base">
                            {v.id === historyModal.latest.id ? 'Current Version' : `Version ${historyModal.versions.length - i}`}
                          </span>
                          {v.id === historyModal.latest.id && (
                            <span className="bg-emerald-600 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> ACTIVE
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(v.updatedAt).toLocaleDateString('en-GH', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: 'numeric'
                          })}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600 font-medium">Project Name</p>
                          <p className="font-bold text-gray-900">{v.projectName}</p>
                        </div>
                        <div>
                          <p className="text-gray-600 font-medium">Town / Area</p>
                          <p className="font-semibold text-emerald-700">{v.town || '—'}</p>
                        </div>
                        <div>
                          <p className="text-gray-600 font-medium">Coordinates</p>
                          <p className="font-mono text-xs bg-gray-100 px-3 py-1 rounded">
                            {v.lat.toFixed(6)}, {v.lng.toFixed(6)}
                          </p>
                        </div>
                      </div>

                      {v.description && (
                        <div className="mt-4">
                          <p className="text-gray-600 font-medium text-xs mb-1">Description</p>
                          <div className="bg-white p-4 rounded-xl border border-gray-200 text-gray-800 text-sm leading-relaxed shadow-[var(--shadow-md)]">
                            {v.description}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
            <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-3">Delete Project?</h2>
            <p className="text-gray-600 mb-6 text-sm">
              This will permanently delete this project and all its history.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 border-2 border-gray-300 rounded-2xl font-bold hover:bg-gray-100 transition text-sm">
                Cancel
              </button>
              <button onClick={deleteActivity} className="flex-1 py-3 bg-red-600 text-white rounded-2xl font-bold shadow-lg hover:bg-red-700 transition text-sm">
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 duration-500">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl text-white font-semibold text-sm ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}>
            {toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivitiesTable;