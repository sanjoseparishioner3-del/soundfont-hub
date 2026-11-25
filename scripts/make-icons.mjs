// Generates PWA PNG icons (purple→blue gradient with white equaliser bars) with no dependencies.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]) }

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const bars = [[0.22, 0.38, 0.62], [0.36, 0.22, 0.78], [0.5, 0.14, 0.86], [0.64, 0.26, 0.74]] // x center, top, bottom (fractions)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size)
      let r = 91 + (47 - 91) * t, g = 61 + (128 - 61) * t, b = 245 + (237 - 245) * t
      for (const [cx, top, bot] of bars) {
        const dx = Math.abs(x / size - cx), w = 0.035
        if (dx < w && y / size > top && y / size < bot) { r = g = b = 255 }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
mkdirSync('public', { recursive: true })
writeFileSync('public/pwa-192.png', png(192))
writeFileSync('public/pwa-512.png', png(512))
console.log('icons written')
