// src/pages/assets/assignments/[id].tsx – Person detail: assign asset & return (API)
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, User, Mail, Phone, Building, Package, Calendar, CheckCircle, Loader2 } from 'lucide-react';
import { assetApi } from '../../../api';

interface Person {
  id: number | string;
  first_name: string;
  last_name: string;
  personnel_number?: string;
  location?: string;
  group?: string;
  job_title?: string;
  email?: string;
  phone?: string;
}

interface AssignmentRow {
  id: number;
  asset_id: string | number;
  asset_name: string;
  asset_tag: string;
  assigned_date: string;
  status: 'assigned' | 'returned';
  condition_before?: string;
  notes_before?: string;
}

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const [person, setPerson] = useState<Person | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState('');
  const [conditionBefore, setConditionBefore] = useState('Good');
  const [notesBefore, setNotesBefore] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [returnAssignmentId, setReturnAssignmentId] = useState<number | null>(null);
  const [conditionAfter, setConditionAfter] = useState('Good');
  const [notesAfter, setNotesAfter] = useState('');
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      assetApi.getPerson(id),
      assetApi.getAssignmentsByPerson(id),
      assetApi.getAssets(),
    ])
      .then(([p, list, a]) => {
        setPerson(p);
        setAssignments(Array.isArray(list) ? list : []);
        setAssets(a || []);
      })
      .catch(() => setPerson(null))
      .finally(() => setLoading(false));
  }, [id]);

  const availableAssets = assets.filter((a: any) => a.status === 'available');
  const activeAssignments = assignments.filter((a) => a.status === 'assigned');

  const assignAsset = async () => {
    if (!selectedAsset || !id) return;
    setAssigning(true);
    try {
      await assetApi.createAssignment({
        asset_id: Number(selectedAsset),
        person_id: Number(id),
        condition_before: conditionBefore,
        notes_before: notesBefore || undefined,
      });
      const [list, a] = await Promise.all([assetApi.getAssignmentsByPerson(id), assetApi.getAssets()]);
      setAssignments(list || []);
      setAssets(a || []);
      setShowAssignForm(false);
      setSelectedAsset('');
      setConditionBefore('Good');
      setNotesBefore('');
    } catch (e) {
      console.error(e);
    } finally {
      setAssigning(false);
    }
  };

  const returnAsset = async (assignmentId: number) => {
    setReturning(true);
    try {
      await assetApi.returnAssignment(assignmentId, { condition_after: conditionAfter, notes_after: notesAfter || undefined });
      const [list, a] = await Promise.all([assetApi.getAssignmentsByPerson(id!), assetApi.getAssets()]);
      setAssignments(list || []);
      setAssets(a || []);
      setReturnAssignmentId(null);
      setConditionAfter('Good');
      setNotesAfter('');
    } catch (e) {
      console.error(e);
    } finally {
      setReturning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-gray-400 animate-spin" />
      </div>
    );
  }
  if (!person) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <User className="h-20 w-20 text-gray-300 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-gray-900">Person not found</h2>
          <Link to="/assets/assignments" className="mt-6 inline-block text-blue-600 hover:underline">← Back to People</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-6">
        <Link to="/assets/assignments" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 text-lg font-medium">
          <ArrowLeft className="h-5 w-5" /> Back to People
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-8">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
                <User className="h-12 w-12" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">{person.first_name} {person.last_name}</h1>
                <p className="text-xl opacity-90 mt-2">#{person.personnel_number || person.id}</p>
                <p className="text-lg opacity-80 mt-1">{person.job_title || '—'} • {person.group || '—'}</p>
              </div>
            </div>
          </div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center gap-4">
              <Mail className="h-6 w-6 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-medium">{person.email || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Phone className="h-6 w-6 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600">Phone</p>
                <p className="font-medium">{person.phone || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Building className="h-6 w-6 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600">Location</p>
                <p className="font-medium">{person.location || '—'}</p>
              </div>
            </div>
          </div>
        </div>

        {!showAssignForm ? (
          <div className="text-center py-12 bg-white rounded-2xl border-2 border-dashed border-gray-300 mb-8">
            <button
              onClick={() => setShowAssignForm(true)}
              className="inline-flex items-center gap-3 px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium shadow-md transition"
            >
              <Package className="h-6 w-6" />
              Assign New Asset
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Assign New Asset</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Asset *</label>
                <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="">Choose asset...</option>
                  {availableAssets.map((asset: any) => (
                    <option key={asset.id} value={asset.id}>{asset.name} (#{asset.tag})</option>
                  ))}
                </select>
                {availableAssets.length === 0 && <p className="text-sm text-amber-600 mt-1">No available assets. All are assigned or in repair.</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Condition Before *</label>
                <select value={conditionBefore} onChange={(e) => setConditionBefore(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                  <option>Perfect</option>
                  <option>Good</option>
                  <option>Fair</option>
                  <option>Needs attention</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea value={notesBefore} onChange={(e) => setNotesBefore(e.target.value)} rows={3} className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none" placeholder="Charger included..." />
              </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
              <button onClick={() => { setShowAssignForm(false); setSelectedAsset(''); }} className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={assignAsset} disabled={!selectedAsset || assigning} className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium flex items-center gap-2">
                {assigning && <Loader2 className="h-5 w-5 animate-spin" />}
                Assign Asset
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Currently Assigned Assets</h2>
            <p className="text-gray-600 mt-1">{activeAssignments.length} asset{activeAssignments.length !== 1 ? 's' : ''} in possession</p>
          </div>
          {activeAssignments.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <Package className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg">No assets assigned</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Asset</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Tag</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Assigned</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Condition</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Notes</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {activeAssignments.map((assignment) => {
                    const asset = assets.find((a: any) => String(a.id) === String(assignment.asset_id));
                    return (
                      <tr key={assignment.id} className="hover:bg-gray-50">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            {asset?.photos?.[0] ? (
                              <img src={asset.photos[0]} alt="" className="w-12 h-12 rounded-lg object-cover" />
                            ) : (
                              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                                <Package className="h-6 w-6 text-gray-400" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-gray-900">{assignment.asset_name}</p>
                              <p className="text-sm text-gray-600">{asset?.category}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 font-mono text-blue-600">#{assignment.asset_tag}</td>
                        <td className="px-6 py-5 text-sm">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-500" />
                            {assignment.assigned_date ? new Date(assignment.assigned_date).toLocaleDateString() : '—'}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-sm font-medium">
                            <CheckCircle className="h-4 w-4" />
                            {assignment.condition_before || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-sm text-gray-600">{assignment.notes_before || '—'}</td>
                        <td className="px-6 py-5 text-right">
                          <button
                            onClick={() => setReturnAssignmentId(assignment.id)}
                            className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium transition"
                          >
                            Return
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {returnAssignmentId !== null && (
            <div className="p-8 bg-gray-50 border-t-2 border-gray-200">
              <h3 className="text-xl font-bold mb-6">Return Asset</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Condition After Return *</label>
                  <select value={conditionAfter} onChange={(e) => setConditionAfter(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
                    <option>Perfect</option>
                    <option>Good</option>
                    <option>Fair</option>
                    <option>Minor damage</option>
                    <option>Major damage</option>
                    <option>Needs repair</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Return Notes</label>
                  <textarea value={notesAfter} onChange={(e) => setNotesAfter(e.target.value)} rows={3} className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none" placeholder="Missing charger..." />
                </div>
              </div>
              <div className="flex justify-end gap-4 mt-6">
                <button onClick={() => setReturnAssignmentId(null)} className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-100">Cancel</button>
                <button onClick={() => returnAsset(returnAssignmentId)} disabled={returning} className="px-8 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-2 disabled:opacity-70">
                  {returning && <Loader2 className="h-5 w-5 animate-spin" />}
                  Confirm Return
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
