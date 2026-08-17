// src/pages/assets/maintenance/[id].tsx
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Wrench, Calendar, User, DollarSign, AlertCircle, Clock, CheckCircle, Package, Edit2, X, Camera, Save, Loader2 } from 'lucide-react';
import { assetApi } from '../../../api';

interface Maintenance {
  id: string;
  asset_id: string;
  asset_name?: string;
  asset_tag?: string;
  type: 'repair' | 'service' | 'inspection' | 'upgrade';
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'not_fixable';
  technician?: string;
  cost?: number;
  start_date: string;
  completion_date?: string;
  notes?: string;
  photos: string[];
  created_at: string;
  updated_at?: string;
}

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pending: { label: 'Pending', color: 'text-orange-800', bg: 'bg-orange-100', icon: Clock },
  in_progress: { label: 'In Progress', color: 'text-blue-800', bg: 'bg-blue-100', icon: Wrench },
  completed: { label: 'Completed', color: 'text-emerald-800', bg: 'bg-emerald-100', icon: CheckCircle },
  not_fixable: { label: 'Not Fixable', color: 'text-red-800', bg: 'bg-red-100', icon: AlertCircle },
};

const typeIcon: Record<string, any> = {
  repair: AlertCircle,
  service: Wrench,
  inspection: Calendar,
  upgrade: Package,
};

export default function MaintenanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [maintenance, setMaintenance] = useState<Maintenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [edited, setEdited] = useState<Partial<Maintenance>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    assetApi.getMaintenanceRecord(id)
      .then((r) => {
        setMaintenance(r);
        setEdited({});
      })
      .catch(() => setMaintenance(null))
      .finally(() => setLoading(false));
  }, [id]);

  const saveUpdate = async () => {
    if (!maintenance || !id) return;
    const completion = edited.status === 'completed' || edited.status === 'not_fixable'
      ? (edited.completion_date || new Date().toISOString().split('T')[0])
      : edited.completion_date;
    setSaving(true);
    try {
      const updated = await assetApi.updateMaintenanceRecord(id, {
        type: edited.type ?? maintenance.type,
        description: edited.description ?? maintenance.description,
        status: edited.status ?? maintenance.status,
        technician: edited.technician !== undefined ? edited.technician : maintenance.technician,
        cost: edited.cost !== undefined ? edited.cost : maintenance.cost,
        start_date: edited.start_date ?? maintenance.start_date,
        completion_date: completion !== undefined ? completion : maintenance.completion_date,
        notes: edited.notes !== undefined ? edited.notes : maintenance.notes,
        photos: edited.photos ?? maintenance.photos,
      });
      setMaintenance(updated);
      setIsEditing(false);
      setEdited({});
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newPhotos: string[] = [];
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        newPhotos.push(reader.result as string);
        if (newPhotos.length === files.length) {
          setEdited(prev => ({ ...prev, photos: [...(maintenance?.photos || []), ...newPhotos] }));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-gray-400 animate-spin" />
      </div>
    );
  }
  if (maintenance === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Wrench className="h-20 w-20 text-gray-300 mx-auto mb-6 animate-pulse" />
          <h2 className="text-2xl font-bold text-gray-900">Loading maintenance record...</h2>
          <Link to="/assets/maintenance" className="mt-6 inline-block text-blue-600 hover:underline">
            ← Back to Maintenance
          </Link>
        </div>
      </div>
    );
  }

  const current = { ...maintenance, ...edited };
  const StatusIcon = (statusConfig[current.status] || statusConfig.pending).icon;
  const TypeIcon = typeIcon[current.type] || Wrench;
  const hasPhotos = Array.isArray(current.photos) && current.photos.length > 0;
  const mainPhoto = hasPhotos ? current.photos[0] : null;
  const statusLabel = (statusConfig[current.status] || statusConfig.pending).label;
  const statusColor = (statusConfig[current.status] || statusConfig.pending).color;
  const statusBg = (statusConfig[current.status] || statusConfig.pending).bg;

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex justify-between items-center mb-6">
          <Link to="/assets/maintenance" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 text-base font-medium">
            <ArrowLeft className="h-5 w-5" />
            Back
          </Link>

          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium text-sm shadow-md transition"
            >
              <Edit2 className="h-4 w-4" />
              Update
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => { setIsEditing(false); setEdited({}); }}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                onClick={saveUpdate}
                disabled={saving}
                className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-medium text-sm shadow-md transition disabled:opacity-70"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Side */}
          <div className="lg:col-span-2 space-y-6">
            {/* Hero Image + Status */}
            <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden shadow-[var(--shadow-md)]">
              {mainPhoto ? (
                <img src={mainPhoto} alt="Issue" className="w-full h-64 object-cover" />
              ) : (
                <div className="h-64 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <Wrench className="h-20 w-20 text-gray-400" />
                </div>
              )}

              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${statusBg}`}>
                    <StatusIcon className="h-6 w-6 text-current" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Status</p>
                    <p className={`text-lg font-bold ${statusColor}`}>
                      {statusLabel}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-6 shadow-[var(--shadow-md)]">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Timeline</h3>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Reported</p>
                    <p className="text-xs text-gray-600">{new Date(maintenance.created_at).toLocaleDateString()} {new Date(maintenance.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                  </div>
                </div>

                {current.start_date && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Wrench className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Work Started</p>
                      <p className="text-xs text-gray-600">{new Date(current.start_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}

                {current.completion_date && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Completed</p>
                      <p className="text-xs text-gray-600">{new Date(current.completion_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-500 pt-3 border-t border-gray-200">
                  Last updated: {new Date(current.updated_at || maintenance.created_at).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Photos */}
            {hasPhotos && (
              <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-6 shadow-[var(--shadow-md)]">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Photos ({current.photos.length})</h3>
                  {isEditing && (
                    <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-lg hover:bg-gray-200 transition text-sm">
                      <Camera className="h-4 w-4" />
                      Add
                      <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  )}
                </div>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                  {current.photos.map((photo, i) => (
                    <img
                      key={i}
                      src={photo}
                      alt={`Photo ${i + 1}`}
                      className="rounded-lg object-cover h-32 w-full shadow-sm hover:shadow-md transition cursor-pointer"
                      onClick={() => window.open(photo, '_blank')}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Side */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-6 shadow-[var(--shadow-md)]">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Asset</h3>
              <Link to={`/assets/${maintenance.asset_id}`} className="block hover:bg-gray-50 -m-2 p-2 rounded-lg transition">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Package className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{maintenance.asset_name || 'Asset'}</p>
                    <p className="text-xs font-mono text-gray-500">#{maintenance.asset_tag || maintenance.asset_id}</p>
                  </div>
                </div>
              </Link>
            </div>

            <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-6 shadow-[var(--shadow-md)]">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Details</h3>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <TypeIcon className="h-6 w-6 text-gray-500" />
                  <div>
                    <p className="text-xs text-gray-600">Type</p>
                    <p className="text-sm font-semibold capitalize">{current.type.replace('_', ' ')}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-600 mb-1">Issue</p>
                  <p className="text-sm text-gray-700">{current.description}</p>
                </div>

                {/* Editable Fields */}
                {isEditing ? (
                  <>
                    <div>
                      <label className="text-xs font-medium text-gray-700">Status</label>
                      <select
                        value={current.status}
                        onChange={(e) => setEdited(prev => ({ ...prev, status: e.target.value as any }))}
                        className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="not_fixable">Not Fixable</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-700">Technician</label>
                      <input
                        type="text"
                        value={current.technician || ''}
                        onChange={(e) => setEdited(prev => ({ ...prev, technician: e.target.value || undefined }))}
                        placeholder="Name"
                        className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-700">Cost (₱)</label>
                      <input
                        type="number"
                        value={current.cost || ''}
                        onChange={(e) => setEdited(prev => ({ ...prev, cost: e.target.value ? Number(e.target.value) : undefined }))}
                        placeholder="0.00"
                        className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-700">Completion Date</label>
                      <input
                        type="date"
                        value={current.completion_date || ''}
                        onChange={(e) => setEdited(prev => ({ ...prev, completion_date: e.target.value || undefined }))}
                        className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700">Notes</label>
                      <textarea
                        rows={3}
                        value={current.notes || ''}
                        onChange={(e) => setEdited(prev => ({ ...prev, notes: e.target.value || undefined }))}
                        placeholder="Details..."
                        className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {current.technician && (
                      <div className="flex items-center gap-3">
                        <User className="h-6 w-6 text-gray-500" />
                        <div>
                          <p className="text-xs text-gray-600">Technician</p>
                          <p className="text-sm font-semibold">{current.technician}</p>
                        </div>
                      </div>
                    )}

                    {current.cost ? (
                      <div className="flex items-center gap-3">
                        <DollarSign className="h-6 w-6 text-gray-500" />
                        <div>
                          <p className="text-xs text-gray-600">Cost</p>
                          <p className="text-sm font-bold">₱{current.cost.toLocaleString()}</p>
                        </div>
                      </div>
                    ) : null}

                    {current.notes && (
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Notes</p>
                        <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded-lg">{current.notes}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
