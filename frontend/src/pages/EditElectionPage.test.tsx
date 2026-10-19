import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Link, MemoryRouter } from 'react-router'
import { api } from '../api'
import { ApiError } from '../api/client'
import type { Election, Role } from '../api/types'
import { AuthContext } from '../store/auth-context'
import { AppRoutes } from '../routes/AppRoutes'
import { electionToFields, buildElectionPatch } from '../shared/electionPatch'

const election: Election = {
  id: '9007199254740993',
  title: 'Editable draft election',
  position_title: 'Class representative',
  description: 'Original description',
  created_by: '1',
  status: 'DRAFT',
  privacy_mode: 'FORCED_ANONYMOUS',
  starts_at: '2026-10-20T01:00:23Z',
  ends_at: '2026-10-20T09:00:45Z',
  results_published_at: null,
  created_at: '',
  updated_at: '',
}
function mount(role: Role | null = 'ADMIN', route = `/elections/${election.id}/edit`) {
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
        <Link to="/elections/2002/edit">Switch election</Link>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}
async function changeTitle(title = 'Edited title') {
  await screen.findByRole('heading', { name: 'Edit election' })
  fireEvent.change(screen.getByLabelText('Election name *'), { target: { value: title } })
}
describe('edit draft election', () => {
  it('loads original data without requesting candidates or a voter list', async () => {
    const detail = vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    const candidates = vi.spyOn(api, 'candidates')
    const voters = vi.spyOn(api, 'voters')
    const update = vi.spyOn(api, 'updateElection')
    mount()
    expect(await screen.findByLabelText('Election name *')).toHaveValue(election.title)
    expect(screen.getByLabelText('Description (optional)')).toHaveValue(election.description)
    expect(
      new Date((screen.getByLabelText('Opens at *') as HTMLInputElement).value).getTime(),
    ).toBe(new Date(election.starts_at).getTime())
    expect(screen.queryByText('Voter IDs *')).not.toBeInTheDocument()
    expect(detail).toHaveBeenCalledWith(election.id)
    expect(candidates).not.toHaveBeenCalled()
    expect(voters).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByText('No changes to save.')).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  })

  it('sends only a changed title and returns to authoritative detail', async () => {
    vi.spyOn(api, 'election')
      .mockResolvedValueOnce({ data: election })
      .mockResolvedValue({ data: { ...election, title: 'Edited title' } })
    vi.spyOn(api, 'candidates').mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 20, total: 0 },
    })
    const update = vi
      .spyOn(api, 'updateElection')
      .mockResolvedValue({ data: { ...election, title: 'Edited title' } })
    mount()
    await changeTitle()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('heading', { name: 'Edited title' })).toBeInTheDocument()
    expect(update).toHaveBeenCalledExactlyOnceWith(election.id, { title: 'Edited title' })
  })

  it('clears the nullable description with null and preserves unchanged time instants', () => {
    const fields = electionToFields(election)
    expect(buildElectionPatch({ ...fields, description: '' }, election).patch).toEqual({
      description: null,
    })
    expect(buildElectionPatch(fields, election).patch).toEqual({})
    expect(
      buildElectionPatch({ ...fields, starts_at: fields.starts_at + '.000' }, election).patch,
    ).toEqual({})
    expect(
      buildElectionPatch({ ...fields, starts_at: fields.starts_at + '.001' }, election).errors
        .starts_at,
    ).toBeDefined()
    expect(fields.starts_at).toMatch(/:23$/)
    const updatedTime = new Date(new Date(election.ends_at).getTime() + 60000).toISOString()
    const newEnd = electionToFields({ ...election, ends_at: updatedTime }).ends_at
    expect(buildElectionPatch({ ...fields, ends_at: newEnd }, election).patch).toEqual({
      ends_at: updatedTime.replace('.000Z', 'Z'),
    })
  })

  it('validates merged time ranges without sending an invalid PATCH', async () => {
    vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    const update = vi.spyOn(api, 'updateElection')
    mount()
    await screen.findByRole('heading', { name: 'Edit election' })
    fireEvent.change(screen.getByLabelText('Closes at *'), {
      target: { value: electionToFields(election).starts_at },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByText('The end time must be after the start time.')).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  })

  it.each(['OPEN', 'CLOSED'] as const)('refuses to edit %s elections', async (status) => {
    vi.spyOn(api, 'election').mockResolvedValue({ data: { ...election, status } })
    const update = vi.spyOn(api, 'updateElection')
    mount()
    expect(
      await screen.findByRole('heading', { name: 'This election cannot be edited' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  })

  it.each(['USER', null] as const)('does not load data when identity is %s', async (role) => {
    const detail = vi.spyOn(api, 'election')
    mount(role)
    expect(
      await screen.findByRole('heading', { name: role ? 'No access' : 'Sign in' }),
    ).toBeInTheDocument()
    expect(detail).not.toHaveBeenCalled()
  })

  it('retains input on a validation rejection and allows explicit correction', async () => {
    vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    const update = vi
      .spyOn(api, 'updateElection')
      .mockRejectedValue(new ApiError('VALIDATION_ERROR', 422))
    mount()
    await changeTitle()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Some fields are invalid')
    expect(screen.getByLabelText('Election name *')).toHaveValue('Edited title')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('blocks another save after a state conflict and reloads the new OPEN state', async () => {
    const detail = vi
      .spyOn(api, 'election')
      .mockResolvedValueOnce({ data: election })
      .mockResolvedValue({ data: { ...election, status: 'OPEN' } })
    const update = vi
      .spyOn(api, 'updateElection')
      .mockRejectedValue(new ApiError('ELECTION_NOT_EDITABLE', 409))
    mount()
    await changeTitle()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only draft elections can be edited')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.getByLabelText('Election name *')).toHaveValue('Edited title')
    fireEvent.click(screen.getByRole('button', { name: 'Reload latest data' }))
    expect(
      await screen.findByRole('heading', { name: 'This election cannot be edited' }),
    ).toBeInTheDocument()
    expect(detail).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('does not automatically repeat a timed-out save', async () => {
    vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    const update = vi
      .spyOn(api, 'updateElection')
      .mockRejectedValue(new ApiError('REQUEST_ABORTED'))
    mount()
    await changeTitle()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A timeout does not mean')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('ignores late details from a previously visited election', async () => {
    let finishOld!: (value: { data: Election }) => void
    const old = new Promise<{ data: Election }>((resolve) => {
      finishOld = resolve
    })
    const detail = vi
      .spyOn(api, 'election')
      .mockReturnValueOnce(old)
      .mockResolvedValue({ data: { ...election, id: '2002', title: 'Another draft' } })
    mount()
    await waitFor(() => expect(detail).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('link', { name: 'Switch election' }))
    expect(await screen.findByLabelText('Election name *')).toHaveValue('Another draft')
    await act(async () => finishOld({ data: election }))
    expect(screen.getByLabelText('Election name *')).toHaveValue('Another draft')
  })

  it('prevents double submission while a save is pending', async () => {
    let reject!: (reason: unknown) => void
    const pending = new Promise<{ data: Election }>((_resolve, rejectPromise) => {
      reject = rejectPromise
    })
    vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    const update = vi.spyOn(api, 'updateElection').mockReturnValue(pending)
    mount()
    await changeTitle()
    const form = screen.getByRole('button', { name: 'Save changes' }).closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(update).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await act(async () => reject(new ApiError('VALIDATION_ERROR', 422)))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled())
  })
})
