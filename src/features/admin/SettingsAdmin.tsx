import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Card, Skeleton, Switch } from '@/components/ui/misc'
import { publicUrl, supabase, unwrap } from '@/lib/supabase'
import type { PaymentMethod } from '@/types/db'
import { PageHeader } from './components'
import { uploadPublic } from './uploads'

function MethodCard({ m }: { m: PaymentMethod }) {
  const qc = useQueryClient()
  const [v, setV] = useState(m)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    const { error } = await supabase.from('payment_methods').update({ display_name: v.display_name, destination: v.destination || null, account_name: v.account_name || null, instructions: v.instructions, currency: v.currency, is_enabled: v.is_enabled, qr_path: v.qr_path }).eq('id', m.id)
    setBusy(false)
    if (error) return void toast.error(error.message)
    toast.success('Saved'); qc.invalidateQueries({ queryKey: ['admin'] }); qc.invalidateQueries({ queryKey: ['payment-methods'] })
  }
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between"><h2 className="font-semibold">{m.provider === 'gcash' ? 'GCash' : 'PayPal'}</h2><label className="flex items-center gap-2 text-sm"><Switch label="Enabled" checked={v.is_enabled} onChange={(x) => setV({ ...v, is_enabled: x })} />Enabled</label></div>
      <Field label="Display name"><Input value={v.display_name} onChange={(e) => setV({ ...v, display_name: e.target.value })} /></Field>
      <Field label="Payment destination" hint="GCash number, PayPal.me link or PayPal email"><Input value={v.destination ?? ''} onChange={(e) => setV({ ...v, destination: e.target.value })} /></Field>
      <Field label="Account name"><Input value={v.account_name ?? ''} onChange={(e) => setV({ ...v, account_name: e.target.value })} /></Field>
      <Field label="Currency"><Select value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value as 'PHP' | 'USD' })}><option value="PHP">PHP</option><option value="USD">USD</option></Select></Field>
      <Field label="Payment instructions"><Textarea value={v.instructions} onChange={(e) => setV({ ...v, instructions: e.target.value })} /></Field>
      <Field label="QR code image">
        <div className="flex items-center gap-3">{v.qr_path && <img src={publicUrl('site', v.qr_path)!} alt="QR" className="size-20 rounded border border-border bg-white object-contain" />}
          <Input type="file" accept="image/png,image/jpeg,image/webp" className="h-auto py-2" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setV({ ...v, qr_path: await uploadPublic('site', f, ['png', 'jpg', 'webp'], 'qr') }) } catch (err) { toast.error((err as Error).message) } }} /></div></Field>
      <p className="text-xs text-muted-foreground">Use only payment accounts you are authorised to operate. Save to apply.</p>
      <Button loading={busy} onClick={save}>Save {m.provider === 'gcash' ? 'GCash' : 'PayPal'}</Button>
    </Card>
  )
}

export function PaymentSettingsAdmin() {
  const q = useQuery({ queryKey: ['admin', 'methods'], queryFn: async () => unwrap(await supabase.from('payment_methods').select('*').order('provider')) as PaymentMethod[] })
  return (<><PageHeader title="Payment settings" />{q.isLoading ? <Skeleton className="h-64" /> : <div className="grid gap-4 lg:grid-cols-2">{q.data?.map((m) => <MethodCard key={m.id} m={m} />)}</div>}</>)
}

const TEXT_KEYS = [['terms', 'Terms and Conditions'], ['privacy', 'Privacy Policy'], ['refund_policy', 'Refund Policy'], ['license', 'Digital Product License']] as const

export function SystemSettingsAdmin() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: async () => Object.fromEntries(unwrap(await supabase.from('system_settings').select('key,value'))!.map((r: any) => [r.key, r.value])) as Record<string, any> })
  const [s, setS] = useState<Record<string, any>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (q.data) setS(q.data) }, [q.data])
  if (q.isLoading) return <Skeleton className="h-64" />
  const set = (k: string, v: unknown) => setS((p) => ({ ...p, [k]: v }))
  const nested = (k: string, f: string, v: string) => set(k, { ...(s[k] ?? {}), [f]: v })
  async function upload(key: string, f?: File) {
    if (!f) return
    try { const p = await uploadPublic('site', f, ['png', 'jpg', 'webp'], 'branding'); set(key, p) } catch (e) { toast.error((e as Error).message) }
  }
  async function addBanner(f?: File) {
    if (!f) return
    try { const p = await uploadPublic('site', f, ['png', 'jpg', 'webp'], 'banners'); set('hero_banners', [...(s.hero_banners ?? []), { image_path: p }]) } catch (e) { toast.error((e as Error).message) }
  }
  async function save() {
    setBusy(true)
    const keys = ['site_name', 'tagline', 'logo_path', 'favicon_path', 'hero_banners', 'contact', 'social', 'maintenance_mode', 'terms', 'privacy', 'refund_policy', 'license']
    const { error } = await supabase.from('system_settings').upsert(keys.filter((k) => s[k] !== undefined).map((key) => ({ key, value: s[key], is_public: true, updated_at: new Date().toISOString() })))
    setBusy(false)
    if (error) return void toast.error(error.message)
    toast.success('Settings saved'); qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
  }
  return (
    <><PageHeader title="System settings" actions={<Button loading={busy} onClick={save}>Save all</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4"><h2 className="font-semibold">Branding</h2>
          <Field label="Website name"><Input value={s.site_name ?? ''} onChange={(e) => set('site_name', e.target.value)} /></Field>
          <Field label="Tagline"><Input value={s.tagline ?? ''} onChange={(e) => set('tagline', e.target.value)} /></Field>
          <Field label="Logo"><Input type="file" accept="image/png,image/jpeg,image/webp" className="h-auto py-2" onChange={(e) => upload('logo_path', e.target.files?.[0])} /></Field>
          <Field label="Favicon"><Input type="file" accept="image/png,image/jpeg,image/webp" className="h-auto py-2" onChange={(e) => upload('favicon_path', e.target.files?.[0])} /></Field>
          <label className="flex items-center gap-2 text-sm"><Switch label="Maintenance mode" checked={s.maintenance_mode === true} onChange={(v) => set('maintenance_mode', v)} />Maintenance mode (public site shows a notice)</label></Card>
        <Card className="space-y-3 p-4"><h2 className="font-semibold">Hero banners</h2>
          <Input type="file" accept="image/png,image/jpeg,image/webp" className="h-auto py-2" onChange={(e) => addBanner(e.target.files?.[0])} aria-label="Add banner" />
          <ul className="space-y-2">{(s.hero_banners ?? []).map((b: any, i: number) => <li key={i} className="flex items-center gap-2"><img src={publicUrl('site', b.image_path)!} alt="" className="h-12 w-20 rounded object-cover" /><Button size="sm" variant="ghost" onClick={() => set('hero_banners', s.hero_banners.filter((_: any, j: number) => j !== i))}>Remove</Button></li>)}</ul></Card>
        <Card className="space-y-3 p-4"><h2 className="font-semibold">Contact</h2>
          {(['email', 'phone', 'address'] as const).map((f) => <Field key={f} label={f[0].toUpperCase() + f.slice(1)}><Input value={s.contact?.[f] ?? ''} onChange={(e) => nested('contact', f, e.target.value)} /></Field>)}</Card>
        <Card className="space-y-3 p-4"><h2 className="font-semibold">Social links</h2>
          {(['facebook', 'youtube', 'instagram', 'tiktok'] as const).map((f) => <Field key={f} label={f[0].toUpperCase() + f.slice(1)}><Input type="url" placeholder="https://" value={s.social?.[f] ?? ''} onChange={(e) => nested('social', f, e.target.value)} /></Field>)}</Card>
        {TEXT_KEYS.map(([k, label]) => <Card key={k} className="space-y-3 p-4 lg:col-span-2"><Field label={label}><Textarea className="min-h-40" value={s[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></Field></Card>)}
      </div></>
  )
}
