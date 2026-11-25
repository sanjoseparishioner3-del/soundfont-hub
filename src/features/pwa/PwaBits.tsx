import { Download, RefreshCw, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button'

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

/** Offline banner + auto-refresh of data when the connection returns (see QueryClient online manager). */
export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900">
      <WifiOff className="size-3.5" />You're offline. Browsing cached sounds is available; payments and new premium downloads need internet.
    </div>
  )
}

/** "A new version is available" prompt. */
export function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisterError: (e) => console.warn('SW registration failed', e),
  })
  if (!needRefresh) return null
  return (
    <div role="alert" className="fixed inset-x-4 bottom-36 z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-xl md:bottom-24">
      <p className="text-sm">A new version of SoundFont Hub is ready.</p>
      <Button size="sm" onClick={() => updateServiceWorker(true)}><RefreshCw />Update</Button>
    </div>
  )
}

interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export function InstallButton({ className }: { className?: string }) {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null)
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BeforeInstallPromptEvent) }
    window.addEventListener('beforeinstallprompt', h)
    window.addEventListener('appinstalled', () => setEvt(null))
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator as any).standalone
  if (!evt && !isIos) return null
  return (
    <Button variant="outline" size="sm" className={className}
      onClick={() => (evt ? void evt.prompt() : alert('On iPhone/iPad: tap Share, then “Add to Home Screen”.'))}>
      <Download />Install app
    </Button>
  )
}
