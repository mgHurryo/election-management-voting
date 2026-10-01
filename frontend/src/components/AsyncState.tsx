import { errorMessage } from '../shared/errors'
export function LoadingState() {
  return (
    <p role="status" className="state">
      正在加载…
    </p>
  )
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="state error" role="alert">
      <p>{errorMessage(error)}</p>
      {retry && <button onClick={retry}>重试</button>}
    </div>
  )
}
