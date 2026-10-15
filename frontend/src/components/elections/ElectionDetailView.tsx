import { useState } from 'react'
import { Link } from 'react-router'
import type { Candidate, Election, Paginated, Role } from '../../api/types'
import type { StatusAction } from '../../hooks/useElectionDetail'
import { ApiError } from '../../api/client'
import { errorMessage } from '../../shared/errors'
import { ErrorState, LoadingState } from '../AsyncState'
import { CandidateProfile } from './CandidateProfile'
import './ElectionDetailView.css'

interface Props {
  election: Election
  role: Role
  candidateState: { data: Paginated<Candidate> | null; error: unknown; loading: boolean }
  canRequestCandidates: boolean
  candidatePage: number
  setCandidatePage: (page: number) => void
  retryCandidates: () => void
  refresh: () => void
  action: {
    pending: boolean
    error: unknown
    message: string
    run: (action: StatusAction) => Promise<void>
  }
  listPath?: string
}
const labels = { DRAFT: '草稿', OPEN: '开放', CLOSED: '关闭' }
const formatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
})
function time(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间不可用' : formatter.format(date)
}

export function ElectionDetailView({
  election,
  role,
  candidateState,
  canRequestCandidates,
  candidatePage,
  setCandidatePage,
  retryCandidates,
  refresh,
  action,
  listPath = '/elections',
}: Props) {
  const [confirmation, setConfirmation] = useState<StatusAction | null>(null)
  const base = `/elections/${encodeURIComponent(election.id)}`
  const data = candidateState.data
  const candidateError = candidateState.error
  const restricted =
    candidateError instanceof ApiError && [401, 403, 404, 409].includes(candidateError.status)
  const pages = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.page_size)) : 1
  return (
    <section className="placeholder election-detail" aria-labelledby="election-detail-heading">
      <Link to={listPath}>返回选举列表</Link>
      <div className="election-detail-heading">
        <h1 id="election-detail-heading">{election.title}</h1>
        <span className="label">{labels[election.status]}</span>
      </div>
      <dl className="election-detail-facts">
        <div>
          <dt>竞选职位</dt>
          <dd>{election.position_title}</dd>
        </div>
        <div>
          <dt>投票规则</dt>
          <dd>单选 · 一人一票 · 匿名投票</dd>
        </div>
        <div>
          <dt>开始时间</dt>
          <dd>
            <time dateTime={election.starts_at}>{time(election.starts_at)}</time>
          </dd>
        </div>
        <div>
          <dt>结束时间</dt>
          <dd>
            <time dateTime={election.ends_at}>{time(election.ends_at)}</time>
          </dd>
        </div>
        <div>
          <dt>结果发布</dt>
          <dd>
            {election.results_published_at ? (
              <time dateTime={election.results_published_at}>
                {time(election.results_published_at)}
              </time>
            ) : (
              '尚未发布'
            )}
          </dd>
        </div>
      </dl>
      <p className="election-time-note">时间按浏览器所在时区显示；是否可投票以服务器校验为准。</p>
      <h2>选举说明</h2>
      <p className="election-description">{election.description || '暂无选举说明。'}</p>

      <section aria-labelledby="candidate-heading">
        <h2 id="candidate-heading">候选人介绍</h2>
        {!canRequestCandidates ? (
          <p role="status">普通用户仅在选举开放、处于投票时间且具备资格时可查看候选人资料。</p>
        ) : candidateState.loading ? (
          <LoadingState />
        ) : candidateError ? (
          restricted ? (
            <p role="status">{errorMessage(candidateError)}</p>
          ) : (
            <ErrorState error={candidateError} retry={retryCandidates} />
          )
        ) : data ? (
          <>
            {data.data.length ? (
              <div className="candidate-profiles">
                {data.data.map((candidate) => (
                  <CandidateProfile
                    key={`${candidate.id}/${candidate.photo_url}`}
                    candidate={candidate}
                  />
                ))}
              </div>
            ) : (
              <p role="status">
                {candidatePage > 1 ? '本页暂无候选人，请返回上一页。' : '暂无候选人。'}
              </p>
            )}
            <nav className="candidate-pagination" aria-label="候选人分页">
              <button
                disabled={candidatePage <= 1}
                onClick={() => setCandidatePage(candidatePage - 1)}
              >
                上一页候选人
              </button>
              <span role="status">
                第 {candidatePage} 页 · 共 {data.meta.total} 位候选人
              </span>
              <button
                disabled={candidatePage >= pages}
                onClick={() => setCandidatePage(candidatePage + 1)}
              >
                下一页候选人
              </button>
            </nav>
          </>
        ) : null}
      </section>

      <section className="election-detail-actions" aria-labelledby="election-actions-heading">
        <h2 id="election-actions-heading">{role === 'ADMIN' ? '管理员操作' : '参与选举'}</h2>
        <div className="election-action-links">
          {role === 'ADMIN' && election.status === 'DRAFT' && (
            <>
              <Link to={`${base}/edit`}>编辑选举</Link>
              <Link to={`${base}/candidates`}>候选人管理</Link>
              <Link to={`${base}/voters`}>选民名册</Link>
            </>
          )}
          {role === 'ADMIN' && election.status !== 'CLOSED' && (
            <button
              disabled={action.pending}
              onClick={() => setConfirmation(election.status === 'DRAFT' ? 'open' : 'close')}
            >
              {action.pending ? '处理中…' : election.status === 'DRAFT' ? '开启投票' : '关闭投票'}
            </button>
          )}
          {role === 'USER' && election.status === 'OPEN' && (
            <Link to={`${base}/vote`}>进入投票页</Link>
          )}
          {election.status === 'CLOSED' && (role === 'ADMIN' || election.results_published_at) && (
            <Link to={`${base}/results`}>
              {role === 'ADMIN' ? '查看并发布结果' : '查看已发布结果'}
            </Link>
          )}
        </div>
        {role === 'USER' && election.status === 'DRAFT' && <p>选举尚未开放。</p>}
        {role === 'USER' && election.status === 'OPEN' && (
          <p>进入投票页后，还需由服务器确认资格、时间和剩余投票额度。</p>
        )}
        {role === 'USER' && election.status === 'CLOSED' && !election.results_published_at && (
          <p>投票已关闭，结果尚未发布。</p>
        )}
        {confirmation && !action.pending && role === 'ADMIN' && (
          <div className="election-confirm" role="group" aria-label="确认选举状态操作">
            <p>
              {confirmation === 'open'
                ? '确认开启投票？开启后将不能修改选举、候选人和名册。'
                : '确认关闭投票？关闭后将不能再提交选票。'}
            </p>
            <button
              onClick={() => {
                const selected = confirmation
                setConfirmation(null)
                void action.run(selected)
              }}
            >
              确认{confirmation === 'open' ? '开启' : '关闭'}
            </button>
            <button onClick={() => setConfirmation(null)}>取消</button>
          </div>
        )}
        {action.message && <p role="status">{action.message}</p>}
        {action.error ? (
          <div className="state error" role="alert">
            <p>{errorMessage(action.error)}</p>
            <p>请先刷新选举状态再决定下一步；超时不一定表示操作失败。</p>
            <button onClick={refresh}>刷新选举状态</button>
          </div>
        ) : null}
      </section>
    </section>
  )
}
