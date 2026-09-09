import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Package,
  DollarSign,
  ArrowUpRight,
  TrendingUp,
  AlertTriangle,
  AlertOctagon,
  ClipboardList,
  Clock,
  Activity,
  Server,
  FileText,
  Download,
  Zap,
  Bell,
  Truck,
  Award,
} from 'lucide-react';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { getItems, getItemsOut, getLowStockItems, getDashboardStats, getRequests, cxApi } from '../../api';
import { listQueue } from '@/api/performanceReports';
import { chartJsBarOptions, chartJsLineOptions, useChartTheme } from '@/lib/chartDefaults';
import { StatCard as UiStatCard } from '@/components/ui/stat-card';
import { GreetingBanner, OutlinePill } from '@/components/ui/greeting-banner';
import { useAuth } from '@/context/AuthContext';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Title, Tooltip, Legend);

interface DirectorStats {
  totalItems: number;
  itemsIssuedToday: number;
  cashDisbursedToday: number;
  pendingCashApprovals: number;
  pendingInventoryRequests: number;
  escalatedTickets: number;
  transportActivity: number;
  pendingPerformanceReviews: number;
}

const DirectorsDashboard: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const firstName = user?.first_name || String(user?.full_name || 'there').split(/\s+/)[0];
  const chartTheme = useChartTheme();
  const hasShownDirectorAlert = useRef(false);
  const [stats, setStats] = useState<DirectorStats>({
    totalItems: 0,
    itemsIssuedToday: 0,
    cashDisbursedToday: 0,
    pendingCashApprovals: 0,
    pendingInventoryRequests: 0,
    escalatedTickets: 0,
    transportActivity: 0,
    pendingPerformanceReviews: 0,
  });
  const [pendingDirectorCount, setPendingDirectorCount] = useState(0);
  const [trend, setTrend] = useState<{ [key: string]: string }>({});
  const [cashToday, setCashToday] = useState<any[]>([]);
  const [cashByMonth, setCashByMonth] = useState<{ label: string; value: number }[]>([]);
  const [itemsIssuedToday, setItemsIssuedToday] = useState<any[]>([]);
  const [approvalsToday, setApprovalsToday] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [allRequests, setAllRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [systemHealthy, setSystemHealthy] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemsRes, itemsOutRes, lowStockRes, dashStatsRes, requestsRes, escalationsRes, transportRes, performanceQueueRes] =
        await Promise.allSettled([
          getItems(),
          getItemsOut(),
          getLowStockItems(),
          getDashboardStats(),
          getRequests(),
          cxApi.getAllTickets({ escalation_stage: 'director' }),
          cxApi.getTransportReport({}),
          listQueue(),
        ]);

      const items = itemsRes.status === 'fulfilled' ? itemsRes.value : [];
      const itemsOut = itemsOutRes.status === 'fulfilled' ? itemsOutRes.value : [];
      const lowStockItems = lowStockRes.status === 'fulfilled' ? lowStockRes.value : [];
      const dashStats =
        dashStatsRes.status === 'fulfilled'
          ? dashStatsRes.value
          : { totalItems: 0, totalCategories: 0, itemsOut: 0, lowStockItems: 0, pendingRequests: 0 };
      const requests = requestsRes.status === 'fulfilled' ? requestsRes.value : [];

      // Cross-functional signals — escalated tickets, transport activity, and performance
      // reviews waiting on this director — so the dashboard isn't inventory/cash-only.
      const escalationRows: any[] =
        escalationsRes.status === 'fulfilled'
          ? (escalationsRes.value as any)?.data || (escalationsRes.value as any)?.tickets || (Array.isArray(escalationsRes.value) ? escalationsRes.value : [])
          : [];
      const escalatedTickets = escalationRows.length;
      const transportActivity =
        transportRes.status === 'fulfilled' ? transportRes.value?.summary?.total_requests || 0 : 0;
      const pendingPerformanceReviews =
        performanceQueueRes.status === 'fulfilled' ? performanceQueueRes.value.length : 0;

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(todayStart.getDate() + 1);
      const isToday = (value?: string | null) => {
        if (!value) return false;
        const date = new Date(value);
        return !Number.isNaN(date.getTime()) && date >= todayStart && date < tomorrowStart;
      };

      // Items issued today
      const directIssuedToday = (itemsOut || []).filter((io: any) =>
        isToday(io.date_time || io.date || io.created_at)
      );

      // Cash (cash_request type) from requests
      const cashRequests = (requests || []).filter(
        (r: any) => (r.requestType || r.type) === 'cash_request'
      );
      const cashTodayRows = cashRequests.filter((r: any) => {
        return isToday(r.created_at || r.date);
      });
      const cashDisbursedToday = cashTodayRows
        .filter((r: any) => r.status === 'completed' || r.status === 'finance_approved')
        .reduce((sum: number, r: any) => sum + Number(r.total_amount || r.totalAmount || 0), 0);
      const pendingCashApprovals = cashRequests.filter(
        (r: any) => r.status === 'supervisor_approved' || r.status === 'finance_approved' || r.status === 'pending'
      );
      const pendingDirectorApprovals = (requests || []).filter(
        (r: any) => r.type === 'cash_request' && r.status === 'pending' && r.requires_director_approval
      );
      setPendingDirectorCount(pendingDirectorApprovals.length);

      // Staff list is now accessed via Sidebar → Staff (/users)

      // Inventory requests (non-cash)
      const inventoryRequests = (requests || []).filter(
        (r: any) => (r.requestType || r.type || 'material_request') !== 'cash_request'
      );
      const pendingInventoryRequests = inventoryRequests.filter(
        (r: any) => r.status === 'pending' || r.status === 'supervisor_approved'
      );

      const approvalsCompletedToday = (requests || []).flatMap((r: any) => {
        const events = [
          {
            stage: 'Supervisor',
            approvedBy: r.supervisor_approved_by,
            approvedAt: r.supervisor_approved_at,
          },
          {
            stage: 'Director',
            approvedBy: r.director_approved_by,
            approvedAt: r.director_approved_at,
          },
          {
            stage: 'Finance',
            approvedBy: r.finance_approved_by,
            approvedAt: r.finance_approved_at,
          },
        ];

        return events
          .filter((event) => isToday(event.approvedAt))
          .map((event) => ({
            ...event,
            requestId: r.id,
            requestType: r.requestType || r.type,
            title: r.project_name || r.projectName || r.purpose || r.description || `Request #${r.id}`,
            link: requestLink(r),
          }));
      });

      const completedInventoryToday = inventoryRequests.filter(
        (r: any) => r.status === 'completed' && isToday(r.updated_at || r.created_at || r.date)
      );
      const issuedToday = [
        ...directIssuedToday.map((io: any) => ({
          id: `out-${io.id}`,
          source: 'item_out',
          person_name: io.person_name || io.personName,
          quantity: io.quantity,
          item_name: io.item_name || io.itemName,
          approved_by: io.approved_by || io.approvedBy,
          date_time: io.date_time || io.date || io.created_at,
          link: '/items-out',
        })),
        ...completedInventoryToday.map((r: any) => ({
          id: `request-${r.id}`,
          source: 'request',
          person_name: r.created_by || r.createdBy || r.requested_by,
          quantity: r.item_count ?? r.items?.length ?? 0,
          item_name: r.project_name || r.projectName || 'Completed inventory request',
          approved_by: r.approver_names || r.approved_by || r.approvedBy,
          date_time: r.updated_at || r.created_at || r.date,
          link: requestLink(r),
        })),
      ].sort(
        (a, b) => new Date(b.date_time || '').getTime() - new Date(a.date_time || '').getTime()
      );

      // Cash by month
      const byMonth: { [key: string]: number } = {};
      cashRequests.forEach((r: any) => {
        const d = new Date(r.created_at || r.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const amount = Number(r.total_amount || r.totalAmount || 0);
        byMonth[key] = (byMonth[key] || 0) + amount;
      });
      const monthly = Object.keys(byMonth)
        .sort()
        .map((k) => ({ label: k, value: byMonth[k] }));

      // Top-line stats
      const newStats: DirectorStats = {
        totalItems: dashStats.totalItems || items.length,
        itemsIssuedToday: issuedToday.length,
        cashDisbursedToday,
        pendingCashApprovals: pendingCashApprovals.length,
        pendingInventoryRequests: pendingInventoryRequests.length,
        escalatedTickets,
        transportActivity,
        pendingPerformanceReviews,
      };

      // Simple faux-trend: compare to 7-day average when possible
      const trendMap: { [key: string]: string } = {};
      trendMap.totalItems = '+0% vs yesterday';
      trendMap.itemsIssuedToday = `${issuedToday.length} today`;
      trendMap.cashDisbursedToday = `${cashDisbursedToday > 0 ? '+' : ''}${cashDisbursedToday.toFixed(2)} vs 0`;
      trendMap.pendingCashApprovals = `${pendingCashApprovals.length} waiting`;
      trendMap.pendingInventoryRequests = `${pendingInventoryRequests.length} waiting`;
      trendMap.escalatedTickets = escalatedTickets > 0 ? 'needs review' : 'all clear';
      trendMap.transportActivity = 'requests + fuel + rentals';
      trendMap.pendingPerformanceReviews = pendingPerformanceReviews > 0 ? 'awaiting your review' : 'all clear';

      // Activity timeline: mix of cash + inventory + items out
      const activities: any[] = [];
      issuedToday.slice(0, 5).forEach((io: any) => {
        activities.push({
          type: 'item_out',
          title:
            io.source === 'request'
              ? `Inventory request completed for ${io.item_name || 'Project'}`
              : `${io.person_name || 'Someone'} issued ${io.quantity} x ${io.item_name || 'Item'}`,
          at: io.date_time,
          link: io.link,
        });
      });
      pendingCashApprovals.slice(0, 5).forEach((r: any) => {
        activities.push({
          type: 'cash_pending',
          title: `Cash request GHS ${Number(r.total_amount ?? r.totalAmount ?? 0).toFixed(2)} pending`,
          at: r.created_at,
          link: `/cash-details/${r.id}`,
        });
      });
      pendingInventoryRequests.slice(0, 5).forEach((r: any) => {
        activities.push({
          type: 'inventory_pending',
          title: `Inventory request for ${r.project_name || r.projectName || 'Project'} pending`,
          at: r.created_at,
          link: r.type === 'item_return' ? `/item-returns/${r.id}` : `/request-forms/${r.id}`,
        });
      });
      activities.sort((a, b) => new Date(b.at || '').getTime() - new Date(a.at || '').getTime());

      setStats(newStats);
      setTrend(trendMap);
      setCashToday(cashTodayRows);
      setCashByMonth(monthly);
      setItemsIssuedToday(issuedToday);
      setApprovalsToday(approvalsCompletedToday);
      setLowStock(lowStockItems || []);
      setAllItems(items || []);
      setAllRequests(
        (requests || []).slice().sort(
          (a: any, b: any) =>
            new Date(b.created_at || b.date || '').getTime() -
            new Date(a.created_at || a.date || '').getTime()
        )
      );
      setPendingApprovals([...pendingCashApprovals, ...pendingInventoryRequests]);
      setActivity(activities.slice(0, 10));
      if (pendingDirectorApprovals.length > 0 && !hasShownDirectorAlert.current) {
        hasShownDirectorAlert.current = true;
        toast({
          title: 'Director approval required',
          description: `${pendingDirectorApprovals.length} cash request(s) are waiting for your approval.`,
          variant: 'default',
          duration: 8000,
        });
      }
      setSystemHealthy(
        itemsRes.status === 'fulfilled' ||
          itemsOutRes.status === 'fulfilled' ||
          requestsRes.status === 'fulfilled'
      );
      setLastUpdated(new Date().toLocaleString());
    } catch (error: any) {
      console.error('Error loading director dashboard:', error);
      setSystemHealthy(false);
      toast({
        title: 'Error',
        description: 'Failed to load director dashboard. Please try refreshing.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({
    icon,
    title,
    value,
    trendText,
    path,
    accentIndex = 0,
  }: {
    icon: React.ElementType;
    title: string;
    value: string;
    trendText?: string;
    path: string;
    tone: string;
    accentIndex?: number;
  }) => (
    <button type="button" onClick={() => navigate(path)} className="w-full text-left transition duration-150 hover:-translate-y-0.5">
      <UiStatCard label={title} value={value} hint={trendText} icon={icon} accentIndex={accentIndex} />
    </button>
  );

  const requestLink = (r: any) => {
    const type = r.requestType || r.type;
    if (type === 'cash_request') return `/cash-details/${r.id}`;
    if (type === 'item_return') return `/item-returns/${r.id}`;
    return `/request-forms/${r.id}`;
  };

  const todayRequestCount = allRequests.filter((r: any) => {
    const date = new Date(r.created_at || '');
    const today = new Date();
    return (
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }).length;

  const dailyFlow = [
    {
      label: 'Request intake',
      value: todayRequestCount,
      path: '/material-approvals',
      tone: 'from-blue-500 to-indigo-500',
    },
    {
      label: 'Approvals',
      value: approvalsToday.length,
      path: '/cash-approvals',
      tone: 'from-amber-500 to-orange-500',
    },
    {
      label: 'Finance release',
      value: cashToday.length,
      path: '/finance-approvals',
      tone: 'from-emerald-500 to-teal-500',
    },
    {
      label: 'Warehouse issue',
      value: stats.itemsIssuedToday,
      path: '/items-out',
      tone: 'from-violet-500 to-fuchsia-500',
    },
    {
      label: 'Stock watch',
      value: lowStock.length,
      path: '/low-stock',
      tone: 'from-red-500 to-rose-500',
    },
  ];

  const dailyFlowChartData = {
    labels: dailyFlow.map((step) => step.label),
    datasets: [
      {
        label: 'Today',
        data: dailyFlow.map((step) => Number(step.value) || 0),
        backgroundColor: [
          'rgba(59, 130, 246, 0.72)',
          'rgba(245, 158, 11, 0.72)',
          'rgba(16, 185, 129, 0.72)',
          'rgba(139, 92, 246, 0.72)',
          'rgba(239, 68, 68, 0.72)',
        ],
        borderColor: [
          'rgba(37, 99, 235, 1)',
          'rgba(217, 119, 6, 1)',
          'rgba(5, 150, 105, 1)',
          'rgba(124, 58, 237, 1)',
          'rgba(220, 38, 38, 1)',
        ],
        borderWidth: 1,
        borderRadius: 10,
      },
    ],
  };

  const dailyFlowChartOptions = {
    ...chartJsBarOptions(chartTheme),
    plugins: {
      legend: { display: false },
      title: { display: false },
    },
  };

  const dailyTrendChartData = {
    labels: dailyFlow.map((step) => step.label),
    datasets: [
      {
        label: 'Flow movement',
        data: dailyFlow.map((step) => Number(step.value) || 0),
        borderColor: 'rgba(14, 165, 233, 0.95)',
        backgroundColor: 'rgba(14, 165, 233, 0.16)',
        pointBackgroundColor: '#f59e0b',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        tension: 0.38,
        fill: true,
      },
    ],
  };

  const dailyTrendChartOptions = {
    ...chartJsLineOptions(chartTheme),
    plugins: {
      legend: { display: false },
      title: { display: false },
    },
  };

  const cashChartData = {
    labels: cashByMonth.map((m) => m.label),
    datasets: [
      {
        label: 'Cash Disbursement (GHS)',
        data: cashByMonth.map((m) => m.value),
        backgroundColor: 'rgba(245, 158, 11, 0.5)',
        borderColor: 'rgba(245, 158, 11, 0.9)',
        borderWidth: 1,
        borderRadius: 6,
      },
    ],
  };

  const cashChartOptions = {
    ...chartJsBarOptions(chartTheme),
    plugins: {
      ...chartJsBarOptions(chartTheme).plugins,
      legend: { display: false },
    },
    scales: {
      ...chartJsBarOptions(chartTheme).scales,
      y: {
        ...chartJsBarOptions(chartTheme).scales?.y,
        ticks: {
          color: chartTheme.muted,
          font: { size: 11 },
          callback: (v: any) => `GHS ${v}`,
        },
      },
    },
  };

  const statusBadgeClass = (status: string) => {
    if (status === 'completed' || status === 'finance_approved') return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    if (status === 'rejected') return 'bg-red-500/20 text-red-300 border border-red-500/30';
    if (status === 'supervisor_approved') return 'bg-sky-500/20 text-sky-300 border border-sky-500/30';
    return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
  };

  return (
    <>
    <div className="space-y-6">
        <GreetingBanner
          name={firstName}
          pills={
            <>
              <OutlinePill icon={Server}>{systemHealthy ? 'System Active' : 'System Issue'}</OutlinePill>
              {lastUpdated && <OutlinePill>{`Updated ${lastUpdated}`}</OutlinePill>}
            </>
          }
          actions={
            <>
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                <Activity className="h-4 w-4" />
                Refresh
              </Button>
              <Button size="sm" variant="outline" onClick={() => (window.location.href = '/reports')}>
                <Download className="h-4 w-4" />
                Export Report
              </Button>
              <Button size="sm" onClick={() => navigate('/cash-approvals', { state: { openTab: 'director' } })}>
                <Zap className="h-4 w-4" />
                {pendingDirectorCount > 0 ? `Director Approvals (${pendingDirectorCount})` : 'Go to Approvals'}
              </Button>
            </>
          }
        />

        {/* Director approval required banner */}
        {pendingDirectorCount > 0 && (
          <div className="rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-amber-200 bg-amber-50 shadow-[var(--shadow-md)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-amber-100 border-amber-300">
                <Bell className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-amber-900">
                  {pendingDirectorCount} cash request{pendingDirectorCount !== 1 ? 's' : ''} waiting for your approval
                </p>
                <p className="text-sm text-slate-600">
                  High-value cash requests require Director sign-off before Finance can release funds.
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate('/cash-approvals', { state: { openTab: 'director' } })}
              className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold shrink-0 border-0"
            >
              Review & approve
            </Button>
          </div>
        )}

        {/* Company Pulse — cross-functional, not just inventory/cash */}
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">Company Pulse</p>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <StatCard
              icon={AlertOctagon}
              title="Escalated Tickets"
              value={stats.escalatedTickets.toString()}
              trendText={trend.escalatedTickets}
              path="/staff/director/escalations"
              tone="border-red-400/30 bg-gradient-to-br from-red-700 via-rose-600 to-orange-500"
              accentIndex={5}
            />
            <StatCard
              icon={ClipboardList}
              title="Pending Cash Approvals"
              value={stats.pendingCashApprovals.toString()}
              trendText={trend.pendingCashApprovals}
              path="/cash-approvals"
              tone="border-amber-400/30 bg-gradient-to-br from-amber-600 via-orange-600 to-red-500"
              accentIndex={3}
            />
            <StatCard
              icon={AlertTriangle}
              title="Pending Inventory Requests"
              value={stats.pendingInventoryRequests.toString()}
              trendText={trend.pendingInventoryRequests}
              path="/material-approvals"
              tone="border-rose-400/30 bg-gradient-to-br from-rose-700 via-red-600 to-orange-500"
              accentIndex={4}
            />
            <StatCard
              icon={DollarSign}
              title="Cash Disbursed Today (GHS)"
              value={stats.cashDisbursedToday.toFixed(2)}
              trendText={trend.cashDisbursedToday}
              path="/finance-approvals"
              tone="border-emerald-400/30 bg-gradient-to-br from-emerald-700 via-teal-600 to-cyan-500"
              accentIndex={2}
            />
            <StatCard
              icon={Truck}
              title="Transport Activity"
              value={stats.transportActivity.toString()}
              trendText={trend.transportActivity}
              path="/staff/reports/transport"
              tone="border-indigo-400/30 bg-gradient-to-br from-indigo-700 via-blue-600 to-cyan-500"
              accentIndex={6}
            />
            <StatCard
              icon={Award}
              title="Pending Performance Reviews"
              value={stats.pendingPerformanceReviews.toString()}
              trendText={trend.pendingPerformanceReviews}
              path="/performance-reports/executive"
              tone="border-purple-400/30 bg-gradient-to-br from-purple-700 via-violet-600 to-fuchsia-500"
              accentIndex={7}
            />
            <StatCard
              icon={Package}
              title="Total Inventory Items"
              value={stats.totalItems.toLocaleString()}
              trendText={trend.totalItems}
              path="/inventory"
              tone="border-blue-400/30 bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500"
              accentIndex={0}
            />
            <StatCard
              icon={ArrowUpRight}
              title="Items Issued Today"
              value={stats.itemsIssuedToday.toString()}
              trendText={trend.itemsIssuedToday}
              path="/items-out"
              tone="border-violet-400/30 bg-gradient-to-br from-violet-700 via-fuchsia-600 to-pink-500"
              accentIndex={1}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-md)] lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">Graph</p>
                <h2 className="text-lg font-bold text-slate-900">Today’s Flow Graph</h2>
              </div>
              <button
                type="button"
                onClick={() => navigate('/workspace')}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-amber-300 hover:text-amber-700"
              >
                Open
              </button>
            </div>
            <div className="grid gap-4">
              <div className="h-40 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <Bar data={dailyFlowChartData} options={dailyFlowChartOptions} />
              </div>
              <div className="h-36 rounded-xl border border-sky-100 bg-sky-50/50 p-3">
                <Line data={dailyTrendChartData} options={dailyTrendChartOptions} />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-md)] lg:col-span-3">
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 px-5 py-4 text-white">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300">Daily operations flow</p>
            <h2 className="mt-1 text-xl font-bold">How work moves today</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-300">
              Follow each stage from request intake to approval, finance release, warehouse issue, and stock risk.
            </p>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-5">
            {dailyFlow.map((step, index) => (
              <button
                key={step.label}
                type="button"
                onClick={() => navigate(step.path)}
                className="group relative rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left shadow-[var(--shadow-md)] transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-white hover:shadow-[var(--shadow-md)] focus:outline-none focus:ring-2 focus:ring-amber-400/50"
              >
                {index < dailyFlow.length - 1 && (
                  <span className="pointer-events-none absolute right-[-1.15rem] top-1/2 z-10 hidden h-0.5 w-8 bg-gradient-to-r from-slate-300 to-amber-300 md:block" />
                )}
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${step.tone} text-sm font-black text-white shadow-md`}>
                  {index + 1}
                </span>
                <p className="mt-3 text-sm font-bold text-slate-900">{step.label}</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{step.value}</p>
                <p className="mt-2 text-xs font-semibold text-amber-600 opacity-0 transition group-hover:opacity-100">Open →</p>
              </button>
            ))}
          </div>
          </div>
        </div>

        {/* Financial Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-md)] p-5">
            <div className="flex justify-between items-center mb-4">
              <button
                type="button"
                onClick={() => navigate('/finance-approvals')}
                className="flex items-center gap-2 text-lg font-semibold text-slate-900 transition hover:text-amber-700"
              >
                <DollarSign className="h-5 w-5 text-amber-400" />
                Cash Disbursements Today
              </button>
              <span className="text-xs text-slate-400">
                {cashToday.length} record{cashToday.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">Request ID</th>
                    <th className="px-3 py-2.5 text-left font-medium">Requested By</th>
                    <th className="px-3 py-2.5 text-right font-medium">Amount (GHS)</th>
                    <th className="px-3 py-2.5 text-left font-medium">Purpose</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                    <th className="px-3 py-2.5 text-left font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {cashToday.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                        No cash disbursements recorded today.
                      </td>
                    </tr>
                  ) : (
                    cashToday.map((r: any) => (
                      <tr
                        key={r.id}
                        onClick={() => navigate(`/cash-details/${r.id}`)}
                        className="cursor-pointer border-t border-gray-200 hover:bg-amber-50/60"
                      >
                        <td className="px-3 py-2.5 text-slate-800 font-medium">REQ-{r.id}</td>
                        <td className="px-3 py-2.5 text-slate-700">{r.requested_by || r.created_by || '—'}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-amber-600">
                          {Number(r.total_amount || r.totalAmount || 0).toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 truncate max-w-xs">
                          {r.purpose || r.description || '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              r.status === 'completed' || r.status === 'finance_approved'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {r.status || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 text-xs">
                          {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-md)] p-5">
            <button
              type="button"
              onClick={() => navigate('/staff/reports/cash')}
              className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900 transition hover:text-amber-700"
            >
              <BarChart3 className="h-5 w-5 text-amber-500" />
              Monthly Cash Disbursement
            </button>
            <div className="h-56">
              {cashByMonth.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-slate-400">
                  No cash disbursement history yet.
                </div>
              ) : (
                <Bar data={cashChartData} options={cashChartOptions} />
              )}
            </div>
          </div>
        </div>

        {/* Inventory Activity & Low Stock */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-md)] p-5">
            <div className="flex justify-between items-center mb-4">
              <button
                type="button"
                onClick={() => navigate('/items-out')}
                className="flex items-center gap-2 text-lg font-semibold text-slate-900 transition hover:text-amber-700"
              >
                <ArrowUpRight className="h-5 w-5 text-amber-500" />
                Items Issued Today
              </button>
              <span className="text-xs text-slate-500">
                {itemsIssuedToday.length} movement{itemsIssuedToday.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">Item</th>
                    <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-3 py-2.5 text-left font-medium">Issued To</th>
                    <th className="px-3 py-2.5 text-left font-medium">Approved By</th>
                    <th className="px-3 py-2.5 text-left font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsIssuedToday.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                        No items issued yet today.
                      </td>
                    </tr>
                  ) : (
                    itemsIssuedToday.map((io: any) => (
                      <tr
                        key={io.id}
                        onClick={() => navigate(io.link || '/items-out')}
                        className="cursor-pointer border-t border-gray-200 hover:bg-amber-50/60"
                      >
                        <td className="px-3 py-2.5 text-slate-800">{io.item_name || io.itemName || '—'}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-amber-600">{io.quantity}</td>
                        <td className="px-3 py-2.5 text-slate-700">{io.person_name || io.personName || '—'}</td>
                        <td className="px-3 py-2.5 text-slate-700">{io.approved_by || io.approvedBy || '—'}</td>
                        <td className="px-3 py-2.5 text-slate-500 text-xs">
                          {io.date_time ? new Date(io.date_time).toLocaleTimeString() : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-md)] p-5">
            <button
              type="button"
              onClick={() => navigate('/low-stock')}
              className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900 transition hover:text-red-700"
            >
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Low Stock Alerts
            </button>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {lowStock.length === 0 ? (
                <p className="text-sm text-slate-500">No items are currently below threshold.</p>
              ) : (
                lowStock.map((item: any) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => navigate('/low-stock')}
                    className="flex w-full items-center justify-between rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-left transition hover:border-red-200 hover:bg-red-100"
                  >
                    <div>
                      <p className="text-sm font-semibold text-red-700">{item.name}</p>
                      <p className="text-xs text-slate-600">
                        Remaining: {item.quantity} (Threshold: {item.low_stock_threshold})
                      </p>
                    </div>
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                      Critical
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Full inventory detail lives in Inventory Report — this page stays an overview, not
            a second copy of the item catalogue. */}
        <button
          type="button"
          onClick={() => navigate('/inventory')}
          className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-[var(--shadow-md)] transition hover:border-amber-300 hover:bg-amber-50/40"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <Package className="h-4.5 w-4.5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-900">Full Inventory</span>
              <span className="block text-xs text-slate-500">
                {allItems.length.toLocaleString()} item{allItems.length === 1 ? '' : 's'} — open the full read-only catalogue
              </span>
            </span>
          </span>
          <span className="text-xs font-semibold text-amber-600">Open →</span>
        </button>

        {/* Approvals Snapshot, Recent Activity & Requests Overview — expanded */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-md)] p-6">
            <button
              type="button"
              onClick={() => navigate('/material-approvals')}
              className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 transition hover:text-amber-700"
            >
              <ClipboardList className="h-6 w-6 text-amber-500" />
              Approvals Snapshot
            </button>
            {pendingApprovals.length === 0 ? (
              <p className="text-slate-500 py-6 text-center">No pending approvals at the moment.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingApprovals.slice(0, 12).map((r: any) => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => navigate(requestLink(r))}
                    className="rounded-xl border border-gray-200 bg-slate-50 p-4 text-left transition-colors hover:border-gray-300 hover:bg-slate-100"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          (r.requestType || r.type) === 'cash_request'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-sky-50 text-sky-700 border border-sky-200'
                        }`}
                      >
                        {(r.requestType || r.type) === 'cash_request' ? 'Cash' : 'Inventory'} #{r.id}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${statusBadgeClass(r.status || 'pending')}`}>
                        {String(r.status || 'pending').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-800 truncate" title={r.project_name || r.projectName || r.purpose || r.description || ''}>
                      {r.project_name || r.projectName || r.purpose || r.description || 'No description'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-md)] p-6">
              <button
                type="button"
                onClick={() => navigate('/workspace')}
                className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 transition hover:text-amber-700"
              >
                <Activity className="h-6 w-6 text-amber-500" />
                Recent Activity
              </button>
              {activity.length === 0 ? (
                <p className="text-slate-500 py-6 text-center">No recent activity recorded.</p>
              ) : (
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {activity.map((a: any, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => navigate(a.link || '/workspace')}
                      className="flex w-full items-start gap-3 rounded-xl border border-gray-200 bg-slate-50 p-3 text-left transition-colors hover:bg-slate-100"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 border border-amber-300 text-amber-600">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">{a.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {a.at ? new Date(a.at).toLocaleString() : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-md)] p-6">
              <button
                type="button"
                onClick={() => navigate('/material-approvals')}
                className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 transition hover:text-amber-700"
              >
                <FileText className="h-6 w-6 text-amber-500" />
                Requests Overview (All)
              </button>
              <div className="overflow-x-auto max-h-[380px] rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">ID</th>
                      <th className="px-4 py-3 text-left font-semibold">Type</th>
                      <th className="px-4 py-3 text-left font-semibold">Project / Purpose</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allRequests.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                          No requests yet.
                        </td>
                      </tr>
                    ) : (
                      allRequests.slice(0, 20).map((r: any) => (
                        <tr
                          key={r.id}
                          onClick={() => navigate(requestLink(r))}
                          className="cursor-pointer border-t border-gray-200 hover:bg-slate-50"
                        >
                          <td className="px-4 py-3 text-slate-800 font-semibold">REQ-{r.id}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                (r.requestType || r.type) === 'cash_request'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-sky-50 text-sky-700 border border-sky-200'
                              }`}
                            >
                              {(r.requestType || r.type) === 'cash_request' ? 'Cash' : 'Inventory'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate" title={r.project_name || r.projectName || r.purpose || r.description || ''}>
                            {r.project_name || r.projectName || r.purpose || r.description || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${statusBadgeClass(r.status || 'pending')}`}>
                              {String(r.status || 'pending').replace(/_/g, ' ')}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
    </div>
      {loading && (
        <div className="fixed inset-0 pointer-events-none flex items-start justify-end p-4">
          <div className="bg-slate-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg opacity-80 flex items-center gap-2">
            <Activity className="h-3 w-3 animate-spin" />
            Updating executive dashboard...
          </div>
        </div>
      )}
    </>
  );
};

export default DirectorsDashboard;

