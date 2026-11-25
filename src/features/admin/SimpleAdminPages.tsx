import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge, ConfirmDialog, Dialog, DialogContent } from '@/components/ui/misc'
import { Select } from '@/components/ui/form'
import { TICKET_STATUS, TicketThread, ticketVariant } from '@/features/support/SupportPages'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { DataTable, PageHeader, SearchInput, useAdminList } from './components'
import { CrudPage } from './CrudPage'

const yes = (v: boolean) => <Badge variant={v ? 'success' : 'default'}>{v ? 'Yes' : 'No'}</Badge>

export const CategoriesAdmin = () => (
  <CrudPage title="Categories" table="categories" searchColumns={['name', 'slug']} order={['sort_order', true]}
    fields={[{ name: 'name', label: 'Name', type: 'text', required: true }, { name: 'slug', label: 'Slug', type: 'text', required: true, slugFrom: 'name' }, { name: 'sort_order', label: 'Sort order', type: 'number' }]}
    columns={[{ header: 'Name', cell: (r) => r.name }, { header: 'Slug', cell: (r) => r.slug }, { header: 'Order', cell: (r) => r.sort_order }]}
    beforeSave={(v) => ({ ...v, sort_order: v.sort_order ?? 0 })} />
)

export const AnnouncementsAdmin = () => {
  const [busy, setBusy] = useState(false)
  return (
    <CrudPage title="Announcements" table="announcements" searchColumns={['title']}
      fields={[{ name: 'title', label: 'Title', type: 'text', required: true }, { name: 'body', label: 'Message', type: 'textarea' }, { name: 'is_active', label: 'Active', type: 'checkbox' }]}
      columns={[{ header: 'Title', cell: (r) => r.title }, { header: 'Active', cell: (r) => yes(r.is_active) }, { header: 'Created', cell: (r) => formatDate(r.created_at) }]}
      rowActions={(r) => <Button size="sm" variant="outline" loading={busy} onClick={async () => {
        setBusy(true)
        const { data, error } = await supabase.rpc('broadcast_notification', { p_type: 'promotion', p_title: r.title, p_body: r.body, p_link: '/' })
        setBusy(false)
        error ? toast.error(error.message) : toast.success(`Notification sent to ${data} customers`)
      }}>Notify all</Button>} />
  )
}

export const TutorialsAdmin = () => (
  <CrudPage title="Tutorials" table="tutorials" searchColumns={['title']} order={['sort_order', true]}
    fields={[{ name: 'title', label: 'Title', type: 'text', required: true }, { name: 'slug', label: 'Slug', type: 'text', required: true, slugFrom: 'title' }, { name: 'summary', label: 'Summary', type: 'text' },
      { name: 'body_md', label: 'Content (Markdown: **bold**, lists, `code`, links)', type: 'textarea' }, { name: 'video_url', label: 'Video URL (YouTube or Vimeo)', type: 'text', nullable: true }, { name: 'sort_order', label: 'Sort order', type: 'number' }, { name: 'is_published', label: 'Published', type: 'checkbox' }]}
    columns={[{ header: 'Title', cell: (r) => r.title }, { header: 'Published', cell: (r) => yes(r.is_published) }, { header: 'Order', cell: (r) => r.sort_order }]}
    beforeSave={(v) => ({ ...v, sort_order: v.sort_order ?? 0 })} />
)

export const PromotionsAdmin = () => (
  <CrudPage title="Promotions" table="discount_codes" searchColumns={['code']}
    fields={[{ name: 'code', label: 'Code', type: 'text', required: true, hint: 'Stored in UPPERCASE' }, { name: 'percent_off', label: 'Percent off (1–100)', type: 'number', nullable: true },
      { name: 'amount_off_php', label: 'Fixed amount off (PHP)', type: 'number', nullable: true }, { name: 'amount_off_usd', label: 'Fixed amount off (USD)', type: 'number', nullable: true },
      { name: 'max_uses', label: 'Max uses', type: 'number', nullable: true }, { name: 'starts_at', label: 'Starts', type: 'datetime', nullable: true }, { name: 'expires_at', label: 'Expires', type: 'datetime', nullable: true }, { name: 'is_active', label: 'Active', type: 'checkbox' }]}
    columns={[{ header: 'Code', cell: (r) => <code className="font-semibold">{r.code}</code> }, { header: 'Discount', cell: (r) => r.percent_off ? `${r.percent_off}%` : [r.amount_off_php && `₱${r.amount_off_php}`, r.amount_off_usd && `$${r.amount_off_usd}`].filter(Boolean).join(' / ') },
      { header: 'Used', cell: (r) => `${r.uses}${r.max_uses ? ` / ${r.max_uses}` : ''}` }, { header: 'Expires', cell: (r) => formatDate(r.expires_at) }, { header: 'Active', cell: (r) => yes(r.is_active) }]}
    beforeSave={(v) => ({ ...v, code: String(v.code).toUpperCase().replace(/\s+/g, '') })} />
)

export function ReviewsAdmin() {
  const qc = useQueryClient()
  const list = useAdminList<any>({ key: 'reviews', table: 'reviews', select: '*, soundfonts(name)', searchColumns: ['body'] })
  const [del, setDel] = useState<any>(null)
  const toggle = useMutation({
    mutationFn: async (r: any) => { const { error } = await supabase.from('reviews').update({ is_visible: !r.is_visible }).eq('id', r.id); if (error) throw error },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'reviews'] }), onError: (e: Error) => toast.error(e.message),
  })
  return (<><PageHeader title="Reviews" actions={<SearchInput value={list.search} onChange={list.setSearch} />} />
    <DataTable loading={list.isLoading} error={list.error} rows={list.rows} columns={[
      { header: 'Product', cell: (r) => r.soundfonts?.name }, { header: 'Rating', cell: (r) => '★'.repeat(r.rating) }, { header: 'Review', cell: (r) => <span className="line-clamp-2 max-w-sm">{r.body || '—'}</span> },
      { header: 'Date', cell: (r) => formatDate(r.created_at) },
      { header: '', cell: (r) => <div className="flex justify-end gap-1"><Button size="iconSm" variant="ghost" aria-label={r.is_visible ? 'Hide' : 'Show'} onClick={() => toggle.mutate(r)}>{r.is_visible ? <Eye /> : <EyeOff />}</Button><Button size="iconSm" variant="ghost" aria-label="Delete" onClick={() => setDel(r)}><Trash2 /></Button></div> }]} />
    {list.pager}
    <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Delete review?" description="This cannot be undone." destructive confirmLabel="Delete" onConfirm={async () => { await supabase.from('reviews').delete().eq('id', del.id); qc.invalidateQueries({ queryKey: ['admin', 'reviews'] }) }} /></>)
}

export function DownloadLogsAdmin() {
  const list = useAdminList<any>({ key: 'download_logs', table: 'download_logs', select: '*, soundfonts(name)', searchColumns: ['ip'] })
  return (<><PageHeader title="Download logs" actions={<SearchInput value={list.search} onChange={list.setSearch} placeholder="Search IP…" />} />
    <DataTable loading={list.isLoading} error={list.error} rows={list.rows} columns={[
      { header: 'When', cell: (r) => new Date(r.created_at).toLocaleString() }, { header: 'Product', cell: (r) => r.soundfonts?.name }, { header: 'User', cell: (r) => <code className="text-xs">{r.user_id.slice(0, 8)}</code> }, { header: 'IP', cell: (r) => r.ip ?? '—' }]} />{list.pager}</>)
}

export function AuditLogsAdmin() {
  const list = useAdminList<any>({ key: 'audit_logs', table: 'audit_logs', searchColumns: ['action', 'entity'], pageSize: 20 })
  return (<><PageHeader title="Audit logs" actions={<SearchInput value={list.search} onChange={list.setSearch} placeholder="Search action…" />} />
    <DataTable loading={list.isLoading} error={list.error} rows={list.rows} columns={[
      { header: 'When', cell: (r) => new Date(r.created_at).toLocaleString() }, { header: 'Action', cell: (r) => <code className="text-xs">{r.action}</code> }, { header: 'Actor', cell: (r) => <code className="text-xs">{r.actor_id?.slice(0, 8) ?? 'system'}</code> },
      { header: 'Details', cell: (r) => <span className="line-clamp-1 max-w-xs text-xs text-muted-foreground">{JSON.stringify(r.details)}</span> }]} />{list.pager}</>)
}

export function TicketsAdmin() {
  const [status, setStatus] = useState('')
  const list = useAdminList<any>({ key: 'admin-tickets', table: 'support_tickets', searchColumns: ['subject'], order: ['updated_at', false], filters: { status } })
  const [open, setOpen] = useState<any>(null)
  return (<><PageHeader title="Support tickets" actions={<><SearchInput value={list.search} onChange={list.setSearch} /><Select className="w-36" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter"><option value="">All statuses</option>{Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></>} />
    <DataTable loading={list.isLoading} error={list.error} rows={list.rows} columns={[
      { header: 'Subject', cell: (r) => <button className="text-left font-medium hover:text-primary" onClick={() => setOpen(r)}>{r.subject}</button> }, { header: 'Category', cell: (r) => r.category },
      { header: 'Status', cell: (r) => <Badge variant={ticketVariant(r.status)}>{TICKET_STATUS[r.status as keyof typeof TICKET_STATUS]}</Badge> }, { header: 'Updated', cell: (r) => formatDate(r.updated_at) }]} />{list.pager}
    <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>{open && <DialogContent title="Ticket" className="max-w-2xl"><TicketThread id={open.id} staff /></DialogContent>}</Dialog></>)
}

export function CustomersAdmin() {
  const list = useAdminList<any>({ key: 'profiles', table: 'profiles', searchColumns: ['email', 'full_name'] })
  const [grant, setGrant] = useState<any>(null)
  const products = useQuery({ queryKey: ['admin', 'all-products'], enabled: !!grant, queryFn: async () => (await supabase.from('soundfonts').select('id,name').order('name')).data ?? [] })
  const [pid, setPid] = useState('')
  return (<><PageHeader title="Customers" actions={<SearchInput value={list.search} onChange={list.setSearch} />} />
    <DataTable loading={list.isLoading} error={list.error} rows={list.rows} columns={[
      { header: 'Name', cell: (r) => r.full_name ?? '—' }, { header: 'Email', cell: (r) => r.email }, { header: 'Joined', cell: (r) => formatDate(r.created_at) },
      { header: '', cell: (r) => <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => { setGrant(r); setPid('') }}>Grant product</Button></div> }]} />{list.pager}
    <Dialog open={!!grant} onOpenChange={(o) => !o && setGrant(null)}><DialogContent title="Grant a SoundFont" description={grant?.email}>
      <Select value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Product"><option value="">Choose product…</option>{products.data?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
      <Button className="mt-3 w-full" disabled={!pid} onClick={async () => { const { error } = await supabase.from('customer_library').upsert({ user_id: grant.id, soundfont_id: pid, source: 'admin' }, { onConflict: 'user_id,soundfont_id', ignoreDuplicates: true }); error ? toast.error(error.message) : (toast.success('Granted'), setGrant(null)) }}>Grant access</Button>
      <p className="mt-2 text-xs text-muted-foreground"><Link to="/admin/orders" className="text-primary hover:underline">View orders</Link> to review this customer's purchases.</p></DialogContent></Dialog></>)
}
