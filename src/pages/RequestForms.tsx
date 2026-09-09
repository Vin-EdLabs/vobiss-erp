// src/pages/RequestForms.tsx
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, Clock, CheckCircle, XCircle, Users } from 'lucide-react';
import { getRequests, getItems, createRequest, getApprovers, cxApi, getWorkflowConfig } from '../api';
import { ReferenceLinkPicker } from '@/components/references/ReferenceLinkPicker';
import type { ReferenceSummary } from '@/lib/referenceRegistry';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userHasAnyRole } from '../config/roles';
import { vobiAmbientStore } from '@/stores/vobiAmbientStore';
import { useVobiFormState } from '@/hooks/useVobiFormState';
import { useVobiSection } from '@/hooks/useVobiSection';
import { searchSitesForPicker } from '@/api/fieldWork';
import type { LookupRow } from '@/api/ipUnit';

interface Request {
  id: number;
  created_by: string;
  team_leader_name: string;
  team_leader_phone: string;
  project_name: string;
  isp_name: string;
  location: string;
  deployment_type: 'Deployment' | 'Maintenance';
  release_by: string | null;
  received_by: string | null;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  created_at: string;
  updated_at: string;
  item_count: number;
  approver_name?: string;
  type: 'material_request' | 'cash_request'; // Added type field
}

interface Item {
  id: number;
  name: string;
  quantity: number;
}

interface Approver {
  id: number;
  fullName: string;
  canApproveMaterial?: boolean;
  canApproveCash?: boolean;
}

const RequestForms: React.FC = () => {
  const { user } = useAuth();
  const [allRequests, setAllRequests] = useState<Request[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<Request[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'completed' | 'rejected'>('pending');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const { toast } = useToast();
  const location = useLocation();
  const fieldWorkLinks = (location.state as { fieldWorkLinks?: { type: string; id: number }[] } | null)?.fieldWorkLinks;

  useEffect(() => {
    if (fieldWorkLinks?.length) setIsFormOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    vobiAmbientStore.getState().setFormHint('material-request');
  }, []);

  useEffect(() => {
    loadRequests();
    loadItems();
    loadApprovers();

    const DRAFT_KEY = 'requestFormDraft';
    const TTL = 5 * 60 * 1000;
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const { timestamp } = parsed;
        if (Date.now() - timestamp < TTL) {
          toast({
            title: "Draft Found",
            description: "Opening form with your unsaved progress.",
            variant: "default"
          });
          setIsFormOpen(true);
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      } catch (error) {
        console.error('Error checking draft:', error);
        localStorage.removeItem(DRAFT_KEY);
      }
    }
  }, []);

  useEffect(() => {
    filterRequests();
  }, [allRequests, searchTerm, activeTab]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await getRequests();
      const materialRequests = data.filter((r: any) => {
        if (r.type !== 'material_request') return false;
        const privileged =
          userHasAnyRole(user, ['superadmin', 'director', 'cto']) ||
          String(user?.position || '').trim().toLowerCase() === 'director';
        if (privileged) return true;
        return Number(r.created_by_id) === Number(user?.id);
      });
      setAllRequests(materialRequests);
    } catch (error) {
      console.error('Error loading requests:', error);
      toast({
        title: "Error",
        description: "Failed to load requests",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async () => {
    try {
      const data = await getItems();
      setItems(data);
    } catch (error) {
      console.error('Error loading items:', error);
      toast({
        title: "Error",
        description: "Failed to load items",
        variant: "destructive"
      });
    }
  };

  const loadApprovers = async () => {
    try {
      const data = await getApprovers();
      setApprovers(data.filter((approver: Approver) => approver.canApproveMaterial && approver.id !== user?.id));
    } catch (error) {
      console.error('Error loading approvers:', error);
      toast({
        title: "Error",
        description: "Failed to load approvers",
        variant: "destructive"
      });
    }
  };

  const filterRequests = () => {
    let filtered = allRequests.filter(request => request.status === activeTab);
    if (searchTerm.trim()) {
      filtered = filtered.filter(request =>
        (request.project_name && request.project_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (request.created_by && request.created_by.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    setFilteredRequests(filtered);
  };

  // Truncate project name to first two words + "..."
  const truncateProjectName = (name: string) => {
    if (!name) return '—';
    const words = name.trim().split(/\s+/);
    if (words.length <= 2) return name;
    return words.slice(0, 2).join(' ') + '...';
  };

  const handleCreateRequest = async (formData: {
    createdBy: string;
    teamLeaderName: string;
    teamLeaderPhone: string;
    projectName: string;
    ispName: string;
    location: string;
    receivedBy: string;
    deployment: 'Deployment' | 'Maintenance';
    items: { name: string; requested: number }[];
    selectedApproverIds: number[];
    ticket_id?: number | null;
    linked_cash_request_id?: number | null;
    linked_references?: ReferenceSummary[];
    siteId?: number | null;
  }) => {
    try {
      const mergedLinkedReferences = formData.linked_references?.length
        ? formData.linked_references
        : fieldWorkLinks;
      await createRequest({
        createdBy: formData.createdBy,
        teamLeaderName: formData.teamLeaderName,
        teamLeaderPhone: formData.teamLeaderPhone,
        projectName: formData.projectName,
        ispName: formData.ispName,
        location: formData.location,
        releaseBy: null,
        receivedBy: formData.receivedBy,
        deployment: formData.deployment,
        items: formData.items,
        ticket_id: formData.ticket_id,
        linked_cash_request_id: formData.linked_cash_request_id,
        siteId: formData.siteId,
        ...(mergedLinkedReferences?.length ? { linked_references: mergedLinkedReferences } : {}),
      }, formData.selectedApproverIds, 'material_request');

      setIsFormOpen(false);
      toast({
        title: 'Request submitted successfully',
        variant: 'default'
      });
      loadRequests();
    } catch (error: any) {
      console.error('Error creating request:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create request",
        variant: "destructive"
      });
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'approved': return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return null;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-[var(--surface-secondary)] text-[var(--text-primary)]';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-[var(--text-secondary)]">Loading requests...</p>
      </div>
    );
  }

  return (
    <div className="inv-theme space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--primary)]">Inventory</p>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">Material Request Forms</h1>
          <p className="text-[var(--text-secondary)] mt-1">Create and manage material requests — sent to all approvers by default</p>
        </div>
        <div className="mt-4 md:mt-0">
          <Button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] flex items-center shadow-[var(--shadow-sm)]"
          >
            <Plus className="h-5 w-5 mr-2" />
            {isFormOpen ? 'Close Form' : 'New Material Request'}
          </Button>
        </div>
      </div>

      {isFormOpen && (
        <div className="bg-[var(--surface)] rounded-2xl shadow-xl border border-[var(--border)] p-8 mb-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-600"></div>
          <div className="text-center mb-6">
            <img src="/vobiss-logo.png" alt="Vobiss Logo" className="mx-auto h-12 w-auto mb-4" />
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">REQUEST FORM FOR MATERIALS</h2>
          </div>
          <RequestForm
            onSave={handleCreateRequest}
            onCancel={() => setIsFormOpen(false)}
            items={items}
            approvers={approvers}
            currentUserName={user?.first_name && user?.last_name 
              ? `${user.first_name} ${user.last_name}` 
              : user?.username || ''}
          />
        </div>
      )}

      {/* Search & Tabs */}
      <div className="bg-[var(--surface)] rounded-2xl p-6 shadow-[var(--shadow-md)] border border-[var(--border)] mb-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-teal-600"></div>
        <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
          <div className="relative flex-1">
            <Search className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              type="text"
              placeholder="Search by project or creator..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2"
            />
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-gradient-to-r from-[var(--surface-secondary)] to-[var(--surface-hover)] rounded-xl p-1">
          <TabsTrigger value="pending" className="data-[state=active]:bg-[var(--surface)] data-[state=active]:shadow-sm rounded-lg">
            Pending ({allRequests.filter(r => r.status === 'pending').length})
          </TabsTrigger>
          <TabsTrigger value="approved" className="data-[state=active]:bg-[var(--surface)] data-[state=active]:shadow-sm rounded-lg">
            Approved ({allRequests.filter(r => r.status === 'approved').length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="data-[state=active]:bg-[var(--surface)] data-[state=active]:shadow-sm rounded-lg">
            Completed ({allRequests.filter(r => r.status === 'completed').length})
          </TabsTrigger>
          <TabsTrigger value="rejected" className="data-[state=active]:bg-[var(--surface)] data-[state=active]:shadow-sm rounded-lg">
            Rejected ({allRequests.filter(r => r.status === 'rejected').length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value={activeTab} className="mt-6">
          <div className="bg-[var(--surface)] rounded-2xl shadow-[var(--shadow-md)] border border-[var(--border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--border)]">
                <thead className="bg-gradient-to-r from-[var(--surface-secondary)] to-[var(--surface-hover)]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Request ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Site Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Created By</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Items</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Created At</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-[var(--surface)] divide-y divide-[var(--border)]">
                  {filteredRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-[var(--surface-hover)]/50 transition-all duration-200">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link to={`/request-forms/${request.id}`} className="text-blue-600 hover:underline font-medium transition-colors">
                          {request.id}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <div 
                          className="text-sm font-medium text-[var(--text-primary)] truncate max-w-xs" 
                          title={request.project_name}
                        >
                          {truncateProjectName(request.project_name)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-[var(--text-primary)]">{request.created_by}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-[var(--text-primary)]">{request.item_count}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-[var(--text-primary)]">{new Date(request.created_at).toLocaleDateString()}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(request.status)} shadow-sm`}>
                          {statusIcon(request.status)}
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link to={`/request-forms/${request.id}`} className="text-blue-600 hover:text-blue-500 font-medium transition-colors">
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredRequests.length === 0 && (
              <div className="text-center py-12">
                <p className="text-[var(--text-secondary)]">No {activeTab} material requests yet</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

interface RequestFormProps {
  onSave: (formData: {
    createdBy: string;
    teamLeaderName: string;
    teamLeaderPhone: string;
    projectName: string;
    ispName: string;
    location: string;
    receivedBy: string;
    deployment: 'Deployment' | 'Maintenance';
    items: { name: string; requested: number }[];
    selectedApproverIds: number[];
    ticket_id?: number | null;
    linked_cash_request_id?: number | null;
    linked_references?: ReferenceSummary[];
    siteId?: number | null;
  }) => void;
  onCancel: () => void;
  items: Item[];
  approvers: Approver[];
  currentUserName: string;
}

const RequestForm: React.FC<RequestFormProps> = ({ onSave, onCancel, items, approvers, currentUserName }) => {
  const [formData, setFormData] = useState({
    createdBy: currentUserName,
    teamLeaderName: '',
    teamLeaderPhone: '',
    projectName: '',
    ispName: '',
    location: '',
    receivedBy: '',
    deployment: 'Deployment' as 'Deployment' | 'Maintenance',
  });
  const [siteId, setSiteId] = useState<number | null>(null);
  const [siteQuery, setSiteQuery] = useState('');
  const [siteClientName, setSiteClientName] = useState<string | null>(null);
  const [selectedApproverIds, setSelectedApproverIds] = useState<number[]>([]);
  const [selectedItems, setSelectedItems] = useState<{ name: string; requested: string }[]>([{ name: '', requested: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [linkType, setLinkType] = useState<'ticket' | 'cash_request'>('ticket');
  const [ticketSearchTerm, setTicketSearchTerm] = useState('');
  const [searchedTickets, setSearchedTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [cashRequestId, setCashRequestId] = useState('');
  const [searchedCashRequests, setSearchedCashRequests] = useState<any[]>([]);
  const [selectedCashRequest, setSelectedCashRequest] = useState<any | null>(null);
  const [searchingLink, setSearchingLink] = useState(false);
  const [linkedReferences, setLinkedReferences] = useState<ReferenceSummary[]>([]);
  const [requireReference, setRequireReference] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    getWorkflowConfig()
      .then((workflow: any) => setRequireReference(Boolean(workflow?.transport?.require_reference_link_material)))
      .catch(() => {});
  }, []);

  useVobiSection({
    id: 'material-request-form',
    title: 'Material Request Form',
    help: 'Create material requests by selecting project details, exact inventory items, quantities, and eligible approvers.',
    priority: 20,
  });

  useVobiFormState({
    formKey: 'material-request',
    requiredFields: [
      { field: 'teamLeaderName', label: 'Team Leader Name' },
      { field: 'projectName', label: 'Site' },
      { field: 'location', label: 'Location' },
      { field: 'receivedBy', label: 'Received By' },
      { field: 'selectedApproverIds', label: 'Approvers' },
    ],
    currentValues: {
      ...formData,
      selectedApproverIds,
    },
  });

  const DRAFT_KEY = 'requestFormDraft';
  const TTL = 5 * 60 * 1000;

  const teamLeaderNameRef = useRef<HTMLInputElement>(null);
  const teamLeaderPhoneRef = useRef<HTMLInputElement>(null);
  const projectNameRef = useRef<HTMLInputElement>(null);
  const ispNameRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const receivedByRef = useRef<HTMLInputElement>(null);
  const deploymentRefs = useRef<(HTMLInputElement | null)[]>([]);
  const itemNameRefs = useRef<(HTMLInputElement | null)[]>([]);
  const itemQtyRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [openItemDropdown, setOpenItemDropdown] = useState<number | null>(null);
  const [itemDropdownStyle, setItemDropdownStyle] = useState<React.CSSProperties>({});

  // The items table sits inside an `overflow-hidden` card (for its rounded corners), which
  // would clip an absolutely-positioned dropdown — portal it to <body> instead, positioned to
  // track the active row's input, so it's never hidden behind the card's edge.
  useLayoutEffect(() => {
    if (openItemDropdown === null) return;
    const updatePosition = () => {
      const el = itemNameRefs.current[openItemDropdown];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setItemDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [openItemDropdown]);

  const [siteResults, setSiteResults] = useState<LookupRow[]>([]);

  useEffect(() => {
    if (!siteQuery.trim() || siteId) {
      setSiteResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchSitesForPicker(siteQuery)
        .then((results) => { if (!cancelled) setSiteResults(results); })
        .catch(() => { if (!cancelled) setSiteResults([]); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [siteQuery, siteId]);

  const selectSite = (site: LookupRow) => {
    const siteName = site.site_name || site.name || '';
    setSiteId(site.id);
    setSiteQuery(siteName);
    setSiteClientName(site.customer_name || null);
    setSiteResults([]);
    setFormData(prev => ({
      ...prev,
      projectName: siteName,
      location: prev.location.trim() ? prev.location : (site.site_address || prev.location),
    }));
  };

  const clearSite = () => {
    setSiteId(null);
    setSiteQuery('');
    setSiteClientName(null);
    setSiteResults([]);
    setFormData(prev => ({ ...prev, projectName: '' }));
  };

  useEffect(() => {
    if (approvers.length > 0) {
      setSelectedApproverIds(approvers.map(a => a.id));
    }
  }, [approvers]);

  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const { formData: savedForm, selectedApproverIds: savedIds, selectedItems: savedItems, timestamp, selectedTicket: savedTicket, linkType: savedLinkType, cashRequestId: savedCashRequestId, selectedCashRequest: savedCashRequest, siteId: savedSiteId, siteQuery: savedSiteQuery, siteClientName: savedSiteClientName } = parsed;
        if (Date.now() - timestamp < TTL) {
          setFormData({ ...savedForm, createdBy: currentUserName });
          setSelectedApproverIds(savedIds || []);
          setSelectedItems(savedItems || [{ name: '', requested: '' }]);
          setSelectedTicket(savedTicket || null);
          setLinkType(savedLinkType || 'ticket');
          setCashRequestId(savedCashRequestId || '');
          setSelectedCashRequest(savedCashRequest || null);
          setSiteId(savedSiteId || null);
          setSiteQuery(savedSiteQuery || '');
          setSiteClientName(savedSiteClientName || null);
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      } catch (error) {
        console.error('Error loading draft:', error);
        localStorage.removeItem(DRAFT_KEY);
      }
    }
  }, [currentUserName]);

  useEffect(() => {
    const draft = { formData, selectedApproverIds, selectedItems, selectedTicket, linkType, cashRequestId, selectedCashRequest, siteId, siteQuery, siteClientName, timestamp: Date.now() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [formData, selectedApproverIds, selectedItems, selectedTicket, linkType, cashRequestId, selectedCashRequest, siteId, siteQuery, siteClientName]);

  useEffect(() => {
    const term = linkType === 'ticket' ? ticketSearchTerm.trim() : cashRequestId.trim();

    if (!term) {
      setSearchedTickets([]);
      setSearchedCashRequests([]);
      setSearchingLink(false);
      return;
    }

    let cancelled = false;
    setSearchingLink(true);

    const timer = window.setTimeout(async () => {
      try {
        if (linkType === 'ticket') {
          const results = await cxApi.searchTicketsSummary(term);
          if (!cancelled) {
            setSearchedTickets(Array.isArray(results?.data) ? results.data : []);
            setSearchedCashRequests([]);
          }
          return;
        }

        const all = await getRequests();
        const normalized = term.toLowerCase();
        const matches = all
          .filter((request: any) => request.type === 'cash_request')
          .filter((request: any) => {
            const haystack = [
              request.id,
              request.purpose,
              request.department,
              request.created_by,
              request.total_amount,
              request.status,
            ].map(value => String(value || '').toLowerCase()).join(' ');
            return haystack.includes(normalized);
          })
          .slice(0, 10);

        if (!cancelled) {
          setSearchedCashRequests(matches);
          setSearchedTickets([]);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error searching link records:', error);
          setSearchedTickets([]);
          setSearchedCashRequests([]);
        }
      } finally {
        if (!cancelled) setSearchingLink(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [linkType, ticketSearchTerm, cashRequestId]);

  const clearDraft = () => localStorage.removeItem(DRAFT_KEY);

  const handleKeyDown = (e: React.KeyboardEvent, nextRef: any) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nextRef?.current?.focus();
    }
  };

  const handleApproverToggle = (id: number, checked: boolean) => {
    setSelectedApproverIds(prev =>
      checked ? [...prev, id] : prev.filter(x => x !== id)
    );
  };

  const handleSelectAll = () => {
    if (selectedApproverIds.length === approvers.length) {
      setSelectedApproverIds([]);
    } else {
      setSelectedApproverIds(approvers.map(a => a.id));
    }
  };

  const handleAddItem = () => {
    setSelectedItems([...selectedItems, { name: '', requested: '' }]);
  };

  const handleItemChange = (index: number, field: 'name' | 'requested', value: string) => {
    const newItems = [...selectedItems];
    newItems[index][field] = value;
    setSelectedItems(newItems);
  };

  const removeItemRow = (index: number) => {
    if (selectedItems.length > 1) {
      setSelectedItems(selectedItems.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const missingFields = [
      !formData.teamLeaderName.trim()
        ? { field: 'teamLeaderName', label: 'Team Leader Name', message: 'Enter the team leader name before submitting.' }
        : null,
      !formData.projectName.trim()
        ? { field: 'projectName', label: 'Site', message: 'Search for and select the site before submitting.' }
        : null,
      !formData.location.trim()
        ? { field: 'location', label: 'Site Location', message: 'Enter the site location before submitting.' }
        : null,
      !formData.receivedBy.trim()
        ? { field: 'receivedBy', label: 'Received By', message: 'Enter who will receive the requested items.' }
        : null,
    ].filter(Boolean);

    if (missingFields.length > 0) {
      vobiAmbientStore.getState().setExactIssue({
        title: `${missingFields.length} required field${missingFields.length === 1 ? '' : 's'} missing`,
        body: 'Vobi checked this material request and found only the fields below are missing.',
        formKey: 'material-request',
        fieldErrors: missingFields,
        action: 'Show me',
      });
      setSubmitting(false);
      return;
    }

    if (requireReference && linkedReferences.length === 0) {
      vobiAmbientStore.getState().setExactIssue({
        title: 'Reference link is required',
        body: 'This material request needs at least one linked reference before it can be submitted.',
        formKey: 'material-request',
        fieldErrors: [{
          field: 'linkedReferences',
          label: 'Linked Reference',
          message: 'Link a ticket, project, or other request before submitting.',
        }],
        action: 'Show me',
      });
      setSubmitting(false);
      return;
    }

    if (selectedApproverIds.length === 0) {
      vobiAmbientStore.getState().setExactIssue({
        title: 'Approver is required',
        body: 'This request needs at least one eligible approver before it can be submitted.',
        formKey: 'material-request',
        fieldErrors: [{
          field: 'selectedApproverIds',
          label: 'Approvers',
          message: 'Select at least one approver from the approver list.',
        }],
        action: 'Show me',
      });
      setSubmitting(false);
      return;
    }

    const validItemNames = new Set(items.map(i => i.name));
    const validItems = selectedItems
      .map(item => ({ name: item.name, requested: parseInt(item.requested) || 0 }))
      .filter(item => item.name && validItemNames.has(item.name) && item.requested > 0);

    if (validItems.length === 0) {
      vobiAmbientStore.getState().setExactIssue({
        title: 'Item is required',
        body: 'The request needs at least one item row with a selected item and valid quantity.',
        formKey: 'material-request',
        fieldErrors: [{
          field: 'itemName',
          label: 'Item',
          message: 'Select an item and enter the quantity requested.',
        }],
        action: 'Show me',
      });
      setSubmitting(false);
      return;
    }

    await onSave({
      ...formData,
      items: validItems,
      selectedApproverIds,
      ticket_id: linkType === 'ticket' ? selectedTicket?.id : null,
      linked_cash_request_id: null,
      linked_references: linkedReferences.map((ref) => ({ type: ref.type, id: ref.id })),
      siteId,
    });

    setFormData({
      createdBy: currentUserName,
      teamLeaderName: '', teamLeaderPhone: '', projectName: '',
      ispName: '', location: '', receivedBy: '', deployment: 'Deployment'
    });
    setSiteId(null);
    setSiteQuery('');
    setSiteClientName(null);
    setSelectedApproverIds(approvers.map(a => a.id));
    setSelectedItems([{ name: '', requested: '' }]);
    setSelectedTicket(null);
    setSelectedCashRequest(null);
    setCashRequestId('');
    setTicketSearchTerm('');
    setSearchedTickets([]);
    setSearchedCashRequests([]);
    setLinkedReferences([]);
    clearDraft();
    setSubmitting(false);
  };

  const allSelected = approvers.length > 0 && selectedApproverIds.length === approvers.length;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 w-full">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
        <ReferenceLinkPicker
          value={linkedReferences}
          onChange={setLinkedReferences}
          required={requireReference}
          hint="Link this material request to a Ticket, Project, or other request."
        />
      </div>

      {/* Request Link */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-semibold text-[var(--text-body)]">Link Ticket (Optional)</label>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Connect this material request to a support ticket.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
          <Input
            type="text"
            placeholder="Type part of ticket ID, customer, or project"
            value={ticketSearchTerm}
            onChange={(e) => {
              setTicketSearchTerm(e.target.value);
              setSelectedTicket(null);
            }}
            className="rounded-xl bg-[var(--surface)]"
          />
        </div>
        {searchingLink && (
          <p className="text-xs text-[var(--text-muted)]">Searching...</p>
        )}
        {linkType === 'ticket' && !selectedTicket && searchedTickets.length > 0 && (
          <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50 p-2">
            {searchedTickets.map((ticket) => (
              <button
                key={ticket.ticket_id}
                type="button"
                onClick={() => {
                  setSelectedTicket(ticket);
                  setTicketSearchTerm(`${ticket.ticket_id} - ${ticket.title || ''}`.trim());
                  setSearchedTickets([]);
                }}
                className="w-full rounded-lg bg-[var(--surface)] p-3 text-left shadow-sm transition hover:bg-blue-100"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-blue-700">{ticket.ticket_id}</span>
                  <span className="rounded-full bg-[var(--surface-secondary)] px-2 py-0.5 text-xs text-[var(--text-body)]">{ticket.status || 'NEW'}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{ticket.title || 'No title'}</p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {ticket.customer_name || 'Unknown customer'}{ticket.project_name ? ` • ${ticket.project_name}` : ''}
                </p>
              </button>
            ))}
          </div>
        )}
        {linkType === 'ticket' && selectedTicket && (
          <div className="flex items-center space-x-2 p-2 bg-blue-100 rounded-md">
            <span className="font-semibold">Selected Ticket:</span>
            <span>{selectedTicket.ticket_id} - {selectedTicket.title}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedTicket(null);
                setTicketSearchTerm('');
              }}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Created By - READ ONLY */}
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Created By *</label>
          <Input
            value={currentUserName}
            disabled
            className="bg-[var(--surface-secondary)] rounded-xl cursor-not-allowed"
          />
          <p className="text-xs text-[var(--text-muted)]">Automatically filled from your profile</p>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Team Leader Name *</label>
          <Input
            ref={teamLeaderNameRef}
            data-vobi-field="teamLeaderName"
            value={formData.teamLeaderName}
            onChange={e => setFormData({ ...formData, teamLeaderName: e.target.value })}
            onKeyDown={e => handleKeyDown(e, teamLeaderPhoneRef)}
            placeholder="Team leader's name"
            className="rounded-xl"
            disabled={submitting}
          />
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Team Leader Phone</label>
          <Input
            ref={teamLeaderPhoneRef}
            value={formData.teamLeaderPhone}
            onChange={e => setFormData({ ...formData, teamLeaderPhone: e.target.value })}
            onKeyDown={e => handleKeyDown(e, projectNameRef)}
            placeholder="Phone number"
            className="rounded-xl"
            disabled={submitting}
          />
        </div>

        <div className="space-y-3 relative">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Site *</label>
          <Input
            ref={projectNameRef}
            value={siteQuery}
            onChange={e => {
              setSiteQuery(e.target.value);
              if (siteId) {
                setSiteId(null);
                setSiteClientName(null);
                setFormData(prev => ({ ...prev, projectName: '' }));
              }
            }}
            onKeyDown={e => handleKeyDown(e, ispNameRef)}
            placeholder="Search for a site..."
            className="rounded-xl"
            disabled={submitting}
            autoComplete="off"
          />
          <input type="hidden" data-vobi-field="projectName" value={formData.projectName} readOnly />
          {siteQuery && !siteId && siteResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg max-h-64 overflow-y-auto">
              {siteResults.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-secondary)]"
                  onMouseDown={() => selectSite(s)}
                >
                  <div className="font-medium text-[var(--text-body)]">{s.site_name || s.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {s.customer_name}{s.site_address ? ` · ${s.site_address}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
          {siteId ? (
            <p className="text-xs text-[var(--text-muted)]">
              Client: {siteClientName || '—'} ·{' '}
              <button type="button" className="underline hover:text-[var(--text-body)]" onClick={clearSite} disabled={submitting}>
                Change site
              </button>
            </p>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">Type to search sites; the client fills in automatically.</p>
          )}
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">ISP Name</label>
          <Input
            ref={ispNameRef}
            value={formData.ispName}
            onChange={e => setFormData({ ...formData, ispName: e.target.value })}
            onKeyDown={e => handleKeyDown(e, locationRef)}
            placeholder="ISP name"
            className="rounded-xl"
            disabled={submitting}
          />
        </div>

        <div className="md:col-span-2 space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Site Location *</label>
          <Input
            ref={locationRef}
            data-vobi-field="location"
            value={formData.location}
            onChange={e => setFormData({ ...formData, location: e.target.value })}
            onKeyDown={e => handleKeyDown(e, receivedByRef)}
            placeholder={siteId ? "Auto-filled from the selected site — edit if needed" : "Site location"}
            className="rounded-xl"
            disabled={submitting}
          />
        </div>

        <div className="md:col-span-2 space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Received By *</label>
          <Input
            ref={receivedByRef}
            data-vobi-field="receivedBy"
            value={formData.receivedBy}
            onChange={e => setFormData({ ...formData, receivedBy: e.target.value })}
            onKeyDown={e => handleKeyDown(e, deploymentRefs.current[0])}
            placeholder="Received by name"
            className="rounded-xl"
            disabled={submitting}
          />
        </div>

        {/* APPROVER SELECTION */}
        <div className="md:col-span-2 space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)] flex items-center">
            <Users className="h-4 w-4 mr-2 text-[var(--text-muted)]" />
            Assigned Approver(s) * (Default: All Selected)
          </label>
          <div className="border border-[var(--border-strong)] rounded-xl p-4 shadow-sm bg-gradient-to-b from-blue-50 to-indigo-50 max-h-48 overflow-y-auto">
            <span data-vobi-field="selectedApproverIds" className="sr-only">Approvers</span>
            <div className="flex items-center space-x-2 mb-3">
              <Checkbox id="select-all" checked={allSelected} onCheckedChange={handleSelectAll} disabled={submitting} />
              <label htmlFor="select-all" className="text-sm font-medium text-blue-700 cursor-pointer">
                {allSelected ? 'Deselect All' : 'Select All'} ({approvers.length})
              </label>
            </div>
            <div className="space-y-2">
              {approvers.map((approver) => (
                <div key={approver.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`approver-${approver.id}`}
                    checked={selectedApproverIds.includes(approver.id)}
                    onCheckedChange={(checked) => handleApproverToggle(approver.id, !!checked)}
                    disabled={submitting}
                  />
                  <label htmlFor={`approver-${approver.id}`} className="text-sm text-[var(--text-body)] cursor-pointer flex-1">
                    {approver.fullName}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {selectedApproverIds.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {selectedApproverIds.map(id => {
                const a = approvers.find(a => a.id === id);
                return a ? (
                  <Badge key={id} variant="secondary" className="text-xs font-medium">
                    {a.fullName}
                  </Badge>
                ) : null;
              })}
            </div>
          )}
        </div>
      </div>

      {/* Deployment Type */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-[var(--text-body)]">Type *</label>
        <div className="flex space-x-8 bg-gradient-to-r from-[var(--surface-secondary)] to-[var(--surface-hover)] p-4 rounded-xl shadow-sm">
          {['Deployment', 'Maintenance'].map((type, i) => (
            <label key={type} className="flex items-center cursor-pointer space-x-3 bg-[var(--surface)] px-4 py-3 rounded-lg shadow-[var(--shadow-md)] hover:shadow-md transition-all">
              <input
                ref={el => deploymentRefs.current[i] = el}
                type="radio"
                value={type}
                checked={formData.deployment === type}
                onChange={e => setFormData({ ...formData, deployment: e.target.value as any })}
                onKeyDown={e => handleKeyDown(e, i === 0 ? deploymentRefs.current[1] : itemNameRefs.current[0])}
                className="h-4 w-4 text-blue-600"
                disabled={submitting}
              />
              <span className="text-sm font-medium">{type}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Items Table */}
      <div className="space-y-4">
        <div className="border border-[var(--border)] rounded-2xl overflow-hidden shadow-[var(--shadow-md)] bg-gradient-to-b from-white to-gray-50">
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-blue-50 to-indigo-50">
                <th className="border-r border-[var(--border)] p-4 text-left text-xs font-semibold text-[var(--text-body)]">SRL</th>
                <th className="border-r border-[var(--border)] p-4 text-left text-xs font-semibold text-[var(--text-body)]">Name of Material</th>
                <th className="border-r border-[var(--border)] p-4 text-left text-xs font-semibold text-[var(--text-body)]">Qty. Requested</th>
                <th className="p-4 text-left text-xs font-semibold text-[var(--text-body)]">Action</th>
              </tr>
            </thead>
            <tbody>
              {selectedItems.map((item, index) => (
                <tr key={index} className="border-t border-[var(--border)] hover:bg-[var(--surface)]/60 transition-all">
                  <td className="border-r border-[var(--border)] p-4 font-semibold text-sm text-[var(--text-primary)]">{index + 1}</td>
                  <td className="border-r border-[var(--border)] p-4 relative">
                    <Input
                      ref={el => itemNameRefs.current[index] = el}
                      data-vobi-field="itemName"
                      value={item.name}
                      onChange={e => { handleItemChange(index, 'name', e.target.value); setOpenItemDropdown(index); }}
                      onFocus={() => setOpenItemDropdown(index)}
                      onBlur={() => setTimeout(() => setOpenItemDropdown(prev => (prev === index ? null : prev)), 150)}
                      onKeyDown={e => handleKeyDown(e, itemQtyRefs.current[index])}
                      placeholder="Search items..."
                      className="rounded-xl"
                      disabled={submitting}
                      autoComplete="off"
                    />
                    {openItemDropdown === index && typeof document !== 'undefined' && (() => {
                      const q = item.name.trim().toLowerCase();
                      const matches = q ? items.filter(i => i.name.toLowerCase().includes(q)) : items;
                      return matches.length > 0 && createPortal(
                        <div
                          style={itemDropdownStyle}
                          className="max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg"
                        >
                          {matches.map(i => (
                            <button
                              key={i.id}
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-secondary)]"
                              onMouseDown={() => { handleItemChange(index, 'name', i.name); setOpenItemDropdown(null); }}
                            >
                              {i.name}
                            </button>
                          ))}
                        </div>,
                        document.body
                      );
                    })()}
                  </td>
                  <td className="border-r border-[var(--border)] p-4">
                    <Input
                      ref={el => itemQtyRefs.current[index] = el}
                      type="number"
                      value={item.requested}
                      onChange={e => handleItemChange(index, 'requested', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, index === selectedItems.length - 1 ? null : itemNameRefs.current[index + 1])}
                      className="w-20 rounded-xl"
                      min="0"
                      disabled={submitting}
                    />
                  </td>
                  <td className="p-4">
                    <Button type="button" variant="destructive" size="sm" onClick={() => removeItemRow(index)} disabled={submitting || selectedItems.length <= 1}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button type="button" variant="outline" onClick={handleAddItem} className="w-full rounded-xl" disabled={submitting}>
          <Plus className="h-4 w-4 mr-2" /> Add Row
        </Button>
      </div>

      {/* Submit */}
      <div className="flex justify-end space-x-3 pt-6 border-t border-[var(--border)]">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting} className="rounded-xl">
          Cancel
        </Button>
        <Button type="submit" disabled={submitting} className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl shadow-lg">
          {submitting ? 'Submitting...' : 'Submit Request'}
        </Button>
      </div>
    </form>
  );
};


export default RequestForms;