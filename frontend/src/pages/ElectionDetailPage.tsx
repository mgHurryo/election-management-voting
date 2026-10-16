import { Link, useParams } from 'react-router'
import { ErrorState, LoadingState } from '../components/AsyncState'
import { ElectionDetailView } from '../components/elections/ElectionDetailView'
import { useAuth } from '../hooks/useAuth'
import { useElectionDetail, useElectionStatusAction } from '../hooks/useElectionDetail'

export default function ElectionDetailPage() {
  const { id = '' } = useParams()
  return <ElectionDetailContent key={id} id={id} />
}

function ElectionDetailContent({ id }: { id: string }) {
  const { user } = useAuth()
  const detail = useElectionDetail(id, user?.role)
  const action = useElectionStatusAction(id, detail.reload)
  if (detail.loading) return <LoadingState />
  if (detail.error)
    return (
      <>
        <Link to="/elections">返回选举列表</Link>
        <ErrorState error={detail.error} retry={detail.reload} />
      </>
    )
  if (!detail.election || !user) return null
  return (
    <ElectionDetailView
      key={id}
      election={detail.election}
      role={user.role}
      candidateState={detail.candidates}
      canRequestCandidates={detail.canRequestCandidates}
      candidatePage={detail.candidatePage}
      setCandidatePage={detail.setCandidatePage}
      retryCandidates={detail.retryCandidates}
      refresh={detail.reload}
      action={action}
    />
  )
}
