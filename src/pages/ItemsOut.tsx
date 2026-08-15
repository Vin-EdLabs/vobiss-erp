import React, { useState, useEffect } from 'react';
import { Search, History, Download, ChevronDown, ChevronUp, Package, DollarSign } from 'lucide-react';
import { getRequests, getRequestDetails } from '../api';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from 'react-router-dom';

type RequestType = 'material_request' | 'item_return' | 'cash_request';

interface Request {
  id: number;
  type: RequestType;
  created_by: string;
  team_leader_name?: string;
  project_name?: string;
  purpose?: string | null;
  total_amount?: number | string | null;
  status: string;
  created_at: string;
  updated_at: string;
  item_count?: number;
  details?: {
    items?: { item_name: string; quantity_requested: number | null; quantity_received: number | null; quantity_returned: number | null }[];
    approvals?: { approver_name: string }[];
  };
}

const ItemsOut: React.FC = () => {
  const [allRequests, setAllRequests] = useState<Request[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<Request[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'completed' | 'rejected'>('completed');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [loadingDetails, setLoadingDetails] = useState<Set<number>>(new Set());
  const itemsPerPage = 12;
  const { toast } = useToast();

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    filterRequests();
  }, [allRequests, searchTerm, filterDate, activeTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, filterDate]);

  const loadRequests = async () => {
    try {
      const data = await getRequests();
      const targetStatuses = ['completed', 'rejected'];
      const target = (data || []).filter(
        (r: any) => targetStatuses.includes(r.status)
      );
      setAllRequests(target);
    } catch (error) {
      console.error('Error loading requests:', error);
      toast({
        title: "Error",
        description: "Failed to load request history",
        variant: "destructive"
      });
    }
  };

  const filterRequests = () => {
    let filtered = allRequests.filter((r: Request) => r.status === activeTab);

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (r: Request) =>
          (r.created_by && r.created_by.toLowerCase().includes(term)) ||
          (r.purpose && r.purpose.toLowerCase().includes(term)) ||
          (r.project_name && r.project_name.toLowerCase().includes(term)) ||
          String(r.id).includes(term)
      );
    }

    if (filterDate !== 'all') {
      const days = parseInt(filterDate, 10);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      cutoff.setHours(0, 0, 0, 0);
      filtered = filtered.filter((r: Request) => new Date(r.updated_at) >= cutoff);
    }

    setFilteredRequests(filtered);
  };

  const toggleExpand = async (id: number) => {
    const next = new Set(expandedRows);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      const req = allRequests.find((r: Request) => r.id === id);
      if (req && !req.details && req.type !== 'cash_request') {
        setLoadingDetails((prev) => new Set(prev).add(id));
        try {
          const details = await getRequestDetails(id);
          setAllRequests((prev) =>
            prev.map((r) => (r.id === id ? { ...r, details: { items: details.items || [], approvals: details.approvals || [] } } : r))
          );
        } catch (e) {
          console.error(e);
        } finally {
          setLoadingDetails((prev) => {
            const s = new Set(prev);
            s.delete(id);
            return s;
          });
        }
      }
    }
    setExpandedRows(next);
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Type', 'Created By', 'Summary', 'Amount/Items', 'Status', 'Date'];
    const rows = filteredRequests.map((r: Request) => {
      const type = r.type === 'cash_request' ? 'Cash' : 'Inventory';
      const summary = r.type === 'cash_request' ? (r.purpose || '—') : (r.project_name || '—');
      const amount = r.type === 'cash_request'
        ? (r.total_amount != null ? `GHS ${Number(r.total_amount).toFixed(2)}` : '—')
        : `${r.item_count ?? 0} items`;
      return [r.id, type, r.created_by || '', summary, amount, r.status, new Date(r.updated_at).toLocaleString()];
    });
    const csv = [headers.join(','), ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `request-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: 'Exported', description: 'Request history exported to CSV' });
  };

  const isCash = (r: Request) => r.type === 'cash_request';
  const statusColor = (s: string) =>
    s === 'completed' ? 'bg-green-100 text-green-800' : s === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-[var(--surface-secondary)] text-[var(--text-body)]';
  const formatAmount = (v: number | string | null | undefined) =>
    v != null ? `GHS ${Number(v).toFixed(2)}` : '—';

  const indexOfLast = currentPage * itemsPerPage;
  const indexOfFirst = indexOfLast - itemsPerPage;
  const currentRequests = filteredRequests.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / itemsPerPage));

  return (
    <div className="inv-theme space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--primary)]">Inventory</p>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2 sm:text-3xl">
            <History className="h-6 w-6 text-[var(--primary)]" />
            Request History
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Inventory and cash requests — completed and rejected</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportToCSV} className="flex items-center gap-2 shrink-0">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              placeholder="Search by ID, creator, purpose..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9 text-sm border-[var(--border-strong)]"
            />
          </div>
          <select
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="h-9 px-3 text-sm border border-[var(--border-strong)] rounded-md"
          >
            <option value="all">All time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'completed' | 'rejected')} className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-xs mb-4">
          <TabsTrigger value="completed">
            Completed ({allRequests.filter((r) => r.status === 'completed').length})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected ({allRequests.filter((r) => r.status === 'rejected').length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value={activeTab} className="mt-0">
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--border)] text-sm">
                <thead className="bg-[var(--surface-secondary)]">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider w-16">ID</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider w-20">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Created By</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider min-w-[120px]">Summary</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider w-28">Amount / Items</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider w-20">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider w-24">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider w-20">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {currentRequests.map((request) => {
                    const expanded = expandedRows.has(request.id);
                    const loading = loadingDetails.has(request.id);
                    const cash = isCash(request);
                    const summary = cash ? (request.purpose || '—') : (request.project_name || '—');
                    const amountOrItems = cash
                      ? formatAmount(request.total_amount)
                      : `${request.item_count ?? 0} items`;

                    return (
                      <React.Fragment key={request.id}>
                        <tr
                          className="hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                          onClick={() => !loading && toggleExpand(request.id)}
                        >
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              {expanded ? <ChevronUp className="h-3.5 w-3 text-[var(--text-muted)]" /> : <ChevronDown className="h-3.5 w-3 text-[var(--text-muted)]" />}
                              <span className="font-medium text-[var(--text-primary)]">{request.id}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {cash ? (
                              <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-xs font-medium">
                                <DollarSign className="h-3 w-3" /> Cash
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-xs font-medium">
                                <Package className="h-3 w-3" /> Inventory
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-[var(--text-body)]">{request.created_by || '—'}</td>
                          <td className="px-3 py-2 text-[var(--text-body)] max-w-[200px] truncate" title={String(summary)}>{summary}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-[var(--text-primary)] font-medium">{amountOrItems}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${statusColor(request.status)}`}>
                              {request.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-[var(--text-muted)]">
                            {new Date(request.updated_at).toLocaleDateString()} {new Date(request.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {cash ? (
                              <Link to={`/cash-details/${request.id}`} className="text-indigo-600 hover:underline text-xs font-medium">
                                View
                              </Link>
                            ) : (
                              <Link to={`/request-forms/${request.id}`} className="text-indigo-600 hover:underline text-xs font-medium">
                                View
                              </Link>
                            )}
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={8} className="px-3 py-2 bg-[var(--surface-secondary)]">
                              {loading && <p className="text-xs text-[var(--text-muted)] py-2">Loading details…</p>}
                              {!loading && cash && (
                                <div className="text-xs text-[var(--text-secondary)] space-y-1 py-1">
                                  <p><span className="font-medium">Purpose:</span> {request.purpose || '—'}</p>
                                  <p><span className="font-medium">Amount:</span> {formatAmount(request.total_amount)}</p>
                                </div>
                              )}
                              {!loading && !cash && request.details?.items && request.details.items.length > 0 && (
                                <table className="min-w-full text-xs border border-[var(--border)] rounded-lg overflow-hidden">
                                  <thead className="bg-[var(--surface-secondary)]">
                                    <tr>
                                      <th className="px-2 py-1.5 text-left font-medium text-[var(--text-secondary)]">Item</th>
                                      <th className="px-2 py-1.5 text-right font-medium text-[var(--text-secondary)]">Req</th>
                                      <th className="px-2 py-1.5 text-right font-medium text-[var(--text-secondary)]">Recv</th>
                                      <th className="px-2 py-1.5 text-right font-medium text-[var(--text-secondary)]">Returned</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {request.details.items.map((item: any, idx: number) => (
                                      <tr key={idx} className="border-t border-[var(--border)]">
                                        <td className="px-2 py-1.5 text-[var(--text-primary)]">{item.item_name}</td>
                                        <td className="px-2 py-1.5 text-right">{item.quantity_requested ?? 0}</td>
                                        <td className="px-2 py-1.5 text-right">{item.quantity_received ?? 0}</td>
                                        <td className="px-2 py-1.5 text-right">{item.quantity_returned ?? 0}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
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

            {filteredRequests.length === 0 && (
              <div className="text-center py-12 text-[var(--text-muted)]">
                <History className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No {activeTab} requests</p>
              </div>
            )}

            {filteredRequests.length > 0 && totalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--border)] bg-[var(--surface-secondary)] text-xs">
                <span className="text-[var(--text-secondary)]">Page {currentPage} of {totalPages}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-7" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>First</Button>
                  <Button variant="outline" size="sm" className="h-7" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>Prev</Button>
                  <Button variant="outline" size="sm" className="h-7" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
                  <Button variant="outline" size="sm" className="h-7" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>Last</Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ItemsOut;
