// src/components/Sidebar.tsx â€” FULLY UPDATED & FIXED (January 10, 2026)
import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  BarChart3, BarChart2, Package, Tags, ArrowUpRight, AlertTriangle, FileText, Bot, Settings,
  ClipboardList, Clock, CheckCircle, LogOut, FileText as AuditIcon, Users, ArrowLeftCircle,
  Bell, X, Monitor, Plus, MapPin, UserCheck, Building2, Wrench, Map, Activity, PlusCircle, Home,
  DollarSign, HandCoins, Sliders, MessageCircle, ChevronsRight, ChevronDown, ChevronRight,
  Headphones, Ticket, MessagesSquare, Users2, User, FilePlus, Headset,
  Globe, CircleAlert, AlertCircle, Search, Network, LayoutDashboard,
  Briefcase, CalendarDays, CalendarCheck, CalendarOff, Wallet, ClipboardCheck, FolderOpen, PanelLeftClose, PanelLeft
} from 'lucide-react';
import { getRequests, getLowStockItems, getNotifications, getWorkspace } from '../api';
import { resolvePrimaryRole, normalizeMenuRole, userHasAnyRole, formatRoleLabel, isHrStaff, SYSTEM_ADMIN_LABEL } from '../config/roles';
import { getMyProjectUnits, getProjectRequestDashboard, type ProjectUnit } from '../api/project';
import { getChatUnreadTotal } from '../api/chat';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { hrSelfApi } from '@/api/hrSelf';
import { UserAvatar } from '@/components/UserAvatar';

const serviceRequestSlugsForUnits = (
  values: Array<string | null | undefined>,
  position?: string | null
) => {
  const slugs = new Set<string>();
  values
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .forEach((unit) => {
      if (unit === 'project' || unit === 'project unit' || unit.startsWith('project')) slugs.add('project');
      if (unit === 'tx' || unit === 'ts') slugs.add('ts');
      if (unit === 'ip') slugs.add('ip');
      if (unit === 'noc') slugs.add('noc');
    });
  const pos = String(position || '').trim().toLowerCase();
  if (pos === 'project manager' || pos === 'project supervisor') slugs.add('project');
  return slugs;
};

const Sidebar = ({
  desktopMode,
  mobileOpen,
  forceHidden,
  onToggle,
  onRequestExpand,
  onMobileClose,
  theme,
}: {
  desktopMode: 'expanded' | 'collapsed';
  mobileOpen: boolean;
  forceHidden?: boolean;
  onToggle: () => void;
  onRequestExpand?: () => void;
  onMobileClose?: () => void;
  theme: 'light' | 'dark';
  onToggleTheme?: () => void;
}) => {
  const location = useLocation();
  const {
    user,
    logout,
    refreshUser,
    hrEmployee,
    accessMode,
    setAccessMode,
    canUseSystemMode,
    isSystemMode,
    isAdminSuper,
  } = useAuth();
  const isDark = theme === 'dark';
  void isDark;
  const isCollapsed = desktopMode === 'collapsed';
  const closeMobile = () => {
    if (onMobileClose) onMobileClose();
    else onToggle();
  };

  const hasRefreshedUser = useRef(false);
  const previousAccessMode = useRef(accessMode);
  useEffect(() => {
    if (user?.id && !hasRefreshedUser.current) {
      hasRefreshedUser.current = true;
      refreshUser();
    }
  }, [user?.id, refreshUser]);

  useEffect(() => {
    const switchedToSystemMode = previousAccessMode.current !== 'system' && accessMode === 'system';
    if (switchedToSystemMode && !isAdminSuper && canUseSystemMode) {
      setIsAssetsOpen(false);
      setIsFieldOpen(false);
      setIsCXOpen(false);
      setIsReportsOpen(false);
      setIsSettingsOpen(false);
      setIsInventoryOpen(false);
      setIsNOCOpen(false);
      setIsIPOpen(false);
      setIsFieldEngOpen(false);
      setIsCustomerOpen(false);
      setIsProjectRequestOpen(false);
      setIsHrOpen(false);
    }
    previousAccessMode.current = accessMode;
  }, [accessMode, canUseSystemMode, isAdminSuper]);

  const [pendingCount, setPendingCount] = useState(0);
  const [materialApprovalCount, setMaterialApprovalCount] = useState(0);
  const [cashApprovalCount, setCashApprovalCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [workspaceAttentionCount, setWorkspaceAttentionCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isAssetsOpen, setIsAssetsOpen] = useState(false);
  const [isFieldOpen, setIsFieldOpen] = useState(true);
  const [isCXOpen, setIsCXOpen] = useState(true);
  const [isReportsOpen, setIsReportsOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(true);
  const [isNOCOpen, setIsNOCOpen] = useState(true);
  const [isIPOpen, setIsIPOpen] = useState(true);
  const [isFieldEngOpen, setIsFieldEngOpen] = useState(true);
  const [isCustomerOpen, setIsCustomerOpen] = useState(true);
  const [isProjectRequestOpen, setIsProjectRequestOpen] = useState(true);
  const [isHrOpen, setIsHrOpen] = useState(true);
  const [isMyHrOpen, setIsMyHrOpen] = useState(true);
  const [projectUnits, setProjectUnits] = useState<ProjectUnit[]>([]);
  const [projectUnitCounts, setProjectUnitCounts] = useState<Record<string, number>>({});
  const [canCreateProjectRequest, setCanCreateProjectRequest] = useState(false);
  const hrMeQ = useQuery({
    queryKey: ['hr-self', 'me'],
    queryFn: hrSelfApi.me,
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const linkedHrEmployee = hrMeQ.data !== undefined ? hrMeQ.data : hrEmployee;

  useEffect(() => {
    if (!user?.id) return;
    getMyProjectUnits()
      .then((data) => {
        setProjectUnits(data.units || []);
        setCanCreateProjectRequest(!!data.canCreate);
      })
      .catch(() => {
        setProjectUnits([]);
        setCanCreateProjectRequest(false);
      });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const role = normalizeMenuRole(resolvePrimaryRole(user));
    const position = String(user?.position || '').trim().toLowerCase();
    const hasSystemWideMode = isAdminSuper;
    const isExec = role === 'director' || role === 'cto' || position === 'director' || position === 'cto';
    const isAdmin = hasSystemWideMode || role === 'stock_admin' || isExec;
    const userServiceSlugs = serviceRequestSlugsForUnits(
      [user?.unit, ...(Array.isArray(user?.units) ? user.units : [])],
      user?.position
    );
    const slugs = isAdmin
      ? ['project', 'ts', 'noc', 'ip']
      : ['project', 'ts', 'ip', 'noc'].filter((slug) => userServiceSlugs.has(slug));

    if (slugs.length === 0) {
      setProjectUnitCounts({});
      return;
    }

    const loadProjectCounts = () => {
      Promise.all(
        slugs.map(async (slug) => {
          try {
            const dash = await getProjectRequestDashboard(slug);
            return [slug, Number(dash.pending || 0)] as const;
          } catch {
            return [slug, 0] as const;
          }
        })
      ).then((entries) => setProjectUnitCounts(Object.fromEntries(entries)));
    };

    loadProjectCounts();
    const interval = setInterval(loadProjectCounts, 15000);
    window.addEventListener('project-requests:changed', loadProjectCounts);
    return () => {
      clearInterval(interval);
      window.removeEventListener('project-requests:changed', loadProjectCounts);
    };
  }, [projectUnits, user?.id, user?.main_role, user?.role, user?.position, isAdminSuper, isSystemMode]);

  useEffect(() => {
    if (!user?.id) return;
    const loadChatUnread = () => {
      getChatUnreadTotal()
        .then((d) => setChatUnreadCount(d.total || 0))
        .catch(() => setChatUnreadCount(0));
    };
    loadChatUnread();
    window.addEventListener('chat:unread-changed', loadChatUnread);
    return () => window.removeEventListener('chat:unread-changed', loadChatUnread);
  }, [user?.id]);

  useEffect(() => {
    const loadCounts = async () => {
      try {
        const [requestsData, lowStockData] = await Promise.all([
          getRequests(),
          getLowStockItems(),
        ]);
        const pendingRequests = requestsData.filter((r: any) => r.status === 'pending');
        setPendingCount(pendingRequests.length);
        setMaterialApprovalCount(
          pendingRequests.filter((r: any) => r.type === 'material_request' || r.type === 'item_return').length
        );
        setCashApprovalCount(pendingRequests.filter((r: any) => r.type === 'cash_request').length);
        setApprovedCount(requestsData.filter((r: any) => r.status === 'supervisor_approved').length);
        setLowStockCount(lowStockData.length);
      } catch (error) {
        console.error('Error loading counts:', error);
      }
    };
    const loadNotifCount = async () => {
      try {
        const [list, workspace] = await Promise.all([
          getNotifications(),
          getWorkspace().catch(() => null),
        ]);
        setUnreadNotifCount(list.filter((n) => !n.read).length);
        setWorkspaceAttentionCount(workspace?.stats?.attentionCount || 0);
      } catch {
        setUnreadNotifCount(0);
        setWorkspaceAttentionCount(0);
      }
    };
    loadCounts();
    loadNotifCount();
    const interval = setInterval(() => {
      loadCounts();
      loadNotifCount();
    }, 10000);
    const onRealtime = () => {
      loadCounts();
      loadNotifCount();
    };
    window.addEventListener('staff:requests-changed', onRealtime as EventListener);
    window.addEventListener('staff:notifications-changed', onRealtime as EventListener);
    return () => {
      clearInterval(interval);
      window.removeEventListener('staff:requests-changed', onRealtime as EventListener);
      window.removeEventListener('staff:notifications-changed', onRealtime as EventListener);
    };
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await new Promise(r => setTimeout(r, 1200));
    logout();
    setIsLoggingOut(false);
  };

  const formatUserAttribute = (value?: string | null) =>
    String(value || '')
      .trim()
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');

  const isAdminSuperAccount = () => {
    return isAdminSuper;
  };

  const getUserDisplayLabel = () => {
    if (isAdminSuperAccount()) return SYSTEM_ADMIN_LABEL;

    const position = formatUserAttribute(user?.position);
    if (position.toLowerCase() === 'director') return position;

    const primaryUnit = formatUserAttribute(user?.unit);
    if (primaryUnit) return primaryUnit;

    const firstUnit = Array.isArray(user?.units) ? formatUserAttribute(user.units[0]) : '';
    if (firstUnit) return firstUnit;

    return 'User';
  };

  const getMenuItems = () => {
    const role = normalizeMenuRole(resolvePrimaryRole(user));
    const position = String(user?.position || '').trim().toLowerCase();
    const units = [
      user?.unit,
      ...(Array.isArray(user?.units) ? user.units : []),
    ]
      .map((u) => String(u || '').trim().toLowerCase())
      .filter(Boolean);
    const hasUnit = (...values: string[]) => values.some((value) => units.includes(value));
    const hasPosition = (...values: string[]) => values.some((value) => position === value);
    const roleIsSuperadmin = role === 'superadmin';
    const roleIsAdmin = role === 'admin';
    const isLegacyStockAdmin = role === 'stock_admin';
    const hasSystemWideMode = isAdminSuper;
    const isSystemOperator = !isAdminSuper && (roleIsAdmin || roleIsSuperadmin || role === 'system_admin');
    const isGlobalPosition = hasPosition('director');
    const isManagerOrSupervisor = position.includes('manager') || position.includes('supervisor') || isGlobalPosition;
    const isProcurement = hasUnit('procurement') || hasPosition('procurement');
    const isFinance = hasUnit('finance') || hasPosition('finance');
    const isFinanceApprover = hasUnit('finance') && (hasPosition('finance', 'finance officer', 'finance manager') || position.includes('finance'));
    const isCxUser =
      hasUnit('cx') ||
      hasPosition('account manager', 'relationship officer', 'customer support');
    const isSalesUser = hasUnit('sales') || hasPosition('sales');
    const isHrUser = isHrStaff(user);
    const isNocUser = hasUnit('noc') || hasPosition('noc manager', 'noc supervisor');
    const isIpUser = hasUnit('ip') || hasPosition('ip manager', 'ip supervisor');
    const isTxUser =
      hasUnit('tx', 'ts') ||
      hasPosition('tx manager', 'tx supervisor', 'ts manager', 'ts supervisor') ||
      (hasPosition('engineer') && hasUnit('tx', 'ts'));
    const isProjectUser =
      hasUnit('project') ||
      units.some((unit) => unit === 'project unit' || unit.startsWith('project')) ||
      hasPosition('project manager', 'project supervisor');
    const isProjectDeptOnly =
      isProjectUser &&
      !isNocUser &&
      !isIpUser &&
      !isTxUser &&
      !isCxUser &&
      !isProcurement &&
      !isHrUser &&
      !isFinance &&
      !isSalesUser &&
      !hasUnit('operations') &&
      !isGlobalPosition;
    const canViewTicketReports =
      hasSystemWideMode ||
      isGlobalPosition ||
      (isManagerOrSupervisor && hasUnit('noc', 'ip', 'tx', 'ts', 'cx'));
    const canViewCashReports =
      hasSystemWideMode ||
      isGlobalPosition ||
      (isManagerOrSupervisor && isFinance);
    const canViewServiceRequestReports =
      hasSystemWideMode ||
      isGlobalPosition ||
      (isManagerOrSupervisor && hasUnit('project', 'tx', 'ts', 'ip', 'noc') && !isProjectDeptOnly);
    const canViewInventoryReports =
      hasSystemWideMode ||
      isGlobalPosition ||
      isProcurement;
    const canApproveMaterialInSidebar =
      !isHrUser && (hasSystemWideMode || isGlobalPosition || isManagerOrSupervisor);
    const canApproveCashInSidebar =
      hasSystemWideMode ||
      isGlobalPosition ||
      isFinanceApprover ||
      (isManagerOrSupervisor && isProjectUser);

    // Common items
    const requestForms     = { icon: ClipboardList,  label: 'Material Requests', path: '/request-forms' };
    const itemReturns      = { icon: ArrowLeftCircle,label: 'Item Returns',      path: '/item-returns' };
    const materialApprovals = { icon: Clock,          label: 'Material Approvals', path: '/material-approvals', notificationCount: materialApprovalCount };
    const cashApprovals    = { icon: HandCoins,      label: 'Cash Approvals',    path: '/cash-approvals', notificationCount: cashApprovalCount };
    const issueItem        = { icon: CheckCircle,    label: 'Issue Item',        path: '/approved-forms', notificationCount: approvedCount };
    const approvalSubItems = [
      ...(canApproveCashInSidebar ? [cashApprovals] : []),
      ...(canApproveMaterialInSidebar ? [materialApprovals] : []),
    ];
    const reportSubItems = [
      { icon: BarChart3, label: 'Reports Home', path: '/staff/reports' },
      ...(canViewTicketReports ? [{ icon: Ticket, label: 'Ticket Report', path: '/staff/reports/tickets' }] : []),
      ...(canViewCashReports ? [{ icon: DollarSign, label: 'Cash Report', path: '/staff/reports/cash' }] : []),
      ...(canViewServiceRequestReports ? [{ icon: Network, label: 'Service Request Report', path: '/staff/reports/service-requests' }] : []),
      ...(canViewInventoryReports ? [{ icon: Package, label: 'Inventory Report', path: '/reports' }] : []),
    ];
    const reportSystemSection =
      reportSubItems.length > 1
        ? {
            icon: BarChart2,
            label: 'Report System',
            isCollapsible: true,
            isOpen: isReportsOpen,
            onToggle: () => setIsReportsOpen((prev) => !prev),
            badge: 'Reports',
            badgeColor: 'bg-indigo-100 text-indigo-800',
            subItems: reportSubItems,
          }
        : null;

    /** Directors â€” inventory report only inside Report System (no duplicate top-level Reports). */
    const directorReportSystemSection = reportSystemSection;

    const aiAssistant      = { icon: Bot,            label: 'AI Assistant',      path: '/ai-assistant' };

    // Cash & Finance
    const cashRequest      = { icon: DollarSign,     label: 'Request Cash Advance', path: '/cash-request' };
    const financeApprovals = { icon: HandCoins,      label: 'Finance Approvals',    path: '/finance-approvals' };

    // Inventory core
    const dashboard        = { icon: BarChart3,      label: 'Dashboard',         path: '/dashboard' };
    const directorDashboard = { icon: BarChart3, label: 'CTO / Directors Dashboard', path: '/director/dashboard' };

    const approvalsSection = {
      icon: ClipboardList,
      label: 'Approve Request',
      isCollapsible: true,
      isOpen: true,
      onToggle: () => {},
      subItems: approvalSubItems,
    };
    const requestApprovalsSection = {
      icon: ClipboardList,
      label: 'Approve Request',
      isCollapsible: true,
      isOpen: true,
      onToggle: () => {},
      badge: pendingCount > 0 ? String(pendingCount) : undefined,
      badgeColor: 'bg-red-100 text-red-800',
      subItems: approvalSubItems,
    };
    const staffItem        = { icon: Users,         label: 'User Management',   path: '/users' };
    const items            = { icon: Package,        label: 'Items',             path: '/inventory' };
    const categories       = { icon: Tags,           label: 'Categories',        path: '/categories' };
    const lowStock         = { icon: AlertTriangle,  label: 'Low Stock Alerts',  path: '/low-stock' };
    const itemsOut         = { icon: ArrowUpRight,   label: 'Request History',   path: '/items-out' };
    const inventoryReport  = { icon: FileText,       label: 'Inventory Report',  path: '/reports' };
    const inventorySection = (subItems: any[]) =>
      subItems.length
        ? {
            icon: Package,
            label: 'Inventory',
            isCollapsible: true,
            isOpen: isInventoryOpen,
            onToggle: () => setIsInventoryOpen((prev) => !prev),
            subItems,
          }
        : null;

    const systemSettingsSection = {
      icon: Settings,
      label: 'Settings',
      isCollapsible: true,
      isOpen: isSettingsOpen,
      onToggle: () => setIsSettingsOpen((prev) => !prev),
      badge: 'System',
      badgeColor: 'bg-purple-100 text-purple-800',
      subItems: [
        { icon: UserCheck, label: 'Roles & Permissions', path: '/users' },
        { icon: Network, label: 'Units Configuration', path: '/project-request/admin/units' },
        { icon: AuditIcon, label: 'Audit Logs', path: '/audit-logs' },
        { icon: Sliders, label: 'System Configuration', path: '/configuration' },
        { icon: Bell, label: 'System Messages', path: '/system-messages' },
        { icon: Settings, label: 'System Settings', path: '/settings' },
      ],
    };

    // Field Activities
    const fieldActivities = {
      icon: Map,
      label: 'Field Activities',
      isCollapsible: true,
      isOpen: isFieldOpen,
      onToggle: () => setIsFieldOpen(prev => !prev),
      subItems: [
        { icon: Home,       label: 'Dashboard',      path: '/field/dashboard' },
        { icon: MapPin,     label: 'Map View',       path: '/field/map' },
        { icon: Activity,   label: 'All Activities', path: '/field/activities' },
        { icon: PlusCircle, label: 'Add Activity',   path: '/field/add' },
      ]
    };

    // Assets Manager (live)
    const assetsManager = {
      icon: Monitor,
      label: 'Assets Manager',
      isCollapsible: true,
      isOpen: isAssetsOpen,
      onToggle: () => setIsAssetsOpen(prev => !prev),
      subItems: [
        { icon: Package,   label: 'All Assets',     path: '/assets' },
        { icon: Plus,      label: 'Add New Asset',  path: '/assets/new' },
        { icon: Tags,      label: 'Categories',     path: '/assets/categories' },
        { icon: MapPin,    label: 'Locations',      path: '/assets/locations' },
        { icon: UserCheck, label: 'Assignments',    path: '/assets/assignments' },
        { icon: Wrench,    label: 'Maintenance',    path: '/assets/maintenance' },
        { icon: Building2, label: 'Vendors',        path: '/assets/vendors' },
        { icon: FileText,  label: 'Reports',        path: '/assets/reports' },
      ]
    };

    // CX Section - Master Queue + Escalation
    const cxSection = {
      icon: Headphones,
      label: 'CX System',
      isCollapsible: true,
      isOpen: isCXOpen,
      onToggle: () => setIsCXOpen(prev => !prev),
      badge: 'Live',
      badgeColor: 'bg-green-100 text-green-800',
      subItems: [
        { icon: BarChart3,   label: 'CX Dashboard',          path: '/staff/cx/dashboard' },
        { icon: Building2,   label: 'Projects & Sites',      path: '/staff/cx/projects' },
        { icon: Users2,      label: 'Customer Organizations', path: '/staff/cx/customers' },
        { icon: Ticket,      label: 'Master Ticket Queue',   path: '/staff/cx/tickets' },
        { icon: FilePlus,    label: 'Create Staff Ticket',   path: '/staff/cx/create-ticket' },
        { icon: CircleAlert, label: 'Ticket Escalation',     path: '/staff/cx/escalate' },
        { icon: Headset,     label: 'Assign Support',        path: '/staff/cx/assign' },
        { icon: User,        label: 'User Work History',     path: '/staff/cx/user-work-history' },
        { icon: Search,      label: 'Ticket Search',         path: '/staff/cx/ticket-search' },
      ]
    };

    const roSection = {
      icon: Users2,
      label: 'Relationship Officer',
      isCollapsible: true,
      isOpen: isCXOpen,
      onToggle: () => setIsCXOpen((prev) => !prev),
      badge: 'R.O',
      badgeColor: 'bg-amber-100 text-amber-800',
      subItems: [
        { icon: Ticket, label: 'R.O Ticket Queue', path: '/staff/ro/escalations' },
        { icon: FilePlus, label: 'Create Ticket', path: '/staff/cx/create-ticket' },
      ],
    };

    const nocManagerSection = {
      icon: Ticket,
      label: 'NOC Manager',
      isCollapsible: true,
      isOpen: isNOCOpen,
      onToggle: () => setIsNOCOpen((prev) => !prev),
      badge: 'Mgr',
      badgeColor: 'bg-orange-100 text-orange-800',
      subItems: [
        { icon: Ticket, label: 'Manager Escalations', path: '/staff/noc-manager/escalations' },
      ],
    };

    const directorEscalationSection = {
      icon: AlertCircle,
      label: 'CTO / Directors',
      isCollapsible: true,
      isOpen: isCXOpen,
      onToggle: () => setIsCXOpen((prev) => !prev),
      badge: 'Exec',
      badgeColor: 'bg-red-100 text-red-800',
      subItems: [
        { icon: Ticket, label: 'Executive Escalations', path: '/staff/director/escalations' },
      ],
    };

    /** Directors / CTO â€” all service requests in one queue (no per-unit links). */
    const directorProjectRequestsSection = {
      icon: Network,
      label: 'Service Requests',
      isCollapsible: true,
      isOpen: isProjectRequestOpen,
      onToggle: () => setIsProjectRequestOpen((p) => !p),
      badge: (projectUnitCounts.project || 0) > 0 ? String(projectUnitCounts.project) : undefined,
      badgeColor: 'bg-red-100 text-red-800',
      subItems: [
        {
          icon: FileText,
          label: 'All Service Requests',
          path: '/project-request/project',
          notificationCount: projectUnitCounts.project || 0,
        },
      ],
    };

    /** Directors / CTO â€” unified ticket access (no CX, NOC, IP, or Field queues). */
    const directorTicketsSection = {
      icon: Ticket,
      label: 'Tickets',
      isCollapsible: true,
      isOpen: isCXOpen,
      onToggle: () => setIsCXOpen((prev) => !prev),
      subItems: [
        { icon: Ticket, label: 'All Tickets', path: '/staff/cx/tickets' },
        { icon: Search, label: 'Search for Tickets', path: '/staff/cx/ticket-search' },
        { icon: User, label: 'User Work History', path: '/staff/cx/user-work-history' },
      ],
    };

    // NOC Section â€” first point of action for all new tickets
    const nocSection = {
      icon: Ticket,
      label: 'NOC Ticketing',
      isCollapsible: true,
      isOpen: isNOCOpen,
      onToggle: () => setIsNOCOpen(prev => !prev),
      badge: 'Live',
      badgeColor: 'bg-green-100 text-green-800',
      subItems: [
        { icon: Home,        label: 'Dashboard',             path: '/staff/noc/dashboard' },
        { icon: Ticket,      label: 'NOC Ticket Queue',      path: '/staff/noc/tickets' },
        { icon: FilePlus,    label: 'Create Ticket',         path: '/staff/cx/create-ticket' },
        { icon: CircleAlert, label: 'NOC Escalation',        path: '/staff/cx/escalate' },
      ]
    };

    // IP Ticketing
    const ipSection = {
      icon: Globe,
      label: 'IP Ticketing',
      isCollapsible: true,
      isOpen: isIPOpen,
      onToggle: () => setIsIPOpen(prev => !prev),
      badge: 'Live',
      badgeColor: 'bg-indigo-100 text-indigo-800',
      subItems: [
        { icon: Ticket,      label: 'IP Ticket Queue',       path: '/staff/ip/tickets' },
        { icon: CircleAlert, label: 'IP Escalation',         path: '/staff/cx/escalate' },
      ]
    };

    // TX Ticketing
    const fieldEngSection = {
      icon: Wrench,
      label: 'TS Ticketing',
      isCollapsible: true,
      isOpen: isFieldEngOpen,
      onToggle: () => setIsFieldEngOpen(prev => !prev),
      badge: 'Live',
      badgeColor: 'bg-purple-100 text-purple-800',
      subItems: [
        { icon: Ticket,      label: 'TS Ticket Queue',       path: '/staff/field/tickets' },
        { icon: CircleAlert, label: 'TS Escalation',         path: '/staff/cx/escalate' },
      ]
    };

    // Customer Portal
    const customerPortal = {
      icon: User,
      label: 'Customer Portal',
      isCollapsible: true,
      isOpen: isCustomerOpen,
      onToggle: () => setIsCustomerOpen(prev => !prev),
      badge: 'Live',
      badgeColor: 'bg-purple-100 text-purple-800',
      subItems: [
        { icon: Home,      label: 'Dashboard',         path: '/customer/dashboard' },
        { icon: FilePlus,  label: 'Create Ticket',     path: '/customer/create-ticket' },
      ]
    };

    const myWorkspace = {
      icon: LayoutDashboard,
      label: 'My Workspace',
      path: '/workspace',
      notificationCount: unreadNotifCount + workspaceAttentionCount,
    };
    const chatItem = {
      icon: MessageCircle,
      label: 'Vobiss Workspace',
      path: '/chat',
      notificationCount: chatUnreadCount,
    };
    const profileItem = { icon: Settings, label: 'Profile & Security', path: '/profile' };

    const hrSection = {
      icon: Briefcase,
      label: 'Human Resources',
      isCollapsible: true,
      isOpen: isHrOpen,
      onToggle: () => setIsHrOpen((p) => !p),
      badge: 'HR',
      badgeColor: 'bg-sky-500/20 text-sky-300',
      subItems: [
        { icon: LayoutDashboard, label: 'HR Dashboard', path: '/hr/dashboard' },
        { icon: Users, label: 'Employees', path: '/hr/employees' },
        { icon: CalendarDays, label: 'Leave Management', path: '/hr/leave' },
        { icon: Wallet, label: 'Payroll', path: '/hr/payroll' },
        { icon: ClipboardCheck, label: 'Attendance', path: '/hr/attendance' },
        { icon: BarChart3, label: 'Analytics', path: '/hr/analytics' },
        { icon: BarChart2, label: 'Reports', path: '/hr/reports' },
        { icon: FolderOpen, label: 'Documents', path: '/hr/documents' },
        { icon: FileText, label: 'Form Requests', path: '/hr/forms' },
      ],
    };
    const myHrSection = {
      icon: Briefcase,
      label: 'My HR',
      isCollapsible: true,
      isOpen: isMyHrOpen,
      onToggle: () => setIsMyHrOpen((p) => !p),
      subItems: [
        { icon: CalendarCheck, label: 'My Attendance', path: '/hr-self/attendance' },
        { icon: CalendarOff, label: 'Leave Request', path: '/hr-self/leave', notificationCount: linkedHrEmployee?.pending_leave_count || 0 },
        { icon: FileText, label: 'My Forms', path: '/hr-self/forms' },
      ],
    };
    const showMyHr = !!linkedHrEmployee && !isHrUser && !userHasAnyRole(user, ['superadmin']) && !isGlobalPosition;

    const directorHrSection = {
      icon: Briefcase,
      label: 'Human Resources',
      isCollapsible: true,
      isOpen: isHrOpen,
      onToggle: () => setIsHrOpen((p) => !p),
      badge: 'HR',
      badgeColor: 'bg-sky-500/20 text-sky-300',
      subItems: [
        { icon: Users, label: 'Employees', path: '/hr/employees' },
        { icon: CalendarDays, label: 'Leave Management', path: '/hr/leave' },
        { icon: ClipboardCheck, label: 'Attendance', path: '/hr/attendance' },
        { icon: BarChart2, label: 'Reports', path: '/hr/reports' },
      ],
    };

    const isAdmin = hasSystemWideMode || isLegacyStockAdmin || isGlobalPosition;
    const FIXED_LABELS: Record<string, string> = {
      project: 'Project Unit',
      ts: 'TS — Transmission',
      ip: 'IP',
      noc: 'NOC',
    };
    const order = ['project', 'ts', 'ip', 'noc'] as const;
    const userServiceSlugs = serviceRequestSlugsForUnits(
      [user?.unit, ...(Array.isArray(user?.units) ? user.units : [])],
      user?.position
    );

    const projectSubItems: { icon: typeof Network; label: string; path: string; notificationCount?: number }[] = [];
    if (isAdmin) {
      order.forEach((slug) => {
        projectSubItems.push({
          icon: Network,
          label: FIXED_LABELS[slug],
          path: `/project-request/${slug}`,
          notificationCount: projectUnitCounts[slug] || 0,
        });
      });
    } else {
      order.forEach((slug) => {
        if (!userServiceSlugs.has(slug)) return;
        const u = projectUnits.find((x) => x.slug === slug);
        projectSubItems.push({
          icon: Network,
          label: FIXED_LABELS[slug] || u?.name || slug,
          path: `/project-request/${slug}`,
          notificationCount: projectUnitCounts[slug] || 0,
        });
      });
    }

    const projectRequestBadgeCount = projectSubItems.reduce(
      (sum, item) => sum + (item.notificationCount || 0),
      0
    );

    const projectRequestSection =
      projectSubItems.length > 0
        ? {
            icon: Network,
            label: 'Service Requests',
            isCollapsible: true,
            isOpen: isProjectRequestOpen,
            onToggle: () => setIsProjectRequestOpen((p) => !p),
            badge: projectRequestBadgeCount > 0 ? String(projectRequestBadgeCount) : undefined,
            badgeColor: 'bg-red-100 text-red-800',
            subItems: projectSubItems,
          }
        : null;

    const prependProjectRequest = (items: any[]) =>
      projectRequestSection ? [projectRequestSection, ...items] : items;
    const composeItems = (items: any[], inventoryItems: any[] = []) => {
      const inv = inventorySection(inventoryItems);
      return prependProjectRequest(inv ? [inv, ...items] : items);
    };

    let baseItems: any[] = [];

    if (isAdminSuper) {
      baseItems = composeItems([
        directorDashboard,
        requestApprovalsSection,
        aiAssistant,
        cashRequest, financeApprovals,
        assetsManager, fieldActivities,
        cxSection, ...(reportSystemSection ? [reportSystemSection] : []), nocSection, ipSection, fieldEngSection,
        customerPortal,
        directorEscalationSection,
        directorTicketsSection,
        { icon: Search, label: 'Global Search', path: '/director/search' },
        systemSettingsSection,
      ], [dashboard, items, categories, lowStock, itemsOut, requestForms, itemReturns, issueItem, inventoryReport]);
      baseItems = [hrSection, ...baseItems];
    }
    else if (isLegacyStockAdmin) {
      baseItems = composeItems([
        requestApprovalsSection,
        aiAssistant,
        cashRequest, financeApprovals,
        assetsManager, fieldActivities,
        cxSection, ...(reportSystemSection ? [reportSystemSection] : []), nocSection, ipSection, fieldEngSection, customerPortal,
        { icon: AuditIcon, label: 'Audit Logs',      path: '/audit-logs' },
        { icon: Users,     label: 'User Management', path: '/users' },
        { icon: Settings,  label: 'Settings',        path: '/settings' }
      ], [dashboard, items, categories, lowStock, itemsOut, requestForms, itemReturns, issueItem, inventoryReport]);
    }
    else if (role === 'director' || isGlobalPosition) {
      const inv = inventorySection([
        { icon: Package, label: 'Items (View Only)', path: '/inventory' },
        lowStock,
        itemsOut,
        issueItem,
      ]);
      baseItems = [
        directorDashboard,
        directorProjectRequestsSection,
        ...(directorReportSystemSection ? [directorReportSystemSection] : []),
        approvalsSection,
        ...(inv ? [inv] : []),
        directorHrSection,
        directorEscalationSection,
        directorTicketsSection,
        { icon: MapPin, label: 'Field Engineer Map', path: '/field/map' },
        { icon: Search, label: 'Global Search', path: '/director/search' },
        { icon: AuditIcon, label: 'Audit Logs', path: '/audit-logs' },
      ];
    }
    else if (role === 'customer') {
      baseItems = [customerPortal];
    }
    else {
      if (isProcurement) {
        baseItems = composeItems(
          [assetsManager],
          [dashboard, items, categories, lowStock, itemsOut, requestForms, itemReturns, issueItem, inventoryReport]
        );
      } else if (isProjectDeptOnly) {
        const unitItems: any[] = [requestForms];
        if (isManagerOrSupervisor && approvalSubItems.length) {
          unitItems.push(requestApprovalsSection);
        }
        baseItems = prependProjectRequest(unitItems);
      } else {
        const unitItems: any[] = [];
        const inventoryItems: any[] = [];
        const unitNeedsStaffRequests =
          isTxUser ||
          isNocUser ||
          isIpUser ||
          isCxUser ||
          isSalesUser ||
          isFinance ||
          hasUnit('operations', 'project');

        if (!isSystemOperator) {
          unitItems.push(cashRequest);
          if (!isHrUser) inventoryItems.push(requestForms, itemReturns);
        } else if (unitNeedsStaffRequests && !isHrUser) {
          unitItems.push(cashRequest);
          inventoryItems.push(requestForms, itemReturns);
        }

        if (isManagerOrSupervisor) {
          if (approvalSubItems.length) unitItems.push(requestApprovalsSection);
          if (reportSystemSection) unitItems.push(reportSystemSection);
        }

        if (isNocUser) unitItems.push(nocSection);
        if (hasPosition('noc manager')) unitItems.push(nocManagerSection);
        if (isIpUser) unitItems.push(ipSection);
        if (isTxUser) unitItems.push(fieldEngSection, fieldActivities);
        if (isCxUser) unitItems.push(cxSection, customerPortal);
        if (hasPosition('relationship officer')) unitItems.push(roSection);
        if (isFinance) unitItems.push(financeApprovals);
        if (isSalesUser && !isCxUser) unitItems.push(customerPortal);
        if (hasUnit('operations')) unitItems.push(fieldActivities);

        baseItems = composeItems(unitItems, inventoryItems);
      }
    }

    if (isHrUser && !hasSystemWideMode && !isGlobalPosition) {
      baseItems = [hrSection, ...baseItems];
    }
    if (showMyHr) {
      baseItems = [myHrSection, ...baseItems];
    }
    if (isSystemOperator) {
      baseItems = [...baseItems, systemSettingsSection];
    }

    return [myWorkspace, chatItem, ...baseItems, profileItem];
  };

  const menuItems = getMenuItems();

  const renderBadge = (label: string) => {
    let count = 0, color = '';
    if (label === 'Pending Approvals') { count = pendingCount; color = 'bg-red-500'; }
    else if (label === 'Approved Forms') { count = approvedCount; color = 'bg-yellow-500'; }
    else if (label === 'Low Stock Alerts') { count = lowStockCount; color = 'bg-orange-500'; }

    if (count > 0) {
      return (
        <span className={`${color} text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center ml-2 min-w-[20px] animate-pulse`}>
          {count > 99 ? '99+' : count}
        </span>
      );
    }
    return null;
  };

  const navItemClass = (active: boolean, extra = '') =>
    `group relative flex h-[34px] items-center rounded-[var(--radius-sm)] text-[13px] font-normal transition-colors duration-150 ${
      isCollapsed ? 'justify-center mx-1 px-0' : 'mx-1.5 px-2.5'
    } ${
      active
        ? 'bg-[var(--sidebar-active-bg)] text-[var(--sidebar-text-active)] border-l-[2.5px] border-[var(--sidebar-active-border)]'
        : 'border-l-[2.5px] border-transparent text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-text-active)]'
    } ${extra}`;

  const rolePill =
    (isAdminSuper ? SYSTEM_ADMIN_LABEL : '') ||
    String(user?.position || '').trim() ||
    formatRoleLabel(resolvePrimaryRole(user)) ||
    getUserDisplayLabel();
  const displayName = isAdminSuper ? SYSTEM_ADMIN_LABEL : user?.full_name || user?.username || 'User';

  return (
    <>
      {mobileOpen && !forceHidden && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={closeMobile}
          aria-hidden
        />
      )}

      {!forceHidden && (
      <div
        aria-hidden={false}
        className={`vobiss-sidebar relative fixed inset-y-0 left-0 z-50 flex flex-col text-[var(--sidebar-text)] transition-[transform,width] duration-200 ease-out lg:static lg:z-auto ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${
          isCollapsed
            ? 'w-[min(22rem,calc(100vw-2.5rem))] lg:w-[var(--sidebar-collapsed-width)]'
            : 'w-[min(22rem,calc(100vw-2.5rem))] lg:w-[var(--sidebar-width)]'
        }`}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div
            className={`relative flex h-14 shrink-0 items-center border-b border-[var(--sidebar-border)] pt-[max(0.25rem,env(safe-area-inset-top))] ${
              isCollapsed ? 'justify-center px-2' : 'gap-2.5 px-4'
            }`}
          >
            <img
              src="/vobiss-logo.png"
              alt="Vobiss Logo"
              className={`shrink-0 object-contain ${isCollapsed ? 'h-6 w-6' : 'h-6 w-6'}`}
            />
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-[var(--sidebar-text-active)]">Vobiss ERP</span>
                <span className="block truncate text-[10px] text-[var(--sidebar-section-label)]">Enterprise Platform</span>
              </div>
            )}
            <button
              type="button"
              onClick={onToggle}
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--sidebar-text)] transition duration-150 hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-text-active)] lg:flex"
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={closeMobile}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--sidebar-text)] transition hover:bg-[var(--sidebar-hover-bg)] lg:hidden ${isCollapsed ? 'hidden' : ''}`}
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {user && !isCollapsed && (
            <div className="mx-4 my-2">
              <span className="inline-flex items-center rounded-full bg-[var(--sidebar-active-bg)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--sidebar-active-border)]">
                {rolePill}
              </span>
              {canUseSystemMode && !isAdminSuper && (
                <div className="mt-3 grid grid-cols-2 rounded-[var(--radius-sm)] bg-white/5 p-0.5 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setAccessMode('work')}
                    className={`rounded-md px-2 py-1.5 transition ${
                      accessMode === 'work' ? 'bg-[var(--primary)] text-white' : 'text-[var(--sidebar-text)] hover:text-[var(--sidebar-text-active)]'
                    }`}
                  >
                    Work
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccessMode('system')}
                    className={`rounded-md px-2 py-1.5 transition ${
                      accessMode === 'system' ? 'bg-[var(--primary)] text-white' : 'text-[var(--sidebar-text)] hover:text-[var(--sidebar-text-active)]'
                    }`}
                  >
                    System
                  </button>
                </div>
              )}
            </div>
          )}

          <nav className={`no-scrollbar flex-1 overflow-y-auto py-2 ${isCollapsed ? 'px-0' : 'px-0'}`}>
            {menuItems.map((item: any, index) => {
              if (item.isCollapsible) {
                const Icon = item.icon;
                const active = item.subItems.some((sub: any) => location.pathname.startsWith(sub.path));

                return (
                  <div
                    key={index}
                    className={
                      index > 0 &&
                      !(
                        (item.label === 'Human Resources' || item.label === 'My HR') &&
                        isHrStaff(user) &&
                        !userHasAnyRole(user, ['director', 'cto']) &&
                        String(user?.position || '').trim().toLowerCase() !== 'director'
                      )
                        ? 'mt-3.5 pt-2.5'
                        : undefined
                    }
                  >
                    {!isCollapsed && (item.label === 'Human Resources' || item.label === 'My HR') && isHrStaff(user) && !userHasAnyRole(user, ['director', 'cto']) && String(user?.position || '').trim().toLowerCase() !== 'director' && (
                      <div className="mx-4 mb-1 mt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--sidebar-section-label)]">
                        People
                      </div>
                    )}
                    <div
                      onClick={() => {
                        if (isCollapsed) {
                          onRequestExpand?.();
                          item.onToggle();
                          return;
                        }
                        item.onToggle();
                      }}
                      title={isCollapsed ? item.label : undefined}
                      className={navItemClass(active, 'cursor-pointer')}
                    >
                      <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${active ? 'text-[var(--sidebar-active-border)]' : ''} ${isCollapsed ? '' : 'mr-2.5'}`} />
                      {!isCollapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          {item.badge && (
                            <span className={`mr-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${item.badgeColor || 'bg-white/10 text-[var(--sidebar-text)]'}`}>
                              {item.badge}
                            </span>
                          )}
                          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[var(--sidebar-section-label)] transition-transform duration-200 ease-in-out ${item.isOpen ? 'rotate-180' : ''}`} />
                        </>
                      )}
                    </div>

                    {!isCollapsed && (
                      <div
                        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                          item.isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                        }`}
                      >
                        <div className="overflow-hidden">
                          {item.subItems.map((sub: any) => {
                            const SubIcon = sub.icon;
                            const subActive = location.pathname.startsWith(sub.path);
                            return (
                              <Link
                                key={sub.path}
                                to={sub.path}
                                className={navItemClass(subActive, 'h-[31px] pl-9 text-[12px]')}
                                onClick={() => {
                                  if (window.matchMedia('(max-width: 1023px)').matches) closeMobile();
                                }}
                              >
                                <SubIcon className={`mr-2.5 h-3.5 w-3.5 flex-shrink-0 ${subActive ? 'text-[var(--sidebar-active-border)]' : ''}`} />
                                <span className="flex-1">{sub.label}</span>
                                {(sub.notificationCount ?? 0) > 0 && (
                                  <span className="ml-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-bold text-white">
                                    {sub.notificationCount > 99 ? '99+' : sub.notificationCount}
                                  </span>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              const prev = menuItems[index - 1];

              return (
                <Link
                  key={index}
                  to={item.path}
                  title={isCollapsed ? item.label : undefined}
                  className={`${navItemClass(isActive)} ${prev?.isCollapsible ? 'mt-3.5' : ''}`}
                  onClick={() => {
                    if (window.matchMedia('(max-width: 1023px)').matches) closeMobile();
                  }}
                >
                  <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${isActive ? 'text-[var(--sidebar-active-border)]' : ''} ${isCollapsed ? '' : 'mr-2.5'}`} />
                  {!isCollapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {(item.notificationCount ?? 0) > 0 && (
                        <span className="ml-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-bold text-white">
                          {item.notificationCount > 99 ? '99+' : item.notificationCount}
                        </span>
                      )}
                      {renderBadge(item.label)}
                    </>
                  )}
                  {isCollapsed && (item.notificationCount ?? 0) > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-sky-400" />
                  )}
                </Link>
              );
            })}
          </nav>

          {user && (
            <div className={`border-t border-[var(--sidebar-border)] ${isCollapsed ? 'px-1.5 py-3' : 'px-3.5 py-3'}`}>
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
                <UserAvatar
                  src={user?.avatar_url}
                  name={displayName}
                  className="h-[30px] w-[30px] text-[12px]"
                  colorClass="bg-[var(--sidebar-active-border)]"
                />
                {!isCollapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[var(--sidebar-text-active)]">{displayName}</p>
                    <p className="truncate text-[11px] capitalize text-[var(--sidebar-text)]">{rolePill}</p>
                  </div>
                )}
                {!isCollapsed && (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    title="Logout"
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--sidebar-text)] transition hover:bg-red-500/10 hover:text-red-400"
                  >
                    {isLoggingOut ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--accent-red)] border-t-transparent" />
                    ) : (
                      <LogOut className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {isCollapsed && (
            <div className="hidden border-t border-[var(--sidebar-border)] px-1 py-2 lg:block">
              <button
                type="button"
                onClick={onRequestExpand}
                title="Expand sidebar"
                className="flex w-full items-center justify-center rounded-[var(--radius-sm)] py-2 text-[var(--sidebar-text)] transition hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-text-active)]"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      )}
    </>
  );
};

export default Sidebar;
