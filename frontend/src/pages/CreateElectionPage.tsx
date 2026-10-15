import { useNavigate } from 'react-router'
import { ElectionCreateForm } from '../components/elections/ElectionCreateForm'
import { useCreateElection } from '../hooks/useCreateElection'

export default function CreateElectionPage() {
  const navigate = useNavigate()
  const { create, ...state } = useCreateElection()
  return (
    <ElectionCreateForm
      {...state}
      onSubmit={async (input) => {
        const election = await create(input)
        if (election) navigate(`/elections/${encodeURIComponent(election.id)}`)
      }}
    />
  )
}
