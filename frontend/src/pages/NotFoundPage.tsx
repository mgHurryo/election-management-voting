import { Link } from 'react-router'
export default function NotFoundPage() {
  return (
    <section className="placeholder">
      <h1>404 · 页面不存在</h1>
      <Link to="/">返回框架首页</Link>
    </section>
  )
}
