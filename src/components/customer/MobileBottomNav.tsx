// src/components/customer/MobileBottomNav.tsx
import React from 'react';
import { Home, Ticket, FilePlus, User, LogOut } from 'lucide-react';
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
    { icon: Ticket, label: 'My Tickets', path: '/customer/tickets' },
    { icon: FilePlus, label: 'New Ticket', path: '/customer/create-ticket' },
    { icon: User, label: 'Profile', path: '/customer/profile' },
  ];

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
      {/* Subtle dark gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />

      {/* Glassmorphic Nav Bar */}
      <div className="relative bg-white/80 backdrop-blur-2xl border-t border-gray-200/60 shadow-2xl">
        <div className="flex justify-around items-center py-4 px-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.path);

            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className="relative flex flex-col items-center justify-center w-20 py-2 transition-all duration-300 group"
              >
                {/* Active Underline - Gradient Bar */}
                <div
                  className={`
                    absolute -top-1 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full
                    transition-all duration-300 ease-out
                    ${active ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}
                  `}
                  style={{
                    background: 'linear-gradient(to right, #4f46e5, #7c3aed)', // indigo-600 to purple-600
                  }}
                />

                {/* Icon */}
                <Icon
                  className={`
                    w-6 h-6 transition-all duration-300
                    ${active
                      ? 'text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text drop-shadow'
                      : 'text-gray-500 group-hover:text-gray-700'
                    }
                  `}
                />

                {/* Label */}
                <span
                  className={`
                    text-xs font-medium mt-1 transition-all duration-300
                    ${active
                      ? 'text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text'
                      : 'text-gray-500 group-hover:text-gray-700'
                    }
                  `}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="flex flex-col items-center justify-center w-20 py-2 transition-all duration-300 group"
          >
            <LogOut className="w-6 h-6 text-red-500 group-hover:text-red-600 transition-colors" />
            <span className="text-xs font-medium mt-1 text-red-500 group-hover:text-red-600">
              Logout
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileBottomNav;