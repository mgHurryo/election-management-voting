import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import type { ElectionInput } from '../../api/types'
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

  function update(field: keyof ElectionFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || uncertain) return
    const result = validateElectionForm(values)
    setErrors(result.errors)
    if (result.input) void onSubmit(result.input)
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
              {fieldError('voters')}
            </div>
            <p className="lsub election-create-voter-help">
              Separate IDs with commas, spaces or new lines. Only existing active voter IDs; no
              duplicates. IDs are provided by the backend; accounts are not created here.
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
