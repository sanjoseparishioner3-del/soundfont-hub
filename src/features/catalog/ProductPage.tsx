import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Download, HelpCircle, Heart, Pause, Play, ShoppingCart, Star, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/form'
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/misc'
import { useAuth } from '@/features/auth/AuthProvider'
import { usePlayer, type Track } from '@/features/player/playerStore'
import { useCart, useClaimFree, useDownload, useFavorites, useLibraryIds } from '@/features/shop/hooks'
import { useCurrency } from '@/features/shop/store'
import { useSeo } from '@/lib/seo'
import { publicUrl, supabase, unwrap } from '@/lib/supabase'
import { cn, formatBytes, formatDuration, formatMoney, priceFor } from '@/lib/utils'
import { fetchSoundfont } from './api'
import { Cover, ProductCard, Stars } from './ProductCard'

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null // only verified specs are shown
  return <div className="flex justify-between gap-4 border-b border-border py-2 text-sm last:border-0"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value}</dd></div>
}

function ReviewForm({ soundfontId }: { soundfontId: string }) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [rating, setRating] = useState(5)
  const [body, setBody] = useState('')
  const m = useMutation({
    mutationFn: async () => unwrap(await supabase.from('reviews').upsert({ user_id: user!.id, soundfont_id: soundfontId, rating, body: body.trim() }, { onConflict: 'user_id,soundfont_id' })),
    onSuccess: () => { toast.success('Thanks for your review!'); setBody(''); qc.invalidateQueries({ queryKey: ['sound'] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  return (
    <Card className="space-y-3 p-4">
      <p className="font-medium">Rate this SoundFont</p>
      <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={rating === n}><Star className={cn('size-6', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-border')} /></button>))}</div>
      <Textarea maxLength={2000} placeholder="Share your experience (optional)" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Review text" />
      <Button loading={m.isPending} onClick={() => m.mutate()}>Submit review</Button>
    </Card>
  )
}

export default function ProductPage() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const { currency } = useCurrency()
  const q = useQuery({ queryKey: ['sound', slug], queryFn: () => fetchSoundfont(slug) })
  const owned = useLibraryIds().data
  const fav = useFavorites()
  const cart = useCart()
  const download = useDownload()
  const claim = useClaimFree()
  const player = usePlayer()
  const sf = q.data?.sf
  useSeo({ title: sf?.name ?? 'SoundFont', description: sf?.description, image: sf ? publicUrl('covers', sf.cover_path) : null })

  if (q.isLoading) return <div className="container grid gap-8 py-8 md:grid-cols-2"><Skeleton className="aspect-square" /><div className="space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-12" /></div></div>
  if (q.isError) return <div className="container py-10"><ErrorState error={q.error} retry={() => q.refetch()} /></div>
  if (!q.data || !sf) return <div className="container py-10"><EmptyState title="SoundFont not found" description="It may have been unpublished or the link is incorrect." action={<Button asChild><Link to="/explore">Browse sounds</Link></Button>} /></div>

  const { previews, files, compat, reviews, related } = q.data
  const isPremium = sf.type === 'premium'
  const isOwned = owned?.has(sf.id)
  const tracks: Track[] = previews.map((p) => ({ id: p.id, title: p.title, productName: sf.name, productSlug: sf.slug, artwork: publicUrl('covers', sf.cover_path), url: publicUrl('previews', p.storage_path)! }))
  const needLogin = () => nav('/login', { state: { from: `/sounds/${sf.slug}` } })
  const cur = player.queue[player.index]

  return (
    <div className="container py-6 md:py-10">
      <nav className="mb-4 text-sm text-muted-foreground"><Link to="/explore" className="hover:text-foreground">Explore</Link> / {sf.categories?.name && <Link to={`/explore?category=${sf.categories.slug}`} className="hover:text-foreground">{sf.categories.name}</Link>}</nav>
      <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="aspect-square overflow-hidden rounded-2xl border border-border"><Cover sf={sf} /></div>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><Badge variant={isPremium ? 'primary' : 'success'}>{isPremium ? 'Premium' : 'Free'}</Badge><Badge>v{sf.version}</Badge><Stars value={Number(sf.rating_avg)} count={sf.rating_count} /></div>
          <h1 className="text-3xl font-extrabold tracking-tight">{sf.name}</h1>
          <p className="whitespace-pre-line text-muted-foreground">{sf.description}</p>
          <p className="text-3xl font-bold">{isPremium ? formatMoney(priceFor(sf, currency), currency) : 'Free'}</p>
          <div className="flex flex-wrap gap-2">
            {isOwned ? (
              <Button size="lg" loading={download.isPending} onClick={() => download.mutate({ soundfontId: sf.id })}><Download />Download</Button>
            ) : isPremium ? (<>
              <Button size="lg" variant="outline" loading={cart.adding} onClick={() => (user ? cart.add({ soundfontId: sf.id }) : needLogin())}><ShoppingCart />Add to cart</Button>
              <Button size="lg" onClick={() => { if (!user) return needLogin(); cart.add({ soundfontId: sf.id }); nav('/cart') }}>Buy now</Button>
            </>) : (<>
              <Button size="lg" loading={download.isPending} onClick={() => (user ? download.mutate({ soundfontId: sf.id }) : needLogin())}><Download />Free download</Button>
              <Button size="lg" variant="outline" loading={claim.isPending} onClick={() => (user ? claim.mutate(sf.id) : needLogin())}>Add to library</Button>
            </>)}
            <Button size="lg" variant="ghost" onClick={() => (user ? fav.toggle(sf.id) : needLogin())} aria-pressed={fav.ids.has(sf.id)}><Heart className={cn(fav.ids.has(sf.id) && 'fill-destructive text-destructive')} />{fav.ids.has(sf.id) ? 'Saved' : 'Favorite'}</Button>
          </div>
          {sf.type === 'free' && <p className="text-xs text-muted-foreground">{sf.download_count} downloads</p>}

          <Card className="p-4">
            <h2 className="mb-2 font-semibold">Audio demonstrations</h2>
            {tracks.length === 0 ? <p className="text-sm text-muted-foreground">No audio demos have been added yet.</p> : (
              <ul className="space-y-1">{tracks.map((t, i) => {
                const active = cur?.id === t.id
                return (<li key={t.id}><button onClick={() => player.toggleTrack(tracks, t.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted" aria-label={`${active && player.playing ? 'Pause' : 'Play'} ${t.title}`}>
                  <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground">{active && player.playing ? <Pause className="size-4" /> : <Play className="size-4" />}</span>
                  <span className="flex-1 truncate text-sm font-medium">{t.title}</span>
                  <span className="text-xs text-muted-foreground">{previews[i].duration_sec ? formatDuration(Number(previews[i].duration_sec)) : ''}</span></button></li>)
              })}</ul>)}
            <p className="mt-2 text-xs text-muted-foreground">Previews are separate audio recordings, not the SF2 file.</p>
          </Card>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section><h2 className="mb-3 text-lg font-bold">Specifications</h2>
          <Card className="px-4"><dl>
            <Spec label="File format" value="SF2 (SoundFont 2)" />
            <Spec label="Total size" value={sf.file_size_bytes ? formatBytes(sf.file_size_bytes) : null} />
            <Spec label="Files" value={files.length ? files.map((f) => `${f.file_name} (${formatBytes(f.size_bytes)})`).join(', ') : null} />
            <Spec label="Version" value={sf.version} />
            <Spec label="Presets" value={sf.preset_count} />
            <Spec label="Included sounds" value={sf.sound_count} />
            <Spec label="Velocity layers" value={sf.velocity_layers} />
            <Spec label="Channels" value={sf.channel_mode && sf.channel_mode[0].toUpperCase() + sf.channel_mode.slice(1)} />
          </dl></Card>
          {sf.presets?.length > 0 && <details className="mt-3 rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Instrument presets ({sf.presets.length})</summary>
            <ul className="mt-2 grid max-h-60 gap-1 overflow-y-auto text-sm sm:grid-cols-2">{sf.presets.map((p, i) => <li key={i} className="truncate text-muted-foreground">{String(p.bank).padStart(3, '0')}:{String(p.program).padStart(3, '0')} {p.name}</li>)}</ul></details>}
        </section>

        <section><h2 className="mb-3 text-lg font-bold">Tested application compatibility</h2>
          <Card className="divide-y divide-border">
            {compat.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Compatibility has not been tested yet. SF2 support varies by app — check your app's documentation.</p> :
              compat.map((c) => (
                <div key={c.application_id} className="flex items-center gap-3 p-3 text-sm">
                  {c.status === 'verified' ? <Check className="size-4 text-success" /> : c.status === 'incompatible' ? <X className="size-4 text-destructive" /> : <HelpCircle className="size-4 text-muted-foreground" />}
                  <span className="flex-1 font-medium">{c.supported_applications?.name}</span>
                  <span className="text-xs text-muted-foreground">{c.status === 'verified' ? `Verified${c.tested_version ? ` · v${c.tested_version}` : ''}` : c.status === 'incompatible' ? 'Not compatible' : 'Not verified'}</span>
                </div>))}
          </Card></section>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section><h2 className="mb-3 text-lg font-bold">Installation</h2><Card className="whitespace-pre-line p-4 text-sm">{sf.install_instructions || <>See the <Link className="text-primary hover:underline" to="/learn">Learning Center</Link> for step-by-step guides.</>}</Card></section>
        <section><h2 className="mb-3 text-lg font-bold">License & usage</h2><Card className="whitespace-pre-line p-4 text-sm">{sf.license_text || <Link className="text-primary hover:underline" to="/page/license">Read the digital product license</Link>}</Card></section>
      </div>

      <section className="mt-10"><h2 className="mb-3 text-lg font-bold">Reviews ({reviews.length})</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">{reviews.length === 0 ? <EmptyState title="No reviews yet" description="Owners can leave the first review." icon={<Star className="size-8" />} /> :
            reviews.map((r) => <Card key={r.id} className="p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium">{r.reviewer}</span><Stars value={r.rating} count={1} /></div>{r.body && <p className="mt-2 text-sm">{r.body}</p>}</Card>)}</div>
          {isOwned && user && <ReviewForm soundfontId={sf.id} />}
        </div></section>

      {related.length > 0 && <section className="mt-10"><h2 className="mb-3 text-lg font-bold">Related products</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{related.map((r) => <ProductCard key={r.id} sf={r} />)}</div></section>}
    </div>
  )
}
