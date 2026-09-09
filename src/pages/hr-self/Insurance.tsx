import React from 'react';
import { HrPageHeader } from '@/pages/hr/components';
import { HospitalInsuranceTab } from '@/components/hr/Insurance/HospitalInsuranceTab';

const HrSelfInsurance = () => {
  return (
    <div>
      <HrPageHeader title="Hospital Insurance" description="Your medical insurance limits, usage, claims, and transfers." />
      <HospitalInsuranceTab employeeId="me" canManage={false} />
    </div>
  );
};

export default HrSelfInsurance;
