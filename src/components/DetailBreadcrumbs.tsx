import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

type CrumbConfig = {
  pattern: RegExp;
  section: string;
  sectionPath: string;
  subSection: string;
  subSectionPath: string;
  referencePrefix: string;
};

const detailRoutes: CrumbConfig[] = [
  { pattern: /^\/transport-requests\/([^/]+)$/, section: 'Transport', sectionPath: '/transport-request', subSection: 'Transport Requests', subSectionPath: '/transport-request', referencePrefix: 'TR' },
  { pattern: /^\/transport\/fuel-requests\/([^/]+)$/, section: 'Transport', sectionPath: '/transport-request', subSection: 'Fuel Requests', subSectionPath: '/transport/fuel-requests', referencePrefix: 'FUEL' },
  { pattern: /^\/transport\/vehicle-rental-requests\/([^/]+)$/, section: 'Transport', sectionPath: '/transport-request', subSection: 'Vehicle Rentals', subSectionPath: '/transport/vehicle-rental-requests', referencePrefix: 'RV' },
  { pattern: /^\/transport\/vehicle-request\/([^/]+)$/, section: 'Transport', sectionPath: '/transport-request', subSection: 'Vehicle Requests', subSectionPath: '/transport/vehicle-rental-requests', referencePrefix: 'TR' },
  { pattern: /^\/finance\/fuel-requests\/([^/]+)$/, section: 'Finance', sectionPath: '/finance/dashboard', subSection: 'Fuel Cash & Receipts', subSectionPath: '/finance/fuel-requests', referencePrefix: 'FUEL' },
  { pattern: /^\/cash-details\/([^/]+)$/, section: 'Finance', sectionPath: '/finance/dashboard', subSection: 'Cash Requests', subSectionPath: '/cash-requests', referencePrefix: 'CASH' },
  { pattern: /^\/request-forms\/([^/]+)$/, section: 'Service Requests', sectionPath: '/request-forms', subSection: 'Material Requests', subSectionPath: '/request-forms', referencePrefix: 'REQ' },
  { pattern: /^\/item-returns\/([^/]+)$/, section: 'Inventory', sectionPath: '/dashboard', subSection: 'Item Returns', subSectionPath: '/item-returns', referencePrefix: 'RET' },
  { pattern: /^\/approved-forms\/([^/]+)$/, section: 'Inventory', sectionPath: '/dashboard', subSection: 'Approved Forms', subSectionPath: '/approved-forms', referencePrefix: 'REQ' },
  { pattern: /^\/assets\/vendors\/([^/]+)$/, section: 'Inventory', sectionPath: '/assets', subSection: 'Vendors', subSectionPath: '/assets/vendors', referencePrefix: 'VEN' },
  { pattern: /^\/assets\/assignments\/([^/]+)$/, section: 'Inventory', sectionPath: '/assets', subSection: 'Assignments', subSectionPath: '/assets/assignments', referencePrefix: 'PER' },
  { pattern: /^\/assets\/maintenance\/([^/]+)$/, section: 'Inventory', sectionPath: '/assets', subSection: 'Maintenance', subSectionPath: '/assets/maintenance', referencePrefix: 'MNT' },
  { pattern: /^\/assets\/([^/]+)$/, section: 'Inventory', sectionPath: '/assets', subSection: 'Assets', subSectionPath: '/assets', referencePrefix: 'AST' },
  { pattern: /^\/project-request\/([^/]+)\/([^/]+)$/, section: 'Service Requests', sectionPath: '/project-requests', subSection: 'Project Requests', subSectionPath: '/project-requests', referencePrefix: 'REQ' },
  { pattern: /^\/staff\/cx\/clients\/([^/]+)$/, section: 'Service Requests', sectionPath: '/staff/cx/dashboard', subSection: 'Clients', subSectionPath: '/staff/cx/clients', referencePrefix: 'CLI' },
  { pattern: /^\/staff\/(?:cx|noc|ip|field|noc-manager|ro|director)\/tickets\/([^/]+)$/, section: 'Service Requests', sectionPath: '/staff/cx/dashboard', subSection: 'Tickets', subSectionPath: '/staff/cx/tickets', referencePrefix: 'TKT' },
  { pattern: /^\/staff\/cx\/escalate\/([^/]+)$/, section: 'Service Requests', sectionPath: '/staff/cx/dashboard', subSection: 'Ticket Escalations', subSectionPath: '/staff/cx/tickets', referencePrefix: 'TKT' },
  { pattern: /^\/customer\/tickets\/([^/]+)$/, section: 'Customer Portal', sectionPath: '/customer/dashboard', subSection: 'My Tickets', subSectionPath: '/customer/tickets', referencePrefix: 'TKT' },
  { pattern: /^\/hr\/employees\/([^/]+)$/, section: 'Human Resources', sectionPath: '/hr/dashboard', subSection: 'Employees', subSectionPath: '/hr/employees', referencePrefix: 'EMP' },
];

function formatReference(prefix: string, rawId: string) {
  const id = decodeURIComponent(rawId);
  return /^\d+$/.test(id) ? `${prefix}-${id.padStart(3, '0')}` : id;
}

export default function DetailBreadcrumbs() {
  const { pathname } = useLocation();
  const matched = detailRoutes.find((route) => route.pattern.test(pathname));
  if (!matched) return null;

  const values = pathname.match(matched.pattern);
  const recordId = values?.at(-1);
  if (!recordId) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
      <Link to={matched.sectionPath} className="font-medium hover:text-amber-700 hover:underline">{matched.section}</Link>
      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
      <Link to={matched.subSectionPath} className="font-medium hover:text-amber-700 hover:underline">{matched.subSection}</Link>
      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
      <span className="font-semibold text-slate-700">{formatReference(matched.referencePrefix, recordId)}</span>
    </nav>
  );
}
