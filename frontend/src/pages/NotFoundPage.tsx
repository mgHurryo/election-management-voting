import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <section className="state">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to elections</Link>
      </p>
    </section>
  )
}
