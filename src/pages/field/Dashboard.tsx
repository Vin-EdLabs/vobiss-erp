// src/pages/field/Dashboard.tsx — FINAL WITH SOFT WHITE + BLUE + GREEN HEADER
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fieldApi, getFieldEngineers } from '../../api';
import { StatCard } from '@/components/ui/stat-card';
import { GreetingBanner, OutlinePill } from '@/components/ui/greeting-banner';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { 
  MapPin, Activity, Clock, TrendingUp, CheckCircle, 
  PlusCircle, User, ChevronDown, Users as UsersIcon
} from 'lucide-react';

interface FieldActivity {
  id: number;
  projectName: string;
  town: string;
  engineer: string;
  status: 'Pending' | 'Ongoing' | 'Completed';
  lat: number;
  lng: number;
  createdAt: string;
  updatedAt: string;
}

interface FieldEngineer {
  id: number;
  fullName: string;
  username: string;
  email: string;
}

const FieldDashboard: React.FC = () => {
  const { user } = useAuth();
  const [activities, setActivities] = useState<FieldActivity[]>([]);
  const [fieldEngineers, setFieldEngineers] = useState<FieldEngineer[]>([]);
  const [selectedEngineer, setSelectedEngineer] = useState<string>('All Engineers');
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    ongoing: 0,
    completed: 0,
    myProjects: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    let activityData: FieldActivity[] = [];
    let engineerData: FieldEngineer[] = [];

    try {
      const raw = await fieldApi.getAll();
      activityData = Array.isArray(raw) ? raw : [];
    } catch (err) {
      console.error('Failed to load field activities:', err);
    }

    try {
      const raw = await getFieldEngineers();
      engineerData = Array.isArray(raw) ? raw : [];
    } catch (err) {
      console.error('Failed to load field engineers:', err);
    }

    setActivities(activityData);
    setFieldEngineers(engineerData);
    updateStats(activityData, 'All Engineers');
    setLoading(false);
  };

  const updateStats = (data: FieldActivity[], engineerFilter: string) => {
    const filtered = engineerFilter === 'All Engineers' 
      ? data 
      : data.filter(a => a.engineer === engineerFilter);

    const myName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
    const myProjects = filtered.filter(a => 
      (a.engineer || '').toLowerCase().includes(myName.toLowerCase())
    );

    setStats({
      total: filtered.length,
      pending: filtered.filter(a => a.status === 'Pending').length,
      ongoing: filtered.filter(a => a.status === 'Ongoing').length,
      completed: filtered.filter(a => a.status === 'Completed').length,
      myProjects: myProjects.length
    });
  };

  const handleEngineerChange = (name: string) => {
    setSelectedEngineer(name);
    updateStats(activities, name);
  };

  const recentActivities = activities
    .filter(a => selectedEngineer === 'All Engineers' || a.engineer === selectedEngineer)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'Pending': return { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: Clock };
      case 'Ongoing': return { color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', icon: TrendingUp };
      case 'Completed': return { color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle };
      default: return { color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', icon: Activity };
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent"></div>
          <p className="font-medium text-[var(--text-secondary)]">Loading Field Operations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GreetingBanner
        name={user?.first_name || 'there'}
        pills={<OutlinePill icon={MapPin}>Field Operations</OutlinePill>}
        actions={
          <Button size="sm" asChild>
            <Link to="/field/add">
              <PlusCircle className="h-4 w-4" />
              Add Project
            </Link>
          </Button>
        }
      />

      <div>
        <div className="mb-6">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text-body)]">
                <UsersIcon className="h-5 w-5 text-[var(--primary)]" />
                Team ({fieldEngineers.length})
              </label>
              <div className="relative">
                <select
                  value={selectedEngineer}
                  onChange={(e) => handleEngineerChange(e.target.value)}
                  className="w-full appearance-none rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] py-2.5 pl-4 pr-12 font-medium text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-green-light)] sm:w-80"
                >
                  <option value="All Engineers">All TX Engineers</option>
                  {fieldEngineers.map((eng) => (
                    <option key={eng.id} value={eng.fullName}>
                      {eng.fullName} ({eng.username})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {[
              { label: 'Total', value: stats.total, icon: Activity },
              { label: 'Pending', value: stats.pending, icon: Clock },
              { label: 'In Progress', value: stats.ongoing, icon: TrendingUp },
              { label: 'Completed', value: stats.completed, icon: CheckCircle },
              { label: 'My Projects', value: stats.myProjects, icon: User },
            ].map((stat, i) => (
              <StatCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} accentIndex={i} />
            ))}
          </div>
        </div>

        {/* Rest of your beautiful dashboard stays the same */}
        {/* ... (Recent Activities + Sidebar – unchanged from previous clean version) */}
        
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
              <div className="border-b border-[var(--border)] px-5 py-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Activity className="h-4 w-4 text-[var(--primary)]" />
                  Recent Activities
                  {selectedEngineer !== 'All Engineers' && (
                    <span className="text-[var(--text-muted)]">• {selectedEngineer}</span>
                  )}
                </h2>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {recentActivities.length === 0 ? (
                  <EmptyState title="No activities found" description="Field work will show up here as it is logged." icon={MapPin} />
                ) : (
                  recentActivities.map((activity) => {
                    const config = getStatusConfig(activity.status);
                    const Icon = config.icon;
                    return (
                      <div key={activity.id} className="p-5 hover:bg-[var(--surface-hover)]">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-[var(--text-primary)]">{activity.projectName}</h3>
                            <div className="mt-2 flex gap-6 text-sm text-[var(--text-secondary)]">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" /> {activity.town}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="w-4 h-4" /> {activity.engineer}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${config.bg} ${config.border} ${config.color}`}>
                              <Icon className="w-4 h-4" />
                              {activity.status}
                            </span>
                            <p className="mt-2 text-xs text-[var(--text-muted)]">
                              {new Date(activity.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
              <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Quick Actions</h3>
              <div className="space-y-3">
                <Link to="/field/add" className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--primary)] px-5 py-3 font-semibold text-white hover:bg-[var(--primary-hover)]">
                  <PlusCircle className="w-5 h-5" /> Add Project
                </Link>
                <Link to="/field/map" className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium py-3 px-5 rounded-lg shadow hover:shadow-md transition">
                  <MapPin className="w-5 h-5" /> View Map
                </Link>
                <Link to="/field/activities" className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-transparent px-5 py-3 font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
                  <Activity className="w-5 h-5" /> All Activities
                </Link>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-blue-600 text-white rounded-xl p-6 shadow-xl">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-4 rounded-xl">
                  <User className="w-10 h-10" />
                </div>
                <div>
                  <p className="text-sm opacity-90">Field Engineer</p>
                  <p className="font-bold text-lg">{user?.first_name} {user?.last_name}</p>
                </div>
              </div>
              <div className="mt-6 pt-5 border-t border-white/30">
                <p className="text-4xl font-extrabold">{stats.myProjects}</p>
                <p className="text-sm opacity-90">Active Projects</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FieldDashboard;