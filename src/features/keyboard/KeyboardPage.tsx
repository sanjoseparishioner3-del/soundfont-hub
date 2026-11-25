import { Maximize2, Minimize2, Music4, Piano } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { Card } from '@/components/ui/misc'
import { useSeo } from '@/lib/seo'
import { cn } from '@/lib/utils'
import { createSynth, type Engine, type Timbre } from './synth'

const BLACK = new Set([1, 3, 6, 8, 10])
// computer keyboard → semitone offset from the base C
const KEYMAP: Record<string, number> = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 }
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export default function KeyboardPage() {
  useSeo({ title: 'Virtual Keyboard', description: 'Try sounds on a browser keyboard with computer keys, touch or a MIDI keyboard.' })
  const synth = useRef<(Engine & { ctx: AudioContext }) | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [octave, setOctave] = useState(3)
  const [timbre, setTimbre] = useState<Timbre>('piano')
  const [volume, setVolume] = useState(0.7)
  const [sustain, setSustain] = useState(false)
  const [active, setActive] = useState<Set<number>>(new Set())
  const [midi, setMidi] = useState<string[]>([])
  const [full, setFull] = useState(false)
  const octaveRef = useRef(octave); octaveRef.current = octave

  const engine = useCallback(() => (synth.current ??= createSynth()), [])
  const on = useCallback((n: number, v = 0.8) => { engine().noteOn(n, v); setActive((s) => new Set(s).add(n)) }, [engine])
  const off = useCallback((n: number) => { synth.current?.noteOff(n); setActive((s) => { const x = new Set(s); x.delete(n); return x }) }, [])

  useEffect(() => { synth.current?.setTimbre(timbre) }, [timbre])
  useEffect(() => { synth.current?.setVolume(volume) }, [volume])
  useEffect(() => { synth.current?.setSustain(sustain) }, [sustain])

  // computer keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || (e.target as HTMLElement)?.matches('input,select,textarea')) return
      if (e.code === 'Space') { e.preventDefault(); setSustain(true); return }
      if (e.key === 'z') return setOctave((o) => Math.max(0, o - 1))
      if (e.key === 'x') return setOctave((o) => Math.min(6, o + 1))
      const off = KEYMAP[e.key.toLowerCase()]
      if (off != null) on((octaveRef.current + 1) * 12 + off)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') return setSustain(false)
      const o = KEYMAP[e.key.toLowerCase()]
      if (o != null) off((octaveRef.current + 1) * 12 + o)
    }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [on, off])

  // Web MIDI (optional)
  useEffect(() => {
    if (!('requestMIDIAccess' in navigator)) return
    let access: MIDIAccess | undefined
    const handle = (e: MIDIMessageEvent) => {
      const [st, a, b] = e.data ?? []
      const cmd = st & 0xf0
      if (cmd === 0x90 && b > 0) on(a, b / 127)
      else if (cmd === 0x80 || (cmd === 0x90 && b === 0)) off(a)
      else if (cmd === 0xb0 && a === 64) setSustain(b >= 64)
    }
    const bind = () => {
      if (!access) return
      const names: string[] = []
      access.inputs.forEach((i) => { i.onmidimessage = handle; names.push(i.name ?? 'MIDI device') })
      setMidi(names)
    }
    navigator.requestMIDIAccess().then((a) => { access = a; bind(); a.onstatechange = bind }).catch(() => { /* permission denied or unsupported */ })
    return () => { if (access) { access.inputs.forEach((i) => (i.onmidimessage = null)); access.onstatechange = null } }
  }, [on, off])

  useEffect(() => () => { synth.current?.allOff(); void synth.current?.ctx.close() }, [])
  useEffect(() => {
    const h = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  const keys = useMemo(() => {
    const base = (octave + 1) * 12
    return Array.from({ length: 25 }, (_, i) => ({ note: base + i, black: BLACK.has(i % 12), label: NAMES[i % 12] }))
  }, [octave])
  const whites = keys.filter((k) => !k.black)
  const w = 100 / whites.length

  const press = (n: number) => (e: React.PointerEvent) => {
    e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    on(n, e.pressure && e.pointerType === 'pen' ? Math.max(0.2, e.pressure) : 0.8)
  }

  return (
    <div className="container max-w-5xl space-y-4 py-6">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Piano className="size-6 text-primary" />Virtual Keyboard</h1>
        <p className="text-sm text-muted-foreground">A browser synth for trying the feel of sounds. It does not play purchased SoundFonts — use the preview players on product pages to hear a SoundFont's actual samples.</p></div>
      <div ref={wrap} className={cn('space-y-4 rounded-xl', full && 'bg-background p-6')}>
        <Card className="flex flex-wrap items-end gap-4 p-4">
          <label className="text-sm">Instrument<Select className="mt-1 w-40" value={timbre} onChange={(e) => setTimbre(e.target.value as Timbre)}>
            <option value="piano">Piano-style</option><option value="epiano">Electric piano-style</option><option value="organ">Organ-style</option><option value="pad">Warm pad</option><option value="strings">Strings-style</option></Select></label>
          <div className="text-sm">Octave<div className="mt-1 flex items-center gap-2"><Button size="iconSm" variant="outline" aria-label="Octave down" onClick={() => setOctave((o) => Math.max(0, o - 1))}>−</Button><span className="w-6 text-center font-semibold">{octave}</span><Button size="iconSm" variant="outline" aria-label="Octave up" onClick={() => setOctave((o) => Math.min(6, o + 1))}>+</Button></div></div>
          <label className="text-sm">Volume<input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="mt-3 block w-32 accent-primary" /></label>
          <Button variant={sustain ? 'default' : 'outline'} aria-pressed={sustain} onClick={() => setSustain((s) => !s)}>Sustain</Button>
          <Button variant="outline" className="ml-auto" onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void wrap.current?.requestFullscreen())}>{full ? <Minimize2 /> : <Maximize2 />}{full ? 'Exit' : 'Fullscreen'}</Button>
        </Card>
        <div className="relative h-48 select-none overflow-hidden rounded-xl border border-border bg-muted sm:h-60" style={{ touchAction: 'none' }} role="group" aria-label="Piano keys">
          {whites.map((k, i) => (
            <button key={k.note} onPointerDown={press(k.note)} onPointerUp={() => off(k.note)} onPointerLeave={() => active.has(k.note) && off(k.note)} onPointerCancel={() => off(k.note)}
              aria-label={`${k.label}${Math.floor(k.note / 12) - 1}`} style={{ left: `${i * w}%`, width: `${w}%` }}
              className={cn('absolute inset-y-0 border-r border-border bg-white pb-2 text-[10px] text-muted-foreground transition-colors last:border-r-0 flex items-end justify-center', active.has(k.note) && 'bg-accent')}>{k.label === 'C' ? `C${Math.floor(k.note / 12) - 1}` : ''}</button>))}
          {keys.map((k) => {
            if (!k.black) return null
            const prevWhites = keys.filter((x) => !x.black && x.note < k.note).length
            return <button key={k.note} onPointerDown={press(k.note)} onPointerUp={() => off(k.note)} onPointerLeave={() => active.has(k.note) && off(k.note)} onPointerCancel={() => off(k.note)}
              aria-label={`${k.label}${Math.floor(k.note / 12) - 1}`} style={{ left: `${prevWhites * w - w * 0.3}%`, width: `${w * 0.6}%` }}
              className={cn('absolute top-0 z-10 h-3/5 rounded-b-md bg-navy transition-colors', active.has(k.note) && 'bg-primary')} />
          })}
        </div>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>Keys: A–; (white), W E T Y U O P (black) · Z/X octave · Space sustain</span>
          <span className="inline-flex items-center gap-1"><Music4 className="size-3.5" />{'requestMIDIAccess' in navigator ? (midi.length ? `MIDI: ${midi.join(', ')}` : 'No MIDI keyboard detected') : 'Web MIDI not supported in this browser'}</span></p>
      </div>
    </div>
  )
}
