// Admin-only multipart upload broker for private Cloudflare R2.
// Actions: init -> part (presigned URL per chunk, individually retryable/resumable) -> complete | abort,
// then `register` verifies the real file signature (magic bytes) and stores metadata + SHA-256.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'
import { corsHeaders, json, rateLimit } from '../_shared/cors.ts'

const MAX_BYTES = 2 * 1024 * 1024 * 1024 // 2 GB per object
const account = Deno.env.get('R2_ACCOUNT_ID')!
const bucket = Deno.env.get('R2_BUCKET')!
const r2 = new AwsClient({
  accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
  secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
  service: 's3',
  region: 'auto',
})
const objUrl = (key: string) => `https://${account}.r2.cloudflarestorage.com/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)
  if (!rateLimit(`up:${authHeader.slice(-16)}`, 600, 60_000)) return json({ error: 'Too many requests' }, 429)

  let b: any
  try { b = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  try {
    switch (b.action) {
      case 'init': {
        const kind = b.kind === 'zip' ? 'zip' : 'sf2'
        const size = Number(b.size)
        if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) return json({ error: 'Invalid file size' }, 400)
        const key = `soundfonts/${crypto.randomUUID()}.${kind}`
        const res = await r2.fetch(`${objUrl(key)}?uploads`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' } })
        if (!res.ok) return json({ error: 'Storage rejected upload' }, 502)
        const uploadId = /<UploadId>(.+?)<\/UploadId>/.exec(await res.text())?.[1]
        if (!uploadId) return json({ error: 'Storage error' }, 502)
        return json({ key, uploadId })
      }
      case 'part': {
        const n = Number(b.partNumber)
        if (!b.key?.startsWith('soundfonts/') || !b.uploadId || !(n >= 1 && n <= 10000)) return json({ error: 'Invalid' }, 400)
        const url = new URL(objUrl(b.key))
        url.searchParams.set('partNumber', String(n))
        url.searchParams.set('uploadId', b.uploadId)
        url.searchParams.set('X-Amz-Expires', '900')
        const signed = await r2.sign(new Request(url, { method: 'PUT' }), { aws: { signQuery: true } })
        return json({ url: signed.url })
      }
      case 'complete': {
        if (!b.key?.startsWith('soundfonts/') || !Array.isArray(b.parts)) return json({ error: 'Invalid' }, 400)
        const xml = '<CompleteMultipartUpload>' + b.parts
          .map((p: { partNumber: number; etag: string }) => `<Part><PartNumber>${Number(p.partNumber)}</PartNumber><ETag>${String(p.etag).replace(/[<>&]/g, '')}</ETag></Part>`)
          .join('') + '</CompleteMultipartUpload>'
        const res = await r2.fetch(`${objUrl(b.key)}?uploadId=${encodeURIComponent(b.uploadId)}`, { method: 'POST', body: xml })
        if (!res.ok) return json({ error: 'Could not finalise upload' }, 502)
        return json({ ok: true })
      }
      case 'abort': {
        if (!b.key?.startsWith('soundfonts/')) return json({ error: 'Invalid' }, 400)
        await r2.fetch(`${objUrl(b.key)}?uploadId=${encodeURIComponent(b.uploadId)}`, { method: 'DELETE' })
        return json({ ok: true })
      }
      case 'register': {
        // Verify real file type by magic bytes, confirm size, then insert metadata (RLS: admin only).
        const key: string = b.key
        if (!key?.startsWith('soundfonts/')) return json({ error: 'Invalid' }, 400)
        const head = await r2.fetch(objUrl(key), { method: 'GET', headers: { Range: 'bytes=0-11' } })
        if (!head.ok) return json({ error: 'Uploaded object not found' }, 404)
        const bytes = new Uint8Array(await head.arrayBuffer())
        const ascii = (s: number, e: number) => String.fromCharCode(...bytes.slice(s, e))
        const isSf2 = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'sfbk'
        const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5)
        const expected = key.endsWith('.zip') ? isZip : isSf2
        if (!expected) {
          await r2.fetch(objUrl(key), { method: 'DELETE' })
          return json({ error: 'File content does not match a valid SF2/ZIP file. Upload removed.' }, 422)
        }
        const size = Number((await r2.fetch(objUrl(key), { method: 'HEAD' })).headers.get('content-length'))
        if (!size) return json({ error: 'Could not read object size' }, 502)
        const { error } = await supabase.from('soundfont_files').insert({
          soundfont_id: b.soundfontId, storage_provider: 'r2', object_key: key, file_name: String(b.fileName).slice(0, 200),
          kind: key.endsWith('.zip') ? 'zip' : 'sf2', size_bytes: size, sha256: String(b.sha256).toLowerCase(), version: b.version ?? '1.0.0',
        })
        if (error) {
          await r2.fetch(objUrl(key), { method: 'DELETE' })
          return json({ error: error.code === '23505' ? 'Duplicate file detected (same checksum already attached).' : error.message }, 409)
        }
        return json({ ok: true, size })
      }
      default:
        return json({ error: 'Unknown action' }, 400)
    }
  } catch (e) {
    console.error(e)
    return json({ error: 'Upload service error' }, 500)
  }
})
