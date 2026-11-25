import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Download, Info, Library as LibIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { Badge, Card, Dialog, DialogContent, EmptyState, ErrorState, Pagination, Skeleton } from '@/components/ui/misc'
import { Cover } from '@/features/catalog/ProductCard'
import { useDownload } from '@/features/shop/hooks'
import { useSeo } from '@/lib/seo'
import { supabase, unwrap } from '@/lib/supabase'
import { formatBytes, formatDate } from '@/lib/utils'

const PAGE = 10

function Details({ row }: { row: any }) {
  const sf = row.soundfonts
  const info = useQuery({
    queryKey: ['library-details', sf.id],
    queryFn: async () => {
      const [files, logs] = await Promise.all([
        supabase.from('soundfont_files').select('id, file_name, size_bytes, sha256, version').eq('soundfont_id', sf.id),
        supabase.from('download_logs').select('created_at').eq('soundfont_id', sf.id).order('created_at', { ascending: false }).limit(10),
      ])
      return { files: files.data ?? [], logs: logs.data ?? [] }
    },
  })
  const dl = useDownload()
  return (
    <div className="space-y-4 text-sm">
      <section><h3 className="mb-1 font-semibold">Files</h3>
        {info.isLoading ? <Skeleton className="h-10" /> : info.data?.files.length ? (
          <ul className="space-y-2">{info.data.files.map((f: any) => (
            <li key={f.id} className="rounded-md border border-border p-2"><div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{f.file_name}</span>
              <Button size="sm" variant="soft" loading={dl.isPending} onClick={() => dl.mutate({ soundfontId: sf.id, fileId: f.id })}><Download />{formatBytes(f.size_bytes)}</Button></div>
              <p className="mt-1 break-all text-[11px] text-muted-foreground">SHA-256: {f.sha256}</p></li>))}</ul>) : <p className="text-muted-foreground">No files yet.</p>}</section>
      <section><h3 className="mb-1 font-semibold">Installation guide</h3><p className="whitespace-pre-line text-muted-foreground">{sf.install_instructions || 'See the Learning Center for guides.'} <Link className="text-primary hover:underline" to="/learn">Learning Center</Link></p></section>
      <section><h3 className="mb-1 font-semibold">License</h3><p className="whitespace-pre-line text-muted-foreground">{sf.license_text || 'Personal and commercial music production use. Redistribution or resale of the files is not permitted.'}</p></section>
      <section><h3 className="mb-1 font-semibold">Download history</h3>
        {info.data?.logs.length ? <ul className="text-muted-foreground">{info.data.logs.map((l: any, i: number) => <li key={i}>{new Date(l.created_at).toLocaleString()}</li>)}</ul> : <p className="text-muted-foreground">No downloads yet.</p>}</section>
    </div>
  )
}

export default function LibraryPage() {
  useSeo({ title: 'My Sound Library' })
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('recent')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<any | null>(null)
  const dl = useDownload()

  const q = useQuery({
    queryKey: ['library', search, sort, type, page], placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('customer_library').select('*, soundfonts!inner(*, categories(name))', { count: 'exact' })
      if (search.trim()) query = query.ilike('soundfonts.name', `%${search.trim().replace(/[%,]/g, ' ')}%`)
      if (type) query = query.eq('source', type)
      query = sort === 'name' ? query.order('name', { referencedTable: 'soundfonts' }) : query.order('acquired_at', { ascending: sort === 'oldest' })
      const { data, error, count } = await query.range((page - 1) * PAGE, page * PAGE - 1)
      if (error) throw new Error(error.message)
      return { rows: data ?? [], count: count ?? 0 }
    },
  })

  return (
    <div className="container max-w-4xl space-y-4 py-6">
      <h1 className="text-2xl font-bold">My Sound Library</h1>
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-0 flex-1 sm:max-w-xs" placeholder="Search your library" aria-label="Search library" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        <Select className="w-40" aria-label="Filter" value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}><option value="">All items</option><option value="purchase">Purchased</option><option value="bundle">From bundles</option><option value="free">Free</option></Select>
        <Select className="w-40" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}><option value="recent">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name Aâ€“Z</option></Select>
      </div>
      {q.isLoading ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> :
        q.data!.rows.length === 0 ? <EmptyState icon={<LibIcon className="size-8" />} title="Your library is empty" description="Free downloads and approved purchases appear here." action={<Button asChild><Link to="/explore">Explore sounds</Link></Button>} /> : (
          <>
            <div className="space-y-3">{q.data!.rows.map((r: any) => (
              <Card key={r.id} className="flex items-center gap-3 p-3">
                <div className="size-16 shrink-0 overflow-hidden rounded-md"><Cover sf={r.soundfonts} /></div>
                <div className="min-w-0 flex-1">
                  <Link to={`/sounds/${r.soundfonts.slug}`} className="block truncate font-semibold hover:text-primary">{r.soundfonts.name}</Link>
                  <p className="truncate text-xs text-muted-foreground">{r.soundfonts.categories?.name} Â· v{r.soundfonts.version} Â· {formatBytes(r.soundfonts.file_size_bytes)} Â· {formatDate(r.acquired_at)}</p>
                  <Badge className="mt-1" variant={r.source === 'free' ? 'success' : 'primary'}>{r.source === 'free' ? 'Free' : r.source === 'bundle' ? 'Bundle' : 'Purchased'}</Badge>
                </div>
                <Button variant="ghost" size="iconSm" aria-label="Details" onClick={() => setOpen(r)}><Info /></Button>
                <Button size="sm" loading={dl.isPending && dl.variables?.soundfontId === r.soundfont_id} onClick={() => dl.mutate({ soundfontId: r.soundfont_id })}><Download /><span className="hidden sm:inline">Download</span></Button>
              </Card>))}</div>
            <Pagination page={page} pageSize={PAGE} total={q.data!.count} onChange={setPage} />
          </>)}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>{open && <DialogContent title={open.soundfonts.name} description={`Version ${open.soundfonts.version}`}><Details row={open} /></DialogContent>}</Dialog>
    </div>
  )
}

export function FavoritesPage() {
  useSeo({ title: 'Favorites' })
  const q = useQuery({
    queryKey: ['favorite-products'],
    queryFn: async () => unwrap(await supabase.from('favorites').select('soundfonts(*, categories(name, slug))').order('created_at', { ascending: false }))!.map((r: any) => r.soundfonts).filter(Boolean),
  })
  return (
    <div className="container space-y-4 py-6"><h1 className="text-2xl font-bold">Favorites</h1>
      {q.isLoading ? <Skeleton className="h-40" /> : q.isError ? <ErrorState error={q.error} /> : q.data!.length === 0 ? <EmptyState title="No favorites yet" description="Tap the heart on any SoundFont to save it here." action={<Button asChild><Link to="/explore">Explore</Link></Button>} /> :
        <FavGrid items={q.data!} />}
    </div>
  )
}
import { ProductCard } from '@/features/catalog/ProductCard'
function FavGrid({ items }: { items: any[] }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{items.map((sf) => <ProductCard key={sf.id} sf={sf} />)}</div>
}
