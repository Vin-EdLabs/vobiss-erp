// src/components/customer/CustomerHeader.tsx
import React from 'react';
import { User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CustomerHeaderProps {
  name: string;
  customer_code: string;
  heightClass?: string;
}

const CustomerHeader: React.FC<CustomerHeaderProps> = ({
  name,
  customer_code,
  heightClass = 'py-4 md:py-5',
}) => {
  const navigate = useNavigate();
  const firstName = name.split(' ')[0] || name;

  const handleProfileClick = () => {
    navigate('/customer/profile');
  };

  return (
    <header className="fixed top-0 left-0 right-0 md:left-64 z-40">
      {/* Glassmorphic Background */}
      <div className="absolute inset-0 bg-white/70 backdrop-blur-lg border-b border-white/30 shadow-sm" />
      
      {/* Very subtle purple glow overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-400/5 via-transparent to-indigo-400/5 pointer-events-none" />

      <div className={`relative px-5 md:px-8 ${heightClass}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between h-full">
          {/* Welcome Text - High visibility */}
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 drop-shadow-sm">
              Welcome,{' '}
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent font-extrabold">
                {firstName}
              </span>
            </h1>
            <p className="text-xs md:text-sm text-gray-600 mt-0.5 font-medium">
              Project dashboard
            </p>
          </div>

          {/* Clickable Profile Area */}
          <button
            onClick={handleProfileClick}
            className="group flex items-center gap-4 px-5 py-3 rounded-2xl bg-white/40 backdrop-blur-sm hover:bg-white/60 transition-all duration-300 shadow-sm hover:shadow-md border border-white/30"
          >
            {/* Customer ID */}
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-600 font-medium">Customer ID</p>
              <p className="text-sm font-mono font-bold text-purple-700">
                {customer_code}
              </p>
            </div>

            {/* Avatar */}
            <div className="w-11 h-11 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg ring-2 ring-white/50 group-hover:ring-purple-300/60 transition-all duration-300 group-hover:scale-105">
              <User className="w-6 h-6 text-white" />
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};

export default CustomerHeader;