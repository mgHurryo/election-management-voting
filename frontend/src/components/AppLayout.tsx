import { Link, Outlet, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth'

export function AppLayout() {
  const { user, signOut } = useAuth()
  const isAnonymousLogin = useLocation().pathname === '/login' && !user

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="top" hidden={isAnonymousLogin}>
        <div className="wrap toprow">
          <Link to="/" className="brand">
            Civic
          </Link>
          <div className="who">
            {user?.role === 'ADMIN' && (
              <Link className="quiet" to="/elections/new">
                New election
              </Link>
            )}
            {user && (
              <span className="whoami">
                <b>{user.display_name}</b> · {user.role === 'ADMIN' ? 'Admin' : 'Voter'}
              </span>
            )}
            {user ? (
              <button type="button" className="quiet" onClick={signOut}>
                Sign out
              </button>
            ) : (
              <Link className="quiet" to="/login">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <div className="drule" hidden={isAnonymousLogin} />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
