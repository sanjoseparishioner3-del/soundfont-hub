import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowRight, Check, Mail, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, EmptyState, ErrorState } from '@/components/ui/misc'
import { useSettings } from '@/features/settings/useSettings'
import { useSeo } from '@/lib/seo'
import { publicUrl } from '@/lib/supabase'
import { fetchApplications, fetchBundles, fetchCategories, fetchRecentReviews, fetchSection } from './api'
import { ProductCard, ProductGridSkeleton } from './ProductCard'
import { formatMoney } from '@/lib/utils'
import { useCurrency } from '@/features/shop/store'

function Section({ title, kind, to }: { title: string; kind: Parameters<typeof fetchSection>[0]; to: string }) {
  const q = useQuery({ queryKey: ['section', kind], queryFn: () => fetchSection(kind, 4) })
  if (q.isSuccess && q.data.length === 0) return null
  return (
    <section className="container py-8">
      <div className="mb-4 flex items-end justify-between"><h2 className="text-xl font-bold md:text-2xl">{title}</h2>
        <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">View all<ArrowRight className="size-4" /></Link></div>
      {q.isLoading ? <ProductGridSkeleton n={4} /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4">{q.data!.map((sf) => <ProductCard key={sf.id} sf={sf} />)}</div>
      )}
    </section>
  )
}

function Newsletter() {
  const [done, setDone] = useState(false)
  return (
    <section className="container py-10">
      <Card className="flex flex-col items-center gap-4 bg-accent/60 p-8 text-center">
        <Mail className="size-7 text-primary" />
        <h2 className="text-xl font-bold">Never miss a new release</h2>
        <p className="max-w-md text-sm text-muted-foreground">Create a free account and turn on in-app notifications for new sounds, updates and promotions.</p>
        {done ? <p className="flex items-center gap-1 text-sm text-success"><Check className="size-4" />You're set — check your notification bell.</p> :
          <Button asChild onClick={() => { setDone(true); toast.success('Create or sign in to your account to receive release alerts.') }}><Link to="/register">Create free account</Link></Button>}
      </Card>
    </section>
  )
}

export default function HomePage() {
  useSeo({ title: 'SoundFont Hub', description: 'Discover, preview and download free and premium SF2 SoundFonts. Premium Sounds. Endless Possibilities.' })
  const { data: s } = useSettings()
  const { currency } = useCurrency()
  const cats = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })
  const apps = useQuery({ queryKey: ['apps'], queryFn: fetchApplications })
  const bundles = useQuery({ queryKey: ['bundles'], queryFn: fetchBundles })
  const reviews = useQuery({ queryKey: ['recent-reviews'], queryFn: fetchRecentReviews })
  const banner = (s?.hero_banners as { image_path: string; title?: string; link?: string }[] | undefined)?.[0]

  return (
    <>
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-accent via-background to-background">
        <div className="container grid items-center gap-8 py-12 md:grid-cols-2 md:py-20">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">SF2 SoundFont marketplace</p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-navy md:text-5xl">{s?.tagline ?? 'Premium Sounds. Endless Possibilities.'}</h1>
            <p className="max-w-md text-muted-foreground">Preview in your browser, then download pianos, pads, strings and complete worship collections.</p>
            <div className="flex flex-wrap gap-3"><Button asChild size="lg"><Link to="/explore">Explore sounds</Link></Button>
              <Button asChild size="lg" variant="outline"><Link to="/explore?type=free">Free SoundFonts</Link></Button></div>
          </motion.div>
          {banner?.image_path ? (
            <img src={publicUrl('site', banner.image_path)!} alt={banner.title ?? ''} className="aspect-[4/3] w-full rounded-2xl object-cover shadow-xl" />
          ) : (
            <div aria-hidden className="hidden aspect-[4/3] items-end gap-1.5 rounded-2xl bg-gradient-to-br from-primary to-blue-500 p-8 shadow-xl md:flex">
              {Array.from({ length: 28 }, (_, i) => <span key={i} className="flex-1 rounded-full bg-white/80" style={{ height: `${20 + Math.abs(Math.sin(i * 0.7)) * 70}%` }} />)}
            </div>
          )}
        </div>
      </section>

      <section className="container py-8">
        <h2 className="mb-4 text-xl font-bold md:text-2xl">Instrument categories</h2>
        {cats.isLoading ? <div className="skeleton h-20" /> : (
          <div className="flex flex-wrap gap-2">{cats.data?.map((c) => (
            <Link key={c.id} to={`/explore?category=${c.slug}`} className="rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-primary hover:bg-accent hover:text-accent-foreground">{c.name}</Link>))}</div>
        )}
      </section>

      <Section title="Featured SoundFonts" kind="featured" to="/explore?featured=1" />
      <Section title="Trending" kind="trending" to="/explore?sort=popular" />
      <Section title="New releases" kind="new" to="/explore?sort=newest" />
      <Section title="Best-selling" kind="bestsellers" to="/explore?sort=bestsellers" />
      <Section title="Free SoundFonts" kind="free" to="/explore?type=free" />
      <Section title="Premium SoundFonts" kind="premium" to="/explore?type=premium" />

      {bundles.data && bundles.data.length > 0 && (
        <section className="container py-8">
          <div className="mb-4 flex items-end justify-between"><h2 className="text-xl font-bold md:text-2xl">Recommended collections</h2><Link to="/bundles" className="text-sm font-medium text-primary hover:underline">All bundles</Link></div>
          <div className="grid gap-3 md:grid-cols-3">{bundles.data.slice(0, 3).map((b) => {
            const original = (b.bundle_items ?? []).reduce((a, i) => a + Number(currency === 'PHP' ? i.soundfonts.price_php : i.soundfonts.price_usd), 0)
            const price = Number(currency === 'PHP' ? b.price_php : b.price_usd)
            return (<Link key={b.id} to={`/bundles/${b.slug}`}><Card className="p-4 transition-shadow hover:shadow-md">
              <p className="font-semibold">{b.name}</p><p className="text-xs text-muted-foreground">{b.bundle_items?.length ?? 0} SoundFonts</p>
              <p className="mt-2 text-sm"><span className="font-bold">{formatMoney(price, currency)}</span>{original > price && <span className="ml-2 text-muted-foreground line-through">{formatMoney(original, currency)}</span>}</p></Card></Link>)
          })}</div>
        </section>
      )}

      <section className="container py-8">
        <h2 className="mb-1 text-xl font-bold md:text-2xl">Supported applications</h2>
        <p className="mb-4 text-sm text-muted-foreground">Compatibility is shown per product and only after it has been tested.</p>
        <div className="flex flex-wrap gap-2">{apps.data?.map((a) => <span key={a.id} className="rounded-lg bg-muted px-4 py-2 text-sm font-medium">{a.name}</span>)}</div>
      </section>

      <section className="container py-8">
        <h2 className="mb-4 text-xl font-bold md:text-2xl">Customer reviews</h2>
        {reviews.data?.length ? (
          <div className="grid gap-3 md:grid-cols-3">{reviews.data.map((r: any) => (
            <Card key={r.id} className="p-4"><div className="flex">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`size-4 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-border'}`} />)}</div>
              <p className="mt-2 line-clamp-3 text-sm">{r.body || 'Great sounds!'}</p>
              <p className="mt-2 text-xs text-muted-foreground">{r.reviewer} on <Link className="text-primary hover:underline" to={`/sounds/${r.product_slug}`}>{r.product_name}</Link></p></Card>))}</div>
        ) : <EmptyState title="No reviews yet" description="Be the first to review a SoundFont you own." icon={<Star className="size-8" />} />}
      </section>
      <Newsletter />
    </>
  )
}
