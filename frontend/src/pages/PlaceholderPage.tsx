/** Route placeholder only. Business forms, data loading and workflows are out of scope. */
export default function PlaceholderPage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="placeholder">
      <span className="eyebrow">MODULE PLACEHOLDER</span>
      <h1>{title}</h1>
      <p>{description}</p>
      <p className="hint">当前仅完成工程、路由与基础设施；此页面未实现业务功能。</p>
    </section>
  )
}
