import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase, unwrap } from '@/lib/supabase'

/** Set of soundfont ids the user owns (free claimed or purchased). */
export function useLibraryIds() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['library-ids', user?.id],
    enabled: !!user,
    queryFn: async () => new Set(unwrap(await supabase.from('customer_library').select('soundfont_id'))!.map((r: any) => r.soundfont_id as string)),
  })
}

export function useFavorites() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['favorites', user?.id],
    enabled: !!user,
    queryFn: async () => new Set(unwrap(await supabase.from('favorites').select('soundfont_id'))!.map((r: any) => r.soundfont_id as string)),
  })
  const toggle = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Sign in to save favorites')
      if (q.data?.has(id)) unwrap(await supabase.from('favorites').delete().eq('soundfont_id', id).eq('user_id', user.id))
      else unwrap(await supabase.from('favorites').insert({ soundfont_id: id, user_id: user.id }))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
    onError: (e: Error) => toast.error(e.message),
  })
  return { ids: q.data ?? new Set<string>(), toggle: (id: string) => toggle.mutate(id) }
}

export function useCart() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['cart', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await supabase.from('cart_items')
        .select('id, soundfont_id, bundle_id, soundfonts(id, slug, name, cover_path, price_php, price_usd, file_size_bytes), bundles(id, slug, name, cover_path, price_php, price_usd)')
        .order('created_at')
      return unwrap(res) as any[]
    },
  })
  const add = useMutation({
    mutationFn: async (arg: { soundfontId?: string; bundleId?: string }) =>
      unwrap(await supabase.rpc('add_to_cart', { p_soundfont: arg.soundfontId ?? null, p_bundle: arg.bundleId ?? null })),
    onSuccess: () => { toast.success('Added to cart'); qc.invalidateQueries({ queryKey: ['cart'] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('cart_items').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }),
    onError: (e: Error) => toast.error(e.message),
  })
  return { items: q.data ?? [], isLoading: q.isLoading, add: add.mutate, adding: add.isPending, remove: remove.mutate }
}

export function useDownload() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (arg: { soundfontId: string; fileId?: string }) => {
      const { data, error } = await supabase.functions.invoke('download-url', { body: arg })
      if (error) {
        let msg = error.message
        try { msg = (await (error as any).context.json()).error ?? msg } catch { /* noop */ }
        throw new Error(msg)
      }
      // Signed URL is short-lived and used immediately; it is never stored or cached.
      const a = document.createElement('a')
      a.href = data.url; a.rel = 'noopener'; a.download = data.fileName
      document.body.appendChild(a); a.click(); a.remove()
    },
    onSuccess: () => { toast.success('Download started'); qc.invalidateQueries({ queryKey: ['library'] }); qc.invalidateQueries({ queryKey: ['library-ids'] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useClaimFree() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.rpc('claim_free', { p_soundfont: id })),
    onSuccess: () => { toast.success('Added to your library'); qc.invalidateQueries({ queryKey: ['library'] }); qc.invalidateQueries({ queryKey: ['library-ids'] }) },
    onError: (e: Error) => toast.error(e.message),
  })
}
