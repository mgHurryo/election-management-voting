import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { api } from '../api'
import { ApiError } from '../api/client'
import type { Election, Role, VoterOption } from '../api/types'
import { AuthContext } from '../store/auth-context'
import { AppRoutes } from '../routes/AppRoutes'
import { validateElectionForm } from '../shared/electionForm'

const election: Election = {
  id: '9007199254740993',
  title: 'New class representative election',
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
const values = {
  title: 'New class representative election',
  position_title: 'Class representative',
  description: '',
  starts_at: '2026-10-20T09:00',
  ends_at: '2026-10-20T17:00',
  voters: '21,9007199254740995',
}
function mount(role: Role | null = 'ADMIN', route = '/elections/new') {
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
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}
async function fill() {
  await screen.findByRole('heading', { name: 'Create election' })
  fireEvent.change(screen.getByLabelText('Election name *'), { target: { value: values.title } })
  fireEvent.change(screen.getByLabelText('Position *'), {
    target: { value: values.position_title },
  })
  fireEvent.change(screen.getByLabelText('Opens at *'), { target: { value: values.starts_at } })
  fireEvent.change(screen.getByLabelText('Closes at *'), { target: { value: values.ends_at } })
  fireEvent.change(screen.getByLabelText('Voter IDs *'), { target: { value: values.voters } })
}

function upload(name: string, read: () => Promise<string>, size = 0) {
  const file = new File([], name)
  Object.defineProperty(file, 'text', { value: read })
  Object.defineProperty(file, 'size', { value: size })
  fireEvent.change(screen.getByLabelText('Import .txt or .csv'), { target: { files: [file] } })
}

describe('create election', () => {
  it('blocks submission until the file is read and then submits the imported roster', async () => {
    const create = vi.spyOn(api, 'createElection').mockResolvedValue({ data: election })
    vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    vi.spyOn(api, 'candidates').mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 20, total: 0 },
    })
    let finish!: (text: string) => void
    const reading = new Promise<string>((resolve) => {
      finish = resolve
    })
    mount()
    await fill()
    upload('voters.txt', () => reading)
    const submit = screen.getByRole('button', { name: 'Create draft' })
    expect(submit).toBeDisabled()
    expect(screen.getByLabelText('Voter IDs *')).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Reading voter ID file')
    fireEvent.submit(submit.closest('form')!)
    expect(create).not.toHaveBeenCalled()

    await act(async () => finish('24'))
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0]![0].voter_ids).toEqual(['24'])
    await screen.findByRole('heading', { name: election.title })
  })

  it.each(['resolve', 'reject'] as const)(
    'ignores an older file read that %ss after the latest',
    async (outcome) => {
      let finish!: (text: string) => void
      let fail!: (error: Error) => void
      const older = new Promise<string>((resolve, reject) => {
        finish = resolve
        fail = reject
      })
      mount()
      await fill()
      upload('older.txt', () => older)
      upload('latest.txt', async () => '24')
      await waitFor(() => expect(screen.getByLabelText('Voter IDs *')).toHaveValue('24'))
      await act(async () => {
        if (outcome === 'resolve') finish('21')
        else fail(new Error('Older read failed'))
      })
      expect(screen.getByLabelText('Voter IDs *')).toHaveValue('24')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create draft' })).toBeEnabled()
    },
  )

  it('keeps submission blocked when an older file finishes before the current file', async () => {
    let finishOlder!: (text: string) => void
    let finishLatest!: (text: string) => void
    const older = new Promise<string>((resolve) => {
      finishOlder = resolve
    })
    const latest = new Promise<string>((resolve) => {
      finishLatest = resolve
    })
    mount()
    await fill()
    upload('older.txt', () => older)
    upload('latest.txt', () => latest)
    await act(async () => finishOlder('21'))
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled()
    expect(screen.getByLabelText('Voter IDs *')).toHaveValue(values.voters)
    await act(async () => finishLatest('24'))
    expect(screen.getByLabelText('Voter IDs *')).toHaveValue('24')
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeEnabled()
  })

  it('invalidates an older read even when the newest file exceeds the size limit', async () => {
    let finish!: (text: string) => void
    const older = new Promise<string>((resolve) => {
      finish = resolve
    })
    const readOversized = vi.fn(async () => '24')
    mount()
    await fill()
    upload('older.txt', () => older)
    upload('oversized.txt', readOversized, 1_000_001)
    await act(async () => finish('21'))
    expect(readOversized).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Voter IDs *')).toHaveValue(values.voters)
    expect(screen.getByRole('alert')).toHaveTextContent('no larger than 1 MB')
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeEnabled()
  })

  it.each([
    ['voters.txt', '\uFEFF21\r\n9007199254740995\r\n'],
    [
      'voters.csv',
      '\uFEFFuser_id,display_name\r\n"21",Voter\r\n9007199254740995,Another voter\r\n',
    ],
  ])('imports %s without losing BIGINT precision', async (name, content) => {
    mount()
    await fill()
    upload(name, async () => content)
    await waitFor(() =>
      expect(screen.getByLabelText('Voter IDs *')).toHaveValue('21\n9007199254740995'),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each(['invalid', 'unreadable'])('retains existing IDs after an %s import', async (kind) => {
    mount()
    await fill()
    upload('voters.txt', async () => {
      if (kind === 'unreadable') throw new Error('Read failed')
      return 'not-an-id'
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      kind === 'unreadable' ? 'Unable to read' : 'Import a .txt ID list',
    )
    expect(screen.getByLabelText('Voter IDs *')).toHaveValue(values.voters)
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeEnabled()
  })

  it('keeps selections across voter pages and submits distinct IDs', async () => {
    const create = vi.spyOn(api, 'createElection').mockResolvedValue({ data: election })
    vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    vi.spyOn(api, 'eligibleVoters').mockImplementation(async (page = 1) => ({
      data: [
        {
          user_id: page === 1 ? '21' : '24',
          display_name: page === 1 ? 'Voter' : 'Second Voter',
        } satisfies VoterOption,
      ],
      meta: { page, page_size: 100, total: 101 },
    }))
    mount()
    await screen.findByRole('heading', { name: 'Create election' })
    fireEvent.change(screen.getByLabelText('Election name *'), { target: { value: values.title } })
    fireEvent.change(screen.getByLabelText('Position *'), {
      target: { value: values.position_title },
    })
    fireEvent.change(screen.getByLabelText('Opens at *'), { target: { value: values.starts_at } })
    fireEvent.change(screen.getByLabelText('Closes at *'), { target: { value: values.ends_at } })
    fireEvent.click(screen.getByRole('button', { name: 'Load voter list' }))
    fireEvent.click((await screen.findByText('Voter')).closest('label')!)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click((await screen.findByText('Second Voter')).closest('label')!)
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))

    await screen.findByRole('heading', { name: election.title })
    expect(create.mock.calls[0]![0].voter_ids).toEqual(['21', '24'])
  })

  it('submits documented fields, preserves BIGINT strings, converts local time, and opens the new detail', async () => {
    const create = vi.spyOn(api, 'createElection').mockResolvedValue({ data: election })
    vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    vi.spyOn(api, 'candidates').mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 20, total: 0 },
    })
    mount()
    await fill()
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    expect(await screen.findByRole('heading', { name: election.title })).toBeInTheDocument()
    expect(create).toHaveBeenCalledTimes(1)
    const input = create.mock.calls[0]![0]
    expect(input.voter_ids).toEqual(['21', '9007199254740995'])
    expect(new Date(input.starts_at).getHours()).toBe(9)
    expect(input.starts_at).toMatch(/:\d{2}Z$/)
    expect(input.description).toBeNull()
    expect(Object.keys(input).sort()).toEqual(
      ['title', 'position_title', 'description', 'starts_at', 'ends_at', 'voter_ids'].sort(),
    )
  })

  it('blocks blank, duplicate ID, and invalid time submissions before requesting the backend', async () => {
    const create = vi.spyOn(api, 'createElection')
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Create draft' }))
    expect(screen.getByText('Enter 1–200 characters for the election name.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
    expect(validateElectionForm({ ...values, voters: '21,21' }).errors.voters).toContain('unique')
    expect(
      validateElectionForm({ ...values, voters: '18446744073709551616' }).errors.voters,
    ).toBeDefined()
    expect(
      validateElectionForm({ ...values, starts_at: values.ends_at }).errors.ends_at,
    ).toBeDefined()
    expect(
      validateElectionForm({ ...values, starts_at: '2026-02-30T09:00' }).errors.starts_at,
    ).toBeDefined()
    expect(validateElectionForm({ ...values, title: '   ' }).errors.title).toBeDefined()
  })

  it('associates voter validation errors with the voter ID field', async () => {
    mount()
    await fill()
    fireEvent.change(screen.getByLabelText('Voter IDs *'), { target: { value: '21,21' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))

    const voters = screen.getByLabelText('Voter IDs *')
    expect(voters).toHaveAttribute('aria-invalid', 'true')
    expect(voters).toHaveAttribute('aria-describedby', 'create-voters-error')
    expect(document.getElementById('create-voters-error')).toHaveTextContent('unique')
  })

  it('rejects USER access without issuing a create request', async () => {
    const create = vi.spyOn(api, 'createElection')
    mount('USER')
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('redirects anonymous visitors to login', async () => {
    const create = vi.spyOn(api, 'createElection')
    mount(null)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('retains form inputs after a known rejection and permits an explicit correction', async () => {
    const create = vi
      .spyOn(api, 'createElection')
      .mockRejectedValue(new ApiError('INVALID_VOTER', 422))
    mount()
    await fill()
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The account is inactive or is not a voter account.',
    )
    expect(screen.getByLabelText('Election name *')).toHaveValue(values.title)
    expect(screen.getByLabelText('Voter IDs *')).toHaveValue(values.voters)
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeEnabled()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('blocks another create after timeout until the user explicitly confirms a review', async () => {
    const create = vi
      .spyOn(api, 'createElection')
      .mockRejectedValue(new ApiError('REQUEST_ABORTED'))
    mount()
    await fill()
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The outcome is not confirmed')
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeDisabled()
    expect(create).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Reviewed — allow resubmission' }))
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeEnabled()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('prevents double submission while the create request is pending', async () => {
    let reject!: (reason: unknown) => void
    const pending = new Promise<{ data: Election }>((_resolve, rejectPromise) => {
      reject = rejectPromise
    })
    const create = vi.spyOn(api, 'createElection').mockReturnValue(pending)
    mount()
    await fill()
    const form = screen.getByRole('button', { name: 'Create draft' }).closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(create).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()
    await act(async () => reject(new ApiError('INVALID_VOTER', 422)))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create draft' })).toBeEnabled())
  })
})
