import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LifeBuoy, Plus, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Badge, Card, Dialog, DialogContent, EmptyState, ErrorState, Skeleton } from '@/components/ui/misc'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/lib/seo'
import { supabase, unwrap } from '@/lib/supabase'
import { cn, formatDate } from '@/lib/utils'

export const TICKET_STATUS = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' } as const
export const ticketVariant = (s: string) => (s === 'resolved' ? 'success' : s === 'closed' ? 'default' : s === 'in_progress' ? 'primary' : 'warning') as any

const schema = z.object({
  category: z.string().min(1),
  subject: z.string().min(3, 'Add a short subject').max(150),
  body: z.string().min(5, 'Describe the issue').max(4000),
})

async function uploadAttachment(userId: string, file: File | null) {
  if (!file) return null
  if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type) || file.size > 5 * 1024 * 1024)
    throw new Error('Attachment must be a PNG/JPG/WebP image or PDF under 5 MB')
  const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`
  const { error } = await supabase.storage.from('support-attachments').upload(path, file, { contentType: file.type })
  if (error) throw new Error(error.message)
  return path
}

export function SupportListPage() {
  useSeo({ title: 'Support' })
  const { user } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const tickets = useQuery({ queryKey: ['tickets'], queryFn: async () => unwrap(await supabase.from('support_tickets').select('*').order('updated_at', { ascending: false })) as any[] })
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { category: 'general' } })

  return (
    <div className="container max-w-3xl space-y-4 py-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Support</h1><Button onClick={() => setOpen(true)}><Plus />New ticket</Button></div>
      {tickets.isLoading ? <Skeleton className="h-32" /> : tickets.isError ? <ErrorState error={tickets.error} /> : tickets.data!.length === 0 ? <EmptyState icon={<LifeBuoy className="size-8" />} title="No tickets yet" description="Having trouble with a download, payment or compatibility? We're here to help." /> :
        tickets.data!.map((t) => (<Link key={t.id} to={`/support/${t.id}`}><Card className="mb-3 flex items-center justify-between gap-3 p-4 hover:shadow-md"><div className="min-w-0"><p className="truncate font-medium">{t.subject}</p><p className="text-xs text-muted-foreground">{t.category} · updated {formatDate(t.updated_at)}</p></div><Badge variant={ticketVariant(t.status)}>{TICKET_STATUS[t.status as keyof typeof TICKET_STATUS]}</Badge></Card></Link>))}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent title="New support ticket">
        <form className="space-y-3" onSubmit={handleSubmit(async (v) => {
          try {
            const attachment = await uploadAttachment(user!.id, file)
            const t = unwrap(await supabase.from('support_tickets').insert({ user_id: user!.id, category: v.category, subject: v.subject }).select().single()) as any
            unwrap(await supabase.from('support_messages').insert({ ticket_id: t.id, sender_id: user!.id, body: v.body, attachment_path: attachment }))
            qc.invalidateQueries({ queryKey: ['tickets'] }); reset(); setFile(null); setOpen(false); nav(`/support/${t.id}`)
          } catch (e) { toast.error((e as Error).message) }
        })}>
          <Field label="Category"><Select {...register('category')}><option value="general">General</option><option value="payment">Payment</option><option value="download">Download</option><option value="compatibility">Compatibility</option><option value="account">Account</option></Select></Field>
          <Field label="Subject" error={errors.subject?.message}><Input {...register('subject')} /></Field>
          <Field label="Message" error={errors.body?.message}><Textarea {...register('body')} /></Field>
          <Field label="Attachment (optional)" hint="PNG, JPG, WebP or PDF up to 5 MB"><Input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-auto py-2" /></Field>
          <Button className="w-full" loading={isSubmitting}>Submit ticket</Button>
        </form></DialogContent></Dialog>
    </div>
  )
}

/** Thread view shared by customers and admins. */
export function TicketThread({ id, staff }: { id: string; staff?: boolean }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const ticket = useQuery({ queryKey: ['ticket', id], queryFn: async () => unwrap(await supabase.from('support_tickets').select('*').eq('id', id).maybeSingle()) as any })
  const msgs = useQuery({ queryKey: ['ticket-msgs', id], queryFn: async () => unwrap(await supabase.from('support_messages').select('*').eq('ticket_id', id).order('created_at')) as any[] })

  useEffect(() => {
    const ch = supabase.channel(`ticket:${id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${id}` },
      () => { qc.invalidateQueries({ queryKey: ['ticket-msgs', id] }); qc.invalidateQueries({ queryKey: ['ticket', id] }) }).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [id, qc])

  const send = useMutation({
    mutationFn: async () => unwrap(await supabase.from('support_messages').insert({ ticket_id: id, sender_id: user!.id, is_staff: !!staff, body: text.trim() })),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['ticket-msgs', id] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  const setStatus = async (status: string) => {
    const { error } = await supabase.from('support_tickets').update({ status }).eq('id', id)
    if (error) return void toast.error(error.message)
    qc.invalidateQueries({ queryKey: ['ticket', id] }); qc.invalidateQueries({ queryKey: ['admin-tickets'] })
  }
  async function openAttachment(path: string) {
    const { data, error } = await supabase.storage.from('support-attachments').createSignedUrl(path, 60)
    if (error) return void toast.error(error.message)
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  if (ticket.isLoading) return <Skeleton className="h-64" />
  if (!ticket.data) return <ErrorState error={new Error('Ticket not found')} />
  const closed = ticket.data.status === 'closed'
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-xl font-bold">{ticket.data.subject}</h1><p className="text-xs text-muted-foreground">{ticket.data.category}</p></div>
        {staff ? <Select className="w-40" value={ticket.data.status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">{Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select> : <Badge variant={ticketVariant(ticket.data.status)}>{TICKET_STATUS[ticket.data.status as keyof typeof TICKET_STATUS]}</Badge>}</div>
      <div className="space-y-3">{msgs.data?.map((m) => (
        <div key={m.id} className={cn('max-w-[85%] rounded-xl border p-3 text-sm', m.is_staff ? 'border-primary/30 bg-accent' : 'ml-auto border-border bg-card')}>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{m.is_staff ? 'SoundFont Hub support' : 'Customer'} · {new Date(m.created_at).toLocaleString()}</p>
          <p className="whitespace-pre-wrap">{m.body}</p>
          {m.attachment_path && <button className="mt-2 text-xs text-primary hover:underline" onClick={() => openAttachment(m.attachment_path)}>View attachment</button>}</div>))}</div>
      {!closed ? (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate() }}>
          <Textarea className="min-h-[44px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…" aria-label="Reply" maxLength={4000} />
          <Button size="icon" loading={send.isPending} aria-label="Send reply"><Send /></Button></form>) : <p className="text-sm text-muted-foreground">This ticket is closed.</p>}
    </div>
  )
}

export function TicketPage() {
  const { id = '' } = useParams()
  useSeo({ title: 'Ticket' })
  return <div className="container max-w-3xl py-6"><Link to="/support" className="mb-3 inline-block text-sm text-primary hover:underline">← All tickets</Link><TicketThread id={id} /></div>
}
