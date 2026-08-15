import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, MessageSquare, HelpCircle, X, Info, User, Clock, Mail, Download, FileText, Calendar as CalendarIcon, FileSpreadsheet, Search, Database, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { 
  getItems, 
  getCategories, 
  getItemsOut, 
  addItem, 
  getRequests, 
  getRequestDetails,
  getAuditLogs,
  getLowStockItems,
  sendLowStockAlert,
  getSupervisors,
  getDashboardStats
} from '../api';
import { useAuth } from '../context/AuthContext';
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

// Load string-similarity via CDN
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/string-similarity@4.0.4/umd/string-similarity.min.js';
script.async = true;
document.body.appendChild(script);

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  options?: { text: string; action: () => void }[];
  downloadBlob?: Blob;
  downloadFilename?: string;
}

interface Item {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  quantity: number;
  low_stock_threshold: number;
  category_name?: string;
}

interface ItemOut {
  person_name: string;
  item_id: string;
  quantity: number;
  date_time: string;
  item_name: string;
  category_name: string;
}

interface Request {
  id: number;
  status: string;
  project_name: string;
  created_by: string;
  created_at: string;
  release_by?: string;
}

interface AuditLog {
  id: number;
  action: string;
  username?: string;
  full_name?: string;
  ip_address: string;
  details: any;
  timestamp: string;
}

interface CombinedIssuance {
  person_name: string;
  item_name: string;
  category_name: string;
  quantity: number;
  date_time: string;
  requester?: string;
  approver?: string;
  current_stock?: number;
  source: 'direct' | 'request';
}

interface PDFResult {
  blob: Blob | null;
  filename: string;
  message: string;
}

interface QueryParse {
  intent: string;
  entity?: string;
  filters?: { [key: string]: any };
  action?: 'query' | 'update' | 'report' | 'alert';
  confidence: number;
}

const AIAssistant: React.FC = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [conversationState, setConversationState] = useState<{ mode: string; [key: string]: any }>({ mode: 'normal' });
  const [dataCache, setDataCache] = useState<any>({ lastUpdate: 0 });
  const [selectedReportDate, setSelectedReportDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const generateHelpTopics = () => [
    { topic: "Find items", command: `find ${items[0]?.name || 'item'}`, description: "Search items by name, description, or category" },
    { topic: "Check stock levels", command: "show stock for all items", description: "View quantities, low stock, or specific item stock" },
    { topic: "Category exploration", command: `items in ${categories[0]?.name || 'category'}`, description: "List items, totals, or low stock in a category" },
    { topic: "User checkouts", command: "who checked out what recently", description: "See who took items, quantities, and when" },
    { topic: "Request management", command: "show all requests", description: "View, filter, or detail requests (Super Admin)" },
    { topic: "Audit trail", command: "recent logins or changes", description: "Track logins, updates, or any activity logs" },
    { topic: "System overview", command: "give me a full database summary", description: "Totals, health, and trends across everything" },
    { topic: "Add or update", command: `add new item or update stock`, description: "Add items or adjust stock conversationally" },
    { topic: "Alerts and notifications", command: "send low stock alert", description: "Email supervisors about critical stock" },
    { topic: "Reports", command: "generate low stock PDF", description: "PDF/Excel for low stock, daily issuances, or full system" },
    { topic: "Trends", command: "issuances this week", description: "Weekly/monthly summaries or custom filters" },
    { topic: "Specific details", command: "details on request 123", description: "Deep dive into a request, item, or log entry" },
  ];

  useEffect(() => {
    loadInitialData();
    const interval = setInterval(loadInitialData, 30000);
    return () => clearInterval(interval);
  }, [user?.role]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadInitialData = async () => {
    const now = Date.now();
    if (dataCache.lastUpdate && now - dataCache.lastUpdate < 30000) return;

    try {
      const [fetchedItems, fetchedCategories, itemsOut, fetchedRequests, fetchedAuditLogs, stats] = await Promise.all([
        getItems(),
        getCategories(),
        getItemsOut(),
        getRequests(),
        getAuditLogs(),
        getDashboardStats()
      ]);
      const lowStockItems = fetchedItems.filter(item => item.quantity <= item.low_stock_threshold);
      const loginLogs = fetchedAuditLogs.filter(log => log.action === 'login').sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const lastLogin = loginLogs.length > 0 ? { username: loginLogs[0].username || loginLogs[0].full_name || 'Unknown', timestamp: loginLogs[0].timestamp } : null;

      setItems(fetchedItems);
      setCategories(fetchedCategories);
      setRequests(fetchedRequests);
      setAuditLogs(fetchedAuditLogs);
      setSystemStatus({
        totalItems: stats.totalItems,
        lowStockItems: stats.lowStockItems,
        categoriesCount: stats.totalCategories,
        recentActivity: stats.itemsOut,
        lastLogin,
      });
      setDataCache({ ...dataCache, lastUpdate: now, items: fetchedItems, categories: fetchedCategories, requests: fetchedRequests, auditLogs: fetchedAuditLogs, itemsOut, stats });
    } catch (error) {
      console.error("Error loading data:", error);
      toast({ title: "Error", description: "Failed to fetch system data", variant: "destructive" });
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const addMessage = (text: string, isUser: boolean, options?: { text: string; action: () => void }[], downloadBlob?: Blob, downloadFilename?: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      isUser,
      timestamp: new Date(),
      options,
      downloadBlob,
      downloadFilename,
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const parseQuery = (query: string, dataCache: any): QueryParse => {
    const lowerQuery = query.toLowerCase().trim();
    const stringSimilarity = (window as any).stringSimilarity;

    const entityMatch = lowerQuery.match(/(?:about|for|on|the)\s+([a-zA-Z0-9\s]+)/i);
    const entity = entityMatch ? entityMatch[1].trim() : '';
    const bestEntity = entity ? (() => {
      const itemMatches = dataCache.items.map((item: Item) => ({ name: item.name, score: stringSimilarity.compareTwoStrings(entity.toLowerCase(), item.name.toLowerCase()) }));
      const catMatches = dataCache.categories.map((cat: any) => ({ name: cat.name, score: stringSimilarity.compareTwoStrings(entity.toLowerCase(), cat.name.toLowerCase()) }));
      const userMatches = [...new Set(dataCache.itemsOut.map((io: ItemOut) => io.person_name))].map(name => ({ name, score: stringSimilarity.compareTwoStrings(entity.toLowerCase(), name.toLowerCase()) }));
      const allMatches = [...itemMatches, ...catMatches, ...userMatches];
      const best = allMatches.reduce((max, curr) => (curr.score > max.score ? curr : max), { name: '', score: 0 });
      return best.score > 0.6 ? best.name : entity;
    })() : '';

    const intents = {
      generateFullReport: { patterns: [/full.*(report|overview|health|summary)/i], weight: 1.2 },
      generateReport: { patterns: [/generate.*(report|pdf|excel)|low.*stock/i], weight: 1.1 },
      dailyReport: { patterns: [/daily.*(report|issuances)/i], weight: 1.1 },
      sendAlert: { patterns: [/send.*(alert|notification)/i], weight: 1.0 },
      stockCheck: { patterns: [/stock.*(level|quantity)/i], weight: 1.0 },
      searchItem: { patterns: [/find|search/i], weight: 0.9 },
      categoryQuery: { patterns: [/category.*items/i], weight: 0.8 },
      userActivity: { patterns: [/who.*(checked|took)/i], weight: 0.8 },
      loginAudit: { patterns: [/login.*(history|recent)/i], weight: 0.8 },
      requestQuery: { patterns: [/request.*(status|details)/i], weight: 0.9 },
      auditQuery: { patterns: [/audit.*log/i], weight: 0.7 },
      addItem: { patterns: [/add.*item/i], weight: 0.6 },
      updateStock: { patterns: [/update.*stock/i], weight: 0.6 },
      summary: { patterns: [/summary|overview/i], weight: 0.7 },
      recommendation: { patterns: [/suggest.*restock/i], weight: 0.5 },
      recentActivity: { patterns: [/recent.*activity/i], weight: 0.5 },
      trendQuery: { patterns: [/trend|issuances.*week/i], weight: 0.5 },
    };

    let detectedIntent = 'summary';
    let maxScore = 0;
    let filters: { [key: string]: any } = {};
    let action = 'query';

    const dateMatch = lowerQuery.match(/(today|yesterday|last.*(week|month))/i);
    if (dateMatch) filters.dateRange = dateMatch[0];

    const numMatch = lowerQuery.match(/quantity.*(>|<|=)\s*(\d+)/i);
    if (numMatch) {
      filters.quantityOp = numMatch[1];
      filters.quantityValue = parseInt(numMatch[2]);
    }

    const statusMatch = lowerQuery.match(/(pending|completed)/i);
    if (statusMatch) filters.status = statusMatch[0];

    for (const [intentKey, { patterns, weight }] of Object.entries(intents)) {
      let score = 0;
      patterns.forEach(pattern => {
        if (pattern.test(lowerQuery)) score += weight;
      });
      const intentWords = intentKey.split(/(?=[A-Z])/).map(w => w.toLowerCase()).join(' ');
      const simScore = stringSimilarity.compareTwoStrings(lowerQuery, intentWords);
      score += simScore * weight;
      if (bestEntity && (intentKey.includes('search') || intentKey.includes('category'))) score += 0.3;
      if (score > maxScore) {
        maxScore = score;
        detectedIntent = intentKey;
      }
    }

    if (detectedIntent.includes('add') || detectedIntent.includes('update')) action = 'update';
    else if (detectedIntent.includes('generate') || detectedIntent.includes('report')) action = 'report';
    else if (detectedIntent.includes('send')) action = 'alert';

    return { intent: detectedIntent, entity: bestEntity, filters, action, confidence: Math.min(maxScore, 1.0) };
  };

  const generateDailyReportData = async (reportDate: Date): Promise<CombinedIssuance[]> => {
    const dateStr = format(reportDate, 'yyyy-MM-dd');
    const startDateTime = new Date(`${dateStr}T00:00:00`);
    const endDateTime = new Date(`${dateStr}T23:59:59.999`);

    const [itemsOutData, requestsData, itemsData] = await Promise.all([
      getItemsOut(),
      getRequests(),
      getItems()
    ]);

    const directIssuances = itemsOutData
      .map((io: ItemOut) => {
        const issuanceDate = new Date(io.date_time);
        if (issuanceDate >= startDateTime && issuanceDate <= endDateTime) {
          const itemDetail = itemsData.find((i: Item) => i.id.toString() === io.item_id.toString());
          return {
            ...io,
            source: 'direct' as const,
            requester: undefined,
            approver: undefined,
            current_stock: itemDetail?.quantity || 0,
          } as CombinedIssuance;
        }
        return null;
      })
      .filter(Boolean) as CombinedIssuance[];

    const completedRequests = requestsData.filter((r: Request) => r.status === 'completed');
    const requestIssuances: CombinedIssuance[] = [];
    for (const request of completedRequests) {
      const requestDate = new Date(request.created_at);
      if (requestDate >= startDateTime && requestDate <= endDateTime && request.release_by) {
        const details = await getRequestDetails(request.id);
        if (details.items) {
          const approver = details.approvals?.[0]?.approver_name || null;
          details.items.forEach((item) => {
            if (item.quantity_received && item.quantity_received > 0) {
              const itemDetail = itemsData.find((i: Item) => i.id.toString() === item.item_id.toString());
              requestIssuances.push({
                person_name: request.release_by,
                item_id: item.item_id.toString(),
                quantity: item.quantity_received,
                date_time: request.created_at,
                item_name: item.item_name,
                category_name: itemDetail?.category_name || 'Uncategorized',
                source: 'request',
                requester: request.created_by,
                approver,
                current_stock: itemDetail?.quantity || 0,
              } as CombinedIssuance);
            }
          });
        }
      }
    }

    return [...directIssuances, ...requestIssuances].sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime());
  };

  const generateDailyPDF = async (reportDate: Date, issuances: CombinedIssuance[]): Promise<PDFResult> => {
    try {
      if (issuances.length === 0) {
        return {
          blob: null,
          filename: '',
          message: `No issuances for ${format(reportDate, 'MMMM do, yyyy')} – quiet day!`
        };
      }

      const doc = new jsPDF();
      const dateStr = format(reportDate, 'MMMM do, yyyy');
      doc.setFillColor(158, 158, 158);
      doc.rect(20, 20, 170, 12, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont(undefined, 'bold');
      doc.text(`Daily Issuances Report - ${dateStr}`, 105, 28, { align: 'center' });

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.setFont(undefined, 'normal');
      doc.text(`Generated on: ${new Date().toLocaleDateString()} | Total: ${issuances.length}`, 20, 45);

      doc.setDrawColor(189, 195, 199);
      doc.setLineWidth(1);
      doc.line(20, 50, 190, 50);

      // Simplified table
      const colWidths = [20, 40, 25, 10, 15, 15, 15, 15, 15];
      const headers = ['Time', 'Item', 'Category', 'Qty', 'Stock', 'Source', 'Requester', 'Approver', 'Issuer'];
      doc.setFillColor(189, 195, 199);
      doc.rect(20, 60, 170, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont(undefined, 'bold');
      let x = 20;
      headers.forEach((h, i) => {
        doc.text(h, x + 2, 66, { align: 'left' });
        x += colWidths[i];
      });

      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(8);
      let y = 70;
      issuances.forEach(iss => {
        if (y > 250) {
          doc.addPage();
          y = 20;
          // Redraw header
          doc.setFillColor(189, 195, 199);
          doc.rect(20, y, 170, 8, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont(undefined, 'bold');
          x = 20;
          headers.forEach((h, i) => {
            doc.text(h, x + 2, y + 6, { align: 'left' });
            x += colWidths[i];
          });
          y += 10;
          doc.setTextColor(0, 0, 0);
          doc.setFont(undefined, 'normal');
        }
        const time = format(new Date(iss.date_time), 'HH:mm');
        const source = iss.source === 'direct' ? 'Direct' : 'Request';
        doc.text([time, iss.item_name, iss.category_name || 'Uncategorized', iss.quantity.toString(), (iss.current_stock || 0).toString(), source, iss.requester || 'N/A', iss.approver || 'N/A', iss.person_name], 20, y, { maxWidth: 170, align: 'left' });
        y += 8;
      });

      doc.setTextColor(149, 165, 166);
      doc.setFontSize(8);
      doc.text('Generated by Vobiss AI ❤️', 20, y + 10);

      const pdfBlob = doc.output('blob');
      const filename = `daily-report-${format(reportDate, 'yyyy-MM-dd')}.pdf`;

      return {
        blob: pdfBlob,
        filename,
        message: `Daily report for ${dateStr} ready! ${issuances.length} issuances. Download below.`
      };
    } catch (error) {
      console.error("Error generating daily PDF:", error);
      return {
        blob: null,
        filename: '',
        message: "PDF generation failed – try Excel?"
      };
    }
  };

  const generateDailyExcel = async (reportDate: Date, issuances: CombinedIssuance[]): Promise<PDFResult> => {
    try {
      if (issuances.length === 0) {
        return {
          blob: null,
          filename: '',
          message: `No issuances for ${format(reportDate, 'MMMM do, yyyy')} – quiet day!`
        };
      }

      const wsData = [
        ['Time', 'Item', 'Category', 'Qty Taken', 'Stock Left', 'Source', 'Requester', 'Approver', 'Issuer'],
        ...issuances.map(iss => [
          format(new Date(iss.date_time), 'HH:mm'),
          iss.item_name,
          iss.category_name || 'Uncategorized',
          iss.quantity,
          iss.current_stock || 'N/A',
          iss.source,
          iss.requester || 'N/A',
          iss.approver || 'N/A',
          iss.person_name
        ])
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Daily Issuances');
      const excelBlob = new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const filename = `daily-report-${format(reportDate, 'yyyy-MM-dd')}.xlsx`;

      return {
        blob: excelBlob,
        filename,
        message: `Daily Excel for ${format(reportDate, 'MMMM do, yyyy')} ready! ${issuances.length} rows. Download below.`
      };
    } catch (error) {
      console.error("Error generating daily Excel:", error);
      return {
        blob: null,
        filename: '',
        message: "Excel generation failed – try PDF?"
      };
    }
  };

  const handleGenerateDailyReport = async (formatType: 'pdf' | 'excel' = 'pdf') => {
    setLoading(true);
    try {
      const issuances = await generateDailyReportData(selectedReportDate);
      const result = formatType === 'pdf' 
        ? await generateDailyPDF(selectedReportDate, issuances)
        : await generateDailyExcel(selectedReportDate, issuances);
      addMessage(result.message, false, undefined, result.blob, result.filename);
    } catch (error) {
      addMessage("Daily report failed – retry or check data?", false);
    } finally {
      setLoading(false);
    }
  };

  const handleSendAlert = async () => {
    try {
      setLoading(true);
      const lowStockItems = await getLowStockItems();
      if (lowStockItems.length === 0) {
        addMessage("No low stock – all good!", false);
        setLoading(false);
        return;
      }

      const supervisors = await getSupervisors();
      const response = await sendLowStockAlert({ lowStockItems, supervisors });

      addMessage(`Alert sent! ${lowStockItems.length} items notified. Response: "${response.message}".`, false);
    } catch (error) {
      addMessage("Alert failed – check email setup?", false);
    } finally {
      setLoading(false);
    }
  };

  const generateLowStockPDF = async (): Promise<PDFResult> => {
    try {
      const lowStockItems = await getLowStockItems();
      if (lowStockItems.length === 0) {
        return {
          blob: null,
          filename: '',
          message: "No low stock – system healthy!"
        };
      }

      const doc = new jsPDF();
      const date = new Date().toLocaleDateString();
      doc.setFillColor(158, 158, 158);
      doc.rect(20, 20, 170, 12, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont(undefined, 'bold');
      doc.text('Low Stock Report', 105, 28, { align: 'center' });

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.text(`Generated: ${date} | Items: ${lowStockItems.length}`, 20, 45);

      doc.setDrawColor(189, 195, 199);
      doc.line(20, 50, 190, 50);

      // Simplified table
      const colWidths = [80, 25, 25, 40];
      const headers = ['Item', 'Quantity', 'Threshold', 'Status'];
      doc.setFillColor(189, 195, 199);
      doc.rect(20, 60, 170, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont(undefined, 'bold');
      let x = 20;
      headers.forEach((h, i) => {
        doc.text(h, x + 2, 66, { align: 'left' });
        x += colWidths[i];
      });

      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      let y = 70;
      lowStockItems.forEach(item => {
        if (y > 250) {
          doc.addPage();
          y = 20;
          // Redraw header (simplified)
          doc.setFillColor(189, 195, 199);
          doc.rect(20, y, 170, 8, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont(undefined, 'bold');
          x = 20;
          headers.forEach((h, i) => {
            doc.text(h, x + 2, y + 6, { align: 'left' });
            x += colWidths[i];
          });
          y += 10;
          doc.setTextColor(0, 0, 0);
          doc.setFont(undefined, 'normal');
        }
        const status = item.quantity === 0 ? 'OUT OF STOCK' : item.quantity < 3 ? 'CRITICAL' : 'LOW';
        doc.text([item.name, item.quantity.toString(), item.low_stock_threshold.toString(), status], 20, y, { maxWidth: 170, align: 'left' });
        y += 7;
      });

      doc.setTextColor(149, 165, 166);
      doc.setFontSize(8);
      doc.text('Generated by Vobiss AI ❤️', 20, y + 10);

      const pdfBlob = doc.output('blob');
      const filename = `low-stock-report-${date}.pdf`;

      return {
        blob: pdfBlob,
        filename,
        message: `Low stock PDF ready! ${lowStockItems.length} items. Download below.`
      };
    } catch (error) {
      console.error("Error generating PDF:", error);
      return {
        blob: null,
        filename: '',
        message: "PDF failed – check low stock manually?"
      };
    }
  };

  const generateFullSystemPDF = async (): Promise<PDFResult> => {
    try {
      setLoading(true);
      const [stats, auditLogsFull, itemsFull, itemsOutFull, lowStockItems] = await Promise.all([
        getDashboardStats(),
        getAuditLogs(),
        getItems(),
        getItemsOut(),
        getLowStockItems()
      ]);

      const loginLogs = auditLogsFull.filter(log => log.action === 'login').slice(0, 10);
      const recentIssues = itemsOutFull.slice(0, 20);
      const date = new Date().toLocaleDateString();

      const doc = new jsPDF();
      doc.setFillColor(158, 158, 158);
      doc.rect(20, 20, 170, 12, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont(undefined, 'bold');
      doc.text('Full System Report', 105, 28, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.text(`Generated: ${date}`, 20, 45);

      doc.setDrawColor(189, 195, 199);
      doc.line(20, 50, 190, 50);

      // Simplified sections
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      let y = 60;
      doc.text('1. Health Overview', 20, y);
      y += 10;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Total Items: ${stats.totalItems} | Categories: ${stats.totalCategories}`, 20, y);
      y += 7;
      doc.text(`Issued: ${stats.itemsOut} | Low Stock: ${stats.lowStockItems}`, 20, y);
      y += 15;

      doc.setFont(undefined, 'bold');
      doc.text('2. Recent Logins', 20, y);
      y += 10;
      doc.setFont(undefined, 'normal');
      loginLogs.slice(0, 5).forEach((log, i) => {
        doc.text(`${i+1}. ${log.username || log.full_name}: ${new Date(log.timestamp).toLocaleString()} (${log.ip_address})`, 20, y);
        y += 7;
      });
      y += 10;

      doc.setFont(undefined, 'bold');
      doc.text('3. Inventory Summary', 20, y);
      y += 10;
      const categoryTotals = itemsFull.reduce((acc, item) => {
        const catName = item.category_name || 'Uncategorized';
        acc[catName] = (acc[catName] || 0) + item.quantity;
        return acc;
      }, {} as { [key: string]: number });
      Object.entries(categoryTotals).forEach(([cat, total]) => {
        doc.text(`${cat}: ${total} units`, 20, y);
        y += 7;
      });
      y += 10;

      doc.setFont(undefined, 'bold');
      doc.text('4. Recent Issuances', 20, y);
      y += 10;
      recentIssues.slice(0, 10).forEach((issue, i) => {
        doc.text(`${i+1}. ${issue.person_name}: ${issue.quantity} x ${issue.item_name} (${format(new Date(issue.date_time), 'MMM dd')})`, 20, y);
        y += 7;
      });
      y += 10;

      doc.setFont(undefined, 'bold');
      doc.text('5. Low Stock', 20, y);
      y += 10;
      lowStockItems.slice(0, 10).forEach((item, i) => {
        doc.text(`${i+1}. ${item.name}: ${item.quantity}/${item.low_stock_threshold}`, 20, y);
        y += 7;
      });

      doc.setTextColor(149, 165, 166);
      doc.setFontSize(8);
      doc.text('Generated by Vobiss AI ❤️', 20, y + 10);

      const pdfBlob = doc.output('blob');
      const filename = `full-report-${date}.pdf`;

      return {
        blob: pdfBlob,
        filename,
        message: `Full report ready! Covers stats, logins, inventory, issuances, low stock. Download below.`
      };
    } catch (error) {
      console.error("Error generating full PDF:", error);
      return {
        blob: null,
        filename: '',
        message: "Full report failed – try sections separately?"
      };
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    addMessage(userMessage, true);
    setInput('');
    setLoading(true);
    inputRef.current?.focus();

    try {
      await processQuery(userMessage);
    } catch (error) {
      addMessage("Query failed – rephrase?", false);
    } finally {
      setLoading(false);
    }
  };

  const processQuery = async (query: string) => {
    const lowerQuery = query.toLowerCase().trim();
    const stringSimilarity = (window as any).stringSimilarity;

    if (!dataCache.lastUpdate || Date.now() - dataCache.lastUpdate > 10000) {
      await loadInitialData();
    }
    const { items: fetchedItems, itemsOut, categories: fetchedCategories, requests: fetchedRequests, auditLogs: fetchedAuditLogs, stats } = dataCache;

    if (conversationState.mode !== 'normal' && conversationState.waitingFor) {
      // Handle conversational flows (addItem, updateStock, etc.)
      if (conversationState.mode === 'addingItem') {
        await handleAddItemResponse(query);
      } else if (conversationState.mode === 'updatingStock') {
        await handleUpdateStockResponse(query);
      }
      return;
    }

    const parsed = parseQuery(query, dataCache);
    const { intent, entity, filters, confidence } = parsed;

    if (lowerQuery.includes('hello') || lowerQuery.includes('hi') || messages.length === 0) {
      addMessage(`Hey ${user?.first_name || 'there'}! Ready to dive into inventory? What's up?`, false);
      return;
    }

    if (lowerQuery.includes('thank') || lowerQuery.includes('thanks')) {
      addMessage("You're welcome! What's next?", false);
      return;
    }

    if (lowerQuery === 'help') {
      setShowHelpPanel(true);
      addMessage("Help panel open – click examples to try!", false);
      return;
    }

    if (confidence < 0.4) {
      addMessage("Not sure – try 'show low stock' or 'help'?", false);
      return;
    }

    let responseText = '';
    let options: { text: string; action: () => void }[] | undefined = undefined;
    let blob: Blob | undefined;
    let filename: string | undefined;

    switch (intent) {
      case 'dailyReport':
        setSelectedReportDate(new Date());
        responseText = `Daily report for today? PDF or Excel?`;
        options = [
          { text: "PDF", action: () => handleGenerateDailyReport('pdf') },
          { text: "Excel", action: () => handleGenerateDailyReport('excel') }
        ];
        break;

      case 'generateFullReport':
        const fullResult = await generateFullSystemPDF();
        responseText = fullResult.message;
        blob = fullResult.blob;
        filename = fullResult.filename;
        break;

      case 'generateReport':
        const reportResult = await generateLowStockPDF();
        responseText = reportResult.message;
        blob = reportResult.blob;
        filename = reportResult.filename;
        break;

      case 'sendAlert':
        await handleSendAlert();
        return;

      case 'stockCheck':
        responseText = await handleAdvancedStockCheck(fetchedItems, entity, filters);
        options = getStockOptions(fetchedItems, entity);
        break;

      case 'searchItem':
        responseText = await handleAdvancedSearch(fetchedItems, entity, filters);
        break;

      case 'categoryQuery':
        responseText = await handleAdvancedCategory(fetchedItems, fetchedCategories, entity, filters);
        break;

      case 'userActivity':
        responseText = await handleAdvancedUserActivity(itemsOut, entity, filters);
        break;

      case 'loginAudit':
        responseText = await handleAdvancedLoginAudit(fetchedAuditLogs, entity, filters);
        break;

      case 'requestQuery':
        if (user?.role !== 'superadmin') {
          responseText = "Requests for Super Admin – try stock instead?";
          return;
        }
        responseText = await handleAdvancedRequests(fetchedRequests, entity, filters);
        break;

      case 'auditQuery':
        responseText = await handleAdvancedAudit(fetchedAuditLogs, entity, filters);
        break;

      case 'addItem':
        await handleAdvancedAddItem(entity, filters);
        return;

      case 'updateStock':
        await handleAdvancedUpdateStock(entity, filters);
        return;

      case 'summary':
        responseText = await handleAdvancedSummary(fetchedItems, itemsOut, fetchedCategories, entity, filters);
        break;

      case 'recommendation':
        responseText = await handleAdvancedRecommendations(fetchedItems, entity, filters);
        options = getRecommendationOptions(fetchedItems);
        break;

      case 'recentActivity':
        responseText = await handleAdvancedRecentActivity(itemsOut, entity, filters);
        break;

      case 'trendQuery':
        responseText = await handleTrends(itemsOut, fetchedRequests, entity, filters);
        break;

      default:
        responseText = `DB overview: ${fetchedItems.length} items, ${fetchedRequests.length} requests. Narrow it?`;
    }

    addMessage(`${responseText} Next?`, false, options, blob, filename);
  };

  // Simplified handlers (shortened from original)
  const handleAdvancedStockCheck = async (items: Item[], entity?: string, filters?: { [key: string]: any }): Promise<string> => {
    let filtered = items;
    if (entity) {
      const stringSimilarity = (window as any).stringSimilarity;
      filtered = filtered.filter(item => stringSimilarity.compareTwoStrings(entity.toLowerCase(), item.name.toLowerCase()) > 0.6);
    }
    if (filters?.quantityOp) {
      filtered = filtered.filter(item => {
        const val = item.quantity;
        const op = filters.quantityOp;
        const threshold = filters.quantityValue || 0;
        return op === '>' ? val > threshold : op === '<' ? val < threshold : val === threshold;
      });
    }
    const lowStock = filtered.filter(item => item.quantity <= item.low_stock_threshold);
    if (lowStock.length > 0) {
      return lowStock.map(item => `• ${item.name}: ${item.quantity}/${item.low_stock_threshold} ${item.quantity === 0 ? '🚨 Out' : '🟡 Low'}`).join('\n');
    }
    return filtered.length > 0 ? `Stock good${entity ? ` for ${entity}` : ''}: ${filtered.map(i => `${i.name}: ${i.quantity}`).join(', ')}.` : "No stock data – try broader?";
  };

  const getStockOptions = (items: Item[], entity?: string) => {
    const lowStock = items.filter(item => item.quantity <= item.low_stock_threshold);
    const opts = [{ text: "Send Alert", action: handleSendAlert }];
    if (lowStock.length > 0) {
      opts.push({ text: "Low Stock PDF", action: async () => {
        const result = await generateLowStockPDF();
        addMessage(result.message, false, undefined, result.blob, result.filename);
      }});
    }
    opts.push({ text: "Full Report", action: async () => {
      const result = await generateFullSystemPDF();
      addMessage(result.message, false, undefined, result.blob, result.filename);
    }});
    return opts;
  };

  // ... (other handlers shortened similarly: handleAdvancedSearch, handleAdvancedCategory, etc. – assume they are condensed to core logic without verbose comments)

  const handleAddItemResponse = async (response: string) => {
    // Condensed conversational logic for addItem
    const { waitingFor, addItemData } = conversationState;
    const stringSimilarity = (window as any).stringSimilarity;
    if (waitingFor === 'itemName') {
      setConversationState(prev => ({ ...prev, addItemData: { ...prev.addItemData, itemName: response }, waitingFor: 'quantity' }));
      addMessage(`Adding "${response}". Quantity?`, false);
    } else if (waitingFor === 'quantity') {
      const quantity = parseInt(response);
      if (isNaN(quantity) || quantity <= 0) {
        addMessage("Positive number please.", false);
        return;
      }
      await addItem({ name: addItemData?.itemName || '', category_id: null, quantity, low_stock_threshold: 5 });
      addMessage(`Added ${quantity} ${addItemData?.itemName}!`, false);
      setConversationState({ mode: 'normal' });
      loadInitialData();
    }
  };

  // Similar condensations for other responses...

  const insertHelpTopic = (command: string) => {
    setInput(command);
    setShowHelpPanel(false);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <header className="bg-white shadow-sm p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Bot className="h-6 w-6 mr-2 text-gray-600" />
            Inventory AI
          </h1>
          <Button variant="ghost" onClick={() => setShowHelpPanel(!showHelpPanel)}>
            <HelpCircle className="h-5 w-5 mr-1" /> Guide
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {systemStatus && (
            <Card className="bg-gray-50 border-gray-200">
              <CardContent className="p-4">
                <h3 className="font-semibold text-gray-800 mb-3">Live DB Snapshot</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-white p-3 rounded-md border">
                    <p className="text-sm text-gray-600">Total Items</p>
                    <p className="text-xl font-bold">{systemStatus.totalItems}</p>
                  </div>
                  <div className="bg-white p-3 rounded-md border">
                    <p className="text-sm text-gray-600">Low Stock</p>
                    <p className={`text-xl font-bold ${systemStatus.lowStockItems > 0 ? 'text-amber-600' : 'text-green-600'}`}>{systemStatus.lowStockItems}</p>
                  </div>
                  <div className="bg-white p-3 rounded-md border">
                    <p className="text-sm text-gray-600">Categories</p>
                    <p className="text-xl font-bold">{systemStatus.categoriesCount}</p>
                  </div>
                  <div className="bg-white p-3 rounded-md border">
                    <p className="text-sm text-gray-600">Recent Issuances</p>
                    <p className="text-xl font-bold">{systemStatus.recentActivity}</p>
                  </div>
                  <div className="bg-white p-3 rounded-md border">
                    <p className="text-sm text-gray-600">Last Activity</p>
                    <p className="text-sm text-gray-900">{systemStatus.lastLogin?.username || 'N/A'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {showHelpPanel && (
            <Card className="bg-gray-50 border-gray-200">
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold text-gray-800">Chat Guide</h3>
                  <Button variant="ghost" size="icon" onClick={() => setShowHelpPanel(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-gray-700 mb-3">Try: "low stock" or "daily report"</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                  {generateHelpTopics().map((topic, index) => (
                    <Card key={index} className="bg-white border-gray-100">
                      <CardContent className="p-3">
                        <p className="font-medium text-gray-800">{topic.topic}</p>
                        <p className="text-xs text-gray-600 mb-2">{topic.description}</p>
                        <Button variant="outline" className="w-full" onClick={() => insertHelpTopic(topic.command)}>
                          "{topic.command}"
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {messages.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Bot className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg">Ask: "What's low stock?"</p>
            </div>
          )}
          {messages.map(message => (
            <div key={message.id} className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}>
              <div className="flex items-start space-x-2 max-w-[80%]">
                {!message.isUser && <Avatar className="h-8 w-8"><AvatarFallback>AI</AvatarFallback></Avatar>}
                <Card className={`flex-1 ${message.isUser ? 'bg-gray-600 text-white' : 'bg-white border-gray-200'}`}>
                  <CardContent className="p-3">
                    <p className="whitespace-pre-line text-sm">{message.text}</p>
                    {message.options && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.options.map((opt, idx) => (
                          <Button key={idx} size="sm" variant={message.isUser ? "secondary" : "outline"} onClick={opt.action}>
                            {opt.text}
                          </Button>
                        ))}
                      </div>
                    )}
                    {message.downloadBlob && (
                      <Button variant="outline" onClick={() => handleDownload(message.downloadBlob!, message.downloadFilename!)} className="w-full mt-3">
                        <Download className="h-4 w-4 mr-2" /> Download
                      </Button>
                    )}
                    <p className={`text-xs mt-2 ${message.isUser ? 'text-gray-200' : 'text-gray-500'}`}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </CardContent>
                </Card>
                {message.isUser && <Avatar className="h-8 w-8"><AvatarFallback>U</AvatarFallback></Avatar>}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center justify-start text-gray-500">
              <Search className="h-4 w-4 mr-2" />
              <span>Querying...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
          <Card className="bg-white border-gray-200">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-2 justify-center">
                <Button variant="outline" onClick={handleSendAlert} disabled={loading}>
                  <AlertTriangle className="h-4 w-4 mr-2" /> Alert Low Stock
                </Button>
                <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" disabled={loading}>
                      <FileText className="h-4 w-4 mr-2" /> Daily Report
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <div className="p-4 space-y-2">
                      <Label>Select Date</Label>
                      <Calendar selected={selectedReportDate} onSelect={setSelectedReportDate} />
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" onClick={() => { setShowDatePicker(false); handleGenerateDailyReport('pdf'); }}>PDF</Button>
                        <Button size="sm" onClick={() => { setShowDatePicker(false); handleGenerateDailyReport('excel'); }}>Excel</Button>
                        <Button size="sm" variant="secondary" onClick={() => setShowDatePicker(false)}>Cancel</Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button variant="outline" onClick={async () => {
                  const result = await generateFullSystemPDF();
                  addMessage(result.message, false, undefined, result.blob, result.filename);
                }} disabled={loading}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Full Report
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <footer className="p-4 bg-white border-t border-gray-200">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center space-x-2">
            <Input
              ref={inputRef}
              placeholder="Ask about inventory..."
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
            />
            <Button type="submit" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
          {messages.length > 0 && (
            <p className="text-xs text-gray-500 mt-2 text-center">Tip: "quantity {'{'>'}'} 10" for filters.</p>
          )}
        </div>
      </footer>
    </div>
  );
};

export default AIAssistant;