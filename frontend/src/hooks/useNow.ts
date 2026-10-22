import { useEffect, useState } from 'react'

/**
 * Wall-clock time in milliseconds, refreshed on an interval so window-derived
 * labels stay truthful in sessions that outlive an election's ends_at.
 *
 * The first render reports `initial` (each page's module-load time) to keep
 * that render pure; the clock syncs right after mount and then every
 * `intervalMs`.
 */
export function useNow(initial: number, intervalMs = 30_000): number {
  const [now, setNow] = useState(initial)
  useEffect(() => {
    const update = () => setNow(Date.now())
    update()
    const timer = window.setInterval(update, intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
