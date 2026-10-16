import { useState } from 'react'
import type { MouseEvent } from 'react'
import { Link, useParams } from 'react-router'
import type { Candidate } from '../api/types'
import { ElectionDetailView } from '../components/elections/ElectionDetailView'
import { exampleElections } from './electionExamples'

export default function ElectionDetailPreview() {
  const { id } = useParams()
  const election = exampleElections.find((item) => item.id === id)
  const [notice, setNotice] = useState('')
  if (!election)
    return (
      <section className="placeholder">
        <h1>预览选举不存在</h1>
        <Link to="/__preview/elections">返回预览列表</Link>
      </section>
    )
  const profiles = [
    ['示例候选人甲', '希望认真收集同学意见，定期整理学习资料，协助班级活动安排。'],
    ['示例候选人乙', '愿意协助同学解决日常问题，及时传达通知，推动班级交流。'],
    ['示例候选人丙', '希望组织更多学习交流活动，并为每位同学提供参与班级事务的机会。'],
  ]
  const candidates: Candidate[] = profiles.map(([name, description], index) => ({
    id: String(index + 1),
    election_id: election.id,
    name: name!,
    description: description!,
    position_title: election.position_title,
    photo_url: null,
    display_order: index,
    created_at: election.created_at,
    updated_at: election.updated_at,
  }))
  function handleLink(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return
    const anchor = event.target.closest('a')
    if (
      !anchor ||
      anchor.getAttribute('href') === '/__preview/elections' ||
      anchor.getAttribute('href') === `/__preview/elections/${id}/edit`
    )
      return
    event.preventDefault()
    setNotice('这是详情外观预览；编辑、管理、投票和结果功能请在正式页面登录后使用。')
  }
  return (
    <>
      <aside className="state" aria-label="开发预览说明">
        <strong>开发预览 · 全部为示例数据</strong>
        <p>此处展示管理员视角，候选人和简介均为虚构。不会查询或修改真实选举。</p>
        <p>可以返回预览列表或进入编辑预览；其他业务入口和确认开启／关闭只显示说明。</p>
        {notice && <p role="status">{notice}</p>}
      </aside>
      <div onClickCapture={handleLink}>
        <ElectionDetailView
          key={id}
          election={election}
          role="ADMIN"
          candidateState={{
            data: { data: candidates, meta: { page: 1, page_size: 20, total: candidates.length } },
            error: null,
            loading: false,
          }}
          canRequestCandidates
          candidatePage={1}
          setCandidatePage={() => {}}
          retryCandidates={() => {}}
          refresh={() => {}}
          listPath="/__preview/elections"
          editPath={`/__preview/elections/${id}/edit`}
          action={{
            pending: false,
            error: null,
            message: '',
            run: async () => {
              setNotice('预览不会执行真实的开启或关闭操作，也不会修改数据。')
            },
          }}
        />
      </div>
    </>
  )
}
