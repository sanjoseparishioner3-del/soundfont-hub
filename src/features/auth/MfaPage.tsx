import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Card } from '@/components/ui/misc'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'

/** TOTP enrolment + challenge. Required before any admin access (admin RLS needs an aal2 session). */
export default function MfaPage() {
  const { user, hasAdminRole, isAdmin, refresh, loading } = useAuth()
  const nav = useNavigate()
  const dest = (useLocation().state as { from?: string } | null)?.from ?? '/admin'
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data } = await supabase.auth.mfa.listFactors()
      const verified = data?.totp?.find((f) => f.status === 'verified')
      if (verified) return setFactorId(verified.id)
      // clear abandoned unverified factors, then enrol a fresh one
      for (const f of data?.totp ?? []) await supabase.auth.mfa.unenroll({ factorId: f.id })
      const enrol = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'SoundFont Hub admin' })
      if (enrol.error) return void toast.error(enrol.error.message)
      setFactorId(enrol.data.id); setQr(enrol.data.totp.qr_code); setSecret(enrol.data.totp.secret)
    })()
  }, [user])

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (!hasAdminRole) return <Navigate to="/" replace />
  if (isAdmin) return <Navigate to={dest} replace />

  async function verify() {
    if (!factorId) return
    setBusy(true)
    const ch = await supabase.auth.mfa.challenge({ factorId })
    if (ch.error) { setBusy(false); return void toast.error(ch.error.message) }
    const v = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code })
    setBusy(false)
    if (v.error) return void toast.error('Invalid code. Try again.')
    await refresh(); nav(dest, { replace: true })
  }

  return (
    <div className="mx-auto grid max-w-md gap-4 px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Two-factor authentication</h1>
        <p className="mt-1 text-sm text-muted-foreground">Administrators must verify a one-time code from an authenticator app.</p>
      </div>
      <Card className="space-y-4 p-5">
        {qr && (
          <div className="space-y-2 text-center">
            <p className="text-sm">Scan with Google Authenticator, Authy or 1Password:</p>
            <img src={qr} alt="MFA QR code" className="mx-auto size-44 rounded-md border border-border bg-white p-2" />
            {secret && <p className="break-all text-xs text-muted-foreground">Manual key: <code>{secret}</code></p>}
          </div>
        )}
        <Field label="6-digit code">
          <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Button className="w-full" loading={busy} disabled={code.length !== 6 || !factorId} onClick={verify}>Verify</Button>
      </Card>
    </div>
  )
}
