import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ApiError } from '../api/client'
import { AuthProvider } from './AuthContext'
import { TOKEN_STORAGE_KEY, tokenStore } from './token'
import { useAuth } from '../hooks/useAuth'
import type { Login, User } from '../api/types'
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function storageChange(key: string | null, storageArea = localStorage) {
  window.dispatchEvent(new StorageEvent('storage', { key, storageArea }))
}

const otherUser: User = { ...user, id: '22', username: 'other', display_name: 'Other' }
const loginResult: { data: Login } = {
  data: { access_token: 'new-token', token_type: 'bearer', expires_in: 3600, user: otherUser },
}

describe('auth concurrency regressions', () => {
  it('clears the old identity while restoring a token replaced in another tab', async () => {
    tokenStore.set('old-token')
    const replacement = deferred<{ data: User }>()
    const me = vi.spyOn(api, 'me').mockResolvedValueOnce({ data: user })
    me.mockReturnValueOnce(replacement.promise)
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.user?.id).toBe(user.id))

    act(() => {
      tokenStore.set('new-token')
      storageChange(TOKEN_STORAGE_KEY)
    })
    expect(result.current.user).toBeNull()
    expect(result.current.loading).toBe(true)
    expect(tokenStore.get()).toBe('new-token')
    await act(async () => replacement.resolve({ data: otherUser }))
    expect(result.current.user?.id).toBe(otherUser.id)
    expect(result.current.loading).toBe(false)
  })

  it.each([TOKEN_STORAGE_KEY, null])(
    'invalidates pending restoration when another tab clears storage key %s',
    async (key) => {
      tokenStore.set('old-token')
      const pending = deferred<{ data: User }>()
      const me = vi.spyOn(api, 'me').mockReturnValue(pending.promise)
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
      await waitFor(() => expect(me).toHaveBeenCalledOnce())
      act(() => {
        localStorage.clear()
        storageChange(key)
      })
      await act(async () => pending.resolve({ data: user }))
      expect(result.current.user).toBeNull()
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(tokenStore.get()).toBeNull()
      expect(me).toHaveBeenCalledOnce()
    },
  )

  it('ignores unrelated storage changes and removes its listener on unmount', async () => {
    tokenStore.set('token')
    const me = vi.spyOn(api, 'me').mockResolvedValue({ data: user })
    const { result, unmount } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.user?.id).toBe(user.id))
    act(() => {
      storageChange('unrelated')
      storageChange(TOKEN_STORAGE_KEY, sessionStorage)
    })
    expect(me).toHaveBeenCalledOnce()
    expect(result.current.user?.id).toBe(user.id)
    unmount()
    act(() => storageChange(TOKEN_STORAGE_KEY))
    expect(me).toHaveBeenCalledOnce()
  })

  it.each(['INVALID_CREDENTIALS', 'NETWORK_ERROR'])(
    'settles loading when %s supersedes a pending restoration',
    async (code) => {
      tokenStore.set('old-token')
      const pending = deferred<{ data: User }>()
      const me = vi.spyOn(api, 'me').mockReturnValue(pending.promise)
      const failure = new ApiError(code)
      vi.spyOn(api, 'login').mockRejectedValue(failure)
      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
      await waitFor(() => expect(me).toHaveBeenCalledOnce())
      await act(async () => {
        await expect(result.current.signIn('other', 'wrong')).rejects.toBe(failure)
      })
      await act(async () => pending.resolve({ data: user }))
      expect(result.current.loading).toBe(false)
      expect(result.current.user).toBeNull()
      expect(result.current.error).toBe(failure)
      expect(tokenStore.get()).toBe('old-token')
    },
  )

  it('does not let an older login failure change a newer login attempt', async () => {
    const first = deferred<{ data: Login }>()
    const second = deferred<{ data: Login }>()
    vi.spyOn(api, 'login').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.loading).toBe(false))
    let failed!: Promise<unknown>
    let successful!: Promise<void>
    act(() => {
      failed = result.current.signIn('first', 'wrong').catch((reason) => reason)
      successful = result.current.signIn('other', 'password')
    })
    await act(async () => {
      first.reject(new ApiError('INVALID_CREDENTIALS', 401))
      await failed
    })
    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBeNull()
    await act(async () => {
      second.resolve(loginResult)
      await successful
    })
    expect(result.current.user?.id).toBe(otherUser.id)
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(tokenStore.get()).toBe('new-token')
  })

  it('does not restore a successful login after a cross-tab logout', async () => {
    tokenStore.set('old-token')
    vi.spyOn(api, 'me').mockResolvedValue({ data: user })
    const pending = deferred<{ data: Login }>()
    vi.spyOn(api, 'login').mockReturnValue(pending.promise)
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.user?.id).toBe(user.id))
    let signIn!: Promise<void>
    act(() => {
      signIn = result.current.signIn('other', 'password')
      tokenStore.clear()
      storageChange(TOKEN_STORAGE_KEY)
    })
    await act(async () => {
      pending.resolve(loginResult)
      await signIn
    })
    expect(result.current.user).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(tokenStore.get()).toBeNull()
  })
})
