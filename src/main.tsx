import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App'
import { AuthProvider } from './features/auth/AuthProvider'
import { isConfigured } from './lib/supabase'
import './index.css'

try { if (localStorage.getItem('sfh-theme') === 'dark') document.documentElement.classList.add('dark') } catch { /* storage unavailable */ }

// Refetch automatically when connectivity returns.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnReconnect: true, refetchOnWindowFocus: false } },
})
onlineManager.setEventListener((setOnline) => {
  const on = () => setOnline(true), off = () => setOnline(false)
  window.addEventListener('online', on); window.addEventListener('offline', off)
  return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
})

const root = createRoot(document.getElementById('root')!)
if (!isConfigured) {
  root.render(<div style={{ padding: 32, fontFamily: 'sans-serif' }}><h1>SoundFont Hub</h1><p>Missing configuration. Copy <code>.env.example</code> to <code>.env</code> and set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.</p></div>)
} else {
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider><App /></AuthProvider>
        </BrowserRouter>
        <Toaster position="top-center" richColors closeButton />
      </QueryClientProvider>
    </StrictMode>,
  )
}
