// src/pages/assets/assignments/new.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { assetApi } from '../../../api';

export default function NewPersonPage() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    assetApi.getLocations().then((data) => setLocations(data || [])).catch(console.error);
  }, []);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    location: '',
    group: '',
    job_title: '',
    email: '',
    phone: '',
    personnel_number: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await assetApi.createPerson({
        first_name: formData.first_name,
        last_name: formData.last_name,
        location: formData.location || undefined,
        group: formData.group || undefined,
        job_title: formData.job_title || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        personnel_number: formData.personnel_number || undefined,
      });
      navigate('/assets/assignments');
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-4">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Add New Person</h1>
          <button onClick={() => navigate('/assets/assignments')} className="text-gray-600 hover:text-gray-900">
            ← Back
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-[var(--shadow-md)] border border-gray-200 p-6 space-y-4">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl p-4 text-center">
            <p className="text-sm opacity-90">Personnel Number (optional)</p>
            <input name="personnel_number" value={formData.personnel_number} onChange={handleChange} placeholder="e.g. PSN000001" className="mt-2 w-full max-w-xs mx-auto px-3 py-2 rounded font-mono text-gray-900 text-center" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">First Name *</label>
              <input required name="first_name" value={formData.first_name} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200" placeholder="Juan" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Last Name *</label>
              <input required name="last_name" value={formData.last_name} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200" placeholder="Dela Cruz" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Location *</label>
              <select name="location" value={formData.location} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">Select location...</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.name}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Department / Group *</label>
              <input required name="group" value={formData.group} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" placeholder="IT Department" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Job Title *</label>
            <input required name="job_title" value={formData.job_title} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" placeholder="System Administrator" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" placeholder="juan@company.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
              <input name="phone" value={formData.phone} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" placeholder="+63 912 345 6789" />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => navigate('/assets/assignments')} className="px-6 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-sm transition">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-8 py-2 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-lg hover:from-blue-700 hover:to-indigo-800 font-bold text-sm shadow-lg transition disabled:opacity-70">
              {saving ? 'Saving...' : 'Save Person'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}