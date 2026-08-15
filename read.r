SUPABASE_URL=https://srvvomvtrlnsyrzujazp.supabase.co
SUPABASE_KEY=eyJHbGc101JUJZi1NItsiNR5CiG1tkPXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNydnZvbXZ0cmxuc3lyenVqYXpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNzMyMDExNSwiZXhwIjoxMDQyNjAwMTE1fQ.pC3M1f01J2dXbI
PORT=3001


// Updated SystemGuide.tsx with embedded demo video tutorial
import React, { useState } from 'react';
import { 
  Search, 
  ChevronDown, 
  ChevronUp,
  Copy,
  Lock,
  LayoutDashboard,
  Users,
  Package,
  FileText,
  CheckCircle,
  ArrowUpRight,
  RotateCcw,
  AlertTriangle,
  BarChart3,
  Settings,
  Bot,
  Mail,
  BookOpen,
  HelpCircle,
  PlayCircle // New icon for video section
} from 'lucide-react';

// Simple CopyButton Component
const CopyButton = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs transition-colors"
      title="Copy code"
    >
      {copied ? 'Copied!' : <Copy className="h-3 w-3" />}
    </button>
  );
};

const sections = [
  {
    id: 1,
    icon: Lock,
    title: 'Logging In',
    content: (
      <ul className="space-y-2 list-disc pl-5">
        <li>Access the login page.</li>
        <li>Enter username and password.</li>
        <li>Click <strong>Login</strong> for dashboard.</li>
        <li>Contact admin for forgotten credentials.</li>
      </ul>
    )
  },
  {
    id: 2,
    icon: LayoutDashboard,
    title: 'Dashboard Overview',
    content: (
      <>
        <p className="mb-4">Quick summary includes:</p>
        <ul className="space-y-2 list-disc pl-5 mb-4">
          <li>Total stock count.</li>
          <li>Pending/approved requests.</li>
          <li>Low-stock alerts.</li>
          <li>Recent issues/returns.</li>
        </ul>
        <p>Navigate via sidebar.</p>
      </>
    )
  },
  {
    id: 3,
    icon: Users,
    title: 'User Roles',
    content: (
      <>
        <p className="mb-4">Permissions by role:</p>
        <ul className="space-y-2 list-disc pl-5">
          <li><strong>Requester:</strong> Submit requests.</li>
          <li><strong>Approver:</strong> Approve/reject requests.</li>
          <li><strong>Issuer:</strong> Issue items and handle returns.</li>
          <li><strong>Super Admin:</strong> Full access to users, settings, reports, logs.</li>
        </ul>
      </>
    )
  },
  {
    id: 4,
    icon: Package,
    title: 'Managing Inventory',
    content: (
      <>
        <ul className="space-y-2 list-disc pl-5 mb-4">
          <li>view items and the inventory in the same dashbrd and the man how 
          how can how the <strong>Inventory</strong>.</li>
          <li>Issuers/admins: add/edit/delete items.</li>
          <li>Organize via <strong>Categories</strong>.</li>
          <li>Monitor quantities in real time.</li>
        </ul>
        {/* Interactive Code Example: Adding an Item (Admin) */}
        <details className="mt-4 p-3 bg-gray-100 rounded-lg">
          <summary className="cursor-pointer font-medium text-blue-600 mb-2 flex items-center space-x-1">
            <span>Interactive Example: API Call to Add Item</span>
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="relative">
            <pre className="bg-gray-800 text-gray-100 p-4 rounded-md overflow-x-auto text-sm">
              <code>{`POST /api/items}
                    
{
  "name": "Laptop",
  "category_id": 1,
  "quantity": 10,
  "threshold": 5
}`}</code>
            </pre>
            <CopyButton code={`POST /api/items\n{\n  "name": "Laptop",\n  "category_id": 1,\n  "quantity": 10,\n  "threshold": 5\n}`} />
          </div>
          <p className="text-xs text-gray-500 mt-2">Copy and use in API client like Postman.</p>
        </details>
      </>
    )
  },
  {
    id: 5,
    icon: FileText,
    title: 'Making a Request (Requester Role)',
    content: (
      <>
        <ul className="space-y-2 list-disc pl-5 mb-4">
          <li>Go to <strong>Request Forms</strong>.</li>
          <li>Enter item, quantity, purpose.</li>
          <li>Select approver and submit.</li>
          <li>Track requests on the page.</li>
          <li>Track superadmin request mades.</li>
        </ul>
        {/* Interactive Code Example: Submitting a Request */}
        <details className="mt-4 p-3 bg-gray-100 rounded-lg">
          <summary className="cursor-pointer font-medium text-blue-600 mb-2 flex items-center space-x-1">
            <span>Interactive Example: API Call to Submit Request</span>
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="relative">
            <pre className="bg-gray-800 text-gray-100 p-4 rounded-md overflow-x-auto text-sm">
              <code>{`POST /api/requests
{
  "item_id": 123,
  "quantity": 2,
  "purpose": "Project work",
  "approver_id": 456
}`}</code>
            </pre>
            <CopyButton code={`POST /api/requests\n{\n  "item_id": 123,\n  "quantity": 2,\n  "purpose": "Project work",\n  "approver_id": 456\n}`} />
          </div>
          <p className="text-xs text-gray-500 mt-2">Simulate request submission.</p>
        </details>
      </>
    )
  },
  {
    id: 6,
    icon: CheckCircle,
    title: 'Approving Requests (Approver Role)',
    content: (
      <>
        <ul className="space-y-2 list-disc pl-5 mb-4">
          <li>Access <strong>Pending Approvals</strong>.</li>
          <li>Review request details.</li>
          <li>Approve or reject instantly.</li>
          <li>Approved items route to <strong>Approved Forms</strong>.</li>
        </ul>
        {/* Interactive Code Example: Approving a Request */}
        <details className="mt-4 p-3 bg-gray-100 rounded-lg">
          <summary className="cursor-pointer font-medium text-blue-600 mb-2 flex items-center space-x-1">
            <span>Interactive Example: API Call to Approve Request</span>
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="relative">
            <pre className="bg-gray-800 text-gray-100 p-4 rounded-md overflow-x-auto text-sm">
              <code>{`PATCH /api/requests/789/approve
{
  "notes": "Approved for immediate use"
}`}</code>
            </pre>
            <CopyButton code={`PATCH /api/requests/789/approve\n{\n  "notes": "Approved for immediate use"\n}`} />
          </div>
          <p className="text-xs text-gray-500 mt-2">Approve a pending request via API.</p>
        </details>
      </>
    )
  },
  {
    id: 7,
    icon: ArrowUpRight,
    title: 'Issuing Items (Issuer Role)',
    content: (
      <>
        <ul className="space-y-2 list-disc pl-5 mb-4">
          <li>Check <strong>Approved Forms</strong>.</li>
          <li>Confirm issue; stock deducts automatically.</li>
          <li>Records saved for tracking.</li>
        </ul>
        {/* Interactive Code Example: Issuing an Item */}
        <details className="mt-4 p-3 bg-gray-100 rounded-lg">
          <summary className="cursor-pointer font-medium text-blue-600 mb-2 flex items-center space-x-1">
            <span>Interactive Example: API Call to Issue Item</span>
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="relative">
            <pre className="bg-gray-800 text-gray-100 p-4 rounded-md overflow-x-auto text-sm">
              <code>{`POST /api/issues
{
  "request_id": 789,
  "issued_quantity": 2
}`}</code>
            </pre>
            <CopyButton code={`POST /api/issues\n{\n  "request_id": 789,\n  "issued_quantity": 2\n}`} />
          </div>
          <p className="text-xs text-gray-500 mt-2">Issue approved items.</p>
        </details>
      </>
    )
  },
  {
    id: 8,
    icon: RotateCcw,
    title: 'Returning Items',
    content: (
      <>
        <ul className="space-y-2 list-disc pl-5 mb-4">
          <li>Navigate to <strong>Item Returns</strong>.</li>
          <li>Enter item, quantity, reason.</li>
          <li>Submit; stock updates automatically.</li>
          <li>Record logged for reports/audits.</li>
        </ul>
        {/* Interactive Code Example: Returning an Item */}
        <details className="mt-4 p-3 bg-gray-100 rounded-lg">
          <summary className="cursor-pointer font-medium text-blue-600 mb-2 flex items-center space-x-1">
            <span>Interactive Example: API Call to Return Item</span>
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="relative">
            <pre className="bg-gray-800 text-gray-100 p-4 rounded-md overflow-x-auto text-sm">
              <code>{`POST /api/returns
{
  "issue_id": 101,
  "returned_quantity": 1,
  "reason": "Unused"
}`}</code>
            </pre>
            <CopyButton code={`POST /api/returns\n{\n  "issue_id": 101,\n  "returned_quantity": 1,\n  "reason": "Unused"\n}`} />
          </div>
          <p className="text-xs text-gray-500 mt-2">Process a return via API.</p>
        </details>
      </>
    )
  },
  {
    id: 9,
    icon: AlertTriangle,
    title: 'Low Stock Alerts',
    content: (
      <>
        <ul className="space-y-2 list-disc pl-5 mb-4">
          <li>Auto-email on low thresholds to supervisors/admins.</li>
          <li>View items in <strong>Low Stock Alerts</strong>.</li>
        </ul>
        {/* Interactive Code Example: Fetching Low Stock */}
        <details className="mt-4 p-3 bg-gray-100 rounded-lg">
          <summary className="cursor-pointer font-medium text-blue-600 mb-2 flex items-center space-x-1">
            <span>Interactive Example: API Call to Get Low Stock</span>
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="relative">
            <pre className="bg-gray-800 text-gray-100 p-4 rounded-md overflow-x-auto text-sm">
              <code>{`GET /api/low-stock`}</code>
            </pre>
            <CopyButton code={`GET /api/low-stock`} />
          </div>
          <p className="text-xs text-gray-500 mt-2">Retrieve low stock items.</p>
        </details>
      </>
    )
  },
  {
    id: 10,
    icon: BarChart3,
    title: 'Reports & Audit Logs (Admin Only)',
    content: (
      <>
        <ul className="space-y-2 list-disc pl-5 mb-4">
          <li><strong>Reports:</strong> Stock, requests, usage data.</li>
          <li><strong>Audit Logs:</strong> All actions tracked.</li>
        </ul>
        {/* Interactive Code Example: Fetching Reports */}
        <details className="mt-4 p-3 bg-gray-100 rounded-lg">
          <summary className="cursor-pointer font-medium text-blue-600 mb-2 flex items-center space-x-1">
            <span>Interactive Example: API Call for Reports</span>
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="relative">
            <pre className="bg-gray-800 text-gray-100 p-4 rounded-md overflow-x-auto text-sm">
              <code>{`GET /api/reports?type=monthly`}</code>
            </pre>
            <CopyButton code={`GET /api/reports?type=monthly`} />
          </div>
          <p className="text-xs text-gray-500 mt-2">Generate monthly reports.</p>
        </details>
      </>
    )
  },
  {
    id: 11,
    icon: Settings,
    title: 'Settings and User Management (Super Admin)',
    content: (
      <>
        <ul className="space-y-2 list-disc pl-5 mb-4">
          <li><strong>Settings:</strong> Company details, thresholds, notifications.</li>
          <li><strong>Users:</strong> Add/edit/deactivate accounts.</li>
          <li><strong>Supervisors:</strong> Manage approvers.</li>
        </ul>
        {/* Interactive Code Example: Adding a User */}
        <details className="mt-4 p-3 bg-gray-100 rounded-lg">
          <summary className="cursor-pointer font-medium text-blue-600 mb-2 flex items-center space-x-1">
            <span>Interactive Example: API Call to Add User</span>
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="relative">
            <pre className="bg-gray-800 text-gray-100 p-4 rounded-md overflow-x-auto text-sm">
              <code>{`POST /api/users
{
  "username": "newuser",
  "role": "requester",
  "email": "user@example.com"
}`}</code>
            </pre>
            <CopyButton code={`POST /api/users\n{\n  "username": "newuser",\n  "role": "requester",\n  "email": "user@example.com"\n}`} />
          </div>
          <p className="text-xs text-gray-500 mt-2">Add a new user account.</p>
        </details>
      </>
    )
  },
  {
    id: 12,
    icon: Bot,
    title: 'AI Assistant',
    content: (
      <>
        <p className="mb-4">Analyze trends or get help via <strong>AI Assistant</strong>.</p>
        <p>Query examples: “Low stock items?” or “Last month’s requests.”</p>
        {/* Interactive Code Example: AI Query */}
        <details className="mt-4 p-3 bg-gray-100 rounded-lg">
          <summary className="cursor-pointer font-medium text-blue-600 mb-2 flex items-center space-x-1">
            <span>Interactive Example: Sample AI Query</span>
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="relative">
            <pre className="bg-gray-800 text-gray-100 p-4 rounded-md overflow-x-auto text-sm">
              <code>{`Query: "Show low stock items"

Response: Items below threshold: Laptop (3/5), Mouse (1/2)`}</code>
            </pre>
            <CopyButton code={`Query: "Show low stock items"\n\nResponse: Items below threshold: Laptop (3/5), Mouse (1/2)`} />
          </div>
          <p className="text-xs text-gray-500 mt-2">Example interaction with AI.</p>
        </details>
      </>
    )
  },
  {
    id: 13,
    icon: Mail,
    title: 'Email Notifications',
    content: (
      <>
        <ul className="space-y-2 list-disc pl-5 mb-4">
          <li>Auto-emails for alerts/updates (SMTP required).</li>
          <li>Verify email for notifications.</li>
        </ul>
      </>
    )
  },
  {
    id: 14,
    icon: BookOpen,
    title: 'Best Practices',
    content: (
      <>
        <ul className="space-y-2 list-disc pl-5 mb-4">
          <li>Log out after use.</li>
          <li>Avoid unauthorized stock edits.</li>
          <li>Check low-stock alerts regularly.</li>
          <li>Record returns promptly.</li>
          <li>Use descriptive request notes.</li>
        </ul>
      </>
    )
  },
  {
    id: 15,
    icon: HelpCircle,
    title: 'Getting Help',
    content: (
      <p className="mb-4">Contact admin/supervisor for issues. Revisit guide via sidebar.</p>
    )
  }
];

const SystemGuide = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [openSections, setOpenSections] = useState<Set<number>>(new Set([1])); // Open first section by default

  const toggleSection = (id: number) => {
    setOpenSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const filteredSections = sections.filter(section =>
    section.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Static Responsive Header */}
      <header className="sticky top-0 z-20 bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            {/* Title */}
            <div className="flex flex-col">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                VOBISS INVENTORY SYSTEM
              </h1>
              <p className="text-sm text-blue-600 font-medium">USER GUIDE</p>
            </div>
            
            {/* Search Bar */}
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search sections (e.g., 'login' or 'requests')"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <p className="text-base text-gray-600 mb-8 leading-relaxed">
          Welcome to the Vobiss Inventory System, a platform designed to help manage company inventory, process item requests, and handle approvals efficiently.
          This guide explains how to use the system based on your role and available features.
        </p>

        {/* Demo Video Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center space-x-2">
            <PlayCircle className="h-6 w-6 text-blue-600" />
            <span>Watch Demo Tutorial</span>
          </h2>
          <p className="text-gray-600 mb-4">Get a visual walkthrough of building and using a React-based inventory management system similar to Vobiss.</p>
          <div className="relative w-full aspect-video rounded-lg overflow-hidden shadow-inner">
            <iframe
              className="w-full h-full"
              src="https://www.youtube.com/embed/s1IXx0GU2i4"
              title="Build Your OWN React Inventory Management System NOW!"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            ></iframe>
          </div>
          <p className="text-sm text-gray-500 mt-4 text-center">
            Video: Build Your OWN React Inventory Management System NOW!<grok-card data-id="e193bb" data-type="citation_card"></grok-card>
          </p>
        </div>

        {/* No results */}
        {filteredSections.length === 0 && searchTerm && (
          <div className="text-center py-12 text-gray-500 bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="text-6xl mb-4 mx-auto">🔍</div>
            <p className="text-lg">No sections match your search. Try different keywords.</p>
          </div>
        )}

        {/* Sections */}
        <div className="space-y-4">
          {filteredSections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
                {/* Header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 transition-all duration-200"
                >
                  <div className="flex items-center space-x-3">
                    <Icon className="h-5 w-5 text-gray-500 flex-shrink-0" />
                    <span className="text-lg font-semibold text-gray-900">
                      {section.id}. {section.title}
                    </span>
                  </div>
                  {openSections.has(section.id) ? (
                    <ChevronUp className="h-5 w-5 text-gray-500 transition-transform duration-200" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500 transition-transform duration-200" />
                  )}
                </button>
                {/* Content */}
                {openSections.has(section.id) && (
                  <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
                    <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                      {section.content}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Results count */}
        {searchTerm && (
          <p className="mt-6 text-sm text-gray-500 text-right">
            Showing {filteredSections.length} of {sections.length} sections
          </p>
        )}
      </main>
    </div>
  );
};

export default SystemGuide;











WITH const
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRequestDetails, updateRequest, getItems } from '../api';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Edit, Save, X, Plus, Printer, DollarSign } from 'lucide-react';

interface RequestItem {
  id: number;
  request_id: number;
  item_id: number;
  quantity_requested: number | null;
  quantity_received: number | null;
  quantity_returned: number | null;
  item_name: string;
}

interface Approval {
  id: number;
  request_id: number;
  approver_name: string;
  signature: string;
  approved_at: string;
}

interface Rejection {
  id: number;
  request_id: number;
  rejector_name: string;
  reason: string;
  created_at: string;
}

interface RequestDetails {
  id: number;
  type?: 'material_request' | 'item_return';
  created_by: string;
  team_leader_name?: string;
  team_leader_phone?: string;
  project_name: string;
  isp_name?: string;
  location: string;
  deployment_type?: 'Deployment' | 'Maintenance';
  release_by: string | null;
  received_by: string | null;
  reason?: string;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  created_at: string;
  updated_at: string;
  items: RequestItem[];
  approvals: Approval[];
  rejections?: Rejection[];
}

interface EditableItem {
  id?: number;
  name: string;
  unitPrice?: number | null;
  requested?: number;
  received?: number;
  returned?: number;
}

const RequestDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [request, setRequest] = useState<RequestDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<RequestDetails>>({});
  const [allItems, setAllItems] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<EditableItem[]>([]);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [requestData, itemsData] = await Promise.all([
        getRequestDetails(id!),
        getItems()
      ]);
      
      const transformedItems = itemsData.map(item => ({
        ...item,
        unit_price: parseFloat(item.unit_price) || null
      }));
      
      setRequest(requestData);
      setEditData(requestData);
      setAllItems(transformedItems);
      setSelectedItems(
        requestData.items.map(item => {
          const inventoryItem = transformedItems.find(i => i.id === item.item_id);
          const base = {
            id: item.item_id,
            name: item.item_name,
            unitPrice: inventoryItem?.unit_price || null,
            requested: item.quantity_requested || 0,
            received: item.quantity_received || 0,
            returned: item.quantity_returned || 0
          };
          if (requestData.type === 'item_return') {
            base.returned = item.quantity_requested || 0;
          }
          return base;
        })
      );
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load request details",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field: keyof RequestDetails, value: any) => {
    setEditData({ ...editData, [field]: value });
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...selectedItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setSelectedItems(newItems);
  };

  const addItemRow = () => {
    const newItem: EditableItem = request?.type === 'item_return' 
      ? { name: '', id: undefined, unitPrice: null, returned: 0 } 
      : { name: '', id: undefined, unitPrice: null, requested: 0, received: 0, returned: 0 };
    setSelectedItems([...selectedItems, newItem]);
  };

  const removeItemRow = (index: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async () => {
    try {
      const isReturn = request?.type === 'item_return';
      const itemsToSave = selectedItems.map(item => ({
        id: item.id,
        name: item.name,
        ...(!isReturn ? { 
          requested: item.requested || 0,
          received: item.received || 0 
        } : { 
          returned: item.returned || 0 
        })
      }));
      await updateRequest(id!, {
        createdBy: editData.created_by,
        ...(isReturn ? { reason: editData.reason } : {
          teamLeaderName: editData.team_leader_name,
          teamLeaderPhone: editData.team_leader_phone,
          projectName: editData.project_name,
          ispName: editData.isp_name,
          location: editData.location,
          deployment: editData.deployment_type,
        }),
        items: itemsToSave
      });
      setEditing(false);
      await loadData();
      toast({
        title: "Success",
        description: "Request updated successfully",
      });
    } catch (error) {
      console.error('Error updating request:', error);
      toast({
        title: "Error",
        description: "Failed to update request",
        variant: "destructive"
      });
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditData(request!);
    setSelectedItems(
      request!.items.map(item => {
        const inventoryItem = allItems.find(i => i.id === item.item_id);
        const base = {
          id: item.item_id,
          name: item.item_name,
          unitPrice: inventoryItem?.unit_price || null,
          requested: item.quantity_requested || 0,
          received: item.quantity_received || 0,
          returned: item.quantity_returned || 0
        };
        if (request!.type === 'item_return') {
          base.returned = item.quantity_requested || 0;
        }
        return base;
      })
    );
  };

  const generateId = () => {
    const digits = '0123456789';
    let idStr = '';
    // Position 0: random digit
    idStr += digits[Math.floor(Math.random() * 10)];
    // Position 1: V
    idStr += 'V';
    // Position 2: random digit
    idStr += digits[Math.floor(Math.random() * 10)];
    // Position 3: random digit
    idStr += digits[Math.floor(Math.random() * 10)];
    // Position 4: i
    idStr += 'i';
    // Position 5: random digit
    idStr += digits[Math.floor(Math.random() * 10)];
    // Position 6: random digit
    idStr += digits[Math.floor(Math.random() * 10)];
    // Position 7: N
    idStr += 'N';
    return idStr;
  };

  const handlePrint = () => {
    const newId = generateId();
    const printContent = document.getElementById('print-content');
    if (printContent) {
      const idElement = printContent.querySelector('#form-id');
      if (idElement) {
        idElement.textContent = newId;
      }
      const originalContent = document.body.innerHTML;
      document.body.innerHTML = printContent.innerHTML;
      window.print();
      document.body.innerHTML = originalContent;
      window.location.reload();
    }
  };

  const calculateTotalCost = (itemsList: any[]) => {
    const total = itemsList.reduce((sum, item) => {
      const qty = item.quantity_received || item.received || 0;
      const price = item.unit_price || item.unitPrice || null;
      if (price !== null && price > 0) {
        return sum + (qty * price);
      }
      return sum;
    }, 0);
    return total > 0 ? total.toFixed(2) : 'N/A';
  };

  if (loading) {
    return <LoadingState />;
  }

  if (!request) {
    return <NotFoundState />;
  }

  const isReturn = request.type === 'item_return';
  const isEditable = request.status === 'pending';
  const statusConfig = getStatusConfig(request.status);
  const statusText = request.status.charAt(0).toUpperCase() + request.status.slice(1);
  const formTitle = isReturn ? 'ITEM RETURN FORM' : 'REQUEST FORM FOR MATERIALS';
  const requesterLabel = isReturn ? 'Returned by' : 'Requested by';
  const displayItems = editing ? selectedItems : request.items.map(item => ({
    ...item,
    unitPrice: allItems.find(i => i.id === item.item_id)?.unit_price || null
  }));
  const totalCost = !isReturn ? calculateTotalCost(displayItems) : 'N/A';

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Header - Screen Only */}
        <div className="mb-8 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="border-gray-300 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to List
          </Button>
          <div className="flex space-x-3">
            <ActionButtons
              isEditable={isEditable}
              editing={editing}
              onEdit={() => setEditing(true)}
              onCancel={handleCancelEdit}
              onSave={handleSaveEdit}
            />
            {request.status === 'completed' && (
              <Button 
                onClick={handlePrint} 
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            )}
          </div>
        </div>

        {/* Screen View */}
        <div className="bg-white rounded-lg shadow-md border border-gray-100 p-8" id="screen-content">
          {/* Logo and Title - Screen */}
          <div className="text-center mb-8 pb-8 border-b border-gray-200">
            <img 
              src="/vobiss-logo.png" 
              alt="VOBISS Logo" 
              className="h-16 mx-auto mb-4"
            />
            <h1 className="text-3xl font-bold text-gray-900">{formTitle}</h1>
          </div>

          <div className="flex justify-end mb-8">
            <StatusBadge status={statusText} config={statusConfig} />
          </div>

          {/* Project Information Section - Screen */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 border-b border-gray-200 pb-2">
              {isReturn ? 'Return Information' : 'Project Information'}
            </h2>
            <div className="bg-gray-50 rounded-lg p-6">
              <div className="mb-6 italic text-gray-600 text-center border-b border-gray-200 pb-3">
                <p className="text-lg">{requesterLabel}: <span className="font-semibold">{request.created_by}</span></p>
              </div>
              {editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {isReturn ? (
                    <>
                      <DetailField
                        label="Project Name"
                        value={editData.project_name}
                        editing={true}
                        onChange={(val) => handleFieldChange('project_name', val)}
                      />
                      <DetailField
                        label="Location"
                        value={editData.location}
                        editing={true}
                        onChange={(val) => handleFieldChange('location', val)}
                      />
                      <div className="lg:col-span-3">
                        <ReasonField
                          label="Return Reason"
                          value={editData.reason || ''}
                          editing={true}
                          onChange={(val) => handleFieldChange('reason', val)}
                        />
                      </div>
                      <DetailField
                        label="Received By"
                        value={request.received_by || 'N/A'}
                        editing={false}
                      />
                      <DateField
                        label="Created At"
                        value={request.created_at}
                      />
                      <DateField
                        label="Updated At"
                        value={request.updated_at}
                      />
                    </>
                  ) : (
                    <>
                      <DetailField
                        label="Project Name"
                        value={editData.project_name}
                        editing={true}
                        onChange={(val) => handleFieldChange('project_name', val)}
                      />
                      <DetailField
                        label="Team Leader Name"
                        value={editData.team_leader_name}
                        editing={true}
                        onChange={(val) => handleFieldChange('team_leader_name', val)}
                      />
                      <DetailField
                        label="Team Leader Phone"
                        value={editData.team_leader_phone}
                        editing={true}
                        onChange={(val) => handleFieldChange('team_leader_phone', val)}
                      />
                      <DetailField
                        label="ISP Name"
                        value={editData.isp_name || 'N/A'}
                        editing={true}
                        onChange={(val) => handleFieldChange('isp_name', val)}
                      />
                      <DetailField
                        label="Location"
                        value={editData.location}
                        editing={true}
                        onChange={(val) => handleFieldChange('location', val)}
                      />
                      <DeploymentTypeField
                        value={editData.deployment_type}
                        editing={true}
                        onChange={(val) => handleFieldChange('deployment_type', val)}
                      />
                      <DetailField
                        label="Received By"
                        value={request.received_by || 'N/A'}
                        editing={false}
                      />
                      <DateField
                        label="Created At"
                        value={request.created_at}
                      />
                      <DateField
                        label="Updated At"
                        value={request.updated_at}
                      />
                    </>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200">
                    <tbody className="bg-white divide-y divide-gray-200">
                      <tr>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 bg-gray-50">Project Name</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{editData.project_name || 'N/A'}</td>
                      </tr>
                      {!isReturn && (
                        <>
                          <tr className="bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">Team Leader Name</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{editData.team_leader_name || 'N/A'}</td>
                          </tr>
                          <tr>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 bg-gray-50">Team Leader Phone</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{editData.team_leader_phone || 'N/A'}</td>
                          </tr>
                          <tr className="bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">ISP Name</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{editData.isp_name || 'N/A'}</td>
                          </tr>
                        </>
                      )}
                      <tr>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 bg-gray-50">Location</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{editData.location || 'N/A'}</td>
                      </tr>
                      {isReturn && (
                        <tr className="bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">Return Reason</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{editData.reason || 'N/A'}</td>
                        </tr>
                      )}
                      {!isReturn && (
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 bg-gray-50">Project Type</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{editData.deployment_type || 'N/A'}</td>
                        </tr>
                      )}
                      <tr className="bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">Received By</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{request.received_by || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 bg-gray-50">Created At</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{new Date(request.created_at).toLocaleString()}</td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">Updated At</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{new Date(request.updated_at).toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              {!isReturn && totalCost !== 'N/A' && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-green-800">Total Project Cost</span>
                    <span className="text-lg font-bold text-green-900">${totalCost}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Items and History - Screen */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ItemsTable
              items={displayItems}
              editing={editing}
              allItems={allItems}
              onItemChange={handleItemChange}
              onRemoveRow={removeItemRow}
              onAddRow={addItemRow}
              isEditable={isEditable}
              isReturn={isReturn}
              totalCost={totalCost}
            />
            <HistorySection 
              approvals={request.approvals} 
              rejections={request.rejections} 
              releaseBy={request.release_by} 
            />
          </div>
        </div>
      </div>

      {/* Print Content - Hidden on Screen */}
      <div id="print-content" className="hidden">
        <div className="p-1 max-w-4xl mx-auto bg-white">
          {/* Header - Print */}
          <header className="mb-2 border-b border-gray-500 pb-1 flex items-start justify-between">
            <img 
              src="/vobiss-logo.png" 
              alt="VOBISS Logo" 
              className="h-14"
            />
            <div className="flex-1 text-center mx-1">
              <h1 className="text-xl font-bold uppercase tracking-wide text-gray-900">{formTitle}</h1>
            </div>
            <div className="text-right bg-gray-50 border border-gray-300 rounded px-1 py-0.5">
              <StatusBadgePrint status={statusText} config={statusConfig} />
            </div>
          </header>

          {/* Section 1: Project Information - Table Layout */}
          <section className="mb-2">
            <h2 className="text-base font-bold mb-1 border-b border-gray-300 pb-0.5 text-gray-800">
              {isReturn ? 'Return Information' : 'Project Information'}
            </h2>
            <div className="italic text-gray-600 mb-1 text-center border-b border-gray-200 pb-0.5 font-serif">
              <p className="text-sm">{requesterLabel}: <span className="font-medium text-gray-900">{request.created_by}</span></p>
            </div>
            <div className="overflow-hidden rounded border border-gray-300">
              <table className="w-full text-xs bg-white">
                <tbody>
                  <tr className="border-b border-gray-300">
                    <td className="font-bold border-r border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-900">Project Name</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{editData.project_name || 'N/A'}</td>
                  </tr>
                  {!isReturn && (
                    <>
                      <tr className="bg-gray-50 border-b border-gray-300">
                        <td className="font-bold border-r border-gray-300 px-3 py-1.5 text-gray-900">Team Leader Name</td>
                        <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{editData.team_leader_name || 'N/A'}</td>
                      </tr>
                      <tr className="border-b border-gray-300">
                        <td className="font-bold border-r border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-900">Team Leader Phone</td>
                        <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{editData.team_leader_phone || 'N/A'}</td>
                      </tr>
                      <tr className="bg-gray-50 border-b border-gray-300">
                        <td className="font-bold border-r border-gray-300 px-3 py-1.5 text-gray-900">ISP Name</td>
                        <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{editData.isp_name || 'N/A'}</td>
                      </tr>
                    </>
                  )}
                  <tr className="border-b border-gray-300">
                    <td className="font-bold border-r border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-900">Location</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{editData.location || 'N/A'}</td>
                  </tr>
                  {isReturn && (
                    <tr className="bg-gray-50 border-b border-gray-300">
                      <td className="font-bold border-r border-gray-300 px-3 py-1.5 text-gray-900">Return Reason</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{editData.reason || 'N/A'}</td>
                    </tr>
                  )}
                  {!isReturn && (
                    <tr className="border-b border-gray-300">
                      <td className="font-bold border-r border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-900">Project Type</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{editData.deployment_type || 'N/A'}</td>
                    </tr>
                  )}
                  <tr className="bg-gray-50 border-b border-gray-300">
                    <td className="font-bold border-r border-gray-300 px-3 py-1.5 text-gray-900">Received By</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{request.received_by || 'N/A'}</td>
                  </tr>
                  <tr className="border-b border-gray-300">
                    <td className="font-bold border-r border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-900">Created At</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{new Date(request.created_at).toLocaleString()}</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="font-bold border-r border-gray-300 px-3 py-1.5 text-gray-900">Updated At</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{new Date(request.updated_at).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {!isReturn && totalCost !== 'N/A' && (
              <div className="mt-2 text-right">
                <p className="text-sm font-bold text-gray-800">Total Project Cost: <span className="text-green-600">${totalCost}</span></p>
              </div>
            )}
          </section>

          <hr className="my-1 border-gray-300" />

          {/* Section 2: Items Table */}
          <section className="mb-2">
            <h2 className="text-base font-bold mb-1 border-b border-gray-300 pb-0.5 text-gray-800">Items</h2>
            <div className="overflow-hidden rounded border border-gray-300">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-1.5 text-left font-bold text-gray-900 uppercase tracking-wide text-xs">Item Name</th>
                    {!isReturn ? (
                      <>
                        <th className="border border-gray-300 px-3 py-1.5 text-left font-bold text-gray-900 uppercase tracking-wide text-xs">Requested</th>
                        <th className="border border-gray-300 px-3 py-1.5 text-left font-bold text-gray-900 uppercase tracking-wide text-xs">Received</th>
                        <th className="border border-gray-300 px-3 py-1.5 text-left font-bold text-gray-900 uppercase tracking-wide text-xs">Unit Price</th>
                        <th className="border border-gray-300 px-3 py-1.5 text-left font-bold text-gray-900 uppercase tracking-wide text-xs">Cost</th>
                      </>
                    ) : (
                      <th className="border border-gray-300 px-3 py-1.5 text-left font-bold text-gray-900 uppercase tracking-wide text-xs">Returned</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {request.items.map((item, index) => {
                    const unitPrice = allItems.find(i => i.id === item.item_id)?.unit_price || null;
                    const cost = unitPrice !== null && unitPrice > 0 ? `$${( (item.quantity_received || 0) * unitPrice ).toFixed(2)}` : 'N/A';
                    return (
                      <tr key={index}>
                        <td className="border border-gray-300 px-3 py-1.5 font-medium text-gray-900 text-xs">{item.item_name}</td>
                        {!isReturn ? (
                          <>
                            <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium text-xs">{item.quantity_requested || 0}</td>
                            <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium text-xs">{item.quantity_received || 0}</td>
                            <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium text-xs">{unitPrice !== null && unitPrice > 0 ? `$${unitPrice.toFixed(2)}` : 'N/A'}</td>
                            <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium text-xs">{cost}</td>
                          </>
                        ) : (
                          <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium text-xs">{item.quantity_requested || 0}</td>
                        )}
                      </tr>
                    );
                  })}
                  {!isReturn && totalCost !== 'N/A' && (
                    <tr className="bg-gray-50 font-bold">
                      <td colSpan={3} className="border border-gray-300 px-3 py-1.5 text-right text-xs text-gray-900">Total:</td>
                      <td className="border border-gray-300 px-3 py-1.5"></td>
                      <td className="border border-gray-300 px-3 py-1.5 text-gray-900">${totalCost}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 3: History */}
          <section className="mb-4">
            <h2 className="text-base font-bold mb-1 border-b border-gray-300 pb-0.5 text-gray-800">History</h2>
            <div className="border border-gray-300 rounded p-2 bg-gray-50 text-xs">
              {request.release_by && (
                <div className="mb-2 pb-1 border-b border-gray-200">
                  <div className="flex mb-0.5 font-bold text-gray-900"><span className="w-16">Issuer:</span><span className="ml-1">{request.release_by}</span></div>
                  <div className="flex text-gray-700"><span className="w-16">Date:</span><span className="ml-1 font-medium">{new Date(request.updated_at).toLocaleString()}</span></div>
                </div>
              )}
              {request.approvals.length > 0 && (
                <div className="mb-2 pb-1 border-b border-gray-200">
                  <h3 className="font-bold text-blue-900 mb-1">Approvals</h3>
                  {request.approvals.map((approval, index) => (
                    <div key={approval.id} className={`pb-2 ${index < request.approvals.length - 1 ? 'border-b border-gray-200 mb-2' : ''}`}>
                      <div className="flex mb-0.5 font-bold text-gray-900"><span className="w-16">Approver:</span><span className="ml-1">{approval.approver_name}</span></div>
                      <div className="flex mb-0.5 text-gray-700"><span className="w-16 font-medium">Signature:</span><span className="ml-1 italic">{approval.signature}</span></div>
                      <div className="flex text-gray-700"><span className="w-16">Date:</span><span className="ml-1 font-medium">{new Date(approval.approved_at).toLocaleString()}</span></div>
                    </div>
                  ))}
                </div>
              )}
              {request.rejections && request.rejections.length > 0 ? (
                <div className="mb-2 pb-1 border-b border-gray-200">
                  <h3 className="font-bold text-red-900 mb-1">Rejections</h3>
                  {request.rejections.map((rejection, index) => (
                    <div key={rejection.id} className={`pb-2 ${index < request.rejections!.length - 1 ? 'border-b border-gray-200 mb-2' : ''}`}>
                      <div className="flex mb-0.5 font-bold text-red-900"><span className="w-16">Rejector:</span><span className="ml-1">{rejection.rejector_name}</span></div>
                      <div className="flex mb-0.5 text-red-700"><span className="w-16 font-medium">Reason:</span><span className="ml-1 italic">{rejection.reason}</span></div>
                      <div className="flex text-red-700"><span className="w-16">Date:</span><span className="ml-1 font-medium">{new Date(rejection.created_at).toLocaleString()}</span></div>
                    </div>
                  ))}
                </div>
              ) : null}
              {(!request.approvals.length && (!request.rejections || request.rejections.length === 0)) && (
                <p className="italic text-gray-500 text-center py-2 font-serif">No history recorded yet</p>
              )}
            </div>
          </section>

          {/* Form ID */}
          <div className="mt-4 text-center italic text-xs text-gray-500 border-t border-gray-300 pt-1">
            Form ID: <span id="form-id">TEMP</span>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-content, #print-content * {
            visibility: visible;
          }
          #print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          #screen-content {
            display: none !important;
          }
          .toast {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
            @top-left {
              content: none;
            }
            @top-center {
              content: none;
            }
            @top-right {
              content: none;
            }
            @bottom-left {
              content: none;
            }
            @bottom-center {
              content: none;
            }
            @bottom-right {
              content: none;
            }
            @left-middle {
              content: none;
            }
            @right-middle {
              content: none;
            }
          }
          body {
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
          }
          #print-content {
            font-family: 'Times New Roman', serif;
            line-height: 1.2;
            font-size: 10pt;
          }
          table {
            page-break-inside: avoid;
          }
          h1, h2 {
            page-break-after: avoid;
          }
        }
      `}</style>
    </div>
  );
};

/* Helper Components - Updated for Print */

const LoadingState: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-600 mx-auto mb-4"></div>
      <p className="text-gray-600 font-medium">Loading request details...</p>
    </div>
  </div>
);

const NotFoundState: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <p className="text-gray-600 font-medium">Request not found</p>
  </div>
);

interface ActionButtonsProps {
  isEditable: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({
  isEditable,
  editing,
  onEdit,
  onCancel,
  onSave
}) => {
  if (!isEditable) return null;

  return (
    <div className="flex space-x-3">
      {!editing ? (
        <Button onClick={onEdit} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Edit className="h-4 w-4 mr-2" />
          Edit Details
        </Button>
      ) : (
        <>
          <Button onClick={onCancel} variant="outline" className="border-gray-300 hover:bg-gray-100">
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={onSave} className="bg-green-600 hover:bg-green-700 text-white">
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </>
      )}
    </div>
  );
};

interface StatusConfig {
  bg: string;
  text: string;
  border: string;
}

function getStatusConfig(status: string): StatusConfig {
  const configs: Record<string, StatusConfig> = {
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
    approved: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
    completed: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
    rejected: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' }
  };
  return configs[status] || { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' };
}

interface StatusBadgeProps {
  status: string;
  config: StatusConfig;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, config }) => (
  <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium ${config.bg} ${config.text} border ${config.border}`}>
    {status}
  </span>
);

const StatusBadgePrint: React.FC<StatusBadgeProps> = ({ status, config }) => (
  <div className={`px-1 py-0.5 rounded text-xs font-medium ${config.bg} ${config.text} border ${config.border} inline-block uppercase font-bold`}>
    {status}
  </div>
);

interface DetailFieldProps {
  label: string;
  value: any;
  editing?: boolean;
  onChange?: (value: any) => void;
}

const DetailField: React.FC<DetailFieldProps> = ({ label, value, editing, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600">{label}</label>
    {editing && onChange ? (
      <Input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
      />
    ) : (
      <p className="mt-1 text-base font-medium text-gray-800">{value}</p>
    )}
  </div>
);

interface ReasonFieldProps {
  label: string;
  value: string;
  editing?: boolean;
  onChange?: (value: string) => void;
}

const ReasonField: React.FC<ReasonFieldProps> = ({ label, value, editing, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600">{label}</label>
    {editing && onChange ? (
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 min-h-[80px]"
      />
    ) : (
      <p className="mt-1 text-base font-medium text-gray-800">{value}</p>
    )}
  </div>
);

interface DeploymentTypeFieldProps {
  value: string | undefined;
  editing: boolean;
  onChange: (value: string) => void;
}

const DeploymentTypeField: React.FC<DeploymentTypeFieldProps> = ({ value, editing, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600">Project Type</label>
    {editing ? (
      <Select value={value || ''} onValueChange={onChange}>
        <SelectTrigger className="mt-1 w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Deployment">Deployment</SelectItem>
          <SelectItem value="Maintenance">Maintenance</SelectItem>
        </SelectContent>
      </Select>
    ) : (
      <p className="mt-1 text-base font-medium text-gray-800">{value}</p>
    )}
  </div>
);

interface DateFieldProps {
  label: string;
  value: string;
}

const DateField: React.FC<DateFieldProps> = ({ label, value }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600">{label}</label>
    <p className="mt-1 text-sm text-gray-600">{new Date(value).toLocaleString()}</p>
  </div>
);

interface ItemsTableProps {
  items: any[];
  editing: boolean;
  allItems: any[];
  onItemChange: (index: number, field: string, value: any) => void;
  onRemoveRow: (index: number) => void;
  onAddRow: () => void;
  isEditable: boolean;
  isReturn: boolean;
  totalCost: string;
}

const ItemsTable: React.FC<ItemsTableProps> = ({
  items,
  editing,
  allItems,
  onItemChange,
  onRemoveRow,
  onAddRow,
  isEditable,
  isReturn,
  totalCost
}) => (
  <div>
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-gray-800">Items</h2>
      {isEditable && editing && (
        <Button onClick={onAddRow} variant="ghost" size="sm" className="text-blue-600 hover:text-blue-800">
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
    <div className="bg-gray-50 rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Item Name</th>
            {!isReturn ? (
              <>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Requested</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Received</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Unit Price</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Cost</th>
              </>
            ) : (
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Returned</th>
            )}
            {editing && <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Actions</th>}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {items.map((item: any, index: number) => (
            <ItemRow
              key={index}
              index={index}
              item={item}
              editing={editing}
              allItems={allItems}
              onItemChange={onItemChange}
              onRemoveRow={onRemoveRow}
              isReturn={isReturn}
            />
          ))}
          {!isReturn && totalCost !== 'N/A' && (
            <tr className="bg-green-50 font-bold">
              <td colSpan={editing ? 5 : 4} className="px-4 py-3 text-right text-sm text-gray-700">Total Cost:</td>
              <td className="px-4 py-3 text-sm text-green-900">${totalCost}</td>
              {editing && <td colSpan={1}></td>}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

interface ItemRowProps {
  index: number;
  item: any;
  editing: boolean;
  allItems: any[];
  onItemChange: (index: number, field: string, value: any) => void;
  onRemoveRow: (index: number) => void;
  isReturn: boolean;
}

const ItemRow: React.FC<ItemRowProps> = ({
  index,
  item,
  editing,
  allItems,
  onItemChange,
  onRemoveRow,
  isReturn
}) => {
  const handleItemSelect = (val: string) => {
    const selected = allItems.find(i => i.id === parseInt(val));
    if (selected) {
      onItemChange(index, 'id', selected.id);
      onItemChange(index, 'name', selected.name);
      onItemChange(index, 'unitPrice', selected.unit_price || null);
    }
  };

  const getItemCost = () => {
    const qty = item.received || item.quantity_received || 0;
    const price = item.unitPrice || item.unit_price || null;
    if (price !== null && price > 0 && qty > 0) {
      return `$${(qty * price).toFixed(2)}`;
    }
    return 'N/A';
  };

  const getUnitPriceDisplay = () => {
    const price = item.unitPrice || item.unit_price || null;
    return price !== null && price > 0 ? `$${price.toFixed(2)}` : 'N/A';
  };

  return (
    <tr className="hover:bg-gray-50">
      {editing ? (
        <>
          <td className="px-4 py-3">
            <Select value={item.id ? item.id.toString() : ''} onValueChange={handleItemSelect}>
              <SelectTrigger className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500">
                <SelectValue placeholder="Select item" />
              </SelectTrigger>
              <SelectContent>
                {allItems.map((i) => (
                  <SelectItem key={i.id} value={i.id.toString()}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </td>
          {!isReturn ? (
            <>
              <td className="px-4 py-3">
                <Input
                  type="number"
                  value={item.requested}
                  onChange={(e) => onItemChange(index, 'requested', parseInt(e.target.value) || 0)}
                  className="w-20 rounded-md border-gray-300"
                  min="0"
                />
              </td>
              <td className="px-4 py-3">
                <Input
                  type="number"
                  value={item.received || 0}
                  onChange={(e) => onItemChange(index, 'received', parseInt(e.target.value) || 0)}
                  className="w-20 rounded-md border-gray-300"
                  min="0"
                />
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">{getUnitPriceDisplay()}</td>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">{getItemCost()}</td>
            </>
          ) : (
            <td className="px-4 py-3">
              <Input
                type="number"
                value={item.returned || 0}
                onChange={(e) => onItemChange(index, 'returned', parseInt(e.target.value) || 0)}
                className="w-20 rounded-md border-gray-300"
                min="0"
              />
            </td>
          )}
          <td className="px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onRemoveRow(index)}
              className="text-red-500 hover:bg-red-50"
            >
              <X className="h-4 w-4" />
            </Button>
          </td>
        </>
      ) : (
        <>
          <td className="px-4 py-3 text-sm font-medium text-gray-800">{item.item_name || item.name}</td>
          {!isReturn ? (
            <>
              <td className="px-4 py-3 text-sm text-gray-800">{item.quantity_requested || item.requested || 0}</td>
              <td className="px-4 py-3 text-sm text-gray-800">{item.quantity_received || item.received || 0}</td>
              <td className="px-4 py-3 text-sm text-gray-800">{getUnitPriceDisplay()}</td>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">{getItemCost()}</td>
            </>
          ) : (
            <td className="px-4 py-3 text-sm text-gray-800">{isReturn ? (item.quantity_requested || item.returned || 0) : (item.quantity_returned || item.returned || 0)}</td>
          )}
        </>
      )}
    </tr>
  );
};

interface HistorySectionProps {
  approvals: any[];
  rejections?: any[];
  releaseBy?: string | null;
}

const HistorySection: React.FC<HistorySectionProps> = ({ approvals, rejections, releaseBy }) => (
  <div>
    <h2 className="text-lg font-semibold text-gray-800 mb-4">History</h2>
    <div className="bg-gray-50 rounded-lg shadow-sm border border-gray-100 p-4">
      {releaseBy && (
        <div className="mb-3 pb-3 border-b border-gray-200">
          <p className="text-sm font-medium text-gray-800">Issuer: {releaseBy}</p>
        </div>
      )}
      {approvals.length > 0 && (
        <div className="mb-3 pb-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">Approvals</h3>
          {approvals.map((approval) => (
            <div key={approval.id} className="border-l-4 border-blue-500 pl-4 py-2 mb-3 bg-blue-50 rounded">
              <p className="text-sm font-medium text-gray-800">{approval.approver_name}</p>
              <p className="text-sm text-gray-600">Signature: {approval.signature}</p>
              <p className="text-sm text-gray-600">Approved: {new Date(approval.approved_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
      {rejections && rejections.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-800 mb-2">Rejections</h3>
          {rejections.map((rejection) => (
            <div key={rejection.id} className="border-l-4 border-red-500 pl-4 py-2 mb-3 bg-red-50 rounded">
              <p className="text-sm font-medium text-red-800">Rejected by: {rejection.rejector_name}</p>
              <p className="text-sm text-red-600"><strong>Reason:</strong> {rejection.reason}</p>
              <p className="text-sm text-red-600">Rejected: {new Date(rejection.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
      {(!approvals.length && (!rejections || rejections.length === 0)) && (
        <p className="text-gray-600 italic text-center py-4">No history recorded yet</p>
      )}
    </div>
  </div>
);

export default RequestDetails;