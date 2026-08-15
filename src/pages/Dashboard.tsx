import React, { useState, useEffect, useCallback } from 'react';
import { Package, Tags, ArrowUpRight, AlertTriangle, TrendingUp, Users, BarChart3, FileText, CheckCircle } from 'lucide-react';
import { getItems, getCategories, getItemsOut, getDashboardStats, getRequests } from '../api';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useNavigate } from 'react-router-dom';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { applyChartJsDefaults, chartJsBarOptions, useChartTheme } from '@/lib/chartDefaults';
import { StatCard as UiStatCard } from '@/components/ui/stat-card';
import { GreetingBanner } from '@/components/ui/greeting-banner';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuth } from '@/context/AuthContext';

/**
 * Interface for dashboard statistics
 */
interface Stats {
  totalItems: number;
  totalCategories: number;
  itemsOut: number;
  lowStockItems: number;
  pendingRequests: number;
  completedRequests: number;
}

/**
 * Interface for items
 */
interface Item {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  quantity: number;
  low_stock_threshold: number;
}

/**
 * Interface for recent activity items
 */
interface RecentActivity {
  id: string;
  type: 'item_out' | 'request_created' | 'request_approved' | 'request_completed';
  title: string;
  description: string;
  dateTime: string;
  icon: React.ElementType;
}

/**
 * Interface for items checked out of inventory
 */
interface ItemOut {
  id: string;
  person_name: string;
  item_id: string;
  quantity: number;
  date_time: string;
  item_name: string;
}

/**
 * Interface for requests
 */
interface Request {
  id: number;
  created_by: string;
  project_name: string;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  created_at: string;
  updated_at: string;
}

/**
 * Dashboard Component
 */
const Dashboard = () => {
  const [stats, setStats] = useState<Stats>({
    totalItems: 0,
    totalCategories: 0,
    itemsOut: 0,
    lowStockItems: 0,
    pendingRequests: 0,
    completedRequests: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { toast } = useToast();
  const navigate = useNavigate();
  const chartTheme = useChartTheme();
  const { user } = useAuth();
  const firstName = user?.first_name || String(user?.full_name || 'there').split(/\s+/)[0];

  ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
  applyChartJsDefaults(chartTheme);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);

      const [items, categories, itemsOut, requests] = await Promise.all([
        getItems(), 
        getCategories(), 
        getItemsOut(), 
        getRequests()
      ]);
      const statsData = await getDashboardStats();

      const lowStock = items.filter((item) => item.quantity <= (item.low_stock_threshold || 0));
      const completedRequests = requests.filter(r => r.status === 'completed').length;

      setStats({
        totalItems: statsData.totalItems || items.length,
        totalCategories: statsData.totalCategories || categories.length,
        itemsOut: statsData.itemsOut || itemsOut.length + completedRequests,
        lowStockItems: statsData.lowStockItems || lowStock.length,
        pendingRequests: statsData.pendingRequests || requests.filter(r => r.status === 'pending').length,
        completedRequests,
      });
      setAllItems(items);

      // Recent activities logic (unchanged)
      const itemOutActivities: RecentActivity[] = itemsOut
        .slice(0, 2)
        .sort((a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime())
        .map((activity) => ({
          id: `out-${activity.id}`,
          type: 'item_out',
          title: `${activity.person_name || 'Unknown'} issued items`,
          description: `${activity.quantity} x ${activity.item_name || 'Unknown Item'}`,
          dateTime: activity.date_time,
          icon: ArrowUpRight,
        }));

      const recentRequests = requests
        .filter(r => new Date(r.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .slice(0, 2)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map((req) => ({
          id: `create-${req.id}`,
          type: 'request_created',
          title: `New request created`,
          description: `By ${req.created_by} for project "${req.project_name}"`,
          dateTime: req.created_at,
          icon: FileText,
        }));

      const approvedRequests = requests
        .filter(r => r.status === 'approved' && new Date(r.updated_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .slice(0, 2)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .map((req) => ({
          id: `approve-${req.id}`,
          type: 'request_approved',
          title: `Request approved`,
          description: `Project "${req.project_name}" by ${req.created_by}`,
          dateTime: req.updated_at,
          icon: CheckCircle,
        }));

      const completedRequestsActivity = requests
        .filter(r => r.status === 'completed' && new Date(r.updated_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .slice(0, 2)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .map((req) => ({
          id: `complete-${req.id}`,
          type: 'request_completed',
          title: `Request finalized`,
          description: `Project "${req.project_name}" issued`,
          dateTime: req.updated_at,
          icon: CheckCircle,
        }));

      const allRecentActivities = [
        ...itemOutActivities,
        ...recentRequests,
        ...approvedRequests,
        ...completedRequestsActivity,
      ].sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
       .slice(0, 5);

      setRecentActivity(allRecentActivities);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load dashboard data. Please try refreshing.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  useEffect(() => {
    const handler = () => loadDashboardData();
    window.addEventListener('staff:requests-changed', handler as EventListener);
    window.addEventListener('staff:notifications-changed', handler as EventListener);
    window.addEventListener('staff:tickets-changed', handler as EventListener);
    return () => {
      window.removeEventListener('staff:requests-changed', handler as EventListener);
      window.removeEventListener('staff:notifications-changed', handler as EventListener);
      window.removeEventListener('staff:tickets-changed', handler as EventListener);
    };
  }, [loadDashboardData]);

  interface StatCardProps {
    icon: React.ElementType;
    title: string;
    value: number | string;
    color: string;
    trend?: string;
    description?: string;
    accentIndex?: number;
  }

  const StatCard: React.FC<StatCardProps> = ({ icon, title, value, trend, description, accentIndex = 0 }) => (
    <UiStatCard label={title} value={value} hint={description || trend} icon={icon} accentIndex={accentIndex} />
  );

  // Calculate total stock quantity
  const totalStockQuantity = allItems.reduce((sum, item) => sum + item.quantity, 0);
  const avgPerItem = allItems.length > 0 ? Math.round(totalStockQuantity / allItems.length) : 0;

  const chartData = allItems.length > 0 ? {
    labels: allItems.slice(0, 8).map(item => item.name.substring(0, 15) + (item.name.length > 15 ? '...' : '')),
    datasets: [{
      label: 'Stock Quantity',
      data: allItems.slice(0, 8).map(item => item.quantity),
      backgroundColor: `${chartTheme.accent}D9`,
      borderWidth: 0,
      borderRadius: 4,
      borderSkipped: false,
    }],
  } : {
    labels: [],
    datasets: [{
      label: 'Stock Quantity',
      data: [],
      backgroundColor: `${chartTheme.accent}D9`,
      borderWidth: 0,
    }],
  };

  const chartOptions = chartJsBarOptions(chartTheme);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)] mx-auto mb-4"></div>
          <p className="text-[var(--text-secondary)]">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GreetingBanner
        name={firstName}
        pills={<span className="inline-flex items-center rounded-full border border-[var(--border)] px-2.5 py-[3px] text-[11px] text-[var(--text-secondary)]">Inventory</span>}
        actions={
          <Button onClick={loadDashboardData} variant="outline" size="sm">
            <TrendingUp className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        <StatCard
          icon={Package}
          title="Total Items"
          value={stats.totalItems}
          color=""
          description="Active inventory items"
          trend="+12% from last month"
          accentIndex={0}
        />
        <StatCard icon={Tags} title="Categories" value={stats.totalCategories} color="" description="Organized groups" accentIndex={1} />
        <StatCard icon={ArrowUpRight} title="Items Out" value={stats.itemsOut} color="" description="Issued (direct + requests)" trend="+8% this week" accentIndex={2} />
        <StatCard icon={AlertTriangle} title="Low Stock" value={stats.lowStockItems} color="" description="Needs replenishment" accentIndex={3} />
        <StatCard icon={BarChart3} title="Total Stock Qty" value={totalStockQuantity.toLocaleString()} color="" description="All items combined" trend={`${avgPerItem} avg per item`} accentIndex={4} />
        <StatCard icon={FileText} title="Pending Requests" value={stats.pendingRequests} color="" description="Awaiting approval" accentIndex={0} />
        <StatCard icon={CheckCircle} title="Completed Requests" value={stats.completedRequests} color="" description="Finalized issuances" accentIndex={1} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Stock Overview</h2>
            <span className="text-[13px] text-[var(--primary)]">Top items</span>
          </div>
          <div className="h-80">
            {allItems.length > 0 ? (
              <Bar data={chartData} options={chartOptions} />
            ) : (
              <EmptyState title="No stock data" description="Add inventory items to see stock quantities here." icon={Package} />
            )}
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Recent Activity</h2>
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity) => {
                const Icon = activity.icon;
                return (
                  <div key={activity.id} className="flex gap-3 rounded-[var(--radius-sm)] px-2 py-2.5 transition duration-150 hover:bg-[var(--surface-hover)]">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{activity.title}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{activity.description}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{new Date(activity.dateTime).toLocaleString()}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState title="No recent activity" description="Issuances and requests will appear in this timeline." icon={Users} />
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Button className="h-11 w-full" onClick={() => navigate('/inventory')}>
            <Package className="h-4 w-4" /> Manage Inventory
          </Button>
          <Button variant="outline" className="h-11 w-full" onClick={() => navigate('/items-out')}>
            <ArrowUpRight className="h-4 w-4" /> Issue Item
          </Button>
          <Button variant="outline" className="h-11 w-full" onClick={() => navigate('/reports')}>
            <TrendingUp className="h-4 w-4" /> View Reports
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
