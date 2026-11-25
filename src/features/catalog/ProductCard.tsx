import { useQuery } from '@tanstack/react-query'
import { Download, Heart, Music2, Pause, Play, ShoppingCart, Star } from 'lucide-react'
import { memo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Card } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { usePlayer, type Track } from '@/features/player/playerStore'
import { useCart, useClaimFree, useDownload, useFavorites, useLibraryIds } from '@/features/shop/hooks'
import { useCurrency } from '@/features/shop/store'
import { publicUrl, supabase } from '@/lib/supabase'
import { cn, formatBytes, formatMoney, priceFor } from '@/lib/utils'
import type { Soundfont } from '@/types/db'

export function Cover({ sf, className }: { sf: Pick<Soundfont, 'name' | 'cover_path' | 'id'>; className?: string }) {
  const src = publicUrl('covers', sf.cover_path)
  if (src) return <img src={src} alt={`${sf.name} cover`} loading="lazy" decoding="async" className={cn('size-full object-cover', className)} />
  const hue = (sf.id.charCodeAt(0) * 37 + sf.id.charCodeAt(3) * 11) % 360
  return (
    <div className={cn('grid size-full place-items-center', className)} style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 50) % 360} 75% 45%))` }}>
      <Music2 className="size-1/4 text-white/80" />
    </div>
  )
}

export function Stars({ value, count }: { value: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-label={`Rated ${value.toFixed(1)} out of 5`}>
      <Star className="size-3.5 fill-amber-400 text-amber-400" />{count ? value.toFixed(1) : 'New'}{count ? <span>({count})</span> : null}
    </span>
  )
}

/** Resolve preview tracks for a product (lazy: only when the play button is used). */
export function useProductTracks(sf: Soundfont) {
  return async (): Promise<Track[]> => {
    const { data } = await supabase.from('audio_previews').select('*').eq('soundfont_id', sf.id).order('sort_order')
    return (data ?? []).map((p: any) => ({
      id: p.id, title: p.title, productName: sf.name, productSlug: sf.slug,
      artwork: publicUrl('covers', sf.cover_path), url: publicUrl('previews', p.storage_path)!,
    }))
  }
}

export const ProductCard = memo(function ProductCard({ sf }: { sf: Soundfont }) {
  const { user } = useAuth()
  const nav = useNavigate()
  const { currency } = useCurrency()
  const fav = useFavorites()
  const cart = useCart()
  const owned = useLibraryIds().data?.has(sf.id)
  const download = useDownload()
  const claim = useClaimFree()
  const player = usePlayer()
  const loadTracks = useProductTracks(sf)
  const hasPreview = useQuery({
    queryKey: ['has-preview', sf.id], staleTime: 5 * 60_000,
    queryFn: async () => ((await supabase.from('audio_previews').select('id', { count: 'exact', head: true }).eq('soundfont_id', sf.id)).count ?? 0) > 0,
  }).data
  const currentIsMine = player.queue[player.index]?.productSlug === sf.slug
  const isPremium = sf.type === 'premium'
  const needLogin = () => nav('/login', { state: { from: `/sounds/${sf.slug}` } })

  async function togglePreview() {
    if (currentIsMine) return player.toggle()
    const tracks = await loadTracks()
    if (tracks.length) player.playQueue(tracks)
  }

  return (
    <Card className="group flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-muted">
        <Link to={`/sounds/${sf.slug}`} aria-label={sf.name} className="block size-full"><Cover sf={sf} className="transition-transform duration-300 group-hover:scale-105" /></Link>
        <Badge variant={isPremium ? 'primary' : 'success'} className="absolute left-2 top-2 bg-background/90 backdrop-blur">{isPremium ? 'Premium' : 'Free'}</Badge>
        <button
          onClick={() => (user ? fav.toggle(sf.id) : needLogin())}
          aria-label={fav.ids.has(sf.id) ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={fav.ids.has(sf.id)}
          className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-background/90 backdrop-blur hover:bg-background"
        >
          <Heart className={cn('size-4', fav.ids.has(sf.id) && 'fill-destructive text-destructive')} />
        </button>
        {hasPreview && (
          <button
            onClick={togglePreview} aria-label={currentIsMine && player.playing ? 'Pause preview' : 'Play preview'}
            className="absolute bottom-2 left-2 grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105"
          >
            {currentIsMine && player.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <Link to={`/sounds/${sf.slug}`} className="block truncate font-semibold hover:text-primary">{sf.name}</Link>
          <p className="truncate text-xs text-muted-foreground">{sf.categories?.name ?? 'SoundFont'} · {formatBytes(sf.file_size_bytes)}</p>
        </div>
        <div className="flex items-center justify-between">
          <Stars value={Number(sf.rating_avg)} count={sf.rating_count} />
          <span className="font-semibold">{isPremium ? formatMoney(priceFor(sf, currency), currency) : 'Free'}</span>
        </div>
        <div className="mt-auto pt-1">
          {owned ? (
            <Button size="sm" variant="soft" className="w-full" loading={download.isPending} onClick={() => download.mutate({ soundfontId: sf.id })}><Download />Download</Button>
          ) : isPremium ? (
            <Button size="sm" className="w-full" loading={cart.adding} onClick={() => (user ? cart.add({ soundfontId: sf.id }) : needLogin())}><ShoppingCart />Add to cart</Button>
          ) : (
            <Button size="sm" variant="soft" className="w-full" loading={download.isPending || claim.isPending} onClick={() => (user ? download.mutate({ soundfontId: sf.id }) : needLogin())}><Download />Download</Button>
          )}
        </div>
      </div>
    </Card>
  )
})

export function ProductGridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-4">
      {Array.from({ length: n }, (_, i) => (
        <Card key={i} className="overflow-hidden"><div className="skeleton aspect-square rounded-none" /><div className="space-y-2 p-3"><div className="skeleton h-4 w-3/4" /><div className="skeleton h-3 w-1/2" /><div className="skeleton h-8 w-full" /></div></Card>
      ))}
    </div>
  )
}
