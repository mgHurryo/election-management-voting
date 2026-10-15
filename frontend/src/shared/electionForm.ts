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
  if (!title || [...title].length > 200) errors.title = '请输入 1–200 字符的选举名称。'
  if (!position || [...position].length > 100)
    errors.position_title = '请输入 1–100 字符的竞选职位。'
  if ([...description].length > 10000) errors.description = '说明不能超过 10000 字符。'
  const start = localTime(values.starts_at)
  const end = localTime(values.ends_at)
  if (!start) errors.starts_at = '请输入有效的开始时间。'
  if (!end) errors.ends_at = '请输入有效的结束时间。'
  if (start && end && start >= end) errors.ends_at = '结束时间必须晚于开始时间。'
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
  if (!ids.length) errors.voters = '请至少填写一个已有选民的用户 ID。'
  else if (ids.some((id) => !/^[1-9][0-9]*$/.test(id) || BigInt(id) > 18446744073709551615n))
    errors.voters = '用户 ID 须为正整数字符串，且不超过 18446744073709551615。'
  else if (new Set(ids).size !== ids.length) errors.voters = '用户 ID 不能重复，请移除重复项。'
  return {
    errors,
    input: fields.input && !Object.keys(errors).length ? { ...fields.input, voter_ids: ids } : null,
  }
}
