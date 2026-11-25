import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ShieldCheck, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Badge, Card, ConfirmDialog, ErrorState, Skeleton } from '@/components/ui/misc'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/lib/seo'
import { publicUrl, supabase, unwrap } from '@/lib/supabase'
import { cn, formatDate, formatMoney, normalizeReference } from '@/lib/utils'
import type { Order, OrderStatus, PaymentMethod } from '@/types/db'

export const STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: 'Awaiting Payment', pending_verification: 'Pending Verification', approved: 'Approved',
  rejected: 'Rejected', cancelled: 'Cancelled', refunded: 'Refunded',
}
export const statusVariant = (s: OrderStatus) =>
  s === 'approved' ? 'success' : s === 'rejected' || s === 'cancelled' ? 'danger' : s === 'refunded' ? 'default' : 'warning'

const MAX_PROOF = 5 * 1024 * 1024
const PROOF_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export default function OrderPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  useSeo({ title: 'Order' })
  const order = useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      const res = await supabase.from('orders').select('*, order_items(*), payments(id, provider, reference_number, status, submitted_at)').eq('id', id).maybeSingle()
      return unwrap(res) as Order | null
    },
  })
  const methods = useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => unwrap(await supabase.from('payment_methods').select('*').eq('is_enabled', true)) as PaymentMethod[],
  })

  // live status updates (Realtime)
  useEffect(() => {
    const ch = supabase.channel(`order:${id}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
      () => qc.invalidateQueries({ queryKey: ['order', id] })).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [id, qc])

  const [provider, setProvider] = useState<'gcash' | 'paypal' | ''>('')
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const o = order.data
  const available = (methods.data ?? []).filter((m) => m.currency === o?.currency)
  const method = available.find((m) => m.provider === provider)
  const ref = normalizeReference(reference)
  const refValid = /^[A-Z0-9-]{6,40}$/.test(ref)

  const submit = useMutation({
    mutationFn: async () => {
      if (!navigator.onLine) throw new Error('You are offline. Payment submission needs internet.')
      if (!o || !user || !method || !file) throw new Error('Complete all fields')
      if (!PROOF_TYPES.includes(file.type)) throw new Error('Proof must be a PNG, JPG or WebP image')
      if (file.size > MAX_PROOF) throw new Error('Proof image must be under 5 MB')
      const path = `${user.id}/${o.id}-${Date.now()}.${file.type.split('/')[1].replace('jpeg', 'jpg')}`
      const up = await supabase.storage.from('payment-proofs').upload(path, file, { contentType: file.type, upsert: false })
      if (up.error) throw new Error(up.error.message)
      const { error } = await supabase.rpc('submit_payment', { p_order: o.id, p_provider: method.provider, p_reference: ref, p_proof_path: path })
      if (error) { await supabase.storage.from('payment-proofs').remove([path]); throw new Error(error.message) }
    },
    onSuccess: () => { toast.success('Payment submitted for verification'); qc.invalidateQueries({ queryKey: ['order', id] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  const cancel = async () => {
    const { error } = await supabase.rpc('cancel_order', { p_order: id })
    if (error) return void toast.error(error.message)
    qc.invalidateQueries({ queryKey: ['order', id] })
  }

  if (order.isLoading) return <div className="container max-w-3xl space-y-3 py-8"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>
  if (order.isError) return <div className="container py-10"><ErrorState error={order.error} /></div>
  if (!o) return <div className="container py-10"><ErrorState error={new Error('Order not found')} /></div>
  const payable = o.status === 'awaiting_payment' || o.status === 'rejected'

  return (
    <div className="container max-w-3xl space-y-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-2xl font-bold">Order {o.order_number}</h1><p className="text-sm text-muted-foreground">Placed {formatDate(o.created_at)}</p></div>
        <Badge variant={statusVariant(o.status) as any}>{STATUS_LABEL[o.status]}</Badge>
      </div>

      <Card className="p-4">
        <ul className="divide-y divide-border text-sm">{o.order_items?.map((i) => <li key={i.id} className="flex justify-between py-2"><span>{i.name_snapshot}</span><span>{formatMoney(i.unit_price, o.currency)}</span></li>)}</ul>
        <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{formatMoney(o.subtotal, o.currency)}</dd></div>
          {Number(o.discount_total) > 0 && <div className="flex justify-between text-success"><dt>Discount</dt><dd>−{formatMoney(o.discount_total, o.currency)}</dd></div>}
          <div className="flex justify-between text-base font-bold"><dt>Total to pay</dt><dd>{formatMoney(o.total, o.currency)}</dd></div>
        </dl>
      </Card>

      {o.status === 'rejected' && <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm"><p className="font-medium">Payment rejected</p><p className="text-muted-foreground">{o.rejection_reason ?? 'We could not verify your payment.'} You can submit a corrected payment below.</p></Card>}
      {o.status === 'pending_verification' && <Card className="p-4 text-sm"><p className="font-medium">We're verifying your payment</p><p className="text-muted-foreground">An administrator checks the actual payment in the account before approving. You'll be notified as soon as it's done.</p></Card>}
      {o.status === 'approved' && <Card className="border-success/40 bg-success/5 p-4 text-sm"><p className="font-medium">Payment approved</p><p className="text-muted-foreground">Your SoundFonts are now in <Link className="text-primary hover:underline" to="/library">My Sound Library</Link>.</p></Card>}

      {payable && (
        <Card className="space-y-5 p-5">
          <h2 className="text-lg font-semibold">Pay manually</h2>
          {available.length === 0 ? <p className="text-sm text-muted-foreground">No payment method is currently available for {o.currency}. Please contact support.</p> : (
            <div className="grid gap-3 sm:grid-cols-2">{available.map((m) => (
              <button key={m.id} onClick={() => setProvider(m.provider)} aria-pressed={provider === m.provider}
                className={cn('rounded-lg border p-4 text-left transition-colors', provider === m.provider ? 'border-primary bg-accent' : 'border-border hover:bg-muted')}>
                <p className="font-semibold">{m.display_name}</p><p className="text-xs text-muted-foreground">Pay in {m.currency}</p></button>))}</div>)}

          {method && (
            <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
              {method.qr_path ? <img src={publicUrl('site', method.qr_path)!} alt={`${method.display_name} QR code`} className="aspect-square w-full max-w-[180px] rounded-lg border border-border bg-white object-contain p-2" /> : <div className="grid aspect-square w-full max-w-[180px] place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">No QR configured</div>}
              <div className="space-y-2 text-sm">
                <p>Send exactly <strong className="text-lg">{formatMoney(o.total, o.currency)}</strong></p>
                {method.destination && <p className="flex items-center gap-2 break-all">To: <strong>{method.destination}</strong><Button variant="ghost" size="iconSm" aria-label="Copy" onClick={() => { void navigator.clipboard.writeText(method.destination!); toast.success('Copied') }}><Copy /></Button></p>}
                {method.account_name && <p>Account name: <strong>{method.account_name}</strong></p>}
                <p className="whitespace-pre-line text-muted-foreground">{method.instructions}</p>
                <p className="flex items-start gap-2 rounded-md bg-accent p-2 text-xs text-accent-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" />We never ask for your PIN, OTP, password or card details.</p>
              </div>
            </div>)}

          {method && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit.mutate() }}>
              <Field label="Transaction reference number" error={reference && !refValid ? 'Use 6–40 letters, numbers or dashes' : undefined}>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" inputMode="text" />
              </Field>
              <Field label="Proof of payment (screenshot)" hint="PNG, JPG or WebP, up to 5 MB. A screenshot alone never approves an order.">
                <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-auto py-2" />
              </Field>
              <Button size="lg" className="w-full" loading={submit.isPending} disabled={!refValid || !file}><Upload />Submit payment</Button>
            </form>)}
          <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>Cancel this order</Button>
          <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title="Cancel order?" description="This order will be cancelled. Your cart items are not restored." confirmLabel="Cancel order" destructive onConfirm={cancel} />
        </Card>
      )}

      {(o.payments?.length ?? 0) > 0 && (
        <Card className="p-4 text-sm"><p className="mb-2 font-medium">Payment submissions</p>
          <ul className="divide-y divide-border">{o.payments!.map((p) => <li key={p.id} className="flex justify-between gap-2 py-2"><span className="uppercase">{p.provider} · {p.reference_number}</span><span className="text-muted-foreground">{p.status.replace('_', ' ')} · {formatDate(p.submitted_at)}</span></li>)}</ul></Card>)}
    </div>
  )
}

export function OrdersListPage() {
  useSeo({ title: 'My orders' })
  const q = useQuery({ queryKey: ['orders'], queryFn: async () => unwrap(await supabase.from('orders').select('*').order('created_at', { ascending: false })) as Order[] })
  return (
    <div className="container max-w-3xl space-y-3 py-6">
      <h1 className="text-2xl font-bold">My orders</h1>
      {q.isLoading ? <Skeleton className="h-32" /> : q.isError ? <ErrorState error={q.error} /> : q.data!.length === 0 ? <p className="text-muted-foreground">No orders yet.</p> :
        q.data!.map((o) => (
          <Link key={o.id} to={`/account/orders/${o.id}`}><Card className="flex items-center justify-between gap-3 p-4 hover:shadow-md">
            <div><p className="font-medium">{o.order_number}</p><p className="text-xs text-muted-foreground">{formatDate(o.created_at)}</p></div>
            <div className="text-right"><p className="font-semibold">{formatMoney(o.total, o.currency)}</p><Badge variant={statusVariant(o.status) as any}>{STATUS_LABEL[o.status]}</Badge></div></Card></Link>))}
    </div>
  )
}
