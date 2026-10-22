import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import type { Candidate, CandidateInput, Election, Paginated } from '../api/types'
import { ErrorState, LoadingState } from '../components/AsyncState'
import { errorMessage } from '../shared/errors'
import './CandidateManagementPage.css'

interface CandidateFields {
  name: string
  description: string
  photo_url: string
  display_order: string
}

interface CandidateSnapshot {
  key: string
  election: Election | null
  data: Paginated<Candidate> | null
  error: unknown
}

const emptyFields: CandidateFields = {
  name: '',
  description: '',
  photo_url: '',
  display_order: '0',
}

function toFields(candidate: Candidate): CandidateFields {
  return {
    name: candidate.name,
    description: candidate.description,
    photo_url: candidate.photo_url ?? '',
    display_order: String(candidate.display_order),
  }
}

function candidateInput(fields: CandidateFields): CandidateInput {
  return {
    name: fields.name.trim(),
    description: fields.description.trim(),
    photo_url: fields.photo_url.trim() || null,
    display_order: Number(fields.display_order),
  }
}

export default function CandidateManagementPage() {
  const { id = '' } = useParams()
  return <CandidateManagementContent key={id} id={id} />
}

function CandidateManagementContent({ id }: { id: string }) {
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const requestKey = `${id}/${page}/${revision}`
  const [snapshot, setSnapshot] = useState<CandidateSnapshot>({
    key: '',
    election: null,
    data: null,
    error: null,
  })
  const [mutationError, setMutationError] = useState<unknown>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [fields, setFields] = useState<CandidateFields>(emptyFields)
  const [editing, setEditing] = useState<Candidate | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Keep both resources in sync for one election/page; stale route responses are discarded.
  const load = useCallback(async () => {
    const [electionResult, candidateResult] = await Promise.all([
      api.election(id),
      api.candidates(id, page),
    ])
    return { election: electionResult.data, candidates: candidateResult }
  }, [id, page])

  useEffect(() => {
    let active = true
    load().then(
      (result) => {
        if (!active) return
        setSnapshot({
          key: requestKey,
          election: result.election,
          data: result.candidates,
          error: null,
        })
      },
      (error: unknown) => {
        if (!active) return
        setSnapshot({ key: requestKey, election: null, data: null, error })
      },
    )
    return () => {
      active = false
    }
  }, [load, requestKey])

  function startCreate() {
    setEditing(null)
    setFields(emptyFields)
    setMutationError(null)
    setEditorOpen(true)
  }

  function startEdit(candidate: Candidate) {
    setEditing(candidate)
    setFields(toFields(candidate))
    setMutationError(null)
    setEditorOpen(true)
  }

  function cancelEdit() {
    setEditing(null)
    setFields(emptyFields)
    setMutationError(null)
    setEditorOpen(false)
  }

  function updateField(field: keyof CandidateFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const photoUrl = fields.photo_url.trim()
    if (photoUrl) {
      try {
        if (new URL(photoUrl).protocol !== 'https:') throw new Error('https required')
      } catch {
        setMutationError(new Error('The photo link must be a valid HTTPS address.'))
        return
      }
    }
    setPending(true)
    setMutationError(null)
    try {
      const input = candidateInput(fields)
      if (!input.name || !input.description) {
        setMutationError(new Error('Name and description cannot be blank.'))
        return
      }
      if (editing) await api.updateCandidate(id, editing.id, input)
      else await api.addCandidate(id, input)
      cancelEdit()
      setRevision((value) => value + 1)
    } catch (error) {
      setMutationError(error)
    } finally {
      setPending(false)
    }
  }

  async function removeCandidate(candidateId: string) {
    if (pending) return
    setPending(true)
    setMutationError(null)
    try {
      await api.deleteCandidate(id, candidateId)
      setConfirmDelete(null)
      if (data?.data.length === 1 && page > 1) setPage((value) => value - 1)
      else setRevision((value) => value + 1)
    } catch (error) {
      setMutationError(error)
    } finally {
      setPending(false)
    }
  }

  const loading = snapshot.key !== requestKey
  if (loading) return <LoadingState />
  if (snapshot.error)
    return (
      <ErrorState
        error={snapshot.error}
        retry={() => setRevision((value) => value + 1)}
        backTo={`/elections/${encodeURIComponent(id)}`}
        backLabel="Back to election"
      />
    )
  const election = snapshot.election
  const data = snapshot.data
  if (!election || !data) return null

  const canEdit = election.status === 'DRAFT'
  const totalPages = Math.max(1, Math.ceil(data.meta.total / data.meta.page_size))

  return (
    <section className="candidate-management" aria-labelledby="candidate-management-heading">
      <div className="candidate-backbar">
        <Link className="quiet" to={`/elections/${encodeURIComponent(id)}`}>
          Back to election
        </Link>
      </div>
      <header className="candidate-page-heading">
        <div>
          <h1 id="candidate-management-heading">{election.title}</h1>
          <p className="candidate-page-subtitle">Candidates for {election.position_title}</p>
        </div>
        {canEdit && !editorOpen && (
          <button className="btn main candidate-add-button" type="button" onClick={startCreate}>
            Add candidate
          </button>
        )}
      </header>

      <div className="candidate-management-meta" aria-label="Election status and candidate count">
        <span className={`candidate-status candidate-status-${election.status.toLowerCase()}`}>
          {election.status === 'DRAFT' ? 'Draft' : election.status === 'OPEN' ? 'Open' : 'Closed'}
        </span>
        <span className="candidate-count">{data.meta.total} candidates</span>
        {!canEdit && (
          <span className="candidate-lock-note">
            Candidate details are locked once voting opens
          </span>
        )}
      </div>

      {editorOpen && canEdit ? (
        <form className="candidate-editor" onSubmit={(event) => void submit(event)}>
          <div className="editor-heading">
            <div>
              <h2>{editing ? 'Edit candidate' : 'Add candidate'}</h2>
              <p>
                {editing
                  ? 'Update this candidate’s ballot profile.'
                  : 'Enter the profile that voters will see.'}
              </p>
            </div>
          </div>
          <fieldset
            className="candidate-form-grid"
            disabled={pending}
            aria-label="Candidate details"
          >
            <div className="candidate-form-identity">
              <label className="field">
                <span>Name *</span>
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={fields.name}
                  onChange={(event) => updateField('name', event.target.value)}
                />
              </label>
              <label className="field">
                <span>Display order</span>
                <input
                  type="number"
                  min={0}
                  max={2147483647}
                  value={fields.display_order}
                  onChange={(event) => updateField('display_order', event.target.value)}
                />
              </label>
              <label className="field">
                <span>Photo URL (https)</span>
                <input
                  type="url"
                  inputMode="url"
                  maxLength={500}
                  placeholder="https://example.org/photo.jpg"
                  value={fields.photo_url}
                  onChange={(event) => updateField('photo_url', event.target.value)}
                />
              </label>
            </div>
            <label className="field candidate-form-description">
              <span>Description *</span>
              <textarea
                required
                maxLength={10000}
                rows={7}
                value={fields.description}
                onChange={(event) => updateField('description', event.target.value)}
              />
            </label>
          </fieldset>
          {Boolean(mutationError) && (
            <p className="form-error candidate-form-error" role="alert">
              {mutationError instanceof Error &&
              (mutationError.message.includes('HTTPS') ||
                mutationError.message.includes('cannot be blank'))
                ? mutationError.message
                : errorMessage(mutationError)}
            </p>
          )}
          <div className="candidate-editor-actions">
            <button type="button" className="quiet" onClick={cancelEdit} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="btn main" disabled={pending}>
              {pending ? 'Saving…' : editing ? 'Save' : 'Add candidate'}
            </button>
          </div>
        </form>
      ) : null}

      {Boolean(mutationError) && !editorOpen && (
        <div className="state error" role="alert">
          <p>{errorMessage(mutationError)}</p>
        </div>
      )}

      {data.data.length === 0 ? (
        <div className="candidate-empty" role="status">
          <h2>No candidates yet</h2>
          <p>
            {canEdit
              ? 'Add candidate profiles to prepare this election.'
              : 'This election has no candidate profiles.'}
          </p>
          {canEdit && !editorOpen && (
            <button className="btn main" type="button" onClick={startCreate}>
              Add candidate
            </button>
          )}
        </div>
      ) : (
        <div className="candidate-table-wrap">
          <table className="candidate-table">
            <caption>Candidates are listed in display order; ties follow creation order.</caption>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Candidate</th>
                <th scope="col">Description</th>
                <th scope="col">Photo</th>
                {canEdit && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data.data.map((candidate) => (
                <tr key={candidate.id}>
                  <td data-label="Order">{candidate.display_order}</td>
                  <th scope="row" data-label="Candidate">
                    {candidate.name}
                  </th>
                  <td data-label="Description" className="candidate-description-cell">
                    {candidate.description}
                  </td>
                  <td data-label="Photo">
                    {candidate.photo_url?.startsWith('https://') ? (
                      <a
                        className="candidate-photo-link"
                        href={candidate.photo_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View photo
                      </a>
                    ) : (
                      <span className="muted-text">None</span>
                    )}
                  </td>
                  {canEdit && (
                    <td data-label="Actions" className="candidate-row-actions">
                      {confirmDelete === candidate.id ? (
                        <span className="delete-confirmation">
                          <span>Delete this candidate?</span>
                          <button
                            className="candidate-danger-action"
                            disabled={pending}
                            type="button"
                            onClick={() => void removeCandidate(candidate.id)}
                          >
                            Confirm delete
                          </button>
                          <button
                            className="quiet candidate-row-action"
                            type="button"
                            onClick={() => setConfirmDelete(null)}
                            disabled={pending}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <span className="row-action-buttons">
                          <button
                            className="quiet candidate-row-action"
                            type="button"
                            disabled={pending}
                            onClick={() => startEdit(candidate)}
                          >
                            Edit
                          </button>
                          <button
                            className="candidate-danger-action"
                            disabled={pending}
                            type="button"
                            onClick={() => {
                              setMutationError(null)
                              setConfirmDelete(candidate.id)
                            }}
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.meta.total > data.meta.page_size && (
        <nav className="candidate-management-pagination" aria-label="Candidate pagination">
          <button
            className="quiet candidate-row-action"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            className="quiet candidate-row-action"
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  )
}
