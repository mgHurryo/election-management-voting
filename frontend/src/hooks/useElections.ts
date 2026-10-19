import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Election, ElectionStatus, Paginated } from '../api/types'

export type StatusFilter = ElectionStatus | ''

const pageSize = 20

export function useElections() {
  const [query, setQuery] = useState<{ page: number; status: StatusFilter }>({
    page: 1,
    status: '',
  })
  const [attempt, setAttempt] = useState(0)
  const key = `${query.status}/${query.page}/${attempt}`
  const [result, setResult] = useState<{
    key: string
    data: Paginated<Election> | null
    error: unknown
  } | null>(null)

  useEffect(() => {
    let active = true
    api
      .elections({
        page: query.page,
        page_size: pageSize,
        ...(query.status ? { status: query.status } : {}),
      })
      .then(
        (data) => {
          if (active) setResult({ key, data, error: null })
        },
        (error: unknown) => {
          if (active) setResult({ key, data: null, error })
        },
      )
    // Ignore late responses after changing filters, pages, or leaving the page.
    return () => {
      active = false
    }
  }, [key, query.page, query.status])

  const loading = result?.key !== key
  return {
    page: query.page,
    status: query.status,
    loading,
    data: loading ? null : result.data,
    error: loading ? null : result.error,
    setStatus: (status: StatusFilter) => setQuery({ page: 1, status }),
    setPage: (page: number) => setQuery((current) => ({ ...current, page })),
    retry: () => setAttempt((current) => current + 1),
  }
}
