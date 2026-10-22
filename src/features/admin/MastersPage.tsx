import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { CIRCLES, DIVISIONS, LOCATIONS, REGIONS, circleById, divisionById, regionById } from '@/data/org'
import { VENDORS, contractsByVendor } from '@/data/vendors'
import { CATEGORIES } from '@/data/roster'
import { contractRows } from '@/services/entities'
import { simulate } from '@/services/api'
import { useScope } from '@/hooks/useScope'
import { PageHeader, Section } from '@/components/layout/page'
import { DataTable, useTableState } from '@/components/tables/DataTable'
import { ErrorState } from '@/components/feedback/states'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlays'
import { fmtINR, fmtNum, fmtPct } from '@/lib/utils'
import { useClientPage, fmtDate } from './shared'

// ---------- Static demo masters ----------
const DESIGNATIONS: Array<{ id: string; category: string; designation: string; code: string }> = [
  ['Unskilled', ['Helper', 'Sweeper', 'Line Helper', 'Loader']],
  ['Semi-skilled', ['Assistant Lineman', 'Pump Operator', 'Meter Reader', 'Store Assistant']],
  ['Skilled', ['Lineman', 'Electrician', 'Fitter', 'Welder', 'Substation Operator']],
  ['Highly Skilled', ['Shift Engineer (Contract)', 'Instrument Technician', 'SCADA Operator']],
  ['Clerical', ['Data Entry Operator', 'Office Assistant', 'Billing Clerk']],
  ['Security', ['Security Guard', 'Security Supervisor', 'Gunman']],
  ['Driver', ['Light Vehicle Driver', 'Heavy Vehicle Driver']],
].flatMap(([category, list]) =>
  (list as string[]).map((designation, k) => ({ id: `${category}-${k}`, category: category as string, designation, code: `DSG-${(category as string).slice(0, 2).toUpperCase()}${String(k + 1).padStart(2, '0')}` })),
)

const BASE_RATE: Record<string, number> = { Unskilled: 11200, 'Semi-skilled': 12350, Skilled: 13900, 'Highly Skilled': 15600, Clerical: 12900, Security: 12600, Driver: 13600 }
const WAGE_RATES = CATEGORIES.flatMap((c) =>
  (['Zone A (urban)', 'Zone B (semi-urban)', 'Zone C (rural)'] as const).map((zone, z) => {
    const basic = Math.round((BASE_RATE[c]! * (1 - z * 0.06)) / 10) * 10
    const vda = Math.round(basic * 0.18)
    return { id: `${c}-${z}`, category: c as string, zone, basic, vda, monthly: basic + vda, daily: Math.round((basic + vda) / 26), effectiveFrom: '2026-04-01' }
  }),
)
type WageRate = (typeof WAGE_RATES)[number]

// ---------- Generic searchable table ----------
function MasterTable<T>({ name, rows, columns, search, getId }: { name: string; rows: T[] | undefined; columns: ColumnDef<T, unknown>[]; search: (r: T) => Array<string | null | undefined>; getId: (r: T) => string }) {
  const t = useTableState({ pageSize: 25 })
  const page = useClientPage(['master', name], rows, t, search)
  return (
    <DataTable
      caption={name}
      columns={columns}
      result={page.data}
      state={t}
      isPending={rows === undefined || page.isPending}
      isFetching={page.isFetching}
      error={page.error}
      onRetry={() => page.refetch()}
      getRowId={getId}
      searchPlaceholder={`Search ${name.toLowerCase()}…`}
      exportName={`master-${name.toLowerCase().replace(/\s+/g, '-')}`}
      exportAll={async () => rows ?? []}
      dense
    />
  )
}

const n = (v: number) => fmtNum(v)

export default function MastersPage() {
  const { filters } = useScope()
  const [tab, setTab] = useState('regions')

  const q = useQuery({
    queryKey: ['masters'],
    queryFn: () =>
      simulate(() => {
        // Importing services guarantees derived master fields (sanctioned strength) are initialised.
        const contracts = contractRows({ ...filters, regions: [], circles: [], divisions: [], locations: [], vendors: [], contracts: [], categories: [], compliance: [] })
        const circlesPerRegion = new Map<string, number>()
        const divsPerCircle = new Map<string, number>()
        const locsPerDiv = new Map<string, number>()
        for (const c of CIRCLES) circlesPerRegion.set(c.regionId, (circlesPerRegion.get(c.regionId) ?? 0) + 1)
        for (const d of DIVISIONS) divsPerCircle.set(d.circleId, (divsPerCircle.get(d.circleId) ?? 0) + 1)
        for (const l of LOCATIONS) locsPerDiv.set(l.divisionId, (locsPerDiv.get(l.divisionId) ?? 0) + 1)
        const sanctionedBy = (pred: (d: (typeof DIVISIONS)[number]) => boolean) => DIVISIONS.filter(pred).reduce((a, d) => a + d.sanctioned, 0)
        return {
          regions: REGIONS.map((r) => ({
            ...r,
            circles: circlesPerRegion.get(r.id) ?? 0,
            divisions: DIVISIONS.filter((d) => d.regionId === r.id).length,
            locations: LOCATIONS.filter((l) => l.regionId === r.id).length,
            sanctioned: sanctionedBy((d) => d.regionId === r.id),
          })),
          circles: CIRCLES.map((c) => ({ ...c, region: regionById.get(c.regionId)!.name, divisions: divsPerCircle.get(c.id) ?? 0, locations: LOCATIONS.filter((l) => l.circleId === c.id).length, sanctioned: sanctionedBy((d) => d.circleId === c.id) })),
          divisions: DIVISIONS.map((d) => ({ ...d, circle: circleById.get(d.circleId)!.name, region: regionById.get(d.regionId)!.name, locations: locsPerDiv.get(d.id) ?? 0 })),
          locations: LOCATIONS.map((l) => ({ ...l, division: divisionById.get(l.divisionId)!.name, circle: circleById.get(l.circleId)!.name, region: regionById.get(l.regionId)!.name })),
          vendors: VENDORS.map((v) => ({ ...v, contracts: contractsByVendor.get(v.id)?.length ?? 0 })),
          contracts,
        }
      }),
  })
  const d = q.data

  type RegionRow = NonNullable<typeof d>['regions'][number]
  type CircleRow = NonNullable<typeof d>['circles'][number]
  type DivisionRow = NonNullable<typeof d>['divisions'][number]
  type LocationRow = NonNullable<typeof d>['locations'][number]
  type VendorRow = NonNullable<typeof d>['vendors'][number]
  type ContractRow = NonNullable<typeof d>['contracts'][number]
  type DesignationRow = (typeof DESIGNATIONS)[number]

  const cols = useMemo(
    () => ({
      regions: [
        { accessorKey: 'code', header: 'Code', cell: ({ row }) => <span className="font-mono">{row.original.code}</span> },
        { accessorKey: 'name', header: 'Region' },
        { accessorKey: 'circles', header: 'Circles', meta: { align: 'right' } },
        { accessorKey: 'divisions', header: 'Divisions', meta: { align: 'right' } },
        { accessorKey: 'locations', header: 'Locations', meta: { align: 'right' } },
        { accessorKey: 'sanctioned', header: 'Sanctioned', cell: ({ row }) => n(row.original.sanctioned), meta: { align: 'right' } },
      ] as ColumnDef<RegionRow, unknown>[],
      circles: [
        { accessorKey: 'id', header: 'ID', cell: ({ row }) => <span className="font-mono">{row.original.id}</span> },
        { accessorKey: 'name', header: 'Circle' },
        { accessorKey: 'region', header: 'Region', meta: { hideBelow: 'md' } },
        { accessorKey: 'divisions', header: 'Divisions', meta: { align: 'right' } },
        { accessorKey: 'locations', header: 'Locations', meta: { align: 'right' } },
        { accessorKey: 'sanctioned', header: 'Sanctioned', cell: ({ row }) => n(row.original.sanctioned), meta: { align: 'right' } },
      ] as ColumnDef<CircleRow, unknown>[],
      divisions: [
        { accessorKey: 'id', header: 'ID', cell: ({ row }) => <span className="font-mono">{row.original.id}</span> },
        { accessorKey: 'name', header: 'Division' },
        { accessorKey: 'circle', header: 'Circle', meta: { hideBelow: 'md' } },
        { accessorKey: 'region', header: 'Region', meta: { hideBelow: 'lg' } },
        { accessorKey: 'locations', header: 'Locations', meta: { align: 'right' } },
        { accessorKey: 'sanctioned', header: 'Sanctioned', cell: ({ row }) => n(row.original.sanctioned), meta: { align: 'right' } },
      ] as ColumnDef<DivisionRow, unknown>[],
      locations: [
        { accessorKey: 'id', header: 'ID', cell: ({ row }) => <span className="font-mono">{row.original.id}</span> },
        { accessorKey: 'name', header: 'Location' },
        { accessorKey: 'type', header: 'Type' },
        { accessorKey: 'division', header: 'Division', meta: { hideBelow: 'md' } },
        { accessorKey: 'circle', header: 'Circle', meta: { hideBelow: 'lg' } },
        { accessorKey: 'region', header: 'Region', meta: { hideBelow: 'xl' } },
      ] as ColumnDef<LocationRow, unknown>[],
      vendors: [
        { accessorKey: 'id', header: 'ID', cell: ({ row }) => <span className="font-mono">{row.original.id}</span> },
        { accessorKey: 'name', header: 'Vendor' },
        { accessorKey: 'gstinMasked', header: 'GSTIN (masked)', cell: ({ row }) => <span className="font-mono text-[13px]">{row.original.gstinMasked}</span>, meta: { hideBelow: 'md' } },
        { accessorKey: 'registeredOffice', header: 'Registered office', meta: { hideBelow: 'lg' } },
        { accessorKey: 'contactPerson', header: 'Contact', meta: { hideBelow: 'lg' } },
        { accessorKey: 'since', header: 'Since', meta: { align: 'right', hideBelow: 'md' } },
        { accessorKey: 'contracts', header: 'Contracts', meta: { align: 'right' } },
      ] as ColumnDef<VendorRow, unknown>[],
      contracts: [
        { accessorKey: 'number', header: 'Contract No.', cell: ({ row }) => <span className="font-mono text-[13px]">{row.original.number}</span> },
        { accessorKey: 'vendorName', header: 'Vendor' },
        { accessorKey: 'scope', header: 'Scope', meta: { hideBelow: 'md' } },
        { accessorKey: 'regionName', header: 'Region', meta: { hideBelow: 'lg' } },
        { accessorKey: 'startDate', header: 'Start', cell: ({ row }) => fmtDate(row.original.startDate), meta: { hideBelow: 'xl' } },
        { accessorKey: 'endDate', header: 'End', cell: ({ row }) => fmtDate(row.original.endDate), meta: { hideBelow: 'md' } },
        { accessorKey: 'sanctionedManpower', header: 'Sanctioned', cell: ({ row }) => n(row.original.sanctionedManpower), meta: { align: 'right' } },
        { accessorKey: 'serviceChargePct', header: 'Service charge', cell: ({ row }) => fmtPct(row.original.serviceChargePct, 2), meta: { align: 'right', hideBelow: 'lg' } },
        { accessorKey: 'value', header: 'Value', cell: ({ row }) => fmtINR(row.original.value, { compact: true }), meta: { align: 'right', hideBelow: 'md' } },
      ] as ColumnDef<ContractRow, unknown>[],
      designations: [
        { accessorKey: 'code', header: 'Code', cell: ({ row }) => <span className="font-mono">{row.original.code}</span> },
        { accessorKey: 'category', header: 'Employee category' },
        { accessorKey: 'designation', header: 'Designation' },
      ] as ColumnDef<DesignationRow, unknown>[],
      wages: [
        { accessorKey: 'category', header: 'Category' },
        { accessorKey: 'zone', header: 'Zone' },
        { accessorKey: 'basic', header: 'Basic (₹/month)', cell: ({ row }) => fmtINR(row.original.basic), meta: { align: 'right' } },
        { accessorKey: 'vda', header: 'VDA (₹/month)', cell: ({ row }) => fmtINR(row.original.vda), meta: { align: 'right', hideBelow: 'md' } },
        { accessorKey: 'monthly', header: 'Total (₹/month)', cell: ({ row }) => fmtINR(row.original.monthly), meta: { align: 'right' } },
        { accessorKey: 'daily', header: 'Daily (₹)', cell: ({ row }) => fmtINR(row.original.daily), meta: { align: 'right', hideBelow: 'md' } },
        { accessorKey: 'effectiveFrom', header: 'Effective from', cell: ({ row }) => fmtDate(row.original.effectiveFrom), meta: { hideBelow: 'lg' } },
      ] as ColumnDef<WageRate, unknown>[],
    }),
    [],
  )

  const tabs: Array<[string, string, number | undefined]> = [
    ['regions', 'Regions', d?.regions.length],
    ['circles', 'Circles', d?.circles.length],
    ['divisions', 'Divisions', d?.divisions.length],
    ['locations', 'Locations', d?.locations.length],
    ['vendors', 'Vendors', d?.vendors.length],
    ['contracts', 'Contracts', d?.contracts.length],
    ['designations', 'Categories & designations', DESIGNATIONS.length],
    ['wages', 'Wage rates', WAGE_RATES.length],
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Masters" subtitle="Reference data used across the control tower: organisation hierarchy, vendors, contracts, categories and wage rates." />
      <Section title="Master data" description="Read-only in this prototype. In production, master changes go through maker-checker approval and are audit-logged." bodyClassName="p-0">
        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <div className="px-4 pt-2">
            <TabsList>
              {tabs.map(([v, label, count]) => (
                <TabsTrigger key={v} value={v}>
                  {label}
                  {count !== undefined && <span className="num rounded bg-muted px-1.5 text-2xs text-muted-foreground">{fmtNum(count)}</span>}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="regions" className="pt-0">
            <MasterTable name="Regions" rows={d?.regions} columns={cols.regions} search={(r) => [r.name, r.code, r.id]} getId={(r) => r.id} />
          </TabsContent>
          <TabsContent value="circles" className="pt-0">
            <MasterTable name="Circles" rows={d?.circles} columns={cols.circles} search={(r) => [r.name, r.region, r.id]} getId={(r) => r.id} />
          </TabsContent>
          <TabsContent value="divisions" className="pt-0">
            <MasterTable name="Divisions" rows={d?.divisions} columns={cols.divisions} search={(r) => [r.name, r.circle, r.region, r.id]} getId={(r) => r.id} />
          </TabsContent>
          <TabsContent value="locations" className="pt-0">
            <MasterTable name="Locations" rows={d?.locations} columns={cols.locations} search={(r) => [r.name, r.type, r.division, r.circle, r.id]} getId={(r) => r.id} />
          </TabsContent>
          <TabsContent value="vendors" className="pt-0">
            <MasterTable name="Vendors" rows={d?.vendors} columns={cols.vendors} search={(r) => [r.name, r.shortName, r.id, r.registeredOffice]} getId={(r) => r.id} />
          </TabsContent>
          <TabsContent value="contracts" className="pt-0">
            <MasterTable name="Contracts" rows={d?.contracts} columns={cols.contracts} search={(r) => [r.number, r.vendorName, r.scope, r.regionName, r.id]} getId={(r) => r.id} />
          </TabsContent>
          <TabsContent value="designations" className="pt-0">
            <MasterTable name="Designations" rows={DESIGNATIONS} columns={cols.designations} search={(r) => [r.category, r.designation, r.code]} getId={(r) => r.id} />
          </TabsContent>
          <TabsContent value="wages" className="pt-0">
            <div className="border-b bg-warning-soft px-4 py-2 text-xs text-warning">Demo wage rates — illustrative values only, not notified minimum wages.</div>
            <MasterTable name="Wage rates" rows={WAGE_RATES} columns={cols.wages} search={(r) => [r.category, r.zone]} getId={(r) => r.id} />
          </TabsContent>
        </Tabs>
        )}
      </Section>
    </div>
  )
}
