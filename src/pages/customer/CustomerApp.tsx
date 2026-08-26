// src/pages/customer/CustomerApp.tsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Dashboard from './Dashboard';
import CreateTicketPage from './CreateTicket';
import ProfilePage from './Profile';
import TicketsPage from './Tickets';
import TicketDetail from './TicketDetail';
import SitesPage from './Sites';
import { useCustomerPortalTheme } from '../../components/customer/CustomerThemeToggle';

const useAuth = () => !!localStorage.getItem('customer_token');

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/customer/login" replace />;
};

const CustomerApp = () => {
  useCustomerPortalTheme();

  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="sites" element={<ProtectedRoute><SitesPage /></ProtectedRoute>} />
      <Route path="tickets" element={<ProtectedRoute><TicketsPage /></ProtectedRoute>} />
      <Route path="tickets/:id" element={<ProtectedRoute><TicketDetail /></ProtectedRoute>} />
      <Route path="create-ticket" element={<ProtectedRoute><CreateTicketPage /></ProtectedRoute>} />
      <Route path="profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="*" element={<Navigate to="login" replace />} />
    </Routes>
  );
};

export default CustomerApp;
