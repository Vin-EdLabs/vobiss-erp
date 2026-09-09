import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HrPageHeader } from './components';
import { InsuranceDashboard } from '@/components/hr/Insurance/InsuranceDashboard';
import { PolicyConfig } from '@/components/hr/Insurance/PolicyConfig';

export default function HrInsurance() {
  return (
    <div>
      <HrPageHeader title="Hospital Insurance" description="Manage the company medical insurance policy, claims, and transfers." />
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="policy">Policy Configuration</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <InsuranceDashboard />
        </TabsContent>
        <TabsContent value="policy">
          <PolicyConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}
