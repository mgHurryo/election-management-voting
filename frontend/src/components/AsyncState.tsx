import { Link } from 'react-router'
import { errorMessage } from '../shared/errors'

export function LoadingState() {
  return (
    <div className="state state-loading" role="status">
      <p>Loading…</p>
    </div>
  )
}

export function ErrorState({
  error,
  retry,
  backTo,
  backLabel = 'Back to elections',
}: {
  error: unknown
  retry?: () => void
  backTo?: string
  backLabel?: string
}) {
  return (
    <div className="state state-error" role="alert">
      <p className="state-message">{errorMessage(error)}</p>
      {(retry || backTo) && (
        <div className="state-actions">
          {retry && (
            <button type="button" className="btn ghost" onClick={retry}>
              Retry
            </button>
          )}
          {backTo && (
            <Link className="quiet" to={backTo}>
              {backLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
