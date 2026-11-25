import { useQuery } from '@tanstack/react-query'
import { Package, Play } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/misc'
import { useAuth } from '@/features/auth/AuthProvider'
import { usePlayer } from '@/features/player/playerStore'
import { useCart } from '@/features/shop/hooks'
import { useCurrency } from '@/features/shop/store'
import { useSeo } from '@/lib/seo'
import { publicUrl } from '@/lib/supabase'
import { formatMoney } from '@/lib/utils'
import { fetchBundles, fetchPreviewsFor } from './api'
import { Cover } from './ProductCard'

function useBundleMath(b: any) {
  const { currency } = useCurrency()
  const original = (b.bundle_items ?? []).reduce((a: number, i: any) => a + Number(currency === 'PHP' ? i.soundfonts.price_php : i.soundfonts.price_usd), 0)
  const price = Number(currency === 'PHP' ? b.price_php : b.price_usd)
  return { currency, original, price, savings: Math.max(0, original - price) }
}

function BundleCard({ b }: { b: any }) {
  const m = useBundleMath(b)
  return (
    <Link to={`/bundles/${b.slug}`}><Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="aspect-[16/9] bg-accent">{b.cover_path ? <img src={publicUrl('covers', b.cover_path)!} alt={b.name} loading="lazy" className="size-full object-cover" /> : <div className="grid size-full place-items-center"><Package className="size-10 text-primary" /></div>}</div>
      <div className="space-y-1 p-4"><p className="font-semibold">{b.name}</p><p className="text-xs text-muted-foreground">{b.bundle_items?.length ?? 0} SoundFonts</p>
        <p><span className="text-lg font-bold">{formatMoney(m.price, m.currency)}</span>{m.savings > 0 && <span className="ml-2 text-sm text-muted-foreground line-through">{formatMoney(m.original, m.currency)}</span>}</p></div>
    </Card></Link>
  )
}

export function BundlesPage() {
  useSeo({ title: 'Bundles', description: 'Save with discounted SoundFont collections.' })
  const q = useQuery({ queryKey: ['bundles'], queryFn: fetchBundles })
  return (
    <div className="container space-y-4 py-6"><h1 className="text-2xl font-bold">Bundles & collections</h1>
      {q.isLoading ? <Skeleton className="h-48" /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data!.length === 0 ? <EmptyState title="No bundles yet" description="Check back soon." /> :
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{q.data!.map((b) => <BundleCard key={b.id} b={b} />)}</div>}</div>
  )
}

export function BundleDetailPage() {
  const { slug } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const cart = useCart()
  const player = usePlayer()
  const q = useQuery({ queryKey: ['bundles'], queryFn: fetchBundles })
  const b: any = q.data?.find((x) => x.slug === slug)
  const ids = (b?.bundle_items ?? []).map((i: any) => i.soundfont_id)
  const previews = useQuery({ queryKey: ['bundle-previews', ids.join()], enabled: ids.length > 0, queryFn: () => fetchPreviewsFor(ids) })
  const m = useBundleMath(b ?? { bundle_items: [], price_php: 0, price_usd: 0 })
  useSeo({ title: b?.name ?? 'Bundle', description: b?.description, image: b ? publicUrl('covers', b.cover_path) : null })
  if (q.isLoading) return <div className="container py-8"><Skeleton className="h-64" /></div>
  if (!b) return <div className="container py-10"><EmptyState title="Bundle not found" action={<Button asChild><Link to="/bundles">All bundles</Link></Button>} /></div>
  const tracks = (previews.data ?? []).map((p) => { const sf = b.bundle_items.find((i: any) => i.soundfont_id === p.soundfont_id)?.soundfonts; return { id: p.id, title: p.title, productName: sf?.name ?? b.name, productSlug: sf?.slug ?? '', artwork: publicUrl('covers', sf?.cover_path), url: publicUrl('previews', p.storage_path)! } })
  return (
    <div className="container space-y-6 py-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="aspect-video overflow-hidden rounded-2xl bg-accent">{b.cover_path ? <img src={publicUrl('covers', b.cover_path)!} alt={b.name} className="size-full object-cover" /> : <div className="grid size-full place-items-center"><Package className="size-16 text-primary" /></div>}</div>
        <div className="space-y-4"><h1 className="text-3xl font-extrabold">{b.name}</h1><p className="whitespace-pre-line text-muted-foreground">{b.description}</p>
          <dl className="grid grid-cols-3 gap-3 text-sm"><div><dt className="text-muted-foreground">Files</dt><dd className="font-semibold">{b.bundle_items.length}</dd></div>
            <div><dt className="text-muted-foreground">Original</dt><dd className="font-semibold line-through">{formatMoney(m.original, m.currency)}</dd></div>
            <div><dt className="text-muted-foreground">You save</dt><dd className="font-semibold text-success">{formatMoney(m.savings, m.currency)}</dd></div></dl>
          <p className="text-3xl font-bold">{formatMoney(m.price, m.currency)}</p>
          <div className="flex gap-2"><Button size="lg" variant="outline" loading={cart.adding} onClick={() => (user ? cart.add({ bundleId: b.id }) : nav('/login'))}>Add to cart</Button>
            <Button size="lg" onClick={() => { if (!user) return nav('/login'); cart.add({ bundleId: b.id }); nav('/cart') }}>Buy now</Button>
            {tracks.length > 0 && <Button size="lg" variant="soft" onClick={() => player.playQueue(tracks)}><Play />Listen</Button>}</div></div>
      </div>
      <section><h2 className="mb-3 text-lg font-bold">Included SoundFonts</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{b.bundle_items.map((i: any) => (
          <Link key={i.soundfont_id} to={`/sounds/${i.soundfonts.slug}`}><Card className="overflow-hidden"><div className="aspect-square"><Cover sf={i.soundfonts} /></div><p className="truncate p-3 text-sm font-medium">{i.soundfonts.name}</p></Card></Link>))}</div></section>
    </div>
  )
}
