import React from 'react';
import { UnitTicketDashboard } from '@/components/tickets/UnitTicketDashboard';

/** TS / Field unit ticketing dashboard — mirrors NOC dashboard for TS queue. */
const FieldTicketDashboard: React.FC = () => <UnitTicketDashboard unit="tx" />;

export default FieldTicketDashboard;
