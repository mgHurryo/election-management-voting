import { useState } from 'react'
import { Link, useParams } from 'react-router'
import type { ElectionPatch } from '../api/types'
import { ElectionEditForm } from '../components/elections/ElectionEditForm'
import { exampleElections } from './electionExamples'

export default function EditElectionPreview() {
  const { id } = useParams()
  const election = exampleElections.find((item) => item.id === id)
  const [patch, setPatch] = useState<ElectionPatch | null>(null)
  const [revision, setRevision] = useState(0)
  if (!election)
    return (
      <section className="placeholder">
        <h1>预览选举不存在</h1>
        <Link to="/__preview/elections">返回预览列表</Link>
      </section>
    )
  return (
    <>
      <aside className="state" aria-label="开发预览说明">
        <strong>开发预览 · 模拟编辑，不修改真实数据</strong>
        <p>
          表单预填虚构选举资料，可修改后模拟保存。刷新或离开后不保留改动，也不会更新预览列表和详情。
        </p>
      </aside>
      <ElectionEditForm
        key={`${id}/${revision}`}
        election={election}
        saving={false}
        blocked={false}
        error={null}
        detailPath={`/__preview/elections/${encodeURIComponent(election.id)}`}
        preview
        reload={() => {
          setRevision((value) => value + 1)
          setPatch(null)
        }}
        onSave={async (value) => {
          setPatch(value)
        }}
      />
      {patch && (
        <section className="state" aria-label="模拟保存结果">
          <h2>模拟保存通过（未修改真实数据）</h2>
          <p role="status">
            仅准备了 {Object.keys(patch).length} 个改动字段，没有提交名册或只读字段。
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {JSON.stringify(patch, null, 2)}
          </pre>
        </section>
      )}
    </>
  )
}
