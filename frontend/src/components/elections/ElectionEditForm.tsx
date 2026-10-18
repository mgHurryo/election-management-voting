import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import type { Election, ElectionPatch } from '../../api/types'
import type { ElectionFormErrors } from '../../shared/electionForm'
import { buildElectionPatch, electionToFields } from '../../shared/electionPatch'
import { errorMessage } from '../../shared/errors'
import { ElectionFields } from './ElectionFields'

interface Props {
  election: Election
  onSave: (patch: ElectionPatch) => Promise<void>
  saving: boolean
  error: unknown
  blocked: boolean
  reload: () => void
  detailPath?: string
}

export function ElectionEditForm({
  election,
  onSave,
  saving,
  error,
  blocked,
  reload,
  detailPath = `/elections/${encodeURIComponent(election.id)}`,
}: Props) {
  const [values, setValues] = useState(() => electionToFields(election))
  const [errors, setErrors] = useState<ElectionFormErrors>({})
  const [notice, setNotice] = useState('')

  if (election.status !== 'DRAFT') {
    return (
      <div className="wrap">
        <div className="phead">
          <h1>This election cannot be edited</h1>
        </div>
        <div className="state">
          <p>Only draft elections can be edited. This election is open or closed.</p>
          <p className="actions">
            <Link className="btn ghost" to={detailPath}>
              Back to election
            </Link>
          </p>
        </div>
      </div>
    )
  }

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setNotice('')
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || blocked) return
    const result = buildElectionPatch(values, election)
    setErrors(result.errors)
    setNotice('')
    if (!result.patch) return
    if (!Object.keys(result.patch).length) {
      setNotice('No changes to save.')
      return
    }
    void onSave(result.patch)
  }

  return (
    <div className="wrap">
      <div className="phead">
        <h1>Edit election</h1>
      </div>
      <p className="lsub" style={{ textAlign: 'left', margin: '0 0 8px' }}>
        Only the details and schedule of a draft can be changed here. Candidates and the voter roll
        are managed from the election page.
      </p>
      <form className="formbox" onSubmit={submit} noValidate>
        <fieldset disabled={saving || blocked} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="visually-hidden">Election details</legend>
          <ElectionFields
            values={values}
            errors={errors}
            idPrefix="edit"
            onChange={(field, value) => update(field, value)}
          />
        </fieldset>
        {notice && (
          <p className="lsub" style={{ textAlign: 'left' }} role="status">
            {notice}
          </p>
        )}
        {error ? (
          <div className="state" role="alert">
            <p>{errorMessage(error)}</p>
            {blocked && (
              <>
                <p>
                  Reload the latest data to continue. Reloading discards the unsaved input on this
                  page.
                </p>
                <div className="actions">
                  <button type="button" className="btn ghost" disabled={saving} onClick={reload}>
                    Reload latest data
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
        <div className="actions">
          <Link className="quiet" to={detailPath}>
            Cancel
          </Link>
          <button className="btn main" type="submit" disabled={saving || blocked}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
