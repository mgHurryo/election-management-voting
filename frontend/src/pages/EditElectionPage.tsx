import { useNavigate, useParams } from 'react-router'
import { Link } from 'react-router'
import { ErrorState, LoadingState } from '../components/AsyncState'
import { ElectionEditForm } from '../components/elections/ElectionEditForm'
import { useEditElection } from '../hooks/useEditElection'

export default function EditElectionPage() {
  const { id = '' } = useParams()
  return <EditElectionContent key={id} id={id} />
}

function EditElectionContent({ id }: { id: string }) {
  const state = useEditElection(id)
  const navigate = useNavigate()
  if (state.loading) return <LoadingState />
  if (state.error)
    return (
      <div className="wrap">
        <div className="state" role="alert">
          <p>Unable to load this election.</p>
          <div style={{ marginTop: 12 }}>
            <ErrorState error={state.error} retry={state.reload} />
          </div>
          <p className="actions">
            <Link className="btn ghost" to={`/elections/${encodeURIComponent(id)}`}>
              Back to election
            </Link>
          </p>
        </div>
      </div>
    )
  if (!state.election) return null
  return (
    <ElectionEditForm
      key={state.revision}
      election={state.election}
      saving={state.saving}
      error={state.saveError}
      blocked={state.blocked}
      reload={state.reload}
      onSave={async (patch) => {
        const saved = await state.save(patch)
        if (saved) navigate(`/elections/${encodeURIComponent(saved.id)}`)
      }}
    />
  )
}
