import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { hrSelfApi, HR_SELF_QUERY } from '@/api/hrSelf';
import { formatGhs } from '@/lib/taxCalculations';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { EmptyState, HrPageHeader, StatCard, StatusBadge, TableSkeleton, inputClass, YearSelect } from '@/pages/hr/components';
import { PayslipView } from '@/components/hr/PayslipView';
import { API_URL } from '@/lib/api';

function periodLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' });
}

async function downloadSelfPdf(month: number, year: number) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_URL}/hr-self/payslips/${month}/${year}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to download PDF');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `my-payslip-${month}-${year}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

const HrSelfPayslips = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [slip, setSlip] = useState<any>(null);

  const historyQ = useQuery({
    queryKey: ['hr-self', 'payslips'],
    queryFn: hrSelfApi.payslips,
    ...HR_SELF_QUERY,
  });
  const periodQ = useQuery({
    queryKey: ['hr-self', 'payslip', month, year],
    queryFn: () => hrSelfApi.payslip(month, year),
    ...HR_SELF_QUERY,
    retry: false,
  });

  const history = historyQ.data || [];
  const current = periodQ.data;
  const periodMissing = periodQ.isError || (!periodQ.isLoading && !current);

  const deductions = useMemo(() => {
    if (!current) return 0;
    return Number(current.ssnit_employee || 0) + Number(current.paye || 0);
  }, [current]);

  const openSlip = async (m: number, y: number) => {
    try {
      setSlip(await hrSelfApi.payslip(m, y));
    } catch (e: any) {
      toast.error(e.message || 'Payslip not found');
    }
  };

  return (
    <div>
      <HrPageHeader
        title="My Payslips"
        description="View and download your monthly payslips."
        actions={
          <div className="flex gap-2">
            <select className={`${inputClass} w-36`} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}
                </option>
              ))}
            </select>
            <YearSelect value={year} onChange={setYear} />
          </div>
        }
      />

      {periodQ.isLoading ? (
        <TableSkeleton rows={3} cols={4} />
      ) : periodMissing ? (
        <EmptyState title="No payslip available for this period" description={`Nothing generated for ${periodLabel(month, year)} yet.`} />
      ) : (
        <div className="mb-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Pay Period</p>
              <p className="text-lg font-semibold text-[var(--text-primary)]">{periodLabel(month, year)}</p>
              <div className="mt-2">
                <StatusBadge status={current.payroll_status} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setSlip(current)}>View Payslip</Button>
              <Button
                onClick={async () => {
                  try {
                    await downloadSelfPdf(month, year);
                  } catch (e: any) {
                    toast.error(e.message);
                  }
                }}
              >
                Download PDF
              </Button>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Gross Pay" value={formatGhs(current.gross)} accentIndex={0} />
            <StatCard label="Total Deductions" value={formatGhs(deductions)} accentIndex={2} />
            <StatCard label="Net Pay" value={formatGhs(current.net_pay)} accentIndex={0} />
            <StatCard label="Status" value={current.payroll_status || '—'} accentIndex={1} />
          </div>
          <p className="mt-4 text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Net Pay: {formatGhs(current.net_pay)}
          </p>
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Payslip History</h2>
      {historyQ.isLoading ? (
        <TableSkeleton />
      ) : history.length === 0 ? (
        <EmptyState title="No payslip history yet" description="Your payslips will appear here after HR generates payroll." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
          <table className="vobiss-table w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                <th className="px-3 py-3">Period</th>
                <th className="px-3 py-3">Gross</th>
                <th className="px-3 py-3">Deductions</th>
                <th className="px-3 py-3">Net Pay</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {history.map((row: any) => {
                const ded = Number(row.ssnit_employee || 0) + Number(row.paye || 0);
                return (
                  <tr key={row.id} className="border-b">
                    <td className="px-3 py-3">{periodLabel(Number(row.month), Number(row.year))}</td>
                    <td className="px-3 py-3">{formatGhs(row.gross)}</td>
                    <td className="px-3 py-3">{formatGhs(ded)}</td>
                    <td className="px-3 py-3 font-semibold text-[var(--success-text)]">{formatGhs(row.net_pay)}</td>
                    <td className="px-3 py-3"><StatusBadge status={row.payroll_status} /></td>
                    <td className="px-3 py-3">
                      <Button size="sm" variant="outline" onClick={() => openSlip(Number(row.month), Number(row.year))}>
                        View
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!slip} onOpenChange={() => setSlip(null)}>
        <DialogContent className="max-w-2xl print:max-w-none print:border-0 print:shadow-none">
          {slip && <PayslipView slip={slip} />}
          <DialogFooter className="print:hidden">
            <Button variant="outline" onClick={() => window.print()}>Print</Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await downloadSelfPdf(Number(slip.month), Number(slip.year));
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            >
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HrSelfPayslips;
