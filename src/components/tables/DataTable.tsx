import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Columns3, Download, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { PageRequest, PageResult } from '@/types'
import { Button, Input, NativeSelect, Skeleton } from '@/components/ui/primitives'
import { Checkbox, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/overlays'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { cn, fmtNum } from '@/lib/utils'

export interface ColumnMeta {
  align?: 'right' | 'center'
  /** Hide below this breakpoint (responsive priority). */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  /** Plain-text value for CSV export. */
  csv?: (row: never) => string | number | null
}

const HIDE: Record<NonNullable<ColumnMeta['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
}

/** Controlled paging/sorting/search state shaped like a server request. */
export function useTableState(initial: Partial<PageRequest> = {}) {
  const [page, setPage] = useState(initial.page ?? 0)
  const [pageSize, setPageSize] = useState(initial.pageSize ?? 25)
  const [sorting, setSorting] = useState<SortingState>(initial.sort ? [initial.sort] : [])
  const [search, setSearch] = useState(initial.search ?? '')
  const [debounced, setDebounced] = useState(search)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => setPage(0), [debounced, sorting, pageSize])
  const request: PageRequest = useMemo(
    () => ({ page, pageSize, sort: sorting[0] ? { id: sorting[0].id, desc: sorting[0].desc } : null, search: debounced }),
    [page, pageSize, sorting, debounced],
  )
  return { page, setPage, pageSize, setPageSize, sorting, setSorting, search, setSearch, request, resetPage: () => setPage(0) }
}
export type TableState = ReturnType<typeof useTableState>

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  result: PageResult<T> | undefined
  state: TableState
  isPending?: boolean
  isFetching?: boolean
  error?: unknown
  onRetry?: () => void
  getRowId: (row: T) => string
  onRowClick?: (row: T) => void
  toolbar?: ReactNode
  searchPlaceholder?: string
  emptyTitle?: string
  emptyDescription?: string
  selectable?: boolean
  bulkActions?: (ids: string[], clear: () => void) => ReactNode
  exportName?: string
  /** Fetch every matching row for export (server-side export in production). */
  exportAll?: () => Promise<T[]>
  dense?: boolean
  initialHidden?: string[]
  rowClassName?: (row: T) => string | undefined
  caption: string
}

export function DataTable<T>({
  columns,
  result,
  state,
  isPending,
  isFetching,
  error,
  onRetry,
  getRowId,
  onRowClick,
  toolbar,
  searchPlaceholder = 'Search…',
  emptyTitle = 'No records match the current filters.',
  emptyDescription,
  selectable,
  bulkActions,
  exportName,
  exportAll,
  dense,
  initialHidden = [],
  rowClassName,
  caption,
}: DataTableProps<T>) {
  const [visibility, setVisibility] = useState<VisibilityState>(() => Object.fromEntries(initialHidden.map((k) => [k, false])))
  const [selection, setSelection] = useState<RowSelectionState>({})

  const cols = useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!selectable) return columns
    return [
      {
        id: '__select',
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all rows on this page"
            checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox aria-label="Select row" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} onClick={(e) => e.stopPropagation()} />
        ),
      },
      ...columns,
    ]
  }, [columns, selectable])

  const table = useReactTable({
    data: result?.rows ?? [],
    columns: cols,
    getRowId,
    state: { sorting: state.sorting, columnVisibility: visibility, rowSelection: selection },
    onSortingChange: state.setSorting,
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setSelection,
    manualSorting: true,
    manualPagination: true,
    enableRowSelection: !!selectable,
    pageCount: result ? Math.ceil(result.total / state.pageSize) : -1,
    getCoreRowModel: getCoreRowModel(),
  })

  const total = result?.total ?? 0
  const from = total ? state.page * state.pageSize + 1 : 0
  const to = Math.min(total, (state.page + 1) * state.pageSize)
  const pages = Math.max(1, Math.ceil(total / state.pageSize))
  const selectedIds = Object.keys(selection).filter((k) => selection[k])

  async function doExport(format: 'CSV' | 'Excel' | 'PDF') {
    if (format !== 'CSV') {
      toast.info(`${format} export queued`, { description: `Prototype: ${format} files would be generated server-side with masking and an audit entry. CSV export is functional.` })
      return
    }
    const rows = exportAll ? await exportAll() : result?.rows ?? []
    const exportCols = table.getVisibleLeafColumns().filter((c) => c.id !== '__select' && c.id !== 'actions')
    const header = exportCols.map((c) => (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id))
    const lines = rows.map((r) =>
      exportCols
        .map((c) => {
          const meta = c.columnDef.meta as ColumnMeta | undefined
          const v = meta?.csv ? meta.csv(r as never) : (r as Record<string, unknown>)[(c.columnDef as { accessorKey?: string }).accessorKey ?? c.id]
          const s = v == null ? '' : String(v)
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    const csv = ['# MP Power Control Tower — DEMO DATA (fictional). Sensitive identifiers masked.', header.join(','), ...lines].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${exportName ?? 'export'}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${fmtNum(rows.length)} rows`, { description: 'CSV with masked identifiers. In production, exports are logged to the audit trail.' })
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={state.search} onChange={(e) => state.setSearch(e.target.value)} placeholder={searchPlaceholder} className="h-8 pl-8" aria-label={searchPlaceholder} />
        </div>
        {toolbar}
        <div className="ml-auto flex items-center gap-1.5">
          {selectable && selectedIds.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-md bg-accent px-2 py-1 text-xs">
              <span className="font-medium">{selectedIds.length} selected</span>
              {bulkActions?.(selectedIds, () => setSelection({}))}
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Choose visible columns">
                <Columns3 /> <span className="hidden sm:inline">Columns</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-80 overflow-y-auto">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              {table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide())
                .map((c) => (
                  <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                    {typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {exportName && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Export">
                  <Download /> <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Export {fmtNum(total)} rows</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => doExport('CSV')}>CSV (masked)</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => doExport('Excel')}>Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => doExport('PDF')}>PDF</DropdownMenuItem>
                <DropdownMenuSeparator />
                <p className="px-2 py-1 text-2xs text-muted-foreground">Exports contain fictional demo data.</p>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className={cn('relative overflow-x-auto scrollbar-thin', isFetching && !isPending && 'opacity-70 transition-opacity')}>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta as ColumnMeta | undefined
                  const sorted = h.column.getIsSorted()
                  const canSort = h.column.getCanSort()
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                      className={cn(
                        'whitespace-nowrap border-b px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground',
                        meta?.align === 'right' && 'text-right',
                        meta?.align === 'center' && 'text-center',
                        meta?.hideBelow && HIDE[meta.hideBelow],
                        h.column.id === '__select' && 'w-8',
                      )}
                    >
                      {h.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className={cn('inline-flex items-center gap-1 uppercase hover:text-foreground', meta?.align === 'right' && 'flex-row-reverse')}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === 'asc' ? <ArrowUp className="size-3" /> : sorted === 'desc' ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isPending &&
              Array.from({ length: Math.min(state.pageSize, 10) }, (_, r) => (
                <tr key={r} className="border-b">
                  {table.getVisibleLeafColumns().map((c) => {
                    const meta = c.columnDef.meta as ColumnMeta | undefined
                    return (
                      <td key={c.id} className={cn('px-3', dense ? 'py-2' : 'py-2.5', meta?.hideBelow && HIDE[meta.hideBelow])}>
                        <Skeleton className="h-4 w-full max-w-[140px]" />
                      </td>
                    )
                  })}
                </tr>
              ))}
            {!isPending &&
              !error &&
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={onRowClick ? (e) => (e.key === 'Enter' ? onRowClick(row.original) : undefined) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(
                    'border-b transition-colors last:border-0',
                    onRowClick && 'cursor-pointer hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none',
                    row.getIsSelected() && 'bg-accent/70',
                    rowClassName?.(row.original),
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as ColumnMeta | undefined
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'whitespace-nowrap px-3 align-middle',
                          dense ? 'py-1.5' : 'py-2',
                          meta?.align === 'right' && 'num text-right',
                          meta?.align === 'center' && 'text-center',
                          meta?.hideBelow && HIDE[meta.hideBelow],
                          meta?.className,
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )
                  })}
                </tr>
              ))}
          </tbody>
        </table>
        {!isPending && !!error && <ErrorState error={error} onRetry={onRetry} />}
        {!isPending && !error && total === 0 && <EmptyState title={emptyTitle} description={emptyDescription ?? 'Try clearing filters or widening the search.'} />}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <span aria-live="polite">
          {total ? (
            <>
              Showing <span className="num font-medium text-foreground">{fmtNum(from)}</span>–<span className="num font-medium text-foreground">{fmtNum(to)}</span> of{' '}
              <span className="num font-medium text-foreground">{fmtNum(total)}</span>
            </>
          ) : isPending ? (
            'Loading…'
          ) : (
            '0 records'
          )}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5">
            <span className="hidden sm:inline">Rows</span>
            <NativeSelect value={state.pageSize} onChange={(e) => state.setPageSize(Number(e.target.value))} className="h-7 px-1.5 pr-6 text-xs" aria-label="Rows per page">
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </label>
          <span className="num">
            Page {state.page + 1} / {fmtNum(pages)}
          </span>
          <Button variant="outline" size="icon-sm" className="size-7" onClick={() => state.setPage(Math.max(0, state.page - 1))} disabled={state.page === 0} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" className="size-7" onClick={() => state.setPage(Math.min(pages - 1, state.page + 1))} disabled={state.page >= pages - 1} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
