// Run at build/deploy time: node scripts/generate-sitemap.mjs  (needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SITE_URL)
import { writeFileSync } from 'node:fs'

const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key, VITE_SITE_URL: site = 'https://soundfonthub.pages.dev' } = process.env
if (!url || !key) { console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'); process.exit(1) }

const get = async (path) => (await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })).json()
const [sounds, bundles, tutorials] = await Promise.all([
  get('soundfonts?select=slug,updated_at&is_published=eq.true'), get('bundles?select=slug&is_published=eq.true'), get('tutorials?select=slug&is_published=eq.true'),
])
const urls = [['/', null], ['/explore', null], ['/bundles', null], ['/learn', null], ['/keyboard', null],
  ...sounds.map((s) => [`/sounds/${s.slug}`, s.updated_at]), ...bundles.map((b) => [`/bundles/${b.slug}`, null]), ...tutorials.map((t) => [`/learn/${t.slug}`, null])]
writeFileSync('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, d]) => `  <url><loc>${site}${p}</loc>${d ? `<lastmod>${d.slice(0, 10)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`)
console.log(`sitemap.xml: ${urls.length} URLs`)
