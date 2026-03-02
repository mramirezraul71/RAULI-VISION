import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

const isLocalDev =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

async function clearLocalServiceWorkersAndCaches() {
  if (!isLocalDev) return
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if (window.caches?.keys) {
      const keys = await window.caches.keys()
      await Promise.all(keys.map((k) => window.caches.delete(k)))
    }
    console.log('[local-clean] service workers and caches cleared')
  } catch (error) {
    console.warn('Local SW/cache cleanup failed:', error)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    clearLocalServiceWorkersAndCaches()
  })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60 * 1000, retry: 2 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
