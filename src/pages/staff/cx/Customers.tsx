// src/pages/cx/CustomersPage.tsx
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCXProjects, getCXCustomers, createCXCustomer } from '../../../api';
import { API_URL } from '@/lib/api';

interface Project {
  id: number;
  project_name: string;
  project_code: string;
}

interface Customer {
  id: number;
  customer_name: string;
  customer_code: string;
  contact_email: string | null;
  contact_phone: string | null;
  project_id: number;
  project_name: string;
  project_code: string;
  created_at: string;
  pin?: string;
}

const CustomersPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | ''>('');
  const [customerName, setCustomerName] = useState('');
  const [location, setLocation] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const projList = await getCXProjects();
        setProjects(projList);

        const custPromises = projList.map((project) =>
          getCXCustomers(project.id).then((customers) =>
            customers.map((c) => ({
              ...c,
              project_name: project.project_name,
              project_code: project.project_code,
            }))
          )
        );

        const allArrays = await Promise.all(custPromises);
        const merged = allArrays.flat();
        setAllCustomers(merged);
        setFilteredCustomers(merged);
      } catch (err) {
        setMessage({ type: 'error', text: 'Failed to load projects or customers.' });
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    if (selectedProject === '') {
      setFilteredCustomers(allCustomers);
    } else {
      setFilteredCustomers(allCustomers.filter((c) => c.project_id === selectedProject));
    }
  }, [selectedProject, allCustomers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !email.trim() || !phone.trim() || !location.trim()) return;

    setLoading(true);
    setMessage(null);

    try {
      const newCustomer = await createCXCustomer({
        organization_name: customerName.trim(),
        contact_email: email.trim(),
        contact_phone: phone.trim(),
        location: location.trim(),
        project_id: selectedProject === '' ? null : (selectedProject as number),
      });

      const project =
        selectedProject !== ''
          ? projects.find((p) => p.id === selectedProject)
          : null;

      const fullCustomer: Customer = {
        ...newCustomer,
        project_id: newCustomer.project_id ?? (selectedProject as number) ?? 0,
        project_name: project?.project_name ?? newCustomer.project_name ?? 'General',
        project_code: project?.project_code ?? newCustomer.project_code ?? '—',
        pin: newCustomer.pin,
      };

      const updatedAll = [...allCustomers, fullCustomer];
      setAllCustomers(updatedAll);

      if (selectedProject === '') {
        setFilteredCustomers(updatedAll);
      } else {
        setFilteredCustomers([...filteredCustomers, fullCustomer]);
      }

      setMessage({
        type: 'success',
        text: newCustomer.pin
          ? `Customer created! PIN: ${newCustomer.pin} — Copy & share securely now!`
          : 'Customer created (PIN generation failed)',
      });

      setCustomerName('');
      setLocation('');
      setEmail('');
      setPhone('');
      setSelectedProject('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to create customer.' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPin = async () => {
    if (!selectedCustomer) return;
    if (!window.confirm('Generate new PIN? The old one will be invalidated.')) return;

    setResetLoading(true);
    try {
      const token = localStorage.getItem('token') || ''; // Adjust based on your auth setup

      const response = await fetch(`${API_URL}/cx/customers/${selectedCustomer.id}/reset-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to reset PIN');
      }

      const data = await response.json();
      if (data.pin) {
        // Update the displayed customer with new PIN
        setSelectedCustomer({
          ...selectedCustomer,
          pin: data.pin,
        });

        setMessage({
          type: 'success',
          text: `New PIN generated: ${data.pin} — Copy & share securely now!`,
        });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to reset PIN.' });
    } finally {
      setResetLoading(false);
    }
  };

  const openDetailsModal = (customer: Customer) => setSelectedCustomer(customer);
  const closeModal = () => {
    setSelectedCustomer(null);
    setMessage(null); // Clear any reset message when closing
  };

  const selectedProjectName = selectedProject
    ? projects.find((p) => p.id === selectedProject)?.project_name ?? ''
    : '';

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Customer Organization</h1>
        <p className="text-gray-600 mb-8">Register customer orgs (sites) for ticketing and portal access</p>

        {message && (
          <div
            className={`mb-8 p-4 rounded-xl border shadow-sm flex items-center justify-between ${
              message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <span className="font-medium">{message.text}</span>
            {message.type === 'success' && message.text.includes('PIN:') && (
              <button
                onClick={() => {
                  const match = message.text.match(/PIN: (\d{5})/);
                  if (match?.[1]) navigator.clipboard.writeText(match[1]);
                }}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition"
              >
                Copy PIN
              </button>
            )}
          </div>
        )}

        {/* Add Customer Form */}
        <div className="bg-white rounded-2xl shadow border border-gray-200 p-6 lg:p-8 mb-12 shadow-[var(--shadow-md)]">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">New Customer Organization</h2>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Organization Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Kwesi Acquah"
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-4"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Location <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, region, or site address"
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-4"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Project assignment <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value ? Number(e.target.value) : '')}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-4"
              >
                <option value="">No project — default org pool</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_code} — {p.project_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@organization.com"
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-4"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+233 24 123 4567"
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-4"
                required
              />
            </div>            <div className="md:col-span-2 flex justify-end mt-4">
              <button
                type="submit"
                disabled={loading || !customerName.trim() || !email.trim() || !phone.trim() || !location.trim()}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow transition disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Organization'}
              </button>
            </div>
          </form>
        </div>

        {/* Customers Table */}
        <div className="bg-white rounded-2xl shadow border border-gray-200 overflow-hidden shadow-[var(--shadow-md)]">
          <div className="px-6 py-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Customers {selectedProjectName && <span className="text-gray-600">— {selectedProjectName}</span>}
            </h2>
            <div className="text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
              {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? 's' : ''}
            </div>
          </div>

          {filteredCustomers.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              {selectedProject ? 'No customers in this project.' : 'No customers yet. Add one above.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Login ID</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Project</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCustomers.map((cust) => (
                    <tr key={cust.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-mono font-medium text-gray-900">{cust.customer_code}</td>
                      <td className="px-6 py-4 font-medium text-gray-900">{cust.customer_name}</td>
                      <td className="px-6 py-4">
                        <div className="font-mono text-blue-600 text-sm">{cust.project_code}</div>
                        <div className="text-sm text-gray-500">{cust.project_name}</div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {cust.contact_email || cust.contact_phone ? (
                          <>
                            {cust.contact_email && <div>{cust.contact_email}</div>}
                            {cust.contact_phone && <div>{cust.contact_phone}</div>}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(cust.created_at).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => openDetailsModal(cust)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Customer Details Modal */}
        {selectedCustomer &&
          createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={closeModal}>
              <div
                className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full relative"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="absolute top-4 right-6 text-3xl text-gray-500 hover:text-gray-800"
                  onClick={closeModal}
                >
                  ×
                </button>

                <h3 className="text-2xl font-bold mb-6">Customer Details</h3>

                <div className="grid md:grid-cols-2 gap-8 mb-10">
                  <div className="space-y-5">
                    <div>
                      <div className="text-sm font-semibold text-gray-600">Login ID</div>
                      <div className="font-mono bg-gray-100 px-4 py-2.5 rounded mt-1 text-lg">
                        {selectedCustomer.customer_code}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-600">Name</div>
                      <div className="text-lg mt-1">{selectedCustomer.customer_name}</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-600">Project</div>
                      <div className="text-lg mt-1">
                        <span className="font-mono text-blue-600">{selectedCustomer.project_code}</span> —{' '}
                        {selectedCustomer.project_name}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <div className="text-sm font-semibold text-gray-600">Contact</div>
                      <div className="mt-1 text-lg">
                        {selectedCustomer.contact_email ? (
                          selectedCustomer.contact_email
                        ) : (
                          <span className="text-gray-400">No email</span>
                        )}
                        {selectedCustomer.contact_phone && <div>{selectedCustomer.contact_phone}</div>}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-600">Created</div>
                      <div className="text-lg mt-1">
                        {new Date(selectedCustomer.created_at).toLocaleString('en-GB', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* PIN Section */}
                <div className="pt-8 border-t border-gray-200">
                  <div className="text-sm font-semibold text-gray-600 mb-3">Current PIN</div>

                  {selectedCustomer.pin ? (
                    <div className="font-mono text-5xl font-bold tracking-widest text-red-600 bg-red-50 px-8 py-5 rounded-xl inline-block border border-red-200 shadow-inner">
                      {selectedCustomer.pin}
                    </div>
                  ) : (
                    <div className="text-lg text-amber-700 bg-amber-50 p-4 rounded-lg">
                      PIN is only shown once — right after creation or reset
                      <p className="text-sm mt-2 text-amber-800">
                        • If lost: use "Reset PIN" button below<br/>
                        • For security, PINs are never stored or retrievable later
                      </p>
                    </div>
                  )}

                  {selectedCustomer.pin && (
                    <p className="mt-4 text-sm text-gray-600">
                      Share this securely with the customer (one-time use recommended)
                    </p>
                  )}

                  {/* Reset PIN Button */}
                  <div className="mt-6">
                    <button
                      onClick={handleResetPin}
                      disabled={resetLoading}
                      className={`px-5 py-2.5 font-medium rounded-lg transition ${
                        resetLoading
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-amber-600 hover:bg-amber-700 text-white'
                      }`}
                    >
                      {resetLoading ? 'Resetting...' : 'Reset & Generate New PIN'}
                    </button>
                    <p className="mt-2 text-xs text-gray-500">
                      This will invalidate the current PIN and generate a new one
                    </p>
                  </div>
                </div>

                <div className="mt-10 flex justify-end">
                  <button
                    onClick={closeModal}
                    className="px-8 py-3 bg-gray-800 hover:bg-gray-900 text-white rounded-xl transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* Help Box */}
        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-2xl p-6 text-blue-800">
          <h3 className="font-semibold flex items-center mb-3">
            <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Customer Login Information
          </h3>
          <ul className="space-y-2 text-sm">
            <li>• Login with <strong>Login ID</strong> + <strong>5-digit PIN</strong></li>
            <li>• PIN is shown **only once** after creation or reset</li>
            <li>• Login page: <code className="bg-blue-100 px-1.5 py-0.5 rounded">/customer/login</code></li>
            <li>• Share PINs securely — never via email or chat</li>
            <li>• If PIN is lost: use "Reset PIN" in customer details</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CustomersPage;
