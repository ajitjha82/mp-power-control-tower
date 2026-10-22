import { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Building2, FileSignature, FileText, ReceiptIndianRupee, Search, User } from 'lucide-react'
import { NAV } from '@/lib/nav'
import { canSee } from '@/lib/rbac'
import { useUI } from '@/store/ui'
import { searchAll, type SearchHit } from '@/services/entities'
import { REPORTS } from '@/features/reports/catalog'
import { Kbd } from '@/components/ui/primitives'

const KIND_ICON = { Employee: User, Vendor: Building2, Contract: FileSignature, Invoice: ReceiptIndianRupee }

/** Global Ctrl/Cmd+K palette: pages, employees, vendors, contracts, invoices, reports. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate()
  const role = useUI((s) => s.role)
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 120)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const hits = useMemo(() => searchAll(debounced), [debounced])
  const groups = (['Employee', 'Vendor', 'Contract', 'Invoice'] as const).map((k) => [k, hits.filter((h) => h.kind === k)] as const).filter(([, v]) => v.length)
  const go = (href: string) => {
    onOpenChange(false)
    navigate(href)
  }
  const pages = NAV.filter((n) => canSee(role, n.path))
  const reports = REPORTS.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())).slice(0, 5)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/40" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-lg border bg-popover shadow-2xl">
          <DialogPrimitive.Title className="sr-only">Search and navigate</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search employees, vendors, contracts, invoices, pages and reports.</DialogPrimitive.Description>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 text-muted-foreground" aria-hidden />
              <Command.Input
                value={q}
                onValueChange={setQ}
                autoFocus
                placeholder="Search EMP-10234, employee name, vendor, contract, invoice no., page…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-1.5 scrollbar-thin">
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">No results. Try an employee ID such as EMP-10234.</Command.Empty>
              {groups.map(([kind, items]) => (
                <Command.Group key={kind} heading={`${kind}s`} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
                  {items.map((h: SearchHit) => {
                    const Icon = KIND_ICON[h.kind]
                    return (
                      <Command.Item key={h.kind + h.id} value={h.kind + h.id} onSelect={() => go(h.href)} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 aria-selected:bg-accent">
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{h.title}</div>
                          <div className="truncate text-xs text-muted-foreground">{h.subtitle}</div>
                        </div>
                        {h.badge && <span className={`shrink-0 rounded border px-1.5 py-0.5 text-2xs font-medium ${h.badge.includes('Exception') || h.badge === 'Blocked' ? 'border-destructive/30 bg-destructive-soft text-destructive' : 'bg-muted text-muted-foreground'}`}>{h.badge}</span>}
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              ))}
              <Command.Group heading="Pages" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
                {pages
                  .filter((p) => !q || p.label.toLowerCase().includes(q.toLowerCase()) || p.description?.toLowerCase().includes(q.toLowerCase()))
                  .map((p) => (
                    <Command.Item key={p.path} value={'page' + p.path} onSelect={() => go(p.path)} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent">
                      <p.icon className="size-4 text-muted-foreground" aria-hidden />
                      {p.label}
                      {p.description && <span className="truncate text-xs text-muted-foreground">— {p.description}</span>}
                    </Command.Item>
                  ))}
              </Command.Group>
              {reports.length > 0 && (
                <Command.Group heading="Reports" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
                  {reports.map((r) => (
                    <Command.Item key={r.id} value={'report' + r.id} onSelect={() => go(`/reports?report=${r.id}`)} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent">
                      <FileText className="size-4 text-muted-foreground" aria-hidden />
                      {r.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
            <div className="flex items-center justify-between border-t px-3 py-2 text-2xs text-muted-foreground">
              <span>Fictional demo identities only · identifiers masked</span>
              <span className="flex items-center gap-1">
                <Kbd>↑↓</Kbd> navigate <Kbd>↵</Kbd> open
              </span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
