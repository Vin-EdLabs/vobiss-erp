// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route, Navigate, useLocation } from "react-router-dom"; // ← NO BrowserRouter here

import Index from "./pages/Index";          // Staff protected app
import NotFound from "./pages/NotFound";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";          // Staff login
import SharedRecordPage from "./pages/SharedRecordPage"; // Public/private shared-link viewer
import { PWAUpdateToast } from "./components/PWAUpdateToast";

// CUSTOMER PORTAL IMPORTS
import CustomerApp from "./pages/customer/CustomerApp";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const location = useLocation();
  return user ? <>{children}</> : <Navigate to="/login" state={{ from: location }} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {/* Registers the service worker on every route (including /login and /customer/*), not
          just once someone is signed into the staff app — install criteria need it active from
          the very first page load, not only after auth. */}
      <PWAUpdateToast />

      {/* NO <BrowserRouter> here – it's already in main.tsx */}
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/shared/:token" element={<SharedRecordPage />} />
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