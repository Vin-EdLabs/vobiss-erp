// src/pages/customer/CreateTicket.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  AlertCircle,
  Send,
  X,
  CheckCircle,
  Upload,
} from 'lucide-react';
import CustomerSidebar from '../../components/customer/CustomerSidebar';
import MobileBottomNav from '../../components/customer/MobileBottomNav';
import CustomerHeader from '../../components/customer/CustomerHeader';
import { createCustomerTicket } from '../../api';
import { API_URL } from '@/lib/api';

interface CustomerProfile {
  id: number;
  name: string;
  customer_code: string;
  project: { id: number; name: string; code: string };
  created_at: string;
}

const CustomerCreateTicket = () => {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    category: 'general',
    priority: 'normal',
    description: '',
  });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadProfile = async () => {
      const token = localStorage.getItem('customer_token');
      if (!token) return navigate('/customer/login');
      try {
        const res = await fetch(`${API_URL}/customer/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Profile load failed');
        const data = await res.json();
        setProfile(data.customer || data);
      } catch (err: any) {
        setProfileError(err.message || 'Unable to load account.');
      } finally {
        setLoadingProfile(false);
      }
    };
    loadProfile();
  }, [navigate]);

  const categories = [
    { value: 'general', label: 'General Inquiry' },
    { value: 'billing', label: 'Billing & Payment' },
    { value: 'technical', label: 'Technical Issue' },
    { value: 'account', label: 'Account Access' },
    { value: 'feature', label: 'Feature Request' },
  ];

  const priorities = [
    { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-700 border-gray-300' },
    { value: 'normal', label: 'Normal', color: 'bg-blue-100 text-blue-700 border-blue-300' },
    { value: 'high', label: 'High', color: 'bg-amber-100 text-amber-700 border-amber-300' },
    { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-700 border-red-300' },
  ];

  if (loadingProfile) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-600">Loading...</div>;

  if (profileError || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-sm">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-6">{profileError || 'Please log in'}</p>
          <button onClick={() => navigate('/customer/login')} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-medium hover:bg-blue-700">
            Login
          </button>
        </div>
      </div>
    );
  }

  const { name: customerName, customer_code: customerCode, project } = profile;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handlePriorityClick = (value: string) => {
    setFormData(prev => ({ ...prev, priority: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const newFiles = Array.from(e.target.files);
    const validFiles: File[] = [];
    const newPreviews: string[] = [];

    newFiles.forEach(file => {
      if (!file.type.startsWith('image/')) {
        alert(`File "${file.name}" is not an image. Only images are allowed.`);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert(`File "${file.name}" is too large (max 5MB)`);
        return;
      }
      validFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    });

    if (validFiles.length > 0) {
      setAttachments(prev => [...prev, ...validFiles]);
      setPreviews(prev => [...prev, ...newPreviews]);
    }

    // Reset input so same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!formData.title.trim()) errors.title = 'Subject is required';
    if (!formData.description.trim()) errors.description = 'Description is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError('');

    const payload = new FormData();
    payload.append('title', formData.title.trim());
    payload.append('category', formData.category);
    payload.append('priority', formData.priority);
    payload.append('description', formData.description.trim());

    attachments.forEach(file => {
      payload.append('attachments', file);
    });

    try {
      const response = await createCustomerTicket(payload);
      const { ticket_id } = response;

      setCreatedTicketId(ticket_id);
      setSubmitStatus('success');

      // Reset form
      setFormData({
        title: '',
        category: 'general',
        priority: 'normal',
        description: '',
      });
      setAttachments([]);
      previews.forEach(URL.revokeObjectURL);
      setPreviews([]);

      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to create ticket. Please try again.');
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
      setTimeout(() => {
        setSubmitStatus('idle');
        setCreatedTicketId(null);
      }, 8000);
    }
  };

  const resetSuccess = () => {
    setSubmitStatus('idle');
    setCreatedTicketId(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <CustomerSidebar />
      <div className="flex-1 md:ml-64 relative pb-32 md:pb-20">
        <CustomerHeader name={customerName} customer_code={customerCode} heightClass="py-4" />

        {/* Success Toast */}
        {submitStatus === 'success' && createdTicketId && (
          <div className="fixed top-20 left-0 right-0 z-40 flex justify-center px-4 pointer-events-none">
            <div className="pointer-events-auto max-w-md w-full">
              <div className="bg-white border border-gray-200 text-gray-800 rounded-xl shadow-2xl px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <CheckCircle className="w-8 h-8 text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Ticket Created Successfully!</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Ticket ID: <span className="font-mono font-bold">{createdTicketId}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigate(`/customer/tickets/${createdTicketId}`)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition text-sm"
                  >
                    View Ticket
                  </button>
                  <button onClick={resetSuccess} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="pt-20 px-4 md:px-8 max-w-4xl mx-auto">
          <button onClick={() => navigate(-1)} className="flex items-center text-gray-600 hover:text-blue-600 text-sm font-medium mb-5">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </button>

          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 via-gray-400 to-white px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/30 rounded-lg">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white drop-shadow-md">New Ticket</h1>
                  <p className="text-white/80 text-xs">{project.name} • {project.code}</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              {submitStatus === 'error' && (
                <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5" />
                  {submitError}
                </div>
              )}

              <form onSubmit={submit} className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">Subject *</label>
                  <input
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder="Brief summary of your issue..."
                    className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-500 ${
                      formErrors.title ? 'border-red-400' : 'border-gray-300'
                    }`}
                  />
                  {formErrors.title && <p className="text-xs text-red-600 mt-1">{formErrors.title}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-1.5">Category</label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-500"
                    >
                      {categories.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-1.5">Priority</label>
                    <div className="grid grid-cols-4 gap-2">
                      {priorities.map(p => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => handlePriorityClick(p.value)}
                          className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
                            formData.priority === p.value
                              ? `${p.color} shadow-sm ring-2 ring-offset-1 ring-blue-400`
                              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">Description *</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={5}
                    placeholder="Please describe your issue in detail..."
                    className={`w-full px-4 py-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-300 focus:border-blue-500 ${
                      formErrors.description ? 'border-red-400' : 'border-gray-300'
                    }`}
                  />
                  <div className="flex justify-between mt-1">
                    {formErrors.description && <p className="text-xs text-red-600">{formErrors.description}</p>}
                    <span className="text-xs text-gray-500 ml-auto">{formData.description.length}/2000</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                    Attachments (optional – images only)
                  </label>

                  {previews.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-4">
                      {previews.map((src, index) => (
                        <div key={index} className="relative group rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                          <img
                            src={src}
                            alt={`attachment preview ${index + 1}`}
                            className="w-full h-24 object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeAttachment(index)}
                            className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition shadow-md"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="block w-full h-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition flex flex-col items-center justify-center text-center bg-gray-50">
                    <Upload className="w-10 h-10 text-gray-400 mb-3" />
                    <span className="text-base font-medium text-gray-700">Click to upload or take photo</span>
                    <span className="text-sm text-gray-500 mt-2">
                      Supports JPG, PNG, GIF, etc. • Max 5MB per image
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      capture="environment"  // opens camera (back) on mobile – change to "user" for selfie
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>Creating Ticket...</>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        Submit Ticket
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      <MobileBottomNav />
    </div>
  );
};

export default CustomerCreateTicket;