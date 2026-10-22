import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Bell, CalendarDays, ChevronRight, CircleHelp, Menu, Monitor, Moon, Search, Sparkles, Sun, UserCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { NAV, DETAIL_PARENTS } from '@/lib/nav'
import { DEMO_USER, ROLES } from '@/lib/rbac'
import { useUI, type ThemePref } from '@/store/ui'
import { useFilters } from '@/store/filters'
import { CURRENT_MONTH, DATA_AS_OF, WAGE_MONTHS, monthLabel } from '@/data/config'
import { Button, Kbd, NativeSelect } from '@/components/ui/primitives'
import {
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SheetContent,
  Tip,
} from '@/components/ui/overlays'
import { Brand, SidebarNav } from './Sidebar'
import { CommandPalette } from './CommandPalette'
import { NotificationPanel, useUnreadCount } from './NotificationPanel'
import { initials } from '@/lib/utils'
import type { Role } from '@/types'

function useBreadcrumb() {
  const { pathname } = useLocation()
  const crumbs: Array<{ label: string; to?: string }> = [{ label: 'MP Power', to: '/' }]
  const detail = DETAIL_PARENTS.find(([re]) => re.test(pathname))
  if (detail) {
    const parent = NAV.find((n) => n.path === detail[1])!
    crumbs.push({ label: parent.label, to: parent.path }, { label: `${detail[2]} · ${decodeURIComponent(pathname.split('/').pop() ?? '')}` })
  } else {
    const item = NAV.find((n) => n.path === pathname)
    if (item && item.path !== '/') {
      if (item.group === 'admin') crumbs.push({ label: 'Administration' })
      crumbs.push({ label: item.label })
    } else crumbs.push({ label: 'Overview' })
  }
  return crumbs
}

export function Header() {
  const crumbs = useBreadcrumb()
  const navigate = useNavigate()
  const { theme, setTheme, role, setRole } = useUI()
  const { applied, patch } = useFilters()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [help, setHelp] = useState(false)
  const unread = useUnreadCount()
  const location = useLocation()
  useEffect(() => setDrawer(false), [location.pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor
  const asOf = new Date(DATA_AS_OF).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-3 md:px-6">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation">
          <Menu />
        </Button>
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm md:flex">
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
              {c.to && i < crumbs.length - 1 ? (
                <Link to={c.to} className="truncate text-muted-foreground hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate font-medium" aria-current={i === crumbs.length - 1 ? 'page' : undefined}>
                  {c.label}
                </span>
              )}
            </span>
          ))}
        </nav>
        <span className="truncate text-sm font-semibold md:hidden">{crumbs[crumbs.length - 1]!.label}</span>

        <div className="ml-auto flex items-center gap-1 md:gap-1.5">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden h-8 w-64 items-center gap-2 rounded-md border bg-background px-2.5 text-xs text-muted-foreground hover:bg-accent xl:flex"
            aria-label="Search (Ctrl+K)"
          >
            <Search className="size-3.5" /> Search employee, vendor, invoice…
            <span className="ml-auto flex gap-0.5">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <Button variant="ghost" size="icon-sm" className="xl:hidden" onClick={() => setPaletteOpen(true)} aria-label="Search">
            <Search />
          </Button>
          <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => navigate('/ask')}>
            <Sparkles className="text-secondary" /> Ask
          </Button>
          <label className="hidden items-center gap-1.5 md:flex" title="Wage / financial month">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">Wage month</span>
            <NativeSelect value={applied.wageMonth} onChange={(e) => patch({ wageMonth: e.target.value })} className="h-8 text-xs">
              {[...WAGE_MONTHS].reverse().map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                  {m === CURRENT_MONTH ? ' (current)' : ''}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Tip content="Notifications">
            <Button variant="ghost" size="icon-sm" className="relative" onClick={() => setNotifOpen(true)} aria-label={`Notifications, ${unread} unread`}>
              <Bell />
              {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">{unread}</span>}
            </Button>
          </Tip>
          <Tip content="Help & demo guide">
            <Button variant="ghost" size="icon-sm" onClick={() => setHelp(true)} aria-label="Help">
              <CircleHelp />
            </Button>
          </Tip>
          <DropdownMenu>
            <Tip content="Theme">
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Theme">
                  <ThemeIcon />
                </Button>
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent>
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePref)}>
                <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-accent" aria-label={`User menu, role ${role}`}>
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-2xs font-semibold text-primary-foreground">{initials(DEMO_USER[role])}</span>
                <span className="hidden text-left leading-tight lg:block">
                  <span className="block max-w-[140px] truncate text-xs font-medium">{DEMO_USER[role]}</span>
                  <span className="block max-w-[140px] truncate text-2xs text-muted-foreground">{role}</span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              <DropdownMenuLabel>Demo role switcher</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={role}
                onValueChange={(v) => {
                  setRole(v as Role)
                  toast.info(`Viewing as ${v}`, { description: 'Navigation, actions and data scope updated. Client-side simulation only — production enforces this server-side.' })
                }}
              >
                {ROLES.map((r) => (
                  <DropdownMenuRadioItem key={r} value={r}>
                    {r}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate('/settings')}>
                <UserCircle2 /> Profile & settings
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toast('Signed-out flow is not part of this prototype.')}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t bg-muted/40 px-3 py-1 text-2xs text-muted-foreground md:px-6">
        <span>
          Data as of <span className="num font-medium text-foreground">{asOf} IST</span> · Wage month <span className="font-medium text-foreground">{monthLabel(applied.wageMonth)}</span>
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <span className="size-1.5 rounded-full bg-warning" aria-hidden /> Demonstration environment — all people, vendors and figures are fictional
        </span>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <NotificationPanel open={notifOpen} onOpenChange={setNotifOpen} />
      <DialogPrimitive.Root open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" title={<Brand />} className="bg-sidebar text-sidebar-foreground [&>div:first-child]:border-sidebar-border">
          <SidebarNav onNavigate={() => setDrawer(false)} />
        </SheetContent>
      </DialogPrimitive.Root>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent title="Demo guide" description="Suggested end-to-end walkthrough of the control tower.">
          <ol className="list-decimal space-y-1.5 px-9 py-4 text-sm">
            <li>Overview → click the <b>PF Compliance</b> KPI.</li>
            <li>PF page lists 1,598 employees with exceptions.</li>
            <li>Click <b>Contribution Not Found</b> in the breakdown.</li>
            <li>Open <b>EMP-10234 Rajesh Sharma</b> → Employee 360.</li>
            <li>Follow the vendor link to <b>ABC Manpower</b> (Vendor 360, elevated risk).</li>
            <li>Open its Sep-2026 invoice → compliance gate shows <b>PF: FAILED</b>, invoice <b>BLOCKED</b>.</li>
            <li>“View 17 employees” → PF table filtered to that contract.</li>
            <li>Open the exception timeline to see vendor response and review status.</li>
          </ol>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">Press Ctrl/Cmd + K anywhere to search. Switch roles from the user menu.</p>
        </DialogContent>
      </Dialog>
    </header>
  )
}
