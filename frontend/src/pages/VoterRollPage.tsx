import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import type { Voter } from '../api/types'
import { ErrorState, LoadingState } from '../components/AsyncState'
import { WorkflowConfirmation } from '../components/elections/WorkflowConfirmation'
import { useVoterRoll } from '../hooks/useVoterRoll'
import { isValidId } from '../shared/ids'
import { errorMessage } from '../shared/errors'
import './ElectionWorkflow.css'

export default function VoterRollPage() {
  const { id = '' } = useParams()
  return <VoterRollContent key={id} id={id} />
}

function VoterRollContent({ id }: { id: string }) {
  const roll = useVoterRoll(id)
  const [userId, setUserId] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [removing, setRemoving] = useState<Voter | null>(null)
  const confirmationTrigger = useRef<HTMLButtonElement | null>(null)
  const editable = roll.election?.status === 'DRAFT'
  const disabled = roll.pending || roll.blocked || removing !== null

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = userId.trim()
    if (!isValidId(value)) {
      setFieldError('Enter one existing voter ID from 1 to 18446744073709551615.')
      return
    }
    setFieldError('')
    if (await roll.add(value)) setUserId('')
  }

  return (
    <div className="wrap election-workflow">
      <nav className="workflow-back" aria-label="Election navigation">
        <Link className="quiet" to={`/elections/${encodeURIComponent(id)}`}>
          Back to election
        </Link>
      </nav>
      <header className="workflow-heading">
        <h1>Voter roll</h1>
        <p>{roll.election?.title ?? 'Manage election eligibility.'}</p>
      </header>
      {roll.loading ? (
        <LoadingState />
      ) : roll.error ? (
        <ErrorState
          error={roll.error}
          retry={roll.reload}
          backTo={`/elections/${encodeURIComponent(id)}`}
          backLabel="Back to election"
        />
      ) : roll.election && roll.voters ? (
        <>
          <div className="workflow-meta">
            <span className={`st ${roll.election.status.toLowerCase()}`}>
              <i aria-hidden="true" />
              {roll.election.status}
            </span>
            <span>{roll.election.position_title}</span>
            <span className="num">{roll.voters.meta.total} eligible voters</span>
            <button
              type="button"
              className="quiet"
              disabled={roll.pending || removing !== null}
              onClick={roll.reload}
            >
              Refresh roll
            </button>
          </div>
          {editable ? (
            <form className="workflow-add" onSubmit={(event) => void add(event)} noValidate>
              <div>
                <h2>Add a voter</h2>
                <p id="voter-id-help">
                  Use an existing active voter account. Each voter has one vote.
                </p>
              </div>
              <label className="field">
                <span>Voter ID</span>
                <input
                  name="user_id"
                  inputMode="numeric"
                  autoComplete="off"
                  value={userId}
                  disabled={disabled}
                  aria-describedby={`voter-id-help${fieldError ? ' voter-id-error' : ''}`}
                  aria-invalid={Boolean(fieldError)}
                  onChange={(event) => {
                    setUserId(event.target.value)
                    setFieldError('')
                  }}
                />
              </label>
              <button type="submit" className="btn main" disabled={disabled}>
                {roll.pending && !removing ? 'Adding…' : 'Add voter'}
              </button>
              {fieldError && (
                <p className="form-error" id="voter-id-error" role="alert">
                  {fieldError}
                </p>
              )}
            </form>
          ) : (
            <p className="workflow-note">
              The voter roll is read-only once the election leaves draft.
            </p>
          )}
          <div className="workflow-feedback" aria-live="polite">
            {roll.notice && <p role="status">{roll.notice}</p>}
          </div>
          {roll.writeError && (
            <div className="state" role="alert">
              <p>{errorMessage(roll.writeError)}</p>
              <p>
                Refresh the roll to check the current election and membership before another change.
              </p>
            </div>
          )}
          {removing && (
            <WorkflowConfirmation
              title="Remove voter?"
              description={`Remove ${removing.display_name} (ID ${removing.user_id}) from this election's voter roll. This changes their eligibility, not their account.`}
              action="Confirm removal"
              pending={roll.pending}
              returnFocus={confirmationTrigger}
              onCancel={() => setRemoving(null)}
              onConfirm={() => {
                void roll.remove(removing.user_id).then(() => setRemoving(null))
              }}
            />
          )}
          <h2 className="sect">Eligible voters</h2>
          {roll.voters.data.length ? (
            <table className="workflow-table voter-table">
              <caption>Eligible voters for {roll.election.title}</caption>
              <thead>
                <tr>
                  <th scope="col">Voter</th>
                  <th scope="col">Voter ID</th>
                  <th scope="col">Vote quota</th>
                  {editable && <th scope="col">Action</th>}
                </tr>
              </thead>
              <tbody>
                {roll.voters.data.map((voter) => (
                  <tr key={voter.user_id}>
                    <th scope="row">{voter.display_name}</th>
                    <td className="num">{voter.user_id}</td>
                    <td className="num">{voter.vote_quota}</td>
                    {editable && (
                      <td>
                        <button
                          type="button"
                          className="quiet"
                          disabled={disabled}
                          aria-label={`Remove ${voter.display_name} (ID ${voter.user_id})`}
                          onClick={(event) => {
                            confirmationTrigger.current = event.currentTarget
                            setRemoving(voter)
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">No voters on this roll.</p>
          )}
          <nav className="pager" aria-label="Voter roll pages">
            <button
              type="button"
              className="pbtn"
              disabled={disabled || roll.page <= 1}
              onClick={() => roll.setPage(roll.page - 1)}
            >
              Previous
            </button>
            <span className="num">
              Page {roll.page} of{' '}
              {Math.max(1, Math.ceil(roll.voters.meta.total / roll.voters.meta.page_size))}
            </span>
            <button
              type="button"
              className="pbtn"
              disabled={
                disabled || roll.page * roll.voters.meta.page_size >= roll.voters.meta.total
              }
              onClick={() => roll.setPage(roll.page + 1)}
            >
              Next
            </button>
          </nav>
          <p className="workflow-note">
            This roll shows eligibility only. Anonymous ballot choices and voting history are not
            included.
          </p>
        </>
      ) : null}
    </div>
  )
}
