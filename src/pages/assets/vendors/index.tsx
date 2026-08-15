// src/pages/assets/vendors/index.tsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Building2, Phone, Mail, Calendar, Package, Wrench, Users, Trash2, Loader2 } from 'lucide-react';
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

const typeConfig: Record<string, { label: string; color: string; icon: any }> = {
  supplier: { label: 'Supplier', color: 'bg-blue-100 text-blue-800', icon: Package },
  repair_technician: { label: 'Repair Technician', color: 'bg-orange-100 text-orange-800', icon: Wrench },
  service_provider: { label: 'Service Provider', color: 'bg-purple-100 text-purple-800', icon: Users },
  manufacturer: { label: 'Manufacturer', color: 'bg-emerald-100 text-emerald-800', icon: Building2 },
};

export default function VendorsList() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    assetApi.getVendors()
      .then((data) => setVendors(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const deleteVendor = async (id: string) => {
    if (!confirm('Delete this vendor permanently?')) return;
    try {
      await assetApi.deleteVendor(id);
      setVendors(vendors.filter(v => String(v.id) !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const stats = {
    total: vendors.length,
    suppliers: vendors.filter(v => v.type === 'supplier').length,
    technicians: vendors.filter(v => v.type === 'repair_technician').length,
    serviceProviders: vendors.filter(v => v.type === 'service_provider').length,
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Vendors</h1>
            <p className="text-gray-600 mt-2">Manage suppliers, technicians, and service providers</p>
          </div>
          <Link
            to="/assets/vendors/new"
            className="inline-flex items-center gap-3 bg-gray-900 text-white px-6 py-3.5 rounded-xl font-medium hover:bg-gray-800 transition shadow-md"
          >
            <Plus className="h-5 w-5" />
            Add Vendor
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center">
            <Building2 className="h-10 w-10 text-gray-600 mx-auto mb-3" />
            <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-sm text-gray-600">Total Vendors</p>
          </div>
          <div className="bg-blue-50 rounded-2xl shadow-sm border border-blue-200 p-6 text-center">
            <Package className="h-10 w-10 text-blue-600 mx-auto mb-3" />
            <p className="text-3xl font-bold text-blue-700">{stats.suppliers}</p>
            <p className="text-sm text-blue-600">Suppliers</p>
          </div>
          <div className="bg-orange-50 rounded-2xl shadow-sm border border-orange-200 p-6 text-center">
            <Wrench className="h-10 w-10 text-orange-600 mx-auto mb-3" />
            <p className="text-3xl font-bold text-orange-700">{stats.technicians}</p>
            <p className="text-sm text-orange-600">Technicians</p>
          </div>
          <div className="bg-purple-50 rounded-2xl shadow-sm border border-purple-200 p-6 text-center">
            <Users className="h-10 w-10 text-purple-600 mx-auto mb-3" />
            <p className="text-3xl font-bold text-purple-700">{stats.serviceProviders}</p>
            <p className="text-sm text-purple-600">Service Providers</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Vendor</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Contact Person</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Phone</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Added</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {vendors.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center text-gray-500">
                      <Building2 className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg">No vendors yet</p>
                      <Link to="/assets/vendors/new" className="text-blue-600 hover:underline">Add your first vendor →</Link>
                    </td>
                  </tr>
                ) : (
                  vendors.map((vendor) => {
                    const Icon = typeConfig[vendor.type]?.icon || Building2;
                    const config = typeConfig[vendor.type] || { label: 'Unknown', color: 'bg-gray-100 text-gray-800' };

                    return (
                      <tr key={vendor.id} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-5">
                          <Link
                            to={`/assets/vendors/${vendor.id}`}
                            className="flex items-center gap-3 hover:opacity-80"
                          >
                            <div className="p-2 bg-gray-100 rounded-lg">
                              <Building2 className="h-6 w-6 text-gray-600" />
                            </div>
                            <p className="font-medium text-gray-900">{vendor.name}</p>
                          </Link>
                        </td>
                        <td className="px-6 py-5 text-gray-700">{vendor.contact_person || '—'}</td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-gray-500" />
                            {vendor.phone}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <Icon className="h-5 w-5" />
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${config.color}`}>
                              {config.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-gray-500" />
                            <span className="truncate max-w-xs">{vendor.email}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {new Date(vendor.created_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteVendor(String(vendor.id)); }}
                            className="text-red-600 hover:text-red-800 transition"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}