import { Link } from 'react-router'

/** Route placeholder only. Business forms, data loading and workflows are out of scope. */
export default function PlaceholderPage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="wrap">
      <section className="state state-error">
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="state-actions">
          <Link className="quiet" to="/elections">
            Back to elections
          </Link>
        </div>
      </section>
    </div>
  )
}
