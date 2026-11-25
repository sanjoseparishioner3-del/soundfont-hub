import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anon)

// Only the public anon key is ever used in the browser. Authorization is enforced by RLS + RPCs.
export const supabase = createClient(url ?? 'http://localhost:54321', anon ?? 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const publicUrl = (bucket: 'covers' | 'previews' | 'site', path: string | null | undefined): string | null =>
  path ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : null

/** Throws a readable error from a Supabase response. */
export function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}
