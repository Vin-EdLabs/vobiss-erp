import React from 'react';
import { useParams } from 'react-router-dom';
import { HrPageHeader } from './components';
import { OTManagementPanel } from '@/components/hr/Overtime/OTManagementPanel';

const HrOvertime = () => {
  const { id } = useParams();
  return (
    <div>
      <HrPageHeader
        title="Overtime Requests"
        description="Review, verify, sanction, authorize, and process overtime payment requests."
      />
      <OTManagementPanel targetId={id ? Number(id) : null} />
    </div>
  );
};

export default HrOvertime;
