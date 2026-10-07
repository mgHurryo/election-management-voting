import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ApiError } from '../api/client'
import { AuthContext } from '../store/auth-context'
import type { AuthState } from '../store/auth-context'
import LoginPage from './LoginPage'

const base: AuthState = {
  user: null,
  loading: false,
  error: null,
  restore: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}

const student: NonNullable<AuthState['user']> = {
  id: '2',
  username: 'voter',
  display_name: 'Voter Demo',
  role: 'USER',
  status: 'ACTIVE',
  created_at: '',
  updated_at: '',
}

function mount(state: Partial<AuthState> = {}) {
  return render(
    <AuthContext.Provider value={{ ...base, ...state }}>
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/elections' } }]}>
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route path="elections" element={<p>选举列表占位</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

function submit(username = 'voter', password = 'Password123') {
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: username } })
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: '登录' }))
}

describe('M1 login page', () => {
  it('signs in with the typed credentials and returns to the requested page', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined)
    mount({ signIn })

    submit()

    await waitFor(() => expect(signIn).toHaveBeenCalledWith('voter', 'Password123'))
    expect(await screen.findByText('选举列表占位')).toBeInTheDocument()
  })

  it('renders the backend failure message and keeps the form available', () => {
    mount({ error: new ApiError('INVALID_CREDENTIALS', 401) })

    expect(screen.getByRole('alert')).toHaveTextContent('用户名或密码不正确')
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument()
  })

  it('disables submission until both fields are filled', () => {
    mount()
    const button = screen.getByRole('button', { name: '登录' })

    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'voter' } })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'Password123' } })
    expect(button).toBeEnabled()
  })

  it('shows the restored identity instead of the form', () => {
    mount({ user: student })

    expect(screen.getByRole('heading', { name: '已登录' })).toBeInTheDocument()
    expect(screen.queryByLabelText('用户名')).not.toBeInTheDocument()
  })
})
