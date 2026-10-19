import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router'
import { AppLayout } from '../components/AppLayout'
import { LoadingState } from '../components/AsyncState'
import { RequireAuth, RequireRole } from './guards'

const LoginPage = lazy(() => import('../pages/LoginPage'))
const ElectionListPage = lazy(() => import('../pages/ElectionListPage'))
const ElectionDetailPage = lazy(() => import('../pages/ElectionDetailPage'))
const CreateElectionPage = lazy(() => import('../pages/CreateElectionPage'))
const EditElectionPage = lazy(() => import('../pages/EditElectionPage'))
const CandidateManagementPage = lazy(() => import('../pages/CandidateManagementPage'))
const PlaceholderPage = lazy(() => import('../pages/PlaceholderPage'))
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))

const placeholder = (title: string, description: string) => (
  <PlaceholderPage title={title} description={description} />
)

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/elections" replace />} />
          <Route path="login" element={<LoginPage />} />
          <Route
            path="forbidden"
            element={placeholder(
              'No access',
              'Your account does not have permission for this area.',
            )}
          />
          <Route element={<RequireAuth />}>
            <Route path="elections" element={<ElectionListPage />} />
            <Route path="elections/:id" element={<ElectionDetailPage />} />
            <Route
              path="elections/:id/results"
              element={placeholder(
                'Results',
                'Results appear here once the election is closed and published.',
              )}
            />
            <Route path="elections/:id/vote" element={<LegacyVoteRedirect />} />
            <Route element={<RequireRole role="ADMIN" />}>
              <Route path="elections/new" element={<CreateElectionPage />} />
              <Route path="elections/:id/edit" element={<EditElectionPage />} />
              <Route path="elections/:id/candidates" element={<CandidateManagementPage />} />
              <Route
                path="elections/:id/voters"
                element={placeholder(
                  'Voter roll',
                  'Voter roll management is not part of this release.',
                )}
              />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

function LegacyVoteRedirect() {
  const { id = '' } = useParams()
  return <Navigate to={`/elections/${encodeURIComponent(id)}`} replace />
}
