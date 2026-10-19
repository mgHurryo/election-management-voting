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
          <Route path="elections" element={<p>Elections placeholder</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

function submit(username = 'voter', password = 'Password123') {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('login page', () => {
  it('signs in with the typed credentials and returns to the requested page', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined)
    mount({ signIn })

    submit()

    await waitFor(() => expect(signIn).toHaveBeenCalledWith('voter', 'Password123'))
    expect(await screen.findByText('Elections placeholder')).toBeInTheDocument()
  })

  it('handles rejected sign-in without navigation or an unhandled rejection', async () => {
    const signIn = vi.fn().mockRejectedValue(new ApiError('INVALID_CREDENTIALS', 401))
    mount({ signIn })
    submit()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled())
    expect(screen.queryByText('Elections placeholder')).not.toBeInTheDocument()
  })

  it('renders the backend failure message and keeps the form available', () => {
    mount({ error: new ApiError('INVALID_CREDENTIALS', 401) })

    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect username or password')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('reserves the error slot while the login form has no error', () => {
    mount()

    expect(document.querySelector('.lerr-slot')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('disables submission until both fields are filled', () => {
    mount()
    const button = screen.getByRole('button', { name: 'Sign in' })

    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'voter' } })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password123' } })
    expect(button).toBeEnabled()
  })

  it('uses the approved English-only login copy without a language switcher', () => {
    mount()

    expect(document.querySelector('.login')).toHaveAttribute('lang', 'en')
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Language' })).not.toBeInTheDocument()
  })

  it('shows the restored identity instead of the form', () => {
    mount({ user: student })

    expect(screen.getByRole('heading', { name: 'Signed in' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
  })
})
