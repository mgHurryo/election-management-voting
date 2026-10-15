import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { ApiError } from '../api/client'
import type { Election, ElectionPatch } from '../api/types'

export function useEditElection(id: string) {
  const [revision, setRevision] = useState(0)
  const key = `${id}/${revision}`
  const [snapshot, setSnapshot] = useState<{
    key: string
    election: Election | null
    error: unknown
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [blocked, setBlocked] = useState(false)
  const busy = useRef(false)
  const blockedRef = useRef(false)
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current++
    },
    [id],
  )
  useEffect(() => {
    let active = true
    api.election(id).then(
      ({ data }) => {
        if (active) setSnapshot({ key, election: data, error: null })
      },
      (error: unknown) => {
        if (active) setSnapshot({ key, election: null, error })
      },
    )
    return () => {
      active = false
    }
  }, [id, key])
  const reload = useCallback(() => {
    blockedRef.current = false
    setBlocked(false)
    setSaveError(null)
    setRevision((value) => value + 1)
  }, [])
  async function save(patch: ElectionPatch) {
    if (
      busy.current ||
      blockedRef.current ||
      !Object.keys(patch).length ||
      snapshot?.key !== key ||
      snapshot.election?.status !== 'DRAFT'
    )
      return null
    busy.current = true
    const current = generation.current
    setSaving(true)
    setSaveError(null)
    try {
      const { data } = await api.updateElection(id, patch)
      if (!data || data.id !== id) throw new ApiError('INVALID_RESPONSE')
      return current === generation.current ? data : null
    } catch (error) {
      if (current === generation.current) {
        const mustReload =
          !(error instanceof ApiError) ||
          error.status === 0 ||
          error.status >= 500 ||
          error.code === 'ELECTION_NOT_EDITABLE' ||
          error.code === 'ELECTION_NOT_FOUND'
        blockedRef.current = mustReload
        setBlocked(mustReload)
        setSaveError(error)
      }
      return null
    } finally {
      busy.current = false
      if (current === generation.current) setSaving(false)
    }
  }
  const loading = snapshot?.key !== key
  return {
    election: loading ? null : snapshot.election,
    loading,
    error: loading ? null : snapshot.error,
    reload,
    revision,
    saving,
    saveError,
    blocked,
    save,
  }
}
