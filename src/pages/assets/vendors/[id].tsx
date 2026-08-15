// src/pages/assets/vendors/[id].tsx
import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Phone, Mail, MapPin, Globe, Package, Wrench, Users, Calendar, User, Edit2, Trash2, Save, X, Loader2 } from 'lucide-react';
import { assetApi } from '../../../api';

interface Vendor {
  id: number | string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address?: string;
  type: 'supplier' | 'repair_technician' | 'service_provider' | 'manufacturer';
  services?: string;
  website?: string;
  notes?: string;
  created_at: string;
}

const typeConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  supplier: { label: 'Supplier', color: 'text-blue-800', bg: 'bg-blue-100', icon: Package },
  repair_technician: { label: 'Repair Technician', color: 'text-orange-800', bg: 'bg-orange-100', icon: Wrench },
  service_provider: { label: 'Service Provider', color: 'text-purple-800', bg: 'bg-purple-100', icon: Users },
  manufacturer: { label: 'Manufacturer', color: 'text-emerald-800', bg: 'bg-emerald-100', icon: Building2 },
};

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [edited, setEdited] = useState<Partial<Vendor>>({});
  const [assetsFromVendor, setAssetsFromVendor] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([assetApi.getVendor(id), assetApi.getAssets()])
      .then(([v, assets]) => {
        setVendor(v);
        setEdited({});
        setAssetsFromVendor((assets || []).filter((a: any) => String(a.vendor_id) === id));
      })
      .catch(() => setVendor(null))
      .finally(() => setLoading(false));
  }, [id]);

  const save = async () => {
    if (!vendor || !id) return;
    setSaving(true);
    try {
      const updated = await assetApi.updateVendor(id, { ...vendor, ...edited });
      setVendor(updated);
      setIsEditing(false);
      setEdited({});
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const deleteVendor = async () => {
    if (!confirm('Delete this vendor permanently? All links to assets will be removed.')) return;
    try {
      await assetApi.deleteVendor(id!);
      navigate('/assets/vendors');
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-gray-400 animate-spin" />
      </div>
    );
  }
  if (!vendor) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Building2 className="h-20 w-20 text-gray-300 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-gray-900">Vendor not found</h2>
          <Link to="/assets/vendors" className="mt-6 inline-block text-blue-600 hover:underline">← Back</Link>
        </div>
      </div>
    );
  }

  const current = { ...vendor, ...edited };
  const Icon = typeConfig[current.type].icon;

  return (
    <div className="min-h-screen bg-gray-50 py-8 scale-90 origin-top-left">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <Link to="/assets/vendors" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 text-lg font-medium">
            <ArrowLeft className="h-6 w-6" /> Back to Vendors
          </Link>
          {!isEditing ? (
            <div className="flex gap-3">
              <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium">
                <Edit2 className="h-5 w-5" /> Edit Vendor
              </button>
              <button onClick={deleteVendor} className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium">
                <Trash2 className="h-5 w-5" /> Delete
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button onClick={() => { setIsEditing(false); setEdited({}); }} className="flex items-center gap-2 px-5 py-3 border border-gray-300 rounded-xl hover:bg-gray-50">
                <X className="h-5 w-5" /> Cancel
              </button>
              <button onClick={save} disabled={saving} className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium disabled:opacity-70">
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} Save Changes
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-10 mb-10">
              <div className="flex items-center gap-6">
                <div className="p-6 bg-gray-100 rounded-3xl">
                  <Building2 className="h-20 w-20 text-gray-700" />
                </div>
                <div className="flex-1">
                  {isEditing ? (
                    <input
                      value={current.name}
                      onChange={(e) => setEdited({ ...edited, name: e.target.value })}
                      className="text-4xl font-bold text-gray-900 border-b-4 border-gray-300 focus:border-blue-600 outline-none w-full"
                    />
                  ) : (
                    <h1 className="text-4xl font-bold text-gray-900">{current.name}</h1>
                  )}
                  <div className="flex items-center gap-3 mt-4">
                    <div className={`p-3 rounded-2xl ${typeConfig[current.type].bg}`}>
                      <Icon className="h-8 w-8 text-current" />
                    </div>
                    <span className={`px-5 py-2 rounded-full text-lg font-semibold ${typeConfig[current.type].bg} ${typeConfig[current.type].color}`}>
                      {typeConfig[current.type].label}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-8 mb-8">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-lg">
                {isEditing ? (
                  <>
                    <input placeholder="Contact Person" value={current.contact_person} onChange={e => setEdited({ ...edited, contact_person: e.target.value })} className="px-5 py-4 border rounded-xl" />
                    <input placeholder="Phone" value={current.phone} onChange={e => setEdited({ ...edited, phone: e.target.value })} className="px-5 py-4 border rounded-xl" />
                    <input placeholder="Email" value={current.email} onChange={e => setEdited({ ...edited, email: e.target.value })} className="px-5 py-4 border rounded-xl" />
                    <input placeholder="Address" value={current.address || ''} onChange={e => setEdited({ ...edited, address: e.target.value })} className="px-5 py-4 border rounded-xl" />
                    <input placeholder="Website" value={current.website || ''} onChange={e => setEdited({ ...edited, website: e.target.value })} className="px-5 py-4 border rounded-xl" />
                    <select value={current.type} onChange={e => setEdited({ ...edited, type: e.target.value as any })} className="px-5 py-4 border rounded-xl">
                      <option value="supplier">Supplier</option>
                      <option value="repair_technician">Repair Technician</option>
                      <option value="service_provider">Service Provider</option>
                      <option value="manufacturer">Manufacturer</option>
                    </select>
                  </>
                ) : (
                  <>
                    {current.contact_person && <div className="flex items-center gap-3"><User className="h-6 w-6 text-gray-500" /><span>{current.contact_person}</span></div>}
                    <div className="flex items-center gap-3"><Phone className="h-6 w-6 text-gray-500" /><a href={`tel:${current.phone}`} className="text-blue-600">{current.phone}</a></div>
                    <div className="flex items-center gap-3"><Mail className="h-6 w-6 text-gray-500" /><a href={`mailto:${current.email}`} className="text-blue-600">{current.email}</a></div>
                    {current.address && <div className="flex items-center gap-3"><MapPin className="h-6 w-6 text-gray-500" /><span>{current.address}</span></div>}
                    {current.website && <div className="flex items-center gap-3"><Globe className="h-6 w-6 text-gray-500" /><a href={current.website} target="_blank" className="text-blue-600 hover:underline">{current.website.replace(/^https?:\/\//, '')}</a></div>}
                  </>
                )}
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Assets Supplied ({assetsFromVendor.length})</h3>
              {assetsFromVendor.length === 0 ? (
                <p className="text-gray-500 text-center py-12">No assets purchased from this vendor yet</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {assetsFromVendor.map((asset) => (
                    <Link
                      key={asset.id}
                      to={`/assets/${asset.id}`}
                      className="flex items-center gap-4 p-5 border border-gray-200 rounded-2xl hover:shadow-md hover:border-blue-300 transition"
                    >
                      {asset.photos?.[0] ? (
                        <img src={asset.photos[0]} className="w-16 h-16 rounded-lg object-cover" />
                      ) : (
                        <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                          <Package className="h-8 w-8 text-gray-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-gray-900">{asset.name}</p>
                        <p className="text-sm text-gray-600">#{asset.tag}</p>
                        <p className="text-xs text-gray-500 mt-1">{asset.category}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-8">
            {(current.services || isEditing) && (
              <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-8">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Services Provided</h3>
                {isEditing ? (
                  <textarea value={current.services || ''} onChange={e => setEdited({ ...edited, services: e.target.value })} rows={5} className="w-full px-4 py-3 border rounded-xl resize-none" />
                ) : (
                  <p className="text-gray-700 leading-relaxed">{current.services}</p>
                )}
              </div>
            )}

            {(current.notes || isEditing) && (
              <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-8">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Notes</h3>
                {isEditing ? (
                  <textarea value={current.notes || ''} onChange={e => setEdited({ ...edited, notes: e.target.value })} rows={5} className="w-full px-4 py-3 border rounded-xl resize-none" />
                ) : (
                  <p className="text-gray-700 bg-gray-50 p-4 rounded-xl">{current.notes}</p>
                )}
              </div>
            )}

            <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Vendor Since</h3>
              <div className="flex items-center gap-4">
                <Calendar className="h-12 w-12 text-gray-500" />
                <div>
                  <p className="text-2xl font-bold">
                    {new Date(vendor.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                  <p className="text-gray-500">Date Added</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
