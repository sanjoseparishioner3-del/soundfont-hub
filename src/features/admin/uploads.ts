import { supabase } from '@/lib/supabase'
import { sha256File } from '@/lib/sha256'

const PART_SIZE = 16 * 1024 * 1024
const CONCURRENCY = 3
const MAX_RETRIES = 3

export type UploadPhase = 'queued' | 'validating' | 'hashing' | 'uploading' | 'finalizing' | 'done' | 'error' | 'cancelled'
export interface UploadTask {
  id: string
  file: File
  kind: 'sf2' | 'zip'
  phase: UploadPhase
  progress: number // 0..1 of current phase
  error?: string
  sha256?: string
  key?: string
  uploadId?: string
  parts: { partNumber: number; etag: string }[]
  abort: AbortController
}

const ascii = (b: Uint8Array, s: number, e: number) => String.fromCharCode(...b.slice(s, e))

/** Verify real content type from magic bytes, never from the extension alone. */
export async function sniffKind(file: File): Promise<'sf2' | 'zip' | 'mp3' | 'wav' | 'ogg' | 'png' | 'jpg' | 'webp' | null> {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'sfbk') return 'sf2'
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE') return 'wav'
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5)) return 'zip'
  if (ascii(b, 0, 4) === 'OggS') return 'ogg'
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3'
  if (b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return 'png'
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg'
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'webp'
  return null
}

async function call<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('r2-upload', { body })
  if (error) {
    let msg = error.message
    try { msg = (await (error as any).context.json()).error ?? msg } catch { /* noop */ }
    throw new Error(msg)
  }
  return data as T
}

function putPart(url: string, blob: Blob, signal: AbortSignal, onProgress: (loaded: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.upload.onprogress = (e) => onProgress(e.loaded)
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve((xhr.getResponseHeader('ETag') ?? '').replace(/"/g, ''))
      : reject(new Error(`Storage responded ${xhr.status}`)))
    xhr.onerror = () => reject(new Error('Network error during upload'))
    signal.addEventListener('abort', () => { xhr.abort(); reject(new DOMException('Cancelled', 'AbortError')) })
    xhr.send(blob)
  })
}

/** Runs (or resumes) a task. Completed parts are kept, so Retry resumes where it stopped. */
export async function runUpload(task: UploadTask, soundfontId: string, version: string, notify: () => void) {
  const set = (p: Partial<UploadTask>) => { Object.assign(task, p); notify() }
  try {
    task.abort = new AbortController()
    if (!task.sha256) {
      set({ phase: 'validating', progress: 0, error: undefined })
      const sniffed = await sniffKind(task.file)
      if (sniffed !== task.kind) throw new Error(`File content is not a valid ${task.kind.toUpperCase()} (detected: ${sniffed ?? 'unknown'}).`)
      if (task.file.size > 2 * 1024 ** 3) throw new Error('File exceeds the 2 GB limit.')
      set({ phase: 'hashing' })
      const sha = await sha256File(task.file, (p) => set({ progress: p }))
      const dup = await supabase.from('soundfont_files').select('id, soundfonts(name)').eq('sha256', sha).limit(1)
      if (dup.data?.length) throw new Error(`Duplicate detected: identical file already attached to "${(dup.data[0] as any).soundfonts?.name}".`)
      set({ sha256: sha })
    }
    set({ phase: 'uploading', progress: 0 })
    if (!task.uploadId) {
      const init = await call<{ key: string; uploadId: string }>({ action: 'init', kind: task.kind, size: task.file.size })
      set({ key: init.key, uploadId: init.uploadId, parts: [] })
    }
    const total = Math.ceil(task.file.size / PART_SIZE)
    const done = new Map(task.parts.map((p) => [p.partNumber, p.etag]))
    const loaded = new Map<number, number>()
    done.forEach((_, n) => loaded.set(n, Math.min(PART_SIZE, task.file.size - (n - 1) * PART_SIZE)))
    const report = () => set({ progress: [...loaded.values()].reduce((a, b) => a + b, 0) / task.file.size })
    const pending = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !done.has(n))

    const worker = async () => {
      for (let n = pending.shift(); n; n = pending.shift()) {
        const blob = task.file.slice((n - 1) * PART_SIZE, n * PART_SIZE)
        for (let attempt = 1; ; attempt++) {
          try {
            const { url } = await call<{ url: string }>({ action: 'part', key: task.key, uploadId: task.uploadId, partNumber: n })
            const etag = await putPart(url, blob, task.abort.signal, (l) => { loaded.set(n, l); report() })
            if (!etag) throw new Error('Missing ETag â€“ check R2 CORS exposes the ETag header.')
            task.parts.push({ partNumber: n, etag }); loaded.set(n, blob.size); report()
            break
          } catch (e) {
            if ((e as Error).name === 'AbortError' || attempt >= MAX_RETRIES) throw e
            await new Promise((r) => setTimeout(r, 800 * attempt))
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker))

    set({ phase: 'finalizing', progress: 1 })
    await call({ action: 'complete', key: task.key, uploadId: task.uploadId, parts: [...task.parts].sort((a, b) => a.partNumber - b.partNumber) })
    await call({ action: 'register', key: task.key, soundfontId, fileName: task.file.name, sha256: task.sha256, version })
    set({ phase: 'done' })
  } catch (e) {
    if ((e as Error).name === 'AbortError') return set({ phase: 'cancelled' })
    set({ phase: 'error', error: (e as Error).message })
  }
}

export async function cancelUpload(task: UploadTask) {
  task.abort.abort()
  if (task.key && task.uploadId && task.phase !== 'done') { try { await call({ action: 'abort', key: task.key, uploadId: task.uploadId }) } catch { /* best effort */ } }
}

/** Small public assets (covers, demos, QR codes, logos) â†’ Supabase Storage with real-format validation. */
export async function uploadPublic(bucket: 'covers' | 'previews' | 'site', file: File, allowed: ('png' | 'jpg' | 'webp' | 'mp3' | 'wav' | 'ogg')[], folder = ''): Promise<string> {
  const kind = await sniffKind(file)
  if (!kind || !(allowed as string[]).includes(kind)) throw new Error(`Unsupported file. Allowed: ${allowed.join(', ')}`)
  const max = bucket === 'previews' ? 30 : 5
  if (file.size > max * 1024 * 1024) throw new Error(`File must be under ${max} MB`)
  const ext = kind === 'jpg' ? 'jpg' : kind
  const path = `${folder ? folder + '/' : ''}${crypto.randomUUID()}.${ext}`
  const contentType = ({ png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' } as Record<string, string>)[kind]
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType, cacheControl: '31536000' })
  if (error) throw new Error(error.message)
  return path
}

/** Read audio duration in the browser. */
export function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const a = new Audio(); const url = URL.createObjectURL(file)
    a.onloadedmetadata = () => { resolve(Number.isFinite(a.duration) ? Math.round(a.duration * 100) / 100 : null); URL.revokeObjectURL(url) }
    a.onerror = () => { resolve(null); URL.revokeObjectURL(url) }
    a.src = url
  })
}
