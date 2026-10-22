import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <div className="wrap">
      <section className="state state-error">
        <h1>Page not found</h1>
        <div className="state-actions">
          <Link className="quiet" to="/elections">
            Back to elections
          </Link>
        </div>
      </section>
    </div>
  )
}
