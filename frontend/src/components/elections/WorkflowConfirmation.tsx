import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/** Inline confirmation keeps the underlying record visible and restores keyboard focus. */
export function WorkflowConfirmation({
  title,
  description,
  action,
  pending,
  returnFocus,
  onConfirm,
  onCancel,
}: {
  title: string
  description: string
  action: string
  pending: boolean
  returnFocus: RefObject<HTMLElement | null>
  onConfirm: () => void
  onCancel: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const trigger = returnFocus.current
    heading.current?.focus()
    return () => {
      if (trigger?.isConnected) trigger.focus()
    }
  }, [returnFocus])
  return (
    <section className="workflow-confirmation" aria-labelledby="workflow-confirm-title">
      <h2 id="workflow-confirm-title" tabIndex={-1} ref={heading}>
        {title}
      </h2>
      <p>{description}</p>
      <div className="workflow-actions">
        <button type="button" className="btn main" disabled={pending} onClick={onConfirm}>
          {pending ? 'Saving…' : action}
        </button>
        <button type="button" className="btn ghost" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  )
}
