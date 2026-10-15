import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import type { ElectionInput } from '../../api/types'
import type { ElectionFormErrors, ElectionFormValues } from '../../shared/electionForm'
import { validateElectionForm } from '../../shared/electionForm'
import { errorMessage } from '../../shared/errors'
import './ElectionCreateForm.css'

interface Props {
  onSubmit: (input: ElectionInput) => Promise<void>
  pending: boolean
  error: unknown
  uncertain: boolean
  allowAfterReview: () => void
  cancelPath?: string
  preview?: boolean
}
export function ElectionCreateForm({
  onSubmit,
  pending,
  error,
  uncertain,
  allowAfterReview,
  cancelPath = '/elections',
  preview = false,
}: Props) {
  const [values, setValues] = useState<ElectionFormValues>({
    title: '',
    position_title: '',
    description: '',
    starts_at: '',
    ends_at: '',
    voters: '',
  })
  const [errors, setErrors] = useState<ElectionFormErrors>({})
  function update(field: keyof ElectionFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || uncertain) return
    const result = validateElectionForm(values)
    setErrors(result.errors)
    if (result.input) await onSubmit(result.input)
  }
  function fieldError(field: keyof ElectionFormValues) {
    return errors[field] ? (
      <span id={`create-${field}-error`} className="form-error" role="alert">
        {errors[field]}
      </span>
    ) : null
  }
  function attributes(field: keyof ElectionFormValues) {
    return {
      'aria-invalid': !!errors[field],
      'aria-describedby': errors[field] ? `create-${field}-error` : undefined,
    }
  }
  return (
    <section className="placeholder election-create" aria-labelledby="create-election-heading">
      <Link to={cancelPath}>返回选举列表</Link>
      <h1 id="create-election-heading">创建选举</h1>
      <p>创建后为草稿，再到详情页配置候选人和维护名册，准备好后开启投票。</p>
      <p>投票规则固定为：一个职位、单选、一人一票、强制匿名。</p>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <fieldset disabled={pending}>
          <legend>选举资料（* 为必填）</legend>
          <label className="field">
            <span>选举名称 *</span>
            <input
              name="title"
              required
              value={values.title}
              onChange={(event) => update('title', event.target.value)}
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
              onChange={(event) => update('position_title', event.target.value)}
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
              onChange={(event) => update('description', event.target.value)}
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
                onChange={(event) => update('starts_at', event.target.value)}
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
                onChange={(event) => update('ends_at', event.target.value)}
                {...attributes('ends_at')}
              />
              {fieldError('ends_at')}
            </label>
          </div>
          <p>按浏览器所在时区输入，提交时转换为 UTC 时间。</p>
          <label className="field">
            <span>初始选民用户 ID *</span>
            <textarea
              name="voter_ids"
              rows={3}
              required
              value={values.voters}
              onChange={(event) => update('voters', event.target.value)}
              {...attributes('voters')}
            />
            {fieldError('voters')}
          </label>
          <p>
            用逗号、空格或换行分隔。仅填写已有有效普通用户的 ID，不能重复。真实账号 ID
            需由后端提供；本页不创建账号。
          </p>
        </fieldset>
        {error ? (
          <div className="state error" role="alert">
            <p>{errorMessage(error)}</p>
            {uncertain && (
              <>
                <p>创建结果尚未确认。请先查看选举列表核对，避免重复创建。</p>
                <Link to={cancelPath}>去列表核对</Link>
                <button type="button" onClick={allowAfterReview}>
                  已核对未创建，允许重新提交
                </button>
              </>
            )}
          </div>
        ) : null}
        <div className="election-create-actions">
          <Link to={cancelPath}>取消</Link>
          <button type="submit" disabled={pending || uncertain}>
            {pending ? '创建中…' : preview ? '模拟提交（不保存）' : '创建草稿'}
          </button>
        </div>
      </form>
    </section>
  )
}
