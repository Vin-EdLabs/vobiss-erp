// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route, Navigate } from "react-router-dom"; // ← NO BrowserRouter here

import Index from "./pages/Index";          // Staff protected app
import NotFound from "./pages/NotFound";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";          // Staff login

// CUSTOMER PORTAL IMPORTS
import CustomerApp from "./pages/customer/CustomerApp";

const queryClient = new QueryClient();

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />

      {/* NO <BrowserRouter> here – it's already in main.tsx */}
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/customer/*" element={<CustomerApp />} />
          <Route path="/not-found" element={<NotFound />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <Index />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/not-found" replace />} />
        </Routes>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;