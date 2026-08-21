/** Parse JSON/JSONB fields that may arrive as arrays or strings from the API. */
export function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function sumOtherDeductions(row: any): number {
  const explicit = Number(row?.other_deductions);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return parseJsonArray(row?.deduction_breakdown).reduce(
    (s: number, d: any) => s + Number(d.amount || 0),
    0
  );
}

export function loanDeductionAmount(row: any): number {
  return parseJsonArray(row?.deduction_breakdown)
    .filter((d: any) => d.is_loan || d.is_advance)
    .reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
}
