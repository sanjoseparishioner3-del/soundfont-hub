import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { SlidersHorizontal, Music2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { Dialog, DialogContent, EmptyState, ErrorState, Pagination } from '@/components/ui/misc'
import { useCurrency } from '@/features/shop/store'
import { useSeo } from '@/lib/seo'
import { fetchApplications, fetchCategories, fetchSoundfonts, PAGE_SIZE, type CatalogFilters } from './api'
import { ProductCard, ProductGridSkeleton } from './ProductCard'

export default function ExplorePage() {
  useSeo({ title: 'Explore Sounds', description: 'Search and filter free and premium SF2 SoundFonts by instrument, price and compatibility.' })
  const [sp, setSp] = useSearchParams()
  const { currency } = useCurrency()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const get = (k: string) => sp.get(k) ?? ''
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k)
    if (!('page' in patch)) next.delete('page')
    setSp(next, { replace: true })
  }
  const [search, setSearch] = useState(get('q'))
  useEffect(() => { setSearch(get('q')) }, [sp.get('q')]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => { if (search !== get('q')) set({ q: search }) }, 350); return () => clearTimeout(t) }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const filters: CatalogFilters = {
    q: get('q'), type: get('type') as any, category: get('category'), application: get('application'),
    sort: (get('sort') || 'newest') as any, page: Number(get('page') || 1), currency, featured: get('featured') === '1',
    minPrice: get('min') ? Number(get('min')) : undefined, maxPrice: get('max') ? Number(get('max')) : undefined,
    maxSizeMb: get('size') ? Number(get('size')) : undefined,
  }
  const cats = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })
  const apps = useQuery({ queryKey: ['apps'], queryFn: fetchApplications })
  const q = useQuery({ queryKey: ['explore', filters], queryFn: () => fetchSoundfonts(filters), placeholderData: keepPreviousData })
  const active = ['type', 'category', 'application', 'min', 'max', 'size', 'featured'].filter((k) => get(k))

  const FilterForm = (
    <div className="space-y-4">
      <div><label className="mb-1 block text-sm font-medium">Type</label>
        <Select value={get('type')} onChange={(e) => set({ type: e.target.value })}><option value="">All</option><option value="free">Free</option><option value="premium">Premium</option></Select></div>
      <div><label className="mb-1 block text-sm font-medium">Instrument category</label>
        <Select value={get('category')} onChange={(e) => set({ category: e.target.value })}><option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</Select></div>
      <div><label className="mb-1 block text-sm font-medium">Verified in application</label>
        <Select value={get('application')} onChange={(e) => set({ application: e.target.value })}><option value="">Any</option>{apps.data?.map((a) => <option key={a.id} value={a.slug}>{a.name}</option>)}</Select></div>
      <div><label className="mb-1 block text-sm font-medium">Price range ({currency})</label>
        <div className="flex gap-2"><Input type="number" min={0} placeholder="Min" value={get('min')} onChange={(e) => set({ min: e.target.value })} aria-label="Minimum price" />
          <Input type="number" min={0} placeholder="Max" value={get('max')} onChange={(e) => set({ max: e.target.value })} aria-label="Maximum price" /></div></div>
      <div><label className="mb-1 block text-sm font-medium">Max file size</label>
        <Select value={get('size')} onChange={(e) => set({ size: e.target.value })}><option value="">Any size</option><option value="25">Up to 25 MB</option><option value="100">Up to 100 MB</option><option value="500">Up to 500 MB</option><option value="1024">Up to 1 GB</option></Select></div>
      {active.length > 0 && <Button variant="ghost" size="sm" onClick={() => setSp(new URLSearchParams(get('q') ? { q: get('q') } : {}), { replace: true })}><X />Clear filters</Button>}
    </div>
  )

  return (
    <div className="container py-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">Explore Sounds</h1>
        <Input className="w-full sm:w-64" placeholder="Search…" aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select className="w-44" aria-label="Sort" value={get('sort') || 'newest'} onChange={(e) => set({ sort: e.target.value })}>
          <option value="newest">Newest</option><option value="popular">Most popular</option><option value="rating">Highest rated</option>
          <option value="bestsellers">Best sellers</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></Select>
        <Button variant="outline" className="lg:hidden" onClick={() => setFiltersOpen(true)}><SlidersHorizontal />Filters{active.length ? ` (${active.length})` : ''}</Button>
      </div>
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">{FilterForm}</aside>
        <div>
          {q.isLoading ? <ProductGridSkeleton n={PAGE_SIZE} /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> :
            q.data!.rows.length === 0 ? <EmptyState icon={<Music2 className="size-8" />} title="No SoundFonts found" description="Try different keywords or clear some filters." /> : (
              <>
                <p className="mb-3 text-sm text-muted-foreground">{q.data!.count} result{q.data!.count === 1 ? '' : 's'}</p>
                <div className={`grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-4 ${q.isPlaceholderData ? 'opacity-60' : ''}`}>{q.data!.rows.map((sf) => <ProductCard key={sf.id} sf={sf} />)}</div>
                <Pagination page={filters.page!} pageSize={PAGE_SIZE} total={q.data!.count} onChange={(p) => { set({ page: String(p) }); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
              </>
            )}
        </div>
      </div>
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}><DialogContent title="Filters">{FilterForm}<Button className="mt-4 w-full" onClick={() => setFiltersOpen(false)}>Show results</Button></DialogContent></Dialog>
    </div>
  )
}
