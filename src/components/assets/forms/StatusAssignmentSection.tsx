// src/components/assets/forms/StatusAssignmentSection.tsx
import React from 'react';

const statuses = [
  { value: 'available', label: 'Available', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'assigned', label: 'Assigned', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'in_repair', label: 'In Repair', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'damaged', label: 'Damaged', color: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'lost', label: 'Lost', color: 'bg-gray-100 text-gray-800 border-gray-300' },
  { value: 'retired', label: 'Retired', color: 'bg-purple-100 text-purple-800 border-purple-300' },
];

interface Props {
  values: any;
  onChange: (field: string, value: string) => void;
}

export default function StatusAssignmentSection({ values, onChange }: Props) {
  const currentStatus = values.status || 'available';

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Status & Assignment</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Status Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-4">
            Current Status <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {statuses.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => onChange('status', s.value)}
                className={`py-4 px-6 rounded-xl border-2 font-medium transition-all ${
                  currentStatus === s.value
                    ? `${s.color} border-opacity-100 shadow-md ring-2 ring-offset-2 ring-blue-500`
                    : 'border-gray-300 bg-white hover:border-gray-400 hover:shadow-sm'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Assigned To */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Assigned To (Optional)
          </label>
          <input
            type="text"
            value={values.assigned_to || ''}
            onChange={(e) => onChange('assigned_to', e.target.value)}
            placeholder="e.g. John Doe, IT Department, Marketing Team"
            className="w-full px-5 py-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition text-lg"
          />
          <p className="text-xs text-gray-500 mt-2">
            Leave blank if not assigned yet
          </p>
        </div>
      </div>
    </div>
  );
}