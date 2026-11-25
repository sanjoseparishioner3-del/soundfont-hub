import {
  BarChart3, Bell, BookOpen, CreditCard, Download, FileText, FolderTree, Home, LayoutDashboard, LifeBuoy, Library, Menu,
  Music, Package, PanelLeftClose, PanelLeftOpen, Percent, ScrollText, Settings, ShieldCheck, ShoppingBag, Star, Users, Wallet, X,
} from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/layout/SiteLayout'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/soundfonts', label: 'SoundFonts', icon: Music },
  { to: '/admin/categories', label: 'Categories', icon: FolderTree },
  { to: '/admin/collections', label: 'Collections', icon: Library },
  { to: '/admin/bundles', label: 'Bundles', icon: Package },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/admin/payments', label: 'Payment Verification', icon: ShieldCheck },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/downloads', label: 'Download Logs', icon: Download },
  { to: '/admin/promotions', label: 'Promotions', icon: Percent },
  { to: '/admin/reviews', label: 'Reviews', icon: Star },
  { to: '/admin/announcements', label: 'Announcements', icon: Bell },
  { to: '/admin/tutorials', label: 'Tutorials', icon: BookOpen },
  { to: '/admin/tickets', label: 'Support Tickets', icon: LifeBuoy },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { to: '/admin/payment-settings', label: 'Payment Settings', icon: Wallet },
  { to: '/admin/settings', label: 'System Settings', icon: Settings },
  { to: '/admin/audit', label: 'Audit Logs', icon: ScrollText },
]

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const Nav = ({ compact }: { compact: boolean }) => (
    <nav aria-label="Admin" className="flex-1 space-y-0.5 overflow-y-auto p-2">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} title={label} onClick={() => setMobileOpen(false)}
          className={({ isActive }) => cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted', isActive && 'bg-accent text-accent-foreground', compact && 'justify-center px-0')}>
          <Icon className="size-4 shrink-0" />{!compact && <span className="truncate">{label}</span>}
        </NavLink>))}
      <Link to="/" className={cn('mt-3 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted', compact && 'justify-center px-0')}><Home className="size-4" />{!compact && 'Back to store'}</Link>
    </nav>
  )

  return (
    <div className="flex h-dvh overflow-hidden bg-muted/30">
      {/* Fixed sidebar (desktop) */}
      <aside className={cn('hidden shrink-0 flex-col border-r border-border bg-card transition-[width] md:flex', collapsed ? 'w-16' : 'w-64')}>
        <div className="flex h-14 items-center justify-between border-b border-border px-3">{!collapsed && <Logo />}
          <Button variant="ghost" size="iconSm" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed((c) => !c)}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button></div>
        <Nav compact={collapsed} />
      </aside>
      {/* Mobile drawer */}
      {mobileOpen && <div className="fixed inset-0 z-50 md:hidden"><div className="absolute inset-0 bg-navy/40" onClick={() => setMobileOpen(false)} />
        <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-card"><div className="flex h-14 items-center justify-between border-b border-border px-3"><Logo /><Button variant="ghost" size="iconSm" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X /></Button></div><Nav compact={false} /></aside></div>}
      {/* Independently scrolling content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-border bg-card px-4 md:hidden"><Button variant="ghost" size="iconSm" aria-label="Open menu" onClick={() => setMobileOpen(true)}><Menu /></Button><span className="font-semibold">Admin</span></header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6"><div className="mx-auto max-w-6xl"><Outlet /></div></main>
      </div>
    </div>
  )
}
