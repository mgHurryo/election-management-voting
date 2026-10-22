import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { Role } from '../api/types'
import { ErrorState, LoadingState } from '../components/AsyncState'
import { WorkflowConfirmation } from '../components/elections/WorkflowConfirmation'
import { useAuth } from '../hooks/useAuth'
import { useElectionResults } from '../hooks/useElectionResults'
import { errorMessage } from '../shared/errors'
import './ElectionDetailPage.css'
import './ElectionWorkflow.css'
import './ElectionResultsPage.css'

export default function ElectionResultsPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  if (!user) return null
  return <ElectionResultsContent key={`${id}/${user.role}`} id={id} role={user.role} />
}

function ElectionResultsContent({ id, role }: { id: string; role: Role }) {
  const results = useElectionResults(id, role)
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
  // Closed-election voters must be able to return to the list without a redirect loop.
  const backDestination =
    role === 'USER' && election?.status === 'CLOSED'
      ? '/elections'
      : `/elections/${encodeURIComponent(id)}`
  const backLabel = backDestination === '/elections' ? 'All elections' : 'Back to election'

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
            <span className={`st ${election.status.toLowerCase()}`}>
              <i aria-hidden="true" />
              {election.status.charAt(0) + election.status.slice(1).toLowerCase()}
            </span>
          )}
        </div>
        {election && (
          <p className="election-position">Election results for {election.position_title}</p>
        )}
      </header>
      {results.error ? (
        <ErrorState error={results.error} retry={results.reload} />
      ) : election ? (
        <div className="election-detail-grid results-layout">
          <div className="results-main">
            {!result ? (
              <section className="results-unavailable">
                <h2>
                  {election.status !== 'CLOSED'
                    ? 'Voting has not closed'
                    : 'Results are not published'}
                </h2>
                <p>
                  {election.status !== 'CLOSED'
                    ? 'Vote counts are available only after the election is closed.'
                    : 'The administrator has not published the final result yet. Check back later.'}
                </p>
              </section>
            ) : (
              <>
                <section className="results-outcome" aria-labelledby="result-outcome-heading">
                  <div className="election-section-heading">
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
                      <p className="results-victory-summary num">
                        <span>
                          <strong>{winner.vote_count.toLocaleString()}</strong> votes received
                        </span>
                        <span>
                          <strong>{voteShare(winner.vote_count).toFixed(1)}%</strong> of all votes
                          counted
                        </span>
                      </p>
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
                <section className="results-count" aria-labelledby="results-count-heading">
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
                                <span>{voteShare(candidate.vote_count).toFixed(1)}%</span>
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
                  <p className="results-count-note">
                    Percentages show each candidate’s share of all votes counted.
                  </p>
                </section>
                <p className="results-privacy">
                  Only aggregate counts are shown. Ballot choices cannot be traced to individual
                  voters.
                </p>
              </>
            )}
          </div>
          <aside className="election-detail-aside results-aside" aria-label="Result publication">
            <section className="election-facts-panel">
              <h2 id="result-status-heading">
                {result ? (published ? 'Published result' : 'Unpublished count') : 'Publication'}
              </h2>
              {published ? (
                <dl className="election-facts">
                  <div>
                    <dt>Published at</dt>
                    <dd>
                      <time dateTime={result!.results_published_at!}>
                        {new Date(result!.results_published_at!).toLocaleString()}
                      </time>
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="results-preview">
                  {result && role === 'ADMIN'
                    ? 'Administrator preview. Voters cannot view this count until publication.'
                    : 'Results will be available after the final count is published.'}
                </p>
              )}
            </section>
            <section className="election-admin-panel results-actions">
              <h2>Result actions</h2>
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
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
