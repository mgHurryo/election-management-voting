import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { Election } from '../api/types'
import { ElectionListView } from '../components/elections/ElectionListView'
import type { StatusFilter } from '../hooks/useElections'

// This module is only imported by the development-only preview route.
const examples: Election[] = [
  ['1001', '示例：班长选举', '班长', 'DRAFT'],
  ['1002', '示例：学习委员选举', '学习委员', 'OPEN'],
  ['1003', '示例：社团负责人选举', '负责人', 'CLOSED'],
  ['1004', '示例：体育委员选举', '体育委员', 'DRAFT'],
  ['1005', '示例：活动代表选举', '活动代表', 'OPEN'],
  ['1006', '示例：小组代表选举', '小组代表', 'CLOSED'],
  ['1007', '示例：生活委员选举', '生活委员', 'DRAFT'],
].map(([id, title, position_title, status]) => ({
  id: id!,
  title: title!,
  position_title: position_title!,
  status: status as Election['status'],
  description: '用于查看界面效果的虚构数据。',
  created_by: '1',
  privacy_mode: 'FORCED_ANONYMOUS',
  starts_at: '2026-10-20T01:00:00Z',
  ends_at: '2026-10-20T09:00:00Z',
  results_published_at: null,
  created_at: '2026-10-16T00:00:00Z',
  updated_at: '2026-10-16T00:00:00Z',
}))

export default function ElectionListPreview() {
  const [status, setStatus] = useState<StatusFilter>('')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState('')
  const filtered = examples.filter((election) => !status || election.status === status)
  const pageSize = 3

  function handlePreviewLink(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element) || !event.target.closest('a')) return
    event.preventDefault()
    setNotice('这里只预览列表外观；创建和详情功能请在正式页面登录后使用。')
  }

  return (
    <>
      <aside className="state" aria-label="开发预览说明">
        <strong>开发预览 · 全部为示例数据</strong>
        <p>无需登录，不连接选举接口，不会保存或修改真实数据。</p>
        <p>可以尝试状态筛选和翻页。预览每页 3 条，正式页面每页 20 条。</p>
        <p>此处展示管理员列表外观；正式页面仍按真实登录身份显示入口。</p>
        {notice && <p role="status">{notice}</p>}
      </aside>
      <div onClickCapture={handlePreviewLink}>
        <ElectionListView
          isAdmin
          page={page}
          status={status}
          loading={false}
          error={null}
          data={{
            data: filtered.slice((page - 1) * pageSize, page * pageSize),
            meta: { page, page_size: pageSize, total: filtered.length },
          }}
          setStatus={(value) => {
            setStatus(value)
            setPage(1)
            setNotice('')
          }}
          setPage={setPage}
          retry={() => {}}
        />
      </div>
    </>
  )
}
