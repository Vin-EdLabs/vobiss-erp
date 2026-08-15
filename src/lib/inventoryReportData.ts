import { getItemsOut, getCategories, getRequests, getRequestDetails, getItems } from '@/api';

export type InventorySource = 'direct' | 'request' | 'return';

export interface CombinedTransaction {
  id: string;
  person_name: string;
  item_id: string;
  quantity: number;
  date_time: string;
  item_name: string;
  category_name: string;
  source: InventorySource;
  requester?: string;
  approver?: string;
  current_stock?: number;
  transaction_type: 'out' | 'in';
  /** Parent record for navigation (request id or items_out id). */
  record_id?: string;
}

const REPORT_RETURN = {
  returnTo: '/reports',
  returnLabel: 'Back to Inventory Report',
} as const;

/** Detail page path + router state for back navigation from the report. */
export function getTransactionDetailLink(
  row: CombinedTransaction
): { to: string; state: typeof REPORT_RETURN } | null {
  const requestId =
    row.record_id ||
    (row.source === 'request' ? row.id.match(/^req-(\d+)-/)?.[1] : null) ||
    (row.source === 'return' ? row.id.match(/^ret-(\d+)-/)?.[1] : null);

  if (row.source === 'request' && requestId) {
    return { to: `/approved-forms/${requestId}`, state: REPORT_RETURN };
  }
  if (row.source === 'return' && requestId) {
    return { to: `/item-returns/${requestId}`, state: REPORT_RETURN };
  }
  if (row.source === 'direct') {
    return { to: '/items-out', state: REPORT_RETURN };
  }
  return null;
}

export interface UsageData {
  date: string;
  formattedDate: string;
  items_out: number;
  items_in: number;
  net_change: number;
  users: number;
  source_direct: number;
  source_request: number;
  source_return: number;
  stock_before?: number;
  stock_after?: number;
}

export interface TopItem {
  name: string;
  count: number;
  category: string;
  source: InventorySource;
}

export interface TopUser {
  name: string;
  count: number;
  source: InventorySource;
}

export interface InventoryReportResult {
  usageData: UsageData[];
  topItemsOut: TopItem[];
  topItemsIn: TopItem[];
  topUsers: TopUser[];
  filteredIssuances: CombinedTransaction[];
  filteredReturns: CombinedTransaction[];
  allTransactions: CombinedTransaction[];
  currentTotal: number;
  allOutTotal: number;
  allInTotal: number;
  charts: {
    flow_split: { name: string; value: number; color: string }[];
    by_source_out: { name: string; value: number; color: string }[];
    volume_by_period: { period: string; items_out: number; items_in: number; net_change: number }[];
    top_items_out: { name: string; count: number }[];
    top_items_in: { name: string; count: number }[];
    top_categories_out: { name: string; value: number }[];
  };
}

interface Request {
  id: number;
  created_by: string;
  release_by: string | null;
  updated_at: string;
  status?: string;
  type?: 'material_request' | 'item_return';
  details?: {
    items: {
      id: number;
      item_id: number;
      quantity_received: number | null;
      item_name: string;
    }[];
    approvals?: { approver_name: string }[];
  };
}

interface Item {
  id: string;
  name: string;
  category_name: string;
  quantity: number;
}

interface ItemOut {
  id: string;
  person_name: string;
  item_id: string;
  quantity: number;
  date_time: string;
  item_name: string;
  category_name: string;
}

export type DateFilterMode = 'all' | 'range';

const CHART_COLORS = {
  direct: '#3b82f6',
  request: '#8b5cf6',
  return: '#10b981',
  out: '#ef4444',
  in: '#22c55e',
};

export function formatReportDate(dateStr: string) {
  const date = new Date(dateStr);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${dayNames[date.getDay()]}, ${day}/${month}/${year}`;
}

export function formatReportDateTime(dateTime: string) {
  const date = new Date(dateTime);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return {
    fullDate: formatReportDate(date.toISOString().split('T')[0]),
    time: `${hours}:${minutes}`,
  };
}

function computeHistoricalStocks(allTransactions: CombinedTransaction[], itemsData: Item[]) {
  const itemGroups: Record<string, CombinedTransaction[]> = {};
  allTransactions.forEach((trans) => {
    if (!itemGroups[trans.item_id]) itemGroups[trans.item_id] = [];
    itemGroups[trans.item_id].push(trans);
  });

  Object.keys(itemGroups).forEach((itemId) => {
    const group = itemGroups[itemId];
    const currentItem = itemsData.find((i) => i.id.toString() === itemId);
    let runningStock = currentItem?.quantity || 0;
    group.sort((a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime());
    group.forEach((trans) => {
      trans.current_stock = runningStock;
      const qty = trans.quantity || 0;
      if (trans.transaction_type === 'out') runningStock += qty;
      else runningStock -= qty;
    });
  });
  return allTransactions;
}

function generateUsageByDate(
  transactions: CombinedTransaction[],
  startStr: string,
  endStr: string
): UsageData[] {
  const dateMap: Record<
    string,
    {
      date: string;
      items_out: number;
      items_in: number;
      net_change: number;
      users: Set<string>;
      source_direct: number;
      source_request: number;
      source_return: number;
    }
  > = {};

  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T23:59:59.999');
  const current = new Date(start);
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    dateMap[dateStr] = {
      date: dateStr,
      items_out: 0,
      items_in: 0,
      net_change: 0,
      users: new Set(),
      source_direct: 0,
      source_request: 0,
      source_return: 0,
    };
    current.setDate(current.getDate() + 1);
  }

  transactions.forEach((trans) => {
    const dateStr = new Date(trans.date_time).toISOString().split('T')[0];
    if (!dateMap[dateStr]) return;
    dateMap[dateStr].users.add(trans.person_name || 'Unknown');
    const qty = trans.quantity || 0;
    if (trans.transaction_type === 'out') {
      dateMap[dateStr].items_out += qty;
      dateMap[dateStr].net_change -= qty;
      if (trans.source === 'direct') dateMap[dateStr].source_direct += qty;
      else if (trans.source === 'request') dateMap[dateStr].source_request += qty;
    } else {
      dateMap[dateStr].items_in += qty;
      dateMap[dateStr].net_change += qty;
      dateMap[dateStr].source_return += qty;
    }
  });

  return Object.values(dateMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({
      date: entry.date,
      formattedDate: formatReportDate(entry.date),
      items_out: entry.items_out,
      items_in: entry.items_in,
      net_change: entry.net_change,
      users: entry.users.size,
      source_direct: entry.source_direct,
      source_request: entry.source_request,
      source_return: entry.source_return,
    }));
}

function generateUsageByMonth(transactions: CombinedTransaction[]): UsageData[] {
  const monthMap: Record<
    string,
    {
      items_out: number;
      items_in: number;
      net_change: number;
      users: Set<string>;
      source_direct: number;
      source_request: number;
      source_return: number;
    }
  > = {};

  transactions.forEach((trans) => {
    const d = new Date(trans.date_time);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap[key]) {
      monthMap[key] = {
        items_out: 0,
        items_in: 0,
        net_change: 0,
        users: new Set(),
        source_direct: 0,
        source_request: 0,
        source_return: 0,
      };
    }
    monthMap[key].users.add(trans.person_name || 'Unknown');
    const qty = trans.quantity || 0;
    if (trans.transaction_type === 'out') {
      monthMap[key].items_out += qty;
      monthMap[key].net_change -= qty;
      if (trans.source === 'direct') monthMap[key].source_direct += qty;
      else if (trans.source === 'request') monthMap[key].source_request += qty;
    } else {
      monthMap[key].items_in += qty;
      monthMap[key].net_change += qty;
      monthMap[key].source_return += qty;
    }
  });

  return Object.keys(monthMap)
    .sort()
    .map((key) => {
      const [y, m] = key.split('-');
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      });
      const entry = monthMap[key];
      return {
        date: key,
        formattedDate: label,
        items_out: entry.items_out,
        items_in: entry.items_in,
        net_change: entry.net_change,
        users: entry.users.size,
        source_direct: entry.source_direct,
        source_request: entry.source_request,
        source_return: entry.source_return,
      };
    });
}

function generateTopItems(transactions: CombinedTransaction[], limit = 8): TopItem[] {
  const itemCounts: Record<
    string,
    { count: number; name: string; category: string; source: InventorySource }
  > = {};
  transactions.forEach((record) => {
    const itemId = record.item_id;
    if (!itemCounts[itemId]) {
      itemCounts[itemId] = {
        count: 0,
        name: record.item_name || 'Unknown Item',
        category: record.category_name || 'Uncategorized',
        source: record.source,
      };
    }
    itemCounts[itemId].count += record.quantity || 0;
  });
  return Object.values(itemCounts)
    .map((item) => ({
      name: item.name,
      count: item.count,
      category: item.category,
      source: item.source,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function generateTopUsers(transactions: CombinedTransaction[], limit = 8): TopUser[] {
  const userCounts: Record<string, { count: number; source: InventorySource }> = {};
  transactions.forEach((record) => {
    const personName = record.person_name || 'Unknown';
    if (!userCounts[personName]) userCounts[personName] = { count: 0, source: record.source };
    userCounts[personName].count += record.quantity || 0;
  });
  return Object.entries(userCounts)
    .map(([name, data]) => ({ name, count: data.count, source: data.source }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function buildCharts(
  filteredAll: CombinedTransaction[],
  filteredIssuances: CombinedTransaction[],
  filteredReturns: CombinedTransaction[],
  usageData: UsageData[]
): InventoryReportResult['charts'] {
  const totalOut = filteredIssuances.reduce((s, t) => s + (t.quantity || 0), 0);
  const totalIn = filteredReturns.reduce((s, t) => s + (t.quantity || 0), 0);
  const directOut = filteredIssuances
    .filter((t) => t.source === 'direct')
    .reduce((s, t) => s + (t.quantity || 0), 0);
  const requestOut = filteredIssuances
    .filter((t) => t.source === 'request')
    .reduce((s, t) => s + (t.quantity || 0), 0);

  const catOut: Record<string, number> = {};
  filteredIssuances.forEach((t) => {
    const c = t.category_name || 'Other';
    catOut[c] = (catOut[c] || 0) + (t.quantity || 0);
  });

  return {
    flow_split: [
      { name: 'Issued (Out)', value: totalOut, color: CHART_COLORS.out },
      { name: 'Returned (In)', value: totalIn, color: CHART_COLORS.in },
    ].filter((x) => x.value > 0),
    by_source_out: [
      { name: 'Direct issue', value: directOut, color: CHART_COLORS.direct },
      { name: 'Material request', value: requestOut, color: CHART_COLORS.request },
    ].filter((x) => x.value > 0),
    volume_by_period: usageData.map((d) => ({
      period: d.formattedDate,
      items_out: d.items_out,
      items_in: d.items_in,
      net_change: d.net_change,
    })),
    top_items_out: generateTopItems(filteredIssuances, 8).map((i) => ({
      name: i.name.length > 22 ? `${i.name.slice(0, 20)}…` : i.name,
      count: i.count,
    })),
    top_items_in: generateTopItems(filteredReturns, 8).map((i) => ({
      name: i.name.length > 22 ? `${i.name.slice(0, 20)}…` : i.name,
      count: i.count,
    })),
    top_categories_out: Object.entries(catOut)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
  };
}

export async function loadInventoryReportData(options: {
  mode: DateFilterMode;
  startDate: string;
  endDate: string;
}): Promise<InventoryReportResult> {
  const { mode, startDate, endDate } = options;

  const [itemsOutData, , requestsData, itemsData] = await Promise.all([
    getItemsOut(),
    getCategories(),
    getRequests(),
    getItems(),
  ]);

  if (!Array.isArray(itemsData)) throw new Error('Invalid items data');

  const allCompletedRequests = requestsData.filter(
    (r: Request) => r.status === 'completed' && r.type === 'material_request'
  );
  const allRequestDetailsArray = await Promise.all(
    allCompletedRequests.map((r: Request) => getRequestDetails(r.id))
  );

  const allRequestIssuances: CombinedTransaction[] = [];
  allRequestDetailsArray.forEach((details, index) => {
    const request = allCompletedRequests[index];
    if (request.release_by && details.items) {
      const approver = details.approvals?.[0]?.approver_name || null;
      const requester = request.created_by;
      details.items.forEach((item) => {
        if (item.quantity_received && item.quantity_received > 0) {
          const itemDetail = itemsData.find((i: Item) => i.id.toString() === item.item_id.toString());
              allRequestIssuances.push({
                id: `req-${request.id}-${item.id}`,
                record_id: String(request.id),
                person_name: request.release_by,
            item_id: item.item_id.toString(),
            quantity: item.quantity_received,
            date_time: request.updated_at,
            item_name: item.item_name,
            category_name: itemDetail?.category_name || 'Uncategorized',
            source: 'request',
            requester,
            approver: approver || undefined,
            transaction_type: 'out',
          });
        }
      });
    }
  });

  const allCompletedReturns = requestsData.filter(
    (r: Request) => r.status === 'completed' && r.type === 'item_return'
  );
  const allReturnDetailsArray = await Promise.all(
    allCompletedReturns.map((r: Request) => getRequestDetails(r.id))
  );

  const allReturnIssuances: CombinedTransaction[] = [];
  allReturnDetailsArray.forEach((details, index) => {
    const retRequest = allCompletedReturns[index];
    if (retRequest.release_by && details.items) {
      const approver = details.approvals?.[0]?.approver_name || null;
      const requester = retRequest.created_by;
      details.items.forEach((item) => {
        if (item.quantity_received && item.quantity_received > 0) {
          const itemDetail = itemsData.find((i: Item) => i.id.toString() === item.item_id.toString());
              allReturnIssuances.push({
                id: `ret-${retRequest.id}-${item.id}`,
                record_id: String(retRequest.id),
                person_name: retRequest.release_by,
            item_id: item.item_id.toString(),
            quantity: item.quantity_received,
            date_time: retRequest.updated_at,
            item_name: item.item_name,
            category_name: itemDetail?.category_name || 'Uncategorized',
            source: 'return',
            requester,
            approver: approver || undefined,
            transaction_type: 'in',
          });
        }
      });
    }
  });

  let allTransactions: CombinedTransaction[] = [
    ...itemsOutData.map((io: ItemOut) => ({
      ...io,
      record_id: io.id,
      source: 'direct' as const,
      transaction_type: 'out' as const,
    })),
    ...allRequestIssuances,
    ...allReturnIssuances,
  ];

  allTransactions = computeHistoricalStocks(allTransactions, itemsData);
  allTransactions.sort((a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime());

  let filteredAll = allTransactions;
  if (mode === 'range') {
    const startDateTime = new Date(startDate + 'T00:00:00');
    const endDateTime = new Date(endDate + 'T23:59:59.999');
    filteredAll = allTransactions.filter((trans) => {
      const transDate = new Date(trans.date_time);
      return transDate >= startDateTime && transDate <= endDateTime;
    });
  }

  const filteredIssuances = filteredAll.filter((t) => t.transaction_type === 'out');
  const filteredReturns = filteredAll.filter((t) => t.transaction_type === 'in');

  const usageData =
    mode === 'all'
      ? generateUsageByMonth(filteredAll)
      : generateUsageByDate(filteredAll, startDate, endDate);

  const currentTotal = itemsData.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const allOutTotal = allTransactions
    .filter((t) => t.transaction_type === 'out')
    .reduce((s, t) => s + (t.quantity || 0), 0);
  const allInTotal = allTransactions
    .filter((t) => t.transaction_type === 'in')
    .reduce((s, t) => s + (t.quantity || 0), 0);

  const sumOutRange = usageData.reduce((s, d) => s + d.items_out, 0);
  const sumInRange = usageData.reduce((s, d) => s + d.items_in, 0);
  let runningStock = currentTotal - sumInRange + sumOutRange;
  usageData.forEach((day) => {
    day.stock_before = runningStock;
    runningStock += day.net_change;
    day.stock_after = runningStock;
  });

  return {
    usageData,
    topItemsOut: generateTopItems(filteredIssuances, 8),
    topItemsIn: generateTopItems(filteredReturns, 8),
    topUsers: generateTopUsers(filteredAll, 8),
    filteredIssuances,
    filteredReturns,
    allTransactions: filteredAll,
    currentTotal,
    allOutTotal,
    allInTotal,
    charts: buildCharts(filteredAll, filteredIssuances, filteredReturns, usageData),
  };
}
