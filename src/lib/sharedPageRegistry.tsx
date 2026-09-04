import type { ComponentType } from 'react';
import RequestDetails from '@/pages/RequestDetails';
import CashDetails from '@/pages/finance/CashDetails';
import TransportDetail from '@/pages/transport/TransportDetail';
import FuelRequestDetailPage from '@/pages/transport/FuelRequestDetailPage';
import VehicleRentalRequestDetailPage from '@/pages/transport/VehicleRentalRequestDetailPage';
import ProductionDetail from '@/pages/production/ProductionDetail';
import TicketDetailPage from '@/pages/staff/cx/TicketDetailPage';
import IncidentNotes from '@/pages/staff/noc/IncidentNotes';
import SignoffFormPage from '@/pages/production/SignoffForms';
import WipPage from '@/pages/production/WipPage';
import NetworkAssets from '@/pages/NetworkAssets';
import ArchiveFilePreviewPage from '@/pages/archive/ArchiveFilePreviewPage';

export type SharedPageEntry = { pattern: string; Component: ComponentType };

/**
 * Maps a detail page's real route pattern to the exact same component the normal,
 * authenticated app uses — the external shared page renders one of these (inside a
 * MemoryRouter seeded with the record's real path) rather than a separate preview UI.
 * Add an entry here whenever ShareButton is wired into a new detail page.
 */
export const SHARED_PAGE_REGISTRY: SharedPageEntry[] = [
  { pattern: '/request-forms/:id', Component: RequestDetails },
  { pattern: '/item-returns/:id', Component: RequestDetails },
  { pattern: '/approved-forms/:id', Component: RequestDetails },
  { pattern: '/cash-details/:id', Component: CashDetails },
  { pattern: '/transport-requests/:id', Component: TransportDetail },
  { pattern: '/transport/fuel-requests/:id', Component: FuelRequestDetailPage },
  { pattern: '/finance/fuel-requests/:id', Component: FuelRequestDetailPage },
  { pattern: '/transport/vehicle-rental-requests/:id', Component: VehicleRentalRequestDetailPage },
  { pattern: '/project-request/:unitSlug/:id', Component: ProductionDetail },
  { pattern: '/staff/cx/tickets/:id', Component: TicketDetailPage },
  { pattern: '/staff/noc/tickets/:id', Component: TicketDetailPage },
  { pattern: '/staff/ip/tickets/:id', Component: TicketDetailPage },
  { pattern: '/staff/field/tickets/:id', Component: TicketDetailPage },
  { pattern: '/staff/noc-manager/tickets/:id', Component: TicketDetailPage },
  { pattern: '/staff/ro/tickets/:id', Component: TicketDetailPage },
  { pattern: '/staff/director/tickets/:id', Component: TicketDetailPage },
  { pattern: '/noc/incident-notes/:id', Component: IncidentNotes },
  { pattern: '/project-unit/signoff/:id', Component: SignoffFormPage },
  { pattern: '/project-unit/wip', Component: WipPage },
  { pattern: '/network-assets/:view', Component: NetworkAssets },
  { pattern: '/network-assets', Component: NetworkAssets },
  { pattern: '/file-storage/preview/:id', Component: ArchiveFilePreviewPage },
];
