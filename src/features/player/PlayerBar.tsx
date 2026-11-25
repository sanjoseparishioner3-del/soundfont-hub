import { Pause, Play, Repeat, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import WaveSurfer from 'wavesurfer.js'
import { Button } from '@/components/ui/button'
import { cn, formatDuration } from '@/lib/utils'
import { usePlayer } from './playerStore'

/** Persistent player (mounted once in the layout, so it keeps playing across routes). */
export function PlayerBar() {
  const s = usePlayer()
  const track = s.queue[s.index]
  const waveRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const url = track?.url

  useEffect(() => {
    if (!url || !waveRef.current) return
    // Waveform is bound to the shared <audio>; decoding is best-effort and never blocks playback.
    const ws = WaveSurfer.create({
      container: waveRef.current, media: s.audio, height: 36, barWidth: 2, barGap: 2, barRadius: 2,
      waveColor: 'rgba(120,110,160,.35)', progressColor: '#5b3df5', cursorWidth: 0, interact: true,
    })
    ws.on('error', () => { /* keep native seek bar fallback */ })
    wsRef.current = ws
    return () => { try { ws.destroy() } catch { /* noop */ } wsRef.current = null }
  }, [url, s.audio])

  if (!track) return null
  const pct = s.duration ? (s.currentTime / s.duration) * 100 : 0

  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 border-t border-border bg-card/95 backdrop-blur md:bottom-0" role="region" aria-label="Audio player">
      {/* mobile progress line */}
      <div className="h-0.5 w-full bg-border md:hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
      <div className="container flex items-center gap-3 py-2">
        <Link to={`/sounds/${track.productSlug}`} className="flex min-w-0 flex-1 items-center gap-3 md:w-64 md:flex-none">
          {track.artwork ? <img src={track.artwork} alt="" className="size-10 shrink-0 rounded-md object-cover" /> : <div className="size-10 shrink-0 rounded-md bg-accent" />}
          <div className="min-w-0"><p className="truncate text-sm font-medium">{track.title}</p><p className="truncate text-xs text-muted-foreground">{track.productName}</p></div>
        </Link>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="iconSm" className="hidden md:inline-flex" onClick={s.prev} aria-label="Previous"><SkipBack /></Button>
          <Button size="iconSm" className="rounded-full" onClick={s.toggle} aria-label={s.playing ? 'Pause' : 'Play'}>{s.playing ? <Pause /> : <Play />}</Button>
          <Button variant="ghost" size="iconSm" className="hidden md:inline-flex" onClick={s.next} aria-label="Next"><SkipForward /></Button>
        </div>

        <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{formatDuration(s.currentTime)}</span>
          <div ref={waveRef} className="min-w-0 flex-1" />
          <span className="w-10 text-xs tabular-nums text-muted-foreground">{formatDuration(s.duration)}</span>
        </div>

        <div className="hidden items-center gap-1 md:flex">
          <Button variant="ghost" size="iconSm" className={cn(s.repeat && 'text-primary')} onClick={s.toggleRepeat} aria-label="Repeat" aria-pressed={s.repeat}><Repeat /></Button>
          <Button variant="ghost" size="iconSm" onClick={s.toggleMute} aria-label={s.muted ? 'Unmute' : 'Mute'}>{s.muted || s.volume === 0 ? <VolumeX /> : <Volume2 />}</Button>
          <input type="range" min={0} max={1} step={0.01} value={s.muted ? 0 : s.volume} onChange={(e) => s.setVolume(Number(e.target.value))} aria-label="Volume" className="w-20 accent-primary" />
        </div>
        <Button variant="ghost" size="iconSm" onClick={s.stop} aria-label="Close player"><X /></Button>
      </div>
    </div>
  )
}
