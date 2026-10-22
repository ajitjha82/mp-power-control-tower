import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '@/types'

export type ThemePref = 'light' | 'dark' | 'system'

interface UIState {
  role: Role
  theme: ThemePref
  sidebarCollapsed: boolean
  simulateErrors: boolean
  readNotifications: string[]
  setRole: (r: Role) => void
  setTheme: (t: ThemePref) => void
  toggleSidebar: () => void
  setSimulateErrors: (v: boolean) => void
  markRead: (ids: string[]) => void
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      role: 'Senior Management',
      theme: 'system',
      sidebarCollapsed: false,
      simulateErrors: false,
      readNotifications: [],
      setRole: (role) => set({ role }),
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSimulateErrors: (simulateErrors) => set({ simulateErrors }),
      markRead: (ids) => set((s) => ({ readNotifications: Array.from(new Set([...s.readNotifications, ...ids])) })),
    }),
    { name: 'mpp-ui', partialize: (s) => ({ role: s.role, theme: s.theme, sidebarCollapsed: s.sidebarCollapsed, readNotifications: s.readNotifications }) },
  ),
)
