import { useEffect } from 'react'
import { useUI } from '@/store/ui'

/** Applies Light / Dark / System theme to <html> and follows OS changes in System mode. */
export function useThemeEffect() {
  const theme = useUI((s) => s.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      try {
        localStorage.setItem('mpp-theme', theme)
      } catch {
        /* storage unavailable */
      }
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}
