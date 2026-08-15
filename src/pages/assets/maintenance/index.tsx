// src/pages/assets/maintenance/index.tsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Wrench, Clock, CheckCircle, AlertTriangle, Calendar, DollarSign, Package, Trash2, X, Loader2 } from 'lucide-react';
import { assetApi } from '../../../api';

interface Maintenance {
  id: string;
  asset_id: string;
  asset_name: string;
  asset_tag: string;
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
  updated_at: string;
}

const statusBadge: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-orange-100 text-orange-800' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-800' },
  not_fixable: { label: 'Not Fixable', color: 'bg-red-100 text-red-800' },
};

const typeIcon: Record<string, any> = {
  repair: AlertTriangle,
  service: Wrench,
  inspection: Calendar,
  upgrade: Package,
};

export default function MaintenanceList() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<Maintenance[]>([]);
  const [deleteModal, setDeleteModal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    assetApi.getMaintenanceRecords()
      .then((data) => setRecords(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const deleteRecord = async (id: string) => {
    try {
      await assetApi.deleteMaintenanceRecord(id);
      setRecords(records.filter(record => String(record.id) !== id));
      setDeleteModal(null);
    } catch (e) {
      console.error(e);
    }
  };

  const stats = {
    total: records.length,
    pending: records.filter(r => r.status === 'pending').length,
    inProgress: records.filter(r => r.status === 'in_progress').length,
    completed: records.filter(r => r.status === 'completed').length,
    totalCost: records.filter(r => r.cost).reduce((sum, r) => sum + (r.cost || 0), 0),
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Maintenance</h1>
            <p className="text-gray-600 mt-2">Track repairs, services, and inspections</p>
          </div>
          <Link
            to="/assets/maintenance/new"
            className="inline-flex items-center gap-3 bg-gray-900 text-white px-6 py-4 rounded-xl font-medium hover:bg-gray-800 transition shadow-lg"
          >
            <Plus className="h-6 w-6" />
            Log Maintenance
          </Link>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
          </div>
        )}
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-10">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center">
            <Wrench className="h-10 w-10 text-gray-600 mx-auto mb-3" />
            <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-sm text-gray-600">Total Cases</p>
          </div>
          <div className="bg-orange-50 rounded-2xl shadow-sm border border-orange-200 p-6 text-center">
            <Clock className="h-10 w-10 text-orange-600 mx-auto mb-3" />
            <p className="text-3xl font-bold text-orange-700">{stats.pending}</p>
            <p className="text-sm text-orange-600">Pending</p>
          </div>
          <div className="bg-blue-50 rounded-2xl shadow-sm border border-blue-200 p-6 text-center">
            <Wrench className="h-10 w-10 text-blue-600 mx-auto mb-3" />
            <p className="text-3xl font-bold text-blue-700">{stats.inProgress}</p>
            <p className="text-sm text-blue-600">In Progress</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl shadow-sm border border-emerald-200 p-6 text-center">
            <CheckCircle className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
            <p className="text-3xl font-bold text-emerald-700">{stats.completed}</p>
            <p className="text-sm text-emerald-600">Completed</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center">
            <DollarSign className="h-10 w-10 text-gray-600 mx-auto mb-3" />
            <p className="text-3xl font-bold text-gray-900">₱{stats.totalCost.toLocaleString()}</p>
            <p className="text-sm text-gray-600">Total Cost</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Asset</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Issue</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Technician</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Cost</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Dates</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center text-gray-500">
                      <Wrench className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg">No maintenance records yet</p>
                      <Link to="/assets/maintenance/new" className="text-blue-600 hover:underline">
                        Log the first one →
                      </Link>
                    </td>
                  </tr>
                ) : (
                  records.map((record) => {
                    const TypeIcon = typeIcon[record.type] || Wrench;
                    const badge = statusBadge[record.status];

                    return (
                      <tr
                        key={record.id}
                        className="hover:bg-gray-50 transition cursor-pointer"
                        onClick={() => navigate(`/assets/maintenance/${record.id}`)}
                      >
                        <td className="px-6 py-5">
                          <div>
                            <p className="font-medium text-gray-900">{record.asset_name}</p>
                            <p className="text-sm font-mono text-gray-500">#{record.asset_tag}</p>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <TypeIcon className="h-5 w-5 text-gray-600" />
                            <span className="capitalize">{record.type.replace('_', ' ')}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-gray-700 max-w-xs truncate">{record.description}</td>
                        <td className="px-6 py-5">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${badge.color}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-gray-700">{record.technician || '—'}</td>
                        <td className="px-6 py-5 font-medium">
                          {record.cost ? `₱${record.cost.toLocaleString()}` : '—'}
                        </td>
                        <td className="px-6 py-5 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {new Date(record.start_date).toLocaleDateString()}
                            {record.completion_date && (
                              <span className="text-gray-400">
                                → {new Date(record.completion_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteModal(record.id);
                            }}
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
        </div>

        {/* Beautiful Delete Confirmation Modal */}
        {deleteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Delete Maintenance Record?</h3>
                <button onClick={() => setDeleteModal(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <p className="text-gray-600 mb-8">
                This action <strong>cannot be undone</strong>. The record will be permanently deleted.
              </p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => setDeleteModal(null)}
                  className="px-6 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteRecord(deleteModal)}
                  className="px-8 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium shadow-md transition"
                >
                  Delete Record
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}