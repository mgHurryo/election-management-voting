import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { api } from '../api'
import { ApiError } from '../api/client'
import type { Election, Paginated, Role } from '../api/types'
import { AuthContext } from '../store/auth-context'
import { AppRoutes } from '../routes/AppRoutes'

const election: Election = {
  id: '9007199254740993',
  title: '班长选举',
  position_title: '班长',
  description: null,
  created_by: '1',
  status: 'DRAFT',
  privacy_mode: 'FORCED_ANONYMOUS',
  starts_at: '2026-10-20T01:00:00Z',
  ends_at: '2026-10-20T09:00:00Z',
  results_published_at: null,
  created_at: '',
  updated_at: '',
}

function response(page = 1, total = 1, rows: Election[] = [election]): Paginated<Election> {
  return { data: rows, meta: { page, page_size: 20, total } }
}

function mount(role: Role | null = 'USER') {
  return render(
    <AuthContext.Provider
      value={{
        user: role
          ? {
              id: '2',
              username: 'test',
              display_name: '测试用户',
              role,
              status: 'ACTIVE',
              created_at: '',
              updated_at: '',
            }
          : null,
        loading: false,
        error: null,
        restore: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
      }}
    >
      <MemoryRouter initialEntries={['/elections']}>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('election list', () => {
  it('loads the protected route, preserves BIGINT IDs, and opens details', async () => {
    const list = vi.spyOn(api, 'elections').mockResolvedValue(response())
    mount()
    const link = await screen.findByRole('link', { name: '查看详情：班长选举' })
    expect(link).toHaveAttribute('href', '/elections/9007199254740993')
    expect(screen.getByRole('cell', { name: '草稿' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '创建选举' })).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledWith({ page: 1, page_size: 20, status: undefined })
    fireEvent.click(link)
    expect(await screen.findByRole('heading', { name: '选举详情' })).toBeInTheDocument()
  })

  it('shows the administrator create entry and navigates to the existing route', async () => {
    vi.spyOn(api, 'elections').mockResolvedValue(response())
    mount('ADMIN')
    await screen.findByRole('heading', { name: '选举列表' })
    const links = screen.getAllByRole('link', { name: '创建选举' })
    fireEvent.click(links[links.length - 1]!)
    expect(await screen.findByRole('heading', { name: '创建选举' })).toBeInTheDocument()
  })

  it('redirects anonymous visitors to login without requesting elections', async () => {
    const list = vi.spyOn(api, 'elections')
    mount(null)
    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument()
    expect(list).not.toHaveBeenCalled()
  })

  it('paginates on the server and resets to page one when filtering', async () => {
    const list = vi.spyOn(api, 'elections').mockImplementation(async (query) => {
      return response(query?.page, query?.status ? 1 : 21)
    })
    mount()
    const next = await screen.findByRole('button', { name: '下一页' })
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
    fireEvent.click(next)
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({ page: 2, page_size: 20, status: undefined }),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled())
    fireEvent.change(screen.getByLabelText('选举状态'), { target: { value: 'OPEN' } })
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({ page: 1, page_size: 20, status: 'OPEN' }),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled())
  })

  it('distinguishes a failed request from an empty result and allows retry', async () => {
    const list = vi
      .spyOn(api, 'elections')
      .mockRejectedValueOnce(new ApiError('NETWORK_ERROR'))
      .mockResolvedValueOnce(response(1, 0, []))
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('无法连接服务器')
    expect(screen.queryByText('暂无可查看的选举。')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('暂无可查看的选举。')).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  })

  it('does not overwrite a new filter result when an older request finishes late', async () => {
    let finishOld!: (data: Paginated<Election>) => void
    const oldRequest = new Promise<Paginated<Election>>((resolve) => {
      finishOld = resolve
    })
    const list = vi
      .spyOn(api, 'elections')
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValueOnce(response(1, 0, []))
    mount()
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    expect(screen.getByText('正在加载…')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('选举状态'), { target: { value: 'CLOSED' } })
    expect(await screen.findByText('当前状态下暂无可查看的选举。')).toBeInTheDocument()
    await act(async () => finishOld(response()))
    expect(screen.queryByRole('link', { name: '查看详情：班长选举' })).not.toBeInTheDocument()
    expect(screen.getByText('当前状态下暂无可查看的选举。')).toBeInTheDocument()
  })
})
