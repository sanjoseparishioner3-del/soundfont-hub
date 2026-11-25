import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type SiteSettings = Record<string, any>

/** All public settings, loaded from the database (cached offline by the service worker). */
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SiteSettings> => {
      const { data, error } = await supabase.from('system_settings').select('key, value').eq('is_public', true)
      if (error) throw new Error(error.message)
      return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]))
    },
  })
}
