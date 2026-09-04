// src/pages/AuditLogs.tsx — FINAL FULL WORKING VERSION (SHOWS APPROVER NAME)
import React, { useState, useEffect } from 'react';
import { getAuditLogs } from '../api';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { COMPANY_LABELS } from '../hooks/useCompany';

const AuditLogs = () => {
  const { isAdminSuper } = useAuth();
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [paginatedLogs, setPaginatedLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState('All');
  const [selectedCompany, setSelectedCompany] = useState('All');
  const [sortBy, setSortBy] = useState('user');
  const [loginStats, setLoginStats] = useState({ totalToday: 0, usersToday: {} });
  const [filterDate, setFilterDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [showAll, setShowAll] = useState(false);
  const [ipInfo, setIpInfo] = useState({});
  const [currentPublicIP, setCurrentPublicIP] = useState('Loading...');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const parseTimestamp = (timestamp) => {
    if (!timestamp) return new Date(0);
    const ts = timestamp.endsWith('Z') ? timestamp : timestamp + 'Z';
    return new Date(ts);
  };

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const data = await getAuditLogs();
        setLogs(data);
        calculateLoginStats(data);
      } catch (err) {
        setError('Failed to load audit logs');
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  useEffect(() => {
    const fetchCurrentPublicIP = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        if (response.ok) {
          const data = await response.json();
          setCurrentPublicIP(data.ip);
        } else {
          setCurrentPublicIP('Unable to fetch');
        }
      } catch (err) {
        setCurrentPublicIP('Unable to fetch');
      }
    };
    fetchCurrentPublicIP();
  }, []);

  const refreshPublicIP = async () => {
    setCurrentPublicIP('Loading...');
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      if (response.ok) {
        const data = await response.json();
        setCurrentPublicIP(data.ip);
      }
    } catch (err) {
      setCurrentPublicIP('Unable to fetch');
    }
  };

  const isLocalIP = (ip) => {
    return ip === '::1' || ip === '127.0.0.1' || ip === '0.0.0.0' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.');
  };

  useEffect(() => {
    const fetchLoginIpInfos = async () => {
      const loginIps = [...new Set(
        filteredLogs
          .filter(log => log.action === 'login')
          .map(log => log.ip_address)
          .filter(ip => ip && !ipInfo[ip] && !isLocalIP(ip))
      )];

      if (loginIps.length === 0) return;

      const fetchPromises = loginIps.map(async (ip) => {
        try {
          const response = await fetch(`https://ipapi.co/${ip}/json/`);
          if (response.ok) {
            const data = await response.json();
            setIpInfo(prev => ({ ...prev, [ip]: data }));
          }
        } catch (err) {
          console.error(`IP lookup failed for ${ip}:`, err);
        }
      });

      await Promise.all(fetchPromises);
    };

    fetchLoginIpInfos();
  }, [filteredLogs]);

  const calculateLoginStats = (allLogs) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const startMs = todayStart.getTime();
    const endMs = todayEnd.getTime();

    const stats = { totalToday: 0, usersToday: {} };

    const loginLogs = allLogs.filter(log => log.action === 'login');
    loginLogs.forEach(log => {
      try {
        const ts = log.timestamp.endsWith('Z') ? log.timestamp : log.timestamp + 'Z';
        const logTime = new Date(ts).getTime();
        if (logTime >= startMs && logTime < endMs) {
          stats.totalToday++;
          const userKey = log.full_name || log.username || (log.user_id ? `Deleted User (${log.user_id})` : 'Anonymous');
          stats.usersToday[userKey] = (stats.usersToday[userKey] || 0) + 1;
        }
      } catch (e) {
        console.error('Invalid timestamp in login stats:', log.timestamp);
      }
    });

    setLoginStats(stats);
  };

  const exportToExcel = () => {
    const exportData = filteredLogs.map((log) => {
      let geo = '';
      if (log.action === 'login') {
        if (isLocalIP(log.ip_address)) {
          geo = ` (Localhost - Public: ${currentPublicIP})`;
        } else if (ipInfo[log.ip_address]) {
          geo = ` (${ipInfo[log.ip_address].city || 'N/A'}, ${ipInfo[log.ip_address].country_name || 'N/A'})`;
        }
      }
      return {
        'Date & Time': `${formatDate(log.timestamp)} ${formatTime(log.timestamp)}`,
        User: log.full_name || log.username || (log.user_id ? `Deleted User (${log.user_id})` : 'Anonymous'),
        Action: log.action.replace(/_/g, ' '),
        'IP Address': `${log.ip_address}${geo}`,
        Details: log.details ? (typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : log.details) : 'No details',
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Logs');
    const fileName = showAll ? 'All_Audit_Logs.xlsx' : `Audit_Logs_${filterDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const formatDate = (timestamp) => {
    const date = parseTimestamp(timestamp);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[date.getDay()];
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${dayName} ${day}/${month}/${year}`;
  };

  const formatTime = (timestamp) => {
    const date = parseTimestamp(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getRequestTypeLabel = (type?: string) => {
    return type === 'item_return' ? 'return' : 'request';
  };

  // FINAL renderDetails — SHOWS APPROVER NAME IN APPROVALS
  const renderDetails = (action, details) => {
    if (!details) return 'No details';
    try {
      const parsedDetails = typeof details === 'string' ? JSON.parse(details) : details;

      switch (action) {
        case 'update_profile':
          const changes = [];
          if (parsedDetails.changed_username) changes.push('username');
          if (parsedDetails.changed_password) changes.push('password');
          return changes.length > 0
            ? `Updated profile: ${changes.join(' and ')} changed`
            : 'Viewed profile';

        case 'update_setting':
          if (parsedDetails.key === 'smtp_password') {
            return `Updated system setting: "${parsedDetails.key}" → [Password changed]`;
          }
          return `Updated system setting: "${parsedDetails.key}" → "${parsedDetails.new_value || 'modified'}"`;

        case 'approve_request':
          const stageLabel = parsedDetails.stage_label || 'Approval';
          const approverName = parsedDetails.approved_by || 'Unknown';
          const requestId = parsedDetails.request_id || 'N/A';
          return `Approved ${getRequestTypeLabel(parsedDetails.type)} ID: ${requestId} as ${stageLabel} by ${approverName}`;

        case 'create_request':
          return `Created ${getRequestTypeLabel(parsedDetails.type)} ID: ${parsedDetails.request_id || 'N/A'}`;
        case 'update_request':
        case 'update_return':
          return `Updated ${getRequestTypeLabel(parsedDetails.type)} ID: ${parsedDetails.request_id || 'N/A'}`;
        case 'reject_request':
          return `Rejected ${getRequestTypeLabel(parsedDetails.type)} ID: ${parsedDetails.request_id || 'N/A'}`;
        case 'finalize_request':
          return `Finalized ${getRequestTypeLabel(parsedDetails.type)} ID: ${parsedDetails.request_id || 'N/A'} released by: ${parsedDetails.released_by || 'Unknown'}`;
        case 'create_user':
          return `Created user: ${parsedDetails.username || 'N/A'} (${parsedDetails.role || 'N/A'})`;
        case 'delete_user':
          return `Deleted user: ${parsedDetails.username || parsedDetails.user_id || 'N/A'}`;
        case 'reset_password':
          return `Reset password for user: ${parsedDetails.username || parsedDetails.user_id || 'N/A'}`;
        case 'update_user_role':
          return `Updated role for user: ${parsedDetails.username || parsedDetails.user_id || 'N/A'} from: ${parsedDetails.old_role || 'N/A'} to: ${parsedDetails.new_role || 'N/A'}`;
        case 'create_item':
          return `Created item: ${parsedDetails.item_name || 'N/A'}`;
        case 'update_item':
          let updateStr = `Updated item: ${parsedDetails.item_name || parsedDetails.item_id || 'N/A'} - reason: ${parsedDetails.reason || 'N/A'}`;
          if (parsedDetails.old_quantity !== undefined && parsedDetails.new_quantity !== undefined) {
            updateStr += ` (Quantity changed from ${parsedDetails.old_quantity} to ${parsedDetails.new_quantity})`;
          }
          return updateStr;
        case 'delete_item':
          return `Deleted item: ${parsedDetails.item_name || parsedDetails.item_id || 'N/A'}`;
        case 'issue_item':
          return `Issued ${parsedDetails.quantity || 'N/A'} of item: ${parsedDetails.item_name || parsedDetails.item_id || 'N/A'} to: ${parsedDetails.person_name || 'N/A'}`;
        case 'create_category':
          return `Created category: ${parsedDetails.category_name || 'N/A'}`;
        case 'update_category':
          return `Updated category: ${parsedDetails.category_name || parsedDetails.category_id || 'N/A'}`;
        case 'delete_category':
          return `Deleted category: ${parsedDetails.category_name || parsedDetails.category_id || 'N/A'}`;

        default:
          return (
            <pre className="bg-gray-50 p-3 rounded-md text-xs overflow-auto max-h-20">
              {JSON.stringify(parsedDetails, null, 2)}
            </pre>
          );
      }
    } catch (e) {
      return (
        <pre className="bg-gray-50 p-3 rounded-md text-xs overflow-auto max-h-20">
          {JSON.stringify(details, null, 2)}
        </pre>
      );
    }
  };

  useEffect(() => {
    let filtered = [...logs];

    if (!showAll && filterDate) {
      try {
        const filterDateObj = new Date(filterDate + 'T00:00:00');
        const startMs = filterDateObj.getTime();
        const nextDay = new Date(filterDateObj);
        nextDay.setDate(nextDay.getDate() + 1);
        const endMs = nextDay.getTime();

        filtered = filtered.filter(log => {
          try {
            const ts = log.timestamp.endsWith('Z') ? log.timestamp : log.timestamp + 'Z';
            const logTime = new Date(ts).getTime();
            return logTime >= startMs && logTime < endMs;
          } catch (e) {
            return false;
          }
        });
      } catch (e) {
        console.error('Invalid filter date:', filterDate);
      }
    }

    if (searchTerm) {
      filtered = filtered.filter(log =>
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.full_name || log.username || log.user_id?.toString() || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.ip_address.includes(searchTerm)
      );
    }

    if (selectedUser !== 'All') {
      filtered = filtered.filter(log => (log.full_name || log.username || (log.user_id ? `Deleted User (${log.user_id})` : 'Anonymous')) === selectedUser);
    }

    if (isAdminSuper && selectedCompany !== 'All') {
      filtered = filtered.filter(log => (log.company || 'CW') === selectedCompany);
    }

    filtered.sort((a, b) => {
      if (sortBy === 'timestamp') {
        return parseTimestamp(b.timestamp).getTime() - parseTimestamp(a.timestamp).getTime();
      } else if (sortBy === 'action') {
        return (a.action || '').localeCompare(b.action || '');
      } else if (sortBy === 'user') {
        return (a.full_name || a.username || '').localeCompare(b.full_name || b.username || '');
      }
      return 0;
    });

    setFilteredLogs(filtered);
    setCurrentPage(1);
  }, [logs, searchTerm, selectedUser, selectedCompany, isAdminSuper, sortBy, showAll, filterDate]);

  useEffect(() => {
    const totalPages = Math.ceil(filteredLogs.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    setPaginatedLogs(filteredLogs.slice(startIndex, endIndex));
  }, [filteredLogs, currentPage]);

  const totalPages = Math.ceil(filteredLogs.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, filteredLogs.length);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-lg">
          <div className="flex items-center">
            <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        </div>
      </div>
    );
  }

  const uniqueUsers = [...new Set(logs.map(log => log.full_name || log.username || (log.user_id ? `Deleted User (${log.user_id})` : 'Anonymous')))];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Audit Logs</h1>
          <p className="text-gray-600">Track all user activities, including logins, creations, updates, deletions, and approvals for enhanced security.</p>
        </div>
        <button
          onClick={refreshPublicIP}
          className="bg-white hover:bg-gray-50 text-indigo-600 px-4 py-2 rounded-lg text-sm font-medium border border-indigo-200 shadow-sm transition-all duration-200 hover:shadow-md hover:border-indigo-300 flex items-center space-x-2"
          disabled={currentPublicIP === 'Loading...'}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh IP</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-100">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Logins Today</p>
              <p className="text-2xl font-bold text-gray-900">{loginStats.totalToday}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Users Today</p>
              <p className="text-2xl font-bold text-gray-900">{Object.keys(loginStats.usersToday).length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-purple-100">
              <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Entries</p>
              <p className="text-2xl font-bold text-gray-900">{logs.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-gray-200 p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-blue-50 opacity-50"></div>
          <div className="relative flex items-center">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 shadow-lg">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Your Public IP</p>
                <p className={`text-xl font-bold ${currentPublicIP === 'Loading...' ? 'text-gray-400' : 'text-gray-900'}`}>
                  {currentPublicIP}
                </p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">Live fetch for development/testing</p>
        </div>
      </div>

      {/* Today's Login Summary */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Today's Login Summary</h2>
        <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Logins Today</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Last Login</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(loginStats.usersToday).map(([user, count]) => {
                const lastLogin = logs
                  .filter(log => (log.full_name || log.username || (log.user_id ? `Deleted User (${log.user_id})` : 'Anonymous')) === user && log.action === 'login')
                  .sort((a, b) => parseTimestamp(b.timestamp).getTime() - parseTimestamp(a.timestamp).getTime())[0];
                return (
                  <tr key={user} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{count}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{lastLogin ? formatTime(lastLogin.timestamp) : 'N/A'}</td>
                  </tr>
                );
              })}
              {Object.keys(loginStats.usersToday).length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-gray-500 text-sm">No logins today</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-gray-200 p-6 mb-6">
        <div className={`grid grid-cols-1 gap-4 ${isAdminSuper ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
          {isAdminSuper && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Company</label>
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="All">All</option>
                {Object.entries(COMPANY_LABELS).map(([slug, label]) => (
                  <option key={slug} value={slug}>{label}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <input
              type="text"
              placeholder="Search by action, user, or IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by User</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="All">All Users</option>
              {uniqueUsers.map(user => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="user">User</option>
              <option value="timestamp">Latest First</option>
              <option value="action">Action</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date Filter</label>
            <div className="space-y-2">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                disabled={showAll}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${showAll ? 'bg-gray-100' : ''}`}
              />
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Show All</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Activity Log</h2>
            <p className="text-sm text-gray-500">Showing {paginatedLogs.length} of {filteredLogs.length} entries</p>
          </div>
          <button
            onClick={exportToExcel}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Export to Excel
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date & Time</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">IP Address</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedLogs.map((log) => {
                const isLogin = log.action === 'login';
                const isLocal = isLocalIP(log.ip_address);
                const geoInfo = isLogin && !isLocal && ipInfo[log.ip_address];
                let ipDisplay = log.ip_address;
                let ipSuffix = '';
                if (isLogin) {
                  if (isLocal && currentPublicIP !== 'Loading...' && currentPublicIP !== 'Unable to fetch') {
                    ipSuffix = ` (Public: ${currentPublicIP})`;
                  } else if (!isLocal) {
                    ipSuffix = geoInfo ? ` (${geoInfo.city || 'N/A'}, ${geoInfo.country_name || 'N/A'})` : ' Fetching...';
                  } else {
                    ipSuffix = ' (Localhost)';
                  }
                }
                const userDisplay = log.full_name || log.username || (log.user_id ? `Deleted User (${log.user_id})` : 'Anonymous');
                return (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{formatDate(log.timestamp)}</div>
                      <div className="text-sm text-gray-500">{formatTime(log.timestamp)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-medium ${userDisplay.includes('Deleted User') || userDisplay === 'Anonymous' ? 'text-gray-500 italic' : 'text-gray-900'}`}>
                        {userDisplay}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                        log.action === 'login' ? 'bg-green-100 text-green-800' :
                        log.action === 'logout' ? 'bg-gray-100 text-gray-800' :
                        log.action.includes('create') ? 'bg-blue-100 text-blue-800' :
                        log.action.includes('update') ? 'bg-yellow-100 text-yellow-800' :
                        log.action.includes('delete') ? 'bg-red-100 text-red-800' :
                        log.action.includes('approve') ? 'bg-purple-100 text-purple-800' :
                        log.action.includes('reject') ? 'bg-orange-100 text-orange-800' :
                        log.action.includes('issue') ? 'bg-indigo-100 text-indigo-800' : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center space-x-2">
                        <a href={`https://whatismyipaddress.com/ip/${log.ip_address}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {ipDisplay}
                        </a>
                        {isLogin && <span className={`text-xs ${isLocal ? 'text-gray-600' : geoInfo ? 'text-gray-600' : 'text-gray-400 italic'}`}>{ipSuffix}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-md">
                        {renderDetails(log.action, log.details)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredLogs.length === 0 && (
          <div className="px-6 py-12 text-center text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <h3 className="mt-2 text-sm font-medium">No audit logs</h3>
            <p className="mt-1 text-sm">No activities match the selected filters.</p>
          </div>
        )}
        {totalPages > 1 && (
          <div className="px-6 py-4 flex justify-between items-center bg-gray-50 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              Showing {startIndex} to {endIndex} of {filteredLogs.length} entries
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                Previous
              </button>
              <span className="px-3 py-2 text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;