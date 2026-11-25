import { useQuery } from '@tanstack/react-query'
import { BookOpen } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/misc'
import { useSettings } from '@/features/settings/useSettings'
import { useSeo } from '@/lib/seo'
import { publicUrl, supabase, unwrap } from '@/lib/supabase'
import { toEmbedUrl } from '@/lib/utils'
import type { Tutorial } from '@/types/db'

/** Minimal, safe Markdown → React (no raw HTML is ever injected, so no XSS surface). */
export function SafeMarkdown({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g).map((p, i) => {
    if (p.startsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('`')) return <code key={i} className="rounded bg-muted px-1 text-[0.9em]">{p.slice(1, -1)}</code>
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>
    const m = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(p)
    if (m) return <a key={i} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{m[1]}</a>
    return p
  })
  const blocks = text.split(/\n{2,}/)
  return <div className="space-y-3 text-sm leading-relaxed">{blocks.map((b, i) => {
    const lines = b.split('\n')
    if (lines.every((l) => /^\d+\.\s/.test(l))) return <ol key={i} className="list-decimal space-y-1 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\.\s/, ''))}</li>)}</ol>
    if (lines.every((l) => /^[-*]\s/.test(l))) return <ul key={i} className="list-disc space-y-1 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^[-*]\s/, ''))}</li>)}</ul>
    if (/^#{1,3}\s/.test(b)) return <h3 key={i} className="text-base font-semibold">{inline(b.replace(/^#+\s/, ''))}</h3>
    return <p key={i} className="whitespace-pre-line">{inline(b)}</p>
  })}</div>
}

export function LearnPage() {
  useSeo({ title: 'Learning Center', description: 'Guides for installing and using SoundFonts.' })
  const q = useQuery({ queryKey: ['tutorials'], queryFn: async () => unwrap(await supabase.from('tutorials').select('id,slug,title,summary,sort_order').order('sort_order')) as Tutorial[] })
  return (
    <div className="container max-w-3xl space-y-4 py-6"><h1 className="text-2xl font-bold">Learning Center</h1>
      {q.isLoading ? <Skeleton className="h-40" /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data!.length === 0 ? <EmptyState icon={<BookOpen className="size-8" />} title="No tutorials yet" /> :
        q.data!.map((t) => <Link key={t.id} to={`/learn/${t.slug}`}><Card className="mb-3 p-4 hover:shadow-md"><p className="font-semibold">{t.title}</p><p className="text-sm text-muted-foreground">{t.summary}</p></Card></Link>)}</div>
  )
}

export function TutorialPage() {
  const { slug } = useParams()
  const q = useQuery({ queryKey: ['tutorial', slug], queryFn: async () => unwrap(await supabase.from('tutorials').select('*').eq('slug', slug!).maybeSingle()) as Tutorial | null })
  useSeo({ title: q.data?.title ?? 'Tutorial', description: q.data?.summary })
  if (q.isLoading) return <div className="container max-w-3xl py-8"><Skeleton className="h-64" /></div>
  if (!q.data) return <div className="container py-10"><EmptyState title="Tutorial not found" /></div>
  const embed = toEmbedUrl(q.data.video_url)
  return (
    <article className="container max-w-3xl space-y-4 py-6"><Link to="/learn" className="text-sm text-primary hover:underline">← Learning Center</Link>
      <h1 className="text-3xl font-extrabold">{q.data.title}</h1>
      {q.data.image_path && <img src={publicUrl('site', q.data.image_path)!} alt="" className="w-full rounded-xl" loading="lazy" />}
      {embed && <div className="aspect-video overflow-hidden rounded-xl"><iframe src={embed} title={q.data.title} className="size-full" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /></div>}
      <SafeMarkdown text={q.data.body_md} /></article>
  )
}

const PAGE_KEYS: Record<string, string> = { terms: 'Terms and Conditions', privacy: 'Privacy Policy', refund_policy: 'Refund Policy', license: 'Digital Product License' }
export function PolicyPage() {
  const { key = '' } = useParams()
  const { data, isLoading } = useSettings()
  useSeo({ title: PAGE_KEYS[key] ?? 'Page' })
  if (!PAGE_KEYS[key]) return <div className="container py-10"><EmptyState title="Page not found" /></div>
  return <div className="container max-w-3xl space-y-4 py-6"><h1 className="text-3xl font-extrabold">{PAGE_KEYS[key]}</h1>{isLoading ? <Skeleton className="h-40" /> : <SafeMarkdown text={String(data?.[key] ?? '')} />}</div>
}
