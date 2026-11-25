import { create } from 'zustand'

export interface Track {
  id: string
  title: string
  productName: string
  productSlug: string
  artwork: string | null
  url: string
}

interface PlayerState {
  queue: Track[]
  index: number
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  repeat: boolean
  /** One shared <audio> element → only one preview can ever play at a time and it survives route changes. */
  audio: HTMLAudioElement
  playQueue: (tracks: Track[], startId?: string) => void
  toggle: () => void
  toggleTrack: (tracks: Track[], id: string) => void
  next: () => void
  prev: () => void
  seek: (t: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  toggleRepeat: () => void
  stop: () => void
}

const audio = typeof Audio !== 'undefined' ? new Audio() : (null as unknown as HTMLAudioElement)
if (audio) { audio.preload = 'metadata'; audio.crossOrigin = 'anonymous' }

export const usePlayer = create<PlayerState>((set, get) => {
  const load = (i: number) => {
    const t = get().queue[i]
    if (!t) return
    audio.src = t.url
    set({ index: i, currentTime: 0, duration: 0 })
    audio.play().then(() => set({ playing: true })).catch(() => set({ playing: false }))
  }

  if (audio) {
    audio.addEventListener('timeupdate', () => set({ currentTime: audio.currentTime }))
    audio.addEventListener('durationchange', () => set({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 }))
    audio.addEventListener('play', () => set({ playing: true }))
    audio.addEventListener('pause', () => set({ playing: false }))
    audio.addEventListener('ended', () => {
      const { index, queue, repeat } = get()
      if (index < queue.length - 1) load(index + 1)
      else if (repeat) load(0)
      else set({ playing: false })
    })
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('previoustrack', () => get().prev())
      navigator.mediaSession.setActionHandler('nexttrack', () => get().next())
    }
  }

  return {
    queue: [], index: 0, playing: false, currentTime: 0, duration: 0, volume: 0.9, muted: false, repeat: false, audio,
    playQueue: (tracks, startId) => {
      const i = Math.max(0, startId ? tracks.findIndex((t) => t.id === startId) : 0)
      set({ queue: tracks })
      load(i)
      const t = tracks[i]
      if (t && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: t.title, artist: t.productName, artwork: t.artwork ? [{ src: t.artwork }] : [],
        })
      }
    },
    toggle: () => { if (!audio.src) return; audio.paused ? void audio.play() : audio.pause() },
    toggleTrack: (tracks, id) => {
      const cur = get().queue[get().index]
      if (cur?.id === id) get().toggle()
      else get().playQueue(tracks, id)
    },
    next: () => { const { index, queue } = get(); if (index < queue.length - 1) load(index + 1) },
    prev: () => {
      const { index } = get()
      if (audio.currentTime > 3 || index === 0) { audio.currentTime = 0 } else load(index - 1)
    },
    seek: (t) => { audio.currentTime = t },
    setVolume: (v) => { audio.volume = v; audio.muted = false; set({ volume: v, muted: false }) },
    toggleMute: () => { audio.muted = !audio.muted; set({ muted: audio.muted }) },
    toggleRepeat: () => { set({ repeat: !get().repeat }); audio.loop = !audio.loop && get().queue.length <= 1 },
    stop: () => { audio.pause(); audio.removeAttribute('src'); set({ queue: [], index: 0, playing: false, currentTime: 0, duration: 0 }) },
  }
})
