import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Link, MemoryRouter } from 'react-router'
import { api } from '../api'
import { ApiError } from '../api/client'
import type { Candidate, Election, Role, Paginated } from '../api/types'
import { AuthContext } from '../store/auth-context'
import { AppRoutes } from '../routes/AppRoutes'

const election: Election = {
  id: '9007199254740993',
  title: '班长选举详情测试',
  position_title: '班长',
  description: '这是一场班级选举。',
  status: 'DRAFT',
  privacy_mode: 'FORCED_ANONYMOUS',
  created_by: '1',
  starts_at: '2026-10-20T01:00:00Z',
  ends_at: '2026-10-20T09:00:00Z',
  results_published_at: null,
  created_at: '',
  updated_at: '',
}
const candidate: Candidate = {
  id: '9007199254740995',
  election_id: election.id,
  name: '候选人甲',
  position_title: '班长',
  description: '愿意帮助同学，认真听取意见。',
  photo_url: null,
  display_order: 0,
  created_at: '',
  updated_at: '',
}
function profiles(
  page = 1,
  total = 2,
  rows: Candidate[] = [candidate, { ...candidate, id: '9007199254740996', name: '候选人乙' }],
): Paginated<Candidate> {
  return { data: rows, meta: { page, page_size: 20, total } }
}
function mount(role: Role | null = 'ADMIN') {
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
      <MemoryRouter initialEntries={[`/elections/${election.id}`]}>
        <Link to="/elections/2002">切换另一场测试选举</Link>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('election detail and candidate profiles', () => {
  it('renders election facts and multiple read-only candidates, using string IDs', async () => {
    const detail = vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    const candidates = vi.spyOn(api, 'candidates').mockResolvedValue(profiles())
    mount()
    expect(await screen.findByRole('heading', { name: election.title })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '候选人甲' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '候选人乙' })).toBeInTheDocument()
    expect(screen.getAllByText('未提供照片')).toHaveLength(2)
    expect(screen.getByRole('link', { name: '编辑选举' })).toHaveAttribute(
      'href',
      `/elections/${election.id}/edit`,
    )
    expect(screen.getByRole('link', { name: '候选人管理' })).toHaveAttribute(
      'href',
      `/elections/${election.id}/candidates`,
    )
    expect(detail).toHaveBeenCalledWith(election.id)
    expect(candidates).toHaveBeenCalledWith(election.id, 1)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('does not request details or profiles before authentication', async () => {
    const detail = vi.spyOn(api, 'election')
    const candidates = vi.spyOn(api, 'candidates')
    mount(null)
    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument()
    expect(detail).not.toHaveBeenCalled()
    expect(candidates).not.toHaveBeenCalled()
  })

  it('does not query candidates when election detail is not visible', async () => {
    vi.spyOn(api, 'election').mockRejectedValue(new ApiError('ELECTION_NOT_FOUND', 404))
    const candidates = vi.spyOn(api, 'candidates')
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('选举不存在')
    expect(candidates).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '开启投票' })).not.toBeInTheDocument()
  })

  it('explains USER restrictions in DRAFT without querying or showing profiles', async () => {
    vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    const candidates = vi.spyOn(api, 'candidates')
    mount('USER')
    expect(
      await screen.findByText('普通用户仅在选举开放、处于投票时间且具备资格时可查看候选人资料。'),
    ).toBeInTheDocument()
    expect(candidates).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: '编辑选举' })).not.toBeInTheDocument()
  })

  it('keeps election facts while explaining an eligibility rejection without fake empty data', async () => {
    vi.spyOn(api, 'election').mockResolvedValue({ data: { ...election, status: 'OPEN' } })
    vi.spyOn(api, 'candidates').mockRejectedValue(new ApiError('NOT_ELIGIBLE', 403))
    mount('USER')
    expect(await screen.findByText('你不在本场选举的选民名册中。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: election.title })).toBeInTheDocument()
    expect(screen.queryByText('暂无候选人。')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '候选人甲' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '关闭投票' })).not.toBeInTheDocument()
  })

  it('retries candidate loading independently and paginates through the API', async () => {
    const detail = vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    const candidates = vi
      .spyOn(api, 'candidates')
      .mockRejectedValueOnce(new ApiError('NETWORK_ERROR'))
      .mockResolvedValueOnce(profiles(1, 21))
      .mockResolvedValueOnce(profiles(2, 21, [{ ...candidate, name: '末页候选人' }]))
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('无法连接服务器')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    fireEvent.click(await screen.findByRole('button', { name: '下一页候选人' }))
    expect(await screen.findByRole('heading', { name: '末页候选人' })).toBeInTheDocument()
    expect(candidates).toHaveBeenLastCalledWith(election.id, 2)
    expect(screen.getByRole('button', { name: '下一页候选人' })).toBeDisabled()
    expect(detail).toHaveBeenCalledTimes(1)
  })

  it('does not overwrite another election with an old candidate response', async () => {
    let finishOld!: (data: Paginated<Candidate>) => void
    const oldRequest = new Promise<Paginated<Candidate>>((resolve) => {
      finishOld = resolve
    })
    vi.spyOn(api, 'election').mockImplementation(async (id) => ({
      data: { ...election, id, title: id === election.id ? election.title : '另一场选举' },
    }))
    const candidates = vi
      .spyOn(api, 'candidates')
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValue(profiles(1, 0, []))
    mount()
    await waitFor(() => expect(candidates).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('link', { name: '切换另一场测试选举' }))
    expect(await screen.findByRole('heading', { name: '另一场选举' })).toBeInTheDocument()
    expect(await screen.findByText('暂无候选人。')).toBeInTheDocument()
    await act(async () => finishOld(profiles()))
    expect(screen.queryByRole('heading', { name: '候选人甲' })).not.toBeInTheDocument()
  })

  it('confirms opening once and refreshes the authoritative election state', async () => {
    vi.spyOn(api, 'election')
      .mockResolvedValueOnce({ data: election })
      .mockResolvedValue({ data: { ...election, status: 'OPEN' } })
    vi.spyOn(api, 'candidates').mockResolvedValue(profiles())
    const open = vi
      .spyOn(api, 'openElection')
      .mockResolvedValue({ data: { ...election, status: 'OPEN' } })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: '开启投票' }))
    expect(open).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(open).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '开启投票' }))
    fireEvent.click(screen.getByRole('button', { name: '确认开启' }))
    expect(await screen.findByRole('button', { name: '关闭投票' })).toBeInTheDocument()
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith(election.id)
  })

  it('does not automatically repeat an uncertain close operation', async () => {
    vi.spyOn(api, 'election').mockResolvedValue({ data: { ...election, status: 'OPEN' } })
    vi.spyOn(api, 'candidates').mockResolvedValue(profiles())
    const close = vi.spyOn(api, 'closeElection').mockRejectedValue(new ApiError('REQUEST_ABORTED'))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: '关闭投票' }))
    fireEvent.click(screen.getByRole('button', { name: '确认关闭' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('超时不一定表示操作失败')
    expect(close).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '刷新选举状态' })).toBeInTheDocument()
  })

  it('shows only published result navigation to closed USER elections', async () => {
    vi.spyOn(api, 'election').mockResolvedValue({
      data: { ...election, status: 'CLOSED', results_published_at: '2026-10-20T10:00:00Z' },
    })
    const candidates = vi.spyOn(api, 'candidates')
    mount('USER')
    expect(await screen.findByRole('link', { name: '查看已发布结果' })).toHaveAttribute(
      'href',
      `/elections/${election.id}/results`,
    )
    expect(screen.queryByRole('link', { name: '进入投票页' })).not.toBeInTheDocument()
    expect(candidates).not.toHaveBeenCalled()
  })

  it('falls back when a candidate photo fails and treats the profile as plain text', async () => {
    vi.spyOn(api, 'election').mockResolvedValue({ data: election })
    vi.spyOn(api, 'candidates').mockResolvedValue(
      profiles(1, 1, [
        {
          ...candidate,
          photo_url: 'https://example.invalid/photo.jpg',
          description: '<script>not executable</script>',
        },
      ]),
    )
    mount()
    const image = await screen.findByAltText('候选人甲的照片')
    fireEvent.error(image)
    expect(screen.getByText('照片暂不可用')).toBeInTheDocument()
    expect(screen.getByText('<script>not executable</script>')).toBeInTheDocument()
    expect(document.querySelector('article script')).toBeNull()
  })
})
