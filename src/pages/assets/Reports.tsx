// Asset Manager Reports – summary, stats, export
import React, { useState, useEffect } from 'react';
import { Package, Wrench, UserCheck, Download, Loader2, BarChart3, FileText } from 'lucide-react';
import { assetApi } from '../../api';

export default function AssetReportsPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    Promise.all([
      assetApi.getAssets(),
      assetApi.getMaintenanceRecords(),
      assetApi.getAssignmentHistory(),
    ])
      .then(([a, m, h]) => {
        setAssets(Array.isArray(a) ? a : []);
        setMaintenance(Array.isArray(m) ? m : []);
        setHistory(Array.isArray(h) ? h : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const byStatus = (status: string) => assets.filter((a: any) => a.status === status).length;
  const stats = {
    total: assets.length,
    available: byStatus('available'),
    assigned: byStatus('assigned'),
    in_repair: byStatus('in_repair'),
    damaged: byStatus('damaged'),
    lost: byStatus('lost'),
    retired: byStatus('retired'),
  };
  const maintPending = maintenance.filter((m: any) => m.status === 'pending' || m.status === 'in_progress').length;
  const maintCompleted = maintenance.filter((m: any) => m.status === 'completed' || m.status === 'not_fixable').length;

  const exportAssetsCsv = () => {
    setExporting(true);
    const headers = ['Tag', 'Name', 'Category', 'Location', 'Status', 'Assigned To', 'Serial #', 'Cost', 'Purchase Date'];
    const rows = assets.map((a: any) => [
      a.tag,
      a.name,
      a.category || '',
      a.location || '',
      a.status || '',
      a.assigned_to || '',
      a.serial_number || '',
      a.cost ?? '',
      a.purchase_date || '',
    ]);
    const csv = [headers.join(','), ...rows.map((r: any[]) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `assets-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    setExporting(false);
  };

  const exportAssignmentHistoryCsv = () => {
    setExporting(true);
    const headers = ['Date', 'Action', 'Person', 'Asset', 'Tag', 'Condition', 'Notes'];
    const rows = history.map((h: any) => [
      h.date ? new Date(h.date).toLocaleString() : '',
      h.action || '',
      h.person_name || '',
      h.asset_name || '',
      h.asset_tag || '',
      h.condition || '',
      (h.notes || '').replace(/"/g, '""'),
    ]);
    const csv = [headers.join(','), ...rows.map((r: any[]) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `assignment-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    setExporting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <BarChart3 className="h-9 w-9 text-indigo-600" />
              Asset Reports
            </h1>
            <p className="text-gray-600 mt-1">Summary, statistics, and export</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={exportAssetsCsv}
              disabled={exporting || assets.length === 0}
              className="inline-flex items-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 font-medium shadow-md transition disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
              Export Assets CSV
            </button>
            <button
              onClick={exportAssignmentHistoryCsv}
              disabled={exporting || history.length === 0}
              className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium shadow-md transition disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
              Export History CSV
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-10">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <Package className="h-8 w-8 text-gray-600" />
              <span className="text-sm font-medium text-gray-600">Total Assets</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl shadow-sm border border-emerald-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <Package className="h-8 w-8 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">Available</span>
            </div>
            <p className="text-3xl font-bold text-emerald-800">{stats.available}</p>
          </div>
          <div className="bg-blue-50 rounded-2xl shadow-sm border border-blue-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <UserCheck className="h-8 w-8 text-blue-600" />
              <span className="text-sm font-medium text-blue-700">Assigned</span>
            </div>
            <p className="text-3xl font-bold text-blue-800">{stats.assigned}</p>
          </div>
          <div className="bg-amber-50 rounded-2xl shadow-sm border border-amber-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <Wrench className="h-8 w-8 text-amber-600" />
              <span className="text-sm font-medium text-amber-700">In Repair</span>
            </div>
            <p className="text-3xl font-bold text-amber-800">{stats.in_repair}</p>
          </div>
          <div className="bg-red-50 rounded-2xl shadow-sm border border-red-200 p-6">
            <span className="text-sm font-medium text-red-700">Damaged</span>
            <p className="text-3xl font-bold text-red-800">{stats.damaged}</p>
          </div>
          <div className="bg-gray-50 rounded-2xl shadow-sm border border-gray-200 p-6">
            <span className="text-sm font-medium text-gray-600">Lost / Retired</span>
            <p className="text-3xl font-bold text-gray-800">{stats.lost + stats.retired}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 col-span-2 md:col-span-1">
            <div className="flex items-center gap-3 mb-2">
              <Wrench className="h-8 w-8 text-purple-600" />
              <span className="text-sm font-medium text-gray-600">Maintenance</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">Pending: {maintPending}</p>
            <p className="text-sm text-gray-600">Completed: {maintCompleted}</p>
          </div>
        </div>

        {/* Assignment history table (last 20) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Recent Assignment History</h2>
            <span className="text-sm text-gray-500">{history.length} total events</span>
          </div>
          <div className="overflow-x-auto">
            {history.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <UserCheck className="h-14 w-14 mx-auto mb-4 text-gray-300" />
                <p>No assignment history yet</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Action</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Person</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Asset</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Condition</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {history.slice(0, 20).map((entry: any, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {entry.date ? new Date(entry.date).toLocaleString() : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                          entry.action === 'assigned' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {entry.action === 'assigned' ? 'Assigned' : 'Returned'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">{entry.person_name || '—'}</td>
                      <td className="px-6 py-4">
                        <span className="font-medium">{entry.asset_name || '—'}</span>
                        <span className="text-gray-500 text-sm ml-1">#{entry.asset_tag}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{entry.condition || '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{entry.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
