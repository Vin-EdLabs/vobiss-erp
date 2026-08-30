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
  Briefcase, CalendarDays, CalendarCheck, CalendarOff, Wallet, ClipboardCheck, FolderOpen, PanelLeftClose, PanelLeft, Landmark, ShieldCheck,
  Truck, Fuel, FileSignature, Award
} from 'lucide-react';
import { getRequests, getLowStockItems, getNotifications, getWorkspace, cxApi } from '../api';
import { formatPersonName } from '@/lib/displayName';
import { resolvePrimaryRole, normalizeMenuRole, userHasAnyRole, formatRoleLabel, isHrStaff, SYSTEM_ADMIN_LABEL } from '../config/roles';
import { getMyProjectUnits, getProjectRequestDashboard, type ProjectUnit } from '../api/project';
import { getChatUnreadTotal } from '../api/chat';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useQuery } from '@tanstack/react-query';
import { hrSelfApi } from '@/api/hrSelf';
import { hrApi } from '@/api/hr';
import { UserAvatar } from '@/components/UserAvatar';
import { isMenuPathActive } from '@/lib/menuActivePath';

const OPEN_TICKET_STATUSES = new Set(['NEW', 'OPEN', 'IN_PROGRESS', 'ON_HOLD']);

type TicketAttentionCounts = {
  noc: number;
  ip: number;
  tx: number;
  cx: number;
  ro: number;
  noc_manager: number;
  director: number;
  escalate: number;
  mine: number;
};

const EMPTY_TICKET_COUNTS: TicketAttentionCounts = {
  noc: 0,
  ip: 0,
  tx: 0,
  cx: 0,
  ro: 0,
  noc_manager: 0,
  director: 0,
  escalate: 0,
  mine: 0,
};

function ticketAssigneeId(ticket: any): number | null {
  const raw = ticket?.assigned_to?.id ?? ticket?.assigned_to ?? ticket?.assignee_id ?? null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ticketNeedsAttention(ticket: any, userId?: number | null): boolean {
  if (!OPEN_TICKET_STATUSES.has(String(ticket?.status || '').toUpperCase())) return false;
  const assignee = ticketAssigneeId(ticket);
  if (!assignee) return true;
  return !!userId && assignee === userId;
}

function computeTicketAttentionCounts(tickets: any[], userId?: number | null): TicketAttentionCounts {
  const counts = { ...EMPTY_TICKET_COUNTS };
  for (const ticket of tickets || []) {
    if (!ticketNeedsAttention(ticket, userId)) continue;
    const stage = String(ticket?.escalation_stage || 'noc').toLowerCase();
    const assignee = ticketAssigneeId(ticket);
    if (userId && assignee === userId) counts.mine += 1;

    if (stage === 'ip') counts.ip += 1;
    else if (stage === 'tx' || stage === 'ts') counts.tx += 1;
    else if (stage === 'ro' || stage === 'relationship_officer') counts.ro += 1;
    else if (stage === 'noc_manager' || stage === 'noc-manager') counts.noc_manager += 1;
    else if (stage === 'director' || stage === 'cto') counts.director += 1;
    else counts.noc += 1;

    counts.cx += 1;
  }
  counts.escalate = counts.ro + counts.noc_manager + counts.director;
  return counts;
}

/** Numeric attention pill — cream on brown sidebar */
const SIDEBAR_COUNT_PILL =
  'mr-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#f3e6d4] px-1 text-[10px] font-bold text-[#3c2210]';
const SIDEBAR_COUNT_PILL_SUB =
  'ml-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#f3e6d4] px-1 text-[10px] font-bold text-[#3c2210]';
const SIDEBAR_COUNT_DOT = 'absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#f3e6d4]';
/** Soft role/label chips that match the brown system */
const SIDEBAR_LABEL_BADGE = 'bg-[#f3e6d4]/15 text-[#f3e6d4]';
const SIDEBAR_ALERT_BADGE = 'bg-[#f3e6d4] text-[#3c2210]';

function filterSidebarMenu(items: any[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const matches = (label?: string) => String(label || '').toLowerCase().includes(q);
  return items
    .map((item) => {
      if (item?.isCollapsible && Array.isArray(item.subItems)) {
        const parentHit = matches(item.label);
        const subItems = parentHit
          ? item.subItems
          : item.subItems.filter((sub: any) => matches(sub.label));
        if (!parentHit && subItems.length === 0) return null;
        return { ...item, subItems, isOpen: true };
      }
      return matches(item?.label) ? item : null;
    })
    .filter(Boolean);
}

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
      if (unit === 'sales') slugs.add('sales');
      if (unit === 'tx' || unit === 'ts') slugs.add('ts');
      if (unit === 'ip') slugs.add('ip');
      if (unit === 'noc') slugs.add('noc');
    });
  const pos = String(position || '').trim().toLowerCase();
  if (pos === 'project manager' || pos === 'project supervisor') slugs.add('project');
  return slugs;
};

const SIDEBAR_SECTION_IDS = [
  'transport', 'inventory', 'finance', 'approveRequest', 'settings', 'fieldActivities',
  'assetsManager', 'cx', 'relationshipOffice', 'noc', 'ip', 'fieldEngineering',
  'customerPortal', 'reports', 'serviceRequests', 'projectUnit', 'networkAssets',
  'hr', 'myHr', 'nocManager', 'directors', 'tickets',
] as const;
type SidebarSectionId = (typeof SIDEBAR_SECTION_IDS)[number];
type SidebarSectionState = Record<SidebarSectionId, boolean>;

const CLOSED_SIDEBAR_SECTIONS: SidebarSectionState = Object.fromEntries(
  SIDEBAR_SECTION_IDS.map((id) => [id, false])
) as SidebarSectionState;

function readSidebarSectionState(userId: number | string): SidebarSectionState | null {
  try {
    const saved = localStorage.getItem(`sidebar_state_${userId}`);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return null;
    return { ...CLOSED_SIDEBAR_SECTIONS, ...parsed };
  } catch {
    return null;
  }
}

function defaultSidebarSectionForPath(pathname: string): SidebarSectionId | null {
  if (pathname.startsWith('/transport')) return 'transport';
  if (pathname === '/material-approvals' || pathname === '/cash-approvals') return 'approveRequest';
  if (pathname.startsWith('/network-assets')) return 'networkAssets';
  if (pathname.startsWith('/project-unit')) return 'projectUnit';
  if (pathname.startsWith('/project-request')) return 'serviceRequests';
  if (pathname.startsWith('/finance') || pathname.startsWith('/cash')) return 'finance';
  if (pathname.startsWith('/hr-self')) return 'myHr';
  if (pathname.startsWith('/hr')) return 'hr';
  if (pathname.startsWith('/inventory') || pathname.startsWith('/categories') || pathname.startsWith('/low-stock') || pathname.startsWith('/items-out')) return 'inventory';
  if (pathname.startsWith('/staff/noc') || pathname.startsWith('/noc/')) return 'noc';
  if (pathname.startsWith('/staff/ip')) return 'ip';
  if (pathname.startsWith('/staff/field')) return 'fieldEngineering';
  if (pathname.startsWith('/assets')) return 'assetsManager';
  if (pathname.startsWith('/field/')) return 'fieldActivities';
  if (pathname.startsWith('/staff/cx')) return 'cx';
  if (pathname.startsWith('/staff/reports') || pathname === '/reports') return 'reports';
  if (pathname.startsWith('/customer')) return 'customerPortal';
  if (pathname.startsWith('/configuration') || pathname.startsWith('/settings') || pathname.startsWith('/audit-logs') || pathname.startsWith('/realm')) return 'settings';
  return null;
}

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
  const isPhone = useIsMobile(767);
  const compact = desktopMode === 'collapsed' && !isPhone;
  const closeMobile = () => {
    if (onMobileClose) onMobileClose();
    else onToggle();
  };

  const hasRefreshedUser = useRef(false);
  const [sidebarSections, setSidebarSections] = useState<SidebarSectionState>(CLOSED_SIDEBAR_SECTIONS);
  const sidebarSectionsUserId = useRef<number | string | null>(null);

  useEffect(() => {
    if (!user?.id || sidebarSectionsUserId.current === user.id) return;
    sidebarSectionsUserId.current = user.id;
    const saved = readSidebarSectionState(user.id);
    const activeSection = defaultSidebarSectionForPath(location.pathname);
    setSidebarSections(saved || { ...CLOSED_SIDEBAR_SECTIONS, ...(activeSection ? { [activeSection]: true } : {}) });
  }, [user?.id, location.pathname]);

  const sectionOpen = (section: SidebarSectionId) => sidebarSections[section];
  const toggleSection = (section: SidebarSectionId) => {
    setSidebarSections((current) => {
      const updated = { ...current, [section]: !current[section] };
      if (user?.id) localStorage.setItem(`sidebar_state_${user.id}`, JSON.stringify(updated));
      return updated;
    });
  };

  useEffect(() => {
    if (user?.id && !hasRefreshedUser.current) {
      hasRefreshedUser.current = true;
      refreshUser();
    }
  }, [user?.id, refreshUser]);

  const [pendingCount, setPendingCount] = useState(0);
  const [materialApprovalCount, setMaterialApprovalCount] = useState(0);
  const [cashApprovalCount, setCashApprovalCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [workspaceAttentionCount, setWorkspaceAttentionCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [menuQuery, setMenuQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [projectUnits, setProjectUnits] = useState<ProjectUnit[]>([]);
  const [projectUnitCounts, setProjectUnitCounts] = useState<Record<string, number>>({});
  const [ticketAttention, setTicketAttention] = useState<TicketAttentionCounts>(EMPTY_TICKET_COUNTS);
  const [canCreateProjectRequest, setCanCreateProjectRequest] = useState(false);
  const hrMeQ = useQuery({
    queryKey: ['hr-self', 'me'],
    queryFn: hrSelfApi.me,
    enabled: !!user?.id,
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const linkedHrEmployee = hrMeQ.data !== undefined ? hrMeQ.data : hrEmployee;
  const hrStatsQ = useQuery({
    queryKey: ['hr', 'stats'],
    queryFn: hrApi.dashboardStats,
    enabled:
      !!user?.id &&
      (isHrStaff(user) ||
        isAdminSuper ||
        ['director', 'cto'].includes(String(user?.main_role || user?.role || '').toLowerCase()) ||
        String(user?.position || '').trim().toLowerCase() === 'director'),
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

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
  }, [projectUnits.length, user?.id, user?.main_role, user?.role, user?.position, isAdminSuper, isSystemMode]);

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
    if (!user?.id) {
      setTicketAttention(EMPTY_TICKET_COUNTS);
      return;
    }
    const loadTicketAttention = async () => {
      try {
        const res = await cxApi.getAllTickets();
        const list = res?.data || res?.tickets || (Array.isArray(res) ? res : []);
        setTicketAttention(computeTicketAttentionCounts(list, Number(user.id)));
      } catch {
        setTicketAttention(EMPTY_TICKET_COUNTS);
      }
    };
    loadTicketAttention();
    const interval = setInterval(loadTicketAttention, 15000);
    window.addEventListener('staff:tickets-changed', loadTicketAttention as EventListener);
    return () => {
      clearInterval(interval);
      window.removeEventListener('staff:tickets-changed', loadTicketAttention as EventListener);
    };
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
        setUnreadNotifCount(Array.isArray(list) ? list.filter((n) => !n.read).length : 0);
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
      hasSystemWideMode || isGlobalPosition || !!user?.permissions?.realm_material_approver;
    const canApproveCashInSidebar =
      hasSystemWideMode || isGlobalPosition || !!user?.permissions?.realm_cash_approver;

    // Common items
    const requestForms     = { icon: ClipboardList,  label: 'Material Requests', path: '/request-forms' };
    const itemReturns      = { icon: ArrowLeftCircle,label: 'Item Returns',      path: '/item-returns' };
    const transportRequest = { icon: Truck,          label: 'Transport Requests', path: '/transport-request' };
    const transportSupervisorDashboard = { icon: ShieldCheck, label: 'Dashboard', path: '/transport-supervisor-dashboard' };
    const fuelRequests = { icon: Fuel, label: 'Fuel Requests', path: '/transport/fuel-requests' };
    const rentalVehicleRequests = { icon: FileText, label: 'Vehicle Rental Requests', path: '/transport/rental-vehicle-requests' };
    const transportApprovals = { icon: Clock,        label: 'Transport Approvals', path: '/transport-approvals' };
    const rentalApprovals = { icon: Clock, label: 'Rental Approvals', path: '/transport/rental-approvals' };
    const fuelApprovals = { icon: Clock, label: 'Fuel Approvals', path: '/transport/fuel-approvals' };
    const financeDashboard = { icon: BarChart3, label: 'Finance Dashboard', path: '/finance/dashboard' };
    const financeApprovalHistory = { icon: CheckCircle, label: 'Approval History', path: '/finance/approval-history' };
    const transportSettings = { icon: Settings, label: 'Settings', path: '/configuration' };
    const materialApprovals = { icon: Clock,          label: 'Material Approvals', path: '/material-approvals', notificationCount: materialApprovalCount };
    const cashApprovals    = { icon: HandCoins,      label: 'Cash Approvals',    path: '/cash-approvals', notificationCount: cashApprovalCount };
    const issueItem        = { icon: CheckCircle,    label: 'Issue Item',        path: '/approved-forms', notificationCount: approvedCount };
    const approvalSubItems = [
      ...(canApproveMaterialInSidebar ? [materialApprovals] : []),
      ...(canApproveCashInSidebar ? [cashApprovals] : []),
      transportApprovals,
      rentalApprovals,
      fuelApprovals,
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
            isOpen: sectionOpen('reports'),
            onToggle: () => toggleSection('reports'),
            badge: 'Reports',
            badgeColor: SIDEBAR_LABEL_BADGE,
            subItems: reportSubItems,
          }
        : null;

    /** Directors â€” inventory report only inside Report System (no duplicate top-level Reports). */
    const directorReportSystemSection = reportSystemSection;

    const aiAssistant      = { icon: Bot,            label: 'AI Assistant',      path: '/ai-assistant' };

    // Cash & Finance
    const cashRequest      = { icon: DollarSign,     label: 'Request Cash Advance', path: '/cash-request' };
    const financeApprovals = { icon: HandCoins,      label: 'Finance Approvals',    path: '/finance-approvals' };
    const vehicleFinanceQueue = { icon: HandCoins, label: 'Vehicle Cash Issuance', path: '/transport/finance-queue' };
    const fuelFinanceQueue = { icon: HandCoins, label: 'Fuel Cash & Receipts', path: '/finance/fuel-requests' };
    const financeSection = {
      icon: Wallet,
      label: 'Finance',
      isCollapsible: true,
      isOpen: sectionOpen('finance'),
      onToggle: () => toggleSection('finance'),
      subItems: [
        financeDashboard,
        financeApprovals,
        vehicleFinanceQueue,
        fuelFinanceQueue,
        financeApprovalHistory,
      ],
    };

    // Inventory core
    const dashboard        = { icon: BarChart3,      label: 'Dashboard',         path: '/dashboard' };
    const directorDashboard = { icon: BarChart3, label: 'CTO / Directors Dashboard', path: '/director/dashboard' };

    const approvalsSection = {
      icon: ClipboardList,
      label: 'Approve Request',
      isCollapsible: true,
      isOpen: sectionOpen('approveRequest'),
      onToggle: () => toggleSection('approveRequest'),
      notificationCount: pendingCount,
      subItems: approvalSubItems,
    };
    const requestApprovalsSection = {
      icon: ClipboardList,
      label: 'Approve Request',
      isCollapsible: true,
      isOpen: sectionOpen('approveRequest'),
      onToggle: () => toggleSection('approveRequest'),
      badge: pendingCount > 0 ? String(pendingCount) : undefined,
      badgeColor: SIDEBAR_ALERT_BADGE,
      notificationCount: pendingCount,
      subItems: approvalSubItems,
    };
    const staffItem        = { icon: Users,         label: 'User Management',   path: '/users' };
    const items            = { icon: Package,        label: 'Items',             path: '/inventory' };
    const categories       = { icon: Tags,           label: 'Categories',        path: '/categories' };
    const lowStock         = { icon: AlertTriangle,  label: 'Low Stock Alerts',  path: '/low-stock', notificationCount: lowStockCount };
    const itemsOut         = { icon: ArrowUpRight,   label: 'Request History',   path: '/items-out' };
    const inventoryReport  = { icon: FileText,       label: 'Inventory Report',  path: '/reports' };
    const inventorySection = (subItems: any[]) =>
      subItems.length
        ? {
            icon: Package,
            label: 'Inventory',
            isCollapsible: true,
            isOpen: sectionOpen('inventory'),
            onToggle: () => toggleSection('inventory'),
            notificationCount: subItems.reduce((sum: number, item: any) => sum + (item.notificationCount || 0), 0),
            subItems,
          }
        : null;

    const transportSection = {
      icon: Truck,
      label: 'Transport',
      isCollapsible: true,
      isOpen: sectionOpen('transport'),
      onToggle: () => toggleSection('transport'),
      subItems: [
        transportSupervisorDashboard,
        transportRequest,
        fuelRequests,
        rentalVehicleRequests,
      ],
    };

    const systemSettingsSection = {
      icon: Settings,
      label: 'Settings',
      isCollapsible: true,
      isOpen: sectionOpen('settings'),
      onToggle: () => toggleSection('settings'),
      badge: 'System',
      badgeColor: SIDEBAR_LABEL_BADGE,
      subItems: [
        { icon: UserCheck, label: 'Roles & Permissions', path: '/users' },
        { icon: Users2, label: 'Manage Clients', path: '/admin/clients' },
        { icon: Network, label: 'Units Configuration', path: '/project-request/admin/units' },
        { icon: AuditIcon, label: 'Audit Logs', path: '/audit-logs' },
        { icon: Activity, label: 'Workflow Performance', path: '/workflow-performance' },
        { icon: Sliders, label: 'Workflow Time Config', path: '/settings/workflow-time-config' },
        { icon: Sliders, label: 'System Configuration', path: '/configuration' },
        { icon: Sliders, label: 'Design Configuration', path: '/settings/design-configuration' },
        { icon: Landmark, label: 'Realm', path: '/realm' },
        { icon: Bell, label: 'System Messages', path: '/system-messages' },
        { icon: Settings, label: 'System Settings', path: '/settings' },
        // Hidden archive — System Admin account only (not shown to ordinary operators)
        ...(isAdminSuper
          ? [{ icon: ShieldCheck, label: 'Vobi Vault', path: '/admin/vobi-vault' }]
          : []),
      ],
    };

    const isDesignMember = hasUnit('design', 'design unit') || ['design_manager', 'design_supervisor'].includes(role);
    const designSettingsSection = isDesignMember
      ? { icon: Settings, label: 'Settings', isCollapsible: true, isOpen: sectionOpen('settings'), onToggle: () => toggleSection('settings'), subItems: [{ icon: Sliders, label: 'Design Configuration', path: '/settings/design-configuration' }] }
      : null;

    // Field Activities
    const fieldActivities = {
      icon: Map,
      label: 'Field Activities',
      isCollapsible: true,
      isOpen: sectionOpen('fieldActivities'),
      onToggle: () => toggleSection('fieldActivities'),
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
      isOpen: sectionOpen('assetsManager'),
      onToggle: () => toggleSection('assetsManager'),
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
      isOpen: sectionOpen('cx'),
      onToggle: () => toggleSection('cx'),
      badge: ticketAttention.cx > 0 ? String(ticketAttention.cx) : undefined,
      badgeColor: SIDEBAR_ALERT_BADGE,
      notificationCount: ticketAttention.cx,
      subItems: [
        { icon: BarChart3,   label: 'CX Dashboard',          path: '/staff/cx/dashboard' },
        { icon: Building2,   label: 'Projects',              path: '/staff/cx/projects' },
        { icon: MapPin,      label: 'Sites',                 path: '/staff/cx/sites' },
        { icon: Users2,      label: 'Clients',               path: '/staff/cx/clients' },
        { icon: Ticket,      label: 'Master Ticket Queue',   path: '/staff/cx/tickets', notificationCount: ticketAttention.cx },
        { icon: FilePlus,    label: 'Create Staff Ticket',   path: '/staff/cx/create-ticket' },
        { icon: CircleAlert, label: 'Ticket Escalation',     path: '/staff/cx/escalate', notificationCount: ticketAttention.escalate },
        { icon: Headset,     label: 'Assign Support',        path: '/staff/cx/assign', notificationCount: ticketAttention.cx },
        { icon: User,        label: 'User Work History',     path: '/staff/cx/user-work-history' },
        { icon: Search,      label: 'Ticket Search',         path: '/staff/cx/ticket-search' },
        { icon: Tags,        label: 'Ticket Tags',           path: '/staff/cx/tags' },
      ]
    };

    const roSection = {
      icon: Users2,
      label: 'Relationship Officer',
      isCollapsible: true,
      isOpen: sectionOpen('relationshipOffice'),
      onToggle: () => toggleSection('relationshipOffice'),
      badge: ticketAttention.ro > 0 ? String(ticketAttention.ro) : 'R.O',
      badgeColor: ticketAttention.ro > 0 ? SIDEBAR_ALERT_BADGE : SIDEBAR_LABEL_BADGE,
      notificationCount: ticketAttention.ro,
      subItems: [
        { icon: Ticket, label: 'R.O Ticket Queue', path: '/staff/ro/escalations', notificationCount: ticketAttention.ro },
        { icon: FilePlus, label: 'Create Ticket', path: '/staff/cx/create-ticket' },
      ],
    };

    const nocManagerSection = {
      icon: Ticket,
      label: 'NOC Manager',
      isCollapsible: true,
      isOpen: sectionOpen('nocManager'),
      onToggle: () => toggleSection('nocManager'),
      badge: ticketAttention.noc_manager > 0 ? String(ticketAttention.noc_manager) : 'Mgr',
      badgeColor: ticketAttention.noc_manager > 0 ? SIDEBAR_ALERT_BADGE : SIDEBAR_LABEL_BADGE,
      notificationCount: ticketAttention.noc_manager,
      subItems: [
        { icon: Ticket, label: 'Manager Escalations', path: '/staff/noc-manager/escalations', notificationCount: ticketAttention.noc_manager },
      ],
    };

    const directorEscalationSection = {
      icon: AlertCircle,
      label: 'CTO / Directors',
      isCollapsible: true,
      isOpen: sectionOpen('directors'),
      onToggle: () => toggleSection('directors'),
      badge: ticketAttention.director > 0 ? String(ticketAttention.director) : 'Exec',
      badgeColor: ticketAttention.director > 0 ? SIDEBAR_ALERT_BADGE : SIDEBAR_LABEL_BADGE,
      notificationCount: ticketAttention.director,
      subItems: [
        { icon: Ticket, label: 'Executive Escalations', path: '/staff/director/escalations', notificationCount: ticketAttention.director },
      ],
    };

    /** Directors / CTO — all service requests in one queue (no per-unit links). */
    const directorProjectRequestsSection = {
      icon: Network,
      label: 'Service Requests',
      isCollapsible: true,
      isOpen: sectionOpen('serviceRequests'),
      onToggle: () => toggleSection('serviceRequests'),
      badge: (projectUnitCounts.project || 0) > 0 ? String(projectUnitCounts.project) : undefined,
      badgeColor: SIDEBAR_ALERT_BADGE,
      subItems: [
        {
          icon: FileText,
          label: 'All Service Requests',
          path: '/project-request/project',
          notificationCount: projectUnitCounts.project || 0,
        },
      ],
    };

    /** Directors / CTO — unified ticket access (no CX, NOC, IP, or Field queues). */
    const directorTicketsSection = {
      icon: Ticket,
      label: 'Tickets',
      isCollapsible: true,
      isOpen: sectionOpen('tickets'),
      onToggle: () => toggleSection('tickets'),
      badge: ticketAttention.cx > 0 ? String(ticketAttention.cx) : undefined,
      badgeColor: SIDEBAR_ALERT_BADGE,
      notificationCount: ticketAttention.cx,
      subItems: [
        { icon: Ticket, label: 'All Tickets', path: '/staff/cx/tickets', notificationCount: ticketAttention.cx },
        { icon: Search, label: 'Search for Tickets', path: '/staff/cx/ticket-search' },
        { icon: User, label: 'User Work History', path: '/staff/cx/user-work-history' },
      ],
    };

    // NOC Section — first point of action for all new tickets
    const nocSection = {
      icon: Ticket,
      label: 'NOC Ticketing',
      isCollapsible: true,
      isOpen: sectionOpen('noc'),
      onToggle: () => toggleSection('noc'),
      badge: ticketAttention.noc > 0 ? String(ticketAttention.noc) : undefined,
      badgeColor: SIDEBAR_ALERT_BADGE,
      notificationCount: ticketAttention.noc,
      subItems: [
        { icon: Home,        label: 'Dashboard',             path: '/staff/noc/dashboard' },
        { icon: Ticket,      label: 'NOC Ticket Queue',      path: '/staff/noc/tickets', notificationCount: ticketAttention.noc },
        { icon: Ticket,      label: 'Master Tickets',        path: '/staff/cx/tickets' },
        { icon: ClipboardList, label: 'Incident Notes',       path: '/noc/incident-notes' },
        { icon: Clock,         label: 'Shift Schedule',       path: '/noc/shift-schedule' },
        { icon: FilePlus,    label: 'Create Ticket',         path: '/staff/cx/create-ticket' },
        { icon: CircleAlert, label: 'NOC Escalation',        path: '/staff/cx/escalate', notificationCount: ticketAttention.escalate },
      ]
    };

    // IP Ticketing
    const ipSection = {
      icon: Globe,
      label: 'IP Ticketing',
      isCollapsible: true,
      isOpen: sectionOpen('ip'),
      onToggle: () => toggleSection('ip'),
      badge: ticketAttention.ip > 0 ? String(ticketAttention.ip) : undefined,
      badgeColor: SIDEBAR_ALERT_BADGE,
      notificationCount: ticketAttention.ip,
      subItems: [
        { icon: Home,        label: 'Dashboard',             path: '/staff/ip/dashboard' },
        { icon: Ticket,      label: 'IP Ticket Queue',       path: '/staff/ip/tickets', notificationCount: ticketAttention.ip },
        { icon: FilePlus,    label: 'Create Ticket',         path: '/staff/cx/create-ticket' },
        { icon: CircleAlert, label: 'IP Escalation',         path: '/staff/cx/escalate', notificationCount: ticketAttention.escalate },
      ]
    };

    // TX Ticketing
    const fieldEngSection = {
      icon: Wrench,
      label: 'TS Ticketing',
      isCollapsible: true,
      isOpen: sectionOpen('fieldEngineering'),
      onToggle: () => toggleSection('fieldEngineering'),
      badge: ticketAttention.tx > 0 ? String(ticketAttention.tx) : undefined,
      badgeColor: SIDEBAR_ALERT_BADGE,
      notificationCount: ticketAttention.tx,
      subItems: [
        { icon: Home,        label: 'Dashboard',             path: '/staff/field/dashboard' },
        { icon: Ticket,      label: 'TS Ticket Queue',       path: '/staff/field/tickets', notificationCount: ticketAttention.tx },
        { icon: FilePlus,    label: 'Create Ticket',         path: '/staff/cx/create-ticket' },
        { icon: CircleAlert, label: 'TS Escalation',         path: '/staff/cx/escalate', notificationCount: ticketAttention.escalate },
      ]
    };

    // Customer Portal
    const customerPortal = {
      icon: User,
      label: 'Customer Portal',
      isCollapsible: true,
      isOpen: sectionOpen('customerPortal'),
      onToggle: () => toggleSection('customerPortal'),
      badge: undefined,
      badgeColor: SIDEBAR_LABEL_BADGE,
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
    const myAssessmentItem = { icon: Award, label: 'My Assessment', path: '/my-assessment' };
    const showMyAssessment = role !== 'customer';

    const hrPendingLeave = Number(hrStatsQ.data?.pendingLeaveRequests || 0);
    const hrPendingForms = Number(hrStatsQ.data?.pendingFormRequests || 0);
    const hrAttentionCount = hrPendingLeave + hrPendingForms;
    const myPendingLeave = Number(linkedHrEmployee?.pending_leave_count || 0);
    const myPendingForms = Number(linkedHrEmployee?.pending_form_count || 0);
    const myHrAttentionCount = myPendingLeave + myPendingForms;

    const hrSection = {
      icon: Briefcase,
      label: 'Human Resources',
      isCollapsible: true,
      isOpen: sectionOpen('hr'),
      onToggle: () => toggleSection('hr'),
      badge: hrAttentionCount > 0 ? String(hrAttentionCount) : undefined,
      badgeColor: SIDEBAR_ALERT_BADGE,
      notificationCount: hrAttentionCount,
      subItems: [
        { icon: LayoutDashboard, label: 'HR Dashboard', path: '/hr/dashboard' },
        { icon: Users, label: 'Employees', path: '/hr/employees' },
        { icon: CalendarDays, label: 'Leave Management', path: '/hr/leave', notificationCount: hrPendingLeave },
        { icon: Wallet, label: 'Payroll', path: '/hr/payroll' },
        { icon: HandCoins, label: 'Salary Advances', path: '/hr/payroll/advances' },
        { icon: ClipboardList, label: 'Payroll History', path: '/hr/payroll-history' },
        { icon: ClipboardCheck, label: 'Attendance', path: '/hr/attendance' },
        { icon: BarChart3, label: 'Analytics', path: '/hr/analytics' },
        { icon: BarChart2, label: 'Reports', path: '/hr/reports' },
        { icon: FolderOpen, label: 'Documents', path: '/hr/documents' },
        { icon: FileText, label: 'Form Requests', path: '/hr/forms', notificationCount: hrPendingForms },
        { icon: ShieldCheck, label: 'Payroll Audit', path: '/hr/payroll/audit' },
      ],
    };
    const myHrSection = {
      icon: Briefcase,
      label: 'My HR',
      isCollapsible: true,
      isOpen: sectionOpen('myHr'),
      onToggle: () => toggleSection('myHr'),
      badge: myHrAttentionCount > 0 ? String(myHrAttentionCount) : undefined,
      badgeColor: SIDEBAR_ALERT_BADGE,
      notificationCount: myHrAttentionCount,
      subItems: [
        { icon: CalendarCheck, label: 'Attendance', path: '/hr-self/attendance' },
        { icon: Wallet, label: 'My Payslips', path: '/hr-self/payslips' },
        { icon: CalendarOff, label: 'Leave Request', path: '/hr-self/leave', notificationCount: myPendingLeave },
        { icon: FileText, label: 'Forms', path: '/hr-self/forms', notificationCount: myPendingForms },
      ],
    };
    const showMyHr = role !== 'customer';

    const directorHrSection = {
      icon: Briefcase,
      label: 'Human Resources',
      isCollapsible: true,
      isOpen: sectionOpen('hr'),
      onToggle: () => toggleSection('hr'),
      badge: hrAttentionCount > 0 ? String(hrAttentionCount) : undefined,
      badgeColor: SIDEBAR_ALERT_BADGE,
      notificationCount: hrAttentionCount,
      subItems: [
        { icon: Users, label: 'Employees', path: '/hr/employees' },
        { icon: CalendarDays, label: 'Leave Management', path: '/hr/leave', notificationCount: hrPendingLeave },
        { icon: Wallet, label: 'Payroll', path: '/hr/payroll' },
        { icon: ClipboardCheck, label: 'Attendance', path: '/hr/attendance' },
        { icon: BarChart2, label: 'Reports', path: '/hr/reports' },
        { icon: FileText, label: 'Form Requests', path: '/hr/forms', notificationCount: hrPendingForms },
        { icon: ShieldCheck, label: 'Payroll Audit', path: '/hr/payroll/audit' },
      ],
    };

    const isAdmin = hasSystemWideMode || isLegacyStockAdmin || isGlobalPosition;
    const FIXED_LABELS: Record<string, string> = {
      design: 'Design Unit',
      sales: 'Sales Unit',
      project: 'Project Unit',
      ts: 'TS — Transmission',
      ip: 'IP',
      noc: 'NOC',
    };
    const order = ['design', 'sales', 'project', 'ts', 'ip', 'noc'] as const;
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
          path: slug === 'design' ? '/project-request/design' : slug === 'sales' ? '/project-request/sales' : `/project-request/${slug}`,
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
          path: slug === 'design' ? '/project-request/design' : slug === 'sales' ? '/project-request/sales' : `/project-request/${slug}`,
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
            isOpen: sectionOpen('serviceRequests'),
            onToggle: () => toggleSection('serviceRequests'),
            badge: projectRequestBadgeCount > 0 ? String(projectRequestBadgeCount) : undefined,
            badgeColor: SIDEBAR_ALERT_BADGE,
            subItems: projectSubItems,
          }
        : null;

    const projectUnitSection = (isAdmin || userServiceSlugs.has('project')) ? {
      icon: Briefcase, label: 'Project Unit', isCollapsible: true, isOpen: sectionOpen('projectUnit'),
      onToggle: () => toggleSection('projectUnit'),
      subItems: [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/project-request/project' },
        { icon: FileText, label: 'Service Requests', path: '/project-request/project' },
        { icon: ClipboardList, label: 'WIP', path: '/project-unit/wip' },
        { icon: FileSignature, label: 'Sign-Off Forms', path: '/project-unit/signoff' },
      ],
    } : null;

    const networkAssetsSection = { icon: Network, label: 'Network Assets', isCollapsible: true, isOpen: sectionOpen('networkAssets'), onToggle: () => toggleSection('networkAssets'), subItems: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/network-assets' }, { icon: MapPin, label: 'PoP Register', path: '/network-assets/pops' }, { icon: Package, label: 'Equipment Inventory', path: '/network-assets/equipment' }, { icon: Network, label: 'Passive Infrastructure', path: '/network-assets/passive' }, { icon: Network, label: 'ECG Metro', path: '/network-assets/metro' }, { icon: Network, label: 'NEDCO Metro', path: '/network-assets/nedcoMetro' }, { icon: Network, label: 'Master Backhaul', path: '/network-assets/backhaul' }, { icon: Network, label: 'NEDCO Backhaul', path: '/network-assets/nedcoBackhaul' }, { icon: Package, label: 'Backhaul Accessories', path: '/network-assets/backhaulAccessories' }, { icon: Package, label: 'Metro Accessories', path: '/network-assets/metroAccessories' }, { icon: MapPin, label: 'Poles Register', path: '/network-assets/poles' }, { icon: Settings, label: 'Equipment Catalogue', path: '/network-assets/catalogue' }, { icon: FileText, label: 'Reports & Exports', path: '/network-assets/reports' },
    ]};
    const prependProjectRequest = (items: any[]) => [ networkAssetsSection, ...(projectUnitSection ? [projectUnitSection] : []), ...(projectRequestSection ? [projectRequestSection] : []), ...items ];
    const composeItems = (items: any[], inventoryItems: any[] = []) => {
      const inv = inventorySection(inventoryItems);
      return prependProjectRequest(inv ? [inv, ...items] : items);
    };

    let baseItems: any[] = [];

    if (isAdminSuper) {
      baseItems = composeItems([
        directorDashboard,
        transportSection,
        requestApprovalsSection,
        aiAssistant,
        financeSection,
        cashRequest,
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
        transportSection,
        requestApprovalsSection,
        aiAssistant,
        financeSection,
        cashRequest,
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
        transportSection,
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
        const procurementItems: any[] = [assetsManager];
        if (approvalSubItems.length) procurementItems.push(requestApprovalsSection);
        baseItems = composeItems(
          procurementItems,
          [dashboard, items, categories, lowStock, itemsOut, requestForms, itemReturns, issueItem, inventoryReport]
        );
      } else if (isProjectDeptOnly) {
        const unitItems: any[] = [requestForms];
        if (approvalSubItems.length) {
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
          unitItems.push(cashRequest, transportRequest);
          if (!isHrUser) inventoryItems.push(requestForms, itemReturns, transportRequest);
        } else if (unitNeedsStaffRequests && !isHrUser) {
          unitItems.push(cashRequest, transportRequest);
          inventoryItems.push(requestForms, itemReturns, transportRequest);
        }

        if (approvalSubItems.length) unitItems.push(requestApprovalsSection);
        unitItems.push(transportSection);
        if (isManagerOrSupervisor && reportSystemSection) unitItems.push(reportSystemSection);

        if (isNocUser) unitItems.push(nocSection);
        if (hasPosition('noc manager')) unitItems.push(nocManagerSection);
        if (isIpUser) unitItems.push(ipSection);
        if (isTxUser) unitItems.push(fieldEngSection, fieldActivities);
        if (isCxUser) unitItems.push(cxSection, customerPortal);
        if (hasPosition('relationship officer')) unitItems.push(roSection);
        if (isFinance) unitItems.push(financeSection);
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
    if (designSettingsSection) {
      baseItems = [...baseItems, designSettingsSection];
    }

    const menuHasApproveRequest = (items: any[]): boolean =>
      (items || []).some(
        (item) =>
          item?.label === 'Approve Request' ||
          (Array.isArray(item?.subItems) && menuHasApproveRequest(item.subItems))
      );
    if (approvalSubItems.length && !menuHasApproveRequest(baseItems)) {
      baseItems = [requestApprovalsSection, ...baseItems];
    }

    return [myWorkspace, ...(showMyAssessment ? [myAssessmentItem] : []), chatItem, ...baseItems, profileItem];
  };

  const menuItems = getMenuItems();
  const visibleMenuItems = filterSidebarMenu(menuItems, menuQuery);
  const isSearching = menuQuery.trim().length > 0;

  const goToMenuPath = () => {
    setMenuQuery('');
    if (window.matchMedia('(max-width: 1023px)').matches) closeMobile();
  };

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
      compact ? 'justify-center mx-1 px-0' : 'mx-1.5 px-2.5'
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
  const displayName = isAdminSuper ? SYSTEM_ADMIN_LABEL : formatPersonName(user, 'User');

  return (
    <>
      {mobileOpen && !forceHidden && (
        <div
          className="staff-sidebar-overlay fixed inset-0 z-[999] bg-black/50 md:hidden"
          onClick={closeMobile}
          aria-hidden
        />
      )}

      {!forceHidden && (
      <div
        aria-hidden={!mobileOpen && isPhone}
        className={`vobiss-sidebar fixed inset-y-0 left-0 z-[1000] flex h-[100dvh] w-[280px] flex-col text-[var(--sidebar-text)] transition-transform duration-[250ms] ease ${
          mobileOpen ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none md:pointer-events-auto md:translate-x-0'
        } md:static md:z-auto md:h-full ${
          compact
            ? 'md:w-[64px] lg:w-[var(--sidebar-collapsed-width)]'
            : 'md:w-[var(--sidebar-width)] lg:w-[var(--sidebar-width)]'
        }`}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div
            className={`relative flex h-14 shrink-0 items-center border-b border-[var(--sidebar-border)] pt-[max(0.25rem,env(safe-area-inset-top))] ${
              compact ? 'justify-center px-2' : 'justify-between gap-2.5 px-4'
            }`}
          >
            <img
              src="/vobiss-logo.png"
              alt="Vobiss Logo"
              className={`shrink-0 object-contain ${compact ? 'h-7 w-7' : 'h-7 w-7'}`}
            />
            {!compact && (
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold leading-tight text-[var(--sidebar-text-active)]">Vobiss ERP</span>
                <span className="mt-0.5 block truncate text-[10px] leading-tight text-[var(--sidebar-section-label)]">Enterprise Platform</span>
              </div>
            )}
            <button
              type="button"
              onClick={onToggle}
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--sidebar-text)] transition duration-150 hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-text-active)] md:flex"
              aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {compact ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={closeMobile}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--sidebar-text)] transition hover:bg-[var(--sidebar-hover-bg)] md:hidden"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!compact && (
            <div className="relative mx-4 mt-2.5 mb-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--sidebar-section-label)]" />
              <input
                ref={searchRef}
                type="text"
                value={menuQuery}
                onChange={(e) => setMenuQuery(e.target.value)}
                placeholder="Search menu..."
                autoComplete="off"
                spellCheck={false}
                aria-label="Search sidebar"
                className="sidebar-search-input h-8 w-full rounded-[var(--radius-sm)] border py-0 pl-8 pr-7 text-[12px] outline-none"
              />
              {isSearching && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuQuery('');
                    searchRef.current?.focus();
                  }}
                  className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-[var(--sidebar-section-label)] hover:text-[var(--sidebar-text-active)]"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {user && !compact && canUseSystemMode && !isAdminSuper && (
            <div className="mx-4 my-2">
              <div className="grid grid-cols-2 rounded-[var(--radius-sm)] bg-[var(--sidebar-hover-bg)] p-0.5 text-[11px] font-semibold">
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
            </div>
          )}

          <nav className={`no-scrollbar flex-1 overflow-y-auto py-2 ${compact ? 'px-0' : 'px-0'}`}>
            {isSearching && visibleMenuItems.length === 0 && (
              <p className="px-4 py-6 text-center text-[12px] text-[var(--sidebar-section-label)]">
                No matching pages
              </p>
            )}
            {visibleMenuItems.map((item: any, index) => {
              if (item.isCollapsible) {
                const Icon = item.icon;
                const active = item.subItems.some((sub: any) => isMenuPathActive(location.pathname, sub.path));

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
                    {!compact && (item.label === 'Human Resources' || item.label === 'My HR') && isHrStaff(user) && !userHasAnyRole(user, ['director', 'cto']) && String(user?.position || '').trim().toLowerCase() !== 'director' && (
                      <div className="mx-4 mb-1 mt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--sidebar-section-label)]">
                        People
                      </div>
                    )}
                    <div
                      onClick={() => {
                        if (compact) {
                          onRequestExpand?.();
                          item.onToggle();
                          return;
                        }
                        item.onToggle();
                      }}
                      title={compact ? item.label : undefined}
                      className={navItemClass(active, 'cursor-pointer')}
                    >
                      <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${active ? 'text-[var(--sidebar-active-border)]' : ''} ${compact ? '' : 'mr-2.5'}`} />
                      {!compact && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          {(item.notificationCount ?? 0) > 0 ? (
                            <span className={SIDEBAR_COUNT_PILL}>
                              {item.notificationCount > 99 ? '99+' : item.notificationCount}
                            </span>
                          ) : item.badge ? (
                            <span className={`mr-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${item.badgeColor || 'bg-white/10 text-[var(--sidebar-text)]'}`}>
                              {item.badge}
                            </span>
                          ) : null}
                          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[var(--sidebar-section-label)] transition-transform duration-200 ease-in-out ${item.isOpen ? 'rotate-180' : ''}`} />
                        </>
                      )}
                      {compact && (item.notificationCount ?? 0) > 0 && (
                        <span className={SIDEBAR_COUNT_DOT} />
                      )}
                    </div>

                    {!compact && (
                      <div
                        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                          item.isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                        }`}
                      >
                        <div className="overflow-hidden">
                          {item.subItems.map((sub: any) => {
                            const SubIcon = sub.icon;
                            const moreSpecific = item.subItems.some(
                              (other: any) =>
                                other.path !== sub.path &&
                                other.path.startsWith(`${sub.path}/`) &&
                                isMenuPathActive(location.pathname, other.path)
                            );
                            const subActive =
                              !moreSpecific &&
                              isMenuPathActive(location.pathname, sub.path);
                            return (
                              <Link
                                key={sub.path}
                                to={sub.path}
                                className={navItemClass(subActive, 'h-[31px] pl-9 text-[12px]')}
                                onClick={goToMenuPath}
                              >
                                <SubIcon className={`mr-2.5 h-3.5 w-3.5 flex-shrink-0 ${subActive ? 'text-[var(--sidebar-active-border)]' : ''}`} />
                                <span className="flex-1">{sub.label}</span>
                                {(sub.notificationCount ?? 0) > 0 && (
                                  <span className={SIDEBAR_COUNT_PILL_SUB}>
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
              const isActive = isMenuPathActive(location.pathname, item.path);
              const prev = visibleMenuItems[index - 1];

              return (
                <Link
                  key={index}
                  to={item.path}
                  title={compact ? item.label : undefined}
                  className={`${navItemClass(isActive)} ${prev?.isCollapsible ? 'mt-3.5' : ''}`}
                  onClick={goToMenuPath}
                >
                  <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${isActive ? 'text-[var(--sidebar-active-border)]' : ''} ${compact ? '' : 'mr-2.5'}`} />
                  {!compact && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {(item.notificationCount ?? 0) > 0 && (
                        <span className={SIDEBAR_COUNT_PILL_SUB}>
                          {item.notificationCount > 99 ? '99+' : item.notificationCount}
                        </span>
                      )}
                      {renderBadge(item.label)}
                    </>
                  )}
                  {compact && (item.notificationCount ?? 0) > 0 && (
                    <span className={SIDEBAR_COUNT_DOT} />
                  )}
                </Link>
              );
            })}
          </nav>

          {user && (
            <div className={`border-t border-[var(--sidebar-border)] ${compact ? 'px-1.5 py-3' : 'px-3.5 py-3'}`}>
              <div className={`flex items-center ${compact ? 'justify-center' : 'gap-2.5'}`}>
                <UserAvatar
                  src={user?.avatar_url}
                  name={displayName}
                  className="h-[30px] w-[30px] text-[12px]"
                  colorClass="bg-[var(--sidebar-active-border)]"
                />
                {!compact && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[var(--sidebar-text-active)]">{displayName}</p>
                    <p className="truncate text-[11px] capitalize text-[var(--sidebar-text)]">{rolePill}</p>
                  </div>
                )}
                {!compact && (
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

          {compact && (
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
