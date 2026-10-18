import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./api', () => ({
  api: new Proxy(
    {},
    {
      get: () => vi.fn().mockResolvedValue({ data: [], meta: { page: 1, page_size: 6, total: 0 } }),
    },
  ),
}))

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    error: null,
    restore: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}))

it('protects the elections home when no session exists', async () => {
  window.history.replaceState({}, '', '/')
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.getAllByText('Civic')).toHaveLength(2)
  expect(screen.getByRole('textbox', { name: 'Username' })).toBeInTheDocument()
})
