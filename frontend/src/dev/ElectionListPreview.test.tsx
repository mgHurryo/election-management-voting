import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { AuthContext } from '../store/auth-context'
import { AppRoutes } from '../routes/AppRoutes'

it('previews the shared list without a session or API calls and keeps actions local', async () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  render(
    <AuthContext.Provider
      value={{
        user: null,
        loading: false,
        error: null,
        restore: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
      }}
    >
      <MemoryRouter initialEntries={['/__preview/elections']}>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  expect(await screen.findByRole('heading', { name: '选举列表' })).toBeInTheDocument()
  expect(screen.getByText('开发预览 · 全部为示例数据')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '查看详情：示例：班长选举' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  expect(screen.getByRole('link', { name: '查看详情：示例：体育委员选举' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('选举状态'), { target: { value: 'CLOSED' } })
  expect(screen.getByText('第 1 页 · 共 2 场选举')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  fireEvent.click(screen.getByRole('link', { name: '创建选举' }))
  expect(await screen.findByRole('heading', { name: '创建选举' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: '取消' }))
  await screen.findByRole('heading', { name: '选举列表' })
  fireEvent.click(screen.getByRole('link', { name: '查看详情：示例：班长选举' }))
  expect(await screen.findByRole('heading', { name: '示例：班长选举' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '示例候选人甲' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '示例候选人乙' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: '返回选举列表' }))
  expect(await screen.findByRole('heading', { name: '选举列表' })).toBeInTheDocument()
  expect(fetcher).not.toHaveBeenCalled()
  expect(localStorage.length).toBe(0)
})
