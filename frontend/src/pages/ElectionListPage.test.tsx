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
  ends_at: new Date(Date.now() + 3_600_000).toISOString(),
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
  it('lists every server-visible state without losing BIGINT IDs or server ordering', async () => {
    const list = vi
      .spyOn(api, 'elections')
      .mockResolvedValue(
        response(1, 3, [
          row('CLOSED', '9007199254740995'),
          row('OPEN', '9007199254740993'),
          row('DRAFT', '9007199254740994'),
        ]),
      )
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
    expect(
      screen.getByRole('heading', { name: 'CLOSED election 9007199254740995' }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent),
    ).toEqual([
      'CLOSED election 9007199254740995',
      'OPEN election 9007199254740993',
      'DRAFT election 9007199254740994',
    ])
    expect(list).toHaveBeenCalledExactlyOnceWith({ page: 1, page_size: 20 })
    expect(screen.getByRole('button', { name: 'All (3)' })).toBeInTheDocument()
  })

  it('shows the administrator create entry and navigates to the existing route', async () => {
    vi.spyOn(api, 'elections').mockImplementation(async (query) => response(query?.page, 0, []))
    mount('ADMIN')
    await screen.findByRole('heading', { name: 'Elections' })
    fireEvent.click(screen.getByRole('link', { name: 'New election' }))
    expect(await screen.findByRole('heading', { name: 'Create election' })).toBeInTheDocument()
  })

  it('keeps published closed elections discoverable after navigation and a fresh mount', async () => {
    const published: Election = {
      ...election,
      status: 'CLOSED',
      results_published_at: '2026-10-20T10:00:00Z',
    }
    vi.spyOn(api, 'elections').mockResolvedValue(response(1, 1, [published]))
    vi.spyOn(api, 'election').mockResolvedValue({ data: published })
    vi.spyOn(api, 'results').mockResolvedValue({
      data: {
        election_id: election.id,
        position_title: election.position_title,
        results_published_at: published.results_published_at,
        total_votes: 0,
        candidates: [],
        winner_candidate_id: null,
      },
    })
    const view = mount()
    fireEvent.click(await screen.findByRole('link', { name: 'Results' }))
    // A closed election with a published result links straight to the results page.
    expect(await screen.findByRole('heading', { name: 'Published result' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'All elections' }))
    await screen.findByRole('heading', { name: election.title })
    view.unmount()
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Closed' }))
    fireEvent.click(await screen.findByRole('link', { name: 'Results' }))
    expect(await screen.findByRole('heading', { name: 'Published result' })).toBeInTheDocument()
  })

  it('offers Results instead of Vote for an open row whose window already passed', async () => {
    vi.spyOn(api, 'elections').mockResolvedValue(
      response(1, 1, [{ ...election, status: 'OPEN', ends_at: '2026-10-20T09:00:00Z' }]),
    )
    mount('USER')
    const link = await screen.findByRole('link', { name: 'Results' })
    expect(link).toHaveAttribute('href', `/elections/${election.id}/results`)
    expect(screen.getByText('Ended')).toBeInTheDocument()
    expect(screen.getByText('Closed', { selector: '.st' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Vote' })).not.toBeInTheDocument()
  })

  it('keeps a draft with a passed window on Details instead of offering results', async () => {
    vi.spyOn(api, 'elections').mockResolvedValue(
      response(1, 1, [{ ...election, status: 'DRAFT', ends_at: '2026-10-20T09:00:00Z' }]),
    )
    mount('USER')
    expect(await screen.findByRole('link', { name: 'Details' })).toHaveAttribute(
      'href',
      `/elections/${election.id}`,
    )
    expect(screen.getByText('Draft', { selector: '.st' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Results' })).not.toBeInTheDocument()
  })

  it('flips an open row to Ended and Results once the clock crosses ends_at in the same session', async () => {
    vi.useFakeTimers()
    try {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-22T10:00:00Z'))
      vi.spyOn(api, 'elections').mockResolvedValue(
        response(1, 1, [{ ...election, status: 'OPEN', ends_at: '2026-10-22T11:00:00Z' }]),
      )
      mount('USER')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByRole('link', { name: 'Vote' })).toBeInTheDocument()
      clock.mockReturnValue(Date.parse('2026-10-22T11:00:01Z'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(screen.getByRole('link', { name: 'Results' })).toBeInTheDocument()
      expect(screen.getByText('Closed', { selector: '.st' })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Vote' })).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
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

  it('uses server pagination for All and resets to page one for each status filter', async () => {
    const list = vi.spyOn(api, 'elections').mockImplementation(async (query) => {
      if (query?.status) return response(query.page, 1, [row(query.status, 'filtered')])
      return response(query?.page, 21, [row('CLOSED', `page-${query?.page}`)])
    })
    mount()
    await screen.findByRole('heading', { name: 'CLOSED election page-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'CLOSED election page-2' })
    expect(list).toHaveBeenLastCalledWith({ page: 2, page_size: 20 })
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    for (const [label, status] of [
      ['Open', 'OPEN'],
      ['Draft', 'DRAFT'],
      ['Closed', 'CLOSED'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: label }))
      await screen.findByRole('heading', { name: `${status} election filtered` })
      expect(list).toHaveBeenLastCalledWith({ page: 1, page_size: 20, status })
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    }
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
    expect(list).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not overwrite a new filter result when an older request finishes late', async () => {
    let finishOld!: (data: Paginated<Election>) => void
    const oldRequest = new Promise<Paginated<Election>>((resolve) => {
      finishOld = resolve
    })
    const list = vi.spyOn(api, 'elections').mockImplementation((query) => {
      if (!query?.status) return oldRequest
      return Promise.resolve(response(1, 0, []))
    })
    mount()
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }))
    expect(await screen.findByText('No elections to show.')).toBeInTheDocument()
    await act(async () => finishOld(response()))
    expect(screen.queryByRole('link', { name: 'Details' })).not.toBeInTheDocument()
    expect(screen.getByText('No elections to show.')).toBeInTheDocument()
  })
})
