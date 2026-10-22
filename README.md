# MP Power — Outsourced Workforce, Attendance & Statutory Compliance Digital Control Tower

Interactive enterprise prototype (React + TypeScript) covering ~60,000 outsourced personnel across
vendors, contracts, regions, circles, divisions and locations — with drill-down traceability from
enterprise KPIs to individual employee records.

> **All data is fictional and generated deterministically.** No real employees, vendors or
> operational figures are used. Statutory rates and ceilings are *configurable demo parameters*,
> not authoritative values. No direct government-portal integration is implemented.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm test           # Vitest data-consistency tests
```

Requires Node 18+ (developed on Node 24).

## Stack

Vite · React 18 · TypeScript (strict) · Tailwind CSS (token-based design system, light/dark/system) ·
Radix primitives (shadcn-style components in `src/components/ui`) · Lucide icons · Recharts ·
TanStack Table (server-style manual paging/sorting) · TanStack Query · Zustand (UI + global filters) ·
React Hook Form + Zod · cmdk (Ctrl/Cmd+K palette) · sonner (toasts) · date-fns · Vitest.

Vite was chosen over Next.js because the prototype is a fully client-side SPA with a simulated API;
the service layer is shaped so a real backend can be swapped in without touching components.

## Architecture

```
src/
  types/            Domain types (Employee, PFRecord, Invoice, WorkflowStage, AuditEvent, …)
  data/             Deterministic mock-data layer (seeded PRNG, exact quotas)
    config.ts       Demo statutory parameters, wage months, month targets, demo quotas
    org.ts          5 regions → 17 circles → ~60 divisions → ~240 locations
    vendors.ts      32 fictional vendors, ~65 contracts
    roster.ts       60,248-person columnar roster (typed arrays) + on-demand records
    snapshot.ts     Per-wage-month statuses (attendance, PF, ESI, salary) by exact quota
    wages.ts        Wage / PF / ESI / salary computations from configured parameters
    attendance.ts   Attendance registers + exception records
    invoices.ts     Invoices per contract/month + approval workflow
    exceptions.ts   Unified exception register + resolution timelines
    activity.ts     Notifications and audit events
  services/         API boundary: simulate() latency/errors, filtering, paging, aggregation
  store/            Zustand: UI (role, theme, sidebar) and applied global filters (session-persisted)
  hooks/            useScope (filters ∩ role scope), useUrlParam (drill-down state in URL)
  components/
    ui/             Button, Card, Dialog/Sheet, Dropdown, Popover, Tabs, Tooltip, Checkbox …
    layout/         App shell, sidebar, header, command palette, notifications
    filters/        Cascading global filter bar + searchable multi-select
    charts/         Theme-aware chart kit, gauge, bar list, compliance trend
    tables/         Reusable DataTable (sort, search, paging, column visibility, selection, export)
    feedback/       Status/severity/risk badges, KPI cards, loading/empty/error states,
                    exception actions (RHF + Zod), timeline, error boundary
  features/         One folder per module (overview, workforce, attendance, compliance, pf, esi,
                    salary, vendors, contracts, invoices, exceptions, employees, analytics, ask,
                    reports, audit, admin)
```

## Mandatory demo path

1. **Overview** → PF Compliance **96.8%** → click the KPI.
2. PF Reconciliation shows **1,598** employees with exceptions.
3. Click **Contribution Not Found** in the exception breakdown.
4. Open **EMP-10234 · Rajesh Sharma** (or press Ctrl+K and type `EMP-10234`).
5. **Employee 360** shows attendance, payable days, wage, expected vs reported PF and the difference;
   the lifecycle trace marks PF in red.
6. Follow the vendor link → **Vendor 360: ABC Manpower** — Critical risk.
7. Open its blocked invoice → **Compliance gate: PF Compliance FAILED → INVOICE BLOCKED**
   ("PF exceptions unresolved for 17 employees").
8. **View 17 employees** → PF table filtered to exactly those 17.
9. Open the exception (**EXC-PF-10234**) → timeline shows the vendor response and the
   MP Power review in progress.

The header **?** button shows this script in-app.

## Data consistency & assumptions

- The roster is generated once from fixed seeds; statuses are assigned by **exact quota**
  (weighted toward riskier vendors), so every KPI is a count over the same records and all
  rollups (region → vendor → contract → employee) reconcile. `src/data/data.test.ts` asserts the
  demo quotas.
- Demo values reproduced exactly: workforce 60,248 · sanctioned 62,500 (2,252 vacant) ·
  present 56,742 (94.2%) · PF 48,312 compliant / 1,598 exceptions (96.8%) · ESI 32,184 / 862
  (97.4%) · salary verified 98.1% · 23 blocked invoices · 7 contracts expiring within 30 days.
- **Deviations from the sample figures in the brief (deliberate, for internal consistency):**
  - Alerts show the full counts (1,598 PF / 862 ESI exceptions, 412 delayed salaries) rather than
    the brief's 327 / 184, which conflicted with the headline exception counts.
  - "Open exceptions" and "critical exceptions" are **computed** from the unified register
    (PF + ESI + salary + attendance + wage + master + deployment + document + contract + invoice),
    so they are higher than the brief's illustrative 2,341 / 147.
- Earlier wage months are generated from per-month compliance targets; trends for filtered scopes
  are anchored to the scope's actual current value.
- PF/ESI applicability and the ESI wage ceiling are roster attributes consistent with the
  configured parameters (`src/data/config.ts`, version `CFG-DEMO-2026.04`).
- Salary status refers to the **employee's salary credit** (verified against the bank file);
  vendor invoice payment is tracked separately in Invoices.
- Uploaded challans are not treated as employee-level proof ("Evidence Pending" stays an exception).

## Security & privacy

- Role switcher (user menu) demonstrates 9 roles. `src/lib/rbac.ts` shapes navigation, actions and
  data scope **client-side only** — production must enforce authorisation and row-level scoping
  server-side. Vendor User, Division Officer and Site Officer get a mandatory data scope.
- Consequential actions (resolve, escalate, approve/return invoice, config edits) require a reason,
  show an authorisation/audit notice, and are simulated.
- UAN, ESIC, bank, Aadhaar and mobile numbers are masked everywhere; CSV exports are masked and
  labelled as demo data. Excel/PDF exports are simulated.

## Demo controls

Settings › Demo controls lets you simulate API failures (to see error states) and reset local demo
state. Theme: Light / Dark / System from the header.
