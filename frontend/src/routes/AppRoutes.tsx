import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { AppLayout } from '../components/AppLayout'
import { LoadingState } from '../components/AsyncState'
import { RequireAuth, RequireRole } from './guards'
const FoundationPage = lazy(() => import('../pages/FoundationPage'))
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
          <Route
            path="login"
            element={placeholder('登录', 'M1 · 后续接入 useAuth().signIn，不提供注册或账户管理。')}
          />
          <Route
            path="forbidden"
            element={placeholder('无权访问', '当前账户不具备访问此模块的角色权限。')}
          />
          <Route element={<RequireAuth />}>
            <Route
              path="elections"
              element={placeholder('选举列表', 'M3 · 后续接入可见范围过滤与分页列表。')}
            />
            <Route
              path="elections/:id"
              element={placeholder('选举详情', 'M3 · 后续接入选举状态、时间窗及候选人信息。')}
            />
            <Route
              path="elections/:id/results"
              element={placeholder('选举结果', 'M6 / M7 · 后续接入关闭后计票、发布及结果展示。')}
            />
            <Route element={<RequireRole role="ADMIN" />}>
              <Route
                path="elections/new"
                element={placeholder('创建选举', 'M3 · 后续实现草稿创建表单。')}
              />
              <Route
                path="elections/:id/edit"
                element={placeholder('配置选举', 'M3 · 后续实现草稿配置与状态操作。')}
              />
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
