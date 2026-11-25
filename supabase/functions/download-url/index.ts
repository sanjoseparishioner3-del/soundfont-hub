// Returns a short-lived signed URL for a SoundFont file the caller is entitled to.
// Entitlement is decided by the database (authorize_download) using the caller's JWT – never by the frontend.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'
import { corsHeaders, json, rateLimit } from '../_shared/cors.ts'

const EXPIRES_SECONDS = 120

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Please sign in first' }, 401)

  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  if (!rateLimit(`dl:${ip}`, 30, 60_000)) return json({ error: 'Too many requests' }, 429)

  let body: { soundfontId?: string; fileId?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const uuid = /^[0-9a-f-]{36}$/i
  if (!body.soundfontId || !uuid.test(body.soundfontId) || (body.fileId && !uuid.test(body.fileId))) {
    return json({ error: 'Invalid request' }, 400)
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data, error } = await supabase.rpc('authorize_download', {
    p_soundfont: body.soundfontId,
    p_file: body.fileId ?? null,
    p_ip: ip,
    p_ua: req.headers.get('user-agent'),
  })
  if (error) return json({ error: error.message }, error.message.includes('Purchase required') ? 403 : 400)
  const file = Array.isArray(data) ? data[0] : data
  if (!file) return json({ error: 'File not available' }, 404)

  const safeName = String(file.file_name).replace(/[^\w.\- ]+/g, '_')

  if (file.storage_provider === 'supabase') {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: signed, error: e } = await admin.storage.from('soundfonts').createSignedUrl(file.object_key, EXPIRES_SECONDS, { download: safeName })
    if (e) return json({ error: 'Could not sign URL' }, 500)
    return json({ url: signed.signedUrl, fileName: safeName, expiresIn: EXPIRES_SECONDS })
  }

  const account = Deno.env.get('R2_ACCOUNT_ID')!
  const bucket = Deno.env.get('R2_BUCKET')!
  const r2 = new AwsClient({
    accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
    service: 's3',
    region: 'auto',
  })
  const url = new URL(`https://${account}.r2.cloudflarestorage.com/${bucket}/${file.object_key}`)
  url.searchParams.set('X-Amz-Expires', String(EXPIRES_SECONDS))
  url.searchParams.set('response-content-disposition', `attachment; filename="${safeName}"`)
  const signed = await r2.sign(new Request(url, { method: 'GET' }), { aws: { signQuery: true } })
  return json({ url: signed.url, fileName: safeName, expiresIn: EXPIRES_SECONDS })
})
