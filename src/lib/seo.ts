import { useEffect } from 'react'

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  el.setAttribute('content', content)
}

/** Per-page title / description / Open Graph metadata. */
export function useSeo({ title, description, image }: { title: string; description?: string; image?: string | null }) {
  useEffect(() => {
    const full = title === 'SoundFont Hub' ? title : `${title} · SoundFont Hub`
    document.title = full
    setMeta('property', 'og:title', full)
    if (description) { setMeta('name', 'description', description.slice(0, 160)); setMeta('property', 'og:description', description.slice(0, 160)) }
    if (image) setMeta('property', 'og:image', image)
    setMeta('property', 'og:url', window.location.href)
  }, [title, description, image])
}
