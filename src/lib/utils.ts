import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatMoney(amount: number | string, currency: 'PHP' | 'USD'): string {
  return new Intl.NumberFormat(currency === 'PHP' ? 'en-PH' : 'en-US', { style: 'currency', currency }).format(Number(amount))
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

export function normalizeReference(ref: string): string {
  return ref.replace(/\s+/g, '').toUpperCase()
}

/** Only allow embeds from known video hosts. */
export function toEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname.endsWith('youtube.com') || u.hostname === 'youtu.be') {
      const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') ?? u.pathname.split('/').pop()
      return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null
    }
    if (u.hostname.endsWith('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop()
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null
    }
  } catch { /* ignore */ }
  return null
}

export function priceFor(item: { price_php: number | string; price_usd: number | string }, currency: 'PHP' | 'USD'): number {
  return Number(currency === 'PHP' ? item.price_php : item.price_usd)
}
