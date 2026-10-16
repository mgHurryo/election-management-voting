import { ElectionListView } from '../components/elections/ElectionListView'
import { useAuth } from '../hooks/useAuth'
import { useElections } from '../hooks/useElections'

export default function ElectionListPage() {
  const { user } = useAuth()
  const state = useElections()
  return <ElectionListView {...state} isAdmin={user?.role === 'ADMIN'} />
}
