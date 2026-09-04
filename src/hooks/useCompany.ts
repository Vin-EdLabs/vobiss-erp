import { useAuth } from '@/context/AuthContext';

export const COMPANY_LABELS: Record<string, string> = {
  CW: 'C&W',
  PTEL: 'PTEL',
};

/** The current user's company/tenant. Defaults to 'CW' — every existing account predates
 *  multi-tenancy and is C&W's. Adding a future company (e.g. Iklick) just needs a matching
 *  entry in COMPANY_LABELS here for display; no other change to this hook.
 *
 *  For a true System Admin with an active "View as Company" override (see AuthContext's
 *  viewAsCompany), this reflects that override instead of their own real company — so the
 *  Sidebar's PTEL-only section, badges, etc. all show up exactly as PTEL sees them, matching
 *  what the backend is already scoping their requests to (via the x-view-as-company header). */
export function useCompany() {
  const { user, isAdminSuper, viewAsCompany } = useAuth();
  const company = (isAdminSuper && viewAsCompany) ? viewAsCompany : (user?.company || 'CW');
  return {
    company,
    companyLabel: COMPANY_LABELS[company] || company,
    isCW: company === 'CW',
    isPTEL: company === 'PTEL',
    isViewingAs: Boolean(isAdminSuper && viewAsCompany),
  };
}
