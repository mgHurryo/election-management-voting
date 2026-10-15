import { useState } from 'react'
import type { MouseEvent } from 'react'
import { exampleElections } from './electionExamples'
import { ElectionListView } from '../components/elections/ElectionListView'
import type { StatusFilter } from '../hooks/useElections'

export default function ElectionListPreview() {
  const [status, setStatus] = useState<StatusFilter>('')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState('')
  const filtered = exampleElections.filter((election) => !status || election.status === status)
  const pageSize = 3

  function handlePreviewLink(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return
    const anchor = event.target.closest('a')
    if (!anchor || anchor.getAttribute('href') !== '/elections/new') return
    event.preventDefault()
    setNotice('创建功能请在正式页面登录后使用；预览中不执行真实创建。')
  }

  return (
    <>
      <aside className="state" aria-label="开发预览说明">
        <strong>开发预览 · 全部为示例数据</strong>
        <p>无需登录，不连接选举接口，不会保存或修改真实数据。</p>
        <p>可以尝试状态筛选、翻页，并点击查看详情。预览每页 3 条，正式页面每页 20 条。</p>
        <p>此处展示管理员列表外观；正式页面仍按真实登录身份显示入口。</p>
        {notice && <p role="status">{notice}</p>}
      </aside>
      <div onClickCapture={handlePreviewLink}>
        <ElectionListView
          isAdmin
          detailBasePath="/__preview/elections"
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
