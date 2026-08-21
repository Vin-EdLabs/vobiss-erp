# VOBISS ERP — Payroll Module

Complete reference for the HR Payroll section: how Ghana PAYE + SSNIT pay is calculated, stored, generated, approved, paid, and printed as payslips.

---

## 1. What payroll does

Payroll turns each **active** employee’s salary and allowances into a monthly run with:

| Field | Meaning |
|-------|---------|
| **Basic salary** | Employee’s contracted monthly basic (from `hr_employees`) |
| **Allowances** | Recurring + one-off extras for that run |
| **Gross** | Basic + all allowances |
| **SSNIT (employee)** | Deducted from the employee (default **5.5% of basic**) |
| **SSNIT (employer)** | Company cost (default **13% of basic**) — shown for remittance, not deducted from net |
| **Taxable income** | What PAYE is applied to |
| **PAYE** | Ghana Pay-As-You-Earn income tax |
| **Net pay** | Gross − employee SSNIT − PAYE |

Currency is **GHS**. Amounts are rounded to **2 decimal places**.

**Who can use it:** HR staff (`/hr/payroll`). Linked from the HR sidebar and HR dashboard (“Generate Payroll”).

**Route:** `/hr/payroll` → `src/pages/hr/Payroll.tsx`

---

## 2. User-facing tabs (Payroll page)

The Payroll page has four tabs and a **month / year** picker in the header.

### 2.1 Overview

- Shows the lifecycle **stepper**: **Generate → Review → Approve → Mark Paid**
- Status comes from `hr_payroll.status`: `Draft` | `Approved` | `Paid` (or none if not generated)
- Summary cards: total gross, total deductions (employee SSNIT + PAYE), total net, employee count
- Full **employee table** for the selected month:
  - Basic, Allowances, Gross, SSNIT Emp, SSNIT Er, Taxable, PAYE, Net Pay
  - **View Payslip** opens the printable payslip dialog
- Footer row totals gross and net
- Actions by status:
  - **Not generated** → “Generate Payroll” (jumps to Generate tab)
  - **Draft** → “Review and Approve” / “Regenerate”
  - **Approved** → “Mark as Paid”
  - **Paid** → paid banner with net total and employee count

### 2.2 Generate Payroll

Three-step flow:

1. **Employee review**  
   - Lists all **active** employees with estimated gross/net (live preview).  
   - **Include** switch: exclude someone from this run.  
   - Expand a name to add a **one-off allowance/bonus** for this run only (name, amount, taxable yes/no).  
   - Shows configured recurring allowances under each expanded row.

2. **Calculation preview**  
   - Count of included employees + estimated company gross/net.

3. **Generate**  
   - Confirm dialog → creates/replaces the month’s payroll as **Draft**.

Regenerating the same month/year **deletes previous items**, resets status to Draft, and clears approve/paid timestamps.

### 2.3 Payslips

- Searchable list of employees in the current month’s run
- Net pay + **View** → same payslip dialog as Overview
- Payslip content (print / download PDF via browser print):
  - Company header (VOBISS SOLUTIONS LIMITED)
  - Employee, EMP-xxx ID, position, department, period, payment date
  - Earnings: basic + each allowance line (or lump allowances) → gross
  - Deductions: SSNIT (employee) + PAYE → total deductions
  - **NET PAY**
  - SSNIT number (from employee record)

### 2.4 Settings

Stored in `hr_payroll_settings` (single config row):

| Setting | Default | Notes |
|---------|---------|--------|
| Employee SSNIT rate % | 5.5 | Applied to **basic only** |
| Employer SSNIT rate % | 13.0 | Applied to **basic only**; remittance reference |
| PAYE tax bands | Ghana defaults (see §4) | Editable from/to/rate; can add bands; “Reset to Ghana Defaults” |
| Allowance types catalogue | `[]` | Named templates (fixed or %); used as HR reference when configuring employees |

Saving settings does **not** rewrite past payroll runs; it affects the next preview/generate.

---

## 3. Related screens (same payroll data)

### 3.1 Employee profile → Payroll tab

Path: `/hr/employees/:id` → **Payroll**

- **Recurring allowances** for that employee (`hr_employee_allowances`): add/remove, fixed or %, taxable flag  
- These flow into every payroll generate/preview (if effective dates cover the run month)
- **Payslip history** for that employee (past `hr_payroll_items` joined to runs)
- Download opens the same payslip view

### 3.2 Employee master fields used by payroll

On the employee record (`hr_employees`):

- `basic_salary` — required for meaningful pay
- `allowances` — optional **lump** monthly allowance (treated as taxable “Allowances” if no duplicate named line)
- `ssnit_number`, `bank_name`, `bank_account` — shown on payslips / reports
- Only `status = 'active'` employees are included in generate/preview

### 3.3 HR Dashboard

Shows payroll status for the current calendar month (Not generated / Draft / Approved / Paid) and shortcuts to generate or open Payroll.

### 3.4 HR Reports & Analytics

- Payroll report: per-employee lines + totals + bank/SSNIT for a month (`payrollReport`)
- Insights: monthly gross/net trend, department cost, average package (`payrollIntelligence`)

---

## 4. Calculation engine (source of truth)

**Authoritative math for generate/preview:**  
`backend/utils/payrollCalculator.js`  
wired through `backend/utils/hrPayrollEngine.js`

> Note: `backend/utils/taxCalculations.js` and `src/lib/taxCalculations.ts` contain an older helper with a slightly different employer rate (13.5%) and band shape. **Live payroll generation uses `payrollCalculator.js` + saved settings**, not those helpers. The frontend `formatGhs` helpers in `src/lib/taxCalculations.ts` are used for display only.

### 4.1 Formula (per employee)

```
basic          = employee.basic_salary
allowances     = sum of effective recurring allowances
               + one-off extras for this run
               + lump employee.allowances (if present)
gross          = basic + allowances

ssnit_employee = basic × (employee_rate / 100)     // default 5.5%
ssnit_employer = basic × (employer_rate / 100)     // default 13%

taxable_allowances = sum of allowance amounts where taxable ≠ false
taxable_income     = max(0, basic + taxable_allowances − ssnit_employee)

paye               = PAYE(taxable_income, tax_bands)
net_pay            = gross − ssnit_employee − paye
```

**Important details**

- SSNIT is on **basic only**, not on allowances.
- Non-taxable allowances increase gross/net but **not** taxable income.
- Percentage allowances: `amount = basic × (value / 100)`.
- Fixed allowances: `amount = value`.
- Employer SSNIT is stored on each line for remittance reporting; it does **not** reduce net pay.

### 4.2 Default Ghana PAYE bands (monthly GHS)

| From | To | Rate |
|------|-----|------|
| 0 | 490 | 0% |
| 490 | 600 | 5% |
| 600 | 730 | 10% |
| 730 | 3730 | 17.5% |
| 3730 | 20125 | 25% |
| 20125 | unlimited | 35% |

Bands are applied progressively on remaining taxable income (sorted by `from`).

### 4.3 Example

Employee: basic **GHS 3,000**, taxable transport allowance **GHS 200**, settings at defaults.

```
gross            = 3,200
ssnit_employee   = 3,000 × 5.5% = 165
ssnit_employer   = 3,000 × 13%  = 390
taxable_income   = 3,000 + 200 − 165 = 3,035
paye             = PAYE(3,035) on the bands above
net_pay          = 3,200 − 165 − paye
```

---

## 5. Lifecycle / workflow

```
(no row) ──generate──► Draft ──approve──► Approved ──mark paid──► Paid
              ▲
              └── regenerate (same month/year) resets to Draft
```

| Status | Meaning |
|--------|---------|
| **Draft** | Calculated and saved; still editable by regenerating |
| **Approved** | Reviewed; `approved_by` / `approved_at` set |
| **Paid** | Marked paid; `paid_at` set (approval fields kept if already set) |

Allowed statuses in code: `Draft`, `Approved`, `Paid`.

Activity log: generating writes `payslip_generated` to `hr_activity`.

---

## 6. Database tables

Defined/migrated in `backend/db/hr.js`.

### 6.1 `hr_payroll` — one run per month/year

| Column | Purpose |
|--------|---------|
| `month`, `year` | Unique period |
| `status` | Draft / Approved / Paid |
| `generated_by`, `generated_at` | Who/when created |
| `approved_by`, `approved_at` | Who/when approved |
| `paid_at` | When marked paid |

### 6.2 `hr_payroll_items` — one row per employee in a run

| Column | Purpose |
|--------|---------|
| `payroll_id`, `employee_id` | Unique pair |
| `basic_salary`, `allowances`, `gross` | Earnings |
| `ssnit_employer`, `ssnit_employee` | SSNIT |
| `taxable_income`, `paye`, `net_pay` | Tax + net |
| `allowance_breakdown` | JSONB list of named allowance lines for the payslip |

### 6.3 `hr_payroll_settings`

| Column | Purpose |
|--------|---------|
| `ssnit_employee_rate`, `ssnit_employer_rate` | Percentages |
| `tax_bands` | JSONB band array `{ from, to, rate }` |
| `allowance_types` | JSONB catalogue |
| `updated_by`, `updated_at` | Audit |

### 6.4 `hr_employee_allowances`

| Column | Purpose |
|--------|---------|
| `employee_id` | Owner |
| `allowance_name`, `allowance_type` | Name; `fixed` or `percentage` |
| `value`, `taxable` | Amount/% and tax flag |
| `effective_from`, `effective_to` | Optional date window; payroll uses month’s 1st as “as of” |

---

## 7. API endpoints

All under the HR router (authenticated HR access). Client wrapper: `src/api/hr.ts`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/payroll?month=&year=` | Payroll header + items for period |
| `GET` | `/payroll` | History list (all periods) |
| `POST` | `/payroll` or `/payroll/generate` | Generate/regenerate Draft run |
| `POST` | `/payroll/preview` | Dry-run calc (no DB write) |
| `GET` | `/payroll/settings` | Load settings |
| `PUT` | `/payroll/settings` | Save settings |
| `GET` | `/payroll/:id/items` | Items by payroll id |
| `PUT` | `/payroll/:id` | Set status |
| `PATCH` | `/payroll/:id/approve` | → Approved |
| `PATCH` | `/payroll/:id/mark-paid` | → Paid |
| `GET` | `/payroll/employee/:employeeId/slip/:month/:year` | Full payslip payload |
| `GET` | `/employees/:id/payroll` | Employee payslip history |
| `GET/POST/PUT/DELETE` | `/employee-allowances…` | Recurring allowances CRUD |

### Generate / preview body (optional)

```json
{
  "month": 8,
  "year": 2026,
  "employee_overrides": [
    {
      "employee_id": 12,
      "included": true,
      "additional_allowances": [
        { "allowance_name": "Bonus", "type": "fixed", "value": 500, "taxable": true }
      ]
    },
    { "employee_id": 15, "included": false }
  ]
}
```

---

## 8. Key source files

| Area | File |
|------|------|
| UI — Payroll page | `src/pages/hr/Payroll.tsx` |
| UI — Employee allowances & history | `src/pages/hr/EmployeeProfile.tsx` |
| API client | `src/api/hr.ts` |
| Display currency | `src/lib/taxCalculations.ts` (`formatGhs`) |
| Routes | `backend/routes/hr.js` (Payroll section) |
| Calc engine | `backend/utils/payrollCalculator.js` |
| Settings + allowance loaders | `backend/utils/hrPayrollEngine.js` |
| Schema / migrations | `backend/db/hr.js` |
| Reports | `backend/utils/hrReports.js` → `payrollReport` |
| Analytics | `backend/utils/hrInsights.js` → `payrollIntelligence` |

---

## 9. Operational checklist (HR)

1. Ensure employees are **active**, with correct **basic salary** (and bank/SSNIT if needed on payslips).
2. Configure recurring **allowances** on each employee profile (and/or lump `allowances` field).
3. Confirm **Settings** (SSNIT rates + PAYE bands) match current Ghana rules.
4. Open Payroll → select **month/year** → **Generate** tab.
5. Include/exclude people; add one-off bonuses if needed.
6. Confirm generate → review Overview table.
7. **Approve**, then **Mark as Paid** after funds are remitted.
8. Print/download individual payslips as needed.
9. Use HR Reports for bank/SSNIT remittance summaries for the month.

---

## 10. Edge cases & rules of thumb

- **Inactive / suspended** employees are never auto-included.
- **Regenerate** wipes that month’s items and approval/payment stamps — only do this before pay is finalized.
- Changing settings mid-year does not recalculate old Paid runs.
- Allowance effective dates: generate uses the **1st of the payroll month** as the as-of date.
- Employer SSNIT is a cost to the company for remittance; employees see only employee SSNIT + PAYE on the payslip deductions block.
- Mobile: payroll tables scroll horizontally; employee name column stays sticky on the main overview table.

---

## 11. Quick glossary

| Term | Meaning in VOBISS |
|------|-------------------|
| **PAYE** | Progressive Ghana income tax on taxable income |
| **SSNIT** | Social Security & National Insurance Trust contributions |
| **Gross** | Basic + allowances before statutory deductions |
| **Net** | Take-home after employee SSNIT and PAYE |
| **Draft** | Generated but not yet approved |
| **One-off allowance** | Extra for a single generate run only |
| **Recurring allowance** | Stored on the employee; applied every eligible month |

## 12. My Payslips (employee self-service)

- Sidebar: **My HR → My Payslips** (`/hr-self/payslips`, also `/employee/payslips`)
- APIs (bound to authenticated employee only):
  - `GET /api/hr-self/payslips`
  - `GET /api/hr-self/payslips/:month/:year`
  - `GET /api/hr-self/payslips/:month/:year/pdf` (Puppeteer)

## 13. Payroll History & Reports (HR)

- Sidebar: **Human Resources → Payroll History** (`/hr/payroll-history`)
- Year archive of every payroll run; open a month to see each employee
- Uses `GET /api/hr/payroll` (list) and `GET /api/hr/payroll?month=&year=` (detail)

## 14. Payslip PDF (Puppeteer)

- Template: `backend/utils/payslipHtml.js`
- Renderer: `backend/utils/payslipPdf.js`
- HR download: `GET /api/hr/payroll/employee/:id/slip/:month/:year/pdf`
- Screen layout: `src/components/hr/PayslipView.tsx` (shared modal)

