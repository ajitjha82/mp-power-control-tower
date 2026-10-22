import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/overlays'
import { useUI } from '@/store/ui'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 0, refetchOnWindowFocus: false, placeholderData: keepPreviousData },
  },
})

// Demo control: toggling simulated API failures drops cached data so every
// screen immediately re-fetches and shows its error (or recovered) state.
useUI.subscribe((s, prev) => {
  if (s.simulateErrors !== prev.simulateErrors) queryClient.resetQueries()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <TooltipProvider delayDuration={250}>
          <App />
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
