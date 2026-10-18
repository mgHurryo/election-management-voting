import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import './ElectionDetailPage.css'
import { api } from '../api'
import { ApiError } from '../api/client'
import type { Candidate, Election } from '../api/types'
import { ErrorState, LoadingState } from '../components/AsyncState'
import { useAuth } from '../hooks/useAuth'
import { useBallot, useElectionDetail, useElectionStatusAction } from '../hooks/useElectionDetail'
import { errorMessage } from '../shared/errors'

function two(n: number) {
  return (n < 10 ? '0' : '') + n
}

function fmt(d: Date) {
  return `${d.getFullYear()}/${two(d.getMonth() + 1)}/${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`
}

function when(value: string) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : fmt(d)
}

type CandidateMode = 'profiles' | 'grid' | 'directory'

function monogram(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?'
}

export default function ElectionDetailPage() {
  const { id = '' } = useParams()
  return <DetailContent key={id} id={id} />
}

function DetailContent({ id }: { id: string }) {
  const { user } = useAuth()
  const detail = useElectionDetail(id, user?.role)
  const status = useElectionStatusAction(id, detail.reload)
  const [votedAt, setVotedAt] = useState<Date | null>(null)
  const ballot = useBallot(id, user?.role === 'USER' && detail.election?.status === 'OPEN')
  const [voteError, setVoteError] = useState<unknown>(null)
  const [blocked, setBlocked] = useState(false)
  const busy = useRef(false)
  const [mode, setMode] = useState<CandidateMode>('profiles')
  const [modePage, setModePage] = useState(1)
  const [pick, setPick] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const election = detail.election
  const isAdmin = user?.role === 'ADMIN'
  const open = !!election && election.status === 'OPEN'
  const closed = !!election && election.status === 'CLOSED'
  const voterBallotView = !!user && !isAdmin && open
  const rows = ballot.data?.data.candidates ?? detail.candidates.data?.data ?? []
  const selected = rows.find((candidate) => candidate.id === pick)
  const participation = ballot.data?.data.participation
  const candidateCount = ballot.data?.data.candidates.length ?? detail.candidates.data?.meta.total
  const canVote =
    !!user &&
    !isAdmin &&
    open &&
    rows.length > 0 &&
    participation?.eligible === true &&
    participation.remaining_votes > 0
  const voterOnNonOpenElection = !!user && !isAdmin && !open

  if (votedAt && election) {
    return <Receipt election={election} at={votedAt} />
  }
  if (detail.loading) return <LoadingState />
  if (detail.error)
    return (
      <div className="wrap">
        <ErrorState error={detail.error} retry={detail.reload} />
        <p className="actions">
          <Link className="quiet" to="/">
            Back to elections
          </Link>
        </p>
      </div>
    )
  if (!election) return null

  async function submitBallot() {
    if (!selected || !canVote || !confirming || busy.current || blocked) return
    busy.current = true
    setSubmitting(true)
    setVoteError(null)
    try {
      const { data } = await api.vote(id, selected.id)
      if (data?.accepted !== true || data.election_id !== id) throw new ApiError('INVALID_RESPONSE')
      setVotedAt(new Date())
    } catch (error) {
      setVoteError(error)
      // An unacknowledged write may still commit; never offer an immediate repeat.
      setBlocked(
        !(error instanceof ApiError) ||
          error.status === 0 ||
          error.status >= 500 ||
          [
            'INVALID_RESPONSE',
            'VOTE_QUOTA_EXHAUSTED',
            'ELECTION_NOT_OPEN',
            'VOTING_ENDED',
            'NOT_ELIGIBLE',
          ].includes(error.code),
      )
    } finally {
      busy.current = false
      setSubmitting(false)
    }
  }

  function candidatesBlock() {
    if (!user) return null
    if (ballot.loading || (!ballot.data && detail.candidates.loading)) return <LoadingState />
    if (!ballot.data && detail.candidates.error)
      return <ErrorState error={detail.candidates.error} retry={detail.retryCandidates} />
    if (voterOnNonOpenElection) {
      return (
        <p className="noticeline">
          Candidate profiles become visible when voting opens and you are eligible.
        </p>
      )
    }
    if (!rows.length && ballot.error) return null
    if (!rows.length)
      return (
        <p className="empty" role="status">
          No candidates yet.
        </p>
      )
    if (!canVote) {
      const total = detail.candidates.data?.meta.total ?? 0
      const pageSize = detail.candidates.data?.meta.page_size ?? 20
      const pages = Math.max(1, Math.ceil(total / pageSize))
      return (
        <>
          <div className="candidate-list">
            {rows.map((c, index) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                ordinal={two(
                  (detail.candidatePage - 1) * (detail.candidates.data?.meta.page_size ?? 20) +
                    index +
                    1,
                )}
                mode="profiles"
                selectable={false}
                selected={false}
                onPick={() => {}}
              />
            ))}
          </div>
          {total > pageSize && (
            <div className="pager">
              <button
                type="button"
                className="pbtn"
                onClick={() => detail.setCandidatePage(detail.candidatePage - 1)}
                disabled={detail.candidatePage <= 1}
              >
                Previous candidates
              </button>
              <span className="num">
                Page {detail.candidatePage} of {pages}
              </span>
              <button
                type="button"
                className="pbtn"
                onClick={() => detail.setCandidatePage(detail.candidatePage + 1)}
                disabled={detail.candidatePage >= pages}
              >
                Next candidates
              </button>
            </div>
          )}
        </>
      )
    }
    const modes: Array<{ key: CandidateMode; label: string; hint: string }> = [
      { key: 'profiles', label: 'Profiles', hint: '4 per page' },
      { key: 'grid', label: 'Compact grid', hint: '8 per page' },
      { key: 'directory', label: 'Directory', hint: '8 per page' },
    ]
    const pageSize = mode === 'profiles' ? 4 : 8
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
    const page = Math.min(modePage, pageCount)
    const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize)
    return (
      <>
        <div className="cand-modes">
          <div className="seg" role="group" aria-label="Candidate display mode">
            {modes.map((m) => (
              <button
                key={m.key}
                type="button"
                className={mode === m.key ? 'on' : ''}
                aria-pressed={mode === m.key}
                onClick={() => {
                  setMode(m.key)
                  setModePage(1)
                  setConfirming(false)
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <span className="cand-hint">{modes.find((m) => m.key === mode)?.hint}</span>
        </div>
        {mode === 'profiles' ? (
          <div className="candidate-list">
            {visibleRows.map((c, index) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                ordinal={two((page - 1) * pageSize + index + 1)}
                mode="profiles"
                selectable
                selected={pick === c.id}
                disabled={confirming || submitting || blocked}
                onPick={() => setPick(c.id)}
              />
            ))}
          </div>
        ) : mode === 'grid' ? (
          <div className="cand-grid">
            {visibleRows.map((c, index) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                ordinal={two((page - 1) * pageSize + index + 1)}
                mode="grid"
                selectable
                selected={pick === c.id}
                disabled={confirming || submitting || blocked}
                onPick={() => setPick(c.id)}
              />
            ))}
          </div>
        ) : (
          <div className="cand-dir">
            {visibleRows.map((c, index) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                ordinal={two((page - 1) * pageSize + index + 1)}
                mode="directory"
                selectable
                selected={pick === c.id}
                disabled={confirming || submitting || blocked}
                onPick={() => setPick(c.id)}
              />
            ))}
          </div>
        )}
        {pageCount > 1 && (
          <div className="pager candidate-pager">
            <button
              type="button"
              className="pbtn"
              onClick={() => setModePage(page - 1)}
              disabled={page <= 1}
            >
              Previous
            </button>
            <span className="num">
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              className="pbtn"
              onClick={() => setModePage(page + 1)}
              disabled={page >= pageCount}
            >
              Next
            </button>
          </div>
        )}
      </>
    )
  }

  return (
    <div className={'wrap election-detail' + (voterBallotView ? ' election-detail--ballot' : '')}>
      <Link className="quiet election-back-link" to="/">
        All elections
      </Link>
      {voterBallotView ? (
        <header className="election-voter-heading">
          <p className="election-voter-kick">
            {election.title}
            {candidateCount !== undefined
              ? ` · ${candidateCount} ${candidateCount === 1 ? 'candidate' : 'candidates'}`
              : ''}
          </p>
          <h1 id="election-voter-heading-title">Candidate List</h1>
        </header>
      ) : (
        <header className="election-detail-header">
          <div className="election-title-row">
            <h1>{election.title}</h1>
            <span className={`st ${election.status.toLowerCase()}`}>
              <i />
              {election.status.charAt(0) + election.status.slice(1).toLowerCase()}
            </span>
          </div>
          <p className="election-position">{election.position_title}</p>
          {election.description ? (
            <p className="election-description">{election.description}</p>
          ) : null}
        </header>
      )}

      <div
        className={'election-detail-grid' + (voterBallotView ? ' election-detail-grid-ballot' : '')}
      >
        <section
          className="election-candidates"
          aria-labelledby={
            voterBallotView ? 'election-voter-heading-title' : 'election-candidates-heading'
          }
        >
          {!voterBallotView && (
            <div className="election-section-heading">
              <div>
                <h2 id="election-candidates-heading">Candidates</h2>
                {candidateCount !== undefined && (
                  <p>
                    {candidateCount} {candidateCount === 1 ? 'candidate' : 'candidates'}
                  </p>
                )}
              </div>
            </div>
          )}
          {ballot.error ? <ErrorState error={ballot.error} retry={ballot.retry} /> : null}
          {participation && !participation.eligible ? (
            <p className="noticeline" role="status">
              You are not on the voter roll for this election.
            </p>
          ) : participation && participation.remaining_votes <= 0 ? (
            <p className="noticeline" role="status">
              You have already voted and cannot vote again.
            </p>
          ) : null}
          {candidatesBlock()}
        </section>

        {!voterBallotView && (
          <aside className="election-detail-aside" aria-label="Election information and actions">
            <section className="election-facts-panel" aria-labelledby="election-facts-heading">
              <h2 id="election-facts-heading">Election details</h2>
              <dl className="election-facts">
                <div>
                  <dt>{closed ? 'Opened' : 'Opens'}</dt>
                  <dd className="num">{when(election.starts_at)}</dd>
                </div>
                <div>
                  <dt>Closes</dt>
                  <dd className="num">{when(election.ends_at)}</dd>
                </div>
              </dl>
            </section>

            {isAdmin ? (
              <section className="election-admin-panel" aria-labelledby="election-admin-heading">
                <h2 id="election-admin-heading">Administration</h2>
                {election.status === 'DRAFT' && (
                  <nav className="election-admin-links" aria-label="Election administration links">
                    <Link className="lnk" to={`/elections/${encodeURIComponent(id)}/edit`}>
                      Edit election
                    </Link>
                    <Link className="lnk" to={`/elections/${encodeURIComponent(id)}/candidates`}>
                      Candidate management
                    </Link>
                    <Link className="lnk" to={`/elections/${encodeURIComponent(id)}/voters`}>
                      Voter roll
                    </Link>
                  </nav>
                )}
                <StatusActions
                  key={election.status}
                  status={election.status}
                  pending={status.pending}
                  error={status.error}
                  message={status.message}
                  onRun={status.run}
                  onReload={detail.reload}
                />
              </section>
            ) : null}

            {closed && (
              <section className="election-results-panel" aria-label="Election results">
                {election.results_published_at || isAdmin ? (
                  <Link className="lnk hot" to={`/elections/${encodeURIComponent(id)}/results`}>
                    View results
                  </Link>
                ) : (
                  <p className="noticeline">Results will be published after counting completes.</p>
                )}
              </section>
            )}
          </aside>
        )}
      </div>

      {canVote ? (
        <div className="bbar">
          <span className="bt">OFFICIAL BALLOT</span>
          <span className="bs">Anonymous · One choice · One vote per voter</span>
          <span className="bpick">
            {!selected ? (
              'No selection yet'
            ) : (
              <>
                You selected <b>{selected.name}</b>
              </>
            )}
          </span>
          {voteError ? (
            <p className="ballot-error" role="alert">
              {errorMessage(voteError)}
            </p>
          ) : null}
          {blocked ? (
            <div className="ballot-error" role="status">
              Submission is blocked. Check your voting status before taking further action.
              <button className="ghost" type="button" onClick={ballot.retry}>
                Refresh voting status
              </button>
            </div>
          ) : null}
          {confirming ? (
            <div className="bconfirm">
              <span className="warn">
                Once submitted, this ballot cannot be changed, withdrawn, or deleted.
              </span>
              <button
                className="bsub"
                type="button"
                disabled={submitting || blocked || !selected}
                onClick={() => void submitBallot()}
              >
                {submitting ? 'Submitting…' : 'Submit — irrevocable'}
              </button>
              <button
                className="ghost"
                type="button"
                disabled={submitting || blocked}
                onClick={() => {
                  setConfirming(false)
                  setVoteError(null)
                }}
              >
                Go back
              </button>
            </div>
          ) : (
            <button
              className="bsub"
              type="button"
              disabled={!selected || blocked}
              onClick={() => setConfirming(true)}
            >
              Review and submit
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}

function CandidateCard({
  candidate,
  ordinal,
  mode,
  selectable,
  selected,
  onPick,
  disabled = false,
}: {
  candidate: Candidate
  ordinal: string
  mode: CandidateMode
  selectable: boolean
  selected: boolean
  onPick: () => void
  disabled?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const photo = candidate.photo_url?.startsWith('https://') ? candidate.photo_url : null
  const media = (
    <div className="pic">
      {photo && !failed ? (
        <img
          loading="lazy"
          referrerPolicy="no-referrer"
          src={photo}
          alt={`${candidate.name}'s photo`}
          onError={() => setFailed(true)}
        />
      ) : (
        monogram(candidate.name)
      )}
    </div>
  )
  const radio = selectable ? (
    <input
      type="radio"
      name="candidate"
      className="vh"
      checked={selected}
      disabled={disabled}
      onChange={onPick}
      aria-label={candidate.name}
    />
  ) : null
  if (mode === 'grid') {
    return selectable ? (
      <label className={'piece' + (selected ? ' sel' : '')}>
        {radio}
        {media}
        <h3>{candidate.name}</h3>
        <p className="cpos">{candidate.position_title}</p>
        <PickMark selected={selected} />
      </label>
    ) : (
      <div className="piece">{media}</div>
    )
  }
  if (mode === 'directory') {
    return selectable ? (
      <label className={'drow' + (selected ? ' sel' : '')}>
        {radio}
        <span className="num dno">{ordinal}</span>
        <h3>{candidate.name}</h3>
        <p className="cdesc">{candidate.description}</p>
        <PickMark selected={selected} />
      </label>
    ) : (
      <div className="drow">
        <span className="num dno">{ordinal}</span>
        <h3>{candidate.name}</h3>
        <p className="cdesc">{candidate.description}</p>
      </div>
    )
  }
  return selectable ? (
    <label className={'cand-prof' + (selected ? ' sel' : '')}>
      {radio}
      {media}
      <div>
        <h3 aria-label={candidate.name}>
          {ordinal} · {candidate.name}
        </h3>
        <p className="cpos">{candidate.position_title}</p>
        <p className="cdesc">{candidate.description}</p>
        <PickMark selected={selected} />
      </div>
    </label>
  ) : (
    <div className="cand-prof cand-prof-readonly">
      {media}
      <div>
        <h3 aria-label={candidate.name}>
          {ordinal} · {candidate.name}
        </h3>
        <p className="cpos">{candidate.position_title}</p>
        <p className="cdesc">{candidate.description}</p>
      </div>
    </div>
  )
}

function PickMark({ selected }: { selected: boolean }) {
  return (
    <span className={'pickrow' + (selected ? ' on' : '')}>
      <span className="radio" />
      <span>{selected ? 'Selected' : 'Select'}</span>
    </span>
  )
}

function StatusActions({
  status,
  pending,
  error,
  message,
  onRun,
  onReload,
}: {
  status: Election['status']
  pending: boolean
  error: unknown
  message: string
  onRun: (action: 'open' | 'close') => Promise<void>
  onReload: () => void
}) {
  const [confirm, setConfirm] = useState<'open' | 'close' | null>(null)
  let control: React.ReactNode
  if (status === 'DRAFT') {
    control =
      confirm === 'open' ? (
        <span className="bconfirm">
          <span className="warn">
            Opening voting locks the election details, candidates and voter roll.
          </span>
          <button
            className="bsub"
            type="button"
            disabled={pending}
            onClick={() => {
              void onRun('open').then(() => setConfirm(null))
            }}
          >
            {pending ? 'Opening…' : 'Confirm open'}
          </button>
          <button className="ghost" type="button" onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </span>
      ) : (
        <button type="button" className="btn ghost" onClick={() => setConfirm('open')}>
          Open voting
        </button>
      )
  } else if (status === 'OPEN') {
    control =
      confirm === 'close' ? (
        <span className="bconfirm">
          <span className="warn">Closing stops new ballots. This cannot be undone.</span>
          <button
            className="bsub"
            type="button"
            disabled={pending}
            onClick={() => {
              void onRun('close').then(() => setConfirm(null))
            }}
          >
            {pending ? 'Closing…' : 'Confirm close'}
          </button>
          <button className="ghost" type="button" onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </span>
      ) : (
        <button type="button" className="btn ghost" onClick={() => setConfirm('close')}>
          Close voting
        </button>
      )
  } else {
    control = null
  }
  return (
    <>
      {control}
      {error && (
        <div className="state" role="alert">
          <p>{errorMessage(error)}</p>
          <button type="button" onClick={onReload}>
            Refresh election status
          </button>
        </div>
      )}
      {message && (
        <p className="noticeline" role="status">
          {message}
        </p>
      )}
    </>
  )
}

function Receipt({ election, at }: { election: Election; at: Date }) {
  return (
    <div className="done">
      <h1>
        Ballot cast.
        <i />
      </h1>
      <div className="stub">
        <div className="l">
          <span className="t">VOTING RECEIPT · ANONYMOUS</span>
          <b>{election.title}</b>
          <span
            className="t num"
            style={{ letterSpacing: '0.06em', marginTop: 8, display: 'block' }}
          >
            Submitted at {fmt(at)} (local time)
          </span>
        </div>
        <div className="r">
          <span className="seal">RECEIVED</span>
        </div>
      </div>
      <p className="meta">
        This receipt confirms submission and does not identify an individual ballot.
        <br />
        Results will be published after voting closes and counting completes.
      </p>
      <div className="ops">
        <Link className="btn ghost" to="/">
          Back to elections
        </Link>
      </div>
    </div>
  )
}
