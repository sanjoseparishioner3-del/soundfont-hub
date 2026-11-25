import { describe, expect, it } from 'vitest'
import { sha256File } from './sha256'

describe('sha256File', () => {
  it('matches known vectors', async () => {
    expect(await sha256File(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await sha256File(new Blob(['']))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
  it('handles inputs longer than one block', async () => {
    const text = 'a'.repeat(1000)
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    const expected = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
    expect(await sha256File(new Blob([text]))).toBe(expected)
  })
})
