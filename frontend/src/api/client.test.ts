import { afterEach, describe, expect, it, vi } from 'vitest'
import { request, ApiError } from './client'
import { api } from './index'
import { SESSION_EXPIRED, tokenStore } from '../store/token'
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
afterEach(() => vi.useRealTimers())
describe('HTTP foundation', () => {
  it('attaches the bearer token and preserves BIGINT IDs as strings', async () => {
    tokenStore.set('test-token')
    const fetcher = vi.fn().mockResolvedValue(json({ data: { id: '18446744073709551615' } }))
    vi.stubGlobal('fetch', fetcher)
    const value = await api.election('18446744073709551615')
    expect(value.data.id).toBe('18446744073709551615')
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('/api/v1/elections/18446744073709551615')
    expect(init.headers.get('Authorization')).toBe('Bearer test-token')
    expect(init.headers.has('Content-Type')).toBe(false)
    expect(init.body).toBeUndefined()
    expect(init.cache).toBe('no-store')
  })
  it('sends only declared login fields and never trims passwords', async () => {
    tokenStore.set('old-token')
    const fetcher = vi.fn().mockResolvedValue(json({ data: {} }))
    vi.stubGlobal('fetch', fetcher)
    await api.login('student', ' secret ')
    const [, init] = fetcher.mock.calls[0]
    expect(init.headers.has('Authorization')).toBe(false)
    expect(JSON.parse(init.body)).toEqual({ username: 'student', password: ' secret ' })
  })
  it('handles bodyless 204 and sends no body for state operations', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ data: {} }))
    vi.stubGlobal('fetch', fetcher)
    expect(await api.deleteCandidate('1', '2')).toBeUndefined()
    await api.openElection('1')
    expect(fetcher.mock.calls[1][1].body).toBeUndefined()
  })
  it('clears the current token and emits session expiration on a protected 401', async () => {
    tokenStore.set('test-token')
    const expired = vi.fn()
    window.addEventListener(SESSION_EXPIRED, expired)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401)),
    )
    await expect(api.me()).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED', status: 401 })
    expect(tokenStore.get()).toBeNull()
    expect(expired).toHaveBeenCalledOnce()
    window.removeEventListener(SESSION_EXPIRED, expired)
  })
  it('does not clear a newer session when a stale 401 arrives', async () => {
    tokenStore.set('old')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        tokenStore.set('new')
        return json({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401)
      }),
    )
    await expect(api.me()).rejects.toBeInstanceOf(ApiError)
    expect(tokenStore.get()).toBe('new')
  })
  it('preserves error codes and never retries a failed vote', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(json({ error: { code: 'VOTE_QUOTA_EXHAUSTED' } }, 409))
    vi.stubGlobal('fetch', fetcher)
    await expect(api.vote('1001', '101')).rejects.toMatchObject({
      code: 'VOTE_QUOTA_EXHAUSTED',
      status: 409,
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ candidate_id: '101' })
  })
  it('rejects malformed successful envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ unexpected: [] })))
    await expect(request('/elections')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('does not retry network failures', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', fetcher)
    await expect(api.vote('1', '2')).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('aborts timed-out requests', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          }),
      ),
    )
    const outcome = request('/auth/me').catch((error) => error)
    await vi.advanceTimersByTimeAsync(15000)
    expect(await outcome).toMatchObject({ code: 'REQUEST_ABORTED' })
  })
  it('supports caller cancellation', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          }),
      ),
    )
    const pending = request('/auth/me', { signal: controller.signal }).catch((error) => error)
    controller.abort()
    expect(await pending).toMatchObject({ code: 'REQUEST_ABORTED' })
  })
})
