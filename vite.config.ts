import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; local dev stays at /.
  base: process.env.PAGES_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: { port: 5173 },
  // Pre-bundle every runtime dependency up front so lazily-loaded routes never
  // trigger a mid-session re-optimisation (which can load two copies of React).
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-dom/client', 'react-router-dom', '@tanstack/react-query', '@tanstack/react-table',
      'recharts', 'lucide-react', 'zustand', 'zustand/middleware', 'react-hook-form', 'zod', '@hookform/resolvers/zod',
      'date-fns', 'clsx', 'tailwind-merge', 'class-variance-authority', 'cmdk', 'sonner',
      '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-popover', '@radix-ui/react-tooltip',
      '@radix-ui/react-tabs', '@radix-ui/react-checkbox', '@radix-ui/react-slot',
    ],
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          table: ['@tanstack/react-table', '@tanstack/react-query'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
} as Parameters<typeof defineConfig>[0])
