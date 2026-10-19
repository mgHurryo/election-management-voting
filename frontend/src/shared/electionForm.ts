import type { ElectionInput } from '../api/types'

export interface ElectionFieldValues {
  title: string
  position_title: string
  description: string
  starts_at: string
  ends_at: string
}
export interface ElectionFormValues extends ElectionFieldValues {
  voters: string
}
export type ElectionFormErrors = Partial<Record<keyof ElectionFormValues, string>>
export type ElectionFieldsInput = Omit<ElectionInput, 'voter_ids'>

function localTime(value: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.0{1,3})?)?$/.exec(value)
  if (!parts) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const fields = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ]
  if (fields.some((field, index) => field !== Number(parts[index + 1] || 0))) return null
  return date
}

export function validateElectionFields(values: ElectionFieldValues): {
  errors: ElectionFormErrors
  input: ElectionFieldsInput | null
} {
  const errors: ElectionFormErrors = {}
  const title = values.title.trim()
  const position = values.position_title.trim()
  const description = values.description.trim()
  if (!title || [...title].length > 200)
    errors.title = 'Enter 1–200 characters for the election name.'
  if (!position || [...position].length > 100)
    errors.position_title = 'Enter 1–100 characters for the position.'
  if ([...description].length > 10000)
    errors.description = 'The description cannot exceed 10000 characters.'
  const start = localTime(values.starts_at)
  const end = localTime(values.ends_at)
  if (!start) errors.starts_at = 'Enter a valid start time.'
  if (!end) errors.ends_at = 'Enter a valid end time.'
  if (start && end && start >= end) errors.ends_at = 'The end time must be after the start time.'
  if (Object.keys(errors).length || !start || !end) return { errors, input: null }
  return {
    errors,
    input: {
      title,
      position_title: position,
      description: description || null,
      starts_at: start.toISOString().replace('.000Z', 'Z'),
      ends_at: end.toISOString().replace('.000Z', 'Z'),
    },
  }
}

export function validateElectionForm(values: ElectionFormValues): {
  errors: ElectionFormErrors
  input: ElectionInput | null
} {
  const fields = validateElectionFields(values)
  const errors = { ...fields.errors }
  const ids = values.voters
    .trim()
    .split(/[\s,，、]+/)
    .filter(Boolean)
  if (!ids.length) errors.voters = 'Enter at least one existing voter ID.'
  else if (ids.some((id) => !/^[1-9][0-9]*$/.test(id) || BigInt(id) > 18446744073709551615n))
    errors.voters = 'Voter IDs must be positive integers no larger than 18446744073709551615.'
  else if (new Set(ids).size !== ids.length)
    errors.voters = 'Voter IDs must be unique. Remove duplicates.'
  return {
    errors,
    input: fields.input && !Object.keys(errors).length ? { ...fields.input, voter_ids: ids } : null,
  }
}
