import { Link } from 'react-router'
import { useElections } from '../hooks/useElections'
import { useAuth } from '../hooks/useAuth'
import type { Election } from '../api/types'
import { errorMessage } from '../shared/errors'

// Captured once at load: render stays pure, and row labels reflect the page's
// load-time view of each voting window.
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

function Row({ election, voter }: { election: Election; voter: boolean }) {
  const open = election.status === 'OPEN'
  const draft = election.status === 'DRAFT'
  // Status transitions land on the server within one scheduler tick; until then
  // a locally OPEN row can already be past its window, so judge by the clock.
  // A draft never started, so a passed window says nothing about it.
  const over = election.status !== 'DRAFT' && new Date(election.ends_at).getTime() <= pageLoadedAt
  const ended = election.status === 'CLOSED' || over
  // A voter whose election is over belongs on the results page, never on a ballot.
  const toResults = voter && ended
  return (
    <div className="trow">
      <h3>{election.title}</h3>
      <p className="m num">
        <span className="mlab">{ended ? 'Ended' : open ? 'Closes' : 'Opens'}</span>
        {when(ended ? election.ends_at : election.starts_at)}
      </p>
      <span className={`st ${draft ? 'draft' : ended ? 'closed' : 'open'}`}>
        <i />
        {draft ? 'Draft' : ended ? 'Closed' : 'Open'}
      </span>
      <Link
        className={'lnk' + (open && !toResults ? ' hot' : '')}
        to={
          toResults
            ? `/elections/${encodeURIComponent(election.id)}/results`
            : `/elections/${encodeURIComponent(election.id)}`
        }
      >
        {toResults ? 'Results' : open ? 'Vote' : 'Details'}
      </Link>
    </div>
  )
}

export default function ElectionListPage() {
  const { page, status, data, loading, error, retry, setStatus, setPage } = useElections()
  const { user } = useAuth()
  const voter = user?.role === 'USER'
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
            pool.map((election) => <Row key={election.id} election={election} voter={voter} />)
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
