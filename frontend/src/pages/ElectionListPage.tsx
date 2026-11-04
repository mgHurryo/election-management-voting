import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { useElections } from '../hooks/useElections'
import { useAuth } from '../hooks/useAuth'
import { useNow } from '../hooks/useNow'
import type { Election } from '../api/types'
import { errorMessage } from '../shared/errors'
import { useElectionStatusAction } from '../hooks/useElectionDetail'
import { WorkflowConfirmation } from '../components/elections/WorkflowConfirmation'

// The initial clock reading; useNow keeps it current for long-lived sessions.
const pageLoadedAt = Date.now()

function two(n: number) {
  return (n < 10 ? '0' : '') + n
}

function fmt(d: Date) {
  return `${d.getFullYear()}/${two(d.getMonth() + 1)}/${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`
}

function when(value: string) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : fmt(d)
}

function Row({
  election,
  voter,
  admin,
  now,
  refresh,
}: {
  election: Election
  voter: boolean
  admin: boolean
  now: number
  refresh: () => void
}) {
  const [confirm, setConfirm] = useState<'open' | 'close' | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const action = useElectionStatusAction(election.id, refresh)
  const open = election.status === 'OPEN'
  const draft = election.status === 'DRAFT'
  // Status transitions land on the server within one scheduler tick; until then
  // a locally OPEN row can already be past its window, so judge by the clock.
  // A draft never started, so a passed window says nothing about it.
  const over = election.status !== 'DRAFT' && new Date(election.ends_at).getTime() < now
  const ended = election.status === 'CLOSED' || over
  // A voter whose election is over belongs on the results page, never on a ballot.
  const toResults = voter && ended
  const detailPath = `/elections/${encodeURIComponent(election.id)}`
  const destination = toResults ? `${detailPath}/results` : detailPath
  const canOpen =
    draft &&
    new Date(election.starts_at).getTime() <= now &&
    now <= new Date(election.ends_at).getTime()
  return (
    <article className="trow">
      <h3>
        <Link className="trow-title" to={destination}>
          {election.title}
        </Link>
      </h3>
      <p className="m num">
        <span className="mlab">{ended ? 'Ended' : open ? 'Closes' : 'Opens'}</span>
        {when(ended || open ? election.ends_at : election.starts_at)}
      </p>
      <span className={`st ${draft ? 'draft' : ended ? 'closed' : 'open'}`}>
        <i />
        {draft ? 'Draft' : ended ? 'Closed' : 'Open'}
      </span>
      <div className="trow-actions">
        <Link className={'lnk' + (open && !toResults ? ' hot' : '')} to={destination}>
          {toResults
            ? voter
              ? 'View results'
              : 'Results'
            : open && voter
              ? 'Vote Now'
              : 'Details'}
        </Link>
        {admin && draft && (
          <Link className="lnk" to={`${detailPath}/candidates`}>
            Candidate management
          </Link>
        )}
        {admin && draft && !canOpen && (
          <p className="trow-policy">
            {new Date(election.starts_at).getTime() > now
              ? `Opening is available from ${when(election.starts_at)}.`
              : 'The scheduled window has passed. Edit this draft to set a new window.'}
          </p>
        )}
        {admin && (canOpen || open) && (
          <div className="trow-admin-action">
            <button
              type="button"
              className="quiet"
              disabled={action.pending}
              onClick={(event) => {
                trigger.current = event.currentTarget
                setConfirm(open ? 'close' : 'open')
              }}
            >
              {canOpen ? 'Open voting' : 'Close voting'}
            </button>
            {confirm && (
              <WorkflowConfirmation
                title={confirm === 'open' ? 'Open voting?' : 'Close voting?'}
                description={
                  confirm === 'open'
                    ? 'Opening voting locks election details, candidates and the voter roll.'
                    : 'Closing stops new ballots. Submitted ballots and published results are preserved; this election cannot be reopened.'
                }
                action={confirm === 'open' ? 'Confirm open' : 'Confirm close'}
                pending={action.pending}
                returnFocus={trigger}
                onCancel={() => setConfirm(null)}
                onConfirm={() => void action.run(confirm).then(() => setConfirm(null))}
              />
            )}
            {Boolean(action.error) && (
              <p className="form-error" role="alert">
                {errorMessage(action.error)}
              </p>
            )}
            {action.message && (
              <p className="noticeline" role="status">
                {action.message}
              </p>
            )}
          </div>
        )}
        {admin && election.status === 'CLOSED' && (
          <p className="trow-policy">
            Closed elections cannot be edited, deleted or reopened. Ballots and published results
            remain preserved.
          </p>
        )}
      </div>
    </article>
  )
}

export default function ElectionListPage() {
  const { page, status, data, loading, error, retry, setStatus, setPage } = useElections()
  const { user } = useAuth()
  const voter = user?.role === 'USER'
  const now = useNow(pageLoadedAt)
  const pool = data?.data ?? []
  const total = data?.meta.total ?? 0
  const pageSize = data?.meta.page_size ?? 20
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const filters = [
    { key: '' as const, label: 'All' },
    { key: 'OPEN' as const, label: 'Open' },
    { key: 'DRAFT' as const, label: 'Draft' },
    { key: 'CLOSED' as const, label: 'Closed' },
  ]
  return (
    <div className="wrap">
      <section className="hero">
        <h1>Elections</h1>
      </section>
      <div className="segbar">
        <div className="seg" role="group" aria-label="Filter elections by status">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={(status ?? '') === f.key ? 'on' : ''}
              aria-pressed={status === f.key}
            >
              {f.label}
              {status === f.key && data ? ` (${total})` : ''}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <p className="state" role="status">
          Loading…
        </p>
      ) : error ? (
        <div className="state" role="alert">
          <p>{errorMessage(error)}</p>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {pool.length === 0 ? (
            <p className="empty" role="status">
              No elections to show.
            </p>
          ) : (
            pool.map((election) => (
              <Row
                key={election.id}
                election={election}
                voter={voter}
                admin={user?.role === 'ADMIN'}
                now={now}
                refresh={retry}
              />
            ))
          )}
          <div className="pager">
            <button
              type="button"
              className="pbtn"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              Previous
            </button>
            <span className="num">
              Page {page} of {pages}
            </span>
            <button
              type="button"
              className="pbtn"
              onClick={() => setPage(page + 1)}
              disabled={page >= pages}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}
