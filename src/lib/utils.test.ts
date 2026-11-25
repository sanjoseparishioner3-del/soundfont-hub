import { describe, expect, it } from 'vitest'
import { formatBytes, formatDuration, formatMoney, normalizeReference, slugify, toEmbedUrl } from './utils'

describe('utils', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('—')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
  it('formats money per currency', () => {
    expect(formatMoney(10, 'USD')).toContain('10.00')
    expect(formatMoney(499, 'PHP')).toContain('499.00')
  })
  it('formats duration', () => expect(formatDuration(125)).toBe('2:05'))
  it('slugifies', () => expect(slugify('  Grand Piano — Vol. 2! ')).toBe('grand-piano-vol-2'))
  it('normalizes payment references so duplicates cannot hide behind spacing/case', () => {
    expect(normalizeReference(' 1234 abc 567 ')).toBe('1234ABC567')
  })
  it('only embeds trusted video hosts', () => {
    expect(toEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(toEmbedUrl('https://evil.example/video')).toBeNull()
    expect(toEmbedUrl('javascript:alert(1)')).toBeNull()
  })
})
