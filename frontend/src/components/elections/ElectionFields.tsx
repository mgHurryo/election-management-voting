import type { ElectionFieldValues, ElectionFormErrors } from '../../shared/electionForm'

interface Props {
  values: ElectionFieldValues
  errors: ElectionFormErrors
  onChange: (field: keyof ElectionFieldValues, value: string) => void
  idPrefix: string
  section?: 'all' | 'details' | 'description'
}

export function ElectionFields({ values, errors, onChange, idPrefix, section = 'all' }: Props) {
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
  const name = (
    <label className="lfield election-create-name">
      <span>Election name *</span>
      <input
        name="title"
        value={values.title}
        onChange={(event) => onChange('title', event.target.value)}
        {...attributes('title')}
      />
      {fieldError('title')}
    </label>
  )
  const position = (
    <label className="lfield election-create-position">
      <span>Position *</span>
      <input
        name="position_title"
        value={values.position_title}
        onChange={(event) => onChange('position_title', event.target.value)}
        {...attributes('position_title')}
      />
      {fieldError('position_title')}
    </label>
  )
  const description = (
    <label className="lfield election-create-description">
      <span>Description (optional)</span>
      <textarea
        name="description"
        rows={4}
        value={values.description}
        onChange={(event) => onChange('description', event.target.value)}
        {...attributes('description')}
      />
      {fieldError('description')}
    </label>
  )
  const schedule = (
    <>
      <div className="lgbox-wrap election-create-times">
        <label className="lfield">
          <span>Opens at *</span>
          <input
            type="datetime-local"
            name="starts_at"
            step="1"
            value={values.starts_at}
            onChange={(event) => onChange('starts_at', event.target.value)}
            {...attributes('starts_at')}
          />
          {fieldError('starts_at')}
        </label>
        <label className="lfield">
          <span>Closes at *</span>
          <input
            type="datetime-local"
            name="ends_at"
            step="1"
            value={values.ends_at}
            onChange={(event) => onChange('ends_at', event.target.value)}
            {...attributes('ends_at')}
          />
          {fieldError('ends_at')}
        </label>
      </div>
      <p className="lsub election-create-time-note">
        Times are entered in your local time zone and submitted as UTC.
      </p>
    </>
  )

  if (section === 'details')
    return (
      <>
        {name}
        {position}
        {schedule}
      </>
    )
  if (section === 'description') return description
  return (
    <>
      {name}
      {position}
      {description}
      {schedule}
    </>
  )
}
