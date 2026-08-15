// src/pages/assets/ComingSoon.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Wrench } from 'lucide-react';

export default function ComingSoon() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Wrench className="h-12 w-12 text-blue-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Coming Soon</h1>
        <p className="text-lg text-gray-600 mb-8">This feature is under development</p>
        <Link
          to="/assets"
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
        >
          ← Back to Assets
        </Link>
      </div>
    </div>
  );
}