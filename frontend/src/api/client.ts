import { config } from '../shared/config'
import { SESSION_EXPIRED, tokenStore } from '../store/token'

export interface ErrorDetail {
  field: string
  reason: string
}
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details: ErrorDetail[]
  constructor(code: string, status = 0, details: ErrorDetail[] = []) {
    super(code)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}
interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  public?: boolean
}

/** No automatic retries, including votes and other non-idempotent writes. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) controller.abort()
  const timeout = setTimeout(abort, config.requestTimeoutMs)
  // A stale 401 must not invalidate a newer session.
  const token = options.public ? null : tokenStore.get()
  try {
    const headers = new Headers({ Accept: 'application/json' })
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (options.body !== undefined) headers.set('Content-Type', 'application/json')
    const init: RequestInit = {
      method: options.method || 'GET',
      headers,
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
    }
    if (options.body !== undefined) init.body = JSON.stringify(options.body)
    const response = await fetch(`${config.apiBase}${path}`, init)
    if (response.status === 401 && !options.public && token === tokenStore.get()) {
      tokenStore.clear()
      window.dispatchEvent(new Event(SESSION_EXPIRED))
    }
    if (response.status === 204) return undefined as T
    const payload: unknown = await response.json().catch(() => {
      throw new ApiError('INVALID_RESPONSE', response.status)
    })
    if (!response.ok) {
      const envelope = payload as { error?: { code?: unknown; details?: unknown } } | null
      const code =
        typeof envelope?.error?.code === 'string' ? envelope.error.code : 'REQUEST_FAILED'
      const details = Array.isArray(envelope?.error?.details)
        ? envelope.error.details.filter(
            (item): item is ErrorDetail =>
              !!item && typeof item.field === 'string' && typeof item.reason === 'string',
          )
        : []
      throw new ApiError(code, response.status, details)
    }
    if (!payload || typeof payload !== 'object' || !('data' in payload))
      throw new ApiError('INVALID_RESPONSE', response.status)
    return payload as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(controller.signal.aborted ? 'REQUEST_ABORTED' : 'NETWORK_ERROR')
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}
