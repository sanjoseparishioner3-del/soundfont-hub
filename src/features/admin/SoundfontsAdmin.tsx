import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileAudio, FileUp, Pencil, Plus, RotateCw, Trash2, UploadCloud, X } from 'lucide-react'
import { useCallback, useReducer, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Badge, ConfirmDialog, Dialog, DialogContent, Switch } from '@/components/ui/misc'
import { Cover } from '@/features/catalog/ProductCard'
import { fetchApplications, fetchCategories } from '@/features/catalog/api'
import { publicUrl, supabase, unwrap } from '@/lib/supabase'
import { formatBytes, formatDuration, formatMoney, slugify } from '@/lib/utils'
import type { AudioPreview, Soundfont } from '@/types/db'
import { DataTable, PageHeader, SearchInput, useAdminList } from './components'
import { audioDuration, cancelUpload, runUpload, uploadPublic, type UploadTask } from './uploads'

const schema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers, dashes'),
  description: z.string().max(5000),
  category_id: z.string().uuid().or(z.literal('')),
  type: z.enum(['free', 'premium']),
  price_php: z.coerce.number().min(0),
  price_usd: z.coerce.number().min(0),
  version: z.string().min(1).max(20),
  preset_count: z.coerce.number().int().min(0).optional().or(z.literal('')),
  sound_count: z.coerce.number().int().min(0).optional().or(z.literal('')),
  velocity_layers: z.coerce.number().int().min(0).optional().or(z.literal('')),
  channel_mode: z.enum(['stereo', 'mono', 'mixed', '']),
  install_instructions: z.string().max(5000),
  license_text: z.string().max(5000),
  is_published: z.boolean(),
  is_featured: z.boolean(),
}).refine((v) => v.type === 'free' || (v.price_php > 0 && v.price_usd > 0), { path: ['price_php'], message: 'Premium products need PHP and USD prices' })
type FormValues = z.infer<typeof schema>

const nullable = (v: unknown) => (v === '' || v == null || Number.isNaN(v) ? null : v)

function ProductForm({ sf, onDone }: { sf: Soundfont | null; onDone: () => void }) {
  const qc = useQueryClient()
  const cats = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: sf ? { ...sf, category_id: sf.category_id ?? '', channel_mode: sf.channel_mode ?? '', preset_count: sf.preset_count ?? '', sound_count: sf.sound_count ?? '', velocity_layers: sf.velocity_layers ?? '' } as any
      : { type: 'free', price_php: 0, price_usd: 0, version: '1.0.0', channel_mode: '', category_id: '', is_published: false, is_featured: false, description: '', install_instructions: '', license_text: '' },
  })
  const type = watch('type')
  return (
    <form className="space-y-3" onSubmit={handleSubmit(async (v) => {
      const row = { ...v, category_id: nullable(v.category_id), channel_mode: nullable(v.channel_mode), preset_count: nullable(v.preset_count), sound_count: nullable(v.sound_count), velocity_layers: nullable(v.velocity_layers),
        price_php: v.type === 'free' ? 0 : v.price_php, price_usd: v.type === 'free' ? 0 : v.price_usd }
      const res = sf ? await supabase.from('soundfonts').update(row).eq('id', sf.id) : await supabase.from('soundfonts').insert(row)
      if (res.error) return void toast.error(res.error.message.includes('duplicate') ? 'That slug is already used' : res.error.message)
      toast.success('Saved'); qc.invalidateQueries({ queryKey: ['admin'] }); onDone()
    })}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" error={errors.name?.message}><Input {...register('name', { onChange: (e) => !sf && setValue('slug', slugify(e.target.value)) })} /></Field>
        <Field label="URL slug" error={errors.slug?.message}><Input {...register('slug')} /></Field>
      </div>
      <Field label="Description" error={errors.description?.message}><Textarea {...register('description')} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Category"><Select {...register('category_id')}><option value="">None</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Type"><Select {...register('type')}><option value="free">Free</option><option value="premium">Premium</option></Select></Field>
        <Field label="Version"><Input {...register('version')} /></Field>
      </div>
      {type === 'premium' && <div className="grid gap-3 sm:grid-cols-2"><Field label="Local price (PHP)" error={errors.price_php?.message}><Input type="number" step="0.01" {...register('price_php')} /></Field><Field label="International price (USD)" error={errors.price_usd?.message}><Input type="number" step="0.01" {...register('price_usd')} /></Field></div>}
      <p className="text-xs text-muted-foreground">Specifications below are shown publicly — fill in only what you have verified; blank fields are hidden.</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Presets"><Input type="number" {...register('preset_count')} /></Field><Field label="Sounds"><Input type="number" {...register('sound_count')} /></Field>
        <Field label="Velocity layers"><Input type="number" {...register('velocity_layers')} /></Field>
        <Field label="Channels"><Select {...register('channel_mode')}><option value="">Unknown</option><option value="stereo">Stereo</option><option value="mono">Mono</option><option value="mixed">Mixed</option></Select></Field>
      </div>
      <Field label="Installation instructions"><Textarea {...register('install_instructions')} /></Field>
      <Field label="License & usage"><Textarea {...register('license_text')} /></Field>
      <div className="flex gap-6"><label className="flex items-center gap-2 text-sm"><Switch label="Published" checked={watch('is_published')} onChange={(v) => setValue('is_published', v)} />Published</label>
        <label className="flex items-center gap-2 text-sm"><Switch label="Featured" checked={watch('is_featured')} onChange={(v) => setValue('is_featured', v)} />Featured</label></div>
      <Button className="w-full" loading={isSubmitting}>{sf ? 'Save changes' : 'Create SoundFont'}</Button>
    </form>
  )
}

/* ---------- Files, demos, cover, compatibility ---------- */
function MediaManager({ sf }: { sf: Soundfont }) {
  const qc = useQueryClient()
  const [, force] = useReducer((n: number) => n + 1, 0)
  const tasks = useRef<UploadTask[]>([])
  const drop = useRef<HTMLInputElement>(null)
  const apps = useQuery({ queryKey: ['apps'], queryFn: fetchApplications })
  const files = useQuery({ queryKey: ['admin', 'files', sf.id], queryFn: async () => unwrap(await supabase.from('soundfont_files').select('*').eq('soundfont_id', sf.id)) as any[] })
  const previews = useQuery({ queryKey: ['admin', 'previews', sf.id], queryFn: async () => unwrap(await supabase.from('audio_previews').select('*').eq('soundfont_id', sf.id).order('sort_order')) as AudioPreview[] })
  const compat = useQuery({ queryKey: ['admin', 'compat', sf.id], queryFn: async () => unwrap(await supabase.from('product_compatibility').select('*').eq('soundfont_id', sf.id)) as any[] })
  const [dragging, setDragging] = useState(false)

  const addFiles = useCallback((list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext !== 'sf2' && ext !== 'zip') { toast.error(`${file.name}: only .sf2 and .zip files are accepted`); continue }
      const task: UploadTask = { id: crypto.randomUUID(), file, kind: ext, phase: 'queued', progress: 0, parts: [], abort: new AbortController() }
      tasks.current.push(task)
      void runUpload(task, sf.id, sf.version, () => { force(); if (task.phase === 'done') { qc.invalidateQueries({ queryKey: ['admin'] }) } })
    }
    force()
  }, [sf.id, sf.version, qc])

  async function setCover(f: File | undefined) {
    if (!f) return
    try { const path = await uploadPublic('covers', f, ['png', 'jpg', 'webp']); unwrap(await supabase.from('soundfonts').update({ cover_path: path }).eq('id', sf.id)); toast.success('Cover updated'); qc.invalidateQueries({ queryKey: ['admin'] }) } catch (e) { toast.error((e as Error).message) }
  }
  async function addPreview(f: File | undefined) {
    if (!f) return
    try {
      const path = await uploadPublic('previews', f, ['mp3', 'wav', 'ogg'], sf.id)
      const mime = f.type === 'audio/wav' || f.type === 'audio/x-wav' ? 'audio/wav' : f.type === 'audio/ogg' ? 'audio/ogg' : 'audio/mpeg'
      unwrap(await supabase.from('audio_previews').insert({ soundfont_id: sf.id, title: f.name.replace(/\.[^.]+$/, ''), storage_path: path, mime, duration_sec: await audioDuration(f), sort_order: previews.data?.length ?? 0 }))
      qc.invalidateQueries({ queryKey: ['admin', 'previews', sf.id] })
    } catch (e) { toast.error((e as Error).message) }
  }
  async function setCompat(applicationId: string, status: string, tested_version?: string) {
    if (status === 'none') unwrap(await supabase.from('product_compatibility').delete().eq('soundfont_id', sf.id).eq('application_id', applicationId))
    else unwrap(await supabase.from('product_compatibility').upsert({ soundfont_id: sf.id, application_id: applicationId, status, tested_version: tested_version || null, tested_at: status === 'verified' ? new Date().toISOString().slice(0, 10) : null }))
    qc.invalidateQueries({ queryKey: ['admin', 'compat', sf.id] })
  }
  const del = async (table: string, id: string, key: string) => { const { error } = await supabase.from(table).delete().eq('id', id); if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ['admin', key, sf.id] }); qc.invalidateQueries({ queryKey: ['admin'] }) }

  return (
    <div className="space-y-6 text-sm">
      <p className="rounded-md bg-accent p-3 text-xs text-accent-foreground">Only upload SoundFonts and samples you own or have permission to redistribute.</p>
      <section className="space-y-2"><h3 className="font-semibold">Cover artwork</h3>
        <div className="flex items-center gap-3"><div className="size-16 overflow-hidden rounded-md"><Cover sf={sf} /></div><Input type="file" accept="image/png,image/jpeg,image/webp" className="h-auto max-w-xs py-2" onChange={(e) => setCover(e.target.files?.[0])} /></div></section>

      <section className="space-y-2"><h3 className="font-semibold">SF2 / ZIP files (private storage)</h3>
        <div onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
          className={`grid cursor-pointer place-items-center gap-1 rounded-lg border-2 border-dashed p-6 text-center ${dragging ? 'border-primary bg-accent' : 'border-border'}`} onClick={() => drop.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && drop.current?.click()}>
          <UploadCloud className="size-7 text-primary" /><p>Drag & drop .sf2 or .zip files, or click to browse</p><p className="text-xs text-muted-foreground">Verified by content, SHA-256 checked, duplicates rejected, chunked with retry</p>
          <input ref={drop} type="file" multiple accept=".sf2,.zip" hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} /></div>
        {tasks.current.filter((t) => t.phase !== 'done').map((t) => (
          <div key={t.id} className="rounded-md border border-border p-2"><div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{t.file.name}</span><span className="text-xs text-muted-foreground">{formatBytes(t.file.size)}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full ${t.phase === 'error' ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${Math.round(t.progress * 100)}%` }} /></div>
            <div className="mt-1 flex items-center justify-between text-xs"><span className={t.phase === 'error' ? 'text-destructive' : 'text-muted-foreground'}>{t.phase === 'error' ? t.error : `${t.phase}${['hashing', 'uploading'].includes(t.phase) ? ` ${Math.round(t.progress * 100)}%` : ''}`}</span>
              <span className="flex gap-1">{(t.phase === 'error' || t.phase === 'cancelled') && <Button size="sm" variant="outline" onClick={() => void runUpload(t, sf.id, sf.version, force)}><RotateCw />Retry</Button>}
                {['hashing', 'uploading', 'validating'].includes(t.phase) && <Button size="sm" variant="ghost" onClick={() => cancelUpload(t)}><X />Cancel</Button>}
                {(t.phase === 'error' || t.phase === 'cancelled') && <Button size="sm" variant="ghost" onClick={() => { tasks.current = tasks.current.filter((x) => x !== t); force() }}>Dismiss</Button>}</span></div></div>))}
        <ul className="divide-y divide-border rounded-md border border-border">{files.data?.length ? files.data.map((f) => (
          <li key={f.id} className="flex items-center gap-2 p-2"><FileUp className="size-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate">{f.file_name}</p><p className="truncate text-[11px] text-muted-foreground">{formatBytes(f.size_bytes)} · v{f.version} · {f.sha256.slice(0, 16)}…</p></div>
            <Button variant="ghost" size="iconSm" aria-label="Remove file record" onClick={() => del('soundfont_files', f.id, 'files')}><Trash2 /></Button></li>)) : <li className="p-3 text-muted-foreground">No files uploaded yet.</li>}</ul>
        <p className="text-[11px] text-muted-foreground">Removing a record unlinks the file from the product; delete the object from R2 separately to reclaim storage.</p></section>

      <section className="space-y-2"><h3 className="font-semibold">Audio demonstrations (MP3 / WAV / OGG)</h3>
        <Input type="file" accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg" className="h-auto max-w-xs py-2" onChange={(e) => { void addPreview(e.target.files?.[0]); e.target.value = '' }} />
        <ul className="divide-y divide-border rounded-md border border-border">{previews.data?.length ? previews.data.map((p) => (
          <li key={p.id} className="flex items-center gap-2 p-2"><FileAudio className="size-4 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{p.title}</span><span className="text-xs text-muted-foreground">{p.duration_sec ? formatDuration(Number(p.duration_sec)) : ''}</span>
            <audio controls preload="none" src={publicUrl('previews', p.storage_path)!} className="h-8 w-40" /><Button variant="ghost" size="iconSm" aria-label="Delete demo" onClick={() => del('audio_previews', p.id, 'previews')}><Trash2 /></Button></li>)) : <li className="p-3 text-muted-foreground">No demos yet.</li>}</ul></section>

      <section className="space-y-2"><h3 className="font-semibold">Tested application compatibility</h3><p className="text-xs text-muted-foreground">Mark “verified” only after testing the file in that application.</p>
        <div className="space-y-2">{apps.data?.map((a) => { const c = compat.data?.find((x) => x.application_id === a.id)
          return <div key={a.id} className="flex flex-wrap items-center gap-2"><span className="w-44 font-medium">{a.name}</span>
            <Select className="w-36" aria-label={`${a.name} status`} value={c?.status ?? 'none'} onChange={(e) => setCompat(a.id, e.target.value, c?.tested_version)}><option value="none">Not listed</option><option value="verified">Verified</option><option value="unverified">Unverified</option><option value="incompatible">Incompatible</option></Select>
            {c && <Input className="w-28" placeholder="App version" defaultValue={c.tested_version ?? ''} onBlur={(e) => setCompat(a.id, c.status, e.target.value)} aria-label="Tested app version" />}</div> })}</div></section>
    </div>
  )
}

export default function SoundfontsAdmin() {
  const qc = useQueryClient()
  const list = useAdminList<Soundfont>({ key: 'soundfonts', table: 'soundfonts', select: '*, categories(name)', searchColumns: ['name', 'slug'] })
  const [edit, setEdit] = useState<Soundfont | 'new' | null>(null)
  const [media, setMedia] = useState<Soundfont | null>(null)
  const [del, setDel] = useState<Soundfont | null>(null)
  const togglePub = useMutation({
    mutationFn: async (s: Soundfont) => unwrap(await supabase.from('soundfonts').update({ is_published: !s.is_published }).eq('id', s.id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }), onError: (e: Error) => toast.error(e.message),
  })
  return (
    <>
      <PageHeader title="SoundFonts" actions={<><SearchInput value={list.search} onChange={list.setSearch} /><Button onClick={() => setEdit('new')}><Plus />New SoundFont</Button></>} />
      <DataTable loading={list.isLoading} error={list.error} retry={() => list.refetch()} rows={list.rows} empty="No SoundFonts yet. Create your first product."
        columns={[
          { header: 'Product', cell: (s) => <div className="flex items-center gap-3"><div className="size-10 shrink-0 overflow-hidden rounded"><Cover sf={s} /></div><div className="min-w-0"><p className="truncate font-medium">{s.name}</p><p className="truncate text-xs text-muted-foreground">{(s as any).categories?.name ?? 'Uncategorised'} · v{s.version}</p></div></div> },
          { header: 'Price', cell: (s) => s.type === 'free' ? <Badge variant="success">Free</Badge> : <span className="text-xs">{formatMoney(s.price_php, 'PHP')}<br />{formatMoney(s.price_usd, 'USD')}</span> },
          { header: 'Size', cell: (s) => formatBytes(s.file_size_bytes) },
          { header: 'Sales / DL', cell: (s) => `${s.sales_count} / ${s.download_count}` },
          { header: 'Published', cell: (s) => <Switch label={`Publish ${s.name}`} checked={s.is_published} onChange={() => togglePub.mutate(s)} /> },
          { header: '', cell: (s) => <div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => setMedia(s)}>Files & media</Button><Button size="iconSm" variant="ghost" aria-label="Edit" onClick={() => setEdit(s)}><Pencil /></Button><Button size="iconSm" variant="ghost" aria-label="Delete" onClick={() => setDel(s)}><Trash2 /></Button></div> },
        ]} />
      {list.pager}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>{edit && <DialogContent title={edit === 'new' ? 'New SoundFont' : `Edit ${edit.name}`} className="max-w-2xl"><ProductForm sf={edit === 'new' ? null : edit} onDone={() => setEdit(null)} /></DialogContent>}</Dialog>
      <Dialog open={!!media} onOpenChange={(o) => !o && setMedia(null)}>{media && <DialogContent title={`${media.name} – files & media`} className="max-w-2xl"><MediaManager sf={media} /></DialogContent>}</Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Delete SoundFont?" description={`“${del?.name}” and its files, demos, reviews and library entries will be permanently removed. This cannot be undone.`} confirmLabel="Delete permanently" destructive
        onConfirm={async () => { const { error } = await supabase.from('soundfonts').delete().eq('id', del!.id); if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ['admin'] }) }} />
    </>
  )
}
