import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Election, ElectionStatus, Paginated } from '../api/types'

export type StatusFilter = Exclude<ElectionStatus, 'CLOSED'> | ''

const pageSize = 20

/** Compose the two supported status filters before paginating; CLOSED never consumes a row. */
async function loadElections(page: number, status: StatusFilter): Promise<Paginated<Election>> {
  if (status) return api.elections({ page, page_size: pageSize, status })
  const [open, firstDrafts] = await Promise.all([
    api.elections({ page, page_size: pageSize, status: 'OPEN' }),
    api.elections({ page: 1, page_size: pageSize, status: 'DRAFT' }),
  ])
  const rows = [...open.data]
  const draftOffset = Math.max(0, (page - 1) * pageSize - open.meta.total)
  const needed = Math.min(pageSize - rows.length, firstDrafts.meta.total - draftOffset)
  if (needed > 0) {
    const firstPage = Math.floor(draftOffset / pageSize) + 1
    const lastPage = Math.floor((draftOffset + needed - 1) / pageSize) + 1
    const draftPages = await Promise.all(
      Array.from({ length: lastPage - firstPage + 1 }, (_, index) => {
        const draftPage = firstPage + index
        return draftPage === 1
          ? firstDrafts
          : api.elections({ page: draftPage, page_size: pageSize, status: 'DRAFT' })
      }),
    )
    rows.push(
      ...draftPages
        .flatMap((result) => result.data)
        .slice(draftOffset % pageSize, (draftOffset % pageSize) + needed),
    )
  }
  return {
    data: rows,
    meta: { page, page_size: pageSize, total: open.meta.total + firstDrafts.meta.total },
  }
}

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
    loadElections(query.page, query.status).then(
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
