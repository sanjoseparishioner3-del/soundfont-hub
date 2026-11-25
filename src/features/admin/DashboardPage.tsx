import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Card, ErrorState, Skeleton } from '@/components/ui/misc'
import { STATUS_LABEL, statusVariant } from '@/features/shop/OrderPage'
import { supabase, unwrap } from '@/lib/supabase'
import { formatBytes, formatDate, formatMoney } from '@/lib/utils'
import { PageHeader, Stat } from './components'

const FREE_TIER_STORAGE = 10 * 1024 ** 3 // R2 free allowance: 10 GB-month

export default function DashboardPage() {
  const q = useQuery({ queryKey: ['admin', 'stats'], queryFn: async () => unwrap(await supabase.rpc('admin_stats')) as any, refetchInterval: 60_000 })
  if (q.isLoading) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const s = q.data
  const usedPct = Math.min(100, (Number(s.storage_bytes) / FREE_TIER_STORAGE) * 100)
  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="PHP revenue" value={formatMoney(s.revenue_php, 'PHP')} />
        <Stat label="USD revenue" value={formatMoney(s.revenue_usd, 'USD')} hint="Currencies are never mixed" />
        <Stat label="Pending verifications" value={<Link className="text-primary" to="/admin/payments">{s.pending_verifications}</Link>} />
        <Stat label="Approved orders" value={s.approved_orders} />
        <Stat label="Customers" value={s.customers} />
        <Stat label="SoundFonts" value={s.products} hint={`${s.free_products} free · ${s.premium_products} premium`} />
        <Stat label="Downloads" value={s.downloads} />
        <Stat label="Storage used" value={formatBytes(Number(s.storage_bytes))} hint={`${usedPct.toFixed(1)}% of 10 GB R2 free tier`} />
      </div>
      {usedPct > 80 && <p role="alert" className="mt-3 rounded-md bg-amber-100 p-3 text-sm text-amber-900">Storage is above 80% of the R2 free allowance. Remove unused files to avoid charges.</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4"><h2 className="mb-3 font-semibold">Monthly revenue</h2>
          {s.monthly_revenue.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No approved sales yet.</p> : (
            <div className="h-64"><ResponsiveContainer><BarChart data={s.monthly_revenue}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} width={48} />
              <Tooltip /><Bar dataKey="php" name="PHP" fill="#5b3df5" radius={[4, 4, 0, 0]} /><Bar dataKey="usd" name="USD" fill="#2f80ed" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>)}
        </Card>
        <Card className="p-4"><h2 className="mb-3 font-semibold">Best sellers</h2>
          {s.best_sellers.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No products yet.</p> : <ol className="space-y-2 text-sm">{s.best_sellers.map((b: any, i: number) => <li key={b.id} className="flex justify-between gap-2"><span className="truncate">{i + 1}. {b.name}</span><span className="text-muted-foreground">{b.sales_count} sold · {b.download_count} dl</span></li>)}</ol>}
        </Card>
      </div>
      <Card className="mt-4 p-4"><h2 className="mb-3 font-semibold">Recent transactions</h2>
        {s.recent_orders.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet.</p> : (
          <ul className="divide-y divide-border text-sm">{s.recent_orders.map((o: any) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><div><p className="font-medium">{o.order_number}</p><p className="text-xs text-muted-foreground">{o.email} · {formatDate(o.created_at)}</p></div>
              <div className="flex items-center gap-2"><span className="font-semibold">{formatMoney(o.total, o.currency)}</span><Badge variant={statusVariant(o.status) as any}>{STATUS_LABEL[o.status as keyof typeof STATUS_LABEL]}</Badge></div></li>))}</ul>)}
      </Card>
    </>
  )
}
