import type { ElectionFieldValues, ElectionFormErrors } from '../../shared/electionForm'

interface Props {
  values: ElectionFieldValues
  errors: ElectionFormErrors
  onChange: (field: keyof ElectionFieldValues, value: string) => void
  idPrefix: string
}
export function ElectionFields({ values, errors, onChange, idPrefix }: Props) {
  function fieldError(field: keyof ElectionFieldValues) {
    return errors[field] ? (
      <span id={idPrefix + '-' + field + '-error'} className="form-error" role="alert">
        {errors[field]}
      </span>
    ) : null
  }
  function attributes(field: keyof ElectionFieldValues) {
    return {
      'aria-invalid': !!errors[field],
      'aria-describedby': errors[field] ? idPrefix + '-' + field + '-error' : undefined,
    }
  }
  return (
    <>
      {' '}
      <label className="field">
        <span>选举名称 *</span>
        <input
          name="title"
          required
          value={values.title}
          onChange={(event) => onChange('title', event.target.value)}
          {...attributes('title')}
        />
        {fieldError('title')}
      </label>
      <label className="field">
        <span>竞选职位 *</span>
        <input
          name="position_title"
          required
          value={values.position_title}
          onChange={(event) => onChange('position_title', event.target.value)}
          {...attributes('position_title')}
        />
        {fieldError('position_title')}
      </label>
      <label className="field">
        <span>选举说明（选填）</span>
        <textarea
          name="description"
          rows={4}
          value={values.description}
          onChange={(event) => onChange('description', event.target.value)}
          {...attributes('description')}
        />
        {fieldError('description')}
      </label>
      <div className="election-create-times">
        <label className="field">
          <span>开始时间 *</span>
          <input
            type="datetime-local"
            name="starts_at"
            step="1"
            required
            value={values.starts_at}
            onChange={(event) => onChange('starts_at', event.target.value)}
            {...attributes('starts_at')}
          />
          {fieldError('starts_at')}
        </label>
        <label className="field">
          <span>结束时间 *</span>
          <input
            type="datetime-local"
            name="ends_at"
            step="1"
            required
            value={values.ends_at}
            onChange={(event) => onChange('ends_at', event.target.value)}
            {...attributes('ends_at')}
          />
          {fieldError('ends_at')}
        </label>
      </div>
      <p>按浏览器所在时区输入，提交时转换为 UTC 时间。</p>
    </>
  )
}
