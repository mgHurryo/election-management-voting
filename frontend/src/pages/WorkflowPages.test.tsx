import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Link, MemoryRouter } from 'react-router'
import { api } from '../api'
import { ApiError } from '../api/client'
import type { Election, Paginated, Result, Role, Voter } from '../api/types'
import { AppRoutes } from '../routes/AppRoutes'
import { AuthContext } from '../store/auth-context'

const election: Election = {
  id: '9007199254740993',
  title: 'Community election',
  position_title: 'Representative',
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
const voter: Voter = {
  election_id: election.id,
  user_id: '18446744073709551615',
  display_name: 'Alex Morgan',
  vote_quota: 1,
  created_at: '',
  updated_at: '',
}
const roster: Paginated<Voter> = { data: [voter], meta: { page: 1, page_size: 20, total: 1 } }
const result: Result = {
  election_id: election.id,
  position_title: election.position_title,
  results_published_at: null,
  total_votes: 3,
  candidates: [
    { candidate_id: '9007199254740995', name: 'Avery Chen', vote_count: 3 },
    { candidate_id: '9007199254740996', name: 'Sam Lee', vote_count: 0 },
  ],
  winner_candidate_id: '9007199254740995',
}
const publishedAt = '2026-10-20T10:00:00Z'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function mount(destination: 'voters' | 'results', role: Role | null = 'ADMIN') {
  return render(
    <AuthContext.Provider
      value={{
        user: role
          ? {
              id: '1',
              username: 'test',
              display_name: 'Test',
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
      <MemoryRouter initialEntries={[`/elections/${election.id}/${destination}`]}>
        <Link to={`/elections/2002/${destination}`}>Switch election</Link>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

function setupRoster(record: Election = election) {
  const detail = vi.spyOn(api, 'election').mockResolvedValue({ data: record })
  const read = vi.spyOn(api, 'voters').mockResolvedValue(roster)
  return { detail, read }
}

function setupResults(
  record: Election = { ...election, status: 'CLOSED' },
  counts: Result = result,
) {
  const detail = vi.spyOn(api, 'election').mockResolvedValue({ data: record })
  const read = vi.spyOn(api, 'results').mockResolvedValue({ data: counts })
  return { detail, read }
}

describe('voter roll workflow', () => {
  it.each(['USER', null] as const)('denies roster reads for %s', async (role) => {
    const { detail, read } = setupRoster()
    mount('voters', role)
    await screen.findByRole('heading', { name: role ? 'No access' : 'Sign in' })
    expect(detail).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
  })

  it('reads membership metadata with exact BIGINT IDs and no ballot or results requests', async () => {
    const { read } = setupRoster()
    const ballots = vi.spyOn(api, 'ballot')
    const results = vi.spyOn(api, 'results')
    mount('voters')
    expect(await screen.findByText(voter.user_id)).toBeInTheDocument()
    expect(read).toHaveBeenCalledWith(election.id, 1)
    expect(ballots).not.toHaveBeenCalled()
    expect(results).not.toHaveBeenCalled()
  })

  it('does not request memberships after an election lookup fails', async () => {
    const { detail, read } = setupRoster()
    detail.mockRejectedValue(new ApiError('ELECTION_NOT_FOUND', 404))
    mount('voters')
    expect(await screen.findByRole('alert')).toHaveTextContent('does not exist')
    expect(read).not.toHaveBeenCalled()
  })

  it('keeps failed roster reads distinct from empty results and supports manual retry', async () => {
    const { read } = setupRoster()
    read.mockRejectedValueOnce(new ApiError('NETWORK_ERROR'))
    mount('voters')
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach')
    expect(screen.queryByText('No voters on this roll.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(voter.display_name)).toBeInTheDocument()
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('shows an empty roll and does not enable paging', async () => {
    setupRoster().read.mockResolvedValue({
      ...roster,
      data: [],
      meta: { ...roster.meta, total: 0 },
    })
    mount('voters')
    expect(await screen.findByText('No voters on this roll.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  })

  it.each(['OPEN', 'CLOSED'] as const)('makes a %s roll read-only', async (status) => {
    setupRoster({ ...election, status })
    const add = vi.spyOn(api, 'addVoter')
    const remove = vi.spyOn(api, 'removeVoter')
    mount('voters')
    await screen.findByText(voter.display_name)
    expect(screen.queryByLabelText('Voter ID')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument()
    expect(add).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it.each(['', '0', '-1', '1.2', '01', '21 22', '18446744073709551616'])(
    'rejects invalid single voter ID %s',
    async (value) => {
      setupRoster()
      const add = vi.spyOn(api, 'addVoter')
      mount('voters')
      const input = await screen.findByLabelText('Voter ID')
      fireEvent.change(input, { target: { value } })
      fireEvent.click(screen.getByRole('button', { name: 'Add voter' }))
      expect(screen.getByRole('alert')).toHaveTextContent('Enter one existing voter ID')
      expect(add).not.toHaveBeenCalled()
    },
  )

  it('submits an exact string ID once, prevents duplicate clicks and reloads the server roll', async () => {
    const { read } = setupRoster()
    const response = deferred<{ data: Voter }>()
    const add = vi.spyOn(api, 'addVoter').mockReturnValue(response.promise)
    mount('voters')
    fireEvent.change(await screen.findByLabelText('Voter ID'), {
      target: { value: ` ${voter.user_id} ` },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add voter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adding…' }))
    expect(add).toHaveBeenCalledExactlyOnceWith(election.id, voter.user_id)
    await act(async () => response.resolve({ data: voter }))
    expect(await screen.findByLabelText('Voter ID')).toHaveValue('')
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  })

  it('requires removal confirmation, allows cancellation and deletes only the confirmed ID', async () => {
    setupRoster()
    const remove = vi.spyOn(api, 'removeVoter').mockResolvedValue(undefined)
    mount('voters')
    const trigger = await screen.findByRole('button', { name: /^Remove Alex/ })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('heading', { name: 'Remove voter?' })).toHaveFocus()
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(trigger).toHaveFocus()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
    await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith(election.id, voter.user_id))
  })

  it.each(['NETWORK_ERROR', 'VOTER_ALREADY_EXISTS', 'ELECTION_NOT_EDITABLE'])(
    'blocks writes after %s until a successful authoritative refresh',
    async (code) => {
      const { detail } = setupRoster()
      const add = vi
        .spyOn(api, 'addVoter')
        .mockRejectedValue(new ApiError(code, code === 'NETWORK_ERROR' ? 0 : 409))
      mount('voters')
      fireEvent.change(await screen.findByLabelText('Voter ID'), {
        target: { value: voter.user_id },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add voter' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Refresh the roll')
      expect(screen.getByRole('button', { name: 'Add voter' })).toBeDisabled()
      expect(screen.getByLabelText('Voter ID')).toHaveValue(voter.user_id)
      expect(add).toHaveBeenCalledTimes(1)
      detail.mockResolvedValue({ data: { ...election, status: 'OPEN' } })
      fireEvent.click(screen.getByRole('button', { name: 'Refresh roll' }))
      expect(await screen.findByText(/read-only once/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add voter' })).not.toBeInTheDocument()
    },
  )

  it('uses server pagination and returns from an out-of-range page after concurrent removal', async () => {
    const { read } = setupRoster()
    read
      .mockResolvedValueOnce({ ...roster, meta: { ...roster.meta, total: 21 } })
      .mockResolvedValueOnce({ ...roster, data: [], meta: { page: 2, page_size: 20, total: 20 } })
    mount('voters')
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3))
    expect(read.mock.calls.map((call) => call[1])).toEqual([1, 2, 1])
    expect(await screen.findByText('Page 1 of 1')).toBeInTheDocument()
  })

  it('discards an old route response without requesting that route roster', async () => {
    const { detail, read } = setupRoster()
    const old = deferred<{ data: Election }>()
    detail
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ data: { ...election, id: '2002', title: 'Second election' } })
    mount('voters')
    await waitFor(() => expect(detail).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('link', { name: 'Switch election' }))
    await screen.findByText('Second election')
    await act(async () => old.resolve({ data: election }))
    expect(screen.queryByText(election.title)).not.toBeInTheDocument()
    expect(read).toHaveBeenCalledExactlyOnceWith('2002', 1)
  })
})

describe('results and publication workflow', () => {
  it('denies unauthenticated result reads', async () => {
    const { detail, read } = setupResults()
    mount('results', null)
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(detail).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
  })

  it.each(['DRAFT', 'OPEN'] as const)(
    'does not request counts for %s elections',
    async (status) => {
      const { read } = setupResults({
        ...election,
        status,
        ends_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      mount('results')
      expect(
        await screen.findByRole('heading', { name: 'Voting has not closed' }),
      ).toBeInTheDocument()
      expect(read).not.toHaveBeenCalled()
    },
  )

  it('explains an election whose window passed without closing instead of contradicting the ballot', async () => {
    const { read } = setupResults({ ...election, status: 'OPEN' })
    mount('results')
    expect(await screen.findByRole('heading', { name: 'Voting has ended' })).toBeInTheDocument()
    expect(screen.getByText(/not published yet/)).toBeInTheDocument()
    expect(read).not.toHaveBeenCalled()
  })

  it('flips the results empty state once the clock crosses ends_at in the same session', async () => {
    vi.useFakeTimers()
    try {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-22T10:00:00Z'))
      const { read } = setupResults({
        ...election,
        status: 'OPEN',
        ends_at: '2026-10-22T11:00:00Z',
      })
      mount('results')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByRole('heading', { name: 'Voting has not closed' })).toBeInTheDocument()
      clock.mockReturnValue(Date.parse('2026-10-22T11:00:01Z'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(screen.getByRole('heading', { name: 'Voting has ended' })).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Voting has not closed' }),
      ).not.toBeInTheDocument()
      expect(read).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps an unpublished count private from voters and does not request it', async () => {
    const { read } = setupResults()
    const publish = vi.spyOn(api, 'publishResults')
    mount('results', 'USER')
    await screen.findByRole('heading', { name: 'Results are not published' })
    expect(read).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
    expect(screen.queryByText('Avery Chen')).not.toBeInTheDocument()
  })

  it('shows all published counts, zero-vote candidates and the server winner without publishing controls', async () => {
    setupResults(
      { ...election, status: 'CLOSED', results_published_at: publishedAt },
      { ...result, results_published_at: publishedAt },
    )
    mount('results', 'USER')
    await screen.findByRole('heading', { name: 'Published result' })
    expect(screen.getByText('Sam Lee')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '0 0.0%' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Avery Chen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publish results' })).not.toBeInTheDocument()
  })

  it('shows the server winner count and share together using total counted votes', async () => {
    setupResults(undefined, {
      ...result,
      total_votes: 3,
      candidates: [
        { ...result.candidates[0], vote_count: 2 },
        { ...result.candidates[1], vote_count: 1 },
      ],
    })
    mount('results')
    const announcement = await screen.findByRole('region', { name: 'Avery Chen' })
    expect(within(announcement).getByText('Representative')).toBeInTheDocument()
    expect(within(announcement).getByText('2')).toBeInTheDocument()
    expect(within(announcement).getByText('66.7%')).toBeInTheDocument()
    expect(within(announcement).getByText('of all votes counted')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '1 33.3%' })).toBeInTheDocument()
    expect(screen.getByText(/Administrator preview/)).toBeInTheDocument()
    expect(screen.queryByText(/turnout/i)).not.toBeInTheDocument()
  })

  it('keeps empty candidate results distinct from a zero-vote candidate', async () => {
    setupResults(undefined, {
      ...result,
      total_votes: 0,
      candidates: [],
      winner_candidate_id: null,
    })
    mount('results')
    await screen.findByRole('heading', { name: 'No votes cast' })
    expect(screen.getByText('No candidate results are available.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
  })

  it.each([0, 4])(
    'does not select a winner when the server reports none (total %s)',
    async (total) => {
      setupResults(undefined, {
        ...result,
        total_votes: total,
        winner_candidate_id: null,
        candidates: result.candidates.map((item) => ({ ...item, vote_count: total / 2 })),
      })
      mount('results')
      expect(
        await screen.findByRole('heading', { name: total ? 'Two-way tie' : 'No votes cast' }),
      ).toBeInTheDocument()
      expect(screen.queryByText('Elected')).not.toBeInTheDocument()
      if (total) {
        expect(screen.getAllByRole('cell', { name: '2 50.0%' })).toHaveLength(2)
        expect(screen.getAllByText('Tied for first')).toHaveLength(2)
      } else {
        expect(screen.getAllByRole('cell', { name: '0 0.0%' })).toHaveLength(2)
      }
      expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
    },
  )

  it('announces a three-way tie with equal candidate standing and no oversized total', async () => {
    setupResults(undefined, {
      ...result,
      winner_candidate_id: null,
      candidates: [
        { ...result.candidates[0], vote_count: 1 },
        { ...result.candidates[1], vote_count: 1 },
        { candidate_id: '3', name: 'Jordan Morgan', vote_count: 1 },
      ],
    })
    mount('results')
    const outcome = await screen.findByRole('region', { name: 'Three-way tie' })
    expect(
      within(outcome).getByText(
        'All three candidates received one vote. No winner has been declared.',
      ),
    ).toBeInTheDocument()
    expect(within(outcome).queryByText('3')).not.toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: '1 33.3%' })).toHaveLength(3)
    expect(screen.getAllByText('Tied for first')).toHaveLength(3)
    expect(screen.queryByText(/server|tie-break/i)).not.toBeInTheDocument()
  })

  it('identifies only the tied leaders without declaring a winner or marking lower counts tied', async () => {
    setupResults(undefined, {
      ...result,
      total_votes: 5,
      winner_candidate_id: null,
      candidates: [
        { ...result.candidates[0], vote_count: 2 },
        { ...result.candidates[1], vote_count: 2 },
        { candidate_id: '3', name: 'Jordan Morgan', vote_count: 1 },
      ],
    })
    mount('results')
    await screen.findByRole('heading', { name: 'Two-way tie' })
    expect(
      screen.getByText(
        'The 2 leading candidates each received 2 votes. No winner has been declared.',
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Tied for first')).toHaveLength(2)
    expect(screen.getByRole('cell', { name: '1 20.0%' })).toBeInTheDocument()
    expect(screen.queryByText('Elected')).not.toBeInTheDocument()
  })

  it.each(['ROUTE_NOT_FOUND', 'RESULTS_NOT_PUBLISHED', 'ELECTION_NOT_CLOSED'])(
    'reports %s instead of showing an empty count',
    async (code) => {
      setupResults().read.mockRejectedValue(new ApiError(code, 409))
      mount('results')
      await screen.findByRole('alert')
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Publish results' })).not.toBeInTheDocument()
    },
  )

  it('rejects a result for another election', async () => {
    setupResults(undefined, { ...result, election_id: '2002' })
    mount('results')
    expect(await screen.findByRole('alert')).toHaveTextContent('unrecognized response')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('does not render an unpublished response to a voter even when election metadata says published', async () => {
    setupResults({ ...election, status: 'CLOSED', results_published_at: publishedAt })
    mount('results', 'USER')
    expect(await screen.findByRole('alert')).toHaveTextContent('unrecognized response')
    expect(screen.queryByText('Avery Chen')).not.toBeInTheDocument()
  })

  it('requires confirmation and publishes once using only the election ID', async () => {
    setupResults()
    const response = deferred<{ data: Result }>()
    const publish = vi.spyOn(api, 'publishResults').mockReturnValue(response.promise)
    mount('results')
    fireEvent.click(await screen.findByRole('button', { name: 'Publish results' }))
    expect(screen.getByText(/including people outside/)).toBeInTheDocument()
    expect(publish).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(publish).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Publish results' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm publication' }))
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }))
    expect(publish).toHaveBeenCalledExactlyOnceWith(election.id)
    await act(async () =>
      response.resolve({ data: { ...result, results_published_at: publishedAt } }),
    )
    expect(await screen.findByRole('heading', { name: 'Published result' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publish results' })).not.toBeInTheDocument()
  })

  it.each(['REQUEST_ABORTED', 'RESULT_NOT_DECIDED'])(
    'never retries publication after %s and reconciles through a read',
    async (code) => {
      const { detail, read } = setupResults()
      const publish = vi.spyOn(api, 'publishResults').mockRejectedValue(new ApiError(code))
      mount('results')
      fireEvent.click(await screen.findByRole('button', { name: 'Publish results' }))
      fireEvent.click(screen.getByRole('button', { name: 'Confirm publication' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Refresh results')
      expect(screen.getByRole('button', { name: 'Publish results' })).toBeDisabled()
      expect(publish).toHaveBeenCalledTimes(1)
      detail.mockResolvedValue({
        data: { ...election, status: 'CLOSED', results_published_at: publishedAt },
      })
      read.mockResolvedValue({ data: { ...result, results_published_at: publishedAt } })
      fireEvent.click(screen.getByRole('button', { name: 'Refresh results' }))
      expect(await screen.findByRole('heading', { name: 'Published result' })).toBeInTheDocument()
      expect(publish).toHaveBeenCalledTimes(1)
    },
  )

  it('discards stale result responses after navigation', async () => {
    const { detail, read } = setupResults()
    const old = deferred<{ data: Result }>()
    read
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ data: { ...result, election_id: '2002', winner_candidate_id: null } })
    mount('results')
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1))
    detail.mockResolvedValue({
      data: { ...election, id: '2002', status: 'CLOSED', title: 'Second election' },
    })
    fireEvent.click(screen.getByRole('link', { name: 'Switch election' }))
    await screen.findByRole('heading', { name: 'No winner declared' })
    await act(async () => old.resolve({ data: result }))
    expect(screen.getByText('Second election')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Avery Chen' })).not.toBeInTheDocument()
  })
})
