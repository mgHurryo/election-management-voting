import { useState } from 'react'
import type { ElectionInput } from '../api/types'
import { ElectionCreateForm } from '../components/elections/ElectionCreateForm'

export default function CreateElectionPreview() {
  const [submitted, setSubmitted] = useState<ElectionInput | null>(null)
  return (
    <>
      <aside className="state" aria-label="开发预览说明">
        <strong>开发预览 · 模拟创建，不保存</strong>
        <p>使用虚构选民 ID 体验表单校验，例如 21、22。本页不连接后端，不创建真实选举或名册。</p>
      </aside>
      <ElectionCreateForm
        preview
        pending={false}
        error={null}
        uncertain={false}
        allowAfterReview={() => {}}
        cancelPath="/__preview/elections"
        onSubmit={async (input) => {
          setSubmitted(input)
        }}
      />
      {submitted && (
        <section className="state" aria-label="模拟提交结果">
          <h2>校验通过，模拟提交完成（未保存）</h2>
          <p role="status">
            已准备选举“{submitted.title}”，含 {submitted.voter_ids.length} 个初始选民 ID。
          </p>
          <p>
            本地时间已转换为 UTC：{submitted.starts_at} 至 {submitted.ends_at}。
          </p>
          <p>真实页面会调用创建接口，成功后跳转到新选举详情；预览不会创建或跳转到虚假记录。</p>
        </section>
      )}
    </>
  )
}
