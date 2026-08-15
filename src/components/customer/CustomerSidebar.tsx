// src/components/customer/CustomerSidebar.tsx
import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Ticket,
  FilePlus,
  Settings,
  LogOut,
  Bell,
  X,
} from 'lucide-react';
import { logoutCustomer } from '../../api';
import { API_URL } from '@/lib/api';

interface CustomerInfo {
  name: string;
  customer_code: string;
}

const CustomerSidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNotif, setShowNotif] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        const token = localStorage.getItem('customer_token');
        if (!token) {
          navigate('/customer/login');
          return;
        }

        const res = await fetch(`${API_URL}/customer/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error('Invalid session');

        const data = await res.json();
        const customerData = data.customer || data;

        setCustomer({
          name: customerData.name || 'Customer',
          customer_code: customerData.customer_code || 'N/A',
        });
      } catch {
        localStorage.removeItem('customer_token');
        navigate('/customer/login');
      } finally {
        setLoading(false);
      }
    };

    fetchCustomer();
  }, [navigate]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await new Promise((r) => setTimeout(r, 1000));
    logoutCustomer();
    navigate('/customer/login');
  };

  const notifications = [
    { id: 1, title: 'Welcome back!', message: 'Your support portal is ready.', time: 'Just now', read: false },
    { id: 2, title: 'New Feature', message: 'You can now track ticket progress in real-time.', time: '1 hour ago', read: false },
    { id: 3, title: 'Tip', message: 'Use the search bar to quickly find tickets.', time: '2 hours ago', read: true },
  ];

  const unreadCount = notifications.filter((n) => !n.read).length;

  const menuItems = [
    { icon: Home, label: 'Dashboard', path: '/customer/dashboard' },
    { icon: Ticket, label: 'My Tickets', path: '/customer/tickets' },
    { icon: FilePlus, label: 'Create Ticket', path: '/customer/create-ticket' },
    { icon: Settings, label: 'Profile & Settings', path: '/customer/profile' },
  ];

  const isActive = (path: string) => location.pathname.startsWith(path);

  if (loading || !customer) return null;

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:block fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-2xl border-r border-gray-200">
        <div className="flex flex-col h-full">

          {/* Header */}
          <div className="relative flex items-center justify-between px-6 py-7 bg-gradient-to-b from-blue-50 to-white border-b border-gray-200">
            <div className="flex items-center space-x-4">
              <img src="/vobiss-logo.png" alt="Vobiss" className="h-14 w-14 object-contain drop-shadow-md" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Vobiss</h1>
                <p className="text-sm font-medium text-blue-600">Customer Portal</p>
              </div>
            </div>

            {/* Notification Bell */}
            <button
              onClick={() => setShowNotif(!showNotif)}
              className="relative p-3 rounded-xl hover:bg-gray-100 transition-all duration-200"
            >
              <Bell className="h-6 w-6 text-gray-700" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center animate-pulse shadow-lg">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* User Info */}
          {customer && (
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <p className="text-sm font-semibold text-gray-900">{customer.name}</p>
              <p className="text-xs text-gray-500 font-mono mt-1">{customer.customer_code}</p>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto no-scrollbar">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 group ${
                    active
                      ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-700 shadow-sm'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`h-5 w-5 mr-3 flex-shrink-0 transition-colors ${
                    active ? 'text-blue-700' : 'text-gray-500 group-hover:text-gray-700'
                  }`} />
                  <span className="flex-1">{item.label}</span>
                  {active && <div className="w-1.5 h-1.5 bg-blue-600 rounded-full ml-3" />}
                </Link>
              );
            })}
          </nav>

          {/* Logout */}
          <div className="px-4 py-4 border-t border-gray-200">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
                isLoggingOut
                  ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                  : 'text-red-600 hover:bg-red-50'
              }`}
            >
              {isLoggingOut ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-red-600 mr-3"></div>
              ) : (
                <LogOut className="h-5 w-5 mr-3" />
              )}
              <span>{isLoggingOut ? 'Logging out...' : 'Logout'}</span>
            </button>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 text-center text-xs text-gray-500">
            <p>Version 2.4 — January 2026</p>
            <p className="mt-2 text-blue-600 font-medium">Secure • Fast • Always Here</p>
          </div>
        </div>
      </aside>

      {/* Notification Panel */}
      {showNotif && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/5 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setShowNotif(false)}
          />

          {/* Panel */}
          <div className="fixed top-20 left-64 z-50 w-96">
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in slide-in-from-top duration-300">
              <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800">Notifications</h3>
                <button
                  onClick={() => setShowNotif(false)}
                  className="p-2 rounded-lg hover:bg-gray-200 transition"
                >
                  <X className="h-5 w-5 text-gray-600" />
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Bell className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                    <p>No new notifications</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`px-6 py-4 border-b border-gray-100 hover:bg-gray-50 transition cursor-pointer ${
                        !notif.read ? 'bg-blue-50/30' : ''
                      }`}
                    >
                      <p className="font-medium text-gray-900">{notif.title}</p>
                      <p className="mt-1 text-sm text-gray-600">{notif.message}</p>
                      <p className="mt-2 text-xs text-gray-400">{notif.time}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Hide scrollbar but allow scrolling */}
      <style jsx global>{`
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </>
  );
};

export default CustomerSidebar;