import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { Role } from '../api/types'
import { ErrorState, LoadingState } from '../components/AsyncState'
import { WorkflowConfirmation } from '../components/elections/WorkflowConfirmation'
import { useAuth } from '../hooks/useAuth'
import { useElectionResults } from '../hooks/useElectionResults'
import { errorMessage } from '../shared/errors'
import './ElectionWorkflow.css'

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
  // The server supplies winner and ordering; the client never breaks ties or recounts.
  const winner = result?.candidates.find((item) => item.candidate_id === result.winner_candidate_id)
  return (
    <div className="wrap election-workflow">
      <nav className="workflow-back" aria-label="Election navigation">
        <Link className="quiet" to={`/elections/${encodeURIComponent(id)}`}>
          Back to election
        </Link>
      </nav>
      <header className="workflow-heading">
        <h1>Election results</h1>
        <p>{election?.title ?? 'The final count and publication status.'}</p>
      </header>
      {results.loading ? (
        <LoadingState />
      ) : results.error ? (
        <ErrorState error={results.error} retry={results.reload} />
      ) : election ? (
        <>
          <div className="workflow-meta">
            <span className={`st ${election.status.toLowerCase()}`}>
              <i aria-hidden="true" />
              {election.status}
            </span>
            <span>{election.position_title}</span>
            <button
              type="button"
              className="quiet"
              disabled={results.pending || confirming}
              onClick={results.reload}
            >
              Refresh results
            </button>
          </div>
          {!result ? (
            <div className="empty">
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
            </div>
          ) : (
            <>
              <section className="result-summary" aria-labelledby="result-status-heading">
                <div>
                  <h2 id="result-status-heading">
                    {published ? 'Published result' : 'Unpublished count'}
                  </h2>
                  {published ? (
                    <p>
                      Published{' '}
                      <time dateTime={result.results_published_at!}>
                        {new Date(result.results_published_at!).toLocaleString()}
                      </time>
                    </p>
                  ) : (
                    <p>Administrator preview. Voters cannot view this count until publication.</p>
                  )}
                </div>
                {role === 'ADMIN' && !published && (
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
                  description="Publication makes this election's result visible to all active voter accounts, including people outside its voter roll. The server recomputes the final count."
                  action="Confirm publication"
                  pending={results.pending}
                  returnFocus={confirmationTrigger}
                  onCancel={() => setConfirming(false)}
                  onConfirm={() => {
                    void results.publish().then(() => setConfirming(false))
                  }}
                />
              )}
              <section className="result-outcome" aria-labelledby="result-outcome-heading">
                <h2 id="result-outcome-heading">{winner ? winner.name : 'No single winner'}</h2>
                <p>
                  {winner
                    ? `Elected ${result.position_title}`
                    : result.total_votes === 0
                      ? 'No votes were cast. No winner has been declared.'
                      : 'The server has not declared a unique winner. No tie-break is applied here.'}
                </p>
              </section>
              <h2 className="sect">
                Final count <span className="num">{result.total_votes} total votes</span>
              </h2>
              {result.candidates.length ? (
                <table className="workflow-table result-table">
                  <caption>Final candidate vote counts for {election.title}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Candidate</th>
                      <th scope="col">Votes</th>
                      <th scope="col">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.candidates.map((candidate) => (
                      <tr key={candidate.candidate_id}>
                        <th scope="row">{candidate.name}</th>
                        <td className="num">{candidate.vote_count}</td>
                        <td>
                          {candidate.candidate_id === result.winner_candidate_id ? 'Elected' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty">No candidate results are available.</p>
              )}
              <p className="workflow-note">
                Only aggregate counts are shown. Ballot choices cannot be traced to individual
                voters.
              </p>
            </>
          )}
        </>
      ) : null}
    </div>
  )
}
