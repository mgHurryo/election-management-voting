import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api'
import { ApiError } from '../api/client'
import type { User } from '../api/types'
import { SESSION_EXPIRED, tokenStore } from './token'
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
    window.addEventListener(SESSION_EXPIRED, signOut)
    void Promise.resolve().then(() => {
      if (active) return restore()
    })
    return () => {
      active = false
      invalidate()
      window.removeEventListener(SESSION_EXPIRED, signOut)
    }
  }, [restore, signOut, invalidate])
  async function signIn(username: string, password: string) {
    const current = ++generation.current
    const { data } = await api.login(username, password)
    if (current !== generation.current) return
    if (data.user.status !== 'ACTIVE') throw new ApiError('AUTHENTICATION_REQUIRED', 401)
    tokenStore.set(data.access_token)
    setUser(data.user)
    setLoading(false)
    setError(null)
  }
  return (
    <AuthContext.Provider value={{ user, loading, error, restore, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
