import { Link } from 'react-router'
import { useElections } from '../hooks/useElections'
import type { Election } from '../api/types'
import { errorMessage } from '../shared/errors'

const statusLabel = { OPEN: 'Open', DRAFT: 'Draft', CLOSED: 'Closed' } as const

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

function Row({ election }: { election: Election }) {
  const open = election.status === 'OPEN'
  return (
    <div className="trow">
      <h3>{election.title}</h3>
      <p className="m num">
        <span className="mlab">{open ? 'Closes' : 'Opens'}</span>
        {when(open ? election.ends_at : election.starts_at)}
      </p>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <span className={`st ${election.status.toLowerCase()}`}>
          <i />
          {statusLabel[election.status]}
        </span>
        <Link
          className={'lnk' + (open ? ' hot' : '')}
          to={`/elections/${encodeURIComponent(election.id)}`}
        >
          {open ? 'Vote' : 'Details'}
        </Link>
      </div>
    </div>
  )
}

export default function ElectionListPage() {
  const { page, status, data, loading, error, retry, setStatus, setPage } = useElections()
  const pool = data?.data ?? []
  const total = data?.meta.total ?? 0
  const pageSize = data?.meta.page_size ?? 20
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const filters = [
    { key: '' as const, label: 'All' },
    { key: 'OPEN' as const, label: 'Open' },
    { key: 'DRAFT' as const, label: 'Draft' },
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
            pool.map((election) => <Row key={election.id} election={election} />)
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
