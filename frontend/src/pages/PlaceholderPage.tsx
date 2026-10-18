/** Route placeholder only. Business forms, data loading and workflows are out of scope. */
export default function PlaceholderPage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="placeholder state">
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  )
}
