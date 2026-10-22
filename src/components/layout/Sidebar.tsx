import { NavLink } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, Zap } from 'lucide-react'
import { NAV, type NavItem } from '@/lib/nav'
import { canSee } from '@/lib/rbac'
import { useUI } from '@/store/ui'
import { Tip } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'

export function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sky-400/15 ring-1 ring-sky-400/30">
        <Zap className="size-4 text-sky-300" aria-hidden />
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold text-white">MP Power</div>
          <div className="truncate text-2xs uppercase tracking-[0.12em] text-sidebar-muted">Workforce Control Tower</div>
        </div>
      )}
    </div>
  )
}

function Item({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const link = (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/85 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
          isActive && 'bg-sidebar-active text-white shadow-[inset_2px_0_0_0_theme(colors.sky.400)]',
          collapsed && 'justify-center px-0',
        )
      }
    >
      <item.icon className="size-4 shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && <span className="sr-only">{item.label}</span>}
    </NavLink>
  )
  return collapsed ? (
    <Tip content={item.label} side="right">
      {link}
    </Tip>
  ) : (
    link
  )
}

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const role = useUI((s) => s.role)
  const main = NAV.filter((n) => n.group === 'main' && canSee(role, n.path))
  const admin = NAV.filter((n) => n.group === 'admin' && canSee(role, n.path))
  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3 scrollbar-thin">
      {main.map((n) => (
        <Item key={n.path} item={n} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
      {admin.length > 0 && (
        <>
          <div className={cn('mb-1 mt-4 px-2.5 text-2xs font-semibold uppercase tracking-[0.12em] text-sidebar-muted', collapsed && 'sr-only')}>Administration</div>
          {collapsed && <div className="mx-2 my-2 h-px bg-sidebar-border" />}
          {admin.map((n) => (
            <Item key={n.path} item={n} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </>
      )}
    </nav>
  )
}

export function Sidebar() {
  const { sidebarCollapsed: collapsed, toggleSidebar } = useUI()
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[60px]' : 'w-[232px]',
      )}
    >
      <div className={cn('flex h-14 items-center border-b border-sidebar-border px-3', collapsed && 'justify-center px-0')}>
        <Brand collapsed={collapsed} />
      </div>
      <SidebarNav collapsed={collapsed} />
      <div className="border-t border-sidebar-border p-2">
        {!collapsed && (
          <p className="mb-2 px-2 text-2xs leading-snug text-sidebar-muted">
            Prototype · fictional demo data. Not connected to any statutory portal.
          </p>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex h-8 w-full items-center justify-center gap-2 rounded-md text-xs text-sidebar-muted hover:bg-white/5 hover:text-white"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : (<><ChevronsLeft className="size-4" /> Collapse</>)}
        </button>
      </div>
    </aside>
  )
}
