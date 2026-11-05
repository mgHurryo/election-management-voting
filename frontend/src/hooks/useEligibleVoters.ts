import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { VoterOption } from '../api/types'

const pageSize = 100

export function useEligibleVoters() {
  const [page, setPage] = useState(1)
  const [voters, setVoters] = useState<VoterOption[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  useEffect(
    () => () => {
      requestId.current += 1
    },
    [],
  )

  const load = useCallback(async (nextPage: number) => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const result = await api.eligibleVoters(nextPage)
      if (currentRequest !== requestId.current) return
      setVoters(result.data)
      setTotal(result.meta.total)
      setPage(nextPage)
      setLoaded(true)
    } catch {
      if (currentRequest === requestId.current) {
        setError('Unable to load active voter accounts. You can still enter IDs manually.')
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [])

  return { page, voters, total, loading, loaded, error, pageSize, load }
}
