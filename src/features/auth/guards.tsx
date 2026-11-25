import { Loader2 } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

const Spinner = () => (
  <div className="grid min-h-[50vh] place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div>
)

export function RequireAuth() {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  return <Outlet />
}

/** Admin area: requires admin role, then MFA. Server-side RLS enforces the same independently. */
export function RequireAdmin() {
  const { user, loading, hasAdminRole, isAdmin } = useAuth()
  const loc = useLocation()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (!hasAdminRole) return <Navigate to="/" replace />
  if (!isAdmin) return <Navigate to="/account/mfa" replace state={{ from: loc.pathname }} />
  return <Outlet />
}
