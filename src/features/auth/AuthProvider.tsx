import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  /** Has the admin role (may still need MFA). */
  hasAdminRole: boolean
  /** Admin role AND MFA-verified session – the only state in which admin RLS passes. */
  isAdmin: boolean
  aal: 'aal1' | 'aal2' | null
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasAdminRole, setHasAdminRole] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [aal, setAal] = useState<'aal1' | 'aal2' | null>(null)

  const loadRoles = useCallback(async (s: Session | null) => {
    if (!s) { setHasAdminRole(false); setIsAdmin(false); setAal(null); return }
    const [role, admin, level] = await Promise.all([
      supabase.rpc('has_admin_role'),
      supabase.rpc('is_admin'),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    setHasAdminRole(role.data === true)
    setIsAdmin(admin.data === true)
    setAal((level.data?.currentLevel as 'aal1' | 'aal2') ?? 'aal1')
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadRoles(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // Defer: never call supabase inside the auth callback synchronously.
      setTimeout(() => { void loadRoles(s) }, 0)
      if (event === 'SIGNED_OUT') qc.clear()
    })
    return () => sub.subscription.unsubscribe()
  }, [loadRoles, qc])

  const value = useMemo<AuthState>(() => ({
    session, user: session?.user ?? null, loading, hasAdminRole, isAdmin, aal,
    signOut: async () => { await supabase.auth.signOut() },
    refresh: async () => { const { data } = await supabase.auth.getSession(); setSession(data.session); await loadRoles(data.session) },
  }), [session, loading, hasAdminRole, isAdmin, aal, loadRoles])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
