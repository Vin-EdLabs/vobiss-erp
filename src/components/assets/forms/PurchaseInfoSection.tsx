// src/components/assets/forms/PurchaseInfoSection.tsx
import React from 'react';

interface Props {
  values: any;
  onChange: (field: string, value: string) => void;
}

export default function PurchaseInfoSection({ values, onChange }: Props) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Purchase Information (Optional)</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Purchase Date</label>
          <input
            type="date"
            value={values.purchase_date || ''}
            onChange={(e) => onChange('purchase_date', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Purchase Cost (₱)</label>
          <input
            type="number"
            step="0.01"
            value={values.cost || ''}
            onChange={(e) => onChange('cost', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            placeholder="e.g. 85000.00"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Vendor / Supplier</label>
          <input
            type="text"
            value={values.vendor || ''}
            onChange={(e) => onChange('vendor', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            placeholder="e.g. Silicon Valley, Octagon"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Warranty Until</label>
          <input
            type="date"
            value={values.warranty_until || ''}
            onChange={(e) => onChange('warranty_until', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
          />
        </div>
      </div>
    </div>
  );
}