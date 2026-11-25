import { Compass, Home, Library, Moon, Search, ShoppingCart, Sun, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { PlayerBar } from '@/features/player/PlayerBar'
import { usePlayer } from '@/features/player/playerStore'
import { InstallButton, OfflineBanner, UpdatePrompt } from '@/features/pwa/PwaBits'
import { useSettings } from '@/features/settings/useSettings'
import { useCart } from '@/features/shop/hooks'
import { useCurrency } from '@/features/shop/store'
import { publicUrl } from '@/lib/supabase'
import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  const { data: s } = useSettings()
  const logo = publicUrl('site', s?.logo_path)
  return (
    <Link to="/" className={cn('flex items-center gap-2 font-extrabold tracking-tight', className)} aria-label="SoundFont Hub home">
      {logo ? <img src={logo} alt="" className="size-8 rounded-lg object-cover" /> : <img src="/favicon.svg" alt="" className="size-8" />}
      <span className="text-lg">{s?.site_name ?? 'SoundFont Hub'}</span>
    </Link>
  )
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('sfh-theme', dark ? 'dark' : 'light') } catch { /* noop */ }
  }, [dark])
  return <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={() => setDark((d) => !d)}>{dark ? <Sun /> : <Moon />}</Button>
}

function SearchBox({ className }: { className?: string }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  return (
    <form role="search" className={cn('relative', className)} onSubmit={(e) => { e.preventDefault(); nav(`/explore?q=${encodeURIComponent(q)}`) }}>
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SoundFonts…" aria-label="Search SoundFonts"
        className="h-10 w-full rounded-full border border-border bg-muted pl-9 pr-4 text-sm placeholder:text-muted-foreground" />
    </form>
  )
}

function AccountMenu() {
  const { user, isAdmin, hasAdminRole, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  if (!user) return <Button asChild size="sm"><Link to="/login">Sign in</Link></Button>
  const item = 'block rounded-md px-3 py-2 text-sm hover:bg-muted'
  return (
    <div className="relative">
      <Button variant="ghost" size="icon" aria-label="Account menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><User /></Button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-52 rounded-xl border border-border bg-card p-1 shadow-xl" onClick={() => setOpen(false)}>
          <p className="truncate px-3 py-2 text-xs text-muted-foreground">{user.email}</p>
          <Link className={item} to="/library">My Sound Library</Link>
          <Link className={item} to="/account/orders">Orders</Link>
          <Link className={item} to="/favorites">Favorites</Link>
          <Link className={item} to="/support">Support</Link>
          <Link className={item} to="/account">Account</Link>
          {hasAdminRole && <Link className={cn(item, 'text-primary')} to={isAdmin ? '/admin' : '/account/mfa'}>Admin dashboard</Link>}
          <button className={cn(item, 'w-full text-left')} onClick={() => void signOut()}>Sign out</button>
        </div>
      )}
    </div>
  )
}

export function CartLink() {
  const { user } = useAuth()
  const { items } = useCart()
  return (
    <Button asChild variant="ghost" size="icon" className="relative" aria-label={`Cart${items.length ? `, ${items.length} items` : ''}`}>
      <Link to={user ? '/cart' : '/login'}>
        <ShoppingCart />
        {items.length > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{items.length}</span>}
      </Link>
    </Button>
  )
}

function CurrencySwitch() {
  const { currency, setCurrency } = useCurrency()
  return (
    <button onClick={() => setCurrency(currency === 'PHP' ? 'USD' : 'PHP')} aria-label={`Currency ${currency}. Switch`}
      className="hidden h-8 rounded-full border border-border px-3 text-xs font-medium hover:bg-muted sm:block">{currency}</button>
  )
}

export function SiteLayout() {
  const { data: s } = useSettings()
  const hasTrack = usePlayer((p) => p.queue.length > 0)
  const navLink = ({ isActive }: { isActive: boolean }) => cn('rounded-md px-3 py-2 text-sm font-medium hover:bg-muted', isActive && 'text-primary')
  const tab = ({ isActive }: { isActive: boolean }) => cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]', isActive ? 'text-primary' : 'text-muted-foreground')

  if (s?.maintenance_mode === true) {
    return <div className="grid min-h-dvh place-items-center p-6 text-center"><div><Logo className="mb-4 justify-center" /><h1 className="text-2xl font-bold">We'll be right back</h1><p className="mt-2 text-muted-foreground">SoundFont Hub is undergoing scheduled maintenance.</p></div></div>
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:p-2">Skip to content</a>
      <OfflineBanner />
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="container flex h-16 items-center gap-3">
          <Logo />
          <nav className="ml-4 hidden items-center md:flex" aria-label="Primary">
            <NavLink to="/explore" className={navLink}>Explore</NavLink>
            <NavLink to="/bundles" className={navLink}>Bundles</NavLink>
            <NavLink to="/keyboard" className={navLink}>Keyboard</NavLink>
            <NavLink to="/learn" className={navLink}>Learn</NavLink>
          </nav>
          <SearchBox className="ml-auto hidden max-w-sm flex-1 md:block" />
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <InstallButton className="hidden lg:inline-flex" />
            <CurrencySwitch />
            <ThemeToggle />
            <NotificationBell />
            <span className="hidden md:block"><CartLink /></span>
            <AccountMenu />
          </div>
        </div>
        <div className="container pb-3 md:hidden"><SearchBox /></div>
      </header>

      <main id="main" className={cn('flex-1', hasTrack ? 'pb-40 md:pb-24' : 'pb-20 md:pb-0')}><Outlet /></main>

      <footer className="hidden border-t border-border bg-muted/40 md:block">
        <div className="container grid gap-8 py-10 md:grid-cols-4">
          <div className="space-y-2"><Logo /><p className="text-sm text-muted-foreground">{s?.tagline ?? 'Premium Sounds. Endless Possibilities.'}</p></div>
          <div className="space-y-2 text-sm"><p className="font-semibold">Marketplace</p><Link className="block text-muted-foreground hover:text-foreground" to="/explore">Explore sounds</Link><Link className="block text-muted-foreground hover:text-foreground" to="/bundles">Bundles</Link><Link className="block text-muted-foreground hover:text-foreground" to="/keyboard">Virtual keyboard</Link></div>
          <div className="space-y-2 text-sm"><p className="font-semibold">Help</p><Link className="block text-muted-foreground hover:text-foreground" to="/learn">Learning center</Link><Link className="block text-muted-foreground hover:text-foreground" to="/support">Support</Link><Link className="block text-muted-foreground hover:text-foreground" to="/page/refund_policy">Refund policy</Link></div>
          <div className="space-y-2 text-sm"><p className="font-semibold">Legal</p><Link className="block text-muted-foreground hover:text-foreground" to="/page/terms">Terms</Link><Link className="block text-muted-foreground hover:text-foreground" to="/page/privacy">Privacy</Link><Link className="block text-muted-foreground hover:text-foreground" to="/page/license">Digital product license</Link>
            {s?.contact?.email && <a className="block text-muted-foreground hover:text-foreground" href={`mailto:${s.contact.email}`}>{s.contact.email}</a>}</div>
        </div>
        <p className="border-t border-border py-4 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} {s?.site_name ?? 'SoundFont Hub'}. All rights reserved.</p>
      </footer>

      <PlayerBar />
      <UpdatePrompt />

      <nav aria-label="Mobile" className="pb-safe fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card md:hidden">
        <NavLink to="/" end className={tab}><Home className="size-5" />Home</NavLink>
        <NavLink to="/explore" className={tab}><Compass className="size-5" />Explore</NavLink>
        <NavLink to="/library" className={tab}><Library className="size-5" />My Library</NavLink>
        <NavLink to="/cart" className={tab}><ShoppingCart className="size-5" />Cart</NavLink>
        <NavLink to="/account" className={tab}><User className="size-5" />Account</NavLink>
      </nav>
    </div>
  )
}
