import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Election, Envelope, Paginated, Candidate, Role } from '../api/types'

function useRead<T>(key: string, enabled: boolean, load: () => Promise<T>) {
  const [snapshot, setSnapshot] = useState<{ key: string; data: T | null; error: unknown } | null>(
    null,
  )
  useEffect(() => {
    if (!enabled) return
    let active = true
    load().then(
      (data) => {
        if (active) setSnapshot({ key, data, error: null })
      },
      (error: unknown) => {
        if (active) setSnapshot({ key, data: null, error })
      },
    )
    return () => {
      active = false
    }
  }, [key, enabled, load])
  const settled = enabled && snapshot?.key === key
  return {
    data: settled ? snapshot.data : null,
    error: settled ? snapshot.error : null,
    loading: enabled && !settled,
  }
}

export function useElectionDetail(id: string, role: Role | undefined) {
  const [revision, setRevision] = useState(0)
  const [candidateRevision, setCandidateRevision] = useState(0)
  const [pagination, setPagination] = useState({ id, page: 1 })
  const page = pagination.id === id ? pagination.page : 1
  const loadElection = useCallback(() => api.election(id), [id])
  const detail = useRead<Envelope<Election>>(`${id}/${revision}`, true, loadElection)
  const election = detail.data?.data ?? null
  const canRequestCandidates = !!election && (role === 'ADMIN' || election.status === 'OPEN')
  const loadCandidates = useCallback(() => api.candidates(id, page), [id, page])
  const candidates = useRead<Paginated<Candidate>>(
    `${id}/${role}/${page}/${revision}/${candidateRevision}`,
    canRequestCandidates,
    loadCandidates,
  )
  return {
    election,
    loading: detail.loading,
    error: detail.error,
    reload: () => setRevision((value) => value + 1),
    candidates,
    canRequestCandidates,
    candidatePage: page,
    setCandidatePage: (value: number) => setPagination({ id, page: value }),
    retryCandidates: () => setCandidateRevision((value) => value + 1),
  }
}

export type StatusAction = 'open' | 'close'

export function useElectionStatusAction(id: string, refresh: () => void) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [message, setMessage] = useState('')
  const generation = useRef(0)
  const busy = useRef(false)
  useEffect(
    () => () => {
      generation.current++
    },
    [id],
  )
  async function run(action: StatusAction) {
    if (busy.current) return
    busy.current = true
    const current = generation.current
    setPending(true)
    setError(null)
    setMessage('')
    try {
      if (action === 'open') await api.openElection(id)
      else await api.closeElection(id)
      if (current === generation.current) {
        setMessage(action === 'open' ? '选举已开启。' : '选举已关闭。')
        refresh()
      }
    } catch (reason) {
      if (current === generation.current) setError(reason)
    } finally {
      busy.current = false
      if (current === generation.current) setPending(false)
    }
  }
  return { pending, error, message, run }
}
