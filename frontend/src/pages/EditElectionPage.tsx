import { Link, useNavigate, useParams } from 'react-router'
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
      <>
        <Link to={`/elections/${encodeURIComponent(id)}`}>返回选举详情</Link>
        <ErrorState error={state.error} retry={state.reload} />
      </>
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
