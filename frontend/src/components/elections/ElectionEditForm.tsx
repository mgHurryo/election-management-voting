import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import type { Election, ElectionPatch } from '../../api/types'
import type { ElectionFormErrors } from '../../shared/electionForm'
import { buildElectionPatch, electionToFields } from '../../shared/electionPatch'
import { errorMessage } from '../../shared/errors'
import { ElectionFields } from './ElectionFields'
import './ElectionCreateForm.css'

interface Props {
  election: Election
  onSave: (patch: ElectionPatch) => Promise<void>
  saving: boolean
  error: unknown
  blocked: boolean
  reload: () => void
  detailPath?: string
  preview?: boolean
}
export function ElectionEditForm({
  election,
  onSave,
  saving,
  error,
  blocked,
  reload,
  detailPath = `/elections/${encodeURIComponent(election.id)}`,
  preview = false,
}: Props) {
  const [values, setValues] = useState(() => electionToFields(election))
  const [errors, setErrors] = useState<ElectionFormErrors>({})
  const [notice, setNotice] = useState('')
  if (election.status !== 'DRAFT')
    return (
      <section className="placeholder">
        <h1>无法编辑选举</h1>
        <p>只有草稿选举可以编辑。当前选举已开放或已关闭。</p>
        <Link to={detailPath}>返回选举详情</Link>
      </section>
    )
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || blocked) return
    const result = buildElectionPatch(values, election)
    setErrors(result.errors)
    setNotice('')
    if (!result.patch) return
    if (!Object.keys(result.patch).length) {
      setNotice('尚未修改任何资料，无需保存。')
      return
    }
    await onSave(result.patch)
  }
  return (
    <section className="placeholder election-create" aria-labelledby="edit-election-heading">
      <Link to={detailPath}>返回选举详情</Link>
      <h1 id="edit-election-heading">编辑选举</h1>
      <p>仅修改草稿的基本资料和时间。保存成功后返回详情页。</p>
      <p>候选人和选民名册通过详情页的专门入口维护；本页不修改它们。</p>
      <form noValidate onSubmit={(event) => void submit(event)}>
        <fieldset disabled={saving || blocked}>
          <legend>选举资料（* 为必填）</legend>
          <ElectionFields
            values={values}
            errors={errors}
            idPrefix="edit"
            onChange={(field, value) => {
              setValues((current) => ({ ...current, [field]: value }))
              setErrors((current) => ({ ...current, [field]: undefined }))
              setNotice('')
            }}
          />
        </fieldset>
        {notice && <p role="status">{notice}</p>}
        {error ? (
          <div className="state error" role="alert">
            <p>{errorMessage(error)}</p>
            {blocked && (
              <>
                <p>
                  请先核对最新状态和资料。超时不一定表示保存失败；重新加载会放弃当前未保存的输入。
                </p>
                <Link to={detailPath}>去详情核对</Link>
                <button type="button" disabled={saving} onClick={reload}>
                  重新加载最新资料
                </button>
              </>
            )}
          </div>
        ) : null}
        <div className="election-create-actions">
          <Link to={detailPath}>取消</Link>
          <button type="submit" disabled={saving || blocked}>
            {saving ? '保存中…' : preview ? '模拟保存（不修改真实数据）' : '保存修改'}
          </button>
        </div>
      </form>
    </section>
  )
}
