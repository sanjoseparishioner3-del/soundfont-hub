import { useQuery } from '@tanstack/react-query'
import { ShoppingCart, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Card, EmptyState, Skeleton } from '@/components/ui/misc'
import { Cover } from '@/features/catalog/ProductCard'
import { useSeo } from '@/lib/seo'
import { supabase, unwrap } from '@/lib/supabase'
import { formatMoney, priceFor } from '@/lib/utils'
import type { Currency } from '@/types/db'
import { useCart } from './hooks'
import { useCurrency } from './store'

export default function CartPage() {
  useSeo({ title: 'Your cart' })
  const nav = useNavigate()
  const { items, isLoading, remove } = useCart()
  const { currency, setCurrency } = useCurrency()
  const [code, setCode] = useState('')
  const [applied, setApplied] = useState('')
  const [busy, setBusy] = useState(false)

  // Totals are always computed by the database, never trusted from the browser.
  const quote = useQuery({
    queryKey: ['quote', currency, applied, items.map((i) => i.id).join()],
    enabled: items.length > 0,
    queryFn: async () => unwrap(await supabase.rpc('quote_cart', { p_currency: currency, p_code: applied || null })) as { subtotal: number; discount: number; total: number; error: string | null },
  })

  async function checkout() {
    setBusy(true)
    const { data, error } = await supabase.rpc('create_order', { p_currency: currency as Currency, p_code: applied || null })
    setBusy(false)
    if (error) return void toast.error(error.message)
    nav(`/checkout/${(data as { id: string }).id}`)
  }

  if (isLoading) return <div className="container space-y-3 py-8"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
  if (items.length === 0) return <div className="container py-10"><EmptyState icon={<ShoppingCart className="size-8" />} title="Your cart is empty" description="Premium SoundFonts you add will appear here." action={<Button asChild><Link to="/explore?type=premium">Browse premium sounds</Link></Button>} /></div>

  return (
    <div className="container grid gap-8 py-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Your cart</h1>
        {items.map((it) => {
          const p = it.soundfonts ?? it.bundles
          return (
            <Card key={it.id} className="flex items-center gap-3 p-3">
              <div className="size-16 shrink-0 overflow-hidden rounded-md">{it.soundfonts ? <Cover sf={it.soundfonts} /> : <div className="size-full bg-accent" />}</div>
              <div className="min-w-0 flex-1"><Link className="block truncate font-medium hover:text-primary" to={it.soundfonts ? `/sounds/${p.slug}` : `/bundles/${p.slug}`}>{p.name}</Link>
                <p className="text-xs text-muted-foreground">{it.bundles ? 'Bundle' : 'SoundFont'}</p></div>
              <span className="font-semibold">{formatMoney(priceFor(p, currency), currency)}</span>
              <Button variant="ghost" size="iconSm" aria-label={`Remove ${p.name}`} onClick={() => remove(it.id)}><Trash2 /></Button>
            </Card>)
        })}
      </div>
      <Card className="h-fit space-y-4 p-5">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Order summary</h2>
          <div className="flex rounded-full border border-border p-0.5 text-xs">{(['PHP', 'USD'] as const).map((c) => (
            <button key={c} onClick={() => setCurrency(c)} aria-pressed={currency === c} className={`rounded-full px-3 py-1 ${currency === c ? 'bg-primary text-primary-foreground' : ''}`}>{c}</button>))}</div></div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(code.trim().toUpperCase()) }}>
          <Input placeholder="Discount code" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Discount code" />
          <Button type="submit" variant="outline">Apply</Button>
        </form>
        {quote.data?.error && <p role="alert" className="text-xs text-destructive">{quote.data.error}</p>}
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{quote.data ? formatMoney(quote.data.subtotal, currency) : '…'}</dd></div>
          {!!quote.data?.discount && <div className="flex justify-between text-success"><dt>Discount</dt><dd>−{formatMoney(quote.data.discount, currency)}</dd></div>}
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><dt>Total</dt><dd>{quote.data ? formatMoney(quote.data.total, currency) : '…'}</dd></div>
        </dl>
        <Button size="lg" className="w-full" loading={busy} disabled={!quote.data || !navigator.onLine} onClick={checkout}>Continue to payment</Button>
        {!navigator.onLine && <p className="text-xs text-muted-foreground">Checkout needs an internet connection.</p>}
      </Card>
    </div>
  )
}
