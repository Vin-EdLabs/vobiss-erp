// src/components/customer/CustomerSidebar.tsx
import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Ticket,
  FilePlus,
  Settings,
  LogOut,
  MapPinned,
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
    await new Promise((r) => setTimeout(r, 400));
    logoutCustomer();
    navigate('/customer/login');
  };

  const menuItems = [
    { icon: Home, label: 'Dashboard', path: '/customer/dashboard' },
    { icon: MapPinned, label: 'My Sites', path: '/customer/sites' },
    { icon: Ticket, label: 'My Tickets', path: '/customer/tickets' },
    { icon: FilePlus, label: 'Create Ticket', path: '/customer/create-ticket' },
    { icon: Settings, label: 'Profile & Settings', path: '/customer/profile' },
  ];

  const isActive = (path: string) => location.pathname.startsWith(path);

  if (loading || !customer) return null;

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 border-r border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] md:block">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-secondary)] px-5 py-6">
          <img src="/vobiss-logo.png" alt="Vobiss" className="h-12 w-12 object-contain" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Vobiss</h1>
            <p className="text-sm font-medium text-[var(--primary)]">Client Portal</p>
          </div>
        </div>

        <div className="border-b border-[var(--border)] px-5 py-4">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{customer.name}</p>
          <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">{customer.customer_code}</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-[var(--accent-green-light)] text-[var(--primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className={`mr-3 h-5 w-5 shrink-0 ${active ? 'text-[var(--primary)]' : ''}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-950/30"
          >
            <LogOut className="mr-3 h-5 w-5" />
            {isLoggingOut ? 'Logging out…' : 'Logout'}
          </button>
        </div>
      </div>
    </aside>
  );
};

export default CustomerSidebar;
