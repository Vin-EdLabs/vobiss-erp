import React from 'react';
import { UnitTicketDashboard } from '@/components/tickets/UnitTicketDashboard';

/** Thin wrapper so NOC keeps using the shared unit dashboard. */
const NOCDashboard: React.FC = () => <UnitTicketDashboard unit="noc" />;

export default NOCDashboard;
