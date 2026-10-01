import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api'
import { ApiError } from '../api/client'
import type { User } from '../api/types'
import { SESSION_EXPIRED, TOKEN_STORAGE_KEY, tokenStore } from './token'
import { AuthContext } from './auth-context'

/** Server identity is authoritative; never derive privileges from a decoded JWT. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const generation = useRef(0)
  const signOut = useCallback(() => {
    generation.current++
    tokenStore.clear()
    setUser(null)
    setLoading(false)
    setError(null)
  }, [])
  const restore = useCallback(async () => {
    const current = ++generation.current
    setLoading(true)
    setError(null)
    setUser(null)
    try {
      if (!tokenStore.get()) return
      const { data } = await api.me()
      if (current !== generation.current) return
      if (data.status !== 'ACTIVE') {
        signOut()
        return
      }
      setUser(data)
    } catch (reason) {
      // Keep the token on network errors so the user can retry restoration.
      if (current === generation.current) setError(reason)
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [signOut])
  const invalidate = useCallback(() => {
    generation.current++
  }, [])
  useEffect(() => {
    let active = true
    const syncSession = (event: StorageEvent) => {
      if (
        event.storageArea === localStorage &&
        (event.key === TOKEN_STORAGE_KEY || event.key === null)
      ) {
        // Reuse restoration to invalidate stale work without clearing another tab's token.
        void restore()
      }
    }
    window.addEventListener(SESSION_EXPIRED, signOut)
    window.addEventListener('storage', syncSession)
    void Promise.resolve().then(() => {
      if (active) return restore()
    })
    return () => {
      active = false
      invalidate()
      window.removeEventListener(SESSION_EXPIRED, signOut)
      window.removeEventListener('storage', syncSession)
    }
  }, [restore, signOut, invalidate])
  async function signIn(username: string, password: string) {
    const current = ++generation.current
    setLoading(true)
    setUser(null)
    setError(null)
    try {
      const { data } = await api.login(username, password)
      if (current !== generation.current) return
      if (data.user.status !== 'ACTIVE') throw new ApiError('AUTHENTICATION_REQUIRED', 401)
      tokenStore.set(data.access_token)
      setUser(data.user)
    } catch (reason) {
      if (current === generation.current) setError(reason)
      throw reason
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }
  return (
    <AuthContext.Provider value={{ user, loading, error, restore, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
