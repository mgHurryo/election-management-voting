import { createContext } from 'react'
import type { User } from '../api/types'
export interface AuthState {
  user: User | null
  loading: boolean
  error: unknown
  restore: () => Promise<void>
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => void
}
export const AuthContext = createContext<AuthState | null>(null)
