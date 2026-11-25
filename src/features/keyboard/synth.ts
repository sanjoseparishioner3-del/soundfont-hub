/**
 * Lightweight Web Audio synth used by the demo keyboard.
 *
 * It is intentionally independent of any premium SF2 file: premium SoundFonts are never sent to the browser
 * before purchase. To audition real SF2 samples, plug a SoundFont engine behind the `Engine` interface using
 * *authorised demo-only* sample sets (see README → "Virtual keyboard").
 */
export type Timbre = 'piano' | 'epiano' | 'organ' | 'pad' | 'strings'

export interface Engine {
  noteOn(note: number, velocity: number): void
  noteOff(note: number): void
  setSustain(on: boolean): void
  setVolume(v: number): void
  setTimbre(t: Timbre): void
  allOff(): void
}

const PRESETS: Record<Timbre, { partials: number[]; type: OscillatorType; attack: number; decay: number; sustain: number; release: number }> = {
  piano: { partials: [1, 2, 3, 4], type: 'triangle', attack: 0.004, decay: 1.6, sustain: 0.0001, release: 0.35 },
  epiano: { partials: [1, 2, 4], type: 'sine', attack: 0.005, decay: 1.2, sustain: 0.05, release: 0.4 },
  organ: { partials: [1, 2, 3], type: 'sine', attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.08 },
  pad: { partials: [1, 1.005], type: 'sawtooth', attack: 0.5, decay: 0.8, sustain: 0.6, release: 1.2 },
  strings: { partials: [1, 1.004, 2], type: 'sawtooth', attack: 0.25, decay: 0.4, sustain: 0.7, release: 0.6 },
}

interface Voice { gain: GainNode; oscs: OscillatorNode[]; releasing: boolean; stopAt: number }

export function createSynth(): Engine & { ctx: AudioContext } {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  const master = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'; filter.frequency.value = 5000
  master.gain.value = 0.6
  master.connect(filter).connect(ctx.destination)

  let timbre: Timbre = 'piano'
  let sustain = false
  const voices = new Map<number, Voice>()
  const held = new Set<number>()
  const sustained = new Set<number>()

  const freq = (n: number) => 440 * 2 ** ((n - 69) / 12)

  function release(note: number) {
    const v = voices.get(note)
    if (!v || v.releasing) return
    const p = PRESETS[timbre]
    const t = ctx.currentTime
    v.releasing = true
    v.gain.gain.cancelScheduledValues(t)
    v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), t)
    v.gain.gain.exponentialRampToValueAtTime(0.0001, t + p.release)
    v.oscs.forEach((o) => o.stop(t + p.release + 0.05))
    voices.delete(note)
  }

  return {
    ctx,
    noteOn(note, velocity) {
      void ctx.resume()
      release(note)
      const p = PRESETS[timbre]
      const t = ctx.currentTime
      const g = ctx.createGain()
      const peak = Math.max(0.05, Math.min(1, velocity)) * 0.5
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(peak, t + p.attack)
      g.gain.exponentialRampToValueAtTime(Math.max(peak * p.sustain, 0.0001), t + p.attack + p.decay)
      g.connect(master)
      const oscs = p.partials.map((mult, i) => {
        const o = ctx.createOscillator()
        o.type = p.type
        o.frequency.value = freq(note) * mult
        const pg = ctx.createGain(); pg.gain.value = 1 / (i + 1.2)
        o.connect(pg).connect(g); o.start(t)
        return o
      })
      voices.set(note, { gain: g, oscs, releasing: false, stopAt: 0 })
      held.add(note); sustained.delete(note)
    },
    noteOff(note) {
      held.delete(note)
      if (sustain) { sustained.add(note); return }
      release(note)
    },
    setSustain(on) {
      sustain = on
      if (!on) { sustained.forEach((n) => { if (!held.has(n)) release(n) }); sustained.clear() }
    },
    setVolume(v) { master.gain.value = v * 0.8 },
    setTimbre(t) { timbre = t },
    allOff() { [...voices.keys()].forEach(release); held.clear(); sustained.clear() },
  }
}
