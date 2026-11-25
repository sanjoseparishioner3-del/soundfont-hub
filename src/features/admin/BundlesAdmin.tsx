import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/form'
import { Badge, ConfirmDialog, Dialog, DialogContent, Switch } from '@/components/ui/misc'
import { supabase } from '@/lib/supabase'
import { formatMoney, slugify } from '@/lib/utils'
import { DataTable, PageHeader, SearchInput, useAdminList } from './components'
import { uploadPublic } from './uploads'

/** One screen for both discounted Bundles (priced, purchasable) and Collections (curated, free to browse). */
export default function BundlesAdmin({ kind }: { kind: 'bundles' | 'collections' }) {
  const isBundle = kind === 'bundles'
  const itemsTable = isBundle ? 'bundle_items' : 'collection_items'
  const fk = isBundle ? 'bundle_id' : 'collection_id'
  const qc = useQueryClient()
  const list = useAdminList<any>({ key: kind, table: kind, select: `*, ${itemsTable}(soundfont_id)`, searchColumns: ['name'] })
  const products = useQuery({ queryKey: ['admin', 'all-products'], queryFn: async () => (await supabase.from('soundfonts').select('id,name,price_php,price_usd').order('name')).data ?? [] })
  const [edit, setEdit] = useState<any | 'new' | null>(null)
  const [f, setF] = useState<any>({})
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [del, setDel] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  const open = (r: any | 'new') => {
    setEdit(r)
    setF(r === 'new' ? { name: '', slug: '', description: '', price_php: '', price_usd: '', is_published: false, cover_path: null } : { ...r })
    setPicked(new Set(r === 'new' ? [] : (r[itemsTable] ?? []).map((i: any) => i.soundfont_id)))
  }
  const original = (cur: 'price_php' | 'price_usd') => (products.data ?? []).filter((p: any) => picked.has(p.id)).reduce((a: number, p: any) => a + Number(p[cur]), 0)

  async function save() {
    if (!f.name || !f.slug) return void toast.error('Name and slug are required')
    if (picked.size < (isBundle ? 2 : 1)) return void toast.error(isBundle ? 'A bundle needs at least 2 products' : 'Pick at least one product')
    const row: any = { name: f.name, slug: f.slug, description: f.description ?? '', cover_path: f.cover_path, is_published: !!f.is_published }
    if (isBundle) {
      row.price_php = Number(f.price_php); row.price_usd = Number(f.price_usd)
      if (!(row.price_php > 0 && row.price_usd > 0)) return void toast.error('Enter PHP and USD prices')
    }
    setBusy(true)
    const res = edit === 'new' ? await supabase.from(kind).insert(row).select('id').single() : await supabase.from(kind).update(row).eq('id', edit.id).select('id').single()
    if (res.error) { setBusy(false); return void toast.error(res.error.message) }
    const id = (res.data as any).id
    await supabase.from(itemsTable).delete().eq(fk, id)
    const ins = await supabase.from(itemsTable).insert([...picked].map((sid) => ({ [fk]: id, soundfont_id: sid })))
    setBusy(false)
    if (ins.error) return void toast.error(ins.error.message)
    toast.success('Saved'); qc.invalidateQueries({ queryKey: ['admin', kind] }); qc.invalidateQueries({ queryKey: [kind] }); setEdit(null)
  }

  return (<>
    <PageHeader title={isBundle ? 'Bundles' : 'Collections'} actions={<><SearchInput value={list.search} onChange={list.setSearch} /><Button onClick={() => open('new')}><Plus />New</Button></>} />
    <DataTable loading={list.isLoading} error={list.error} rows={list.rows} columns={[
      { header: 'Name', cell: (r) => r.name }, { header: 'Items', cell: (r) => r[itemsTable]?.length ?? 0 },
      ...(isBundle ? [{ header: 'Price', cell: (r: any) => `${formatMoney(r.price_php, 'PHP')} / ${formatMoney(r.price_usd, 'USD')}` }] : []),
      { header: 'Published', cell: (r) => <Badge variant={r.is_published ? 'success' : 'default'}>{r.is_published ? 'Yes' : 'Draft'}</Badge> },
      { header: '', cell: (r) => <div className="flex justify-end gap-1"><Button size="iconSm" variant="ghost" aria-label="Edit" onClick={() => open(r)}><Pencil /></Button><Button size="iconSm" variant="ghost" aria-label="Delete" onClick={() => setDel(r)}><Trash2 /></Button></div> }]} />
    {list.pager}
    <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}><DialogContent title={edit === 'new' ? 'New' : 'Edit'} className="max-w-xl">
      <div className="space-y-3">
        <Field label="Name"><Input value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value, slug: edit === 'new' ? slugify(e.target.value) : f.slug })} /></Field>
        <Field label="Slug"><Input value={f.slug ?? ''} onChange={(e) => setF({ ...f, slug: e.target.value })} /></Field>
        <Field label="Description"><Textarea value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Artwork"><Input type="file" accept="image/png,image/jpeg,image/webp" className="h-auto py-2" onChange={async (e) => { const file = e.target.files?.[0]; if (file) try { setF({ ...f, cover_path: await uploadPublic('covers', file, ['png', 'jpg', 'webp']) }) } catch (er) { toast.error((er as Error).message) } }} /></Field>
        {isBundle && <div className="grid grid-cols-2 gap-3"><Field label={`PHP price (original ${formatMoney(original('price_php'), 'PHP')})`}><Input type="number" step="0.01" value={f.price_php ?? ''} onChange={(e) => setF({ ...f, price_php: e.target.value })} /></Field>
          <Field label={`USD price (original ${formatMoney(original('price_usd'), 'USD')})`}><Input type="number" step="0.01" value={f.price_usd ?? ''} onChange={(e) => setF({ ...f, price_usd: e.target.value })} /></Field></div>}
        <fieldset><legend className="mb-1 text-sm font-medium">Included SoundFonts ({picked.size})</legend>
          <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">{products.data?.map((p: any) => (
            <li key={p.id}><label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted"><input type="checkbox" className="accent-primary" checked={picked.has(p.id)} onChange={() => setPicked((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })} />{p.name}</label></li>))}</ul></fieldset>
        <label className="flex items-center gap-2 text-sm"><Switch label="Published" checked={!!f.is_published} onChange={(v) => setF({ ...f, is_published: v })} />Published</label>
        <Button className="w-full" loading={busy} onClick={save}>Save</Button></div></DialogContent></Dialog>
    <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Delete?" description={`“${del?.name}” will be removed. Customers who already own its products keep access.`} destructive confirmLabel="Delete"
      onConfirm={async () => { const { error } = await supabase.from(kind).delete().eq('id', del.id); error ? toast.error(error.message) : qc.invalidateQueries({ queryKey: ['admin', kind] }) }} />
  </>)
}
