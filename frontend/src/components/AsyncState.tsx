import { errorMessage } from '../shared/errors'

export function LoadingState() {
  return (
    <p className="state" role="status">
      Loading…
    </p>
  )
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="state" role="alert">
      <p>{errorMessage(error)}</p>
      {retry && (
        <button type="button" onClick={retry}>
          Retry
        </button>
      )}
    </div>
  )
}
