import React from 'react';
import { UnitTicketDashboard } from '@/components/tickets/UnitTicketDashboard';

/** IP unit ticketing dashboard — mirrors NOC dashboard for IP queue. */
const IPDashboard: React.FC = () => <UnitTicketDashboard unit="ip" />;

export default IPDashboard;
