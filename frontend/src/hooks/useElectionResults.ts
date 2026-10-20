import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { ApiError } from '../api/client'
import type { Election, Result, Role } from '../api/types'

export function useElectionResults(id: string, role: Role) {
  const [revision, setRevision] = useState(0)
  const key = `${id}/${role}/${revision}`
  const [snapshot, setSnapshot] = useState<{
    key: string
    election: Election | null
    result: Result | null
    error: unknown
  } | null>(null)
  const [pending, setPending] = useState(false)
  const [writeError, setWriteError] = useState<unknown>(null)
  const [blocked, setBlocked] = useState(false)
  const [notice, setNotice] = useState('')
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data: election } = await api.election(id)
        if (!active) return
        if (election.id !== id) throw new ApiError('INVALID_RESPONSE')
        let result: Result | null = null
        if (election.status === 'CLOSED' && (role === 'ADMIN' || election.results_published_at)) {
          const response = await api.results(id)
          if (!active) return
          result = response.data
          if (result.election_id !== id || (role === 'USER' && !result.results_published_at))
            throw new ApiError('INVALID_RESPONSE')
        }
        setSnapshot({ key, election, result, error: null })
        setBlocked(false)
      } catch (error) {
        if (active) setSnapshot({ key, election: null, result: null, error })
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [id, role, key])

  function reload() {
    if (busy.current) return
    setWriteError(null)
    setRevision((value) => value + 1)
  }

  async function publish() {
    if (
      busy.current ||
      blocked ||
      role !== 'ADMIN' ||
      snapshot?.key !== key ||
      snapshot.election?.status !== 'CLOSED' ||
      !snapshot.result ||
      snapshot.result.results_published_at
    )
      return
    busy.current = true
    setPending(true)
    setWriteError(null)
    setNotice('')
    try {
      const { data } = await api.publishResults(id)
      if (data.election_id !== id || !data.results_published_at)
        throw new ApiError('INVALID_RESPONSE')
      if (mounted.current) {
        setSnapshot({ ...snapshot, result: data })
        setNotice('Results published.')
      }
    } catch (error) {
      if (mounted.current) {
        setWriteError(error)
        setBlocked(true)
      }
    } finally {
      busy.current = false
      if (mounted.current) setPending(false)
    }
  }

  const loading = snapshot?.key !== key
  return {
    election: loading ? null : snapshot.election,
    result: loading ? null : snapshot.result,
    error: loading ? null : snapshot.error,
    loading,
    reload,
    publish,
    pending,
    writeError,
    blocked,
    notice,
  }
}
