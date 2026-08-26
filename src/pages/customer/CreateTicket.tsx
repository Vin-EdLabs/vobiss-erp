// src/pages/customer/CreateTicket.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  AlertCircle,
  Send,
  X,
  CheckCircle,
  Upload,
  MapPin,
  Wifi,
} from 'lucide-react';
import CustomerSidebar from '../../components/customer/CustomerSidebar';
import MobileBottomNav from '../../components/customer/MobileBottomNav';
import CustomerHeader from '../../components/customer/CustomerHeader';
import { createCustomerTicket, getCustomerSites, getWorkflowConfig, type CustomerSite } from '../../api';
import { API_URL } from '@/lib/api';
import { DEFAULT_TICKET_SLA, describeSlaForPriority, type TicketSlaConfig } from '@/lib/ticketSla';

interface CustomerProfile {
  id: number;
  name: string;
  customer_code: string;
  project?: { id: number; name: string; code: string };
  sites?: CustomerSite[];
  created_at: string;
}

const CustomerCreateTicket = () => {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    category: 'general',
    priority: 'medium',
    description: '',
  });
  const [ticketSla, setTicketSla] = useState<TicketSlaConfig>(DEFAULT_TICKET_SLA);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [sites, setSites] = useState<CustomerSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
        const profileData = data.customer || data;
        setProfile(profileData);
        const loadedSites = Array.isArray(profileData.sites)
          ? profileData.sites
          : Array.isArray(data.sites)
            ? data.sites
            : await getCustomerSites();
        setSites(loadedSites);
        const requestedSiteId = Number(searchParams.get('site_id'));
        if (requestedSiteId && loadedSites.some((site: CustomerSite) => site.id === requestedSiteId)) {
          setSelectedSiteId(requestedSiteId);
        }
      } catch (err: any) {
        setProfileError(err.message || 'Unable to load account.');
      } finally {
        setLoadingProfile(false);
      }
    };
    loadProfile();
    getWorkflowConfig()
      .then((cfg) => {
        if (cfg?.ticket_sla) setTicketSla(cfg.ticket_sla as TicketSlaConfig);
      })
      .catch(() => {});
  }, [navigate, searchParams]);

  const categories = [
    { value: 'general', label: 'General Inquiry' },
    { value: 'billing', label: 'Billing & Payment' },
    { value: 'technical', label: 'Technical Issue' },
    { value: 'account', label: 'Account Access' },
    { value: 'feature', label: 'Feature Request' },
  ];

  const priorities = [
    { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-700 border-gray-300' },
    { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-700 border-blue-300' },
    { value: 'high', label: 'High', color: 'bg-amber-100 text-amber-700 border-amber-300' },
    { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-700 border-red-300' },
  ];

  if (loadingProfile) return <div className="flex min-h-screen items-center justify-center bg-[var(--content-bg)] text-[var(--text-muted)]">Loading…</div>;

  if (profileError || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--content-bg)] p-4">
        <div className="max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow-md)]">
          <AlertCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
          <h2 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">Access Denied</h2>
          <p className="mb-6 text-[var(--text-muted)]">{profileError || 'Please log in'}</p>
          <button type="button" onClick={() => navigate('/customer/login')} className="rounded-xl bg-[var(--primary)] px-8 py-3 font-medium text-white hover:bg-[var(--primary-hover)]">
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
    if (sites.length > 0 && !selectedSiteId) errors.site_id = 'Please select the affected site';
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
    if (selectedSiteId) payload.append('site_id', String(selectedSiteId));

    attachments.forEach(file => {
      payload.append('attachments', file);
    });

    try {
      const response = await createCustomerTicket(payload, selectedSiteId);
      const { ticket_id } = response;

      setCreatedTicketId(ticket_id);
      setSubmitStatus('success');

      // Reset form
      setFormData({
        title: '',
        category: 'general',
        priority: 'medium',
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
    <div className="flex min-h-screen bg-[var(--content-bg)]">
      <CustomerSidebar />
      <div className="relative flex-1 pb-32 md:ml-64 md:pb-20">
        <CustomerHeader name={customerName} customer_code={customerCode} heightClass="py-4" />

        {/* Success Toast */}
        {submitStatus === 'success' && createdTicketId && (
          <div className="pointer-events-none fixed left-0 right-0 top-20 z-40 flex justify-center px-4">
            <div className="pointer-events-auto w-full max-w-md">
              <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-4 text-[var(--text-primary)] shadow-2xl">
                <div className="flex items-center gap-4">
                  <CheckCircle className="h-8 w-8 shrink-0 text-[var(--primary)]" />
                  <div>
                    <p className="font-semibold">Ticket created</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Ticket ID: <span className="font-mono font-bold">{createdTicketId}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/customer/tickets/${createdTicketId}`)}
                    className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
                  >
                    View Ticket
                  </button>
                  <button type="button" onClick={resetSuccess} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mx-auto max-w-4xl px-4 pt-20 md:px-8">
          <button type="button" onClick={() => navigate(-1)} className="mb-5 flex items-center text-sm font-medium text-[var(--text-muted)] hover:text-[var(--primary)]">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </button>

          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
            <div className="bg-[var(--primary)] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-white/15 p-2">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white">New Ticket</h1>
                  <p className="text-xs text-white/80">{project ? `${project.name} • ${project.code}` : 'Client support request'}</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              {submitStatus === 'error' && (
                <div className="mb-5 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4" />
                  {submitError}
                </div>
              )}

              <form onSubmit={submit} className="space-y-6">
                {sites.length > 0 && (
                  <fieldset>
                    <legend className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Which site is having the issue? *</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {sites.map((site) => {
                        const selected = selectedSiteId === site.id;
                        return (
                          <button
                            key={site.id}
                            type="button"
                            onClick={() => {
                              setSelectedSiteId(site.id);
                              setFormErrors((current) => ({ ...current, site_id: '' }));
                            }}
                            className={`rounded-xl border-2 p-4 text-left transition ${
                              selected
                                ? 'border-[var(--primary)] bg-[var(--accent-green-light)] shadow-sm'
                                : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)]/50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <span className="font-semibold text-[var(--text-primary)]">{site.site_name}</span>
                              {selected && <CheckCircle className="h-5 w-5 shrink-0 text-[var(--primary)]" />}
                            </div>
                            <p className="mt-1 font-mono text-xs text-[var(--primary)]">{site.site_code}</p>
                            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
                              {site.region && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{site.region}</span>}
                              <span className="flex items-center gap-1"><Wifi className="h-3.5 w-3.5" />{site.connection_status || 'Pending'}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {formErrors.site_id && <p className="mt-2 text-xs text-red-600">{formErrors.site_id}</p>}
                  </fieldset>
                )}

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]">Subject *</label>
                  <input
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder="Brief summary of your issue..."
                    className={`w-full rounded-lg border bg-[var(--surface)] px-4 py-2.5 text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 ${
                      formErrors.title ? 'border-red-400' : 'border-[var(--border)]'
                    }`}
                  />
                  {formErrors.title && <p className="text-xs text-red-600 mt-1">{formErrors.title}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]">Category</label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    >
                      {categories.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]">Priority</label>
                    <div className="grid grid-cols-4 gap-2">
                      {priorities.map(p => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => handlePriorityClick(p.value)}
                          className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                            formData.priority === p.value
                              ? `${p.color} shadow-sm ring-2 ring-[var(--primary)]/40 ring-offset-1 ring-offset-[var(--surface)]`
                              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--primary)]/40'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    {describeSlaForPriority(ticketSla, formData.priority) && (
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        SLA: {describeSlaForPriority(ticketSla, formData.priority)}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]">Description *</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={5}
                    placeholder="Please describe your issue in detail..."
                    className={`w-full resize-none rounded-lg border bg-[var(--surface)] px-4 py-3 text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 ${
                      formErrors.description ? 'border-red-400' : 'border-[var(--border)]'
                    }`}
                  />
                  <div className="flex justify-between mt-1">
                    {formErrors.description && <p className="text-xs text-red-600">{formErrors.description}</p>}
                    <span className="ml-auto text-xs text-[var(--text-muted)]">{formData.description.length}/2000</span>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]">
                    Attachments (optional – images only)
                  </label>

                  {previews.length > 0 && (
                    <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                      {previews.map((src, index) => (
                        <div key={index} className="group relative overflow-hidden rounded-lg border border-[var(--border)] shadow-sm">
                          <img
                            src={src}
                            alt={`attachment preview ${index + 1}`}
                            className="h-24 w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeAttachment(index)}
                            className="absolute right-1 top-1 rounded-full bg-red-600 p-1.5 text-white opacity-0 shadow-md transition group-hover:opacity-100"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="flex h-40 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-secondary)] text-center transition hover:border-[var(--primary)] hover:bg-[var(--accent-green-light)]">
                    <Upload className="mb-3 h-10 w-10 text-[var(--text-muted)]" />
                    <span className="text-base font-medium text-[var(--text-primary)]">Click to upload or take photo</span>
                    <span className="mt-2 text-sm text-[var(--text-muted)]">
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
                    className="inline-flex items-center gap-2 px-8 py-3 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-medium rounded-xl transition shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
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