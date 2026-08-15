// src/pages/assets/vendors/new.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { assetApi } from '../../../api';

export default function NewVendorPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    type: 'supplier',
    services: '',
    website: '',
    notes: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await assetApi.createVendor(formData);
      navigate('/assets/vendors');
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex items-center justify-between mb-10">
          <h1 className="text-3xl font-bold text-gray-900">Add New Vendor</h1>
          <button onClick={() => navigate('/assets/vendors')} className="text-gray-600 hover:text-gray-900 text-lg">
            ← Back
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 space-y-10">
          {/* Company Info */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Company Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Company Name *</label>
                <input required name="name" value={formData.name} onChange={handleChange} placeholder="TechPro Solutions" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Vendor Type *</label>
                <select name="type" value={formData.type} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="supplier">Supplier</option>
                  <option value="repair_technician">Repair Technician</option>
                  <option value="service_provider">Service Provider</option>
                  <option value="manufacturer">Manufacturer</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
              <input name="address" value={formData.address} onChange={handleChange} placeholder="123 Business Park, Makati City" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Website</label>
              <input name="website" value={formData.website} onChange={handleChange} placeholder="https://techpro.com" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-6 pt-8 border-t border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Contact Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Contact Person</label>
                <input name="contact_person" value={formData.contact_person} onChange={handleChange} placeholder="Maria Santos" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
                <input required name="phone" value={formData.phone} onChange={handleChange} placeholder="+63 912 345 6789" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                <input required type="email" name="email" value={formData.email} onChange={handleChange} placeholder="contact@techpro.com" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* Services & Notes */}
          <div className="space-y-6 pt-8 border-t border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Services & Notes</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Services Provided</label>
              <textarea name="services" rows={4} value={formData.services} onChange={handleChange} placeholder="Laptop repair, networking, CCTV installation..." className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label>
              <textarea name="notes" rows={4} value={formData.notes} onChange={handleChange} placeholder="Payment terms, warranty policy..." className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-4 pt-8 border-t border-gray-200">
            <button type="button" onClick={() => navigate('/assets/vendors')} className="px-8 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-10 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-lg hover:from-blue-700 hover:to-indigo-800 font-bold shadow-md transition disabled:opacity-70">
              {saving ? 'Creating...' : 'Create Vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}