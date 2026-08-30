// src/pages/assets/AssetDetail.tsx
import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit2, QrCode, Calendar, DollarSign, MapPin, User, Package, AlertCircle, Clock, CheckCircle, Save, X, Lock, Loader2 } from 'lucide-react';
import { assetApi } from '../../api';
import { ShareButton } from '@/components/ShareButton';

interface Asset {
  id: string;
  name: string;
  tag: string;
  serial_number?: string;
  brand?: string;
  model?: string;
  description?: string;
  category: string;
  category_id?: number | null;
  location: string;
  location_id?: number | null;
  status: string;
  assigned_to?: string;
  assigned_to_id?: number | null;
  purchase_date?: string;
  cost?: string;
  vendor_id?: number | string | null;
  vendor_name?: string;
  warranty_until?: string;
  photos: string[];
  created_at: string;
  updated_at?: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  available: { label: 'Available', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle },
  assigned: { label: 'Assigned', color: 'bg-blue-100 text-blue-800', icon: User },
  in_repair: { label: 'In Repair', color: 'bg-amber-100 text-amber-800', icon: AlertCircle },
  damaged: { label: 'Damaged', color: 'bg-red-100 text-red-800', icon: AlertCircle },
  lost: { label: 'Lost', color: 'bg-gray-100 text-gray-800', icon: AlertCircle },
  retired: { label: 'Retired', color: 'bg-purple-100 text-purple-800', icon: Clock },
};

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedAsset, setEditedAsset] = useState<Partial<Asset>>({});
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([
      assetApi.getAsset(id),
      assetApi.getCategories(),
      assetApi.getLocations(),
      assetApi.getVendors(),
    ])
      .then(([a, cats, locs, vends]) => {
        if (cancelled) return;
        setAsset(a);
        setEditedAsset(a);
        setCategories(cats || []);
        setLocations(locs || []);
        setVendors(vends || []);
      })
      .catch(() => { if (!cancelled) setAsset(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const saveChanges = async () => {
    if (!asset || !id) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: editedAsset.name ?? asset.name,
        serial_number: editedAsset.serial_number,
        brand: editedAsset.brand,
        model: editedAsset.model,
        description: editedAsset.description,
        category_id: editedAsset.category_id ?? (categories.find(c => c.name === editedAsset.category)?.id),
        location_id: editedAsset.location_id ?? (locations.find(l => l.name === editedAsset.location)?.id),
        status: editedAsset.status ?? asset.status,
        assigned_to_id: editedAsset.assigned_to_id ?? asset.assigned_to_id,
        purchase_date: editedAsset.purchase_date,
        cost: editedAsset.cost,
        vendor_id: editedAsset.vendor_id ?? asset.vendor_id,
        warranty_until: editedAsset.warranty_until,
        photos: editedAsset.photos ?? asset.photos,
      };
      const updated = await assetApi.updateAsset(id, payload);
      setAsset(updated);
      setEditedAsset(updated);
      setIsEditing(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-gray-400 animate-spin" />
      </div>
    );
  }
  if (!asset) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="h-20 w-20 text-gray-300 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-gray-900">Asset not found</h2>
          <Link to="/assets" className="mt-6 inline-block text-blue-600 hover:underline">
            ← Back to Assets
          </Link>
        </div>
      </div>
    );
  }

  const current = isEditing ? { ...asset, ...editedAsset } : asset;
  const StatusIcon = statusConfig[current.status]?.icon || CheckCircle;
  const isStatusLocked = current.status === 'assigned' && isEditing;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/assets')}
          className="p-3 bg-white rounded-xl shadow-[var(--shadow-md)] border border-gray-200 hover:shadow-md transition"
        >
          <ArrowLeft className="h-6 w-6 text-gray-700" />
        </button>
        <div>
          {isEditing ? (
          <input
            value={current.name}
            onChange={(e) => setEditedAsset({ ...editedAsset, name: e.target.value })}
            className="text-3xl font-bold text-gray-900 bg-transparent border-b-4 border-gray-300 focus:border-blue-600 outline-none"
          />
          ) : (
          <h1 className="text-3xl font-bold text-gray-900">{current.name}</h1>
          )}
          <p className="text-lg text-gray-500 font-mono">#{current.tag}</p>
        </div>
        </div>

        <div className="flex items-center gap-4">
        {!isEditing ? (
          <>
          <ShareButton
            recordType="asset"
            recordId={current.id}
            pagePath={window.location.pathname}
            pageTitle={current.name}
            recordPreview={{
              title: current.name,
              reference: `#${current.tag}`,
              status: current.status,
              category: current.category,
              location: current.location,
              assigned_to: current.assigned_to,
              serial_number: current.serial_number,
              brand: current.brand,
              model: current.model,
              description: current.description,
            }}
          />
          <button className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-300 rounded-lg hover:shadow-md transition">
            <QrCode className="h-5 w-5" />
            <span className="font-medium">Generate QR</span>
          </button>
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-md transition"
          >
            <Edit2 className="h-5 w-5" />
            Edit Asset
          </button>
          </>
        ) : (
          <div className="flex items-center gap-4">
          <button
            onClick={() => {
            setIsEditing(false);
            setEditedAsset(asset);
            }}
            className="flex items-center gap-2 px-5 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            <X className="h-5 w-5" />
            Cancel
          </button>
          <button
            onClick={saveChanges}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium shadow-md transition disabled:opacity-70"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            Save Changes
          </button>
          </div>
        )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Photos + Status */}
        <div className="lg:col-span-2 space-y-8">
        {/* Photo Gallery */}
        <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-gray-200 overflow-hidden">
          {(current.photos || []).length > 0 ? (
          <>
            <img
            src={current.photos[currentPhotoIndex]}
            alt={current.name}
            className="w-full h-96 object-cover"
            />
            {(current.photos || []).length > 1 && (
            <div className="flex gap-2 p-4 overflow-x-auto bg-gray-50">
              {(current.photos || []).map((photo, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentPhotoIndex(idx)}
                className={`flex-shrink-0 rounded-lg overflow-hidden border-4 transition ${
                idx === currentPhotoIndex ? 'border-blue-500' : 'border-transparent'
                }`}
              >
                <img src={photo} alt="" className="w-24 h-24 object-cover" />
              </button>
              ))}
            </div>
            )}
          </>
          ) : (
          <div className="h-96 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <Package className="h-24 w-24 text-gray-400" />
          </div>
          )}
        </div>

        {/* Status Card */}
        <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-gray-200 p-8">
          <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm text-gray-600">Current Status</p>
            <div className="flex items-center gap-3 mt-2">
            <StatusIcon className="h-8 w-8 text-gray-700" />
            {isEditing ? (
              <div className="relative">
              {isStatusLocked ? (
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-full cursor-not-allowed">
                <Lock className="h-5 w-5" />
                <span className="font-bold">Locked while assigned</span>
                </div>
              ) : (
                <select
                value={current.status}
                onChange={(e) => setEditedAsset({ ...editedAsset, status: e.target.value })}
                className="px-4 py-2 rounded-full text-sm font-bold bg-white border border-gray-300 focus:ring-2 focus:ring-blue-500"
                >
                <option value="available">Available</option>
                <option value="assigned">Assigned</option>
                <option value="in_repair">In Repair</option>
                <option value="damaged">Damaged</option>
                <option value="lost">Lost</option>
                <option value="retired">Retired</option>
                </select>
              )}
              </div>
            ) : (
              <span className={`px-4 py-2 rounded-full text-sm font-bold ${statusConfig[current.status]?.color || 'bg-gray-100 text-gray-800'}`}>
              {statusConfig[current.status]?.label || current.status.replace('_', ' ')}
              </span>
            )}
            </div>
          </div>
          {current.assigned_to && (
            <div>
            <p className="text-gray-600">Assigned To</p>
            <p className="text-xl font-semibold mt-2">{current.assigned_to}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-gray-600">Location</p>
            <div className="flex items-center gap-2 mt-2">
            <MapPin className="h-5 w-5 text-gray-500" />
            {isEditing ? (
              <select
              value={current.location_id ?? locations.find(l => l.name === current.location)?.id ?? ''}
              onChange={(e) => setEditedAsset({ ...editedAsset, location_id: e.target.value ? Number(e.target.value) : null, location: locations.find(l => l.id === Number(e.target.value))?.name })}
              className="font-medium bg-transparent border-b-2 border-gray-300 focus:border-blue-600 outline-none"
              >
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
              </select>
            ) : (
              <span className="font-medium">{current.location}</span>
            )}
            </div>
          </div>
          </div>
        </div>
        </div>

        {/* Right: Details */}
        <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-5">Asset Details</h2>
          <div className="space-y-5">
          <div>
            <p className="text-sm text-gray-600">Category</p>
            {isEditing ? (
              <select
              value={current.category_id ?? categories.find(c => c.name === current.category)?.id ?? ''}
              onChange={(e) => setEditedAsset({ ...editedAsset, category_id: e.target.value ? Number(e.target.value) : null, category: categories.find(c => c.id === Number(e.target.value))?.name })}
              className="mt-1 w-full px-4 py-2 border rounded-lg font-semibold"
            >
              {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            ) : (
            <p className="font-semibold text-lg">{current.category}</p>
            )}
          </div>
          {(isEditing || (current.brand && current.brand.trim()) || (current.model && current.model.trim())) && (
            <div>
            <p className="text-sm text-gray-600">Model</p>
            {isEditing ? (
              <div className="grid grid-cols-2 gap-3 mt-1">
              <input
                value={current.brand || ''}
                onChange={(e) => setEditedAsset({ ...editedAsset, brand: e.target.value })}
                placeholder="Brand"
                className="px-4 py-2 border rounded-lg"
              />
              <input
                value={current.model || ''}
                onChange={(e) => setEditedAsset({ ...editedAsset, model: e.target.value })}
                placeholder="Model"
                className="px-4 py-2 border rounded-lg"
              />
              </div>
            ) : (
              <p className="font-semibold">{current.brand} {current.model}</p>
            )}
            </div>
          )}
          {(isEditing || (current.serial_number && current.serial_number.trim())) && (
            <div>
            <p className="text-sm text-gray-600">Serial Number</p>
            {isEditing ? (
              <input
              value={current.serial_number || ''}
              onChange={(e) => setEditedAsset({ ...editedAsset, serial_number: e.target.value })}
              className="mt-1 w-full px-4 py-2 border rounded-lg font-mono"
              />
            ) : (
              <p className="font-mono font-semibold">{current.serial_number}</p>
            )}
            </div>
          )}
          {(isEditing || (current.description && current.description.trim())) && (
            <div>
            <p className="text-sm text-gray-600">Description</p>
            {isEditing ? (
              <textarea
              value={current.description || ''}
              onChange={(e) => setEditedAsset({ ...editedAsset, description: e.target.value })}
              rows={3}
              className="mt-1 w-full px-4 py-2 border rounded-lg resize-none"
              />
            ) : (
              <p className="text-gray-700 mt-1">{current.description}</p>
            )}
            </div>
          )}
          </div>
        </div>

        {/* Purchase Information */}
        {(current.purchase_date || current.cost || current.vendor_name || current.warranty_until) && (
          <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-5 flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            Purchase Information
          </h2>
          <div className="space-y-5">
            {current.purchase_date && (
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-gray-500" />
              <div>
              <p className="text-sm text-gray-600">Purchased</p>
              {isEditing ? (
                <input
                type="date"
                value={current.purchase_date}
                onChange={(e) => setEditedAsset({ ...editedAsset, purchase_date: e.target.value })}
                className="font-semibold"
                />
              ) : (
                <p className="font-semibold">{new Date(current.purchase_date).toLocaleDateString()}</p>
              )}
              </div>
            </div>
            )}
            {current.cost && (
            <div>
              <p className="text-sm text-gray-600">Cost</p>
              {isEditing ? (
              <input
                type="number"
                value={current.cost}
                onChange={(e) => setEditedAsset({ ...editedAsset, cost: e.target.value })}
                className="text-2xl font-bold text-green-600 w-full px-3 py-1 border rounded"
              />
              ) : (
              <p className="text-2xl font-bold text-green-600">₱{parseFloat(current.cost).toLocaleString()}</p>
              )}
            </div>
            )}
            {current.vendor_name && (
            <div>
              <p className="text-sm text-gray-600">Vendor</p>
              {isEditing ? (
              <select
                value={current.vendor_id != null ? String(current.vendor_id) : ''}
                onChange={(e) => setEditedAsset({ ...editedAsset, vendor_id: e.target.value ? Number(e.target.value) : null })}
                className="mt-1 w-full px-4 py-2 border rounded-lg font-semibold"
              >
                <option value="">No vendor</option>
                {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              ) : (
              <p className="font-semibold">{current.vendor_name}</p>
              )}
            </div>
            )}
            {current.warranty_until && (
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              <div>
              <p className="text-sm text-gray-600">Warranty Until</p>
              {isEditing ? (
                <input
                type="date"
                value={current.warranty_until}
                onChange={(e) => setEditedAsset({ ...editedAsset, warranty_until: e.target.value })}
                className="font-semibold text-orange-600"
                />
              ) : (
                <p className="font-semibold text-orange-600">
                {new Date(current.warranty_until).toLocaleDateString()}
                </p>
              )}
              </div>
            </div>
            )}
          </div>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-5">Timeline</h2>
          <div className="space-y-4 text-sm">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
            <div>
            <p className="font-medium">Created</p>
            <p className="text-gray-500">{new Date(current.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
          </div>
          {current.updated_at && (
            <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-emerald-600 rounded-full"></div>
            <div>
              <p className="font-medium">Last Updated</p>
              <p className="text-gray-500">{new Date(current.updated_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
            </div>
          )}
          </div>
        </div>
        </div>
      </div>
      </div>
    </div>
  );
}