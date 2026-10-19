import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { errorMessage } from '../shared/errors'

export default function LoginPage() {
  const { user, loading, error, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const from = (location.state as { from?: string } | null)?.from || '/'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await signIn(username, password)
      navigate(from, { replace: true })
    } catch {
      // AuthProvider exposes the failure in its error state.
    } finally {
      setSubmitting(false)
    }
  }

  if (user) {
    return (
      <div className="wrap">
        <section className="state">
          <h1>Signed in</h1>
          <p>
            {user.display_name} ({user.username} · {user.role === 'ADMIN' ? 'Admin' : 'Voter'})
          </p>
          <p className="actions">
            <Link to="/">Continue to elections</Link>
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className="login" lang="en">
      <div className="lgl">
        <div className="brandrow">
          <b>Civic</b>
          <span className="sep" />
          <span>Election Management &amp; Voting System</span>
        </div>
        <div className="lglcenter">
          <h1>Sign in</h1>
          <p className="lglead">Continue with your account.</p>
        </div>
      </div>
      <div className="lgr">
        <form className="lgbox" onSubmit={handleSubmit}>
          <label className="lfield">
            <span>Username</span>
            <input
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="lfield">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="lerr-slot">
            {error ? (
              <p className="lerr" role="alert">
                {errorMessage(error)}
              </p>
            ) : null}
          </div>
          <button
            className="lbtn"
            type="submit"
            disabled={submitting || loading || !username || !password}
          >
            Sign in
          </button>
          <p className="lsub">Use a pre-seeded account; there is no self-registration.</p>
        </form>
      </div>
    </div>
  )
}
