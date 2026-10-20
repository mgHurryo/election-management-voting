import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { ApiError } from '../api/client'
import type { Election, Paginated, Voter } from '../api/types'

export function useVoterRoll(id: string) {
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const key = `${id}/${page}/${revision}`
  const [snapshot, setSnapshot] = useState<{
    key: string
    election: Election | null
    voters: Paginated<Voter> | null
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
        const voters = await api.voters(id, page)
        if (!active) return
        const lastPage = Math.max(1, Math.ceil(voters.meta.total / voters.meta.page_size))
        if (page > lastPage) {
          setPage(lastPage)
          return
        }
        setSnapshot({ key, election, voters, error: null })
        setBlocked(false)
      } catch (error) {
        if (active) setSnapshot({ key, election: null, voters: null, error })
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [id, page, key])

  function reload() {
    if (busy.current) return
    setWriteError(null)
    setRevision((value) => value + 1)
  }

  async function mutate(userId: string, remove: boolean) {
    if (busy.current || blocked || snapshot?.key !== key || snapshot.election?.status !== 'DRAFT')
      return false
    busy.current = true
    setPending(true)
    setWriteError(null)
    setNotice('')
    try {
      if (remove) await api.removeVoter(id, userId)
      else await api.addVoter(id, userId)
      if (!mounted.current) return false
      setNotice(remove ? 'Voter removed from the roll.' : 'Voter added to the roll.')
      setRevision((value) => value + 1)
      return true
    } catch (error) {
      if (mounted.current) {
        setWriteError(error)
        // A failed response can follow a committed write. Re-read before another change.
        setBlocked(true)
      }
      return false
    } finally {
      busy.current = false
      if (mounted.current) setPending(false)
    }
  }

  const loading = snapshot?.key !== key
  return {
    election: loading ? null : snapshot.election,
    voters: loading ? null : snapshot.voters,
    error: loading ? null : snapshot.error,
    loading,
    page,
    setPage,
    reload,
    pending,
    writeError,
    blocked,
    notice,
    add: (userId: string) => mutate(userId, false),
    remove: (userId: string) => mutate(userId, true),
  }
}
