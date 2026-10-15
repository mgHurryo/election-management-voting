import { Link } from 'react-router'
import { ErrorState, LoadingState } from '../AsyncState'
import type { useElections } from '../../hooks/useElections'
import type { StatusFilter } from '../../hooks/useElections'
import './ElectionListView.css'

const statuses = { DRAFT: '草稿', OPEN: '开放', CLOSED: '关闭' } as const
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
})

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间不可用' : dateFormat.format(date)
}

type Props = ReturnType<typeof useElections> & { isAdmin: boolean }

export function ElectionListView({
  isAdmin,
  page,
  status,
  loading,
  data,
  error,
  setStatus,
  setPage,
  retry,
}: Props) {
  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.page_size)) : 1

  return (
    <section className="placeholder election-list" aria-labelledby="elections-heading">
      <div className="election-list-heading">
        <div>
          <span className="eyebrow">M3 · 选举</span>
          <h1 id="elections-heading">选举列表</h1>
        </div>
        {isAdmin && (
          <Link className="election-create-link" to="/elections/new">
            创建选举
          </Link>
        )}
      </div>
      <p>查看你有权访问的选举，进入详情了解具体安排。</p>
      <label className="field election-filter">
        <span>选举状态</span>
        <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
          <option value="">全部</option>
          <option value="DRAFT">草稿</option>
          <option value="OPEN">开放</option>
          <option value="CLOSED">关闭</option>
        </select>
      </label>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} retry={retry} />
      ) : data ? (
        <>
          {data.data.length === 0 ? (
            <p className="state" role="status">
              {page > 1
                ? '本页暂无选举，请返回上一页。'
                : status
                  ? '当前状态下暂无可查看的选举。'
                  : '暂无可查看的选举。'}
            </p>
          ) : (
            <div
              className="election-table-scroll"
              role="region"
              aria-label="选举列表表格，可横向滚动"
              tabIndex={0}
            >
              <table className="election-table">
                <caption className="election-table-caption">时间按浏览器所在时区显示。</caption>
                <thead>
                  <tr>
                    <th scope="col">选举名称</th>
                    <th scope="col">职位</th>
                    <th scope="col">状态</th>
                    <th scope="col">开始时间</th>
                    <th scope="col">结束时间</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((election) => (
                    <tr key={election.id}>
                      <th scope="row">{election.title}</th>
                      <td>{election.position_title}</td>
                      <td>
                        <span className="election-status">{statuses[election.status]}</span>
                      </td>
                      <td>
                        <time dateTime={election.starts_at}>{formatTime(election.starts_at)}</time>
                      </td>
                      <td>
                        <time dateTime={election.ends_at}>{formatTime(election.ends_at)}</time>
                      </td>
                      <td>
                        <Link
                          to={`/elections/${encodeURIComponent(election.id)}`}
                          aria-label={`查看详情：${election.title}`}
                        >
                          查看详情
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav className="election-pagination" aria-label="选举列表分页">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              上一页
            </button>
            <span role="status">
              第 {page} 页 · 共 {data.meta.total} 场选举
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              下一页
            </button>
          </nav>
        </>
      ) : null}
    </section>
  )
}
