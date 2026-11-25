import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/form'
import { EmptyState, ErrorState, Pagination, Skeleton } from '@/components/ui/misc'
import { supabase } from '@/lib/supabase'

export interface Column<T> { header: string; cell: (row: T) => ReactNode; className?: string }

export function PageHeader({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{title}</h1><div className="flex flex-wrap items-center gap-2">{actions}</div></div>{children}</div>
  )
}

export function DataTable<T extends { id?: string | number }>({ columns, rows, loading, error, retry, empty = 'Nothing here yet.' }: {
  columns: Column<T>[]; rows: T[] | undefined; loading?: boolean; error?: unknown; retry?: () => void; empty?: string
}) {
  if (loading) return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
  if (error) return <ErrorState error={error} retry={retry} />
  if (!rows?.length) return <EmptyState title={empty} />
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr>{columns.map((c) => <th key={c.header} scope="col" className={`px-3 py-2.5 font-medium ${c.className ?? ''}`}>{c.header}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{rows.map((r, i) => <tr key={r.id ?? i} className="hover:bg-muted/40">{columns.map((c) => <td key={c.header} className={`px-3 py-2.5 align-middle ${c.className ?? ''}`}>{c.cell(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [local, setLocal] = useState(value)
  useEffect(() => { const t = setTimeout(() => onChange(local), 300); return () => clearTimeout(t) }, [local]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="w-56 pl-9" value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></div>
}

/** Server-paginated, searchable list of any table. */
export function useAdminList<T>(opts: {
  key: string; table: string; select?: string; searchColumns?: string[]; order?: [string, boolean]; pageSize?: number
  filters?: Record<string, string | boolean | undefined>
}) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const pageSize = opts.pageSize ?? 15
  const q = useQuery({
    queryKey: ['admin', opts.key, page, search, opts.filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from(opts.table).select(opts.select ?? '*', { count: 'exact' })
      for (const [k, v] of Object.entries(opts.filters ?? {})) if (v !== undefined && v !== '') query = query.eq(k, v)
      if (search.trim() && opts.searchColumns?.length) {
        const term = search.trim().replace(/[%,()]/g, ' ')
        query = query.or(opts.searchColumns.map((c) => `${c}.ilike.%${term}%`).join(','))
      }
      const [col, asc] = opts.order ?? ['created_at', false]
      const { data, error, count } = await query.order(col, { ascending: asc }).range((page - 1) * pageSize, page * pageSize - 1)
      if (error) throw new Error(error.message)
      return { rows: (data ?? []) as unknown as T[], count: count ?? 0 }
    },
  })
  return {
    ...q, rows: q.data?.rows, count: q.data?.count ?? 0, page, pageSize,
    setSearch: (s: string) => { setSearch(s); setPage(1) }, search,
    pager: <Pagination page={page} pageSize={pageSize} total={q.data?.count ?? 0} onChange={setPage} />,
  }
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
}
