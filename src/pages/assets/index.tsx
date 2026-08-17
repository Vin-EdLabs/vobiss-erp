// src/pages/assets/index.tsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Package, Loader2 } from 'lucide-react';
import { assetApi } from '../../api';

interface Asset {
  id: string;
  name: string;
  tag: string;
  category: string;
  status: string;
  location: string;
  photos: string[];
  assigned_to?: string;
  serial_number?: string;
}

const statusColors: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-700',
  assigned: 'bg-blue-100 text-blue-700',
  in_repair: 'bg-amber-100 text-amber-700',
  damaged: 'bg-red-100 text-red-700',
  lost: 'bg-gray-100 text-gray-600',
  retired: 'bg-purple-100 text-purple-700',
};

export default function AssetsListPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    assetApi.getAssets()
      .then((data) => { if (!cancelled) setAssets(Array.isArray(data) ? data : []); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load assets'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = assets.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.tag && a.tag.toLowerCase().includes(search.toLowerCase())) ||
    (a.serial_number && a.serial_number.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Assets</h1>
            <p className="text-gray-600">Manage and track company equipment and resources</p>
          </div>

          <div className="flex gap-4">
            <Link
              to="/assets/new"
              className="inline-flex items-center gap-3 px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition font-medium shadow-lg"
            >
              <Plus className="h-5 w-5" />
              Add Asset
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          {[
            { label: 'Total Assets', value: assets.length, color: 'bg-gray-100' },
            { label: 'Available', value: assets.filter(a => a.status === 'available').length, color: 'bg-emerald-100' },
            { label: 'Assigned', value: assets.filter(a => a.status === 'assigned').length, color: 'bg-blue-100' },
            { label: 'In Repair', value: assets.filter(a => a.status === 'in_repair').length, color: 'bg-amber-100' },
          ].map((stat, i) => (
            <div key={i} className={`p-6 rounded-2xl shadow-sm border border-gray-200 ${stat.color}`}>
              <p className="text-sm text-gray-600 mb-2">{stat.label}</p>
              <p className="text-4xl font-bold text-gray-900">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="mb-8 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, tag, or serial number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-5 py-4 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:outline-none text-lg"
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-red-600 font-medium">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <Package className="w-20 h-20 text-gray-300 mx-auto mb-6" />
              <h3 className="text-2xl font-semibold text-gray-900 mb-3">No assets found</h3>
              <p className="text-gray-600">Try adjusting your search or add a new asset</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Asset</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tag</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Location</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Assigned To</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Serial #</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filtered.map((asset) => (
                    <tr key={asset.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-5">
                        <Link to={`/assets/${asset.id}`} className="flex items-center gap-4 hover:opacity-80 transition">
                          {asset.photos?.[0] ? (
                            <img src={asset.photos[0]} alt={asset.name} className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                          ) : (
                            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200">
                              <Package className="w-6 h-6 text-gray-400" />
                            </div>
                          )}
                          <span className="font-medium text-gray-900">{asset.name}</span>
                        </Link>
                      </td>
                      <td className="px-6 py-5">
                        <Link to={`/assets/${asset.id}`} className="font-mono text-blue-600 hover:text-blue-800">
                          {asset.tag ? `#${asset.tag}` : `#${asset.id}`}
                        </Link>
                      </td>
                      <td className="px-6 py-5 text-gray-700">{asset.category}</td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${statusColors[asset.status]}`}>
                          {asset.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-gray-700">{asset.location}</td>
                      <td className="px-6 py-5">
                        {asset.assigned_to ? (
                          <span className="text-gray-900 font-medium">{asset.assigned_to}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        {asset.serial_number ? (
                          <span className="font-mono text-gray-700">{asset.serial_number}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}