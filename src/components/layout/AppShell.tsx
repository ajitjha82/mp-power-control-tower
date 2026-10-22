import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { GlobalFilterBar } from '@/components/filters/GlobalFilterBar'
import { BlockSkeleton, KpiSkeleton } from '@/components/feedback/states'
import { useThemeEffect } from '@/hooks/useTheme'
import { RouteErrorBoundary } from '@/components/feedback/ErrorBoundary'

const NO_FILTER_BAR = ['/audit', '/admin', '/settings', '/reports', '/ask']

export function AppShell() {
  useThemeEffect()
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  const showFilters = !NO_FILTER_BAR.some((p) => pathname.startsWith(p))
  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only z-50 rounded bg-card px-3 py-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        {showFilters && <GlobalFilterBar />}
        <main id="main" className="min-w-0 flex-1 px-4 py-5 md:px-6">
          <Suspense
            fallback={
              <div className="space-y-4">
                <KpiSkeleton />
                <BlockSkeleton rows={6} className="rounded-lg border bg-card" />
              </div>
            }
          >
            <RouteErrorBoundary resetKey={pathname}>
              <Outlet />
            </RouteErrorBoundary>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
