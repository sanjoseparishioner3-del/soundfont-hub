const origin = Deno.env.get('ALLOWED_ORIGIN') ?? '*'

export const corsHeaders = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

/** Tiny in-memory limiter (per isolate). Real enforcement of download volume lives in the DB (authorize_download). */
const hits = new Map<string, number[]>()
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (arr.length >= max) return false
  arr.push(now)
  hits.set(key, arr)
  return true
}
