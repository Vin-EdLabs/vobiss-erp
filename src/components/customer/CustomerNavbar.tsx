// src/components/customer/CustomerNavbar.tsx
import React from 'react';
import { Menu } from 'lucide-react';

interface CustomerNavbarProps {
  onMenuClick: () => void;
  userName?: string;
}

const CustomerNavbar: React.FC<CustomerNavbarProps> = ({ onMenuClick, userName }) => {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
      <div className="flex items-center justify-between px-4 py-4 md:px-8">
        {/* Mobile Menu Button */}
        <button
          onClick={onMenuClick}
          className="md:hidden text-gray-700 hover:text-gray-900"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Welcome Title */}
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">
          Welcome back, {userName || 'Customer'}!
        </h1>

        {/* Spacer for mobile (to balance layout) */}
        <div className="w-10 md:hidden"></div>
      </div>
    </header>
  );
};

export default CustomerNavbar;