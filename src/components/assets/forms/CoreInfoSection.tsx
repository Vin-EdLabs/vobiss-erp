// src/components/assets/forms/CoreInfoSection.tsx
import React from 'react';

interface Props {
  values: any;
  onChange: (field: string, value: string) => void;
}

export default function CoreInfoSection({ values, onChange }: Props) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
        Core Information
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Required</span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Asset Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={values.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            placeholder="e.g. MacBook Pro 16-inch M3"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Asset Tag / ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={values.tag || ''}
            onChange={(e) => onChange('tag', e.target.value.toUpperCase())}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono"
            placeholder="e.g. AST-00123"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Serial Number</label>
          <input
            type="text"
            value={values.serial_number || ''}
            onChange={(e) => onChange('serial_number', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono"
            placeholder="Leave blank if none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Brand</label>
          <input
            type="text"
            value={values.brand || ''}
            onChange={(e) => onChange('brand', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            placeholder="e.g. Apple, Dell, Cisco"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
          <input
            type="text"
            value={values.model || ''}
            onChange={(e) => onChange('model', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            placeholder="e.g. ProBook 450 G10"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
          <textarea
            rows={3}
            value={values.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none"
            placeholder="Any additional details about this asset..."
          />
        </div>
      </div>
    </div>
  );
}