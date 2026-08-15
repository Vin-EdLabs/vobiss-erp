// src/pages/assets/new.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check, Save, Loader2 } from 'lucide-react';
import { assetApi } from '../../api';
import { vobiAmbientStore } from '@/stores/vobiAmbientStore';

const steps = [
  { id: 1, name: 'Core Information' },
  { id: 2, name: 'Category & Location' },
  { id: 3, name: 'Purchase Details' },
  { id: 4, name: 'Status & Assignment' },
  { id: 5, name: 'Photos' },
];

const STORAGE_KEY = 'vobiss-asset-draft';

export default function NewAssetPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  // Dynamic data
  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: '', serial_number: '', brand: '', model: '', description: '',
    category_id: '' as string | number, location_id: '' as string | number, purchase_date: '', cost: '', vendor_id: '', warranty_until: '',
    status: 'available', assigned_to_id: '' as string | number
  });

  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string>('');

  useEffect(() => {
    vobiAmbientStore.getState().setFormHint('asset-create');
  }, []);

  // Load draft from localStorage (optional) + dynamic data from API
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        if (draft.formData) setFormData((prev) => ({ ...prev, ...draft.formData }));
        if (draft.photos) setPhotos(draft.photos);
        if (typeof draft.currentStep === 'number') setCurrentStep(draft.currentStep);
      } catch (_) {}
    }
    Promise.all([assetApi.getCategories(), assetApi.getLocations(), assetApi.getVendors(), assetApi.getPeople()])
      .then(([cats, locs, vends, peopleList]) => {
        setCategories(cats || []);
        setLocations(locs || []);
        setVendors(vends || []);
        setPeople(peopleList || []);
      })
      .catch(console.error);
  }, []);

  // Auto-save
  useEffect(() => {
    const timer = setTimeout(() => {
      const draft = { formData, photos, currentStep, savedAt: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      setLastSaved(new Date().toLocaleTimeString());
      setSaving(false);
    }, 800);
    setSaving(true);
    return () => clearTimeout(timer);
  }, [formData, photos, currentStep]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const [nextTag, setNextTag] = useState('AST-000001');
  useEffect(() => {
    assetApi.getNextTag().then(setNextTag).catch(() => {});
  }, []);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPhotos(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await assetApi.createAsset({
        name: formData.name,
        serial_number: formData.serial_number || null,
        brand: formData.brand || null,
        model: formData.model || null,
        description: formData.description || null,
        category_id: formData.category_id ? Number(formData.category_id) : null,
        location_id: formData.location_id ? Number(formData.location_id) : null,
        purchase_date: formData.purchase_date || null,
        cost: formData.cost ? formData.cost : null,
        vendor_id: formData.vendor_id ? Number(formData.vendor_id) : null,
        warranty_until: formData.warranty_until || null,
        status: formData.status,
        assigned_to_id: formData.assigned_to_id ? Number(formData.assigned_to_id) : null,
        photos,
      });
      localStorage.removeItem(STORAGE_KEY);
      navigate('/assets');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Add New Asset</h1>
          <div className="flex items-center justify-center gap-3 mt-3 text-gray-600">
            <span>Step {currentStep + 1} of {steps.length} — {steps[currentStep].name}</span>
            {saving ? (
              <span className="flex items-center gap-1 text-yellow-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Saving...
              </span>
            ) : lastSaved ? (
              <span className="flex items-center gap-1 text-green-600">
                <Save className="h-4 w-4" /> Saved at {lastSaved}
              </span>
            ) : null}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-lg transition-all shadow-md ${
                  idx < currentStep ? 'bg-green-500 text-white' :
                  idx === currentStep ? 'bg-blue-600 text-white ring-4 ring-blue-200' :
                  'bg-gray-200 text-gray-500'
                }`}>
                  {idx < currentStep ? <Check className="h-6 w-6" /> : step.id}
                </div>
                {idx < steps.length - 1 && (
                  <div className={`flex-1 h-3 mx-4 rounded-full transition-all ${
                    idx < currentStep ? 'bg-green-500' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-700 ease-out rounded-full shadow-lg"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-10">
          {/* Step 1: Core Info */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Asset Name *</label>
                <input required placeholder="e.g. Office Laptop" value={formData.name} onChange={e => handleChange('name', e.target.value)} className="w-full px-5 py-4 border rounded-xl text-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea placeholder="Add notes or specifications" value={formData.description} onChange={e => handleChange('description', e.target.value)} rows={3} className="w-full px-5 py-4 border rounded-xl resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                  <input placeholder="Serial or SN" value={formData.serial_number} onChange={e => handleChange('serial_number', e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg w-full text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tag</label>
                  <div className="bg-gray-100 px-5 py-4 rounded-xl font-mono font-bold text-gray-700">
                    {nextTag}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Brand</label>
                  <input placeholder="Brand (optional)" value={formData.brand} onChange={e => handleChange('brand', e.target.value)} className="px-5 py-4 border rounded-xl w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
                  <input placeholder="Model (optional)" value={formData.model} onChange={e => handleChange('model', e.target.value)} className="px-5 py-4 border rounded-xl w-full" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea placeholder="Add notes or specifications" value={formData.description} onChange={e => handleChange('description', e.target.value)} rows={3} className="w-full px-5 py-4 border rounded-xl resize-none" />
              </div>
            </div>
          )}

          {/* Step 2: Category & Location – DYNAMIC */}
          {currentStep === 1 && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category *</label>
                <select required value={formData.category_id} onChange={e => handleChange('category_id', e.target.value)} className="w-full px-5 py-4 border rounded-xl">
                  <option value="">Select category...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Location *</label>
                <select required value={formData.location_id} onChange={e => handleChange('location_id', e.target.value)} className="w-full px-5 py-4 border rounded-xl">
                  <option value="">Select location...</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 3: Purchase Details */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Purchase Date</label>
                  <input type="date" value={formData.purchase_date} onChange={e => handleChange('purchase_date', e.target.value)} className="px-5 py-4 border rounded-xl w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cost (₱)</label>
                  <input placeholder="0.00" value={formData.cost} onChange={e => handleChange('cost', e.target.value)} className="px-5 py-4 border rounded-xl w-full" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Vendor</label>
                <select value={formData.vendor_id} onChange={e => handleChange('vendor_id', e.target.value)} className="w-full px-5 py-4 border rounded-xl">
                  <option value="">No vendor</option>
                  {vendors.map(vendor => (
                    <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Warranty Until</label>
                <input type="date" value={formData.warranty_until} onChange={e => handleChange('warranty_until', e.target.value)} className="px-5 py-4 border rounded-xl w-full" />
              </div>
            </div>
          )}

          {/* Step 4: Status & Assignment */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select value={formData.status} onChange={e => handleChange('status', e.target.value)} className="w-full px-5 py-4 border rounded-xl text-lg">
                  <option value="available">Available</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_repair">In Repair</option>
                  <option value="damaged">Damaged</option>
                  <option value="lost">Lost</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Assigned To</label>
                <select value={formData.assigned_to_id} onChange={e => handleChange('assigned_to_id', e.target.value)} className="w-full px-5 py-4 border rounded-xl">
                  <option value="">Not assigned</option>
                  {people.map((person: { id: number; first_name: string; last_name: string; job_title?: string }) => (
                    <option key={person.id} value={person.id}>
                      {person.first_name} {person.last_name} ({person.job_title || 'No title'})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 5: Photos */}
          {currentStep === 4 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Photos</label>
              <input type="file" multiple accept="image/*" onChange={handlePhoto} className="w-full p-10 border-2 border-dashed border-gray-300 rounded-xl text-center cursor-pointer hover:border-gray-400 transition" />
              <div className="grid grid-cols-4 gap-4 mt-6">
                {photos.map((src, i) => (
                  <div key={i} className="relative group">
                    <img src={src} alt="" className="w-full h-32 object-cover rounded-lg shadow" />
                    <button onClick={() => removePhoto(i)} className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center mt-10">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            className="flex items-center gap-3 px-8 py-4 rounded-xl font-medium bg-white border-2 border-gray-300 hover:shadow-lg transition"
          >
            <ChevronLeft className="h-6 w-6" /> Back
          </button>

          <div className="flex gap-4">
            <button
              onClick={() => {
                if (confirm('Discard this draft?')) {
                  localStorage.removeItem(STORAGE_KEY);
                  navigate('/assets');
                }
              }}
              className="px-6 py-4 text-red-600 hover:bg-red-50 rounded-xl font-medium transition"
            >
              Discard Draft
            </button>

            {currentStep === steps.length - 1 ? (
              <button
                onClick={handleSubmit}
                disabled={loading || !formData.name || !formData.category_id || !formData.location_id}
                className="flex items-center gap-3 px-10 py-4 rounded-xl font-bold text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-xl disabled:opacity-70 transition"
              >
                {loading ? 'Saving...' : 'Complete & Save Asset'}
                <Check className="h-6 w-6" />
              </button>
            ) : (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={(currentStep === 0 && !formData.name) || (currentStep === 1 && (!formData.category_id || !formData.location_id))}
                className="flex items-center gap-3 px-10 py-4 rounded-xl font-bold text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-xl disabled:opacity-70 transition"
              >
                Next Step
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>

        <p className="text-center mt-6 text-sm text-gray-500">
          Your progress is automatically saved. You can close this page and come back anytime!
        </p>
      </div>
    </div>
  );
}