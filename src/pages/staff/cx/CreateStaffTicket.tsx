// src/pages/staff/CreateStaffTicketPage.tsx (or wherever your create page is)
import React, { useEffect, useState, useMemo } from 'react';
import { cxApi, type TicketEscalationStage } from '../../../api';
import { API_URL } from '@/lib/api';
import { Search, Ticket, Clock, AlertCircle, Plus, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { vobiAmbientStore } from '@/stores/vobiAmbientStore';
import { useVobiFormState } from '@/hooks/useVobiFormState';
import { useVobiSection } from '@/hooks/useVobiSection';

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
  project_name?: string;
  project_code?: string;
}

interface TeamMember {
  id: number;
  fullName: string;
  username: string;
  email: string;
  role: string;
}

interface CreatedTicket {
  ticket_id: string;
  customer_name: string;
  customer_code: string;
  project_name: string;
  project_code: string;
  priority: string;
  status: string;
  created_at: string;
  created_by: string; // Full name of the staff who created it
}

const MANUAL_TICKET_UNITS: TicketEscalationStage[] = [
  { key: 'noc', label: 'NOC', minutes: 0, target_roles: ['noc'] },
  { key: 'ip', label: 'IP', minutes: 0, target_roles: ['ip'] },
  { key: 'tx', label: 'TS', minutes: 0, target_roles: ['tx', 'field_engineer'] },
];

const CreateStaffTicketPage: React.FC = () => {
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [ticketUnits] = useState<TicketEscalationStage[]>(MANUAL_TICKET_UNITS);
  const [myCreatedTickets, setMyCreatedTickets] = useState<CreatedTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);

  const [selectedProject, setSelectedProject] = useState<number | ''>('');
  const [selectedCustomer, setSelectedCustomer] = useState<number | ''>('');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('normal');
  const [description, setDescription] = useState('');
  const [selectedUnit, setSelectedUnit] = useState(MANUAL_TICKET_UNITS[0].key);

  const [projectSearch, setProjectSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    vobiAmbientStore.getState().setFormHint('ticket-create');
  }, []);

  useVobiSection({
    id: 'ticket-create-form',
    title: 'Ticket Create Form',
    help: 'Create a staff ticket by choosing the exact customer, writing a clear title, describing the issue, and routing it to NOC, IP, or TS.',
    priority: 20,
  }, showForm);

  useVobiFormState({
    formKey: 'ticket-create',
    requiredFields: [
      { field: 'selectedCustomer', label: 'Customer' },
      { field: 'title', label: 'Title' },
      { field: 'description', label: 'Description' },
    ],
    currentValues: {
      selectedCustomer,
      title,
      description,
    },
    enabled: showForm,
  });

  // Map for quick lookup: user ID → full name
  const teamMemberMap = new Map<number, string>();
  teamMembers.forEach(m => teamMemberMap.set(m.id, m.fullName));

  const loadData = async () => {
    setLoadingTickets(true);
    try {
      const [projList, membersResponse, allTicketsResponse, custList] = await Promise.all([
        cxApi.getProjects(),
        fetch(`${API_URL}/cx/team-members`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
        cxApi.getAllTickets(),
        cxApi.getCustomers(),
      ]);

      if (!membersResponse.ok) throw new Error('Failed to load team members');
      const membersData = await membersResponse.json();
      const nocMembers = membersData.filter((m: any) =>
        ['noc', 'field_engineer', 'field_engineer_admin'].includes(m.role)
      );
      setTeamMembers(nocMembers);

      // Rebuild map after loading members
      nocMembers.forEach((m: TeamMember) => teamMemberMap.set(m.id, m.fullName));

      let ticketList: any[] = [];
      if (allTicketsResponse?.data) ticketList = allTicketsResponse.data;
      else if (Array.isArray(allTicketsResponse)) ticketList = allTicketsResponse;
      else if (allTicketsResponse?.tickets) ticketList = allTicketsResponse.tickets;

      const staffCreated = ticketList
        .filter((t: any) => t.source === 'staff')
        .map((t: any) => {
          const creatorName = t.created_by && teamMemberMap.has(t.created_by)
            ? teamMemberMap.get(t.created_by)!
            : 'Staff Member';

          return {
            ticket_id: t.ticket_id || t.id || 'N/A',
            customer_name: t.customer_name || t.customer?.name || 'Unknown',
            customer_code: t.customer_code || 'N/A',
            project_name: t.project_name || t.project?.name || 'General',
            project_code: t.project_code || 'N/A',
            priority: t.priority || 'normal',
            status: t.status || 'NEW',
            created_at: t.created_at,
            created_by: creatorName,
          };
        });

      setProjects(projList);
      setCustomers(custList);
      setSelectedUnit((current) => MANUAL_TICKET_UNITS.some((unit) => unit.key === current) ? current : MANUAL_TICKET_UNITS[0].key);
      setMyCreatedTickets(staffCreated);
    } catch (err: any) {
      console.error('Load data error:', err);
      setMessage({ type: 'error', text: 'Failed to load data. Please refresh the page.' });
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter(p =>
      p.project_code.toLowerCase().includes(projectSearch.toLowerCase()) ||
      p.project_name.toLowerCase().includes(projectSearch.toLowerCase())
    );
  }, [projects, projectSearch]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c =>
      (!selectedProject || c.project_id === selectedProject) &&
      (
        c.customer_code.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.customer_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.project_name || '').toLowerCase().includes(customerSearch.toLowerCase())
      )
    );
  }, [customers, customerSearch, selectedProject]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missingFields = [
      !selectedCustomer
        ? { field: 'selectedCustomer', label: 'Customer', message: 'Select the customer this ticket is for.' }
        : null,
      !title.trim()
        ? { field: 'title', label: 'Title', message: 'Enter a short title that summarizes the issue.' }
        : null,
      !description.trim()
        ? { field: 'description', label: 'Description', message: 'Describe the issue before creating the ticket.' }
        : null,
    ].filter(Boolean);

    if (missingFields.length > 0) {
      vobiAmbientStore.getState().setExactIssue({
        title: `${missingFields.length} required field${missingFields.length === 1 ? '' : 's'} missing`,
        body: 'Vobi checked this ticket and found only the fields below are missing.',
        formKey: 'ticket-create',
        fieldErrors: missingFields,
        action: 'Show me',
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const newTicket = await cxApi.createTicket({
        customer_id: selectedCustomer as number,
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        route_to_unit: selectedUnit,
      });

      const ticketId = newTicket.ticket?.ticket_id || newTicket.ticket_id || 'N/A';
      const customerInfo = customers.find(c => c.id === selectedCustomer);
      const projectInfo = projects.find(p => p.id === customerInfo?.project_id || p.id === selectedProject);

      // Assume current logged-in user (you can get this from auth context later)
      const currentUserName = teamMembers.find(m => m.email === localStorage.getItem('userEmail'))?.fullName || 'You';

      const newEntry: CreatedTicket = {
        ticket_id: ticketId,
        customer_name: customerInfo?.customer_name || 'Unknown',
        customer_code: customerInfo?.customer_code || 'N/A',
        project_name: projectInfo?.project_name || 'N/A',
        project_code: projectInfo?.project_code || 'N/A',
        priority,
        status: 'NEW',
        created_at: new Date().toISOString(),
        created_by: currentUserName,
      };

      setMyCreatedTickets(prev => [newEntry, ...prev]);

      setMessage({ type: 'success', text: `Ticket #${ticketId} created successfully!` });

      // Reset form
      setTitle('');
      setDescription('');
      setCategory('general');
      setPriority('normal');
      setSelectedProject('');
      setSelectedCustomer('');
      setCustomerSearch('');
      setProjectSearch('');
      setShowForm(false);

      setTimeout(() => setMessage(null), 8000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to create ticket.' });
      console.error('Create ticket error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (p: string) => {
    const pu = p.toLowerCase();
    if (pu === 'critical' || pu === 'urgent') return 'bg-red-100 text-red-800';
    if (pu === 'high') return 'bg-orange-100 text-orange-800';
    if (pu === 'normal' || pu === 'medium') return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = (s: string) => {
    const su = s.toUpperCase();
    if (su === 'NEW') return 'bg-blue-100 text-blue-800';
    if (su === 'OPEN' || su === 'IN_PROGRESS') return 'bg-yellow-100 text-yellow-800';
    if (su === 'RESOLVED') return 'bg-green-100 text-green-800';
    if (su === 'CLOSED') return 'bg-gray-100 text-gray-800';
    return 'bg-slate-100 text-slate-700';
  };

  const handleRowClick = (ticketId: string) => {
    navigate(`/staff/cx/tickets`);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
            <Ticket className="w-8 h-8 text-blue-600" />
            Staff-Created Tickets ({myCreatedTickets.length})
          </h1>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={loadingTickets}
              className="p-2.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
              title="Refresh tickets"
            >
              <RefreshCw className={`w-5 h-5 text-gray-600 ${loadingTickets ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-5 rounded-lg transition flex items-center gap-2 shadow-md"
            >
              <Plus className="w-5 h-5" />
              {showForm ? 'Cancel' : 'Create Ticket'}
            </button>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`rounded-lg px-5 py-3 mb-6 text-sm font-medium border ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border-green-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Full Quick Guide */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8 text-sm text-blue-900">
          <p className="font-semibold text-base mb-3">Quick Guide:</p>
          <p className="mb-4">
            Click the Create Ticket button → select a customer → choose the receiving unit → fill details → submit. Project is optional context and is filled from the customer.
          </p>

          <p className="font-semibold text-base mb-2">Detailed Steps:</p>
          <ol className="list-decimal list-inside space-y-2 ml-4">
            <li>Choose a customer first. Use project only as an optional filter.</li>
            <li>Write a clear title and detailed description.</li>
            <li>Set category, priority, and route the ticket to a unit.</li>
            <li>Click "Create Ticket" to submit.</li>
          </ol>

          <p className="mt-4 text-blue-800">
            Customers will see the ticket in their portal and receive email updates (if enabled).
          </p>
        </div>

        {/* Create Form (same as before) */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-10">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6" noValidate>
              {/* Customer Select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Customer *</label>
                <div className="relative">
                  <input
                    data-vobi-field="customerSearch"
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search customers..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                </div>
                <select
                  data-vobi-field="selectedCustomer"
                  value={selectedCustomer}
                  onChange={(e) => {
                    const val = Number(e.target.value) || '';
                    setSelectedCustomer(val);
                    const customer = customers.find(c => c.id === val);
                    setSelectedProject(customer?.project_id || '');
                  }}
                  className="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  required
                >
                  <option value="">Select customer</option>
                  {filteredCustomers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.customer_code} — {c.customer_name}{c.project_name ? ` (${c.project_code} — ${c.project_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional Project Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Project (Optional Filter)</label>
                <div className="relative">
                  <input
                    data-vobi-field="projectSearch"
                    type="text"
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder="Search projects..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                </div>
                <select
                  data-vobi-field="selectedProject"
                  value={selectedProject}
                  onChange={(e) => {
                    const val = Number(e.target.value) || '';
                    setSelectedProject(val);
                    setSelectedCustomer('');
                    setProjectSearch('');
                  }}
                  className="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">All projects</option>
                  {filteredProjects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.project_code} — {p.project_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title, Category, Priority, Assign To, Description... (unchanged) */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Title *</label>
                <input
                  data-vobi-field="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Brief summary of the issue"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                <select data-vobi-field="category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="general">General</option>
                  <option value="connectivity">Connectivity</option>
                  <option value="hardware">Hardware</option>
                  <option value="billing">Billing</option>
                  <option value="outage">Outage</option>
                  <option value="configuration">Configuration</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
                <select data-vobi-field="priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Route To Unit</label>
                <select data-vobi-field="selectedUnit" value={selectedUnit} onChange={(e) => setSelectedUnit(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm">
                  {ticketUnits.map(unit => (
                    <option key={unit.key} value={unit.key}>
                      {unit.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Tickets start unassigned in the selected unit queue until that unit claims or assigns an owner.</p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description *</label>
                <textarea
                  data-vobi-field="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  placeholder="Describe the issue in detail..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                  required
                />
              </div>

              <div className="md:col-span-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 px-8 rounded-lg text-sm flex items-center gap-2"
                >
                  {loading ? 'Creating...' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tickets Table - Updated Columns */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-600" />
              Staff-Created Tickets
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created By</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loadingTickets ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">Loading tickets...</td>
                  </tr>
                ) : myCreatedTickets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">
                      No staff-created tickets yet. Click "Create Ticket" to begin.
                    </td>
                  </tr>
                ) : (
                  myCreatedTickets.map((ticket) => (
                    <tr
                      key={ticket.ticket_id}
                      onClick={() => handleRowClick(ticket.ticket_id)}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">#{ticket.ticket_id}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{ticket.customer_code} — {ticket.customer_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{ticket.project_code} — {ticket.project_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-700 font-medium">{ticket.created_by}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 inline-flex text-xs font-semibold rounded-full ${getPriorityColor(ticket.priority)}`}>
                          {ticket.priority.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 inline-flex text-xs font-semibold rounded-full ${getStatusColor(ticket.status)}`}>
                          {ticket.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(ticket.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Note */}
        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 flex gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>These tickets are stored in the database and visible to customers and all staff.</p>
        </div>
      </div>
    </div>
  );
};

export default CreateStaffTicketPage;