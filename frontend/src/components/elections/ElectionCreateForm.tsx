import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import type { ElectionInput } from '../../api/types'
import { useEligibleVoters } from '../../hooks/useEligibleVoters'
import type { ElectionFormErrors, ElectionFormValues } from '../../shared/electionForm'
import { validateElectionForm } from '../../shared/electionForm'
import { errorMessage } from '../../shared/errors'
import { ElectionFields } from './ElectionFields'
import './ElectionCreateForm.css'

interface Props {
  onSubmit: (input: ElectionInput) => Promise<void>
  pending: boolean
  error: unknown
  uncertain: boolean
  allowAfterReview: () => void
  cancelPath?: string
}

export function ElectionCreateForm({
  onSubmit,
  pending,
  error,
  uncertain,
  allowAfterReview,
  cancelPath = '/elections',
}: Props) {
  const [values, setValues] = useState<ElectionFormValues>({
    title: '',
    position_title: '',
    description: '',
    starts_at: '',
    ends_at: '',
    voters: '',
  })
  const [errors, setErrors] = useState<ElectionFormErrors>({})
  const [individualIds, setIndividualIds] = useState([''])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const voterRoster = useEligibleVoters()

  function update(field: keyof ElectionFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || uncertain) return
    const combined = [...selectedIds, ...individualIds.map((id) => id.trim()).filter(Boolean)]
    const result = validateElectionForm({
      ...values,
      voters: [values.voters, ...combined].filter(Boolean).join('\n'),
    })
    setErrors(result.errors)
    if (result.input) void onSubmit(result.input)
  }

  async function importFile(file: File) {
    if (file.size > 1_000_000) {
      setErrors((current) => ({
        ...current,
        voters: 'The voter ID file must be no larger than 1 MB.',
      }))
      return
    }
    try {
      const content = (await file.text()).replace(/^\uFEFF/, '')
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
      const csv = file.name.toLowerCase().endsWith('.csv')
      const firstCell = (line: string) =>
        csv ? line.split(',')[0].trim().replace(/^"|"$/g, '') : line
      const dataLines =
        lines[0] && /^(user_?id|id)$/i.test(firstCell(lines[0])) ? lines.slice(1) : lines
      const ids = dataLines.map(firstCell)
      if (!ids.length || ids.some((id) => !/^[1-9][0-9]*$/.test(id))) {
        setErrors((current) => ({
          ...current,
          voters:
            'Import a .txt ID list or .csv with one voter ID in the first column and an optional user_id header.',
        }))
        return
      }
      update('voters', ids.join('\n'))
    } catch {
      setErrors((current) => ({ ...current, voters: 'Unable to read this voter ID file.' }))
    }
  }

  function fieldError(field: keyof ElectionFormValues) {
    return errors[field] ? (
      <span id={'create-' + field + '-error'} className="form-error" role="alert">
        {errors[field]}
      </span>
    ) : null
  }

  function attributes(field: keyof ElectionFormValues) {
    return {
      'aria-invalid': !!errors[field],
      'aria-describedby': errors[field] ? 'create-' + field + '-error' : undefined,
    }
  }

  return (
    <div className="wrap election-create">
      <div className="phead">
        <h1>Create election</h1>
      </div>
      <form className="formbox" onSubmit={submit} noValidate>
        <fieldset className="election-create-grid" disabled={pending}>
          <legend className="visually-hidden">Election details</legend>
          <section className="election-create-details" aria-labelledby="create-details-heading">
            <h2 id="create-details-heading">Election details</h2>
            <ElectionFields
              values={values}
              errors={errors}
              onChange={update}
              idPrefix="create"
              section="details"
            />
          </section>
          <section
            className="election-create-eligibility"
            aria-labelledby="create-eligibility-heading"
          >
            <h2 id="create-eligibility-heading">Description and eligibility</h2>
            <ElectionFields
              values={values}
              errors={errors}
              onChange={update}
              idPrefix="create"
              section="description"
            />
            <div className="election-create-voters">
              <div className="election-create-voter-picker">
                <div>
                  <h3>Choose existing active voters</h3>
                  <p>
                    Only voter ID and display name are shown. This does not reveal voting activity.
                  </p>
                </div>
                {!voterRoster.loaded ? (
                  <button
                    type="button"
                    className="quiet"
                    disabled={voterRoster.loading}
                    onClick={() => void voterRoster.load(1)}
                  >
                    {voterRoster.loading ? 'Loading voters…' : 'Load voter list'}
                  </button>
                ) : (
                  <>
                    {voterRoster.voters.length ? (
                      <div
                        className="election-create-voter-options"
                        aria-label="Active voter accounts"
                      >
                        {voterRoster.voters.map((voter) => (
                          <label key={voter.user_id}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(voter.user_id)}
                              onChange={(event) =>
                                setSelectedIds((current) =>
                                  event.target.checked
                                    ? [...current, voter.user_id]
                                    : current.filter((id) => id !== voter.user_id),
                                )
                              }
                            />
                            <span>{voter.display_name}</span>
                            <span className="num">ID {voter.user_id}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p role="status">No active voter accounts are available to select.</p>
                    )}
                    <div className="election-create-voter-pages">
                      <span className="num">
                        {selectedIds.length} selected · {voterRoster.total} active accounts
                      </span>
                      {voterRoster.total > voterRoster.pageSize && (
                        <>
                          <button
                            type="button"
                            className="quiet"
                            disabled={voterRoster.loading || voterRoster.page <= 1}
                            onClick={() => void voterRoster.load(voterRoster.page - 1)}
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            className="quiet"
                            disabled={
                              voterRoster.loading ||
                              voterRoster.page * voterRoster.pageSize >= voterRoster.total
                            }
                            onClick={() => void voterRoster.load(voterRoster.page + 1)}
                          >
                            Next
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
                {voterRoster.error && (
                  <p className="form-error" role="alert">
                    {voterRoster.error}
                  </p>
                )}
              </div>
              <div className="election-create-individual-voters">
                <h3>Add voter IDs individually</h3>
                {individualIds.map((id, index) => (
                  <div className="election-create-individual-row" key={index}>
                    <label className="lfield">
                      <span>Voter ID {index + 1}</span>
                      <input
                        inputMode="numeric"
                        autoComplete="off"
                        value={id}
                        aria-invalid={Boolean(errors.voters)}
                        aria-describedby={errors.voters ? 'create-voters-error' : undefined}
                        onChange={(event) =>
                          setIndividualIds((current) =>
                            current.map((value, i) => (i === index ? event.target.value : value)),
                          )
                        }
                      />
                    </label>
                    {individualIds.length > 1 && (
                      <button
                        type="button"
                        className="quiet"
                        onClick={() =>
                          setIndividualIds((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="quiet"
                  onClick={() => setIndividualIds((current) => [...current, ''])}
                >
                  Add another voter
                </button>
              </div>
              <label className="lfield">
                <span>Voter IDs *</span>
                <textarea
                  name="voters"
                  rows={6}
                  value={values.voters}
                  onChange={(event) => update('voters', event.target.value)}
                  {...attributes('voters')}
                />
              </label>
              <label className="lfield">
                <span>Import .txt or .csv</span>
                <input
                  type="file"
                  accept=".txt,.csv,text/plain,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void importFile(file)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
              {fieldError('voters')}
            </div>
            <p className="lsub election-create-voter-help">
              IDs must match existing active USER accounts. Paste lists may use commas, spaces or
              new lines. TXT files contain IDs; CSV files use one ID per row in the first column,
              optionally headed user_id. Duplicate or unknown IDs are rejected by the server.
            </p>
          </section>
        </fieldset>
        {error ? (
          <div className="state" role="alert">
            <p>{errorMessage(error)}</p>
            {uncertain && (
              <>
                <p>
                  The outcome is not confirmed. Check the election list before retrying to avoid
                  duplicates.
                </p>
                <div className="actions">
                  <Link className="btn ghost" to={cancelPath}>
                    Open the list
                  </Link>
                  <button type="button" onClick={allowAfterReview}>
                    Reviewed — allow resubmission
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
        <div className="actions">
          <Link className="quiet" to={cancelPath}>
            Cancel
          </Link>
          <button className="btn main" type="submit" disabled={pending || uncertain}>
            {pending ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      </form>
    </div>
  )
}
