import type { Election, ElectionPatch } from '../api/types'
import type { ElectionFieldValues, ElectionFormErrors } from './electionForm'
import { validateElectionFields } from './electionForm'

function localInput(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
export function electionToFields(election: Election): ElectionFieldValues {
  return {
    title: election.title,
    position_title: election.position_title,
    description: election.description ?? '',
    starts_at: localInput(election.starts_at),
    ends_at: localInput(election.ends_at),
  }
}
export function buildElectionPatch(
  values: ElectionFieldValues,
  original: Election,
): { errors: ElectionFormErrors; patch: ElectionPatch | null } {
  const checked = validateElectionFields(values)
  if (!checked.input) return { errors: checked.errors, patch: null }
  const baseline = electionToFields(original)
  const normalized = checked.input
  const patch: ElectionPatch = {}
  if (values.title !== baseline.title && normalized.title !== original.title)
    patch.title = normalized.title
  if (
    values.position_title !== baseline.position_title &&
    normalized.position_title !== original.position_title
  )
    patch.position_title = normalized.position_title
  if (
    values.description !== baseline.description &&
    normalized.description !== original.description
  )
    patch.description = normalized.description
  if (
    values.starts_at !== baseline.starts_at &&
    new Date(normalized.starts_at).getTime() !== new Date(original.starts_at).getTime()
  )
    patch.starts_at = normalized.starts_at
  if (
    values.ends_at !== baseline.ends_at &&
    new Date(normalized.ends_at).getTime() !== new Date(original.ends_at).getTime()
  )
    patch.ends_at = normalized.ends_at
  return { errors: {}, patch }
}
