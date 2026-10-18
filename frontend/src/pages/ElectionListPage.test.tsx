import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { api } from '../api'
import { ApiError } from '../api/client'
import type { Election, Paginated, Role } from '../api/types'
import { AuthContext } from '../store/auth-context'
import { AppRoutes } from '../routes/AppRoutes'

const election: Election = {
  id: '9007199254740993',
  title: 'Class representative election',
  position_title: 'Class representative',
  description: null,
  created_by: '1',
  status: 'DRAFT',
  privacy_mode: 'FORCED_ANONYMOUS',
  starts_at: '2026-10-20T01:00:00Z',
  ends_at: '2026-10-20T09:00:00Z',
  results_published_at: null,
  created_at: '',
  updated_at: '',
}

function row(status: Election['status'], id = election.id): Election {
  return { ...election, id, status, title: `${status} election ${id}` }
}

function response(page = 1, total = 1, rows: Election[] = [election]): Paginated<Election> {
  return { data: rows, meta: { page, page_size: 20, total } }
}

function mount(role: Role | null = 'USER', path = '/elections') {
  return render(
    <AuthContext.Provider
      value={{
        user: role
          ? {
              id: '2',
              username: 'test',
              display_name: 'Test user',
              role,
              status: 'ACTIVE',
              created_at: '',
              updated_at: '',
            }
          : null,
        loading: false,
        error: null,
        restore: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
      }}
    >
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('elections home', () => {
  it('composes OPEN and DRAFT results without losing BIGINT IDs or showing CLOSED', async () => {
    const list = vi.spyOn(api, 'elections').mockImplementation(async (query) => {
      if (query?.status === 'OPEN') return response(1, 1, [row('OPEN', '9007199254740993')])
      if (query?.status === 'DRAFT') return response(1, 1, [row('DRAFT', '9007199254740994')])
      return response(query?.page, 0, [])
    })
    vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    vi.spyOn(api, 'candidates').mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 20, total: 0 },
    })
    mount()
    expect(
      await screen.findByRole('heading', { name: 'OPEN election 9007199254740993' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Vote' })).toHaveAttribute(
      'href',
      '/elections/9007199254740993',
    )
    expect(
      screen.getByRole('heading', { name: 'DRAFT election 9007199254740994' }),
    ).toBeInTheDocument()
    expect(list).toHaveBeenCalledWith({ page: 1, page_size: 20, status: 'OPEN' })
    expect(list).toHaveBeenCalledWith({ page: 1, page_size: 20, status: 'DRAFT' })
    expect(screen.queryByText(/CLOSED election/)).not.toBeInTheDocument()
  })

  it('shows the administrator create entry and navigates to the existing route', async () => {
    vi.spyOn(api, 'elections').mockImplementation(async (query) => response(query?.page, 0, []))
    mount('ADMIN')
    await screen.findByRole('heading', { name: 'Elections' })
    fireEvent.click(screen.getByRole('link', { name: 'New election' }))
    expect(await screen.findByRole('heading', { name: 'Create election' })).toBeInTheDocument()
  })

  it('redirects anonymous visitors to login without requesting elections', async () => {
    const list = vi.spyOn(api, 'elections')
    mount(null)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(list).not.toHaveBeenCalled()
  })

  it('redirects the legacy vote URL to the matching election detail', async () => {
    const detail = vi
      .spyOn(api, 'election')
      .mockResolvedValue({ data: { ...election, status: 'OPEN' } })
    const list = vi.spyOn(api, 'elections')
    vi.spyOn(api, 'candidates').mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 20, total: 0 },
    })
    mount('USER', `/elections/${election.id}/vote`)
    expect(await screen.findByRole('heading', { name: 'Candidate List' })).toBeInTheDocument()
    await waitFor(() => expect(detail).toHaveBeenCalledWith(election.id))
    expect(list).not.toHaveBeenCalled()
  })

  it('paginates OPEN before DRAFT and resets to page one when filtering', async () => {
    let openRequests = 0
    const list = vi.spyOn(api, 'elections').mockImplementation(async (query) => {
      if (query?.status === 'OPEN') {
        openRequests += 1
        if (query.page === 2) return response(2, 21, [row('OPEN', 'open-2')])
        if (openRequests > 1) return response(1, 1, [row('OPEN', 'filtered-open')])
        return response(query.page, 21, [row('OPEN', `open-${query.page}`)])
      }
      if (query?.status === 'DRAFT')
        return response(query.page, 2, [row('DRAFT', `draft-${query.page}`)])
      return response(query?.page, 1, [row('OPEN', 'filtered-open')])
    })
    mount()
    await screen.findByRole('heading', { name: 'OPEN election open-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'DRAFT election draft-1' })
    expect(list).toHaveBeenCalledWith({ page: 1, page_size: 20, status: 'DRAFT' })
    fireEvent.click(screen.getByRole('button', { name: /^Open/ }))
    await screen.findByRole('heading', { name: 'OPEN election filtered-open' })
    expect(list).toHaveBeenLastCalledWith({ page: 1, page_size: 20, status: 'OPEN' })
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  })

  it('distinguishes a failed request from an empty result and allows retry', async () => {
    let calls = 0
    const list = vi.spyOn(api, 'elections').mockImplementation(async () => {
      calls += 1
      if (calls === 1) throw new ApiError('NETWORK_ERROR')
      return response(1, 0, [])
    })
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No elections to show.')).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(4)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not overwrite a new filter result when an older request finishes late', async () => {
    let finishOld!: (data: Paginated<Election>) => void
    const oldRequest = new Promise<Paginated<Election>>((resolve) => {
      finishOld = resolve
    })
    let draftCalls = 0
    const list = vi.spyOn(api, 'elections').mockImplementation((query) => {
      if (query?.status === 'OPEN' || (query?.status === 'DRAFT' && draftCalls++ === 0))
        return oldRequest
      return Promise.resolve(response(1, 0, []))
    })
    mount()
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }))
    expect(await screen.findByText('No elections to show.')).toBeInTheDocument()
    await act(async () => finishOld(response()))
    expect(screen.queryByRole('link', { name: 'Details' })).not.toBeInTheDocument()
    expect(screen.getByText('No elections to show.')).toBeInTheDocument()
  })
})
