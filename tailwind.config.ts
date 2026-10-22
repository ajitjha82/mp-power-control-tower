import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        popover: { DEFAULT: token('popover'), foreground: token('popover-foreground') },
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
        secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground') },
        accent: { DEFAULT: token('accent'), foreground: token('accent-foreground') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        success: { DEFAULT: token('success'), foreground: token('success-foreground'), soft: token('success-soft') },
        warning: { DEFAULT: token('warning'), foreground: token('warning-foreground'), soft: token('warning-soft') },
        destructive: { DEFAULT: token('destructive'), foreground: token('destructive-foreground'), soft: token('destructive-soft') },
        info: { DEFAULT: token('info'), foreground: token('info-foreground'), soft: token('info-soft') },
        sidebar: { DEFAULT: token('sidebar'), foreground: token('sidebar-foreground'), muted: token('sidebar-muted'), active: token('sidebar-active'), border: token('sidebar-border') },
      },
      borderRadius: { lg: '0.5rem', md: '0.375rem', sm: '0.25rem' },
      fontSize: { '2xs': ['0.6875rem', { lineHeight: '1rem' }] },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(2px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { 'fade-in': 'fade-in 180ms ease-out' },
    },
  },
  plugins: [animate],
} satisfies Config
