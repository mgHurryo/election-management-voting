import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { errorMessage } from '../shared/errors'

/**
 * M1 login form. The backend stays the only authority on identity and role: the
 * client stores the access token and re-reads the account through /auth/me.
 */
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
      // The provider stores the failure; this form renders errorMessage(error).
    } finally {
      setSubmitting(false)
    }
  }

  if (user) {
    return (
      <section className="placeholder">
        <span className="eyebrow">M1 · 身份</span>
        <h1>已登录</h1>
        <p>
          当前账户：{user.display_name}（{user.username} · {user.role}）
        </p>
        <p className="hint">
          <Link to="/">返回首页</Link>
        </p>
      </section>
    )
  }

  return (
    <section className="placeholder">
      <span className="eyebrow">M1 · 身份</span>
      <h1>登录</h1>
      <p className="hint">使用预置账户登录；系统不提供注册或账户管理。</p>
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span>用户名</span>
          <input
            name="username"
            autoComplete="username"
            maxLength={50}
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="field">
          <span>密码</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {errorMessage(error)}
          </p>
        ) : null}
        <button type="submit" disabled={submitting || loading || !username || !password}>
          {submitting ? '登录中…' : '登录'}
        </button>
      </form>
    </section>
  )
}
