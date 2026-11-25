import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase, unwrap } from '@/lib/supabase'
import type { Notification } from '@/types/db'

export function NotificationBell() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data = [] } = useQuery({
    queryKey: ['notifications', user?.id], enabled: !!user,
    queryFn: async () => unwrap(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30)) as Notification[],
  })

  // Supabase Realtime: new notifications arrive instantly
  useEffect(() => {
    if (!user) return
    const ch = supabase.channel(`notif:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
        qc.invalidateQueries({ queryKey: ['notifications'] })
        toast((payload.new as Notification).title, { description: (payload.new as Notification).body })
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [user, qc])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (!user) return null
  const unread = data.filter((n) => !n.read_at).length
  async function markAll() {
    await supabase.rpc('mark_all_notifications_read')
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }
  async function markOne(id: string) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => setOpen((o) => !o)}>
        <Bell />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </Button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="font-semibold">Notifications</p>
            <Button variant="ghost" size="sm" onClick={markAll} disabled={!unread}><CheckCheck />Mark all as read</Button>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {data.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">You're all caught up.</li>}
            {data.map((n) => (
              <li key={n.id}>
                <Link to={n.link ?? '#'} onClick={() => { void markOne(n.id); setOpen(false) }} className="flex gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-muted">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-primary'}`} />
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{n.title}</span><span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
