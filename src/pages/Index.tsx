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
import ManageClientsPage from './admin/ManageClients';
import VobiChatVaultPage from './admin/VobiChatVault';
import ConfigurationPage from './ConfigurationPage';
import RealmPage from './RealmPage';
import SystemGuide from './SystemGuide';
import ProfilePage from './ProfilePage';
import MyActivityPage from './MyActivityPage';
import MySharedLinksPage from './MySharedLinksPage';
import NetworkAssets from './NetworkAssets';
import MyWorkspace from './MyWorkspace';
import Chat from './Chat';
import { RealtimeProvider } from '../context/RealtimeContext';
import { VobiProvider } from '../context/VobiContext';
import { VobiRoot } from '../components/vobi';
import { PushNotificationSetup } from '../components/PushNotificationSetup';
import StaffHeader from '../components/StaffHeader';
import DetailBreadcrumbs from '../components/DetailBreadcrumbs';
import { MobileBottomNav } from '../components/MobileBottomNav';
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
import ClientsPage from './staff/cx/Clients';
import ClientDetailPage from './staff/cx/ClientDetail';
import SitesPage from './staff/cx/Sites';
import AllTickets from './staff/cx/Tickets';                  // Master Ticket Queue
import CreateStaffTicket from './staff/cx/CreateStaffTicket';
import AssignUser from './staff/cx/AssignUser';
import EscalateTicket from './staff/cx/EscalateTicket';           // Escalation page
import UserWorkHistory from './staff/cx/UserWorkHistory';        // User Work History
import TicketSearch from './staff/cx/TicketSearch';              // Ticket Search
import TagManager from './staff/cx/TagManager';
import TicketDetailPage from './staff/cx/TicketDetailPage';       // Full-page Ticket Details
import TodaysTickets from './staff/TodaysTickets';
import ReportsHub from './staff/reports/ReportsHub';
import TicketReport from './staff/reports/TicketReport';
import CashReport from './staff/reports/CashReport';
import ServiceRequestReport from './staff/reports/ServiceRequestReport';

// NOC DASHBOARD
import NOCDashboard from './staff/noc/Dashboard';
import NOCAllTickets from './staff/noc/NOCAllTickets';
import IncidentNotes from './staff/noc/IncidentNotes';
import ShiftSchedule from './staff/noc/ShiftSchedule';
import WorkflowPerformance from './admin/WorkflowPerformance';
import WorkflowTimeConfig from './admin/WorkflowTimeConfig';
import MyAssessment from './MyAssessment';
import FieldWorkList from './staff/field/FieldWorkList';
import MyFieldWork from './staff/field/MyFieldWork';
import FieldWorkDetailPage from './staff/field/FieldWorkDetailPage';
import Archive from './Archive';
import ArchiveFilePreviewPage from './archive/ArchiveFilePreviewPage';
import IpUnitDashboard from './ipUnit/Dashboard';
import CircuitInventory from './ipUnit/CircuitInventory';
import AddCircuit from './ipUnit/AddCircuit';
import CircuitProfile from './ipUnit/CircuitProfile';
import CircuitRequests from './ipUnit/CircuitRequests';
import CircuitRequestDetail from './ipUnit/CircuitRequestDetail';
import IpUnitReports from './ipUnit/Reports';
import IPDashboard from './staff/ip/Dashboard';
import IPAllTickets from './staff/ip/IPAllTickets';
import FieldTicketDashboard from './staff/field/TicketDashboard';
import {
  NocManagerEscalations,
  ROEscalations,
  DirectorEscalations,
} from './staff/escalation/EscalationPages';

// FIELD ENGINEERS QUEUE
import FieldAllTickets from './field/FieldAllTickets';

// CUSTOMER PORTAL
import CustomerDashboard from './customer/Dashboard';
import CreateTicket from './customer/CreateTicket';
import TicketDetail from './customer/TicketDetail';

import ProductionHub from './production/ProductionHub';
import ProjectUnitHub from './production/ProjectUnitHub';
import WipPage from './production/WipPage';
import PerformanceDashboard from './performance/Dashboard';
import PerformanceMyReports from './performance/MyReports';
import PerformanceReportDetail from './performance/ReportDetail';
import { TeamReportsPage, UnitReviewsPage, ExecutiveReviewPage, HrAccessPage } from './performance/ReviewQueue';
import PerformanceAssessmentPeriods from './performance/AssessmentPeriods';
import PerformanceAnalytics from './performance/Analytics';
import SignoffFormPage, { SignoffFormsList } from './production/SignoffForms';
import ProductionDetail from './production/ProductionDetail';
import ProjectRequestSingleSegmentRoute from './production/ProjectRequestSingleSegmentRoute';
import ProjectRequestLegacyRedirect from './production/ProjectRequestLegacyRedirect';
import ProductionUnitsPage from './production/ProductionUnitsPage';
import DesignUnitPage from './production/DesignUnitPage';
import DesignConfigurationPage from './production/DesignConfigurationPage';
import SalesUnitPage from './production/SalesUnitPage';
import PtelSalesDashboard from './ptel/SalesDashboard';
import PtelComingSoon from './ptel/ComingSoon';
import HrDashboard from './hr/Dashboard';
import HrEmployees from './hr/Employees';
import HrEmployeeProfile from './hr/EmployeeProfile';
import HrLeave from './hr/Leave';
import HrPayroll from './hr/Payroll';
import HrPayrollAdvances from './hr/PayrollAdvances';
import HrPayrollHistory from './hr/PayrollHistory';
import HrPayrollAudit from './hr/PayrollAudit';
import HrAttendance from './hr/Attendance';
import HrFieldArrivals from './hr/FieldArrivals';
import HrAnalytics from './hr/Analytics';
import HrReports from './hr/Reports';
import HrDocuments from './hr/Documents';
import HrFormRequests from './hr/FormRequests';
import HrSelfAttendance from './hr-self/Attendance';
import HrSelfLeave from './hr-self/Leave';
import HrSelfForms from './hr-self/Forms';
import HrSelfPayslips from './hr-self/Payslips';
import TransportRequestForm from './transport/TransportRequestForm';
import TransportSupervisorDashboard from './transport/TransportSupervisorDashboard';
import TransportApprovals from './transport/TransportApprovals';
import TransportDetail from './transport/TransportDetail';
import VehicleRequestPage from './transport/VehicleRequestPage';
import VehicleRentalRequestsListPage from './transport/VehicleRentalRequestsListPage';
import NewRentalVehicleRequestPage from './transport/NewRentalVehicleRequestPage';
import VehicleRentalRequestDetailPage from './transport/VehicleRentalRequestDetailPage';
import RentalApprovalsPage from './transport/RentalApprovalsPage';
import VehicleFinanceQueuePage from './transport/VehicleFinanceQueuePage';
import FuelRequestsListPage from './transport/FuelRequestsListPage';
import FuelRequestFormPage from './transport/FuelRequestFormPage';
import FuelRequestDetailPage from './transport/FuelRequestDetailPage';
import FuelApprovalsPage from './transport/FuelApprovalsPage';
import FinanceFuelRequestsPage from './finance/FinanceFuelRequestsPage';
import FinanceDashboardPage from './finance/FinanceDashboardPage';
import ApprovalHistoryPage from './finance/ApprovalHistoryPage';
import {
  WORKSPACE_ROLES,
  TICKET_SUPPORT_ROLES,
  CX_MODULE_ROLES,
  NOC_DASHBOARD_ROLES,
  IP_TICKET_ROLES,
  FIELD_TICKET_ROLES,
  FIELD_WORK_SUPERVISOR_ROLES,
  IP_UNIT_ROLES,
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

/** Mirrors backend/routes/timeEngine.js's TIME_ENGINE_MANAGER_ROLES — system admins always pass via ProtectedRoute's isAdminSuper bypass. */
const WORKFLOW_TIME_ENGINE_ROLES = ['noc_manager', 'ts_manager', 'ip_manager', 'finance_manager', 'noc_supervisor', 'ts_supervisor', 'ip_supervisor', 'approver', 'director', 'cto'];

// Performance & Report Assessment System — Team Reports/Unit Reviews share one queue page
// (backend/db/performanceReports.js's listQueueForUser already scopes by the viewer's own
// tier+unit), so both roles just need to reach the same route.
const PERFORMANCE_REVIEWER_ROLES = ['noc_supervisor', 'ts_supervisor', 'ip_supervisor', 'noc_manager', 'ts_manager', 'ip_manager', 'director', 'cto'];
const PERFORMANCE_EXEC_ROLES = ['director', 'cto'];

const Index = () => {
  const { user, ackUnsuspendNotice } = useAuth();
  const [desktopSidebar, setDesktopSidebar] = useState<'expanded' | 'collapsed'>(() => {
    if (typeof window === 'undefined') return 'expanded';
    const tablet = window.matchMedia('(min-width: 768px) and (max-width: 1024px)').matches;
    if (tablet) {
      return localStorage.getItem('sidebar-tablet') === 'expanded' ? 'expanded' : 'collapsed';
    }
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
    if (!window.matchMedia('(min-width: 1025px)').matches) {
      setMobileSidebarOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('mobile-sidebar-open', mobileSidebarOpen);
    return () => document.body.classList.remove('mobile-sidebar-open');
  }, [mobileSidebarOpen]);

  // Restore main navigation when leaving chat
  useEffect(() => {
    if (!isChatRoute) setChatMainNavHidden(false);
  }, [isChatRoute]);

  const toggleSidebar = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      setMobileSidebarOpen((open) => !open);
      return;
    }
    setDesktopSidebar((prev) => {
      const next = prev === 'expanded' ? 'collapsed' : 'expanded';
      const tablet = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px) and (max-width: 1024px)').matches;
      localStorage.setItem(tablet ? 'sidebar-tablet' : 'sidebar-desktop', next);
      return next;
    });
  };

  const expandDesktopSidebar = () => {
    setDesktopSidebar('expanded');
    localStorage.setItem('sidebar-desktop', 'expanded');
  };

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
        className="app-shell min-h-dvh bg-[var(--page-bg)] text-[var(--text-body)]"
      >
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
              sidebarOpen={isMobileViewport ? mobileSidebarOpen : desktopSidebar === 'expanded'}
              onToggleSidebar={toggleSidebar}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
          </div>
          {!isChatRoute && (
            <div className="staff-push-strip shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 md:hidden">
              <PushNotificationSetup />
            </div>
          )}
          <main
            className={
              isChatRoute
                ? 'flex min-h-0 flex-1 flex-col overflow-hidden p-0'
                : 'staff-main-scroll page-enter flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-3 md:px-8 md:pb-8 md:pt-6'
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
            {!isChatRoute && <DetailBreadcrumbs />}
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
              <Route
                path="/my-activity"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <MyActivityPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my-shared-links"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <MySharedLinksPage />
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

              {/* TRANSPORT REQUESTS */}
              <Route
                path="/transport-request"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <TransportRequestForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/transport-supervisor-dashboard"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <TransportSupervisorDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/transport-approvals"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <TransportApprovals />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/transport-requests/:id"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <TransportDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/transport/rental-vehicle-requests"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <VehicleRentalRequestsListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/transport/vehicle-rental-requests"
                element={<Navigate to="/transport/rental-vehicle-requests" replace />}
              />
              <Route
                path="/transport/vehicle-rental-requests/:id"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <VehicleRentalRequestDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/transport/rental-approvals"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <RentalApprovalsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/transport/new-rental-vehicle-request"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <NewRentalVehicleRequestPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/transport/vehicle-request/:transportRequestId"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <VehicleRequestPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/transport/finance-queue"
                element={
                  <ProtectedRoute allowedRoles={FINANCE_ROLES} allowedUnits={['finance']}>
                    <VehicleFinanceQueuePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/transport/fuel-requests"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <FuelRequestsListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/transport/fuel-requests/new"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <FuelRequestFormPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/transport/fuel-requests/:id"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <FuelRequestDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/transport/fuel-approvals"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <FuelApprovalsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/finance/dashboard"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <FinanceDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/finance/fuel-requests"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <FinanceFuelRequestsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/finance/fuel-requests/:id"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <FuelRequestDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/approval-history"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <ApprovalHistoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/finance/approval-history"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <ApprovalHistoryPage />
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
                path="/network-assets/*"
                element={<ProtectedRoute><NetworkAssets /></ProtectedRoute>}
              />
              <Route
                path="/material-approvals"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <MaterialApprovals />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cash-approvals"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <CashApprovals />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pending-approvals"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
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
                path="/project-request/design"
                element={
                  <ProtectedRoute allowedRoles={['design_manager', 'design_supervisor']} allowedUnits={['design']}>
                    <DesignUnitPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/project-request/sales"
                element={
                  <ProtectedRoute allowedRoles={['sales']} allowedUnits={['sales']}>
                    <SalesUnitPage />
                  </ProtectedRoute>
                }
              />
              {/* PTEL */}
              <Route
                path="/ptel/sales/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['ptel_sales', 'ptel_executive', 'ptel_cx_manager']}>
                    <PtelSalesDashboard />
                  </ProtectedRoute>
                }
              />
              {['/ptel/hr', '/ptel/finance', '/ptel/transport', '/ptel/inventory', '/ptel/assets', '/ptel/audit-logs'].map((path) => (
                <Route
                  key={path}
                  path={path}
                  element={
                    <ProtectedRoute
                      allowedRoles={['ptel_sales', 'ptel_cx_manager', 'ptel_finance', 'ptel_hr_admin', 'ptel_data', 'ptel_service_delivery', 'ptel_executive']}
                    >
                      <PtelComingSoon />
                    </ProtectedRoute>
                  }
                />
              ))}
              <Route
                path="/settings/design-configuration"
                element={
                  <ProtectedRoute allowedRoles={['design_manager', 'design_supervisor']} allowedUnits={['design']}>
                    <DesignConfigurationPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/project-request/:unitSlug/:id"
                element={
                  <ProtectedRoute allowedRoles={PRODUCTION_ACCESS_ROLES} allowedUnits={['design', 'project', 'sales', 'tx', 'ts', 'ip', 'noc']}>
                    <ProjectRequestLegacyRedirect />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/project-request/project"
                element={
                  <ProtectedRoute allowedRoles={PRODUCTION_ACCESS_ROLES} allowedUnits={['project', 'sales', 'tx', 'ts', 'ip', 'noc']}>
                    <ProjectUnitHub />
                  </ProtectedRoute>
                }
              />
              <Route path="/project-unit/wip" element={<ProtectedRoute allowedRoles={PRODUCTION_ACCESS_ROLES} allowedUnits={['design', 'project', 'sales', 'tx', 'ts', 'ip', 'noc']} allowedPositions={['Manager', 'Supervisor', 'Director', 'CTO']}><WipPage /></ProtectedRoute>} />
              <Route path="/project-unit/signoff" element={<ProtectedRoute allowedRoles={PRODUCTION_ACCESS_ROLES} allowedUnits={['design', 'project', 'sales', 'tx', 'ts', 'ip', 'noc']} allowedPositions={['Manager', 'Supervisor', 'Director', 'CTO']}><SignoffFormsList /></ProtectedRoute>} />
              <Route path="/project-unit/signoff/:id" element={<ProtectedRoute allowedRoles={PRODUCTION_ACCESS_ROLES} allowedUnits={['design', 'project', 'sales', 'tx', 'ts', 'ip', 'noc']} allowedPositions={['Manager', 'Supervisor', 'Director', 'CTO']}><SignoffFormPage /></ProtectedRoute>} />
              <Route
                path="/project-request/:unitSlug"
                element={
                  <ProtectedRoute allowedRoles={PRODUCTION_ACCESS_ROLES} allowedUnits={['design', 'project', 'sales', 'tx', 'ts', 'ip', 'noc']}>
                    <ProjectRequestSingleSegmentRoute />
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
              <Route path="/admin/clients" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><ManageClientsPage /></ProtectedRoute>} />
              <Route path="/admin/vobi-vault" element={<ProtectedRoute allowedRoles={['superadmin']}><VobiChatVaultPage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute allowedRoles={['admin', ...EXEC_ROLES]}><SettingsPage /></ProtectedRoute>} />
              <Route path="/system-messages" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><SystemMessages /></ProtectedRoute>} />
              <Route path="/configuration" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><ConfigurationPage /></ProtectedRoute>} />
              <Route path="/realm" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><RealmPage /></ProtectedRoute>} />

              {/* SUPPORT TICKETING — SHARED ACCESS FOR ALL SUPPORT ROLES */}
              {/* Includes: cx, noc, ip, field_engineer, field_engineer_admin, approver, director, superadmin */}
              <Route
                path="/staff/cx/dashboard"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx', 'sales']} allowedPositions={CX_POSITIONS}>
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
                path="/noc/incident-notes"
                element={<ProtectedRoute allowedRoles={NOC_DASHBOARD_ROLES} allowedUnits={['noc']}><IncidentNotes /></ProtectedRoute>}
              />
              <Route
                path="/noc/incident-notes/:id"
                element={<ProtectedRoute allowedRoles={NOC_DASHBOARD_ROLES} allowedUnits={['noc']}><IncidentNotes /></ProtectedRoute>}
              />
              <Route
                path="/noc/shift-schedule"
                element={<ProtectedRoute allowedRoles={NOC_DASHBOARD_ROLES} allowedUnits={['noc']}><ShiftSchedule /></ProtectedRoute>}
              />
              <Route
                path="/workflow-performance"
                element={<ProtectedRoute allowedRoles={['director', 'cto']}><WorkflowPerformance /></ProtectedRoute>}
              />
              <Route path="/my-assessment" element={<ProtectedRoute><MyAssessment /></ProtectedRoute>} />
              <Route path="/performance-reports/dashboard" element={<ProtectedRoute><PerformanceDashboard /></ProtectedRoute>} />
              <Route path="/performance-reports/my-reports" element={<ProtectedRoute><PerformanceMyReports /></ProtectedRoute>} />
              <Route path="/performance-reports/report/:id" element={<ProtectedRoute><PerformanceReportDetail /></ProtectedRoute>} />
              <Route path="/performance-reports/queue" element={<ProtectedRoute allowedRoles={PERFORMANCE_REVIEWER_ROLES} allowedPositions={['Manager', 'Supervisor']}><TeamReportsPage /></ProtectedRoute>} />
              <Route path="/performance-reports/team" element={<ProtectedRoute allowedRoles={PERFORMANCE_REVIEWER_ROLES} allowedPositions={['Manager', 'Supervisor']}><TeamReportsPage /></ProtectedRoute>} />
              <Route path="/performance-reports/unit-reviews" element={<ProtectedRoute allowedRoles={PERFORMANCE_REVIEWER_ROLES} allowedPositions={['Manager', 'Supervisor']}><UnitReviewsPage /></ProtectedRoute>} />
              <Route path="/performance-reports/executive" element={<ProtectedRoute allowedRoles={PERFORMANCE_EXEC_ROLES} allowedPositions={['Director', 'CTO']}><ExecutiveReviewPage /></ProtectedRoute>} />
              <Route path="/performance-reports/hr" element={<ProtectedRoute allowedPositions={['HR']} allowedRoles={['hr']}><HrAccessPage /></ProtectedRoute>} />
              <Route path="/performance-reports/periods" element={<ProtectedRoute allowedRoles={PERFORMANCE_EXEC_ROLES}><PerformanceAssessmentPeriods /></ProtectedRoute>} />
              <Route path="/performance-reports/analytics" element={<ProtectedRoute allowedRoles={['hr', 'director', 'cto']} allowedPositions={['HR', 'Director', 'CTO']}><PerformanceAnalytics /></ProtectedRoute>} />
              <Route path="/archive" element={<ProtectedRoute><Archive /></ProtectedRoute>} />
              <Route path="/file-storage/preview/:id" element={<ProtectedRoute><ArchiveFilePreviewPage /></ProtectedRoute>} />
              <Route
                path="/staff-assessment/:userId"
                element={<ProtectedRoute allowedRoles={[...WORKFLOW_TIME_ENGINE_ROLES, 'hr']} allowedPositions={['Manager', 'Supervisor', 'Director', 'CTO', 'HR']}><MyAssessment /></ProtectedRoute>}
              />
              <Route
                path="/settings/workflow-time-config"
                element={<ProtectedRoute allowedRoles={WORKFLOW_TIME_ENGINE_ROLES}><WorkflowTimeConfig /></ProtectedRoute>}
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
                    allowedPositions={['Director', 'Project Manager', 'TX Manager', 'IP Manager', 'NOC Manager', 'Sales Manager', 'Design Manager', 'Project Supervisor', 'TX Supervisor', 'IP Supervisor', 'NOC Supervisor', 'Design Supervisor']}
                  >
                    <ServiceRequestReport />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/cx/projects"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx', 'sales']} allowedPositions={CX_POSITIONS}>
                    <CXProjects />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/cx/sites"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx', 'sales']} allowedPositions={CX_POSITIONS}>
                    <SitesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/cx/customers"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx']} allowedPositions={CX_POSITIONS}>
                    <Navigate to="/staff/cx/clients" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/cx/clients"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx', 'sales']} allowedPositions={CX_POSITIONS}>
                    <ClientsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/cx/clients/:id"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx', 'sales']} allowedPositions={CX_POSITIONS}>
                    <ClientDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/cx/tickets"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx', 'sales']} allowedPositions={CX_POSITIONS}>
                    <AllTickets />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/tickets/today"
                element={<ProtectedRoute><TodaysTickets /></ProtectedRoute>}
              />
              <Route
                path="/staff/cx/tickets/:id"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx', 'sales']} allowedPositions={CX_POSITIONS}>
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
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx', 'noc', 'ip', 'tx', 'ts', 'sales']} allowedPositions={CX_POSITIONS}>
                    <CreateStaffTicket />
                  </ProtectedRoute>
                }
              />

              {/* ESCALATION ROUTES */}
              <Route
                path="/staff/cx/escalate"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx', 'noc', 'ip', 'tx', 'ts', 'sales']} allowedPositions={CX_POSITIONS}>
                    <EscalateTicket />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/cx/escalate/:ticketId"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx', 'noc', 'ip', 'tx', 'ts', 'sales']} allowedPositions={CX_POSITIONS}>
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

              {/* USER WORK HISTORY — System Admin only, hidden from the sidebar for everyone else */}
              <Route
                path="/staff/cx/user-work-history"
                element={
                  <ProtectedRoute adminOnly>
                    <UserWorkHistory />
                  </ProtectedRoute>
                }
              />

              {/* TICKET SEARCH */}
              <Route
                path="/staff/cx/ticket-search"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx', 'sales']} allowedPositions={CX_POSITIONS}>
                    <TicketSearch />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/cx/tags"
                element={
                  <ProtectedRoute allowedRoles={CX_MODULE_ROLES} allowedUnits={['cx', 'sales']} allowedPositions={CX_POSITIONS}>
                    <TagManager />
                  </ProtectedRoute>
                }
              />

              {/* IP TICKETING */}
              <Route
                path="/staff/ip/dashboard"
                element={
                  <ProtectedRoute allowedRoles={IP_TICKET_ROLES} allowedUnits={['ip']}>
                    <IPDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/ip/tickets"
                element={
                  <ProtectedRoute allowedRoles={IP_TICKET_ROLES} allowedUnits={['ip']}>
                    <IPAllTickets />
                  </ProtectedRoute>
                }
              />

              {/* TX / FIELD TICKETING */}
              <Route
                path="/staff/field/dashboard"
                element={
                  <ProtectedRoute allowedRoles={FIELD_TICKET_ROLES} allowedUnits={['tx', 'ts']}>
                    <FieldTicketDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/field/tickets"
                element={
                  <ProtectedRoute allowedRoles={FIELD_TICKET_ROLES} allowedUnits={['tx', 'ts']}>
                    <FieldAllTickets />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/field/field-work"
                element={
                  <ProtectedRoute allowedRoles={FIELD_WORK_SUPERVISOR_ROLES}>
                    <FieldWorkList />
                  </ProtectedRoute>
                }
              />
              <Route path="/staff/field/my-field-work" element={<ProtectedRoute><MyFieldWork /></ProtectedRoute>} />
              <Route path="/staff/field/field-work/:id" element={<ProtectedRoute><FieldWorkDetailPage /></ProtectedRoute>} />

              {/* IP UNIT — circuit inventory, deliberately IP-Unit-only, no general-staff entry point */}
              <Route
                path="/ip-unit/dashboard"
                element={<ProtectedRoute allowedRoles={IP_UNIT_ROLES} allowedUnits={['ip']}><IpUnitDashboard /></ProtectedRoute>}
              />
              <Route
                path="/ip-unit/circuits"
                element={<ProtectedRoute allowedRoles={IP_UNIT_ROLES} allowedUnits={['ip']}><CircuitInventory /></ProtectedRoute>}
              />
              <Route
                path="/ip-unit/circuits/new"
                element={<ProtectedRoute allowedRoles={IP_UNIT_ROLES} allowedUnits={['ip']}><AddCircuit /></ProtectedRoute>}
              />
              <Route
                path="/ip-unit/circuits/:id"
                element={<ProtectedRoute allowedRoles={IP_UNIT_ROLES} allowedUnits={['ip']}><CircuitProfile /></ProtectedRoute>}
              />
              <Route
                path="/ip-unit/requests"
                element={<ProtectedRoute allowedRoles={IP_UNIT_ROLES} allowedUnits={['ip']}><CircuitRequests /></ProtectedRoute>}
              />
              <Route
                path="/ip-unit/requests/:id"
                element={<ProtectedRoute allowedRoles={IP_UNIT_ROLES} allowedUnits={['ip']}><CircuitRequestDetail /></ProtectedRoute>}
              />
              <Route
                path="/ip-unit/reports"
                element={<ProtectedRoute allowedRoles={IP_UNIT_ROLES} allowedUnits={['ip']}><IpUnitReports /></ProtectedRoute>}
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
                path="/hr/payroll/advances"
                element={
                  <ProtectedRoute allowedRoles={HR_ROLES} allowedUnits={HR_UNITS} allowedPositions={HR_POSITIONS}>
                    <HrPayrollAdvances />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/payroll/audit"
                element={
                  <ProtectedRoute allowedRoles={HR_ROLES} allowedUnits={HR_UNITS} allowedPositions={HR_POSITIONS}>
                    <HrPayrollAudit />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/hr/payroll-history"
                element={
                  <ProtectedRoute allowedRoles={HR_ROLES} allowedUnits={HR_UNITS} allowedPositions={HR_POSITIONS}>
                    <HrPayrollHistory />
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
                path="/hr/field-arrivals"
                element={
                  <ProtectedRoute allowedRoles={HR_ROLES} allowedUnits={HR_UNITS} allowedPositions={HR_POSITIONS}>
                    <HrFieldArrivals />
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
                path="/hr-self/payslips"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <HrSelfPayslips />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/employee/payslips"
                element={
                  <ProtectedRoute allowedRoles={WORKSPACE_ROLES}>
                    <HrSelfPayslips />
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
      {!isChatRoute && (
        <MobileBottomNav onMore={() => setMobileSidebarOpen(true)} />
      )}
      <VobiRoot theme={theme} />
      </VobiProvider>
    </RealtimeProvider>
  );
};

export default Index;
