import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ApiError } from '../api/client'
import { AuthProvider } from './AuthContext'
import { tokenStore } from './token'
import { useAuth } from '../hooks/useAuth'
import type { User } from '../api/types'
const user: User = {
  id: '21',
  username: 'student',
  display_name: 'Student',
  role: 'USER',
  status: 'ACTIVE',
  created_at: '',
  updated_at: '',
}
describe('auth state', () => {
  it('starts logged out without requesting identity if no token exists', async () => {
    const me = vi.spyOn(api, 'me')
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(me).not.toHaveBeenCalled()
  })
  it('restores identity from the server', async () => {
    tokenStore.set('token')
    vi.spyOn(api, 'me').mockResolvedValue({ data: user })
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.user?.display_name).toBe('Student'))
    expect(result.current.user?.role).toBe('USER')
  })
  it('keeps the token for a recoverable restoration error', async () => {
    tokenStore.set('token')
    vi.spyOn(api, 'me').mockRejectedValue(new ApiError('NETWORK_ERROR'))
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect(result.current.user).toBeNull()
    expect(tokenStore.get()).toBe('token')
  })
  it('does not resurrect a logged-out session after a delayed response', async () => {
    tokenStore.set('token')
    let resolve!: (value: { data: User }) => void
    const me = vi.spyOn(api, 'me').mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(me).toHaveBeenCalled())
    act(() => result.current.signOut())
    await act(async () => resolve({ data: user }))
    expect(result.current.user).toBeNull()
    expect(tokenStore.get()).toBeNull()
  })
})
