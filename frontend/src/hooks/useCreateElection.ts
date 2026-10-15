import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { ApiError } from '../api/client'
import type { ElectionInput } from '../api/types'

export function useCreateElection() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [uncertain, setUncertain] = useState(false)
  const busy = useRef(false)
  const blocked = useRef(false)
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current++
    },
    [],
  )

  async function create(input: ElectionInput) {
    if (busy.current || blocked.current) return null
    busy.current = true
    const current = generation.current
    setPending(true)
    setError(null)
    try {
      const response = await api.createElection(input)
      if (
        !response.data ||
        typeof response.data.id !== 'string' ||
        !/^[1-9][0-9]*$/.test(response.data.id)
      )
        throw new ApiError('INVALID_RESPONSE')
      return current === generation.current ? response.data : null
    } catch (reason) {
      if (current === generation.current) {
        const unknownOutcome =
          !(reason instanceof ApiError) || reason.status === 0 || reason.status >= 500
        blocked.current = unknownOutcome
        setUncertain(unknownOutcome)
        setError(reason)
      }
      return null
    } finally {
      busy.current = false
      if (current === generation.current) setPending(false)
    }
  }
  function allowAfterReview() {
    blocked.current = false
    setUncertain(false)
    setError(null)
  }
  return { create, pending, error, uncertain, allowAfterReview }
}
