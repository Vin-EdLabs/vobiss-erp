// src/pages/finance/CashDetails.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  ArrowLeft, 
  Clock, 
  UserCheck, 
  DollarSign, 
  CheckCircle, 
  XCircle,
  Download,
  User,
  Users,
  Eye,
  List as ListIcon 
} from 'lucide-react';
import { getRequestDetails, markCashAsReceived } from '../../api';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from '../../context/AuthContext';
import { RecordChatButton } from '@/components/chat/RecordChatButton';
import { pdf } from '@react-pdf/renderer';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

// Compact & Beautiful PDF Styles - Fits perfectly on ONE A4 page
const styles = StyleSheet.create({
  page: { 
    paddingHorizontal: 35, 
    paddingVertical: 40, 
    fontSize: 10, 
    fontFamily: 'Helvetica',
    lineHeight: 1.4
  },
  header: { 
    textAlign: 'center', 
    marginBottom: 20 
  },
  logo: { 
    width: 85, 
    height: 'auto', 
    marginBottom: 10, 
    alignSelf: 'center' 
  },
  title: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    marginBottom: 6 
  },
  subtitle: { 
    fontSize: 10, 
    color: '#555', 
    marginBottom: 10 
  },
  statusBadge: { 
    alignSelf: 'center', 
    backgroundColor: '#e0f2fe', 
    paddingHorizontal: 12, 
    paddingVertical: 5, 
    borderRadius: 20, 
    marginTop: 8
  },
  statusText: { 
    fontSize: 10, 
    fontWeight: 'bold', 
    color: '#0369a1' 
  },
  section: { 
    marginBottom: 14 
  },
  sectionTitle: { 
    fontSize: 13, 
    fontWeight: 'bold', 
    marginBottom: 8, 
    borderBottomWidth: 1.5, 
    borderBottomColor: '#1e40af', 
    paddingBottom: 4 
  },
  grid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    marginHorizontal: -5 
  },
  gridItem: { 
    width: '50%', 
    paddingHorizontal: 5, 
    marginBottom: 8 
  },
  label: { 
    color: '#4b5563', 
    fontSize: 9 
  },
  value: { 
    fontSize: 11.5, 
    fontWeight: 'bold',
    color: '#1f2937'
  },
  amountSection: { 
    alignItems: 'flex-end', 
    marginVertical: 18 
  },
  amountLabel: { 
    fontSize: 14, 
    color: '#374151' 
  },
  amountValue: { 
    fontSize: 34, 
    fontWeight: 'bold', 
    color: '#059669',
    marginTop: 4
  },
  receivedBox: { 
    marginTop: 14, 
    paddingTop: 14, 
    borderTopWidth: 1.5, 
    borderTopColor: '#059669',
    alignItems: 'flex-end'
  },
  table: { 
    width: '100%', 
    borderWidth: 1, 
    borderColor: '#374151',
    marginTop: 4
  },
  tableHeader: { 
    backgroundColor: '#eff6ff', 
    flexDirection: 'row' 
  },
  tableRow: { 
    flexDirection: 'row' 
  },
  tableCell: { 
    paddingVertical: 7, 
    paddingHorizontal: 6, 
    borderWidth: 1, 
    borderColor: '#374151', 
    fontSize: 9.5 
  },
  tableHeaderCell: { 
    fontWeight: 'bold', 
    backgroundColor: '#dbeafe' 
  },
  tableRight: { 
    textAlign: 'right' 
  },
  tableCenter: { 
    textAlign: 'center' 
  },
  totalRow: { 
    backgroundColor: '#d1fae5', 
    fontWeight: 'bold', 
    fontSize: 13 
  },
  historyItem: { 
    marginBottom: 10, 
    fontSize: 9.5 
  },
  footer: { 
    position: 'absolute', 
    bottom: 30, 
    left: 35, 
    right: 35, 
    textAlign: 'center', 
    color: '#6b7280', 
    fontSize: 9, 
    borderTopWidth: 1, 
    borderTopColor: '#9ca3af', 
    paddingTop: 8 
  },
});

const PDFDocument = ({ request }: { request: CashRequestDetails }) => {
  const formatAmountGHS = (amount: number | null | undefined) => {
    if (!amount) return 'GHS 0.00';
    return `GHS ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Image style={styles.logo} src="/vobiss-logo.png" />
          <Text style={styles.title}>Cash  Request</Text>
          <Text style={styles.subtitle}>
            Request ID: #{request.id} • Requested on {formatDateTime(request.created_at)}
          </Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              {request.status.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Request Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Request Details</Text>
          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Requestor</Text>
              <Text style={styles.value}>{request.created_by}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Department</Text>
              <Text style={styles.value}>{request.department || '—'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Purpose</Text>
              <Text style={styles.value}>{request.purpose || '—'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Date Needed</Text>
              <Text style={styles.value}>
                {request.date_needed ? new Date(request.date_needed).toLocaleDateString('en-GB') : '—'}
              </Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Deliver To</Text>
              <Text style={styles.value}>{request.deliver_to || '—'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Contact Phone</Text>
              <Text style={styles.value}>{request.deliver_phone || '—'}</Text>
            </View>
            <View style={{ width: '100%', paddingHorizontal: 5 }}>
              <Text style={styles.label}>Special Instructions</Text>
              <Text style={styles.value}>{request.special_instructions || '—'}</Text>
            </View>
          </View>
        </View>

        {/* Total Amount */}
        <View style={styles.amountSection}>
          <Text style={styles.amountLabel}>Total Amount Requested</Text>
          <Text style={styles.amountValue}>{formatAmountGHS(request.total_amount)}</Text>
          {request.received_at && (
            <View style={styles.receivedBox}>
              <Text style={styles.label}>Cash Received On</Text>
              <Text style={{ fontSize: 16, fontWeight: 'bold', marginTop: 4 }}>
                {formatDateTime(request.received_at)}
              </Text>
              {request.received_by && (
                <Text style={{ fontSize: 13, marginTop: 6 }}>
                  Confirmed by: <Text style={{ fontWeight: 'bold' }}>{request.received_by}</Text>
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Expense Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Expense Breakdown</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, styles.tableHeaderCell, { width: '45%' }]}>Item Description</Text>
              <Text style={[styles.tableCell, styles.tableHeaderCell, styles.tableCenter, { width: '10%' }]}>Qty</Text>
              <Text style={[styles.tableCell, styles.tableHeaderCell, styles.tableRight, { width: '22.5%' }]}>Unit Price</Text>
              <Text style={[styles.tableCell, styles.tableHeaderCell, styles.tableRight, { width: '22.5%' }]}>Total</Text>
            </View>
            {request.expenses.length === 0 ? (
              <View style={styles.tableRow}>
                <Text style={[styles.tableCell, { width: '100%', textAlign: 'center', paddingVertical: 12 }]}>
                  No expense items specified
                </Text>
              </View>
            ) : (
              request.expenses.map((exp, i) => (
                <View style={styles.tableRow} key={i}>
                  <Text style={[styles.tableCell, { width: '45%' }]}>{exp.description}</Text>
                  <Text style={[styles.tableCell, styles.tableCenter, { width: '10%' }]}>{exp.qty}</Text>
                  <Text style={[styles.tableCell, styles.tableRight, { width: '22.5%' }]}>{formatAmountGHS(exp.unit_price)}</Text>
                  <Text style={[styles.tableCell, styles.tableRight, { width: '22.5%' }]}>{formatAmountGHS(exp.total)}</Text>
                </View>
              ))
            )}
            <View style={[styles.tableRow, styles.totalRow]}>
              <Text style={[styles.tableCell, { width: '77.5%' }]}>TOTAL AMOUNT</Text>
              <Text style={[styles.tableCell, styles.tableRight]}>{formatAmountGHS(request.total_amount)}</Text>
            </View>
          </View>
        </View>

        {/* Approval History - Compact */}
        {(request.approvals.length > 0 || request.rejections.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Approval History</Text>
            {request.approvals.map((approval) => {
              const isFinanceIssue = approval.approval_stage === 'finance';
              return (
                <View style={styles.historyItem} key={approval.id}>
                  <Text style={{ color: isFinanceIssue ? '#047857' : '#059669', fontWeight: 'bold', fontSize: 10 }}>
                    ✓ {isFinanceIssue ? 'Cash Issued' : `${approval.approval_stage === 'director' ? 'Director' : 'Supervisor'} Approval`}
                  </Text>
                  <Text style={{ fontSize: 9, marginTop: 2 }}>
                    {isFinanceIssue ? 'Issued by' : 'By'} {approval.approver_name} • {formatDateTime(approval.created_at)}
                  </Text>
                  {approval.signature && <Text style={{ fontSize: 9, fontStyle: 'italic', marginTop: 2 }}>"{approval.signature}"</Text>}
                </View>
              );
            })}
            {request.rejections.map((rejection) => (
              <View style={styles.historyItem} key={rejection.id}>
                <Text style={{ color: '#dc2626', fontWeight: 'bold', fontSize: 10 }}>
                  ✗ Rejected
                </Text>
                <Text style={{ fontSize: 9, marginTop: 2 }}>
                  By {rejection.rejector_name} • {formatDateTime(rejection.created_at)}
                </Text>
                <Text style={{ fontSize: 9 }}>Reason: {rejection.reason}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>This is an official cash advance request document.</Text>
          <Text>Generated on {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
        </View>
      </Page>
    </Document>
  );
};

const formatDateTime = (dateString: string | null | undefined): string => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatAmount = (amount: number | string | null | undefined): string => {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
};

interface Approval {
  id: number;
  approver_name: string;
  signature: string;
  approval_stage: 'supervisor' | 'finance' | 'director';
  created_at: string;
}

interface Rejection {
  id: number;
  rejector_name: string;
  reason: string;
  created_at: string;
}

interface CashExpense {
  id?: number;
  description: string;
  qty: number;
  unit_price: number;
  total: number;
}

interface CashRequestDetails {
  id: number;
  type: 'cash_request';
  created_by: string;
  department?: string | null;
  purpose?: string | null;
  deliver_to?: string | null;
  deliver_phone?: string | null;
  special_instructions?: string | null;
  date_needed?: string | null;
  total_amount?: number | null;
  received_by?: string | null;
  received_at?: string | null;
  status: 'pending' | 'supervisor_approved' | 'finance_approved' | 'completed' | 'rejected';
  created_at: string;
  updated_at: string;
  expenses: CashExpense[];
  approvals: Approval[];
  rejections: Rejection[];
  chat_channel_id?: string | null;
}

const getStatusBadge = (status: string) => {
  const variants: Record<string, { icon: JSX.Element; color: string; bg: string; text: string }> = {
    pending: { 
      icon: <Clock className="h-4 w-4" />, 
      color: 'text-yellow-800', 
      bg: 'bg-yellow-100', 
      text: 'Pending Supervisor' 
    },
    supervisor_approved: { 
      icon: <UserCheck className="h-4 w-4" />, 
      color: 'text-blue-800', 
      bg: 'bg-blue-100', 
      text: 'Supervisor Approved' 
    },
    finance_approved: { 
      icon: <DollarSign className="h-4 w-4" />, 
      color: 'text-indigo-800', 
      bg: 'bg-indigo-100', 
      text: 'Cash Released' 
    },
    completed: { 
      icon: <CheckCircle className="h-4 w-4" />, 
      color: 'text-green-800', 
      bg: 'bg-green-100', 
      text: 'Completed' 
    },
    rejected: { 
      icon: <XCircle className="h-4 w-4" />, 
      color: 'text-red-800', 
      bg: 'bg-red-100', 
      text: 'Rejected' 
    }
  };
  const config = variants[status] || variants.pending;
  return (
    <Badge className={`${config.bg} ${config.color} px-3 py-1.5 font-medium rounded-full flex items-center gap-1.5`}>
      {config.icon}
      <span>{config.text}</span>
    </Badge>
  );
};

const CashDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const navState = location.state as { returnTo?: string; returnLabel?: string } | null;
  const returnFromQuery = new URLSearchParams(location.search).get('from');
  const backPath = navState?.returnTo || returnFromQuery || null;
  const backLabel = navState?.returnLabel || 'Back';
  const { toast } = useToast();

  const [request, setRequest] = useState<CashRequestDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingReceived, setMarkingReceived] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getRequestDetails(id!);
      if (data.type !== 'cash_request') {
        toast({ title: "Error", description: "Not a cash request", variant: "destructive" });
        navigate('/requests');
        return;
      }
      setRequest(data);
    } catch (error) {
      console.error('Error loading cash request:', error);
      toast({ title: "Error", description: "Failed to load request", variant: "destructive" });
      navigate('/requests');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkReceived = async () => {
    if (!request || !user) return;
    setMarkingReceived(true);
    try {
      const receivedBy = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'Unknown';
      await markCashAsReceived(request.id, receivedBy);
      toast({ title: "✅ Confirmed", description: "You've confirmed receipt of cash.", variant: "default" });
      loadData();
    } catch (error: any) {
      toast({ title: "❌ Error", description: error.message || "Failed to confirm receipt", variant: "destructive" });
    } finally {
      setMarkingReceived(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!request) {
      toast({ title: "Error", description: "No data available", variant: "destructive" });
      return;
    }
    setGeneratingPdf(true);

    try {
      const blob = await pdf(<PDFDocument request={request} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Cash_Advance_Request_${request.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({ title: "Success", description: "PDF downloaded successfully!" });
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast({ title: "Error", description: "Failed to generate PDF. Please try again.", variant: "destructive" });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const isRequester = useMemo(() => {
    if (!request || !user) return false;
    
    const createdByLower = (request.created_by || '').toLowerCase().trim();
    const usernameLower = (user.username || '').toLowerCase();
    const firstNameLower = (user.first_name || '').toLowerCase();
    const lastNameLower = (user.last_name || '').toLowerCase();
    const fullNameLower = `${firstNameLower} ${lastNameLower}`.trim();

    return createdByLower.includes(usernameLower) ||
           createdByLower.includes(firstNameLower) ||
           createdByLower.includes(lastNameLower) ||
           createdByLower.includes(fullNameLower) ||
           usernameLower.includes(createdByLower);
  }, [request, user]);

  const canConfirm = isRequester && request?.status === 'finance_approved' && !request?.received_at;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading request...</p>
        </div>
      </div>
    );
  }

  if (!request) {
    return <div className="text-center py-12 text-gray-600">Request not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <Button 
            variant="outline" 
            onClick={() => (backPath ? navigate(backPath) : navigate(-1))}
            className="border-gray-300 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            {backLabel}
          </Button>

          <div className="flex flex-wrap items-center gap-4">
            {request && (
              <RecordChatButton
                recordType="cash_request"
                recordId={request.id}
                chatChannelId={request.chat_channel_id}
              />
            )}
            {canConfirm && (
              <div className="bg-green-50 border-2 border-green-300 rounded-xl p-5 shadow-lg">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="text-center sm:text-left">
                    <p className="text-lg font-bold text-green-900">
                      💰 Cash Released by Finance!
                    </p>
                    <p className="text-sm text-green-700 mt-1">
                      Amount: <strong>{formatAmount(request.total_amount)}</strong>
                    </p>
                    <p className="text-xs text-green-600 mt-2">
                      Please confirm once you have received the cash.
                    </p>
                  </div>
                  <Button
                    onClick={handleMarkReceived}
                    disabled={markingReceived}
                    size="lg"
                    className="bg-green-600 hover:bg-green-700 text-white font-bold px-8 py-6 shadow-xl"
                  >
                    {markingReceived ? (
                      <>
                        <Clock className="h-5 w-5 mr-2 animate-spin" />
                        Confirming...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-6 w-6 mr-3" />
                        Confirm I Received the Cash
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
            <Button 
              onClick={handleDownloadPDF}
              disabled={generatingPdf}
              variant="default"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {generatingPdf ? (
                <>
                  <Clock className="h-5 w-5 mr-2 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Request Banner */}
        <Card className="mb-6 border-l-4 border-blue-500">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <img src="/vobiss-logo.png" alt="VOBISS" className="h-10" />
                  <h1 className="text-2xl font-bold text-gray-900">Cash  Request</h1>
                </div>
                <p className="text-gray-600 mt-1">#{request.id} • {formatDateTime(request.created_at)}</p>
              </div>
              <div className="flex-shrink-0">
                {getStatusBadge(request.status)}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Status Tracker */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center">
              <Eye className="h-5 w-5 mr-2 text-gray-500" />
              Request Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center mb-8">
              {['Supervisor', 'Finance', 'Received'].map((step, i) => {
                let isActive = false;
                let isCompleted = false;

                if (i === 0) {
                  isCompleted = ['supervisor_approved', 'finance_approved', 'completed'].includes(request.status);
                  isActive = request.status === 'pending';
                } else if (i === 1) {
                  isCompleted = ['finance_approved', 'completed'].includes(request.status);
                  isActive = request.status === 'supervisor_approved';
                } else {
                  isCompleted = request.status === 'completed';
                  isActive = request.status === 'finance_approved';
                }

                return (
                  <div key={step} className="flex flex-col items-center flex-1">
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
                        isCompleted ? 'bg-green-500' : 
                        isActive ? 'bg-blue-500' : 
                        'bg-gray-300'
                      }`}>
                        {isCompleted ? <CheckCircle className="h-6 w-6" /> : i + 1}
                      </div>
                      {i < 2 && (
                        <div className={`absolute top-6 left-12 w-full h-1 -z-10 ${
                          (i === 0 && ['supervisor_approved', 'finance_approved', 'completed'].includes(request.status)) ||
                          (i === 1 && ['finance_approved', 'completed'].includes(request.status))
                            ? 'bg-green-500' : 'bg-gray-300'
                        }`} />
                      )}
                    </div>
                    <span className={`mt-3 text-sm font-medium ${
                      isCompleted ? 'text-green-700' : 
                      isActive ? 'text-blue-700' : 
                      'text-gray-500'
                    }`}>
                      {step}
                    </span>
                    {i === 2 && request.received_by && request.status === 'completed' && (
                      <span className="mt-1 text-xs text-green-600 max-w-32 truncate">
                        by {request.received_by}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {request.status === 'pending' && (
              <div className="mt-4 p-4 bg-yellow-50 rounded-lg text-yellow-800">
                <Clock className="inline h-5 w-5 mr-2" /> Awaiting supervisor approval
              </div>
            )}
            {request.status === 'supervisor_approved' && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg text-blue-800">
                <UserCheck className="inline h-5 w-5 mr-2" /> Supervisor approved → Awaiting finance release
              </div>
            )}
            {request.status === 'finance_approved' && (
              <div className={`mt-8 p-6 rounded-2xl border-4 text-center ${
                canConfirm 
                  ? 'bg-green-50 border-green-300 shadow-2xl' 
                  : 'bg-indigo-50 border-indigo-300'
              }`}>
                <div className="flex flex-col items-center gap-4">
                  <div className={`p-4 rounded-full ${canConfirm ? 'bg-green-100' : 'bg-indigo-100'}`}>
                    {canConfirm ? (
                      <CheckCircle className="h-12 w-12 text-green-700" />
                    ) : (
                      <DollarSign className="h-12 w-12 text-indigo-700" />
                    )}
                  </div>
                  {canConfirm ? (
                    <>
                      <h3 className="text-2xl font-bold text-green-900">Cash is Ready!</h3>
                      <p className="text-lg text-green-800">
                        Finance has approved and released <strong>{formatAmount(request.total_amount)}</strong>
                      </p>
                      <p className="text-sm font-medium text-green-700 bg-white px-6 py-3 rounded-full shadow">
                        Use the green "Confirm Receipt" button above when you receive the cash
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-xl font-bold text-indigo-900">Cash Released</h3>
                      <p className="text-indigo-800">
                        Awaiting confirmation from <strong>{request.created_by}</strong>
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
            {request.status === 'rejected' && request.rejections.length > 0 && (
              <div className="mt-4 p-4 bg-red-50 rounded-lg">
                <p className="text-red-800 flex items-start gap-2">
                  <XCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <span>
                    Rejected by <strong>{request.rejections[0].rejector_name}</strong> on {formatDateTime(request.rejections[0].created_at)}:<br/>
                    <em className="text-sm">"{request.rejections[0].reason}"</em>
                  </span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Request Info & Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="h-5 w-5 mr-2 text-gray-500" />
                Request Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Requestor</p>
                  <p className="font-medium">{request.created_by}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Department</p>
                  <p className="font-medium">{request.department || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Purpose</p>
                  <p className="font-medium">{request.purpose || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Deliver To</p>
                  <p className="font-medium">{request.deliver_to || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <p className="font-medium">{request.deliver_phone || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Date Needed</p>
                  <p className="font-medium">
                    {request.date_needed ? new Date(request.date_needed).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500">Special Instructions</p>
                  <p className="font-medium">{request.special_instructions || '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <DollarSign className="h-5 w-5 mr-2 text-gray-500" />
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Requested</span>
                <span className="font-semibold">{formatDateTime(request.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="font-bold text-lg text-green-700">{formatAmount(request.total_amount)}</span>
              </div>
              {request.received_at && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Received</span>
                    <span>{formatDateTime(request.received_at)}</span>
                  </div>
                  {request.received_by && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Confirmed by</span>
                      <span className="font-medium text-green-700">{request.received_by}</span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Expense Breakdown */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <ListIcon className="h-5 w-5 mr-2 text-gray-500" />
              Expense Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Item</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Qty</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Unit Price</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {request.expenses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500 italic">
                        No expense items added
                      </td>
                    </tr>
                  ) : (
                    request.expenses.map((exp, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3 font-medium">{exp.description}</td>
                        <td className="px-4 py-3">{exp.qty}</td>
                        <td className="px-4 py-3">{formatAmount(exp.unit_price)}</td>
                        <td className="px-4 py-3 font-semibold">{formatAmount(exp.total)}</td>
                      </tr>
                    ))
                  )}
                  <tr className="bg-[var(--accent-green-light)] font-bold text-[var(--success-text)]">
                    <td colSpan={3} className="px-4 py-3 text-right">Total Amount</td>
                    <td className="px-4 py-3">{formatAmount(request.total_amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Approval & Rejection History */}
        {(request.approvals.length > 0 || request.rejections.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2 text-gray-500" />
                Approvals History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {request.approvals.map((approval) => {
                  const isFinanceIssue = approval.approval_stage === 'finance';
                  return (
                    <div
                      key={approval.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 ${
                        isFinanceIssue
                          ? 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50 shadow-sm'
                          : 'border-blue-100 bg-blue-50'
                      }`}
                    >
                      {isFinanceIssue ? (
                        <DollarSign className="h-5 w-5 text-emerald-700 mt-0.5" />
                      ) : (
                        <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                      )}
                      <div>
                        <p className={`font-medium ${isFinanceIssue ? 'text-emerald-900' : 'text-gray-900'}`}>
                          {isFinanceIssue
                            ? 'Cash Issued'
                            : `${approval.approval_stage === 'director' ? 'Director' : 'Supervisor'} Approval`}
                        </p>
                        <p className="text-sm text-gray-600">
                          {isFinanceIssue ? 'Issued by' : 'By'} <strong>{approval.approver_name}</strong> • {formatDateTime(approval.created_at)}
                        </p>
                        {approval.signature && (
                          <p className={`text-xs italic mt-1 ${isFinanceIssue ? 'text-emerald-700' : 'text-gray-500'}`}>"{approval.signature}"</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {request.rejections.map((rejection) => (
                  <div key={rejection.id} className="flex items-start gap-3 p-3 bg-red-50 rounded">
                    <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-700">Rejected</p>
                      <p className="text-sm text-gray-600">
                        By <strong>{rejection.rejector_name}</strong> • {formatDateTime(rejection.created_at)}
                      </p>
                      <p className="text-sm text-red-600 mt-1">Reason: {rejection.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CashDetails;