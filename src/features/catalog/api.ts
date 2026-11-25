import { supabase, unwrap } from '@/lib/supabase'
import type { AudioPreview, Bundle, Category, Compatibility, PublicFile, Review, Soundfont, SupportedApp } from '@/types/db'

export const PAGE_SIZE = 12

export interface CatalogFilters {
  q?: string
  type?: 'free' | 'premium' | ''
  category?: string // slug
  application?: string // slug
  minPrice?: number
  maxPrice?: number
  maxSizeMb?: number
  sort?: 'newest' | 'popular' | 'rating' | 'bestsellers' | 'price_asc' | 'price_desc'
  page?: number
  currency?: 'PHP' | 'USD'
  featured?: boolean
}

const SELECT = '*, categories(name, slug)'

export async function fetchSoundfonts(f: CatalogFilters) {
  let q = supabase.from('soundfonts').select(SELECT, { count: 'exact' }).eq('is_published', true)

  if (f.q?.trim()) {
    const term = f.q.trim().replace(/[%,()]/g, ' ')
    q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%`)
  }
  if (f.type) q = q.eq('type', f.type)
  if (f.featured) q = q.eq('is_featured', true)
  if (f.category) {
    const { data } = await supabase.from('categories').select('id').eq('slug', f.category).maybeSingle()
    q = q.eq('category_id', data?.id ?? '00000000-0000-0000-0000-000000000000')
  }
  if (f.application) {
    const { data } = await supabase.from('product_compatibility').select('soundfont_id, supported_applications!inner(slug)')
      .eq('supported_applications.slug', f.application).eq('status', 'verified')
    q = q.in('id', (data ?? []).map((r: any) => r.soundfont_id).concat('00000000-0000-0000-0000-000000000000'))
  }
  const priceCol = f.currency === 'USD' ? 'price_usd' : 'price_php'
  if (f.minPrice != null) q = q.gte(priceCol, f.minPrice)
  if (f.maxPrice != null) q = q.lte(priceCol, f.maxPrice)
  if (f.maxSizeMb != null) q = q.lte('file_size_bytes', f.maxSizeMb * 1024 * 1024)

  switch (f.sort) {
    case 'popular': q = q.order('download_count', { ascending: false }); break
    case 'rating': q = q.order('rating_avg', { ascending: false }).order('rating_count', { ascending: false }); break
    case 'bestsellers': q = q.order('sales_count', { ascending: false }); break
    case 'price_asc': q = q.order(priceCol, { ascending: true }); break
    case 'price_desc': q = q.order(priceCol, { ascending: false }); break
    default: q = q.order('created_at', { ascending: false })
  }
  const page = f.page ?? 1
  const { data, error, count } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as Soundfont[], count: count ?? 0 }
}

export async function fetchSection(kind: 'featured' | 'trending' | 'new' | 'bestsellers' | 'free' | 'premium', limit = 8) {
  let q = supabase.from('soundfonts').select(SELECT).eq('is_published', true).limit(limit)
  if (kind === 'featured') q = q.eq('is_featured', true).order('created_at', { ascending: false })
  if (kind === 'trending') q = q.order('download_count', { ascending: false })
  if (kind === 'new') q = q.order('created_at', { ascending: false })
  if (kind === 'bestsellers') q = q.gt('sales_count', 0).order('sales_count', { ascending: false })
  if (kind === 'free') q = q.eq('type', 'free').order('created_at', { ascending: false })
  if (kind === 'premium') q = q.eq('type', 'premium').order('created_at', { ascending: false })
  return unwrap(await q) as Soundfont[]
}

export async function fetchSoundfont(slug: string) {
  const res = await supabase.from('soundfonts').select(SELECT).eq('slug', slug).eq('is_published', true).maybeSingle()
  const sf = unwrap(res) as Soundfont | null
  if (!sf) return null
  const [previews, files, compat, reviews, related] = await Promise.all([
    supabase.from('audio_previews').select('*').eq('soundfont_id', sf.id).order('sort_order'),
    supabase.from('soundfont_files_public').select('*').eq('soundfont_id', sf.id),
    supabase.from('product_compatibility').select('*, supported_applications(*)').eq('soundfont_id', sf.id),
    supabase.from('reviews_public').select('*').eq('soundfont_id', sf.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('soundfonts').select(SELECT).eq('is_published', true).eq('category_id', sf.category_id ?? '').neq('id', sf.id).limit(4),
  ])
  return {
    sf,
    previews: (previews.data ?? []) as AudioPreview[],
    files: (files.data ?? []) as PublicFile[],
    compat: (compat.data ?? []) as Compatibility[],
    reviews: (reviews.data ?? []) as (Review & { reviewer: string })[],
    related: (related.data ?? []) as Soundfont[],
  }
}

export async function fetchCategories() {
  return unwrap(await supabase.from('categories').select('*').order('sort_order')) as Category[]
}
export async function fetchApplications() {
  return unwrap(await supabase.from('supported_applications').select('*').order('sort_order')) as SupportedApp[]
}
export async function fetchBundles() {
  const res = await supabase.from('bundles').select('*, bundle_items(soundfont_id, soundfonts(id, name, slug, price_php, price_usd, cover_path))').eq('is_published', true).order('created_at', { ascending: false })
  return unwrap(res) as unknown as Bundle[]
}
export async function fetchCollections() {
  const res = await supabase.from('collections').select('*, collection_items(soundfonts(*))').eq('is_published', true).order('sort_order')
  return unwrap(res) as any[]
}
export async function fetchPreviewsFor(ids: string[]) {
  if (!ids.length) return []
  return unwrap(await supabase.from('audio_previews').select('*').in('soundfont_id', ids).order('sort_order')) as AudioPreview[]
}
export async function fetchRecentReviews() {
  const res = await supabase.from('reviews_public').select('*').order('created_at', { ascending: false }).limit(6)
  return unwrap(res) as any[]
}
