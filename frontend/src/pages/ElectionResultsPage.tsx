import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { Role } from '../api/types'
import { ErrorState, LoadingState } from '../components/AsyncState'
import { WorkflowConfirmation } from '../components/elections/WorkflowConfirmation'
import { useAuth } from '../hooks/useAuth'
import { useElectionResults } from '../hooks/useElectionResults'
import { useNow } from '../hooks/useNow'
import { errorMessage } from '../shared/errors'
import './ElectionDetailPage.css'
import './ElectionWorkflow.css'
import './ElectionResultsPage.css'

// The initial clock reading; useNow keeps it current for long-lived sessions.
const pageLoadedAt = Date.now()

export default function ElectionResultsPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  if (!user) return null
  return <ElectionResultsContent key={`${id}/${user.role}`} id={id} role={user.role} />
}

function ElectionResultsContent({ id, role }: { id: string; role: Role }) {
  const results = useElectionResults(id, role)
  const now = useNow(pageLoadedAt)
  const [confirming, setConfirming] = useState(false)
  const confirmationTrigger = useRef<HTMLButtonElement | null>(null)
  const { election, result } = results
  const published = Boolean(result?.results_published_at)
  // Only the server-provided winner ID can declare an elected candidate.
  const winner = result?.candidates.find((item) => item.candidate_id === result.winner_candidate_id)
  const leadingVotes =
    result?.candidates.reduce((most, item) => Math.max(most, item.vote_count), 0) ?? 0
  const tiedCandidates =
    !winner && leadingVotes > 0
      ? (result?.candidates.filter((item) => item.vote_count === leadingVotes) ?? [])
      : []
  const tied = tiedCandidates.length > 1
  const tieTitle =
    tiedCandidates.length === 2
      ? 'Two-way tie'
      : tiedCandidates.length === 3
        ? 'Three-way tie'
        : `${tiedCandidates.length}-way tie`
  const tiedVoteLabel = leadingVotes === 1 ? 'one vote' : `${leadingVotes.toLocaleString()} votes`
  const tieDescription =
    tiedCandidates.length === result?.candidates.length
      ? `${tiedCandidates.length === 3 ? 'All three candidates' : 'Each candidate'} received ${tiedVoteLabel}. No winner has been declared.`
      : `The ${tiedCandidates.length} leading candidates each received ${tiedVoteLabel}. No winner has been declared.`
  // Shares describe counted votes, never electorate size or turnout.
  const voteShare = (votes: number) =>
    result && result.total_votes > 0 ? (votes / result.total_votes) * 100 : 0
  // The ballot endpoint may already report the window over while the stored
  // status is still OPEN; the empty state must not contradict it. A draft never
  // started, so its passed window is a scheduling problem, not an ended vote.
  const windowOver =
    !!election && election.status === 'OPEN' && new Date(election.ends_at).getTime() < now
  // A closed election redirects back here from its detail page for every role,
  // so the way out is the list. An over-window but still OPEN election keeps
  // pointing administrators at the detail page, where Close voting lives.
  const backDestination =
    election?.status === 'CLOSED' || (windowOver && role === 'USER')
      ? '/elections'
      : `/elections/${encodeURIComponent(id)}`
  const backLabel = backDestination === '/elections' ? 'All elections' : 'Back to election'
  // Display follows the window, not the stored row: the scheduler converges the
  // server state within one tick, but voters must not see "Open" on an election
  // whose voting time is over.
  const displayClosed = election?.status === 'CLOSED' || windowOver

  if (results.loading)
    return (
      <div className="wrap election-detail results-page">
        <LoadingState />
      </div>
    )

  return (
    <div className="wrap election-detail election-workflow results-page">
      <nav aria-label="Election navigation">
        <Link className="quiet election-back-link" to={backDestination}>
          {backLabel}
        </Link>
      </nav>
      <header className="election-detail-header">
        <div className="election-title-row">
          <h1>{election?.title ?? 'Election results'}</h1>
          {election && (
            <span className={`st ${displayClosed ? 'closed' : election.status.toLowerCase()}`}>
              <i aria-hidden="true" />
              {displayClosed
                ? 'Closed'
                : election.status.charAt(0) + election.status.slice(1).toLowerCase()}
            </span>
          )}
        </div>
        {election && (
          <p className="election-position">Election results for {election.position_title}</p>
        )}
      </header>
      {results.error ? (
        <ErrorState
          error={results.error}
          retry={results.reload}
          backTo={backDestination}
          backLabel={backLabel}
        />
      ) : election ? (
        <div className="results-layout">
          <div
            className={`results-main${tied ? ' results-main--tie' : ''}${winner ? ' results-main--winner' : ''}`}
          >
            {!result ? (
              <section className="results-unavailable">
                <h2>
                  {windowOver
                    ? 'Voting has ended'
                    : election.status !== 'CLOSED'
                      ? 'Voting has not closed'
                      : 'Results are not published'}
                </h2>
                {windowOver ? (
                  <>
                    <p className="results-unavailable-status">
                      This election has ended. The result is not published yet.
                    </p>
                    <p className="results-unavailable-hint">
                      Please wait for the administrator to finish counting and publish the outcome.
                    </p>
                  </>
                ) : (
                  <p>
                    {election.status !== 'CLOSED'
                      ? 'Vote counts are available only after the election is closed.'
                      : 'The administrator has not published the final result yet. Check back later.'}
                  </p>
                )}
                <div className="results-unavailable-actions">
                  <Link className="btn ghost" to="/elections">
                    Back to all elections
                  </Link>
                </div>
              </section>
            ) : (
              <>
                <section className="results-outcome" aria-labelledby="result-outcome-heading">
                  <div className="results-outcome-heading">
                    <h2 id="result-outcome-heading" className={winner ? 'results-winner-name' : ''}>
                      {winner
                        ? winner.name
                        : tied
                          ? tieTitle
                          : result.total_votes === 0
                            ? 'No votes cast'
                            : 'No winner declared'}
                    </h2>
                    {winner && <span className="results-elected">Elected</span>}
                  </div>
                  {winner ? (
                    <>
                      <p className="results-winner-position">{result.position_title}</p>
                      <div className="results-victory-summary num">
                        <span>
                          <strong>{winner.vote_count.toLocaleString()}</strong> votes received
                        </span>
                        <span>
                          <strong>{voteShare(winner.vote_count).toFixed(1)}%</strong> of all votes
                          counted
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="results-outcome-note">
                      {tied
                        ? tieDescription
                        : result.total_votes === 0
                          ? 'No votes were cast in this election. No winner has been declared.'
                          : 'No winner has been declared for this election.'}
                    </p>
                  )}
                </section>
                <div className="workflow-feedback" aria-live="polite">
                  {results.notice && <p role="status">{results.notice}</p>}
                </div>
                {results.writeError && (
                  <div className="state" role="alert">
                    <p>{errorMessage(results.writeError)}</p>
                    <p>Refresh results to verify publication before another attempt.</p>
                  </div>
                )}
                {confirming && (
                  <WorkflowConfirmation
                    title="Publish this result?"
                    description="Publication makes this election's result visible to all active voter accounts, including people outside its voter roll. The final vote count is verified when you publish."
                    action="Confirm publication"
                    pending={results.pending}
                    returnFocus={confirmationTrigger}
                    onCancel={() => setConfirming(false)}
                    onConfirm={() => {
                      void results.publish().then(() => setConfirming(false))
                    }}
                  />
                )}
                <section
                  className={`results-count${tied ? ' results-count--tie' : ''}`}
                  aria-labelledby="results-count-heading"
                >
                  <div className="results-count-heading">
                    <h2 id="results-count-heading">Final count</h2>
                    <p className="num">{result.total_votes.toLocaleString()} total votes</p>
                  </div>
                  {result.candidates.length ? (
                    <table className="results-table" role="table">
                      <caption>Final candidate vote counts for {election.title}</caption>
                      <thead>
                        <tr>
                          <th scope="col">Candidate</th>
                          <th scope="col">Votes</th>
                          <th scope="col">Outcome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.candidates.map((candidate) => {
                          const elected = candidate.candidate_id === result.winner_candidate_id
                          const tiedForFirst = tied && candidate.vote_count === leadingVotes
                          return (
                            <tr
                              key={candidate.candidate_id}
                              className={elected ? 'is-elected' : ''}
                            >
                              <th scope="row">{candidate.name}</th>
                              <td className="results-vote-cell num">
                                <strong>{candidate.vote_count.toLocaleString()}</strong>{' '}
                                {tied && (
                                  <span className="results-vote-word" aria-hidden="true">
                                    {candidate.vote_count === 1 ? 'vote' : 'votes'}
                                  </span>
                                )}
                                <span>{voteShare(candidate.vote_count).toFixed(1)}%</span>
                                {!tied && result.total_votes > 0 && (
                                  <span className="results-vote-bar" aria-hidden="true">
                                    <span
                                      style={{ width: `${voteShare(candidate.vote_count)}%` }}
                                    />
                                  </span>
                                )}
                              </td>
                              <td className="results-row-outcome">
                                {elected ? (
                                  'Elected'
                                ) : tiedForFirst ? (
                                  'Tied for first'
                                ) : (
                                  <>
                                    <span aria-hidden="true">—</span>
                                    <span className="visually-hidden">
                                      {winner ? 'Not elected' : 'Not declared'}
                                    </span>
                                  </>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p className="empty">No candidate results are available.</p>
                  )}
                </section>
              </>
            )}
          </div>
          <footer className="results-publication" aria-label="Result publication">
            <div className="results-publication-status">
              <h2 id="result-status-heading">
                {result ? (published ? 'Published result' : 'Unpublished count') : 'Publication'}
              </h2>
              {published ? (
                <p className="results-published-time">
                  <span>Published at</span>
                  <time dateTime={result!.results_published_at!}>
                    {new Date(result!.results_published_at!).toLocaleString()}
                  </time>
                </p>
              ) : (
                <p className="results-preview">
                  {result && role === 'ADMIN'
                    ? 'Administrator preview. Voters cannot view this count until publication.'
                    : 'Results will be available after the final count is published.'}
                </p>
              )}
            </div>
            {published ? (
              <div className="results-actions" aria-label="Published result actions">
                <button type="button" className="quiet" onClick={() => window.print()}>
                  Print results
                </button>
              </div>
            ) : (
              <div className="results-actions" aria-label="Publication controls">
                <button
                  type="button"
                  className="quiet"
                  disabled={results.pending || confirming}
                  onClick={results.reload}
                >
                  Refresh results
                </button>
                {result && role === 'ADMIN' && !published && (
                  <button
                    type="button"
                    className="btn main"
                    disabled={results.pending || results.blocked || confirming}
                    onClick={(event) => {
                      confirmationTrigger.current = event.currentTarget
                      setConfirming(true)
                    }}
                  >
                    Publish results
                  </button>
                )}
              </div>
            )}
            {result && (
              <div className="results-notes">
                <p>Vote share is based on all counted votes.</p>
                <p>
                  Only aggregate counts are shown. Ballot choices cannot be traced to individual
                  voters.
                </p>
              </div>
            )}
          </footer>
        </div>
      ) : null}
    </div>
  )
}
