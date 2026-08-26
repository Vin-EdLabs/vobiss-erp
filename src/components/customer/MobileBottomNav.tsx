// src/components/customer/MobileBottomNav.tsx
import React from 'react';
import { Home, Ticket, FilePlus, User, LogOut, MapPinned } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { logoutCustomer } from '../../api';

const MobileBottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logoutCustomer();
    navigate('/customer/login');
  };

  const tabs = [
    { icon: Home, label: 'Home', path: '/customer/dashboard' },
    { icon: MapPinned, label: 'Sites', path: '/customer/sites' },
    { icon: Ticket, label: 'Tickets', path: '/customer/tickets' },
    { icon: FilePlus, label: 'New', path: '/customer/create-ticket' },
    { icon: User, label: 'Profile', path: '/customer/profile' },
  ];

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <div className="border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-xl shadow-[var(--shadow-md)]">
        <div className="flex items-center justify-around px-1 py-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.path);
            return (
              <button
                key={tab.path}
                type="button"
                onClick={() => navigate(tab.path)}
                className="flex min-w-0 flex-1 flex-col items-center justify-center py-2"
              >
                <Icon className={`h-5 w-5 ${active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
                <span className={`mt-1 text-[10px] font-medium ${active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-w-0 flex-1 flex-col items-center justify-center py-2"
          >
            <LogOut className="h-5 w-5 text-red-500" />
            <span className="mt-1 text-[10px] font-medium text-red-500">Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileBottomNav;
