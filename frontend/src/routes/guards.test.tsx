import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AuthContext } from '../store/auth-context'
import type { AuthState } from '../store/auth-context'
import { RequireAuth, RequireRole } from './guards'
const base: AuthState = {
  user: null,
  loading: false,
  error: null,
  restore: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}
const user: NonNullable<AuthState['user']> = {
  id: '21',
  username: 'student',
  display_name: 'Student',
  role: 'USER',
  status: 'ACTIVE',
  created_at: '',
  updated_at: '',
}
function mount(state: Partial<AuthState>) {
  return render(
    <AuthContext.Provider value={{ ...base, ...state }}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="login" element={<p>Login placeholder</p>} />
          <Route path="forbidden" element={<p>Forbidden</p>} />
          <Route element={<RequireAuth />}>
            <Route element={<RequireRole role="ADMIN" />}>
              <Route path="admin" element={<p>Admin placeholder</p>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}
describe('route guards', () => {
  it('redirects guests to login', () => {
    mount({})
    expect(screen.getByText('Login placeholder')).toBeInTheDocument()
  })
  it('waits for identity restoration', () => {
    mount({ loading: true })
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Admin placeholder')).not.toBeInTheDocument()
  })
  it('denies USER access to administrator routes', () => {
    mount({ user })
    expect(screen.getByText('Forbidden')).toBeInTheDocument()
  })
  it('allows ADMIN access', () => {
    mount({ user: { ...user, role: 'ADMIN' } })
    expect(screen.getByText('Admin placeholder')).toBeInTheDocument()
  })
  it('shows restoration failure without granting access', () => {
    mount({ error: new Error('offline') })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Admin placeholder')).not.toBeInTheDocument()
  })
})
