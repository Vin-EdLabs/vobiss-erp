// src/pages/customer/CustomerApp.tsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Dashboard from './Dashboard';
import CreateTicketPage from './CreateTicket'; // ✅ clear alias
import ProfilePage from './Profile';
import TicketsPage from './Tickets';          // ← NEW: Tickets list
import TicketDetail from './TicketDetail';    // ← NEW: Ticket detail

// 🔐 Auth guard — reusable, explicit
const useAuth = () => {
  return !!localStorage.getItem('customer_token');
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/customer/login" replace />;
};

const CustomerApp = () => {
  return (
    <Routes>
      {/* 🔓 Public */}
      <Route path="/login" element={<Login />} />

      {/* 🔒 Protected — all under /customer/... */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets"
        element={
          <ProtectedRoute>
            <TicketsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/:id"
        element={
          <ProtectedRoute>
            <TicketDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/create-ticket"
        element={
          <ProtectedRoute>
            <CreateTicketPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />

      {/* 🧭 Redirects */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* ⚠️ Catch legacy root paths and redirect inside /customer */}
      <Route path="/tickets" element={<Navigate to="/customer/tickets" replace />} />
      <Route path="/create-ticket" element={<Navigate to="/customer/create-ticket" replace />} />
      <Route path="/profile" element={<Navigate to="/customer/profile" replace />} />

      {/* ❌ Fallback */}
      <Route path="*" element={<Navigate to="/customer/login" replace />} />
    </Routes>
  );
};

export default CustomerApp;