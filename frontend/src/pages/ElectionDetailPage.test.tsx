import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Link, MemoryRouter } from 'react-router'
import { api } from '../api'
import { ApiError } from '../api/client'
import type { Ballot, Candidate, Election, Participation, Role, Paginated } from '../api/types'
import { AuthContext } from '../store/auth-context'
import { AppRoutes } from '../routes/AppRoutes'

const election: Election = {
  id: '9007199254740993',
  title: 'Class representative election',
  position_title: 'Class representative',
  description: 'A class election.',
  status: 'DRAFT',
  privacy_mode: 'FORCED_ANONYMOUS',
  created_by: '1',
  starts_at: '2026-10-20T01:00:00Z',
  ends_at: '2026-10-20T09:00:00Z',
  results_published_at: null,
  created_at: '',
  updated_at: '',
}
const candidate: Candidate = {
  id: '9007199254740995',
  election_id: election.id,
  name: 'Candidate A',
  position_title: 'Class representative',
  description: 'Happy to help classmates and listen carefully.',
  photo_url: null,
  display_order: 0,
  created_at: '',
  updated_at: '',
}
function profiles(
  page = 1,
  total = 2,
  rows: Candidate[] = [candidate, { ...candidate, id: '9007199254740996', name: 'Candidate B' }],
): Paginated<Candidate> {
  return { data: rows, meta: { page, page_size: 20, total } }
}
function ballot(
  rows: Candidate[] = [candidate, { ...candidate, id: '9007199254740996', name: 'Candidate B' }],
): Ballot {
  return {
    election: { ...election, status: 'OPEN' },
    candidates: rows,
    participation: {
      election_id: election.id,
      eligible: true,
      vote_quota: 1,
      used_votes: 0,
      remaining_votes: 1,
    },
  }
}
function mount(role: Role | null = 'ADMIN') {
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
      <MemoryRouter initialEntries={[`/elections/${election.id}`]}>
        <Link to="/elections/2002">Switch election</Link>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('election detail', () => {
  it('renders election facts and read-only candidates for an administrator, using string IDs', async () => {
    const detail = vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    const candidates = vi.spyOn(api, 'candidates').mockResolvedValue(profiles())
    mount()
    expect(await screen.findByRole('heading', { name: election.title })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Candidate A' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Candidate B' })).toBeInTheDocument()
    const pics = document.querySelectorAll('.candidate-list .pic')
    expect(pics.length).toBe(2)
    pics.forEach((p) => expect(p.textContent).toBe('C'))
    expect(screen.getByRole('link', { name: 'Edit election' })).toHaveAttribute(
      'href',
      `/elections/${election.id}/edit`,
    )
    expect(screen.getByRole('link', { name: 'Candidate management' })).toHaveAttribute(
      'href',
      `/elections/${election.id}/candidates`,
    )
    expect(detail).toHaveBeenCalledWith(election.id)
    expect(candidates).toHaveBeenCalledWith(election.id, 1)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('does not request details or profiles before authentication', async () => {
    const detail = vi.spyOn(api, 'election')
    const candidates = vi.spyOn(api, 'candidates')
    mount(null)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(detail).not.toHaveBeenCalled()
    expect(candidates).not.toHaveBeenCalled()
  })

  it('does not query candidates when the election is not visible', async () => {
    vi.spyOn(api, 'election').mockRejectedValue(new ApiError('ELECTION_NOT_FOUND', 404))
    const candidates = vi.spyOn(api, 'candidates')
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This election does not exist or is not visible to you.',
    )
    expect(candidates).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Open voting' })).not.toBeInTheDocument()
  })

  it('explains USER restrictions on a draft without querying profiles', async () => {
    vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    const candidates = vi.spyOn(api, 'candidates')
    mount('USER')
    expect(
      await screen.findByText(
        'Candidate profiles become visible when voting opens and you are eligible.',
      ),
    ).toBeInTheDocument()
    expect(candidates).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Edit election' })).not.toBeInTheDocument()
  })

  it('keeps election facts while explaining an eligibility rejection without fake empty data', async () => {
    vi.spyOn(api, 'election').mockResolvedValue({ data: { ...election, status: 'OPEN' } })
    vi.spyOn(api, 'ballot').mockRejectedValue(new ApiError('NOT_ELIGIBLE', 403))
    vi.spyOn(api, 'candidates').mockResolvedValue(profiles(1, 0, []))
    mount('USER')
    expect(
      await screen.findByText('You are not on the voter roll for this election.'),
    ).toBeInTheDocument()
    expect(document.querySelector('.election-voter-kick')).toHaveTextContent(
      'Class representative election · 0 candidates',
    )
    expect(screen.queryByText('No candidates yet.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close voting' })).not.toBeInTheDocument()
  })

  it('retries candidate loading independently and paginates through the API', async () => {
    const detail = vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    const candidates = vi
      .spyOn(api, 'candidates')
      .mockRejectedValueOnce(new ApiError('NETWORK_ERROR'))
      .mockResolvedValueOnce(profiles(1, 21))
      .mockResolvedValueOnce(profiles(2, 21, [{ ...candidate, name: 'Last candidate' }]))
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Next candidates' }))
    expect(await screen.findByRole('heading', { name: 'Last candidate' })).toBeInTheDocument()
    expect(candidates).toHaveBeenLastCalledWith(election.id, 2)
    expect(detail).toHaveBeenCalledTimes(1)
  })

  it('does not overwrite another election with an old candidate response', async () => {
    let finishOld!: (data: Paginated<Candidate>) => void
    const oldRequest = new Promise<Paginated<Candidate>>((resolve) => {
      finishOld = resolve
    })
    vi.spyOn(api, 'election').mockImplementation(async (id) => ({
      data: { ...election, id, title: id === election.id ? election.title : 'Another election' },
    }))
    const candidates = vi
      .spyOn(api, 'candidates')
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValue(profiles(1, 0, []))
    mount()
    await waitFor(() => expect(candidates).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('link', { name: 'Switch election' }))
    expect(await screen.findByRole('heading', { name: 'Another election' })).toBeInTheDocument()
    expect(await screen.findByText('No candidates yet.')).toBeInTheDocument()
    await act(async () => finishOld(profiles()))
    expect(screen.queryByRole('heading', { name: 'Candidate A' })).not.toBeInTheDocument()
  })

  it('confirms opening once and refreshes the authoritative election state', async () => {
    vi.spyOn(api, 'election')
      .mockResolvedValueOnce({ data: election })
      .mockResolvedValue({ data: { ...election, status: 'OPEN' } })
    vi.spyOn(api, 'candidates').mockResolvedValue(profiles())
    vi.spyOn(api, 'ballot').mockRejectedValue(new ApiError('NOT_ELIGIBLE', 403))
    const open = vi
      .spyOn(api, 'openElection')
      .mockResolvedValue({ data: { ...election, status: 'OPEN' } })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Open voting' }))
    expect(open).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(open).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Open voting' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm open' }))
    expect(await screen.findByRole('button', { name: 'Close voting' })).toBeInTheDocument()
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith(election.id)
  })

  it('does not automatically repeat an uncertain close operation', async () => {
    vi.spyOn(api, 'election').mockResolvedValue({ data: { ...election, status: 'OPEN' } })
    vi.spyOn(api, 'candidates').mockResolvedValue(profiles())
    vi.spyOn(api, 'ballot').mockRejectedValue(new ApiError('NOT_ELIGIBLE', 403))
    const close = vi.spyOn(api, 'closeElection').mockRejectedValue(new ApiError('REQUEST_ABORTED'))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Close voting' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm close' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A timeout does not mean')
    expect(close).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Refresh election status' })).toBeInTheDocument()
  })

  it('sends USER elections with published results straight to the results page', async () => {
    vi.spyOn(api, 'election').mockResolvedValue({
      data: { ...election, status: 'CLOSED', results_published_at: '2026-10-20T10:00:00Z' },
    })
    vi.spyOn(api, 'results').mockResolvedValue({
      data: {
        election_id: election.id,
        position_title: election.position_title,
        results_published_at: '2026-10-20T10:00:00Z',
        total_votes: 2,
        candidates: [{ candidate_id: '9007199254740995', name: 'Candidate A', vote_count: 2 }],
        winner_candidate_id: '9007199254740995',
      },
    })
    const candidates = vi.spyOn(api, 'candidates')
    mount('USER')
    expect(await screen.findByRole('heading', { name: 'Published result' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All elections' })).toHaveAttribute(
      'href',
      '/elections',
    )
    expect(candidates).not.toHaveBeenCalled()
  })

  it('sends USER elections that closed without published results to the results page', async () => {
    vi.spyOn(api, 'election').mockResolvedValue({ data: { ...election, status: 'CLOSED' } })
    const candidates = vi.spyOn(api, 'candidates')
    mount('USER')
    expect(
      await screen.findByRole('heading', { name: 'Results are not published' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'The administrator has not published the final result yet. Check back later.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All elections' })).toHaveAttribute(
      'href',
      '/elections',
    )
    expect(candidates).not.toHaveBeenCalled()
  })

  it('falls back when a candidate photo fails and treats the profile as plain text', async () => {
    vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    vi.spyOn(api, 'candidates').mockResolvedValue(
      profiles(1, 1, [
        {
          ...candidate,
          photo_url: 'https://example.invalid/photo.jpg',
          description: '<script>not executable</script>',
        },
      ]),
    )
    mount()
    const image = await screen.findByAltText("Candidate A's photo")
    fireEvent.error(image)
    const pic = document.querySelector('.candidate-list .pic')
    expect(pic?.textContent).toBe('C')
    expect(screen.getByText('<script>not executable</script>')).toBeInTheDocument()
    expect(document.querySelector('label script')).toBeNull()
  })
})

describe('in-place voting', () => {
  function mountVoter() {
    vi.spyOn(api, 'election').mockResolvedValue({ data: { ...election, status: 'OPEN' } })
    vi.spyOn(api, 'candidates').mockResolvedValue(profiles())
    const vote = vi.spyOn(api, 'vote').mockResolvedValue({
      data: { election_id: election.id, accepted: true },
    })
    const ballotSpy = vi.spyOn(api, 'ballot').mockResolvedValue({ data: ballot() })
    mount('USER')
    return { vote, ballotSpy }
  }

  it('selects a candidate in place, confirms the irrevocable warning, and shows the receipt', async () => {
    const { vote } = mountVoter()

    await screen.findByRole('heading', { name: 'Candidate List' })
    await waitFor(() => expect(screen.getAllByRole('radio', { hidden: true }).length).toBe(2))
    fireEvent.click(screen.getAllByRole('radio', { hidden: true })[0])
    expect(document.querySelector('.bpick')?.textContent).toContain('You selected Candidate A')
    const submit = screen.getByRole('button', { name: 'Review and submit' })
    fireEvent.click(submit)
    expect(
      screen.getByText('Once submitted, this ballot cannot be changed, withdrawn, or deleted.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Submit — irrevocable' }))

    expect(vote).toHaveBeenCalledTimes(1)
    expect(vote).toHaveBeenCalledWith(election.id, candidate.id)
    expect(await screen.findByRole('heading', { name: 'Ballot cast.' })).toBeInTheDocument()
    expect(screen.getByText('RECEIVED')).toBeInTheDocument()
  })

  it('offers display modes and keeps the selection across mode switches', async () => {
    const { vote } = mountVoter()

    await screen.findByRole('radio', { name: 'Candidate A' })
    fireEvent.click(screen.getByRole('radio', { name: /Candidate B/, hidden: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Compact grid' }))
    expect(screen.getByRole('radio', { name: /Candidate B/, hidden: true })).toBeChecked()
    expect(vote).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Review and submit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit — irrevocable' }))
    expect(await screen.findByRole('heading', { name: 'Ballot cast.' })).toBeInTheDocument()
  })

  it('explains an ineligible voter instead of offering a ballot', async () => {
    mountVoter()
    vi.spyOn(api, 'ballot').mockRejectedValue(new ApiError('NOT_ELIGIBLE', 403))

    expect(
      await screen.findByText('You are not on the voter roll for this election.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review and submit' })).not.toBeInTheDocument()
  })
})

describe('voting failure recovery', () => {
  function prepare(value = ballot()) {
    vi.spyOn(api, 'election').mockResolvedValue({ data: { ...election, status: 'OPEN' } })
    vi.spyOn(api, 'candidates').mockResolvedValue(profiles())
    return vi.spyOn(api, 'ballot').mockResolvedValue({ data: value })
  }
  function participation(used: number, quota = 1): Participation {
    return {
      election_id: election.id,
      eligible: true,
      vote_quota: quota,
      used_votes: used,
      remaining_votes: quota - used,
    }
  }
  async function confirm() {
    fireEvent.click(await screen.findByRole('radio', { name: 'Candidate A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review and submit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit — irrevocable' }))
  }

  it('keeps profiles visible but never substitutes candidates for a missing ballot endpoint', async () => {
    prepare().mockRejectedValue(new ApiError('ROUTE_NOT_FOUND', 404))
    const vote = vi.spyOn(api, 'vote')
    mount('USER')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'not available on the current backend',
    )
    expect(await screen.findByRole('heading', { name: 'Candidate A' })).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(vote).not.toHaveBeenCalled()
  })

  it('sends voters of an election the server calls ended straight to the results page', async () => {
    vi.spyOn(api, 'election').mockResolvedValue({ data: { ...election, status: 'OPEN' } })
    vi.spyOn(api, 'candidates').mockRejectedValue(new ApiError('VOTING_ENDED', 409))
    vi.spyOn(api, 'ballot').mockRejectedValue(new ApiError('VOTING_ENDED', 409))
    mount('USER')
    expect(await screen.findByRole('heading', { name: 'Voting has ended' })).toBeInTheDocument()
    expect(screen.getByText(/not published yet/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Candidate List' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('does not offer another ballot after the authoritative quota is exhausted', async () => {
    const used = ballot()
    used.participation = { ...used.participation, used_votes: 1, remaining_votes: 0 }
    prepare(used)
    mount('USER')
    expect(
      await screen.findByText('You have already voted and cannot vote again.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('shows all ballot candidates, including those beyond the first profile page', async () => {
    prepare(
      ballot(
        Array.from({ length: 23 }, (_, index) => ({
          ...candidate,
          id: String(index + 10),
          name: `Person ${index}`,
        })),
      ),
    )
    mount('USER')
    expect(await screen.findByRole('radio', { name: 'Person 0' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.queryByRole('radio', { name: 'Person 22' })).not.toBeInTheDocument()
    for (let page = 1; page < 6; page += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(await screen.findByRole('radio', { name: 'Person 22' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('freezes the reviewed choice and prevents concurrent submissions', async () => {
    prepare()
    let finish!: (value: Awaited<ReturnType<typeof api.vote>>) => void
    const vote = vi.spyOn(api, 'vote').mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    mount('USER')
    await confirm()
    expect(screen.getByRole('radio', { name: 'Candidate B' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Go back' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Submitting…' }))
    expect(vote).toHaveBeenCalledTimes(1)
    await act(async () => finish({ data: { election_id: election.id, accepted: true } }))
    expect(await screen.findByRole('heading', { name: 'Ballot cast.' })).toBeInTheDocument()
    expect(screen.queryByText(/Submitted at.*Candidate A/)).not.toBeInTheDocument()
  })

  it.each([
    new ApiError('REQUEST_ABORTED'),
    new ApiError('INVALID_RESPONSE', 201),
    new ApiError('REQUEST_FAILED', 500),
  ])('blocks uncertain submissions without retrying after %s', async (error) => {
    prepare()
    const vote = vi.spyOn(api, 'vote').mockRejectedValue(error)
    mount('USER')
    await confirm()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit — irrevocable' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Refresh voting status' })).toBeInTheDocument()
    expect(vote).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('heading', { name: 'Ballot cast.' })).not.toBeInTheDocument()
  })

  it('reconciles an accepted ballot through the participation endpoint', async () => {
    prepare()
    const detailRead = vi.spyOn(api, 'election')
    const vote = vi.spyOn(api, 'vote').mockRejectedValue(new ApiError('REQUEST_ABORTED'))
    const status = vi.spyOn(api, 'participation').mockResolvedValue({ data: participation(1) })
    mount('USER')
    await confirm()
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh voting status' }))
    expect(
      await screen.findByText('You have already voted and cannot vote again.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Submit/ })).not.toBeInTheDocument()
    expect(status).toHaveBeenCalledTimes(1)
    expect(detailRead).toHaveBeenCalledTimes(1)
    expect(vote).toHaveBeenCalledTimes(1)
  })

  it('restores the ballot when votes remain and the window is still open', async () => {
    const ballotRead = prepare()
    const vote = vi.spyOn(api, 'vote').mockRejectedValue(new ApiError('REQUEST_FAILED', 500))
    vi.spyOn(api, 'participation').mockResolvedValue({ data: participation(0) })
    mount('USER')
    await confirm()
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh voting status' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Candidate A' })).toBeEnabled())
    expect(screen.getByRole('button', { name: 'Review and submit' })).toBeEnabled()
    expect(ballotRead).toHaveBeenCalledTimes(2)
    expect(vote).toHaveBeenCalledTimes(1)
  })

  it('explains a closed election instead of restoring the ballot', async () => {
    vi.spyOn(api, 'election')
      .mockResolvedValueOnce({ data: { ...election, status: 'OPEN' } })
      .mockResolvedValue({ data: { ...election, status: 'CLOSED' } })
    vi.spyOn(api, 'candidates').mockResolvedValue(profiles())
    const ballotRead = vi.spyOn(api, 'ballot').mockResolvedValue({ data: ballot() })
    const vote = vi.spyOn(api, 'vote').mockRejectedValue(new ApiError('REQUEST_ABORTED'))
    vi.spyOn(api, 'participation').mockResolvedValue({ data: participation(0) })
    mount('USER')
    await confirm()
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh voting status' }))
    expect(
      await screen.findByText('Voting has closed. You used 0 of 1 allowed votes.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(ballotRead).toHaveBeenCalledTimes(1)
    expect(vote).toHaveBeenCalledTimes(1)
  })

  it('keeps the status check retryable when the participation request itself fails', async () => {
    prepare()
    vi.spyOn(api, 'vote').mockRejectedValue(new ApiError('REQUEST_ABORTED'))
    const status = vi
      .spyOn(api, 'participation')
      .mockRejectedValueOnce(new ApiError('REQUEST_FAILED', 500))
      .mockResolvedValue({ data: participation(1) })
    mount('USER')
    await confirm()
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh voting status' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh voting status' }))
    expect(
      await screen.findByText('You have already voted and cannot vote again.'),
    ).toBeInTheDocument()
    expect(status).toHaveBeenCalledTimes(2)
  })

  it('does not show a receipt for an invalid success payload', async () => {
    prepare()
    vi.spyOn(api, 'vote').mockResolvedValue({
      data: { election_id: 'another-election', accepted: true },
    })
    mount('USER')
    await confirm()
    expect(await screen.findByRole('alert')).toHaveTextContent('unrecognized response')
    expect(screen.queryByRole('heading', { name: 'Ballot cast.' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit — irrevocable' })).toBeDisabled()
  })
})
