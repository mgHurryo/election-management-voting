import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { AppLayout } from '../components/AppLayout'
import { LoadingState } from '../components/AsyncState'
import { RequireAuth, RequireRole } from './guards'
const FoundationPage = lazy(() => import('../pages/FoundationPage'))
const LoginPage = lazy(() => import('../pages/LoginPage'))
const ElectionListPage = lazy(() => import('../pages/ElectionListPage'))
const EditElectionPage = lazy(() => import('../pages/EditElectionPage'))
const EditElectionPreview = import.meta.env.DEV
  ? lazy(() => import('../dev/EditElectionPreview'))
  : null
const CreateElectionPage = lazy(() => import('../pages/CreateElectionPage'))
const CreateElectionPreview = import.meta.env.DEV
  ? lazy(() => import('../dev/CreateElectionPreview'))
  : null
const ElectionDetailPage = lazy(() => import('../pages/ElectionDetailPage'))
const ElectionDetailPreview = import.meta.env.DEV
  ? lazy(() => import('../dev/ElectionDetailPreview'))
  : null
const ElectionListPreview = import.meta.env.DEV
  ? lazy(() => import('../dev/ElectionListPreview'))
  : null
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
          <Route index element={<FoundationPage />} />
          {ElectionListPreview && (
            <Route path="__preview/elections" element={<ElectionListPreview />} />
          )}
          {ElectionDetailPreview && (
            <Route path="__preview/elections/:id" element={<ElectionDetailPreview />} />
          )}
          {CreateElectionPreview && (
            <Route path="__preview/elections/new" element={<CreateElectionPreview />} />
          )}
          {EditElectionPreview && (
            <Route path="__preview/elections/:id/edit" element={<EditElectionPreview />} />
          )}
          <Route path="login" element={<LoginPage />} />
          <Route
            path="forbidden"
            element={placeholder('无权访问', '当前账户不具备访问此模块的角色权限。')}
          />
          <Route element={<RequireAuth />}>
            <Route path="elections" element={<ElectionListPage />} />
            <Route path="elections/:id" element={<ElectionDetailPage />} />
            <Route
              path="elections/:id/results"
              element={placeholder('选举结果', 'M6 / M7 · 后续接入关闭后计票、发布及结果展示。')}
            />
            <Route element={<RequireRole role="ADMIN" />}>
              <Route path="elections/new" element={<CreateElectionPage />} />
              <Route path="elections/:id/edit" element={<EditElectionPage />} />
              <Route
                path="elections/:id/candidates"
                element={placeholder('候选人管理', 'M3 · 后续实现草稿候选人管理。')}
              />
              <Route
                path="elections/:id/voters"
                element={placeholder(
                  '选民名册',
                  'M2 · 后续实现预置用户的名册管理，不提供账户创建。',
                )}
              />
            </Route>
            <Route element={<RequireRole role="USER" />}>
              <Route
                path="elections/:id/vote"
                element={placeholder(
                  '匿名投票',
                  'M4 · 后续实现选票及投票；资格、时间与额度由服务端校验。',
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
