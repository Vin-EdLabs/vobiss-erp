// src/components/assets/forms/CategoryLocationSection.tsx
import React from 'react';

const categories = ['Laptop', 'Desktop', 'Monitor', 'Printer', 'Router', 'Chair', 'Desk', 'Projector', 'Server', 'Phone', 'Other'];
const locations = ['Main Office', 'Server Room', 'Warehouse A', 'Conference Room', 'IT Department', 'Reception', 'Remote'];

interface Props {
  values: any;
  onChange: (field: string, value: string) => void;
}

export default function CategoryLocationSection({ values, onChange }: Props) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Category & Location</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={values.category || ''}
            onChange={(e) => onChange('category', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
          >
            <option value="">Select category</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Current Location <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={values.location || ''}
            onChange={(e) => onChange('location', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
          >
            <option value="">Select location</option>
            {locations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}