import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Download, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, Textarea } from '@/components/ui/form'
import { Badge, ConfirmDialog, Dialog, DialogContent } from '@/components/ui/misc'
import { STATUS_LABEL, statusVariant } from '@/features/shop/OrderPage'
import { supabase, unwrap } from '@/lib/supabase'
import { formatDate, formatMoney } from '@/lib/utils'
import { DataTable, PageHeader, SearchInput, useAdminList } from './components'

function OrderDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState<null | 'approve' | 'reject' | 'refund'>(null)
  const q = useQuery({
    queryKey: ['admin', 'order', id],
    queryFn: async () => unwrap(await supabase.from('orders').select('*, order_items(*), payments(*, payment_proofs(storage_path))').eq('id', id).single()) as any,
  })
  const proof = useQuery({
    queryKey: ['admin', 'proof', id], enabled: !!q.data,
    queryFn: async () => {
      const paths: string[] = (q.data.payments ?? []).flatMap((p: any) => p.payment_proofs.map((x: any) => x.storage_path))
      return Promise.all(paths.map(async (p) => (await supabase.storage.from('payment-proofs').createSignedUrl(p, 300)).data?.signedUrl).filter(Boolean) as any)
    },
  })
  if (!q.data) return <p className="text-sm text-muted-foreground">Loading…</p>
  const o = q.data
  const act = async (kind: 'approve' | 'reject' | 'refund') => {
    const { error } = kind === 'refund' ? await supabase.rpc('refund_order', { p_order: id, p_reason: reason || null })
      : await supabase.rpc('review_payment', { p_order: id, p_approve: kind === 'approve', p_reason: reason || null })
    if (error) return void toast.error(error.message)
    toast.success(kind === 'approve' ? 'Approved – library updated' : kind === 'reject' ? 'Rejected' : 'Refunded')
    qc.invalidateQueries({ queryKey: ['admin'] }); onChanged()
  }
  return (
    <div className="space-y-4 text-sm">
      <div className="flex justify-between"><span className="font-semibold">{o.order_number}</span><Badge variant={statusVariant(o.status) as any}>{STATUS_LABEL[o.status as keyof typeof STATUS_LABEL]}</Badge></div>
      <ul className="divide-y divide-border">{o.order_items.map((i: any) => <li key={i.id} className="flex justify-between py-1.5"><span>{i.name_snapshot}</span><span>{formatMoney(i.unit_price, o.currency)}</span></li>)}</ul>
      <p className="text-right text-base font-bold">Expected: {formatMoney(o.total, o.currency)}</p>
      {o.payments.map((p: any) => <div key={p.id} className="rounded-md border border-border p-2"><p className="uppercase">{p.provider} · <strong>{p.reference_number}</strong></p><p className="text-xs text-muted-foreground">{formatMoney(p.amount, p.currency)} · {p.status.replace('_', ' ')} · {formatDate(p.submitted_at)}</p></div>)}
      {proof.data?.map((u: string, i: number) => <a key={i} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="Proof of payment" className="max-h-72 rounded-md border border-border" /></a>)}
      {o.status === 'pending_verification' && (<>
        <p className="rounded-md bg-amber-100 p-2 text-xs text-amber-900">Confirm the money actually arrived in the {o.payments[0]?.provider?.toUpperCase()} account, with this reference and amount, before approving. A screenshot alone is not proof.</p>
        <Textarea placeholder="Rejection reason (shown to customer)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Rejection reason" />
        <div className="flex gap-2"><Button className="flex-1" onClick={() => setConfirm('approve')}><Check />Approve</Button><Button className="flex-1" variant="destructive" onClick={() => setConfirm('reject')}><X />Reject</Button></div></>)}
      {o.status === 'approved' && <Button variant="outline" onClick={() => setConfirm('refund')}>Mark as refunded</Button>}
      <ConfirmDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)} destructive={confirm !== 'approve'} confirmLabel={confirm ? confirm[0].toUpperCase() + confirm.slice(1) : ''}
        title={`${confirm} order ${o.order_number}?`} description={confirm === 'approve' ? 'The customer will receive access to the purchased files.' : confirm === 'refund' ? 'Access granted by this order will be removed. Return the money in the payment provider separately.' : 'The customer will be notified.'}
        onConfirm={() => act(confirm!)} />
    </div>
  )
}

export function OrdersAdmin({ pendingOnly = false }: { pendingOnly?: boolean }) {
  const [status, setStatus] = useState(pendingOnly ? 'pending_verification' : '')
  const list = useAdminList<any>({ key: pendingOnly ? 'pending' : 'orders', table: 'orders', select: '*, profiles:user_id(email)', searchColumns: ['order_number'], filters: { status } })
  const [open, setOpen] = useState<string | null>(null)
  return (<>
    <PageHeader title={pendingOnly ? 'Payment verification' : 'Orders'} actions={<><SearchInput value={list.search} onChange={list.setSearch} placeholder="Order number…" />
      {!pendingOnly && <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</>} />
    <DataTable loading={list.isLoading} error={list.error} retry={() => list.refetch()} rows={list.rows} empty={pendingOnly ? 'No payments waiting for verification.' : 'No orders yet.'} columns={[
      { header: 'Order', cell: (o) => <button className="font-medium text-primary hover:underline" onClick={() => setOpen(o.id)}>{o.order_number}</button> },
      { header: 'Customer', cell: (o) => o.profiles?.email ?? '—' }, { header: 'Total', cell: (o) => formatMoney(o.total, o.currency) },
      { header: 'Status', cell: (o) => <Badge variant={statusVariant(o.status) as any}>{STATUS_LABEL[o.status as keyof typeof STATUS_LABEL]}</Badge> }, { header: 'Date', cell: (o) => formatDate(o.created_at) }]} />
    {list.pager}
    <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>{open && <DialogContent title="Order details" className="max-w-xl"><OrderDetail id={open} onChanged={() => setOpen(null)} /></DialogContent>}</Dialog>
  </>)
}

export function ReportsAdmin() {
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10))
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  async function exportCsv() {
    setBusy(true)
    const { data, error } = await supabase.from('orders').select('order_number,status,currency,subtotal,discount_total,total,created_at,profiles:user_id(email)')
      .gte('created_at', from).lte('created_at', `${to}T23:59:59`).order('created_at').limit(10000)
    setBusy(false)
    if (error) return void toast.error(error.message)
    // prefix risky leading characters to prevent spreadsheet formula injection
    const esc = (v: unknown) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"` }
    const rows = [['order_number', 'email', 'status', 'currency', 'subtotal', 'discount', 'total', 'created_at'], ...(data as any[]).map((o) => [o.order_number, o.profiles?.email, o.status, o.currency, o.subtotal, o.discount_total, o.total, o.created_at])]
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `orders-${from}_${to}.csv` }); a.click(); URL.revokeObjectURL(url)
  }
  return (<><PageHeader title="Reports" />
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4">
      <label className="text-sm">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block h-10 rounded-md border border-border bg-background px-3" /></label>
      <label className="text-sm">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block h-10 rounded-md border border-border bg-background px-3" /></label>
      <Button loading={busy} onClick={exportCsv}><Download />Export orders CSV</Button></div></>)
}
