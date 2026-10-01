import { Navigate, Outlet, useLocation } from 'react-router'
import type { Role } from '../api/types'
import { useAuth } from '../hooks/useAuth'
import { ErrorState, LoadingState } from '../components/AsyncState'
export function RequireAuth() {
  const { user, loading, error, restore } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState />
  if (error) return <ErrorState error={error} retry={() => void restore()} />
  return user ? (
    <Outlet />
  ) : (
    <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  )
}
export function RequireRole({ role }: { role: Role }) {
  const { user } = useAuth()
  return user?.role === role ? <Outlet /> : <Navigate to="/forbidden" replace />
}
