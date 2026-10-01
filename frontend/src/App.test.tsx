import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import App from './App'
it('renders the public framework shell without a backend or fake data', async () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  window.history.replaceState({}, '', '/')
  render(<App />)
  expect(await screen.findByRole('heading', { name: '前端框架已就绪' })).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument()
  expect(fetcher).not.toHaveBeenCalled()
})
