// src/pages/Index.tsx — UPDATED WITH FULL ACCESS FOR NOC, APPROVERS, FIELD, IP (January 09, 2026)
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import ProtectedRoute from '../components/ProtectedRoute';
import Dashboard from './Dashboard';
import DirectorsDashboard from './director/DirectorsDashboard';
import GlobalSearchPage from './director/GlobalSearchPage';
import Inventory from './Inventory';
import Categories from './Categories';
import ItemsOut from './ItemsOut';
import LowStockAlerts from './LowStockAlerts';
import Reports from './Reports';
import AIAssistant from './AIAssistant';
import SettingsPage from './SettingsPage';
import SystemMessages from './SystemMessages';
import RequestForms from './RequestForms';
import ItemReturns from './ItemReturns';
import MaterialApprovals from './MaterialApprovals';
import CashApprovals from './CashApprovals';
import ApprovedForms from './ApprovedForms';
import RequestDetails from './RequestDetails';
import AuditLogs from './AuditLogs';
import UsersPage from './UsersPage';
import ConfigurationPage from './ConfigurationPage';
import SystemGuide from './SystemGuide';
import ProfilePage from './ProfilePage';
import MyWorkspace from './MyWorkspace';
import Chat from './Chat';
import { RealtimeProvider } from '../context/RealtimeContext';
import { VobiProvider } from '../context/VobiContext';
import { VobiRoot } from '../components/vobi';
import { PushNotificationSetup } from '../components/PushNotificationSetup';
import { PWAUpdateToast } from '../components/PWAUpdateToast';
import StaffHeader from '../components/StaffHeader';
import { useIsMobile } from '@/hooks/useIsMobile';
import { applyTheme, readStoredTheme } from '@/lib/theme';
import { useAuth } from '../context/AuthContext';
import AccountSuspended from './AccountSuspended';
import { Button } from '@/components/ui/button';
// ASSETS MANAGER
import AssetsListPage from './assets';
import NewAssetPage from './assets/new';
import AssetDetailPage from './assets/AssetDetail';
import AssetReportsPage from './assets/Reports';
import VendorsList from './assets/vendors';
import NewVendorPage from './assets/vendors/new';
import VendorDetail from './assets/vendors/[id]';
import PeopleList from './assets/assignments';
import NewPersonPage from './assets/assignments/new';
import PersonDetail from './assets/assignments/[id]';
import CategoriesLocationsPage from './assets/categories-locations';
import MaintenanceList from './assets/maintenance';
import NewMaintenancePage from './assets/maintenance/new';
import MaintenanceDetailPage from './assets/maintenance/[id]';

// FIELD ACTIVITIES
import FieldDashboard from './field/Dashboard';
import FieldMapPage from './field/MapPage';
import FieldActivitiesTable from './field/ActivitiesTable';
import AddFieldActivity from './field/AddActivity';

// CASH ADVANCE MODULE
import CashRequestForm from './finance/CashRequestForm';
import FinanceApprovals from './finance/FinanceApprovals';
import CashDetails from './finance/CashDetails';

// CX & SUPPORT TICKETING
import CXDashboard from './staff/cx/Dashboard';
import CXProjects from './staff/cx/Projects';
import CXCustomers from './staff/cx/Customers';
import AllTickets from './staff/cx/Tickets';                  // Master Ticket Queue
import CreateStaffTicket from './staff/cx/CreateStaffTicket';
import AssignUser from './staff/cx/AssignUser';
import EscalateTicket from './staff/cx/EscalateTicket';           // Escalation page
import UserWorkHistory from './staff/cx/UserWorkHistory';        // User Work History
import TicketSearch from './staff/cx/TicketSearch';              // Ticket Search
import TicketDetailPage from './staff/cx/TicketDetailPage';       // Full-page Ticket Details
import ReportsHub from './staff/reports/ReportsHub';
import TicketReport from './staff/reports/TicketReport';
import CashReport from './staff/reports/CashReport';
import ServiceRequestReport from './staff/reports/ServiceRequestReport';

// NOC DASHBOARD
import NOCDashboard from './staff/noc/Dashboard';
import NOCAllTickets from './staff/noc/NOCAllTickets';
import {
  NocManagerEscalations,
  ROEscalations,
  DirectorEscalations,
} from './staff/escalation/EscalationPages';

// IP ENGINEERING QUEUE
import IPAllTickets from './staff/ip/IPAllTickets';

// FIELD ENGINEERS QUEUE
import FieldAllTickets from './field/FieldAllTickets';

// CUSTOMER PORTAL
import CustomerDashboard from './customer/Dashboard';
import CreateTicket from './customer/CreateTicket';
import TicketDetail from './customer/TicketDetail';

import ProductionHub from './production/ProductionHub';
import ProjectUnitHub from './production/ProjectUnitHub';
import ProductionCreate from './production/ProductionCreate';
import ProductionDetail from './production/ProductionDetail';
import ProductionUnitsPage from './production/ProductionUnitsPage';
import HrDashboard from './hr/Dashboard';
import HrEmployees from './hr/Employees';
import HrEmployeeProfile from './hr/EmployeeProfile';
import HrLeave from './hr/Leave';
import HrPayroll from './hr/Payroll';
import HrAttendance from './hr/Attendance';
import HrAnalytics from './hr/Analytics';
import HrReports from './hr/Reports';
import HrDocuments from './hr/Documents';
import HrFormRequests from './hr/FormRequests';
import HrSelfAttendance from './hr-self/Attendance';
import HrSelfLeave from './hr-self/Leave';
import HrSelfForms from './hr-self/Forms';
import {
  WORKSPACE_ROLES,
  TICKET_SUPPORT_ROLES,
  CX_MODULE_ROLES,
  NOC_DASHBOARD_ROLES,
  IP_TICKET_ROLES,
  FIELD_TICKET_ROLES,
  FINANCE_ROLES,
  INVENTORY_ADMIN_ROLES,
  APPROVER_ROLES,
  REQUESTER_ROLES,
  PRODUCTION_ACCESS_ROLES,
  FIELD_ACTIVITY_ROLES,
  EXEC_ROLES,
  HR_ROLES,
  HR_UNITS,
  HR_POSITIONS,
  CX_POSITIONS,
  POST_LOGIN_PATH,
  CASH_REQUEST_ROLES,
  CUSTOMER_PORTAL_STAFF_ROLES,
  DIRECTOR_DASHBOARD_ROLES,
  MAIN_DASHBOARD_ROLES,
  APPROVED_FORMS_ROLES,
  ITEMS_OUT_ROLES,
  TICKET_REPORT_ROLES,
  CASH_REPORT_ROLES,
  SERVICE_REQUEST_REPORT_ROLES,
  REPORT_SYSTEM_ROLES,
} from '../config/roles';

const Index = () => {
  const { user, ackUnsuspendNotice } = useAuth();
  const [desktopSidebar, setDesktopSidebar] = useState<'expanded' | 'collapsed'>(() => {
    if (typeof window === 'undefined') return 'expanded';
    return localStorage.getItem('sidebar-desktop') === 'collapsed' ? 'collapsed' : 'expanded';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [chatMainNavHidden, setChatMainNavHidden] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => readStoredTheme());
  const navigate = useNavigate();
  const location = useLocation();
  const isChatRoute = location.pathname === '/chat';
  const isMobileViewport = useIsMobile();

  useEffect(() => {
    if (!isMobileViewport) {
      document.body.classList.remove('native-app-shell');
      return;
    }
    document.body.classList.add('native-app-shell');
    return () => document.body.classList.remove('native-app-shell');
  }, [isMobileViewport]);

  // Root path → My Workspace for all signed-in users
  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    if (location.pathname === '/' || location.pathname === '') {
      navigate(POST_LOGIN_PATH, { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(min-width: 1024px)').matches) {
      setMobileSidebarOpen(false);
    }
  }, [location.pathname]);

  // Restore main navigation when leaving chat
  useEffect(() => {
    if (!isChatRoute) setChatMainNavHidden(false);
  }, [isChatRoute]);

  const toggleSidebar = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setMobileSidebarOpen((open) => !open);
      return;
    }
    setDesktopSidebar((prev) => {
      const next = prev === 'expanded' ? 'collapsed' : 'expanded';
      localStorage.setItem('sidebar-desktop', next);
      return next;
    });
  };

  const expandDesktopSidebar = () => {
    setDesktopSidebar('expanded');
    localStorage.setItem('sidebar-desktop', 'expanded');
  };

  const isSidebarWide = !isChatRoute && (desktopSidebar === 'expanded' || mobileSidebarOpen);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return next;
    });
  };

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  if (String(user?.status || '').toLowerCase() === 'suspended') {
    return <AccountSuspended />;
  }

  return (
    <RealtimeProvider>
      <VobiProvider>
      <div
        className="app-shell min-h-screen bg-[var(--page-bg)] text-[var(--text-body)]"
      >
        <PWAUpdateToast />
        <div
          className={`app-shell flex h-[100dvh] min-h-0 min-w-0 max-w-full overflow-x-hidden ${
            isChatRoute ? 'max-h-[100dvh] overflow-hidden' : ''
          }`}
        >
        {/* Sidebar */}
        <Sidebar
          desktopMode={desktopSidebar}
          mobileOpen={mobileSidebarOpen}
          forceHidden={isChatRoute && (chatMainNavHidden || isMobileViewport)}
          onToggle={toggleSidebar}
          onRequestExpand={expandDesktopSidebar}
          onMobileClose={() => setMobileSidebarOpen(false)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {/* Main Content */}
        <div className="app-shell flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden">
          <div
            className={`shrink-0 transition-[max-height,opacity] duration-300 ease-in-out ${
              isChatRoute
                ? 'max-h-0 overflow-hidden opacity-0 pointer-events-none'
                : 'max-h-[140px] overflow-visible opacity-100'
            }`}
            aria-hidden={isChatRoute}
          >
            <StaffHeader
              sidebarOpen={isSidebarWide}
              onToggleSidebar={toggleSidebar}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
          </div>
          {!isChatRoute && (
            <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 md:hidden">
              <PushNotificationSetup />
            </div>
          )}
          <main
            className={
              isChatRoute
                ? 'flex min-h-0 flex-1 flex-col overflow-hidden p-0'
                : 'staff-main-scroll page-enter flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:pt-3 md:px-8 md:pb-8 md:pt-6'
            }
          >
            {!isChatRoute && user?.unsuspend_reason && user?.unsuspend_ack === false && (
              <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--accent-green-light)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--success-text)]">Your account has been restored</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-primary)]">{user.unsuspend_reason}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => ackUnsuspendNotice().catch(() => {})}>
                    Got it
                  </Button>
                </div>
              </div>
            )}
            <Routes>
              {/* MY WORKSPACE — ALL STAFF ROLES */}
              <Route
                path="/workspace"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <MyWorkspace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chat"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <Chat
                      mainNavHidden={chatMainNavHidden}
                      onToggleMainNav={() => setChatMainNavHidden((v) => !v)}
                    />
                  </ProtectedRoute>
                }
              />

              {/* PROFILE — ALL ROLES */}
              <Route
                path="/profile"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />

              {/* SYSTEM GUIDE */}
              <Route
                path="/system-guide"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <SystemGuide />
                  </ProtectedRoute>
                }
              />

              {/* CASH ADVANCE MODULE */}
              <Route
                path="/cash-request"
                element={
                  <ProtectedRoute allowedRoles={CASH_REQUEST_ROLES}>
                    <CashRequestForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/finance-approvals"
                element={
                  <ProtectedRoute allowedRoles={FINANCE_ROLES} allowedUnits={['finance']}>
                    <FinanceApprovals />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cash-details/:id"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <CashDetails />
                  </ProtectedRoute>
                }
              />

              {/* REQUEST FORMS & RETURNS */}
              <Route
                path="/request-forms"
                element={
                  <ProtectedRoute allowedRoles={REQUESTER_ROLES}>
                    <RequestForms />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/request-forms/:id"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <RequestDetails />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/item-returns"
                element={
                  <ProtectedRoute allowedRoles={REQUESTER_ROLES}>
                    <ItemReturns />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/item-returns/:id"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <RequestDetails />
                  </ProtectedRoute>
                }
              />

              {/* APPROVALS */}
              <Route
                path="/material-approvals"
                element={
                  <ProtectedRoute allowedRoles={APPROVER_ROLES} allowedPositions={['Director', 'NOC Manager', 'IP Manager', 'TX Manager', 'Project Manager', 'Account Manager', 'NOC Supervisor', 'IP Supervisor', 'TX Supervisor', 'Project Supervisor']}>
                    <MaterialApprovals />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cash-approvals"
                element={
                  <ProtectedRoute allowedRoles={APPROVER_ROLES} allowedPositions={['Director', 'NOC Manager', 'IP Manager', 'TX Manager', 'Project Manager', 'Account Manager', 'NOC Supervisor', 'IP Supervisor', 'TX Supervisor', 'Project Supervisor']}>
                    <CashApprovals />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pending-approvals"
                element={
                  <ProtectedRoute allowedRoles={APPROVER_ROLES} allowedPositions={['Director', 'NOC Manager', 'IP Manager', 'TX Manager', 'Project Manager', 'Account Manager', 'NOC Supervisor', 'IP Supervisor', 'TX Supervisor', 'Project Supervisor']}>
                    <Navigate to="/material-approvals" replace />
                  </ProtectedRoute>
                }
              />

              {/* PRODUCTION / PROJECT REQUEST WORKFLOW */}
              <Route
                path="/project-request/admin/units"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
                    <ProductionUnitsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/project-request/create"
                element={
                  <ProtectedRoute allowedRoles={PRODUCTION_ACCESS_ROLES} allowedUnits={['project', 'tx', 'ts', 'ip', 'noc']}>
                    <ProductionCreate />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/project-request/:unitSlug/:id"
                element={
                  <ProtectedRoute allowedRoles={PRODUCTION_ACCESS_ROLES} allowedUnits={['project', 'tx', 'ts', 'ip', 'noc']}>
                    <ProductionDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/project-request/project"
                element={
                  <ProtectedRoute allowedRoles={PRODUCTION_ACCESS_ROLES} allowedUnits={['project', 'tx', 'ts', 'ip', 'noc']}>
                    <ProjectUnitHub />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/project-request/:unitSlug"
                element={
                  <ProtectedRoute allowedRoles={PRODUCTION_ACCESS_ROLES} allowedUnits={['project', 'tx', 'ts', 'ip', 'noc']}>
                    <ProductionHub />
                  </ProtectedRoute>
                }
              />

              {/* ITEMS OUT & LOW STOCK */}
              <Route
                path="/items-out"
                element={
                  <ProtectedRoute allowedRoles={ITEMS_OUT_ROLES} allowedUnits={['procurement']}>
                    <ItemsOut />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/low-stock"
                element={
                  <ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, ...APPROVER_ROLES]} allowedUnits={['procurement']}>
                    <LowStockAlerts />
                  </ProtectedRoute>
                }
              />

              {/* MAIN DASHBOARD & INVENTORY */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute allowedRoles={MAIN_DASHBOARD_ROLES} allowedUnits={['procurement']}>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/director/dashboard"
                element={
                  <ProtectedRoute allowedRoles={DIRECTOR_DASHBOARD_ROLES}>
                    <DirectorsDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/director/search"
                element={
                  <ProtectedRoute allowedRoles={EXEC_ROLES}>
                    <GlobalSearchPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory"
                element={
                  <ProtectedRoute allowedRoles={INVENTORY_ADMIN_ROLES} allowedUnits={['procurement']}>
                    <Inventory />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/categories"
                element={
                  <ProtectedRoute allowedRoles={INVENTORY_ADMIN_ROLES} allowedUnits={['procurement']}>
                    <Categories />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/approved-forms"
                element={
                  <ProtectedRoute allowedRoles={APPROVED_FORMS_ROLES} allowedUnits={['procurement']}>
                    <ApprovedForms />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/approved-forms/:id"
                element={
                  <ProtectedRoute allowedRoles={APPROVED_FORMS_ROLES} allowedUnits={['procurement']}>
                    <RequestDetails />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute allowedRoles={['superadmin', 'director', 'cto']} allowedUnits={['procurement']}>
                    <Reports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/ai-assistant"
                element={
                  <ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['procurement', 'operations']}>
                    <AIAssistant />
                  </ProtectedRoute>
                }
              />

              {/* ASSETS MANAGER */}
              <Route path="/assets" element={<ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['operations', 'procurement']}><AssetsListPage /></ProtectedRoute>} />
              <Route path="/assets/new" element={<ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['operations', 'procurement']}><NewAssetPage /></ProtectedRoute>} />
              <Route path="/assets/:id" element={<ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['operations', 'procurement']}><AssetDetailPage /></ProtectedRoute>} />
              <Route path="/assets/vendors" element={<ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['operations', 'procurement']}><VendorsList /></ProtectedRoute>} />
              <Route path="/assets/vendors/new" element={<ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['operations', 'procurement']}><NewVendorPage /></ProtectedRoute>} />
              <Route path="/assets/vendors/:id" element={<ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['operations', 'procurement']}><VendorDetail /></ProtectedRoute>} />
              <Route path="/assets/assignments" element={<ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['operations', 'procurement']}><PeopleList /></ProtectedRoute>} />
              <Route path="/assets/assignments/new" element={<ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['operations', 'procurement']}><NewPersonPage /></ProtectedRoute>} />
              <Route path="/assets/assignments/:id" element={<ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['operations', 'procurement']}><PersonDetail /></ProtectedRoute>} />
              <Route path="/assets/categories" element={<ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['operations', 'procurement']}><CategoriesLocationsPage /></ProtectedRoute>} />
              <Route path="/assets/locations" element={<ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['operations', 'procurement']}><CategoriesLocationsPage /></ProtectedRoute>} />
              <Route path="/assets/maintenance" element={<ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['operations', 'procurement']}><MaintenanceList /></ProtectedRoute>} />
              <Route path="/assets/maintenance/new" element={<ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['operations', 'procurement']}><NewMaintenancePage /></ProtectedRoute>} />
              <Route path="/assets/maintenance/:id" element={<ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['operations', 'procurement']}><MaintenanceDetailPage /></ProtectedRoute>} />
              <Route path="/assets/reports" element={<ProtectedRoute allowedRoles={[...INVENTORY_ADMIN_ROLES, 'admin']} allowedUnits={['operations', 'procurement']}><AssetReportsPage /></ProtectedRoute>} />

              {/* FIELD ACTIVITIES */}
              <Route
                path="/field/dashboard"
                element={
                  <ProtectedRoute allowedRoles={FIELD_ACTIVITY_ROLES} allowedUnits={['operations', 'tx', 'ts']} allowedPositions={['TX Manager', 'TX Supervisor', 'TS Manager', 'TS Supervisor', 'Engineer']}>
                    <FieldDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/field/map"
                element={
                  <ProtectedRoute allowedRoles={FIELD_ACTIVITY_ROLES} allowedUnits={['operations', 'tx', 'ts']} allowedPositions={['TX Manager', 'TX Supervisor', 'TS Manager', 'TS Supervisor', 'Engineer']}>
                    <FieldMapPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/field/activities"
                element={
                  <ProtectedRoute allowedRoles={FIELD_ACTIVITY_ROLES} allowedUnits={['operations', 'tx', 'ts']} allowedPositions={['TX Manager', 'TX Supervisor', 'TS Manager', 'TS Supervisor', 'Engineer']}>
                    <FieldActivitiesTable />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/field/add"
                element={
                  <ProtectedRoute allowedRoles={FIELD_ACTIVITY_ROLES} allowedUnits={['operations', 'tx', 'ts']} allowedPositions={['TX Manager', 'TX Supervisor', 'TS Manager', 'TS Supervisor', 'Engineer']}>
                    <AddFieldActivity />
                  </ProtectedRoute>
                }
              />

              {/* SYSTEM TOOLS */}
              <Route path="/audit-logs" element={<ProtectedRoute allowedRoles={['admin', ...EXEC_ROLES]}><AuditLogs /></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><UsersPage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute allowedRoles={['admin', ...EXEC_ROLES]}><SettingsPage /></ProtectedRoute>} />
              <Route path="/system-messages" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><SystemMessages /></ProtectedRoute>} />
              <Route path="/configuration" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><ConfigurationPage /></ProtectedRoute>} />

              {/* SUPPORT TICKETING — SHARED ACCESS FOR ALL SUPPORT ROLES */}
              {/* Includes: cx, noc, ip, field_engineer, field_engineer_admin, approver, director, superadmin */}
              <Route
                path="/staff/cx/dashboard"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx']} allowedPositions={CX_POSITIONS}>
                    <CXDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/noc/dashboard"
                element={
                  <ProtectedRoute allowedRoles={NOC_DASHBOARD_ROLES} allowedUnits={['noc']}>
                    <NOCDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/noc/tickets"
                element={
                  <ProtectedRoute allowedRoles={TICKET_SUPPORT_ROLES} allowedUnits={['noc']}>
                    <NOCAllTickets />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/noc-manager/escalations"
                element={
                  <ProtectedRoute allowedRoles={['noc_manager', ...EXEC_ROLES]}>
                    <NocManagerEscalations />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/noc-manager/tickets/:id"
                element={
                  <ProtectedRoute allowedRoles={TICKET_SUPPORT_ROLES} allowedUnits={['noc']}>
                    <TicketDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/ro/escalations"
                element={
                  <ProtectedRoute allowedRoles={['relationship_officer', ...EXEC_ROLES]}>
                    <ROEscalations />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/ro/tickets/:id"
                element={
                  <ProtectedRoute allowedRoles={TICKET_SUPPORT_ROLES} allowedUnits={['cx']}>
                    <TicketDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/director/escalations"
                element={
                  <ProtectedRoute allowedRoles={EXEC_ROLES}>
                    <DirectorEscalations />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/director/tickets/:id"
                element={
                  <ProtectedRoute allowedRoles={TICKET_SUPPORT_ROLES} allowedUnits={['cx']}>
                    <TicketDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/reports"
                element={
                  <ProtectedRoute
                    allowedRoles={REPORT_SYSTEM_ROLES}
                    allowedPositions={['Director', 'NOC Manager', 'IP Manager', 'TX Manager', 'Project Manager', 'Account Manager', 'NOC Supervisor', 'IP Supervisor', 'TX Supervisor', 'Project Supervisor']}
                  >
                    <ReportsHub />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/reports/tickets"
                element={
                  <ProtectedRoute
                    allowedRoles={TICKET_REPORT_ROLES}
                    allowedPositions={['Director', 'NOC Manager', 'IP Manager', 'TX Manager', 'Account Manager', 'NOC Supervisor', 'IP Supervisor', 'TX Supervisor']}
                  >
                    <TicketReport />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/reports/cash"
                element={
                  <ProtectedRoute
                    allowedRoles={CASH_REPORT_ROLES}
                    allowedPositions={['Director']}
                  >
                    <CashReport />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/reports/service-requests"
                element={
                  <ProtectedRoute
                    allowedRoles={SERVICE_REQUEST_REPORT_ROLES}
                    allowedPositions={['Director', 'Project Manager', 'TX Manager', 'IP Manager', 'NOC Manager', 'Project Supervisor', 'TX Supervisor', 'IP Supervisor', 'NOC Supervisor']}
                  >
                    <ServiceRequestReport />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/cx/projects"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx']} allowedPositions={CX_POSITIONS}>
                    <CXProjects />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/cx/customers"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx']} allowedPositions={CX_POSITIONS}>
                    <CXCustomers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/cx/tickets"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx']} allowedPositions={CX_POSITIONS}>
                    <AllTickets />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/cx/tickets/:id"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx']} allowedPositions={CX_POSITIONS}>
                    <TicketDetailPage />
                  </ProtectedRoute>
                }
              />
              {/* NOC, IP, Field can also access ticket details via same route */}
              <Route
                path="/staff/noc/tickets/:id"
                element={
                  <ProtectedRoute allowedRoles={NOC_DASHBOARD_ROLES} allowedUnits={['noc']}>
                    <TicketDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/ip/tickets/:id"
                element={
                  <ProtectedRoute allowedRoles={IP_TICKET_ROLES} allowedUnits={['ip']}>
                    <TicketDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/field/tickets/:id"
                element={
                  <ProtectedRoute allowedRoles={FIELD_TICKET_ROLES} allowedUnits={['tx', 'ts']}>
                    <TicketDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/cx/create-ticket"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx', 'noc', 'ip', 'tx', 'ts']} allowedPositions={CX_POSITIONS}>
                    <CreateStaffTicket />
                  </ProtectedRoute>
                }
              />

              {/* ESCALATION ROUTES */}
              <Route
                path="/staff/cx/escalate"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx', 'noc', 'ip', 'tx', 'ts']} allowedPositions={CX_POSITIONS}>
                    <EscalateTicket />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/cx/escalate/:ticketId"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx', 'noc', 'ip', 'tx', 'ts']} allowedPositions={CX_POSITIONS}>
                    <EscalateTicket />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/staff/cx/assign"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx']} allowedPositions={CX_POSITIONS}>
                    <AssignUser />
                  </ProtectedRoute>
                }
              />

              {/* USER WORK HISTORY */}
              <Route
                path="/staff/cx/user-work-history"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx']} allowedPositions={CX_POSITIONS}>
                    <UserWorkHistory />
                  </ProtectedRoute>
                }
              />

              {/* TICKET SEARCH */}
              <Route
                path="/staff/cx/ticket-search"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx']} allowedPositions={CX_POSITIONS}>
                    <TicketSearch />
                  </ProtectedRoute>
                }
              />

              {/* IP TICKETING QUEUE */}
              <Route
                path="/staff/ip/tickets"
                element={
                  <ProtectedRoute allowedRoles={IP_TICKET_ROLES} allowedUnits={['ip']}>
                    <IPAllTickets />
                  </ProtectedRoute>
                }
              />

              {/* TX TICKETING QUEUE */}
              <Route
                path="/staff/field/tickets"
                element={
                  <ProtectedRoute allowedRoles={FIELD_TICKET_ROLES} allowedUnits={['tx', 'ts']}>
                    <FieldAllTickets />
                  </ProtectedRoute>
                }
              />

              {/* CUSTOMER PORTAL */}
              <Route
                path="/customer/dashboard"
                element={
                  <ProtectedRoute allowedRoles={CUSTOMER_PORTAL_STAFF_ROLES}>
                    <CustomerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/customer/create-ticket"
                element={
                  <ProtectedRoute allowedRoles={CUSTOMER_PORTAL_STAFF_ROLES}>
                    <CreateTicket />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/customer/tickets/:id"
                element={
                  <ProtectedRoute allowedRoles={CUSTOMER_PORTAL_STAFF_ROLES}>
                    <TicketDetail />
                  </ProtectedRoute>
                }
              />

              {/* HR MODULE */}
              <Route
                path="/hr/dashboard"
                element={
                  <ProtectedRoute allowedRoles={HR_ROLES} allowedUnits={HR_UNITS} allowedPositions={HR_POSITIONS}>
                    <HrDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/employees/:id"
                element={
                  <ProtectedRoute allowedRoles={HR_ROLES} allowedUnits={HR_UNITS} allowedPositions={HR_POSITIONS}>
                    <HrEmployeeProfile />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/employees"
                element={
                  <ProtectedRoute allowedRoles={HR_ROLES} allowedUnits={HR_UNITS} allowedPositions={HR_POSITIONS}>
                    <HrEmployees />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/leave"
                element={
                  <ProtectedRoute allowedRoles={HR_ROLES} allowedUnits={HR_UNITS} allowedPositions={HR_POSITIONS}>
                    <HrLeave />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/payroll"
                element={
                  <ProtectedRoute allowedRoles={HR_ROLES} allowedUnits={HR_UNITS} allowedPositions={HR_POSITIONS}>
                    <HrPayroll />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/attendance"
                element={
                  <ProtectedRoute allowedRoles={HR_ROLES} allowedUnits={HR_UNITS} allowedPositions={HR_POSITIONS}>
                    <HrAttendance />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/analytics"
                element={
                  <ProtectedRoute allowedRoles={HR_ROLES} allowedUnits={HR_UNITS} allowedPositions={HR_POSITIONS}>
                    <HrAnalytics />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/reports"
                element={
                  <ProtectedRoute allowedRoles={HR_ROLES} allowedUnits={HR_UNITS} allowedPositions={HR_POSITIONS}>
                    <HrReports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/documents"
                element={
                  <ProtectedRoute allowedRoles={HR_ROLES} allowedUnits={HR_UNITS} allowedPositions={HR_POSITIONS}>
                    <HrDocuments />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/forms"
                element={
                  <ProtectedRoute allowedRoles={HR_ROLES} allowedUnits={HR_UNITS} allowedPositions={HR_POSITIONS}>
                    <HrFormRequests />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr-self/attendance"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <HrSelfAttendance />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr-self/leave"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <HrSelfLeave />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr-self/forms"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <HrSelfForms />
                  </ProtectedRoute>
                }
              />

              {/* ROOT & FALLBACK REDIRECTS */}
              <Route path="/" element={<Navigate to={POST_LOGIN_PATH} replace />} />
              <Route path="*" element={<Navigate to={POST_LOGIN_PATH} replace />} />
            </Routes>
          </main>
        </div>
      </div>
      </div>
      <VobiRoot theme={theme} />
      </VobiProvider>
    </RealtimeProvider>
  );
};

export default Index;