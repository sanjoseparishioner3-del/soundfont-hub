import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { ConfirmDialog, Dialog, DialogContent, Switch } from '@/components/ui/misc'
import { supabase } from '@/lib/supabase'
import { slugify } from '@/lib/utils'
import { DataTable, PageHeader, SearchInput, useAdminList, type Column } from './components'

export interface FieldDef {
  name: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'datetime'
  options?: { value: string; label: string }[]
  required?: boolean
  slugFrom?: string
  hint?: string
  nullable?: boolean
}

/** Config-driven admin CRUD (categories, announcements, tutorials, discount codes, …). */
export function CrudPage({ title, table, fields, columns, searchColumns, order, beforeSave, extraActions, rowActions }: {
  title: string; table: string; fields: FieldDef[]; columns: Column<any>[]; searchColumns?: string[]; order?: [string, boolean]
  beforeSave?: (v: Record<string, any>) => Record<string, any>; extraActions?: ReactNode; rowActions?: (row: any) => ReactNode
}) {
  const qc = useQueryClient()
  const list = useAdminList<any>({ key: table, table, searchColumns, order })
  const [row, setRow] = useState<any | 'new' | null>(null)
  const [form, setForm] = useState<Record<string, any>>({})
  const [del, setDel] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)

  const open = (r: any | 'new') => {
    setRow(r)
    setForm(r === 'new' ? Object.fromEntries(fields.map((f) => [f.name, f.type === 'checkbox' ? (f.name === 'is_active' || f.name === 'is_published') : ''])) :
      Object.fromEntries(fields.map((f) => [f.name, f.type === 'datetime' && r[f.name] ? String(r[f.name]).slice(0, 16) : r[f.name] ?? (f.type === 'checkbox' ? false : '')])))
  }
  async function save() {
    setBusy(true)
    let payload: Record<string, any> = {}
    for (const f of fields) {
      let v = form[f.name]
      if (f.type === 'number') v = v === '' || v == null ? null : Number(v)
      if (f.type === 'datetime') v = v ? new Date(v).toISOString() : null
      if (f.type === 'text' || f.type === 'textarea') v = typeof v === 'string' ? v.trim() : v
      if ((v === '' || v == null) && f.nullable) v = null
      if (f.required && (v === '' || v == null)) { setBusy(false); return void toast.error(`${f.label} is required`) }
      payload[f.name] = v
    }
    if (beforeSave) payload = beforeSave(payload)
    const res = row === 'new' ? await supabase.from(table).insert(payload) : await supabase.from(table).update(payload).eq('id', row.id)
    setBusy(false)
    if (res.error) return void toast.error(res.error.message.includes('duplicate') ? 'A record with that unique value already exists' : res.error.message)
    toast.success('Saved'); qc.invalidateQueries({ queryKey: ['admin', table] }); qc.invalidateQueries({ queryKey: [table] }); setRow(null)
  }

  return (
    <>
      <PageHeader title={title} actions={<>{searchColumns && <SearchInput value={list.search} onChange={list.setSearch} />}{extraActions}<Button onClick={() => open('new')}><Plus />New</Button></>} />
      <DataTable loading={list.isLoading} error={list.error} retry={() => list.refetch()} rows={list.rows}
        columns={[...columns, { header: '', cell: (r) => <div className="flex justify-end gap-1">{rowActions?.(r)}<Button size="iconSm" variant="ghost" aria-label="Edit" onClick={() => open(r)}><Pencil /></Button><Button size="iconSm" variant="ghost" aria-label="Delete" onClick={() => setDel(r)}><Trash2 /></Button></div> }]} />
      {list.pager}
      <Dialog open={!!row} onOpenChange={(o) => !o && setRow(null)}>
        <DialogContent title={row === 'new' ? `New ${title.toLowerCase()}` : `Edit ${title.toLowerCase()}`}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save() }}>
            {fields.map((f) => (
              <Field key={f.name} label={f.label} hint={f.hint}>
                {f.type === 'textarea' ? <Textarea value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
                  : f.type === 'select' ? <Select value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
                  : f.type === 'checkbox' ? <div><Switch label={f.label} checked={!!form[f.name]} onChange={(v) => setForm({ ...form, [f.name]: v })} /></div>
                  : <Input type={f.type === 'datetime' ? 'datetime-local' : f.type} value={form[f.name] ?? ''} step={f.type === 'number' ? 'any' : undefined}
                      onChange={(e) => { const next = { ...form, [f.name]: e.target.value }; for (const s of fields) if (s.slugFrom === f.name && row === 'new') next[s.name] = slugify(e.target.value); setForm(next) }} />}
              </Field>))}
            <Button className="w-full" loading={busy}>Save</Button>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Delete record?" description="This cannot be undone." confirmLabel="Delete" destructive
        onConfirm={async () => { const { error } = await supabase.from(table).delete().eq('id', del.id); if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ['admin', table] }) }} />
    </>
  )
}
