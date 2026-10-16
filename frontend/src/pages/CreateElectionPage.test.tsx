import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { api } from '../api'
import { ApiError } from '../api/client'
import type { Election, Role } from '../api/types'
import { AuthContext } from '../store/auth-context'
import { AppRoutes } from '../routes/AppRoutes'
import { validateElectionForm } from '../shared/electionForm'

const election: Election = {
  id: '9007199254740993',
  title: '新建班长选举',
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
const values = {
  title: '新建班长选举',
  position_title: '班长',
  description: '',
  starts_at: '2026-10-20T09:00',
  ends_at: '2026-10-20T17:00',
  voters: '21,9007199254740995',
}
function mount(role: Role | null = 'ADMIN', route = '/elections/new') {
  return render(
    <AuthContext.Provider
      value={{
        user: role
          ? {
              id: '1',
              username: 'test',
              display_name: '测试',
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
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}
async function fill() {
  await screen.findByRole('heading', { name: '创建选举' })
  fireEvent.change(screen.getByLabelText('选举名称 *'), { target: { value: values.title } })
  fireEvent.change(screen.getByLabelText('竞选职位 *'), {
    target: { value: values.position_title },
  })
  fireEvent.change(screen.getByLabelText('开始时间 *'), { target: { value: values.starts_at } })
  fireEvent.change(screen.getByLabelText('结束时间 *'), { target: { value: values.ends_at } })
  fireEvent.change(screen.getByLabelText('初始选民用户 ID *'), { target: { value: values.voters } })
}

describe('create election', () => {
  it('submits documented fields, preserves BIGINT strings, converts local time, and opens the new detail', async () => {
    const create = vi.spyOn(api, 'createElection').mockResolvedValue({ data: election })
    vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    vi.spyOn(api, 'candidates').mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 20, total: 0 },
    })
    mount()
    await fill()
    fireEvent.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(await screen.findByRole('heading', { name: election.title })).toBeInTheDocument()
    expect(create).toHaveBeenCalledTimes(1)
    const input = create.mock.calls[0]![0]
    expect(input.voter_ids).toEqual(['21', '9007199254740995'])
    expect(new Date(input.starts_at).getHours()).toBe(9)
    expect(input.starts_at).toMatch(/:\d{2}Z$/)
    expect(input.description).toBeNull()
    expect(Object.keys(input).sort()).toEqual(
      ['title', 'position_title', 'description', 'starts_at', 'ends_at', 'voter_ids'].sort(),
    )
  })

  it('blocks blank, duplicate ID, and invalid time submissions before requesting the backend', async () => {
    const create = vi.spyOn(api, 'createElection')
    mount()
    fireEvent.click(await screen.findByRole('button', { name: '创建草稿' }))
    expect(screen.getByText('请输入 1–200 字符的选举名称。')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
    expect(validateElectionForm({ ...values, voters: '21,21' }).errors.voters).toContain('不能重复')
    expect(
      validateElectionForm({ ...values, voters: '18446744073709551616' }).errors.voters,
    ).toBeDefined()
    expect(
      validateElectionForm({ ...values, starts_at: values.ends_at }).errors.ends_at,
    ).toBeDefined()
    expect(
      validateElectionForm({ ...values, starts_at: '2026-02-30T09:00' }).errors.starts_at,
    ).toBeDefined()
    expect(validateElectionForm({ ...values, title: '   ' }).errors.title).toBeDefined()
    expect(validateElectionForm({ ...values, title: 'a'.repeat(201) }).errors.title).toBeDefined()
  })

  it('rejects USER access without issuing a create request', async () => {
    const create = vi.spyOn(api, 'createElection')
    mount('USER')
    expect(await screen.findByRole('heading', { name: '无权访问' })).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('redirects anonymous visitors to login', async () => {
    const create = vi.spyOn(api, 'createElection')
    mount(null)
    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('retains form inputs after a known rejection and permits an explicit correction', async () => {
    const create = vi
      .spyOn(api, 'createElection')
      .mockRejectedValue(new ApiError('INVALID_VOTER', 422))
    mount()
    await fill()
    fireEvent.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('仅可添加有效的选民账户')
    expect(screen.getByLabelText('选举名称 *')).toHaveValue(values.title)
    expect(screen.getByLabelText('初始选民用户 ID *')).toHaveValue(values.voters)
    expect(screen.getByRole('button', { name: '创建草稿' })).toBeEnabled()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('blocks another create after timeout until the user explicitly confirms a review', async () => {
    const create = vi
      .spyOn(api, 'createElection')
      .mockRejectedValue(new ApiError('REQUEST_ABORTED'))
    mount()
    await fill()
    fireEvent.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('创建结果尚未确认')
    expect(screen.getByRole('button', { name: '创建草稿' })).toBeDisabled()
    expect(create).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '已核对未创建，允许重新提交' }))
    expect(screen.getByRole('button', { name: '创建草稿' })).toBeEnabled()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('prevents double submission while the create request is pending', async () => {
    let reject!: (reason: unknown) => void
    const pending = new Promise<{ data: Election }>((_resolve, rejectPromise) => {
      reject = rejectPromise
    })
    const create = vi.spyOn(api, 'createElection').mockReturnValue(pending)
    mount()
    await fill()
    const form = screen.getByRole('button', { name: '创建草稿' }).closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(create).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '创建中…' })).toBeDisabled()
    await act(async () => reject(new ApiError('INVALID_VOTER', 422)))
    await waitFor(() => expect(screen.getByRole('button', { name: '创建草稿' })).toBeEnabled())
  })

  it('validates a preview submission without API requests or persistent records', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    mount(null, '/__preview/elections/new')
    await fill()
    fireEvent.click(screen.getByRole('button', { name: '模拟提交（不保存）' }))
    expect(
      await screen.findByRole('heading', { name: '校验通过，模拟提交完成（未保存）' }),
    ).toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })
})
