export default function FoundationPage() {
  return (
    <section className="placeholder">
      <span className="eyebrow">FRONTEND FOUNDATION</span>
      <h1>前端框架已就绪</h1>
      <p>根据架构、API 与需求文档建立的开发骨架。</p>
      <dl className="foundation-list">
        <div>
          <dt>界面与路由</dt>
          <dd>React、TypeScript、React Router，基础布局与页面占位。</dd>
        </div>
        <div>
          <dt>接口接入</dt>
          <dd>统一 HTTP 客户端、API v0.1 类型及端点封装。</dd>
        </div>
        <div>
          <dt>访问控制</dt>
          <dd>认证上下文、会话恢复与 ADMIN / USER 路由守卫。</dd>
        </div>
        <div>
          <dt>开发边界</dt>
          <dd>不包含业务页面、表单、投票流程或演示数据。</dd>
        </div>
      </dl>
    </section>
  )
}
